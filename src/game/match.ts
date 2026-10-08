import { resolveSlide, shoot, throwIn } from './actions';
import { aiTakeRestart, choosePlan, shotQuality, updateTeamAI } from './ai';
import { Ball } from './ball';
import { Camera } from './camera';
import { BALL_R, CONTROL_DIST, CX, CY, GOAL_HALF, KEEPER_HOLD_LIMIT, PITCH_L, PITCH_W, PLAYER_H, PLAYER_R } from './constants';
import { Effects } from './effects';
import { keeperContact, updateKeeper } from './goalkeeper';
import { farSideAim, HumanController } from './human';
import { clamp, damp, dist, rand } from './math';
import type { Player } from './player';
import { AI_PROFILES, TEAMMATE_PROFILE } from './profiles';
import { awardRestart, checkBall, computeRestartTargets, enforceRestartDistance, foul, goalFrame, inPenaltyArea, type Restart } from './rules';
import { AWAY_CONFIG, HOME_CONFIG, Team } from './team';
import { createInput, type AttackPlan, type Difficulty, type HudSnapshot, type InputState, type KickKind, type MatchState, type RestartType, type SfxName } from './types';

export interface MatchOptions {
  difficulty: Difficulty;
  minutes: number;
  /** Attract mode: both teams are AI-controlled (menu background). */
  demo?: boolean;
}

const NO_INPUT = createInput();

export class Match {
  readonly home: Team;
  readonly away: Team;
  readonly teams: Team[];
  readonly all: Player[] = [];
  readonly ball = new Ball();
  readonly effects = new Effects();
  readonly camera = new Camera();
  readonly human = new HumanController();

  difficulty: Difficulty;
  demo: boolean;
  /** Real seconds of play for the full match. */
  duration: number;

  state: MatchState = 'setup';
  stateTimer = 0;
  restart: Restart | null = null;
  time = 0;
  clock = 0;
  half: 1 | 2 = 1;
  firstKickoff: Team;
  lastPossession: Team | null = null;
  lastScorer: Player | null = null;
  lastGoalOwn = false;
  netCooldown = 0;
  excitement = 0.3;
  finished = false;

  readonly restartCount: Record<RestartType, number> = { kickoff: 0, throwin: 0, corner: 0, goalkick: 0, freekick: 0, penalty: 0 };
  readonly planCount: Record<AttackPlan, number> = { build: 0, direct: 0, wing: 0, counter: 0 };
  readonly kickCount: Record<KickKind, number> = { none: 0, pass: 0, lob: 0, cross: 0, shot: 0, clear: 0, throw: 0, dribble: 0, deflect: 0, parry: 0 };
  readonly kickCompleted: Record<KickKind, number> = { none: 0, pass: 0, lob: 0, cross: 0, shot: 0, clear: 0, throw: 0, dribble: 0, deflect: 0, parry: 0 };
  possessionChanges = 0;
  goalsLog: { team: string; scorer: string; minute: number }[] = [];

  sfx: (name: SfxName) => void = () => {};

  constructor(o: MatchOptions) {
    this.difficulty = o.difficulty;
    this.demo = o.demo ?? false;
    this.duration = Math.max(60, o.minutes * 60);
    this.home = new Team(HOME_CONFIG, 1, this.demo ? AI_PROFILES.pro : TEAMMATE_PROFILE);
    this.away = new Team(AWAY_CONFIG, -1, this.demo ? AI_PROFILES.pro : AI_PROFILES[o.difficulty]);
    this.home.opp = this.away;
    this.away.opp = this.home;
    this.home.human = !this.demo;
    this.teams = [this.home, this.away];
    for (const t of this.teams) for (const p of t.players) this.all.push(p);
    this.firstKickoff = this.home;
  }

  get humanTeam(): Team | null {
    return this.demo ? null : this.home;
  }

