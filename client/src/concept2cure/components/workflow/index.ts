/**
 * Workflow Components - Phase 4 Implementation
 *
 * Exports all workflow-related UI components for the
 * Concept2Cure Workflow Orchestration Engine.
 *
 * Three Pillars Implemented:
 * 🔐 Trust Rails - Hash-chained audit trails
 * 📜 Workflow-as-Contract - Preconditions & effects
 * 💎 Submission-as-Asset - Lifecycle state machine
 */

// Dossier map
export { DossierMap } from './DossierMap';
export type { DossierSection } from './DossierMap';

// Project home dashboard
export { ProjectHomeDashboard } from './ProjectHomeDashboard';

// Section workspace
export { SectionWorkspace } from './SectionWorkspace';
export type {
  SectionMeta,
  SectionIssue,
  SectionEvidence,
  VersionEntry,
} from './SectionWorkspace';
