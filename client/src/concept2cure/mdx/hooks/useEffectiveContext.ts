/**
 * useEffectiveContext — live adapter for the resolved industry context.
 *
 * Calls `GET /api/mdx/effective-context?programId=<uuid>`, the CONTEXT-03
 * resolver output: the layered project → organization → license-default
 * merge that says what kind of regulated product this program is
 * (vertical, specialization, pathways, markets, approval rigor) and
 * which layer supplied it.
 *
 * Modeled on useUdi: one fetch, returned as a `DataState` so the surface
 * has to declare which of idle / loading / error / ready it is showing.
 *
 * The endpoint 422s on a non-UUID programId, and the MDX shell still
 * carries design-kit fixture programs whose ids are short codes
 * ("bx204"). Those must render as *idle* — "no server record" — not as
 * a guaranteed request error, so the hook only issues the fetch for a
 * real regulatory_programs uuid.
 */

import { useFetchJson } from './useFetchJson';
import { toDataState, type DataState } from '../lib/dataState';
import type { EffectiveIndustryContext } from '../lib/industryContext';

interface EffectiveContextPayload {
  data: EffectiveIndustryContext;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UseEffectiveContextResult {
  /** The resolved context, or the honest idle/loading/error state. */
  context: DataState<EffectiveIndustryContext>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * @param programId The regulatory_programs uuid to resolve context for.
 *                  Pass null (or a non-uuid fixture id) for idle — no
 *                  request is issued.
 */
export function useEffectiveContext(
  programId?: string | null,
): UseEffectiveContextResult {
  const isUuid = typeof programId === 'string' && UUID_RE.test(programId);
  const url = isUuid
    ? `/api/mdx/effective-context?programId=${encodeURIComponent(programId)}`
    : null;
  const { data, loading, error, refresh } = useFetchJson<EffectiveContextPayload>(url);

  const idleReason = programId
    ? 'This program has no server record yet — context resolves once it is saved.'
    : 'Select a program to resolve its industry context.';

  return {
    context: toDataState(data?.data ?? null, loading, error, { idleReason }),
    loading,
    error,
    refresh,
  };
}
