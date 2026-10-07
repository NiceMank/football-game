import { assert, liveMatch, loadEngine } from './helpers/load-engine.mjs';

const E = await loadEngine();
const { PITCH_L, PITCH_W, CY, GOAL_HALF, GOAL_H, BALL_R, KEEPER_HOLD_LIMIT, FIXED_DT, checkBall, foul } = E;

/** Puts the free ball at (x,y,z), coming from (px,py), last touched by `toucher`. */
function ballAt(m, toucher, px, py, x, y, z = 0) {
  const b = m.ball;
  b.owner = null;
  b.held = false;
  b.px = px;
  b.py = py;
  b.x = x;
  b.y = y;
  b.z = z;
  b.lastTouch = toucher;
}

// Home attacks x = PITCH_L in the first half.
{
  const m = liveMatch(E);
  ballAt(m, m.home.players[4], PITCH_L - 2, CY, PITCH_L + BALL_R + 2, CY + 10, 20);
  const homeBefore = m.home.score;
  assert(checkBall(m) && m.state === 'goal' && m.home.score === homeBefore + 1, 'ball fully over the line, inside the mouth and under the bar is a goal');
}
{
  const m = liveMatch(E);
  ballAt(m, m.home.players[4], PITCH_L - 2, CY, PITCH_L + BALL_R - 1, CY, 10);
  assert(!checkBall(m) && m.state === 'live', 'ball not wholly over the line is not a goal');
}
{
  const m = liveMatch(E);
  ballAt(m, m.home.players[4], PITCH_L - 2, CY, PITCH_L + BALL_R + 2, CY, GOAL_H + 8);
  assert(checkBall(m) && m.restart?.type === 'goalkick' && m.home.score === 0, 'over the bar after an attacker touch is a goal kick');
}
{
  const m = liveMatch(E);
  ballAt(m, m.home.players[4], PITCH_L - 2, CY + GOAL_HALF + 40, PITCH_L + BALL_R + 2, CY + GOAL_HALF + 40);
  assert(checkBall(m) && m.restart?.type === 'goalkick' && m.restart.team === m.away, 'wide of the post after an attacker touch: goal kick to the defenders');
}
{
  const m = liveMatch(E);
  ballAt(m, m.away.players[1], PITCH_L - 2, CY - GOAL_HALF - 40, PITCH_L + BALL_R + 2, CY - GOAL_HALF - 40);
  assert(checkBall(m) && m.restart?.type === 'corner' && m.restart.team === m.home && m.restart.y < CY, 'wide of the post after a defender touch: corner on the correct side');
}
{
  const m = liveMatch(E);
  ballAt(m, m.home.players[2], 600, PITCH_W - 2, 600, PITCH_W + BALL_R + 2);
  assert(checkBall(m) && m.restart?.type === 'throwin' && m.restart.team === m.away, 'ball over the touchline: throw-in to the other team');
}
{
  const m = liveMatch(E);
  ballAt(m, m.home.players[2], 600, PITCH_W - 2, 600, PITCH_W + BALL_R - 2);
  assert(!checkBall(m), 'ball on the touchline is still in play');
}
{
  const m = liveMatch(E);
  const off = m.away.players[1];
  const vic = m.home.players[4];
  vic.x = 1000;
  vic.y = 300;
  foul(m, off, vic);
  assert(m.restart?.type === 'freekick' && m.restart.team === m.home, 'foul outside the box: free kick');
}
{
  const m = liveMatch(E);
  const off = m.away.players[1];
  const vic = m.home.players[4];
  vic.x = PITCH_L - 100;
  vic.y = CY + 30;
  foul(m, off, vic);
  assert(m.restart?.type === 'penalty' && m.restart.team === m.home, 'foul inside the box: penalty');
}

// Restart cycle: every restart type is set up, taken and play resumes.
for (const type of ['throwin', 'corner', 'goalkick', 'freekick', 'penalty']) {
  const m = liveMatch(E);
  const coords = { throwin: [700, -4], corner: [PITCH_L - 4, 4], goalkick: [60, CY - 45], freekick: [900, 400], penalty: [PITCH_L - 165, CY] }[type];
  const team = type === 'goalkick' ? m.home : m.home;
  E.awardRestart(m, type, team, coords[0], coords[1]);
  let n = 0;
  let sawTaking = false;
  // Human taker: auto-takes after a timeout when no input arrives.
  while (m.state !== 'live' && n++ < 120 * 15) {
    m.update(FIXED_DT);
    if (m.state === 'taking') sawTaking = true;
  }
  assert(sawTaking && m.state === 'live' && m.restart === null, `${type} is set up, taken and play resumes`);
}

// IFAB 2026/27: keeper holding the ball longer than 8 seconds -> corner to the opponents.
function holdUntilStop(m, k, careless) {
  m.keeperCatch(k);
  k.gk.releaseBy = careless ? 99 : 5.5;
  if (careless) k.gk.distributeTimer = 99;
  else k.gk.distributeTimer = Math.min(k.gk.distributeTimer, 3);
  let n = 0;
  while (m.state === 'live' && m.ball.owner === k && n++ < 120 * 12) m.update(FIXED_DT);
  return n / 120;
}
{
  const m = liveMatch(E);
  const t = holdUntilStop(m, m.away.keeper, true);
  assert(m.restart?.type === 'corner' && m.restart.team === m.home, 'AI keeper holding the ball over 8 s concedes a corner');
  assert(t > KEEPER_HOLD_LIMIT - 0.05 && t < KEEPER_HOLD_LIMIT + 0.1, `the corner is given at ${KEEPER_HOLD_LIMIT}s (${t.toFixed(2)}s)`);
}
{
  const m = liveMatch(E);
  const t = holdUntilStop(m, m.away.keeper, false);
  assert(m.state === 'live' && m.ball.owner !== m.away.keeper && t < 6, `a composed AI keeper releases in time (${t.toFixed(2)}s)`);
}
{
  const m = liveMatch(E);
  const t = holdUntilStop(m, m.home.keeper, false);
  assert(m.restart?.type === 'corner' && m.restart.team === m.away && t > 7.9, 'human keeper who never releases concedes a corner after 8 s');
}
{
  const m = liveMatch(E);
  const k = m.home.keeper;
  m.keeperCatch(k);
  const input = E.createInput();
  for (let i = 0; i < 120; i++) m.update(FIXED_DT, input);
  assert(m.ball.owner === k && m.ball.held && m.hud().keeperHuman, 'human keeper waits for the player and the HUD shows the release prompt');
  input.pass = true;
  input.passPressed = true;
  m.update(FIXED_DT, input);
  E.clearInputEdges(input);
  input.pass = false;
  input.passReleased = true;
  m.update(FIXED_DT, input);
  assert(m.ball.owner === null && (m.ball.kind === 'throw' || m.ball.kind === 'clear'), `X releases the human keeper's ball (${m.ball.kind})`);
}
