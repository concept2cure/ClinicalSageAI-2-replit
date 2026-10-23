/**
 * Informed Consent Form deterministic logic (Capability C2C-18d)
 *
 * Pure, DB-free, LLM-free: the elements of informed consent that seed a new
 * consent form, and the completeness/readiness scoring used to gate approval.
 *
 * 2026-10-22 (D2): the element set is no longer a list of its own. It is read
 * from the platform's one record, shared/regulatory/informed-consent-elements.ts,
 * for an FDA-regulated form (21 CFR 50.25; the launch catalog composes a US
 * IND). Before, a fifteen-row list here cited only 45 CFR 46.116, had no
 * ClinicalTrials.gov element, and the gate accepted a confidentiality element
 * that never said FDA may inspect the records. Forms seeded from the old list
 * keep their element keys; LEGACY_ELEMENT_KEYS says which current element
 * each one always covered.
 *
 * @module server/services/protocol-consent/protocol-consent-logic
 */

import {
  INFORMED_CONSENT_ELEMENTS,
  consentElementCitation,
  consentElementsFor,
} from '../../../shared/regulatory/informed-consent-elements';

export interface ConsentElementTemplate {
  elementKey: string;
  title: string;
  required: boolean;
  basis: string;
}

/** Element keys the pre-2026-10-22 seed used, and the current elements each covered. */
export const LEGACY_ELEMENT_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  purpose_duration: ['purpose', 'research_statement'],
  compensation: ['compensation_injury'],
  involuntary_termination: ['investigator_termination'],
  additional_costs: ['costs'],
  number_of_subjects: ['number_subjects'],
});

/** The current element keys a form row stands for. */
export function canonicalKeysFor(elementKey: string): readonly string[] {
  return LEGACY_ELEMENT_KEYS[elementKey] ?? [elementKey];
}

const byId = new Map(INFORMED_CONSENT_ELEMENTS.map((el) => [el.id, el]));

/**
 * Statements the regulation prescribes in substance, which "has content" does
 * not establish: the gate requires the wording to be found. Other elements are
 * judged by their author and reviewer; their wording patterns stay a reading aid.
 */
const PRESCRIBED_WORDING: Readonly<Record<string, { pattern: RegExp; says: string }>> = Object.freeze({
  confidentiality: { pattern: byId.get('confidentiality')!.all[1], says: 'that the Food and Drug Administration may inspect the records' },
  clinicaltrials_gov: { pattern: byId.get('clinicaltrials_gov')!.all[0], says: 'the ClinicalTrials.gov statement' },
});

export interface ConsentTemplateOptions {
  /**
   * Whether the study is an applicable clinical trial (42 U.S.C. 282(j)).
   * Unknown is treated as yes: the 21 CFR 50.25(c) statement is then required
   * until someone records that the trial is not an applicable clinical trial.
   */
  applicableClinicalTrial?: boolean | null;
}

/** The seed elements of a new FDA-regulated consent form, in authoring order. Pure. */
export function consentElementTemplates(opts: ConsentTemplateOptions = {}): ConsentElementTemplate[] {
  return consentElementsFor('fda').map((el) => ({
    elementKey: el.id,
    title: el.label,
    required: el.applicability === 'required' || (el.applicability === 'applicable_clinical_trial' && opts.applicableClinicalTrial !== false),
    basis: consentElementCitation(el),
  }));
}

/** Template elements a form's rows do not cover, legacy keys included. Pure. */
export function missingTemplateElements(rows: { elementKey: string }[], templates: ConsentElementTemplate[]): ConsentElementTemplate[] {
  const covered = new Set(rows.flatMap((r) => canonicalKeysFor(r.elementKey)));
  return templates.filter((t) => !covered.has(t.elementKey));
}

// ─── Completeness scoring ────────────────────────────────────────────────────

export interface ConsentElementView {
  elementKey: string;
  required: boolean;
  present: boolean;
  content?: string | null;
}

