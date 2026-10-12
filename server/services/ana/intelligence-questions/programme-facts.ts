/**
 * The facts an interview has stated, and the cautions they put on a position
 * (founder's decision, 2026-10-12).
 *
 * The pathway catalogue holds WHAT a fact says against a position and the
 * authority that makes it say so (`shared/regulatory/pathway-positions.ts`).
 * This module holds the other half: WHICH answer states which fact, and the
 * two places that matters —
 *
 *   `withCautions`   marks the options on a question as it is drawn, from the
 *                    answers the interview already holds, so the person reads
 *                    the contradiction before they choose rather than after;
 *   `cautionedChoices`  reads back what they chose, so taking a cautioned
 *                    position leaves a record instead of passing silently.
 *
 * Both are deterministic and neither hides anything. A question draws every
 * position it drew before; the caution is a mark on one of them.
 *
 * The field names below are the contract with the flows. A rename would
 * silently disable the caution, so a test holds that each one is still a field
 * some flow asks — the same two-directional check the catalogue uses against
 * the filing registry.
 *
 * @module server/services/ana/intelligence-questions/programme-facts
 */

import { regionsNamed } from '../../../../shared/regulatory/agency-positions.js';
import { predicateStateOf } from '../../../../shared/regulatory/predicate-positions.js';
import { modalityOf } from '../../../../shared/regulatory/product-modality.js';
import { cautionFor, type ProgrammeFacts } from '../../../../shared/regulatory/pathway-cautions.js';
import type { DetectedIssue, PositionCaution, QuestionField, QuestionNode, QuestionOption } from './types.js';

/**
 * Answers that name a regulator. The primary agency and the additional ones
 * are read together: a sponsor who named EMA under "additional agencies" is
 * filing in the EU, and a route there is not a contradiction.
 */
export const AGENCY_FIELDS: readonly string[] = ['primary_regulatory_agency', 'additional_agencies'];

/** Answers that name a predicate device. A non-empty one means a predicate is named. */
export const PREDICATE_FIELDS: readonly string[] = ['predicate_device', 'predicate_device_name', 'predicate_510k_number'];

/** The answer that states the predicate strategy. */
export const PREDICATE_STRATEGY_FIELDS: readonly string[] = ['predicate_strategy'];

/** Answers that state the US risk class. */
export const DEVICE_CLASS_FIELDS: readonly string[] = ['device_class'];

/** Answers that state the EU MDR class. */
export const EU_MDR_CLASS_FIELDS: readonly string[] = ['eu_mdr_class'];

/** Answers that name the product, which decides which statute governs it. */
export const PRODUCT_FIELDS: readonly string[] = ['product_type'];

/** Every field this module reads, for the test that holds they still exist. */
export function factFields(): string[] {
  return [
    ...AGENCY_FIELDS,
    ...PRODUCT_FIELDS,
    ...PREDICATE_STRATEGY_FIELDS,
    ...PREDICATE_FIELDS,
    ...DEVICE_CLASS_FIELDS,
    ...EU_MDR_CLASS_FIELDS,
  ];
}

/* The vocabularies the flows use. An unlisted value — 'not_classified', 'na',
   anything a later flow invents — states NO fact, which is the honest reading:
   not knowing the class is not a contradiction of any route. */
const US_CLASS: Readonly<Record<string, 'I' | 'II' | 'III'>> = {
  class_i: 'I',
  class_ii: 'II',
  class_iii: 'III',
  i: 'I',
  ii: 'II',
  iii: 'III',
};

const MDR_CLASS: Readonly<Record<string, 'I' | 'IIa' | 'IIb' | 'III'>> = {
  class_i: 'I',
  class_iia: 'IIa',
  class_iib: 'IIb',
  class_iii: 'III',
  i: 'I',
  iia: 'IIa',
  iib: 'IIb',
  iii: 'III',
};

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function firstStated(flat: Record<string, unknown>, fields: readonly string[]): string | null {
  for (const field of fields) {
    const stated = text(flat[field]);
    if (stated) return stated;
  }
  return null;
}

/**
 * The facts in a flattened answer set. Absent facts are left absent: a
 * programme that has not been asked contradicts nothing.
 */
