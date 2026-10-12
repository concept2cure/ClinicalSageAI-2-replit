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
 *
 * Handlers are resolved the same way inside a file that stays. When the cmc
 * surface's API claim was narrowed to the 33 prefixes its screens call
 * (2026-10-05, decision P-28), seven uncalled handlers in the routers below
 * were deleted rather than claimed: routes.ts POST /insights/take-action,
 * /compliance/check-rules and /generate-enhanced-blueprint;
 * module3ConvergenceRoutes.ts POST /classify-artifact and GET /source-lineage;
 * module3BuildStateRoutes.ts GET /uploaded-sources and /section-labels. The
 * same contract test keeps them from being declared again
 * (docs/evidence/CMC-M3-GA/2026-10-05/20-cmc-api-allowlist/).
 */
export const CMC_CONVERGENCE_MAP: CmcConvergenceEntry[] = [
  { path: 'shared/schema/cmc-os.ts', state: 'canonical', owner: 'cmc-os', notes: 'Primary governed CMC OS schema.' },
  { path: 'server/services/module3Composer.ts', state: 'canonical', owner: 'cmc-os', notes: 'Deterministic Module 3 composition authority.' },
  { path: 'server/api/cmc/module3OperatingSystemRoutes.ts', state: 'canonical', owner: 'cmc-os', notes: 'Operational API surface for compile/governance.' },
  { path: 'server/api/cmc/module3BuildStateRoutes.ts', state: 'canonical', owner: 'cmc-os', notes: 'GET /build-state/:projectId only: the one build-state read (getModule3BuildStatus).' },
  { path: 'server/api/cmc/module3ConvergenceRoutes.ts', state: 'canonical', owner: 'cmc-os', notes: 'POST /build-section/:projectId/:sectionKey only, over the canonical composition.' },
  { path: 'shared/cmc-schema.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Still used by legacy routes; migration-in-progress.' },
  { path: 'server/api/cmc/specificationRoutes.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Canonical data source for specs but not yet unified service façade.' },
  { path: 'server/api/cmc/batchRecordRoutes.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'Canonical data source for batch.' },
  { path: 'server/api/cmc/routes.ts', state: 'transitional', owner: 'legacy-cmc', notes: 'The CMC registers (create, edit, signed qualification), the deterministic QbD, ICH-compliance and control-strategy reads, and the stability estimators. POST /variations/classify and GET /projects/:projectId/process-capability are deterministic but unclaimed by the cmc surface until a launch screen calls them.' },
];
