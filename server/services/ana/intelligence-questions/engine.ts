/**
 * AnA Intelligence Question Engine — core state machine.
 *
 * Manages flow lifecycle: start → ask → answer → branch → ask → … → complete.
 * Stateless — all state is carried in FlowState and persisted by the caller
 * (stream handler stores it in the thread metadata row).
 *
 * @module server/services/ana/intelligence-questions/engine
 */

import type {
  FlowDefinition,
  FlowState,
  FlowCategory,
  QuestionNode,
  DetectedIssue,
  FieldPredicate,
  IntelligenceQuestionEvent,
  IntelligenceFlowCompleteEvent,
} from './types.js';
import type { FlowEngineContext, FlowStepResult } from './types.js';
import { getFlowDefinition } from './flows/index.js';
import { runIssueChecks, runCrossNodeAnalysis } from './issue-detector.js';
import { validateAnswers } from './validators.js';

/* ─── Public API ─────────────────────────────────────────────────────── */

/**
 * Start a new intelligence questioning flow.
 * Returns the initial FlowState and the first question event.
 */
export function startFlow(
  category: FlowCategory,
  ctx: FlowEngineContext,
): FlowStepResult {
  const definition = getFlowDefinition(category, ctx);
  if (!definition) {
    throw new Error(`No flow definition found for category: ${category}`);
  }

  const entryNode = definition.nodes.find(n => n.id === definition.entryNode);
  if (!entryNode) {
    throw new Error(`Entry node "${definition.entryNode}" not found in flow "${definition.id}"`);
  }

  const sectionProgress: Record<string, { total: number; completed: number }> = {};
  for (const section of definition.sections) {
    sectionProgress[section.id] = { total: section.nodeIds.length, completed: 0 };
  }

  const state: FlowState = {
    flowId: definition.id,
    flowCategory: category,
    currentNodeId: definition.entryNode,
    answers: {},
    completedNodes: [],
    issues: [],
    startedAt: new Date().toISOString(),
    complete: false,
    sectionProgress,
  };

  const event = buildQuestionEvent(definition, state, entryNode, undefined, undefined, true);

  return { state, event, completeEvent: null };
}

/**
 * Advance the flow with an answer to the current question.
 * Validates the answer, runs issue checks, resolves the next node,
 * and returns the updated state + next question event (or complete event).
 */
export function advanceFlow(
  state: FlowState,
  nodeId: string,
  answers: Record<string, unknown>,
  ctx: FlowEngineContext,
): FlowStepResult {
  const definition = getFlowDefinition(state.flowCategory, ctx);
  if (!definition) {
    throw new Error(`Flow definition not found for: ${state.flowCategory}`);
  }

  const currentNode = definition.nodes.find(n => n.id === nodeId);
  if (!currentNode) {
    throw new Error(`Node "${nodeId}" not found in flow "${definition.id}"`);
  }

  // Validate answers
  const validationErrors = validateAnswers(currentNode, answers);
  if (validationErrors.length > 0) {
    // Return the same question with validation errors surfaced as issues
    const validationIssues: DetectedIssue[] = validationErrors.map(err => ({
      checkId: `validation_${err.fieldId}`,
      severity: 'warning' as const,
      title: 'Validation',
      message: err.message,
      questionId: nodeId,
      triggerValues: { [err.fieldId]: answers[err.fieldId] },
    }));

    const event = buildQuestionEvent(definition, state, currentNode, validationIssues, undefined, false);
    return { state, event, completeEvent: null };
  }

  // Store answers
  const updatedAnswers = { ...state.answers, [nodeId]: answers };

  // Run issue checks (node-level + cross-node cumulative)
  const newIssues = runIssueChecks(currentNode, answers);
  const allIssues = [...state.issues, ...newIssues];

  // Run cross-node analysis with the updated state
  const crossNodeState: FlowState = { ...state, answers: updatedAnswers, issues: allIssues };
  const crossNodeIssues = runCrossNodeAnalysis(crossNodeState, definition);
  allIssues.push(...crossNodeIssues);
  newIssues.push(...crossNodeIssues);

  // Mark node complete
  const completedNodes = [...state.completedNodes, nodeId];

  // Update section progress
  const sectionProgress = { ...state.sectionProgress };
  for (const section of definition.sections) {
    if (section.nodeIds.includes(nodeId)) {
      sectionProgress[section.id] = {
        total: section.nodeIds.length,
        completed: section.nodeIds.filter(id => completedNodes.includes(id)).length,
      };
    }
  }

  // Resolve next node
  const nextNodeId = resolveNextNode(currentNode, answers, definition);

  if (!nextNodeId) {
    // Flow complete
    const completeState: FlowState = {
      ...state,
      answers: updatedAnswers,
      completedNodes,
      issues: allIssues,
      complete: true,
      sectionProgress,
      currentNodeId: nodeId,
    };

    const completeEvent = buildCompleteEvent(definition, completeState);
    return { state: completeState, event: null, completeEvent };
  }

  const nextNode = definition.nodes.find(n => n.id === nextNodeId);
  if (!nextNode) {
    throw new Error(`Next node "${nextNodeId}" not found in flow "${definition.id}"`);
  }

  const updatedState: FlowState = {
    ...state,
    answers: updatedAnswers,
    completedNodes,
    issues: allIssues,
    currentNodeId: nextNodeId,
    sectionProgress,
  };

  const isLast = isTerminalNode(nextNode, definition);
  const event = buildQuestionEvent(
    definition,
    updatedState,
    nextNode,
    newIssues.length > 0 ? newIssues : undefined,
    undefined,
    false,
    isLast,
  );

  return { state: updatedState, event, completeEvent: null };
}

