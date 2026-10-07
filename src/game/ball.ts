import { AIR_K, BALL_R, CX, CY, GRAVITY, GROUND_K, ROLL_DECEL } from './constants';
import type { Player } from './player';
import type { KickKind } from './types';

const TRAIL_LEN = 14;

export class Ball {
  x = CX;
  y = CY;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  px = CX;
  py = CY;
  pz = 0;
  /** Visual rotation angle and roll direction. */
  spin = 0;
  spinDir = 0;
  /** Lateral acceleration (curl) applied perpendicular to the velocity. */
  curve = 0;

  owner: Player | null = null;
  /** True when the owner is a goalkeeper holding the ball in his hands. */
  held = false;
  holdTime = 0;
  lastTouch: Player | null = null;
  kicker: Player | null = null;
  kind: KickKind = 'none';
  kickAge = 0;
  passTarget: Player | null = null;
  passTargetX = 0;
  passTargetY = 0;
  shotPower = 0;
  shotId = 0;
  /** Short protection after winning the ball so possession cannot flip-flop every frame. */
  ownerLock = 0;
  /** The keeper that last touched a shot (used to award a save once). */
  savedBy: Player | null = null;

  readonly trail = new Float32Array(TRAIL_LEN * 3);
  trailHead = 0;
  trailCount = 0;
  private trailTimer = 0;

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  get free() {
    return this.owner === null;
  }

  place(x: number, y: number) {
    this.x = this.px = x;
    this.y = this.py = y;
    this.z = this.pz = 0;
    this.vx = this.vy = this.vz = 0;
    this.curve = 0;
    this.owner = null;
    this.held = false;
    this.holdTime = 0;
    this.kind = 'none';
    this.kicker = null;
    this.passTarget = null;
    this.savedBy = null;
    this.trailCount = 0;
  }

  kick(by: Player, vx: number, vy: number, vz: number, kind: KickKind, target: Player | null = null) {
    this.owner = null;
    this.held = false;
    this.holdTime = 0;
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.curve = 0;
    this.kicker = by;
    this.lastTouch = by;
    this.kind = kind;
    this.kickAge = 0;
    this.passTarget = target;
    this.savedBy = null;
    this.trailCount = 0;
    if (kind === 'shot') this.shotId++;
  }

  update(dt: number) {
    this.px = this.x;
    this.py = this.y;
    this.pz = this.z;
    this.kickAge += dt;
    if (this.ownerLock > 0) this.ownerLock -= dt;
    if (this.owner) return;

    const airborne = this.z > 0.5 || this.vz > 0;
    if (airborne) {
      this.vz -= GRAVITY * dt;
      // Fast shots lose pace through the air (drag grows with speed), so long-range efforts arrive slower.
      const fast = this.kind === 'shot' ? Math.max(0, Math.hypot(this.vx, this.vy) - 600) * 0.0014 : 0;
      const drag = Math.exp(-(AIR_K + fast) * dt);
      this.vx *= drag;
      this.vy *= drag;
    } else {
      const f = Math.exp(-GROUND_K * dt);
      this.vx *= f;
      this.vy *= f;
      const s = Math.hypot(this.vx, this.vy);
      if (s > 0) {
        const ns = Math.max(0, s - ROLL_DECEL * dt);
        if (ns < 4) {
          this.vx = 0;
          this.vy = 0;
        } else {
          this.vx *= ns / s;
          this.vy *= ns / s;
        }
      }
    }

    if (this.curve !== 0) {
      const s = Math.hypot(this.vx, this.vy);
      if (s > 60) {
        const ox = this.vx;
        this.vx += (-this.vy / s) * this.curve * dt;
        this.vy += (ox / s) * this.curve * dt;
      }
      this.curve *= Math.exp(-1.6 * dt);
      if (Math.abs(this.curve) < 5) this.curve = 0;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    if (this.z < 0) {
      this.z = 0;
      if (this.vz < -70) {
        this.vz = -this.vz * 0.48;
        this.vx *= 0.86;
        this.vy *= 0.86;
      } else {
        this.vz = 0;
      }
    }

    const s = Math.hypot(this.vx, this.vy);
    this.spin += (s * dt) / BALL_R;
    if (s > 1) this.spinDir = Math.atan2(this.vy, this.vx);

    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 1 / 60;
      if (s > 520) this.pushTrail();
      else if (this.trailCount > 0) this.trailCount--;
    }
  }

  /** Called while dribbled so the rendering keeps spinning and trails fade. */
  followOwner(dt: number, vx: number, vy: number) {
    const s = Math.hypot(vx, vy);
    this.spin += (s * dt) / BALL_R;
    if (s > 1) this.spinDir = Math.atan2(vy, vx);
    if (this.trailCount > 0) this.trailCount--;
  }

  private pushTrail() {
    const i = this.trailHead * 3;
    this.trail[i] = this.x;
    this.trail[i + 1] = this.y;
    this.trail[i + 2] = this.z;
    this.trailHead = (this.trailHead + 1) % TRAIL_LEN;
    if (this.trailCount < TRAIL_LEN) this.trailCount++;
  }

  /** Approximate ground-plane position after t seconds (no player interaction). */
  predictX(t: number) {
    if (this.owner) return this.owner.x;
    const k = this.z > 2 ? AIR_K + 0.25 : GROUND_K;
    return this.x + (this.vx / k) * (1 - Math.exp(-k * t));
  }

  predictY(t: number) {
    if (this.owner) return this.owner.y;
    const k = this.z > 2 ? AIR_K + 0.25 : GROUND_K;
    return this.y + (this.vy / k) * (1 - Math.exp(-k * t));
  }

  /** Where a rolling ball would come to rest. */
  restX() {
    return this.x + this.vx / GROUND_K;
  }

  restY() {
    return this.y + this.vy / GROUND_K;
  }

  static readonly TRAIL_LEN = TRAIL_LEN;
}