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
import type {
  ENG_DHF,
  ENG_ECRS,
  ENG_ISSUES,
  ENG_RISKS,
  ENG_TRACE,
} from '../data/engineering';
import type { ENG_DOCUMENTS } from '../data/engineering-docs';

/* Row types are derived from the canonical fixture exports so the live
   payload and the example content cannot drift apart. `typeof` on a
   type-only import is erased at compile time — no fixture data reaches
   the production bundle through this module. */
export type DhfRow = (typeof ENG_DHF)[number];
export type TraceRow = (typeof ENG_TRACE)[number];
export type RiskRow = (typeof ENG_RISKS)[number];
export type EcrRow = (typeof ENG_ECRS)[number];
export type IssueRow = (typeof ENG_ISSUES)[number];
export type DocumentRow = (typeof ENG_DOCUMENTS)[number];

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
  meta?: { scopes?: Record<string, PanelScope> };
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

const IDLE = 'Select a program to load its engineering record.';

export function useEngineering(programId: string | null): UseEngineeringResult {
  const url = programId
    ? `/api/mdx/engineering/${encodeURIComponent(programId)}`
    : null;
  const { data, loading, error, refresh } = useFetchJson<EngineeringPayload>(url);

  const state = <T,>(rows: T | undefined): DataState<T> =>
    toDataState(rows ?? null, loading, error, { idleReason: IDLE });

  return {
    summary: state(data?.data.summary),
    dhf: state(data?.data.dhf),
    trace: state(data?.data.trace),
    risks: state(data?.data.risks),
    ecrs: state(data?.data.ecrs),
    issues: state(data?.data.issues),
    documents: state(data?.data.documents),
    scopes: data?.meta?.scopes ?? {},
    loading,
    error,
    refresh,
  };
}
