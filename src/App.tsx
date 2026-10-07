import { useCallback, useEffect, useRef, useState } from 'react';
import { attachKeyboard } from './game/input';
import { Match } from './game/match';
import { playSfx, setMuted as setAudioMuted, unlockAudio } from './game/sfx';
import { clearInputEdges, createInput, type Difficulty, type HudSnapshot } from './game/types';
import { GameCanvas } from './ui/GameCanvas';
import { Hud } from './ui/Hud';
import { ControlsPanel, FullTime, MainMenu, PauseMenu, RotateDevice } from './ui/Screens';
import { TouchControls } from './ui/TouchControls';

type Screen = 'menu' | 'match';

function createDemo() {
  const m = new Match({ difficulty: 'pro', minutes: 30, demo: true });
  m.start();
  return m;
}

function useIsPortrait() {
  const get = () => typeof window !== 'undefined' && window.innerWidth < window.innerHeight;
  const [portrait, setPortrait] = useState(get);
  useEffect(() => {
    const on = () => setPortrait(get());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return portrait;
}

function detectTouch() {
  return typeof window !== 'undefined'
    && ((navigator.maxTouchPoints ?? 0) > 0 || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches));
}

async function enterLandscape() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (orientation?.lock) await orientation.lock('landscape');
  } catch {
    /* Locking is optional: the portrait guard still blocks gameplay. */
  }
}

export default function App() {
  const matchRef = useRef<Match>(null as unknown as Match);
  if (!matchRef.current) matchRef.current = createDemo();
  const inputRef = useRef(createInput());
  const [screen, setScreen] = useState<Screen>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (localStorage.getItem('efs-difficulty') as Difficulty) || 'pro');
  const [minutes, setMinutes] = useState(() => Number(localStorage.getItem('efs-minutes')) || 5);
  const [muted, setMuted] = useState(() => localStorage.getItem('efs-muted') === '1');
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [finished, setFinished] = useState(false);
  const [touch, setTouch] = useState(detectTouch);
  const [hud, setHud] = useState<HudSnapshot>(() => matchRef.current.hud());
  const portrait = useIsPortrait();

  useEffect(() => {
    localStorage.setItem('efs-difficulty', difficulty);
    localStorage.setItem('efs-minutes', String(minutes));
    localStorage.setItem('efs-muted', muted ? '1' : '0');
    setAudioMuted(muted);
  }, [difficulty, minutes, muted]);

  useEffect(() => {
    const onTouch = () => setTouch(true);
    window.addEventListener('touchstart', onTouch, { passive: true, once: true });
    return () => window.removeEventListener('touchstart', onTouch);
  }, []);

  const sfx = useCallback((name: Parameters<typeof playSfx>[0]) => playSfx(name), []);

  const resetInput = useCallback(() => {
    const input = inputRef.current;
    input.pass = false;
    input.shoot = false;
    input.sprint = false;
    input.moveX = 0;
    input.moveY = 0;
    clearInputEdges(input);
    matchRef.current.human.reset();
  }, []);

  const startMatch = useCallback(() => {
    unlockAudio();
    playSfx('ui');
    if (touch) void enterLandscape();
    const m = new Match({ difficulty, minutes });
    m.sfx = sfx;
    m.start();
    matchRef.current = m;
    resetInput();
    setHud(m.hud());
    setFinished(false);
    setPaused(false);
    setScreen('match');
  }, [difficulty, minutes, resetInput, sfx, touch]);

  const toMenu = useCallback(() => {
    matchRef.current = createDemo();
    resetInput();
    setPaused(false);
    setFinished(false);
    setScreen('menu');
  }, [resetInput]);

  const togglePause = useCallback(() => {
    if (screen !== 'match' || finished) {
      setShowControls(false);
      return;
    }
    if (showControls) {
      setShowControls(false);
      return;
    }
    resetInput();
    playSfx('pause');
    setPaused(v => !v);
  }, [finished, resetInput, screen, showControls]);

  const screenRef = useRef(screen);
  const pausedRef = useRef(paused);
  const finishedRef = useRef(finished);
  screenRef.current = screen;
  pausedRef.current = paused;
  finishedRef.current = finished;
  const togglePauseRef = useRef(togglePause);
  const startRef = useRef(startMatch);
  togglePauseRef.current = togglePause;
  startRef.current = startMatch;

  useEffect(() => attachKeyboard(inputRef.current, {
    onPause: () => togglePauseRef.current(),
    onRestart: () => startRef.current(),
    isActive: () => screenRef.current === 'match' && !pausedRef.current && !finishedRef.current,
    onActivity: () => unlockAudio(),
  }), []);

  // Auto-pause when the tab is hidden or the device turns to portrait.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && screenRef.current === 'match' && !finishedRef.current) {
        resetInput();
        setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [resetInput]);

  useEffect(() => {
    if (portrait) resetInput();
  }, [portrait, resetInput]);

  useEffect(() => {
    matchRef.current.sfx = screen === 'match' ? sfx : () => {};
  }, [screen, sfx]);

  const frozen = screen === 'match' && (paused || portrait || finished || showControls);
  const m = matchRef.current;

  return (
    <main className="fixed inset-0 overflow-hidden bg-slate-950 font-sans text-white select-none" style={{ touchAction: 'none' }}>
      <GameCanvas matchRef={matchRef} inputRef={inputRef} frozen={frozen} onHud={setHud} onFinished={() => setFinished(true)} />

      {screen === 'menu' && (
        <MainMenu
          difficulty={difficulty}
          minutes={minutes}
          muted={muted}
          touch={touch}
          onDifficulty={d => { playSfx('ui'); setDifficulty(d); }}
          onMinutes={v => { playSfx('ui'); setMinutes(v); }}
          onToggleSound={() => setMuted(v => !v)}
          onControls={() => setShowControls(true)}
          onPlay={startMatch}
        />
      )}

      {screen === 'match' && !finished && (
        <>
          <Hud hud={hud} touch={touch} onPause={togglePause} />
          {touch && !paused && <TouchControls inputRef={inputRef} hud={hud} />}
        </>
      )}

      {screen === 'match' && paused && !finished && !showControls && (
        <PauseMenu
          m={m}
          muted={muted}
          onResume={togglePause}
          onRestart={startMatch}
          onControls={() => setShowControls(true)}
          onToggleSound={() => setMuted(v => !v)}
          onQuit={toMenu}
        />
      )}

      {screen === 'match' && finished && <FullTime m={m} onReplay={startMatch} onMenu={toMenu} />}

      {showControls && <ControlsPanel onClose={() => setShowControls(false)} />}

      {portrait && <RotateDevice />}
    </main>
  );
}
