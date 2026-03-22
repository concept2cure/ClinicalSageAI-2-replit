/**
 * AnA RI — Regulatory Intelligence Copilot
 *
 * Central exports for the AnA 1.0 RI intelligence layer.
 *
 * @module server/services/ana-ri
 */

export { buildAnaRISystemPrompt, type AnaRIPromptOptions, type IntentLens, type UserRole } from './persona.js';
export { orchestrate, detectIntent, detectSubmissionType, type OrchestratorInput, type OrchestratorOutput } from './orchestrator.js';
export { DEFICIENCY_TAXONOMY, getDeficienciesBySubmissionType, getCriticalDeficiencies, getDeficiencyById, getDeficiencyCategories, buildDeficiencyContext, type DeficiencyPattern, type SubmissionType, type Severity } from './deficiency-taxonomy.js';
export { DOCUMENT_ACTIONS, getActionsForLens, getAllActions, getAction, buildDocumentActionContext, type DocumentActionType, type DocumentAction } from './document-actions.js';
export { ROLE_TEMPLATES, buildRoleAdaptiveContext, getRoleTemplate, inferRole, type RoleResponseTemplate } from './role-adapter.js';
export { evaluateResponse, getFullRubric, EVALUATION_RUBRIC, type EvaluationResult, type QualityDimension } from './evaluation.js';
