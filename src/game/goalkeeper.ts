import { passTo, throwIn } from './actions';
import { BALL_R, BOX_DEPTH, BOX_HALF, CONTROL_DIST, CX, CY, GOAL_HALF, GRAVITY, PLAYER_R } from './constants';
import { clamp, damp, dist, distToSegment, gauss, rand } from './math';
import type { Match } from './match';
import type { Player } from './player';
import type { KeeperProfile } from './profiles';

export type KeeperState = 'set' | 'react' | 'dive' | 'down' | 'rush';

/**
 * Goalkeeper brain. The keeper never reads the true ball destination: he perceives the ball with lag,
 * reacts after a delay, commits to a noisy prediction, and his dive has finite speed and reach.
 */
export class KeeperBrain {
  state: KeeperState = 'set';
  timer = 0;
  seenShot = -1;
  perX = CX;
  perY = CY;
  diveVX = 0;
  diveVY = 0;
  diveSide = 0;
  diveHigh = false;
  noiseY = 0;
  noiseTimer = 0;
  distributeTimer = 0;
  penaltyGuess = 0;
  penaltyMode = false;

  reset() {
    this.state = 'set';
    this.timer = 0;
    this.seenShot = -1;
    this.diveVX = this.diveVY = 0;
    this.diveSide = 0;
    this.penaltyMode = false;
  }
}

export function keeperProfile(k: Player): KeeperProfile {
  return k.team.profile.keeper;
}

export function inOwnBox(k: Player, x: number, y: number) {
  const lx = Math.abs(x - k.team.ownGoalX);
  return lx <= BOX_DEPTH && Math.abs(y - CY) <= BOX_HALF;
}

export function updateKeeper(k: Player, m: Match, dt: number) {
  const g = k.gk!;
  const prof = keeperProfile(k);
  const b = m.ball;
  const team = k.team;
  const lineX = team.ownGoalX;
  const inDir = team.dir;

  g.perX = damp(g.perX, b.x, prof.perception, dt);
  g.perY = damp(g.perY, b.y, prof.perception, dt);

  if (b.owner === k) {
    keeperWithBall(k, m, dt);
    return;
  }

  if (g.state === 'dive') {
    g.timer -= dt;
    k.vx = g.diveVX;
    k.vy = g.diveVY;
    k.x += g.diveVX * dt;
    k.y += g.diveVY * dt;
    const f = Math.exp(-2.6 * dt);
    g.diveVX *= f;
    g.diveVY *= f;
    if (g.timer <= 0) {
      g.state = 'down';
      g.timer = 0.62 - prof.handling * 0.2;
    }
    return;
  }
  if (g.state === 'down') {
    g.timer -= dt;
    k.vx = k.vy = 0;
    if (g.timer <= 0) g.state = 'set';
    return;
  }

  // Shot detection: only once per shot, and only if it is travelling toward this goal.
  if (b.free && b.kind === 'shot' && b.kicker && b.kicker.team !== team && b.shotId !== g.seenShot && (b.vx * -inDir) > 0) {
    g.seenShot = b.shotId;
    g.state = 'react';
    let r = prof.reaction + (Math.random() * 2 - 1) * prof.reactionVar + Math.min(1, k.speed / 260) * 0.07;
    if (isScreened(k, m)) r += 0.07;
    if (g.penaltyMode) r = 0.05;
    g.timer = Math.max(0.05, r);
  }

  if (g.state === 'react') {
    g.timer -= dt;
    if (g.timer <= 0) commitToShot(k, m, prof);
    else {
      // Still drifting with the old read while reacting.
      k.steerTo(k.x, clamp(g.perY, CY - GOAL_HALF, CY + GOAL_HALF), 0.6, false, 20);
    }
    return;
  }

  if (g.penaltyMode) {
    k.steerTo(lineX + inDir * 6, CY, 0.4, false, 10);
    return;
  }

  // Rush out for loose balls he can reach first inside or near his box.
  if (b.free && b.z < 40 && inOwnBox(k, b.x, b.y) && b.kind !== 'shot') {
    const kt = timeTo(k, b.predictX(0.35), b.predictY(0.35));
    let oppBest = 9;
    for (const o of team.opp.players) {
      if (o.isGK) continue;
      oppBest = Math.min(oppBest, timeTo(o, b.predictX(0.35), b.predictY(0.35)));
    }
    if (kt < oppBest + 0.1 || b.speed < 60 && kt < 0.8) {
      g.state = 'rush';
      k.steerTo(b.predictX(0.25), b.predictY(0.25), 1, true, 8);
      return;
    }
  }
  g.state = 'set';

  // 1v1: an opponent carrying in the box with no defender between him and goal -> narrow the angle.
  const c = b.owner;
  if (c && c.team !== team && inOwnBox(k, c.x, c.y)) {
    const d = dist(c.x, c.y, lineX, CY);
    let covered = false;
    for (const t of team.players) {
      if (t === k) continue;
      if (distToSegment(t.x, t.y, c.x, c.y, lineX, CY) < 22 && dist(t.x, t.y, lineX, CY) < d) covered = true;
    }
    if (!covered && d < 200) {
      const ax = lineX + ((c.x - lineX) / d) * Math.min(d - 40, 95);
      const ay = CY + ((c.y - CY) / d) * Math.min(d - 40, 95);
      k.steerTo(ax, ay, 1, d < 130, 10);
      k.faceTowards(c.x, c.y);
      return;
    }
  }

  // Positioning on the ball-goal bisector, using the lagging perceived ball position.
  g.noiseTimer -= dt;
  if (g.noiseTimer <= 0) {
    g.noiseTimer = rand(0.8, 1.4);
    g.noiseY = gauss() * prof.positioning;
  }
  const px = g.perX;
  const py = g.perY;
  const dBall = dist(px, py, lineX, CY);
  const depth = dBall > 700 ? 70 : clamp(dBall * 0.11, 10, 48);
  const nx = (px - lineX) / (dBall || 1);
  const ny = (py - CY) / (dBall || 1);
  let tx = lineX + nx * depth;
  let ty = CY + ny * depth * 1.15 + g.noiseY;
  tx = inDir > 0 ? Math.max(lineX + 6, tx) : Math.min(lineX - 6, tx);
  ty = clamp(ty, CY - GOAL_HALF + 6, CY + GOAL_HALF - 6);
  k.steerTo(tx, ty, 1, false, 18);
  if (dist(k.x, k.y, tx, ty) < 6) k.faceTowards(px, py);
}

