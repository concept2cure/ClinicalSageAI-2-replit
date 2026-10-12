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
  /**
   * What taking this position commits the programme to, in one line — the
   * consequence, not a restatement of the label. A person choosing between
   * 505(b)(1) and 505(b)(2), or between a 510(k) and a De Novo, is choosing
   * what evidence they will owe and whose data they may rely on; the option
   * should say that much before they pick it.
   */
  commits?: string;
  /**
   * What makes this a real position: the part, annex or guideline it comes
   * from (e.g. '21 CFR 314.54', 'ICH M4Q', 'MDR Annex IX'). Never a model's
   * paraphrase — these are written in the flow or the governed catalogue.
   */
  authority?: string;
}

/**
 * The value a field carries when the person took a position the list did not
 * offer. No listed option may use it; an invariant test over every flow holds
 * that. Their words travel beside it, under {@link otherFieldId}.
 */
export const OTHER_POSITION = '__other__';

/** Where the person's own words for `fieldId` are carried in an answer. */
export function otherFieldId(fieldId: string): string {
  return `${fieldId}__other`;
}

/** The most AnA will take as a position written in the person's own words. */
export const OWN_POSITION_MAX_CHARS = 2_000;

/**
 * A question's list is rarely the whole world. Where a field declares this,
 * the person may take a position of their own and write it down, and AnA
 * records it as their wording rather than as one of the positions she offered
 * (founder's directive, 2026-10-12).
 *
 * Absent, the list is closed: an unlisted answer is refused, and the refusal
 * says the list is closed rather than calling the person's answer invalid.
 */
export interface OwnPositionAllowed {
  /** The label on the escape hatch. Default: 'Something else'. */
  label?: string;
  /** What AnA needs in their own words. Shown beside the box, and in the refusal when it is empty. */
  prompt?: string;
  /** Whether words are required when this is chosen. Default true: an unexplained 'other' is not an answer. */
  required?: boolean;
}

export interface QuestionField {
  id: string;
  label: string;
  type: QuestionFieldType;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  options?: QuestionOption[];
  /** The person may take a position this list does not offer (see OwnPositionAllowed). */
  allowOther?: OwnPositionAllowed;
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
  /**
   * Who the flow is for. 'ivd' is its own value: a diagnostics programme files
   * 510(k)s and PMAs like a device but classifies and performs like an assay,
   * and before this it had no value at all — so it was coerced to 'pharma' and
   * the device flows became unavailable to it (founder's directive, 2026-10-12).
   * An empty array means no restriction.
   */
  clientTypes: Array<'pharma' | 'biotech' | 'medtech' | 'ivd'>;
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
  /**
   * Positions the person wrote themselves, keyed nodeId → fieldId → their
   * words. Kept apart from `answers` on purpose: a consumer reading `answers`
   * sees OTHER_POSITION and cannot mistake their wording for a position AnA
   * offered, and a document built from this interview can say which answers
   * were the person's own.
   */
  ownWords?: Record<string, Record<string, string>>;
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
  /** Positions the person wrote themselves (FlowState.ownWords). */
  ownWords?: Record<string, Record<string, string>>;
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

/* ─── War Game types (shared with client for report rendering) ─────── */

export type WarGameCategory =
  | 'protocol'
  | 'ind'
  | 'csr'
  | '510k'
  | 'cer'
  | 'sop'
  | 'nda'
  | 'bla'
  | 'pma'
  | 'cmc'
  | 'risk_management'
  | 'safety_narrative'
  | 'labeling'
  | 'briefing_book'
  | 'stability';

export type AuditDimension =
  | 'completeness'
  | 'consistency'
  | 'regulatory_alignment'
  | 'scientific_rigor'
  | 'practical_feasibility'
  | 'documentation'
  | 'risk_identification';

export interface WarGameFinding {
  id: string;
  dimension: AuditDimension;
  severity: IssueSeverity;
  title: string;
  question: string;
  observation: string;
  requirement: string;
  reference: string;
  recommendation: string;
  relatedFields: string[];
}

export interface WarGameReport {
  id: string;
  category: WarGameCategory;
  sourceFlowId: string;
  timestamp: string;
  overallScore: number;
  overallAssessment: 'audit_ready' | 'needs_work' | 'significant_gaps' | 'not_ready';
  findings: WarGameFinding[];
  dimensionScores: Record<AuditDimension, { score: number; findingCount: number }>;
  executiveSummary: string;
  topPriorities: string[];
  regulatoryRiskLevel: 'low' | 'moderate' | 'high' | 'critical';
}

export interface RiskScoreResult {
  score: number;
  level: 'low' | 'moderate' | 'high' | 'critical';
  breakdown: { critical: number; warning: number; info: number };
}
