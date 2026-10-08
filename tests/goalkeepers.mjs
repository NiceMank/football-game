import { assert, liveMatch, loadEngine } from './helpers/load-engine.mjs';

const E = await loadEngine();
const { PITCH_L, CY, GOAL_HALF, FIXED_DT, shoot } = E;

/** Home striker shoots at the away keeper with nobody else nearby. Returns 'goal' | 'save' | 'miss'. */
function trial(difficulty, { dx, dy, aim, power, finesse = false, error = 8 }) {
  const m = liveMatch(E, difficulty);
  const s = m.home.players[4];
  for (const p of m.all) {
    if (p === s || p.isGK) continue;
    p.x = 380 + Math.random() * 80;
    p.y = 100 + Math.random() * 700;
    p.vx = p.vy = 0;
  }
  const k = m.away.keeper;
  s.x = PITCH_L - dx;
  s.y = CY + dy;
  s.vx = s.vy = 0;
  s.facing = 0;
  k.x = PITCH_L - 30;
  k.y = CY + dy * 0.12;
  k.vx = k.vy = 0;
  k.gk.perX = s.x;
  k.gk.perY = s.y;
  m.gainPossession(s);
  m.attachBall(FIXED_DT);
  m.ball.ownerLock = 0;
  // Let the keeper read the situation before the shot.
  for (let i = 0; i < 60; i++) {
    s.stop();
    m.update(FIXED_DT);
    s.x = PITCH_L - dx;
    s.y = CY + dy;
    if (m.ball.owner !== s) return null;
  }
  m.ball.owner = null;
  shoot(m, s, aim, power, { finesse, error });
  const score0 = m.home.score;
  let touched = false;
  for (let i = 0; i < 120 * 3 && m.state === 'live'; i++) {
    m.update(FIXED_DT);
    if (m.ball.savedBy === k || m.ball.owner === k || m.ball.lastTouch === k) touched = true;
  }
  if (m.home.score > score0) return 'goal';
  return touched ? 'save' : 'miss';
}

function run(name, difficulty, gen, n = 120) {
  const r = { goal: 0, save: 0, miss: 0 };
  let done = 0;
  while (done < n) {
    const o = trial(difficulty, gen());
    if (!o) continue;
    r[o]++;
    done++;
  }
  const onTarget = r.goal + r.save;
  const conv = onTarget ? r.goal / onTarget : 0;
  console.log(`  ${name} [${difficulty}]`, r, `conversion on target ${(conv * 100).toFixed(0)}%`);
  return { ...r, conv };
}

const assertUnlessStats = (c, msg) => (process.env.STATS ? console.log(c ? 'ok -' : 'WOULD FAIL -', msg) : assert(c, msg));
const side = () => (Math.random() < 0.5 ? -1 : 1);

for (const diff of ['amateur', 'pro', 'legend']) {
  const placed = run('placed powerful shot to the far post', diff, () => {
    const s = side();
    return { dx: 300 + Math.random() * 80, dy: s * (40 + Math.random() * 100), aim: CY - s * (GOAL_HALF - 14), power: 0.8, error: 14 };
  });
  const weak = run('weak central shot', diff, () => ({ dx: 280 + Math.random() * 80, dy: (Math.random() - 0.5) * 80, aim: CY + (Math.random() - 0.5) * 16, power: 0.12 }));
  const finesse = run('finesse placed shot', diff, () => {
    const s = side();
    return { dx: 240 + Math.random() * 80, dy: s * (60 + Math.random() * 80), aim: CY - s * (GOAL_HALF - 16), power: 0.5, finesse: true, error: 14 };
  });

  const long = run('powerful placed shot from 40 m', diff, () => {
    const s = side();
    return { dx: 540 + Math.random() * 60, dy: s * (30 + Math.random() * 60), aim: CY - s * (GOAL_HALF - 14), power: 0.95, error: 14 };
  });

  assertUnlessStats(placed.conv > 0.45, `${diff}: well-placed powerful shots beat the keeper often enough (${(placed.conv * 100).toFixed(0)}%)`);
  assertUnlessStats(placed.conv < 0.95, `${diff}: the keeper still saves some well-placed shots (${(placed.conv * 100).toFixed(0)}%)`);
  assertUnlessStats(weak.conv < 0.28, `${diff}: weak central shots are mostly saved (${(weak.conv * 100).toFixed(0)}%)`);
  assertUnlessStats(long.conv < placed.conv - 0.15, `${diff}: long-range efforts are saved more often than placed shots from the box edge (${(long.conv * 100).toFixed(0)}% vs ${(placed.conv * 100).toFixed(0)}%)`);
  assertUnlessStats(finesse.conv > 0.08, `${diff}: finesse shots to the corner can score (${(finesse.conv * 100).toFixed(0)}%)`);
}
