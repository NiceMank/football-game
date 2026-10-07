import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

// The engine is self-contained; transform it in-memory so these integration checks
// exercise the same TypeScript source that the application uses.
const engineSource = await readFile(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const { code } = await transformWithEsbuild(engineSource, 'src/game/engine.ts', {
  loader: 'ts',
  target: 'es2020',
  format: 'esm',
});
const { Game } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const STEP = 0.05;
const NEUTRAL_INPUT = { dx: 0, dy: 0, action: false, actionPressed: false };
const CENTER_X = 400;
const FIELD_TOP = 30;
const FIELD_BOTTOM = 1170;

function createShot({ shooter = 'home', x = CENTER_X, y, vx = 0, vy, power = 0.7 }) {
  const game = new Game();
  game.start();

  // Keep outfield players clear of the shot lanes while preserving their normal update path.
  for (let i = 0; i < game.homeTeam.length; i++) {
    Object.assign(game.homeTeam[i], { x: 66 + i * 9, y: 480 + i * 34, vx: 0, vy: 0, stunTimer: 20 });
    Object.assign(game.awayTeam[i], { x: 734 - i * 9, y: 480 + i * 34, vx: 0, vy: 0, stunTimer: 20 });
  }

  const defendingTeam = shooter === 'home' ? 'away' : 'home';
  Object.assign(game.ball, {
    x, y, vx, vy,
    friction: 0.5,
    owner: 'none',
    ownerId: null,
    keeperOwner: null,
    lastTouchTeam: shooter,
    shotTeam: defendingTeam,
    shotPower: power,
    shotAttempted: false,
    targetTeam: null,
    targetId: null,
    acquisitionCooldown: 10,
    ownerLockTimer: 0,
  });
  game.possession = 'neutral';
  return game;
}

function advanceUntilKeeperActs(game, defendingTeam, limit = 100) {
  const keeper = defendingTeam === 'home' ? game.homeKeeper : game.awayKeeper;
  let speedBeforeContact = 0;
  for (let i = 0; i < limit; i++) {
    speedBeforeContact = Math.hypot(game.ball.vx, game.ball.vy);
    game.update(STEP, NEUTRAL_INPUT);
    if (game.ball.keeperOwner === defendingTeam || game.ball.lastTouchTeam === defendingTeam) {
      return { keeper, speedBeforeContact };
    }
    if (game.homeScore > 0 || game.awayScore > 0) break;
  }
  assert.fail(`${defendingTeam} keeper did not intervene in time`);
}

function assertSaved(game, defendingTeam) {
  assert.equal(game.homeScore + game.awayScore, 0, 'the shot should not score');
  assert.equal(game.ball.lastTouchTeam, defendingTeam, 'the goalkeeper should become the last touch');
  assert.equal(game.ball.shotTeam, null, 'the saved shot should no longer be active');
}

// Central weak shot: positioned keeper makes a clean catch.
{
  const game = createShot({ shooter: 'home', y: 250, vy: -560, power: 0.2 });
  const { keeper } = advanceUntilKeeperActs(game, 'away');
  assertSaved(game, 'away');
  assert.equal(game.ball.keeperOwner, 'away');
  assert.equal(keeper.state, 'holding');
  assert.equal(game.possession, 'away');
}

// Central powerful shot: same away keeper parries, and the rebound is slower and back in play.
{
  const game = createShot({ shooter: 'home', y: 300, vy: -900, power: 0.95 });
  const { keeper, speedBeforeContact } = advanceUntilKeeperActs(game, 'away');
  assertSaved(game, 'away');
  assert.equal(game.ball.keeperOwner, null);
  assert.equal(keeper.state, 'recovering');
  assert.ok(Math.hypot(game.ball.vx, game.ball.vy) < speedBeforeContact * 0.6, 'parry should reduce speed');
  assert.ok(game.ball.vy > 0, 'away keeper should redirect the ball toward the field');
}

// Left and right corners exercise lateral reading and dives for both goal ends.
{
  const game = createShot({ shooter: 'home', x: 410, y: 300, vx: -125, vy: -700, power: 0.75 });
  advanceUntilKeeperActs(game, 'away');
  assertSaved(game, 'away');
}
{
  const game = createShot({ shooter: 'away', x: 390, y: 900, vx: 110, vy: 700, power: 0.75 });
  advanceUntilKeeperActs(game, 'home');
  assertSaved(game, 'home');
}

// Close-range and distant shots at the home goal both use the same physical save path.
{
  const game = createShot({ shooter: 'away', y: 1085, vy: 700, power: 0.6 });
  advanceUntilKeeperActs(game, 'home');
  assertSaved(game, 'home');
}
{
  const game = createShot({ shooter: 'away', y: 400, vy: 1100, power: 0.9 });
  advanceUntilKeeperActs(game, 'home');
  assertSaved(game, 'home');
}

// A shot outside the posts should not provoke a dive or count as a goal.
{
  const game = createShot({ shooter: 'home', x: 100, y: 300, vy: -700, power: 0.75 });
  for (let i = 0; i < 20; i++) game.update(STEP, NEUTRAL_INPUT);
  assert.equal(game.homeScore + game.awayScore, 0);
  assert.equal(game.ball.shotAttempted, true);
  assert.notEqual(game.awayKeeper.state, 'diving');
}

// A weak away shot can also be caught by the home keeper (not just the AI-side keeper).
{
  const game = createShot({ shooter: 'away', y: 950, vy: 560, power: 0.2 });
  const { keeper } = advanceUntilKeeperActs(game, 'home');
  assertSaved(game, 'home');
  assert.equal(game.ball.keeperOwner, 'home');
  assert.equal(keeper.state, 'holding');
}

// Live positioning closes the angle to an opponent carrier and stays within the goal area.
{
  const game = new Game();
  game.start();
  for (const player of [...game.homeTeam, ...game.awayTeam]) {
    player.stunTimer = 20;
    player.vx = 0;
    player.vy = 0;
  }
  const carrier = game.homeTeam[0];
  Object.assign(carrier, { x: 610, y: 320, vx: 40, vy: -30, angle: -Math.PI / 2 });
  Object.assign(game.ball, { owner: 'home', ownerId: carrier.id, keeperOwner: null, shotTeam: null });
  game.possession = 'home';
  for (let i = 0; i < 25; i++) game.update(STEP, NEUTRAL_INPUT);

  assert.ok(game.awayKeeper.x > CENTER_X + 15, 'keeper should shade toward the attacker and shot angle');
  assert.ok(game.awayKeeper.y > FIELD_TOP + 3, 'keeper should step off the goal line based on threat distance');
  assert.ok(game.awayKeeper.x <= CENTER_X + 44 + 95, 'keeper must stay within a reasonable lateral zone');
  assert.ok(game.awayKeeper.y <= FIELD_TOP + 104, 'keeper must stay within the goal-area depth limit');
  assert.ok(game.awayKeeper.angle > 0 && game.awayKeeper.angle < Math.PI / 2, 'keeper should face the ball carrier');
}

// Actual shot creation marks the defending keeper for both the human and away AI.
{
  const game = new Game();
  game.start();
  for (let i = 0; i < game.homeTeam.length; i++) {
    if (i !== game.activePlayerIndex) game.homeTeam[i].stunTimer = 20;
    game.awayTeam[i].stunTimer = 20;
  }
  game.update(STEP, { dx: 0, dy: 0, action: true, actionPressed: true });
  for (let i = 0; i < 8; i++) game.update(STEP, { dx: 0, dy: 0, action: true, actionPressed: false });
  game.update(STEP, NEUTRAL_INPUT);
  assert.equal(game.ball.lastTouchTeam, 'home');
  assert.equal(game.ball.shotTeam, 'away', 'home shot should be handled by the away keeper');
  advanceUntilKeeperActs(game, 'away');
  assertSaved(game, 'away');
}
{
  const game = new Game();
  game.start();
  for (const player of [...game.homeTeam, ...game.awayTeam]) player.stunTimer = 20;
  const carrier = game.awayTeam[3];
  Object.assign(carrier, { x: CENTER_X, y: 930, vx: 0, vy: 0, angle: Math.PI / 2, aiDecisionTimer: 0, aiReactionTimer: 0 });
  for (let i = 0; i < game.homeTeam.length; i++) {
    game.homeTeam[i].x = 60 + i * 10;
    game.homeTeam[i].y = 650 + i * 20;
  }
  Object.assign(game.ball, { owner: 'away', ownerId: carrier.id, lastTouchTeam: 'away', keeperOwner: null, shotTeam: null });
  game.possession = 'away';
  game.awayMode = 'attacking';
  game.update(STEP, NEUTRAL_INPUT);
  assert.equal(game.ball.lastTouchTeam, 'away');
  assert.equal(game.ball.shotTeam, 'home', 'away AI shot should be handled by the home keeper');
  advanceUntilKeeperActs(game, 'home');
  assertSaved(game, 'home');
}

// After holding, the keeper releases toward a nearby unmarked defender without teleporting.
{
  const game = createShot({ shooter: 'home', y: 250, vy: -560, power: 0.2 });
  Object.assign(game.awayTeam[0], { x: 480, y: 200, vx: 0, vy: 0 });
  Object.assign(game.awayTeam[1], { x: 710, y: 450, vx: 0, vy: 0 });
  advanceUntilKeeperActs(game, 'away');
  assert.equal(game.ball.keeperOwner, 'away');

  let previousX = game.ball.x;
  let previousY = game.ball.y;
  for (let i = 0; i < 20 && game.ball.keeperOwner !== null; i++) {
    previousX = game.ball.x;
    previousY = game.ball.y;
    game.update(STEP, NEUTRAL_INPUT);
  }

  assert.equal(game.ball.keeperOwner, null, 'keeper should distribute after holding');
  assert.equal(game.ball.targetTeam, 'away', 'nearby defender should be selected as receiver');
  assert.equal(game.ball.targetId, game.awayTeam[0].id);
  assert.ok(Math.hypot(game.ball.x - previousX, game.ball.y - previousY) < 60, 'release should travel, not teleport');
  assert.ok(Math.hypot(game.ball.vx, game.ball.vy) > 300, 'clearance should be a moving ball');
}

console.log('Goalkeeper integration checks passed: central, left, right, powerful, weak, close, long, off-frame, parry, catch and clearance (both ends).');
