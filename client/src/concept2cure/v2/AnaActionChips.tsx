/**
 * AnaActionChips — the actions AnA resolved in a turn, as controls.
 *
 * One renderer for every chat that shows AnA's answers: the shell rail, the
 * conversation thread, and the docks on screens that run their own chat (the
 * document editor, the eCTD co-author, RBM). Until this existed only the
 * rail's copy made them clickable; everywhere else a "CMC / Quality" or
 * "Start demonstration" chip was a <span> with a check mark on it — it looked
 * done, was never performed, and could not be pressed.
 *
 *   navigate       → opens the screen (and the program it names, first)
 *   surface_action → performs it through the ONE surface-action bus, after
 *                    re-validating it against the shared registry
 *   start_demo     → starts the demonstration the way the rail's menu does
 *   anything else  → an inert record of what already happened
 *
 * The chip's payload never executes as-is: navigation and actions are
 * re-resolved against the shared registries by the same functions Live Drive
 * uses.
 */
import React from 'react';
import type { AnaChatAction } from '../components/ana/useAnaChat';
import { I } from './icons';
import { stashNavParamsForTarget } from './navParams';
import { applySurfaceAction, validateDriveAction } from './surfaceActions';
import { publishShellProject } from './shellProject';

export interface AnaActionChipsProps {
  actions: AnaChatAction[];
  /** The shell's navigation; without it navigation/action chips stay inert. */
  onNav?: (id: string) => void;
  /** Start a demonstration; without it (or when locked) the chip stays inert. */
  onStartDemo?: (demoId: string, title: string) => void;
  /** Class for the inert chips, so each chat keeps its own look for records. */
  inertClassName?: string;
}

function openProgramFirst(a: AnaChatAction): void {
  const p = a.program;
  if (!p || !p.id) return;
  publishShellProject({
    id: p.id,
    ...(p.name ? { title: p.name } : {}),
    ...(p.code ? { code: p.code } : {}),
  });
}

export function AnaActionChip({
  action: a,
  onNav,
  onStartDemo,
  inertClassName = 'ana-exec-chip',
}: {
  action: AnaChatAction;
  onNav?: (id: string) => void;
  onStartDemo?: (demoId: string, title: string) => void;
  inertClassName?: string;
}) {
  if (a.actionType === 'navigate' && a.targetId && onNav) {
    const targetId = a.targetId;
    return (
      <button
        type="button"
        className="ana-exec-chip is-nav"
        onClick={() => {
          openProgramFirst(a);
          /* Registry-validated params ride the navParams channel so the
             destination opens on the named tab/section; a param-less chip
             clears any stale entry instead of inheriting. */
          stashNavParamsForTarget(targetId, a.params);
          onNav(targetId);
        }}
      >
        {I.arrowRight} {a.label}
      </button>
    );
  }
  if (a.actionType === 'surface_action' && a.actionId && onNav) {
    const actionId = a.actionId;
    return (
      <button
        type="button"
        className="ana-exec-chip is-nav"
        onClick={() => {
          /* Re-validated against the shared registry first; if the action's
             screen is not mounted the bus stashes it and navigates there (the
             tap is the consent), performing it once the screen is ready. */
          const d = validateDriveAction({ actionType: 'surface_action', actionId, params: a.params });
          if (d) applySurfaceAction(d, onNav);
        }}
      >
        {I.zap} {a.label}
      </button>
    );
  }
  if (a.actionType === 'start_demo' && a.demoId && onStartDemo) {
    const demoId = a.demoId;
    return (
      <button
        type="button"
        className="ana-exec-chip is-nav"
        onClick={() => onStartDemo(demoId, a.demoTitle || a.label)}
      >
        {I.play} {a.label}
      </button>
    );
  }
  const inertBase = inertClassName === 'ana-exec-chip' ? 'ana-exec-chip' : inertClassName;
  return (
    <span
      className={`${inertBase}${a.executed ? ' is-done' : ''}${a.error ? ' is-err' : ''}`}
      title={a.error || a.label}
    >
      {a.error ? I.alertTriangle : a.executed ? I.check : I.zap} {a.label}
    </span>
  );
}

export function AnaActionChips({ actions, onNav, onStartDemo, inertClassName }: AnaActionChipsProps) {
  return (
    <>
      {actions.map((a, i) => (
        <AnaActionChip
          key={i}
          action={a}
          onNav={onNav}
          onStartDemo={onStartDemo}
          inertClassName={inertClassName}
        />
      ))}
    </>
  );
}
