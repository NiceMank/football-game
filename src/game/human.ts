import { groundPassSpeed, groundTime, knockOn, passTo, shoot, slideTackle, tackle } from './actions';
import { icpt, interceptTime, nearestOpponentDist } from './ai';
import { CONTROL_DIST, CY, GOAL_HALF, PITCH_L, PITCH_W, PLAYER_R } from './constants';
import { clamp, dist, rand } from './math';
import type { Match } from './match';
import type { Player } from './player';
import type { Team } from './team';
import type { AimSwipe, InputState } from './types';

const TAP_PASS = 0.22;
const TAP_SHOT = 0.14;
const SHOT_CHARGE_TIME = 0.85;
const HUMAN_TACKLE = 0.6;

/** Translates the input state into actions for the controlled player of the human team. */
export class HumanController {
  passHold = -1;
  shootHold = -1;
  charge = 0;
  chargeKind: 'shot' | 'pass' | null = null;
  queued: 'pass' | 'shoot' | null = null;
  queuedTimer = 0;
  queuedPower = 0;
  aimX = 1;
  aimY = 0;
  moveX = 0;
  moveY = 0;
  private lastSwitch = -9;
  private switchRank = 0;
  previewTarget: Player | null = null;
  private previewTimer = 0;
  takingTimer = 0;

  reset() {
    this.passHold = -1;
    this.shootHold = -1;
    this.charge = 0;
    this.chargeKind = null;
    this.queued = null;
    this.previewTarget = null;
    this.takingTimer = 0;
  }

  update(dt: number, input: InputState, m: Match) {
    const team = m.humanTeam;
    if (!team) return;
    if (!team.controlled || team.controlled.isGK) team.controlled = bestSwitch(team, m, null, 0);
    let mx = input.moveX;
    let my = input.moveY;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    this.moveX = mx;
    this.moveY = my;
    if (mag > 0.2) {
      this.aimX = mx / Math.max(mag, 1e-6);
      this.aimY = my / Math.max(mag, 1e-6);
    }

    if (input.passPressed) this.passHold = 0;
    if (input.shootPressed) this.shootHold = 0;
    if (this.passHold >= 0) this.passHold += dt;
    if (this.shootHold >= 0) this.shootHold += dt;
    if (this.shootHold >= 0) {
      this.chargeKind = 'shot';
      this.charge = clamp(this.shootHold / SHOT_CHARGE_TIME, 0, 1);
    } else if (this.passHold > TAP_PASS) {
      this.chargeKind = 'pass';
      this.charge = clamp((this.passHold - 0.1) / 0.8, 0, 1);
    } else {
      this.chargeKind = null;
      this.charge = 0;
    }
    if (this.queuedTimer > 0) {
      this.queuedTimer -= dt;
      if (this.queuedTimer <= 0) this.queued = null;
    }

    if (input.switchPressed && m.state === 'live') this.switchPlayer(m, team);

    const p = team.controlled!;
    const b = m.ball;

    if (m.state === 'taking') {
      this.handleRestart(dt, input, m, team, p);
      return;
    }
    if (m.state !== 'live') {
      p.stop();
      this.releaseHolds(input);
      return;
    }
    if (p.busy) {
      p.stop();
      this.releaseHolds(input);
      return;
    }

    if (b.owner === team.keeper && b.held) {
      p.steerDir(mx, my, mag, input.sprint);
      if (input.passReleased && this.passHold >= 0) {
        this.keeperRelease(m, team.keeper, this.passHold > TAP_PASS, input.passSwipe);
        this.passHold = -1;
      } else if (input.shootReleased && this.shootHold >= 0) {
        this.keeperRelease(m, team.keeper, true, input.shootSwipe);
        this.shootHold = -1;
      }
      this.releaseHolds(input);
      return;
    }

    if (b.owner === p) {
      p.steerDir(mx, my, mag, input.sprint);
      if (input.dashPressed) knockOn(m, p);
      this.updatePreview(dt, p);
      if (input.passReleased && this.passHold >= 0) {
        this.doPass(m, p, input.passSwipe, this.passHold);
        this.passHold = -1;
      }
      if (b.owner === p && input.shootReleased && this.shootHold >= 0) {
        this.doShot(m, p, input.shootSwipe, this.shootHold);
        this.shootHold = -1;
      }
      return;
    }
    this.previewTarget = null;

    const defending = b.owner !== null && b.owner.team !== team;
    const receiving = b.free && b.passTarget === p;
    if (receiving && mag < 0.15) {
      interceptTime(p, m);
      p.steerTo(icpt.x, icpt.y, 1, dist(p.x, p.y, icpt.x, icpt.y) > 80, 8);
    } else if (defending && input.pass && mag < 0.15 && b.owner) {
      // Holding PASS while defending: assisted pressure on the carrier (goal-side jockey).
      const c = b.owner;
      const gx = team.ownGoalX;
      const dg = Math.hypot(gx - c.x, CY - c.y) || 1;
      p.steerTo(c.x + ((gx - c.x) / dg) * 24, c.y + ((CY - c.y) / dg) * 24, 1, input.sprint || dist(p.x, p.y, c.x, c.y) > 120, 10);
    } else {
      p.steerDir(mx, my, mag, input.sprint);
    }
    if (input.dashPressed && mag > 0.2) p.sprint = true;

    if (defending) {
      if (input.passPressed) {
        if (dist(p.x, p.y, b.x, b.y) < PLAYER_R + 26) tackle(m, p, HUMAN_TACKLE);
      }
      if (input.shootPressed) {
        const dx = mag > 0.2 ? mx : b.x - p.x;
        const dy = mag > 0.2 ? my : b.y - p.y;
        slideTackle(m, p, dx, dy);
        this.shootHold = -1;
      }
    } else if (b.free) {
      if (input.passPressed) {
        this.queued = 'pass';
        this.queuedTimer = 0.55;
      }
      if (input.shootPressed) {
        this.queued = 'shoot';
        this.queuedTimer = 0.7;
      }
      if (this.queued === 'shoot' && this.shootHold >= 0) this.queuedPower = this.charge;
      // Close to a loose ball: a pass press pokes it rather than waiting.
      if (input.passPressed && b.z < 20 && dist(p.x, p.y, b.x, b.y) < CONTROL_DIST + 4 && b.speed > 520) tackle(m, p, HUMAN_TACKLE);
    }
    this.releaseHolds(input);
  }

