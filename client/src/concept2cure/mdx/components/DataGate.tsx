/**
 * DataGate — renders exactly one honest thing for a DataState.
 *
 * This is the component half of ../lib/dataState. It exists so that no
 * MDX surface can render tenant-facing content without first declaring
 * which of the five data situations it is in. The children render-prop
 * is only invoked for `ready`, so surface code below the gate can assume
 * real, non-empty tenant data.
 *
 *     <DataGate state={devices} label="UDI records" onRetry={live.refresh}>
 *       {(rows) => <DeviceTable rows={rows} />}
 *     </DataGate>
 *
 * Sample fixtures are supported, but only as a deliberate opt-in: pass
 * `sample` and the gate will render it *when the user has turned sample
 * mode on* (see ../lib/sampleMode), always under a standing banner. When
 * sample mode is off — which is always, in production — a non-ready
 * state renders the honest empty/error/loading treatment instead.
 *
 * Voice + visual rules (per the MDX kit conventions):
 *   - sentence case, no emoji, no exclamation, no cheerleading
 *   - 13px body / 11px metadata
 *   - inline SVG icons from ../icons only, 200ms ease-out motion only
 *   - accent orange reserved for the one focal action per screen, so the
 *     gate's own affordances stay neutral
 */

import { EmptyState, ErrorState } from '../../v2/dataConnect';
import { openProgramAction } from '../../v2/programAction';
import * as React from 'react';
import { I } from '../icons';
import type { DataState } from '../lib/dataState';
import { isSampleMode, onSampleModeChange } from '../lib/sampleMode';

/** Re-render the caller whenever sample mode is toggled. */
export function useSampleMode(): boolean {
  const [on, setOn] = React.useState<boolean>(() => isSampleMode());
  React.useEffect(() => onSampleModeChange(() => setOn(isSampleMode())), []);
  return on;
}

export interface DataGateProps<T> {
  /** The resolved state for this panel's source. */
  state: DataState<T>;
  /**
   * Noun for what this panel shows, lowercase and plural where natural
   * — "UDI records", "predicate candidates". Used in every message, so
   * the states read as sentences rather than generic placeholders.
   */
  label: string;
  /** Invoked only for `ready` — receives real, non-empty tenant data. */
  children: (data: T) => React.ReactNode;
  /** Wire to the hook's `refresh` to offer retry on error. */
  onRetry?: () => void;
  /**
   * Canonical example content for this panel. Rendered only when the
   * user has explicitly enabled sample mode. Omit for panels that have
   * no fixture — the gate then always shows the honest state.
   */
  sample?: T;
  /**
   * What the user should do to populate this panel, shown in the empty
   * state — e.g. "Import a predicate search to populate this table."
   * Without it the empty state is honest but not actionable.
   */
  emptyHint?: string;
  /**
   * Part 3 of the empty-state contract, for the `empty` case: a program IS
   * open and it genuinely has no rows, so "choose a program" would be the
   * wrong advice. Give the action that populates THIS panel ("Import a
   * predicate search", "Log a complaint"). Falls back to offering the refresh,
   * which is a weaker CTA but a real one — the panel never renders a dead end.
   */
  emptyAction?: { label: string; onAct: () => void };
  /**
   * Part 3 for the `idle` case, where no program is open. Defaults to the
   * canonical **Choose or create a program** action, which is right for the
   * tenant the MDX UAT was run against: it had no programs, so "Select a
   * program" named something that did not exist. Pass `null` where the surface
   * genuinely offers something better and draws it itself.
   */
  idleAction?: { label: string; onAct: () => void } | null;
  /**
   * Part 4 of the contract: the regulation this panel serves, stated
   * factually — "Serves the UDI record (21 CFR 830)". Shown on the idle and
   * empty states, which are the ones a user is entitled to an explanation of.
   * Never inferred from `label`; a citation this component guessed at would be
   * a regulatory claim nobody reviewed.
   */
  regulation?: string;
  /** Compact treatment for small panels — halves vertical padding. */
  dense?: boolean;
}

