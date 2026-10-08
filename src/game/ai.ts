import { channelSpace, clearBall, groundPassSpeed, groundTime, knockOn, passTo, shoot, slideTackle, tackle, throughDose } from './actions';
import { BALL_R, BOX_DEPTH, BOX_HALF, CONTROL_DIST, CY, GOAL_HALF, GRAVITY, PITCH_L, PITCH_W, PLAYER_H, PLAYER_R, RUN_SPEED, SPRINT_MULT } from './constants';
import { clamp, dist, distToSegment, gauss, rand, segmentT } from './math';
import type { Match } from './match';
import type { Player } from './player';
import type { Team } from './team';
import type { AttackPlan } from './types';

/* ------------------------------------------------------------------ */
/* Shared scratch objects (no per-frame allocations).                  */
/* ------------------------------------------------------------------ */

export const icpt = { t: 0, x: 0, y: 0 };
const slot = { x: 0, y: 0 };
const shotAim = { y: CY, q: 0 };
const passPick = { score: -9, target: null as Player | null, x: 0, y: 0, lob: false, cross: false };

/** Earliest time the player can reach the moving ball (writes the meeting point into `icpt`). */
export function interceptTime(p: Player, m: Match, maxT = 1.8) {
  const b = m.ball;
  const speed = p.maxSpeed(false) * (p.stamina > 0.1 ? 1.3 : 1);
  const airborne = b.z > 2 || b.vz > 0;
  for (let t = 0.05; t <= maxT; t += 0.1) {
    // Out of reach while the ball is still above head height (first flight only).
    if (airborne && b.z + b.vz * t - 0.5 * GRAVITY * t * t > PLAYER_H + 4) continue;
    const bx = b.predictX(t);
    const by = b.predictY(t);
    const d = dist(p.x, p.y, bx, by) - CONTROL_DIST;
    if (d <= speed * t) {
      icpt.t = t;
      icpt.x = bx;
      icpt.y = by;
      return t;
    }
  }
  icpt.x = clamp(b.restX(), 10, PITCH_L - 10);
  icpt.y = clamp(b.restY(), 10, PITCH_W - 10);
  icpt.t = maxT + dist(p.x, p.y, icpt.x, icpt.y) / speed;
  return icpt.t;
}

export function nearestOpponentDist(team: Team, x: number, y: number, ignoreGK = false) {
  let best = 9999;
  for (const o of team.opp.players) {
    if (ignoreGK && o.isGK) continue;
    const d = dist(o.x, o.y, x, y);
    if (d < best) best = d;
  }
  return best;
}

function nearestTeammateDist(p: Player, x: number, y: number) {
  let best = 9999;
  for (const t of p.team.players) {
    if (t === p || t.isGK) continue;
    const d = dist(t.x, t.y, x, y);
    if (d < best) best = d;
  }
  return best;
}

