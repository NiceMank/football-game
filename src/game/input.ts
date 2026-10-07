import type { InputState } from './types';

/** Physical key codes (event.code), so WASD is ZQSD on AZERTY keyboards automatically. */
export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  pass: ['KeyX'],
  shoot: ['KeyC'],
  dash: ['AltLeft', 'AltRight'],
  switchPlayer: ['ShiftRight'],
  pause: ['Escape'],
  restart: ['KeyR'],
} as const;

const GAME_CODES = new Set<string>(Object.values(KEYS).flat());

export interface KeyboardHandlers {
  onPause: () => void;
  onRestart: () => void;
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
    input.sprint = any(KEYS.dash);
  };

  const down = (e: KeyboardEvent) => {
    if (GAME_CODES.has(e.code) || e.altKey) e.preventDefault();
    if (e.code === 'Escape') {
      if (!e.repeat) h.onPause();
      return;
    }
    if (!h.isActive()) return;
    if (e.repeat) return;
    h.onActivity?.();
    if (e.code === 'KeyR') {
      h.onRestart();
      return;
    }
    held.add(e.code);
    input.touch = false;
    if ((KEYS.pass as readonly string[]).includes(e.code)) {
      input.pass = true;
      input.passPressed = true;
    } else if ((KEYS.shoot as readonly string[]).includes(e.code)) {
      input.shoot = true;
      input.shootPressed = true;
    } else if ((KEYS.dash as readonly string[]).includes(e.code)) {
      input.dashPressed = true;
    } else if (e.code === 'ShiftRight') {
      input.switchPressed = true;
    }
    refresh();
  };

  const up = (e: KeyboardEvent) => {
    if (GAME_CODES.has(e.code)) e.preventDefault();
    held.delete(e.code);
    if ((KEYS.pass as readonly string[]).includes(e.code) && input.pass) {
      input.pass = false;
      input.passReleased = true;
    } else if ((KEYS.shoot as readonly string[]).includes(e.code) && input.shoot) {
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
