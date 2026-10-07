import type { Difficulty } from './types';

export interface KeeperProfile {
  /** Seconds between the shot and the first committed movement. */
  reaction: number;
  reactionVar: number;
  /** Std-dev (world units) of the keeper's read of the crossing point. */
  readError: number;
  /** How fast the keeper's perception of the ball catches up (higher = less lag). */
  perception: number;
  catchSkill: number;
  /** Quality of parries: higher pushes the ball wider / safer. */
  handling: number;
  /** Probability of a fumble on a contact. */
  errorChance: number;
  /** Positional noise (world units). */
  positioning: number;
  diveSpeed: number;
}

export interface AIProfile {
  /** Carrier decision interval (s). */
  decision: number;
  /** Off-ball re-evaluation interval (s). */
  offBall: number;
  /** Delay before defensive reassignments take effect (s). */
  reaction: number;
  press: number;
  pressRange: number;
  tackle: number;
  foulRisk: number;
  /** Std-dev of pass direction error (radians). */
  passError: number;
  /** Std-dev of the shot target error on the goal line (world units). */
  shotError: number;
  /** Randomness added to option scores. */
  noise: number;
  positioning: number;
  anticipation: number;
  vision: number;
  keeper: KeeperProfile;
}

export const AI_PROFILES: Record<Difficulty, AIProfile> = {
  amateur: {
    decision: 0.62, offBall: 0.6, reaction: 0.34, press: 0.42, pressRange: 150, tackle: 0.4, foulRisk: 0.24,
    passError: 0.085, shotError: 34, noise: 0.34, positioning: 0.52, anticipation: 0.32, vision: 0.38,
    keeper: { reaction: 0.27, reactionVar: 0.08, readError: 26, perception: 6, catchSkill: 0.55, handling: 0.5, errorChance: 0.07, positioning: 14, diveSpeed: 400 },
  },
  pro: {
    decision: 0.42, offBall: 0.42, reaction: 0.22, press: 0.7, pressRange: 210, tackle: 0.5, foulRisk: 0.14,
    passError: 0.055, shotError: 25, noise: 0.18, positioning: 0.78, anticipation: 0.62, vision: 0.68,
    keeper: { reaction: 0.22, reactionVar: 0.06, readError: 18, perception: 8, catchSkill: 0.64, handling: 0.62, errorChance: 0.045, positioning: 8, diveSpeed: 420 },
  },
  legend: {
    decision: 0.28, offBall: 0.3, reaction: 0.14, press: 0.9, pressRange: 260, tackle: 0.58, foulRisk: 0.1,
    passError: 0.035, shotError: 18, noise: 0.08, positioning: 0.94, anticipation: 0.88, vision: 0.94,
    keeper: { reaction: 0.185, reactionVar: 0.05, readError: 14, perception: 10, catchSkill: 0.7, handling: 0.7, errorChance: 0.03, positioning: 5, diveSpeed: 435 },
  },
};

/** The human's AI teammates play at a solid, fixed level independent of the opponent difficulty. */
export const TEAMMATE_PROFILE: AIProfile = {
  ...AI_PROFILES.pro,
  decision: 0.38,
  offBall: 0.36,
  positioning: 0.85,
  anticipation: 0.72,
  vision: 0.8,
  keeper: AI_PROFILES.pro.keeper,
};
