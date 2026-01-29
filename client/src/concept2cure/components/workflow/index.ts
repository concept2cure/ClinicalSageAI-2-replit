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

// Timeline & Progress
export { WorkflowTimeline } from './WorkflowTimeline';
export type { WorkflowTimelineProps, WorkflowStep, WorkflowPhase } from './WorkflowTimeline';

// Step Details
export { StepCard } from './StepCard';
export type { StepCardProps } from './StepCard';

// Preconditions
export { PreconditionBadges, PreconditionInlineSummary } from './PreconditionBadges';
export type { PreconditionBadgesProps, Precondition } from './PreconditionBadges';

// Actions Dashboard
export { NextActionsPanel, ActionStatsBar } from './NextActionsPanel';
export type { NextActionsPanelProps, ActionableStep } from './NextActionsPanel';
