import { ACCEL, BALL_R, CONTROL_DIST, CY, GRAVITY, GROUND_K, PASS_K, PITCH_L, PITCH_W, PLAYER_R, ROLL_DECEL } from './constants';
import { clamp, dist, gauss, rand } from './math';
import type { Match } from './match';
import type { Player } from './player';
import type { KickKind } from './types';

/**
 * Launch speed of a ground pass over d: the ball should still be travelling at `arrive` when it
 * reaches the receiver. Short passes are soft, long ones firmer, and the arrival pace grows a little
 * with distance so a long ball still reaches a teammate who has to step to it.
 */
export function groundPassSpeed(d: number, arrive = 250 + d * 0.22) {
  return clamp(arrive + d * PASS_K + (ROLL_DECEL * d) / 380, 240, 900);
}

/** Seconds for a ground pass launched at v0 to travel d (4 if it would stop short). */
export function groundTime(v0: number, d: number) {
  const r = 1 - (d * PASS_K) / v0;
  if (r <= 0.02) return 4;
  return -Math.log(r) / PASS_K;
}

/** Ground covered in `t` seconds while accelerating from `v0` up to `vmax`. */
export function distanceCovered(t: number, v0: number, vmax: number, accel = ACCEL) {
  if (t <= 0) return 0;
  const v = clamp(v0, 0, vmax);
  const a = Math.max(1, accel);
  if (v >= vmax - 1) return vmax * t;
  const tAcc = (vmax - v) / a;
  if (t <= tAcc) return v * t + 0.5 * a * t * t;
  const dAcc = v * tAcc + 0.5 * a * tAcc * tAcc;
  return dAcc + vmax * (t - tAcc);
}

/** Launch speed whose arrival pace at `d` is about `arrive`, under pass friction plus the roll drag. */
function launchForArrival(d: number, arrive: number) {
  const v = arrive + d * PASS_K + (ROLL_DECEL * d) / 400;
  // A pass into a tiny pocket near the line must be allowed to leave slowly. A normal one never hits this floor.
  return clamp(v, Math.min(70, arrive + 12), 780);
}

/**
 * Arrival pace that still dies on the pitch: past the spot the ball rolls about `va / GROUND_K` further.
 */
function cappedArrival(ax: number, ay: number, tx: number, ty: number, want: number) {
  const d = Math.hypot(tx - ax, ty - ay) || 1;
  const ux = (tx - ax) / d;
  const uy = (ty - ay) / d;
  const roomX = ux > 0.02 ? (PITCH_L - tx) / ux : ux < -0.02 ? tx / -ux : 500;
  const roomY = uy > 0.02 ? (PITCH_W - ty) / uy : uy < -0.02 ? ty / -uy : 500;
  const room = Math.max(12, Math.min(roomX, roomY) - 16);
  return clamp(Math.min(want, room * GROUND_K * 0.62), 16, 220);
}

export interface ThroughDose {
  x: number;
  y: number;
  speed: number;
  lead: number;
}

/**
 * Weight of a through ball. The spot is a short way in front of the runner and the ball is struck
 * so that, as it draws level with him, it is still rolling at roughly his pace. He runs onto it.
 * `maxLead` is the open grass in front (a defender in the channel, or the goal line, cuts it short).
 */
export function throughDose(
  ax: number, ay: number,
  rx: number, ry: number,
  dirX: number, dirY: number,
  curSpeed: number,
  pace: number,
  maxLead: number,
): ThroughDose {
  const n = Math.hypot(dirX, dirY) || 1;
  const dx = dirX / n;
  const dy = dirY / n;
  const vmax = clamp(pace, 150, 320);
  const cap = clamp(maxLead, 48, 170);
  const moving = Math.max(0, curSpeed);
  // A short pocket in front of the run. Anything much further has to be struck so hard, from a
  // passer behind the runner, that it arrives like a shot — or the runner gets there and waits.
  const horizon = moving > 140 ? 0.46 : 0.36;
  const lead = clamp(distanceCovered(horizon, moving, vmax, ACCEL * 0.75), 52, cap);
  const x = clamp(rx + dx * lead, 50, PITCH_L - 50);
  const y = clamp(ry + dy * lead, 36, PITCH_W - 36);
  const d = Math.hypot(x - ax, y - ay) || 1;
  // Friction drops speed linearly with distance, so the pace as the ball draws level with the
  // runner is `arrive + PASS_K * lead`. That is the pace he takes it at.
  const wantAtFeet = clamp(125 + moving * 0.18, 120, 195);
  const arrive = clamp(wantAtFeet - PASS_K * lead, 36, 150);
  const speed = launchForArrival(d, cappedArrival(ax, ay, x, y, arrive));
  return { x, y, speed, lead };
}

