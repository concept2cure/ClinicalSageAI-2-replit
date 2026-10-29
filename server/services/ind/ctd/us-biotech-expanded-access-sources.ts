/**
 * US expanded access — canonical lifecycle source records for the three
 * 21 CFR part 312 subpart I identities:
 *   - US_EXPANDED_ACCESS_INDIVIDUAL   (312.310, emergency 312.310(d) and non-emergency paths)
 *   - US_EXPANDED_ACCESS_INTERMEDIATE (312.315)
 *   - US_EXPANDED_ACCESS_TREATMENT    (312.320)
 *
 * Records of the existing `LifecycleDocumentType` (no new type). `family` is
 * 'IND' because every expanded access use is an IND or a protocol under one
 * (21 CFR 312.305(b)); `LifecycleFamily` has no expanded-access value.
 *
 * Form FDA 3926 is the individual-patient form only; it is not a group-access
 * form. `server/config/FDAFormsRegistry.ts` has no FDA_3926 entry and no 3926
 * asset or field map is admitted, so every form part here is contentType
 * 'form' (manual, source-controlled: the existing projection in
 * us-biotech-lifecycle-templates.ts maps form/data/table to drafting_mode
 * 'manual'). Only narrative parts are AnA-eligible.
 *
 * Confidence: every citation is `recall`. ecfr.gov and fda.gov were refused by
 * this environment's egress policy on 2026-10-29, so no regulator text was
 * re-read. Guidance dates are recalled; confirm the current revision.
 * Contract: docs/design/US_BIOTECH_FILING_COMPLETION_2026-10-27.md.
 *
 * @module server/services/ind/ctd/us-biotech-expanded-access-sources
 */
import type { LifecycleComponent, LifecycleDocumentType, RegulatoryBasis } from './types.js';

const NOT_REREAD = 'Recalled; ecfr.gov/fda.gov refused by egress on 2026-10-29, regulator text not re-read. Confirm current text before relying on it.';
const r = (ref: string): RegulatoryBasis => ({ ref, confidence: 'recall', note: NOT_REREAD });

const GUIDANCE_3926 = 'FDA Guidance for Industry: Individual Patient Expanded Access Applications: Form FDA 3926 (June 2016; later revised; date recalled, confirm current revision)';
const GUIDANCE_QA = 'FDA Guidance for Industry: Expanded Access to Investigational Drugs for Treatment Use: Questions and Answers (June 2016; later updated; date recalled, confirm current revision)';
const NO_3926_MAP = 'FDAFormsRegistry.ts carries no FDA_3926 entry and no 3926 asset/field map is admitted: prepare from the current FDA-published form and its instructions, manually; no field is pre-filled.';
const MANUAL = 'Original form or signed record: retained and prepared manually from controlled sources. AnA does not generate, fill or replace it.';

function part(
  code: string, title: string, required: boolean, contentType: LifecycleComponent['contentType'],
  guidance: string, authoringGuidance: string, keyContentElements: string[], generationPrompt: string,
): LifecycleComponent {
  return { code, title, required, contentType, guidance, authoringGuidance, keyContentElements, generationPrompt };
}

/** A manual part: no generation prompt beyond a refusal to generate. */
function manualPart(code: string, title: string, required: boolean, contentType: 'form' | 'data' | 'table', guidance: string, how: string, elements: string[]): LifecycleComponent {
  return part(code, title, required, contentType, guidance, `${how} ${MANUAL}`, elements,
    `Do not draft ${title} for {{PRODUCT_NAME}}. List the controlled source records {{SPONSOR}} must attach and any that are missing.`);
}

// ── Parts shared by every expanded access submission (21 CFR 312.305) ───────

