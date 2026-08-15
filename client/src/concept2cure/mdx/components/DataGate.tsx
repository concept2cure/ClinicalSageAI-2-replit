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

import { ErrorState } from '../../v2/dataConnect';
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
  /** Optional focal action for the empty state (e.g. "Add a device"). */
  emptyAction?: { label: string; onClick: () => void };
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
    <div className={`data-gate${dense ? ' data-gate-dense' : ''}`} role="status" aria-live="polite">
      {renderState(state, label, onRetry, emptyHint, emptyAction)}
    </div>
  );
}

function renderState(
  state: Exclude<DataState<unknown>, { status: 'ready' }>,
  label: string,
  onRetry?: () => void,
  emptyHint?: string,
  emptyAction?: { label: string; onClick: () => void },
): React.ReactNode {
  switch (state.status) {
    case 'loading':
      return (
        <Shell icon={I.database} spinning>
          <span className="data-gate-title">Loading {label}</span>
        </Shell>
      );

    case 'idle':
      return (
        <Shell icon={I.circle}>
          <span className="data-gate-title">No {label} requested</span>
          <span className="data-gate-detail">
            {state.reason ?? 'Select a program to load this panel.'}
          </span>
        </Shell>
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
      return (
        <Shell icon={I.folder}>
          <span className="data-gate-title">No {label} yet</span>
          {emptyHint && <span className="data-gate-detail">{emptyHint}</span>}
          {emptyAction && (
            <button type="button" className="data-gate-btn" onClick={emptyAction.onClick}>
              {emptyAction.label}
            </button>
          )}
        </Shell>
      );
  }
}

function Shell({
  icon,
  children,
  tone,
  spinning = false,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: 'error';
  spinning?: boolean;
}) {
  return (
    <div className={`data-gate-inner${tone ? ` data-gate-${tone}` : ''}`}>
      <span className={`data-gate-icon${spinning ? ' data-gate-icon-pulse' : ''}`} aria-hidden>
        {icon}
      </span>
      <div className="data-gate-copy">{children}</div>
    </div>
  );
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
