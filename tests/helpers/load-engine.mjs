import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const GAME_DIR = fileURLToPath(new URL('../../src/game/', import.meta.url));

const ENTRY = `
export * from './index';
export { checkBall, awardRestart, foul } from './rules';
export { shoot, passTo } from './actions';
export { attachKeyboard, KEYS } from './input';
export { bestSwitch, choosePassTarget } from './human';
`;

/** Bundles the TypeScript engine (plus a few internals used by tests) into an importable ES module for Node. */
export async function loadEngine() {
  const out = await build({
    stdin: { contents: ENTRY, resolveDir: GAME_DIR, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2020',
  });
  const code = out.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

/** Creates a human-vs-AI match and advances it until the kickoff is taken and play is live. */
export function liveMatch(E, difficulty = 'pro') {
  const m = new E.Match({ difficulty, minutes: 5 });
  m.start();
  let n = 0;
  while (m.state !== 'live' && n++ < 2000) m.update(E.FIXED_DT);
  if (m.state !== 'live') throw new Error('match never went live');
  return m;
}

export function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log('ok -', msg);
}
