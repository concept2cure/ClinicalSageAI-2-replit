export type CmcConvergenceState = 'canonical' | 'transitional' | 'duplicate' | 'remove';

export interface CmcConvergenceEntry {
  path: string;
  state: CmcConvergenceState;
  owner: 'cmc-os' | 'legacy-cmc' | 'shared-schema';
  notes: string;
}

export const CMC_CONVERGENCE_MAP: CmcConvergenceEntry[] = [
  { path: 'shared/schema/cmc-os.ts', state: 'canonical', owner: 'cmc-os', notes: 'Primary governed CMC OS schema.' },
  { path: 'server/services/module3Composer.ts', state: 'canonical', owner: 'cmc-os', notes: 'Deterministic Module 3 composition authority.' },
  { path: 'server/api/cmc/module3OperatingSystemRoutes.ts', state: 'canonical', owner: 'cmc-os', notes: 'Operational API surface for compile/governance.' },
  { path: 'shared/cmc-schema.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Still used by legacy routes; migration-in-progress.' },
  { path: 'server/api/cmc/workflowRoutes.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Workflow layer; migrating to evidence-based orchestration.' },
  { path: 'server/api/cmc/projectRoutes.ts', state: 'duplicate', owner: 'legacy-cmc', notes: 'Overlaps with module3-os project state responsibilities.' },
  { path: 'server/api/cmc/blueprintRoutes.ts', state: 'duplicate', owner: 'legacy-cmc', notes: 'Narrative generation overlaps deterministic composer outputs.' },
  { path: 'server/api/cmc/documentRoutes.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Document lifecycle partially overlaps governed section versions.' },
  { path: 'server/api/cmc/specificationRoutes.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Canonical data source for specs but not yet unified service façade.' },
  { path: 'server/api/cmc/stabilityRoutes.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Canonical data source for stability.' },
  { path: 'server/api/cmc/batchRecordRoutes.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Canonical data source for batch.' },
  { path: 'server/api/cmc/routes.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Aggregator with mixed responsibilities.' },
  { path: 'server/routes/cmc-dashboard.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Dashboard projection to move onto module3-os readiness APIs.' },
];