function rationalePart(prefix: string): LifecycleComponent {
  return part(`${prefix}-RATIONALE`, 'Rationale for the Intended Use and Available Alternatives', true, 'narrative',
    '21 CFR 312.305(a)(1)-(3) (criteria for all expanded access uses); 21 CFR 312.305(b)(2)(ii) (rationale, available therapeutic options, why the investigational drug is preferable)',
    'Show each 312.305(a) criterion from cited source: serious or immediately life-threatening disease; no comparable or satisfactory alternative therapy; benefit justifies risk and the risk is not unreasonable; access will not interfere with clinical investigations that could support approval. List the alternatives considered and why each is unsuitable.',
    ['Disease or condition and its seriousness', 'Available therapeutic options and why each is unsuitable', 'Why the investigational drug is preferred', 'Why access will not interfere with ongoing development'],
    'Draft the rationale for expanded access use of {{PRODUCT_NAME}} in {{INDICATION}} for {{SPONSOR}}, addressing each criterion of 21 CFR 312.305(a) from cited source records only. Use placeholders where a source is missing.');
}

function treatmentPlanPart(prefix: string, scope: string): LifecycleComponent {
  return part(`${prefix}-PLAN`, 'Treatment Plan and Monitoring', true, 'narrative',
    '21 CFR 312.305(b)(2)(iv) (method of administration, dose, duration of therapy); 21 CFR 312.305(b)(2)(viii) (clinical procedures, laboratory tests or other monitoring)',
    `State administration, dose and duration for ${scope}, and the monitoring needed to evaluate effects and minimize risk. Dose and duration come from the approved source (investigator brochure, protocol or manufacturer letter); never compute or propose a dose.`,
    ['Route, dose and schedule (from source)', 'Planned duration of therapy', 'Clinical and laboratory monitoring', 'Stopping rules and safety follow-up'],
    'Draft the treatment plan and monitoring narrative for expanded access use of {{PRODUCT_NAME}} in {{INDICATION}}, transcribing dose and schedule only from the cited source and leaving placeholders where none is provided.');
}

function referencePart(prefix: string): LifecycleComponent {
  return part(`${prefix}-CMC-PT`, 'Manufacturing, CMC and Pharmacology/Toxicology Information (or Cross-Reference)', true, 'narrative',
    '21 CFR 312.305(b)(2)(v)-(vii) (manufacturing facility; CMC; pharmacology and toxicology); 21 CFR 312.305(b)(1) (information may be supplied by reference to an existing IND whose sponsor grants a right of reference); 21 CFR 312.23(b) (information previously submitted may be incorporated by reference)',
    'Usually satisfied by reference to the manufacturer\'s IND or master file under a letter of authorization. State what is referenced, by application number and submission; the referenced data stay in the manufacturer\'s controlled filing and are not reproduced here.',
    ['Referenced application or master file number', 'Manufacturing facility description or reference', 'CMC sufficiency statement (identity, quality, purity, strength)', 'Pharmacology/toxicology sufficiency statement for the dose and duration'],
    'Draft the cross-reference statement for {{PRODUCT_NAME}} CMC and pharmacology/toxicology information, naming the referenced application and letter of authorization as placeholders. Do not summarize data that are not in a cited source.');
}

function irbConsentPart(prefix: string): LifecycleComponent {
  return manualPart(`${prefix}-IRB-CONSENT`, 'IRB Review and Informed Consent Records', true, 'form',
    '21 CFR part 50 (informed consent); 21 CFR part 56 (IRB review); 21 CFR 312.66 (investigator assures IRB review); 21 CFR 312.305(c) (safeguards: licensed physician as investigator)',
    'Attach the IRB approval and the approved consent form; both are signed or approved originals.',
    ['IRB approval letter (or emergency-use report, see emergency path)', 'IRB-approved informed consent form', 'Signed consent record held at site (not submitted unless requested)']);
}

function chargingPart(prefix: string): LifecycleComponent {
  return part(`${prefix}-CHARGING`, 'Request to Charge (Cost Recovery), if Sought', false, 'narrative',
    '21 CFR 312.8 (charging for investigational drugs; expanded access at 312.8(c); recoverable costs at 312.8(d)); prior written FDA authorization required',
    'Only when the sponsor intends to charge. Explain how the applicable 312.8 criteria are met and which costs are recovered; supporting cost documentation is a controlled source record, not narrated figures.',
    ['Statement that charging is requested', 'How the 312.8 criteria for the expanded access type are met', 'Cost categories recovered (figures from cost records only)'],
    'Draft a cost-recovery request narrative for {{PRODUCT_NAME}} expanded access by {{SPONSOR}} under 21 CFR 312.8, with every figure left as a placeholder for the cost record.');
}

