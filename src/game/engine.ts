// eFootball Striker — fixed-step arcade football gameplay on the Phase 0 engine foundation.

export const W = 480;
export const H = 720;
export const PITCH_W = 800;
export const PITCH_H = 1200;

const FIELD_LEFT = 30;
const FIELD_RIGHT = PITCH_W - FIELD_LEFT;
const FIELD_TOP = 30;
const FIELD_BOTTOM = PITCH_H - FIELD_TOP;
const CENTER_X = PITCH_W / 2;
const CENTER_Y = PITCH_H / 2;
const GOAL_WIDTH = 190;
const GOAL_DEPTH = 30;
const PLAYER_RADIUS = 14;
const BALL_RADIUS = 8;
const BALL_OFFSET = PLAYER_RADIUS + BALL_RADIUS + 1;
const PLAYER_COLLISION_DISTANCE = PLAYER_RADIUS * 2;
const HOME_SUPPORT_SEPARATION_RADIUS = 112;
const HOME_SUPPORT_SEPARATION_OFFSET = 48;
const BALL_PICKUP_DISTANCE = PLAYER_RADIUS + BALL_RADIUS + 5;
const PASS_CHARGE_LIMIT = 0.25;
const MAX_SHOT_CHARGE = 0.9;
const PERFECT_SHOT_MIN = 0.78;
const PERFECT_SHOT_MAX = 0.91;
const OWNER_LOCK_DURATION = 0.28;
const GK_DIVE_TRIGGER_TIME = 0.95;
const GK_DIVE_DURATION = 0.95;
const GK_RECOVERY_DURATION = 0.42;
const GK_HOLD_DURATION = 0.52;
const GK_NORMAL_SPEED = 112;
const GK_DIVE_SPEED = 238;
const GK_NORMAL_SAVE_RADIUS = 23;
const GK_DIVE_SAVE_RADIUS = 34;
const GK_CATCH_SPEED = 470;
const GK_CATCH_RADIUS = 25;
const PI2 = Math.PI * 2;

export type TeamType = 'home' | 'away';
export type TeamPossession = TeamType | 'neutral';
export type Phase = 'start' | 'playing' | 'paused';
export type PlayerRole = 'defender' | 'midfielder' | 'forward';
export type PlayerState = 'idle' | 'running' | 'receiving' | 'passing' | 'shooting' | 'tackling' | 'stunned';
export type Difficulty = 'amateur' | 'pro' | 'legend';
export type AwayMode = 'defending' | 'attacking';

export interface Input {
  dx: number;
  dy: number;
  /** Action is held to charge a shot; a short press releases a pass. */
  action: boolean;
  /** Edge event preserves a quick tap even if it begins and ends between steps. */
  actionPressed: boolean;
  /** Reserved for a later manual player-switch control. */
  switchPlayer?: boolean;
}

export interface FootballPlayer {
  id: number;
  team: TeamType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  role: PlayerRole;
  state: PlayerState;
  stateTimer: number;
  angle: number;
  formationX: number;
  formationY: number;
  /** Tactical decision cadence and reaction delay for non-human team behaviors. */
  aiDecisionTimer: number;
  aiReactionTimer: number;
  tackleCooldown: number;
  stunTimer: number;
}

export type GoalkeeperState = 'idle' | 'positioning' | 'diving' | 'holding' | 'recovering';

export interface Goalkeeper {
  team: TeamType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: GoalkeeperState;
  stateTimer: number;
  angle: number;
  diveTargetX: number;
  diveTargetY: number;
  diveDirectionX: number;
  diveDirectionY: number;
  diveCanCatch: boolean;
}

export interface FootballBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  friction: number;
  owner: TeamType | 'none';
  ownerId: number | null;
  lastTouchTeam: TeamType | null;
  acquisitionCooldown: number;
  /** Briefly protects a newly recovered carrier from frame-to-frame owner flips. */
  ownerLockTimer: number;
  /** Pass target remains marked while the ball is travelling. */
  targetTeam: TeamType | null;
  targetId: number | null;
  /** Team whose goalkeeper may need to defend a shot in flight. */
  shotTeam: TeamType | null;
  shotPower: number;
  shotAttempted: boolean;
  /** Ball is held by a keeper without pretending it is owned by an outfield player. */
  keeperOwner: TeamType | null;
}

export interface HudState {
  homeScore: number;
  awayScore: number;
  possession: TeamPossession;
  activePlayerId: number | null;
  power: number;
  charging: boolean;
  perfectShot: boolean;
  goalCelebration: TeamType | null;
  difficulty: Difficulty;
  awayMode: AwayMode;
}

interface FormationSlot { x: number; y: number; role: PlayerRole }

interface AIDifficultyProfile {
  decisionInterval: number;
  reactionDelay: number;
  pressRange: number;
  pressOffset: number;
  tackleChance: number;
  failedTackleCooldown: number;
  successfulTackleCooldown: number;
  passPressureDistance: number;
  passError: number;
  passLaneMinimum: number;
  passSkill: number;
  betterPassThreshold: number;
  shotDistance: number;
  shotPressureDistance: number;
  shotAngleLimit: number;
  shotError: number;
  shotPowerMin: number;
  shotPowerMax: number;
  coverBallShift: number;
}

interface PassOption {
  player: FootballPlayer;
  score: number;
  laneClearance: number;
  distance: number;
}

const TACKLE_MIN_DISTANCE = 12;
const TACKLE_MAX_DISTANCE = PLAYER_COLLISION_DISTANCE + 8;
const TACKLE_REACTION_DISTANCE = 104;
const TACKLE_REARM_DISTANCE = 132;

const AI_PROFILES: Record<Difficulty, AIDifficultyProfile> = {
  amateur: {
    decisionInterval: 0.48, reactionDelay: 0.52, pressRange: 230, pressOffset: 30,
    tackleChance: 0.29, failedTackleCooldown: 0.98, successfulTackleCooldown: 1.12,
    passPressureDistance: 88, passError: 0.11, passLaneMinimum: 8, passSkill: 0.78,
    betterPassThreshold: 2.3, shotDistance: 255, shotPressureDistance: 54,
    shotAngleLimit: 0.5, shotError: 0.27, shotPowerMin: 0.55, shotPowerMax: 0.82,
    coverBallShift: 0.12,
  },
  pro: {
    decisionInterval: 0.3, reactionDelay: 0.32, pressRange: 320, pressOffset: 26,
    tackleChance: 0.43, failedTackleCooldown: 0.74, successfulTackleCooldown: 0.88,
    passPressureDistance: 112, passError: 0.065, passLaneMinimum: 18, passSkill: 1,
    betterPassThreshold: 1.15, shotDistance: 300, shotPressureDistance: 78,
    shotAngleLimit: 0.7, shotError: 0.15, shotPowerMin: 0.62, shotPowerMax: 0.9,
    coverBallShift: 0.18,
  },
  legend: {
    decisionInterval: 0.18, reactionDelay: 0.18, pressRange: 440, pressOffset: 23,
    tackleChance: 0.57, failedTackleCooldown: 0.54, successfulTackleCooldown: 0.68,
    passPressureDistance: 145, passError: 0.03, passLaneMinimum: 30, passSkill: 1.28,
    betterPassThreshold: 0.7, shotDistance: 340, shotPressureDistance: 100,
    shotAngleLimit: 0.86, shotError: 0.075, shotPowerMin: 0.68, shotPowerMax: 0.95,
    coverBallShift: 0.25,
  },
};

