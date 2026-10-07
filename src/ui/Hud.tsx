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
        <div className="flex items-stretch overflow-hidden rounded-lg shadow-[0_6px_24px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
          <div className="flex items-center gap-2 bg-slate-950/85 px-2.5 py-1 sm:px-3">
            <span className="h-4 w-1.5 rounded-sm" style={{ background: hud.homeColor }} />
            <span className="text-xs font-black tracking-wider sm:text-sm">{hud.homeShort}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-gradient-to-b from-white to-slate-200 px-3 text-slate-950">
            <span className="text-lg font-black tabular-nums sm:text-xl">{hud.homeScore}</span>
            <span className="text-xs font-black text-slate-500">-</span>
            <span className="text-lg font-black tabular-nums sm:text-xl">{hud.awayScore}</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-950/85 px-2.5 py-1 sm:px-3">
            <span className="text-xs font-black tracking-wider sm:text-sm">{hud.awayShort}</span>
            <span className="h-4 w-1.5 rounded-sm" style={{ background: hud.awayColor }} />
          </div>
          <div className="flex items-center bg-amber-400 px-2.5 font-mono text-xs font-black tabular-nums text-slate-950 sm:text-sm">
            {hud.clock}
          </div>
        </div>
        <div className="mt-1 flex w-full items-center gap-1.5 px-1 text-[9px] font-black uppercase tracking-wider text-white/80">
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
        className="pointer-events-auto absolute right-[max(10px,env(safe-area-inset-right))] top-[max(8px,env(safe-area-inset-top))] grid h-10 w-10 place-items-center rounded-lg bg-slate-950/75 text-sm font-black ring-1 ring-white/15 hover:bg-slate-800/90"
        aria-label="Pause"
        title="Pause (Échap)"
      >
        ❚❚
      </button>

      {hud.activeNumber !== null && (
        <div className="absolute left-[max(10px,env(safe-area-inset-left))] top-[max(8px,env(safe-area-inset-top))] flex items-center gap-2 rounded-lg bg-slate-950/75 py-1 pl-1 pr-3 ring-1 ring-white/10">
          <span className="grid h-8 w-8 place-items-center rounded-md text-sm font-black" style={{ background: hud.homeColor }}>
            {hud.activeNumber}
          </span>
          <div className="min-w-[86px]">
            <div className="text-[11px] font-black uppercase leading-tight">{hud.activeName}</div>
            <div className="text-[9px] font-bold uppercase leading-tight text-white/55">{hud.activeRole ? ROLE[hud.activeRole] : ''}{hud.hasBall ? ' · ballon' : hud.defending ? ' · défense' : ''}</div>
            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/15">
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
          className={`absolute left-1/2 top-20 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-black shadow-lg ${hold > 5 ? 'animate-pulse bg-rose-600/95' : 'bg-sky-600/90'}`}
        >
          RELANCE {Math.max(0, Math.ceil(8 - hold))} s · {touch ? 'PASSE : main · TIR : dégagement' : 'X : main · C : dégagement'}
        </div>
      ) : (
        hold > 3 && (
          <div className="absolute left-1/2 top-20 -translate-x-1/2 rounded-full bg-orange-500/90 px-3 py-1 text-xs font-black shadow-lg">
            GARDIEN · {Math.max(0, Math.ceil(8 - hold))} s
          </div>
        )
      )}

      {!touch && (
        <div className="absolute bottom-3 left-3 hidden flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-white/60 md:flex">
          {hud.humanTaking ? (
            <>
              <Hint k="WASD / ↑↓←→" t="orienter" />
              <Hint k="X" t={hud.restartLabel === 'throwin' ? 'touche courte' : 'passe'} />
              <Hint k="C" t={hud.restartLabel === 'corner' ? 'centre' : hud.restartLabel === 'throwin' ? 'touche longue' : 'tir'} />
            </>
          ) : hud.defending ? (
            <>
              <Hint k="X" t="tacle · maintenir = presser" />
              <Hint k="C" t="tacle glissé" />
              <Hint k="⇧ droit" t="changer de joueur" />
              <Hint k="Alt" t="sprint" />
            </>
          ) : (
            <>
              <Hint k="X" t="passe · maintenir = lobée" />
              <Hint k="C" t="tir · maintenir = puissance" />
              <Hint k="Alt" t="sprint / crochet" />
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
      <kbd className="min-w-[22px] rounded bg-white/15 px-1.5 py-0.5 text-center font-mono text-[10px] text-white/90 ring-1 ring-white/15">{k}</kbd>
      <span>{t}</span>
    </div>
  );
}
