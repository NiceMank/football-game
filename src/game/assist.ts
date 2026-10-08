/**
 * Gameplay assistance for the human player, 0 (none) .. 1 (strong). The player keeps the decision;
 * assistance only widens the target search, trims the error and nudges direction / timing.
 */
export type AssistLevel = 'low' | 'medium' | 'high';

export interface AssistSettings {
  /** Pass: how wide the aim cone is, how much a nearby teammate is "found", accuracy. */
  pass: number;
  /** Shot: how far off the frame an aim is still pulled onto it, how tight the shot is. */
  shot: number;
  /** Defence: X reach and step-in range, approach correction, tackle quality. */
  defense: number;
}

export const ASSIST_LEVELS: Record<AssistLevel, AssistSettings> = {
  low: { pass: 0.3, shot: 0.15, defense: 0.2 },
  medium: { pass: 0.55, shot: 0.35, defense: 0.45 },
  high: { pass: 0.8, shot: 0.6, defense: 0.7 },
};

/** Active values, read by the human controller every action. */
export const ASSIST: AssistSettings & { level: AssistLevel } = { level: 'medium', ...ASSIST_LEVELS.medium };

export function setAssistLevel(level: AssistLevel) {
  Object.assign(ASSIST, ASSIST_LEVELS[level], { level });
}

/* Derived tuning (all equal to the previously hand-tuned values at MEDIUM). */

/** Cosine of the half-angle of the directed pass cone (medium ≈ 67°). */
export const passConeCos = () => 0.75 - ASSIST.pass * 0.65;
/** A teammate this close just outside the cone is still found rather than passing into nothing. */
export const passRescueDist = () => 90 + ASSIST.pass * 200;
/** Multiplier on the human pass direction error. */
export const passErrorMul = () => 1.45 - ASSIST.pass * 0.8;
/** Multiplier on the human shot error. */
export const shotErrorMul = () => 1.25 - ASSIST.shot * 0.7;
/** Distance kept inside the posts when aiming at one (larger = safer, less precise). */
export const shotPostInset = () => 9 + ASSIST.shot * 14;
/**
 * Angle (rad) between the stick and the goal mouth within which the shot is pulled onto the frame
 * (medium ≈ 66°: wide enough for a keyboard diagonal, so only a stick clearly pointing away follows it).
 */
export const shotWindow = () => 0.8 + ASSIST.shot * 1.0;
/** X in defence: tackle when the ball is this close (from the player's centre). */
export const tackleReach = () => 19 + ASSIST.defense * 40;
/** X in defence: committed step-in toward the ball up to this distance. */
export const lungeRange = () => 60 + ASSIST.defense * 120;
/** Standing tackle skill of the controlled player. */
export const humanTackle = () => 0.45 + ASSIST.defense * 0.33;
/** Share of the stick direction turned toward the carrier's goal-side line when closing him down. */
export const approachBlend = () => ASSIST.defense * 0.5;