function form1571Part(prefix: string): LifecycleComponent {
  return manualPart(`${prefix}-1571`, 'Form FDA 1571 (IND Cover Sheet)', true, 'form',
    '21 CFR 312.305(b)(2)(i) (cover sheet meeting 21 CFR 312.23(a)(1)); FDAFormsRegistry.ts FDA_1571',
    'A new expanded access IND or a protocol amendment to an existing IND carries Form FDA 1571, identified as an expanded access submission of this type. Use the existing FDA_1571 form engine and its original-asset/review gates.',
    ['Form FDA 1571 marked for the expanded access submission type', 'Sponsor or sponsor-investigator signature']);
}

function form1572Part(prefix: string): LifecycleComponent {
  return manualPart(`${prefix}-1572`, 'Form FDA 1572 (Statement of Investigator) for Each Treating Physician', true, 'form',
    '21 CFR 312.53(c) (statement of investigator); 21 CFR 312.305(c) (a treating licensed physician is an investigator); FDAFormsRegistry.ts FDA_1572',
    'Each licensed physician administering the drug under the protocol signs a Form FDA 1572. Use the existing FDA_1572 form engine.',
    ['Signed Form FDA 1572 per treating physician', 'Investigator CV or qualification record']);
}

function coverPart(prefix: string, type: string, section: string): LifecycleComponent {
  return part(`${prefix}-COVER`, 'Cover Letter', true, 'narrative',
    `21 CFR 312.305(b)(1) (expanded access submission required for each type); 21 CFR 312.305(b)(3) (submission and mailing cover plainly marked "EXPANDED ACCESS SUBMISSION"; for a treatment IND or treatment protocol the applicable Form FDA 1571 box is checked); 21 CFR ${section}`,
    `State that the submission is for ${type} expanded access under 21 CFR ${section}, whether it is a new IND or a protocol amendment to an existing IND (give the IND number), and who the sponsor is.`,
    ['Expanded access type and CFR section', 'New IND or protocol amendment (existing IND number)', 'Sponsor and contact', 'Contents list'],
    `Draft a cover letter for {{SPONSOR}}'s ${type} expanded access submission for {{PRODUCT_NAME}} in {{INDICATION}} under 21 CFR ${section}. Leave IND numbers and dates as placeholders.`);
}

// ── Individual patient (312.310), emergency and non-emergency ───────────────