/**
 * Open grass in front of (x, y) along a unit direction, cut by the goal line and by any opponent
 * standing in the channel. The through ball is played into this pocket, not through a defender.
 */
export function channelSpace(team: { opp: { players: { isGK: boolean; x: number; y: number }[] }; dir: number }, x: number, y: number, dirX: number, dirY: number) {
  const n = Math.hypot(dirX, dirY) || 1;
  const dx = dirX / n;
  const dy = dirY / n;
  const goalRoom = dx * team.dir > 0.2 ? (team.dir > 0 ? PITCH_L - 90 - x : x - 90) : 260;
  let space = clamp(goalRoom, 50, 340);
  for (const o of team.opp.players) {
    if (o.isGK) continue;
    const along = (o.x - x) * dx + (o.y - y) * dy;
    if (along < 24) continue;
    const lat = Math.abs((o.x - x) * -dy + (o.y - y) * dx);
    if (lat < 70) space = Math.min(space, along - 30);
  }
  return clamp(space, 50, 340);
}

export interface PassOptions {
  lob?: boolean;
  target?: Player | null;
  error?: number;
  speed?: number;
  kind?: KickKind;
  height?: number;
  through?: boolean;
}

export function passTo(m: Match, p: Player, tx: number, ty: number, o: PassOptions = {}) {
  const b = m.ball;
  tx = clamp(tx, -20, PITCH_L + 20);
  ty = clamp(ty, -10, PITCH_W + 10);
  const dx = tx - b.x;
  const dy = ty - b.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  const ang = Math.atan2(dy, dx) + gauss() * (o.error ?? 0);
  let vx: number;
  let vy: number;
  let vz = 0;
  let kind: KickKind = o.kind ?? 'pass';
  if (o.lob) {
    const T = clamp(d / 430, 0.6, 1.45) * (o.height ?? 1);
    const vh = (d * 0.8) / (T * 0.93) * (1 + gauss() * (o.error ?? 0) * 0.6);
    vx = Math.cos(ang) * vh;
    vy = Math.sin(ang) * vh;
    vz = 0.5 * GRAVITY * T;
    if (kind === 'pass') kind = 'lob';
  } else {
    const v0 = (o.speed ?? groundPassSpeed(d)) * (1 + gauss() * (o.error ?? 0) * 0.5);
    vx = Math.cos(ang) * v0;
    vy = Math.sin(ang) * v0;
  }
  b.kick(p, vx, vy, vz, kind, o.target ?? null);
  b.passTargetX = tx;
  b.passTargetY = ty;
  // A ground pass keeps its pace up to its destination (plus a little slack), then slows like a loose ball.
  if (!o.lob) b.rollLeft = o.through ? d : d + 50;
  b.through = o.through ?? false;
  p.kickCd = 0.24;
  p.kickAnim = 0.25;
  p.faceTowards(tx, ty);
  m.onKick(p, kind, o.target ?? null);
}

export function throwIn(m: Match, p: Player, tx: number, ty: number, target: Player | null, long: boolean) {
  const b = m.ball;
  const dx = tx - b.x;
  const dy = ty - b.y;
  const d = clamp(Math.hypot(dx, dy), 40, long ? 420 : 300);
  const ang = Math.atan2(dy, dx) + gauss() * 0.04;
  const T = clamp(d / (long ? 470 : 400), 0.32, 0.95);
  const vh = d / (T * 0.95);
  b.z = 26;
  const vz = (0.5 * GRAVITY * T * T - 26) / T;
  b.kick(p, Math.cos(ang) * vh * 0.82, Math.sin(ang) * vh * 0.82, vz, 'throw', target);
  b.passTargetX = b.x + Math.cos(ang) * d;
  b.passTargetY = b.y + Math.sin(ang) * d;
  p.kickCd = 0.35;
  p.kickAnim = 0.3;
  m.onKick(p, 'throw', target);
}

