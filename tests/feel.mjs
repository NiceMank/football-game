// Feel of duels and assistance: natural defending (no "magnet"), assisted but controllable pass / shot / tackle.
import { assert, liveMatch, loadEngine } from './helpers/load-engine.mjs';

const E = await loadEngine();
const { CY, GOAL_HALF, FIXED_DT, createInput, clearInputEdges } = E;

function step(m, input, n = 1) {
  for (let i = 0; i < n; i++) {
    m.update(FIXED_DT, input);
    clearInputEdges(input);
  }
}

/* ------------------------------ Defending AI ------------------------------ */

/** Human carrier in midfield with an AI defender in front; the stick follows `pattern(t)`. */
function duel(pattern, seed, difficulty = 'pro') {
  const m = liveMatch(E, difficulty);
  const p = m.home.players[2];
  p.x = 640; p.y = CY + ((seed % 5) - 2) * 60; p.vx = p.vy = 0;
  const d0 = m.away.players[3];
  d0.x = p.x + 130; d0.y = p.y + ((seed % 3) - 1) * 30;
  m.gainPossession(p);
  m.home.controlled = p;
  m.ball.ownerLock = 0;
  const input = createInput();
  const out = { tight: 0, n: 0, crowd: 0, pressers: 0, lost: false, gains: [] };
  let lastSide = 0;
  let atTurn = null;
  for (let i = 0; i < Math.round(3 / FIXED_DT); i++) {
    const t = i * FIXED_DT;
    const [mx, my, sprint] = pattern(t);
    if (my !== lastSide) {
      if (t > 0.3) atTurn = { t, d: Math.hypot(d0.x - p.x, d0.y - p.y) };
      lastSide = my;
    }
    input.moveX = mx; input.moveY = my; input.sprint = !!sprint;
    step(m, input);
    if (m.ball.owner !== p) { out.lost = true; break; }
    let nd = 1e9;
    let near = 0;
    let pressing = 0;
    for (const o of m.away.players) {
      if (o.isGK) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      nd = Math.min(nd, d);
      if (d < 90) near++;
      if (o.intent === 'press') pressing++;
    }
    out.n++;
    if (nd < 32) out.tight++;
    out.crowd += near;
    out.pressers = Math.max(out.pressers, pressing);
    if (atTurn && t - atTurn.t >= 0.5 && t - atTurn.t < 0.5 + FIXED_DT) out.gains.push(Math.hypot(d0.x - p.x, d0.y - p.y) - atTurn.d);
  }
  return out;
}

const lateral = sprint => t => [0.12, Math.floor((t + 0.6) / 1.2) % 2 ? 1 : -1, sprint];

{
  let tight = 0, n = 0, lost = 0, crowd = 0, pressers = 0;
  const gains = [];
  for (let s = 0; s < 24; s++) {
    const r = duel(lateral(false), s);
    tight += r.tight; n += r.n; crowd += r.crowd; lost += r.lost ? 1 : 0;
    pressers = Math.max(pressers, r.pressers);
    gains.push(...r.gains);
  }
  assert(tight / n < 0.15, `a defender does not stay glued to a carrier dribbling sideways (${((tight / n) * 100).toFixed(0)}% of the time within 32 u)`);
  assert(lost <= 8, `a lateral dribble is not lost to the first defender almost every time (${lost}/24 lost in 3 s)`);
  assert(crowd / n < 1.6, `the defence does not swarm the carrier (avg ${(crowd / n).toFixed(2)} defenders within 90 u)`);
  assert(pressers <= 2, `at most one presser (plus a covering switch) goes to the carrier (${pressers})`);
}
{
  // A sprinting cut when the defender closes in buys a few metres of lateral separation.
  const gains = [];
  for (let s = 0; s < 24; s++) {
    const m = liveMatch(E);
    const p = m.home.players[2];
    p.x = 640; p.y = CY + ((s % 5) - 2) * 60;
    const d0 = m.away.players[3];
    d0.x = p.x + 160; d0.y = p.y + ((s % 3) - 1) * 20;
    m.gainPossession(p);
    m.home.controlled = p;
    m.ball.ownerLock = 0;
    const input = createInput();
    let cutT = null, side = 0, lat0 = 0;
    for (let i = 0; i < 300; i++) {
      const t = i * FIXED_DT;
      if (cutT === null && Math.hypot(d0.x - p.x, d0.y - p.y) < 75) { cutT = t; side = d0.y > p.y ? -1 : 1; lat0 = Math.abs(d0.y - p.y); }
      const cutting = cutT !== null && t - cutT < 0.5;
      input.moveX = cutting ? 0.3 : 1; input.moveY = cutting ? side : 0; input.sprint = cutT !== null;
      step(m, input);
      if (m.ball.owner !== p) break;
      if (cutT !== null && Math.abs(t - cutT - 0.45) < FIXED_DT / 2) { gains.push(Math.abs(d0.y - p.y) - lat0); break; }
    }
  }
  const mean = gains.reduce((a, b) => a + b, 0) / Math.max(1, gains.length);
  assert(gains.length >= 16 && mean > 20, `a sprinting cut creates lateral separation from the defender (+${mean.toFixed(0)} u after 0.45 s, n ${gains.length})`);
}
{
  // Still a real duel: running straight at a defender without beating him loses the ball fairly often.
  let lost = 0;
  for (let s = 0; s < 24; s++) if (duel(() => [1, 0], s).lost) lost++;
  assert(lost >= 5, `running straight into a defender is still punished (${lost}/24 lost)`);
}