const INDIVIDUAL_COMPONENTS: LifecycleComponent[] = [
  part('EAI-ROLE', 'Submitter Role and Access Path', true, 'narrative',
    '21 CFR 312.310(b) (submission by a licensed physician or by a sponsor); 21 CFR 312.305(b) (new IND or protocol amendment to an existing IND); 21 CFR 312.310(d) (emergency use)',
    'State who submits: the treating licensed physician as sponsor-investigator (new individual-patient IND, typically Form FDA 3926) or a sponsor (protocol amendment to its existing IND, Form FDA 1571). State whether the emergency path (312.310(d)) or the non-emergency path applies.',
    ['Physician (sponsor-investigator) or sponsor submission', 'New IND or amendment to IND (number)', 'Emergency or non-emergency path', 'Manufacturer agreement to supply'],
    'Draft the submitter-role and access-path statement for individual patient expanded access to {{PRODUCT_NAME}} in {{INDICATION}}, leaving the physician, sponsor and IND number as placeholders.'),
  manualPart('EAI-3926', 'Form FDA 3926 (Individual Patient Expanded Access IND), Physician Submission', false, 'form',
    `${GUIDANCE_3926}; 21 CFR 312.305(b)(2)(i); individual patients only (21 CFR 312.310), not intermediate-size or treatment use`,
    `Conditional: the licensed physician submits a new individual-patient IND. Per the FDA 3926 guidance (recall), the physician may request that Form FDA 3926 be accepted in place of Forms FDA 1571 and 1572. ${NO_3926_MAP}`,
    ['Current FDA-published Form FDA 3926', 'Physician signature', 'Attachments the form instructions name']),
  manualPart('EAI-1571', 'Form FDA 1571 (Sponsor Protocol Amendment or Non-3926 IND)', false, 'form',
    '21 CFR 312.305(b)(2)(i) (cover sheet meeting 21 CFR 312.23(a)(1)); 21 CFR 312.305(b)(3); FDAFormsRegistry.ts FDA_1571',
    'Conditional: a sponsor submits an individual-patient protocol amendment to its existing IND, or the physician does not use Form FDA 3926. Use the existing FDA_1571 form engine.',
    ['Form FDA 1571 identifying individual patient expanded access', 'Form FDA 1572 for the treating physician (21 CFR 312.53(c))']),
  manualPart('EAI-LOA', 'Letter of Authorization from the Manufacturer or IND Holder', false, 'form',
    '21 CFR 312.310(b)(3) (a licensed physician obtains the sponsor\'s permission for FDA to refer to its IND); 21 CFR 312.305(b)(1) (right of reference to an existing IND); 21 CFR 312.23(b) (incorporation by reference with written authorization); 21 CFR 312.305(b)(2)(v)-(vii)',
    'Signed letter permitting FDA to refer to the manufacturer\'s IND or master file for CMC and pharmacology/toxicology information.',
    ['Signed letter of authorization', 'Referenced application number']),
  part('EAI-PATIENT', 'Patient History and Current Condition', true, 'narrative',
    '21 CFR 312.305(b)(2)(iii) (for an individual patient: the disease or condition, recent medical history and previous treatments)',
    'Summarize from the cited medical record only: diagnosis, recent history and prior treatments with response. De-identify as the submission route requires.',
    ['Diagnosis and current status', 'Recent medical history', 'Previous treatments and responses'],
    'Draft the patient history for individual patient expanded access to {{PRODUCT_NAME}} in {{INDICATION}} from the cited medical-record extracts only; leave anything not in a source as a placeholder.'),
  part('EAI-RISK', 'Physician Risk Determination and Unavailability Under Another IND', true, 'narrative',
    '21 CFR 312.310(a)(1) (physician determines probable risk from the drug is not greater than probable risk from the disease); 21 CFR 312.310(a)(2) (FDA determines the patient cannot obtain the drug under another IND or protocol)',
    'The treating physician\'s own determination, in their words, supported by the cited history; and why the patient cannot enroll in a trial or an existing access protocol. The physician signs and owns this statement.',
    ['Physician\'s probable-risk comparison', 'Why trial or existing protocol access is unavailable'],
    'Draft, for the treating physician to review and adopt, the 21 CFR 312.310(a) risk determination for {{PRODUCT_NAME}} in {{INDICATION}}, citing only the provided history.'),
  rationalePart('EAI'),
  treatmentPlanPart('EAI', 'a single course of therapy for a specified duration unless FDA authorizes multiple courses or chronic therapy (21 CFR 312.310(c)(1))'),
  referencePart('EAI'),
  irbConsentPart('EAI'),
  manualPart('EAI-EMERG-AUTH', 'Emergency Authorization Record (Emergency Path Only)', false, 'data',
    '21 CFR 312.310(d)(1) (FDA may authorize emergency use to begin without a written submission, by telephone; the physician or sponsor agrees to submit the written expanded access submission within 15 working days of FDA\'s authorization); 21 CFR 312.310(d)(2) (emergency request by telephone, facsimile or other electronic communication)',
    'Conditional: emergency path. Record the date and time of FDA\'s authorization, the FDA contact and the assigned IND number as received; the written submission follows within 15 working days of authorization.',
    ['Authorization date and time', 'FDA contact', 'Assigned IND number', 'Written-submission due date computed from the recorded authorization date']),
  manualPart('EAI-EMERG-IRB', 'Emergency-Use IRB Report and Consent Record (Emergency Path Only)', false, 'form',
    '21 CFR 56.104(c) (emergency use exempt from prospective IRB review; reported to the IRB within 5 working days); 21 CFR 50.23 (exception from informed consent, with its certification)',
    'Conditional: emergency path when treatment began before IRB review. The report to the IRB and any 50.23 certification are signed originals.',
    ['Report to the IRB (within 5 working days of use)', 'Consent record or 50.23 certification']),
  part('EAI-SUMMARY', 'Written Summary of Results at Conclusion of Treatment', false, 'narrative',
    '21 CFR 312.310(c)(2) (physician or sponsor provides FDA a written summary of the results, including adverse effects); 21 CFR 312.32 (IND safety reporting during treatment)',
    'Follow-up submission after treatment ends. Narrate outcomes and adverse effects from the cited medical record and safety reports; no inferred efficacy conclusion.',
    ['Treatment given and duration', 'Clinical outcome as recorded', 'Adverse effects', 'Safety reports already filed'],
    'Draft the 21 CFR 312.310(c)(2) end-of-treatment summary for {{PRODUCT_NAME}} in {{INDICATION}} from the cited records only.'),
];