const HOME_FORMATION: readonly FormationSlot[] = [
  { x: 240, y: 1000, role: 'defender' },
  { x: 560, y: 1000, role: 'defender' },
  { x: 320, y: 820, role: 'midfielder' },
  { x: 480, y: 730, role: 'forward' },
];
const AWAY_FORMATION: readonly FormationSlot[] = [
  { x: 240, y: 200, role: 'defender' },
  { x: 560, y: 200, role: 'defender' },
  { x: 320, y: 380, role: 'midfielder' },
  { x: 480, y: 470, role: 'forward' },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const magnitude = (x: number, y: number) => Math.hypot(x, y);

function createPlayer(id: number, team: TeamType, slot: FormationSlot): FootballPlayer {
  return {
    id,
    team,
    x: slot.x,
    y: slot.y,
    vx: 0,
    vy: 0,
    speed: team === 'home' ? 245 : 155,
    role: slot.role,
    state: 'idle',
    stateTimer: 0,
    angle: team === 'home' ? -Math.PI / 2 : Math.PI / 2,
    formationX: slot.x,
    formationY: slot.y,
    aiDecisionTimer: 0,
    aiReactionTimer: 0,
    tackleCooldown: 0,
    stunTimer: 0,
  };
}

function createKeeper(team: TeamType): Goalkeeper {
  const y = team === 'home' ? FIELD_BOTTOM - 28 : FIELD_TOP + 28;
  return {
    team,
    x: CENTER_X,
    y,
    vx: 0,
    vy: 0,
    state: 'idle',
    stateTimer: 0,
    angle: team === 'home' ? -Math.PI / 2 : Math.PI / 2,
    diveTargetX: CENTER_X,
    diveTargetY: y,
    diveDirectionX: 0,
    diveDirectionY: team === 'home' ? -1 : 1,
    diveCanCatch: false,
  };
}

/**
 * Owns match state and coordinates explicit gameplay systems: player control,
 * passing/receiving, charged shots, away defensive/offensive tactics, formations,
 * ball physics, collisions, possession, goals/kickoff, camera and world rendering.
 */
export class Game {
  phase: Phase = 'start';
  homeScore = 0;
  awayScore = 0;
  possession: TeamPossession = 'neutral';
  activePlayerIndex = 0;
  difficulty: Difficulty = 'pro';
  awayMode: AwayMode = 'defending';
  defensivePresserId: number | null = null;

  readonly homeTeam: FootballPlayer[] = [];
  readonly awayTeam: FootballPlayer[] = [];
  homeKeeper: Goalkeeper = createKeeper('home');
  awayKeeper: Goalkeeper = createKeeper('away');
  readonly ball: FootballBall = {
    x: CENTER_X,
    y: CENTER_Y,
    vx: 0,
    vy: 0,
    friction: 0.5,
    owner: 'none',
    ownerId: null,
    lastTouchTeam: null,
    acquisitionCooldown: 0,
    ownerLockTimer: 0,
    targetTeam: null,
    targetId: null,
    shotTeam: null,
    shotPower: 0,
    shotAttempted: false,
    keeperOwner: null,
  };

  camX = CENTER_X - W / 2;
  camY = CENTER_Y - H / 2;
  goalResetTimer = 0;
  chargeTime = 0;
  power = 0;
  charging = false;
  perfectShot = false;
  goalCelebrationTeam: TeamType | null = null;
  goalCelebrationTimer = 0;
  private actionWasDown = false;
  private kickoffTeam: TeamType = 'home';
  private presserCarrierId: number | null = null;
  private presserEngaged = false;
  private randomState = 0x6d2b79f5;

  sfx?: (name: string) => void;

  constructor() {
    this.createTeams();
    this.resetForKickoff('home');
  }

  start() {
    this.phase = 'playing';
    this.homeScore = 0;
    this.awayScore = 0;
    this.goalResetTimer = 0;
    this.goalCelebrationTimer = 0;
    this.goalCelebrationTeam = null;
    this.resetCharge();
    this.actionWasDown = false;
    this.awayMode = 'defending';
    this.defensivePresserId = null;
    this.presserCarrierId = null;
    this.presserEngaged = false;
    this.randomState = 0x6d2b79f5;
    this.createTeams();
    this.resetForKickoff('home');
  }

  togglePause() {
    if (this.phase === 'playing') this.phase = 'paused';
    else if (this.phase === 'paused') this.phase = 'playing';
  }

  setDifficulty(difficulty: Difficulty) {
    this.difficulty = difficulty;
    this.presserEngaged = false;
    for (const player of this.awayTeam) {
      player.aiDecisionTimer = 0;
      player.aiReactionTimer = 0;
    }
  }

  private profile() {
    return AI_PROFILES[this.difficulty];
  }

  hud(): HudState {
    const active = this.homeTeam[this.activePlayerIndex];
    return {
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      possession: this.possession,
      activePlayerId: active?.id ?? null,
      power: this.power,
      charging: this.charging,
      perfectShot: this.perfectShot,
      goalCelebration: this.goalCelebrationTimer > 0 ? this.goalCelebrationTeam : null,
      difficulty: this.difficulty,
      awayMode: this.awayMode,
    };
  }

  /** Fixed-step state update. `dt` is seconds, never frames. */
  update(dt: number, input: Input) {
    if (this.phase !== 'playing') {
      this.updateCamera(dt);
      return;
    }

    const step = Math.min(Math.max(dt, 0), 0.05);
    this.updateTimers(step);
    if (this.goalResetTimer > 0) {
      this.goalResetTimer = Math.max(0, this.goalResetTimer - step);
      if (this.goalResetTimer === 0) this.resetForKickoff(this.kickoffTeam);
      this.updateCamera(step);
      return;
    }

    this.updateActivePlayer();
    this.updateHumanPlayer(step, input);
    this.updatePlayerAction(step, input);
    this.updateFormationPlayers(step);
    this.resolvePlayerCollisions();
    this.updateGoalkeepers(step);
    this.updateBall(step);
    this.resolveGoalkeeperBallCollision();
    this.resolvePlayerBallCollision();
    this.checkGoal();
    this.updateActivePlayer();
    this.updateCamera(step);
  }

  private createTeams() {
    this.homeTeam.length = 0;
    this.awayTeam.length = 0;
    for (let i = 0; i < HOME_FORMATION.length; i++) {
      this.homeTeam.push(createPlayer(i + 1, 'home', HOME_FORMATION[i]));
      this.awayTeam.push(createPlayer(i + 5, 'away', AWAY_FORMATION[i]));
    }
    this.homeKeeper = createKeeper('home');
    this.awayKeeper = createKeeper('away');
  }

  /** Places both teams, sets a centre restart and assigns the kick to one side. */
  private resetForKickoff(kickingTeam: TeamType) {
    for (const p of this.homeTeam) this.resetPlayer(p, HOME_FORMATION[p.id - 1]);
    for (const p of this.awayTeam) this.resetPlayer(p, AWAY_FORMATION[p.id - 5]);
    this.homeKeeper = createKeeper('home');
    this.awayKeeper = createKeeper('away');

    const kicker = kickingTeam === 'home' ? this.homeTeam[2] : this.awayTeam[2];
    const opponent = kickingTeam === 'home' ? this.awayTeam[3] : this.homeTeam[3];
    kicker.x = CENTER_X;
    kicker.y = CENTER_Y + (kickingTeam === 'home' ? BALL_OFFSET : -BALL_OFFSET);
    kicker.angle = kickingTeam === 'home' ? -Math.PI / 2 : Math.PI / 2;
    opponent.x = CENTER_X;
    opponent.y = CENTER_Y + (kickingTeam === 'home' ? -108 : 108);

    this.ball.x = CENTER_X;
    this.ball.y = CENTER_Y;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.owner = kickingTeam;
    this.ball.ownerId = kicker.id;
    this.ball.lastTouchTeam = kickingTeam;
    this.ball.acquisitionCooldown = 0;
    this.ball.ownerLockTimer = 0.65;
    this.ball.targetTeam = null;
    this.ball.targetId = null;
    this.ball.shotTeam = null;
    this.ball.shotPower = 0;
    this.ball.shotAttempted = false;
    this.ball.keeperOwner = null;
    this.possession = kickingTeam;
    this.awayMode = kickingTeam === 'away' ? 'attacking' : 'defending';
    this.defensivePresserId = null;
    this.presserCarrierId = null;
    this.presserEngaged = false;
    if (kickingTeam === 'away') {
      kicker.aiReactionTimer = this.profile().reactionDelay;
      kicker.aiDecisionTimer = this.profile().reactionDelay;
    }
    this.resetCharge();
    this.actionWasDown = false;
    this.goalCelebrationTimer = 0;
    this.goalCelebrationTeam = null;
    this.kickoffTeam = kickingTeam;
    this.activePlayerIndex = kickingTeam === 'home' ? this.homeTeam.indexOf(kicker) : this.findNearestHomePlayerIndex();
    this.attachBallToOwner();
  }

  private resetPlayer(player: FootballPlayer, slot: FormationSlot) {
    player.x = slot.x;
    player.y = slot.y;
    player.vx = 0;
    player.vy = 0;
    player.angle = player.team === 'home' ? -Math.PI / 2 : Math.PI / 2;
    player.role = slot.role;
    player.state = 'idle';
    player.stateTimer = 0;
    player.aiDecisionTimer = 0;
    player.aiReactionTimer = 0;
    player.tackleCooldown = 0;
    player.stunTimer = 0;
    player.formationX = slot.x;
    player.formationY = slot.y;
  }

  private updateTimers(dt: number) {
    this.ball.acquisitionCooldown = Math.max(0, this.ball.acquisitionCooldown - dt);
    this.ball.ownerLockTimer = Math.max(0, this.ball.ownerLockTimer - dt);
    this.goalCelebrationTimer = Math.max(0, this.goalCelebrationTimer - dt);
    if (this.goalCelebrationTimer === 0) this.goalCelebrationTeam = null;
    for (const p of this.homeTeam) this.updatePlayerTimers(p, dt);
    for (const p of this.awayTeam) this.updatePlayerTimers(p, dt);
  }

  private updatePlayerTimers(player: FootballPlayer, dt: number) {
    player.stateTimer = Math.max(0, player.stateTimer - dt);
    player.aiDecisionTimer = Math.max(0, player.aiDecisionTimer - dt);
    player.aiReactionTimer = Math.max(0, player.aiReactionTimer - dt);
    player.tackleCooldown = Math.max(0, player.tackleCooldown - dt);
    player.stunTimer = Math.max(0, player.stunTimer - dt);
    if (player.stunTimer === 0 && player.state === 'stunned') player.state = 'idle';
    if (player.stateTimer === 0 && (player.state === 'tackling' || player.state === 'receiving' || player.state === 'passing' || player.state === 'shooting')) player.state = 'idle';
  }

  /** Prefer the carrier or intended pass receiver; otherwise select the nearest home player. */
  private updateActivePlayer() {
    if (this.ball.owner === 'home' && this.ball.ownerId !== null) {
      const holderIndex = this.homeTeam.findIndex(p => p.id === this.ball.ownerId);
      if (holderIndex !== -1) {
        this.activePlayerIndex = holderIndex;
        return;
      }
    }
    if (this.ball.owner === 'none' && this.ball.targetTeam === 'home' && this.ball.targetId !== null) {
      const receiverIndex = this.homeTeam.findIndex(p => p.id === this.ball.targetId);
      if (receiverIndex !== -1) {
        this.activePlayerIndex = receiverIndex;
        return;
      }
    }
    this.activePlayerIndex = this.findNearestHomePlayerIndex();
  }

  private findNearestHomePlayerIndex() {
    let nearestIndex = 0;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.homeTeam.length; i++) {
      const p = this.homeTeam[i];
      const dx = p.x - this.ball.x;
      const dy = p.y - this.ball.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        nearestIndex = i;
      }
    }
    return nearestIndex;
  }

  private getPlayer(team: TeamType, id: number | null) {
    if (id === null) return null;
    const players = team === 'home' ? this.homeTeam : this.awayTeam;
    for (const player of players) if (player.id === id) return player;
    return null;
  }

  private updateHumanPlayer(dt: number, input: Input) {
    const player = this.homeTeam[this.activePlayerIndex];
    if (!player) return;

    let dx = input.dx;
    let dy = input.dy;
    let inputLength = magnitude(dx, dy);
    if (inputLength > 1) {
      dx /= inputLength;
      dy /= inputLength;
      inputLength = 1;
    }

    const isTargetReceiver = this.ball.owner === 'none'
      && this.ball.targetTeam === 'home'
      && this.ball.targetId === player.id;
    if (isTargetReceiver) {
      const ballSpeed = magnitude(this.ball.vx, this.ball.vy);
      const distanceToBall = magnitude(this.ball.x - player.x, this.ball.y - player.y);
      const leadTime = clamp(distanceToBall / Math.max(120, ballSpeed), 0.08, 0.5);
      const interceptX = this.ball.x + this.ball.vx * leadTime;
      const interceptY = this.ball.y + this.ball.vy * leadTime;
      let autoX = interceptX - player.x;
      let autoY = interceptY - player.y;
      const autoLength = magnitude(autoX, autoY);
      if (autoLength > 0.001) { autoX /= autoLength; autoY /= autoLength; }
      if (inputLength < 0.1) {
        dx = autoX;
        dy = autoY;
      } else {
        dx = dx * 0.62 + autoX * 0.38;
        dy = dy * 0.62 + autoY * 0.38;
      }
      const assistedLength = magnitude(dx, dy);
      if (assistedLength > 1) { dx /= assistedLength; dy /= assistedLength; }
    }

    const isCarrier = this.ball.owner === 'home' && this.ball.ownerId === player.id;
    const speedScale = this.charging && isCarrier ? 0.72 : 1;
    const blend = 1 - Math.exp(-12 * dt);
    const targetVx = dx * player.speed * speedScale;
    const targetVy = dy * player.speed * speedScale;
    player.vx += (targetVx - player.vx) * blend;
    player.vy += (targetVy - player.vy) * blend;
    this.movePlayerByVelocity(player, dt);

    const speed = magnitude(player.vx, player.vy);
    if (speed > 8) {
      player.angle = Math.atan2(player.vy, player.vx);
      player.state = player.stunTimer > 0 ? 'stunned' : 'running';
    } else if (player.stunTimer === 0) {
      player.state = 'idle';
    }
  }

  private updatePlayerAction(dt: number, input: Input) {
    const actionHeld = input.action;
    const pressed = (input.actionPressed || actionHeld) && !this.actionWasDown;
    let player = this.homeTeam[this.activePlayerIndex];
    let ownsBall = !!player && this.ball.owner === 'home' && this.ball.ownerId === player.id;

    if (pressed) {
      this.actionWasDown = true;
      if (ownsBall) {
        this.charging = true;
        this.chargeTime = 0;
        this.power = 0;
        this.perfectShot = false;
      }
    }

    if (this.charging && !ownsBall) this.resetCharge();
    if (actionHeld && this.actionWasDown && this.charging && ownsBall) {
      this.chargeTime = Math.min(MAX_SHOT_CHARGE, this.chargeTime + dt);
      this.power = clamp(this.chargeTime / MAX_SHOT_CHARGE, 0, 1);
      this.perfectShot = this.power >= PERFECT_SHOT_MIN && this.power <= PERFECT_SHOT_MAX;
    }

    if (!actionHeld && this.actionWasDown) {
      if (this.charging && ownsBall && player) {
        if (this.chargeTime < PASS_CHARGE_LIMIT) this.executePass(player, input.dx, input.dy);
        else this.executeShot(player, this.power, this.perfectShot, input.dx, input.dy);
      }
      this.resetCharge();
      this.actionWasDown = false;
    } else if (actionHeld) {
      this.actionWasDown = true;
    }
  }

  private resetCharge() {
    this.chargeTime = 0;
    this.power = 0;
    this.charging = false;
    this.perfectShot = false;
  }

  /** Choose a receiver by aim, distance, forward progress, available space and passing-lane safety. */
  private findBestPassTarget(sender: FootballPlayer, aimX: number, aimY: number) {
    const aimLength = magnitude(aimX, aimY);
    if (aimLength > 0.12) {
      aimX /= aimLength;
      aimY /= aimLength;
    } else {
      aimX = Math.cos(sender.angle);
      aimY = Math.sin(sender.angle);
    }

    let best: FootballPlayer | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of this.homeTeam) {
      if (candidate.id === sender.id) continue;
      const segmentX = candidate.x - sender.x;
      const segmentY = candidate.y - sender.y;
      const distanceSquared = segmentX * segmentX + segmentY * segmentY;
      if (distanceSquared < 1) continue;
      const distance = Math.sqrt(distanceSquared);
      const dot = (segmentX / distance) * aimX + (segmentY / distance) * aimY;
      let nearestOpponent = Number.POSITIVE_INFINITY;
      let nearestLane = Number.POSITIVE_INFINITY;

      for (const opponent of this.awayTeam) {
        const receiverDx = opponent.x - candidate.x;
        const receiverDy = opponent.y - candidate.y;
        const receiverDistance = magnitude(receiverDx, receiverDy);
        if (receiverDistance < nearestOpponent) nearestOpponent = receiverDistance;

        const projection = clamp(((opponent.x - sender.x) * segmentX + (opponent.y - sender.y) * segmentY) / distanceSquared, 0, 1);
        const laneDx = sender.x + projection * segmentX - opponent.x;
        const laneDy = sender.y + projection * segmentY - opponent.y;
        const laneDistance = magnitude(laneDx, laneDy);
        if (laneDistance < nearestLane) nearestLane = laneDistance;
      }

      const forwardProgress = clamp((sender.y - candidate.y) / 420, -1, 1);
      const spaceScore = clamp(nearestOpponent / 170, 0, 1.25) * 0.85;
      const lanePenalty = clamp((48 - nearestLane) / 48, 0, 1) * 1.45;
      const score = dot * 4.5 + spaceScore + forwardProgress * 0.65 - distance * 0.0015 - lanePenalty;
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    return best;
  }

  private executePass(sender: FootballPlayer, aimX: number, aimY: number) {
    const receiver = this.findBestPassTarget(sender, aimX, aimY);
    if (!receiver) return;

    const distance = magnitude(receiver.x - sender.x, receiver.y - sender.y);
    const speed = clamp(350 + distance * 0.68, 400, 700);
    const leadTime = clamp(distance / speed * 0.18, 0.08, 0.2);
    const targetX = receiver.x + receiver.vx * leadTime;
    const targetY = receiver.y + receiver.vy * leadTime;
    const directionX = targetX - sender.x;
    const directionY = targetY - sender.y;
    const directionLength = Math.max(1, magnitude(directionX, directionY));
    const unitX = directionX / directionLength;
    const unitY = directionY / directionLength;
    const ball = this.ball;

    ball.x = clamp(sender.x + unitX * BALL_OFFSET, FIELD_LEFT + BALL_RADIUS, FIELD_RIGHT - BALL_RADIUS);
    ball.y = clamp(sender.y + unitY * BALL_OFFSET, FIELD_TOP - GOAL_DEPTH, FIELD_BOTTOM + GOAL_DEPTH);
    ball.vx = unitX * speed + sender.vx * 0.12;
    ball.vy = unitY * speed + sender.vy * 0.12;
    ball.owner = 'none';
    ball.ownerId = null;
    ball.lastTouchTeam = 'home';
    ball.shotTeam = null;
    ball.shotPower = 0;
    ball.shotAttempted = false;
    ball.keeperOwner = null;
    ball.acquisitionCooldown = 0.06;
    ball.ownerLockTimer = 0;
    ball.targetTeam = 'home';
    ball.targetId = receiver.id;
    this.possession = 'home';
    this.activePlayerIndex = this.homeTeam.indexOf(receiver);
    sender.state = 'passing';
    sender.stateTimer = 0.24;
    receiver.state = 'receiving';
    receiver.stateTimer = 0.35;
    this.sfx?.('kick');
  }

  private executeShot(shooter: FootballPlayer, power: number, perfect: boolean, aimX: number, aimY: number) {
    const aimLength = magnitude(aimX, aimY);
    let angle = aimLength > 0.12 ? Math.atan2(aimY, aimX) : shooter.angle;
    const goalX = CENTER_X;
    const goalY = FIELD_TOP - 4;
    const goalDistance = magnitude(goalX - shooter.x, goalY - shooter.y);
    const goalAngle = Math.atan2(goalY - shooter.y, goalX - shooter.x);
    const angleError = Math.atan2(Math.sin(goalAngle - angle), Math.cos(goalAngle - angle));
    const aimAssist = clamp(0.08 + (1 - goalDistance / 900) * 0.24, 0.06, 0.3);
    angle += angleError * aimAssist;

    const shotPower = clamp(power, 0, 1);
    const closeRangeBonus = clamp((700 - goalDistance) * 0.08, 0, 32);
    const speed = 430 + shotPower * 560 + closeRangeBonus + (perfect ? 180 : 0);
    const ball = this.ball;
    ball.x = clamp(shooter.x + Math.cos(angle) * BALL_OFFSET, FIELD_LEFT + BALL_RADIUS, FIELD_RIGHT - BALL_RADIUS);
    ball.y = clamp(shooter.y + Math.sin(angle) * BALL_OFFSET, FIELD_TOP - GOAL_DEPTH, FIELD_BOTTOM + GOAL_DEPTH);
    ball.vx = Math.cos(angle) * speed + shooter.vx * 0.12;
    ball.vy = Math.sin(angle) * speed + shooter.vy * 0.12;
    ball.owner = 'none';
    ball.ownerId = null;
    ball.lastTouchTeam = 'home';
    ball.shotTeam = 'away';
    ball.shotPower = shotPower;
    ball.shotAttempted = false;
    ball.keeperOwner = null;
    ball.acquisitionCooldown = 0.12;
    ball.ownerLockTimer = 0;
    ball.targetTeam = null;
    ball.targetId = null;
    this.possession = 'neutral';
    shooter.state = 'shooting';
    shooter.stateTimer = 0.32;
    this.sfx?.(perfect ? 'power' : 'kick');
  }

  /** Home teammates seek role-appropriate support positions instead of snapping back to slots. */
  private updateHomeSupport(dt: number) {
    const ball = this.ball;
    const active = this.homeTeam[this.activePlayerIndex] ?? null;
    const carrier = ball.owner === 'home' ? this.getPlayer('home', ball.ownerId) : null;
    const receiver = ball.owner === 'none' && ball.targetTeam === 'home'
      ? this.getPlayer('home', ball.targetId)
      : null;
    const opponentCarrier = ball.owner === 'away' ? this.getPlayer('away', ball.ownerId) : null;
    const homeKeeperHasBall = ball.keeperOwner === 'home';
    const awayKeeperHasBall = ball.keeperOwner === 'away';
    const homeAttack = carrier !== null || receiver !== null || homeKeeperHasBall;
    const opponentInControl = opponentCarrier !== null || awayKeeperHasBall;

    let anchorX = ball.x;
    let anchorY = ball.y;
    if (carrier) {
      anchorX = carrier.x + carrier.vx * 0.18;
      anchorY = carrier.y + carrier.vy * 0.18;
    } else if (receiver) {
      const distance = magnitude(ball.x - receiver.x, ball.y - receiver.y);
      const leadTime = clamp(distance / Math.max(140, magnitude(ball.vx, ball.vy)), 0.08, 0.32);
      anchorX = ball.x + ball.vx * leadTime;
      anchorY = ball.y + ball.vy * leadTime;
    } else if (homeKeeperHasBall) {
      anchorX = this.homeKeeper.x;
      anchorY = this.homeKeeper.y;
    } else if (opponentCarrier) {
      anchorX = opponentCarrier.x + opponentCarrier.vx * 0.16;
      anchorY = opponentCarrier.y + opponentCarrier.vy * 0.16;
    } else if (awayKeeperHasBall) {
      anchorX = this.awayKeeper.x;
      anchorY = this.awayKeeper.y;
    } else {
      anchorX += ball.vx * 0.14;
      anchorY += ball.vy * 0.14;
      // When play is loose, use the controlled player's location too, not just the ball's.
      if (active && ball.owner === 'none') {
        anchorX = anchorX * 0.84 + active.x * 0.16;
        anchorY = anchorY * 0.84 + active.y * 0.16;
      }
    }
    anchorX = clamp(anchorX, FIELD_LEFT + PLAYER_RADIUS, FIELD_RIGHT - PLAYER_RADIUS);
    anchorY = clamp(anchorY, FIELD_TOP + PLAYER_RADIUS, FIELD_BOTTOM - PLAYER_RADIUS);

    for (let i = 0; i < this.homeTeam.length; i++) {
      if (i === this.activePlayerIndex) continue;
      const player = this.homeTeam[i];
      let targetX = player.formationX;
      let targetY = player.formationY;
      const followingPass = ball.targetTeam === 'home'
        && player.id !== ball.targetId
        && player.state === 'passing' && player.stateTimer > 0;

      if (followingPass) {
        // Keep the passer's momentum and let them follow their pass for a brief beat.
        targetX = player.x + player.vx * 0.32;
        targetY = player.y + player.vy * 0.32 - 22;
      } else if (homeAttack) {
        if (player.role === 'forward') {
          const progress = clamp((FIELD_BOTTOM - anchorY) / (FIELD_BOTTOM - FIELD_TOP), 0, 1);
          const runDepth = clamp(205 - progress * 45, 150, 205);
          targetY = clamp(anchorY - runDepth, FIELD_TOP + 82, FIELD_BOTTOM - PLAYER_RADIUS);
          targetX = this.chooseHomeSupportLane(player, active, anchorX, anchorY, targetY, 152);
        } else if (player.role === 'midfielder') {
          targetY = clamp(anchorY + 58, FIELD_TOP + PLAYER_RADIUS, FIELD_BOTTOM - PLAYER_RADIUS);
          targetX = this.chooseHomeSupportLane(player, active, anchorX, anchorY, targetY, 108);
        } else {
          const behindDistance = anchorY > 760 ? 142 : 212;
          targetX = player.formationX + clamp((anchorX - CENTER_X) * 0.18, -58, 58);
          targetY = clamp(Math.max(CENTER_Y + 108, anchorY + behindDistance), CENTER_Y + 108, FIELD_BOTTOM - 22);
        }
      } else if (opponentInControl) {
        if (player.role === 'forward') {
          const activeShade = active ? clamp((active.x - anchorX) * 0.14, -32, 32) : 0;
          targetX = player.formationX + (anchorX - player.formationX) * 0.38 + activeShade;
          targetY = clamp(anchorY - 72, FIELD_TOP + 60, FIELD_BOTTOM - PLAYER_RADIUS);
        } else if (player.role === 'midfielder') {
          targetY = clamp(anchorY + 122, CENTER_Y + 42, FIELD_BOTTOM - 84);
          targetX = this.chooseHomeSupportLane(player, active, anchorX, anchorY, targetY, 104);
        } else {
          targetX = player.formationX + clamp((anchorX - CENTER_X) * 0.14, -46, 46);
          targetY = clamp(Math.max(CENTER_Y + 104, anchorY + 188), CENTER_Y + 104, FIELD_BOTTOM - 20);
        }
      } else {
        // Loose balls invite support; defenders still hold a line behind the action.
        if (player.role === 'forward') {
          targetY = clamp(anchorY - 96, FIELD_TOP + 82, FIELD_BOTTOM - PLAYER_RADIUS);
          targetX = this.chooseHomeSupportLane(player, active, anchorX, anchorY, targetY, 132);
        } else if (player.role === 'midfielder') {
          targetY = clamp(anchorY + 44, FIELD_TOP + PLAYER_RADIUS, FIELD_BOTTOM - PLAYER_RADIUS);
          targetX = this.chooseHomeSupportLane(player, active, anchorX, anchorY, targetY, 98);
        } else {
          targetX = player.formationX + clamp((anchorX - CENTER_X) * 0.13, -42, 42);
          targetY = clamp(Math.max(CENTER_Y + 104, anchorY + 190), CENTER_Y + 104, FIELD_BOTTOM - 20);
        }
      }

      targetX = clamp(targetX, FIELD_LEFT + PLAYER_RADIUS, FIELD_RIGHT - PLAYER_RADIUS);
      targetY = clamp(targetY, FIELD_TOP + PLAYER_RADIUS, FIELD_BOTTOM - PLAYER_RADIUS);
      const defenderLineY = player.role === 'defender'
        ? Math.min(anchorY + 52, FIELD_BOTTOM - PLAYER_RADIUS)
        : FIELD_TOP + PLAYER_RADIUS;
      this.moveHomeSupportPlayer(player, targetX, targetY, defenderLineY, dt, followingPass);
    }
  }

  /** Scores two lateral outlets by opponent pressure, passing lane, active player and team spacing. */
  private chooseHomeSupportLane(
    player: FootballPlayer,
    active: FootballPlayer | null,
    anchorX: number,
    anchorY: number,
    targetY: number,
    offset: number,
  ) {
    const minX = FIELD_LEFT + PLAYER_RADIUS;
    const maxX = FIELD_RIGHT - PLAYER_RADIUS;
    const leftX = clamp(anchorX - offset, minX, maxX);
    const rightX = clamp(anchorX + offset, minX, maxX);
    const leftScore = this.scoreHomeSupportLane(player, active, anchorX, anchorY, leftX, targetY);
    const rightScore = this.scoreHomeSupportLane(player, active, anchorX, anchorY, rightX, targetY);
    return leftScore >= rightScore ? leftX : rightX;
  }

  private scoreHomeSupportLane(
    player: FootballPlayer,
    active: FootballPlayer | null,
    anchorX: number,
    anchorY: number,
    targetX: number,
    targetY: number,
  ) {
    let nearestOpponentSquared = Number.POSITIVE_INFINITY;
    for (const opponent of this.awayTeam) {
      const dx = opponent.x - targetX;
      const dy = opponent.y - targetY;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < nearestOpponentSquared) nearestOpponentSquared = distanceSquared;
    }
    let nearestTeammateSquared = Number.POSITIVE_INFINITY;
    for (const teammate of this.homeTeam) {
      if (teammate.id === player.id) continue;
      const dx = teammate.x - targetX;
      const dy = teammate.y - targetY;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < nearestTeammateSquared) nearestTeammateSquared = distanceSquared;
    }

    const opponentSpace = Math.sqrt(nearestOpponentSquared);
    const teammateSpace = Math.sqrt(nearestTeammateSquared);
    const laneClearance = this.passLaneClearance(anchorX, anchorY, targetX, targetY, this.awayTeam);
    const anchorDistance = magnitude(targetX - anchorX, targetY - anchorY);
    const moveDistance = magnitude(targetX - player.x, targetY - player.y);
    const activeDistance = active && active.id !== player.id
      ? magnitude(targetX - active.x, targetY - active.y)
      : 180;
    const formationSide = player.formationX < anchorX ? -1 : 1;
    const targetSide = targetX < anchorX ? -1 : 1;
    const sidePreference = formationSide === targetSide ? 0.12 : 0;
    const activeCrowding = Math.max(0, 105 - activeDistance) * 0.012;

    return clamp(opponentSpace / 180, 0, 1.35) * 1.1
      + clamp(teammateSpace / 150, 0, 1.2) * 0.62
      + clamp(laneClearance / 85, 0, 1.25) * 0.45
      - anchorDistance * 0.0011
      - moveDistance * 0.00045
      + sidePreference
      - activeCrowding;
  }

  /** Adds a small repulsion steering offset before applying the shared smooth movement model. */
  private moveHomeSupportPlayer(
    player: FootballPlayer,
    targetX: number,
    targetY: number,
    defenderLineY: number,
    dt: number,
    preservePassState: boolean,
  ) {
    let separationX = 0;
    let separationY = 0;
    const separationRadiusSquared = HOME_SUPPORT_SEPARATION_RADIUS * HOME_SUPPORT_SEPARATION_RADIUS;
    for (const teammate of this.homeTeam) {
      if (teammate.id === player.id) continue;
      let dx = player.x - teammate.x;
      let dy = player.y - teammate.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= separationRadiusSquared) continue;
      let distance = Math.sqrt(distanceSquared);
      if (distance < 0.001) {
        dx = player.id < teammate.id ? -1 : 1;
        dy = 0;
        distance = 1;
      }
      const force = (HOME_SUPPORT_SEPARATION_RADIUS - distance) / HOME_SUPPORT_SEPARATION_RADIUS;
      separationX += dx / distance * force;
      separationY += dy / distance * force;
    }

    targetX += clamp(separationX, -1.5, 1.5) * HOME_SUPPORT_SEPARATION_OFFSET;
    targetY += clamp(separationY, -1.5, 1.5) * HOME_SUPPORT_SEPARATION_OFFSET;
    targetX = clamp(targetX, FIELD_LEFT + PLAYER_RADIUS, FIELD_RIGHT - PLAYER_RADIUS);
    targetY = clamp(Math.max(targetY, defenderLineY), FIELD_TOP + PLAYER_RADIUS, FIELD_BOTTOM - PLAYER_RADIUS);
    this.movePlayerToTarget(player, targetX, targetY, dt, preservePassState);
  }

  /** Home support reacts to possession, roles and space; the away side keeps its tactical AI. */
  private updateFormationPlayers(dt: number) {
    this.updateHomeSupport(dt);
    this.updateAwayAI(dt);
  }

  /** Runs the away team's phase-aware tactical movement and possession decisions. */
  private updateAwayAI(dt: number) {
    const profile = this.profile();
    const carrier = this.ball.owner === 'away' ? this.getPlayer('away', this.ball.ownerId) : null;
    const receiver = this.ball.owner === 'none' && this.ball.targetTeam === 'away'
      ? this.getPlayer('away', this.ball.targetId)
      : null;

    if (!carrier && !receiver) {
      this.awayMode = 'defending';
      this.updateAwayDefense(dt, profile);
      return;
    }

    this.awayMode = 'attacking';
    this.defensivePresserId = null;
    this.presserCarrierId = null;
    this.presserEngaged = false;

    if (carrier) {
      if (carrier.aiDecisionTimer <= 0 && carrier.aiReactionTimer <= 0) {
        const pressureDistance = this.nearestHomeDistance(carrier.x, carrier.y);
        const goalDistance = magnitude(CENTER_X - carrier.x, FIELD_BOTTOM - carrier.y);
        const goalAngle = Math.atan2(FIELD_BOTTOM - carrier.y, CENTER_X - carrier.x);
        const angleError = Math.atan2(Math.sin(goalAngle - carrier.angle), Math.cos(goalAngle - carrier.angle));
        const passOption = this.findBestAwayPassOption(carrier, profile);
        const laneIsClear = passOption !== null && passOption.laneClearance >= profile.passLaneMinimum;
        const betterPlaced = passOption !== null
          && passOption.score >= profile.betterPassThreshold
          && passOption.player.y > carrier.y + 60
          && magnitude(CENTER_X - passOption.player.x, FIELD_BOTTOM - passOption.player.y) < goalDistance - 35;
        const canShoot = carrier.y >= FIELD_BOTTOM - 360
          && goalDistance <= profile.shotDistance
          && Math.abs(angleError) <= profile.shotAngleLimit
          && pressureDistance >= profile.shotPressureDistance;

        if (canShoot) {
          this.executeAwayShot(carrier, profile);
          carrier.aiDecisionTimer = profile.decisionInterval;
        } else if (laneIsClear && passOption
          && (pressureDistance <= profile.passPressureDistance
            || (betterPlaced && pressureDistance <= profile.passPressureDistance * 1.45))) {
          this.executeAwayPass(carrier, passOption.player, profile);
        } else {
          carrier.aiDecisionTimer = profile.decisionInterval;
        }
      }

      if (this.ball.owner === 'away' && this.ball.ownerId === carrier.id) {
        this.moveAwayCarrierTowardGoal(dt, carrier);
        this.moveAwayAttackSupport(dt, carrier.x, carrier.y, carrier.id, null);
        return;
      }

      const passReceiver = this.ball.owner === 'none' && this.ball.targetTeam === 'away'
        ? this.getPlayer('away', this.ball.targetId)
        : null;
      if (passReceiver) {
        this.moveAwayReceiverToBall(dt, passReceiver);
        this.moveAwayAttackSupport(dt, passReceiver.x, passReceiver.y, null, passReceiver.id);
        return;
      }

      this.awayMode = 'defending';
      this.updateAwayDefense(dt, profile);
      return;
    }

    if (receiver) {
      this.moveAwayReceiverToBall(dt, receiver);
      this.moveAwayAttackSupport(dt, receiver.x, receiver.y, null, receiver.id);
    }
  }

  private updateAwayDefense(dt: number, profile: AIDifficultyProfile) {
    const homeCarrier = this.ball.owner === 'home' ? this.getPlayer('home', this.ball.ownerId) : null;
    const objectiveX = homeCarrier?.x ?? this.ball.x;
    const objectiveY = homeCarrier?.y ?? this.ball.y;
    const presser = this.selectDefensivePresser(objectiveX, objectiveY, homeCarrier?.id ?? null);

    if (presser) {
      let targetX = objectiveX;
      let targetY = homeCarrier ? objectiveY - profile.pressOffset : objectiveY;
      const distanceToTarget = magnitude(targetX - presser.x, targetY - presser.y);
      if (distanceToTarget > profile.pressRange) {
        targetX = presser.formationX + clamp((objectiveX - presser.formationX) * 0.16, -64, 64);
        targetY = presser.formationY + clamp((objectiveY - presser.formationY) * 0.12, -44, 52);
      }
      this.movePlayerToTarget(presser, targetX, targetY, dt);

      if (homeCarrier) {
        const distanceToCarrier = magnitude(presser.x - homeCarrier.x, presser.y - homeCarrier.y);
        if (distanceToCarrier <= TACKLE_REACTION_DISTANCE && !this.presserEngaged) {
          presser.aiReactionTimer = profile.reactionDelay;
          this.presserEngaged = true;
        } else if (distanceToCarrier > TACKLE_REARM_DISTANCE && this.presserEngaged) {
          presser.aiReactionTimer = 0;
          this.presserEngaged = false;
        }
      } else {
        presser.aiReactionTimer = 0;
        this.presserEngaged = false;
      }
    }

    this.moveAwayDefensiveCover(dt, presser?.id ?? null, homeCarrier, objectiveX, objectiveY, profile);
  }

  private selectDefensivePresser(targetX: number, targetY: number, carrierId: number | null) {
    let nearest: FootballPlayer | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const player of this.awayTeam) {
      const distance = magnitude(player.x - targetX, player.y - targetY);
      if (distance < nearestDistance) { nearest = player; nearestDistance = distance; }
    }

    const current = this.getPlayer('away', this.defensivePresserId);
    let selected = nearest;
    if (current && this.presserCarrierId === carrierId) {
      const currentDistance = magnitude(current.x - targetX, current.y - targetY);
      if (currentDistance <= nearestDistance + 32) selected = current;
    }

    if (selected && (selected.id !== this.defensivePresserId || this.presserCarrierId !== carrierId)) {
      this.defensivePresserId = selected.id;
      this.presserCarrierId = carrierId;
      this.presserEngaged = false;
      selected.aiReactionTimer = 0;
    }
    return selected;
  }

  private moveAwayDefensiveCover(
    dt: number,
    presserId: number | null,
    homeCarrier: FootballPlayer | null,
    objectiveX: number,
    objectiveY: number,
    profile: AIDifficultyProfile,
  ) {
    for (const defender of this.awayTeam) {
      if (defender.id === presserId) continue;

      let marked: FootballPlayer | null = null;
      let markDistanceSquared = Number.POSITIVE_INFINITY;
      for (const homePlayer of this.homeTeam) {
        if (homeCarrier && homePlayer.id === homeCarrier.id) continue;
        const dx = homePlayer.x - defender.formationX;
        const dy = homePlayer.y - defender.formationY;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < markDistanceSquared) {
          marked = homePlayer;
          markDistanceSquared = distanceSquared;
        }
      }

      const ballShiftX = clamp((objectiveX - CENTER_X) * profile.coverBallShift, -72, 72);
      const ballShiftY = clamp((objectiveY - CENTER_Y) * 0.075, -32, 48);
      const markShiftX = marked ? clamp((marked.x - defender.formationX) * 0.1, -32, 32) : 0;
      const markShiftY = marked ? clamp((marked.y - defender.formationY) * 0.08, -26, 34) : 0;
      const axisShiftX = (CENTER_X - defender.formationX) * 0.08;
      const targetX = clamp(defender.formationX + ballShiftX + markShiftX + axisShiftX, FIELD_LEFT + PLAYER_RADIUS, FIELD_RIGHT - PLAYER_RADIUS);
      const targetY = clamp(defender.formationY + ballShiftY + markShiftY, FIELD_TOP + PLAYER_RADIUS, CENTER_Y + 125);
      this.movePlayerToTarget(defender, targetX, targetY, dt);
    }
  }

  private moveAwayCarrierTowardGoal(dt: number, carrier: FootballPlayer) {
    const targetY = clamp(carrier.y + 175, FIELD_TOP + PLAYER_RADIUS, FIELD_BOTTOM - PLAYER_RADIUS);
    const centralX = carrier.x + (CENTER_X - carrier.x) * 0.28;
    let bestX = clamp(centralX, FIELD_LEFT + PLAYER_RADIUS, FIELD_RIGHT - PLAYER_RADIUS);
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let lane = -1; lane <= 1; lane++) {
      const candidateX = clamp(centralX + lane * 88, FIELD_LEFT + PLAYER_RADIUS, FIELD_RIGHT - PLAYER_RADIUS);
      const space = this.nearestHomeDistance(candidateX, targetY);
      const score = space - Math.abs(candidateX - CENTER_X) * 0.3 - Math.abs(candidateX - carrier.x) * 0.05;
      if (score > bestScore) { bestScore = score; bestX = candidateX; }
    }
    this.movePlayerToTarget(carrier, bestX, targetY, dt);
  }

  private moveAwayReceiverToBall(dt: number, receiver: FootballPlayer) {
    const ballSpeed = magnitude(this.ball.vx, this.ball.vy);
    const distance = magnitude(this.ball.x - receiver.x, this.ball.y - receiver.y);
    const leadTime = clamp(distance / Math.max(120, ballSpeed), 0.08, 0.5);
    const targetX = clamp(this.ball.x + this.ball.vx * leadTime, FIELD_LEFT + PLAYER_RADIUS, FIELD_RIGHT - PLAYER_RADIUS);
    const targetY = clamp(this.ball.y + this.ball.vy * leadTime, FIELD_TOP + PLAYER_RADIUS, FIELD_BOTTOM - PLAYER_RADIUS);
    this.movePlayerToTarget(receiver, targetX, targetY, dt);
  }

  private moveAwayAttackSupport(
    dt: number,
    anchorX: number,
    anchorY: number,
    carrierId: number | null,
    receiverId: number | null,
  ) {
    for (const support of this.awayTeam) {
      if (support.id === carrierId || support.id === receiverId) continue;
      const forwardOffset = support.role === 'forward' ? 170 : support.role === 'midfielder' ? 42 : -105;
      const targetX = clamp(support.formationX * 0.6 + anchorX * 0.4, FIELD_LEFT + PLAYER_RADIUS, FIELD_RIGHT - PLAYER_RADIUS);
      const targetY = clamp(anchorY + forwardOffset, FIELD_TOP + PLAYER_RADIUS, FIELD_BOTTOM - PLAYER_RADIUS);
      this.movePlayerToTarget(support, targetX, targetY, dt);
    }
  }

  private findBestAwayPassOption(carrier: FootballPlayer, profile: AIDifficultyProfile): PassOption | null {
    let best: PassOption | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const teammate of this.awayTeam) {
      if (teammate.id === carrier.id) continue;
      const dx = teammate.x - carrier.x;
      const dy = teammate.y - carrier.y;
      const distance = magnitude(dx, dy);
      if (distance < 62 || distance > 560) continue;

      const forwardAlignment = dy / distance;
      let nearestHome = Number.POSITIVE_INFINITY;
      for (const homePlayer of this.homeTeam) {
        const defenderDistance = magnitude(homePlayer.x - teammate.x, homePlayer.y - teammate.y);
        if (defenderDistance < nearestHome) nearestHome = defenderDistance;
      }
      const laneClearance = this.passLaneClearance(carrier.x, carrier.y, teammate.x, teammate.y, this.homeTeam);
      const progress = clamp((teammate.y - carrier.y) / 360, -1, 1);
      const spaceScore = clamp(nearestHome / 155, 0, 1.4) * 0.95;
      const goalProximity = clamp((teammate.y - CENTER_Y + 100) / 500, -0.3, 1) * 0.4;
      const lanePenalty = clamp((profile.passLaneMinimum - laneClearance) / Math.max(1, profile.passLaneMinimum), 0, 1) * (1.3 + profile.passSkill * 0.55);
      const score = forwardAlignment * (2.1 + profile.passSkill * 0.55)
        + progress * (0.62 + profile.passSkill * 0.18)
        + spaceScore * (0.8 + profile.passSkill * 0.2)
        + goalProximity * 0.4
        - distance * (0.00165 - profile.passSkill * 0.00012)
        - lanePenalty;
      if (score > bestScore) {
        bestScore = score;
        best = { player: teammate, score, laneClearance, distance };
      }
    }
    return best;
  }

  private passLaneClearance(x1: number, y1: number, x2: number, y2: number, defenders: readonly FootballPlayer[]) {
    const segmentX = x2 - x1;
    const segmentY = y2 - y1;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    if (lengthSquared < 1) return 0;
    let nearest = Number.POSITIVE_INFINITY;
    for (const defender of defenders) {
      const projection = clamp(((defender.x - x1) * segmentX + (defender.y - y1) * segmentY) / lengthSquared, 0, 1);
      const dx = x1 + projection * segmentX - defender.x;
      const dy = y1 + projection * segmentY - defender.y;
      const distance = magnitude(dx, dy);
      if (distance < nearest) nearest = distance;
    }
    return nearest;
  }

  private executeAwayPass(passer: FootballPlayer, receiver: FootballPlayer, profile: AIDifficultyProfile) {
    const distance = magnitude(receiver.x - passer.x, receiver.y - passer.y);
    const speed = clamp(370 + distance * 0.64, 410, 690);
    const leadTime = clamp(distance / speed * 0.2, 0.08, 0.2);
    const targetX = receiver.x + receiver.vx * leadTime;
    const targetY = receiver.y + receiver.vy * leadTime;
    const baseAngle = Math.atan2(targetY - passer.y, targetX - passer.x);
    const angle = baseAngle + this.randomSigned() * profile.passError;
    const ball = this.ball;
    ball.x = clamp(passer.x + Math.cos(angle) * BALL_OFFSET, FIELD_LEFT + BALL_RADIUS, FIELD_RIGHT - BALL_RADIUS);
    ball.y = clamp(passer.y + Math.sin(angle) * BALL_OFFSET, FIELD_TOP - GOAL_DEPTH, FIELD_BOTTOM + GOAL_DEPTH);
    ball.vx = Math.cos(angle) * speed + passer.vx * 0.12;
    ball.vy = Math.sin(angle) * speed + passer.vy * 0.12;
    ball.owner = 'none';
    ball.ownerId = null;
    ball.lastTouchTeam = 'away';
    ball.shotTeam = null;
    ball.shotPower = 0;
    ball.shotAttempted = false;
    ball.keeperOwner = null;
    ball.acquisitionCooldown = 0.06;
    ball.ownerLockTimer = 0;
    ball.targetTeam = 'away';
    ball.targetId = receiver.id;
    this.possession = 'away';
    this.awayMode = 'attacking';
    passer.state = 'passing';
    passer.stateTimer = 0.25;
    passer.aiDecisionTimer = profile.decisionInterval;
    receiver.state = 'receiving';
    receiver.stateTimer = 0.35;
    this.sfx?.('kick');
  }

  private executeAwayShot(shooter: FootballPlayer, profile: AIDifficultyProfile) {
    const zoneRoll = this.random01();
    const zoneOffset = zoneRoll < 1 / 3 ? -GOAL_WIDTH * 0.27 : zoneRoll < 2 / 3 ? 0 : GOAL_WIDTH * 0.27;
    const targetX = clamp(CENTER_X + zoneOffset + this.randomSigned() * 12, CENTER_X - GOAL_WIDTH * 0.36, CENTER_X + GOAL_WIDTH * 0.36);
    const targetY = FIELD_BOTTOM + 4;
    const angle = Math.atan2(targetY - shooter.y, targetX - shooter.x) + this.randomSigned() * profile.shotError;
    const power = profile.shotPowerMin + this.random01() * (profile.shotPowerMax - profile.shotPowerMin);
    const speed = 520 + power * 430;
    const ball = this.ball;
    ball.x = clamp(shooter.x + Math.cos(angle) * BALL_OFFSET, FIELD_LEFT + BALL_RADIUS, FIELD_RIGHT - BALL_RADIUS);
    ball.y = clamp(shooter.y + Math.sin(angle) * BALL_OFFSET, FIELD_TOP - GOAL_DEPTH, FIELD_BOTTOM + GOAL_DEPTH);
    ball.vx = Math.cos(angle) * speed + shooter.vx * 0.1;
    ball.vy = Math.sin(angle) * speed + shooter.vy * 0.1;
    ball.owner = 'none';
    ball.ownerId = null;
    ball.lastTouchTeam = 'away';
    ball.shotTeam = 'home';
    ball.shotPower = power;
    ball.shotAttempted = false;
    ball.keeperOwner = null;
    ball.acquisitionCooldown = 0.12;
    ball.ownerLockTimer = 0;
    ball.targetTeam = null;
    ball.targetId = null;
    this.possession = 'neutral';
    this.awayMode = 'defending';
    shooter.state = 'shooting';
    shooter.stateTimer = 0.3;
    shooter.aiDecisionTimer = profile.decisionInterval;
    this.sfx?.('kick');
  }

  private nearestHomeDistance(x: number, y: number) {
    let nearestSquared = Number.POSITIVE_INFINITY;
    for (const player of this.homeTeam) {
      const dx = player.x - x;
      const dy = player.y - y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < nearestSquared) nearestSquared = distanceSquared;
    }
    return Math.sqrt(nearestSquared);
  }

  private movePlayerToTarget(player: FootballPlayer, targetX: number, targetY: number, dt: number, preserveActionState = false) {
    if (player.stunTimer > 0) return;
    const minX = FIELD_LEFT + PLAYER_RADIUS;
    const maxX = FIELD_RIGHT - PLAYER_RADIUS;
    const minY = FIELD_TOP + PLAYER_RADIUS;
    const maxY = FIELD_BOTTOM - PLAYER_RADIUS;
    const dx = clamp(targetX, minX, maxX) - player.x;
    const dy = clamp(targetY, minY, maxY) - player.y;
    const distance = magnitude(dx, dy);
    const targetSpeed = Math.min(player.speed, distance * 2.8);
    const targetVx = distance > 0.001 ? dx / distance * targetSpeed : 0;
    const targetVy = distance > 0.001 ? dy / distance * targetSpeed : 0;
    const blend = 1 - Math.exp(-7 * dt);
    player.vx += (targetVx - player.vx) * blend;
    player.vy += (targetVy - player.vy) * blend;
    this.movePlayerByVelocity(player, dt);
    const speed = magnitude(player.vx, player.vy);
    if (speed > 8) {
      player.angle = Math.atan2(player.vy, player.vx);
      if (!preserveActionState) player.state = player.stunTimer > 0 ? 'stunned' : 'running';
    } else if (player.stunTimer === 0 && !preserveActionState) {
      player.state = 'idle';
    }
  }

  private random01() {
    let value = this.randomState | 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0;
    return this.randomState / 0x100000000;
  }

  private randomSigned() {
    return this.random01() * 2 - 1;
  }

  private movePlayerByVelocity(player: FootballPlayer, dt: number) {
    const minX = FIELD_LEFT + PLAYER_RADIUS;
    const maxX = FIELD_RIGHT - PLAYER_RADIUS;
    const minY = FIELD_TOP + PLAYER_RADIUS;
    const maxY = FIELD_BOTTOM - PLAYER_RADIUS;
    player.x = clamp(player.x + player.vx * dt, minX, maxX);
    player.y = clamp(player.y + player.vy * dt, minY, maxY);
    if ((player.x === minX && player.vx < 0) || (player.x === maxX && player.vx > 0)) player.vx = 0;
    if ((player.y === minY && player.vy < 0) || (player.y === maxY && player.vy > 0)) player.vy = 0;
  }

  /** Pushes overlapping field players apart without allocating per-frame objects. */
  private resolvePlayerCollisions() {
    for (let i = 0; i < this.homeTeam.length; i++) {
      for (let j = i + 1; j < this.homeTeam.length; j++) this.separatePlayers(this.homeTeam[i], this.homeTeam[j]);
    }
    for (let i = 0; i < this.awayTeam.length; i++) {
      for (let j = i + 1; j < this.awayTeam.length; j++) this.separatePlayers(this.awayTeam[i], this.awayTeam[j]);
    }
    for (const home of this.homeTeam) {
      for (const away of this.awayTeam) this.separatePlayers(home, away);
    }
  }

  private separatePlayers(a: FootballPlayer, b: FootballPlayer) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = magnitude(dx, dy);
    if (distance >= PLAYER_COLLISION_DISTANCE) return;
    const nx = distance > 0.001 ? dx / distance : (a.id < b.id ? 1 : -1);
    const ny = distance > 0.001 ? dy / distance : 0;
    const overlap = (PLAYER_COLLISION_DISTANCE - distance) * 0.5;
    a.x = clamp(a.x - nx * overlap, FIELD_LEFT + PLAYER_RADIUS, FIELD_RIGHT - PLAYER_RADIUS);
    a.y = clamp(a.y - ny * overlap, FIELD_TOP + PLAYER_RADIUS, FIELD_BOTTOM - PLAYER_RADIUS);
    b.x = clamp(b.x + nx * overlap, FIELD_LEFT + PLAYER_RADIUS, FIELD_RIGHT - PLAYER_RADIUS);
    b.y = clamp(b.y + ny * overlap, FIELD_TOP + PLAYER_RADIUS, FIELD_BOTTOM - PLAYER_RADIUS);
  }

  /** Advances both keepers with the same movement, read and save rules. */
  private updateGoalkeepers(dt: number) {
    this.updateGoalkeeper(this.homeKeeper, dt);
    this.updateGoalkeeper(this.awayKeeper, dt);
  }

  private updateGoalkeeper(keeper: Goalkeeper, dt: number) {
    if (keeper.state === 'holding') {
      keeper.vx = 0;
      keeper.vy = 0;
      keeper.stateTimer = Math.max(0, keeper.stateTimer - dt);
      if (keeper.stateTimer === 0) this.distributeKeeperBall(keeper);
      return;
    }

    if (keeper.state === 'diving') {
      keeper.stateTimer = Math.max(0, keeper.stateTimer - dt);
      this.moveGoalkeeperToward(keeper, keeper.diveTargetX, keeper.diveTargetY, GK_DIVE_SPEED, dt);
      if (keeper.stateTimer === 0) {
        keeper.state = 'recovering';
        keeper.stateTimer = GK_RECOVERY_DURATION;
        keeper.diveCanCatch = false;
      }
      return;
    }

    if (keeper.state === 'recovering') keeper.stateTimer = Math.max(0, keeper.stateTimer - dt);
    this.positionGoalkeeper(keeper, dt);
    this.tryStartGoalkeeperDive(keeper);
    if (keeper.state === 'recovering' && keeper.stateTimer === 0) keeper.state = 'idle';
  }

  /** Keeps a keeper between the threat and the goal without leaving the penalty area. */
  private positionGoalkeeper(keeper: Goalkeeper, dt: number) {
    const ball = this.ball;
    const goalY = keeper.team === 'home' ? FIELD_BOTTOM : FIELD_TOP;
    const fieldDirection = keeper.team === 'home' ? -1 : 1;
    const opponentTeam: TeamType = keeper.team === 'home' ? 'away' : 'home';
    let sourceX = ball.x;
    let sourceY = ball.y;
    let carrier: FootballPlayer | null = null;
    let threatWeight = 0.78;

    if (ball.owner === opponentTeam) {
      carrier = this.getPlayer(opponentTeam, ball.ownerId);
      if (carrier) {
        sourceX = carrier.x + carrier.vx * 0.2;
        sourceY = carrier.y + carrier.vy * 0.2;
        threatWeight = 0.92;
      }
    } else if (ball.owner === keeper.team || ball.keeperOwner === keeper.team) {
      threatWeight = 0.22;
    } else if (ball.keeperOwner !== null) {
      threatWeight = 0.12;
    } else {
      const towardGoalSpeed = ball.vy * (keeper.team === 'home' ? 1 : -1);
      const lookAhead = towardGoalSpeed > 0
        ? clamp(0.12 + Math.abs(towardGoalSpeed) / 1800, 0.12, 0.34)
        : 0.08;
      sourceX += ball.vx * lookAhead;
      sourceY += ball.vy * lookAhead;
    }

    sourceX = clamp(sourceX, FIELD_LEFT, FIELD_RIGHT);
    sourceY = clamp(sourceY, FIELD_TOP, FIELD_BOTTOM);
    const goalDistance = Math.abs(goalY - sourceY);
    const depth = clamp(31 + (420 - goalDistance) * 0.11, 31, 72);
    const targetY = goalY + fieldDirection * depth;
    const goalDeltaY = goalY - sourceY;
    const fractionToKeeper = Math.abs(goalDeltaY) > 1
      ? clamp((targetY - sourceY) / goalDeltaY, 0, 1)
      : 0.5;
    let targetX = CENTER_X + (sourceX - CENTER_X) * (1 - fractionToKeeper) * threatWeight;

    // If a carrier is facing goal, shade a little toward the shot lane implied by their angle.
    if (carrier) {
      const faceX = Math.cos(carrier.angle);
      const faceY = Math.sin(carrier.angle);
      const towardGoalY = goalY - sourceY;
      const facingDot = (faceX * (CENTER_X - sourceX) + faceY * towardGoalY)
        / Math.max(1, magnitude(CENTER_X - sourceX, towardGoalY));
      if (faceY * towardGoalY > 0.08 && facingDot > 0.2) {
        const aimedX = sourceX + (targetY - sourceY) * faceX / faceY;
        if (aimedX > CENTER_X - GOAL_WIDTH / 2 - 65 && aimedX < CENTER_X + GOAL_WIDTH / 2 + 65) {
          targetX += (aimedX - targetX) * clamp(facingDot * 0.22, 0, 0.24) * threatWeight;
        }
      }
    }

    targetX = clamp(targetX, CENTER_X - GOAL_WIDTH / 2 - 36, CENTER_X + GOAL_WIDTH / 2 + 36);
    if (Math.abs(sourceX - keeper.x) + Math.abs(sourceY - keeper.y) > 0.01) {
      keeper.angle = Math.atan2(sourceY - keeper.y, sourceX - keeper.x);
    }
    this.moveGoalkeeperToward(keeper, targetX, targetY, GK_NORMAL_SPEED, dt);
    if (keeper.state !== 'recovering') {
      const remaining = magnitude(targetX - keeper.x, targetY - keeper.y);
      keeper.state = remaining > 4 ? 'positioning' : 'idle';
    }
  }

  /** Smoothed dt-based keeper movement, bounded to a reasonable goal-area envelope. */
  private moveGoalkeeperToward(keeper: Goalkeeper, targetX: number, targetY: number, maxSpeed: number, dt: number) {
    const goalY = keeper.team === 'home' ? FIELD_BOTTOM : FIELD_TOP;
    const dx = targetX - keeper.x;
    const dy = targetY - keeper.y;
    const distance = magnitude(dx, dy);
    const targetSpeed = Math.min(maxSpeed, distance * 3.8);
    const targetVx = distance > 0.001 ? dx / distance * targetSpeed : 0;
    const targetVy = distance > 0.001 ? dy / distance * targetSpeed : 0;
    const response = maxSpeed === GK_DIVE_SPEED ? 15 : 8;
    const blend = 1 - Math.exp(-response * dt);
    keeper.vx += (targetVx - keeper.vx) * blend;
    keeper.vy += (targetVy - keeper.vy) * blend;
    keeper.x += keeper.vx * dt;
    keeper.y += keeper.vy * dt;

    const minX = Math.max(FIELD_LEFT + PLAYER_RADIUS, CENTER_X - GOAL_WIDTH / 2 - 44);
    const maxX = Math.min(FIELD_RIGHT - PLAYER_RADIUS, CENTER_X + GOAL_WIDTH / 2 + 44);
    keeper.x = clamp(keeper.x, minX, maxX);
    if ((keeper.x === minX && keeper.vx < 0) || (keeper.x === maxX && keeper.vx > 0)) keeper.vx = 0;
    const minY = keeper.team === 'home' ? goalY - 104 : goalY + 3;
    const maxY = keeper.team === 'home' ? goalY - 3 : goalY + 104;
    keeper.y = clamp(keeper.y, minY, maxY);
    if ((keeper.y === minY && keeper.vy < 0) || (keeper.y === maxY && keeper.vy > 0)) keeper.vy = 0;
  }

  /** Projects an on-frame shot to the goal line and starts a dive as it enters range. */
  private tryStartGoalkeeperDive(keeper: Goalkeeper) {
    const ball = this.ball;
    if (ball.shotTeam !== keeper.team || ball.shotAttempted || ball.keeperOwner !== null) return;

    const goalY = keeper.team === 'home' ? FIELD_BOTTOM : FIELD_TOP;
    const goalDirection = keeper.team === 'home' ? 1 : -1;
    const distanceToLine = (goalY - ball.y) * goalDirection;
    const towardGoalSpeed = ball.vy * goalDirection;
    if (distanceToLine < -BALL_RADIUS || towardGoalSpeed <= 1) return;

    const drag = -Math.log(clamp(ball.friction, 0.05, 0.9999));
    let timeToLine: number;
    let travelFactor: number;
    if (drag < 0.0001) {
      timeToLine = distanceToLine / towardGoalSpeed;
      travelFactor = timeToLine;
    } else {
      const stoppingRatio = distanceToLine * drag / towardGoalSpeed;
      if (stoppingRatio >= 0.999) {
        ball.shotAttempted = true;
        return;
      }
      timeToLine = -Math.log(1 - stoppingRatio) / drag;
      travelFactor = (1 - Math.exp(-drag * timeToLine)) / drag;
    }

    const crossingX = ball.x + ball.vx * travelFactor;
    const postLeft = CENTER_X - GOAL_WIDTH / 2 + BALL_RADIUS;
    const postRight = CENTER_X + GOAL_WIDTH / 2 - BALL_RADIUS;
    if (crossingX < postLeft || crossingX > postRight) {
      ball.shotAttempted = true;
      return;
    }
    if (timeToLine > GK_DIVE_TRIGGER_TIME) return;

    const targetX = clamp(crossingX, CENTER_X - GOAL_WIDTH / 2 - 30, CENTER_X + GOAL_WIDTH / 2 + 30);
    const targetY = goalY - goalDirection * 21;
    const expectedSpeed = magnitude(ball.vx, ball.vy) * Math.exp(-drag * timeToLine);
    keeper.diveTargetX = targetX;
    keeper.diveTargetY = targetY;
    const dx = targetX - keeper.x;
    const dy = targetY - keeper.y;
    const travelDistance = magnitude(dx, dy);
    keeper.diveDirectionX = travelDistance > 0.001 ? dx / travelDistance : 0;
    keeper.diveDirectionY = travelDistance > 0.001 ? dy / travelDistance : goalDirection;
    keeper.diveCanCatch = ball.shotPower <= 0.62
      && expectedSpeed <= GK_CATCH_SPEED
      && Math.abs(dx) <= GK_CATCH_RADIUS;
    keeper.angle = Math.atan2(ball.y - keeper.y, ball.x - keeper.x);
    keeper.state = 'diving';
    keeper.stateTimer = GK_DIVE_DURATION;
    ball.shotAttempted = true;
  }

  /** Intercepts a shot/pass at the keeper's real position; catches hold, parries rebound. */
  private resolveGoalkeeperBallCollision() {
    this.resolveKeeperBallCollision(this.homeKeeper);
    this.resolveKeeperBallCollision(this.awayKeeper);
  }

  private resolveKeeperBallCollision(keeper: Goalkeeper) {
    const ball = this.ball;
    if (ball.owner !== 'none' || ball.keeperOwner !== null) return;
    const isMarkedShot = ball.shotTeam === keeper.team;
    if (ball.shotTeam !== null && !isMarkedShot) return;
    if (!isMarkedShot && ball.lastTouchTeam === keeper.team) return;

    const goalDirection = keeper.team === 'home' ? 1 : -1;
    if (!isMarkedShot && ball.vy * goalDirection <= 0) return;
    const dx = ball.x - keeper.x;
    const dy = ball.y - keeper.y;
    const distanceSquared = dx * dx + dy * dy;
    const reach = keeper.state === 'diving' ? GK_DIVE_SAVE_RADIUS : GK_NORMAL_SAVE_RADIUS;
    if (distanceSquared > reach * reach) return;

    const incomingSpeed = magnitude(ball.vx, ball.vy);
    const canCatch = incomingSpeed <= GK_CATCH_SPEED
      && distanceSquared <= GK_CATCH_RADIUS * GK_CATCH_RADIUS
      && (keeper.diveCanCatch || (!isMarkedShot && keeper.state !== 'diving'));
    if (canCatch) {
      this.captureBallWithKeeper(keeper);
      return;
    }
    this.parryBallWithKeeper(keeper, dx, dy, distanceSquared, incomingSpeed);
  }

  private captureBallWithKeeper(keeper: Goalkeeper) {
    const ball = this.ball;
    ball.owner = 'none';
    ball.ownerId = null;
    ball.keeperOwner = keeper.team;
    ball.lastTouchTeam = keeper.team;
    ball.targetTeam = null;
    ball.targetId = null;
    ball.shotTeam = null;
    ball.shotPower = 0;
    ball.shotAttempted = false;
    ball.ownerLockTimer = 0;
    ball.acquisitionCooldown = 0;
    ball.vx = 0;
    ball.vy = 0;
    this.possession = keeper.team;
    keeper.vx = 0;
    keeper.vy = 0;
    keeper.angle = keeper.team === 'home' ? -Math.PI / 2 : Math.PI / 2;
    keeper.state = 'holding';
    keeper.stateTimer = GK_HOLD_DURATION;
    keeper.diveCanCatch = false;
    this.sfx?.('touch');
  }

  private parryBallWithKeeper(keeper: Goalkeeper, offsetX: number, offsetY: number, distanceSquared: number, incomingSpeed: number) {
    const ball = this.ball;
    const distance = Math.sqrt(distanceSquared);
    const normalX = distance > 0.001 ? offsetX / distance : keeper.diveDirectionX;
    const normalY = distance > 0.001 ? offsetY / distance : keeper.diveDirectionY;
    const projection = ball.vx * normalX + ball.vy * normalY;
    let reflectedX = ball.vx - 2 * projection * normalX;
    let reflectedY = ball.vy - 2 * projection * normalY;
    const fieldDirection = keeper.team === 'home' ? -1 : 1;
    if (reflectedY * fieldDirection < 0) reflectedY = -reflectedY;
    if (Math.abs(reflectedY) < incomingSpeed * 0.18) {
      reflectedX += keeper.diveDirectionX * incomingSpeed * 0.28;
      reflectedY = fieldDirection * incomingSpeed * 0.62;
    }
    const reflectedLength = Math.max(1, magnitude(reflectedX, reflectedY));
    const reboundSpeed = Math.min(incomingSpeed * 0.52, 420);
    const ballRadiusFromKeeper = PLAYER_RADIUS + BALL_RADIUS + 1;
    ball.x = clamp(keeper.x + normalX * ballRadiusFromKeeper, FIELD_LEFT + BALL_RADIUS, FIELD_RIGHT - BALL_RADIUS);
    ball.y = clamp(keeper.y + normalY * ballRadiusFromKeeper, FIELD_TOP + BALL_RADIUS, FIELD_BOTTOM - BALL_RADIUS);
    ball.vx = reflectedX / reflectedLength * reboundSpeed;
    ball.vy = reflectedY / reflectedLength * reboundSpeed;
    ball.lastTouchTeam = keeper.team;
    ball.targetTeam = null;
    ball.targetId = null;
    ball.shotTeam = null;
    ball.shotPower = 0;
    ball.shotAttempted = false;
    ball.keeperOwner = null;
    ball.ownerLockTimer = 0;
    ball.acquisitionCooldown = 0.16;
    this.possession = 'neutral';
    keeper.state = 'recovering';
    keeper.stateTimer = GK_RECOVERY_DURATION;
    keeper.diveCanCatch = false;
    this.sfx?.('touch');
  }

  /** Throws a held ball to a viable defender, or clears toward the least-pressured zone. */
  private distributeKeeperBall(keeper: Goalkeeper) {
    const ball = this.ball;
    const teammates = keeper.team === 'home' ? this.homeTeam : this.awayTeam;
    const opponents = keeper.team === 'home' ? this.awayTeam : this.homeTeam;
    let receiver: FootballPlayer | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const player of teammates) {
      if (player.role !== 'defender') continue;
      const dx = player.x - keeper.x;
      const dy = player.y - keeper.y;
      const distance = magnitude(dx, dy);
      let nearestOpponent = Number.POSITIVE_INFINITY;
      for (const opponent of opponents) {
        const opponentDistance = magnitude(opponent.x - player.x, opponent.y - player.y);
        if (opponentDistance < nearestOpponent) nearestOpponent = opponentDistance;
      }
      const laneClearance = this.passLaneClearance(keeper.x, keeper.y, player.x, player.y, opponents);
      const pressurePenalty = Math.max(0, 115 - nearestOpponent) * 1.4;
      const lanePenalty = Math.max(0, 38 - laneClearance) * 2.2;
      const score = distance + pressurePenalty + lanePenalty;
      if (score < bestScore) {
        bestScore = score;
        receiver = player;
      }
    }

    let targetX: number;
    let targetY: number;
    let speed: number;
    const directToDefender = receiver !== null
      && magnitude(receiver.x - keeper.x, receiver.y - keeper.y) < 380
      && this.passLaneClearance(keeper.x, keeper.y, receiver.x, receiver.y, opponents) > 24;
    if (directToDefender && receiver) {
      const leadTime = 0.16;
      targetX = receiver.x + receiver.vx * leadTime;
      targetY = receiver.y + receiver.vy * leadTime;
      speed = clamp(magnitude(targetX - keeper.x, targetY - keeper.y) * 1.12 + 230, 420, 620);
      ball.targetTeam = keeper.team;
      ball.targetId = receiver.id;
    } else {
      const zoneY = keeper.team === 'home' ? FIELD_BOTTOM - 350 : FIELD_TOP + 350;
      let bestZoneScore = Number.NEGATIVE_INFINITY;
      targetX = CENTER_X;
      targetY = zoneY;
      for (let lane = -1; lane <= 1; lane++) {
        const candidateX = CENTER_X + lane * 142;
        let nearestOpponentSquared = Number.POSITIVE_INFINITY;
        for (const opponent of opponents) {
          const dx = opponent.x - candidateX;
          const dy = opponent.y - zoneY;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < nearestOpponentSquared) nearestOpponentSquared = distanceSquared;
        }
        const laneClearance = this.passLaneClearance(keeper.x, keeper.y, candidateX, zoneY, opponents);
        const zoneScore = Math.sqrt(nearestOpponentSquared) + laneClearance * 0.38 - Math.abs(lane) * 12;
        if (zoneScore > bestZoneScore) {
          bestZoneScore = zoneScore;
          targetX = candidateX;
        }
      }
      speed = 540;
      ball.targetTeam = null;
      ball.targetId = null;
    }

    const dx = targetX - keeper.x;
    const dy = targetY - keeper.y;
    const distance = Math.max(1, magnitude(dx, dy));
    const directionX = dx / distance;
    const directionY = dy / distance;
    ball.x = keeper.x + directionX * (PLAYER_RADIUS + BALL_RADIUS + 2);
    ball.y = keeper.y + directionY * (PLAYER_RADIUS + BALL_RADIUS + 2);
    ball.vx = directionX * speed + keeper.vx * 0.08;
    ball.vy = directionY * speed + keeper.vy * 0.08;
    ball.owner = 'none';
    ball.ownerId = null;
    ball.keeperOwner = null;
    ball.lastTouchTeam = keeper.team;
    ball.shotTeam = null;
    ball.shotPower = 0;
    ball.shotAttempted = false;
    ball.acquisitionCooldown = 0.08;
    ball.ownerLockTimer = 0;
    this.possession = keeper.team;
    this.awayMode = keeper.team === 'away' ? 'attacking' : 'defending';
    keeper.state = 'recovering';
    keeper.stateTimer = GK_RECOVERY_DURATION;
    keeper.diveCanCatch = false;
    this.sfx?.('kick');
  }

  /** Updates either the controlled dribble or the free ball's dt-based motion. */
  private updateBall(dt: number) {
    if (this.ball.keeperOwner !== null) {
      const keeper = this.ball.keeperOwner === 'home' ? this.homeKeeper : this.awayKeeper;
      const fieldDirection = keeper.team === 'home' ? -1 : 1;
      this.ball.x = keeper.x + Math.cos(keeper.angle) * BALL_OFFSET * 0.65;
      this.ball.y = keeper.y + fieldDirection * BALL_OFFSET * 0.65;
      this.ball.vx = 0;
      this.ball.vy = 0;
      return;
    }
    if (this.ball.owner !== 'none') {
      this.attachBallToOwner(dt);
      return;
    }

    const ball = this.ball;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    const friction = Math.pow(ball.friction, dt);
    ball.vx *= friction;
    ball.vy *= friction;

    const minX = FIELD_LEFT + BALL_RADIUS;
    const maxX = FIELD_RIGHT - BALL_RADIUS;
    if (ball.x < minX) { ball.x = minX; ball.vx = Math.abs(ball.vx) * 0.7; }
    if (ball.x > maxX) { ball.x = maxX; ball.vx = -Math.abs(ball.vx) * 0.7; }

    const insideGoalMouth = ball.x > CENTER_X - GOAL_WIDTH / 2 + BALL_RADIUS
      && ball.x < CENTER_X + GOAL_WIDTH / 2 - BALL_RADIUS;
    if (!insideGoalMouth && ball.y < FIELD_TOP + BALL_RADIUS) {
      ball.y = FIELD_TOP + BALL_RADIUS;
      ball.vy = Math.abs(ball.vy) * 0.7;
    } else if (!insideGoalMouth && ball.y > FIELD_BOTTOM - BALL_RADIUS) {
      ball.y = FIELD_BOTTOM - BALL_RADIUS;
      ball.vy = -Math.abs(ball.vy) * 0.7;
    }
  }

  private attachBallToOwner(dt = 0) {
    const ball = this.ball;
    if (ball.owner === 'none') return;
    const owner = this.getPlayer(ball.owner, ball.ownerId);
    if (!owner) {
      ball.owner = 'none';
      ball.ownerId = null;
      ball.targetTeam = null;
      ball.targetId = null;
      ball.ownerLockTimer = 0;
      this.possession = 'neutral';
      return;
    }

    const speedRatio = clamp(magnitude(owner.vx, owner.vy) / Math.max(1, owner.speed), 0, 1);
    const forwardOffset = BALL_OFFSET + speedRatio * 10;
    const sideOffset = speedRatio > 0.08 ? (owner.id % 2 === 0 ? 3.5 : -3.5) : 0;
    const targetX = clamp(owner.x + Math.cos(owner.angle) * forwardOffset - Math.sin(owner.angle) * sideOffset, FIELD_LEFT + BALL_RADIUS, FIELD_RIGHT - BALL_RADIUS);
    const targetY = clamp(owner.y + Math.sin(owner.angle) * forwardOffset + Math.cos(owner.angle) * sideOffset, FIELD_TOP - GOAL_DEPTH, FIELD_BOTTOM + GOAL_DEPTH);
    const previousX = ball.x;
    const previousY = ball.y;
    if (dt > 0) {
      const followRate = speedRatio > 0.12 ? 17 : 24;
      const blend = 1 - Math.exp(-followRate * dt);
      ball.x += (targetX - ball.x) * blend;
      ball.y += (targetY - ball.y) * blend;
      ball.vx = (ball.x - previousX) / dt;
      ball.vy = (ball.y - previousY) / dt;
    } else {
      ball.x = targetX;
      ball.y = targetY;
      ball.vx = owner.vx;
      ball.vy = owner.vy;
    }
  }

  /** A close challenge knocks the ball loose; the next touch establishes possession. */
  private resolvePlayerBallCollision() {
    const ball = this.ball;
    if (ball.keeperOwner !== null) return;
    if (ball.owner !== 'none') {
      if (ball.ownerLockTimer > 0) return;
      const carrier = this.getPlayer(ball.owner, ball.ownerId);
      if (!carrier) return;
      const opponents = carrier.team === 'home' ? this.awayTeam : this.homeTeam;
      for (const challenger of opponents) {
        if (challenger.tackleCooldown > 0 || challenger.stunTimer > 0) continue;
        const dx = carrier.x - challenger.x;
        const dy = carrier.y - challenger.y;
        const distance = magnitude(dx, dy);
        if (carrier.team === 'home' && challenger.team === 'away') {
          if (challenger.id !== this.defensivePresserId
            || distance < TACKLE_MIN_DISTANCE
            || distance > TACKLE_MAX_DISTANCE
            || challenger.aiReactionTimer > 0) continue;
          const profile = this.profile();
          const carrierSpeedRatio = clamp(magnitude(carrier.vx, carrier.vy) / Math.max(1, carrier.speed), 0, 1);
          const successChance = clamp(profile.tackleChance - carrierSpeedRatio * 0.1, 0.12, 0.72);
          if (this.random01() > successChance) {
            challenger.tackleCooldown = profile.failedTackleCooldown;
            challenger.aiReactionTimer = profile.reactionDelay * 0.5;
            challenger.state = 'tackling';
            challenger.stateTimer = 0.22;
            this.presserEngaged = true;
            this.sfx?.('tackle');
            return;
          }
        } else if (distance > PLAYER_COLLISION_DISTANCE + 2) {
          continue;
        }

        const nx = distance > 0.001 ? dx / distance : (carrier.team === 'home' ? 1 : -1);
        const ny = distance > 0.001 ? dy / distance : 0;
        ball.owner = 'none';
        ball.ownerId = null;
        ball.lastTouchTeam = challenger.team;
        ball.targetTeam = null;
        ball.targetId = null;
        ball.shotTeam = null;
        ball.shotPower = 0;
        ball.shotAttempted = false;
        ball.keeperOwner = null;
        ball.ownerLockTimer = 0;
        ball.x = clamp(carrier.x + nx * BALL_OFFSET, FIELD_LEFT + BALL_RADIUS, FIELD_RIGHT - BALL_RADIUS);
        ball.y = clamp(carrier.y + ny * BALL_OFFSET, FIELD_TOP - GOAL_DEPTH, FIELD_BOTTOM + GOAL_DEPTH);
        ball.vx = carrier.vx * 0.25 + nx * 165;
        ball.vy = carrier.vy * 0.25 + ny * 165;
        ball.acquisitionCooldown = 0.12;
        this.possession = 'neutral';
        if (carrier.team === 'away') {
          this.awayMode = 'defending';
          this.defensivePresserId = null;
          this.presserCarrierId = null;
          this.presserEngaged = false;
        }
        challenger.tackleCooldown = carrier.team === 'home' && challenger.team === 'away'
          ? this.profile().successfulTackleCooldown
          : 0.55;
        challenger.state = 'tackling';
        challenger.stateTimer = 0.2;
        carrier.tackleCooldown = 0.45;
        carrier.state = 'stunned';
        carrier.stunTimer = 0.18;
        carrier.stateTimer = 0.18;
        this.sfx?.('tackle');
        return;
      }
      return;
    }

    if (ball.acquisitionCooldown > 0) return;
    if (ball.targetTeam !== null && ball.targetId !== null) {
      const receiverTeam = ball.targetTeam;
      const receiver = this.getPlayer(receiverTeam, ball.targetId);
      if (receiver) {
        const dx = receiver.x - ball.x;
        const dy = receiver.y - ball.y;
        const receiverDistanceSquared = dx * dx + dy * dy;
        const receiveDistance = BALL_PICKUP_DISTANCE + 11;
        const opponents = receiverTeam === 'home' ? this.awayTeam : this.homeTeam;
        let nearestOpponentDistanceSquared = Number.POSITIVE_INFINITY;
        for (const opponent of opponents) {
          const opponentDx = opponent.x - ball.x;
          const opponentDy = opponent.y - ball.y;
          const distanceSquared = opponentDx * opponentDx + opponentDy * opponentDy;
          if (distanceSquared < nearestOpponentDistanceSquared) nearestOpponentDistanceSquared = distanceSquared;
        }
        // The target gets a small control cushion, but an opponent closer to the ball can intercept.
        if (receiverDistanceSquared <= receiveDistance * receiveDistance
          && receiverDistanceSquared <= nearestOpponentDistanceSquared + 100) {
          this.setPossession(receiver);
          return;
        }
      }
    }

    let nearest: FootballPlayer | null = null;
    let nearestDistanceSq = BALL_PICKUP_DISTANCE * BALL_PICKUP_DISTANCE;
    for (const player of this.homeTeam) {
      const dx = player.x - ball.x;
      const dy = player.y - ball.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < nearestDistanceSq) { nearest = player; nearestDistanceSq = distanceSq; }
    }
    for (const player of this.awayTeam) {
      const dx = player.x - ball.x;
      const dy = player.y - ball.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < nearestDistanceSq) { nearest = player; nearestDistanceSq = distanceSq; }
    }
    if (nearest) this.setPossession(nearest);
  }

  private setPossession(player: FootballPlayer) {
    this.ball.owner = player.team;
    this.ball.ownerId = player.id;
    this.ball.lastTouchTeam = player.team;
    this.ball.targetTeam = null;
    this.ball.targetId = null;
    this.ball.shotTeam = null;
    this.ball.shotPower = 0;
    this.ball.shotAttempted = false;
    this.ball.keeperOwner = null;
    this.ball.ownerLockTimer = OWNER_LOCK_DURATION;
    this.ball.acquisitionCooldown = 0;
    this.ball.vx = player.vx;
    this.ball.vy = player.vy;
    this.possession = player.team;
    if (player.team === 'away') {
      this.awayMode = 'attacking';
      this.defensivePresserId = null;
      this.presserCarrierId = null;
      this.presserEngaged = false;
      player.aiReactionTimer = this.profile().reactionDelay;
      player.aiDecisionTimer = this.profile().reactionDelay;
    } else {
      this.awayMode = 'defending';
      this.defensivePresserId = null;
      this.presserCarrierId = null;
      this.presserEngaged = false;
    }
    player.state = 'receiving';
    player.stateTimer = 0.2;
    this.sfx?.('touch');
    this.attachBallToOwner();
  }

  private checkGoal() {
    const ball = this.ball;
    const insideMouth = ball.x > CENTER_X - GOAL_WIDTH / 2 + BALL_RADIUS
      && ball.x < CENTER_X + GOAL_WIDTH / 2 - BALL_RADIUS;
    if (insideMouth && ball.y < FIELD_TOP) this.scoreGoal('home');
    else if (insideMouth && ball.y > FIELD_BOTTOM) this.scoreGoal('away');
  }

  private scoreGoal(scoringTeam: TeamType) {
    if (scoringTeam === 'home') this.homeScore++;
    else this.awayScore++;
    this.kickoffTeam = scoringTeam === 'home' ? 'away' : 'home';
    this.ball.owner = 'none';
    this.ball.ownerId = null;
    this.ball.targetTeam = null;
    this.ball.targetId = null;
    this.ball.shotTeam = null;
    this.ball.shotPower = 0;
    this.ball.shotAttempted = false;
    this.ball.keeperOwner = null;
    this.ball.ownerLockTimer = 0;
    this.ball.vx *= 0.1;
    this.ball.vy *= 0.1;
    this.possession = 'neutral';
    this.awayMode = 'defending';
    this.defensivePresserId = null;
    this.presserCarrierId = null;
    this.presserEngaged = false;
    this.resetCharge();
    this.goalCelebrationTeam = scoringTeam;
    this.goalCelebrationTimer = 1.25;
    this.goalResetTimer = 1.25;
    this.sfx?.('goal');
  }

  /** Camera follows the ball/holder and is clamped to the world bounds. */
  private updateCamera(dt: number) {
    const targetX = this.ball.x;
    const targetY = this.ball.y;
    const desiredX = clamp(targetX - W / 2, 0, PITCH_W - W);
    const desiredY = clamp(targetY - H / 2, 0, PITCH_H - H);
    const blend = 1 - Math.exp(-5.5 * Math.max(0, dt));
    this.camX = clamp(this.camX + (desiredX - this.camX) * blend, 0, PITCH_W - W);
    this.camY = clamp(this.camY + (desiredY - this.camY) * blend, 0, PITCH_H - H);
  }

  // ------------------------- World rendering -------------------------
  render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(-this.camX, -this.camY);
    this.drawPitch(ctx);
    for (const player of this.awayTeam) this.drawPlayer(ctx, player, player.id === this.defensivePresserId);
    for (let i = 0; i < this.homeTeam.length; i++) this.drawPlayer(ctx, this.homeTeam[i], i === this.activePlayerIndex);
    this.drawGoalkeeper(ctx, this.awayKeeper);
    this.drawGoalkeeper(ctx, this.homeKeeper);
    this.drawBall(ctx);
    this.drawGoalCelebration(ctx);
    ctx.restore();
  }

  private drawPitch(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#183822';
    ctx.fillRect(0, 0, PITCH_W, PITCH_H);
    ctx.fillStyle = '#2e9345';
    ctx.fillRect(FIELD_LEFT, FIELD_TOP, FIELD_RIGHT - FIELD_LEFT, FIELD_BOTTOM - FIELD_TOP);
    for (let i = 0, y = FIELD_TOP; y < FIELD_BOTTOM; i++, y += 100) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.035)';
      ctx.fillRect(FIELD_LEFT, y, FIELD_RIGHT - FIELD_LEFT, Math.min(100, FIELD_BOTTOM - y));
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 3;
    ctx.strokeRect(FIELD_LEFT, FIELD_TOP, FIELD_RIGHT - FIELD_LEFT, FIELD_BOTTOM - FIELD_TOP);
    ctx.beginPath();
    ctx.moveTo(FIELD_LEFT, CENTER_Y);
    ctx.lineTo(FIELD_RIGHT, CENTER_Y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, 92, 0, PI2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, 4, 0, PI2);
    ctx.fill();

    const boxWidth = 420;
    const boxDepth = 165;
    const goalAreaWidth = 210;
    const goalAreaDepth = 70;
    const spotOffset = 126;
    const arcRadius = 74;
    const boxX = CENTER_X - boxWidth / 2;
    const goalAreaX = CENTER_X - goalAreaWidth / 2;
    ctx.strokeRect(boxX, FIELD_TOP, boxWidth, boxDepth);
    ctx.strokeRect(goalAreaX, FIELD_TOP, goalAreaWidth, goalAreaDepth);
    ctx.beginPath();
    ctx.arc(CENTER_X, FIELD_TOP + spotOffset, 3, 0, PI2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(CENTER_X, FIELD_TOP + spotOffset, arcRadius, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    ctx.strokeRect(boxX, FIELD_BOTTOM - boxDepth, boxWidth, boxDepth);
    ctx.strokeRect(goalAreaX, FIELD_BOTTOM - goalAreaDepth, goalAreaWidth, goalAreaDepth);
    ctx.beginPath();
    ctx.arc(CENTER_X, FIELD_BOTTOM - spotOffset, 3, 0, PI2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(CENTER_X, FIELD_BOTTOM - spotOffset, arcRadius, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();

    this.drawGoal(ctx, true);
    this.drawGoal(ctx, false);
  }

  private drawGoal(ctx: CanvasRenderingContext2D, top: boolean) {
    const left = CENTER_X - GOAL_WIDTH / 2;
    const y = top ? FIELD_TOP - GOAL_DEPTH : FIELD_BOTTOM;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(left, y, GOAL_WIDTH, GOAL_DEPTH);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    for (let x = left + 8; x < left + GOAL_WIDTH; x += 16) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + GOAL_DEPTH); ctx.stroke();
    }
    for (let row = 0; row <= GOAL_DEPTH; row += 8) {
      ctx.beginPath(); ctx.moveTo(left, y + row); ctx.lineTo(left + GOAL_WIDTH, y + row); ctx.stroke();
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (top) {
      ctx.moveTo(left, FIELD_TOP + 1); ctx.lineTo(left, FIELD_TOP - GOAL_DEPTH);
      ctx.lineTo(left + GOAL_WIDTH, FIELD_TOP - GOAL_DEPTH); ctx.lineTo(left + GOAL_WIDTH, FIELD_TOP + 1);
    } else {
      ctx.moveTo(left, FIELD_BOTTOM - 1); ctx.lineTo(left, FIELD_BOTTOM + GOAL_DEPTH);
      ctx.lineTo(left + GOAL_WIDTH, FIELD_BOTTOM + GOAL_DEPTH); ctx.lineTo(left + GOAL_WIDTH, FIELD_BOTTOM - 1);
    }
    ctx.stroke();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, player: FootballPlayer, active: boolean) {
    const shirt = player.team === 'home' ? '#38bdf8' : '#ef4444';
    const trim = player.team === 'home' ? '#075985' : '#7f1d1d';
    ctx.save();
    ctx.translate(player.x, player.y);
    if (active) {
      ctx.strokeStyle = 'rgba(253,230,138,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, PLAYER_RADIUS + 5, 0, PI2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(2, 6, PLAYER_RADIUS, PLAYER_RADIUS * 0.58, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = shirt;
    ctx.strokeStyle = trim;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, PLAYER_RADIUS, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.rotate(player.angle);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(2, -4); ctx.lineTo(2, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  private drawGoalkeeper(ctx: CanvasRenderingContext2D, keeper: Goalkeeper) {
    const diving = keeper.state === 'diving';
    const holding = keeper.state === 'holding';
    const poseAngle = diving
      ? Math.atan2(keeper.diveDirectionY, keeper.diveDirectionX)
      : keeper.angle;
    const diveScale = diving ? 1.28 : 1;
    ctx.save();
    ctx.translate(keeper.x, keeper.y);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(2, 7, PLAYER_RADIUS + 4, 9, 0, 0, PI2); ctx.fill();
    ctx.rotate(poseAngle);
    ctx.scale(diveScale, diving ? 0.78 : 1);

    const shirt = keeper.team === 'home' ? '#f59e0b' : '#a78bfa';
    const trim = keeper.team === 'home' ? '#7c2d12' : '#5b21b6';
    ctx.strokeStyle = trim;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (holding) {
      ctx.moveTo(-10, -3); ctx.lineTo(-8, 11);
      ctx.moveTo(10, -3); ctx.lineTo(8, 11);
    } else {
      ctx.moveTo(-10, -3); ctx.lineTo(-19, -8);
      ctx.moveTo(10, -3); ctx.lineTo(19, -8);
    }
    ctx.stroke();
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath(); ctx.arc(holding ? -8 : -20, holding ? 12 : -9, 4.5, 0, PI2); ctx.fill();
    ctx.beginPath(); ctx.arc(holding ? 8 : 20, holding ? 12 : -9, 4.5, 0, PI2); ctx.fill();

    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.ellipse(0, 0, PLAYER_RADIUS + 2, PLAYER_RADIUS - 1, 0, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, -2, 4, 0, PI2); ctx.fill();
    ctx.restore();
  }

  private drawBall(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(this.ball.x + 2, this.ball.y + 4, BALL_RADIUS + 1, BALL_RADIUS * 0.55, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(this.ball.x, this.ball.y, BALL_RADIUS, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(this.ball.x, this.ball.y, 2.2, 0, PI2); ctx.fill();
  }

  /** World-space goal pulse; rendered after the camera transform so it follows the net. */
  private drawGoalCelebration(ctx: CanvasRenderingContext2D) {
    if (!this.goalCelebrationTeam || this.goalCelebrationTimer <= 0) return;
    const elapsed = clamp(1 - this.goalCelebrationTimer / 1.25, 0, 1);
    const opacity = (1 - elapsed) * 0.78;
    const centerX = CENTER_X;
    const centerY = this.goalCelebrationTeam === 'home' ? FIELD_TOP - 2 : FIELD_BOTTOM + 2;
    const radius = 24 + elapsed * 105;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = this.goalCelebrationTeam === 'home' ? '#fde68a' : '#fca5a5';
    ctx.lineWidth = 8 * (1 - elapsed) + 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, PI2);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let ray = 0; ray < 8; ray++) {
      const angle = ray * PI2 / 8;
      const inner = radius + 9;
      const outer = inner + 14 * (1 - elapsed);
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
      ctx.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.restore();
  }
}
