import { assert, liveMatch, loadEngine } from './helpers/load-engine.mjs';

const E = await loadEngine();
const { CY, GOAL_HALF, FIXED_DT, createInput, clearInputEdges, attachKeyboard, choosePassTarget } = E;

/* --------------------------- Keyboard mapping --------------------------- */

const listeners = {};
globalThis.window = {
  addEventListener: (t, f) => ((listeners[t] ??= []).push(f)),
  removeEventListener: (t, f) => (listeners[t] = (listeners[t] ?? []).filter(x => x !== f)),
};
function key(type, code, extra = {}) {
  let prevented = false;
  const e = { code, repeat: false, altKey: code.startsWith('Alt'), preventDefault: () => (prevented = true), ...extra };
  for (const f of listeners[type] ?? []) f(e);
  return prevented;
}

{
  const input = createInput();
  let paused = 0;
  let restarted = 0;
  const detach = attachKeyboard(input, { onPause: () => paused++, onRestart: () => restarted++, isActive: () => true });

  key('keydown', 'ShiftLeft');
  assert(!input.switchPressed, 'left Shift does not switch player');
  key('keyup', 'ShiftLeft');
  key('keydown', 'ShiftRight');
  assert(input.switchPressed, 'right Shift switches player');
  key('keyup', 'ShiftRight');
  clearInputEdges(input);

  key('keydown', 'KeyX');
  assert(input.pass && input.passPressed, 'X presses pass');
  key('keyup', 'KeyX');
  assert(!input.pass && input.passReleased, 'X release ends the pass');
  clearInputEdges(input);

  key('keydown', 'KeyC');
  assert(input.shoot && input.shootPressed, 'C presses shoot');
  key('keyup', 'KeyC');
  assert(input.shootReleased, 'C release fires the shot');
  clearInputEdges(input);

  const prevented = key('keydown', 'AltLeft');
  assert(input.dashPressed && input.sprint && prevented, 'Alt dashes / sprints and its default browser action is blocked');
  key('keyup', 'AltLeft');
  assert(!input.sprint, 'releasing Alt stops the sprint');
  clearInputEdges(input);

  for (const [code, mx, my] of [['KeyW', 0, -1], ['KeyS', 0, 1], ['KeyA', -1, 0], ['KeyD', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['ArrowLeft', -1, 0], ['ArrowRight', 1, 0]]) {
    key('keydown', code);
    const ok = input.moveX === mx && input.moveY === my;
    key('keyup', code);
    assert(ok && input.moveX === 0 && input.moveY === 0, `${code} moves (${mx}, ${my})`);
  }
  key('keydown', 'KeyD');
  key('keydown', 'KeyW');
  assert(Math.abs(Math.hypot(input.moveX, input.moveY) - 1) < 1e-9, 'diagonal movement is normalised');
  key('keyup', 'KeyD');
  key('keyup', 'KeyW');

  for (const code of ['KeyJ', 'KeyK', 'KeyL']) {
    key('keydown', code);
    assert(!input.passPressed && !input.shootPressed && !input.switchPressed && !input.dashPressed, `${code} is not a game control`);
    key('keyup', code);
  }

  key('keydown', 'Escape');
  assert(paused === 1, 'Escape toggles pause');
  key('keydown', 'KeyR');
  assert(restarted === 1, 'R restarts');
  detach();
}

/* --------------------------- In-match actions --------------------------- */

function step(m, input, n = 1) {
  for (let i = 0; i < n; i++) {
    m.update(FIXED_DT, input);
    clearInputEdges(input);
  }
}

/** Live match with a home midfielder on the ball in midfield and the opponents far away. */
function carrierSetup() {
  const m = liveMatch(E);
  const p = m.home.players[2];
  p.x = 700;
  p.y = CY;
  p.vx = p.vy = 0;
  const mates = m.home.players;
  mates[1].x = 520; mates[1].y = CY + 40;
  mates[3].x = 760; mates[3].y = CY + 260;
  mates[4].x = 980; mates[4].y = CY - 120;
  for (const o of m.away.players) {
    if (o.isGK) continue;
    o.x = 1250;
    o.y = 120 + o.index * 160;
  }
  m.gainPossession(p);
  m.ball.ownerLock = 0;
  m.attachBall(FIXED_DT);
  return { m, p };
}

/** Press then release a button; a swipe (touch) is reported together with the release, like the touch UI does. */
function tap(m, input, btn, holdSteps = 2, swipe = null) {
  input[btn] = true;
  input[`${btn}Pressed`] = true;
  step(m, input, holdSteps);
  input[btn] = false;
  input[`${btn}Released`] = true;
  if (swipe) input[`${btn}Swipe`] = swipe;
  step(m, input, 1);
}

{
  const { m, p } = carrierSetup();
  const input = createInput();
  const t = m.home.players[3];
  const d = Math.hypot(t.x - p.x, t.y - p.y);
  input.moveX = (t.x - p.x) / d;
  input.moveY = (t.y - p.y) / d;
  const expected = choosePassTarget(p, input.moveX, input.moveY, 0.75);
  tap(m, input, 'pass');
  assert(m.ball.owner === null && m.ball.kind === 'pass' && m.ball.passTarget === expected && expected === t, 'directional pass (X + direction) goes to the teammate in that direction');
  assert(m.home.controlled === t, 'control follows the pass to the receiver');
}
{
  const { m, p } = carrierSetup();
  const input = createInput();
  const t = m.home.players[4];
  const d = Math.hypot(t.x - p.x, t.y - p.y);
  input.moveX = (t.x - p.x) / d;
  input.moveY = (t.y - p.y) / d;
  tap(m, input, 'pass');
  assert(m.ball.passTarget === t, 'a different direction picks a different receiver');
}
{
  const { m } = carrierSetup();
  const input = createInput();
  tap(m, input, 'pass', Math.round(0.5 / FIXED_DT));
  assert(m.ball.kind === 'lob' && m.ball.vz > 0, 'holding X plays a lofted pass');
}
{
  const { m } = carrierSetup();
  const input = createInput();
  tap(m, input, 'pass', 2, { dx: 1, dy: 0, power: 0.2 });
  const soft = m.ball.speed;
  const { m: m2 } = carrierSetup();
  tap(m2, input, 'pass', 2, { dx: 1, dy: 0, power: 0.7 });
  assert(m2.ball.speed > soft + 100 && m2.ball.kind === 'pass', `swipe pass power follows the swipe length (${soft | 0} -> ${m2.ball.speed | 0})`);
}

function shooterSetup() {
  const { m, p } = carrierSetup();
  p.x = 1180;
  p.y = CY;
  // Defenders out of the way: these tests are about the shot itself, not about being tackled mid-charge.
  for (const o of m.away.players) if (!o.isGK) o.x = 400;
  m.away.keeper.x = 1470;
  m.away.keeper.y = CY;
  m.attachBall(FIXED_DT);
  return { m, p };
}
/** Where on the goal line (relative to CY) the ball is heading. */
function shotLineY(m) {
  const b = m.ball;
  return b.y + (b.vy / b.vx) * (1500 - b.x) - CY;
}
{
  const { m } = shooterSetup();
  const input = createInput();
  tap(m, input, 'shoot', 2);
  assert(m.ball.kind === 'shot' && m.ball.shotPower <= 0.55, 'tapping C is a controlled placed shot');
}
{
  const { m } = shooterSetup();
  const input = createInput();
  tap(m, input, 'shoot', Math.round(0.8 / FIXED_DT));
  assert(m.ball.kind === 'shot' && m.ball.shotPower > 0.85, `holding C charges the shot (power ${m.ball.shotPower.toFixed(2)})`);
}
{
  let up = 0;
  let down = 0;
  for (let i = 0; i < 20; i++) {
    for (const dir of [-1, 1]) {
      const { m } = shooterSetup();
      const input = createInput();
      input.moveY = dir;
      tap(m, input, 'shoot', 20);
      const y = shotLineY(m);
      if (dir < 0 && y < -GOAL_HALF * 0.3) up++;
      if (dir > 0 && y > GOAL_HALF * 0.3) down++;
    }
  }
  assert(up >= 15 && down >= 15, `C + up/down aims at the near/far post (${up}/20 up, ${down}/20 down)`);
}
{
  let low = 0;
  let high = 0;
  let centre = 0;
  for (let i = 0; i < 20; i++) {
    for (const [dy, kind] of [[0.5, 'low'], [-0.5, 'high'], [0, 'centre']]) {
      const { m } = shooterSetup();
      const input = createInput();
      tap(m, input, 'shoot', 2, { dx: Math.sqrt(1 - dy * dy), dy, power: 0.7 });
      const y = shotLineY(m);
      if (kind === 'low' && y > 25) low++;
      if (kind === 'high' && y < -25) high++;
      if (kind === 'centre' && Math.abs(y) < 40) centre++;
    }
  }
  assert(low >= 15 && high >= 15 && centre >= 14, `swipe shot aims at post / centre / other post (${low}, ${centre}, ${high} of 20)`);
}
{
  const { m, p } = carrierSetup();
  const input = createInput();
  input.moveX = 1;
  step(m, input, 10);
  input.dashPressed = true;
  step(m, input, 1);
  assert(m.ball.owner !== p && m.ball.kind === 'dribble', 'Alt with the ball knocks it ahead (dash)');
}
{
  const { m } = carrierSetup();
  const input = createInput();
  m.home.controlled = m.home.players[1];
  const before = m.home.controlled;
  // Loose ball so the switch is available.
  m.ball.owner = null;
  m.ball.x = 1100;
  m.ball.y = CY;
  input.switchPressed = true;
  step(m, input, 1);
  assert(m.home.controlled !== before && !m.home.controlled.isGK, `right Shift switches to another outfield player (${before.name} -> ${m.home.controlled.name})`);
}
{
  // Defending: a goal-side teammate beats a closer one who has been left behind the play.
  const m = liveMatch(E);
  const c = m.away.players[3];
  for (const o of m.away.players) if (!o.isGK) { o.x = 900; o.y = 100 + o.index * 150; }
  c.x = 600; c.y = CY; c.vx = -150;
  m.gainPossession(c);
  const h = m.home.players;
  h[3].x = 660; h[3].y = CY + 40;
  h[1].x = 440; h[1].y = CY + 90;
  h[2].x = 1000; h[2].y = 100;
  h[4].x = 1100; h[4].y = 800;
  assert(E.bestSwitch(m.home, m, null, 0) === h[1], 'switch picks the goal-side defender, not the nearest player behind the play');
}
{
  // A pass in flight: the switch goes to its intended receiver.
  const { m, p } = carrierSetup();
  const r = m.home.players[4];
  E.passTo(m, p, r.x, r.y, { target: r });
  m.update(FIXED_DT);
  assert(E.bestSwitch(m.home, m, p, 0) === r, 'switch picks the receiver of a pass in flight');
}
