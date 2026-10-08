import { formationSlot, shapePosition } from './ai';
import {
  BALL_R, BOX_DEPTH, BOX_HALF, CENTER_R, CX, CY, FREE_KICK_DISTANCE, GOAL_DEPTH, GOAL_H, GOAL_HALF,
  PEN_SPOT, PITCH_L, PITCH_W, POST_R, SMALL_BOX_DEPTH,
} from './constants';
import { clamp, dist } from './math';
import type { Match } from './match';
import type { Player } from './player';
import type { Team } from './team';
import type { RestartType } from './types';

export interface Restart {
  type: RestartType;
  team: Team;
  x: number;
  y: number;
  taker: Player;
  timer: number;
}

export const RESTART_LABELS: Record<RestartType, string> = {
  kickoff: "COUP D'ENVOI",
  throwin: 'TOUCHE',
  corner: 'CORNER',
  goalkick: 'SORTIE DE BUT',
  freekick: 'COUP FRANC',
  penalty: 'PENALTY !',
};

/** True if (x,y) is inside the penalty area defended by `team`. */
export function inPenaltyArea(team: Team, x: number, y: number) {
  return Math.abs(x - team.ownGoalX) <= BOX_DEPTH && Math.abs(y - CY) <= BOX_HALF;
}

/* ------------------------------------------------------------------ */
/* Goal frame physics: posts, crossbar and net.                         */
/* ------------------------------------------------------------------ */

export function goalFrame(m: Match, dt: number) {
  const b = m.ball;
  if (b.owner) return;
  for (let g = 0; g < 2; g++) {
    const gx = g === 0 ? 0 : PITCH_L;
    const s = g === 0 ? -1 : 1;
    if (Math.abs(b.x - gx) > GOAL_DEPTH + 30) continue;

    if (b.z < GOAL_H + 2) {
      for (let k = -1; k <= 1; k += 2) {
        const py = CY + k * GOAL_HALF;
        const d = dist(b.x, b.y, gx, py);
        if (d < POST_R + BALL_R && d > 0) {
          const nx = (b.x - gx) / d;
          const ny = (b.y - py) / d;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= 1.6 * vn * nx;
            b.vy -= 1.6 * vn * ny;
            b.x = gx + nx * (POST_R + BALL_R + 0.5);
            b.y = py + ny * (POST_R + BALL_R + 0.5);
            hitFrame(m, 'POTEAU !');
          }
        }
      }
    }

    const beyond = (b.x - gx) * s;
    const prevBeyond = (b.px - gx) * s;
    const inMouthY = Math.abs(b.y - CY) < GOAL_HALF;
    if (prevBeyond <= 0 && beyond > 0 && inMouthY && Math.abs(b.z - GOAL_H) < BALL_R + 2) {
      if (b.z < GOAL_H) {
        b.vz = -Math.abs(b.vz) * 0.5 - 90;
      } else {
        b.vx = -b.vx * 0.45;
        b.vz = Math.abs(b.vz) * 0.4 + 60;
        b.x = gx - s * (BALL_R + 1);
      }
      hitFrame(m, 'LA BARRE !');
    }

    if (beyond > 0 && inMouthY && b.z < GOAL_H) {
      let hitNet = false;
      if (beyond > GOAL_DEPTH - BALL_R) {
        b.x = gx + s * (GOAL_DEPTH - BALL_R);
        b.vx = -b.vx * 0.1;
        b.vy *= 0.4;
        b.vz *= 0.4;
        hitNet = true;
      }
      if (Math.abs(b.y - CY) > GOAL_HALF - BALL_R) {
        b.y = CY + Math.sign(b.y - CY) * (GOAL_HALF - BALL_R);
        b.vy = -b.vy * 0.2;
        hitNet = true;
      }
      if (b.z > GOAL_H - BALL_R) {
        b.z = GOAL_H - BALL_R;
        b.vz = -Math.abs(b.vz) * 0.2;
      }
      const f = Math.exp(-2.5 * dt);
      b.vx *= f;
      b.vy *= f;
      if (hitNet && m.netCooldown <= 0) {
        m.netCooldown = 0.6;
        m.effects.netRipple(b.x, b.y, b.z);
        m.sfx('net');
      }
    }
  }
}