  private releaseHolds(input: InputState) {
    if (input.passReleased) this.passHold = -1;
    if (input.shootReleased) {
      if (this.queued === 'shoot') this.queuedPower = Math.max(this.queuedPower, this.charge);
      this.shootHold = -1;
    }
  }

  /** One-touch finish / pass when the controlled player meets the ball with an action queued. */
  tryOneTouch(m: Match, p: Player) {
    if (!this.queued || m.humanTeam?.controlled !== p) return false;
    const q = this.queued;
    this.queued = null;
    this.queuedTimer = 0;
    const b = m.ball;
    if (q === 'shoot') {
      const power = Math.max(0.6, this.queuedPower, this.shootHold >= 0 ? this.charge : 0);
      const header = b.z > 22;
      shoot(m, p, this.keyboardAimY(p), power, { error: 18, header, aimZ: header ? rand(10, 45) : undefined });
      this.shootHold = -1;
      this.queuedPower = 0;
      m.effects.showBanner(header ? 'TÊTE !' : 'REPRISE !', '', '#fde047', 0.9);
      return true;
    }
    b.owner = null;
    this.doPass(m, p, null, 0);
    return true;
  }

  private keyboardAimY(p: Player) {
    if (Math.abs(this.moveY) > 0.3) return CY + Math.sign(this.moveY) * (GOAL_HALF - 13);
    return farSideAim(p);
  }

  private updatePreview(dt: number, p: Player) {
    this.previewTimer -= dt;
    if (this.previewTimer > 0) return;
    this.previewTimer = 0.1;
    const mag = Math.hypot(this.moveX, this.moveY);
    const dx = mag > 0.2 ? this.moveX : Math.cos(p.facing);
    const dy = mag > 0.2 ? this.moveY : Math.sin(p.facing);
    this.previewTarget = choosePassTarget(p, dx, dy, 0.85);
  }