/* ------------------------------ Pass assistance ------------------------------ */

function carrier() {
  const m = liveMatch(E);
  const p = m.home.players[2];
  p.x = 700; p.y = CY; p.vx = p.vy = 0;
  for (const t of m.home.players) if (t !== p && !t.isGK) { t.x = 200; t.y = 100 + t.index * 120; t.vx = t.vy = 0; }
  for (const o of m.away.players) if (!o.isGK) { o.x = 250; o.y = 120 + o.index * 160; }
  m.gainPossession(p);
  m.home.controlled = p;
  m.ball.ownerLock = 0;
  m.attachBall(FIXED_DT);
  return { m, p };
}
function pressX(m, input) {
  input.pass = true;
  input.passPressed = true;
  step(m, input, 2);
  input.pass = false;
  input.passReleased = true;
  step(m, input, 1);
}
{
  // Running right: the pass goes to the teammate on the right, even though the one on the left is closer.
  const { m } = carrier();
  const right = m.home.players[4];
  right.x = 1000; right.y = CY + 40;
  const left = m.home.players[3];
  left.x = 560; left.y = CY - 30;
  const input = createInput();
  input.moveX = 1;
  step(m, input, 10);
  pressX(m, input);
  assert(m.ball.passTarget === right, 'running right + X passes to the teammate on the right');
}
{
  // A close teammate just outside the aimed cone is found rather than the ball going past him.
  const { m, p } = carrier();
  const t = m.home.players[3];
  const a = 1.3;
  t.x = p.x + Math.cos(a) * 150; t.y = p.y + Math.sin(a) * 150;
  const input = createInput();
  input.moveX = 1;
  pressX(m, input);
  assert(m.ball.passTarget === t, 'a nearby teammate slightly off the aim is still found');
  const { m: m2, p: p2 } = carrier();
  const far = m2.home.players[3];
  far.x = p2.x; far.y = p2.y + 380;
  const in2 = createInput();
  in2.moveX = 1;
  pressX(m2, in2);
  assert(m2.ball.passTarget === null && m2.ball.vx > 100, 'with nobody near the aim the pass goes into the space in that direction');
}
{
  let ok = 0;
  let stopped = 0;
  const N = 15;
  for (const d of [140, 320, 560]) {
    for (let i = 0; i < N; i++) {
      const { m, p } = carrier();
      const t = m.home.players[4];
      t.x = p.x + d; t.y = p.y + ((i % 3) - 1) * 60;
      const input = createInput();
      input.moveX = (t.x - p.x) / Math.hypot(t.x - p.x, t.y - p.y);
      input.moveY = (t.y - p.y) / Math.hypot(t.x - p.x, t.y - p.y);
      pressX(m, input);
      input.moveX = input.moveY = 0;
      for (let k = 0; k < Math.round(3 / FIXED_DT) && !m.ball.owner; k++) {
        step(m, input);
        if (!m.ball.owner && m.ball.speed < 40) { stopped++; break; }
      }
      if (m.ball.owner === t) ok++;
    }
  }
  assert(ok >= 3 * N - 1 && stopped === 0, `assisted passes reach the receiver and never die on the way (${ok}/${3 * N}, stopped ${stopped})`);
}
{
  // Assistance does not make passes perfect: passes to a tightly marked teammate can be cut out.
  let cut = 0;
  for (let i = 0; i < 16; i++) {
    const m = liveMatch(E);
    const p = m.home.players[2];
    p.x = 640; p.y = CY;
    const t = m.home.players[4];
    t.x = 1000; t.y = CY + ((i % 3) - 1) * 50;
    m.gainPossession(p);
    m.home.controlled = p;
    const input = createInput();
    // Shielding the ball for a moment so the defence takes up its marking.
    step(m, input, Math.round(1.2 / FIXED_DT));
    if (m.ball.owner !== p) continue;
    const dx = t.x - p.x, dy = t.y - p.y, dl = Math.hypot(dx, dy);
    input.moveX = dx / dl; input.moveY = dy / dl;
    pressX(m, input);
    input.moveX = input.moveY = 0;
    let touched = false;
    for (let k = 0; k < Math.round(2.5 / FIXED_DT) && !m.ball.owner; k++) {
      step(m, input);
      if (m.ball.lastTouch?.team === m.away) touched = true;
    }
    if (touched || m.ball.owner?.team === m.away) cut++;
  }
  assert(cut >= 2 && cut <= 13, `interceptions are still possible on a pass to a marked teammate (${cut}/16 cut out)`);
}

