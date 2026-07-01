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
import { runIssueChecks } from './issue-detector.js';
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

  // Run issue checks
  const newIssues = runIssueChecks(currentNode, answers);
  const allIssues = [...state.issues, ...newIssues];

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

export function evaluatePredicate(
  pred: FieldPredicate,
  values: Record<string, unknown>,
): boolean {
  const actual = values[pred.field];

  switch (pred.operator) {
    case 'eq':
      return actual === pred.value;
    case 'neq':
      return actual !== pred.value;
    case 'in':
      return Array.isArray(pred.value) && pred.value.includes(String(actual));
    case 'not_in':
      return Array.isArray(pred.value) && !pred.value.includes(String(actual));
    case 'gt':
      return typeof actual === 'number' && typeof pred.value === 'number' && actual > pred.value;
    case 'lt':
      return typeof actual === 'number' && typeof pred.value === 'number' && actual < pred.value;
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
      actions.push(
        { label: 'Generate CER Draft', actionType: 'generate_cer', description: 'Create a Clinical Evaluation Report from collected data' },
        { label: 'Generate Literature Search Protocol', actionType: 'generate_lit_search', description: 'Create the systematic literature search protocol' },
      );
      break;
    default:
      actions.push(
        { label: 'Generate Document', actionType: 'generate_document', description: 'Generate the document from collected information' },
      );
  }

  return actions;
}

function flattenAnswers(answers: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const nodeAnswers of Object.values(answers)) {
    Object.assign(flat, nodeAnswers);
  }
  return flat;
}