  doPass(m: Match, p: Player, swipe: AimSwipe | null, hold: number) {
    const mag = Math.hypot(this.moveX, this.moveY);
    let dx = swipe ? swipe.dx : mag > 0.2 ? this.moveX : Math.cos(p.facing);
    let dy = swipe ? swipe.dy : mag > 0.2 ? this.moveY : Math.sin(p.facing);
    const directed = swipe !== null || mag > 0.2;
    const lofted = swipe ? swipe.power > 0.78 : hold > TAP_PASS;
    const power = swipe ? swipe.power : clamp((hold - 0.1) / 0.8, 0, 1);
    const target = choosePassTarget(p, dx, dy, swipe ? 0.93 : directed ? 0.75 : 0.2);
    const throwing = m.state === 'taking' && m.restart?.type === 'throwin';
    const err = 0.028 * (1 + m.pressureOn(p) * 0.8);
    if (target) {
      const d0 = dist(p.x, p.y, target.x, target.y);
      const v0 = swipe ? 330 + power * 600 : groundPassSpeed(d0);
      const t = lofted ? clamp(d0 / 430, 0.6, 1.45) : groundTime(v0, d0);
      const runLead = target.intent === 'run' ? 1 : 0.6;
      let tx = target.x + target.vx * t * runLead;
      let ty = target.y + target.vy * t * runLead;
      if (lofted && !swipe) {
        // Through ball over the top: the longer the press, the further into space.
        tx += p.team.dir * power * 90;
      }
      tx = clamp(tx, 20, PITCH_L - 20);
      ty = clamp(ty, 20, PITCH_W - 20);
      m.humanTeam!.controlled = target;
      if (throwing) {
        m.throwTo(p, tx, ty, target, lofted);
        return;
      }
      const cross = lofted && Math.abs(p.y - CY) > 200 && Math.abs(ty - CY) < 200 && p.team.local(tx) > 0.8;
      passTo(m, p, tx, ty, {
        target, lob: lofted, error: err, speed: swipe && !lofted ? v0 : undefined, kind: cross ? 'cross' : undefined,
      });
      return;
    }
    const n = Math.hypot(dx, dy) || 1;
    dx /= n;
    dy /= n;
    const len = 150 + power * 420;
    const tx = p.x + dx * len;
    const ty = p.y + dy * len;
    if (throwing) {
      m.throwTo(p, tx, ty, null, lofted);
      return;
    }
    passTo(m, p, tx, ty, { lob: lofted, error: err, speed: swipe && !lofted ? 330 + power * 600 : undefined });
  }

  /** Keeper with the ball in hand: PASS = throw to a teammate, long PASS / TIR = punt up the pitch. */
  keeperRelease(m: Match, k: Player, long: boolean, swipe: AimSwipe | null) {
    const mag = Math.hypot(this.moveX, this.moveY);
    const dx = swipe ? swipe.dx : mag > 0.2 ? this.moveX : k.team.dir;
    const dy = swipe ? swipe.dy : mag > 0.2 ? this.moveY : 0;
    const target = choosePassTarget(k, dx, dy, mag > 0.2 || swipe ? 0.7 : -1);
    const tx = target ? target.x + target.vx * 0.5 : k.x + k.team.dir * 520;
    const ty = target ? target.y + target.vy * 0.5 : k.y + dy * 300;
    if (target) m.humanTeam!.controlled = target;
    if (!long && target && dist(k.x, k.y, target.x, target.y) < 420) {
      m.throwTo(k, tx, ty, target, false);
    } else {
      passTo(m, k, clamp(tx, 20, PITCH_L - 20), clamp(ty, 20, PITCH_W - 20), { target, lob: true, error: 0.06, kind: 'clear' });
    }
  }

