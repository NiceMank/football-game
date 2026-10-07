// Small Web Audio cues used by the phase-0 prototype.
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

function tone(frequency: number, duration: number, type: OscillatorType, volume: number) {
  const context = getAudioContext();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const endTime = context.currentTime + duration;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, endTime);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(endTime);
}

export function playSfx(name: string) {
  try {
    switch (name) {
      case 'ui': tone(580, 0.055, 'sine', 0.055); break;
      case 'touch': tone(330, 0.06, 'triangle', 0.07); break;
      case 'tackle': tone(115, 0.12, 'square', 0.07); break;
      case 'kick': tone(215, 0.075, 'triangle', 0.075); break;
      case 'power': tone(520, 0.11, 'sawtooth', 0.07); break;
      case 'goal': tone(740, 0.16, 'triangle', 0.08); break;
      default: break;
    }
  } catch { /* Ignore unavailable audio devices and suspended contexts. */ }
}
