/**
 * PDEV data hooks for sub-phases 7.0 + 7.1 (read-only surfaces).
 *
 * Bound to four endpoints in the merged PDEV backend
 * (server/routes/pdev/pdev-routes.ts):
 *   GET /api/pdev/registry
 *   GET /api/pdev/programs/:programId
 *   GET /api/pdev/programs/:programId/readiness
 *   GET /api/pdev/programs/:programId/workstreams/:workstream
 *
 * Wraps the existing useFetchJson primitive (MDX module) — fetch infra
 * (cancellation, refresh, error narrowing) stays in one place. Each hook
 * is a typed adapter from the server payload to the kit shape the
 * surfaces consume.
 *
 * Mutation hooks (state change, evidence attach, AI draft, workflow
 * decisions) intentionally absent — they ship in PR 2 alongside the
 * <PdevConfirmDialog>.
 */

import { useFetchJson } from '../../mdx/hooks/useFetchJson';
import type { PdevWorkstream } from '../data/enums';
import type {
  PdevProgramView,
  PdevReadinessReport,
  PdevRegistryPayload,
  PdevWorkstreamPayload,
} from '../data/types';

/** Server `ok()` wraps payloads as `{ data: ... }`. Mirrors the MDX
 *  hook pattern. */
interface Envelope<T> {
  data: T;
}

/** Cached at app boot per PHASE_7_INSTALL.md §2 — every surface reads
 *  closed enums from the same response. */
export function usePdevRegistry() {
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevRegistryPayload>>('/api/pdev/registry');
  return {
    registry: data?.data ?? null,
    loading,
    error,
    refresh,
  };
}

/** Program-level unified view: program row + workstream rollups +
 *  per-activity state + latest readiness snapshots + correspondence
 *  counts. Pass `null` to disable the fetch (idle state) while parent
 *  values are unresolved. */
export function usePdevProgram(programId: string | null) {
  const url = programId
    ? `/api/pdev/programs/${encodeURIComponent(programId)}`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevProgramView>>(url);
  return {
    view: data?.data ?? null,
    loading,
    error,
    refresh,
  };
}

/** Standalone readiness report (live recompute). The program view
 *  already carries `latestSnapshots`; this hook exists for surfaces
 *  that want the freshly-computed score without re-fetching everything. */
export function usePdevReadiness(programId: string | null) {
  const url = programId
    ? `/api/pdev/programs/${encodeURIComponent(programId)}/readiness`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevReadinessReport>>(url);
  return {
    report: data?.data ?? null,
    loading,
    error,
    refresh,
  };
}

/** Workstream drill payload — rollup metrics for the chosen workstream
 *  plus its activities (registry def + per-program state). */
export function usePdevWorkstream(
  programId: string | null,
  workstream: PdevWorkstream | null,
) {
  const url =
    programId && workstream
      ? `/api/pdev/programs/${encodeURIComponent(programId)}/workstreams/${workstream}`
      : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevWorkstreamPayload>>(url);
  return {
    payload: data?.data ?? null,
    loading,
    error,
    refresh,
  };
}
