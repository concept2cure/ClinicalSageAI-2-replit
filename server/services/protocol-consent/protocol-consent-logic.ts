/**
 * Informed Consent Form deterministic logic (Capability C2C-18d)
 *
 * Pure, DB-free, LLM-free: the canonical set of required elements of informed
 * consent that seed a new consent form, and the completeness/readiness scoring
 * used to gate approval. The element set is grounded in 45 CFR 46.116(b) (basic
 * elements of informed consent) plus the key 45 CFR 46.116(c) additional elements,
 * so the authored form maps to what an IRB expects under the Common Rule.
 *
 * @module server/services/protocol-consent/protocol-consent-logic
 */

const CONSENT_BASIS = '45 CFR 46.116';

export interface ConsentElementTemplate {
  elementKey: string;
  title: string;
  required: boolean;
  basis: string;
}

/**
 * Canonical elements of informed consent. The first nine are the basic elements
 * required by 45 CFR 46.116(b)(1)–(9); the remainder are key additional elements
 * under 45 CFR 46.116(c) (required when applicable). Ordering is authoring order.
 */
export const REQUIRED_CONSENT_ELEMENTS: ConsentElementTemplate[] = [
  // 45 CFR 46.116(b) — basic elements
  { elementKey: 'purpose_duration', title: 'Purpose, Expected Duration & Research Statement', required: true, basis: CONSENT_BASIS },
  { elementKey: 'procedures', title: 'Description of Procedures (including experimental ones)', required: true, basis: CONSENT_BASIS },
  { elementKey: 'risks', title: 'Reasonably Foreseeable Risks & Discomforts', required: true, basis: CONSENT_BASIS },
  { elementKey: 'benefits', title: 'Reasonably Expected Benefits', required: true, basis: CONSENT_BASIS },
  { elementKey: 'alternatives', title: 'Appropriate Alternative Procedures or Treatments', required: true, basis: CONSENT_BASIS },
  { elementKey: 'confidentiality', title: 'Confidentiality of Records', required: true, basis: CONSENT_BASIS },
  { elementKey: 'compensation', title: 'Compensation & Treatment for Injury (research > minimal risk)', required: true, basis: CONSENT_BASIS },
  { elementKey: 'contacts', title: 'Contacts for Questions (research, rights, injury)', required: true, basis: CONSENT_BASIS },
  { elementKey: 'voluntary', title: 'Voluntary Participation & Right to Withdraw', required: true, basis: CONSENT_BASIS },
  // 45 CFR 46.116(c) — additional elements (when applicable)
  { elementKey: 'unforeseeable_risks', title: 'Currently Unforeseeable Risks', required: false, basis: CONSENT_BASIS },
  { elementKey: 'involuntary_termination', title: 'Circumstances for Termination by the Investigator', required: false, basis: CONSENT_BASIS },
  { elementKey: 'additional_costs', title: 'Additional Costs to the Subject', required: false, basis: CONSENT_BASIS },
  { elementKey: 'withdrawal_consequences', title: 'Consequences of Withdrawal & Orderly Termination', required: false, basis: CONSENT_BASIS },
  { elementKey: 'new_findings', title: 'New Findings Will Be Provided to the Subject', required: false, basis: CONSENT_BASIS },
  { elementKey: 'number_of_subjects', title: 'Approximate Number of Subjects', required: false, basis: CONSENT_BASIS },
];

/** The seed templates for a new consent form. Pure. */
export function consentElementTemplates(): ConsentElementTemplate[] {
  return REQUIRED_CONSENT_ELEMENTS;
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
  requiredPresentPct: number;
  requiredTotal: number;
  requiredPresent: number;
  missingRequired: string[];
  findings: ConsentFinding[];
  readyToApprove: boolean;
}

/**
 * Score an informed-consent form's completeness. A required element counts as
 * satisfied only when it is both marked present and has non-empty content.
 * `readyToApprove` requires every required element satisfied. Pure — the
 * deterministic gate the service enforces on approve. (45 CFR 46.116.)
 */
export function evaluateConsentCompleteness(elements: ConsentElementView[]): ConsentCompletenessResult {
  const required = elements.filter((e) => e.required);
  const satisfied = (e: ConsentElementView): boolean => e.present && typeof e.content === 'string' && e.content.trim().length > 0;
  const requiredPresent = required.filter(satisfied).length;
  const requiredTotal = required.length;
  const requiredPresentPct = requiredTotal === 0 ? 100 : Math.round((requiredPresent / requiredTotal) * 100);

  const missingRequired = required.filter((e) => !satisfied(e)).map((e) => e.elementKey);

  const findings: ConsentFinding[] = [];
  for (const e of required.filter((x) => !satisfied(x))) {
    const why = !e.present ? 'not yet included' : 'included but has no content';
    findings.push({ severity: 'critical', message: `Required consent element "${e.elementKey}" is ${why} (45 CFR 46.116).` });
  }
  for (const e of elements.filter((x) => !x.required && x.present && !satisfied(x))) {
    findings.push({ severity: 'warning', message: `Optional element "${e.elementKey}" is marked present but has no content.` });
  }

  const readyToApprove = missingRequired.length === 0;
  return { requiredPresentPct, requiredTotal, requiredPresent, missingRequired, findings, readyToApprove };
}