  doShot(m: Match, p: Player, swipe: AimSwipe | null, hold: number) {
    const team = p.team;
    const gx = team.oppGoalX;
    const b = m.ball;
    let aimY: number;
    let power: number;
    let finesse = false;
    if (swipe) {
      power = Math.max(this.charge, swipe.power);
      const along = (gx - b.x) * team.dir;
      if (swipe.dx * team.dir > 0.12 && along > 0) {
        aimY = b.y + (swipe.dy / Math.abs(swipe.dx)) * along;
      } else {
        aimY = CY + Math.sign(swipe.dy || 1) * GOAL_HALF * 1.4;
      }
      aimY = clamp(aimY, CY - GOAL_HALF * 1.8, CY + GOAL_HALF * 1.8);
      finesse = swipe.power < 0.45 && this.charge < 0.3;
    } else if (hold < TAP_SHOT) {
      // Controlled placed shot: lower pace, better accuracy, aimed away from the keeper unless directed.
      power = 0.5;
      finesse = true;
      aimY = Math.abs(this.moveY) > 0.3 ? CY + Math.sign(this.moveY) * (GOAL_HALF - 16) : farSideAim(p);
    } else {
      power = clamp(hold / SHOT_CHARGE_TIME, 0, 1);
      aimY = Math.abs(this.moveY) > 0.3 ? CY + Math.sign(this.moveY) * (GOAL_HALF - 13) : CY + rand(-16, 16);
    }
    if (m.state === 'taking' && m.restart?.type === 'corner') {
      // C on a corner = whipped cross into the box.
      const tx = team.oppGoalX - team.dir * rand(70, 150);
      const ty = CY + (Math.abs(this.moveY) > 0.3 ? Math.sign(this.moveY) * 60 : rand(-40, 40));
      let best: Player | null = null;
      let bd = 1e9;
      for (const t of team.players) {
        if (t === p || t.isGK) continue;
        const d = dist(t.x, t.y, tx, ty);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      if (best) m.humanTeam!.controlled = best;
      passTo(m, p, tx, ty, { lob: true, kind: 'cross', target: best, error: 0.05, height: 0.85 + power * 0.25 });
      return;
    }
    shoot(m, p, aimY, power, { finesse, error: 15 });
  }

  private handleRestart(dt: number, input: InputState, m: Match, team: Team, p: Player) {
    const r = m.restart;
    if (!r || r.taker.team !== team) {
      // Opponent restart: the human may reposition (distance constraints enforced by the match).
      p.steerDir(this.moveX, this.moveY, Math.hypot(this.moveX, this.moveY), input.sprint);
      this.releaseHolds(input);
      return;
    }
    if (r.taker !== p) team.controlled = r.taker;
    const t = r.taker;
    t.stop();
    if (Math.hypot(this.moveX, this.moveY) > 0.2) t.facing = Math.atan2(this.moveY, this.moveX);
    this.takingTimer += dt;
    this.updatePreview(dt, t);
    if (r.type === 'goalkick') return;
    if (input.passReleased && this.passHold >= 0) {
      this.doPass(m, t, input.passSwipe, this.passHold);
      this.passHold = -1;
      m.restartTaken();
      return;
    }
    if (input.shootReleased && this.shootHold >= 0) {
      if (r.type === 'throwin') this.doPass(m, t, input.shootSwipe, 1);
      else this.doShot(m, t, input.shootSwipe, this.shootHold);
      this.shootHold = -1;
      m.restartTaken();
      return;
    }
    if (this.takingTimer > 8) {
      this.doPass(m, t, null, 0);
      m.restartTaken();
    }
  }

  switchPlayer(m: Match, team: Team) {
    const cur = team.controlled;
    if (m.ball.owner && m.ball.owner === cur) return;
    const repeated = m.time - this.lastSwitch < 0.8;
    this.switchRank = repeated ? this.switchRank + 1 : 0;
    this.lastSwitch = m.time;
    const next = bestSwitch(team, m, cur, this.switchRank);
    if (next && next !== cur) {
      team.controlled = next;
      this.passHold = -1;
      this.shootHold = -1;
      m.sfx('switch');
    }
  }

  /** Event-driven automatic switch when another teammate is clearly better placed. */
  autoSwitch(m: Match) {
    const team = m.humanTeam;
    if (!team || !team.controlled || m.ball.owner?.team === team) return;
    const cur = team.controlled;
    const tc = interceptTime(cur, m);
    const best = bestSwitch(team, m, null, 0);
    if (best && best !== cur) {
      const tb = interceptTime(best, m);
      if (tb + 0.55 < tc) team.controlled = best;
    }
  }
}

const ranked: Player[] = [];
const rankedScore: number[] = [];

/**
 * Switch target: the outfield player who can intervene soonest, with a bonus for being goal-side
 * when defending. `rank` cycles through the next-best options on repeated presses.
 */
export function bestSwitch(team: Team, m: Match, exclude: Player | null, rank: number) {
  ranked.length = 0;
  rankedScore.length = 0;
  const b = m.ball;
  const defending = b.owner !== null && b.owner.team !== team;
  for (const p of team.players) {
    if (p.isGK || p === exclude) continue;
    let s = interceptTime(p, m);
    if (defending && team.local(p.x) < team.local(b.x)) s -= 0.25;
    if (p.busy) s += 0.6;
    let i = 0;
    while (i < rankedScore.length && rankedScore[i] <= s) i++;
    ranked.splice(i, 0, p);
    rankedScore.splice(i, 0, s);
  }
  if (ranked.length === 0) return exclude;
  return ranked[rank % ranked.length];
}

/** Assisted pass target in a direction (minCos is the cone tightness). */
export function choosePassTarget(p: Player, dx: number, dy: number, minCos: number) {
  const n = Math.hypot(dx, dy) || 1;
  dx /= n;
  dy /= n;
  let best: Player | null = null;
  let bestS = -1e9;
  for (const t of p.team.players) {
    if (t === p) continue;
    const vx = t.x - p.x;
    const vy = t.y - p.y;
    const d = Math.hypot(vx, vy);
    if (d < 40 || d > 760) continue;
    const cos = (vx * dx + vy * dy) / d;
    if (cos < minCos) continue;
    const open = clamp(nearestOpponentDist(p.team, t.x, t.y) / 120, 0, 1);
    const distS = d < 110 ? 0.6 : d > 480 ? 1 - (d - 480) / 400 : 1;
    let s = cos * 1.6 + open * 0.6 + distS * 0.5 + p.team.local(t.x) * 0.2;
    if (t.isGK) s -= 0.8;
    if (s > bestS) {
      bestS = s;
      best = t;
    }
  }
  return best;
}

/** Aim at the post the keeper is not covering. */
export function farSideAim(p: Player) {
  const k = p.team.opp.keeper;
  return k.y > CY ? CY - (GOAL_HALF - 16) : CY + (GOAL_HALF - 16);
}