/**
 * Resume a flow from a persisted state — returns the current question event.
 */
export function resumeFlow(
  state: FlowState,
  ctx: FlowEngineContext,
): FlowStepResult {
  if (state.complete) {
    const definition = getFlowDefinition(state.flowCategory, ctx);
    if (!definition) throw new Error(`Flow not found: ${state.flowCategory}`);
    return { state, event: null, completeEvent: buildCompleteEvent(definition, state) };
  }

  const definition = getFlowDefinition(state.flowCategory, ctx);
  if (!definition) throw new Error(`Flow not found: ${state.flowCategory}`);

  const node = definition.nodes.find(n => n.id === state.currentNodeId);
  if (!node) throw new Error(`Current node "${state.currentNodeId}" not found`);

  const isFirst = state.completedNodes.length === 0;
  const isLast = isTerminalNode(node, definition);
  const event = buildQuestionEvent(definition, state, node, undefined, undefined, isFirst, isLast);

  return { state, event, completeEvent: null };
}

/**
 * List available flows for a given context.
 */
export function listAvailableFlows(ctx: FlowEngineContext): Array<{
  category: FlowCategory;
  name: string;
  description: string;
  estimatedMinutes?: number;
}> {
  // Import the registry to list flows
  const { getAvailableFlows } = require('./flows/index.js');
  return getAvailableFlows(ctx);
}

/* ─── Internal helpers ───────────────────────────────────────────────── */

function resolveNextNode(
  currentNode: QuestionNode,
  answers: Record<string, unknown>,
  definition: FlowDefinition,
): string | null {
  // Evaluate branch rules top-to-bottom
  if (currentNode.branches) {
    for (const branch of currentNode.branches) {
      if (evaluatePredicate(branch.when, answers)) {
        return branch.goto;
      }
    }
  }

  // Fall back to defaultNext
  if (currentNode.defaultNext !== undefined) {
    return currentNode.defaultNext;
  }

  // If no defaultNext specified, try the next node in definition order
  const currentIdx = definition.nodes.findIndex(n => n.id === currentNode.id);
  if (currentIdx >= 0 && currentIdx < definition.nodes.length - 1) {
    return definition.nodes[currentIdx + 1].id;
  }

  return null;
}

/**
 * Coerce a yes_no answer to a boolean for comparison against a boolean
 * predicate value. yes_no answers reach the engine as a real boolean from the
 * UI but as a string ('yes'/'no') from the AnA tool surface, and a strict
 * `'no' === false` is always false — which silently defeats every boolean gate,
 * including the critical GSPR-mapping conformity gate (`eq false`) and every
 * field `visibleWhen` (`eq true`). Recognised yes/no strings map to the boolean;
 * an unrecognised value is returned unchanged so a non-yes_no field still
 * compares by strict identity.
 */
