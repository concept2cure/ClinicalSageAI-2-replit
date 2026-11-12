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

/** What a read-only screen shows of a consent form: the approval gate's own verdict. */
export interface ConsentGateView {
  requiredTotal: number;
  requiredComplete: number;
  /** Null when nothing is required: there is then no ratio. */
  pct: number | null;
  readyToApprove: boolean;
  /** Why each incomplete required element is incomplete, in the gate's words. */
  findings: string[];
  /** Element keys the gate counts as not satisfied. */
  incomplete: string[];
  /** For an approved or superseded form: required elements added to the platform's requirements after it. */
  predates: string[];
}

/**
 * The gate's verdict for display (2026-11-11, F1). The protocol's consent tab
 * computed "% complete" from the `present` ticks, so a form approval would
 * refuse — no content, no FDA-inspection wording, an element not yet on the
 * form — read "100% complete". A screen shows this instead: the same
 * evaluateConsentCompleteness the approve path enforces.
 */
export function consentGateView(elements: ConsentElementView[], status: string): ConsentGateView {
  const expected = consentElementTemplates();
  /* The gate names an element by its key, which is what the approve path's
     refusal and the audit row carry. A person reads its title. */
  const titleOf = (key: string): string =>
    canonicalKeysFor(key).map((k) => byId.get(k)?.label).filter(Boolean).join('; ') || key;
  const readable = (message: string): string =>
    message.replace(/^Required consent element "([^"]+)"/, (_m, key: string) => `"${titleOf(key)}"`);
  const r = evaluateConsentCompleteness(elements, { expected });
  const signed = status === 'approved' || status === 'superseded';
  return {
    requiredTotal: r.requiredTotal,
    requiredComplete: r.requiredPresent,
    pct: r.requiredPresentPct,
    readyToApprove: r.readyToApprove,
    findings: r.findings.filter((f) => f.severity === 'critical').map((f) => readable(f.message)),
    incomplete: r.missingRequired,
    predates: signed ? missingTemplateElements(elements, expected).filter((t) => t.required).map((t) => t.title) : [],
  };
}

// ─── The informed-consent document in the one editor (P-102) ─────────────────

/**
 * The built-in templates an informed-consent document is drafted from
 * (builtinAuthoringTemplateId of `component:informed_consent` and
 * `registry:ICH_ICF`; pinned by consent-document-gate.test.ts). A document's
 * type is its stored template id: `authoring_documents` has no type column.
 */
export const CONSENT_TEMPLATE_IDS: readonly string[] = [
  '7386a0c6-57e7-5b2e-a07a-ffe07c4b0996', // component:informed_consent
  '185d820d-34fc-5a2a-8a11-c9890c249694', // registry:ICH_ICF
];

/** Whether a stored template id is one of the built-in informed-consent templates. */
export const isConsentTemplateId = (value: unknown): boolean =>
  typeof value === 'string' && CONSENT_TEMPLATE_IDS.includes(value.toLowerCase());

/**
 * The section of the consent outline each required element is drafted in
 * (ICF_SECTIONS, shared/regulatory/project-bootstrap.ts). Section 1 carries
 * the research statement and the purpose.
 */
const CONSENT_DOCUMENT_SECTION: Readonly<Record<string, string>> = Object.freeze({
  research_statement: '1', purpose: '1', procedures: '2', risks: '3', benefits: '4', alternatives: '5',
  confidentiality: '6', compensation_injury: '7', voluntary: '8', contacts: '9', clinicaltrials_gov: '11',
});

export interface ConsentDocumentElement {
  key: string;
  title: string;
  /** The outline section it is drafted in; empty for the when-appropriate elements, which share one section. */
  section: string;
  required: boolean;
  complete: boolean;
  citation: string;
}

export interface ConsentDocumentGate extends ConsentGateView {
  elements: ConsentDocumentElement[];
}

/**
 * The approval gate's verdict on an informed-consent DOCUMENT (P-102: one
 * record). The same evaluateConsentCompleteness the structured form is held
 * to, read over the document's sections: an element is included when its
 * section has text, and complete when the gate accepts that text. Pure.
 */
export function consentDocumentGate(sections: { code: string; text: string }[]): ConsentDocumentGate {
  const textOf = new Map(sections.map((s) => [s.code.trim(), s.text]));
  const templates = consentElementTemplates();
  const rows: ConsentElementView[] = templates.filter((t) => t.required).map((t) => {
    const text = textOf.get(CONSENT_DOCUMENT_SECTION[t.elementKey] ?? '') ?? '';
    return { elementKey: t.elementKey, required: true, present: text.trim().length > 0, content: text };
  });
  const view = consentGateView(rows, 'draft');
  const incomplete = new Set(view.incomplete);
  return {
    ...view,
    elements: templates.filter((t) => t.required).map((t) => ({
      key: t.elementKey,
      title: t.title,
      section: CONSENT_DOCUMENT_SECTION[t.elementKey] ?? '',
      required: true,
      complete: !incomplete.has(t.elementKey),
      citation: t.basis,
    })),
  };
}

/** What the gate means for an approval of an informed-consent document (P-102). */
export type ConsentApprovalVerdict =
  | { kind: 'clear' }
  /** The approver stated the study is not an applicable clinical trial; the approval records it. */
  | { kind: 'stated_not_applicable' }
  | { kind: 'refused'; code: 'CONSENT_INCOMPLETE' | 'CONSENT_TRIAL_STATUS_REQUIRED'; message: string; elements: string[] };

const CTGOV = 'clinicaltrials_gov';

/**
 * The approval's verdict from the document's gate (P-102, slice 2). An element
 * 21 CFR 50.25(a) requires refuses the approval and nothing lifts it. The
 * ClinicalTrials.gov statement (50.25(c)) is owed only by an applicable
 * clinical trial, and no record holds a study's status, so the approver is
 * asked; `statedNotApplicable` is their answer, which the caller records on the
 * approval. Pure.
 */
export function consentApprovalVerdict(gate: ConsentDocumentGate, statedNotApplicable: boolean): ConsentApprovalVerdict {
  const open = gate.elements.filter((e) => !e.complete);
  if (open.length === 0) return { kind: 'clear' };
  const basic = open.filter((e) => e.key !== CTGOV);
  const ctgovOpen = open.length > basic.length;
  if (basic.length > 0) {
    const n = basic.length;
    return {
      kind: 'refused',
      code: 'CONSENT_INCOMPLETE',
      elements: basic.map((e) => e.key),
      message:
        `Not approved — this informed consent form does not yet meet ${n} required element${n === 1 ? '' : 's'} of informed consent ` +
        `(21 CFR 50.25(a)): ${basic.map((e) => e.title).join('; ')}. ` +
        (ctgovOpen ? 'The ClinicalTrials.gov statement is also missing; it is required for an applicable clinical trial. ' : '') +
        'The editor’s Check says what each one lacks. Nothing was signed.',
    };
  }
  if (statedNotApplicable) return { kind: 'stated_not_applicable' };
  return {
    kind: 'refused',
    code: 'CONSENT_TRIAL_STATUS_REQUIRED',
    elements: [CTGOV],
    message:
      'Not approved — this informed consent form has no ClinicalTrials.gov statement, which 21 CFR 50.25(c) requires for an ' +
      'applicable clinical trial. Add it, or, if this study is not an applicable clinical trial, say so and approve again: ' +
      'that statement is recorded with your approval. Nothing was signed.',
  };
}
