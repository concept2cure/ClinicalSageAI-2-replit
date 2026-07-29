
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('index');
/**
 * Orchestration System — Phase 3 Entry Point
 *
 * Import this module to activate the orchestration engine,
 * workflow templates, and supporting services.
 */

// Core orchestrator
export {
  executeWorkflow,
  cancelWorkflow,
  getWorkflowExecution,
  getProjectWorkflows,
  getRegisteredTemplates,
  getWorkflowTemplate,
  registerWorkflowTemplate,
} from './workflow-orchestrator';

// Cross-object resolver
export {
  assembleCrossObjectPayload,
  summarizePayloadForAI,
} from './cross-object-resolver';

// Recommendation engine
export { generateRecommendations } from './recommendation-engine';

// Readiness engine
export { computeReadinessAssessment } from './readiness-engine';

// Continuity service
export {
  generateContinuitySnapshot,
  getLatestSnapshot,
} from './continuity-service';

// Load workflow templates (side-effect imports)
import './templates/submission-readiness-review';
import './templates/draft-validate-route';
import './templates/project-blocker-scan';

// Re-export key types
export type {
  WorkflowTemplateId,
  WorkflowExecution,
  WorkflowExecutionRequest,
  WorkflowResult,
  CrossObjectReasoningPayload,
  Recommendation,
  RecommendationSet,
  ReadinessAssessment,
  ProjectContinuitySnapshot,
} from '../../../shared/types/orchestration';

logger.info('Phase 3 orchestration system loaded');
