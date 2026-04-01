/**
 * Concept2Cure Client Portal V2 - Main Index
 *
 * Central export point for all portal-v2 components, hooks, and utilities.
 *
 * Usage:
 * ```tsx
 * import { ClientPortalV2, usePortal, PortalFrame } from '@/portal-v2';
 * ```
 */

/**
 * @deprecated Stage 2 beta cleanup fence.
 *
 * This barrel still re-exports the full `ClientPortalV2` tree for compatibility.
 * Treat it as non-canonical until `/client-portal/*` ownership is explicitly
 * resolved in the root app shell.
 */
// Main application component
export { ClientPortalV2, default } from './ClientPortalV2';

// Core types and utilities
export type {
  UserRole,
  RegulatoryAgency,
  ModuleId,
  ModuleCategory,
  ExperienceConfig,
  FeatureFlags,
  DocumentSummary,
  TaskSummary,
  TaskPriority,
  TaskStatus,
  Priority,
  AIMessage,
  Notification,
  NotificationCategory,
  NotificationAction,
  ProjectSummary,
  SubmissionTimeline,
  TimelinePhase,
  TeamActivity,
  PortalUser,
  ProductType,
  SubmissionType,
  DocumentStatus,
  StudyPhase,
  ProjectStatus,
} from './core/portalTypes';

export {
  ROLE_DISPLAY_MAP,
  AGENCY_INFO_MAP,
  TASK_PRIORITY_CONFIG,
  TASK_STATUS_CONFIG,
} from './core/portalTypes';

// Module registry
export {
  MODULE_REGISTRY,
  CATEGORY_REGISTRY,
  ROLE_MODULE_PRESETS,
  hasModuleAccess,
  getAccessibleModules,
  getNavigationSections,
} from './core/moduleRegistry';

// Portal policy
export {
  getExperienceConfig,
  hasPermission,
  getRolePermissions,
  canPerformAction,
  AGENCY_WORKFLOW_CONFIGS,
} from './core/portalPolicy';
export type { Permission } from './core/portalPolicy';

// Context and hooks
export {
  PortalProvider,
  usePortal,
  usePermission,
  useModuleAccess,
  useModuleAccessFor,
  useActiveModule,
  useNotifications,
  useTasks,
} from './core/portalContext';

// Layout components
export { PortalFrame, TopBar, SidebarNav, MobileNav } from './layouts';

// Dashboard components
export {
  UnifiedDashboard,
  ExecutiveDashboard,
  RegulatoryLeadDashboard,
  ClinicalOpsDashboard,
} from './components/dashboards';

// Feature components
export { DocumentVault } from './components/vault';
export { AIAssistant } from './components/ai-assistant';
export { WorkflowDashboard } from './components/workflows';

// ═══════════════════════════════════════════════════════════════════════════════
// CORTEX PRIME AI INTEGRATION
// Enterprise Knowledge Graph & Regulatory Intelligence
// ═══════════════════════════════════════════════════════════════════════════════

// Cortex client service and error handling
export {
  CortexClient,
  cortexClient,
  CortexError,
  CORTEX_ERROR_CODES,
} from './services/cortexClient';

// Cortex type definitions - aligned with backend
export type {
  // Core entities
  CortexAtom,
  CortexEdge,
  CortexAgent,
  CortexThread,
  CortexTrace,

  // Search & query
  CortexSearchResult,
  TraversalResult,

  // Regulatory intelligence
  RegulatorySignal,
  IntuitionPrediction,
  AdvisoryResult,
  UncertaintyEstimate,
  CausalEffect,

  // Status & stats
  CortexHealth,
  CortexStats,
  GraphStats,

  // Request options
  SearchOptions,
  CreateThreadOptions,
  CreateAtomOptions,
  TraversalOptions,
  PredictionOptions,

  // Error handling
  CortexErrorCode,
} from './services/cortexClient';

// Cortex React Query hooks
export {
  // Query key factory
  cortexKeys,

  // Combined convenience hook
  useCortex,

  // Health & status hooks
  useCortexHealth,
  useCortexStats,
  useCortexGraphStats,

  // Search hooks
  useCortexSearch,
  useCortexSearchMutation,
  useCortexEmbed,

  // Atom hooks
  useCortexAtom,
  useCortexAtomEdges,
  useCreateCortexAtom,
  useUpdateCortexAtom,
  useDeactivateCortexAtom,

  // Edge hooks
  useCreateCortexEdge,

  // Thread hooks
  useCortexThread,
  useCortexThreadTraces,
  useCreateCortexThread,
  useCreateCortexTrace,
  useAssembleCortexContext,

  // Advisory & prediction hooks
  useCortexAdvisory,
  useCortexPrediction,
  useCortexSignals,
  useCortexPatternMatch,

  // Graph traversal hooks
  useCortexTraverse,

  // Uncertainty hooks
  useCortexUncertainty,
} from './hooks/useCortex';
