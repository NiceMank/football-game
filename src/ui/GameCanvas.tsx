import { useEffect, useRef, type MutableRefObject } from 'react';
import { FIXED_DT } from '../game/constants';
import type { Match } from '../game/match';
import { render } from '../game/renderer';
import { setCrowd } from '../game/sfx';
import { clearInputEdges, type HudSnapshot, type InputState } from '../game/types';

interface Props {
  matchRef: MutableRefObject<Match>;
  inputRef: MutableRefObject<InputState>;
  /** When true the simulation is frozen (rendering continues). */
  frozen: boolean;
  onHud: (hud: HudSnapshot) => void;
  onFinished: () => void;
}

const MAX_STEPS = 12;

/** Full-window canvas with a fixed-step simulation loop and DPR-aware rendering. */
export function GameCanvas({ matchRef, inputRef, frozen, onHud, onFinished }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frozenRef = useRef(frozen);
  const hudRef = useRef(onHud);
  const finRef = useRef(onFinished);
  frozenRef.current = frozen;
  hudRef.current = onHud;
  finRef.current = onFinished;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !ctx) return;
    let dpr = 1;
    let cssW = 0;
    let cssH = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      matchRef.current.camera.resize(cssW, cssH);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener('orientationchange', resize);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudTimer = 0;
    let finishedSent = false;
    let currentMatch = matchRef.current;

    const frame = (now: number) => {
      const m = matchRef.current;
      if (m !== currentMatch) {
        currentMatch = m;
        finishedSent = false;
        m.camera.resize(cssW, cssH);
      }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!frozenRef.current) {
        acc += dt;
        let steps = 0;
        while (acc >= FIXED_DT && steps < MAX_STEPS) {
          m.update(FIXED_DT, inputRef.current);
          clearInputEdges(inputRef.current);
          acc -= FIXED_DT;
          steps++;
        }
        if (steps === MAX_STEPS) acc = 0;
      } else {
        acc = 0;
      }
      render(ctx, m, dpr);
      hudTimer += dt;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        hudRef.current(m.hud());
        setCrowd(m.excitement, !m.demo && !frozenRef.current);
      }
      if (m.finished && m.stateTimer > 2.2 && !finishedSent && !m.demo) {
        finishedSent = true;
        finRef.current();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('orientationchange', resize);
    };
  }, [matchRef, inputRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />;
}
