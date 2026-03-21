/**
 * AI Action System — Entry Point
 *
 * Imports the registry and all handlers to register them at startup.
 * Import this module once in server/index.ts to activate the action system.
 */

// Registry and dispatcher
export {
  registerActionHandler,
  dispatchAction,
  getRegisteredActions,
  getActionMetrics,
} from './action-registry';
export type { DispatchOptions } from './action-registry';

// Shared utilities
export {
  fetchArtifact,
  fetchDocument,
  fetchContentForProcessing,
  isValidActionType,
  isValidSourceSurface,
  isValidDocumentStatus,
  isValidModuleType,
  checkActionPermission,
} from './shared-utils';

// Load all handlers (side-effect imports that call registerActionHandler)
import './handlers/promote-artifact';
import './handlers/save-document-version';
import './handlers/run-validation';
import './handlers/refine-with-validation';
import './handlers/route-document';
import './handlers/export-document';
import './handlers/attach-sources';

// Re-export shared types for convenience
export type {
  AIActionType,
  AIActionRequest,
  AIActionResponse,
  AIActionHandler,
  AIActionExecutionContext,
  AIActionSourceSurface,
  ValidationFinding,
  ValidationReport,
  RefinementRequest,
} from '../../../shared/types/ai-actions';
