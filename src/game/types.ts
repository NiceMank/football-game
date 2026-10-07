export type Side = 'home' | 'away';
export type Role = 'GK' | 'DEF' | 'MID' | 'FWD';
export type Difficulty = 'amateur' | 'pro' | 'legend';
export type RestartType = 'kickoff' | 'throwin' | 'corner' | 'goalkick' | 'freekick' | 'penalty';
export type MatchState = 'setup' | 'taking' | 'live' | 'goal' | 'halftime' | 'fulltime';
export type AttackPlan = 'build' | 'direct' | 'wing' | 'counter';
export type KickKind = 'none' | 'pass' | 'lob' | 'cross' | 'shot' | 'clear' | 'throw' | 'dribble' | 'deflect' | 'parry';

export type Intent =
  | 'idle' | 'support' | 'run' | 'width' | 'hold' | 'receive'
  | 'press' | 'cover' | 'mark' | 'intercept' | 'chase' | 'carry' | 'shield' | 'celebrate' | 'setpiece';

export type SfxName =
  | 'ui' | 'pause' | 'switch' | 'whistle' | 'whistleLong' | 'kick' | 'pass' | 'shot' | 'power'
  | 'touch' | 'tackle' | 'foul' | 'dive' | 'parry' | 'catch' | 'post' | 'net' | 'goal' | 'throw' | 'ooh';

export interface AimSwipe {
  /** World-space direction (normalized). */
  dx: number;
  dy: number;
  /** 0..1 from swipe length. */
  power: number;
}

export interface InputState {
  moveX: number;
  moveY: number;
  sprint: boolean;
  pass: boolean;
  shoot: boolean;
  passPressed: boolean;
  passReleased: boolean;
  shootPressed: boolean;
  shootReleased: boolean;
  switchPressed: boolean;
  dashPressed: boolean;
  passSwipe: AimSwipe | null;
  shootSwipe: AimSwipe | null;
}

export function createInput(): InputState {
  return {
    moveX: 0, moveY: 0, sprint: false, pass: false, shoot: false,
    passPressed: false, passReleased: false, shootPressed: false, shootReleased: false,
    switchPressed: false, dashPressed: false, passSwipe: null, shootSwipe: null,
  };
}

export function clearInputEdges(input: InputState) {
  input.passPressed = false;
  input.passReleased = false;
  input.shootPressed = false;
  input.shootReleased = false;
  input.switchPressed = false;
  input.dashPressed = false;
  input.passSwipe = null;
  input.shootSwipe = null;
}

export interface TeamStats {
  shots: number;
  onTarget: number;
  passes: number;
  passesCompleted: number;
  saves: number;
  corners: number;
  fouls: number;
  tackles: number;
  possession: number;
}

export function createStats(): TeamStats {
  return { shots: 0, onTarget: 0, passes: 0, passesCompleted: 0, saves: 0, corners: 0, fouls: 0, tackles: 0, possession: 0 };
}

export interface HudSnapshot {
  homeScore: number;
  awayScore: number;
  homeName: string;
  awayName: string;
  homeShort: string;
  awayShort: string;
  homeColor: string;
  awayColor: string;
  clock: string;
  half: 1 | 2;
  state: MatchState;
  possessionHome: number;
  hasBall: boolean;
  defending: boolean;
  activeNumber: number | null;
  activeName: string;
  activeRole: Role | null;
  stamina: number;
  restartLabel: string | null;
  humanTaking: boolean;
  keeperHold: number;
}
