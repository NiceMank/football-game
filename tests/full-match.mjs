import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

const engineSource = await readFile(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const { code } = await transformWithEsbuild(engineSource, 'src/game/engine.ts', {
  loader: 'ts', target: 'es2020', format: 'esm',
});
const { Game, MATCH_DURATION_SECONDS } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const STEP = 1 / 120;
const NEUTRAL = { dx: 0, dy: 0, action: false, actionPressed: false };
const CENTER_X = 400;
const FIELD_BOTTOM = 1170;

function advanceUntil(game, predicate, maxSteps, description) {
  for (let i = 0; i < maxSteps; i++) {
    game.update(STEP, NEUTRAL);
    if (predicate()) return i + 1;
  }
  assert.fail(`Timed out waiting for ${description}`);
}

function countSound(sounds, event) {
  return sounds.filter(name => name === event).length;
}

const game = new Game();
const sounds = [];
game.sfx = name => sounds.push(name);
game.start();
assert.equal(game.phase, 'playing');
assert.equal(game.ball.owner, 'home', 'kickoff should give home the ball');
assert.ok(sounds.includes('kickoff'), 'kickoff should trigger its sound');

// Home advances, completes a short-button pass, and controls the receiver.
for (let i = 0; i < 60; i++) game.update(STEP, { ...NEUTRAL, dy: -1 });
const kickoffCarrier = game.homeTeam.find(player => player.id === game.ball.ownerId);
assert.ok(kickoffCarrier.y < 600, 'home should make a forward attack from kickoff');
game.update(STEP, { ...NEUTRAL, action: true, actionPressed: true });
game.update(STEP, NEUTRAL);
assert.equal(game.ball.targetTeam, 'home', 'a short action press should create a home pass');
const firstReceiverId = game.ball.targetId;
advanceUntil(game, () => game.ball.owner === 'home' && game.ball.ownerId === firstReceiverId, 900, 'home pass reception');
assert.ok(countSound(sounds, 'pass') >= 1);
assert.ok(sounds.includes('recovery'), 'outfield recovery should have a sound cue');

// Charge and release a central home shot; the away goalkeeper must make a real save.
const shooter = game.homeTeam[game.activePlayerIndex];
for (const player of game.homeTeam) {
  player.stunTimer = player === shooter ? 0 : 20;
}
for (const player of game.awayTeam) player.stunTimer = 20;
Object.assign(shooter, { x: CENTER_X, y: 250, vx: 0, vy: 0, angle: -Math.PI / 2 });
Object.assign(game.ball, {
  x: CENTER_X, y: 277, vx: 0, vy: 0, owner: 'home', ownerId: shooter.id,
  keeperOwner: null, shotTeam: null, shotPower: 0, shotAttempted: false,
  targetTeam: null, targetId: null, ownerLockTimer: 0.65,
});
game.possession = 'home';
game.attachBallToOwner();
for (let i = 0; i < 36; i++) {
  game.update(STEP, { ...NEUTRAL, action: true, actionPressed: i === 0 });
}
game.update(STEP, NEUTRAL);
assert.equal(game.ball.shotTeam, 'away', 'held action should release a home shot');
assert.ok(sounds.includes('shot') || sounds.includes('power'), 'home shot should sound');

// Clear lanes around the keeper rebound and stage an unambiguous recovery by away.
for (let i = 0; i < game.homeTeam.length; i++) {
  Object.assign(game.homeTeam[i], { x: 100 + i * 110, y: 700 + i * 50, vx: 0, vy: 0, stunTimer: 20 });
}
for (let i = 0; i < game.awayTeam.length; i++) {
  Object.assign(game.awayTeam[i], { x: 400 + i * 80, y: 280 + i * 150, vx: 0, vy: 0, stunTimer: 20 });
}
advanceUntil(
  game,
  () => game.ball.keeperOwner === 'away' || (game.ball.lastTouchTeam === 'away' && game.ball.shotTeam === null),
  800,
  'away goalkeeper save',
);
assert.equal(game.homeScore + game.awayScore, 0, 'the first shot must be saved');
assert.ok(sounds.includes('parry') || sounds.includes('catch'), 'save should trigger a parry or catch cue');

// The parried ball is recovered by an away defender (or held then distributed by the keeper).
if (game.ball.keeperOwner === 'away') {
  advanceUntil(game, () => game.ball.targetTeam === 'away', 300, 'keeper distribution');
  assert.ok(countSound(sounds, 'pass') >= 2, 'keeper distribution should use the passing cue');
}
advanceUntil(game, () => game.ball.owner === 'away', 700, 'away recovery');
const carrier = game.awayTeam.find(player => player.id === game.ball.ownerId);
assert.ok(carrier, 'away should have an outfield carrier after recovery');

// Put a high forward in the open channel and mild pressure near the carrier;
// the normal timer-driven away decision should choose an AI pass.
for (let i = 0; i < game.homeTeam.length; i++) {
  Object.assign(game.homeTeam[i], {
    x: i === 0 ? 480 : 80 + i * 92,
    y: i === 0 ? 310 : 610 + i * 48,
    vx: 0, vy: 0, stunTimer: 20,
  });
}
for (let i = 0; i < game.awayTeam.length; i++) {
  const player = game.awayTeam[i];
  player.stunTimer = i === 3 ? 0 : 20;
  if (player !== carrier && i !== 3) {
    player.x = 650 + i * 20;
    player.y = 220 + i * 75;
  }
}
const forward = game.awayTeam[3];
Object.assign(carrier, { x: 400, y: 300, vx: 0, vy: 0, angle: Math.PI / 2, aiDecisionTimer: 0.32, aiReactionTimer: 0.32 });
Object.assign(forward, { x: 430, y: 850, vx: 0, vy: 0 });
Object.assign(game.ball, {
  x: 400, y: 300, owner: 'away', ownerId: carrier.id, keeperOwner: null,
  targetTeam: null, targetId: null, lastTouchTeam: 'away', shotTeam: null,
  shotPower: 0, shotAttempted: false, ownerLockTimer: 0.2,
});
game.possession = 'away';
game.awayMode = 'attacking';
game.attachBallToOwner();
advanceUntil(game, () => game.ball.owner === 'none' && game.ball.targetTeam === 'away' && game.ball.targetId === forward.id, 900, 'timer-driven away AI pass');
assert.ok(countSound(sounds, 'pass') >= 2, 'away AI pass should use the pass sound');
advanceUntil(game, () => game.ball.owner === 'away' && game.ball.ownerId === forward.id, 1200, 'away pass reception');

// The away carrier continues the attack and shoots; the home keeper then saves.
advanceUntil(game, () => game.ball.shotTeam === 'home', 4000, 'timer-driven away AI shot');
assert.ok(sounds.includes('power') || sounds.includes('shot'), 'away AI shot should have a shot cue');
advanceUntil(
  game,
  () => game.ball.lastTouchTeam === 'home' && game.ball.shotTeam === null,
  300,
  'home goalkeeper save',
);
assert.equal(game.homeScore + game.awayScore, 0, 'the away shot should be saved before the goal sequence');
assert.ok(sounds.includes('parry') || sounds.includes('catch'), 'home keeper save should sound');

// A quick follow-up from the away attacker beats the recovering keeper and crosses the goal line.
const followUpShooter = game.awayTeam[3];
Object.assign(followUpShooter, { x: 350, y: 1095, vx: 0, vy: 0, angle: Math.PI / 2, stunTimer: 0 });
Object.assign(game.homeKeeper, { x: 539, y: FIELD_BOTTOM - 28, vx: 0, vy: 0, state: 'idle', stateTimer: 0 });
game.executeAwayShot(followUpShooter, game.profile());
advanceUntil(game, () => game.awayScore === 1, 80, 'away goal');
assert.ok(sounds.includes('goal'), 'goal should play its cue');
assert.equal(game.goalResetTimer > 0, true, 'goal should begin the restart pause');

advanceUntil(game, () => game.goalResetTimer === 0 && game.ball.owner === 'home', 240, 'home kickoff after goal');
assert.equal(game.ball.ownerId, game.homeTeam[2].id, 'goal restart should place home at kickoff');
assert.ok(countSound(sounds, 'kickoff') >= 2, 'goal restart should play kickoff sound again');

// Reach the real three-minute end condition only after the goal restart is complete.
game.matchElapsedSeconds = MATCH_DURATION_SECONDS - STEP / 2;
game.update(STEP, NEUTRAL);
assert.equal(game.phase, 'finished', 'the match should enter its finished phase at 03:00');
assert.equal(game.matchElapsedSeconds, MATCH_DURATION_SECONDS);
assert.ok(sounds.includes('whistle'), 'full time should play the whistle cue');
assert.equal(game.effects.length, 88, 'visual effects stay within the fixed particle pool');

const noop = () => {};
const canvasContext = new Proxy({}, {
  get: (_target, property) => property === Symbol.toStringTag ? 'CanvasRenderingContext2D' : noop,
  set: () => true,
});
game.render(canvasContext);

console.log('Full-match flow passed: kickoff, home attack/pass/shot, keeper save, recovery, away AI pass/shot, keeper save, goal, restart and full-time.');