// ── Intermediate-size population (312.315) ──────────────────────────────────

const INTERMEDIATE_COMPONENTS: LifecycleComponent[] = [
  coverPart('EAM', 'intermediate-size patient population', '312.315'),
  form1571Part('EAM'),
  form1572Part('EAM'),
  part('EAM-NEED', 'Need for Intermediate-Size Expanded Access and Development Status', true, 'narrative',
    '21 CFR 312.315(a) (need: drug not being developed, patients cannot enroll in a trial, or approved drug unavailable); 21 CFR 312.315(c) (state whether the drug is being developed; explain why it cannot be, or why patients cannot enroll)',
    'Identify which 312.315(a) circumstance applies and give the explanation 312.315(c) requires, from cited development and enrollment records.',
    ['Applicable 312.315(a) circumstance', 'Development status', 'Why patients cannot enroll or the drug cannot be developed', 'Intended population description'],
    'Draft the 21 CFR 312.315(a)/(c) need and development-status narrative for intermediate-size expanded access to {{PRODUCT_NAME}} in {{INDICATION}} by {{SPONSOR}}.'),
  part('EAM-EVIDENCE', 'Evidence of Safety and Effectiveness', true, 'narrative',
    '21 CFR 312.315(b) (evidence that the drug is safe at the dose and duration proposed to justify a trial of about that size, and at least preliminary clinical evidence of effectiveness or of a plausible pharmacologic effect)',
    'Summarize the evidence from cited reports; numbers are transcribed from the source study reports, never derived.',
    ['Safety evidence for the proposed dose and duration', 'Preliminary effectiveness or pharmacologic-effect evidence', 'Source reports cited'],
    'Summarize, from the cited study reports only, the 21 CFR 312.315(b) safety and effectiveness evidence for {{PRODUCT_NAME}} in {{INDICATION}}.'),
  part('EAM-SELECTION', 'Patient Selection Criteria', true, 'narrative',
    '21 CFR 312.305(b)(2)(iii) (criteria for patient selection)',
    'Inclusion and exclusion criteria defining the intermediate-size population.',
    ['Inclusion criteria', 'Exclusion criteria', 'Expected number of patients'],
    'Draft patient selection criteria for the {{PRODUCT_NAME}} intermediate-size expanded access protocol in {{INDICATION}}.'),
  rationalePart('EAM'),
  treatmentPlanPart('EAM', 'the protocol population'),
  referencePart('EAM'),
  irbConsentPart('EAM'),
  chargingPart('EAM'),
];

// ── Treatment IND / treatment protocol (312.320) ────────────────────────────