function timeTo(p: Player, x: number, y: number) {
  return Math.max(0, dist(p.x, p.y, x, y) - CONTROL_DIST) / (p.maxSpeed(false) * 1.25 + 1);
}

function isScreened(k: Player, m: Match) {
  const b = m.ball;
  for (const team of m.teams) {
    for (const p of team.players) {
      if (p === k || p === b.kicker) continue;
      if (distToSegment(p.x, p.y, b.x, b.y, k.x, k.y) < 16 && dist(p.x, p.y, k.x, k.y) > 30) return true;
    }
  }
  return false;
}

function commitToShot(k: Player, m: Match, prof: KeeperProfile) {
  const g = k.gk!;
  const b = m.ball;
  g.state = 'set';
  if (Math.abs(b.vx) < 1) return;
  const t = (k.x - b.x) / b.vx;
  if (t <= 0.01) return;
  const speed = Math.hypot(b.vx, b.vy, b.vz);
  // Linear read of the trajectory plus a speed-dependent error: curl and late dips fool him.
  let py = b.y + b.vy * t + gauss() * prof.readError * (0.5 + speed / 1200);
  let pz = Math.max(0, b.z + b.vz * t - 0.5 * GRAVITY * t * t) + gauss() * 8;
  if (g.penaltyMode) {
    g.penaltyMode = false;
    if (Math.random() > 0.35 && g.penaltyGuess !== 0) {
      py = CY + g.penaltyGuess * rand(30, 62);
      pz = rand(5, 40);
    }
  }
  if (Math.abs(py - CY) > GOAL_HALF + 26) return;
  const lateral = py - k.y;
  if (Math.abs(lateral) < 20 && pz < 58) {
    k.steerTo(k.x, py, 1, false, 6);
    return;
  }
  const side = Math.sign(lateral);
  const needed = Math.abs(lateral);
  const v = prof.diveSpeed * clamp(needed / 70, 0.65, 1.15);
  g.state = 'dive';
  g.timer = 0.48;
  g.diveVY = side * v;
  g.diveVX = (b.x - k.x) > 0 ? 35 : -35;
  g.diveSide = side;
  g.diveHigh = pz > 36;
  k.facing = Math.atan2(b.y - k.y, b.x - k.x);
  m.sfx('dive');
}

