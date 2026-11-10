/**
 * What a cross-node rule needs the FLOW to have asked, and the helpers the
 * rules read an answer with.
 *
 * Split out of `issue-detector.ts` when the asked / blank / pending / unasked
 * machinery took that file past the repo's 500-line limit. The rules and the
 * runner stayed there; this is the part that decides what the interview
 * established about a person, which is the part carrying the invariants.
 *
 * @module server/services/ana/intelligence-questions/cross-node-context
 */

import type { FlowDefinition } from './types.js';
import type { QuestionPredicate } from '../../../../shared/types/intelligence-questions.js';
import { evaluatePredicate } from '../../../../shared/ana/question-predicate.js';
import { orphanProgrammeLeaves } from './flows/ind-submission-orphan-designation.js';

/* ─── Reading one answer ─────────────────────────────────────────────────── */

export function isBlank(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
}

export function numVal(val: unknown): number | null {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export function strVal(val: unknown): string {
  return typeof val === 'string' ? val.toLowerCase().trim() : '';
}

/**
 * The countries whose regulators the ethnic-factors rule speaks for, matched
 * case-insensitively in the protocol's free-text country list. The question's
 * gate in flows/protocol-development.ts and the rule's check both read this,
 * so the question is asked exactly where its refusal is reported (2026-11-02,
 * S4). This module has only type imports, so a flow importing it makes no cycle.
 */
export const EAST_ASIAN_COUNTRY_WORDS = ['japan', 'china', 'korea', 'taiwan'] as const;

/**
 * Whether an answer MENTIONS any of these words — a string answer containing
 * one, or a multi_select array with one among its values.
 *
 * `strVal` returns '' for an array, so every trigger reading a multi_select
 * read as empty: `includes_vulnerable_populations` offers 'pediatric' and
 * `regulatory_pathway` offers 'accelerated_approval', and both were invisible
 * to the rules that turn on them (2026-10-13 audit).
 */
export function mentions(value: unknown, ...words: string[]): boolean {
  const haystack = Array.isArray(value) ? value.map(strVal) : [strVal(value)];
  return haystack.some(entry => entry !== '' && words.some(word => entry.includes(word)));
}

/* ─── What the flow established ──────────────────────────────────────────── */

/**
 * What a cross-node rule needs the FLOW to have asked.
 *
 * ── The defect this exists for ────────────────────────────────────────
 * Every rule here has the shape "the programme says X, and the mitigating fact
 * is blank". `isBlank(undefined)` is TRUE, so a rule whose mitigating field no
 * flow ASKS fired on the trigger alone — telling a sponsor they have no
 * biomarker strategy, no confirmatory trial plan, no clinical evidence, no
 * immunogenicity assessment, because AnA never asked. A sweep on 2026-10-13
 * found thirty-five field ids read here that no flow asks, across eleven of the
 * twelve rules.
 *
 * One of them, `xn_class_iii_device_no_clinical_data`, is severity CRITICAL and
 * fired at every Class III device programme. The review had already caught this
 * shape once — "that check landed on a sponsor who had been made to invent the
 * data" — and this is the same shape eleven more times.
 *
 * So a rule now DECLARES the fields it triggers on and the fields whose absence
 * it asserts, and the mitigation state answers only where the flow asked:
 *
 *   present   one of them was answered        → the rule must not fire
 *   blank     asked, REACHED, and left empty  → the rule MAY fire
 *   pending   asked, and the person has not reached that question yet → the
 *             rule MUST NOT fire; telling someone they have no immunogenicity
 *             assessment the moment they say "biologic", three nodes before
 *             being asked, is the same insult in a smaller form
 *   unasked   this flow asks none of them     → the rule MUST NOT fire, because
 *             nothing was ever established about it
 *
 * `unasked` is not a silence to be fixed by firing anyway: it is a question AnA
 * does not ask yet, and `__tests__/cross-node-rules-can-fire.test.ts` keeps the
 * written list of them, so the gap is visible to us instead of asserted at a
 * sponsor.
 */
export type MitigationState = 'present' | 'blank' | 'pending' | 'unasked';

export interface CrossNodeContext {
  /** Whether the running flow asks this field at all. */
  asks: (fieldId: string) => boolean;
  /** True only where the flow ASKED and the answer is empty. */
  mitigationAbsent: () => boolean;
  /** The same decision, reported, for a rule that wants to name what it saw. */
  mitigation: () => MitigationState;
}

/**
 * The slice of a rule this module needs: what its finding rests on, and where
 * a negative answer is an answer. It takes the slice rather than the rule so
 * the rules can stay beside the runner.
 */
export interface MitigationDeclaration {
  mitigatedBy?: string[];
  negativeIsAnswer?: string[];
}

/** Every field id a flow definition asks, for the asked/blank/unasked decision. */
export function fieldsAskedBy(definition: FlowDefinition): Set<string> {
  const out = new Set<string>();
  for (const node of definition.nodes) for (const field of node.fields) out.add(field.id);
  return out;
}
/**
 * An answer that says the mitigating thing was NOT done. It is an answer, so
 * it is not an absence — and it is not a mitigation either, so the finding
 * stands. `not_defined` is here because the IND interview's safety-monitoring
 * question offers it by name, which is a sponsor telling AnA there is no
 * monitoring body rather than leaving the question alone.
 */
const REFUSALS = new Set(['no', 'none', 'false', 'not_defined', 'not_applicable', 'na']);
const isRefusal = (value: unknown): boolean =>
  /* A yes_no answer reaches here as a real boolean from the card and as a
     string from the tool surface (shared/ana/question-predicate.ts says the
     same of its own coercion), and `false` is not a blank. */
  value === false || REFUSALS.has(strVal(value));

/**
 * Where each field is asked, and under what gate.
 *
 * FIRST match wins, not last: a field asked in several nodes — `risk_management`
 * asks `hazard_identification_methods` in three — was mapped to the last one
 * alone, so an answer given in the first node read as never reached
 * (2026-10-13 audit).
 */
export function askedAt(definition: FlowDefinition): Map<string, { node: string; gate?: QuestionPredicate }> {
  const out = new Map<string, { node: string; gate?: QuestionPredicate }>();
  for (const node of definition.nodes) {
    for (const field of node.fields) {
      if (!out.has(field.id)) out.set(field.id, { node: node.id, gate: field.visibleWhen });
    }
  }
  return out;
}

export function contextFor(
  rule: MitigationDeclaration,
  flat: Record<string, unknown>,
  asked: Set<string>,
  reached: (fieldId: string) => boolean,
): CrossNodeContext {
  const negativeAnswers = new Set(rule.negativeIsAnswer ?? []);
  const answered = (id: string): boolean => {
    if (isBlank(flat[id])) return false;
    return negativeAnswers.has(id) || !isRefusal(flat[id]);
  };
  const mitigation = (): MitigationState => {
    const ids = (rule.mitigatedBy ?? []).filter(id => asked.has(id));
    if (ids.length === 0) return 'unasked';
    if (ids.some(answered)) return 'present';
    return ids.some(reached) ? 'blank' : 'pending';
  };
  return { asks: id => asked.has(id), mitigation, mitigationAbsent: () => mitigation() === 'blank' };
}

/* ── Orphan designation and natural history (2026-11-02, S4) ─────────────── */

/**
 * Whether the answers make this an orphan programme: the predicate every
 * natural-history gate carries (orphanProgrammeLeaves), so the rule counts
 * exactly the answers that open the question it waits on.
 *
 * 2026-11-02 (S4): it also read `regulatory_pathway` and `ema_designations`
 * (orphan checkboxes the protocol no longer offers, since the designation is
 * asked once per regulator), `exclusivity_claims` 'orphan_7yr' (an exclusivity
 * CLAIM, which is not a designation) and `prea_applicable` 'orphan_exempt' (a
 * PREA position). None of them opens a gate, so they only made the rule wait
 * on answers that could never let it fire; and the last two are claims the
 * designation should be checked against, not evidence of it.
 */
export function statesOrphanDesignation(flat: Record<string, unknown>): boolean {
  return evaluatePredicate({ anyOf: orphanProgrammeLeaves() }, flat);
}

/**
 * Whether the design rests on the disease course: any protocol; an IND study in
 * patients (a healthy-volunteer PK study does not); an NDA or BLA comparison
 * without a concurrent control — with a randomized control, no natural-history
 * data is not a deficiency under any authority the finding cites.
 */
export function naturalHistoryBearsOnDesign(flat: Record<string, unknown>, category: string): boolean {
  if (category === 'ind_submission') return strVal(flat['study_population']) !== 'healthy_volunteers';
  if (category === 'nda_submission') {
    return strVal(flat['pivotal_study_design']) === 'single_arm' || strVal(flat['control_type']) === 'historical';
  }
  if (category === 'bla_submission') {
    return ['historical', 'none'].includes(strVal(flat['comparator_used'])) || strVal(flat['pivotal_design']) === 'single_arm';
  }
  return true;
}