export interface ShotOptions {
  finesse?: boolean;
  error?: number;
  aimZ?: number;
  header?: boolean;
}

/** Shoots at a point on the opponent goal line; the result carries a realistic error cone. */
export function shoot(m: Match, p: Player, aimY: number, power: number, o: ShotOptions = {}) {
  const b = m.ball;
  const team = p.team;
  const gx = team.oppGoalX;
  power = clamp(power, 0, 1);
  const pressure = m.pressureOn(p);
  const baseErr = o.error ?? 16;
  const overpower = Math.max(0, power - 0.82);
  const errMul = (1 + pressure * 0.7)
    * (1 + overpower * 3.2)
    * (o.finesse ? 0.6 : 1)
    * (1 + (1 - p.stamina) * 0.45)
    * (1.55 - p.shotStat * 0.6)
    * (1 + Math.min(1, p.speed / 520) * 0.3)
    * (o.header ? 1.5 : 1);
  const ty = aimY + gauss() * baseErr * errMul;
  let tz = o.aimZ ?? (o.finesse ? rand(5, 30) : 6 + power * 30);
  tz += gauss() * (3 + overpower * 95 + pressure * 6);
  tz = Math.max(0, tz);

  let speed = o.header ? 430 + power * 260 : o.finesse ? 520 + power * 300 : 560 + power * 640;
  speed *= 0.9 + 0.1 * p.stamina;
  const dx = gx - b.x;
  let dy = ty - b.y;
  const d = Math.max(30, Math.hypot(dx, dy));
  const T = d / (speed * 0.97);
  let curlSide = 0;
  if (o.finesse) {
    // Curl toward the middle of the goal; pre-compensate so the ball bends back onto the aimed spot.
    curlSide = Math.sign(CY - ty) || 1;
    dy -= curlSide * 0.4 * 230 * T * T;
  }
  const len = Math.hypot(dx, dy);
  const vx = (dx / len) * speed;
  const vy = (dy / len) * speed;
  const vz = Math.max(0, (tz - b.z + 0.5 * GRAVITY * T * T) / T);
  b.kick(p, vx, vy, vz, 'shot');
  if (curlSide !== 0) b.curve = curlSide * Math.sign(vx) * 230;
  b.shotPower = power;
  p.kickCd = 0.3;
  p.kickAnim = 0.32;
  p.faceTowards(gx, ty);
  team.stats.shots++;
  m.onShot(p, power);
}

/** Long, lofted clearance away from danger toward a flank. */
export function clearBall(m: Match, p: Player) {
  const team = p.team;
  const tx = p.x + team.dir * rand(380, 560);
  const ty = p.y < CY ? rand(70, 260) : rand(PITCH_W - 260, PITCH_W - 70);
  passTo(m, p, tx, ty, { lob: true, error: 0.12, kind: 'clear', height: 1.1 });
}

/** Push the ball ahead and burst after it (dash dribble). */
export function knockOn(m: Match, p: Player) {
  const b = m.ball;
  if (b.owner !== p || p.stamina < 0.12) return false;
  const fx = Math.cos(p.facing);
  const fy = Math.sin(p.facing);
  b.kick(p, p.vx + fx * 175, p.vy + fy * 175, 0, 'dribble');
  b.x = p.x + fx * (PLAYER_R + BALL_R + 3);
  b.y = p.y + fy * (PLAYER_R + BALL_R + 3);
  p.kickCd = 0.12;
  p.stamina = Math.max(0, p.stamina - 0.07);
  p.sprint = true;
  m.effects.dust(p.x, p.y, 4, 0.8);
  m.sfx('touch');
  return true;
}

