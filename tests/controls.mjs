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
  let active = true;
  const detach = attachKeyboard(input, { onPause: () => paused++, onRestart: () => (restarted++, true), isActive: () => active });

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

  key('keydown', 'KeyR');
  assert(input.sprint && !input.dashPressed && restarted === 0, 'R held sprints (no dash, no restart)');
  key('keydown', 'KeyX');
  assert(input.sprint && input.passPressed, 'R + X: sprinting while passing');
  key('keyup', 'KeyX');
  key('keyup', 'KeyR');
  assert(!input.sprint, 'releasing R stops the sprint');
  clearInputEdges(input);

  key('keydown', 'KeyT');
  assert(input.throughPressed && !input.passPressed, 'T plays a through ball');
  key('keyup', 'KeyT');
  clearInputEdges(input);
  assert(!input.throughPressed, 'through ball is a one-frame edge');

  key('keydown', 'Enter');
  assert(restarted === 0, 'Enter does nothing during play');
  active = false;
  key('keydown', 'KeyR');
  assert(restarted === 0, 'R never restarts, even paused');
  key('keydown', 'Enter');
  assert(restarted === 1, 'Enter restarts when paused / at full time');
  active = true;

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
  const m = liveMatch(E);
  const p = m.home.players[2];
  p.x = 700;
  p.y = CY;
  p.facing = 0;
  p.vx = p.vy = 0;
  const fwd = m.home.players[4];
  fwd.x = 980;
  fwd.y = CY;
  const back = m.home.players[1];
  back.x = 480;
  back.y = CY;
  for (const t of m.home.players) {
    if (t !== p && t !== fwd && t !== back) { t.x = 200; t.y = 80; }
  }
  for (const o of m.away.players) if (!o.isGK) { o.x = 1400; o.y = 100 + o.index * 120; }
  m.gainPossession(p);
  m.home.controlled = p;
  const input = createInput();
  step(m, input, 2);
  assert(m.human.previewTarget === fwd, 'with no direction held, the pass preview shows the teammate ahead');
  tap(m, input, 'pass');
  assert(m.ball.passTarget === fwd, 'an unaimed pass goes to the previewed teammate, not the one behind');
}
{
  const m = liveMatch(E);
  const p = m.home.players[2];
  p.x = 700;
  p.y = CY;
  p.facing = 0;
  p.vx = p.vy = 0;
  for (const t of m.home.players) if (t !== p) t.x = 980;
  for (const t of m.home.players) if (t !== p) t.y = CY + (t.index - 2) * 40;
  for (const o of m.away.players) if (!o.isGK) { o.x = 1400; o.y = 100; }
  m.gainPossession(p);
  m.home.controlled = p;
  const input = createInput();
  input.moveY = -1;
  step(m, input, 2);
  const spot = m.human.previewPoint;
  assert(m.human.previewTarget === null && spot && spot.y < p.y - 80, 'aiming into empty space previews that space');
  tap(m, input, 'pass');
  assert(m.ball.passTarget === null && m.ball.vy < -80, 'a pass aimed into empty space follows the stick, not a teammate off to the side');
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
  input.touch = true;
  tap(m, input, 'pass', Math.round(0.3 / FIXED_DT));
  assert(m.ball.kind === 'pass', 'a slightly long thumb tap on PASSE stays a ground pass');
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
  let centre = 0;
  let far = 0;
  let high = 0;
  for (let i = 0; i < 10; i++) {
    const charged = shooterSetup();
    const hold = createInput();
    tap(charged.m, hold, 'shoot', Math.round(0.8 / FIXED_DT));
    centre += shotLineY(charged.m);
    const a = shooterSetup();
    a.m.away.keeper.y = CY + 40;
    a.m.away.keeper.gk.state = 'down';
    a.m.away.keeper.gk.timer = 9;
    const input = createInput();
    tap(a.m, input, 'shoot', 2);
    if (shotLineY(a.m) < -35) far++;
    const b = shooterSetup();
    const up = createInput();
    up.moveY = -1;
    tap(b.m, up, 'shoot', 2);
    if (shotLineY(b.m) < -25) high++;
  }
  assert(Math.abs(centre / 10) < 20, `a charged shot with no vertical aim goes at the centre (mean ${ (centre / 10).toFixed(0) })`);
  assert(far >= 8, `a tap with no direction is a placed shot away from the keeper (${far}/10)`);
  assert(high >= 8, `holding up while tapping C aims at the top post (${high}/10)`);
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

/* ------------------------------ Through ball ------------------------------ */

{
  // T to a forward running in behind: played into the space ahead of his run, and he gets there.
  const { m, p } = carrierSetup();
  const fwd = m.home.players[4];
  fwd.vx = 230;
  fwd.vy = 0;
  for (const o of m.away.players) if (!o.isGK) { o.x = 380; o.y = 100 + o.index * 150; }
  const input = createInput();
  input.throughPressed = true;
  step(m, input, 1);
  const b = m.ball;
  assert(b.through && b.passTarget === fwd && m.home.controlled === fwd, 'T plays the through ball to the forward running ahead');
  const lead = b.passTargetX - fwd.x;
  assert(lead > 70 && lead < 340, `the through ball goes into the space ahead of the run, not miles ahead (${lead | 0})`);
  let got = false;
  for (let i = 0; i < Math.round(3 / FIXED_DT) && !got; i++) {
    step(m, input, 1);
    got = b.owner === fwd;
  }
  assert(got, 'the runner reaches the through ball');
}
{
  // Nobody ahead: the ball is played into the space in front of the carrier, and stays on the pitch.
  const { m, p } = carrierSetup();
  for (const t of m.home.players) if (t !== p && !t.isGK) { t.x = 300; t.y = 200 + t.index * 100; }
  const input = createInput();
  input.throughPressed = true;
  step(m, input, 1);
  assert(m.ball.passTarget === null && m.ball.vx > 150 && m.ball.passTargetX > p.x + 120, 'T with nobody ahead plays into the space in front of the carrier');
  const { m: m2, p: p2 } = carrierSetup();
  for (const t of m2.home.players) if (t !== p2 && !t.isGK) { t.x = 300; t.y = 200; }
  p2.x = 1400;
  p2.y = 30;
  m2.attachBall(FIXED_DT);
  const in2 = createInput();
  in2.moveX = 0.6;
  in2.moveY = -0.8;
  in2.throughPressed = true;
  step(m2, in2, 1);
  const b = m2.ball;
  assert(b.passTargetX <= 1450 && b.passTargetY >= 35, `a through ball near the corner never targets outside the pitch (${b.passTargetX | 0}, ${b.passTargetY | 0})`);
  const rx = b.restX();
  const ry = b.restY();
  assert(rx > 0 && rx < 1500 && ry > 0 && ry < 900, `...and it comes to rest on the pitch (${rx | 0}, ${ry | 0})`);
}
{
  // Defenders follow the run first instead of reading the exact destination at once.
  const { m } = carrierSetup();
  const fwd = m.home.players[4];
  fwd.vx = 230;
  const input = createInput();
  input.throughPressed = true;
  step(m, input, 1);
  let tracked = false;
  for (let i = 0; i < Math.round(0.2 / FIXED_DT); i++) {
    step(m, input, 1);
    if (m.away.tracker) tracked = true;
  }
  assert(tracked, 'a defender is assigned to follow the runner of a through ball');
}

/* ------------------------------- Defending X ------------------------------ */

function defendSetup(gap) {
  const m = liveMatch(E);
  const c = m.away.players[3];
  for (const o of m.away.players) if (!o.isGK && o !== c) { o.x = 1200; o.y = 100 + o.index * 150; }
  c.x = 700; c.y = CY; c.vx = c.vy = 0;
  m.gainPossession(c);
  m.ball.ownerLock = 0;
  m.attachBall(FIXED_DT);
  const d = m.home.players[2];
  for (const t of m.home.players) if (t !== d && !t.isGK) { t.x = 200; t.y = 100 + t.index * 150; }
  d.x = 700 - gap; d.y = CY; d.vx = d.vy = 0;
  d.facing = 0;
  m.home.controlled = d;
  return { m, c, d };
}
{
  const { m, d } = defendSetup(24);
  const input = createInput();
  input.pass = true;
  input.passPressed = true;
  step(m, input, 1);
  assert(d.tackleCd > 0, 'X right next to the carrier tackles');
}
{
  const { m, d } = defendSetup(85);
  const input = createInput();
  input.pass = true;
  input.passPressed = true;
  step(m, input, 1);
  input.pass = false;
  const x0 = d.x;
  step(m, input, 10);
  assert(m.human.lunge > 0 && d.x > x0 + 4, 'X a little away from the carrier steps in toward the ball');
}
{
  const { m, d } = defendSetup(320);
  const input = createInput();
  input.passPressed = true;
  step(m, input, 1);
  const x0 = d.x;
  step(m, input, 20);
  assert(d.tackleCd <= 0 && m.human.lunge === 0 && Math.abs(d.x - x0) < 3, 'X far from the carrier does nothing (no absurd tackle, no forced run)');
}
{
  let won = 0;
  let missed = 0;
  for (let i = 0; i < 60; i++) {
    const { m, c, d } = defendSetup(24);
    const input = createInput();
    input.passPressed = true;
    step(m, input, 1);
    if (m.ball.owner !== c) won++;
    else if (d.stun > 0) missed++;
  }
  assert(won >= 10 && missed >= 10, `a close tackle can win the ball or miss (${won} won, ${missed} missed of 60)`);
}
{
  // Manual defence: without X the controlled defender only follows the stick.
  const { m, d } = defendSetup(60);
  const input = createInput();
  input.moveY = 1;
  step(m, input, 30);
  assert(d.y > CY + 20 && d.tackleCd <= 0, 'without X the defender goes where the stick says, never thrown at the ball');
}

/* --------------------------------- Sprint -------------------------------- */

function runFor(withBall, sprint, stamina = 1) {
  const { m, p } = carrierSetup();
  for (const o of m.away.players) if (!o.isGK) { o.x = 200; o.y = 100 + o.index * 150; }
  if (!withBall) {
    m.ball.owner = null;
    m.ball.place(100, 100);
  }
  p.stamina = stamina;
  m.home.controlled = p;
  const input = createInput();
  input.moveX = 1;
  input.sprint = sprint;
  step(m, input, Math.round(0.9 / FIXED_DT));
  return { speed: p.speed, stamina: p.stamina };
}
{
  const walk = runFor(false, false);
  const run = runFor(false, true);
  const walkBall = runFor(true, false);
  const runBall = runFor(true, true);
  assert(run.speed > walk.speed * 1.25, `R sprint is clearly faster without the ball (${walk.speed | 0} -> ${run.speed | 0})`);
  assert(runBall.speed > walkBall.speed * 1.2, `R sprint is clearly faster with the ball (${walkBall.speed | 0} -> ${runBall.speed | 0})`);
  assert(run.stamina < walk.stamina - 0.05, 'sprinting drains stamina');
  const tired = runFor(false, true, 0.12);
  assert(tired.speed < run.speed * 0.85 && tired.speed >= walk.speed * 0.85, `a tired player loses most of his sprint (${tired.speed | 0})`);
}