  start() {
    this.time = 0;
    this.clock = 0;
    this.half = 1;
    this.finished = false;
    this.lastPossession = null;
    this.lastScorer = null;
    this.possessionChanges = 0;
    this.goalsLog = [];
    for (const k of Object.keys(this.restartCount) as RestartType[]) this.restartCount[k] = 0;
    for (const k of Object.keys(this.planCount) as AttackPlan[]) this.planCount[k] = 0;
    for (const k of Object.keys(this.kickCount) as KickKind[]) {
      this.kickCount[k] = 0;
      this.kickCompleted[k] = 0;
    }
    this.home.dir = 1;
    this.away.dir = -1;
    this.home.resetMatchState();
    this.away.resetMatchState();
    this.effects.clear();
    this.human.reset();
    this.ball.place(CX, CY);
    this.ball.lastTouch = null;
    this.firstKickoff = this.demo && Math.random() < 0.5 ? this.away : this.home;
    awardRestart(this, 'kickoff', this.firstKickoff, CX, CY);
    this.snapToRestart();
    this.camera.snap(CX, CY);
  }

  /* ----------------------------- Queries ----------------------------- */

  pressureOn(p: Player) {
    let d = 999;
    for (const o of p.team.opp.players) {
      const od = dist(o.x, o.y, p.x, p.y);
      if (od < d) d = od;
    }
    return clamp(1 - (d - 18) / 90, 0, 1);
  }

  foulChance(t: Player, victim: Player, mult: number) {
    const base = t.team.human ? 0.16 : t.team.profile.foulRisk;
    return clamp(base * mult * (inPenaltyArea(t.team, victim.x, victim.y) ? 0.8 : 1), 0, 0.9);
  }

  get matchMinute() {
    return Math.min(90, Math.floor((this.clock / this.duration) * 90));
  }