function coerceForBooleanPredicate(actual: unknown): unknown {
  if (typeof actual === 'boolean') return actual;
  if (typeof actual === 'string') {
    const v = actual.trim().toLowerCase();
    if (v === 'yes' || v === 'true' || v === 'y' || v === '1') return true;
    if (v === 'no' || v === 'false' || v === 'n' || v === '0') return false;
  }
  return actual;
}

/**
 * Parse a number-field answer to a finite number for a numeric (gt/lt) predicate.
 * number answers reach the engine as a real number from the UI but as a string
 * ('4') from the AnA tool surface (a free-form `answers` object), and gt/lt
 * previously required `typeof actual === 'number'` — so a string answer silently
 * made every numeric gate return false. That defeats critical filing gates such
 * as `evaluator_years_experience lt 5`, `vigilance_reports gt 10`, and
 * `number_of_arms gt 3`. Returns null for anything not finitely numeric (an
 * empty or non-numeric answer is not a valid trigger; required-field validation
 * handles absence).
 */
function toFiniteNumber(actual: unknown): number | null {
  if (typeof actual === 'number') return Number.isFinite(actual) ? actual : null;
  if (typeof actual === 'string' && actual.trim() !== '') {
    const n = Number(actual);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function evaluatePredicate(
  pred: FieldPredicate,
  values: Record<string, unknown>,
): boolean {
  const actual = values[pred.field];

  switch (pred.operator) {
    case 'eq':
      return typeof pred.value === 'boolean'
        ? coerceForBooleanPredicate(actual) === pred.value
        : actual === pred.value;
    case 'neq':
      return typeof pred.value === 'boolean'
        ? coerceForBooleanPredicate(actual) !== pred.value
        : actual !== pred.value;
    case 'in':
      return Array.isArray(pred.value) && pred.value.includes(String(actual));
    case 'not_in':
      return Array.isArray(pred.value) && !pred.value.includes(String(actual));
    case 'gt': {
      const a = toFiniteNumber(actual);
      return a !== null && typeof pred.value === 'number' && a > pred.value;
    }
    case 'lt': {
      const a = toFiniteNumber(actual);
      return a !== null && typeof pred.value === 'number' && a < pred.value;
    }
    case 'contains':
      return typeof actual === 'string' && typeof pred.value === 'string' &&
        actual.toLowerCase().includes(pred.value.toLowerCase());
    case 'exists':
      return actual != null && actual !== '' && !(Array.isArray(actual) && actual.length === 0);
    default:
      return false;
  }
}

function isTerminalNode(node: QuestionNode, definition: FlowDefinition): boolean {
  if (node.defaultNext === null) return true;
  if (!node.branches && node.defaultNext === undefined) {
    const idx = definition.nodes.findIndex(n => n.id === node.id);
    return idx === definition.nodes.length - 1;
  }
  return false;
}

function buildQuestionEvent(
  definition: FlowDefinition,
  state: FlowState,
  node: QuestionNode,
  newIssues?: DetectedIssue[],
  expertFeedback?: string,
  isFirst = false,
  isLast = false,
): IntelligenceQuestionEvent {
  const currentSection = definition.sections.find(s => s.nodeIds.includes(node.id));

  // Apply field-level visibility predicates using accumulated answers
  const allAnswerValues = flattenAnswers(state.answers);
  const visibleFields = node.fields.filter(f => {
    if (!f.visibleWhen) return true;
    return evaluatePredicate(f.visibleWhen, allAnswerValues);
  });

  const nodeWithVisibleFields = { ...node, fields: visibleFields };

  return {
    flowId: definition.id,
    flowName: definition.name,
    flowCategory: definition.category,
    node: nodeWithVisibleFields,
    progress: {
      currentSection: currentSection?.label ?? '',
      completedNodes: state.completedNodes.length,
      totalNodes: definition.nodes.length,
      sections: definition.sections.map(s => ({
        id: s.id,
        label: s.label,
        total: s.nodeIds.length,
        completed: state.sectionProgress[s.id]?.completed ?? 0,
      })),
    },
    newIssues,
    allIssues: state.issues.length > 0 ? state.issues : undefined,
    expertFeedback,
    isFirst,
    isLast,
  };
}

function buildCompleteEvent(
  definition: FlowDefinition,
  state: FlowState,
): IntelligenceFlowCompleteEvent {
  const summary = buildFlowSummary(definition, state);
  const suggestedActions = buildSuggestedActions(definition, state);

  return {
    flowId: definition.id,
    flowName: definition.name,
    flowCategory: definition.category,
    answers: state.answers,
    issues: state.issues,
    summary,
    suggestedActions,
  };
}

function buildFlowSummary(definition: FlowDefinition, state: FlowState): string {
  const totalAnswered = state.completedNodes.length;
  const criticalIssues = state.issues.filter(i => i.severity === 'critical').length;
  const warnings = state.issues.filter(i => i.severity === 'warning').length;

  let summary = `Completed ${totalAnswered} questions for "${definition.name}".`;
  if (criticalIssues > 0) {
    summary += ` ${criticalIssues} critical issue(s) detected that need resolution.`;
  }
  if (warnings > 0) {
    summary += ` ${warnings} warning(s) to review.`;
  }
  if (criticalIssues === 0 && warnings === 0) {
    summary += ` No issues detected — ready to proceed with document generation.`;
  }

  return summary;
}

function buildSuggestedActions(
  definition: FlowDefinition,
  _state: FlowState,
): IntelligenceFlowCompleteEvent['suggestedActions'] {
  const actions: IntelligenceFlowCompleteEvent['suggestedActions'] = [];

  switch (definition.category) {
    case 'protocol_development':
      actions.push(
        { label: 'Generate Protocol Document', actionType: 'generate_document', description: 'Create a full protocol draft from collected information' },
        { label: 'Review Protocol Synopsis', actionType: 'review_synopsis', description: 'Generate a protocol synopsis for stakeholder review' },
      );
      break;
    case 'csr_report':
      actions.push(
        { label: 'Generate CSR Draft', actionType: 'generate_csr', description: 'Create a Clinical Study Report from collected data' },
        { label: 'Generate CSR Synopsis', actionType: 'generate_synopsis', description: 'Create the study synopsis section' },
      );
      break;
    case 'ind_submission':
      actions.push(
        { label: 'Draft IND Cover Letter', actionType: 'generate_ind_cover', description: 'Draft the IND cover letter (Form FDA 1571)' },
        { label: 'Assemble IND Module 2', actionType: 'assemble_module', description: 'Assemble the Clinical Overview and Summary' },
      );
      break;
    case 'sop_development':
      actions.push(
        { label: 'Generate SOP Document', actionType: 'generate_sop', description: 'Create a Standard Operating Procedure from the collected requirements' },
        { label: 'Generate SOP Training Plan', actionType: 'generate_training', description: 'Create the associated training plan' },
      );
      break;
    case 'device_510k':
      actions.push(
        { label: 'Generate 510(k) Summary', actionType: 'generate_510k_summary', description: 'Create the 510(k) summary document' },
        { label: 'Draft SE Comparison', actionType: 'generate_se_comparison', description: 'Generate the Substantial Equivalence comparison table' },
      );
      break;
    case 'cer_report':
      // Both actionTypes name REAL registered AnA tools (the old
      // generate_cer / generate_lit_search labels had no handler anywhere —
      // dead affordances). generate_document accepts document_type 'cer';
      // search_literature + record_literature run and persist the systematic
      // search. Guarded by the suggested-actions test in
      // __tests__/intelligence-flow-suggested-actions.test.ts.
      actions.push(
        { label: 'Generate CER Draft', actionType: 'generate_document', description: "Create the Clinical Evaluation Report draft from collected data (generate_document with document_type 'cer')" },
        { label: 'Run & Record Literature Search', actionType: 'search_literature', description: 'Run the systematic PubMed search (search_literature) and record the relevant hits to the corpus (record_literature)' },
      );
      break;
    case 'nda_submission':
      actions.push(
        { label: 'Generate NDA Module 2 Summaries', actionType: 'generate_nda_module2', description: 'Draft the Quality Overall Summary, Nonclinical Overview, and Clinical Overview' },
        { label: 'Assemble eCTD Submission', actionType: 'assemble_ectd', description: 'Assemble the electronic Common Technical Document for NDA filing' },
      );
      break;
    case 'bla_submission':
      actions.push(
        { label: 'Generate BLA Module 2 Summaries', actionType: 'generate_bla_module2', description: 'Draft the Quality Overall Summary and Clinical Overview for the BLA' },
        { label: 'Assemble BLA eCTD', actionType: 'assemble_bla_ectd', description: 'Assemble the electronic Common Technical Document for BLA filing' },
      );
      break;
    case 'device_pma':
      actions.push(
        { label: 'Generate PMA Summary', actionType: 'generate_pma_summary', description: 'Create the PMA summary of safety and effectiveness' },
        { label: 'Draft Panel Package', actionType: 'generate_panel_package', description: 'Generate the advisory panel submission package' },
      );
      break;
    case 'cmc_specification':
      actions.push(
        { label: 'Generate CMC Module 3', actionType: 'generate_cmc_module3', description: 'Draft the CTD Module 3 Quality section from collected specifications' },
        { label: 'Generate Specification Table', actionType: 'generate_spec_table', description: 'Create the drug substance and drug product specification tables' },
      );
      break;
    case 'risk_management':
      actions.push(
        { label: 'Generate Risk Management Report', actionType: 'generate_risk_report', description: 'Create the risk management report per ISO 14971' },
        { label: 'Generate Risk-Benefit Analysis', actionType: 'generate_risk_benefit', description: 'Draft the risk-benefit analysis summary' },
      );
      break;
    case 'safety_narrative':
      actions.push(
        { label: 'Generate Safety Narrative', actionType: 'generate_safety_narrative', description: 'Create the patient safety narrative from collected case data' },
        { label: 'Generate Narrative Summary Table', actionType: 'generate_narrative_table', description: 'Create the tabular listing of serious adverse events' },
      );
      break;
    case 'labeling':
      actions.push(
        { label: 'Generate USPI Draft', actionType: 'generate_uspi', description: 'Draft the United States Prescribing Information (USPI) document' },
        { label: 'Generate Medication Guide', actionType: 'generate_med_guide', description: 'Create the patient Medication Guide' },
      );
      break;
    case 'briefing_book':
      actions.push(
        { label: 'Generate Briefing Document', actionType: 'generate_briefing', description: 'Create the advisory committee briefing document' },
        { label: 'Generate Slide Deck Outline', actionType: 'generate_slide_outline', description: 'Draft the presentation outline for the advisory committee meeting' },
      );
      break;
    case 'stability_study':
      actions.push(
        { label: 'Generate Stability Report', actionType: 'generate_stability_report', description: 'Create the stability study report per ICH Q1A(R2)' },
        { label: 'Generate Stability Protocol', actionType: 'generate_stability_protocol', description: 'Draft the stability study protocol for regulatory submission' },
      );
      break;
    case 'project_setup':
      actions.push(
        { label: 'Launch Project Dashboard', actionType: 'launch_dashboard', description: 'Initialize the project dashboard with configured settings' },
        { label: 'Generate Regulatory Strategy Memo', actionType: 'generate_reg_strategy', description: 'Create a regulatory strategy memorandum from the project configuration' },
      );
      break;
    default:
      actions.push(
        { label: 'Generate Document', actionType: 'generate_document', description: 'Generate the document from collected information' },
      );
  }

  // Every completed flow offers a War Game simulation — pressure-test the
  // document against FDA auditor scrutiny before proceeding to generation.
  actions.push({
    label: 'Run FDA War Game',
    actionType: 'start_war_game',
    description: 'Pressure-test this document against FDA auditor scrutiny',
  });

  return actions;
}

function flattenAnswers(answers: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const nodeAnswers of Object.values(answers)) {
    Object.assign(flat, nodeAnswers);
  }
  return flat;
}