export function DataGate<T>({
  state,
  label,
  children,
  onRetry,
  sample,
  emptyHint,
  emptyAction,
  idleAction,
  regulation,
  dense = false,
}: DataGateProps<T>) {
  const sampleOn = useSampleMode();

  if (state.status === 'ready') return <>{children(state.data)}</>;

  /* Deliberate sample mode: show the fixture, but never silently. The
     banner is a sibling of the content, not a replacement for it, so
     the user sees example rows *and* the standing warning together. */
  if (sampleOn && sample !== undefined) {
    return (
      <>
        <SampleBanner label={label} />
        {children(sample)}
      </>
    );
  }

  return (
    <div className={`data-gate${dense ? ' data-gate-dense' : ''}`}>
      {renderState(state, label, onRetry, emptyHint, emptyAction, idleAction, regulation)}
    </div>
  );
}

/**
 * Every branch renders `<EmptyState>` or `<ErrorState>`, which is the point of
 * this rewrite. The gate used to draw its own `Shell` — a parallel empty-state
 * implementation with its own `data-gate-title` / `data-gate-detail` /
 * `data-gate-btn` classes and its own opinions about announcement and recovery.
 * The MDX lane had 33 of these and zero `<EmptyState>`, so the lane the UAT was
 * run against shared no empty-state behaviour with the rest of the product at
 * all — including the four-part contract, which had already landed for the
 * biopharma surfaces and could not reach this one.
 *
 * The wrapper no longer carries `role="status"` either. It used to, on all four
 * branches, which put a polite live region around `<ErrorState>`'s
 * `role="alert"` — so the same failure was announced twice, with two different
 * urgencies, on every one of those 33 panels.
 */
function renderState(
  state: Exclude<DataState<unknown>, { status: 'ready' }>,
  label: string,
  onRetry?: () => void,
  emptyHint?: string,
  emptyAction?: { label: string; onAct: () => void },
  idleAction?: { label: string; onAct: () => void } | null,
  regulation?: string,
): React.ReactNode {
  switch (state.status) {
    case 'loading':
      return (
        <EmptyState
          icon={I.database}
          busy
          title={`Loading ${label}`}
          testId="data-gate-loading"
        />
      );

    case 'idle':
      /* The defect this branch shipped as. "Select a program to load this
         panel" named an action and offered no control to perform it — and on
         the tenant the UAT was run against there was no program to select, so
         it was advice that could not be taken. `state.reason` is still
         honoured where a hook has something more specific to say, but the
         button is not optional: ../../v2/programAction.ts is what lets a leaf
         this deep reach the shell without a `nav` prop. */
      return (
        <EmptyState
          icon={I.circle}
          title={`No ${label} requested`}
          hint={state.reason ?? `${cap(label)} are held per program. Open one, or create your first.`}
          action={idleAction === null ? undefined : idleAction ?? openProgramAction()}
          regulation={regulation}
          testId="data-gate-idle"
        />
      );

    case 'error':
      // The shared failure surface, not a third rendering of one. `state.message`
      // used to be dropped into a MONOSPACE span — styling a server string as
      // code, which is exactly how `relation "software_lifecycle_items" does not
      // exist` came to look like intended output on the software-lifecycle panel.
      // ErrorState redacts it and announces the failure assertively.
      return (
        <ErrorState
          variant="panel"
          title={`Could not load ${label}`}
          message={state.message}
          retry={onRetry}
          testId="data-gate-error"
        />
      );

    case 'empty':
      /* A program IS open and it has no rows, so the idle CTA would be wrong
         advice. The caller's own action wins; failing that the refresh is
         offered, which is weaker but real. */
      return (
        <EmptyState
          icon={I.folder}
          title={`No ${label} yet`}
          hint={emptyHint}
          action={emptyAction ?? (onRetry ? { label: 'Check again', onAct: onRetry } : undefined)}
          regulation={regulation}
          testId="data-gate-empty"
        />
      );
  }
}

/** Sentence-case a label for use at the start of a sentence. */
function cap(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Standing marker shown alongside every panel rendering canonical
 * example content. Deliberately not dismissible — the whole point is
 * that it stays visible for as long as the fiction does.
 */
function SampleBanner({ label }: { label: string }) {
  return (
    <div className="data-gate-sample" role="status">
      <span className="data-gate-icon" aria-hidden>
        {I.alertCircle}
      </span>
      <span>
        <strong className="data-gate-sample-tag">Sample data</strong> — the {label} below are
        canonical examples, not your project. Turn off sample mode to see your workspace.
      </span>
    </div>
  );
}