/* ------------------------------ Shot assistance ------------------------------ */

function shooter(x = 1180, y = CY) {
  const { m, p } = carrier();
  p.x = x; p.y = y;
  m.away.keeper.x = 1470; m.away.keeper.y = CY;
  m.attachBall(FIXED_DT);
  return { m, p };
}
const lineY = m => { const b = m.ball; return b.y + (b.vy / b.vx) * (1500 - b.x) - CY; };
{
  const { m, p } = shooter();
  const h = m.human;
  h.moveX = 0.7; h.moveY = -0.7;
  const top = h.shotAimY(p, 1) - CY;
  h.moveX = 0.7; h.moveY = 0.7;
  const bottom = h.shotAimY(p, 1) - CY;
  h.moveX = 0.9; h.moveY = 0.4;
  const partial = h.shotAimY(p, 1) - CY;
  h.moveX = 1; h.moveY = 0;
  const straight = h.shotAimY(p, 1) - CY;
  assert(top < -GOAL_HALF * 0.6 && bottom > GOAL_HALF * 0.6, `the stick picks the post (${top | 0} / ${bottom | 0})`);
  assert(partial > 10 && partial < bottom, `a partial tilt aims between the centre and the post (${partial | 0})`);
  assert(Math.abs(straight) < 1, 'aiming straight forward shoots where the stick points: the centre');
}
{
  // Running toward the corner flag, the stick points away from the goal mouth: the shot follows it, wide.
  const { m, p } = shooter(1250, CY + 260);
  const h = m.human;
  h.moveX = 0.7; h.moveY = 0.7;
  const wide = h.shotAimY(p, 1) - CY;
  h.moveX = 0.7; h.moveY = -0.7;
  const onFrame = h.shotAimY(p, 1) - CY;
  assert(wide > GOAL_HALF + 40, `a stick pointing well wide of the goal is not pulled onto the frame (${wide | 0})`);
  assert(Math.abs(onFrame) < GOAL_HALF, `the same spot aimed toward the goal is assisted onto the frame (${onFrame | 0})`);
}
{
  // Firm shots from the edge of the box aimed at a post: mostly on target, but assistance keeps some off it.
  let on = 0;
  let off = 0;
  for (let i = 0; i < 40; i++) {
    const { m } = shooter(1140, CY + ((i % 3) - 1) * 80);
    const input = createInput();
    input.moveX = 0.7; input.moveY = i % 2 ? 0.7 : -0.7;
    input.shoot = true; input.shootPressed = true;
    step(m, input, Math.round(0.6 / FIXED_DT));
    input.shoot = false; input.shootReleased = true;
    step(m, input, 1);
    input.moveX = input.moveY = 0;
    const id = m.ball.shotId;
    const goals = m.home.score;
    let result = null;
    for (let k = 0; k < Math.round(2 / FIXED_DT) && result === null; k++) {
      step(m, input);
      if (m.home.score > goals) result = 'on';
      else if (m.ball.savedBy || m.ball.kind === 'parry' || (m.ball.owner && m.ball.owner.isGK)) result = 'on';
      else if (m.state !== 'live') result = 'off';
      else if (m.ball.shotId !== id) result = 'on';
    }
    if (result === 'on') on++;
    else if (result === 'off') off++;
  }
  assert(on / (on + off) > 0.6 && off >= 3, `assisted shots are mostly but not all on target (${on} on / ${off} off of 40)`);
}