  clockText() {
    const s = Math.floor((this.clock / this.duration) * 5400);
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  /* ----------------------------- Events ------------------------------ */

  gainPossession(p: Player) {
    const b = this.ball;
    const team = p.team;
    const completed = b.kicker && b.kicker.team === team && b.kicker !== p && (b.kind === 'pass' || b.kind === 'lob' || b.kind === 'cross' || b.kind === 'throw');
    p.receivedFrom = completed ? b.kicker : null;
    if (completed) {
      team.stats.passesCompleted++;
      this.kickCompleted[b.kind]++;
    }
    if (this.lastPossession !== team) {
      team.progressMark = team.local(p.x);
      team.circulation = 0;
    } else if (team.local(p.x) > team.progressMark + 0.05) {
      team.progressMark = team.local(p.x);
      team.circulation = 0;
    } else if (completed) {
      team.circulation++;
    }
    b.owner = p;
    b.held = false;
    b.holdTime = 0;
    b.vx = b.vy = b.vz = 0;
    b.z = 0;
    b.kind = 'none';
    b.passTarget = null;
    b.kicker = null;
    b.lastTouch = p;
    b.ownerLock = 0.32;
    p.holdTimer = 0;
    p.think = rand(0.08, 0.22);
    p.intent = 'carry';
    p.dribbleX = Math.cos(p.facing);
    p.dribbleY = Math.sin(p.facing);
    if (this.lastPossession !== p.team) {
      p.team.wonAt = this.time;
      if (this.lastPossession) this.lastPossession.lostAt = this.time;
      this.possessionChanges++;
      choosePlan(p.team, this, true);
      this.planCount[p.team.plan]++;
    }
    this.lastPossession = p.team;
    if (p.team.human && !p.isGK) p.team.controlled = p;
    if (p.isGK) p.gk!.distributeTimer = rand(0.5, 1.1);
    this.sfx('touch');
  }

  keeperCatch(k: Player) {
    const wasShot = this.ball.kind === 'shot';
    this.gainPossession(k);
    this.ball.held = true;
    k.gk!.distributeTimer = rand(1.0, 2.4) + (k.team.plan === 'build' ? 0.6 : 0);
    const careless = Math.random() < k.team.profile.keeper.errorChance * 0.7;
    k.gk!.releaseBy = careless ? rand(7.4, 8.8) : 5.5;
    if (careless) k.gk!.distributeTimer = k.gk!.releaseBy;
    k.gk!.state = 'set';
    this.sfx('catch');
    if (wasShot) this.effects.showBanner('ARRÊT !', k.name, '#38bdf8', 1.1);
  }

  onKick(p: Player, kind: KickKind, target: Player | null) {
    this.kickCount[kind]++;
    if (kind === 'pass' || kind === 'lob' || kind === 'cross' || kind === 'throw') p.team.stats.passes++;
    this.sfx(kind === 'throw' ? 'throw' : kind === 'clear' ? 'kick' : 'pass');
    this.effects.kickRing(this.ball.x, this.ball.y, 10);
    if (target && p.team.human && !this.demo && !target.isGK) p.team.controlled = target;
    if (!p.team.human && !this.demo) this.human.autoSwitch(this);
    this.lastPossession = p.team;
  }

  onShot(p: Player, power: number) {
    this.kickCount.shot++;
    this.sfx(power > 0.78 ? 'power' : 'shot');
    this.effects.kickRing(this.ball.x, this.ball.y, 18);
    this.effects.dust(p.x, p.y, 6, 1.2);
    if (power > 0.78) this.effects.addShake(3.5);
    this.excitement = Math.min(1, this.excitement + 0.4);
    this.lastPossession = p.team;
  }

  callFoul(offender: Player, victim: Player) {
    if (this.state !== 'live') return;
    foul(this, offender, victim);
  }

  throwTo(p: Player, tx: number, ty: number, target: Player | null, long: boolean) {
    throwIn(this, p, tx, ty, target, long);
  }

  scoreGoal(team: Team) {
    const b = this.ball;
    team.score++;
    const scorer = b.lastTouch;
    const own = scorer !== null && scorer.team !== team;
    if (b.kind === 'shot' && b.kicker?.team === team && !b.savedBy) team.stats.onTarget++;
    this.lastScorer = scorer;
    this.lastGoalOwn = own;
    this.goalsLog.push({ team: team.short, scorer: scorer ? scorer.name : '—', minute: Math.max(1, this.matchMinute) });
    this.state = 'goal';
    this.stateTimer = 3.4;
    this.restart = null;
    b.passTarget = null;
    this.sfx('goal');
    this.effects.confetti(team.oppGoalX, CY, [team.kit.primary, team.kit.secondary, '#ffffff']);
    this.effects.addFlash(0.55, team.kit.primary);
    this.effects.addShake(10);
    this.effects.showBanner('BUT !', own ? `${scorer!.name} (c.s.c.)` : scorer ? `${scorer.name} · ${team.short}` : team.name, team.side === 'home' ? '#60a5fa' : '#f87171', 3);
    this.excitement = 1;
    if (scorer && !own) scorer.celebrate = 3.2;
  }

  restartTaken() {
    this.state = 'live';
    const r = this.restart;
    this.restart = null;
    if (r) r.taker.kickCd = Math.max(r.taker.kickCd, 0.3);
    for (const t of this.teams) t.tacticTimer = 0;
  }

  /* ------------------------------ Update ----------------------------- */

  update(dt: number, input: InputState = NO_INPUT) {
    if (this.finished && this.state === 'fulltime') {
      this.stateTimer += dt;
      this.effects.update(dt);
      this.updateCamera(dt);
      for (const p of this.all) {
        p.stop();
        p.integrate(dt, false);
      }
      return;
    }
    this.time += dt;
    if (this.netCooldown > 0) this.netCooldown -= dt;
    this.effects.update(dt);
    this.excitement = damp(this.excitement, this.baseExcitement(), 0.8, dt);

    switch (this.state) {
      case 'setup':
        this.updateSetup(dt, input);
        break;
      case 'taking':
        this.updateTaking(dt, input);
        break;
      case 'live':
        this.updateLive(dt, input);
        break;
      case 'goal':
        this.updateGoal(dt);
        break;
      case 'halftime':
        this.updateHalftime(dt);
        break;
      default:
        break;
    }
    this.updateCamera(dt);
  }

  private baseExcitement() {
    const b = this.ball;
    const d = Math.min(Math.abs(b.x), Math.abs(PITCH_L - b.x));
    return 0.25 + clamp(1 - d / 500, 0, 1) * 0.45;
  }

  private tickClock(dt: number) {
    this.clock += dt;
    if (this.half === 1 && this.clock >= this.duration / 2) {
      this.clock = this.duration / 2;
      this.state = 'halftime';
      this.stateTimer = 3;
      this.restart = null;
      this.ball.owner = null;
      this.sfx('whistleLong');
      this.effects.showBanner('MI-TEMPS', `${this.home.short} ${this.home.score} - ${this.away.score} ${this.away.short}`, '#e2e8f0', 3);
      return true;
    }
    if (this.half === 2 && this.clock >= this.duration) {
      this.clock = this.duration;
      this.state = 'fulltime';
      this.finished = true;
      this.stateTimer = 0;
      this.restart = null;
      this.ball.owner = null;
      this.sfx('whistleLong');
      this.effects.showBanner('FIN DU MATCH', `${this.home.short} ${this.home.score} - ${this.away.score} ${this.away.short}`, '#e2e8f0', 4);
      return true;
    }
    return false;
  }

  private updateSetup(dt: number, input: InputState) {
    const r = this.restart!;
    this.stateTimer -= dt;
    const b = this.ball;
    b.owner = null;
    b.px = b.x;
    b.py = b.y;
    b.x = damp(b.x, r.x, 5, dt);
    b.y = damp(b.y, r.y, 5, dt);
    b.z = damp(b.z, 0, 6, dt);
    for (const p of this.all) {
      p.boost = 1.7;
      p.steerTo(p.tx, p.ty, 1, true, 30);
      p.integrate(dt, false);
      p.faceTowards(b.x, b.y);
    }
    if (!this.demo) this.human.update(dt, input, this);
    if (this.stateTimer <= 0) this.beginTaking();
  }

  snapToRestart() {
    for (const p of this.all) {
      p.x = p.tx;
      p.y = p.ty;
      p.vx = p.vy = 0;
      p.boost = 1;
    }
    const r = this.restart;
    if (r) for (const p of this.all) p.faceTowards(r.x, r.y);
  }

  private beginTaking() {
    const r = this.restart!;
    computeRestartTargets(this);
    this.snapToRestart();
    const b = this.ball;
    b.place(r.x, r.y);
    b.owner = r.taker;
    b.lastTouch = r.taker;
    b.ownerLock = 99;
    b.held = r.type === 'throwin';
    this.lastPossession = r.team;
    r.taker.faceTowards(r.type === 'throwin' ? r.x + r.team.dir * 60 : r.team.oppGoalX, r.type === 'throwin' ? CY : CY);
    if (r.type === 'kickoff') r.taker.faceTowards(r.team.players[2].x, r.team.players[2].y);
    r.timer = r.type === 'penalty' ? rand(1.1, 1.8) : r.type === 'kickoff' ? rand(0.5, 0.9) : rand(0.6, 1.3) + (1 - r.team.profile.positioning) * 0.4;
    this.state = 'taking';
    this.human.takingTimer = 0;
    if (r.team.human && !r.taker.isGK) r.team.controlled = r.taker;
    if (r.type === 'kickoff' || r.type === 'penalty') this.sfx('whistle');
  }

  private humanTakes() {
    const r = this.restart;
    return !!r && !this.demo && r.team === this.home && r.type !== 'goalkick';
  }

  private updateTaking(dt: number, input: InputState) {
    const r = this.restart!;
    if (this.tickClock(dt)) return;
    const b = this.ball;
    b.owner = r.taker;
    b.ownerLock = 99;
    r.taker.x = r.taker.tx;
    r.taker.y = r.taker.ty;
    r.taker.vx = r.taker.vy = 0;
    for (const t of this.teams) updateTeamAI(t, this, dt);
    for (const t of this.teams) updateKeeper(t.keeper, this, dt);
    if (!this.demo) this.human.update(dt, input, this);
    for (const p of this.all) {
      if (p === r.taker) continue;
      p.boost = 1;
      p.integrate(dt, false);
    }
    enforceRestartDistance(this);
    this.attachBall(dt);
    if (this.state !== 'taking') {
      b.ownerLock = 0;
      return;
    }
    if (!this.humanTakes()) {
      r.timer -= dt;
      if (r.timer <= 0) {
        b.ownerLock = 0;
        aiTakeRestart(r.taker, this);
        this.restartTaken();
      }
    }
  }

  private updateLive(dt: number, input: InputState) {
    if (this.tickClock(dt)) return;
    const b = this.ball;
    if (!this.demo) this.human.update(dt, input, this);
    if (this.state !== 'live') return;
    for (const t of this.teams) updateTeamAI(t, this, dt);
    if (this.state !== 'live') return;
    for (const t of this.teams) updateKeeper(t.keeper, this, dt);
    if (this.state !== 'live') return;

    for (const p of this.all) {
      if (p.gk && (p.gk.state === 'dive' || p.gk.state === 'down')) {
        p.integrate(0, false);
        continue;
      }
      p.boost = 1;
      p.integrate(dt, b.owner === p);
      if (p.slide > 0) resolveSlide(this, p);
      if (this.state !== 'live') return;
    }
    this.collidePlayers();
    if (b.owner) {
      this.attachBall(dt);
      b.update(dt);
    } else {
      b.update(dt);
      goalFrame(this, dt);
    }
    if (!b.owner) this.ballContacts();
    if (this.state !== 'live') return;
    if (checkBall(this)) return;

    if (b.owner) {
      b.owner.team.stats.possession += dt;
      if (b.held) {
        b.holdTime += dt;
        if (b.holdTime > KEEPER_HOLD_LIMIT) {
          // IFAB: holding the ball longer than 8 seconds -> corner kick to the opponents.
          const k = b.owner;
          const opp = k.team.opp;
          this.effects.showBanner('8 SECONDES !', 'Corner pour ' + opp.short, '#f97316', 1.6);
          awardRestart(this, 'corner', opp, k.team.ownGoalX === 0 ? 4 : PITCH_L - 4, k.y < CY ? 4 : PITCH_W - 4);
          return;
        }
      }
    }
  }

  private updateGoal(dt: number) {
    this.stateTimer -= dt;
    const b = this.ball;
    b.update(dt);
    goalFrame(this, dt);
    const scorer = this.lastScorer;
    for (const p of this.all) {
      if (scorer && !this.lastGoalOwn && p.team === scorer.team && !p.isGK) {
        if (p === scorer) p.steerTo(scorer.team.oppGoalX - scorer.team.dir * 120, scorer.y < CY ? 60 : PITCH_W - 60, 0.8, false, 40);
        else p.steerTo(scorer.x, scorer.y, 1, true, 40);
        p.celebrate = Math.max(p.celebrate, 0.2);
      } else {
        p.steerTo(p.x + (CX - p.x) * 0.3, p.y, 0.3, false);
      }
      p.integrate(dt, false);
    }
    this.collidePlayers();
    if (this.stateTimer <= 0) {
      const conceded = this.home.score + this.away.score > 0 && scorer ? (this.lastGoalOwn ? scorer.team : scorer.team.opp) : this.home;
      awardRestart(this, 'kickoff', conceded, CX, CY);
    }
  }

  private updateHalftime(dt: number) {
    this.stateTimer -= dt;
    for (const p of this.all) {
      p.steerTo(p.x, p.y, 0, false);
      p.integrate(dt, false);
    }
    this.ball.update(dt);
    if (this.stateTimer <= 0) {
      this.half = 2;
      this.home.dir = this.home.dir > 0 ? -1 : 1;
      this.away.dir = this.away.dir > 0 ? -1 : 1;
      for (const p of this.all) p.stamina = Math.min(1, p.stamina + 0.5);
      const kick = this.firstKickoff.opp;
      awardRestart(this, 'kickoff', kick, CX, CY);
      this.snapToRestart();
      this.ball.place(CX, CY);
      this.camera.snap(CX, CY);
    }
  }

  /* ------------------------------ Physics ---------------------------- */

  attachBall(dt: number) {
    const b = this.ball;
    const p = b.owner;
    if (!p) return;
    const fx = Math.cos(p.facing);
    const fy = Math.sin(p.facing);
    b.px = b.x;
    b.py = b.y;
    if (b.held) {
      b.x = p.x + fx * 6;
      b.y = p.y + fy * 6;
      b.z = this.restart?.type === 'throwin' ? PLAYER_H + 4 : 20;
      b.followOwner(dt, 0, 0);
      return;
    }
    const moving = p.speed > 40 ? 1 : 0;
    const off = PLAYER_R + BALL_R + 1 + (p.sprint ? 6 : 2) + Math.sin(p.anim * 1.3) * 2.2 * moving;
    b.x = p.x + fx * off;
    b.y = p.y + fy * off;
    b.z = 0;
    b.vx = p.vx;
    b.vy = p.vy;
    b.followOwner(dt, p.vx, p.vy);
  }

  private collidePlayers() {
    const all = this.all;
    const min = PLAYER_R * 2;
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      for (let j = i + 1; j < all.length; j++) {
        const c = all[j];
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        // Ball carriers shield: they are displaced less than the challenger.
        const wa = this.ball.owner === a ? 0.35 : this.ball.owner === c ? 1.65 : 1;
        const wc = 2 - wa;
        a.x -= nx * push * wa;
        a.y -= ny * push * wa;
        c.x += nx * push * wc;
        c.y += ny * push * wc;
      }
    }
  }

