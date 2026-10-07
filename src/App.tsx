import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { Game, H, W, type HudState, type Input, type Phase } from './game/engine';
import { playSfx, unlockAudio } from './game/sfx';

interface JoystickTouch {
  id: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
}

const FIXED_STEP = 1 / 120;
const JOYSTICK_RADIUS = 50;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game] = useState(() => new Game());
  const inputRef = useRef<Input>({ dx: 0, dy: 0 });
  const keysRef = useRef<Record<string, boolean>>({});
  const joystickRef = useRef<JoystickTouch | null>(null);

  const [phase, setPhase] = useState<Phase>('start');
  const [hud, setHud] = useState<HudState>(() => game.hud());
  const [joystickView, setJoystickView] = useState<JoystickTouch | null>(null);
  const [touchMode, setTouchMode] = useState(false);
  const [muted, setMuted] = useState(false);

  const clearInput = useCallback(() => {
    inputRef.current.dx = 0;
    inputRef.current.dy = 0;
    keysRef.current = {};
    joystickRef.current = null;
    setJoystickView(null);
  }, []);

  const startGame = useCallback(() => {
    unlockAudio();
    if (!muted) playSfx('ui');
    clearInput();
    game.start();
    setPhase('playing');
  }, [clearInput, muted]);

  const togglePause = useCallback(() => {
    game.togglePause();
    if (game.phase === 'paused') clearInput();
    setPhase(game.phase);
    if (!muted) playSfx('ui');
  }, [clearInput, muted]);

  useEffect(() => {
    game.sfx = (name) => {
      if (!muted) playSfx(name);
    };
  }, [muted]);

  // Canvas loop: fixed-step simulation, high-DPI drawing, and a low-frequency HUD snapshot.
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * pixelRatio;
    canvas.height = H * pixelRatio;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    let animationFrame = 0;
    let previousTime = performance.now();
    let accumulator = 0;
    let hudElapsed = 0;

    const frame = (now: number) => {
      let frameDt = Math.min((now - previousTime) / 1000, 0.1);
      previousTime = now;
      accumulator += frameDt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 18) {
        game.update(FIXED_STEP, inputRef.current);
        accumulator -= FIXED_STEP;
        steps++;
      }
      game.render(context);
      hudElapsed += frameDt;
      if (hudElapsed >= 0.1) {
        hudElapsed = 0;
        setHud(game.hud());
      }
      animationFrame = requestAnimationFrame(frame);
    };

    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  // Keyboard controls only produce a direction vector. Gameplay stays in the engine.
  useEffect(() => {
    const refreshKeyboardVector = () => {
      const keys = keysRef.current;
      const dx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA || keys.KeyQ ? 1 : 0);
      const dy = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW || keys.KeyZ ? 1 : 0);
      if (!joystickRef.current) {
        inputRef.current.dx = dx;
        inputRef.current.dy = dy;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      if (event.repeat) return;
      if (event.code === 'Escape' || event.code === 'KeyP') {
        if (game.phase === 'playing' || game.phase === 'paused') togglePause();
        return;
      }
      if ((game.phase === 'start' || game.phase === 'paused') && (event.code === 'Enter' || event.code === 'Space')) {
        if (game.phase === 'start') startGame();
        else togglePause();
        return;
      }
      if (event.code === 'KeyR') { startGame(); return; }
      if (game.phase !== 'playing') return;
      keysRef.current[event.code] = true;
      refreshKeyboardVector();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current[event.code] = false;
      refreshKeyboardVector();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [startGame, togglePause]);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    setTouchMode(true);
    unlockAudio();
    const bounds = canvasRef.current?.getBoundingClientRect();
    const midpoint = bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2;
    for (const touch of Array.from(event.changedTouches)) {
      if (touch.clientX >= midpoint || joystickRef.current) continue;
      const next: JoystickTouch = {
        id: touch.identifier,
        originX: touch.clientX,
        originY: touch.clientY,
        x: touch.clientX,
        y: touch.clientY,
      };
      joystickRef.current = next;
      setJoystickView(next);
    }
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const activeTouch = joystickRef.current;
    if (!activeTouch) return;
    for (const touch of Array.from(event.changedTouches)) {
      if (touch.identifier !== activeTouch.id) continue;
      const dx = touch.clientX - activeTouch.originX;
      const dy = touch.clientY - activeTouch.originY;
      const distance = Math.hypot(dx, dy);
      const scale = distance > 0 ? Math.min(1, distance / JOYSTICK_RADIUS) : 0;
      inputRef.current.dx = distance > 0 ? (dx / distance) * scale : 0;
      inputRef.current.dy = distance > 0 ? (dy / distance) * scale : 0;
      activeTouch.x = touch.clientX;
      activeTouch.y = touch.clientY;
      setJoystickView({ ...activeTouch });
    }
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const activeTouch = joystickRef.current;
    if (!activeTouch) return;
    for (const touch of Array.from(event.changedTouches)) {
      if (touch.identifier !== activeTouch.id) continue;
      joystickRef.current = null;
      inputRef.current.dx = 0;
      inputRef.current.dy = 0;
      setJoystickView(null);
    }
  };

  const possessionLabel = hud.possession === 'home' ? 'DOMICILE' : hud.possession === 'away' ? 'EXTÉRIEUR' : 'LIBRE';

  return (
    <main
      className="fixed inset-0 overflow-hidden bg-[#0b1220] font-sans text-white select-none"
      style={{ touchAction: 'none' }}
      onTouchStart={phase === 'playing' ? onTouchStart : undefined}
      onTouchMove={phase === 'playing' ? onTouchMove : undefined}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#1e3a5f_0%,_#0b1220_60%)]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative" style={{ aspectRatio: `${W}/${H}`, height: '100%', maxHeight: '100dvh', maxWidth: '100vw' }}>
          <canvas ref={canvasRef} className="block h-full w-full shadow-[0_0_80px_rgba(0,0,0,0.6)] sm:rounded-2xl" />

          {(phase === 'playing' || phase === 'paused') && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-0 flex justify-center p-2">
                <div className="rounded-xl border border-white/10 bg-black/55 px-5 py-2 text-center backdrop-blur">
                  <div className="text-[9px] uppercase tracking-[0.2em] text-white/60">eFootball · 5v5</div>
                  <div className="text-xl font-black tabular-nums leading-none">{hud.homeScore} : {hud.awayScore}</div>
                  <div className="mt-1 text-[9px] uppercase tracking-[0.15em] text-amber-200">Ballon : {possessionLabel}</div>
                </div>
                <button
                  onClick={togglePause}
                  onTouchStart={(event) => event.stopPropagation()}
                  className="pointer-events-auto absolute right-2 top-2 rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs font-bold hover:bg-white/10"
                  aria-label={phase === 'paused' ? 'Reprendre le match' : 'Mettre le match en pause'}
                >
                  {phase === 'paused' ? '▶' : '❚❚'}
                </button>
              </div>
              <div className="absolute bottom-3 left-3 rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-[10px] text-white/75">
                Joueur actif · #{hud.activePlayerId ?? '—'}
              </div>
              {touchMode && phase === 'playing' && (
                <div className="absolute bottom-3 right-3 rounded-lg bg-black/45 px-2 py-1 text-[10px] text-white/65">
                  Stick à gauche · courez avec le ballon
                </div>
              )}
            </div>
          )}

          {phase === 'start' && (
            <Overlay>
              <section className="w-full max-w-sm space-y-5 text-center">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.45em] text-sky-300">Prototype · phase 0</div>
                  <h1 className="mt-2 text-5xl font-black italic tracking-tight sm:text-6xl">eFOOTBALL<br />STRIKER</h1>
                  <p className="mt-3 text-sm leading-relaxed text-white/65">
                    Base 5v5 sur terrain complet : déplacement, formations, collisions simples, possession et remises en jeu.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-left text-xs leading-relaxed text-white/65">
                  <div><b className="text-white">Clavier :</b> ZQSD / WASD ou flèches.</div>
                  <div><b className="text-white">Mobile :</b> glissez sur le côté gauche pour diriger le joueur actif.</div>
                  <div className="mt-2 text-amber-100/80">Passes, tirs et IA tactique seront ajoutés dans les phases suivantes.</div>
                </div>
                <button
                  onClick={startGame}
                  className="w-full rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 px-10 py-4 text-xl font-black text-slate-900 shadow-[0_8px_0_#b45309,0_16px_40px_rgba(251,191,36,0.3)] transition hover:brightness-110 active:translate-y-1"
                >
                  ▶ COUP D’ENVOI
                </button>
                <button onClick={() => setMuted(value => !value)} className="text-xs font-semibold text-white/55 hover:text-white">
                  {muted ? '🔇 Son coupé' : '🔊 Son activé'}
                </button>
              </section>
            </Overlay>
          )}

          {phase === 'paused' && (
            <Overlay>
              <section className="w-full max-w-xs space-y-5 text-center">
                <div className="text-[10px] uppercase tracking-[0.4em] text-white/55">Match 5v5</div>
                <h2 className="text-5xl font-black italic">PAUSE</h2>
                <div className="text-3xl font-black tabular-nums">{hud.homeScore} : {hud.awayScore}</div>
                <div className="flex gap-2">
                  <button onClick={togglePause} className="flex-1 rounded-xl bg-amber-400 px-5 py-3 font-black text-slate-900">▶ Reprendre</button>
                  <button onClick={startGame} className="flex-1 rounded-xl border border-white/20 bg-white/10 px-5 py-3 font-black">↻ Recommencer</button>
                </div>
                <button onClick={() => setMuted(value => !value)} className="text-xs text-white/55 hover:text-white">
                  {muted ? '🔇 Son coupé' : '🔊 Son activé'}
                </button>
              </section>
            </Overlay>
          )}
        </div>
      </div>

      {joystickView && phase === 'playing' && (
        <div className="pointer-events-none fixed z-20" style={{ left: joystickView.originX - JOYSTICK_RADIUS, top: joystickView.originY - JOYSTICK_RADIUS }}>
          <div className="h-[100px] w-[100px] rounded-full border-2 border-white/30 bg-white/5" />
          <div
            className="absolute h-11 w-11 rounded-full bg-sky-300/80 shadow-lg"
            style={{ left: 50 - 22 + joystickView.x - joystickView.originX, top: 50 - 22 + joystickView.y - joystickView.originY }}
          />
        </div>
      )}
    </main>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center">{children}</div>
    </div>
  );
}