/* ------------------------------ Defensive assistance ------------------------------ */

function defend(gap, cvx = 0) {
  const m = liveMatch(E);
  const c = m.away.players[3];
  for (const o of m.away.players) if (!o.isGK && o !== c) { o.x = 1200; o.y = 100 + o.index * 150; }
  c.x = 700; c.y = CY; c.vx = cvx; c.vy = 0;
  m.gainPossession(c);
  m.ball.ownerLock = 0;
  m.attachBall(FIXED_DT);
  const d = m.home.players[2];
  for (const t of m.home.players) if (t !== d && !t.isGK) { t.x = 200; t.y = 100 + t.index * 150; }
  d.x = 700 - gap; d.y = CY + 40; d.vx = d.vy = 0;
  m.home.controlled = d;
  return { m, c, d };
}
{
  // X and the approach correction never move the player faster than he can run.
  let maxStep = 0;
  for (const gap of [60, 100, 150]) {
    const { m, d } = defend(gap);
    const input = createInput();
    input.moveX = 1;
    input.sprint = true;
    input.passPressed = true;
    input.pass = true;
    for (let i = 0; i < 90; i++) {
      const x0 = d.x, y0 = d.y;
      step(m, input);
      maxStep = Math.max(maxStep, Math.hypot(d.x - x0, d.y - y0) / FIXED_DT);
    }
  }
  assert(maxStep < 400, `defensive assistance never teleports the player (max ${maxStep | 0} u/s)`);
}
{
  // Running at the carrier with the stick: the run is bent a little toward him, but the stick still decides.
  const { m, d, c } = defend(160);
  const input = createInput();
  input.moveX = 1;
  input.moveY = 0;
  let dirY = 0;
  for (let i = 0; i < 30; i++) {
    step(m, input);
    dirY += d.vy / (d.speed || 1) / 30;
  }
  assert(dirY < -0.05 && dirY > -0.6, `approach assistance bends the run toward the carrier slightly (dir y ${dirY.toFixed(2)})`);
  const { m: m2, d: d2 } = defend(160);
  const in2 = createInput();
  in2.moveY = 1;
  step(m2, in2, 30);
  assert(d2.vy > 150 && Math.abs(d2.vx) < 30, 'running away from the carrier is never corrected toward him');
  void c;
}
{
  let won = 0;
  for (let i = 0; i < 60; i++) {
    const { m, c } = defend(24);
    const d = m.home.players[2];
    d.y = CY;
    const input = createInput();
    input.passPressed = true;
    step(m, input, 1);
    if (m.ball.owner !== c) won++;
  }
  assert(won > 12 && won < 55, `assisted tackles are not automatic (${won}/60 won)`);
}

/* ------------------------------ Levels and controls ------------------------------ */

{
  const medium = { ...E.ASSIST };
  assert(medium.level === 'medium' && medium.pass === 0.55 && medium.shot === 0.35 && medium.defense === 0.45, 'assistance defaults to MEDIUM (0.55 / 0.35 / 0.45)');
  E.setAssistLevel('high');
  const high = { ...E.ASSIST };
  E.setAssistLevel('low');
  const low = { ...E.ASSIST };
  E.setAssistLevel('medium');
  assert(low.pass < medium.pass && medium.pass < high.pass && low.shot < high.shot && low.defense < high.defense, 'LOW < MEDIUM < HIGH');
}
{
  const { m, p } = carrier();
  const f = m.home.players[4];
  f.x = 960; f.y = CY - 100; f.vx = 220;
  const input = createInput();
  input.throughPressed = true;
  input.sprint = true;
  step(m, input, 1);
  assert(m.ball.through && m.ball.passTarget === f && m.ball.passTargetX > f.x + 60, 'T is still a through ball into the run (with R held)');
  void p;
}

/* --------------------------- Depth runs and through-ball weight --------------------------- */