export interface ConsentFinding {
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

export interface ConsentCompletenessResult {
  /** Percent of REQUIRED elements both present and with content (0–100). */
  /**
   * Percentage of required elements satisfied. NULL when the form records no
   * required elements — there is then no ratio and no assessment.
   */
  requiredPresentPct: number | null;
  requiredTotal: number;
  requiredPresent: number;
  missingRequired: string[];
  findings: ConsentFinding[];
  readyToApprove: boolean;
}

const FORM_BASIS = '21 CFR 50.25; 45 CFR 46.116';

/** The citation for a form row, through its current element(s). */
function basisFor(elementKey: string): string {
  const cites = canonicalKeysFor(elementKey).map((k) => byId.get(k)).filter(Boolean).map((el) => consentElementCitation(el!));
  return cites.length > 0 ? [...new Set(cites)].join('; ') : FORM_BASIS;
}

/** The prescribed statement a row's content lacks, if any. */
function missingWording(e: ConsentElementView): string | null {
  for (const key of canonicalKeysFor(e.elementKey)) {
    const w = PRESCRIBED_WORDING[key];
    if (w && !w.pattern.test(e.content ?? '')) return w.says;
  }
  return null;
}

type Gap = { key: string; message: string };

function requiredGap(e: ConsentElementView): Gap | null {
  const cite = basisFor(e.elementKey);
  const has = e.present && typeof e.content === 'string' && e.content.trim().length > 0;
  if (!has) {
    const why = !e.present ? 'not yet included' : 'included but has no content';
    return { key: e.elementKey, message: `Required consent element "${e.elementKey}" is ${why} (${cite}).` };
  }
  const lacks = missingWording(e);
  return lacks
    ? { key: e.elementKey, message: `Required consent element "${e.elementKey}" does not state ${lacks} (${cite}).` }
    : null;
}

export interface ConsentEvaluationOptions {
  /**
   * The elements the form is held to now. A required one no row covers is
   * missing — a form seeded before the element existed does not pass for
   * lacking the row.
   */
  expected?: ConsentElementTemplate[];
}

/**
 * Score an informed-consent form's completeness. A required element counts as
 * satisfied only when it is marked present, has non-empty content and, for
 * the statements the regulation prescribes (PRESCRIBED_WORDING), says them.
 * `readyToApprove` requires every required element satisfied. Pure — the
 * deterministic gate the service enforces on approve.
 */
export function evaluateConsentCompleteness(elements: ConsentElementView[], opts: ConsentEvaluationOptions = {}): ConsentCompletenessResult {
  const notOnForm = missingTemplateElements(elements, opts.expected ?? []).filter((t) => t.required);
  const gaps = elements.filter((e) => e.required).map(requiredGap).filter((g): g is Gap => g !== null);
  for (const t of notOnForm) {
    gaps.push({ key: t.elementKey, message: `Required consent element "${t.elementKey}" is not yet on this form (${t.basis}).` });
  }
  const requiredTotal = elements.filter((e) => e.required).length + notOnForm.length;
  const requiredPresent = requiredTotal - gaps.length;
  /* This ended `requiredTotal === 0 ? 100`. A consent form with NO element
     rows — created but never populated, or whose elements failed to load —
     scored 100%, produced an empty missingRequired list, and therefore passed
     `readyToApprove`. approveConsentFormTx would then have set it to approved:
     an informed-consent form with no elements at all, through the 45 CFR
     46.116 gate. Nothing had been checked, so there is no percentage. */
  const requiredPresentPct: number | null =
    requiredTotal === 0 ? null : Math.round((requiredPresent / requiredTotal) * 100);

  const missingRequired = gaps.map((g) => g.key);
  const findings: ConsentFinding[] = gaps.map((g) => ({ severity: 'critical', message: g.message }));
  for (const e of elements.filter((x) => !x.required && x.present && !(typeof x.content === 'string' && x.content.trim()))) {
    findings.push({ severity: 'warning', message: `Optional element "${e.elementKey}" is marked present but has no content.` });
  }

  /* A form with no required elements is not a complete form; it is a form
     nothing has been asserted about. The finding is critical so the refusal
     approveConsentFormTx throws carries a sentence — it builds its message by
     joining the critical findings, and with none it would have read
     "Cannot approve — " and stopped. */
  if (requiredTotal === 0) {
    findings.push({
      severity: 'critical',
      message:
        `This consent form has no required elements recorded, so its completeness has not been assessed (${FORM_BASIS}). An empty form is not a complete one.`,
    });
  }

  const readyToApprove = requiredTotal > 0 && missingRequired.length === 0;
  return { requiredPresentPct, requiredTotal, requiredPresent, missingRequired, findings, readyToApprove };
}
