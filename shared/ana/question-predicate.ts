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

import type { FieldPredicate } from '../types/intelligence-questions.js';

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
