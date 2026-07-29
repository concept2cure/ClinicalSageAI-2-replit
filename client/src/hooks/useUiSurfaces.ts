/**
 * useUiSurfaces — read the global UI surface registry from React.
 *
 * The registry (shared/constants/ui-surface-registry.ts) is static data, so this
 * is a thin, allocation-free accessor — no fetching. Design uses it to build the
 * left rail (grouped by nav tier), an install tracker (grouped by readiness), and
 * to resolve a surface's backing routes / AnA tools / typed contract.
 */

import {
  UI_SURFACES,
  CROSS_CUTTING_CONCERNS,
  getSurface,
  surfacesByNavTier,
  surfacesGroupedByNavTier,
  surfacesByReadiness,
  readinessSummary,
  contractReadySurfaces,
  type UiSurface,
  type NavTier,
  type ReadinessTier,
} from '@shared/constants/ui-surface-registry';

export type { UiSurface, NavTier, ReadinessTier };

export function useUiSurfaces() {
  return {
    all: UI_SURFACES,
    crossCutting: CROSS_CUTTING_CONCERNS,
    getSurface,
    byNavTier: surfacesByNavTier,
    groupedByNavTier: surfacesGroupedByNavTier,
    byReadiness: surfacesByReadiness,
    readinessSummary,
    contractReady: contractReadySurfaces,
  } as const;
}