  private ballContacts() {
    const b = this.ball;
    // The ball needs a moment to leave the kicker's foot before anyone can touch it.
    if (b.kickAge < 0.07 && b.kind !== 'deflect' && b.kind !== 'parry') return;
    for (const t of this.teams) {
      if (keeperContact(t.keeper, this)) return;
    }
    let best: Player | null = null;
    let bestD = 1e9;
    const bs = b.speed;
    for (const p of this.all) {
      if (p.isGK) continue;
      if (p.stun > 0 && p.slide <= 0) continue;
      if (p.slide > 0) continue;
      if (b.kicker === p && p.kickCd > 0) continue;
      // A teammate standing on the path does not kill a through ball in the first moments.
      // The runner himself is meant to take it as it arrives.
      if (b.through && b.passTarget && p !== b.passTarget && b.kicker !== null && b.kicker.team === p.team && b.speed > 180 && b.kickAge < 0.45 && b.z < 22) {
        continue;
      }
      const reach = CONTROL_DIST + (b.passTarget === p ? 5 : 0);
      const d = dist(p.x, p.y, b.x, b.y);
      if (d > reach || b.z > PLAYER_H + 6) continue;
      // A moving ball can only be met from in front: once it is past a player he has to chase it.
      // The runner of a through ball is the exception: he takes it as he arrives on the pocket, from behind.
      const ontoThrough = b.through && b.passTarget === p && dist(b.x, b.y, b.passTargetX, b.passTargetY) < 80;
      if (bs > 150 && ((p.x - b.x) * b.vx + (p.y - b.y) * b.vy) / bs < -3 && !ontoThrough) continue;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return;
    const p = best;
    const speed = b.speed;
    const humanCtl = !this.demo && p.team.human && p.team.controlled === p;

    if (humanCtl && this.human.tryOneTouch(this, p)) return;

    // AI first-time finish on crosses / cut-backs inside the box.
    if (!humanCtl && b.kicker && b.kicker.team === p.team && (b.kind === 'cross' || b.kind === 'pass' || b.kind === 'lob') && p.team.local(p.x) > 0.8) {
      const q = shotQuality(p, this);
      if (q > 0.35 && Math.random() < 0.6) {
        const header = b.z > 22;
        aiShootNow(this, p, header);
        return;
      }
    }

    if (b.z > 28 && b.passTarget === p && b.z < PLAYER_H + 4 && b.speed < 700) {
      // Intended receiver of a lofted ball takes it down on the chest.
      this.gainPossession(p);
      return;
    }
    if (b.z > 28) {
      // High ball: defenders head clear, attackers cushion it down.
      if (b.lastTouch && b.lastTouch.team !== p.team && p.team.local(p.x) < 0.4 && !humanCtl) {
        const a = p.team.dir > 0 ? rand(-0.8, 0.8) : Math.PI + rand(-0.8, 0.8);
        b.kick(p, Math.cos(a) * rand(260, 380), Math.sin(a) * rand(260, 380), rand(120, 220), 'clear');
        p.kickCd = 0.2;
        p.kickAnim = 0.2;
        this.sfx('kick');
        this.lastPossession = p.team;
        return;
      }
      b.vx *= 0.25;
      b.vy *= 0.25;
      b.vz = -40;
      b.lastTouch = p;
      return;
    }

    // Intended receivers cushion hard passes; anyone else only controls slower balls, otherwise it is a block.
    const intended = b.passTarget === p;
    const sameTeam = b.kicker !== null && b.kicker.team === p.team;
    let threshold = intended ? 840 + p.dribbleStat * 80 : sameTeam ? 520 : 400 + p.dribbleStat * 60;
    if (b.kind === 'shot' && b.kicker && b.kicker.team !== p.team) threshold = 340;
    if (b.kind === 'dribble' || b.kind === 'deflect' || b.kind === 'parry') threshold = Math.max(threshold, 520);
    if (speed <= threshold) {
      this.gainPossession(p);
      return;
    }
    // Too hot to control: deflection off the body.
    const nx = (b.x - p.x) / (bestD || 1);
    const ny = (b.y - p.y) / (bestD || 1);
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx = (b.vx - 2 * vn * nx) * 0.42 + rand(-40, 40);
      b.vy = (b.vy - 2 * vn * ny) * 0.42 + rand(-40, 40);
      b.vz = rand(20, 120);
    } else {
      b.vx *= 0.6;
      b.vy *= 0.6;
    }
    if (b.kind === 'shot') this.effects.showBanner('CONTRÉ !', p.name, '#a3e635', 0.9);
    b.lastTouch = p;
    b.kind = 'deflect';
    b.kicker = p;
    b.kickAge = 0;
    b.passTarget = null;
    p.kickCd = 0.15;
    this.sfx('touch');
    this.effects.dust(b.x, b.y, 3);
  }

