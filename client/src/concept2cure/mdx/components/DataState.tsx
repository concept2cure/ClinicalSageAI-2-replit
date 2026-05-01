/**
 * DataState — the four states every wired surface renders when it isn't
 * showing data: loading, empty, error, unconfigured.
 *
 * Brand-correct visual surface (cream canvas, sentence case, no emoji,
 * 200ms ease-out, single terracotta focal point per state). Used by every
 * MDX surface that calls a backend, so we don't reinvent these affordances
 * per surface and so the empty/error visual language stays consistent.
 *
 * Usage:
 *
 *   if (q.isLoading) return <DataState state="loading" />;
 *   if (q.isError)   return <DataState state="error" error={q.error} retry={q.refetch}/>;
 *   if (q.data?.length === 0) return <DataState state="empty"
 *     title="No predicates yet"
 *     hint="Run a candidate search to surface FDA-cleared devices that match this profile."/>;
 *
 * The 'unconfigured' state is reserved for the 503 response from
 * predicate-intelligence when the shadow service is down. Surfaces map
 * those errors here so the user sees a calm "not yet available" rather
 * than a stack trace.
 */

import * as React from 'react';
import { I } from '../icons';

export type DataStateKind = 'loading' | 'empty' | 'error' | 'unconfigured';

export interface DataStateProps {
  state: DataStateKind;
  /** Optional headline override. Defaults are reviewer-grade calm copy. */
  title?: string;
  /** Optional secondary hint. Keep under 16 words. */
  hint?: string;
  /** Surfaces pass through useQuery errors here. */
  error?: Error | unknown;
  /** When provided, renders a single primary action button (e.g. Retry). */
  retry?: () => void;
  /** When provided, renders a single primary action button (e.g. Create). */
  primaryAction?: { label: string; onClick: () => void };
  /** Compact variant collapses the panel padding for inline empty rows. */
  compact?: boolean;
}

const DEFAULT_COPY: Record<DataStateKind, { title: string; hint: string }> = {
  loading: {
    title: 'Loading',
    hint: 'One moment while we fetch the latest data.',
  },
  empty: {
    title: 'Nothing to show yet',
    hint: 'Once data exists for this program it will appear here.',
  },
  error: {
    title: "Couldn't load this view",
    hint: 'The request failed. Try again, or contact support if the problem continues.',
  },
  unconfigured: {
    title: 'Not yet configured',
    hint: 'This capability requires a service that is not currently running. Try again later.',
  },
};

export function DataState({
  state,
  title,
  hint,
  error,
  retry,
  primaryAction,
  compact = false,
}: DataStateProps) {
  const copy = DEFAULT_COPY[state];
  const renderedTitle = title ?? copy.title;
  const renderedHint  = hint  ?? copy.hint;
  const errorDetail = state === 'error' ? extractErrorMessage(error) : null;

  return (
    <div
      className={`data-state${compact ? ' compact' : ''}`}
      data-state={state}
      role={state === 'error' || state === 'unconfigured' ? 'alert' : 'status'}
      aria-live={state === 'loading' ? 'polite' : 'off'}
    >
      <div className="data-state-glyph" aria-hidden="true">
        {state === 'loading' ? (
          <span className="data-state-spinner" />
        ) : state === 'error' ? (
          I.alertCircle ?? I.zap
        ) : state === 'unconfigured' ? (
          I.zap ?? I.sparkles
        ) : (
          I.search ?? I.sparkles
        )}
      </div>
      <div className="data-state-title">{renderedTitle}</div>
      <div className="data-state-hint">{renderedHint}</div>
      {errorDetail && (
        <div className="data-state-error-detail" aria-label="Error detail">
          {errorDetail}
        </div>
      )}
      {(retry || primaryAction) && (
        <div className="data-state-actions">
          {retry && (
            <button className="data-state-btn" onClick={retry}>
              Try again
            </button>
          )}
          {primaryAction && (
            <button className="data-state-btn primary" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function extractErrorMessage(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return null;
}
