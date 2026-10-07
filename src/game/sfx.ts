// Procedural match audio on Web Audio: no assets. Everything fails silently when audio is unavailable.
import type { SfxName } from './types';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let crowdGain: GainNode | null = null;
let crowdFilter: BiquadFilterNode | null = null;
let muted = false;

function audio() {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  if (!ctx) {
    ctx = new window.AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

function noise(c: AudioContext) {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

export function unlockAudio() {
  try {
    const c = audio();
    if (!c || crowdGain || !master) return;
    // Continuous crowd bed: filtered noise whose level follows the match intensity.
    const src = c.createBufferSource();
    src.buffer = noise(c);
    src.loop = true;
    crowdFilter = c.createBiquadFilter();
    crowdFilter.type = 'bandpass';
    crowdFilter.frequency.value = 700;
    crowdFilter.Q.value = 0.6;
    crowdGain = c.createGain();
    crowdGain.gain.value = 0;
    src.connect(crowdFilter);
    crowdFilter.connect(crowdGain);
    crowdGain.connect(master);
    src.start();
  } catch {
    /* audio is optional */
  }
}

export function setMuted(value: boolean) {
  muted = value;
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : 0.9, ctx.currentTime, 0.05);
}

/** 0..1 — crowd noise rises when the ball nears a goal and after chances. */
export function setCrowd(intensity: number, active: boolean) {
  if (!ctx || !crowdGain || !crowdFilter) return;
  const level = active ? 0.012 + intensity * 0.05 : 0.006;
  crowdGain.gain.setTargetAtTime(level, ctx.currentTime, 0.4);
  crowdFilter.frequency.setTargetAtTime(550 + intensity * 600, ctx.currentTime, 0.5);
}

function tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
  const c = audio();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime + delay;
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), t);
  if (Math.abs(f0 - f1) > 1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function burst(dur: number, freq: number, vol: number, q = 0.8, delay = 0) {
  const c = audio();
  if (!c || !master) return;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  const t = c.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.08, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

function whistle(dur: number, delay = 0) {
  tone(2650, 2550, dur, 'sine', 0.05, delay);
  tone(2700, 2600, dur, 'triangle', 0.02, delay);
}

export function playSfx(name: SfxName) {
  if (muted) return;
  try {
    switch (name) {
      case 'ui': tone(620, 760, 0.06, 'sine', 0.04); break;
      case 'pause': tone(520, 310, 0.1, 'sine', 0.045); break;
      case 'switch': tone(700, 900, 0.05, 'triangle', 0.03); break;
      case 'whistle': whistle(0.22); break;
      case 'whistleLong': whistle(0.25); whistle(0.25, 0.32); whistle(0.6, 0.64); break;
      case 'foul': whistle(0.16); whistle(0.3, 0.2); break;
      case 'kick':
      case 'pass':
        tone(190, 120, 0.06, 'triangle', 0.07);
        burst(0.04, 1800, 0.05, 1.2);
        break;
      case 'shot':
        tone(150, 80, 0.12, 'triangle', 0.1);
        burst(0.06, 1500, 0.08, 1);
        break;
      case 'power':
        tone(120, 55, 0.16, 'triangle', 0.13);
        burst(0.09, 1200, 0.12, 0.9);
        break;
      case 'touch': tone(260, 190, 0.045, 'triangle', 0.045); break;
      case 'tackle':
        tone(110, 70, 0.1, 'square', 0.04);
        burst(0.08, 600, 0.06);
        break;
      case 'throw': burst(0.08, 900, 0.04); break;
      case 'dive': burst(0.18, 400, 0.05, 0.5); break;
      case 'parry':
        tone(260, 140, 0.1, 'triangle', 0.08);
        burst(0.1, 900, 0.06);
        burst(0.9, 600, 0.06, 0.5, 0.05);
        break;
      case 'catch': tone(170, 110, 0.09, 'triangle', 0.07); break;
      case 'post':
        tone(1100, 900, 0.35, 'sine', 0.05);
        tone(1650, 1500, 0.25, 'sine', 0.025);
        burst(0.9, 600, 0.07, 0.5, 0.05);
        break;
      case 'net': burst(0.25, 2200, 0.05, 0.7); break;
      case 'ooh': burst(1.1, 500, 0.08, 0.5); break;
      case 'goal':
        burst(2.8, 700, 0.18, 0.4);
        burst(2.4, 1300, 0.08, 0.6, 0.1);
        tone(523, 659, 0.16, 'triangle', 0.035, 0.1);
        tone(659, 784, 0.2, 'triangle', 0.035, 0.24);
        tone(784, 1046, 0.32, 'triangle', 0.035, 0.4);
        break;
      default: break;
    }
  } catch {
    /* ignore */
  }
}
