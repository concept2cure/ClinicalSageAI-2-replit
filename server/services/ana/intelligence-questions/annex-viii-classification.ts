/**
 * The class the interview's own answers decide, from the platform's Annex VIII
 * engine rather than from a sponsor's assertion (founder's directive,
 * 2026-10-12).
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 * A risk class is a VERDICT, and this repository's second rule is that numbers,
 * verdicts and governed content come from deterministic engines while the model
 * narrates. The platform has had the engine all along: `EU_MDR_RULES` is Annex
 * VIII Rules 1–22 in `server/services/market-specs/device-classification.ts`,
 * and `classifyMdr` fails closed — where a fact that decides the class was not
 * given it returns `class: null` and NAMES the facts it would need.
 *
 * The CER interview has also been asking the facts that engine needs — the
 * invasiveness, whether the device is active, the duration of use, the contact
 * site, whether a medicinal substance is incorporated — and asking the sponsor
 * to state the class separately, with nothing comparing the two. A sponsor
 * could answer "surgically invasive, long term, Class IIa" and the interview
 * would record it without a word, though Annex VIII Rule 7 says Class IIb.
 *
 * This connects them. It states nothing the engine does not: where the facts
 * do not decide, the engine's own missing-fact list is what the person is told.
 *
 * ── What is deliberately not mapped ─────────────────────────────────────────
 * `body_contact_type`'s skin / mucosal / breached-skin values look like the
 * engine's `injuredSkinOrMucosaContact`, but that fact's values are the CLAIM a
 * Rule 4 device makes ('mechanical_barrier', 'breached_dermis_secondary_intent')
 * rather than where the device touches. Mapping one onto the other would assert
 * a regulatory claim the sponsor never made. Its 'cns' and 'cardiovascular'
 * values ARE the engine's `contactsCnsOrCentralCirculation`, and those are
 * mapped.
 *
 * `incorporates_biological_material` is not mapped either: the engine's nearest
 * fact is Rule 18's non-viable human or animal tissue, and viable tissue is
 * outside the MDR altogether — the answer does not say which.
 *
 * The IVDR engine is not reached from here, because no interview asks the facts
 * it needs (the Rule 2 markers, the Rule 4(a) analytes, the self-testing and
 * near-patient flags). A rule nothing can reach reads as a check that passes,
 * so this holds only the MDR side until those questions exist.
 *
 * @module server/services/ana/intelligence-questions/annex-viii-classification
 */

import type { MdrRuleClass } from '../../../../shared/regulatory/device-class.js';
import { classifyMdr, type MdrDeviceFacts } from '../../market-specs/device-classification.js';
import type { DetectedIssue } from './types.js';

/** The answers this reads, for the gate that holds they are still asked. */
export const ANNEX_VIII_FIELDS: readonly string[] = [
  'invasiveness_type',
  'is_implantable',
  'active_device',
  'duration_of_use',
  'body_contact_type',
  'incorporates_medicinal_substance',
];

/** The free-text answer where a sponsor cites the rule they classified under. */
export const CLASSIFICATION_RULE_FIELDS: readonly string[] = ['classification_rule'];

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;

/** A yes_no answer, which reaches here as a string or a boolean. */
function said(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const word = text(value);
  if (word === 'yes' || word === 'true') return true;
  if (word === 'no' || word === 'false') return false;
  return null;
}

/**
 * The engine's facts, as this interview's answers state them — and only as
 * they state them. An answer that is absent leaves the fact absent, which is
 * what makes the engine name it rather than guess.
 */
export function mdrFactsFrom(flat: Record<string, unknown>): MdrDeviceFacts | null {
  const facts: MdrDeviceFacts = {};
  let stated = false;

  switch (text(flat.invasiveness_type)) {
    case 'non_invasive':
      facts.invasive = false;
      stated = true;
      break;
    case 'body_orifice':
      facts.invasive = true;
      facts.bodyOrificeInvasive = true;
      stated = true;
      break;
    case 'surgically_invasive':
      facts.invasive = true;
      facts.surgicallyInvasive = true;
      stated = true;
      break;
    case 'implantable':
      /* An implantable device is surgically invasive and falls under Rule 8. */
      facts.invasive = true;
      facts.surgicallyInvasive = true;
      facts.implantable = true;
      stated = true;
      break;
    default:
      break;
  }

  /* The CER interview asks this in its FIRST node, four nodes before the
     invasiveness question. 'No' is not mapped: not being an implant says
     nothing about whether the device is invasive at all. */
  if (said(flat.is_implantable) === true) {
    facts.invasive = true;
    facts.surgicallyInvasive = true;
    facts.implantable = true;
    stated = true;
  }

  const active = said(flat.active_device);
  if (active !== null) {
    facts.active = active;
    stated = true;
  }

  switch (text(flat.duration_of_use)) {
    case 'transient':
      facts.duration = 'transient';
      stated = true;
      break;
    case 'short_term':
      facts.duration = 'short_term';
      stated = true;
      break;
    case 'long_term':
    /* Annex VIII Chapter I § 1.1 defines long term as continuous use for more
       than thirty days; a permanent device is long term. The engine has three
       durations and inventing a fourth would be a second vocabulary. */
    case 'permanent':
      facts.duration = 'long_term';
      stated = true;
      break;
    default:
      break;
  }

  const contact = text(flat.body_contact_type);
  if (contact === 'cns' || contact === 'cardiovascular') {
    facts.contactsCnsOrCentralCirculation = true;
    stated = true;
  }

  const medicinal = said(flat.incorporates_medicinal_substance);
  if (medicinal === true) {
    facts.incorporatesMedicinalSubstance = true;
    stated = true;
  }

  return stated ? facts : null;
}

