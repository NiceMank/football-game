import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

/** Bundles the TypeScript engine (all modules) into an importable ES module for Node tests. */
export async function loadEngine() {
  const entry = fileURLToPath(new URL('../../src/game/index.ts', import.meta.url));
  const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2020' });
  const code = out.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
