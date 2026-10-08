import type { HudSnapshot, Role } from '../game/types';

const ROLE: Record<Role, string> = { GK: 'Gardien', DEF: 'Défenseur', MID: 'Milieu', FWD: 'Attaquant' };

interface Props {
  hud: HudSnapshot;
  touch: boolean;
  onPause: () => void;
}

/** In-match HUD: broadcast scoreboard, active player card, context hints. Never covers the centre of the pitch. */
export function Hud({ hud, touch, onPause }: Props) {
  const pos = Math.round(hud.possessionHome * 100);
  const hold = hud.keeperHold;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none font-sans text-white">
      <div className="absolute left-1/2 top-[max(8px,env(safe-area-inset-top))] flex -translate-x-1/2 flex-col items-center">
        <div className="flex items-stretch overflow-hidden rounded-md shadow-[0_4px_14px_rgba(0,0,0,0.4)] ring-1 ring-white/10">
          <div className="flex items-center gap-2 bg-slate-950/85 px-2 py-0.5">
            <span className="h-3.5 w-1 rounded-sm" style={{ background: hud.homeColor }} />
            <span className="text-xs font-black tracking-wider">{hud.homeShort}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-gradient-to-b from-white to-slate-200 px-2.5 text-slate-950">
            <span className="text-base font-black tabular-nums">{hud.homeScore}</span>
            <span className="text-xs font-black text-slate-500">-</span>
            <span className="text-base font-black tabular-nums">{hud.awayScore}</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-950/85 px-2 py-0.5">
            <span className="text-xs font-black tracking-wider">{hud.awayShort}</span>
            <span className="h-3.5 w-1 rounded-sm" style={{ background: hud.awayColor }} />
          </div>
          <div className="flex items-center bg-amber-400 px-2 font-mono text-xs font-black tabular-nums text-slate-950">
            {hud.clock}
          </div>
        </div>
        <div className="mt-0.5 flex w-full items-center gap-1.5 px-1 text-[8px] font-black uppercase tracking-wider text-white/60">
          <span className="tabular-nums">{pos}%</span>
          <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/15">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pos}%`, background: hud.homeColor }} />
            <div className="absolute inset-y-0 right-0 rounded-full" style={{ width: `${100 - pos}%`, background: hud.awayColor }} />
          </div>
          <span className="tabular-nums">{100 - pos}%</span>
          <span className="ml-1 rounded bg-black/40 px-1 py-px text-white/70">{hud.half === 1 ? '1re MT' : '2e MT'}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onPause}
        className="pointer-events-auto absolute right-[max(10px,env(safe-area-inset-right))] top-[max(8px,env(safe-area-inset-top))] grid h-8 w-8 place-items-center rounded-md bg-slate-950/55 text-xs font-black ring-1 ring-white/10 hover:bg-slate-800/90"
        aria-label="Pause"
        title="Pause (Échap)"
      >
        ❚❚
      </button>

      {hud.activeNumber !== null && (
        <div className="absolute left-[max(10px,env(safe-area-inset-left))] top-[max(8px,env(safe-area-inset-top))] flex items-center gap-1.5 rounded-md bg-slate-950/55 py-0.5 pl-0.5 pr-2 ring-1 ring-white/10">
          <span className="grid h-6 w-6 place-items-center rounded text-xs font-black" style={{ background: hud.homeColor }}>
            {hud.activeNumber}
          </span>
          <div className="min-w-[70px]">
            <div className="text-[10px] font-black uppercase leading-tight">{hud.activeName}<span className="font-bold text-white/50"> · {hud.activeRole ? ROLE[hud.activeRole] : ''}</span></div>
            <div className="mt-0.5 h-[3px] overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full ${hud.stamina > 0.35 ? 'bg-emerald-400' : hud.stamina > 0.15 ? 'bg-amber-400' : 'bg-rose-500'}`}
                style={{ width: `${Math.round(hud.stamina * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {hud.keeperHuman ? (
        <div
          className={`absolute left-1/2 top-16 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-black shadow-lg ${hold > 5 ? 'animate-pulse bg-rose-600/95' : 'bg-sky-600/90'}`}
        >
          RELANCE {Math.max(0, Math.ceil(8 - hold))} s · {touch ? 'PASSE : main · TIR : dégagement' : 'X : main · C : dégagement'}
        </div>
      ) : (
        hold > 3 && (
          <div className="absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-orange-500/90 px-3 py-1 text-xs font-black shadow-lg">
            GARDIEN · {Math.max(0, Math.ceil(8 - hold))} s
          </div>
        )
      )}

      {!touch && (
        <div className="absolute bottom-2 left-2 hidden flex-col gap-0.5 text-[9px] font-bold uppercase tracking-wide text-white/45 md:flex">
          {hud.humanTaking ? (
            <>
              <Hint k="WASD / ↑↓←→" t="orienter" />
              <Hint k="X" t={hud.restartLabel === 'throwin' ? 'touche courte' : 'passe'} />
              <Hint k="C" t={hud.restartLabel === 'corner' ? 'centre' : hud.restartLabel === 'throwin' ? 'touche longue' : 'tir'} />
            </>
          ) : hud.defending ? (
            <>
              <Hint k="X" t="presser · près = tacle" />
              <Hint k="C" t="2e presseur · près = glissé" />
              <Hint k="R" t="sprint (maintenir)" />
              <Hint k="⇧ droit" t="changer de joueur" />
            </>
          ) : (
            <>
              <Hint k="X" t="passe · maintenir = lobée" />
              <Hint k="T" t="passe en profondeur" />
              <Hint k="C" t="tir · maintenir = puissance" />
              <Hint k="R" t="sprint (maintenir)" />
              <Hint k="⇧ droit" t="changer de joueur" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Hint({ k, t }: { k: string; t: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <kbd className="min-w-[20px] rounded bg-white/10 px-1 py-px text-center font-mono text-[9px] text-white/75">{k}</kbd>
      <span>{t}</span>
    </div>
  );
}
