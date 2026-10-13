/**
 * Whether a question's predicate holds, over the answers given.
 *
 * It was in the question engine, which is server-side — so the CARD could not
 * evaluate a predicate, and a field whose `visibleWhen` names a field in its
 * OWN question had nowhere to be decided: the draw filters over the answers
 * given BEFORE the question (it cannot know an answer the person has not typed
 * yet), and the validator filters over those plus the submitted ones. A
 * required field in that shape was hidden when drawn and demanded when
 * submitted — an unanswerable question — and `additional_agencies`, gated on a
 * yes/no in its own node, was never drawn at all (2026-10-12 review).
 *
 * Moved here whole so the card decides exactly what the server would, with the
 * same yes/no coercion and the same numeric parsing. The engine re-exports it,
 * so every existing caller is unchanged.
 *
 * @module shared/ana/question-predicate
 */

import type { FieldPredicate, QuestionPredicate } from '../types/intelligence-questions.js';

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

/**
 * One comparator per operator, so adding one is a row rather than a branch.
 *
 * It was a nine-case switch with nested ternaries — complexity 22, which the
 * warning ratchet tolerated in the engine and refused the moment the function
 * moved to a new file. The ratchet is right: a move is the moment to pay for
 * it. Behaviour is unchanged, and the cases are pinned by
 * `predicate-yes-no-coercion`, `numeric-answer-coercion`,
 * `tests/ana-intelligence/predicate.test.ts` and `same-question-gate`.
 */
type Comparator = (actual: unknown, expected: FieldPredicate['value']) => boolean;

const COMPARATORS: Readonly<Record<FieldPredicate['operator'], Comparator>> = {
  eq: (actual, expected) =>
    typeof expected === 'boolean' ? coerceForBooleanPredicate(actual) === expected : actual === expected,
  neq: (actual, expected) =>
    typeof expected === 'boolean' ? coerceForBooleanPredicate(actual) !== expected : actual !== expected,
  in: (actual, expected) => Array.isArray(expected) && expected.includes(String(actual)),
  not_in: (actual, expected) => Array.isArray(expected) && !expected.includes(String(actual)),
  gt: (actual, expected) => {
    const n = toFiniteNumber(actual);
    return n !== null && typeof expected === 'number' && n > expected;
  },
  lt: (actual, expected) => {
    const n = toFiniteNumber(actual);
    return n !== null && typeof expected === 'number' && n < expected;
  },
  contains: (actual, expected) =>
    typeof actual === 'string' && typeof expected === 'string' && actual.toLowerCase().includes(expected.toLowerCase()),
  exists: actual => actual != null && actual !== '' && !(Array.isArray(actual) && actual.length === 0),
};

/** A group of predicates rather than one field's own. */
function isGroup(pred: QuestionPredicate): pred is { anyOf?: QuestionPredicate[]; allOf?: QuestionPredicate[] } {
  return !('field' in pred);
}

export function evaluatePredicate(pred: QuestionPredicate, values: Record<string, unknown>): boolean {
  if (isGroup(pred)) {
    /* A group with neither key, or an empty one, is NOT satisfied — `every`
       over an empty list is true, and a gate nobody wrote must not read as
       open. Both keys together means both must hold. */
    const any = pred.anyOf;
    const all = pred.allOf;
    if (!any?.length && !all?.length) return false;
    if (any?.length && !any.some(p => evaluatePredicate(p, values))) return false;
    if (all?.length && !all.every(p => evaluatePredicate(p, values))) return false;
    return true;
  }
  /* An operator this module does not hold answers false: a predicate nobody
     can evaluate must not read as satisfied. */
  const compare = COMPARATORS[(pred as FieldPredicate).operator];
  return compare ? compare(values[pred.field], pred.value) : false;
}

/**
 * Every field a predicate reads, flattened.
 *
 * The engine needs it to decide whether a gate names a field in the question's
 * OWN node — in which case the field is SENT with its predicate and the card
 * decides it, because the draw cannot know an answer the person has not typed
 * yet. With a group, ANY leaf in the own node is enough: the gate cannot be
 * settled server-side either way.
 */
export function predicateFieldIds(pred: QuestionPredicate): string[] {
  return predicateLeaves(pred).map(leaf => leaf.field);
}

/**
 * The single-field predicates inside one, flattened. A caller that needs the
 * VALUES as well as the fields — the flow-registry vocabulary probe compares a
 * predicate's values against the options a field offers — reads them here
 * rather than off a group, which has neither.
 */
export function predicateLeaves(pred: QuestionPredicate): FieldPredicate[] {
  if (!isGroup(pred)) return [pred as FieldPredicate];
  return [...(pred.anyOf ?? []), ...(pred.allOf ?? [])].flatMap(predicateLeaves);
}
