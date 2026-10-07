// eFootball Striker — full-pitch 5v5 arcade engine (logic + Canvas rendering)
export const W = 480;
export const H = 720;
export const PITCH_W = 800;
export const PITCH_H = 1200;

const FIELD_LEFT = 32;
const FIELD_RIGHT = PITCH_W - FIELD_LEFT;
const FIELD_TOP = 32;
const FIELD_BOTTOM = PITCH_H - FIELD_TOP;
const GOAL_CENTER_X = PITCH_W / 2;
const GOAL_W = 190;
const GOAL_D = 28;
const PLAYER_RADIUS = 13;
const BALL_RADIUS = 8;
const TEAM_SIZE = 4; // Four outfield players + one goalkeeper = 5v5.
const PI2 = Math.PI * 2;

export type Phase = 'start' | 'playing' | 'paused' | 'over';
export type Difficulty = 'amateur' | 'pro' | 'legende';
export type TeamType = 'home' | 'away';
export type TeamPossession = TeamType | 'neutral';
export type PlayerState = 'idle' | 'running' | 'passing' | 'shooting' | 'tackling' | 'stunned' | 'receiving';
export type PlayerRole = 'defender' | 'midfielder' | 'forward';

export interface Input { dx: number; dy: number; shoot: boolean; dash: boolean }

export interface FootballPlayer {
  id: number;
  team: TeamType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  state: PlayerState;
  stateTimer: number;
  role: PlayerRole;
  ang: number;
  step: number;
  /** Extra recovery time after a tackle or collision. */
  stunTimer: number;
  /** Prevents an AI player from attempting a tackle every single frame. */
  tackleCooldown: number;
  /** Reaction timer used by the away team's attacking decisions. */
  aiDecisionTimer: number;
  formationX: number;
  formationY: number;
}

export interface Goalkeeper {
  team: TeamType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dive: number;
  diveDir: number;
  state: 'idle' | 'diving' | 'holding';
  holdTimer: number;
  targetX: number;
  targetY: number;
  diveTargetX: number;
  diveTimer: number;
  cooldown: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: TeamType | 'none';
  ownerId: number | null;
  heldByKeeper: TeamType | null;
  lastTouchTeam: TeamType | null;
  targetTeam: TeamType | null;
  targetId: number | null;
  spin: number;
}

export interface HudState {
  score: number; time: number; combo: number; comboTimer: number; goals: number; level: number;
  power: number; charging: boolean; perfect: boolean; stamina: number;
  effects: { x2: number; speed: number; magnet: number };
}
export interface Stats { score: number; goals: number; shots: number; onTarget: number; powerShots: number; bestCombo: number; dodges: number; level: number }

export const DIFFICULTY: Record<Difficulty, { label: string; time: number; keeper: number; def: number; defenders: number; mul: number; desc: string }> = {
  amateur: { label: 'AMATEUR', time: 75, keeper: 195, def: 0.85, defenders: 2, mul: 0.8, desc: 'Défense lente, gardien généreux' },
  pro: { label: 'PRO', time: 60, keeper: 255, def: 1, defenders: 3, mul: 1, desc: 'Le réglage standard du stade' },
  legende: { label: 'LÉGENDE', time: 55, keeper: 315, def: 1.25, defenders: 4, mul: 1.5, desc: 'Pressing total, angles fermés' },
};

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; grav?: number }
interface FloatText { x: number; y: number; text: string; life: number; color: string; size: number }
interface Pickup { x: number; y: number; type: 'time' | 'x2' | 'speed' | 'magnet'; life: number; t: number }
interface Trail { x: number; y: number; life: number }

const WAVE_NAMES = ['MISE EN JEU', 'PRESSING', 'CONTRE-ATTAQUE', 'BARRAGE', 'TEMPS ADDITIONNEL', 'LÉGENDE', 'MARATHON'];
export const waveName = (lvl: number) => WAVE_NAMES[Math.min(Math.max(0, lvl - 1), WAVE_NAMES.length - 1)];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const len = (x: number, y: number) => Math.hypot(x, y) || 0.0001;
const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= PI2;
  while (a < -Math.PI) a += PI2;
  return a;
};

const makeKeeper = (team: TeamType): Goalkeeper => ({
  team,
  x: GOAL_CENTER_X,
  y: team === 'away' ? FIELD_TOP + 26 : FIELD_BOTTOM - 26,
  vx: 0,
  vy: 0,
  dive: 0,
  diveDir: 0,
  state: 'idle',
  holdTimer: 0,
  targetX: GOAL_CENTER_X,
  targetY: team === 'away' ? FIELD_TOP + 26 : FIELD_BOTTOM - 26,
  diveTargetX: GOAL_CENTER_X,
  diveTimer: 0,
  cooldown: 0,
});

const makePlayer = (id: number, team: TeamType, role: PlayerRole, x: number, y: number, speed: number): FootballPlayer => ({
  id, team, x, y, vx: 0, vy: 0, speed, state: 'idle', stateTimer: 0, role,
  ang: team === 'home' ? -Math.PI / 2 : Math.PI / 2,
  step: 0, stunTimer: 0, tackleCooldown: 0,
  aiDecisionTimer: rand(0.35, 0.8), formationX: x, formationY: y,
});

export class Game {
  phase: Phase = 'start';
  diff: Difficulty = 'pro';
  score = 0; goals = 0; combo = 0; comboTimer = 0; time = 60; level = 1;
  stats: Stats = { score: 0, goals: 0, shots: 0, onTarget: 0, powerShots: 0, bestCombo: 0, dodges: 0, level: 1 };

  /** Outfield players for the human-controlled (home) side. */
  homeTeam: FootballPlayer[] = [];
  /** Outfield players for the attacking AI (away) side. */
  awayTeam: FootballPlayer[] = [];
  homeKeeper: Goalkeeper = makeKeeper('home');
  awayKeeper: Goalkeeper = makeKeeper('away');
  activePlayerIndex = 2;
  possession: TeamPossession = 'neutral';
  ball: Ball = {
    x: GOAL_CENTER_X, y: PITCH_H / 2, vx: 0, vy: 0, owner: 'none', ownerId: null,
    heldByKeeper: null, lastTouchTeam: null, targetTeam: null, targetId: null, spin: 0,
  };

  /** Top-left world coordinate currently shown in the 480×720 viewport. */
  camX = clamp(GOAL_CENTER_X - W / 2, 0, PITCH_W - W);
  camY = clamp(PITCH_H - H, 0, PITCH_H - H);

  pickups: Pickup[] = [];
  particles: Particle[] = [];
  texts: FloatText[] = [];
  trail: Trail[] = [];
  shake = 0; shakeX = 0; shakeY = 0;
  flash = 0; flashColor = '255,255,255'; banner = { text: '', life: 0, color: '#fff', sub: '' };
  power = 0; charging = false; prevShoot = false; prevDash = false; pendingShoot = false; chargeTime = 0;
  stamina = 100; dashTimer = 0; dashCd = 0; dashAng = 0;
  speedBoost = 0; magnet = 0; x2 = 0;
  kickCd = 0; freeze = 0; resetTimer = 0; tick = 0; pickupTimer = 6; perfectShot = false;
  lastHomeShotY = PITCH_H - 160;
  private nextKickoffTeam: TeamType = 'home';
  onEnd?: (s: Stats) => void;
  sfx?: (name: string) => void;

  start(diff: Difficulty) {
    this.diff = diff;
    const cfg = DIFFICULTY[diff];
    this.phase = 'playing';
    this.score = 0; this.goals = 0; this.combo = 0; this.comboTimer = 0; this.time = cfg.time; this.level = 1;
    this.stats = { score: 0, goals: 0, shots: 0, onTarget: 0, powerShots: 0, bestCombo: 0, dodges: 0, level: 1 };
    this.pickups = []; this.particles = []; this.texts = []; this.trail = [];
    this.shake = 0; this.shakeX = 0; this.shakeY = 0; this.flash = 0; this.freeze = 0; this.resetTimer = 0;
    this.stamina = 100; this.dashTimer = 0; this.dashCd = 0;
    this.speedBoost = 0; this.magnet = 0; this.x2 = 0; this.pickupTimer = 5;
    this.power = 0; this.charging = false; this.prevShoot = false; this.prevDash = false; this.pendingShoot = false; this.chargeTime = 0;
    this.kickCd = 0; this.perfectShot = false; this.possession = 'neutral'; this.nextKickoffTeam = 'home';
    this.spawnTeams();
    this.resetPositions(true, 'home');
    this.showBanner('COUP D’ENVOI !', '#ffd166', `${cfg.label} · PASSE RAPIDE / TIR CHARGÉ`);
  }

  private spawnTeams() {
    const roles: PlayerRole[] = ['defender', 'defender', 'midfielder', 'forward'];
    const homeX = [255, 545, 335, 465];
    const homeY = [1010, 1010, 835, 760];
    const awayX = [255, 545, 335, 465];
    const awayY = [190, 190, 365, 440];
    const cfg = DIFFICULTY[this.diff];
    this.homeTeam = [];
    this.awayTeam = [];
    for (let i = 0; i < TEAM_SIZE; i++) {
      this.homeTeam.push(makePlayer(i + 1, 'home', roles[i], homeX[i], homeY[i], 178 + (i === 3 ? 8 : 0)));
      this.awayTeam.push(makePlayer(i + 11, 'away', roles[i], awayX[i], awayY[i], (155 + this.level * 4 + rand(-6, 8)) * cfg.def));
    }
    this.homeKeeper = makeKeeper('home');
    this.awayKeeper = makeKeeper('away');
  }