/** Keeper body/hands vs. ball. Returns true when he touched the ball. */
export function keeperContact(k: Player, m: Match) {
  const g = k.gk!;
  const b = m.ball;
  if (!b.free || b.kickAge < 0.03 && b.kicker === k) return false;
  if (b.kicker === k && b.kickAge < 0.4) return false;
  const prof = keeperProfile(k);
  let hx = k.x;
  let hy = k.y;
  let radius = PLAYER_R + BALL_R + 6;
  let maxZ = 72;
  if (g.state === 'dive') {
    hy = k.y + g.diveSide * 16;
    radius = PLAYER_R + BALL_R + 12;
    maxZ = g.diveHigh ? 64 : 40;
  } else if (g.state === 'down') {
    radius = PLAYER_R + BALL_R + 4;
    maxZ = 16;
  }
  const d = dist(hx, hy, b.x, b.y);
  if (d > radius || b.z > maxZ) return false;

  const speed = b.speed;
  const fromTeammate = b.lastTouch && b.lastTouch.team === k.team && (b.kind === 'pass' || b.kind === 'lob' || b.kind === 'throw');
  const canHandle = inOwnBox(k, b.x, b.y) && !fromTeammate;
  if (!canHandle) {
    if (speed < 420 && b.z < 25) {
      m.gainPossession(k);
      return true;
    }
  } else if (speed < 140 && b.z < 10 && g.state !== 'dive') {
    m.keeperCatch(k);
    return true;
  }
  const isShot = b.kind === 'shot' && b.kicker !== null && b.kicker.team !== k.team;
  const quality = clamp(1 - d / radius, 0, 1);
  const catchP = canHandle
    ? prof.catchSkill * clamp(1.3 - speed / 950, 0.12, 1) * (0.45 + 0.55 * quality) * (g.state === 'dive' ? 0.65 : 1) * (b.z > 50 ? 0.7 : 1)
    : 0;
  const errP = prof.errorChance * clamp(speed / 850, 0.3, 1.4);
  const r = Math.random();
  if (isShot && !b.savedBy) {
    k.team.opp.stats.onTarget++;
    k.team.stats.saves++;
  }
  b.savedBy = k;
  if (r < errP) {
    // Fumble: the ball squirms on, slowed, and may still cross the line.
    b.vx *= 0.55;
    b.vy = b.vy * 0.55 + rand(-60, 60);
    b.vz = Math.max(0, b.vz * 0.3);
    b.lastTouch = k;
    b.kind = 'deflect';
    m.sfx('ooh');
    m.effects.showBanner('ERREUR !', 'Le gardien relâche', '#f97316', 1.2);
    return true;
  }
  if (r < errP + catchP) {
    m.keeperCatch(k);
    return true;
  }
  // Parry: good handling pushes wide, poor handling leaves rebounds in front of goal.
  const inDir = k.team.dir;
  const sideRef = Math.sign(b.y - k.y) || g.diveSide || (Math.random() < 0.5 ? -1 : 1);
  const wide = Math.random() < prof.handling ? rand(0.9, 1.6) : rand(0.1, 0.6);
  let nx = inDir * rand(0.35, 1);
  let ny = sideRef * wide;
  // Fingertip saves on strong shots are often tipped round the post / over the bar.
  if (quality < 0.35 && speed > 600 && Math.random() < 0.5) {
    nx = -inDir * rand(0.05, 0.3);
    ny = sideRef * rand(0.6, 1.2);
  }
  const nl = Math.hypot(nx, ny);
  const ns = speed * rand(0.28, 0.5) + 70;
  b.vx = (nx / nl) * ns;
  b.vy = (ny / nl) * ns;
  b.vz = rand(40, 200);
  b.lastTouch = k;
  b.kind = 'parry';
  b.kicker = k;
  b.kickAge = 0;
  b.passTarget = null;
  m.sfx('parry');
  m.effects.sparks(b.x, b.y, b.z);
  m.effects.addShake(4);
  m.effects.showBanner('PARADE !', '', '#38bdf8', 1.1);
  return true;
}

function keeperWithBall(k: Player, m: Match, dt: number) {
  const g = k.gk!;
  const b = m.ball;
  const team = k.team;
  k.stop();
  k.facing = team.dir > 0 ? 0 : Math.PI;
  if (m.state !== 'live') return;
  g.distributeTimer -= dt;
  // Wait for teammates to offer options, but never approach the 8-second limit.
  const urgent = b.held && b.holdTime > 5.5;
  if (g.distributeTimer > 0 && !urgent) return;
  let best: Player | null = null;
  let bestScore = -1;
  for (const t of team.players) {
    if (t === k) continue;
    let nearest = 999;
    for (const o of team.opp.players) nearest = Math.min(nearest, distToSegment(o.x, o.y, k.x, k.y, t.x, t.y) * 0.7 + dist(o.x, o.y, t.x, t.y) * 0.3);
    const d = dist(k.x, k.y, t.x, t.y);
    const short = d < 420;
    const score = clamp(nearest / 110, 0, 1) * (short ? 1 : 0.7) + team.local(t.x) * 0.25 + Math.random() * 0.15;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (!best) return;
  const d = dist(k.x, k.y, best.x, best.y);
  const leadX = best.x + best.vx * 0.4;
  const leadY = best.y + best.vy * 0.4;
  if (b.held && d < 380 && bestScore > 0.55) {
    throwIn(m, k, leadX, leadY, best, false);
  } else if (d < 330 && bestScore > 0.6) {
    passTo(m, k, leadX, leadY, { target: best, error: 0.04 });
  } else {
    passTo(m, k, leadX + team.dir * 40, leadY, { target: best, lob: true, error: 0.08, kind: 'clear' });
  }
  g.distributeTimer = 0;
}
