import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

const engineSource = await readFile(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const { code } = await transformWithEsbuild(engineSource, 'src/game/engine.ts', {
  loader: 'ts',
  target: 'es2020',
  format: 'esm',
});
const { Game } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const STEP = 0.05;
const INPUT = { dx: 0, dy: 0, action: false, actionPressed: false };
const CENTER_X = 400;

function newGame() {
  const game = new Game();
  game.start();
  return game;
}

function freezeAway(game, x = 720, y = 300) {
  for (let i = 0; i < game.awayTeam.length; i++) {
    Object.assign(game.awayTeam[i], {
      x: x + i * 10,
      y: y + i * 34,
      vx: 0,
      vy: 0,
      stunTimer: 20,
    });
  }
}

function giveHomeBall(game, carrier, x, y) {
  Object.assign(carrier, { x, y, vx: 0, vy: 0, angle: -Math.PI / 2 });
  Object.assign(game.ball, {
    x, y,
    vx: 0,
    vy: 0,
    owner: 'home',
    ownerId: carrier.id,
    keeperOwner: null,
    lastTouchTeam: 'home',
    targetTeam: null,
    targetId: null,
    shotTeam: null,
    shotPower: 0,
    shotAttempted: false,
    acquisitionCooldown: 0,
  });
  game.possession = 'home';
}

function step(game, count) {
  for (let i = 0; i < count; i++) game.update(STEP, INPUT);
}

// Forward makes an attacking run into space instead of returning to the static formation slot.
{
  const game = newGame();
  freezeAway(game);
  const carrier = game.homeTeam[2];
  const forward = game.homeTeam[3];
  for (const teammate of game.homeTeam) teammate.stunTimer = 0;
  giveHomeBall(game, carrier, CENTER_X, 850);
  Object.assign(forward, { x: 485, y: 850, vx: 0, vy: 0 });
  const initialY = forward.y;
  step(game, 30);
  assert.ok(forward.y < initialY - 80, `forward should attack open space (y ${forward.y})`);
  assert.ok(forward.y < carrier.y, 'forward should be ahead of the ball carrier');
}

// The midfielder becomes a short, lateral/backward outlet for the active carrier.
{
  const game = newGame();
  freezeAway(game);
  for (const teammate of game.homeTeam) teammate.stunTimer = 0;
  const carrier = game.homeTeam[3];
  const midfielder = game.homeTeam[2];
  giveHomeBall(game, carrier, CENTER_X, 600);
  Object.assign(midfielder, { x: 320, y: 820, vx: 0, vy: 0 });
  step(game, 30);
  assert.ok(Math.abs(midfielder.x - carrier.x) > 55, 'midfielder should offer a lateral passing lane');
  assert.ok(midfielder.y > carrier.y + 18 && midfielder.y < carrier.y + 145, 'midfielder should stay close and cover behind');
}

// Defenders keep their width and remain behind a high attacking carrier.
{
  const game = newGame();
  freezeAway(game);
  for (const teammate of game.homeTeam) teammate.stunTimer = 0;
  const carrier = game.homeTeam[3];
  const leftDefender = game.homeTeam[0];
  const rightDefender = game.homeTeam[1];
  giveHomeBall(game, carrier, CENTER_X, 350);
  Object.assign(leftDefender, { x: 240, y: 1000, vx: 0, vy: 0 });
  Object.assign(rightDefender, { x: 560, y: 1000, vx: 0, vy: 0 });
  step(game, 30);
  assert.ok(leftDefender.y > carrier.y + 180, 'left defender should stay behind the ball');
  assert.ok(rightDefender.y > carrier.y + 180, 'right defender should stay behind the ball');
  assert.ok(leftDefender.y > 650 && rightDefender.y > 650, 'defenders should not surge into the attack');
  assert.ok(rightDefender.x - leftDefender.x > 190, 'defenders should preserve a broad structure');
}

// Without home possession, midfielders and defenders track the opponent while the forward screens high.
{
  const game = newGame();
  for (const player of game.homeTeam) player.stunTimer = 0;
  for (const player of game.awayTeam) player.stunTimer = 20;
  const opponent = game.awayTeam[3];
  Object.assign(opponent, { x: 430, y: 350, vx: 0, vy: 0, angle: Math.PI / 2, aiDecisionTimer: 10, aiReactionTimer: 10 });
  Object.assign(game.ball, { owner: 'away', ownerId: opponent.id, lastTouchTeam: 'away', keeperOwner: null, shotTeam: null });
  game.possession = 'away';
  const defender = game.homeTeam[0];
  const midfielder = game.homeTeam[2];
  step(game, 30);
  assert.ok(defender.y > opponent.y + 200, 'defender should cover behind the opponent carrier');
  assert.ok(midfielder.y > opponent.y + 100, 'midfielder should cover the central space behind the ball');
  assert.ok(defender.y > 650, 'home defensive line should not chase too high');
}

// The forward chooses the less-pressured side rather than running into defenders.
{
  const game = newGame();
  for (const teammate of game.homeTeam) teammate.stunTimer = 0;
  const carrier = game.homeTeam[2];
  const forward = game.homeTeam[3];
  giveHomeBall(game, carrier, CENTER_X, 800);
  Object.assign(forward, { x: CENTER_X, y: 800, vx: 0, vy: 0 });
  const leftRunY = 800 - 205 + ((1200 - 800) / (1200 - 30)) * 45;
  Object.assign(game.awayTeam[0], { x: CENTER_X - 152, y: leftRunY, vx: 0, vy: 0, stunTimer: 20 });
  for (let i = 1; i < game.awayTeam.length; i++) {
    Object.assign(game.awayTeam[i], { x: 720, y: 250 + i * 45, vx: 0, vy: 0, stunTimer: 20 });
  }
  step(game, 20);
  assert.ok(forward.x > CENTER_X + 45, `forward should select the open right channel (x ${forward.x})`);
}

// Teammates that begin bunched apart from the carrier spread via steering separation.
{
  const game = newGame();
  freezeAway(game);
  for (const teammate of game.homeTeam) teammate.stunTimer = 0;
  const carrier = game.homeTeam[0];
  const midfielder = game.homeTeam[2];
  const forward = game.homeTeam[3];
  giveHomeBall(game, carrier, CENTER_X, 700);
  Object.assign(midfielder, { x: 455, y: 760, vx: 0, vy: 0 });
  Object.assign(forward, { x: 455, y: 760, vx: 0, vy: 0 });
  step(game, 24);
  const separation = Math.hypot(midfielder.x - forward.x, midfielder.y - forward.y);
  assert.ok(separation > 85, `support players should spread out, got ${separation.toFixed(1)}px`);
}

// Passing triggers a brief follow-through for the passer; the receiver moves toward the predicted ball path.
{
  const game = newGame();
  freezeAway(game, 720, 250);
  const passer = game.homeTeam[0];
  for (const teammate of game.homeTeam) teammate.stunTimer = 0;
  giveHomeBall(game, passer, 350, 700);
  passer.vx = 125;
  passer.angle = -Math.PI / 2;
  const startX = passer.x;
  game.executePass(passer, 0, -1);
  const receiver = game.homeTeam[game.activePlayerIndex];
  assert.notEqual(receiver.id, passer.id, 'pass should have a distinct receiver');
  assert.equal(game.ball.targetTeam, 'home');
  const oldReceiverDistance = Math.hypot(game.ball.x - receiver.x, game.ball.y - receiver.y);
  step(game, 1);
  const newReceiverDistance = Math.hypot(game.ball.x - receiver.x, game.ball.y - receiver.y);
  assert.ok(passer.x > startX, 'passer should continue forward after releasing the ball');
  assert.equal(passer.state, 'passing', 'follow-through state should not be erased by support movement');
  assert.ok(newReceiverDistance < oldReceiverDistance, 'receiver should anticipate the ball trajectory');
}

// Dash gives a short speed boost and spends the active player's stamina.
{
  const normal = newGame();
  const sprint = newGame();
  const normalCarrier = normal.homeTeam[normal.activePlayerIndex];
  const sprintCarrier = sprint.homeTeam[sprint.activePlayerIndex];
  const initialX = sprintCarrier.x;
  for (let i = 0; i < 24; i++) {
    normal.update(STEP, { ...INPUT, dx: 1 });
    sprint.update(STEP, { ...INPUT, dx: 1, dash: true });
  }
  assert.ok(sprintCarrier.x - initialX > normalCarrier.x - initialX + 35, 'dash should accelerate the active player');
  assert.ok(sprintCarrier.stamina < 80, 'dash should drain stamina');
  assert.equal(sprint.hud().activePlayerRole, 'midfielder');
  assert.ok(sprint.hud().stamina < 80, 'HUD snapshot should expose stamina');
}

// Manual switch selects a nearby defender under threat and remains selected until possession is won.
{
  const game = newGame();
  Object.assign(game.homeTeam[0], { x: 520, y: 900 });
  Object.assign(game.homeTeam[1], { x: 250, y: 700 });
  Object.assign(game.homeTeam[2], { x: 420, y: 800 });
  Object.assign(game.homeTeam[3], { x: 400, y: 500 });
  Object.assign(game.awayTeam[3], { x: 500, y: 1000 });
  Object.assign(game.ball, { owner: 'away', ownerId: game.awayTeam[3].id, x: 500, y: 1000, lastTouchTeam: 'away' });
  game.possession = 'away';
  game.update(STEP, { ...INPUT, switchPlayer: true });
  assert.equal(game.homeTeam[game.activePlayerIndex].id, game.homeTeam[0].id, 'switch should pick the best-placed defender');
  game.update(STEP, INPUT);
  assert.equal(game.homeTeam[game.activePlayerIndex].id, game.homeTeam[0].id, 'manual defensive selection should persist');
  Object.assign(game.ball, { owner: 'home', ownerId: game.homeTeam[2].id });
  game.update(STEP, INPUT);
  assert.equal(game.homeTeam[game.activePlayerIndex].id, game.homeTeam[2].id, 'possession should return control to the carrier');
}

console.log('Home support checks passed: roles, defense, space, separation, passing, dash/stamina and manual switch.');
