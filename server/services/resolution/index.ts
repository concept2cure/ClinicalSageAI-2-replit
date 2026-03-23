/**
 * Resolution Orchestration Layer — Sprint 4
 *
 * Barrel export for all resolution services.
 *
 * @module server/services/resolution
 */

// Resolution Planning
export {
  createResolutionPlan,
  getResolutionPlan,
  getProjectResolutionPlans,
  getUnresolvedPlans,
} from './resolution-planner';

// Affected-Object Clustering
export {
  clusterAffectedObjects,
} from './cluster-engine';

// Resolution Bundles
export {
  createResolutionBundle,
  getResolutionBundle,
  getProjectBundles,
  transitionBundleState,
  updateBundleItemStatus,
  addBundleItem,
  createBundleFromPlan,
} from './bundle-builder';

// Supersession Engine
export {
  recordSupersession,
  confirmSupersession,
  revertSupersession,
  getObjectSupersessions,
  getSupersessionChain,
  isSuperseded,
  getCurrentVersion,
  getProjectSupersessions,
} from './supersession-engine';

// Reapproval Engine
export {
  determineReapprovalRequirements,
  checkPromotionBlock,
} from './reapproval-engine';

// Rewrite Coordinator
export {
  identifyRewriteTargets,
  prepareHarmonizationActions,
  validateRewriteReadiness,
} from './rewrite-coordinator';

// Resolution State Machine
export {
  transitionResolutionState,
  validateTransition,
  getValidTransitions,
  isTerminalState,
  isResolved,
  isActive,
} from './resolution-state-machine';

// Bundle Executor
export {
  executeBundle,
} from './bundle-executor';

// AnA Resolution Support
export {
  explainResolutionPlan,
  summarizeResolutionBundle,
  buildAnaResolutionContext,
} from './ana-resolution-support';

// AnA Resolution Orchestrator
export {
  orchestrateResolution,
} from './ana-resolution-orchestrator';
