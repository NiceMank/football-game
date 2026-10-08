import { groundPassSpeed, groundTime, knockOn, passTo, shoot, slideTackle, tackle } from './actions';
import { icpt, interceptTime, laneRisk, nearestOpponentDist } from './ai';
import { CONTROL_DIST, CY, GOAL_HALF, GROUND_K, PASS_K, PITCH_L, PITCH_W, ROLL_DECEL } from './constants';
import { ASSIST, approachBlend, humanTackle, lungeRange, passConeCos, passErrorMul, passRescueDist, shotErrorMul, shotPostInset, shotWindow, tackleReach } from './assist';
import { angleDiff, clamp, dist, rand } from './math';
import type { Match } from './match';
import type { Player } from './player';
import type { Team } from './team';
import type { AimSwipe, InputState } from './types';

const TAP_PASS = 0.22;
const TAP_PASS_TOUCH = 0.4;
const TAP_SHOT = 0.14;
/** Largest lead given to a moving receiver (about 8 m). */
const MAX_PASS_LEAD = 120;
const SHOT_CHARGE_TIME = 0.85;
const LUNGE_TIME = 0.42;
/** Through ball: space played ahead of the runner (min / max). */
const THROUGH_LEAD_MIN = 90;
const THROUGH_LEAD_MAX = 170;

/** Translates the input state into actions for the controlled player of the human team. */
export class HumanController {
  passHold = -1;
  shootHold = -1;
  charge = 0;
  chargeKind: 'shot' | 'pass' | null = null;
  queued: 'pass' | 'through' | 'shoot' | null = null;
  queuedTimer = 0;
  queuedPower = 0;
  aimX = 1;
  aimY = 0;
  moveX = 0;
  moveY = 0;
  private lastSwitch = -9;
  private switchRank = 0;
  previewTarget: Player | null = null;
  /** Landing spot shown when the next pass has no teammate in the aimed direction. */
  previewPoint: { x: number; y: number } | null = null;
  takingTimer = 0;
  /** A tackle pressed while the carrier is still taking his touch fires as soon as it can. */
  private tackleBuffer = 0;
  /** Remaining time of a committed step-in toward the carrier (X from mid range). */
  lunge = 0;
  private tapPass = TAP_PASS;

  reset() {
    this.tackleBuffer = 0;
    this.lunge = 0;
    this.passHold = -1;
    this.shootHold = -1;
    this.charge = 0;
    this.chargeKind = null;
    this.queued = null;
    this.previewTarget = null;
    this.previewPoint = null;
    this.takingTimer = 0;
  }

