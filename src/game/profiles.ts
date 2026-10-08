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
    decision: 0.78, offBall: 0.7, reaction: 0.5, press: 0.28, pressRange: 120, tackle: 0.26, foulRisk: 0.26,
    passError: 0.12, shotError: 46, noise: 0.42, positioning: 0.4, anticipation: 0.22, vision: 0.3,
    keeper: { reaction: 0.25, reactionVar: 0.08, readError: 24, perception: 6.5, catchSkill: 0.56, handling: 0.5, errorChance: 0.065, positioning: 12, diveSpeed: 230 },
  },
  pro: {
    decision: 0.52, offBall: 0.48, reaction: 0.32, press: 0.48, pressRange: 170, tackle: 0.37, foulRisk: 0.17,
    passError: 0.085, shotError: 36, noise: 0.28, positioning: 0.56, anticipation: 0.38, vision: 0.46,
    keeper: { reaction: 0.22, reactionVar: 0.06, readError: 19, perception: 8, catchSkill: 0.63, handling: 0.6, errorChance: 0.045, positioning: 8, diveSpeed: 245 },
  },
  legend: {
    decision: 0.4, offBall: 0.4, reaction: 0.26, press: 0.55, pressRange: 180, tackle: 0.42, foulRisk: 0.13,
    passError: 0.06, shotError: 28, noise: 0.16, positioning: 0.7, anticipation: 0.5, vision: 0.6,
    keeper: { reaction: 0.2, reactionVar: 0.05, readError: 16, perception: 9, catchSkill: 0.67, handling: 0.66, errorChance: 0.035, positioning: 6, diveSpeed: 258 },
  },
};

/**
 * The human's AI teammates stay at a solid level whatever the opponent difficulty is.
 * Defined on its own so easing the opponent does not also make teammates stop running and passing.
 */
export const TEAMMATE_PROFILE: AIProfile = {
  decision: 0.36,
  offBall: 0.3,
  reaction: 0.22,
  press: 0.58,
  pressRange: 185,
  tackle: 0.46,
  foulRisk: 0.12,
  passError: 0.05,
  shotError: 24,
  noise: 0.15,
  positioning: 0.82,
  anticipation: 0.64,
  vision: 0.84,
  keeper: AI_PROFILES.pro.keeper,
};