  /* ------------------------------ Camera ----------------------------- */

  private updateCamera(dt: number) {
    const b = this.ball;
    let fx = b.x;
    let fy = b.y;
    const owner = b.owner;
    if (this.state === 'setup' && this.restart) {
      fx = this.restart.x;
      fy = this.restart.y;
    } else if (this.state === 'goal' && this.lastScorer) {
      fx = (b.x + this.lastScorer.x) / 2;
      fy = (b.y + this.lastScorer.y) / 2;
    } else if (owner) {
      // Lead into the space ahead, more so on a counter-attack running at speed.
      const counter = owner.team.plan === 'counter' && owner.vx * owner.team.dir > 120 ? 1 : 0;
      fx += owner.vx * 0.45 + owner.team.dir * (90 + counter * 110);
      fy += owner.vy * 0.3;
    } else {
      fx += clamp(b.vx * 0.3, -200, 200);
      fy += clamp(b.vy * 0.2, -120, 120);
    }
    // Near a goal keep the frame and the goal mouth both visible.
    const nearGoal = Math.min(Math.abs(b.x), Math.abs(PITCH_L - b.x)) < 320;
    if (nearGoal) fy = damp(fy, CY, 1, 0.5);
    const fast = clamp((owner ? owner.speed / 500 : b.speed / 900), 0, 1);
    this.camera.update(dt, fx, fy, fast, this.effects.shake);
  }