{
  let started = 0;
  let gainedOk = 0;
  let swarmed = 0;
  for (let s = 0; s < 12; s++) {
    const m = liveMatch(E);
    const p = m.home.players[2];
    p.x = 640; p.y = CY + ((s % 3) - 1) * 80; p.vx = p.vy = 0; p.facing = 0;
    const mates = m.home.players.filter(t => t !== p && !t.isGK);
    for (const t of mates) { t.vx = t.vy = 0; t.runTimer = 0; t.runCd = 0; }
    m.home.players[1].x = 430; m.home.players[1].y = CY + 30;
    m.home.players[3].x = 700; m.home.players[3].y = CY + 220;
    m.home.players[4].x = 860; m.home.players[4].y = CY - 40;
    for (const o of m.away.players) if (!o.isGK) { o.x = 1180; o.y = 140 + o.index * 150; o.vx = o.vy = 0; }
    m.gainPossession(p);
    m.home.controlled = p;
    m.ball.ownerLock = 0;
    const startX = new Map(mates.map(t => [t, t.x]));
    const input = createInput();
    input.moveX = 1;
    let ran = false;
    let maxAtOnce = 0;
    let gain = 0;
    for (let i = 0; i < Math.round(2 / FIXED_DT); i++) {
      step(m, input);
      if (m.ball.owner !== p) break;
      let now = 0;
      for (const t of mates) {
        if (t.intent === 'run') { ran = true; now++; }
        gain = Math.max(gain, (t.x - startX.get(t)) * m.home.dir);
      }
      maxAtOnce = Math.max(maxAtOnce, now);
    }
    if (ran) started++;
    if (gain > 110) gainedOk++;
    if (maxAtOnce > 1) swarmed++;
  }
  assert(started >= 10, `a teammate makes a depth run while you carry the ball forward (${started}/12)`);
  assert(gainedOk >= 9, `the run actually gains ground in behind (${gainedOk}/12 gained more than 110 u)`);
  assert(swarmed <= 2, `the whole team does not sprint in behind together (${swarmed}/12 had two runners at once)`);
}
{
  // A sprinting runner: the ball arrives in his stride, not as a shot and not dead.
  let got = 0;
  let paced = 0;
  let leadOk = 0;
  for (let s = 0; s < 10; s++) {
    const m = liveMatch(E);
    const p = m.home.players[2];
    p.x = 560; p.y = CY; p.vx = p.vy = 0;
    const f = m.home.players[4];
    f.x = 820 + (s % 3) * 20; f.y = CY + ((s % 5) - 2) * 30; f.vx = 210; f.vy = 0; f.intent = 'run'; f.runTimer = 2;
    for (const t of m.home.players) if (t !== p && t !== f && !t.isGK) { t.x = 300; t.y = 160 + t.index * 140; }
    for (const o of m.away.players) if (!o.isGK) { o.x = 1320; o.y = 100 + o.index * 180; }
    m.gainPossession(p);
    m.home.controlled = p;
    m.ball.ownerLock = 0;
    m.attachBall(FIXED_DT);
    const input = createInput();
    input.throughPressed = true;
    step(m, input, 1);
    const b = m.ball;
    const lead = (b.passTargetX - f.x) * m.home.dir;
    if (b.through && b.passTarget === f && lead > 80 && lead < 340) leadOk++;
    let touchSpeed = 0;
    let received = false;
    for (let i = 0; i < Math.round(2.6 / FIXED_DT); i++) {
      const before = b.speed;
      step(m, input, 1);
      if (!received && b.owner === f) { touchSpeed = before; received = true; break; }
      if (m.state !== 'live') break;
    }
    if (received) got++;
    if (received && touchSpeed > 70 && touchSpeed < 340) paced++;
  }
  assert(leadOk >= 8, `a through ball to a runner is played into his path (${leadOk}/10)`);
  assert(got >= 7, `the runner reaches a weighted through ball (${got}/10)`);
  assert(paced >= 6, `the ball arrives at a pace he can take in stride, not a shot (${paced}/10, speed 70-340)`);
}
{
  // A defender standing in the channel: the ball is played into the gap, not through him.
  const m = liveMatch(E);
  const p = m.home.players[2];
  p.x = 700; p.y = CY; p.vx = p.vy = 0;
  const f = m.home.players[4];
  f.x = 900; f.y = CY; f.vx = 180; f.vy = 0; f.intent = 'run'; f.runTimer = 2; f.tx = 1200; f.ty = CY;
  for (const t of m.home.players) if (t !== p && t !== f && !t.isGK) { t.x = 280; t.y = 200; }
  const blocker = m.away.players[1];
  for (const o of m.away.players) if (!o.isGK) { o.x = 1400; o.y = 80 + o.index * 160; }
  blocker.x = 1040; blocker.y = CY;
  m.gainPossession(p);
  m.home.controlled = p;
  m.ball.ownerLock = 0;
  m.attachBall(FIXED_DT);
  const input = createInput();
  input.throughPressed = true;
  step(m, input, 1);
  const spot = m.ball.passTargetX;
  assert(m.ball.through && m.ball.passTarget === f && spot < blocker.x - 8, `the through ball stops short of a defender in the channel (spot ${spot | 0}, defender ${blocker.x | 0})`);
}
{
  // The through ball is allowed to run past the runner: he does not trap it in the first instant.
  const m = liveMatch(E);
  const p = m.home.players[2];
  p.x = 500; p.y = CY;
  const f = m.home.players[4];
  f.x = 760; f.y = CY; f.vx = 200; f.vy = 0; f.intent = 'run'; f.runTimer = 2; f.tx = 1100; f.ty = CY;
  for (const t of m.home.players) if (t !== p && t !== f && !t.isGK) { t.x = 250; t.y = 200; }
  for (const o of m.away.players) if (!o.isGK) { o.x = 1400; o.y = 80; }
  m.gainPossession(p);
  m.home.controlled = p;
  m.ball.ownerLock = 0;
  m.attachBall(FIXED_DT);
  const input = createInput();
  input.throughPressed = true;
  step(m, input, 1);
  const lead = m.ball.passTargetX - f.x;
  let early = false;
  for (let i = 0; i < Math.round(0.25 / FIXED_DT); i++) {
    step(m, input, 1);
    if (m.ball.owner === f && m.ball.kickAge < 0.2 && distSafe(f, m.ball) < 40 && lead > 100) early = true;
  }
  assert(m.ball.through && lead > 80, `the through ball is played ahead of the runner (${lead | 0})`);
  assert(!early, 'the runner does not kill the through ball before it reaches the space');
  let got = m.ball.owner === f;
  for (let i = 0; i < Math.round(2.4 / FIXED_DT) && !got; i++) {
    step(m, input, 1);
    got = m.ball.owner === f;
  }
  assert(got, 'the runner still takes the through ball when he arrives on it');
}
{
  // X presses, C sends a second teammate. Together they both close on the carrier. Nobody teleports.
  const m = liveMatch(E);
  const c = m.away.players[3];
  for (const o of m.away.players) if (!o.isGK && o !== c) { o.x = 1300; o.y = 80 + o.index * 140; }
  c.x = 780; c.y = CY; c.vx = c.vy = 0;
  m.gainPossession(c);
  m.ball.ownerLock = 0;
  const you = m.home.players[1];
  const mate = m.home.players[2];
  you.x = 620; you.y = CY + 70;
  mate.x = 640; mate.y = CY - 160;
  m.home.players[3].x = 200; m.home.players[3].y = 80;
  m.home.players[4].x = 220; m.home.players[4].y = 800;
  m.home.controlled = you;
  const input = createInput();
  input.pass = true;
  input.shoot = true;
  const d0 = Math.hypot(you.x - c.x, you.y - c.y);
  const m0 = Math.hypot(mate.x - c.x, mate.y - c.y);
  let bestYou = d0;
  let bestMate = m0;
  let helped = false;
  let maxV = 0;
  for (let i = 0; i < Math.round(0.9 / FIXED_DT); i++) {
    const x0 = mate.x, y0 = mate.y;
    step(m, input, 1);
    maxV = Math.max(maxV, Math.hypot(mate.x - x0, mate.y - y0) / FIXED_DT);
    bestYou = Math.min(bestYou, Math.hypot(you.x - c.x, you.y - c.y));
    bestMate = Math.min(bestMate, Math.hypot(mate.x - c.x, mate.y - c.y));
    if (m.human.secondPresser === mate) helped = true;
  }
  assert(bestYou < d0 - 40, `holding X closes you on the carrier (${d0 | 0} -> ${bestYou | 0})`);
  assert(helped && bestMate < m0 - 30, `holding C sends a second player to press (${m0 | 0} -> ${bestMate | 0})`);
  assert(maxV < 340, `the second presser runs, he is not teleported (${maxV | 0} u/s)`);
}
function distSafe(p, b) {
  return Math.hypot(p.x - b.x, p.y - b.y);
}
