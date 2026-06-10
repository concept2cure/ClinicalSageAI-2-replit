/**
 * Living Record Spine — service barrel.
 *
 * The value layer underneath the existing living-file cascade:
 *   - object-model        the explicit spine graph (nodes, edges, the chain)
 *   - claim-lifecycle     the Claim state machine (content + verification axes)
 *   - value-reconciliation pure comparison + reconcile/drift logic
 *   - canonical-fact-store persistence for facts, bindings, drift
 *   - reconciliation-engine reconcile-on-write + the Drift Sentinel job
 *
 * See docs/architecture/LIVING_RECORD_SPINE.md.
 */

export * from './object-model';
export * from './claim-lifecycle';
export * from './value-reconciliation';
export * from './canonical-fact-store';
export * from './sequence-store';
export * from './program-link';
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
