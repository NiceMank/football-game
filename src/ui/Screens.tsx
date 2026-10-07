import type { ReactNode } from 'react';
import type { Match } from '../game/match';
import type { Difficulty } from '../game/types';

export const DIFFICULTIES: { value: Difficulty; label: string; desc: string }[] = [
  { value: 'amateur', label: 'AMATEUR', desc: 'IA lente à réagir, placement approximatif, pressing faible.' },
  { value: 'pro', label: 'PRO', desc: 'Décisions correctes, pressing intelligent, gardien normal.' },
  { value: 'legend', label: 'LÉGENDE', desc: 'Anticipation, couverture et circulation de balle de haut niveau.' },
];

const DURATIONS = [3, 5, 8];

interface MenuProps {
  difficulty: Difficulty;
  minutes: number;
  muted: boolean;
  touch: boolean;
  onDifficulty: (d: Difficulty) => void;
  onMinutes: (m: number) => void;
  onToggleSound: () => void;
  onControls: () => void;
  onPlay: () => void;
}

export function MainMenu(p: MenuProps) {
  const desc = DIFFICULTIES.find(d => d.value === p.difficulty)!.desc;
  return (
    <div className="absolute inset-0 z-30 flex items-stretch bg-gradient-to-r from-slate-950/95 via-slate-950/70 to-slate-950/10 text-white">
      <div className="flex h-full w-full max-w-[max(500px,54vh)] flex-col justify-center gap-[2.2vh] py-[3vh] pl-[max(20px,min(4vw,64px),env(safe-area-inset-left))] pr-5">
        <div className="leading-none">
          <div className="text-[clamp(11px,1.8vh,15px)] font-black uppercase tracking-[0.5em] text-sky-300">Football arcade · 5 contre 5</div>
          <h1 className="mt-[1vh] font-black italic tracking-tight">
            <span className="block text-[clamp(26px,7vh,58px)] text-white">eFOOTBALL</span>
            <span className="block bg-gradient-to-r from-amber-200 via-amber-400 to-orange-500 bg-clip-text text-[clamp(38px,11vh,96px)] text-transparent drop-shadow-[0_6px_20px_rgba(251,191,36,0.25)]">
              STRIKER
            </span>
          </h1>
        </div>

        <button
          type="button"
          onClick={p.onPlay}
          className="group relative w-full max-w-[max(400px,40vh)] overflow-hidden rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 py-[clamp(10px,2.6vh,20px)] text-[clamp(20px,4.4vh,32px)] font-black italic tracking-wide text-slate-950 shadow-[0_6px_0_#b45309,0_18px_40px_rgba(251,191,36,0.25)] transition hover:brightness-110 active:translate-y-1 active:shadow-[0_2px_0_#b45309]"
        >
          ▶ JOUER
          <span className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/30 transition-transform duration-700 group-hover:translate-x-[420%]" />
        </button>

        <div className="w-full max-w-[max(400px,40vh)]">
          <div className="mb-[0.8vh] text-[clamp(9px,1.6vh,12px)] font-black uppercase tracking-[0.3em] text-white/60">Difficulté</div>
          <div className="grid grid-cols-3 gap-1.5">
            {DIFFICULTIES.map(d => (
              <button
                key={d.value}
                type="button"
                aria-pressed={p.difficulty === d.value}
                onClick={() => p.onDifficulty(d.value)}
                className={`rounded-lg py-[clamp(6px,1.6vh,12px)] text-[clamp(11px,2vh,15px)] font-black italic transition ${p.difficulty === d.value ? 'bg-white text-slate-950 shadow-[0_0_0_2px_#fbbf24]' : 'bg-white/10 text-white/75 hover:bg-white/20'}`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="mt-[0.8vh] min-h-[2.6em] text-[clamp(10px,1.7vh,13px)] leading-snug text-white/60">{desc}</div>
        </div>

        <div className="flex w-full max-w-[max(400px,40vh)] flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[clamp(9px,1.6vh,12px)] font-black uppercase tracking-[0.3em] text-white/60">Durée</span>
          {DURATIONS.map(d => (
            <button
              key={d}
              type="button"
              aria-pressed={p.minutes === d}
              onClick={() => p.onMinutes(d)}
              className={`rounded-md px-3 py-1 text-xs font-black ${p.minutes === d ? 'bg-sky-400 text-slate-950' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
            >
              {d} MIN
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <MenuChip onClick={p.onControls}>COMMANDES</MenuChip>
          <MenuChip onClick={p.onToggleSound}>{p.muted ? 'SON OFF' : 'SON ON'}</MenuChip>
        </div>
        <div className="text-[10px] font-semibold text-white/40">{p.touch ? 'Mode paysage · joystick à gauche, glissez depuis PASSE / TIR pour orienter.' : 'WASD / flèches · X passe · C tir · Alt sprint · Shift droit changer · Échap pause'}</div>
      </div>

      <div className="pointer-events-none hidden flex-1 items-end justify-end p-[4vh] lg:flex">
        <div className="rounded-xl bg-slate-950/70 px-5 py-3 text-right ring-1 ring-white/10 backdrop-blur">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Affiche du jour</div>
          <div className="mt-1 flex items-center gap-3 text-lg font-black italic">
            <span className="h-4 w-4 rounded-sm bg-[#1d5fe0] ring-2 ring-white" /> STRIKER FC
            <span className="text-white/40">vs</span>
            PHÉNIX ROUGE <span className="h-4 w-4 rounded-sm bg-[#d61f2c] ring-2 ring-amber-300" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuChip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-black text-white/80 ring-1 ring-white/10 hover:bg-white/20">
      {children}
    </button>
  );
}

export function ControlsPanel({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['WASD / Flèches', 'Déplacement (ZQSD sur AZERTY)'],
    ['X', 'Passe · maintenir = passe lobée / en profondeur'],
    ['C', 'Tir · tap = tir placé, maintenir = puissance · ↑/↓ = poteau'],
    ['Alt', 'Sprint (maintenir) · appui avec ballon = crochet / accélération'],
    ['Shift droit', 'Changer de joueur (le mieux placé, appuis répétés = suivant)'],
    ['X / C en défense', 'Tacle (maintenir X = presser) · C = tacle glissé'],
    ['Échap', 'Pause'],
    ['R', 'Recommencer'],
  ];
  const mobile: [string, string][] = [
    ['Joystick gauche', 'Déplacement analogique'],
    ['PASSE (tap)', 'Passe intelligente · glisser = passe orientée, la longueur = la puissance'],
    ['TIR', 'Tap = tir contrôlé · maintenir = charge · glisser = viser (1er / 2e poteau)'],
    ['SPRINT', 'Maintenir pour accélérer (consomme l’endurance)'],
    ['SWITCH', 'Joueur le mieux placé pour intervenir'],
  ];
  return (
    <Modal onClose={onClose}>
      <h2 className="text-2xl font-black italic">COMMANDES</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">Clavier</div>
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2 border-b border-white/5 py-1 text-xs">
              <kbd className="w-28 shrink-0 font-mono font-black text-white">{k}</kbd>
              <span className="text-white/70">{v}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.3em] text-sky-300">Mobile (paysage)</div>
          {mobile.map(([k, v]) => (
            <div key={k} className="flex gap-2 border-b border-white/5 py-1 text-xs">
              <span className="w-28 shrink-0 font-black text-white">{k}</span>
              <span className="text-white/70">{v}</span>
            </div>
          ))}
        </div>
      </div>
      <button type="button" onClick={onClose} className="mt-4 w-full rounded-lg bg-amber-400 py-2 font-black text-slate-950">OK</button>
    </Modal>
  );
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl bg-slate-900/95 p-5 text-white shadow-2xl ring-1 ring-white/10" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

interface PauseProps {
  m: Match;
  muted: boolean;
  onResume: () => void;
  onRestart: () => void;
  onControls: () => void;
  onToggleSound: () => void;
  onQuit: () => void;
}

export function PauseMenu(p: PauseProps) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm">
      <div className="flex w-[min(360px,90vw)] flex-col gap-2 text-center text-white">
        <div className="text-[11px] font-black uppercase tracking-[0.4em] text-white/50">{p.m.clockText()} · {p.m.half === 1 ? '1re mi-temps' : '2e mi-temps'}</div>
        <h2 className="text-5xl font-black italic">PAUSE</h2>
        <div className="mb-2 text-3xl font-black tabular-nums">{p.m.home.short} {p.m.home.score} - {p.m.away.score} {p.m.away.short}</div>
        <button type="button" onClick={p.onResume} className="rounded-lg bg-amber-400 py-2.5 font-black text-slate-950">▶ REPRENDRE</button>
        <button type="button" onClick={p.onRestart} className="rounded-lg bg-white/10 py-2 font-black hover:bg-white/20">↻ RECOMMENCER (R)</button>
        <div className="flex gap-2">
          <button type="button" onClick={p.onControls} className="flex-1 rounded-lg bg-white/10 py-2 text-xs font-black hover:bg-white/20">COMMANDES</button>
          <button type="button" onClick={p.onToggleSound} className="flex-1 rounded-lg bg-white/10 py-2 text-xs font-black hover:bg-white/20">{p.muted ? 'SON OFF' : 'SON ON'}</button>
        </div>
        <button type="button" onClick={p.onQuit} className="rounded-lg py-2 text-xs font-black text-white/60 hover:text-white">QUITTER LE MATCH</button>
      </div>
    </div>
  );
}

export function FullTime({ m, onReplay, onMenu }: { m: Match; onReplay: () => void; onMenu: () => void }) {
  const h = m.home.stats;
  const a = m.away.stats;
  const tot = h.possession + a.possession || 1;
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
  const rows: [string, string, string][] = [
    ['Possession', pct(h.possession, tot), pct(a.possession, tot)],
    ['Tirs', String(h.shots), String(a.shots)],
    ['Tirs cadrés', String(h.onTarget), String(a.onTarget)],
    ['Passes réussies', pct(h.passesCompleted, h.passes), pct(a.passesCompleted, a.passes)],
    ['Arrêts du gardien', String(h.saves), String(a.saves)],
    ['Corners', String(h.corners), String(a.corners)],
    ['Fautes', String(h.fouls), String(a.fouls)],
  ];
  const result = m.home.score > m.away.score ? 'VICTOIRE' : m.home.score < m.away.score ? 'DÉFAITE' : 'MATCH NUL';
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm">
      <div className="flex max-h-full w-[min(640px,94vw)] flex-col gap-3 overflow-y-auto rounded-2xl bg-slate-900/90 p-4 text-white ring-1 ring-white/10 sm:flex-row sm:p-5">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-[11px] font-black uppercase tracking-[0.35em] text-amber-300">Fin du match</div>
          <div className={`mt-1 text-3xl font-black italic ${result === 'VICTOIRE' ? 'text-emerald-300' : result === 'DÉFAITE' ? 'text-rose-300' : 'text-white'}`}>{result}</div>
          <div className="mt-1 text-5xl font-black tabular-nums">{m.home.score} - {m.away.score}</div>
          <div className="mt-1 text-xs font-bold text-white/60">{m.home.name} vs {m.away.name}</div>
          <div className="mt-2 max-h-20 overflow-y-auto text-[11px] text-white/70">
            {m.goalsLog.map((g, i) => (
              <div key={i}>⚽ {g.minute}' {g.scorer} ({g.team})</div>
            ))}
          </div>
          <div className="mt-3 flex w-full gap-2">
            <button type="button" onClick={onReplay} className="flex-1 rounded-lg bg-amber-400 py-2.5 font-black text-slate-950">↻ REJOUER</button>
            <button type="button" onClick={onMenu} className="flex-1 rounded-lg bg-white/10 py-2.5 font-black hover:bg-white/20">MENU</button>
          </div>
        </div>
        <div className="flex-1">
          <div className="mb-1 flex justify-between text-[10px] font-black uppercase tracking-widest text-white/50">
            <span>{m.home.short}</span><span>Statistiques</span><span>{m.away.short}</span>
          </div>
          {rows.map(([k, x, y]) => (
            <div key={k} className="flex items-center justify-between border-b border-white/5 py-1.5 text-sm">
              <span className="w-14 font-black tabular-nums">{x}</span>
              <span className="text-xs text-white/60">{k}</span>
              <span className="w-14 text-right font-black tabular-nums">{y}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RotateDevice() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-[radial-gradient(ellipse_at_center,_#1e3a5f_0%,_#020617_70%)] p-6 text-center text-white">
      <div className="rotate-phone relative h-28 w-16 rounded-[14px] border-4 border-white/90 shadow-[0_0_40px_rgba(56,189,248,0.35)]">
        <div className="absolute left-1/2 top-1.5 h-1 w-5 -translate-x-1/2 rounded-full bg-white/70" />
        <div className="absolute inset-x-1.5 bottom-3 top-4 rounded-md bg-gradient-to-b from-emerald-500 to-emerald-700" />
      </div>
      <div>
        <div className="text-2xl font-black italic tracking-tight">TOURNEZ VOTRE TÉLÉPHONE</div>
        <div className="mt-2 text-sm text-white/60">eFootball Striker se joue en mode paysage.</div>
      </div>
    </div>
  );
}