function hitFrame(m: Match, label: string) {
  const b = m.ball;
  m.sfx('post');
  m.effects.sparks(b.x, b.y, b.z);
  m.effects.addShake(6);
  if (b.kind === 'shot') {
    m.effects.showBanner(label, '', '#fde047', 1.2);
    m.sfx('ooh');
  }
  b.kind = 'deflect';
}

/* ------------------------------------------------------------------ */
/* Ball out of play / goal detection.                                   */
/* ------------------------------------------------------------------ */

/** Checks whether the ball wholly crossed a line. Returns true if play stopped. */
export function checkBall(m: Match): boolean {
  const b = m.ball;
  for (let g = 0; g < 2; g++) {
    const gx = g === 0 ? 0 : PITCH_L;
    const s = g === 0 ? -1 : 1;
    const beyond = (b.x - gx) * s;
    const prevBeyond = (b.px - gx) * s;
    if (beyond > BALL_R && prevBeyond <= BALL_R) {
      const defending = m.home.ownGoalX === gx ? m.home : m.away;
      const attacking = defending.opp;
      const mouth = Math.abs(b.y - CY) < GOAL_HALF - POST_R * 0.5 && b.z < GOAL_H;
      if (mouth) {
        m.scoreGoal(attacking);
        return true;
      }
      const last = b.lastTouch?.team ?? attacking;
      if (last === defending) {
        const cy = b.y < CY ? 4 : PITCH_W - 4;
        awardRestart(m, 'corner', attacking, gx === 0 ? 4 : PITCH_L - 4, cy);
      } else {
        awardRestart(m, 'goalkick', defending, gx + -s * SMALL_BOX_DEPTH * 0.65, b.y < CY ? CY - 45 : CY + 45);
      }
      return true;
    }
  }
  if (b.y < -BALL_R || b.y > PITCH_W + BALL_R) {
    const last = b.lastTouch?.team ?? m.home;
    const x = clamp(b.x, 30, PITCH_L - 30);
    awardRestart(m, 'throwin', last.opp, x, b.y < 0 ? -4 : PITCH_W + 4);
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Fouls                                                                */
/* ------------------------------------------------------------------ */

export function foul(m: Match, offender: Player, victim: Player) {
  const x = clamp(victim.x, 20, PITCH_L - 20);
  const y = clamp(victim.y, 20, PITCH_W - 20);
  offender.team.stats.fouls++;
  victim.stun = Math.max(victim.stun, 0.7);
  m.sfx('foul');
  if (inPenaltyArea(offender.team, x, y)) {
    const gx = offender.team.ownGoalX;
    awardRestart(m, 'penalty', victim.team, gx + offender.team.dir * PEN_SPOT, CY, 'FAUTE DANS LA SURFACE');
  } else {
    awardRestart(m, 'freekick', victim.team, x, y, `FAUTE DE ${offender.name.toUpperCase()}`);
  }
}

/* ------------------------------------------------------------------ */
/* Restarts                                                             */
/* ------------------------------------------------------------------ */

function chooseTaker(type: RestartType, team: Team, x: number, y: number): Player {
  if (type === 'goalkick') return team.keeper;
  if (type === 'kickoff' || type === 'penalty') return team.players[4];
  if (type === 'corner') {
    for (const p of team.players) if (p.role === 'MID' && Math.sign(p.flank) === Math.sign(y - CY)) return p;
  }
  let best = team.players[1];
  let bd = 1e9;
  for (const p of team.players) {
    if (p.isGK) continue;
    const d = dist(p.x, p.y, x, y) - (type === 'freekick' && p.role === 'FWD' && team.local(x) > 0.66 ? 120 : 0);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

export function awardRestart(m: Match, type: RestartType, team: Team, x: number, y: number, sub = '') {
  const taker = chooseTaker(type, team, x, y);
  m.restart = { type, team, x, y, taker, timer: 0 };
  m.state = 'setup';
  m.stateTimer = type === 'kickoff' ? 1.5 : type === 'penalty' ? 1.9 : 1.25;
  m.ball.passTarget = null;
  m.ball.owner = null;
  m.ball.held = false;
  m.restartCount[type]++;
  if (type === 'corner') team.stats.corners++;
  if (type !== 'kickoff') m.sfx('whistle');
  m.effects.showBanner(RESTART_LABELS[type], sub || team.name.toUpperCase(), type === 'penalty' ? '#f43f5e' : '#fbbf24', 1.5);
  for (const p of m.all) {
    p.slide = 0;
    p.stun = 0;
    p.runTimer = 0;
    p.gk?.reset();
  }
  if (type === 'penalty') {
    const k = team.opp.keeper.gk!;
    k.penaltyMode = true;
    const r = Math.random();
    k.penaltyGuess = r < 0.45 ? -1 : r < 0.9 ? 1 : 0;
  }
  computeRestartTargets(m);
}

function setTarget(p: Player, x: number, y: number) {
  p.tx = clamp(x, 12, PITCH_L - 12);
  p.ty = clamp(y, 12, PITCH_W - 12);
}

export function computeRestartTargets(m: Match) {
  const r = m.restart!;
  const att = r.team;
  const def = att.opp;
  const ax = r.x;
  const ay = r.y;
  for (const team of m.teams) {
    for (const p of team.players) {
      if (p.isGK) {
        setTarget(p, team.ownGoalX + team.dir * 14, CY);
        continue;
      }
      shapePosition(p, team, ax, ay, team === att);
      setTarget(p, formationSlot.x, formationSlot.y);
    }
  }

  const t = r.taker;
  switch (r.type) {
    case 'kickoff': {
      for (const team of m.teams) {
        for (const p of team.players) {
          if (p.isGK) continue;
          const lim = team.worldX(0.47);
          const own = team.dir > 0 ? Math.min(p.tx, lim) : Math.max(p.tx, lim);
          p.tx = own;
          if (team === def && dist(p.tx, p.ty, CX, CY) < CENTER_R + 18) {
            const a = Math.atan2(p.ty - CY, p.tx - CX);
            p.tx = CX + Math.cos(a) * (CENTER_R + 22);
            p.ty = CY + Math.sin(a) * (CENTER_R + 22);
            p.tx = team.dir > 0 ? Math.min(p.tx, lim) : Math.max(p.tx, lim);
          }
        }
      }
      setTarget(t, CX - att.dir * 14, CY);
      const mate = att.players[2];
      setTarget(mate, CX - att.dir * 40, CY - 70);
      setTarget(att.players[3], CX - att.dir * 120, CY + 150);
      break;
    }
    case 'throwin':
      t.tx = ax;
      t.ty = ay < CY ? -8 : PITCH_W + 8;
      offerShortOptions(att, t, ax, ay);
      break;
    case 'corner': {
      const gx = att.oppGoalX;
      const near = Math.sign(ay - CY);
      for (const p of att.players) {
        if (p === t || p.isGK) continue;
        if (p.role === 'FWD') setTarget(p, gx - att.dir * 60, CY + near * 45);
        else if (p.role === 'MID') setTarget(p, gx - att.dir * 150, CY - near * 35);
        else if (p.role === 'DEF') setTarget(p, gx - att.dir * (BOX_DEPTH + 45), CY + near * 30);
      }
      for (const p of def.players) {
        if (p.isGK) {
          setTarget(p, gx - att.dir * 10, CY + near * 22);
          continue;
        }
        if (p.role === 'DEF') setTarget(p, gx - att.dir * 45, CY + near * 50);
        else if (p.flank === -1) setTarget(p, gx - att.dir * 125, CY - near * 15);
        else if (p.flank === 1) setTarget(p, gx - att.dir * 80, CY + near * 100);
        else setTarget(p, gx - att.dir * (BOX_DEPTH + 120), CY - near * 60);
      }
      t.tx = ax + att.dir * 6;
      t.ty = ay + near * 10;
      break;
    }
    case 'goalkick': {
      setTarget(t, ax - att.dir * 8, ay);
      for (const p of def.players) {
        if (p.isGK) continue;
        if (inPenaltyArea(att, p.tx, p.ty)) p.tx = att.ownGoalX + att.dir * (BOX_DEPTH + 30);
      }
      for (const p of att.players) {
        if (p.role === 'DEF') setTarget(p, att.ownGoalX + att.dir * (BOX_DEPTH + 20), ay < CY ? CY - 200 : CY + 200);
      }
      break;
    }
    case 'freekick': {
      const gx = def.ownGoalX;
      setTarget(t, ax - att.dir * 16, ay);
      const dGoal = dist(ax, ay, gx, CY);
      let wall = dGoal < 420 ? 2 : 0;
      const ux = (gx - ax) / dGoal;
      const uy = (CY - ay) / dGoal;
      for (const p of def.players) {
        if (p.isGK) continue;
        if (wall > 0 && p.role !== 'FWD') {
          const off = wall === 2 ? -12 : 12;
          setTarget(p, ax + ux * FREE_KICK_DISTANCE - uy * off, ay + uy * FREE_KICK_DISTANCE + ux * off);
          wall--;
        }
      }
      break;
    }
    case 'penalty': {
      const gx = def.ownGoalX;
      setTarget(t, ax - att.dir * 18, CY);
      const edge = gx + def.dir * (BOX_DEPTH + 28);
      let i = 0;
      for (const team of m.teams) {
        for (const p of team.players) {
          if (p === t || p.isGK) continue;
          const slots = [-190, -120, 120, 190, -60, 60, -240, 240];
          setTarget(p, edge + def.dir * (i % 2) * 22, CY + slots[i % slots.length]);
          i++;
        }
      }
      setTarget(def.keeper, gx + def.dir * 4, CY);
      break;
    }
  }
}

/** Two nearest teammates come short so a throw-in always has a real option. */
function offerShortOptions(team: Team, taker: Player, x: number, y: number) {
  const inward = y < CY ? 1 : -1;
  let n = 0;
  const sorted = team.players.filter(p => p !== taker && !p.isGK).sort((a, b) => dist(a.tx, a.ty, x, y) - dist(b.tx, b.ty, x, y));
  for (const p of sorted) {
    if (n >= 2) break;
    const off = n === 0 ? 1 : -1;
    setTarget(p, x + off * team.dir * 110, (y < CY ? 0 : PITCH_W) + inward * (90 + n * 70));
    n++;
  }
}

/** During 'taking', opponents must respect the distance from the ball. */
export function enforceRestartDistance(m: Match) {
  const r = m.restart;
  if (!r) return;
  const def = r.team.opp;
  const minD = r.type === 'throwin' ? 22 : r.type === 'kickoff' ? CENTER_R : FREE_KICK_DISTANCE;
  for (const p of def.players) {
    if (p.isGK && (r.type === 'penalty' || r.type === 'corner' || r.type === 'freekick')) continue;
    if (r.type === 'goalkick' || r.type === 'penalty') {
      const box = r.type === 'goalkick' ? r.team : def;
      if (inPenaltyArea(box, p.x, p.y) && !(r.type === 'penalty' && p.isGK)) {
        p.x = box.ownGoalX + box.dir * (BOX_DEPTH + 4);
      }
      continue;
    }
    const d = dist(p.x, p.y, r.x, r.y);
    if (d < minD && d > 0) {
      p.x = r.x + ((p.x - r.x) / d) * minD;
      p.y = r.y + ((p.y - r.y) / d) * minD;
    }
  }
  if (r.type === 'penalty') {
    for (const team of m.teams) {
      for (const p of team.players) {
        if (p === r.taker || p.isGK) continue;
        if (inPenaltyArea(def, p.x, p.y)) p.x = def.ownGoalX + def.dir * (BOX_DEPTH + 4);
      }
    }
  }
  if (r.type === 'kickoff') {
    for (const team of m.teams) {
      for (const p of team.players) {
        if (p === r.taker) continue;
        const lim = team.worldX(0.495);
        p.x = team.dir > 0 ? Math.min(p.x, lim) : Math.max(p.x, lim);
      }
    }
  }
}
