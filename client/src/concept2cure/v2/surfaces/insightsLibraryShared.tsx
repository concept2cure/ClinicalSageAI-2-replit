/**
 * Shared furniture for the reporting library panels.
 *
 * The panels (catalog, run history, schedules, bundles) are the screens for
 * the report-os and insights routes the 2026-10-01 reporting review left with
 * no caller — see `insightsLibraryModel.ts` for why they exist and which
 * honesty rules bind them. This module holds only what more than one panel
 * needs, so each panel file stays a single screen.
 *
 * @module client/src/concept2cure/v2/surfaces/insightsLibraryShared
 */
import React from 'react';

import { I } from '../icons';
import { RUN_STATUS_LABEL, SCHEDULE_DELIVERY_NOTE, SCHEDULE_SWEEP_NOTE } from './insightsLibraryModel';

/** The library panels, and the order a client meets them. */
export type LibraryView = 'catalog' | 'runs' | 'schedules' | 'bundles';

export const LIBRARY_VIEWS: ReadonlyArray<{ id: LibraryView; label: string; icon: React.ReactNode }> = [
  { id: 'catalog', label: 'Report catalog', icon: I.grid },
  { id: 'runs', label: 'Run history', icon: I.history },
  { id: 'schedules', label: 'Schedules', icon: I.calendar },
  { id: 'bundles', label: 'Bundles', icon: I.layers },
];

/** A catalog row as the canvas models it (see Insights.tsx `ReportType`). */
export interface LibraryReportType {
  typeId: string;
  label: string;
  family: string;
  scopes: string[];
  segments: string[];
  /** An engine computes it; a row without this is never offered as a control. */
  runnable: boolean;
  entitled?: boolean;
  requiredTier?: string;
}

export function PanelHead({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rl-head">
      <div>
        <h2 className="rl-h">{title}</h2>
        {sub ? <p className="rl-sub">{sub}</p> : null}
      </div>
      {actions ? <div className="rl-head-acts">{actions}</div> : null}
    </div>
  );
}

/**
 * A status word, carrying its own meaning rather than a colour alone
 * (WCAG 2.2 SC 1.4.1: colour is never the only signal). `data-status` drives
 * the hue; the text is what a reader relies on.
 */
export function StatusTag({ status }: { status: string }) {
  return (
    <span className="rl-tag" data-status={status}>
      {RUN_STATUS_LABEL[status] ?? status}
    </span>
  );
}

/**
 * What a schedule actually does, shown wherever one is created or listed.
 *
 * The sweep computes the report and applies the delivery gate, then only logs
 * it (`services/report-os/scheduling/worker-register.ts`). Promising a
 * delivered file would be a claim the platform does not keep, so this note is
 * not optional decoration — `insightsLibraryReachesBackend.test.tsx` fails
 * without it.
 */
export function ScheduleTruthNote() {
  return (
    <div className="ro-dash-note" role="note" data-testid="rl-schedule-truth">
      {I.info} {SCHEDULE_DELIVERY_NOTE} {SCHEDULE_SWEEP_NOTE}
    </div>
  );
}

/** The "an editor role is needed" line, in the one wording the product uses. */
export function ViewOnlyNote({ action }: { action: string }) {
  return (
    <div className="ro-dash-note" role="note">
      {I.lock} View only. {action} needs an editor role in this organization.
    </div>
  );
}

/** A refusal or failed write, stated where the reader acted. */
export function PanelAlert({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <div className="ro-dash-note" role="alert">
      {I.alertTriangle} {note}
    </div>
  );
}

/**
 * The rows of a list read, from either envelope shape.
 *
 * `liveGetOrNull` unwraps the project's `{ data: rows }` envelope, so the hook
 * normally hands over a bare array; a route that answers the envelope
 * unchanged is tolerated rather than rendered as empty.
 *
 * THIS IS NOT A SHAPE CHECK, and a caller must not rely on it as one. A 200
 * whose payload is not a list at all — version skew, a nested envelope, an
 * error body — returns `[]` here, which a panel would render as "none yet".
 * Pass {@link isRowList} as `useLiveData`'s guard so a shape mismatch becomes
 * the panel's error state instead. That is what the guard parameter is for
 * (dataConnect.tsx), and leaving it off is how a failed read reads as an empty
 * one (CLAUDE.md: an error is never rendered as an empty result).
 */
export function rowsOf<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const inner = (data as { data?: unknown } | null)?.data;
  return Array.isArray(inner) ? (inner as T[]) : [];
}

/**
 * `useLiveData` guard for a list read: the payload must be an array, or the
 * envelope's `data` must be. Anything else is a shape mismatch, which the hook
 * reports as an error rather than handing over a payload a panel would show as
 * emptiness.
 */
export function isRowList(payload: unknown): payload is unknown[] {
  if (Array.isArray(payload)) return true;
  const inner = (payload as { data?: unknown } | null)?.data;
  return Array.isArray(inner);
}

/**
 * What a failed list read was, so the panel can offer the right remedy.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Every panel here first shipped with one sentence for any failure — "the
 * records could not be read" — and a Try again button. `useLiveData` reports
 * the HTTP status (`DataState.status`), and none of the reads consulted it, so
 * a 403 from the tenant guard and an expired session both rendered as an
 * outage with a retry that cannot succeed. A reader clicks it, it fails
 * identically, and nothing tells them to sign in or that their role is the
 * reason.
 *
 * `status: 0` means the request never reached the server, which IS the case a
 * retry is for. Everything else is the server answering, and only a 5xx or a
 * shape mismatch is worth retrying.
 */
export interface ReadFailure {
  title: string;
  message: string;
  /** Offered only when retrying could plausibly change the answer. */
  retryable: boolean;
}

export function readFailureOf(
  state: { error?: string; status?: number },
  what: string,
): ReadFailure {
  const status = state.status ?? 0;
  if (status === 401) {
    return {
      title: 'Your session has expired',
      message: `Sign in again to read ${what}. Nothing is shown in their place.`,
      retryable: false,
    };
  }
  if (status === 403) {
    return {
      title: `You do not have access to ${what}`,
      message:
        'This organization\u2019s records are role-scoped, and your role does not include them. ' +
        'Nothing is shown in their place, and retrying will not change the answer.',
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      title: `No record of ${what}`,
      message: 'The server has no such record. Nothing is shown in its place.',
      retryable: false,
    };
  }
  return {
    title: `Couldn\u2019t read ${what}`,
    message:
      status === 0
        ? `The request did not reach the server, so ${what} could not be read. Nothing is shown in their place.`
        : `The server could not return ${what}. Nothing is shown in their place.`,
    retryable: true,
  };
}
