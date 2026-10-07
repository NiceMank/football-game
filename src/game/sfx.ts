// Lightweight procedural match cues built on Web Audio; no audio assets or heavy dependencies.
let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  if (!audioContext) audioContext = new window.AudioContext();
  if (audioContext.state === 'suspended') void audioContext.resume().catch(() => undefined);
  return audioContext;
}

export function unlockAudio() {
  try { getAudioContext(); } catch { /* Audio is optional; gameplay must continue silently. */ }
}

function tone(startFrequency: number, endFrequency: number, duration: number, type: OscillatorType, volume: number, delay = 0) {
  const context = getAudioContext();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime + delay;
  const end = start + duration;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(1, startFrequency), start);
  if (Math.abs(startFrequency - endFrequency) > 1) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), end);
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.012, duration * 0.22));
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.012);
}

export function playSfx(name: string) {
  try {
    switch (name) {
      case 'ui': tone(580, 720, 0.055, 'sine', 0.035); break;
      case 'pause': tone(520, 310, 0.095, 'sine', 0.045); break;
      case 'switch':
        tone(620, 760, 0.045, 'sine', 0.035);
        tone(780, 920, 0.055, 'triangle', 0.025, 0.035);
        break;
      case 'kickoff':
        tone(440, 560, 0.09, 'triangle', 0.035);
        tone(610, 760, 0.12, 'sine', 0.025, 0.075);
        break;
      case 'pass':
      case 'kick':
        tone(210, 150, 0.065, 'triangle', 0.055);
        tone(680, 460, 0.035, 'sine', 0.018, 0.012);
        break;
      case 'shot':
        tone(150, 95, 0.13, 'triangle', 0.075);
        tone(360, 240, 0.085, 'sawtooth', 0.025, 0.008);
        break;
      case 'power':
        tone(105, 62, 0.18, 'triangle', 0.09);
        tone(300, 880, 0.19, 'sawtooth', 0.035, 0.012);
        break;
      case 'touch':
      case 'recovery':
        tone(310, 230, 0.055, 'triangle', 0.045);
        break;
      case 'tackle':
        tone(105, 72, 0.11, 'square', 0.045);
        tone(190, 115, 0.085, 'triangle', 0.035, 0.018);
        break;
      case 'dive': tone(470, 170, 0.14, 'sine', 0.028); break;
      case 'parry':
        tone(270, 150, 0.11, 'triangle', 0.06);
        tone(860, 430, 0.14, 'sine', 0.035, 0.015);
        break;
      case 'catch':
        tone(190, 120, 0.10, 'triangle', 0.055);
        tone(520, 400, 0.08, 'sine', 0.025, 0.025);
        break;
      case 'post':
        tone(980, 560, 0.2, 'sine', 0.04);
        tone(420, 330, 0.12, 'triangle', 0.022, 0.025);
        break;
      case 'goal':
        tone(440, 590, 0.16, 'triangle', 0.04);
        tone(590, 760, 0.19, 'triangle', 0.045, 0.11);
        tone(760, 980, 0.24, 'sine', 0.038, 0.24);
        break;
      case 'whistle':
        tone(1450, 1280, 0.16, 'sine', 0.038);
        tone(1450, 1280, 0.16, 'sine', 0.038, 0.22);
        break;
      default: break;
    }
  } catch { /* Ignore unavailable audio devices and suspended contexts. */ }
}