  update(dt: number, input: InputState, m: Match) {
    this.tapPass = input.touch ? TAP_PASS_TOUCH : TAP_PASS;
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
    } else if (this.passHold > this.tapPass) {
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
        this.keeperRelease(m, team.keeper, this.passHold > this.tapPass, input.passSwipe);
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
      this.updatePreview(p);
      if (input.throughPressed) {
        this.doThrough(m, p);
        this.passHold = -1;
        this.releaseHolds(input);
        return;
      }
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
    this.previewPoint = null;

    const defending = b.owner !== null && b.owner.team !== team && !b.held;
    const receiving = b.free && b.passTarget === p;
    if (!defending) {
      this.tackleBuffer = 0;
      this.lunge = 0;
    } else if (input.passPressed && !p.busy && p.tackleCd <= 0) {
      // X without the ball depends on distance: tackle when close, a short committed step-in from a
      // little further, nothing from far away.
      const db = dist(p.x, p.y, b.x, b.y);
      if (db < tackleReach()) this.tackleBuffer = 0.3;
      else if (db < lungeRange()) {
        this.lunge = LUNGE_TIME;
        this.tackleBuffer = LUNGE_TIME;
      }
    }
    if (this.lunge > 0 && defending && b.owner) {
      this.lunge -= dt;
      const c = b.owner;
      p.steerTo(b.x + c.vx * 0.12, b.y + c.vy * 0.12, 1, true, 4);
      // Stepping in and not getting there leaves the defender briefly off balance.
      if (this.lunge <= 0) p.stun = Math.max(p.stun, 0.2);
    } else if (receiving) {
      // The ball is coming to this player: he goes to meet it even if the stick is still held from
      // the pass, otherwise he runs away from his own pass. Sprint is the player's choice, or
      // automatic when the meeting point is far.
      interceptTime(p, m);
      p.steerTo(icpt.x, icpt.y, 1, input.sprint || dist(p.x, p.y, icpt.x, icpt.y) > 110, 8);
    } else if (defending && input.pass && mag < 0.15 && b.owner) {
      // Holding PASS while defending: assisted pressure on the carrier (goal-side jockey).
      const c = b.owner;
      const gx = team.ownGoalX;
      const dg = Math.hypot(gx - c.x, CY - c.y) || 1;
      p.steerTo(c.x + ((gx - c.x) / dg) * 24, c.y + ((CY - c.y) / dg) * 24, 1, input.sprint || dist(p.x, p.y, c.x, c.y) > 120, 10);
    } else if (defending && b.owner && mag > 0.2) {
      // Closing a carrier down: when the stick already points at him, the run is bent slightly onto
      // his goal-side line. Same pace, and the stick still decides.
      const c = b.owner;
      const gx = team.ownGoalX;
      const dg = Math.hypot(gx - c.x, CY - c.y) || 1;
      const ax = c.x + ((gx - c.x) / dg) * 26 + c.vx * 0.2 - p.x;
      const ay = c.y + ((CY - c.y) / dg) * 26 + c.vy * 0.2 - p.y;
      const ad = Math.hypot(ax, ay) || 1;
      const cos = (ax * mx + ay * my) / ad;
      const k = approachBlend() * clamp((cos - 0.55) / 0.3, 0, 1) * clamp((240 - ad) / 80, 0, 1);
      p.steerDir(mx * (1 - k) + (ax / ad) * k, my * (1 - k) + (ay / ad) * k, mag, input.sprint);
    } else {
      p.steerDir(mx, my, mag, input.sprint);
    }
    if (input.dashPressed && mag > 0.2) p.sprint = true;

    if (defending) {
      if (this.tackleBuffer > 0) {
        this.tackleBuffer -= dt;
        if (b.ownerLock <= 0 && dist(p.x, p.y, b.x, b.y) < tackleReach()) {
          tackle(m, p, humanTackle());
          this.tackleBuffer = 0;
          this.lunge = 0;
        }
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
      if (input.throughPressed) {
        this.queued = 'through';
        this.queuedTimer = 0.55;
      }
      if (input.shootPressed) {
        this.queued = 'shoot';
        this.queuedTimer = 0.7;
      }
      if (this.queued === 'shoot' && this.shootHold >= 0) this.queuedPower = this.charge;
      // Close to a loose ball: a pass press pokes it rather than waiting.
      if (input.passPressed && b.z < 20 && dist(p.x, p.y, b.x, b.y) < CONTROL_DIST + 4 && b.speed > 520) tackle(m, p, humanTackle());
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
      shoot(m, p, this.keyboardAimY(p), power, { error: 18 * shotErrorMul(), header, aimZ: header ? rand(10, 45) : undefined });
      this.shootHold = -1;
      this.queuedPower = 0;
      m.effects.showBanner(header ? 'TÊTE !' : 'REPRISE !', '', '#fde047', 0.9);
      return true;
    }
    b.owner = null;
    if (q === 'through') this.doThrough(m, p);
    else this.doPass(m, p, null, 0);
    return true;
  }

  private keyboardAimY(p: Player) {
    return this.shotAimY(p, 0);
  }

  /**
   * Where a shot released at this hold would go. The on-pitch reticle reads the same value,
   * so what the player sees is what the ball is aimed at.
   */
  shotAimY(p: Player, hold: number) {
    const powered = hold >= TAP_SHOT;
    const half = GOAL_HALF - shotPostInset() - (powered ? 0 : 3);
    const gx = p.team.oppGoalX;
    if (Math.hypot(this.moveX, this.moveY) > 0.2 && this.moveX * p.team.dir > 0.2) {
      // The stick points up the pitch. Within the assist window of the goal mouth the shot is put on
      // the frame; clearly wider than that it follows the stick, only pulled a little toward goal.
      const ac = Math.atan2(CY - p.y, gx - p.x);
      const rs = angleDiff(ac, Math.atan2(this.moveY, this.moveX));
      const r1 = angleDiff(ac, Math.atan2(CY - half - p.y, gx - p.x));
      const r2 = angleDiff(ac, Math.atan2(CY + half - p.y, gx - p.x));
      const off = Math.max(0, Math.min(r1, r2) - rs, rs - Math.max(r1, r2));
      if (off > shotWindow()) {
        const rawY = clamp(p.y + (this.moveY / this.moveX) * (gx - p.x), CY - 500, CY + 500);
        const edge = clamp(rawY, CY - half, CY + half);
        return rawY + (edge - rawY) * ASSIST.shot;
      }
    }
    // Vertical stick picks the side: a full tilt (or a keyboard key) is the post, a partial tilt in between.
    if (Math.abs(this.moveY) > 0.3) return CY + clamp(this.moveY * 1.6, -1, 1) * half;
    return powered ? CY : farSideAim(p);
  }

  /** Reticle for the shot currently being charged: same aim as the release, and a lower spot while it is still a placed shot. */
  shotReticle(p: Player) {
    const hold = this.charge * SHOT_CHARGE_TIME;
    return { y: this.shotAimY(p, hold), z: hold < TAP_SHOT ? 12 : 8 + this.charge * 30 };
  }

  private updatePreview(p: Player) {
    const mag = Math.hypot(this.moveX, this.moveY);
    const directed = mag > 0.2;
    const dx = directed ? this.moveX : Math.cos(p.facing);
    const dy = directed ? this.moveY : Math.sin(p.facing);
    const target = passReceiver(p, dx, dy, directed);
    this.previewTarget = target;
    if (target) {
      this.previewPoint = null;
      return;
    }
    const n = Math.hypot(dx, dy) || 1;
    const len = 150 + (this.passHold > this.tapPass ? clamp((this.passHold - 0.1) / 0.8, 0, 1) : 0) * 420;
    this.previewPoint = {
      x: clamp(p.x + (dx / n) * len, 20, PITCH_L - 20),
      y: clamp(p.y + (dy / n) * len, 20, PITCH_W - 20),
    };
  }

  doPass(m: Match, p: Player, swipe: AimSwipe | null, hold: number) {
    const mag = Math.hypot(this.moveX, this.moveY);
    let dx = swipe ? swipe.dx : mag > 0.2 ? this.moveX : Math.cos(p.facing);
    let dy = swipe ? swipe.dy : mag > 0.2 ? this.moveY : Math.sin(p.facing);
    const directed = swipe !== null || mag > 0.2;
    const lofted = swipe ? swipe.power > 0.78 : hold > this.tapPass;
    const power = swipe ? swipe.power : clamp((hold - 0.1) / 0.8, 0, 1);
    // A stick or a swipe is an explicit aim: only a teammate in that direction is assisted.
    // Empty space is used only for that aim. An unaimed tap stays a smart pass, previewed first.
    const target = swipe ? choosePassTarget(p, dx, dy, 0.7) : passReceiver(p, dx, dy, directed);
    const throwing = m.state === 'taking' && m.restart?.type === 'throwin';
    const err = 0.028 * (1 + m.pressureOn(p) * 0.8) * passErrorMul();
    if (target) {
      // Meeting point: where the receiver will be when the ball gets there, with a capped lead so a
      // running teammate can keep his stride without the ball being played far ahead of him.
      const runLead = target.intent === 'run' ? 1 : 0.6;
      let tx = target.x;
      let ty = target.y;
      let v0 = 0;
      for (let i = 0; i < 2; i++) {
        const d = dist(p.x, p.y, tx, ty);
        v0 = swipe ? 330 + power * 600 : groundPassSpeed(d);
        const t = lofted ? clamp(d / 430, 0.6, 1.45) : groundTime(v0, d);
        let lx = target.vx * t * runLead;
        let ly = target.vy * t * runLead;
        const ll = Math.hypot(lx, ly);
        if (ll > MAX_PASS_LEAD) {
          lx *= MAX_PASS_LEAD / ll;
          ly *= MAX_PASS_LEAD / ll;
        }
        tx = target.x + lx;
        ty = target.y + ly;
      }
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

  /**
   * T: ground pass into the space ahead of a teammate further up the pitch. Prefers a runner going
   * forward, with room in front of him and a lane few defenders can cut. The faster he runs forward,
   * the more space it is played into. With nobody ahead, the ball goes into the space in front of
   * the carrier. The landing spot always stays on the pitch.
   */
  doThrough(m: Match, p: Player) {
    const team = p.team;
    const dir = team.dir;
    const mag = Math.hypot(this.moveX, this.moveY);
    const directed = mag > 0.2;
    let best: Player | null = null;
    let bestS = -0.7;
    let bx = 0;
    let by = 0;
    let bv = 0;
    for (const t of team.players) {
      if (t === p || t.isGK) continue;
      const ahead = (t.x - p.x) * dir;
      if (ahead < 15 || dist(p.x, p.y, t.x, t.y) > 700) continue;
      const fwd = t.vx * dir;
      let rx: number = dir;
      let ry = clamp((CY - t.y) / 700, -0.35, 0.35);
      if (fwd > 40) {
        rx = t.vx;
        ry = t.vy;
      }
      const rn = Math.hypot(rx, ry) || 1;
      rx /= rn;
      ry /= rn;
      const runSpeed = Math.max(0, t.vx * rx + t.vy * ry);
      let tx = t.x;
      let ty = t.y;
      let v0 = 0;
      for (let i = 0; i < 2; i++) {
        const d = dist(p.x, p.y, tx, ty);
        v0 = throughSpeed(m.ball.x, m.ball.y, tx, ty);
        const lead = clamp(runSpeed * groundTime(v0, d) * 0.9, THROUGH_LEAD_MIN, THROUGH_LEAD_MAX);
        tx = clamp(t.x + rx * lead, 50, PITCH_L - 50);
        ty = clamp(t.y + ry * lead, 35, PITCH_W - 35);
      }
      v0 = throughSpeed(m.ball.x, m.ball.y, tx, ty);
      const d = dist(p.x, p.y, tx, ty);
      const risk = laneRisk(team, p.x, p.y, tx, ty, v0, null);
      const space = clamp(nearestOpponentDist(team, tx, ty) / 140, 0, 1);
      let s = clamp(ahead / 300, 0, 1) * 0.8 + space * 1.2 - risk * 1.6 + clamp(fwd / 200, 0, 1) * 0.6;
      if (d > 520) s -= (d - 520) / 300;
      if (directed) {
        const cos = ((tx - p.x) * this.moveX + (ty - p.y) * this.moveY) / (d * mag);
        if (cos < 0.2) continue;
        s += cos * 1.2;
      }
      if (s > bestS) {
        bestS = s;
        best = t;
        bx = tx;
        by = ty;
        bv = v0;
      }
    }
    const err = 0.028 * (1 + m.pressureOn(p) * 0.8) * passErrorMul();
    if (best) {
      m.humanTeam!.controlled = best;
      passTo(m, p, bx, by, { target: best, error: err, speed: bv, through: true });
      return;
    }
    let dx: number = dir;
    let dy = 0;
    if (directed && this.moveX * dir > -0.3) {
      dx = this.moveX / mag;
      dy = this.moveY / mag;
    }
    const tx = clamp(p.x + dx * 200, 50, PITCH_L - 50);
    const ty = clamp(p.y + dy * 200, 35, PITCH_W - 35);
    passTo(m, p, tx, ty, { error: err, speed: throughSpeed(m.ball.x, m.ball.y, tx, ty, 150), through: true });
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
    let aimY: number;
    let power: number;
    let finesse = false;
    if (swipe) {
      power = Math.max(this.charge, swipe.power);
      // Swipe angle -> spot on the goal mouth: straight = centre, ~30° = post, steeper = wide.
      const ang = Math.atan2(swipe.dy, Math.max(0.05, swipe.dx * team.dir));
      aimY = CY + clamp(ang / 0.52, -1.5, 1.5) * (GOAL_HALF - 12);
      finesse = swipe.power < 0.45 && this.charge < 0.3;
    } else if (hold < TAP_SHOT) {
      // Controlled placed shot: lower pace, better accuracy, aimed away from the keeper unless directed.
      power = 0.5;
      finesse = true;
      aimY = this.shotAimY(p, hold);
    } else {
      power = clamp(hold / SHOT_CHARGE_TIME, 0, 1);
      aimY = this.shotAimY(p, hold);
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
    shoot(m, p, aimY, power, { finesse, error: 15 * shotErrorMul() });
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
    this.updatePreview(t);
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
    // Never override a manual switch the player just made.
    if (m.time - this.lastSwitch < 1.2) return;
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
 * Switch target: the outfield player most useful for the current action, not simply the nearest.
 * A teammate a pass is travelling to comes first; when defending, being able to get between the
 * carrier and goal counts as much as reaching the ball, and players left behind the play are
 * demoted. `rank` cycles through the next-best options on repeated presses.
 */
export function bestSwitch(team: Team, m: Match, exclude: Player | null, rank: number) {
  ranked.length = 0;
  rankedScore.length = 0;
  const b = m.ball;
  const carrier = b.owner && b.owner.team !== team ? b.owner : null;
  const receiver = b.free && b.passTarget && b.passTarget.team === team ? b.passTarget : null;
  for (const p of team.players) {
    if (p.isGK || p === exclude) continue;
    let s = interceptTime(p, m);
    if (p === receiver) s -= 0.7;
    if (carrier) {
      // Goal-side blocking point a third of the way from the carrier to our goal.
      const gx = carrier.x + (team.ownGoalX - carrier.x) * 0.3;
      const gy = carrier.y + (CY - carrier.y) * 0.3;
      const tg = dist(p.x, p.y, gx, gy) / (p.maxSpeed(false) + 1);
      s = s * 0.55 + tg * 0.45;
      if (team.local(p.x) < team.local(carrier.x)) s -= 0.25;
      else if (team.local(p.x) > team.local(carrier.x) + 0.08) s += 0.35;
    }
    if (p.busy) s += 0.6;
    let i = 0;
    while (i < rankedScore.length && rankedScore[i] <= s) i++;
    ranked.splice(i, 0, p);
    rankedScore.splice(i, 0, s);
  }
  if (ranked.length === 0) return exclude;
  return ranked[rank % ranked.length];
}

/**
 * Who an assisted pass goes to.
 * Directed (stick held): only a teammate within about 66° of the stick. Nobody there means the
 * pass goes into the space being aimed at, never to a teammate behind the aim.
 * Undirected tap: the best teammate ahead, or a close support player, and the preview shows which.
 */
export function passReceiver(p: Player, dx: number, dy: number, directed: boolean) {
  if (directed) return choosePassTarget(p, dx, dy, passConeCos()) ?? nearbyTeammate(p, dx, dy);
  return choosePassTarget(p, dx, dy, 0.15) ?? choosePassTarget(p, dx, dy, -0.2);
}

/** A close teammate just outside the aimed cone: found rather than playing the ball past him into nothing. */
function nearbyTeammate(p: Player, dx: number, dy: number) {
  const n = Math.hypot(dx, dy) || 1;
  const minCos = passConeCos() - 0.35;
  const maxD = passRescueDist();
  let best: Player | null = null;
  let bd = maxD;
  for (const t of p.team.players) {
    if (t === p || t.isGK) continue;
    const d = dist(p.x, p.y, t.x, t.y);
    if (d < 40 || d > bd) continue;
    if (((t.x - p.x) * dx + (t.y - p.y) * dy) / (d * n) < minCos) continue;
    bd = d;
    best = t;
  }
  return best;
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

/**
 * Launch speed of a through ball to (tx, ty). It reaches its spot a little softer than a pass to
 * feet so the runner can take it in stride, and near a line it arrives slowly enough to stop on the pitch.
 */
function throughSpeed(ax: number, ay: number, tx: number, ty: number, arrive?: number) {
  const d = dist(ax, ay, tx, ty) || 1;
  const ux = (tx - ax) / d;
  const uy = (ty - ay) / d;
  const roomX = ux > 0.01 ? (PITCH_L - tx) / ux : ux < -0.01 ? tx / -ux : 1e4;
  const roomY = uy > 0.01 ? (PITCH_W - ty) / uy : uy < -0.01 ? ty / -uy : 1e4;
  // Past its spot the ball rolls at most about v / GROUND_K further.
  const va = Math.min(arrive ?? 200 + d * 0.18, Math.max(20, Math.min(roomX, roomY) - 15) * GROUND_K);
  return clamp(va + d * PASS_K + (ROLL_DECEL * d) / 380, 50, 900);
}

/** Aim at the post the keeper is not covering. */
export function farSideAim(p: Player) {
  const k = p.team.opp.keeper;
  return k.y > CY ? CY - (GOAL_HALF - 16) : CY + (GOAL_HALF - 16);
}
