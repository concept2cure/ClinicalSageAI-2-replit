/**
 * useEngineering — live data adapter for the Engineering surface.
 *
 * Calls `GET /api/mdx/engineering/:programId` (not yet implemented in
 * the backend; per the dataMode registry the surface stays in
 * `defaultMode: 'fixture'` until 2026-09-01). When the endpoint 404s
 * or errors, the hook returns null arrays and the surface falls back
 * to fixture data — same `defaultMode: fixture` pattern as the other
 * Phase 4 surfaces.
 *
 * Server payload shape (when the endpoint ships) mirrors the kit's
 * data/engineering.{js,ts} export shape so the surface can swap
 * fallbacks transparently.
 */

import { useFetchJson } from './useFetchJson';
import {
  ENG_DHF,
  ENG_ECRS,
  ENG_ISSUES,
  ENG_RISKS,
  ENG_TRACE,
} from '../data/engineering';

// The fixture exports are values; their inferred row types feed the
// server-payload typing so live + fixture stay in lockstep without
// declaring duplicate interfaces. The imports are erased at compile
// time when only `typeof` is used — the bundler doesn't include the
// fixture in production code that imports from this hook.
type DhfRow = (typeof ENG_DHF)[number];
type TraceRow = (typeof ENG_TRACE)[number];
type RiskRow = (typeof ENG_RISKS)[number];
type EcrRow = (typeof ENG_ECRS)[number];
type IssueRow = (typeof ENG_ISSUES)[number];

interface EngineeringPayload {
  data: {
    dhf: DhfRow[];
    trace: TraceRow[];
    risks: RiskRow[];
    ecrs: EcrRow[];
    issues: IssueRow[];
  };
}

export interface UseEngineeringResult {
  dhf: DhfRow[] | null;
  trace: TraceRow[] | null;
  risks: RiskRow[] | null;
  ecrs: EcrRow[] | null;
  issues: IssueRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useEngineering(programId: string | null): UseEngineeringResult {
  const url = programId
    ? `/api/mdx/engineering/${encodeURIComponent(programId)}`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<EngineeringPayload>(url);
  return {
    dhf: data?.data.dhf ?? null,
    trace: data?.data.trace ?? null,
    risks: data?.data.risks ?? null,
    ecrs: data?.data.ecrs ?? null,
    issues: data?.data.issues ?? null,
    loading,
    error,
    refresh,
  };
}
