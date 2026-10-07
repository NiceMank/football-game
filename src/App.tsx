import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { Game, H, MATCH_DURATION_SECONDS, W, type Difficulty, type HudState, type Input, type Phase, type PlayerRole } from './game/engine';
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
const ACTION_CODES = ['Space', 'Enter', 'KeyJ', 'KeyX'] as const;
const SWITCH_CODES = ['Tab', 'KeyC'] as const;
const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'amateur', label: 'Amateur' },
  { value: 'pro', label: 'Pro' },
  { value: 'legend', label: 'Légende' },
];

const ROLE_LABELS: Record<PlayerRole, string> = {
  defender: 'Défenseur',
  midfielder: 'Milieu',
  forward: 'Avant',
};

function formatMatchTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game] = useState(() => new Game());
  const inputRef = useRef<Input>({ dx: 0, dy: 0, action: false, actionPressed: false, switchPlayer: false, dash: false });
  const keysRef = useRef<Record<string, boolean>>({});
  const joystickRef = useRef<JoystickTouch | null>(null);
  const actionTouchRef = useRef<number | null>(null);
  const dashTouchRef = useRef<number | null>(null);
  const matchSecondsRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('start');
  const [difficulty, setDifficulty] = useState<Difficulty>('pro');
  const [hud, setHud] = useState<HudState>(() => game.hud());
  const [matchSeconds, setMatchSeconds] = useState(0);
  const [joystickView, setJoystickView] = useState<JoystickTouch | null>(null);
  const [touchMode, setTouchMode] = useState(() => typeof window !== 'undefined'
    && ((typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
      || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)));
  const [muted, setMuted] = useState(false);

  const refreshInputFromKeys = useCallback(() => {
    const keys = keysRef.current;
    if (!joystickRef.current) {
      inputRef.current.dx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA || keys.KeyQ ? 1 : 0);
      inputRef.current.dy = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW || keys.KeyZ ? 1 : 0);
    }
    inputRef.current.action = ACTION_CODES.some(code => keys[code]) || actionTouchRef.current !== null;
    inputRef.current.dash = keys.ShiftLeft || keys.ShiftRight || dashTouchRef.current !== null;
  }, []);

  const clearInput = useCallback(() => {
    inputRef.current.dx = 0;
    inputRef.current.dy = 0;
    inputRef.current.action = false;
    inputRef.current.actionPressed = false;
    inputRef.current.switchPlayer = false;
    inputRef.current.dash = false;
    keysRef.current = {};
    joystickRef.current = null;
    actionTouchRef.current = null;
    dashTouchRef.current = null;
    setJoystickView(null);
  }, []);

  const startGame = useCallback(() => {
    unlockAudio();
    if (!muted) playSfx('ui');
    clearInput();
    matchSecondsRef.current = 0;
    setMatchSeconds(0);
    game.setDifficulty(difficulty);
    game.start();
    setPhase('playing');
  }, [clearInput, difficulty, game, muted]);

  const togglePause = useCallback(() => {
    game.togglePause();
    if (game.phase === 'paused') clearInput();
    setPhase(game.phase);
    if (!muted) playSfx('pause');
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
    let finishNotified = false;

    const frame = (now: number) => {
      let frameDt = Math.min((now - previousTime) / 1000, 0.1);
      previousTime = now;
      accumulator += frameDt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 18) {
        game.update(FIXED_STEP, inputRef.current);
        matchSecondsRef.current = game.matchElapsedSeconds;
        if (game.phase === 'playing') finishNotified = false;
        if (game.phase === 'finished' && !finishNotified) {
          finishNotified = true;
          clearInput();
          setPhase('finished');
        }
        inputRef.current.actionPressed = false;
        inputRef.current.switchPlayer = false;
        accumulator -= FIXED_STEP;
        steps++;
      }
      game.render(context);
      hudElapsed += frameDt;
      if (hudElapsed >= 0.1) {
        hudElapsed = 0;
        setHud(game.hud());
        setMatchSeconds(Math.floor(matchSecondsRef.current));
      }
      animationFrame = requestAnimationFrame(frame);
    };

    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [clearInput, game]);

  // Keyboard events feed movement plus a queued action edge; all gameplay stays in the engine.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Tab'].includes(event.code)) event.preventDefault();
      if (event.repeat) return;
      if (event.code === 'Escape' || event.code === 'KeyP') {
        if (game.phase === 'playing' || game.phase === 'paused') togglePause();
        return;
      }
      if ((game.phase === 'start' || game.phase === 'paused' || game.phase === 'finished')
        && (event.code === 'Enter' || event.code === 'Space')) {
        if (game.phase === 'paused') togglePause();
        else startGame();
        return;
      }
      if (event.code === 'KeyR') { startGame(); return; }
      if (game.phase !== 'playing') return;
      if (SWITCH_CODES.includes(event.code as typeof SWITCH_CODES[number])) {
        inputRef.current.switchPlayer = true;
        return;
      }
      const wasActionDown = inputRef.current.action;
      keysRef.current[event.code] = true;
      refreshInputFromKeys();
      if (ACTION_CODES.includes(event.code as typeof ACTION_CODES[number]) && !wasActionDown) {
        inputRef.current.actionPressed = true;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current[event.code] = false;
      refreshInputFromKeys();
    };
    const onBlur = () => clearInput();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [clearInput, game, refreshInputFromKeys, startGame, togglePause]);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setTouchMode(true);
    unlockAudio();
    const bounds = event.currentTarget.getBoundingClientRect();
    const originX = bounds.left + bounds.width / 2;
    const originY = bounds.top + bounds.height / 2;
    for (const touch of Array.from(event.changedTouches)) {
      if (joystickRef.current) continue;
      const next: JoystickTouch = {
        id: touch.identifier,
        originX,
        originY,
        x: touch.clientX,
        y: touch.clientY,
      };
      joystickRef.current = next;
      setJoystickView(next);
    }
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
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
    event.preventDefault();
    event.stopPropagation();
    const activeTouch = joystickRef.current;
    if (!activeTouch) return;
    for (const touch of Array.from(event.changedTouches)) {
      if (touch.identifier !== activeTouch.id) continue;
      joystickRef.current = null;
      inputRef.current.dx = 0;
      inputRef.current.dy = 0;
      refreshInputFromKeys();
      setJoystickView(null);
    }
  };

  const onActionTouchStart = (event: TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setTouchMode(true);
    unlockAudio();
    if (actionTouchRef.current !== null) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const wasActionDown = inputRef.current.action;
    actionTouchRef.current = touch.identifier;
    refreshInputFromKeys();
    if (!wasActionDown) inputRef.current.actionPressed = true;
  };

  const onActionTouchEnd = (event: TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const activeId = actionTouchRef.current;
    if (activeId === null) return;
    for (const touch of Array.from(event.changedTouches)) {
      if (touch.identifier !== activeId) continue;
      actionTouchRef.current = null;
      refreshInputFromKeys();
      break;
    }
  };

  const onActionTouchMove = (event: TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const onDashTouchStart = (event: TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setTouchMode(true);
    if (dashTouchRef.current !== null) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    dashTouchRef.current = touch.identifier;
    refreshInputFromKeys();
  };

  const onDashTouchEnd = (event: TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const activeId = dashTouchRef.current;
    if (activeId === null) return;
    for (const touch of Array.from(event.changedTouches)) {
      if (touch.identifier !== activeId) continue;
      dashTouchRef.current = null;
      refreshInputFromKeys();
      break;
    }
  };

  const onDashTouchMove = (event: TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const requestSwitchPlayer = () => {
    inputRef.current.switchPlayer = true;
  };

  const onSwitchTouchStart = (event: TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setTouchMode(true);
  };

  const possessionLabel = hud.possession === 'home' ? 'HOME' : hud.possession === 'away' ? 'AWAY' : 'LIBRE';
  const joystickDx = joystickView ? joystickView.x - joystickView.originX : 0;
  const joystickDy = joystickView ? joystickView.y - joystickView.originY : 0;
  const joystickDistance = Math.hypot(joystickDx, joystickDy);
  const joystickKnobX = joystickView
    ? joystickView.originX + (joystickDistance > 0 ? joystickDx / joystickDistance * Math.min(joystickDistance, JOYSTICK_RADIUS) : 0)
    : 0;
  const joystickKnobY = joystickView
    ? joystickView.originY + (joystickDistance > 0 ? joystickDy / joystickDistance * Math.min(joystickDistance, JOYSTICK_RADIUS) : 0)
    : 0;

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#0b1220] font-sans text-white select-none" style={{ touchAction: 'none' }}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#1e3a5f_0%,_#0b1220_60%)]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="game-frame relative overflow-hidden">
          <canvas ref={canvasRef} className="block h-full w-full shadow-[0_0_80px_rgba(0,0,0,0.6)]" />

          {(phase === 'playing' || phase === 'paused') && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-2 right-14 top-2 z-10 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/15 bg-slate-950/75 px-3 py-2 shadow-lg backdrop-blur-md">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="text-[10px] font-black tracking-wider text-sky-200">HOME</span>
                    <span className="text-2xl font-black tabular-nums leading-none">{hud.homeScore}</span>
                    <span className="text-base font-black text-white/45">:</span>
                    <span className="text-2xl font-black tabular-nums leading-none">{hud.awayScore}</span>
                    <span className="text-[10px] font-black tracking-wider text-rose-200">AWAY</span>
                  </div>
                  <div className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-sm font-bold tabular-nums">
                    {formatMatchTime(matchSeconds)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-xl border border-white/10 bg-black/55 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/80 backdrop-blur">
                  <span className={`h-2 w-2 rounded-full ${hud.possession === 'home' ? 'bg-sky-300' : hud.possession === 'away' ? 'bg-rose-400' : 'bg-white/50'}`} />
                  <span>Ballon {possessionLabel}</span>
                  <span className="text-white/35">·</span>
                  <span>IA {hud.difficulty === 'legend' ? 'Légende' : hud.difficulty}</span>
                  <span className="text-white/35">·</span>
                  <span>{hud.awayMode === 'attacking' ? 'Attaque' : 'Défense'}</span>
                  {hud.goalCelebration && <span className="ml-1 text-amber-200">· BUT !</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={togglePause}
                className="pointer-events-auto absolute right-2 top-2 z-20 grid h-11 w-11 place-items-center rounded-xl border border-white/20 bg-slate-950/80 text-sm font-black shadow-lg hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
                aria-label={phase === 'paused' ? 'Reprendre le match' : 'Mettre le match en pause'}
                title="Pause (P / Échap)"
              >
                {phase === 'paused' ? '▶' : 'Ⅱ'}
              </button>

              <div className={`absolute ${touchMode ? 'bottom-40' : 'bottom-36'} left-2 w-[min(190px,54%)] rounded-xl border border-white/15 bg-slate-950/75 px-2.5 py-2 shadow-lg backdrop-blur`}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-amber-200/30 bg-amber-300/15 text-xs font-black text-amber-100">#{hud.activePlayerId ?? '—'}</span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/65">Joueur actif</div>
                    <div className="truncate text-xs font-bold leading-tight">{hud.activePlayerRole ? ROLE_LABELS[hud.activePlayerRole] : '—'}</div>
                  </div>
                </div>
                <div className="mb-1 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-white/75">
                  <span>Énergie</span><span className="tabular-nums">{Math.round(hud.stamina)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/15">
                  <div
                    className={`h-full rounded-full transition-[width] duration-150 ${hud.stamina < 22 ? 'bg-rose-400' : 'bg-emerald-300'}`}
                    style={{ width: `${Math.max(0, Math.min(100, hud.stamina))}%` }}
                  />
                </div>
              </div>

              {hud.charging && (
                <div className={`absolute ${touchMode ? 'bottom-64 left-2 w-[min(190px,54%)]' : 'bottom-3 left-1/2 w-56 max-w-[90%] -translate-x-1/2'} rounded-xl border border-white/15 bg-slate-950/85 px-3 py-2 shadow-lg backdrop-blur`}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wider">
                    <span className={hud.perfectShot ? 'text-emerald-300' : 'text-amber-100'}>{hud.perfectShot ? 'Tir parfait — relâchez !' : 'Charge du tir'}</span>
                    <span className="tabular-nums">{Math.round(hud.power * 100)}%</span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full bg-white/15">
                    <div className="absolute inset-y-0 bg-emerald-300/45" style={{ left: '78%', width: '13%' }} />
                    <div className={`relative z-10 h-full rounded-full ${hud.perfectShot ? 'bg-emerald-300' : 'bg-amber-300'}`} style={{ width: `${hud.power * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {phase === 'start' && (
            <Overlay>
              <section className="w-full max-w-sm space-y-5 text-center">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.45em] text-sky-300">Match arcade · 5v5</div>
                  <h1 className="mt-2 text-4xl font-black italic tracking-tight">eFOOTBALL<br />STRIKER</h1>
                  <p className="mt-3 text-sm leading-relaxed text-white/65">
                    Portez le ballon, combinez avec vos coéquipiers et ajustez votre tir pour trouver le filet.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-left text-xs leading-relaxed text-white/65">
                  <div><b className="text-white">Déplacement :</b> ZQSD / WASD ou flèches.</div>
                  <div><b className="text-white">Action :</b> Espace / Entrée / J / X ; appui court = passe, maintien = tir chargé. Relâchez dans la zone verte pour un tir parfait.</div>
                  <div><b className="text-white">Sprint / switch :</b> Maj pour sprinter · Tab ou C pour changer de joueur.</div>
                  <div><b className="text-white">Mobile :</b> joystick gauche · maintenir PASSE / TIR · SPRINT · SWITCH à droite.</div>
                  <div className="mt-2 text-amber-100/80">P / Échap : pause · R : recommencer. L’adversaire construit, combine et revient défendre après perte.</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-left">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/65">Difficulté de l’adversaire</div>
                  <div className="flex gap-2">
                    {DIFFICULTY_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={difficulty === option.value}
                        onClick={() => { setDifficulty(option.value); game.setDifficulty(option.value); }}
                        className={`min-h-11 flex-1 rounded-lg border px-2 py-2 text-xs font-black transition ${difficulty === option.value ? 'border-amber-200 bg-amber-400 text-slate-950' : 'border-white/10 bg-black/25 text-white/65 hover:bg-white/10'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-[10px] leading-relaxed text-white/55">
                    {difficulty === 'amateur'
                      ? 'Réactions plus lentes, pressing modéré et passes/tirs moins précis.'
                      : difficulty === 'legend'
                        ? 'Réactions et placement améliorés, pressing plus agressif et meilleure précision — sans bonus de vitesse.'
                        : 'Équilibre entre pressing, réactions, placement et précision.'}
                  </div>
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
                <div className="text-[10px] uppercase tracking-[0.4em] text-white/55">Match 5v5 · {formatMatchTime(matchSeconds)}</div>
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

          {phase === 'finished' && (
            <Overlay>
              <section className="w-full max-w-xs space-y-5 text-center">
                <div className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-200">Temps réglementaire · {formatMatchTime(MATCH_DURATION_SECONDS)}</div>
                <h2 className="text-4xl font-black italic">FIN DU MATCH</h2>
                <div className="text-sm font-black uppercase tracking-wider text-white/65">Score final</div>
                <div className="text-5xl font-black tabular-nums">{hud.homeScore} : {hud.awayScore}</div>
                <button onClick={startGame} className="min-h-12 w-full rounded-xl bg-amber-400 px-5 py-3 font-black text-slate-950">↻ Rejouer</button>
                <button onClick={() => setMuted(value => !value)} className="text-xs text-white/55 hover:text-white">
                  {muted ? '🔇 Son coupé' : '🔊 Son activé'}
                </button>
              </section>
            </Overlay>
          )}
        </div>
      </div>

      {touchMode && phase === 'playing' && (
        <>
          <div
            role="group"
            aria-label="Joystick gauche : déplacement"
            className="fixed z-30 grid h-[132px] w-[132px] touch-none place-items-center rounded-full border border-white/10 bg-slate-950/10"
            style={{ left: 'max(12px, calc(env(safe-area-inset-left) + 12px))', bottom: 'max(14px, calc(env(safe-area-inset-bottom) + 14px))', touchAction: 'none' }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
          >
            <div className="pointer-events-none absolute inset-3 rounded-full border-2 border-white/25 bg-slate-950/25 shadow-inner">
              <span className="absolute left-1/2 top-1 -translate-x-1/2 text-xs text-white/45">▲</span>
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs text-white/45">▼</span>
              <span className="absolute left-1 top-1/2 -translate-y-1/2 text-xs text-white/45">◀</span>
              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-white/45">▶</span>
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-wider text-white/65">MOVE</span>
            </div>
          </div>

          <button
            type="button"
            onTouchStart={onActionTouchStart}
            onTouchMove={onActionTouchMove}
            onTouchEnd={onActionTouchEnd}
            onTouchCancel={onActionTouchEnd}
            className="fixed z-30 grid h-[88px] w-[88px] touch-none place-items-center rounded-full border-2 border-amber-100 bg-amber-400/95 text-center text-xs font-black leading-tight text-slate-950 shadow-[0_6px_24px_rgba(0,0,0,0.45)] active:scale-95"
            style={{ right: 'max(14px, calc(env(safe-area-inset-right) + 14px))', bottom: 'max(14px, calc(env(safe-area-inset-bottom) + 14px))', touchAction: 'none' }}
            aria-label="Appui court : passe. Maintien : tir chargé."
          >
            <span><span className="text-sm">●</span><br />PASSE<br />/ TIR</span>
          </button>

          <button
            type="button"
            onTouchStart={onDashTouchStart}
            onTouchMove={onDashTouchMove}
            onTouchEnd={onDashTouchEnd}
            onTouchCancel={onDashTouchEnd}
            className="fixed z-30 grid h-[64px] w-[64px] touch-none place-items-center rounded-full border-2 border-sky-200/80 bg-sky-500/90 text-[10px] font-black leading-tight text-white shadow-lg active:scale-95"
            style={{ right: 'max(18px, calc(env(safe-area-inset-right) + 18px))', bottom: 'calc(env(safe-area-inset-bottom) + 112px)', touchAction: 'none' }}
            aria-label="Maintenir pour sprinter. Consomme de l’énergie."
          >
            <span><span className="text-sm">⚡</span><br />SPRINT</span>
          </button>

          <button
            type="button"
            onTouchStart={onSwitchTouchStart}
            onClick={requestSwitchPlayer}
            className="fixed z-30 grid h-[58px] w-[58px] touch-none place-items-center rounded-2xl border border-white/25 bg-slate-900/90 text-[10px] font-black leading-tight text-white shadow-lg active:scale-95"
            style={{ right: 'max(18px, calc(env(safe-area-inset-right) + 18px))', bottom: 'calc(env(safe-area-inset-bottom) + 186px)', touchAction: 'none' }}
            aria-label="Changer de joueur pour sélectionner le défenseur le mieux placé"
          >
            <span><span className="text-sm">↻</span><br />SWITCH</span>
          </button>
        </>
      )}

      {joystickView && phase === 'playing' && (
        <div className="pointer-events-none fixed z-40 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-100/80 bg-sky-300/85 shadow-[0_3px_12px_rgba(0,0,0,0.45)]" style={{ left: joystickKnobX, top: joystickKnobY }} />
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