const TREATMENT_COMPONENTS: LifecycleComponent[] = [
  coverPart('EAT', 'treatment IND or treatment protocol (widespread)', '312.320'),
  form1571Part('EAT'),
  form1572Part('EAT'),
  part('EAT-STATUS', 'Trial Status and Marketing Diligence', true, 'narrative',
    '21 CFR 312.320(a)(1) (drug under a controlled trial designed to support a marketing application, or all trials complete); 21 CFR 312.320(a)(2) (sponsor actively pursuing marketing approval with due diligence)',
    'State the controlled trial (IND and protocol) or the completion of all trials, and the marketing-application status, from cited program records.',
    ['Supporting controlled trial or completion of all trials', 'Marketing application status and plan', 'Evidence of due diligence'],
    'Draft the 21 CFR 312.320(a)(1)-(2) trial-status and diligence narrative for the {{PRODUCT_NAME}} treatment protocol in {{INDICATION}} by {{SPONSOR}}.'),
  part('EAT-EVIDENCE', 'Evidence Standard (Serious vs Immediately Life-Threatening)', true, 'narrative',
    '21 CFR 312.320(a)(3)(i) (serious: sufficient clinical evidence of safety and effectiveness, ordinarily phase 3, or compelling phase 2); 21 CFR 312.320(a)(3)(ii) (immediately life-threatening: available evidence taken as a whole gives a reasonable basis to conclude the drug may be effective without unreasonable and significant risk)',
    'Name which standard applies and summarize the evidence from cited study reports; figures transcribed only.',
    ['Applicable evidence standard', 'Phase 3 / phase 2 evidence summary', 'Source study reports cited'],
    'Summarize, from cited study reports only, the 21 CFR 312.320(a)(3) evidence for the {{PRODUCT_NAME}} treatment protocol in {{INDICATION}}.'),
  part('EAT-SELECTION', 'Patient Selection Criteria', true, 'narrative',
    '21 CFR 312.305(b)(2)(iii) (criteria for patient selection)',
    'Inclusion and exclusion criteria for widespread treatment use.',
    ['Inclusion criteria', 'Exclusion criteria'],
    'Draft patient selection criteria for the {{PRODUCT_NAME}} treatment protocol in {{INDICATION}}.'),
  rationalePart('EAT'),
  treatmentPlanPart('EAT', 'the treatment population'),
  part('EAT-OVERSIGHT', 'Sponsor Monitoring and Physician Compliance', true, 'narrative',
    '21 CFR 312.320(b) (sponsor monitors the protocol and ensures licensed physicians comply with it); 21 CFR 312.305(c) (licensed physician responsibilities as investigator); 21 CFR 312.32 and 312.33 (safety and annual reports)',
    'Describe how the sponsor monitors the treatment protocol, oversees treating physicians and handles safety reporting.',
    ['Monitoring plan', 'Physician oversight and compliance', 'Safety reporting and annual reporting'],
    'Draft the 21 CFR 312.320(b) sponsor monitoring and physician-compliance plan for the {{PRODUCT_NAME}} treatment protocol.'),
  referencePart('EAT'),
  irbConsentPart('EAT'),
  chargingPart('EAT'),
];

// ── Records ──────────────────────────────────────────────────────────────────

const COMMON_BASIS = [
  'FD&C Act sec. 561 (21 U.S.C. 360bbb)',
  '21 CFR 312.300-312.320 (part 312 subpart I, expanded access)',
  '21 CFR 312.305 (requirements for all expanded access uses)',
  GUIDANCE_QA,
];