export interface AnnexViiiReading {
  /** The class the rules yield, or null where the facts do not decide it. */
  class: ReturnType<typeof classifyMdr>['class'];
  /** The rule that decided it, or 'not determined'. */
  ruleApplied: string;
  rationale: string;
  /** The facts the engine would need, in its own words. */
  missingFacts: readonly string[];
}

/**
 * What the Annex VIII rules make of this interview's answers, or null where it
 * stated no classification facts at all — in which case there is nothing to
 * say, and saying it anyway would be noise on every device interview.
 *
 * A throw is read as "no reading": the engine refuses a fact it cannot read
 * (`DeviceClassificationFactError`), and an interview question must not fail
 * because of it.
 */
export function annexViiiReading(flat: Record<string, unknown>): AnnexViiiReading | null {
  const facts = mdrFactsFrom(flat);
  if (!facts) return null;
  try {
    const result = classifyMdr(facts);
    return {
      class: result.class,
      ruleApplied: result.ruleApplied,
      rationale: result.rationale,
      missingFacts: result.missingFacts,
    };
  } catch {
    return null;
  }
}

/** The rule numbers a sponsor cited, from their own free text. */
export function citedRules(flat: Record<string, unknown>): number[] {
  const out: number[] = [];
  for (const field of CLASSIFICATION_RULE_FIELDS) {
    const value = flat[field];
    if (typeof value !== 'string') continue;
    for (const match of value.matchAll(/rule\s*(\d{1,2})/gi)) {
      const n = Number(match[1]);
      if (n >= 1 && n <= 22 && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

/**
 * What the record says about the class: the rules' own verdict, the sponsor's
 * declaration where it differs, and the facts the rules would need where they
 * do not decide. The verdict is the engine's; these sentences only report it.
 */
export function annexViiiNotices(
  nodeId: string,
  flat: Record<string, unknown>,
  /**
   * The class the sponsor DECLARED, already read onto the four the rules
   * yield (`programme-facts.declaredMdrClass`). It must not be the class this
   * module derived, or the derivation would be judged against itself and
   * neither the mismatch nor the statement could ever fire.
   */
  declared: MdrRuleClass | null,
): DetectedIssue[] {
  const reading = annexViiiReading(flat);
  if (!reading) return [];
  const out: DetectedIssue[] = [];

  if (reading.class === null) {
    /* The engine names what it would need. Quoted, not summarised: the list is
       the useful part. */
    out.push({
      checkId: 'annex_viii_not_determined',
      severity: 'info',
      title: 'The Annex VIII rules do not yet decide the class',
      message: `${reading.rationale} Answer those and AnA states the class from the rules rather than taking it on trust.`,
      reference: 'MDR (EU) 2017/745 Annex VIII',
      questionId: nodeId,
      triggerValues: { missingFacts: [...reading.missingFacts] },
    });
    return out;
  }

  const ruled = reading.class;
  if (declared && declared !== ruled) {
    out.push({
      checkId: 'annex_viii_class_mismatch',
      severity: 'warning',
      title: 'Your answers classify this device differently',
      message:
        `You have stated Class ${declared}, and your own answers put it in Class ${ruled} under Annex VIII ` +
        `${reading.ruleApplied}: ${reading.rationale} The class decides the conformity assessment route, so one of ` +
        'the two has to change — the classification or the answers it rests on.',
      reference: `MDR (EU) 2017/745 Annex VIII ${reading.ruleApplied}`,
      questionId: nodeId,
      triggerValues: { declared, ruled, rule: reading.ruleApplied },
    });
  } else if (!declared) {
    out.push({
      checkId: 'annex_viii_class_stated',
      severity: 'info',
      title: `Your answers put this device in Class ${ruled}`,
      message: `Annex VIII ${reading.ruleApplied}: ${reading.rationale} AnA uses that class until you state another.`,
      reference: `MDR (EU) 2017/745 Annex VIII ${reading.ruleApplied}`,
      questionId: nodeId,
      triggerValues: { ruled, rule: reading.ruleApplied },
    });
  }

  const cited = citedRules(flat);
  const applied = Number(/(\d{1,2})/.exec(reading.ruleApplied)?.[1] ?? NaN);
  if (cited.length > 0 && Number.isFinite(applied) && !cited.includes(applied)) {
    out.push({
      checkId: 'annex_viii_rule_not_cited',
      severity: 'info',
      title: 'The rule your answers turn on is not the one you cited',
      message:
        `You cited ${cited.map(n => `Rule ${n}`).join(', ')}, and the rule that decides the class on your own answers ` +
        `is ${reading.ruleApplied}. A classification justification is read against the rule it rests on, so say why ` +
        'that rule does not apply, or cite it.',
      reference: 'MDR (EU) 2017/745 Annex VIII',
      questionId: nodeId,
      triggerValues: { cited, applied: reading.ruleApplied },
    });
  }

  return out;
}
