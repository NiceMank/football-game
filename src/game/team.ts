import { PITCH_L } from './constants';
import { KeeperBrain } from './goalkeeper';
import { Player } from './player';
import type { AIProfile } from './profiles';
import { createStats, type AttackPlan, type Role, type Side, type TeamStats } from './types';

export interface Kit {
  primary: string;
  secondary: string;
  shorts: string;
  socks: string;
  keeper: string;
  keeperTrim: string;
  skin: readonly string[];
  hair: readonly string[];
}

export interface TeamConfig {
  side: Side;
  name: string;
  short: string;
  kit: Kit;
  names: readonly string[];
  numbers: readonly number[];
}

interface Slot { role: Role; flank: -1 | 0 | 1 }

/** 1-2-1 diamond behind the goalkeeper: classic 5-a-side shape. */
const LINEUP: readonly Slot[] = [
  { role: 'GK', flank: 0 },
  { role: 'DEF', flank: 0 },
  { role: 'MID', flank: -1 },
  { role: 'MID', flank: 1 },
  { role: 'FWD', flank: 0 },
];

const STATS = [
  { speed: 0.9, shot: 0.5, pass: 0.7, dribble: 0.5 },
  { speed: 0.97, shot: 0.6, pass: 0.82, dribble: 0.62 },
  { speed: 1.03, shot: 0.72, pass: 0.86, dribble: 0.8 },
  { speed: 1.03, shot: 0.74, pass: 0.84, dribble: 0.82 },
  { speed: 1.05, shot: 0.9, pass: 0.74, dribble: 0.86 },
] as const;

export class Team {
  readonly side: Side;
  readonly name: string;
  readonly short: string;
  readonly kit: Kit;
  readonly players: Player[] = [];
  opp!: Team;
  dir: 1 | -1;
  human = false;
  profile: AIProfile;

  score = 0;
  stats: TeamStats = createStats();
  controlled: Player | null = null;

  plan: AttackPlan = 'build';
  planTimer = 0;
  wonAt = -99;
  lostAt = -99;
  tacticTimer = 0;
  presser: Player | null = null;
  cover: Player | null = null;
  chaser: Player | null = null;
  interceptor: Player | null = null;
  /** Pending defensive reassignment delay (models reaction time). */
  reassignDelay = 0;

  constructor(cfg: TeamConfig, dir: 1 | -1, profile: AIProfile) {
    this.side = cfg.side;
    this.name = cfg.name;
    this.short = cfg.short;
    this.kit = cfg.kit;
    this.dir = dir;
    this.profile = profile;
    for (let i = 0; i < LINEUP.length; i++) {
      const slot = LINEUP[i];
      const p = new Player(this, i, slot.role, cfg.numbers[i], cfg.names[i], slot.flank, STATS[i]);
      if (slot.role === 'GK') p.gk = new KeeperBrain();
      this.players.push(p);
    }
  }

  get keeper() {
    return this.players[0];
  }

  /** x of the goal line this team defends. */
  get ownGoalX() {
    return this.dir > 0 ? 0 : PITCH_L;
  }

  /** x of the goal line this team attacks. */
  get oppGoalX() {
    return this.dir > 0 ? PITCH_L : 0;
  }

  /** Progress 0 (own goal line) .. 1 (opponent goal line). */
  local(x: number) {
    return this.dir > 0 ? x / PITCH_L : (PITCH_L - x) / PITCH_L;
  }

  worldX(f: number) {
    return this.dir > 0 ? f * PITCH_L : PITCH_L - f * PITCH_L;
  }

  resetMatchState() {
    this.score = 0;
    this.stats = createStats();
    this.controlled = null;
    this.plan = 'build';
    this.planTimer = 0;
    this.wonAt = -99;
    this.lostAt = -99;
    for (const p of this.players) {
      p.stamina = 1;
      p.stun = 0;
      p.slide = 0;
      p.kickCd = 0;
      p.tackleCd = 0;
      p.celebrate = 0;
      p.runTimer = 0;
      p.markTarget = null;
      p.vx = p.vy = 0;
      p.gk?.reset();
    }
  }
}

export const HOME_CONFIG: TeamConfig = {
  side: 'home',
  name: 'Striker FC',
  short: 'STR',
  kit: {
    primary: '#1d5fe0', secondary: '#f8fafc', shorts: '#f1f5f9', socks: '#1d4ed8',
    keeper: '#16a34a', keeperTrim: '#bbf7d0',
    skin: ['#f1c27d', '#8d5524', '#e0ac69', '#c68642', '#ffdbac'],
    hair: ['#1f1309', '#2b1b0e', '#0b0b0b', '#5a3a1a', '#120c06'],
  },
  names: ['Lemaire', 'Diallo', 'Moreau', 'Silva', 'Benali'],
  numbers: [1, 4, 8, 10, 9],
};

export const AWAY_CONFIG: TeamConfig = {
  side: 'away',
  name: 'Phénix Rouge',
  short: 'PHX',
  kit: {
    primary: '#d61f2c', secondary: '#fbbf24', shorts: '#111827', socks: '#b91c1c',
    keeper: '#7c3aed', keeperTrim: '#ddd6fe',
    skin: ['#c68642', '#f1c27d', '#8d5524', '#ffdbac', '#e0ac69'],
    hair: ['#0b0b0b', '#3b2412', '#c08a3e', '#1f1309', '#0b0b0b'],
  },
  names: ['Kowalski', 'Ferreira', 'Okafor', 'Rossi', 'Haddad'],
  numbers: [1, 5, 7, 11, 9],
};