export const US_EXPANDED_ACCESS_SOURCE_RECORDS: LifecycleDocumentType[] = [
  {
    id: 'expanded_access_individual', registryId: 'US_EXPANDED_ACCESS_INDIVIDUAL',
    label: 'Individual Patient Expanded Access (Emergency and Non-Emergency)', category: 'application', family: 'IND', agency: 'FDA',
    description: 'Expanded access for a single patient under 21 CFR 312.310, as a new IND by the treating licensed physician (typically Form FDA 3926) or a protocol amendment to a sponsor\'s existing IND (Form FDA 1571). Two conditional paths: emergency use authorized by rapid communication under 312.310(d), followed by the written submission; and the non-emergency written submission. Form FDA 3926 serves individual patients only.',
    regulatoryBasis: [...COMMON_BASIS, '21 CFR 312.310', '21 CFR 312.310(d) (emergency use)', 'FD&C Act sec. 561(b)', GUIDANCE_3926, '21 CFR 56.104(c)', '21 CFR 50.23'],
    timing: 'Emergency path: written expanded access submission within 15 working days of FDA\'s authorization (21 CFR 312.310(d)(1)); emergency use reported to the IRB within 5 working days (21 CFR 56.104(c)). Non-emergency: a new IND takes effect under 21 CFR 312.40(b); a protocol amendment under 21 CFR 312.30(a). Written summary at conclusion of treatment (21 CFR 312.310(c)(2)). Recall; confirm current text.',
    components: INDIVIDUAL_COMPONENTS,
  },
  {
    id: 'expanded_access_intermediate', registryId: 'US_EXPANDED_ACCESS_INTERMEDIATE',
    label: 'Intermediate-Size Patient Population Expanded Access', category: 'application', family: 'IND', agency: 'FDA',
    description: 'Expanded access for an intermediate-size population under 21 CFR 312.315, as a new IND or a protocol amendment to an existing IND, with Form FDA 1571 and a Form FDA 1572 for each treating physician. Form FDA 3926 does not apply.',
    regulatoryBasis: [...COMMON_BASIS, '21 CFR 312.315', '21 CFR 312.8 (charging)', '21 CFR 312.33 (annual reports)'],
    timing: 'A new IND takes effect under 21 CFR 312.40(b); a protocol amendment under 21 CFR 312.30(a). FDA reviews continuation on the annual report (21 CFR 312.315(d)). Recall; confirm current text.',
    components: INTERMEDIATE_COMPONENTS,
  },
  {
    id: 'expanded_access_treatment', registryId: 'US_EXPANDED_ACCESS_TREATMENT',
    label: 'Treatment IND / Treatment Protocol (Widespread Expanded Access)', category: 'application', family: 'IND', agency: 'FDA',
    description: 'Expanded access for widespread treatment use under 21 CFR 312.320, as a treatment IND or a treatment protocol under an existing IND, with Form FDA 1571 and a Form FDA 1572 for each treating physician. Form FDA 3926 does not apply.',
    regulatoryBasis: [...COMMON_BASIS, '21 CFR 312.320', 'FD&C Act sec. 561(c)', '21 CFR 312.8 (charging)', '21 CFR 312.33 (annual reports)'],
    timing: 'A treatment IND takes effect under 21 CFR 312.40(b); a treatment protocol under an existing IND under 21 CFR 312.30(a). Recall; confirm current text.',
    components: TREATMENT_COMPONENTS,
  },
];

/** Structured basis per registry id (all `recall`); the records' plain strings stay the display form. */
export const US_EXPANDED_ACCESS_SOURCE_BASIS: Readonly<Record<string, readonly RegulatoryBasis[]>> = Object.freeze(
  Object.fromEntries(US_EXPANDED_ACCESS_SOURCE_RECORDS.map(record => [record.registryId as string, record.regulatoryBasis.map(r)])),
);

/** The individual path's conditional variants: which parts each path adds. Both share the remaining parts. */
export const US_EXPANDED_ACCESS_INDIVIDUAL_PATHS = Object.freeze([
  { id: 'emergency', label: 'Emergency use (21 CFR 312.310(d))', addsComponents: ['EAI-EMERG-AUTH', 'EAI-EMERG-IRB'], basis: r('21 CFR 312.310(d); 21 CFR 56.104(c)') },
  { id: 'non_emergency', label: 'Non-emergency written submission (21 CFR 312.310(b))', addsComponents: [] as string[], basis: r('21 CFR 312.310(b); 21 CFR 312.305(b)') },
] as const);

/** Submitter choice for the individual path: which form part applies. */
export const US_EXPANDED_ACCESS_INDIVIDUAL_SUBMITTERS = Object.freeze([
  { role: 'physician', label: 'Treating licensed physician as sponsor-investigator (new IND)', formComponent: 'EAI-3926', basis: r(GUIDANCE_3926) },
  { role: 'sponsor', label: 'Sponsor, protocol amendment to its existing IND', formComponent: 'EAI-1571', basis: r('21 CFR 312.305(b)(3); 21 CFR 312.310(b)') },
] as const);
