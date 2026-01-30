/**
 * Concept2Cure Hooks
 * 
 * Centralized exports for all custom hooks.
 * @version 3.0.0
 */

// Legacy chat hook (uses local state + API fallback)
export { useChat, useThread } from './useChat';

// Project management
export { useProjects, useProject } from './useProjects';

// Template system
export { useTemplates, useTemplate } from './useTemplates';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5: INTELLIGENT DOCUMENT SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Source Documents
  useSourceDocuments,
  useCreateSourceDocument,
  useUpdateSourceDocument,
  
  // Traceability Links
  useTraceabilityLinks,
  useCreateTraceabilityLink,
  useVerifyTraceabilityLink,
  
  // Change Propagation
  usePropagationEvents,
  useImpactedSections,
  useResolvePropagationEvent,
  
  // Compliance
  useCalculateCompliance,
  useComplianceHistory,
  useComplianceRules,
  
  // Composite hooks
  useDocumentCompliance,
  useDocumentTraceability,
  
  // Query keys (for cache invalidation)
  intelligentDocsKeys,
  
  // Types
  type SourceDocument,
  type TraceabilityLink,
  type PropagationEvent,
  type ImpactedSection,
  type ComplianceScore,
  type ComplianceRule,
} from './useIntelligentDocs';

// ─────────────────────────────────────────────────────────────────────────────
// CORTEX INTEGRATION (Lumen Cortex + Project Cortex)
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Health & Status
  useCortexHealth,
  useCortexStats,
  
  // Chat / AI
  useCortexChat,
  
  // Search
  useCortexSearch,
  useCortexSearchMutation,
  
  // Threads
  useCortexThreads,
  useCortexThread,
  useDeleteCortexThread,
  
  // Regulatory Intelligence
  useCortexSignals,
  useCortexPredictions,
  useCortexAdvisory,
  
  // Composite
  useCortex,
} from './useCortex';

// ─────────────────────────────────────────────────────────────────────────────
// ZEN UI ORCHESTRATION
// ─────────────────────────────────────────────────────────────────────────────

export {
  useZenActions,
  type ZenActionId,
  type ZenActionResult,
  type UseZenActionsReturn,
} from './useZenActions';

// ─────────────────────────────────────────────────────────────────────────────
// SESSION & WORKFLOW PERSISTENCE (Claude.ai style)
// ─────────────────────────────────────────────────────────────────────────────

export {
  useSessionRestore,
  type SessionState,
  type SessionHistory,
} from './useSessionRestore';

// ─────────────────────────────────────────────────────────────────────────────
// ENTERPRISE HOOKS - Phase 52 Sherpa System
// ─────────────────────────────────────────────────────────────────────────────

// Regulatory Intelligence Hooks
export {
  useMorningBriefing,
  useRealTimeAlerts,
  useMAUDESearch,
  useRecalls,
  usePDUFADates,
  useGuidances,
  useRegulatoryDashboard,
} from './useRegulatoryIntelligence';

// Medical Device Hooks
export {
  usePredicateSearch,
  usePredicateWorkflow,
  usePredicateComparison,
  useSubmissions,
  useSubmission510k,
  useHazardAnalysis,
  useMAUDEAlerts,
  useMedicalDeviceDashboard,
} from './useMedicalDevice';

// Document Intelligence Hooks
export {
  useDocument,
  useDocuments,
  useDocumentEditor,
  useSmartTags,
  useCitations,
  useDocumentValidation,
  useApprovalWorkflow,
  useContentGeneration,
} from './useDocumentIntelligence';

// CMC Hooks
export {
  useCMCWizard,
  useICHGuardrails,
  useSpecifications,
  useSpecification,
  useStabilityProtocols,
  useStabilityStudies,
  useBatchRecords,
  useCMCDashboard,
} from './useCMC';
