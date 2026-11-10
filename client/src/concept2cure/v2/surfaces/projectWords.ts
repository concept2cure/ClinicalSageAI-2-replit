/**
 * Customer words for the stored values the project page shows.
 *
 * The 2026-10-31 client demo read "ind · fda · planning", "todo" and
 * "LEAF CREATED · submission_leaf" off the project page: column values and
 * audit action names, printed as stored. A stored value is shown by its label
 * where one is defined (an application type, an agency, a submission status),
 * and otherwise as words: underscores become spaces and the first letter is a
 * capital. An acronym (IND, FDA) and a value that is already words are kept
 * as they are. Nothing here changes what a value means; it only says it.
 */
import { SC_REGIONS } from '../fixtures/submission';
import { programTypeLabel, SUB_STATUS_LABEL } from './programSequence';

/** Stored values whose words are not their spelling. */
const WORDS: Readonly<Record<string, string>> = {
  todo: 'To do',
  to_do: 'To do',
  wip: 'In progress',
  na: 'Not applicable',
  n_a: 'Not applicable',
};

const ENUM_LOWER = /^[a-z0-9]+(?:[_.-][a-z0-9]+)*$/;
const ENUM_UPPER = /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/;

/** A stored enum value as words ("in_progress" → "In progress"); null for none. */
export function enumWords(value: unknown): string | null {
  const v = String(value ?? '').trim();
  if (!v) return null;
  const known = WORDS[v.toLowerCase()];
  if (known) return known;
  if (!ENUM_LOWER.test(v) && !ENUM_UPPER.test(v)) return v;
  const spaced = v.replace(/^c2c\./i, '').replace(/[_.-]+/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** An audited action's name as words. An action is a verb phrase, never an
 *  acronym, so "UPDATE" reads "Update" and "LEAF_CREATED" "Leaf created". */
export function actionWords(value: unknown): string | null {
  const v = String(value ?? '').trim();
  if (/^[A-Z0-9]+$/.test(v) && /[A-Z]/.test(v)) return v.charAt(0) + v.slice(1).toLowerCase();
  return enumWords(v);
}

/** An agency or region code as the Submission Center names it ("fda" → "FDA (US)"). */
export function regionWords(value: unknown): string | null {
  const v = String(value ?? '').trim();
  if (!v) return null;
  return SC_REGIONS.find((r) => r.v === v.toLowerCase())?.l ?? enumWords(v);
}

/** A submission's status as the Submission Center names it. */
export function submissionStatusWords(value: unknown): string | null {
  const v = String(value ?? '').trim();
  return v ? SUB_STATUS_LABEL[v.toLowerCase()] ?? enumWords(v) : null;
}

/** An application or document type by its label ("ind" → "IND"). */
export function filingTypeWords(value: unknown): string | null {
  return programTypeLabel(typeof value === 'string' ? value : value == null ? null : String(value));
}

/** A study phase as a reader says it ("2" → "Phase 2"). */
export function studyPhaseWords(value: unknown): string | null {
  const v = String(value ?? '').trim();
  if (!v) return null;
  return /^\d+[a-z]?$/i.test(v) ? `Phase ${v.toUpperCase()}` : enumWords(v);
}
