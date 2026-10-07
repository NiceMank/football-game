import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, W, H, DIFFICULTY, waveName, type Input, type Phase, type Difficulty, type Stats } from './game/engine';
import { playSfx, unlockAudio } from './game/sfx';

interface ScoreEntry { score: number; goals: number; date: string; diff: Difficulty }
const HS_KEY = 'efootball-striker-highscores-v2';
const loadScores = (): ScoreEntry[] => { try { return JSON.parse(localStorage.getItem(HS_KEY) || '[]'); } catch { return []; } };
const saveScores = (s: ScoreEntry[]) => localStorage.setItem(HS_KEY, JSON.stringify(s));

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(null!);
  if (!gameRef.current) gameRef.current = new Game();
  const inputRef = useRef<Input>({ dx: 0, dy: 0, shoot: false, dash: false });
  const keys = useRef<Record<string, boolean>>({});
  const joy = useRef<{ id: number; ox: number; oy: number; x: number; y: number } | null>(null);
  const shootTouch = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>('start');
  const [hud, setHud] = useState(gameRef.current.hud());
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores);
  const [last, setLast] = useState<{ stats: Stats; rank: number; record: boolean; diff: Difficulty } | null>(null);
  const [joyUI, setJoyUI] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const [muted, setMuted] = useState(false);
  const [diff, setDiff] = useState<Difficulty>('pro');

  const startGame = useCallback(() => {
    unlockAudio(); playSfx('ui');
    gameRef.current.start(diff); setPhase('playing'); setLast(null);
  }, [diff]);

  useEffect(() => {
    const g = gameRef.current;
    g.sfx = (n) => { if (!muted) playSfx(n); };
    g.onEnd = (stats) => {
      const prevBest = loadScores()[0]?.score ?? 0;
      const entry: ScoreEntry = { score: stats.score, goals: stats.goals, date: new Date().toLocaleDateString(), diff: g.diff };
      const next = [...loadScores(), entry].sort((a, b) => b.score - a.score).slice(0, 8);
      saveScores(next); setScores(next);
      setLast({ stats, rank: next.indexOf(entry) + 1, record: stats.score > prevBest && stats.score > 0, diff: g.diff });
      setPhase('over');
    };
  }, [muted]);

  // main loop
  useEffect(() => {
    const canvas = canvasRef.current!; const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.scale(dpr, dpr);
    let raf = 0, lastT = performance.now(), acc = 0, hudT = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      let dt = (t - lastT) / 1000; lastT = t; if (dt > 0.1) dt = 0.1;
      acc += dt; const step = 1 / 120;
      const inp = inputRef.current; const g = gameRef.current;
      let guard = 0;
      while (acc >= step && guard++ < 20) { g.update(step, inp); acc -= step; }
      g.render(ctx);
      hudT += dt;
      if (hudT > 0.05) { hudT = 0; setHud(g.hud()); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // keyboard
  useEffect(() => {
    const updateMove = () => {
      const k = keys.current;
      const dx = (k['ArrowRight'] || k['KeyD'] ? 1 : 0) - (k['ArrowLeft'] || k['KeyA'] ? 1 : 0);
      const dy = (k['ArrowDown'] || k['KeyS'] ? 1 : 0) - (k['ArrowUp'] || k['KeyW'] ? 1 : 0);
      if (!joy.current) { inputRef.current.dx = dx; inputRef.current.dy = dy; }
      inputRef.current.shoot = !!(k['Space'] || k['KeyJ'] || k['KeyX'] || k['Enter']) || shootTouch.current !== null;
      inputRef.current.dash = !!(k['ShiftLeft'] || k['ShiftRight'] || k['KeyK'] || k['KeyL']);
    };
    const down = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      const g = gameRef.current;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (g.phase === 'playing' || g.phase === 'paused') { g.togglePause(); setPhase(g.phase); playSfx('ui'); }
        return;
      }
      if (g.phase === 'start' || g.phase === 'over') {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR') startGame();
        return;
      }
      if (e.code === 'KeyR') { startGame(); return; }
      if (['Space', 'Enter', 'KeyJ', 'KeyX'].includes(e.code)) gameRef.current.pendingShoot = true;
      keys.current[e.code] = true; updateMove();
    };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; updateMove(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [startGame]);

  // touch
  const onTouchStart = (e: React.TouchEvent) => {
    setIsTouch(true); unlockAudio();
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < window.innerWidth / 2 && !joy.current) {
        joy.current = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
        setJoyUI({ ...joy.current });
      } else if (shootTouch.current === null) {
        shootTouch.current = t.identifier; inputRef.current.shoot = true; gameRef.current.pendingShoot = true;
      }
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (joy.current && t.identifier === joy.current.id) {
        let dx = t.clientX - joy.current.ox, dy = t.clientY - joy.current.oy;
        const l = Math.hypot(dx, dy), max = 50;
        if (l > max) { joy.current.ox += dx / l * (l - max); joy.current.oy += dy / l * (l - max); dx = dx / l * max; dy = dy / l * max; }
        joy.current.x = t.clientX; joy.current.y = t.clientY;
        const dead = 6; const m = Math.max(0, l - dead) / (max - dead);
        inputRef.current.dx = l > 0 ? dx / l * Math.min(1, m) : 0;
        inputRef.current.dy = l > 0 ? dy / l * Math.min(1, m) : 0;
        setJoyUI({ ...joy.current });
      }
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (joy.current && t.identifier === joy.current.id) { joy.current = null; inputRef.current.dx = 0; inputRef.current.dy = 0; setJoyUI(null); }
      if (shootTouch.current === t.identifier) { shootTouch.current = null; inputRef.current.shoot = false; }
    }
  };

  const pause = () => { const g = gameRef.current; g.togglePause(); setPhase(g.phase); playSfx('ui'); };
  const best = scores[0]?.score ?? 0;
  const timeLow = hud.time < 10 && phase === 'playing';
  const acc = last ? (last.stats.shots ? Math.min(100, Math.round((last.stats.onTarget / last.stats.shots) * 100)) : 0) : 0;

  return (
    <div className="fixed inset-0 bg-[#0b1220] text-white select-none overflow-hidden font-sans"
      style={{ touchAction: 'none' }}
      onTouchStart={phase === 'playing' ? onTouchStart : undefined}
      onTouchMove={phase === 'playing' ? onTouchMove : undefined}
      onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#1e3a5f_0%,_#0b1220_60%)]" />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative" style={{ aspectRatio: `${W}/${H}`, height: '100%', maxHeight: '100dvh', maxWidth: '100vw' }}>
          <canvas ref={canvasRef} className="w-full h-full block sm:rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.6)]" />

          {/* ---------- HUD ---------- */}
          {(phase === 'playing' || phase === 'paused') && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-x-0 top-0 p-2 flex items-start justify-between gap-2">
                <div className="bg-black/55 backdrop-blur rounded-xl px-3 py-1.5 border border-white/10">
                  <div className="text-[9px] uppercase tracking-[0.2em] text-sky-300">Score</div>
                  <div className="text-2xl font-black tabular-nums leading-none">{hud.score.toLocaleString()}</div>
                  {hud.combo > 1 && (
                    <div className="mt-1">
                      <div className="text-[10px] font-bold text-amber-300">COMBO x{hud.combo}</div>
                      <div className="h-1 w-16 bg-white/15 rounded-full overflow-hidden"><div className="h-full bg-amber-300" style={{ width: `${Math.max(0, Math.min(1, hud.comboTimer / 13)) * 100}%` }} /></div>
                    </div>
                  )}
                </div>
                <div className={`rounded-xl px-4 py-1.5 border ${timeLow ? 'bg-red-600/80 border-red-300 animate-pulse' : 'bg-black/55 border-white/10'} backdrop-blur text-center`}>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-white/70">Temps</div>
                  <div className="text-2xl font-black tabular-nums leading-none">{Math.ceil(hud.time)}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="bg-black/55 backdrop-blur rounded-xl px-3 py-1.5 border border-white/10 text-right">
                    <div className="text-[9px] uppercase tracking-[0.2em] text-emerald-300">Buts · Niv.{hud.level}</div>
                    <div className="text-2xl font-black tabular-nums leading-none">{hud.goals}</div>
                  </div>
                  <button onClick={pause} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); pause(); }}
                    className="pointer-events-auto bg-black/55 border border-white/10 rounded-lg px-3 py-1 text-xs font-bold hover:bg-white/10 active:scale-95 transition">
                    {phase === 'paused' ? '▶' : '❚❚'}
                  </button>
                </div>
              </div>

              {/* wave name */}
              <div className="absolute top-[64px] inset-x-0 text-center text-[10px] uppercase tracking-[0.35em] text-white/40">{waveName(hud.level)}</div>

              {/* active effects */}
              <div className="absolute left-2 top-[86px] flex flex-col gap-1">
                {hud.effects.x2 > 0 && <Chip color="bg-pink-500/80">x2 {hud.effects.x2.toFixed(0)}s</Chip>}
                {hud.effects.speed > 0 && <Chip color="bg-cyan-500/80">Vitesse {hud.effects.speed.toFixed(0)}s</Chip>}
                {hud.effects.magnet > 0 && <Chip color="bg-purple-500/80">Aimant {hud.effects.magnet.toFixed(0)}s</Chip>}
              </div>

              {/* bottom gauges */}
              <div className="absolute inset-x-0 bottom-0 p-3 flex items-end justify-between gap-3">
                <div className="w-24">
                  <div className="text-[9px] uppercase tracking-[0.2em] text-white/60 mb-0.5">Énergie</div>
                  <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                    <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${hud.stamina}%`, background: hud.stamina > 30 ? 'linear-gradient(90deg,#22d3ee,#a7f3d0)' : '#f87171' }} />
                  </div>
                </div>
                <div className="flex-1 max-w-[180px]">
                  <div className="text-[9px] uppercase tracking-[0.2em] text-white/60 mb-0.5 text-right">{hud.perfect ? '★ TIR PARFAIT' : 'Puissance'}</div>
                  <div className="h-3 rounded-full bg-white/15 overflow-hidden relative">
                    <div className="absolute right-0 top-0 h-full bg-amber-300/40" style={{ width: '18%' }} />
                    <div className="h-full rounded-full transition-[width] duration-75" style={{ width: `${hud.power * 100}%`, background: hud.perfect ? 'linear-gradient(90deg,#f472b6,#ffd166)' : 'linear-gradient(90deg,#38bdf8,#ffd166)' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* touch buttons */}
          {phase === 'playing' && isTouch && (
            <div className="absolute right-4 bottom-16 flex flex-col items-center gap-3 z-10">
              <button
                onTouchStart={(e) => { e.stopPropagation(); inputRef.current.dash = true; setIsTouch(true); }}
                onTouchEnd={(e) => { e.stopPropagation(); inputRef.current.dash = false; }}
                onTouchCancel={(e) => { e.stopPropagation(); inputRef.current.dash = false; }}
                className="w-16 h-16 rounded-full bg-cyan-400/25 border-2 border-cyan-300/70 text-cyan-100 font-black text-xs active:scale-90 active:bg-cyan-400/50 transition">ESQUIVE</button>
              <button
                onTouchStart={(e) => { e.stopPropagation(); inputRef.current.shoot = true; shootTouch.current = -1; gameRef.current.pendingShoot = true; }}
                onTouchEnd={(e) => { e.stopPropagation(); inputRef.current.shoot = false; shootTouch.current = null; }}
                onTouchCancel={(e) => { e.stopPropagation(); inputRef.current.shoot = false; shootTouch.current = null; }}
                className="w-24 h-24 rounded-full bg-amber-400/25 border-2 border-amber-300/80 text-amber-100 font-black text-base active:scale-90 active:bg-amber-400/50 transition shadow-[0_0_30px_rgba(251,191,36,0.35)]">TIR</button>
            </div>
          )}
          {phase === 'playing' && isTouch && hud.time > DIFFICULTY[diff].time - 9 && (
            <div className="absolute top-[86px] right-2 text-right pointer-events-none text-[9px] leading-relaxed uppercase tracking-widest text-white/50">
              <div>◐ Glissez à gauche pour courir</div>
              <div>◆ Appui bref : passe · maintenir : tir</div>
              <div className="text-cyan-200/70">✦ ESQUIVE = invincible + points</div>
            </div>
          )}

          {/* ---------- START ---------- */}
          {phase === 'start' && (
            <Overlay>
              <div className="text-center space-y-4 animate-[pop_.5s_ease-out] w-full max-w-sm">
                <div>
                  <div className="text-[10px] tracking-[0.5em] text-sky-300 uppercase">Football d’arcade</div>
                  <h1 className="text-5xl sm:text-6xl font-black italic tracking-tight bg-gradient-to-b from-white to-sky-300 bg-clip-text text-transparent">eFOOTBALL<br />STRIKER</h1>
                  <p className="text-white/60 text-sm mt-2">Match arcade 5v5 sur terrain complet. Passez d’un appui bref, chargez votre frappe, et défendez votre but !</p>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/50 mb-1.5">Difficulté</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(Object.keys(DIFFICULTY) as Difficulty[]).map(d => (
                      <button key={d} onClick={() => { setDiff(d); playSfx('ui'); }}
                        className={`rounded-xl px-2 py-2 border text-xs font-black transition ${diff === d ? 'bg-amber-400/90 text-slate-900 border-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.35)]' : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10'}`}>
                        {DIFFICULTY[d].label}
                        <div className="text-[9px] font-semibold opacity-70 mt-0.5">×{DIFFICULTY[d].mul} pts</div>
                      </button>
                    ))}
                  </div>
                  <div className="text-[11px] text-white/50 mt-1.5">{DIFFICULTY[diff].desc} · {DIFFICULTY[diff].time}s</div>
                </div>

                <button onClick={startGame}
                  className="w-full px-10 py-4 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-slate-900 font-black text-xl shadow-[0_8px_0_#b45309,0_16px_40px_rgba(251,191,36,0.4)] active:translate-y-1 active:shadow-[0_4px_0_#b45309] transition-all hover:brightness-110">
                  ▶ COUP D’ENVOI
                </button>

                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-white/70">
                  <Key label="Courir" keys="WASD / Flèches" />
                  <Key label="Passe / tir" keys="Appui bref / maintenir" />
                  <Key label="Esquiver" keys="MAJ / K (×2 pts)" />
                  <Key label="Pause" keys="P / ÉCHAP" />
                  <Key label="Tactile" keys="Gauche: stick" />
                  <Key label="" keys="Droite: TIR + ESQUIVE" />
                </div>

                <div className="flex items-center justify-center gap-2">
                  <button onClick={() => { setMuted(m => !m); unlockAudio(); }} className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-xs font-bold hover:bg-white/20">
                    {muted ? '🔇 Son coupé' : '🔊 Son activé'}
                  </button>
                  <button onClick={() => { saveScores([]); setScores([]); playSfx('ui'); }} className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-xs font-bold hover:bg-white/20">
                    🗑 Effacer records
                  </button>
                </div>

                <HighScores scores={scores} />
              </div>
            </Overlay>
          )}

          {/* ---------- PAUSE ---------- */}
          {phase === 'paused' && (
            <Overlay>
              <div className="text-center space-y-5 w-full max-w-xs">
                <h2 className="text-5xl font-black italic">PAUSE</h2>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Score" value={hud.score.toLocaleString()} />
                  <Stat label="Buts" value={String(hud.goals)} />
                  <Stat label="Record" value={best.toLocaleString()} />
                </div>
                <div className="flex flex-col gap-2">
                  <Btn onClick={pause} primary>▶ Reprendre</Btn>
                  <div className="flex gap-2">
                    <Btn onClick={startGame}>↻ Recommencer</Btn>
                    <Btn onClick={() => { setMuted(m => !m); }}>{muted ? '🔇' : '🔊'} Son</Btn>
                  </div>
                </div>
                <div className="text-xs text-white/50">Touches : P ou ÉCHAP pour reprendre · R pour recommencer</div>
              </div>
            </Overlay>
          )}

          {/* ---------- GAME OVER ---------- */}
          {phase === 'over' && last && (
            <Overlay>
              <div className="text-center space-y-4 animate-[pop_.4s_ease-out] w-full max-w-sm">
                <div className="text-[10px] tracking-[0.5em] text-white/60 uppercase">Coup de sifflet final</div>
                {last.record && <div className="text-amber-300 font-black text-lg animate-bounce">🏆 NOUVEAU RECORD !</div>}
                <div className="text-6xl font-black tabular-nums bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-transparent">{last.stats.score.toLocaleString()}</div>
                <div className="text-white/60 text-sm">{DIFFICULTY[last.diff].label} · {last.rank > 0 ? <>Rang <b className="text-white">#{last.rank}</b> au classement</> : 'Hors classement'}</div>

                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Buts" value={String(last.stats.goals)} />
                  <Stat label="Tirs" value={String(last.stats.shots)} />
                  <Stat label="Précision" value={`${acc}%`} />
                  <Stat label="Tirs parfaits" value={String(last.stats.powerShots)} />
                  <Stat label="Meilleur combo" value={`x${last.stats.bestCombo}`} />
                  <Stat label="Esquives" value={String(last.stats.dodges)} />
                </div>

                <Btn onClick={startGame} primary big>↻ REJOUER</Btn>
                <div className="text-xs text-white/40">ESPACE ou R pour relancer instantanément</div>
                <HighScores scores={scores} highlight={last.stats.score} />
              </div>
            </Overlay>
          )}
        </div>
      </div>

      {joyUI && (
        <div className="fixed pointer-events-none z-20" style={{ left: joyUI.ox - 50, top: joyUI.oy - 50 }}>
          <div className="w-[100px] h-[100px] rounded-full border-2 border-white/30 bg-white/5" />
          <div className="absolute w-11 h-11 rounded-full bg-sky-300/80 shadow-lg" style={{ left: 50 - 22 + (joyUI.x - joyUI.ox), top: 50 - 22 + (joyUI.y - joyUI.oy) }} />
        </div>
      )}
      <style>{`@keyframes pop{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.03)}100%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 overflow-y-auto bg-slate-950/75 backdrop-blur-sm p-4">
      <div className="min-h-full flex items-center justify-center">{children}</div>
    </div>
  );
}
function Key({ label, keys }: { label: string; keys: string }) {
  return <div className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5"><span className="text-white/40">{label} </span><span className="font-semibold text-white">{keys}</span></div>;
}
function Chip({ children, color }: { children: React.ReactNode; color: string }) {
  return <div className={`${color} rounded-full px-2 py-0.5 text-[10px] font-black shadow`}>{children}</div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bg-white/5 border border-white/10 rounded-xl px-2 py-2">
    <div className="text-[9px] uppercase tracking-[0.15em] text-white/50">{label}</div>
    <div className="text-lg font-black tabular-nums leading-tight">{value}</div>
  </div>;
}
function Btn({ children, onClick, primary, big }: { children: React.ReactNode; onClick: () => void; primary?: boolean; big?: boolean }) {
  return (
    <button onClick={onClick} className={`${big ? 'px-10 py-4 text-xl w-full' : 'px-6 py-3 flex-1'} rounded-xl font-black transition-all active:translate-y-0.5 ${primary ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-900 shadow-[0_6px_0_#b45309] hover:brightness-110' : 'bg-white/10 border border-white/20 hover:bg-white/20'}`}>{children}</button>
  );
}
function HighScores({ scores, highlight }: { scores: ScoreEntry[]; highlight?: number }) {
  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-3 w-full text-left">
      <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300 mb-1.5 text-center">Tableau d’honneur</div>
      {scores.length === 0 ? <div className="text-center text-white/40 text-sm py-2">Aucun score — à vous de marquer l’histoire.</div> :
        <ol className="space-y-0.5 text-sm">
          {scores.slice(0, 5).map((s, i) => (
            <li key={i} className={`flex items-center gap-2 px-2 py-0.5 rounded ${highlight === s.score ? 'bg-amber-400/20 text-amber-200' : ''}`}>
              <span className="text-white/50 w-5">{i + 1}.</span>
              <span className="font-bold tabular-nums flex-1">{s.score.toLocaleString()}</span>
              <span className="text-white/40 text-[10px] uppercase">{DIFFICULTY[s.diff]?.label ?? 'PRO'}</span>
              <span className="text-white/50 text-xs">{s.goals} ⚽</span>
            </li>
          ))}
        </ol>}
    </div>
  );
}
