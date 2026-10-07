import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

const source = await readFile(new URL('../src/game/sfx.ts', import.meta.url), 'utf8');
const { code } = await transformWithEsbuild(source, 'src/game/sfx.ts', {
  loader: 'ts', target: 'es2020', format: 'esm',
});

const calls = { oscillators: 0, starts: 0, stops: 0, scheduled: 0 };
const audioParam = () => ({
  setValueAtTime: () => { calls.scheduled++; },
  linearRampToValueAtTime: () => { calls.scheduled++; },
  exponentialRampToValueAtTime: () => { calls.scheduled++; },
});
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  constructor() { FakeAudioContext.instance = this; }
  createOscillator() {
    calls.oscillators++;
    return {
      type: 'sine', frequency: audioParam(), connect: () => {},
      start: () => { calls.starts++; }, stop: () => { calls.stops++; },
    };
  }
  createGain() { return { gain: audioParam(), connect: () => {} }; }
  resume() { return Promise.resolve(); }
}
FakeAudioContext.instance = null;
globalThis.window = { AudioContext: FakeAudioContext };
const { playSfx, unlockAudio } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

unlockAudio();
for (const name of [
  'ui', 'pause', 'switch', 'kickoff', 'pass', 'kick', 'shot', 'power', 'touch',
  'recovery', 'tackle', 'dive', 'parry', 'catch', 'post', 'goal', 'whistle',
]) playSfx(name);
playSfx('unknown-event');

assert.ok(FakeAudioContext.instance, 'sound unlock should lazily create an AudioContext');
assert.ok(calls.oscillators >= 25, 'each match cue should schedule its light oscillator layers');
assert.equal(calls.starts, calls.oscillators);
assert.equal(calls.stops, calls.oscillators);
assert.ok(calls.scheduled >= calls.oscillators * 3, 'sound envelopes should be scheduled, not left at a constant level');
console.log('Web Audio cue checks passed: pause, switch, kickoff, pass, shots, tackle, dive, parry, catch, post, goal and whistle.');