/** Standing tackle / poke. Success depends on reach, angle, timing and the carrier. */
export function tackle(m: Match, t: Player, skill: number) {
  if (t.tackleCd > 0 || t.busy) return;
  t.tackleCd = 0.55;
  t.kickAnim = 0.25;
  const b = m.ball;
  const c = b.owner;
  const d = dist(t.x, t.y, b.x, b.y);
  if (!c) {
    if (d < CONTROL_DIST + 10 && b.z < 20) {
      const a = t.facing;
      b.kick(t, Math.cos(a) * 260, Math.sin(a) * 260, 0, 'deflect');
      m.sfx('tackle');
    }
    return;
  }
  if (c.team === t.team || b.held) return;
  const reach = PLAYER_R + BALL_R + 14;
  t.faceTowards(b.x, b.y);
  if (d > reach || b.ownerLock > 0) {
    t.stun = 0.22;
    const bodyD = dist(t.x, t.y, c.x, c.y);
    if (bodyD < PLAYER_R * 2 + 6 && Math.random() < m.foulChance(t, c, 0.5)) m.callFoul(t, c);
    return;
  }
  // Angle: tackling from in front of the ball is much easier than from behind the carrier.
  const toBallX = b.x - c.x;
  const toBallY = b.y - c.y;
  const fromX = t.x - c.x;
  const fromY = t.y - c.y;
  const cos = (toBallX * fromX + toBallY * fromY) / (Math.hypot(toBallX, toBallY) * Math.hypot(fromX, fromY) + 1e-6);
  const angleF = cos > 0.3 ? 1 : cos > -0.3 ? 0.8 : 0.5;
  const exposure = c.sprint ? 1.15 : c.speed < 60 ? 0.78 : 1;
  const p = clamp(skill * angleF * exposure * (1.25 - c.dribbleStat * 0.35), 0.06, 0.88);
  if (Math.random() < p) {
    c.stun = 0.3;
    t.team.stats.tackles++;
    m.sfx('tackle');
    m.effects.dust(b.x, b.y, 6);
    if (Math.random() < 0.55) {
      m.gainPossession(t);
    } else {
      const a = Math.atan2(b.y - t.y, b.x - t.x) + rand(-0.7, 0.7);
      b.kick(t, Math.cos(a) * rand(150, 260), Math.sin(a) * rand(150, 260), rand(0, 60), 'deflect');
      t.kickCd = 0.1;
    }
  } else {
    t.stun = 0.38;
    const bodyD = dist(t.x, t.y, c.x, c.y);
    const mult = cos < -0.3 ? 1.6 : c.sprint ? 1 : 0.55;
    if (bodyD < PLAYER_R * 2 + 10 && Math.random() < m.foulChance(t, c, mult)) m.callFoul(t, c);
  }
}

export function slideTackle(m: Match, t: Player, dx: number, dy: number) {
  if (t.tackleCd > 0 || t.busy || t.stamina < 0.1) return;
  t.tackleCd = 1.1;
  t.startSlide(dx, dy);
  m.effects.dust(t.x, t.y, 6);
  m.sfx('tackle');
}

/** Per-frame slide resolution: touching the ball first wins it, hitting the player first is a foul. */
export function resolveSlide(m: Match, t: Player) {
  if (t.slide <= 0 || t.slideWon || t.slideFouled) return;
  const b = m.ball;
  const fx = t.x + t.slideDx * 9;
  const fy = t.y + t.slideDy * 9;
  const c = b.owner;
  if (!b.held && b.z < 18 && dist(fx, fy, b.x, b.y) < PLAYER_R + BALL_R + 8 && (!c || c.team !== t.team)) {
    t.slideWon = true;
    if (c) c.stun = 0.55;
    const a = Math.atan2(t.slideDy, t.slideDx) + rand(-0.4, 0.4);
    b.kick(t, Math.cos(a) * rand(180, 300), Math.sin(a) * rand(180, 300), rand(10, 60), 'deflect');
    t.kickCd = 0.15;
    t.team.stats.tackles++;
    m.effects.dust(b.x, b.y, 8, 1.2);
    m.sfx('tackle');
    return;
  }
  for (const o of t.team.opp.players) {
    if (o.isGK && !o.team.human && o === b.owner && b.held) continue;
    if (dist(t.x, t.y, o.x, o.y) < PLAYER_R * 2 + 2) {
      t.slideFouled = true;
      o.stun = 0.7;
      if (o === c || dist(o.x, o.y, b.x, b.y) < 80) {
        m.callFoul(t, o);
      }
      return;
    }
  }
}