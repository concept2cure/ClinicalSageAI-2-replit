/**
 * AnA Intelligence Questions — shared type definitions.
 *
 * These types define the contract between the server-side question engine
 * and the client-side rendering layer. Questions flow as SSE events through
 * the existing AnA stream; answers return as follow-up messages that the
 * orchestrator routes to the answer_intelligence_question tool.
 *
 * @module shared/types/intelligence-questions
 */

/* ─── Question field types ──────────────────────────────────────────── */

export type QuestionFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'yes_no'
  | 'radio'
  | 'checkbox'
  | 'file_upload'
  | 'country_select'
  | 'agency_select';

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
  /** When true, selecting this option triggers an issue flag. */
  flagsIssue?: boolean;
}

export interface QuestionField {
  id: string;
  label: string;
  type: QuestionFieldType;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  options?: QuestionOption[];
  validation?: FieldValidation;
  /** Default value pre-filled from project context or prior answers. */
  defaultValue?: string | string[] | number | boolean;
  /** Condition that must be met for this field to be visible. */
  visibleWhen?: FieldPredicate;
}

export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  patternMessage?: string;
}

/* ─── Predicates for branching ──────────────────────────────────────── */

export interface FieldPredicate {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'lt' | 'contains' | 'exists';
  value: string | string[] | number | boolean;
}

export interface BranchRule {
  when: FieldPredicate;
  goto: string;
}

/* ─── Question node (one step in a flow) ────────────────────────────── */

export interface QuestionNode {
  id: string;
  /** Section/group label shown above the question. */
  section: string;
  /** The main question text AnA asks. */
  question: string;
  /** Additional context AnA provides (regulatory guidance, tips). */
  guidance?: string;
  /** Fields the user fills in for this question. */
  fields: QuestionField[];
  /** Branching rules evaluated top-to-bottom; first match wins. */
  branches?: BranchRule[];
  /** Default next node if no branch matches. Null = end of flow. */
  defaultNext?: string | null;
  /** Issue checks run after this question is answered. */
  issueChecks?: IssueCheck[];
  /** Whether AnA should provide expert commentary on the answer. */
  provideExpertFeedback?: boolean;
}

/* ─── Issue detection ────────────────────────────────────────────────── */

export type IssueSeverity = 'info' | 'warning' | 'critical';

export interface IssueCheck {
  id: string;
  condition: FieldPredicate;
  severity: IssueSeverity;
  title: string;
  message: string;
  /** Regulatory reference (ICH guideline, FDA guidance, etc.). */
  reference?: string;
}

export interface DetectedIssue {
  checkId: string;
  severity: IssueSeverity;
  title: string;
  message: string;
  reference?: string;
  /** The question node that triggered this issue. */
  questionId: string;
  /** The answer value(s) that triggered this issue. */
  triggerValues: Record<string, unknown>;
}

/* ─── Flow definition ────────────────────────────────────────────────── */

export type FlowCategory =
  | 'protocol_development'
  | 'csr_report'
  | 'ind_submission'
  | 'nda_submission'
  | 'bla_submission'
  | 'sop_development'
  | 'device_510k'
  | 'device_pma'
  | 'cer_report'
  | 'briefing_book'
  | 'safety_narrative'
  | 'labeling'
  | 'risk_management'
  | 'cmc_specification'
  | 'stability_study'
  | 'project_setup';

export interface FlowDefinition {
  id: string;
  category: FlowCategory;
  name: string;
  description: string;
  /** Which client types this flow applies to. Empty = all. */
  clientTypes: Array<'pharma' | 'biotech' | 'medtech'>;
  /** Starting node id. */
  entryNode: string;
  /** All question nodes in this flow. */
  nodes: QuestionNode[];
  /** Estimated time to complete. */
  estimatedMinutes?: number;
  /** Sections for progress tracking. */
  sections: FlowSection[];
}

export interface FlowSection {
  id: string;
  label: string;
  /** Node ids that belong to this section. */
  nodeIds: string[];
}

/* ─── Runtime flow state ─────────────────────────────────────────────── */

export interface FlowState {
  flowId: string;
  flowCategory: FlowCategory;
  /** Current question node id. */
  currentNodeId: string;
  /** All collected answers keyed by nodeId → { fieldId: value }. */
  answers: Record<string, Record<string, unknown>>;
  /** Node ids that have been completed. */
  completedNodes: string[];
  /** Issues detected so far. */
  issues: DetectedIssue[];
  /** Timestamp when the flow was started. */
  startedAt: string;
  /** Whether the flow is complete. */
  complete: boolean;
  /** Section-level progress. */
  sectionProgress: Record<string, { total: number; completed: number }>;
}

/* ─── SSE event payloads ─────────────────────────────────────────────── */

/** Sent as `intelligence_question` SSE event data. */
export interface IntelligenceQuestionEvent {
  flowId: string;
  flowName: string;
  flowCategory: FlowCategory;
  /** Current question node to render. */
  node: QuestionNode;
  /** Progress through the flow. */
  progress: {
    currentSection: string;
    completedNodes: number;
    totalNodes: number;
    sections: Array<{ id: string; label: string; total: number; completed: number }>;
  };
  /** Issues detected from previous answers (if any). */
  newIssues?: DetectedIssue[];
  /** All issues accumulated so far. */
  allIssues?: DetectedIssue[];
  /** Expert commentary on the previous answer (if provideExpertFeedback was true). */
  expertFeedback?: string;
  /** Whether this is the first question in the flow. */
  isFirst: boolean;
  /** Whether this is the last question in the flow. */
  isLast: boolean;
}

/** Sent as `intelligence_flow_complete` SSE event data. */
export interface IntelligenceFlowCompleteEvent {
  flowId: string;
  flowName: string;
  flowCategory: FlowCategory;
  /** All collected answers. */
  answers: Record<string, Record<string, unknown>>;
  /** All issues detected. */
  issues: DetectedIssue[];
  /** Summary of what was collected. */
  summary: string;
  /** Suggested next actions (e.g., "Generate Protocol Document"). */
  suggestedActions: Array<{
    label: string;
    actionType: string;
    description: string;
  }>;
}

/** Shape of the structured answer the client sends back. */
export interface IntelligenceAnswerPayload {
  flowId: string;
  nodeId: string;
  answers: Record<string, unknown>;
}
