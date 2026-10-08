import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { TILT } from '../game/constants';
import type { HudSnapshot, InputState } from '../game/types';

interface Props {
  inputRef: MutableRefObject<InputState>;
  hud: HudSnapshot;
}

const JOY_RADIUS = 58;
const DEAD_ZONE = 0.14;
/** Below SWIPE_MIN px a release counts as a tap, so a thumb wobble never becomes a directed kick. */
const SWIPE_MIN = 36;
const SWIPE_FULL = 175;

function swipePowerOf(len: number) {
  return Math.min(1, Math.max(0.15, 0.15 + (0.85 * (len - SWIPE_MIN)) / (SWIPE_FULL - SWIPE_MIN)));
}

interface Swipe {
  id: number;
  kind: 'pass' | 'shoot';
  x0: number;
  y0: number;
  x: number;
  y: number;
}

/** Landscape mobile controls: floating analog stick on the left, swipe-capable action buttons on the right. */
export function TouchControls({ inputRef, hud }: Props) {
  const joyId = useRef<number | null>(null);
  const joyBase = useRef({ x: 0, y: 0 });
  const baseEl = useRef<HTMLDivElement>(null);
  const knobEl = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<Swipe | null>(null);
  const [swipe, setSwipe] = useState<Swipe | null>(null);
  const sprintId = useRef<number | null>(null);

  useEffect(() => () => {
    const input = inputRef.current;
    input.moveX = 0;
    input.moveY = 0;
    input.sprint = false;
  }, [inputRef]);

  const placeJoystick = (x: number, y: number, kx: number, ky: number, active: boolean) => {
    const base = baseEl.current;
    const knob = knobEl.current;
    if (!base || !knob) return;
    base.style.transform = `translate(${x - JOY_RADIUS}px, ${y - JOY_RADIUS}px)`;
    base.style.opacity = active ? '1' : '0.45';
    knob.style.transform = `translate(${x + kx - 26}px, ${y + ky - 26}px)`;
    knob.style.opacity = active ? '1' : '0.5';
  };

  const restJoystick = () => {
    const h = window.innerHeight;
    placeJoystick(Math.max(96, window.innerWidth * 0.12), h - Math.max(96, h * 0.26), 0, 0, false);
  };

  useEffect(() => {
    restJoystick();
    window.addEventListener('resize', restJoystick);
    return () => window.removeEventListener('resize', restJoystick);
  }, []);

  const joyDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (joyId.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    joyId.current = e.pointerId;
    const x = Math.max(JOY_RADIUS + 8, e.clientX);
    const y = Math.min(window.innerHeight - JOY_RADIUS - 8, Math.max(JOY_RADIUS + 60, e.clientY));
    joyBase.current = { x, y };
    placeJoystick(x, y, 0, 0, true);
  };

  const joyMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (joyId.current !== e.pointerId) return;
    const { x, y } = joyBase.current;
    let dx = e.clientX - x;
    let dy = e.clientY - y;
    const d = Math.hypot(dx, dy);
    if (d > JOY_RADIUS) {
      dx = (dx / d) * JOY_RADIUS;
      dy = (dy / d) * JOY_RADIUS;
    }
    placeJoystick(x, y, dx, dy, true);
    const mag = Math.min(1, d / JOY_RADIUS);
    const input = inputRef.current;
    if (mag < DEAD_ZONE) {
      input.moveX = 0;
      input.moveY = 0;
      return;
    }
    // Rescale outside the dead zone so small deflections still give fine control.
    const out = (mag - DEAD_ZONE) / (1 - DEAD_ZONE);
    input.moveX = (dx / (d || 1)) * out;
    input.moveY = (dy / (d || 1)) * out;
  };

  const joyUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (joyId.current !== e.pointerId) return;
    joyId.current = null;
    inputRef.current.moveX = 0;
    inputRef.current.moveY = 0;
    restJoystick();
  };

  const actionDown = (kind: 'pass' | 'shoot') => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (swipeRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const s: Swipe = { id: e.pointerId, kind, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    swipeRef.current = s;
    setSwipe(s);
    const input = inputRef.current;
    input.touch = true;
    if (kind === 'pass') {
      input.pass = true;
      input.passPressed = true;
    } else {
      input.shoot = true;
      input.shootPressed = true;
    }
  };

  const actionMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = swipeRef.current;
    if (!s || s.id !== e.pointerId) return;
    s.x = e.clientX;
    s.y = e.clientY;
    setSwipe({ ...s });
  };

  const actionUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = swipeRef.current;
    if (!s || s.id !== e.pointerId) return;
    swipeRef.current = null;
    setSwipe(null);
    const input = inputRef.current;
    const dx = s.x - s.x0;
    const dy = s.y - s.y0;
    const len = Math.hypot(dx, dy);
    let aim = null;
    if (len >= SWIPE_MIN && e.type !== 'pointercancel') {
      // Screen → world: the ground plane is squashed vertically by TILT.
      const wx = dx;
      const wy = dy / TILT;
      const n = Math.hypot(wx, wy) || 1;
      aim = { dx: wx / n, dy: wy / n, power: swipePowerOf(len) };
    }
    if (s.kind === 'pass') {
      input.pass = false;
      input.passReleased = true;
      input.passSwipe = aim;
    } else {
      input.shoot = false;
      input.shootReleased = true;
      input.shootSwipe = aim;
    }
  };

  const sprintDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    sprintId.current = e.pointerId;
    inputRef.current.sprint = true;
    inputRef.current.dashPressed = true;
  };
  const sprintUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (sprintId.current !== e.pointerId) return;
    sprintId.current = null;
    inputRef.current.sprint = false;
  };
  const switchDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    inputRef.current.switchPressed = true;
  };
  const throughDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    inputRef.current.touch = true;
    inputRef.current.throughPressed = true;
  };

  const defending = hud.defending;
  const corner = hud.humanTaking && hud.restartLabel === 'corner';
  const throwin = hud.humanTaking && hud.restartLabel === 'throwin';
  const passLabel = defending ? 'TACLE' : throwin ? 'TOUCHE' : 'PASSE';
  const shootLabel = defending ? 'GLISSÉ' : corner ? 'CENTRE' : throwin ? 'LONGUE' : 'TIR';

  const swipeLen = swipe ? Math.hypot(swipe.x - swipe.x0, swipe.y - swipe.y0) : 0;
  const swipePower = swipeLen >= SWIPE_MIN ? swipePowerOf(swipeLen) : 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none" style={{ touchAction: 'none' }}>
      <div
        className="pointer-events-auto absolute bottom-0 left-0 top-16 w-[46%]"
        style={{ touchAction: 'none' }}
        onPointerDown={joyDown}
        onPointerMove={joyMove}
        onPointerUp={joyUp}
        onPointerCancel={joyUp}
        aria-label="Joystick de déplacement"
      />
      <div ref={baseEl} className="pointer-events-none absolute left-0 top-0 h-[116px] w-[116px] rounded-full border-2 border-white/30 bg-slate-950/25 shadow-[inset_0_0_24px_rgba(255,255,255,0.08)] transition-opacity">
        <div className="absolute inset-[30%] rounded-full border border-white/15" />
      </div>
      <div ref={knobEl} className="pointer-events-none absolute left-0 top-0 h-[52px] w-[52px] rounded-full border-2 border-white/80 bg-gradient-to-b from-white/70 to-slate-300/60 shadow-[0_4px_14px_rgba(0,0,0,0.45)]" />

      <div className="absolute" style={{ right: 'max(14px, env(safe-area-inset-right))', bottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="relative h-[210px] w-[250px]">
          <ActionButton
            label={shootLabel}
            sub={defending ? '' : 'glisser = viser'}
            className="bottom-1 right-1 h-[92px] w-[92px] border-amber-100 bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950"
            onPointerDown={actionDown('shoot')}
            onPointerMove={actionMove}
            onPointerUp={actionUp}
            active={swipe?.kind === 'shoot'}
          />
          <ActionButton
            label={passLabel}
            sub={defending ? '' : 'glisser = orienter'}
            className="bottom-[14px] right-[106px] h-[80px] w-[80px] border-sky-100 bg-gradient-to-b from-sky-400 to-sky-600 text-white"
            onPointerDown={actionDown('pass')}
            onPointerMove={actionMove}
            onPointerUp={actionUp}
            active={swipe?.kind === 'pass'}
          />
          <button
            type="button"
            className="pointer-events-auto absolute bottom-[100px] right-[118px] grid h-[60px] w-[60px] place-items-center rounded-full border-2 border-emerald-100/80 bg-emerald-500/85 text-[10px] font-black italic text-white shadow-lg active:scale-95"
            style={{ touchAction: 'none' }}
            onPointerDown={sprintDown}
            onPointerUp={sprintUp}
            onPointerCancel={sprintUp}
          >
            SPRINT
          </button>
          <button
            type="button"
            className="pointer-events-auto absolute bottom-[112px] right-[22px] grid h-[54px] w-[54px] place-items-center rounded-2xl border-2 border-white/40 bg-slate-900/85 text-[10px] font-black italic text-white shadow-lg active:scale-95"
            style={{ touchAction: 'none' }}
            onPointerDown={switchDown}
          >
            SWITCH
          </button>
          {!defending && !hud.humanTaking && (
            <button
              type="button"
              className="pointer-events-auto absolute bottom-[22px] right-[194px] grid h-[54px] w-[54px] place-items-center rounded-full border-2 border-violet-100/80 bg-violet-500/85 text-center text-[9px] font-black italic leading-tight text-white shadow-lg active:scale-95"
              style={{ touchAction: 'none' }}
              onPointerDown={throughDown}
              aria-label="Passe en profondeur"
            >
              PROF.
            </button>
          )}
        </div>
      </div>

      {swipe && swipeLen >= SWIPE_MIN && (
        <svg className="pointer-events-none fixed inset-0 h-full w-full">
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill={swipe.kind === 'shoot' ? '#fbbf24' : '#7dd3fc'} />
            </marker>
          </defs>
          <line
            x1={swipe.x0}
            y1={swipe.y0}
            x2={swipe.x}
            y2={swipe.y}
            stroke={swipe.kind === 'shoot' ? '#fbbf24' : '#7dd3fc'}
            strokeWidth={4 + swipePower * 5}
            strokeLinecap="round"
            markerEnd="url(#arrowhead)"
            opacity={0.9}
          />
          <text x={swipe.x + 12} y={swipe.y - 12} fill="#fff" fontSize="13" fontWeight="900" fontStyle="italic">
            {Math.round(swipePower * 100)}%
          </text>
        </svg>
      )}
    </div>
  );
}

interface ButtonProps {
  label: string;
  sub: string;
  className: string;
  active: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}

function ActionButton({ label, sub, className, active, onPointerDown, onPointerMove, onPointerUp }: ButtonProps) {
  return (
    <button
      type="button"
      className={`pointer-events-auto absolute grid place-items-center rounded-full border-2 font-black italic leading-none shadow-[0_6px_20px_rgba(0,0,0,0.45)] transition-transform ${active ? 'scale-95 ring-4 ring-white/40' : ''} ${className}`}
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className="text-center">
        <span className="block text-[15px]">{label}</span>
        {sub && <span className="mt-1 block text-[7px] font-bold not-italic opacity-70">{sub}</span>}
      </span>
    </button>
  );
}
