import { assert, loadEngine } from './helpers/load-engine.mjs';

const E = await loadEngine();
const { Match, FIXED_DT } = E;

function play(opts) {
  const m = new Match({ minutes: 5, ...opts });
  const events = {};
  m.sfx = n => (events[n] = (events[n] ?? 0) + 1);
  m.start();
  let halftime = false;
  let swapped = false;
  let steps = 0;
  const t0 = performance.now();
  while (!m.finished && steps < 120 * 60 * 9) {
    m.update(FIXED_DT);
    if (m.state === 'halftime') halftime = true;
    if (halftime && m.home.dir === -1) swapped = true;
    steps++;
  }
  const ms = (performance.now() - t0) / steps;
  for (let i = 0; i < 300; i++) m.update(FIXED_DT);
  return { m, events, halftime, swapped, ms };
}

const totals = { goals: 0, shots: 0, passes: 0, completed: 0, plans: {}, restarts: {}, possession: 0 };
let worstMs = 0;
const N = 6;
for (let i = 0; i < N; i++) {
  const { m, halftime, swapped, ms } = play({ difficulty: 'pro', demo: true });
  assert(m.finished && m.state === 'fulltime' && m.clockText() === '90:00', `demo match ${i + 1} reaches full time (${m.home.score}-${m.away.score})`);
  assert(halftime && swapped, `demo match ${i + 1}: half-time happens and the teams swap ends`);
  worstMs = Math.max(worstMs, ms);
  totals.goals += m.home.score + m.away.score;
  for (const t of m.teams) {
    totals.shots += t.stats.shots;
    totals.passes += t.stats.passes;
    totals.completed += t.stats.passesCompleted;
  }
  for (const [k, v] of Object.entries(m.planCount)) totals.plans[k] = (totals.plans[k] ?? 0) + v;
  for (const [k, v] of Object.entries(m.restartCount)) totals.restarts[k] = (totals.restarts[k] ?? 0) + v;
  totals.possession += m.possessionChanges;
}
console.log('  totals over', N, 'matches:', totals);

assert(totals.goals / N >= 1 && totals.goals / N <= 8, `goals per match are in a football range (${(totals.goals / N).toFixed(1)})`);
assert(totals.shots / N >= 5, `teams create chances (${(totals.shots / N).toFixed(1)} shots per match)`);
const comp = totals.completed / totals.passes;
assert(comp > 0.65 && comp < 0.97, `pass completion is realistic (${(comp * 100).toFixed(0)}%)`);
assert(Object.values(totals.plans).filter(v => v > 0).length === 4, 'all four attacking plans are used (build, direct, wing, counter)');
assert(totals.restarts.kickoff > 0 && totals.restarts.goalkick > 0, 'kickoffs and goal kicks occur in normal play');
const kinds = Object.entries(totals.restarts).filter(([, v]) => v > 0).length;
assert(kinds >= 4, `restarts are varied in normal play (${kinds} of 6 types)`);
const pc = totals.possession / N;
assert(pc > 20 && pc < 140, `possession changes hands at a readable rhythm (${pc.toFixed(0)} per match)`);
assert(worstMs < 0.2, `simulation step is cheap (${worstMs.toFixed(4)} ms per 1/120 s step)`);

for (const difficulty of ['amateur', 'pro', 'legend']) {
  const { m } = play({ difficulty });
  assert(m.finished, `human vs AI (${difficulty}) with no input reaches full time (${m.home.score}-${m.away.score})`);
  const hud = m.hud();
  assert(hud.clock === '90:00' && hud.half === 2 && typeof hud.possessionHome === 'number', `HUD snapshot is consistent at full time (${difficulty})`);
}