  private resetPositions(full = false, kickoffTeam: TeamType = 'home') {
    const homeX = [255, 545, 335, 465];
    const homeY = [1010, 1010, 835, 760];
    const awayX = [255, 545, 335, 465];
    const awayY = [190, 190, 365, 440];
    for (let i = 0; i < this.homeTeam.length; i++) {
      const p = this.homeTeam[i];
      p.x = homeX[i] + rand(-8, 8); p.y = full ? homeY[i] : homeY[i] + rand(-12, 12);
      p.vx = 0; p.vy = 0; p.ang = -Math.PI / 2; p.step = 0; p.stunTimer = 0; p.tackleCooldown = 0;
      p.state = 'idle'; p.stateTimer = 0; p.aiDecisionTimer = rand(0.25, 0.7);
      p.formationX = homeX[i]; p.formationY = homeY[i];
    }
    for (let i = 0; i < this.awayTeam.length; i++) {
      const p = this.awayTeam[i];
      p.x = awayX[i] + rand(-8, 8); p.y = full ? awayY[i] : awayY[i] + rand(-12, 12);
      p.vx = 0; p.vy = 0; p.ang = Math.PI / 2; p.step = 0; p.stunTimer = 0; p.tackleCooldown = 0;
      p.state = 'idle'; p.stateTimer = 0; p.aiDecisionTimer = rand(0.3, 0.8);
      p.formationX = awayX[i]; p.formationY = awayY[i];
    }
    this.homeKeeper = makeKeeper('home');
    this.awayKeeper = makeKeeper('away');
    this.homeKeeper.x = this.homeKeeper.targetX = GOAL_CENTER_X;
    this.awayKeeper.x = this.awayKeeper.targetX = GOAL_CENTER_X;
    this.ball.x = GOAL_CENTER_X; this.ball.y = PITCH_H / 2;
    this.ball.vx = 0; this.ball.vy = 0; this.ball.spin = 0;
    this.ball.owner = 'none'; this.ball.ownerId = null; this.ball.heldByKeeper = null;
    this.ball.lastTouchTeam = null; this.ball.targetTeam = null; this.ball.targetId = null;
    this.possession = 'neutral';

    const kickoff = kickoffTeam === 'home' ? this.homeTeam[2] : this.awayTeam[2];
    const opponentKickoff = kickoffTeam === 'home' ? this.awayTeam[2] : this.homeTeam[2];
    kickoff.x = GOAL_CENTER_X; kickoff.y = PITCH_H / 2 + (kickoffTeam === 'home' ? -22 : 22);
    kickoff.ang = kickoffTeam === 'home' ? -Math.PI / 2 : Math.PI / 2;
    opponentKickoff.x = GOAL_CENTER_X + (kickoffTeam === 'home' ? 46 : -46);
    opponentKickoff.y = PITCH_H / 2 + (kickoffTeam === 'home' ? 44 : -44);
    this.possession = kickoffTeam;
    this.ball.owner = kickoffTeam; this.ball.ownerId = kickoff.id; this.ball.lastTouchTeam = kickoffTeam;
    this.activePlayerIndex = kickoffTeam === 'home' ? this.homeTeam.indexOf(kickoff) : this.findNearestHomePlayerIndex();
    this.charging = false; this.power = 0; this.chargeTime = 0; this.perfectShot = false;
    this.dashTimer = 0; this.kickCd = 0.2;
    this.updateBallAttachment();
    this.updateCamera(0.15);
  }

  showBanner(text: string, color: string, sub = '') { this.banner = { text, life: 1.5, color, sub }; }
  addShake(a: number) { this.shake = Math.min(this.shake + a, 24); }

