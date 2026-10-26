/**
 * useEngineering — live adapter for the Engineering surface.
 *
 * Calls `GET /api/mdx/engineering/:programId`, which returns the design
 * history file, design-controls trace, ISO 14971 risk records, change
 * requests and non-conformances for the selected program.
 *
 * Each panel is returned as a `DataState`, not a bare array, so the
 * surface must declare which of loading / idle / error / empty / ready
 * it is rendering. There is deliberately no fixture fallback here: an
 * unreachable endpoint or an empty tenant now reads as exactly that.
 *
 * `scopes` reports each panel's tenancy — several source tables have no
 * program column yet, so those panels are organization-wide and the
 * surface labels them accordingly rather than implying they belong to
 * the selected program.
 */

import { useFetchJson } from './useFetchJson';
import { toDataState, type DataState } from '../lib/dataState';
import type { DhfRow, EcrRow, IssueRow, RiskRow, TraceRow } from '../data/engineering';
import type { EngineeringDocument } from '../data/engineering-docs';

/* Row types are declared in ../data/engineering. They used to be inferred
   from the kit's example rows (`typeof ENG_DHF`), which were deleted with
   sample mode on 2026-10-14. */
export type { DhfRow, TraceRow, RiskRow, EcrRow, IssueRow };
export type DocumentRow = EngineeringDocument;

/** Tenancy of a panel — see the route's scope-honesty note. */
export type PanelScope = 'program' | 'organization';

export interface EngineeringSummary {
  /** Percent of required DHF sections validated or approved. */
  dhfCompletion: number;
  openEcrs: number;
  openRisks: number;
  openIssues: number;
  /** ISO timestamp of the most recent risk-file edit, or null. */
  riskLastUpdated: string | null;
}

interface EngineeringPayload {
  data: {
    summary: EngineeringSummary;
    dhf: DhfRow[];
    trace: TraceRow[];
    risks: RiskRow[];
    ecrs: EcrRow[];
    issues: IssueRow[];
    documents: DocumentRow[];
  };
  meta?: {
    scopes?: Record<string, PanelScope>;
    /** Panels whose read FAILED (not merely unmigrated). See
     *  server/routes/mdx-engineering.ts — a panel that errors returns [] so the
     *  other six still render, and names itself here so this hook can report it
     *  as an error rather than as an empty regulated record. */
    unavailable?: string[];
  };
}

export interface UseEngineeringResult {
  summary: DataState<EngineeringSummary>;
  dhf: DataState<DhfRow[]>;
  trace: DataState<TraceRow[]>;
  risks: DataState<RiskRow[]>;
  ecrs: DataState<EcrRow[]>;
  issues: DataState<IssueRow[]>;
  documents: DataState<DocumentRow[]>;
  /** Per-panel tenancy; defaults to organization when unreported. */
  scopes: Record<string, PanelScope>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const IDLE = 'The engineering record is held per project.';

/* Shown when the route reports a panel as unavailable. DataGate's error branch
   already titles it "Could not load <label>"; this says the part that matters
   to someone reading a regulated record — that a zero is not being claimed.
   ErrorState redacts server strings, so the detail stays server-side in the
   log line panel() writes. */
const UNREADABLE =
  'The read failed. No figures are reported for it — this is not a count of zero.';

export function useEngineering(programId: string | null): UseEngineeringResult {
  const url = programId
    ? `/api/mdx/engineering/${encodeURIComponent(programId)}`
    : null;
  const { data, loading, error, refresh } = useFetchJson<EngineeringPayload>(url);

  /* `data` is the PREVIOUS payload while a new fetch is in flight: useFetchJson
     clears `error` and keeps `data` on refetch, which is what lets a surface
     hold its rows instead of flashing. So `unavailable` is stale during a load,
     and toDataState puts error ahead of loading — meaning a stale failure would
     outrank the in-flight request and claim the NEW program's panel had failed
     before any answer arrived. It also made Retry look inert: the error stayed
     on screen through the refetch that was supposed to clear it. Suppress it
     while loading; the fresh payload decides. */
  const unavailable = loading ? [] : data?.meta?.unavailable ?? [];

  /* A whole-request error still wins — it is the more serious fact, and
     toDataState's precedence puts error first for the same reason. */
  const state = <T,>(name: string, rows: T | undefined): DataState<T> =>
    toDataState(rows ?? null, loading, error ?? (unavailable.includes(name) ? UNREADABLE : null), {
      idleReason: IDLE,
    });

  return {
    summary: state('summary', data?.data.summary),
    dhf: state('dhf', data?.data.dhf),
    trace: state('trace', data?.data.trace),
    risks: state('risks', data?.data.risks),
    ecrs: state('ecrs', data?.data.ecrs),
    issues: state('issues', data?.data.issues),
    documents: state('documents', data?.data.documents),
    scopes: data?.meta?.scopes ?? {},
    loading,
    error,
    refresh,
  };
}