/** Local progress of the opponent's deepest outfield defender (as seen by `team`). */
function oppLastLine(team: Team) {
  let best = 0;
  for (const o of team.opp.players) {
    if (o.isGK) continue;
    best = Math.max(best, team.local(o.x));
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Team level                                                          */
/* ------------------------------------------------------------------ */

export function updateTeamAI(team: Team, m: Match, dt: number) {
  team.planTimer -= dt;
  team.tacticTimer -= dt;
  if (team.tacticTimer <= 0) {
    team.tacticTimer = 0.06 + team.profile.reaction * 0.55;
    assignRoles(team, m);
  }
  if (team.planTimer <= 0 && m.ball.owner && m.ball.owner.team === team) choosePlan(team, m, false);
  assignRunner(team, m);
  for (const p of team.players) {
    if (p.isGK) continue;
    if (team.human && p === team.controlled && !m.demo) continue;
    updatePlayerAI(p, team, m, dt);
  }
}

export function choosePlan(team: Team, m: Match, justWon: boolean) {
  const b = m.ball;
  let goalSide = 0;
  for (const o of team.opp.players) {
    if (o.isGK) continue;
    if (team.local(o.x) > team.local(b.x)) goalSide++;
  }
  const prev = team.plan;
  let plan: AttackPlan;
  const r = Math.random();
  if (justWon && goalSide <= 2 && team.local(b.x) > 0.25 && r < 0.55 + team.profile.vision * 0.35) {
    plan = 'counter';
  } else {
    const wideBall = Math.abs(b.y - CY) > 220;
    const wBuild = 0.38 + (team.local(b.x) < 0.35 ? 0.2 : 0);
    const wWing = 0.3 + (wideBall ? 0.2 : 0);
    const wDirect = 0.28 + (goalSide <= 3 ? 0.12 : 0);
    let x = Math.random() * (wBuild + wWing + wDirect);
    plan = (x -= wBuild) < 0 ? 'build' : (x -= wWing) < 0 ? 'wing' : 'direct';
    // Avoid repeating the exact same approach every possession.
    if (plan === prev && Math.random() < 0.45) plan = plan === 'build' ? 'wing' : plan === 'wing' ? 'direct' : 'build';
  }
  team.plan = plan;
  team.planTimer = plan === 'counter' ? rand(3.5, 5) : rand(6, 10);
}

function assignRoles(team: Team, m: Match) {
  const b = m.ball;
  const c = b.owner;
  team.presser = null;
  team.cover = null;
  team.chaser = null;
  team.interceptor = null;
  team.tracker = null;
  for (const p of team.players) p.markTarget = null;

  if (c && c.team === team) return;

  if (c && c.team !== team) {
    if (b.held) return;
    // Presser: closest outfield player, favouring those already goal-side of the carrier.
    let best: Player | null = null;
    let bestScore = 1e9;
    let second: Player | null = null;
    let secondScore = 1e9;
    for (const p of team.players) {
      if (p.isGK || p.busy) continue;
      const goalSide = team.local(p.x) < team.local(c.x) ? 0 : 70;
      const s = dist(p.x, p.y, c.x, c.y) + goalSide;
      if (s < bestScore) {
        second = best;
        secondScore = bestScore;
        best = p;
        bestScore = s;
      } else if (s < secondScore) {
        second = p;
        secondScore = s;
      }
    }
    team.presser = best;
    team.cover = second;
    // Remaining players mark the most dangerous free opponents.
    const markers: Player[] = [];
    for (const p of team.players) if (!p.isGK && p !== best && p !== second) markers.push(p);
    const targets: Player[] = [];
    for (const o of team.opp.players) if (!o.isGK && o !== c) targets.push(o);
    targets.sort((a, z) => team.local(a.x) - team.local(z.x));
    for (const o of targets) {
      let mk: Player | null = null;
      let md = 1e9;
      for (const p of markers) {
        if (p.markTarget) continue;
        const d = dist(p.x, p.y, o.x, o.y);
        if (d < md) {
          md = d;
          mk = p;
        }
      }
      if (mk) mk.markTarget = o;
    }
    return;
  }

  // Loose ball.
  if (b.passTarget && b.passTarget.team === team) return;
  let best: Player | null = null;
  let bestT = 1e9;
  for (const p of team.players) {
    if (p.isGK || p.busy) continue;
    const t = interceptTime(p, m);
    if (t < bestT) {
      bestT = t;
      best = p;
    }
  }
  if (b.passTarget && b.passTarget.team !== team && b.kind !== 'shot') {
    // Read the pass: only good anticipation lets a player jump the lane.
    if (best && Math.random() < 0.14 + team.profile.anticipation * 0.45) team.interceptor = best;
    if (b.through) {
      // The nearest goal-side defender follows the runner.
      const r = b.passTarget;
      let td = 1e9;
      for (const p of team.players) {
        if (p.isGK || p.busy || p === team.interceptor) continue;
        const d = dist(p.x, p.y, r.x, r.y) + (team.local(p.x) > team.local(r.x) ? 90 : 0);
        if (d < td) {
          td = d;
          team.tracker = p;
        }
      }
    }
  } else {
    team.chaser = best;
  }
}

/* ------------------------------------------------------------------ */
/* Player level                                                        */
/* ------------------------------------------------------------------ */

function updatePlayerAI(p: Player, team: Team, m: Match, dt: number) {
  const b = m.ball;
  if (p.busy) {
    p.stop();
    return;
  }
  if (m.state !== 'live') {
    restartIdle(p, m);
    return;
  }
  if (b.owner === p) {
    carrierAI(p, team, m, dt);
    return;
  }
  if (b.free && b.passTarget === p) {
    p.intent = 'receive';
    interceptTime(p, m);
    const tgtX = b.kind === 'cross' ? b.passTargetX : icpt.x;
    const tgtY = b.kind === 'cross' ? b.passTargetY : icpt.y;
    p.steerTo(tgtX, tgtY, 1, dist(p.x, p.y, tgtX, tgtY) > 70, 10);
    return;
  }
  if (b.free && b.kind === 'shot' && b.kicker && b.kicker.team === team && b.kicker !== p && team.local(p.x) > 0.55 && p.role !== 'DEF') {
    // Follow the shot in for a rebound, toward the far side of the goal mouth.
    p.intent = 'run';
    const far = b.vy * team.dir >= 0 ? 1 : -1;
    p.steerTo(team.oppGoalX - team.dir * (p.role === 'FWD' ? 70 : 120), CY + far * (p.role === 'FWD' ? 30 : -50), 1, true, 10);
    return;
  }
  if (b.free && b.through && b.passTarget && b.passTarget.team !== team && (team.tracker === p || team.interceptor === p)) {
    // A through ball is not read instantly: first follow the run, then turn and race for the ball.
    const read = 0.36 + (1 - team.profile.anticipation) * 0.4;
    if (b.kickAge < read) {
      trackRun(p, b.passTarget, team);
      return;
    }
    p.intent = 'intercept';
    interceptTime(p, m);
    p.steerTo(icpt.x, icpt.y, 1, true, 6);
    return;
  }
  if (b.free && (team.chaser === p || team.interceptor === p)) {
    p.intent = team.chaser === p ? 'chase' : 'intercept';
    interceptTime(p, m);
    p.steerTo(icpt.x, icpt.y, 1, true, 6);
    return;
  }

  const owner = b.owner;
  const attacking = owner ? owner.team === team : m.lastPossession === team && b.passTarget?.team === team;
  if (owner && owner.team !== team) {
    if (b.held) {
      shapePosition(p, team, m.ball.x, m.ball.y, false);
      p.intent = 'hold';
      p.steerTo(slot.x, slot.y, 0.8, false);
      return;
    }
    if (p === team.presser) pressAI(p, owner, team, m, dt);
    else if (p === team.cover) coverAI(p, owner, team, m);
    else markAI(p, team, m, dt);
    return;
  }
  if (attacking || (b.free && m.lastPossession === team)) supportAI(p, team, m, dt);
  else {
    shapePosition(p, team, m.ball.x, m.ball.y, false);
    p.intent = 'hold';
    p.steerTo(slot.x + p.noiseX, slot.y + p.noiseY, 1, dist(p.x, p.y, slot.x, slot.y) > 160);
  }
}

function restartIdle(p: Player, m: Match) {
  p.intent = 'setpiece';
  if (m.state === 'taking' || m.state === 'setup') {
    p.steerTo(p.tx, p.ty, 0.9, false, 20);
    p.faceTowards(m.ball.x, m.ball.y);
  } else {
    p.stop();
  }
}

/** Base formation slot, shifted with the ball (block moves as a unit). Writes into `slot`. */
export function shapePosition(p: Player, team: Team, bx: number, by: number, attacking: boolean) {
  const lb = team.local(bx);
  const byN = by / PITCH_W;
  const ballSide = byN < 0.5 ? -1 : 1;
  let fx = 0.5;
  let fy = 0.5;
  if (attacking) {
    switch (p.role) {
      case 'DEF':
        fx = clamp(lb - 0.3, 0.14, 0.5);
        fy = 0.5 + (byN - 0.5) * 0.45;
        break;
      case 'MID':
        if (p.flank === ballSide) {
          fx = clamp(lb + 0.03, 0.2, 0.86);
          fy = p.flank < 0 ? 0.12 : 0.88;
        } else {
          fx = clamp(lb + 0.12, 0.3, 0.82);
          fy = 0.5 + p.flank * 0.24;
        }
        break;
      case 'FWD':
        fx = clamp(Math.max(lb + 0.16, oppLastLine(team) - 0.03), 0.42, 0.9);
        fy = 0.5 - (byN - 0.5) * 0.35;
        break;
      default:
        break;
    }
    if (team.plan === 'counter') fx += 0.08;
    else if (team.plan === 'build') fx -= 0.04;
  } else {
    switch (p.role) {
      case 'DEF':
        fx = clamp(lb - 0.2, 0.08, 0.36);
        fy = 0.5 + (byN - 0.5) * 0.4;
        break;
      case 'MID':
        fx = clamp(lb - 0.08, 0.14, 0.5);
        fy = 0.5 + p.flank * 0.24 + (byN - 0.5) * 0.35;
        break;
      case 'FWD':
        fx = clamp(lb + 0.02, 0.32, 0.62);
        fy = 0.5 + (byN - 0.5) * 0.3;
        break;
      default:
        break;
    }
  }
  slot.x = team.worldX(clamp(fx, 0.04, 0.95));
  slot.y = clamp(fy, 0.06, 0.94) * PITCH_W;
}

/* --------------------------- Defending ---------------------------- */

function pressAI(p: Player, c: Player, team: Team, m: Match, dt: number) {
  const prof = team.profile;
  const b = m.ball;
  // The defender acts on a read of the carrier refreshed every ~0.1-0.25 s and extrapolated in
  // between: a sharp change of direction is noticed late, so a good dribble buys a little space.
  p.readT += dt;
  if (p.readOf !== c || p.readT >= p.readEvery) {
    p.readOf = c;
    p.readT = 0;
    p.readEvery = (0.09 + prof.reaction * 0.5) * rand(0.8, 1.25);
    p.readX = c.x;
    p.readY = c.y;
    p.readVx = c.vx;
    p.readVy = c.vy;
  }
  const age = Math.min(p.readT, 0.35);
  const cx = p.readX + p.readVx * age;
  const cy = p.readY + p.readVy * age;
  const gx = team.ownGoalX;
  const toGoalX = gx - cx;
  const toGoalY = CY - cy;
  const dg = Math.hypot(toGoalX, toGoalY) || 1;
  const ux = toGoalX / dg;
  const uy = toGoalY / dg;
  const d = dist(p.x, p.y, c.x, c.y);
  const counterPress = m.time - team.lostAt < 1.5;
  const danger = team.local(c.x) < 0.42;
  const engage = counterPress || danger || d < prof.pressRange * (0.6 + prof.press * 0.6);
  p.intent = 'press';
  if (!engage) {
    // Hold the zone in front of the carrier instead of diving in.
    p.steerTo(cx + ux * 150, cy + uy * 150, 1, false);
    return;
  }
  const cSpeed = Math.hypot(p.readVx, p.readVy);
  p.duelTimer -= dt;
  if (p.duelTimer <= 0) {
    // Contain (show him away, keep a gap) or press (close down to win it). Press a carrier who is
    // slow, turned away from goal, just won the ball or is near our box.
    p.duelTimer = rand(0.35, 0.6);
    const turned = Math.cos(c.facing) * team.dir > 0.3;
    let pPress = prof.press * 0.3;
    if (cSpeed < 70) pPress += 0.3;
    if (turned) pPress += 0.3;
    if (counterPress) pPress += 0.3;
    if (danger) pPress += 0.12;
    p.duel = Math.random() < pPress ? 'press' : 'contain';
  }
  const goalSide = team.local(p.x) < team.local(c.x);
  let tx: number;
  let ty: number;
  let sprint: boolean;
  let arrive: number;
  let urgency = 1;
  if (!goalSide && d < 160) {
    // Beaten or caught upfield: race back to the goal side, alongside the carrier rather than onto him.
    tx = cx + ux * 36 + p.readVx * 0.25;
    ty = cy + uy * 36 + p.readVy * 0.25;
    sprint = p.stamina > 0.15;
    arrive = 10;
  } else if (p.duel === 'press') {
    tx = cx + ux * 24 + p.readVx * 0.15;
    ty = cy + uy * 24 + p.readVy * 0.15;
    sprint = d > 60 && p.stamina > 0.25;
    arrive = 8;
  } else {
    // Jockey: a real gap that grows with the carrier's pace, shifted to where he is heading.
    const hold = 46 + Math.min(34, cSpeed * 0.12);
    tx = cx + ux * hold + p.readVx * 0.3;
    ty = cy + uy * hold + p.readVy * 0.3;
    sprint = d > hold + 50 && p.stamina > 0.25;
    arrive = 16;
    // Side-stepping while facing the carrier is slower than running, so a lateral dribble gains a
    // yard; dropping straight back keeps full pace.
    const mx = tx - p.x;
    const my = ty - p.y;
    const ml = Math.hypot(mx, my) || 1;
    if (!sprint && Math.abs((mx * ux + my * uy) / ml) < 0.6) urgency = 0.84;
    // The carrier came onto him anyway: that is the moment of the duel.
    if (d < 34) {
      p.duel = 'press';
      p.duelTimer = rand(0.3, 0.5);
    }
  }
  p.steerTo(tx, ty, urgency, sprint, arrive);
  p.faceTowards(c.x, c.y);

  p.tackleThink -= dt;
  if (p.tackleThink > 0) return;
  p.tackleThink = 0.16;
  const db = dist(p.x, p.y, b.x, b.y);
  if (db > PLAYER_R + 20 || p.tackleCd > 0 || b.ownerLock > 0) return;
  const loose = dist(c.x, c.y, b.x, b.y) > PLAYER_R + BALL_R + 5 ? 0.28 : 0;
  let prob = 0.04 + prof.press * 0.1 + loose * 0.65 + (c.sprint ? 0.06 : 0) + (p.duel === 'press' ? 0.06 : 0);
  // Running straight into him is still a tackle. A lateral dribble that keeps a gap never gets here.
  if (db < 36) prob += 0.14;
  if (team.human) prob *= 0.45;
  if (Math.random() < prob) {
    // Going in on a stale read (the carrier just changed direction) is a mistimed tackle.
    const misread = Math.hypot(c.vx - p.readVx, c.vy - p.readVy) > 90;
    const behind = team.local(p.x) > team.local(c.x) + 0.01;
    const desperate = danger && c.sprint && Math.random() < 0.18;
    if ((behind && Math.random() < 0.35 * prof.foulRisk * 3) || desperate) slideTackle(m, p, b.x - p.x, b.y - p.y);
    else tackle(m, p, prof.tackle * (misread ? 0.55 : 1));
  }
}

function coverAI(p: Player, c: Player, team: Team, m: Match) {
  const gx = team.ownGoalX;
  const pr = team.presser ?? c;
  const toGoalX = gx - pr.x;
  const toGoalY = CY - pr.y;
  const dg = Math.hypot(toGoalX, toGoalY) || 1;
  p.intent = 'cover';
  const tx = pr.x + (toGoalX / dg) * 85;
  const ty = pr.y + (toGoalY / dg) * 85 + (CY - pr.y) * 0.15;
  p.steerTo(tx + p.noiseX * 0.5, ty + p.noiseY * 0.5, 1, dist(p.x, p.y, tx, ty) > 140);
  // Second defender steps in when the carrier has beaten the presser.
  if (team.local(c.x) < team.local(pr.x) - 0.02 && dist(p.x, p.y, c.x, c.y) < 95) {
    team.presser = p;
    team.cover = pr;
  }
  void m;
}

/** Run with an attacker, staying on his goal side. */
function trackRun(p: Player, r: Player, team: Team) {
  const dgx = team.ownGoalX - r.x;
  const dgy = CY - r.y;
  const dg = Math.hypot(dgx, dgy) || 1;
  p.intent = 'mark';
  p.steerTo(r.x + r.vx * 0.3 + (dgx / dg) * 20, r.y + r.vy * 0.3 + (dgy / dg) * 20, 1, true, 8);
}

function markAI(p: Player, team: Team, m: Match, dt: number) {
  const prof = team.profile;
  p.think -= dt;
  if (p.think <= 0) {
    p.think = prof.offBall * rand(0.8, 1.2);
    const err = (1 - prof.positioning) * 70;
    p.noiseX = gauss() * err;
    p.noiseY = gauss() * err;
  }
  const o = p.markTarget;
  const b = m.ball;
  if (!o) {
    shapePosition(p, team, m.ball.x, m.ball.y, false);
    p.intent = 'hold';
    p.steerTo(slot.x + p.noiseX, slot.y + p.noiseY, 1, false);
    return;
  }
  p.intent = 'mark';
  const gx = team.ownGoalX;
  const dgx = gx - o.x;
  const dgy = CY - o.y;
  const dg = Math.hypot(dgx, dgy) || 1;
  const danger = 1 - team.local(o.x);
  // A looser mark leaves a step for a run in behind. Better positioning closes that gap a little.
  const grip = 0.7 + prof.positioning * 0.45;
  const markDist = (danger > 0.6 ? 52 : danger > 0.4 ? 74 : 108) / grip;
  let tx = o.x + (dgx / dg) * markDist;
  let ty = o.y + (dgy / dg) * markDist;
  // Shade toward the ball to cut the passing lane, without stepping onto the attacker.
  const shade = 0.05 + prof.anticipation * 0.1;
  tx += (b.x - tx) * shade;
  ty += (b.y - ty) * shade;
  // Never be caught deeper-than-necessary when the opponent is far upfield: hold a compact line.
  const maxLocal = team.local(b.x) + 0.08;
  if (team.local(tx) > maxLocal) tx = team.worldX(maxLocal);
  p.steerTo(tx + p.noiseX * 0.4, ty + p.noiseY * 0.4, 1, dist(p.x, p.y, tx, ty) > 110 && danger > 0.4);
}

/* --------------------------- Attacking ---------------------------- */

/** One teammate is asked to attack the space behind the defence; the others keep a passing option. */
function assignRunner(team: Team, m: Match) {
  const c = m.ball.owner;
  if (!c || c.team !== team || m.state !== 'live') {
    team.runner = null;
    return;
  }
  if (team.runner && team.runner !== c && !team.runner.isGK && team.runner.runTimer > 0.2) return;
  const ballSide = Math.sign(c.y - CY);
  let best: Player | null = null;
  let bestS = 0;
  for (const p of team.players) {
    if (p === c || p.isGK || p.role === 'DEF' || p.busy || p.runCd > 0) continue;
    let s = p.role === 'FWD' ? 2.2 : 1;
    s += (team.local(p.x) - team.local(c.x)) * 1.4;
    // The mid on the ball side stays close for the layoff. The far one can go.
    if (p.role === 'MID' && p.flank === ballSide) s -= 0.75;
    if (s > bestS) {
      bestS = s;
      best = p;
    }
  }
  team.runner = best;
}

/** Pick a channel in behind and sprint into it. The target stays ahead of the runner for the whole call. */
function launchDepthRun(p: Player, team: Team, c: Player) {
  const line = oppLastLine(team);
  const runLocal = clamp(Math.max(line + rand(0.06, 0.11), team.local(p.x) + 0.16), 0.38, 0.92);
  p.tx = team.worldX(runLocal);
  p.ty = depthChannel(team, p, c, p.tx);
  p.runTimer = rand(2.5, 3.5);
  p.intent = 'run';
  p.tSprint = true;
}

/** Keep the run going: the target stays a dozen metres ahead, up to the edge of the box. */
function extendDepthRun(p: Player, team: Team) {
  const line = oppLastLine(team);
  const want = clamp(Math.max(line + 0.05, team.local(p.x) + 0.1), 0.4, 0.92);
  const tx = team.worldX(want);
  if ((tx - p.tx) * team.dir > 15) p.tx = tx;
}

function depthChannel(team: Team, p: Player, c: Player, x: number) {
  let best = p.y;
  let bestS = -1e9;
  for (const y0 of [140, 280, CY, PITCH_W - 280, PITCH_W - 140]) {
    const open = nearestOpponentDist(team, x, y0);
    const s = open * 1.25 - Math.abs(y0 - p.y) * 0.1 - (Math.abs(y0 - c.y) < 75 ? 40 : 0);
    if (s > bestS) {
      bestS = s;
      best = y0;
    }
  }
  return clamp(best, 70, PITCH_W - 70);
}

function supportAI(p: Player, team: Team, m: Match, dt: number) {
  const prof = team.profile;
  const b = m.ball;
  const c = b.owner;
  p.think -= dt;
  if (p.runCd > 0) p.runCd -= dt;
  if (p.runTimer > 0) {
    const carrier = c && c.team === team ? c : null;
    const stale = carrier && (p.x - carrier.x) * team.dir < -20 && (p.tx - carrier.x) * team.dir < 30;
    if (stale) {
      p.runTimer = 0;
      p.runCd = 0.25;
    } else {
      p.runTimer -= dt;
      p.intent = 'run';
      if (p === team.runner) extendDepthRun(p, team);
      p.steerTo(p.tx, p.ty, 1, true, 26);
      if (p.runTimer <= 0) p.runCd = team.human ? rand(0.4, 0.7) : rand(0.9, 1.4);
      return;
    }
  }
  if (c && c.team === team && p === team.runner && p.runCd <= 0 && p !== c) {
    const line = oppLastLine(team);
    const possessed = m.time - team.wonAt;
    const room = line < 0.9 && team.local(p.x) < Math.min(0.86, line + 0.07);
    // The human's teammates go as soon as the ball is settled. Opponents do it less often.
    const go = team.human
      ? possessed > (team.plan === 'counter' ? 0.1 : 0.32)
      : p.think <= 0 && possessed > 0.4 && Math.random() < (team.plan === 'counter' ? 0.7 : team.plan === 'direct' ? 0.42 : 0.22) * (0.5 + prof.vision);
    if (room && go) {
      launchDepthRun(p, team, c);
      p.steerTo(p.tx, p.ty, 1, true, 26);
      return;
    }
  }
  if (p.think > 0) {
    p.steerTo(p.tx, p.ty, 1, p.tSprint, 22);
    return;
  }
  p.think = prof.offBall * rand(0.75, 1.3);
  shapePosition(p, team, m.ball.x, m.ball.y, true);
  const baseX = slot.x;
  const baseY = slot.y;
  const cx = c ? c.x : b.x;
  const cy = c ? c.y : b.y;

  // Sample candidate spots around the role slot and keep the most useful free space.
  let bestX = baseX;
  let bestY = baseY;
  let bestS = -1e9;
  for (let i = 0; i < 7; i++) {
    const ox = i === 0 ? 0 : rand(-75, 75);
    const oy = i === 0 ? 0 : rand(-85, 85);
    const x = clamp(baseX + ox, 40, PITCH_L - 40);
    const y = clamp(baseY + oy, 35, PITCH_W - 35);
    const open = clamp(nearestOpponentDist(team, x, y) / 130, 0, 1);
    let lane = 1;
    for (const o of team.opp.players) {
      const t = segmentT(o.x, o.y, cx, cy, x, y);
      if (t <= 0.05 || t >= 0.95) continue;
      lane = Math.min(lane, clamp(distToSegment(o.x, o.y, cx, cy, x, y) / 60, 0, 1));
    }
    const sep = clamp(nearestTeammateDist(p, x, y) / 130, 0, 1);
    const dc = dist(x, y, cx, cy);
    const distPen = dc < 90 ? (90 - dc) / 90 : dc > 430 ? (dc - 430) / 300 : 0;
    const drift = dist(x, y, baseX, baseY) / 220;
    let s = open * 0.9 + lane * 0.8 + sep * 0.6 - distPen * 0.8 - drift * 0.5 + team.local(x) * 0.25;
    // While someone attacks the space, a midfielder offers a short option instead of joining the run.
    if (team.runner && team.runner !== p && team.runner.runTimer > 0 && p.role === 'MID' && p.flank === Math.sign(cy - CY)) s -= Math.abs(dc - 160) / 420;
    if (s > bestS) {
      bestS = s;
      bestX = x;
      bestY = y;
    }
  }
  const err = (1 - prof.positioning) * 45;
  p.tx = bestX + gauss() * err;
  p.ty = clamp(bestY + gauss() * err, 25, PITCH_W - 25);
  p.tSprint = dist(p.x, p.y, p.tx, p.ty) > 150 || team.plan === 'counter';
  p.intent = Math.abs(p.ty - CY) > 300 ? 'width' : 'support';
  p.steerTo(p.tx, p.ty, 1, p.tSprint, 22);
}

/* ---------------------------- Carrier ----------------------------- */

/** Shot quality (0..1) from the carrier position; writes preferred aim into `shotAim`. */
export function shotQuality(p: Player, m: Match, x = p.x, y = p.y) {
  const team = p.team;
  const gx = team.oppGoalX;
  const dx = Math.abs(gx - x);
  const d = Math.hypot(dx, y - CY);
  shotAim.q = 0;
  if (team.local(x) < 0.55 || d > 560) return 0;
  const distF = clamp(1 - (d - 110) / 430, 0, 1);
  const a1 = Math.atan2(CY - GOAL_HALF - y, dx);
  const a2 = Math.atan2(CY + GOAL_HALF - y, dx);
  const angleF = clamp(Math.abs(a2 - a1) / 0.6, 0, 1);
  const k = team.opp.keeper;
  let bestGap = 0;
  let bestY = CY;
  for (let s = -1; s <= 1; s += 2) {
    const ay = CY + s * (GOAL_HALF - 15);
    const gap = distToSegment(k.x, k.y, x, y, gx, ay);
    if (gap > bestGap) {
      bestGap = gap;
      bestY = ay;
    }
  }
  const gapF = clamp((bestGap - 8) / 55, 0, 1);
  let blockers = 0;
  for (const o of team.opp.players) {
    if (o.isGK) continue;
    if (distToSegment(o.x, o.y, x, y, gx, bestY) < 15) blockers++;
  }
  const pressF = 1 - 0.3 * m.pressureOn(p);
  const q = distF * (0.35 + 0.65 * angleF) * (0.3 + 0.7 * gapF) * Math.pow(0.5, blockers) * pressF;
  shotAim.y = bestY;
  shotAim.q = q;
  return q;
}

/** Lane risk 0..1 of a ground pass from (ax,ay) to (bx,by) at speed v0, against `team`'s opponents. */
export function laneRisk(team: Team, ax: number, ay: number, bx: number, by: number, v0: number, ignore: Player | null) {
  const d = Math.hypot(bx - ax, by - ay);
  let risk = 0;
  for (const o of team.opp.players) {
    if (o === ignore) continue;
    const t = segmentT(o.x, o.y, ax, ay, bx, by);
    // Only someone on the pass itself can cut it out. A keeper beyond the landing spot is not in the lane.
    if (t <= 0.02 || t >= 0.97) continue;
    const qx = ax + (bx - ax) * t;
    const qy = ay + (by - ay) * t;
    const dq = dist(o.x, o.y, qx, qy);
    const tb = groundTime(v0, t * d);
    // Defenders need to read the pass before moving; a pass that zips past them is safe.
    const to = Math.max(0, dq - CONTROL_DIST) / o.maxSpeed(false) + 0.24;
    const margin = to - tb;
    const r = margin < 0 ? 1 : margin < 0.12 ? 0.5 : margin < 0.25 ? 0.2 : 0;
    if (r > risk) risk = r;
  }
  return risk;
}

/** Best pass option for an AI carrier given the team plan; result in `passPick`. */
function bestPass(p: Player, team: Team, m: Match) {
  const prof = team.profile;
  const plan = team.plan;
  passPick.score = -9;
  passPick.target = null;
  const pressure = m.pressureOn(p);
  // Sterile circulation makes the team progressively more ambitious (build-up -> acceleration).
  const impatience = clamp(team.circulation / 4, 0, 1.25);
  const wideCarrier = Math.abs(p.y - CY) > 210 && team.local(p.x) > 0.74;
  for (const r of team.players) {
    if (r === p || r.busy) continue;
    const d0 = dist(p.x, p.y, r.x, r.y);
    if (d0 < 55 || d0 > 720) continue;
    if (d0 > 420 && Math.random() > prof.vision) continue;
    const v0 = groundPassSpeed(d0);
    const t = groundTime(v0, d0);
    const lead = r.intent === 'run' ? 0.95 : 0.55;
    const lx = clamp(r.x + r.vx * t * lead, 25, PITCH_L - 25);
    const ly = clamp(r.y + r.vy * t * lead, 25, PITCH_W - 25);
    const d = dist(p.x, p.y, lx, ly);
    const risk = laneRisk(team, p.x, p.y, lx, ly, groundPassSpeed(d), null);
    const open = clamp(nearestOpponentDist(team, lx, ly) / 120, 0, 1);
    const prog = team.local(lx) - team.local(p.x);
    const threat = shotQuality(r, m, lx, ly);
    let s = 0.45 * (1 - risk) + 0.25 * open;
    let lob = false;
    let cross = false;
    if (risk > 0.75 && d > 240 && open > 0.6) {
      // Lofted alternative over a blocked lane: only if the receiver reaches the landing spot clearly first.
      const T = clamp(d0 / 430, 0.6, 1.45);
      const llx = clamp(r.x + r.vx * T * lead, 25, PITCH_L - 25);
      const lly = clamp(r.y + r.vy * T * lead, 25, PITCH_W - 25);
      const margin = landingMargin(team, r, llx, lly, T);
      if (margin > 0.3) {
        lob = true;
        s = 0.22 + 0.2 * open + Math.min(0.15, margin * 0.15);
        passPickLX = llx;
        passPickLY = lly;
      }
    }
    s += prog * impatience * 0.7 * (1 - risk);
    if (prog < -0.03 && pressure < 0.55) s -= 0.06 + impatience * 0.14;
    // No instant give-and-go back to the passer unless he is running into space or we are pressed.
    if (r === p.receivedFrom && p.holdTimer < 1.2 && pressure < 0.6 && r.intent !== 'run') s -= 0.24;
    if (d0 > 100 && d0 < 280) s += 0.06;
    switch (plan) {
      case 'build':
        s += prog * 0.3 + threat * 0.25 - risk * 0.15;
        if (Math.abs(ly - p.y) > 280 && team.circulation < 3) s += 0.08;
        break;
      case 'direct':
        s += prog * 0.9 + threat * 0.35;
        break;
      case 'wing':
        s += prog * 0.5 + threat * 0.3;
        if (Math.abs(ly - CY) > 230) s += 0.12;
        break;
      case 'counter':
        s += prog * 1.1 + threat * 0.35;
        if (r.intent === 'run') s += 0.15;
        break;
    }
    if (wideCarrier && Math.abs(ly - CY) < BOX_HALF - 40 && team.local(lx) > 0.82 && open > 0.25) {
      cross = true;
      lob = true;
      s += 0.22;
    }
    if (r.isGK) s -= 0.35;
    s += gauss() * prof.noise * 0.15;
    if (s > passPick.score) {
      passPick.score = s;
      passPick.target = r;
      passPick.x = lob && !cross ? passPickLX : lx;
      passPick.y = lob && !cross ? passPickLY : ly;
      passPick.lob = lob;
      passPick.cross = cross;
    }
  }
}

let passPickLX = 0;
let passPickLY = 0;

/** Seconds by which the receiver beats the quickest opponent to a lofted ball's landing spot. */
function landingMargin(team: Team, r: Player, x: number, y: number, flight: number) {
  const tr = Math.max(flight, Math.max(0, dist(r.x, r.y, x, y) - CONTROL_DIST) / r.maxSpeed(false));
  let to = 9;
  for (const o of team.opp.players) {
    const t = Math.max(0, dist(o.x, o.y, x, y) - CONTROL_DIST) / o.maxSpeed(false) + 0.2;
    if (t < to) to = t;
  }
  return to - tr;
}

const DRIBBLE_ANGLES = [0, 0.6, -0.6, 1.15, -1.15, 1.9, -1.9];

function bestDribble(p: Player, team: Team) {
  let bestS = -9;
  const fwd = team.dir > 0 ? 0 : Math.PI;
  const plan = team.plan;
  for (const da of DRIBBLE_ANGLES) {
    const a = fwd + da;
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    const x1 = p.x + cx * 70;
    const y1 = p.y + cy * 70;
    const x2 = p.x + cx * 140;
    const y2 = p.y + cy * 140;
    if (y2 < 30 || y2 > PITCH_W - 30) continue;
    if (team.local(x2) > 0.985) continue;
    const s1 = clamp(nearestOpponentDist(team, x1, y1) / 90, 0, 1);
    const s2 = clamp(nearestOpponentDist(team, x2, y2) / 120, 0, 1);
    let s = s1 * 0.5 + s2 * 0.3 + Math.cos(da) * (plan === 'counter' ? 0.5 : plan === 'build' ? 0.18 : 0.32);
    if (plan === 'wing' && p.role === 'MID' && Math.abs(y2 - CY) > Math.abs(p.y - CY)) s += 0.08;
    // Toward the goal in the final third: cut inside.
    if (team.local(p.x) > 0.7 && Math.abs(y2 - CY) < Math.abs(p.y - CY)) s += 0.1;
    s += gauss() * team.profile.noise * 0.1;
    if (s > bestS) {
      bestS = s;
      p.dribbleX = cx;
      p.dribbleY = cy;
    }
  }
  return bestS;
}

function carrierAI(p: Player, team: Team, m: Match, dt: number) {
  const prof = team.profile;
  p.holdTimer += dt;
  p.think -= dt;
  const pressure = m.pressureOn(p);
  if (p.think <= 0 && p.holdTimer > 0.16) {
    p.think = prof.decision * rand(0.75, 1.25) * (pressure > 0.6 ? 0.6 : 1);
    if (decide(p, team, m, pressure)) return;
  }
  // Carry the ball along the committed dribble line, slowing in build-up phases.
  const nearLine = p.y < 50 || p.y > PITCH_W - 50;
  if (nearLine) p.dribbleY = (CY - p.y) > 0 ? Math.abs(p.dribbleY) + 0.3 : -Math.abs(p.dribbleY) - 0.3;
  const calm = team.plan === 'build' && pressure < 0.3 ? 0.62 : 1;
  const sprint = (team.plan === 'counter' || team.plan === 'direct') && pressure < 0.5 && p.stamina > 0.3;
  if (p.intent === 'shield') {
    const pr = team.opp.players.reduce((a, o) => (dist(o.x, o.y, p.x, p.y) < dist(a.x, a.y, p.x, p.y) ? o : a));
    p.steerDir(p.x - pr.x, p.y - pr.y, 0.45, false);
  } else {
    p.steerDir(p.dribbleX, p.dribbleY, calm, sprint);
  }
}

/** Release a teammate who is already on a depth run, weighted the same way as the human's T. */
function playThrough(p: Player, team: Team, m: Match, pressure: number) {
  const r = team.runner;
  if (!r || r === p || r.runTimer < 0.45 || r.intent !== 'run') return false;
  const dir = team.dir;
  if ((r.x - p.x) * dir < 20 || pressure > 0.8) return false;
  let rx = r.tx - r.x;
  let ry = r.ty - r.y;
  const rn = Math.hypot(rx, ry) || 1;
  rx /= rn;
  ry /= rn;
  if (rx * dir < 0.4) return false;
  const fwd = Math.max(0, r.vx * rx + r.vy * ry);
  const pace = RUN_SPEED * r.speedStat * SPRINT_MULT;
  const dose = throughDose(m.ball.x, m.ball.y, r.x, r.y, rx, ry, fwd, pace, channelSpace(team, r.x, r.y, rx, ry));
  const risk = laneRisk(team, p.x, p.y, dose.x, dose.y, dose.speed, null);
  if (risk > 0.62) return false;
  // Teammates look for the run. Opponents play it less often, so a run is not a free chance.
  const eager = team.human ? 0.7 : 0.28 + team.profile.vision * 0.28;
  if (Math.random() > eager * (1 - risk * 0.35)) return false;
  const err = team.profile.passError * (1 + pressure * 0.8) * (1.35 - p.passStat * 0.5);
  passTo(m, p, dose.x, dose.y, { target: r, error: err, speed: dose.speed, through: true });
  p.holdTimer = 0;
  return true;
}

/** Returns true when the ball has been released. */
function decide(p: Player, team: Team, m: Match, pressure: number): boolean {
  const prof = team.profile;
  if (team.circulation >= 5 && (team.plan === 'build' || team.plan === 'wing') && Math.random() < 0.5 + prof.vision * 0.4) {
    team.plan = 'direct';
    team.planTimer = rand(4, 6);
    m.planCount.direct++;
  }
  const plan = team.plan;
  const q = shotQuality(p, m);
  const aimY = shotAim.y;
  const shootThreshold = (plan === 'build' ? 0.42 : plan === 'wing' ? 0.38 : 0.33) - prof.noise * 0.25 * Math.random();
  if (q > shootThreshold + (team.human ? 0 : 0.06)) {
    const power = clamp(0.62 + Math.random() * 0.35 + (team.local(p.x) < 0.75 ? 0.08 : 0), 0, 1);
    const finesse = q > 0.5 && Math.random() < 0.3;
    const side = Math.random() < 0.8 ? aimY : CY + (CY - aimY);
    shoot(m, p, side + rand(-8, 8), power, { finesse, error: prof.shotError });
    return true;
  }

  if (playThrough(p, team, m, pressure)) return true;

  // Deep in our own box under heavy pressure: no risk.
  if (team.local(p.x) < 0.14 && Math.abs(p.y - CY) < BOX_HALF && pressure > 0.65) {
    clearBall(m, p);
    return true;
  }

  bestPass(p, team, m);
  const dribbleS = bestDribble(p, team);
  let dribbleValue = dribbleS * (0.55 + p.dribbleStat * 0.25) * (pressure > 0.6 ? 0.65 : 1);
  if (plan === 'build') dribbleValue *= 0.75;
  if (pressure < 0.45 && Math.abs(Math.atan2(p.dribbleY, p.dribbleX * team.dir)) < 0.7) dribbleValue += clamp(team.circulation / 4, 0, 1) * 0.15;
  // Just received and nobody around: take a touch and look up instead of an instant pass.
  if (p.holdTimer < 0.5 && pressure < 0.25 && plan !== 'counter') dribbleValue += 0.18;

  const passS = passPick.score;
  const r = passPick.target;
  if (r && passS > 0.3 && (passS > dribbleValue || pressure > 0.7 && passS > 0.22)) {
    const err = prof.passError * (1 + pressure * 0.8) * (1.35 - p.passStat * 0.5);
    if (passPick.cross) {
      passTo(m, p, passPick.x, passPick.y, { target: r, lob: true, error: err * 0.8, kind: 'cross', height: 0.9 });
    } else {
      passTo(m, p, passPick.x, passPick.y, { target: r, lob: passPick.lob, error: err });
    }
    p.holdTimer = 0;
    return true;
  }

  // Take-on: defender square in front, decent space behind him -> cut and burst.
  const pr = team.opp.presser;
  if (pr && dist(pr.x, pr.y, p.x, p.y) < 55 && p.stamina > 0.3 && Math.random() < p.dribbleStat * 0.5) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const a = Math.atan2(p.dribbleY, p.dribbleX) + side * 0.9;
    p.facing = a;
    p.dribbleX = Math.cos(a);
    p.dribbleY = Math.sin(a);
    p.intent = 'carry';
    return knockOn(m, p);
  }
  if (pressure > 0.75 && dribbleS < 0.35) {
    p.intent = 'shield';
    return false;
  }
  p.intent = 'carry';
  return false;
}

/* ---------------------- Restarts (AI takers) ---------------------- */

/** AI decision for a set piece taker. */
export function aiTakeRestart(p: Player, m: Match) {
  const team = p.team;
  const r = m.restart!;
  const prof = team.profile;
  switch (r.type) {
    case 'penalty': {
      const side = Math.random() < 0.5 ? -1 : 1;
      const placed = Math.random() < 0.55;
      shoot(m, p, CY + side * (GOAL_HALF - (placed ? 16 : 30)), placed ? 0.55 : 0.85, { finesse: placed, error: prof.shotError * 0.8 });
      return;
    }
    case 'freekick': {
      const q = shotQuality(p, m);
      if (q > 0.22 && Math.random() < 0.7) {
        shoot(m, p, shotAim.y, rand(0.7, 0.9), { finesse: Math.random() < 0.5, error: prof.shotError });
        return;
      }
      break;
    }
    case 'corner': {
      let best: Player | null = null;
      let bestS = -1;
      for (const t of team.players) {
        if (t === p || t.isGK) continue;
        const inBox = Math.abs(t.x - team.oppGoalX) < BOX_DEPTH && Math.abs(t.y - CY) < BOX_HALF;
        const s = (inBox ? 1 : 0.2) * clamp(nearestOpponentDist(team, t.x, t.y) / 80, 0.2, 1) + Math.random() * 0.4;
        if (s > bestS) {
          bestS = s;
          best = t;
        }
      }
      if (best && Math.random() < 0.8) {
        passTo(m, p, best.x + rand(-20, 20), best.y + rand(-20, 20), { target: best, lob: true, kind: 'cross', error: prof.passError * 1.4, height: 0.95 });
        return;
      }
      break;
    }
    default:
      break;
  }
  bestPass(p, team, m);
  const t = passPick.target;
  if (r.type === 'throwin') {
    if (t) m.throwTo(p, passPick.x, passPick.y, t, false);
    else m.throwTo(p, p.x + team.dir * 120, CY, null, false);
    return;
  }
  if (t) passTo(m, p, passPick.x, passPick.y, { target: t, lob: passPick.lob, error: prof.passError });
  else passTo(m, p, p.x + team.dir * 200, CY, { error: prof.passError });
}

/** Region test for the attacking team's target box. */
export function inBox(x: number, y: number, goalX: number) {
  return Math.abs(x - goalX) <= BOX_DEPTH && Math.abs(y - CY) <= BOX_HALF;
}

export const formationSlot = slot;
