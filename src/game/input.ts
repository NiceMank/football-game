import type { InputState } from './types';

/** Physical key codes (event.code), so WASD is ZQSD on AZERTY keyboards automatically. */
export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  pass: ['KeyX'],
  through: ['KeyT'],
  shoot: ['KeyC'],
  sprint: ['KeyR', 'AltLeft', 'AltRight'],
  dash: ['AltLeft', 'AltRight'],
  switchPlayer: ['ShiftRight'],
  pause: ['Escape'],
} as const;

const GAME_CODES = new Set<string>(Object.values(KEYS).flat());
const has = (codes: readonly string[], code: string) => codes.includes(code);

export interface KeyboardHandlers {
  onPause: () => void;
  /** Enter outside live play (pause, full time). Returns true when it restarted. */
  onRestart: () => boolean;
  /** Return false to ignore gameplay keys (menus, pause). */
  isActive: () => boolean;
  onActivity?: () => void;
}

/** Keyboard → InputState. Movement is recomputed from held keys; actions produce press/release edges. */
export function attachKeyboard(input: InputState, h: KeyboardHandlers) {
  const held = new Set<string>();
  const any = (codes: readonly string[]) => codes.some(c => held.has(c));

  const refresh = () => {
    const x = (any(KEYS.right) ? 1 : 0) - (any(KEYS.left) ? 1 : 0);
    const y = (any(KEYS.down) ? 1 : 0) - (any(KEYS.up) ? 1 : 0);
    const n = x !== 0 && y !== 0 ? Math.SQRT1_2 : 1;
    input.moveX = x * n;
    input.moveY = y * n;
    input.sprint = any(KEYS.sprint);
  };

  const down = (e: KeyboardEvent) => {
    if (GAME_CODES.has(e.code) || e.altKey) e.preventDefault();
    if (e.code === 'Escape') {
      if (!e.repeat) h.onPause();
      return;
    }
    if (!h.isActive()) {
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && h.onRestart()) e.preventDefault();
      return;
    }
    if (e.repeat) return;
    h.onActivity?.();
    held.add(e.code);
    input.touch = false;
    if (has(KEYS.pass, e.code)) {
      input.pass = true;
      input.passPressed = true;
    } else if (has(KEYS.through, e.code)) {
      input.throughPressed = true;
    } else if (has(KEYS.shoot, e.code)) {
      input.shoot = true;
      input.shootPressed = true;
    } else if (has(KEYS.dash, e.code)) {
      input.dashPressed = true;
    } else if (has(KEYS.switchPlayer, e.code)) {
      input.switchPressed = true;
    }
    refresh();
  };

  const up = (e: KeyboardEvent) => {
    if (GAME_CODES.has(e.code)) e.preventDefault();
    held.delete(e.code);
    if (has(KEYS.pass, e.code) && input.pass) {
      input.pass = false;
      input.passReleased = true;
    } else if (has(KEYS.shoot, e.code) && input.shoot) {
      input.shoot = false;
      input.shootReleased = true;
    }
    refresh();
  };

  const blur = () => {
    held.clear();
    input.pass = false;
    input.shoot = false;
    refresh();
  };

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}
