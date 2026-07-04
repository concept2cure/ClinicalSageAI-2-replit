/**
 * Living Record Spine — service barrel.
 *
 * The value layer underneath the existing living-file cascade:
 *   - object-model        the explicit spine graph (nodes, edges, the chain)
 *   - claim-lifecycle     the Claim state machine (content + verification axes)
 *   - value-reconciliation pure comparison + reconcile/drift logic
 *   - canonical-fact-store persistence for facts, bindings, drift
 *   - reconciliation-engine reconcile-on-write + the Drift Sentinel job
 *   - fact-change            pure impact classification for a proposed change
 *   - fact-change-orchestrator the governed change-propagation path (push)
 *   - fact-propagation       write the agreed value into divergent claim citations
 *   - document-citations     pure matcher: section prose numbers → facts
 *   - document-binder        bind a fact to a CTD/IND document section
 *   - source-tracer          resolve fact/citation back to the source artifact
 *
 * See docs/architecture/LIVING_RECORD_SPINE.md.
 */

export * from './object-model';
export * from './claim-lifecycle';
export * from './value-reconciliation';
export * from './canonical-fact-store';
export * from './sequence-store';
export * from './program-link';
export * from './fact-change';
export * from './fact-propagation';
export * from './document-citations';
export * from './document-binder';
export * from './source-tracer';
export {
  applyFactChange,
  establishGovernedFact,
  factHistory,
  previewFactChange,
  type ApplyFactChangeParams,
  type ApplyFactChangeResult,
  type EstablishFactParams,
  type EstablishFactResult,
  type FactChangePreview,
  type FactHistoryEntry,
} from './fact-change-orchestrator';
export {
  reconcileClaim,
  reconcileClaimById,
  reconcileProgramClaims,
  runDriftSentinel,
  type ReconcileClaimParams,
  type ReconcileClaimOutcome,
  type ReconcileClaimByIdOutcome,
  type ReconcileProgramResult,
  type DriftSentinelReport,
  type DriftSentinelResultItem,
} from './reconciliation-engine';
