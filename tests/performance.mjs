import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { transformWithEsbuild } from 'vite';

const source = await readFile(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const { code } = await transformWithEsbuild(source, 'src/game/engine.ts', {
  loader: 'ts', target: 'es2020', format: 'esm',
});
const { Game } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const STEP = 1 / 120;
const game = new Game();
game.start();
const input = { dx: 0, dy: 0, action: false, actionPressed: false, dash: false, switchPlayer: false };
let canvasCalls = 0;
const context = new Proxy({}, {
  get: (_target, property) => {
    if (property === Symbol.toStringTag) return 'CanvasRenderingContext2D';
    return () => { canvasCalls++; };
  },
  set: () => true,
});

const start = performance.now();
const simulatedSeconds = 30;
const updateSteps = simulatedSeconds * 120;
for (let i = 0; i < updateSteps; i++) {
  input.dx = i % 960 < 480 ? 0.65 : -0.65;
  input.dy = i % 1440 < 720 ? -0.55 : 0.35;
  input.dash = i % 360 < 48;
  game.update(STEP, input);
  if (i % 2 === 0) game.render(context); // 60 renders per simulated second.
}
const elapsedMs = performance.now() - start;

assert.ok(elapsedMs < 5000, `30s of simulation plus render smoke should stay below 5s (took ${elapsedMs.toFixed(0)}ms)`);
assert.ok(canvasCalls > 100_000, 'render smoke should exercise the Canvas draw path');
assert.equal(game.effects.length, 88, 'effect pool capacity should stay fixed');
assert.ok(game.effects.every(effect => !effect.active || Number.isFinite(effect.x + effect.y + effect.life)), 'active particles must remain finite');
assert.ok(game.camX >= 0 && game.camX <= 320 && game.camY >= 0 && game.camY <= 480, 'camera must remain bounded');
console.log(`Performance smoke passed: ${simulatedSeconds}s at 120 fixed updates / 60 Canvas renders per simulated second in ${elapsedMs.toFixed(0)}ms.`);
