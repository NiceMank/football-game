import { ACCEL, DRIBBLE_MULT, PITCH_L, PITCH_W, RUN_SPEED, SPRINT_MULT } from './constants';
import type { KeeperBrain } from './goalkeeper';
import { angleDiff, clamp } from './math';
import type { Team } from './team';
import type { Intent, Role } from './types';

const SLIDE_TIME = 0.42;
const SLIDE_SPEED = 370;

export class Player {
  readonly team: Team;
  readonly index: number;
  readonly role: Role;
  readonly number: number;
  readonly name: string;
  /** Wide midfielders play on one flank: -1 top, +1 bottom, 0 central. */
  readonly flank: -1 | 0 | 1;
  readonly speedStat: number;
  readonly shotStat: number;
  readonly passStat: number;
  readonly dribbleStat: number;

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  facing = 0;
  /** Desired movement (magnitude 0..1) set by AI or human control each step. */
  wantX = 0;
  wantY = 0;
  sprint = false;
  stamina = 1;
  /** Movement speed multiplier override (used for restarts setup). */
  boost = 1;

  stun = 0;
  kickCd = 0;
  tackleCd = 0;
  slide = 0;
  slideDx = 0;
  slideDy = 0;
  slideWon = false;
  slideFouled = false;
  kickAnim = 0;
  celebrate = 0;
  anim = Math.random() * 10;

  // AI state
  intent: Intent = 'idle';
  think = Math.random() * 0.4;
  tx = 0;
  ty = 0;
  tSprint = false;
  runTimer = 0;
  noiseX = 0;
  noiseY = 0;
  markTarget: Player | null = null;
  holdTimer = 0;
  /** Teammate who passed this player the ball (avoids instant ping-pong). */
  receivedFrom: Player | null = null;
  dribbleX = 0;
  dribbleY = 0;
  tackleThink = 0;

  gk: KeeperBrain | null = null;

  constructor(team: Team, index: number, role: Role, number: number, name: string, flank: -1 | 0 | 1, stats: { speed: number; shot: number; pass: number; dribble: number }) {
    this.team = team;
    this.index = index;
    this.role = role;
    this.number = number;
    this.name = name;
    this.flank = flank;
    this.speedStat = stats.speed;
    this.shotStat = stats.shot;
    this.passStat = stats.pass;
    this.dribbleStat = stats.dribble;
  }

  get isGK() {
    return this.role === 'GK';
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  get busy() {
    return this.stun > 0 || this.slide > 0;
  }

  maxSpeed(hasBall: boolean) {
    let s = RUN_SPEED * this.speedStat * this.boost;
    // A tiring player loses his sprint gradually, then some of his normal pace.
    if (this.sprint) s *= 1 + (SPRINT_MULT - 1) * clamp((this.stamina - 0.04) / 0.36, 0, 1);
    if (hasBall) s *= DRIBBLE_MULT;
    if (this.stamina < 0.25) s *= 0.86 + 0.56 * this.stamina;
    return s;
  }

  steerTo(tx: number, ty: number, urgency = 1, sprint = false, arrive = 28) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    this.sprint = sprint;
    if (d < 2) {
      this.wantX = 0;
      this.wantY = 0;
      return d;
    }
    const m = Math.min(1, d / arrive) * urgency;
    this.wantX = (dx / d) * m;
    this.wantY = (dy / d) * m;
    return d;
  }

  steerDir(dx: number, dy: number, magnitude: number, sprint: boolean) {
    const d = Math.hypot(dx, dy);
    this.sprint = sprint;
    if (d < 1e-4) {
      this.wantX = 0;
      this.wantY = 0;
      return;
    }
    const m = Math.min(1, magnitude);
    this.wantX = (dx / d) * m;
    this.wantY = (dy / d) * m;
  }

  stop() {
    this.wantX = 0;
    this.wantY = 0;
    this.sprint = false;
  }

  faceTowards(x: number, y: number) {
    this.facing = Math.atan2(y - this.y, x - this.x);
  }

  startSlide(dx: number, dy: number) {
    const d = Math.hypot(dx, dy) || 1;
    this.slideDx = dx / d;
    this.slideDy = dy / d;
    this.slide = SLIDE_TIME;
    this.slideWon = false;
    this.slideFouled = false;
    this.facing = Math.atan2(this.slideDy, this.slideDx);
    this.stamina = Math.max(0, this.stamina - 0.08);
  }

  integrate(dt: number, hasBall: boolean) {
    if (this.kickCd > 0) this.kickCd -= dt;
    if (this.tackleCd > 0) this.tackleCd -= dt;
    if (this.kickAnim > 0) this.kickAnim -= dt;
    if (this.celebrate > 0) this.celebrate -= dt;

    if (this.slide > 0) {
      this.slide -= dt;
      const k = clamp(this.slide / SLIDE_TIME, 0, 1);
      this.vx = this.slideDx * SLIDE_SPEED * (0.35 + 0.65 * k);
      this.vy = this.slideDy * SLIDE_SPEED * (0.35 + 0.65 * k);
      if (this.slide <= 0) this.stun = Math.max(this.stun, 0.42);
    } else if (this.stun > 0) {
      this.stun -= dt;
      const f = Math.exp(-7 * dt);
      this.vx *= f;
      this.vy *= f;
    } else {
      const max = this.maxSpeed(hasBall);
      const desX = this.wantX * max;
      const desY = this.wantY * max;
      let ax = desX - this.vx;
      let ay = desY - this.vy;
      const a = Math.hypot(ax, ay);
      // Braking is quicker than accelerating; carrying the ball makes turns slightly heavier.
      const braking = desX * this.vx + desY * this.vy < 0 || Math.hypot(desX, desY) < this.speed;
      const limit = ACCEL * (braking ? 1.35 : 1) * (hasBall ? 0.85 : 1) * dt;
      if (a > limit) {
        ax *= limit / a;
        ay *= limit / a;
      }
      this.vx += ax;
      this.vy += ay;
    }

    const s = this.speed;
    if (this.sprint && s > 120 && this.slide <= 0) this.stamina = Math.max(0, this.stamina - 0.17 * dt);
    else this.stamina = Math.min(1, this.stamina + (s < 60 ? 0.11 : 0.065) * dt);

    if (s > 22 && this.slide <= 0) {
      const target = Math.atan2(this.vy, this.vx);
      const d = angleDiff(this.facing, target);
      const turn = 13 * dt;
      this.facing += Math.abs(d) < turn ? d : Math.sign(d) * turn;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, -50, PITCH_L + 50);
    this.y = clamp(this.y, -45, PITCH_W + 45);
    this.anim += s * dt * 0.085;
  }
}