  /* ------------------------------- HUD ------------------------------- */

  hud(): HudSnapshot {
    const team = this.home;
    const p = this.demo ? null : team.controlled;
    const totalPos = this.home.stats.possession + this.away.stats.possession;
    const r = this.restart;
    return {
      homeScore: this.home.score,
      awayScore: this.away.score,
      homeName: this.home.name,
      awayName: this.away.name,
      homeShort: this.home.short,
      awayShort: this.away.short,
      homeColor: this.home.kit.primary,
      awayColor: this.away.kit.primary,
      clock: this.clockText(),
      half: this.half,
      state: this.state,
      possessionHome: totalPos > 0 ? this.home.stats.possession / totalPos : 0.5,
      hasBall: !!p && this.ball.owner === p,
      defending: !!this.ball.owner && this.ball.owner.team !== team,
      activeNumber: p ? p.number : null,
      activeName: p ? p.name : '',
      activeRole: p ? p.role : null,
      stamina: p ? p.stamina : 1,
      restartLabel: r ? r.type : null,
      humanTaking: this.state === 'taking' && this.humanTakes(),
      keeperHold: this.ball.held && this.state === 'live' ? this.ball.holdTime : 0,
      keeperHuman: this.ball.held && this.state === 'live' && this.ball.owner === team.keeper && !this.demo,
    };
  }
}

function aiShootNow(m: Match, p: Player, header: boolean) {
  const aim = Math.random() < 0.6 ? farSideAim(p) : CY + rand(-GOAL_HALF + 15, GOAL_HALF - 15);
  shoot(m, p, aim, rand(0.6, 0.95), { header, error: p.team.profile.shotError * 1.1, aimZ: header ? rand(8, 50) : undefined });
}
