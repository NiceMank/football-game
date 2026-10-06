let ctx: AudioContext | null = null;
const get = () => {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};
export const unlockAudio = () => { try { get(); } catch {} };

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.15, slide = 0) {
  try {
    const c = get(); const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
  } catch {}
}
function noise(dur: number, vol = 0.2) {
  try {
    const c = get(); const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(); s.buffer = buf; const g = c.createGain(); g.gain.value = vol;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    s.connect(f).connect(g).connect(c.destination); s.start();
  } catch {}
}

export function playSfx(name: string) {
  switch (name) {
    case 'kick': noise(0.12, 0.35); tone(140, 0.12, 'sine', 0.3, -80); break;
    case 'touch': tone(300, 0.05, 'triangle', 0.08); break;
    case 'dash': noise(0.12, 0.12); tone(520, 0.12, 'sawtooth', 0.1, -280); break;
    case 'dodge': tone(700, 0.1, 'triangle', 0.12, 260); tone(1050, 0.09, 'sine', 0.08, 120); break;
    case 'power': noise(0.35, 0.2); tone(180, 0.35, 'sawtooth', 0.16, 520); setTimeout(() => tone(880, 0.18, 'square', 0.1), 60); break;
    case 'post': tone(900, 0.3, 'triangle', 0.2, -300); tone(1350, 0.25, 'sine', 0.1, -400); break;
    case 'save': noise(0.15, 0.25); tone(220, 0.2, 'sawtooth', 0.12, -120); break;
    case 'tackle': noise(0.2, 0.3); tone(90, 0.25, 'square', 0.15, -50); break;
    case 'goal':
      noise(0.6, 0.15);
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'square', 0.12), i * 90));
      break;
    case 'whistle': tone(2200, 0.5, 'square', 0.08); setTimeout(() => tone(2200, 0.5, 'square', 0.08), 550); setTimeout(() => tone(2200, 0.9, 'square', 0.08), 1100); break;
    case 'ui': tone(600, 0.06, 'square', 0.06); break;
  }
}
