/**
 * AnA RI — Regulatory Intelligence Copilot
 *
 * Central exports for the AnA 1.0 RI intelligence layer.
 *
 * @module server/services/ana-ri
 */

export {
  buildAnaRISystemPrompt,
  type AnaRIPromptOptions,
  type IntentLens,
  type UserRole,
} from './persona.js';
export {
  orchestrate,
  detectIntent,
  detectSubmissionType,
  type OrchestratorInput,
  type OrchestratorOutput,
} from './orchestrator.js';
export {
  DEFICIENCY_TAXONOMY,
  getDeficienciesBySubmissionType,
  getCriticalDeficiencies,
  getDeficiencyById,
  getDeficiencyCategories,
  buildDeficiencyContext,
  type DeficiencyPattern,
  type SubmissionType,
  type Severity,
} from './deficiency-taxonomy.js';
export {
  DOCUMENT_ACTIONS,
  getActionsForLens,
  getAllActions,
  getAction,
  buildDocumentActionContext,
  type DocumentActionType,
  type DocumentAction,
} from './document-actions.js';
export {
  ROLE_TEMPLATES,
  buildRoleAdaptiveContext,
  getRoleTemplate,
  inferRole,
  type RoleResponseTemplate,
} from './role-adapter.js';
export {
  evaluateResponse,
  getFullRubric,
  EVALUATION_RUBRIC,
  type EvaluationResult,
  type QualityDimension,
} from './evaluation.js';
export {
  generateArtifact,
  getArtifactTypes,
  type ArtifactGenerationRequest,
  type ArtifactGenerationResult,
} from './artifact-generator.js';
export {
  validateResponseStructure,
  checkEvidenceDiscipline,
  validateArtifactQuality,
  logGeneration,
  getGenerationLog,
  getGenerationStats,
  buildArtifactContract,
  type StructureValidationResult,
  type EvidenceDisciplineResult,
  type ArtifactQualityResult,
  type GenerationEvent,
  type GovernedArtifactContract,
} from './enforcement.js';
export {
  createProject,
  listProjects,
  updateProject,
  createArtifact,
  updateArtifact,
  updateArtifactStatus,
  listArtifacts,
  placeInDossier,
  createTask,
  updateTask,
  listTasks,
  checkDossierReadiness,
  createSubmissionPackage,
  createReviewThread,
  addReviewComment,
  searchArtifacts,
  listTeamMembers,
  listArtifactVersions,
  runComplianceScan,
  exportArtifact,
  compareVersions,
  reviewVersionImpact,
  createMilestone,
  updateMilestone,
  listMilestones,
  revertToVersion,
  loadUserContext,
  loadConversationHistory,
  buildCommandContextForPrompt,
  COMMAND_REGISTRY,
  type CommandContext,
  type CommandResult,
  type CommandName,
} from './command-executor.js';
export {
  enrichContextForChat,
  detectSlashCommand,
  detectAppMention,
  KNOWN_APPS,
  SUPPORTED_SLASH_COMMANDS,
} from './context-enrichment.js';
export { validateEvidence, quickEvidenceCheck } from './evidence-validation.js';
export {
  evaluateMemoryCandidate,
  checkForContradictions,
  type MemoryCandidate,
  type MemoryProvenance,
  type ContradictionCheckResult,
} from './memory-acceptance.js';
export {
  type AnaCanonicalResponse,
  type EvidenceVerdict,
  type QueueMeta,
  type AnaOrchestrationMeta,
  type MemoryMetadata,
  buildQueueMeta,
  buildFallbackMarker,
  buildEmptyEvidenceVerdict,
} from './response-contract.js';
export {
  buildGovernedContextEnvelope,
  formatFabricStateForPrompt,
  type GovernedContextEnvelope,
} from './governed-context-envelope.js';
export {
  ICH_GUIDELINES,
  ICH_IMPLEMENTING_REGULATORS,
  getGuideline,
  guidelinesByCategory,
  guidelinesForSegment,
  searchGuidelines,
  buildIchGuidelineBlock,
  ichCorpusSummary,
  type IchGuideline,
  type IchCategory,
  type IchStatus,
  type IchCorpusSummary,
} from './ich-guideline-corpus.js';
export {
  REGULATORY_PATHWAYS,
  getPathway,
  pathwaysByAgency,
  pathwaysByKind,
  searchPathways,
  buildPathwaysBlock,
  pathwaysSummary,
  type RegulatoryPathway,
  type PathwayAgency,
  type PathwayKind,
  type PathwaysSummary,
} from './regulatory-pathways-corpus.js';
