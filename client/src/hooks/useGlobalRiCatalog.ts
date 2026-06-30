/**
 * useGlobalRiCatalog — one-call discovery of the entire global-RI surface.
 *
 * Binds to the existing, tested endpoint `GET /api/global-ri/catalog`
 * (server/routes/global-ri/catalog.routes.ts) and types the response with the
 * shared contract. This is the reference "contract-ready" hook: the UI renders
 * navigation groups and dynamic forms straight from the returned data, without
 * hard-coding endpoints. See docs/legacy/HANDOFF_TO_DESIGN_global_ri.md.
 *
 * Pattern to replicate per surface: a pure `*Options()` + a thin `use*()`.
 */

import { useQuery } from '@tanstack/react-query';
import type { GlobalRiCatalog, GlobalRiGroupCatalog } from '@shared/types/global-ri-api';
import { apiQueryOptions } from '@/lib/api/query-options';

export const GLOBAL_RI_CATALOG_URL = '/api/global-ri/catalog';

/** URL for a single global-RI group's capabilities. */
export function globalRiGroupUrl(group: string): string {
  return `${GLOBAL_RI_CATALOG_URL}/${encodeURIComponent(group)}`;
}

/** Pure query options for the full catalog (no React). */
export function globalRiCatalogOptions() {
  return apiQueryOptions<GlobalRiCatalog>(GLOBAL_RI_CATALOG_URL, {
    // The catalog is deterministic and changes only on deploy.
    staleTime: 1000 * 60 * 30,
  });
}

/** Pure query options for one group's capabilities (no React). */
export function globalRiGroupCatalogOptions(group: string) {
  return apiQueryOptions<GlobalRiGroupCatalog>(globalRiGroupUrl(group), {
    enabled: Boolean(group),
    staleTime: 1000 * 60 * 30,
  });
}

/** The whole global-RI surface: nav groups + capabilities + per-tool form schema. */
export function useGlobalRiCatalog() {
  return useQuery(globalRiCatalogOptions());
}

/** One group's capabilities (for lazy-loaded sections). */
export function useGlobalRiGroupCatalog(group: string) {
  return useQuery(globalRiGroupCatalogOptions(group));
}
