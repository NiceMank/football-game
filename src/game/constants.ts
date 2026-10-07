// World units: the pitch is landscape, x runs goal-to-goal, y runs touchline-to-touchline.
export const PITCH_L = 1500;
export const PITCH_W = 900;
export const CX = PITCH_L / 2;
export const CY = PITCH_W / 2;

export const GOAL_HALF = 80;
export const GOAL_H = 66;
export const GOAL_DEPTH = 44;
export const POST_R = 4;

export const BOX_DEPTH = 235;
export const BOX_HALF = 240;
export const SMALL_BOX_DEPTH = 80;
export const SMALL_BOX_HALF = 135;
export const PEN_SPOT = 165;
export const CENTER_R = 115;
export const CORNER_R = 18;

export const PLAYER_R = 11;
export const PLAYER_H = 38;
export const BALL_R = 6;

/** Vertical squash of the ground plane: gives the slightly oblique broadcast feel. */
export const TILT = 0.74;
export const GRAVITY = 760;

export const GROUND_K = 1.05;
export const ROLL_DECEL = 24;
export const AIR_K = 0.16;

export const RUN_SPEED = 205;
export const SPRINT_MULT = 1.38;
export const DRIBBLE_MULT = 0.93;
export const ACCEL = 1150;
export const CONTROL_DIST = PLAYER_R + BALL_R + 7;

export const FIXED_DT = 1 / 120;
export const KEEPER_HOLD_LIMIT = 8;
export const FREE_KICK_DISTANCE = 90;
