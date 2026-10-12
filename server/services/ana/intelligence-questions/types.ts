/**
 * Server-side types for the AnA Intelligence Question Engine.
 *
 * Re-exports shared types and adds server-only extensions (context,
 * handler signatures, persistence shapes).
 *
 * @module server/services/ana/intelligence-questions/types
 */

export type {
  QuestionFieldType,
  QuestionOption,
  PositionAvailability,
  PositionCaution,
  QuestionField,
  FieldValidation,
  FieldPredicate,
  BranchRule,
  QuestionNode,
  IssueSeverity,
  IssueCheck,
  DetectedIssue,
  FlowCategory,
  FlowDefinition,
  FlowSection,
  FlowState,
  IntelligenceQuestionEvent,
  IntelligenceFlowCompleteEvent,
  IntelligenceAnswerPayload,
} from '../../../../shared/types/intelligence-questions.js';

import type { FlowState } from '../../../../shared/types/intelligence-questions.js';

/** Context passed to the engine from the stream handler. */
export interface FlowEngineContext {
  organizationId: number | string | null;
  userId: number | string | null;
  projectId: string | null;
  projectName?: string | null;
  /**
   * The client's segment, or null when it is not known. Null means NO
   * restriction: a wrong segment silently hides whole flows (a device client
   * read as 'pharma' could not start the 510(k) interview at all), so not
   * knowing must be said rather than guessed.
   */
  clientType?: 'pharma' | 'biotech' | 'medtech' | 'ivd' | null;
  submissionType?: string | null;
  threadId?: string | null;
}

/** Result of starting or advancing a flow. */
export interface FlowStepResult {
  state: FlowState;
  event: import('../../../../shared/types/intelligence-questions.js').IntelligenceQuestionEvent | null;
  completeEvent: import('../../../../shared/types/intelligence-questions.js').IntelligenceFlowCompleteEvent | null;
  expertFeedback?: string;
}

/** A registered flow factory — produces a FlowDefinition, optionally
 *  customized for the given context. */
export type FlowFactory = (ctx: FlowEngineContext) => import('../../../../shared/types/intelligence-questions.js').FlowDefinition;
