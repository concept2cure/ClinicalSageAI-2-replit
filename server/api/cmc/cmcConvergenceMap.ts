export type CmcConvergenceState = 'canonical' | 'transitional' | 'duplicate' | 'remove';

export interface CmcConvergenceEntry {
  path: string;
  state: CmcConvergenceState;
  owner: 'cmc-os' | 'legacy-cmc' | 'shared-schema';
  notes: string;
}

/**
 * Where each CMC file stands on the way to one governed Module 3 path.
 *
 * Lists only files that exist (pinned by its test). An entry marked
 * 'duplicate' or 'remove' is resolved by deleting the file and its entry in the
 * same change — not by leaving a row that describes a file nobody can open.
 * Resolved that way on 2026-10-05: projectRoutes.ts and blueprintRoutes.ts
 * ('duplicate'), workflowRoutes.ts and documentRoutes.ts ('transitional'),
 * retired with no caller (server/api/cmc/__tests__/
 * cmc-retired-routers.contract.test.ts); server/routes/cmc-dashboard.ts was
 * already gone.
 */
export const CMC_CONVERGENCE_MAP: CmcConvergenceEntry[] = [
  { path: 'shared/schema/cmc-os.ts', state: 'canonical', owner: 'cmc-os', notes: 'Primary governed CMC OS schema.' },
  { path: 'server/services/module3Composer.ts', state: 'canonical', owner: 'cmc-os', notes: 'Deterministic Module 3 composition authority.' },
  { path: 'server/api/cmc/module3OperatingSystemRoutes.ts', state: 'canonical', owner: 'cmc-os', notes: 'Operational API surface for compile/governance.' },
  { path: 'shared/cmc-schema.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Still used by legacy routes; migration-in-progress.' },
  { path: 'server/api/cmc/specificationRoutes.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Canonical data source for specs but not yet unified service façade.' },
  { path: 'server/api/cmc/batchRecordRoutes.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Canonical data source for batch.' },
  { path: 'server/api/cmc/routes.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Aggregator with mixed responsibilities.' },
];