  burst(x: number, y: number, n: number, colors: string[], speed = 220, grav = 0, size = 4) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 420) break;
      const a = rand(0, PI2), s = rand(speed * 0.3, speed);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, max: rand(0.4, 0.9), size: rand(size * 0.5, size * 1.3), color: colors[(Math.random() * colors.length) | 0], grav });
    }
  }
  float(x: number, y: number, text: string, color = '#fff', size = 22) { this.texts.push({ x, y, text, life: 1, color, size }); }

  togglePause() { if (this.phase === 'playing') this.phase = 'paused'; else if (this.phase === 'paused') this.phase = 'playing'; }

  hud(): HudState {
    return {
      score: this.score, time: this.time, combo: this.combo, comboTimer: this.comboTimer, goals: this.goals, level: this.level,
      power: this.power, charging: this.charging, perfect: this.perfectShot, stamina: this.stamina,
      effects: { x2: this.x2, speed: this.speedBoost, magnet: this.magnet },
    };
  }

  update(dt: number, input: Input) {
    dt = Math.min(Math.max(dt, 0), 0.05);
    this.tick += dt;
    this.shake *= Math.pow(0.02, dt);
    this.shakeX = (Math.random() - 0.5) * this.shake * 2;
    this.shakeY = (Math.random() - 0.5) * this.shake * 2;
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.banner.life = Math.max(0, this.banner.life - dt);
    this.updateParticles(dt);
    if (this.phase !== 'playing') { this.updateCamera(dt); return; }
    if (this.freeze > 0) { this.freeze = Math.max(0, this.freeze - dt); this.updateCamera(dt); return; }
    if (this.resetTimer > 0) {
      this.resetTimer -= dt;
      if (this.resetTimer <= 0) this.resetPositions(false, this.nextKickoffTeam);
      this.updateCamera(dt);
      return;
    }

    this.time -= dt;
    if (this.time <= 0) { this.time = 0; this.endGame(); return; }
    this.comboTimer -= dt; if (this.comboTimer <= 0) { this.comboTimer = 0; this.combo = 0; }
    this.kickCd = Math.max(0, this.kickCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.speedBoost = Math.max(0, this.speedBoost - dt);
    this.magnet = Math.max(0, this.magnet - dt);
    this.x2 = Math.max(0, this.x2 - dt);
    this.stamina = Math.min(100, this.stamina + dt * 17);
    this.perfectShot = this.charging && this.power >= 0.82;
    this.updatePlayerTimers(dt);
    this.updateActivePlayer();
    this.updateHumanMovement(dt, input);
    this.updateHumanAction(dt, input);
    this.updateAI(dt);
    this.updateKeepers(dt);
    this.updateBall(dt);
    if (this.resetTimer > 0) { this.updateCamera(dt); return; }
    this.resolvePlayerBallInteractions();
    this.updatePickups(dt);
    this.updateActivePlayer();
    this.updateTrail(dt);
    this.updateCamera(dt);
  }

  private updatePlayerTimers(dt: number) {
    for (const p of this.homeTeam) {
      p.stateTimer = Math.max(0, p.stateTimer - dt);
      p.stunTimer = Math.max(0, p.stunTimer - dt);
      p.tackleCooldown = Math.max(0, p.tackleCooldown - dt);
      if (p.stateTimer <= 0 && (p.state === 'passing' || p.state === 'shooting' || p.state === 'tackling' || p.state === 'stunned' || p.state === 'receiving')) p.state = p.stunTimer > 0 ? 'stunned' : 'idle';
      if (p.stunTimer <= 0 && p.state === 'stunned') p.state = 'idle';
    }
    for (const p of this.awayTeam) {
      p.stateTimer = Math.max(0, p.stateTimer - dt);
      p.stunTimer = Math.max(0, p.stunTimer - dt);
      p.tackleCooldown = Math.max(0, p.tackleCooldown - dt);
      if (p.stateTimer <= 0 && (p.state === 'passing' || p.state === 'shooting' || p.state === 'tackling' || p.state === 'stunned' || p.state === 'receiving')) p.state = p.stunTimer > 0 ? 'stunned' : 'idle';
      if (p.stunTimer <= 0 && p.state === 'stunned') p.state = 'idle';
    }
    this.homeKeeper.cooldown = Math.max(0, this.homeKeeper.cooldown - dt);
    this.awayKeeper.cooldown = Math.max(0, this.awayKeeper.cooldown - dt);
  }

  private updateActivePlayer() {
    if (this.homeTeam.length === 0) return;
    if (this.ball.owner === 'home' && this.ball.ownerId !== null) {
      const holderIndex = this.homeTeam.findIndex(p => p.id === this.ball.ownerId);
      if (holderIndex >= 0) { this.activePlayerIndex = holderIndex; return; }
    }
    if (this.ball.owner === 'none' && this.ball.targetTeam === 'home' && this.ball.targetId !== null) {
      const targetIndex = this.homeTeam.findIndex(p => p.id === this.ball.targetId);
      if (targetIndex >= 0) { this.activePlayerIndex = targetIndex; return; }
    }
    this.activePlayerIndex = this.findNearestHomePlayerIndex();
  }

  private findNearestHomePlayerIndex() {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.homeTeam.length; i++) {
      const p = this.homeTeam[i];
      const dx = p.x - this.ball.x, dy = p.y - this.ball.y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) { bestDistance = distance; bestIndex = i; }
    }
    return bestIndex;
  }

  private getPlayer(team: TeamType, id: number | null) {
    if (id === null) return null;
    const players = team === 'home' ? this.homeTeam : this.awayTeam;
    for (const p of players) if (p.id === id) return p;
    return null;
  }

  private getCarrier(team: TeamType) {
    if (this.ball.owner !== team || this.ball.ownerId === null) return null;
    return this.getPlayer(team, this.ball.ownerId);
  }

  private updateHumanMovement(dt: number, input: Input) {
    const p = this.homeTeam[this.activePlayerIndex];
    if (!p) return;
    let dx = input.dx, dy = input.dy;
    const inputLength = Math.hypot(dx, dy);
    if (inputLength > 1) { dx /= inputLength; dy /= inputLength; }
    const moving = inputLength > 0.12;

    if (input.dash && !this.prevDash && this.dashCd <= 0 && this.stamina > 28 && moving) {
      this.dashTimer = 0.22; this.dashCd = 0.75; this.stamina -= 28; this.dashAng = Math.atan2(dy, dx);
      this.addShake(4); this.sfx?.('dash');
      for (let i = 0; i < 8; i++) this.trail.push({ x: p.x, y: p.y, life: 1 });
    }
    this.prevDash = input.dash;

    // A passed-to teammate gets a soft AI interception vector while the human can still steer.
    let autoX = 0, autoY = 0, autoWeight = 0;
    if (this.ball.owner === 'none' && this.ball.targetTeam === 'home' && this.ball.targetId === p.id) {
      const speed = Math.max(180, len(this.ball.vx, this.ball.vy));
      const t = clamp(len(this.ball.x - p.x, this.ball.y - p.y) / speed, 0.12, 0.65);
      const ix = this.ball.x + this.ball.vx * t - p.x;
      const iy = this.ball.y + this.ball.vy * t - p.y;
      const il = len(ix, iy);
      autoX = ix / il; autoY = iy / il; autoWeight = moving ? 0.36 : 1;
      p.state = 'receiving'; p.stateTimer = Math.max(p.stateTimer, 0.12);
    }
    let dirX = dx * (1 - autoWeight) + autoX * autoWeight;
    let dirY = dy * (1 - autoWeight) + autoY * autoWeight;
    const dirLength = Math.hypot(dirX, dirY);
    if (dirLength > 1) { dirX /= dirLength; dirY /= dirLength; }

    const boost = this.speedBoost > 0 ? 1.32 : 1;
    let speed = (this.charging ? 145 : 246) * boost;
    if (this.dashTimer > 0) speed = 620 * boost;
    if (p.stunTimer > 0) speed *= 0.38;
    const targetVx = dirX * speed, targetVy = dirY * speed;
    const accel = this.dashTimer > 0 ? 30 : (moving || autoWeight > 0 ? 13 : 10);
    p.vx += (targetVx - p.vx) * Math.min(1, accel * dt);
    p.vy += (targetVy - p.vy) * Math.min(1, accel * dt);
    p.x = clamp(p.x + p.vx * dt, FIELD_LEFT + PLAYER_RADIUS, FIELD_RIGHT - PLAYER_RADIUS);
    p.y = clamp(p.y + p.vy * dt, FIELD_TOP + 48, FIELD_BOTTOM - 48);
    this.updateFacing(p, dt);
    if (this.dashTimer > 0 && Math.random() < 0.6) this.trail.push({ x: p.x, y: p.y, life: 1 });
    if (p.stunTimer <= 0 && p.state !== 'receiving' && p.state !== 'passing' && p.state !== 'shooting' && p.state !== 'tackling') {
      p.state = len(p.vx, p.vy) > 24 ? 'running' : 'idle';
    }
  }

  private updateFacing(p: FootballPlayer, dt: number) {
    const speed = len(p.vx, p.vy);
    if (speed > 12) {
      const target = Math.atan2(p.vy, p.vx);
      p.ang += wrapAngle(target - p.ang) * Math.min(1, 16 * dt);
      p.step += speed * dt * 0.06;
    }
  }

  private updateHumanAction(dt: number, input: Input) {
    const shootDown = input.shoot || this.pendingShoot;
    this.pendingShoot = false;
    const p = this.homeTeam[this.activePlayerIndex];
    const ownsBall = !!p && this.ball.owner === 'home' && this.ball.ownerId === p.id;
    if (!ownsBall) {
      if (!shootDown) { this.charging = false; this.power = 0; this.chargeTime = 0; }
      this.prevShoot = shootDown;
      return;
    }

    if (shootDown && !this.prevShoot) { this.charging = true; this.power = 0; this.chargeTime = 0; }
    if (shootDown && this.charging) {
      this.chargeTime += dt;
      this.power = Math.min(1, this.chargeTime / 0.75);
      this.perfectShot = this.power >= 0.82;
    } else if (!shootDown && this.prevShoot && this.charging) {
      if (this.chargeTime < 0.25) this.executePass(p, this.findPassTarget(p, input.dx, input.dy));
      else this.executeHumanShot(p, this.power, input.dx, input.dy);
      this.charging = false; this.power = 0; this.chargeTime = 0; this.perfectShot = false;
    }
    this.prevShoot = shootDown;
  }

  /**
   * Finds a sensible teammate using the requested joystick direction as a dot-product
   * score. The small distance penalty breaks ties without overriding the aimed lane.
   */
  private findPassTarget(sender: FootballPlayer, aimX: number, aimY: number) {
    const team = sender.team === 'home' ? this.homeTeam : this.awayTeam;
    let ax = aimX, ay = aimY;
    const al = Math.hypot(ax, ay);
    if (al > 0.12) { ax /= al; ay /= al; }
    else { ax = Math.cos(sender.ang); ay = Math.sin(sender.ang); }
    let best: FootballPlayer | null = null;
    let bestScore = -Number.POSITIVE_INFINITY;
    for (const candidate of team) {
      if (candidate.id === sender.id) continue;
      const dx = candidate.x - sender.x, dy = candidate.y - sender.y;
      const distance = len(dx, dy);
      const dot = (dx / distance) * ax + (dy / distance) * ay;
      if (dot < -0.2) continue;
      const score = dot * 2.2 - distance * 0.00065 + (sender.team === 'home' ? -dy : dy) * 0.00008;
      if (score > bestScore) { bestScore = score; best = candidate; }
    }
    if (best) return best;
    // If the stick points away from every teammate, keep a quick tap as a safe outlet pass.
    let closest: FootballPlayer | null = null, closestD2 = Number.POSITIVE_INFINITY;
    for (const candidate of team) {
      if (candidate.id === sender.id) continue;
      const dx = candidate.x - sender.x, dy = candidate.y - sender.y, d2 = dx * dx + dy * dy;
      if (d2 < closestD2) { closestD2 = d2; closest = candidate; }
    }
    return closest;
  }

  /**
   * Releases the ball toward the selected teammate at a controlled pace, marks the
   * receiver for an interception run, and switches the home controller immediately.
   */
  private executePass(sender: FootballPlayer, receiver: FootballPlayer | null, speed = 450) {
    if (!receiver) {
      const angle = sender.team === 'home' ? -Math.PI / 2 : Math.PI / 2;
      this.releaseBall(sender, Math.cos(angle) * 360, Math.sin(angle) * 360, null, null);
      sender.state = 'passing'; sender.stateTimer = 0.2;
      this.sfx?.('kick');
      return;
    }
    const dx = receiver.x - sender.x, dy = receiver.y - sender.y, distance = len(dx, dy);
    const vx = dx / distance * speed, vy = dy / distance * speed;
    this.releaseBall(sender, vx, vy, sender.team, receiver.id);
    sender.state = 'passing'; sender.stateTimer = 0.22;
    receiver.state = 'receiving'; receiver.stateTimer = 0.9;
    if (sender.team === 'home') this.activePlayerIndex = this.homeTeam.indexOf(receiver);
    this.kickCd = 0.08;
    this.addShake(2.5); this.sfx?.('kick');
    this.burst(this.ball.x, this.ball.y, 6, ['#fff', '#a7f3d0', '#7dd3fc'], 90, 0, 2.5);
  }

  private releaseBall(sender: FootballPlayer, vx: number, vy: number, targetTeam: TeamType | null, targetId: number | null) {
    const b = this.ball;
    const speed = len(vx, vy);
    b.owner = 'none'; b.ownerId = null; b.heldByKeeper = null;
    b.targetTeam = targetTeam; b.targetId = targetId; b.lastTouchTeam = sender.team;
    b.x = sender.x + vx / speed * (PLAYER_RADIUS + BALL_RADIUS + 2);
    b.y = sender.y + vy / speed * (PLAYER_RADIUS + BALL_RADIUS + 2);
    b.vx = vx; b.vy = vy;
    this.possession = targetTeam ?? 'neutral';
    this.kickCd = Math.max(this.kickCd, 0.08);
  }

  private executeHumanShot(shooter: FootballPlayer, power: number, aimX: number, aimY: number) {
    const charge = clamp(power, 0, 1);
    const isPerfect = charge >= 0.82;
    const speed = 470 + charge * 500 + (isPerfect ? 120 : 0);
    let angle = Math.hypot(aimX, aimY) > 0.15 ? Math.atan2(aimY, aimX) : shooter.ang;
    const goalAngle = Math.atan2(FIELD_TOP - shooter.y, GOAL_CENTER_X - shooter.x);
    const correction = wrapAngle(goalAngle - angle);
    if (Math.abs(correction) < 0.95) angle += correction * 0.42;
    const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
    this.lastHomeShotY = shooter.y;
    this.releaseBall(shooter, vx, vy, null, null);
    shooter.state = 'shooting'; shooter.stateTimer = 0.3;
    this.stats.shots++;
    if (isPerfect) this.stats.powerShots++;
    const tGoal = (FIELD_TOP - shooter.y) / vy;
    if (tGoal > 0 && shooter.y > FIELD_TOP && shooter.y < FIELD_BOTTOM) {
      const xAtGoal = shooter.x + vx * tGoal;
      if (xAtGoal >= GOAL_CENTER_X - GOAL_W / 2 && xAtGoal <= GOAL_CENTER_X + GOAL_W / 2) this.stats.onTarget++;
    }
    this.perfectShot = false;
    this.addShake(isPerfect ? 14 : 4 + charge * 6);
    this.sfx?.(isPerfect ? 'power' : 'kick');
    if (isPerfect) { this.flash = 0.55; this.flashColor = '255,209,102'; this.freeze = 0.045; this.showBanner('TIR PARFAIT !', '#ffd166', ''); }
    this.burst(this.ball.x, this.ball.y, isPerfect ? 30 : 10 + Math.round(charge * 12), isPerfect ? ['#ffd166', '#fff', '#f472b6'] : ['#fff', '#ffd166', '#a7f3d0'], 200 * charge + 80, 0, isPerfect ? 5 : 3);
    shooter.vx -= Math.cos(angle) * 120 * charge; shooter.vy -= Math.sin(angle) * 120 * charge;
  }

  /**
   * Updates support runs, pressing, marking and the away side's deliberate attack.
   * The away ball-carrier only chooses an action when its reaction timer expires.
   */
  private updateAI(dt: number) {
    const homeCarrier = this.getCarrier('home');
    const awayCarrier = this.getCarrier('away');
    for (const p of this.homeTeam) {
      if (p.id === this.homeTeam[this.activePlayerIndex]?.id || p.id === homeCarrier?.id) continue;
      this.updateHomeSupport(p, homeCarrier, dt);
    }
    for (const p of this.awayTeam) {
      if (p.id === awayCarrier?.id) {
        this.updateAwayCarrier(p, dt);
        continue;
      }
      this.updateAwaySupport(p, awayCarrier, dt);
    }
  }

  private updateHomeSupport(p: FootballPlayer, homeCarrier: FootballPlayer | null, dt: number) {
    if (this.ball.owner === 'none' && this.ball.targetTeam === 'home' && this.ball.targetId === p.id) {
      this.moveTowardBall(p, dt, 1);
      p.state = 'receiving'; p.stateTimer = Math.max(p.stateTimer, 0.12);
      return;
    }
    let tx = p.formationX, ty = p.formationY;
    if (this.possession === 'home') {
      const ref = homeCarrier ?? this.ball;
      const advance = p.role === 'forward' ? 155 : p.role === 'midfielder' ? 108 : 58;
      ty = clamp(ref.y - advance, FIELD_TOP + 95, FIELD_BOTTOM - 95);
      tx += clamp((ref.x - GOAL_CENTER_X) * 0.28, -78, 78);
    } else if (this.possession === 'away') {
      const ref = this.getCarrier('away') ?? this.ball;
      const advance = p.role === 'defender' ? 135 : 92;
      ty = clamp(ref.y + advance, PITCH_H * 0.56, FIELD_BOTTOM - 82);
      tx += clamp((ref.x - GOAL_CENTER_X) * 0.4, -95, 95);
    } else {
      ty = clamp(p.formationY + (this.ball.y - PITCH_H / 2) * 0.12, FIELD_TOP + 100, FIELD_BOTTOM - 100);
      tx += clamp((this.ball.x - GOAL_CENTER_X) * 0.2, -64, 64);
    }
    this.steerPlayer(p, tx, ty, dt, p.speed);
  }

  private updateAwaySupport(p: FootballPlayer, awayCarrier: FootballPlayer | null, dt: number) {
    if (this.ball.owner === 'none' && this.ball.targetTeam === 'away' && this.ball.targetId === p.id) {
      this.moveTowardBall(p, dt, 1);
      p.state = 'receiving'; p.stateTimer = Math.max(p.stateTimer, 0.12);
      return;
    }
    if (this.possession === 'away') {
      const ref = awayCarrier ?? this.ball;
      const advance = p.role === 'forward' ? 135 : p.role === 'midfielder' ? 82 : 38;
      const side = p.formationX < GOAL_CENTER_X ? -1 : 1;
      const tx = clamp(ref.x + side * (p.role === 'forward' ? 108 : 74), FIELD_LEFT + 45, FIELD_RIGHT - 45);
      const ty = clamp(ref.y + advance, FIELD_TOP + 95, FIELD_BOTTOM - 100);
      this.steerPlayer(p, tx, ty, dt, p.speed * 0.96);
      return;
    }

    const threat = this.getCarrier('home');
    if (threat) {
      let nearest = true;
      let myD2 = (p.x - threat.x) ** 2 + (p.y - threat.y) ** 2;
      for (const other of this.awayTeam) {
        if (other.id === p.id) continue;
        const d2 = (other.x - threat.x) ** 2 + (other.y - threat.y) ** 2;
        if (d2 < myD2) { nearest = false; break; }
      }
      if (nearest) {
        this.steerPlayer(p, threat.x, threat.y, dt, p.speed * 1.04);
        return;
      }
      const lane = p.role === 'defender' ? (p.formationX < GOAL_CENTER_X ? -1 : 1) * 135 : (p.formationX < GOAL_CENTER_X ? -1 : 1) * 65;
      const tx = clamp(threat.x + lane, FIELD_LEFT + 45, FIELD_RIGHT - 45);
      const ty = clamp(threat.y - (p.role === 'defender' ? 155 : 90), FIELD_TOP + 82, PITCH_H * 0.48);
      this.steerPlayer(p, tx, ty, dt, p.speed * 0.92);
      return;
    }

    // With no clear owner, only the closest away player presses the loose ball.
    let nearestToBall = true;
    const myBallD2 = (p.x - this.ball.x) ** 2 + (p.y - this.ball.y) ** 2;
    for (const other of this.awayTeam) {
      if (other.id === p.id) continue;
      const d2 = (other.x - this.ball.x) ** 2 + (other.y - this.ball.y) ** 2;
      if (d2 < myBallD2) { nearestToBall = false; break; }
    }
    if (nearestToBall) this.moveTowardBall(p, dt, 1);
    else this.steerPlayer(p, p.formationX, p.formationY, dt, p.speed * 0.9);
  }

  private updateAwayCarrier(carrier: FootballPlayer, dt: number) {
    carrier.aiDecisionTimer -= dt;
    if (carrier.aiDecisionTimer <= 0 && carrier.stunTimer <= 0) {
      carrier.aiDecisionTimer = rand(0.35, 0.72);
      const shotChance = this.evaluateShootingChance(carrier);
      if (shotChance > 0 && Math.random() < shotChance) {
        this.executeAiShot(carrier);
        return;
      }
      const pressure = this.nearestOpponentDistance(carrier, this.homeTeam);
      const passTarget = this.findAiPassTarget(carrier);
      if (pressure < 112 && passTarget) {
        this.executePass(carrier, passTarget, 450);
        return;
      }
      if (!this.isDribbleLaneClear(carrier) && passTarget && Math.random() < 0.72) {
        this.executePass(carrier, passTarget, 450);
        return;
      }
      if (!this.isDribbleLaneClear(carrier) && !passTarget) {
        carrier.formationX = clamp(carrier.x + (carrier.x < GOAL_CENTER_X ? 85 : -85), FIELD_LEFT + 60, FIELD_RIGHT - 60);
      }
    }

    let targetX = GOAL_CENTER_X + (carrier.x - GOAL_CENTER_X) * 0.08;
    if (!this.isDribbleLaneClear(carrier)) targetX = carrier.formationX || targetX;
    const targetY = FIELD_BOTTOM - 100;
    this.steerPlayer(carrier, targetX, targetY, dt, carrier.speed * 0.92);
    if (this.ball.owner === 'away' && this.ball.ownerId === carrier.id) this.updateBallAttachment();
  }

  /**
   * Returns a reaction-weighted shot probability. It rises sharply inside the home
   * half and within 300 pixels of goal, with a modest penalty for a wide shooting angle.
   */
  private evaluateShootingChance(carrier: FootballPlayer) {
    const distance = FIELD_BOTTOM - carrier.y;
    if (carrier.y <= PITCH_H / 2 || distance > 330) return 0.015;
    const proximity = clamp(1 - distance / 330, 0, 1);
    const widthPenalty = clamp(Math.abs(carrier.x - GOAL_CENTER_X) / (GOAL_W * 1.5), 0, 0.35);
    const pressure = this.nearestOpponentDistance(carrier, this.homeTeam);
    const pressureBonus = pressure < 80 ? 0.08 : 0;
    return clamp(0.12 + proximity * 0.69 + pressureBonus - widthPenalty, 0.03, 0.88);
  }

  private findAiPassTarget(sender: FootballPlayer) {
    let best: FootballPlayer | null = null;
    let bestScore = -Number.POSITIVE_INFINITY;
    for (const candidate of this.awayTeam) {
      if (candidate.id === sender.id) continue;
      const progress = candidate.y - sender.y;
      if (progress < 18) continue;
      const distance = len(candidate.x - sender.x, candidate.y - sender.y);
      if (distance > 430 || this.isPassLaneBlocked(sender.x, sender.y, candidate.x, candidate.y)) continue;
      const score = progress * 1.1 - distance * 0.16 + (Math.abs(candidate.x - GOAL_CENTER_X) < Math.abs(sender.x - GOAL_CENTER_X) ? 10 : 0);
      if (score > bestScore) { bestScore = score; best = candidate; }
    }
    return best;
  }

  private isPassLaneBlocked(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1, dy = y2 - y1;
    const d2 = dx * dx + dy * dy || 1;
    for (const opponent of this.homeTeam) {
      const t = clamp(((opponent.x - x1) * dx + (opponent.y - y1) * dy) / d2, 0, 1);
      const px = x1 + dx * t, py = y1 + dy * t;
      if ((opponent.x - px) ** 2 + (opponent.y - py) ** 2 < 34 * 34) return true;
    }
    return false;
  }

  private isDribbleLaneClear(carrier: FootballPlayer) {
    for (const player of this.homeTeam) {
      const forward = player.y - carrier.y;
      if (forward > 0 && forward < 165 && Math.abs(player.x - carrier.x) < 74) return false;
    }
    for (const teammate of this.awayTeam) {
      if (teammate.id === carrier.id) continue;
      const forward = teammate.y - carrier.y;
      if (forward > 0 && forward < 145 && Math.abs(teammate.x - carrier.x) < 58) return false;
    }
    return true;
  }

  private executeAiShot(shooter: FootballPlayer) {
    const targetX = clamp(GOAL_CENTER_X + rand(-GOAL_W * 0.38, GOAL_W * 0.38), GOAL_CENTER_X - GOAL_W / 2 + 12, GOAL_CENTER_X + GOAL_W / 2 - 12);
    const targetY = FIELD_BOTTOM + 10;
    const dx = targetX - shooter.x, dy = targetY - shooter.y, distance = len(dx, dy);
    const speed = rand(720, 910);
    const vx = dx / distance * speed, vy = dy / distance * speed;
    this.releaseBall(shooter, vx, vy, null, null);
    shooter.state = 'shooting'; shooter.stateTimer = 0.32;
    this.addShake(5); this.sfx?.('kick');
    this.burst(this.ball.x, this.ball.y, 12, ['#fff', '#fca5a5', '#ffd166'], 140, 0, 3);
  }

  private nearestOpponentDistance(player: FootballPlayer, opponents: FootballPlayer[]) {
    let closest = Number.POSITIVE_INFINITY;
    for (const opponent of opponents) {
      const d = len(opponent.x - player.x, opponent.y - player.y);
      if (d < closest) closest = d;
    }
    return closest;
  }

  private steerPlayer(p: FootballPlayer, targetX: number, targetY: number, dt: number, maxSpeed: number) {
    if (p.stunTimer > 0) maxSpeed *= 0.28;
    const dx = targetX - p.x, dy = targetY - p.y, distance = len(dx, dy);
    const desiredSpeed = Math.min(maxSpeed, distance * 2.6);
    const targetVx = dx / distance * desiredSpeed, targetVy = dy / distance * desiredSpeed;
    const blend = Math.min(1, (distance < 10 ? 12 : 6.5) * dt);
    p.vx += (targetVx - p.vx) * blend;
    p.vy += (targetVy - p.vy) * blend;
    p.x = clamp(p.x + p.vx * dt, FIELD_LEFT + PLAYER_RADIUS, FIELD_RIGHT - PLAYER_RADIUS);
    p.y = clamp(p.y + p.vy * dt, FIELD_TOP + 48, FIELD_BOTTOM - 48);
    this.updateFacing(p, dt);
    if (p.state !== 'receiving' && p.state !== 'passing' && p.state !== 'shooting' && p.state !== 'tackling' && p.state !== 'stunned') {
      p.state = len(p.vx, p.vy) > 24 ? 'running' : 'idle';
    }
  }

  private moveTowardBall(p: FootballPlayer, dt: number, lead: number) {
    const speed = Math.max(160, len(this.ball.vx, this.ball.vy));
    const t = clamp(len(this.ball.x - p.x, this.ball.y - p.y) / speed, 0.1, 0.65) * lead;
    const tx = clamp(this.ball.x + this.ball.vx * t, FIELD_LEFT + 45, FIELD_RIGHT - 45);
    const ty = clamp(this.ball.y + this.ball.vy * t, FIELD_TOP + 55, FIELD_BOTTOM - 55);
    this.steerPlayer(p, tx, ty, dt, p.speed * 1.05);
  }

  private updateKeepers(dt: number) {
    this.updateKeeper(this.awayKeeper, dt);
    this.updateKeeper(this.homeKeeper, dt);
  }

  private updateKeeper(keeper: Goalkeeper, dt: number) {
    const isTop = keeper.team === 'away';
    const lineY = isTop ? FIELD_TOP : FIELD_BOTTOM;
    const baseY = isTop ? FIELD_TOP + 26 : FIELD_BOTTOM - 26;
    const towardSign = isTop ? 1 : -1;
    const ball = this.ball;

    if (keeper.state === 'holding') {
      keeper.holdTimer -= dt;
      this.updateBallAttachment();
      if (keeper.holdTimer <= 0) this.clearKeeperToTeammate(keeper);
      return;
    }

    if (keeper.state === 'diving') {
      keeper.diveTimer -= dt;
      keeper.dive = Math.min(1, keeper.dive + dt * 7);
      const dx = keeper.diveTargetX - keeper.x;
      const maxStep = 610 * dt;
      keeper.vx = clamp(dx, -maxStep, maxStep) / Math.max(dt, 0.0001);
      keeper.x += keeper.vx * dt;
      const targetY = baseY + towardSign * 6;
      keeper.vy = clamp(targetY - keeper.y, -230 * dt, 230 * dt) / Math.max(dt, 0.0001);
      keeper.y += keeper.vy * dt;
      if (keeper.diveTimer <= 0) { keeper.state = 'idle'; keeper.dive = 0; keeper.cooldown = Math.max(keeper.cooldown, 0.25); }
    } else {
      const dx = ball.x - GOAL_CENTER_X, dy = ball.y - baseY;
      const distance = len(dx, dy);
      const closeAngle = clamp((500 - distance) * 0.095, 0, 44);
      keeper.targetX = clamp(GOAL_CENTER_X + dx / distance * closeAngle, GOAL_CENTER_X - GOAL_W / 2 + 19, GOAL_CENTER_X + GOAL_W / 2 - 19);
      keeper.targetY = clamp(baseY + dy / distance * closeAngle, isTop ? FIELD_TOP + 14 : FIELD_BOTTOM - 70, isTop ? FIELD_TOP + 70 : FIELD_BOTTOM - 14);
      const speed = DIFFICULTY[this.diff].keeper + 70 + this.level * 8;
      const sx = clamp(keeper.targetX - keeper.x, -speed * dt, speed * dt);
      const sy = clamp(keeper.targetY - keeper.y, -speed * dt, speed * dt);
      keeper.vx = dt > 0 ? sx / dt : 0; keeper.vy = dt > 0 ? sy / dt : 0;
      keeper.x += sx; keeper.y += sy;
      keeper.dive = Math.max(0, keeper.dive - dt * 2.8);

      // Predict where an incoming shot intersects the defended goal line and commit to a dive.
      const headingToGoal = isTop ? ball.vy < -350 : ball.vy > 350;
      if (ball.owner === 'none' && headingToGoal && keeper.cooldown <= 0) {
        const tLine = (lineY - ball.y) / ball.vy;
        if (tLine > 0 && tLine < 1.15) {
          const interceptX = ball.x + ball.vx * tLine;
          const inMouth = interceptX > GOAL_CENTER_X - GOAL_W / 2 - 6 && interceptX < GOAL_CENTER_X + GOAL_W / 2 + 6;
          if (inMouth) {
            keeper.state = 'diving'; keeper.diveTimer = clamp(tLine + 0.12, 0.28, 0.8);
            keeper.diveTargetX = clamp(interceptX, GOAL_CENTER_X - GOAL_W / 2 + 10, GOAL_CENTER_X + GOAL_W / 2 - 10);
            keeper.diveDir = Math.sign(keeper.diveTargetX - keeper.x) || (ball.vx >= 0 ? 1 : -1);
            keeper.dive = 0.12; keeper.cooldown = 0.7;
          }
        }
      }
    }
    keeper.x = clamp(keeper.x, GOAL_CENTER_X - GOAL_W / 2 + 17, GOAL_CENTER_X + GOAL_W / 2 - 17);
    keeper.y = clamp(keeper.y, isTop ? FIELD_TOP + 10 : FIELD_BOTTOM - 66, isTop ? FIELD_TOP + 72 : FIELD_BOTTOM - 10);
  }

  private clearKeeperToTeammate(keeper: Goalkeeper) {
    const team = keeper.team === 'home' ? this.homeTeam : this.awayTeam;
    let receiver: FootballPlayer | null = null;
    let nearestD2 = Number.POSITIVE_INFINITY;
    for (const p of team) {
      const dx = p.x - keeper.x, dy = p.y - keeper.y, d2 = dx * dx + dy * dy;
      if (d2 < nearestD2) { nearestD2 = d2; receiver = p; }
    }
    const b = this.ball;
    if (receiver) {
      const dx = receiver.x - keeper.x, dy = receiver.y - keeper.y, d = len(dx, dy);
      b.vx = dx / d * 430; b.vy = dy / d * 430;
      b.targetTeam = keeper.team; b.targetId = receiver.id;
      receiver.state = 'receiving'; receiver.stateTimer = 0.9;
      if (keeper.team === 'home') this.activePlayerIndex = this.homeTeam.indexOf(receiver);
    } else {
      b.vx = 0; b.vy = keeper.team === 'home' ? -420 : 420;
      b.targetTeam = null; b.targetId = null;
    }
    b.owner = 'none'; b.ownerId = null; b.heldByKeeper = null; b.lastTouchTeam = keeper.team;
    b.x = keeper.x; b.y = keeper.y + (keeper.team === 'home' ? -14 : 14);
    this.possession = keeper.team; this.kickCd = 0.1;
    keeper.state = 'idle'; keeper.holdTimer = 0; keeper.cooldown = 0.5;
    this.sfx?.('kick');
  }

  private updateBall(dt: number) {
    const b = this.ball;
    if (b.owner !== 'none') { this.updateBallAttachment(); return; }
    if (b.heldByKeeper) { this.updateBallAttachment(); return; }
    if (this.magnet > 0 && this.possession === 'home') {
      const active = this.homeTeam[this.activePlayerIndex];
      if (active) {
        const dx = active.x - b.x, dy = active.y - b.y, distance = len(dx, dy);
        if (distance < 340) { b.vx += dx / distance * 620 * dt; b.vy += dy / distance * 620 * dt; }
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    // Required continuous grass friction, independent of the update rate.
    const friction = Math.pow(0.5, dt);
    b.vx *= friction; b.vy *= friction;
    b.spin += len(b.vx, b.vy) * dt * 0.05;
    if (b.x < FIELD_LEFT + BALL_RADIUS) { b.x = FIELD_LEFT + BALL_RADIUS; b.vx = Math.abs(b.vx) * 0.72; this.addShake(1.5); }
    if (b.x > FIELD_RIGHT - BALL_RADIUS) { b.x = FIELD_RIGHT - BALL_RADIUS; b.vx = -Math.abs(b.vx) * 0.72; this.addShake(1.5); }

    this.resolveKeeperContact(this.awayKeeper);
    this.resolveKeeperContact(this.homeKeeper);
    if (this.resetTimer > 0) return;

    if (b.y < FIELD_TOP + BALL_RADIUS) {
      if (b.x > GOAL_CENTER_X - GOAL_W / 2 + 2 && b.x < GOAL_CENTER_X + GOAL_W / 2 - 2) this.scoreGoal('home');
      else { b.y = FIELD_TOP + BALL_RADIUS; b.vy = Math.abs(b.vy) * 0.68; this.addShake(3); }
    } else if (b.y > FIELD_BOTTOM - BALL_RADIUS) {
      if (b.x > GOAL_CENTER_X - GOAL_W / 2 + 2 && b.x < GOAL_CENTER_X + GOAL_W / 2 - 2) this.scoreGoal('away');
      else { b.y = FIELD_BOTTOM - BALL_RADIUS; b.vy = -Math.abs(b.vy) * 0.68; this.addShake(3); }
    }
  }

  private updateBallAttachment() {
    const b = this.ball;
    if (b.heldByKeeper) {
      const keeper = b.heldByKeeper === 'home' ? this.homeKeeper : this.awayKeeper;
      b.x = keeper.x; b.y = keeper.y + (keeper.team === 'home' ? -14 : 14);
      b.vx = 0; b.vy = 0;
      return;
    }
    if (b.owner === 'none' || b.ownerId === null) return;
    const carrier = this.getPlayer(b.owner, b.ownerId);
    if (!carrier) return;
    const offset = carrier.state === 'shooting' || carrier.state === 'passing' ? 19 : 20;
    b.x = clamp(carrier.x + Math.cos(carrier.ang) * offset, FIELD_LEFT + BALL_RADIUS, FIELD_RIGHT - BALL_RADIUS);
    b.y = clamp(carrier.y + Math.sin(carrier.ang) * offset, FIELD_TOP + BALL_RADIUS, FIELD_BOTTOM - BALL_RADIUS);
    b.vx = carrier.vx; b.vy = carrier.vy;
    b.spin += len(carrier.vx, carrier.vy) * 0.0008;
  }

  private resolveKeeperContact(keeper: Goalkeeper) {
    const b = this.ball;
    if (b.owner !== 'none' || b.heldByKeeper) return;
    const toward = keeper.team === 'away' ? b.vy < 0 : b.vy > 0;
    if (!toward) return;
    const dx = b.x - keeper.x, dy = b.y - keeper.y;
    const distance = len(dx, dy);
    const reach = keeper.state === 'diving' ? 34 : 25;
    if (distance > reach + BALL_RADIUS) return;

    const speed = len(b.vx, b.vy);
    const onDiveEdge = Math.abs(dx) > (keeper.state === 'diving' ? 16 : 11);
    if (speed > 760 || onDiveEdge) {
      const nx = dx / distance, ny = dy / distance;
      const dot = b.vx * nx + b.vy * ny;
      let vx = (b.vx - 2 * dot * nx) * 0.66;
      let vy = (b.vy - 2 * dot * ny) * 0.66;
      const angle = rand(-0.24, 0.24), c = Math.cos(angle), s = Math.sin(angle);
      const rx = vx * c - vy * s, ry = vx * s + vy * c;
      vx = rx; vy = ry;
      if (keeper.team === 'away' && vy < 80) vy = Math.abs(vy) + 110;
      if (keeper.team === 'home' && vy > -80) vy = -Math.abs(vy) - 110;
      b.vx = vx; b.vy = vy; b.x = keeper.x + nx * (reach + BALL_RADIUS + 2); b.y = keeper.y + ny * (reach + BALL_RADIUS + 2);
      b.targetTeam = null; b.targetId = null; b.lastTouchTeam = keeper.team; this.possession = 'neutral';
      keeper.state = 'idle'; keeper.dive = 0; keeper.cooldown = 0.45;
      this.addShake(7); this.sfx?.('save'); this.float(keeper.x, keeper.y - 32, 'PARADE !', '#fca5a5', 20);
      this.burst(b.x, b.y, 16, ['#fca5a5', '#fff', '#ffd166'], 190, 0, 3.5);
    } else {
      b.owner = keeper.team; b.ownerId = null; b.heldByKeeper = keeper.team; b.targetTeam = null; b.targetId = null;
      b.lastTouchTeam = keeper.team; b.vx = 0; b.vy = 0; this.possession = keeper.team;
      keeper.state = 'holding'; keeper.holdTimer = 1.25; keeper.dive = 0; keeper.cooldown = 0.4;
      this.addShake(5); this.sfx?.('save'); this.float(keeper.x, keeper.y - 30, 'CAPTÉ !', '#a7f3d0', 18);
      this.burst(b.x, b.y, 11, ['#a7f3d0', '#fff'], 130, 0, 3);
    }
  }

  private resolvePlayerBallInteractions() {
    const b = this.ball;
    if (b.owner !== 'none') {
      const carrier = b.ownerId !== null ? this.getPlayer(b.owner, b.ownerId) : null;
      if (!carrier) return;
      const opponents = carrier.team === 'home' ? this.awayTeam : this.homeTeam;
      for (const tackler of opponents) {
        if (tackler.stunTimer > 0 || tackler.tackleCooldown > 0) continue;
        const distance = len(tackler.x - carrier.x, tackler.y - carrier.y);
        if (distance > 34) continue;
        const isHomeCarrier = carrier.team === 'home' && carrier.id === this.homeTeam[this.activePlayerIndex]?.id;
        if (isHomeCarrier && this.dashTimer > 0 && tackler.stunTimer <= 0) {
          tackler.stunTimer = 1.05; tackler.state = 'stunned'; tackler.stateTimer = 1.05;
          tackler.vx += (tackler.x - carrier.x) * 3; tackler.vy += (tackler.y - carrier.y) * 3;
          const points = 15 * (this.x2 > 0 ? 2 : 1);
          this.score += points; this.stats.dodges++; this.stats.score = this.score;
          this.float(carrier.x, carrier.y - 34, `ESQUIVE +${points}`, '#a7f3d0', 17);
          this.burst(tackler.x, tackler.y, 12, ['#a7f3d0', '#fff', '#22d3ee'], 190);
          this.addShake(4); this.sfx?.('dodge');
          continue;
        }
        if (distance > 26) continue;
        const isHumanTackle = tackler.team === 'home' && tackler.id === this.homeTeam[this.activePlayerIndex]?.id;
        const isDashing = isHumanTackle && this.dashTimer > 0;
        if (isDashing) {
          carrier.stunTimer = 0.65; carrier.state = 'stunned'; carrier.stateTimer = 0.65;
          tackler.state = 'tackling'; tackler.stateTimer = 0.24; tackler.tackleCooldown = 0.5;
          this.setPlayerPossession(tackler);
          this.sfx?.('tackle'); this.addShake(5); this.float(tackler.x, tackler.y - 30, 'RÉCUPÉRATION !', '#a7f3d0', 17);
          this.burst(carrier.x, carrier.y, 12, ['#a7f3d0', '#fff', '#22d3ee'], 170);
          return;
        }
        const chance = tackler.team === 'away' ? 0.32 * DIFFICULTY[this.diff].def : 0.56;
        if (Math.random() < chance) {
          const a = Math.atan2(carrier.y - tackler.y, carrier.x - tackler.x) + rand(-0.32, 0.32);
          b.owner = 'none'; b.ownerId = null; b.heldByKeeper = null; b.targetTeam = null; b.targetId = null;
          b.x = carrier.x; b.y = carrier.y; b.vx = Math.cos(a) * 245; b.vy = Math.sin(a) * 245;
          b.lastTouchTeam = tackler.team; this.possession = 'neutral'; this.kickCd = 0.25;
          carrier.stunTimer = 0.48; carrier.state = 'stunned'; carrier.stateTimer = 0.48;
          tackler.state = 'tackling'; tackler.stateTimer = 0.3; tackler.tackleCooldown = 0.85;
          this.combo = 0; this.sfx?.('tackle'); this.addShake(7); this.flash = 0.22;
          this.float(carrier.x, carrier.y - 32, 'TACLÉ !', '#f87171', 18);
          this.burst(carrier.x, carrier.y, 13, ['#f87171', '#fff'], 175);
          return;
        }
        tackler.tackleCooldown = 0.35;
      }
      return;
    }

    if (this.kickCd > 0) return;
    // Give the intended receiver priority, while still allowing a defender to intercept.
    if (b.targetTeam && b.targetId !== null) {
      const target = this.getPlayer(b.targetTeam, b.targetId);
      if (target && len(target.x - b.x, target.y - b.y) < 29) { this.setPlayerPossession(target); return; }
    }
    let best: FootballPlayer | null = null, bestDistance = Number.POSITIVE_INFINITY;
    for (const p of this.homeTeam) {
      const distance = len(p.x - b.x, p.y - b.y);
      if (distance < 20 && distance < bestDistance) { best = p; bestDistance = distance; }
    }
    for (const p of this.awayTeam) {
      const distance = len(p.x - b.x, p.y - b.y);
      if (distance < 20 && distance < bestDistance) { best = p; bestDistance = distance; }
    }
    if (best) this.setPlayerPossession(best);
  }

  private setPlayerPossession(player: FootballPlayer) {
    const b = this.ball;
    b.owner = player.team; b.ownerId = player.id; b.heldByKeeper = null;
    b.targetTeam = null; b.targetId = null; b.lastTouchTeam = player.team;
    this.possession = player.team; this.kickCd = 0.16;
    player.state = player.state === 'receiving' ? 'receiving' : 'running';
    player.stateTimer = Math.max(player.stateTimer, 0.18);
    if (player.team === 'home') this.activePlayerIndex = this.homeTeam.indexOf(player);
    this.sfx?.('touch'); this.burst(b.x, b.y, 4, ['#a7f3d0', '#fff'], 70, 0, 2.5);
    this.updateBallAttachment();
  }

  private updatePickups(dt: number) {
    this.pickupTimer -= dt;
    if (this.pickupTimer <= 0 && this.pickups.length < 2) {
      this.pickupTimer = rand(8, 12);
      const types: Pickup['type'][] = ['time', 'x2', 'speed', 'magnet'];
      const type = types[(Math.random() * types.length) | 0];
      this.pickups.push({ x: rand(FIELD_LEFT + 55, FIELD_RIGHT - 55), y: rand(FIELD_TOP + 160, FIELD_BOTTOM - 160), type, life: 12, t: 0 });
    }
    const active = this.homeTeam[this.activePlayerIndex];
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const q = this.pickups[i]; q.life -= dt; q.t += dt;
      if (q.life <= 0) { this.pickups.splice(i, 1); continue; }
      if (!active || len(q.x - active.x, q.y - active.y) >= 32) continue;
      this.pickups.splice(i, 1); this.sfx?.('power');
      this.burst(q.x, q.y, 26, ['#ffd166', '#fff', '#22d3ee'], 260, 120, 4); this.addShake(5);
      if (q.type === 'time') { this.time = Math.min(99, this.time + 6); this.float(q.x, q.y, '+6 SECONDES', '#a7f3d0', 18); }
      if (q.type === 'x2') { this.x2 = 10; this.float(q.x, q.y, 'SCORE x2', '#f472b6', 18); }
      if (q.type === 'speed') { this.speedBoost = 8; this.float(q.x, q.y, 'VITESSE +', '#22d3ee', 18); }
      if (q.type === 'magnet') { this.magnet = 8; this.float(q.x, q.y, 'AIMANT', '#c084fc', 18); }
    }
  }

  private updateTrail(dt: number) {
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt * 3.2;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }
  }

  private scoreGoal(scoringTeam: TeamType) {
    const b = this.ball;
    if (scoringTeam === 'home') {
      this.goals++; this.stats.goals++;
      this.combo++; this.comboTimer = 13;
      this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
      const distanceBonus = Math.round(clamp((this.lastHomeShotY - FIELD_TOP) / 145, 0, 5));
      let points = (100 + distanceBonus * 25) * this.combo * DIFFICULTY[this.diff].mul;
      if (this.x2 > 0) points *= 2;
      points = Math.round(points);
      this.score += points; this.stats.score = this.score;
      this.time = Math.min(99, this.time + 4);
      if (this.goals % 3 === 0) {
        this.level++; this.stats.level = this.level;
        this.showBanner(`NIVEAU ${this.level} — ${waveName(this.level)}`, '#22d3ee', '');
      } else this.showBanner(this.combo > 1 ? `BUT ! x${this.combo}` : 'BUT !', '#ffd166', this.x2 > 0 ? 'x2 ACTIF · +4s' : '+4 secondes');
      this.float(b.x, b.y + 38, `+${points}`, '#ffd166', 32);
      this.float(GOAL_CENTER_X, H / 2 + 70, '+4s', '#a7f3d0', 20);
      this.nextKickoffTeam = 'away';
      this.stats.level = this.level;
      this.sfx?.('goal');
      this.burst(b.x, b.y, 60, ['#ffd166', '#fff', '#22d3ee', '#f472b6', '#a3e635'], 430, 500, 5);
      this.burst(GOAL_CENTER_X, PITCH_H / 2, 36, ['#ffd166', '#fff', '#22d3ee', '#f472b6'], 320, 320, 4);
    } else {
      this.combo = 0; this.comboTimer = 0;
      this.time = Math.max(1, this.time - 4);
      this.nextKickoffTeam = 'home';
      this.showBanner('BUT ADVERSE', '#fb7185', '−4 secondes · reprenez le ballon !');
      this.float(b.x, b.y - 30, 'BUT ADVERSE', '#fda4af', 23);
      this.sfx?.('goal');
      this.burst(b.x, b.y, 34, ['#fb7185', '#fff', '#fca5a5'], 300, 350, 4);
    }
    this.addShake(18); this.flash = 0.8; this.flashColor = '255,255,255'; this.freeze = 0.12; this.resetTimer = 1.25;
    b.vx *= 0.08; b.vy *= 0.05; b.owner = 'none'; b.ownerId = null; b.heldByKeeper = null;
    b.targetTeam = null; b.targetId = null; this.possession = 'neutral';
  }

  private endGame() {
    this.phase = 'over';
    this.stats.score = this.score;
    this.showBanner('COUP DE SIFFLET FINAL', '#fff', '');
    this.addShake(6); this.sfx?.('whistle');
    this.onEnd?.({ ...this.stats });
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life -= dt / q.max;
      if (q.life <= 0) { this.particles.splice(i, 1); continue; }
      q.vy += (q.grav || 0) * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= Math.pow(0.1, dt); q.vy *= Math.pow(0.3, dt);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.life -= dt * 0.9; t.y -= 42 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  private updateCamera(dt: number) {
    let targetX = this.ball.x, targetY = this.ball.y;
    if (this.ball.owner === 'home' && this.ball.ownerId !== null) {
      const carrier = this.getPlayer('home', this.ball.ownerId);
      if (carrier) { targetX = carrier.x; targetY = carrier.y; }
    } else if (this.ball.owner === 'away' && this.ball.ownerId !== null) {
      const carrier = this.getPlayer('away', this.ball.ownerId);
      if (carrier) { targetX = carrier.x; targetY = carrier.y; }
    }
    const desiredX = clamp(targetX - W / 2, 0, PITCH_W - W);
    const desiredY = clamp(targetY - H / 2, 0, PITCH_H - H);
    const blend = 1 - Math.exp(-5.2 * dt);
    this.camX = clamp(this.camX + (desiredX - this.camX) * blend, 0, PITCH_W - W);
    this.camY = clamp(this.camY + (desiredY - this.camY) * blend, 0, PITCH_H - H);
  }

  // ---------------- RENDER ----------------
  render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    // All world-space entities, particles and float texts inherit this camera transform.
    ctx.translate(-this.camX, -this.camY);
    ctx.translate(this.shakeX, this.shakeY);
    this.drawPitch(ctx);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    const shadow = (x: number, y: number, r: number) => {
      ctx.beginPath(); ctx.ellipse(x + 3, y + 6, r, r * 0.5, 0, 0, PI2); ctx.fill();
    };
    for (const p of this.homeTeam) shadow(p.x, p.y, 14);
    for (const p of this.awayTeam) shadow(p.x, p.y, 14);
    shadow(this.homeKeeper.x, this.homeKeeper.y, 16); shadow(this.awayKeeper.x, this.awayKeeper.y, 16); shadow(this.ball.x, this.ball.y, 7);

    for (const q of this.pickups) this.drawPickup(ctx, q);
    for (const t of this.trail) {
      ctx.globalAlpha = t.life * 0.35; ctx.fillStyle = '#7dd3fc';
      ctx.beginPath(); ctx.arc(t.x, t.y, 13 * t.life, 0, PI2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.drawPlayer(ctx, this.awayKeeper.x, this.awayKeeper.y, -Math.PI / 2, '#a78bfa', '#5b21b6', 0, this.awayKeeper.dive * this.awayKeeper.diveDir, false, false);
    this.drawPlayer(ctx, this.homeKeeper.x, this.homeKeeper.y, Math.PI / 2, '#f59e0b', '#7c2d12', 0, this.homeKeeper.dive * this.homeKeeper.diveDir, false, false);
    for (const p of this.awayTeam) this.drawPlayer(ctx, p.x, p.y, p.ang, '#ef4444', '#7f1d1d', p.step, 0, p.stunTimer > 0, false);
    for (let i = 0; i < this.homeTeam.length; i++) {
      const p = this.homeTeam[i];
      this.drawPlayer(ctx, p.x, p.y, p.ang, '#38bdf8', '#0c4a6e', p.step, 0, p.stunTimer > 0, i === this.activePlayerIndex);
    }

    const active = this.homeTeam[this.activePlayerIndex];
    if (active && !this.charging && this.phase === 'playing') this.drawActiveMarker(ctx, active);
    if (this.charging && active) {
      ctx.beginPath(); ctx.arc(active.x, active.y, 26, -Math.PI / 2 + 0.82 * PI2, -Math.PI / 2 + PI2);
      ctx.strokeStyle = 'rgba(255,209,102,0.55)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.arc(active.x, active.y, 26, -Math.PI / 2, -Math.PI / 2 + this.power * PI2);
      ctx.strokeStyle = this.perfectShot ? '#f472b6' : '#ffd166'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(active.x, active.y);
      ctx.lineTo(active.x + Math.cos(active.ang) * (40 + this.power * 90), active.y + Math.sin(active.ang) * (40 + this.power * 90));
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (this.speedBoost > 0 && active) {
      ctx.globalAlpha = 0.25 + Math.sin(this.tick * 12) * 0.1; ctx.fillStyle = '#22d3ee';
      ctx.beginPath(); ctx.arc(active.x, active.y, 22, 0, PI2); ctx.fill(); ctx.globalAlpha = 1;
    }
    if (this.magnet > 0 && active) {
      ctx.strokeStyle = 'rgba(192,132,252,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.arc(active.x, active.y, 95, 0, PI2); ctx.stroke(); ctx.setLineDash([]);
    }

    this.drawBall(ctx);
    for (const q of this.particles) {
      ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.size * q.life, 0, PI2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 1.5); ctx.font = `900 ${t.size}px system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(t.text, t.x, t.y); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();

    // Screen-space celebration layers remain fixed while the pitch scrolls.
    if (this.banner.life > 0) {
      const life = this.banner.life, alpha = Math.min(1, life * 3), scale = 1 + Math.max(0, life - 1.3) * 4;
      ctx.save(); ctx.translate(W / 2, H / 2 - 40); ctx.scale(scale, scale); ctx.globalAlpha = alpha;
      ctx.font = '900 42px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,0.72)';
      ctx.strokeText(this.banner.text, 0, 0); ctx.fillStyle = this.banner.color; ctx.fillText(this.banner.text, 0, 0);
      if (this.banner.sub) {
        ctx.font = '800 15px system-ui, sans-serif'; ctx.lineWidth = 4;
        ctx.strokeText(this.banner.sub, 0, 27); ctx.fillStyle = '#fff'; ctx.fillText(this.banner.sub, 0, 27);
      }
      ctx.restore();
    }
    if (this.flash > 0) { ctx.fillStyle = `rgba(${this.flashColor},${this.flash * 0.4})`; ctx.fillRect(0, 0, W, H); }
    const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
    if (this.time < 10 && this.phase === 'playing') {
      ctx.fillStyle = `rgba(239,68,68,${0.08 + Math.sin(this.tick * 8) * 0.06})`; ctx.fillRect(0, 0, W, H);
    }
  }

  private drawActiveMarker(ctx: CanvasRenderingContext2D, p: FootballPlayer) {
    ctx.save(); ctx.translate(p.x, p.y - 25 + Math.sin(this.tick * 7) * 2);
    ctx.fillStyle = '#fde68a'; ctx.strokeStyle = 'rgba(15,23,42,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(-6, -2); ctx.lineTo(6, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  private drawPickup(ctx: CanvasRenderingContext2D, q: Pickup) {
    const pulse = 1 + Math.sin(q.t * 5) * 0.12;
    const colors: Record<Pickup['type'], [string, string, string]> = {
      time: ['#a7f3d0', '#059669', '+'], x2: ['#f9a8d4', '#be185d', '2x'],
      speed: ['#7dd3fc', '#0369a1', '>>'], magnet: ['#d8b4fe', '#7e22ce', 'U'],
    };
    const [c1, c2, glyph] = colors[q.type];
    const blink = q.life < 3 ? (Math.sin(q.t * 16) > 0 ? 1 : 0.35) : 1;
    ctx.save(); ctx.translate(q.x, q.y); ctx.globalAlpha = blink;
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, 22 * pulse, 0, PI2); ctx.fill();
    ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(0, 0, 16 * pulse, 0, PI2); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.font = '900 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 0, 1); ctx.restore();
  }

  private drawPitch(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#18252b'; ctx.fillRect(0, 0, PITCH_W, PITCH_H);
    ctx.fillStyle = '#2d9141'; ctx.fillRect(FIELD_LEFT, FIELD_TOP, FIELD_RIGHT - FIELD_LEFT, FIELD_BOTTOM - FIELD_TOP);
    const bandH = 100;
    for (let y = FIELD_TOP, i = 0; y < FIELD_BOTTOM; y += bandH, i++) {
      ctx.fillStyle = i % 2 === 0 ? '#32a34a' : '#2a8c3e';
      ctx.fillRect(FIELD_LEFT, y, FIELD_RIGHT - FIELD_LEFT, Math.min(bandH, FIELD_BOTTOM - y));
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.86)'; ctx.lineWidth = 3;
    ctx.strokeRect(FIELD_LEFT, FIELD_TOP, FIELD_RIGHT - FIELD_LEFT, FIELD_BOTTOM - FIELD_TOP);
    ctx.beginPath(); ctx.moveTo(FIELD_LEFT, PITCH_H / 2); ctx.lineTo(FIELD_RIGHT, PITCH_H / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(GOAL_CENTER_X, PITCH_H / 2, 92, 0, PI2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(GOAL_CENTER_X, PITCH_H / 2, 4, 0, PI2); ctx.fill();

    const boxW = 420, boxD = 170, sixW = 210, sixD = 72, penaltySpot = 132, arcR = 77;
    const leftBox = GOAL_CENTER_X - boxW / 2, smallLeft = GOAL_CENTER_X - sixW / 2;
    ctx.strokeRect(leftBox, FIELD_TOP, boxW, boxD); ctx.strokeRect(smallLeft, FIELD_TOP, sixW, sixD);
    ctx.beginPath(); ctx.arc(GOAL_CENTER_X, FIELD_TOP + penaltySpot, 4, 0, PI2); ctx.fill();
    ctx.beginPath(); ctx.arc(GOAL_CENTER_X, FIELD_TOP + penaltySpot, arcR, 0.13 * Math.PI, 0.87 * Math.PI); ctx.stroke();

    const bottomBoxY = FIELD_BOTTOM - boxD, bottomSixY = FIELD_BOTTOM - sixD;
    ctx.strokeRect(leftBox, bottomBoxY, boxW, boxD); ctx.strokeRect(smallLeft, bottomSixY, sixW, sixD);
    ctx.beginPath(); ctx.arc(GOAL_CENTER_X, FIELD_BOTTOM - penaltySpot, 4, 0, PI2); ctx.fill();
    ctx.beginPath(); ctx.arc(GOAL_CENTER_X, FIELD_BOTTOM - penaltySpot, arcR, 1.13 * Math.PI, 1.87 * Math.PI); ctx.stroke();

    // Corner arcs make the full touchlines and goal lines legible in the moving view.
    for (const x of [FIELD_LEFT, FIELD_RIGHT]) {
      ctx.beginPath(); ctx.arc(x, FIELD_TOP, 14, 0, Math.PI / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, FIELD_BOTTOM, 14, -Math.PI / 2, 0); ctx.stroke();
    }
    this.drawGoal(ctx, true);
    this.drawGoal(ctx, false);
  }

  private drawGoal(ctx: CanvasRenderingContext2D, top: boolean) {
    const gx = GOAL_CENTER_X - GOAL_W / 2;
    const y = top ? FIELD_TOP - GOAL_D : FIELD_BOTTOM;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(gx, y, GOAL_W, GOAL_D);
    ctx.strokeStyle = 'rgba(255,255,255,0.34)'; ctx.lineWidth = 1;
    for (let x = gx; x <= gx + GOAL_W; x += 12) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + GOAL_D); ctx.stroke();
    }
    for (let gy = y; gy <= y + GOAL_D; gy += 8) {
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + GOAL_W, gy); ctx.stroke();
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath();
    if (top) {
      ctx.moveTo(gx, FIELD_TOP + 2); ctx.lineTo(gx, FIELD_TOP - GOAL_D); ctx.lineTo(gx + GOAL_W, FIELD_TOP - GOAL_D); ctx.lineTo(gx + GOAL_W, FIELD_TOP + 2);
    } else {
      ctx.moveTo(gx, FIELD_BOTTOM - 2); ctx.lineTo(gx, FIELD_BOTTOM + GOAL_D); ctx.lineTo(gx + GOAL_W, FIELD_BOTTOM + GOAL_D); ctx.lineTo(gx + GOAL_W, FIELD_BOTTOM - 2);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, shirt: string, dark: string, step: number, dive = 0, stunned = false, isHero = false) {
    ctx.save(); ctx.translate(x, y);
    if (dive) { ctx.rotate(dive * 0.9); ctx.scale(1 + Math.abs(dive) * 0.6, 1 - Math.abs(dive) * 0.2); }
    if (stunned) ctx.globalAlpha = 0.62;
    const sw = Math.sin(step) * 6;
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(Math.cos(ang) * sw + Math.cos(ang + Math.PI / 2) * 7, Math.sin(ang) * sw + Math.sin(ang + Math.PI / 2) * 7, 5, 3.5, ang, 0, PI2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-Math.cos(ang) * sw + Math.cos(ang - Math.PI / 2) * 7, -Math.sin(ang) * sw + Math.sin(ang - Math.PI / 2) * 7, 5, 3.5, ang, 0, PI2); ctx.fill();
    ctx.fillStyle = shirt; ctx.beginPath(); ctx.arc(0, 0, PLAYER_RADIUS, 0, PI2); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(Math.cos(ang + Math.PI / 2) * 10, Math.sin(ang + Math.PI / 2) * 10);
    ctx.lineTo(Math.cos(ang - Math.PI / 2) * 10, Math.sin(ang - Math.PI / 2) * 10); ctx.stroke();
    ctx.fillStyle = '#fcd7b6'; ctx.beginPath(); ctx.arc(Math.cos(ang) * 3, Math.sin(ang) * 3, 7, 0, PI2); ctx.fill();
    ctx.fillStyle = isHero ? '#fbbf24' : '#3f2a1d'; ctx.beginPath();
    ctx.arc(Math.cos(ang) * 1, Math.sin(ang) * 1, 6.5, ang + Math.PI * 0.6, ang + Math.PI * 1.4); ctx.fill();
    if (isHero) { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 17, 0, PI2); ctx.stroke(); }
    ctx.restore();
  }

  private drawBall(ctx: CanvasRenderingContext2D) {
    const b = this.ball, speed = len(b.vx, b.vy);
    if (speed > 300 && b.owner === 'none') {
      const grad = ctx.createLinearGradient(b.x, b.y, b.x - b.vx * 0.07, b.y - b.vy * 0.07);
      grad.addColorStop(0, 'rgba(255,255,255,0.85)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grad; ctx.lineWidth = 8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.07, b.y - b.vy * 0.07); ctx.stroke();
    }
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.spin);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, BALL_RADIUS, 0, PI2); ctx.fill();
    ctx.fillStyle = '#1f2937';
    for (let i = 0; i < 5; i++) { const a = i * PI2 / 5; ctx.beginPath(); ctx.arc(Math.cos(a) * 4.5, Math.sin(a) * 4.5, 2.2, 0, PI2); ctx.fill(); }
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, BALL_RADIUS, 0, PI2); ctx.stroke();
    ctx.restore();
  }
}