/**
 * One answer or several, as the list of strings it states. The one reader for
 * both an answer that names facts and an answer that chose positions, because
 * a multi-select states several of either.
 */
function stated(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return typeof value === 'string' && value.trim() ? [value] : [];
}

export function programmeFactsFrom(flat: Record<string, unknown>): ProgrammeFacts {
  const facts: ProgrammeFacts = {};
  const regions = regionsNamed(AGENCY_FIELDS.flatMap(field => stated(flat[field])));
  if (regions.length) facts.regions = regions;
  /* The primary agency decides which routes a question offers, so it is its
     own fact rather than the first of the list. */
  const [primary] = regionsNamed(stated(flat[AGENCY_FIELDS[0]]));
  if (primary) facts.primaryRegion = primary;
  const modality = modalityOf(firstStated(flat, PRODUCT_FIELDS));
  if (modality) facts.modality = modality;
  const predicate = firstStated(flat, PREDICATE_FIELDS);
  if (predicate) facts.predicateNamed = predicate;
  const state = predicateStateOf({
    strategy: firstStated(flat, PREDICATE_STRATEGY_FIELDS),
    named: predicate,
  });
  if (state) facts.predicate = state;
  const deviceClass = firstStated(flat, DEVICE_CLASS_FIELDS);
  const us = deviceClass ? US_CLASS[deviceClass.toLowerCase()] : undefined;
  if (us) facts.deviceClass = us;
  const euClass = firstStated(flat, EU_MDR_CLASS_FIELDS);
  const eu = euClass ? MDR_CLASS[euClass.toLowerCase()] : undefined;
  if (eu) facts.euMdrClass = eu;
  return facts;
}

/**
 * The same fields, with the positions these facts speak against marked. No
 * option is added, removed or reordered — a caution is a mark, and the person
 * still chooses (shared/types PositionAvailability).
 */
export function withCautions(fields: readonly QuestionField[], facts: ProgrammeFacts): QuestionField[] {
  return fields.map(field => {
    if (!field.options?.length) return field;
    let changed = false;
    const options = field.options.map(option => {
      const caution = cautionFor(option.value, facts);
      if (caution) {
        changed = true;
        return { ...option, caution };
      }
      /* A caution the rules no longer justify does not survive the redraw:
         the rules are the source of truth, not whatever is on the option. */
      if (!option.caution) return option;
      changed = true;
      const stripped: QuestionOption = { ...option };
      delete stripped.caution;
      return stripped;
    });
    return changed ? { ...field, options } : field;
  });
}

const SEVERITY: Readonly<Record<PositionCaution['availability'], DetectedIssue['severity']>> = {
  inapplicable: 'critical',
  needs_basis: 'warning',
};

const TITLE: Readonly<Record<PositionCaution['availability'], string>> = {
  inapplicable: 'A position your own answers contradict',
  needs_basis: 'A position that needs a basis',
};

/**
 * What the record says about a cautioned position the person took anyway.
 *
 * It is not a refusal. The person is entitled to the position; what they are
 * not entitled to is for it to pass unrecorded, because the contradiction is
 * with an answer of their own and whatever is drafted from this interview has
 * to carry the justification.
 */
export function cautionedChoiceNotices(
  node: QuestionNode,
  answers: Record<string, unknown>,
  facts: ProgrammeFacts,
): DetectedIssue[] {
  const out: DetectedIssue[] = [];
  for (const field of node.fields) {
    if (!field.options?.length) continue;
    for (const value of stated(answers[field.id])) {
      const caution = cautionFor(value, facts);
      if (!caution) continue;
      const label = field.options.find(o => o.value === value)?.label ?? value;
      out.push({
        checkId: `cautioned_position_${field.id}_${value}`,
        severity: SEVERITY[caution.availability],
        title: TITLE[caution.availability],
        message:
          `${caution.reason} You have taken ${label} anyway, which AnA has recorded — and anything she drafts ` +
          'for this position will have to carry that justification.',
        reference: caution.authority,
        questionId: node.id,
        triggerValues: { [field.id]: value, ...facts },
      });
    }
  }
  return out;
}
