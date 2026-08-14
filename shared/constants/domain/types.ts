/**
 * The domain-entry shape, and the one helper that turns a list into options.
 *
 * A leaf module on purpose: it imports nothing from this directory, so nothing
 * here can participate in a cycle. `DomainEntry` used to live in `index.ts`,
 * which meant all fifteen domain modules imported their own barrel to get it
 * while the barrel re-exported them — fourteen of the fifty import cycles in
 * ledger L57, from one avoidable arrangement. A type belongs below the barrel
 * that re-exports it, never inside it.
 *
 * `toQuestionOptions` is here for the matching reason (ledger L52): the same
 * one-line body was pasted into fourteen modules, each closing over its own
 * list. Taking the list as an argument makes it one function, and makes adding a
 * fifteenth domain a call rather than a copy.
 *
 * @module shared/constants/domain/types
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';

/** One member of a controlled domain vocabulary. */
export interface DomainEntry<T extends string> {
  value: T;
  label: string;
  description?: string;
  /** MedDRA SOC or related coding system reference. */
  codingRef?: string;
  /** ICH/regulatory references relevant to this entry. */
  regulatoryRefs?: string[];
}

/**
 * Present a domain vocabulary to the intelligence question engine.
 *
 * Takes the list rather than closing over one, which is the whole difference
 * between this and the fourteen copies it replaces.
 */
export function toQuestionOptions<T extends string>(
  entries: readonly DomainEntry<T>[],
): QuestionOption[] {
  return entries.map(e => ({ value: e.value, label: e.label, description: e.description }));
}
