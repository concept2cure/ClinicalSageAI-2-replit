/**
 * Biostatistics bridge — filing placement.
 *
 * Where does each statistical deliverable go, for each application type the
 * platform files? The question is asked at three moments — when the
 * Biostatistics surface offers "file it to the dossier", when a task board
 * needs a deliverable checklist for a filing, and when a reviewer asks why a
 * SAP is in Module 5 rather than Module 2 — and until now each caller guessed
 * (the surface hard-coded `module: 'M5'` for everything, DSMB charter and
 * clinical-efficacy summary alike).
 *
 * This is the one deterministic catalog. It is deliberately conservative:
 *
 *   • a placement is emitted only where the ICH CTD / eSTAR / CTIS structure
 *     actually has a home for the document — anything else is reported as
 *     `not_applicable` with the reason, never mapped "somewhere";
 *   • internal working papers (risk memo, assumption note, scenario brief)
 *     are `not_applicable` for every application: they belong in the design
 *     file, and a placement that put them in a submission would be wrong;
 *   • the `required` grade is the filing expectation at the point of
 *     submission, not a legal opinion — `expected` and `conditional` say
 *     "confirm with the regulatory lead", and the note says why.
 *
 * Pure data + pure functions. The application-type vocabulary mirrors
 * `APPLICATION_TYPES` in shared/types/submission-constants.ts and the test
 * pins the two together, so a new filing type cannot appear in the Submission
 * Center without a row here.
 *
 * @module server/services/biostatistics-bridge/filing-placement
 */

import type { StatisticalDocumentType } from '../ana-biostats/types';

export type ApplicationType = 'ind' | 'nda' | 'bla' | 'anda' | 'maa' | '510k' | 'de_novo' | 'pma' | 'cta';

export const APPLICATION_TYPE_VALUES: readonly ApplicationType[] = [
  'ind', 'nda', 'bla', 'anda', 'maa', '510k', 'de_novo', 'pma', 'cta',
] as const;

export const APPLICATION_TYPE_LABELS: Record<ApplicationType, string> = {
  ind: 'IND', nda: 'NDA', bla: 'BLA', anda: 'ANDA', maa: 'MAA', '510k': '510(k)', de_novo: 'De Novo', pma: 'PMA', cta: 'CTA',
};

export const STATISTICAL_DELIVERABLES: readonly StatisticalDocumentType[] = [
  'sample_size_rationale',
  'statistical_risk_memo',
  'design_assumption_note',
  'sap_section_draft',
  'scenario_comparison_brief',
  'statistical_reviewer_response',
  'protocol_statistical_section',
  'submission_statistical_note',
  'full_statistical_analysis_plan',
  'interim_analysis_plan',
  'dsmb_charter',
  'statistical_methods_section',
  'tlf_shell_plan',
  'randomization_plan',
] as const;

export const DELIVERABLE_LABELS: Record<StatisticalDocumentType, string> = {
  sample_size_rationale: 'Sample size rationale',
  statistical_risk_memo: 'Statistical risk memo',
  design_assumption_note: 'Design assumption note',
  sap_section_draft: 'SAP section draft',
  scenario_comparison_brief: 'Scenario comparison brief',
  statistical_reviewer_response: 'Statistical reviewer response',
  protocol_statistical_section: 'Protocol statistical section',
  submission_statistical_note: 'Submission statistical note',
  full_statistical_analysis_plan: 'Statistical analysis plan',
  interim_analysis_plan: 'Interim analysis plan',
  dsmb_charter: 'DSMB / DMC charter',
  statistical_methods_section: 'CSR §9.7 statistical methods',
  tlf_shell_plan: 'TLF shell plan',
  randomization_plan: 'Randomization and blinding plan',
};

/** Which structured submission backbone the application type files on. */
export type FilingBackbone = 'ectd' | 'estar' | 'ctis';

export const BACKBONE_FOR_APPLICATION: Record<ApplicationType, FilingBackbone> = {
  ind: 'ectd', nda: 'ectd', bla: 'ectd', anda: 'ectd', maa: 'ectd',
  '510k': 'estar', de_novo: 'estar', pma: 'estar',
  cta: 'ctis',
};

export type RequirementGrade = 'required' | 'expected' | 'conditional' | 'not_applicable';

export interface FilingPlacement {
  deliverable: StatisticalDocumentType;
  applicationType: ApplicationType;
  backbone: FilingBackbone;
  required: RequirementGrade;
  /** The section code on the backbone (eCTD heading, eSTAR section id, CTIS part), or null when unplaced. */
  code: string | null;
  /** The heading a person would look under. */
  heading: string;
  /**
   * CTD module for the authoring store's `module` field (M1..M5) when the
   * backbone is eCTD; null otherwise. This is what replaces the surface's
   * hard-coded 'M5'.
   */
  module: 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | null;
  /** Why it goes there / why it does not, in one sentence. */
  note: string;
}

// ─── Placement rules ─────────────────────────────────────────────────────────

type Rule = Omit<FilingPlacement, 'deliverable' | 'applicationType' | 'backbone'>;

const UNPLACED_INTERNAL: Rule = {
  required: 'not_applicable',
  code: null,
  heading: 'Internal design file — not a submission document',
  module: null,
  note: 'A working paper for the study team. It supports the filed rationale but is not itself filed.',
};

const ECTD_PROTOCOL: Rule = {
  required: 'required', code: '5.3.5.1', module: 'M5',
  heading: '5.3.5.1 Study report / protocol of controlled study (protocol appendix 16.1.1)',
  note: 'The statistical section travels inside the protocol, which files under the study\'s 5.3.5 heading.',
};
const ECTD_SAP: Rule = {
  required: 'required', code: '5.3.5.1', module: 'M5',
  heading: '5.3.5.1 Study report — appendix 16.1.9 (statistical methods documentation)',
  note: 'ICH E3 places the SAP and its amendments in CSR appendix 16.1.9, under the study\'s 5.3.5 heading.',
};
const ECTD_CSR_METHODS: Rule = {
  required: 'required', code: '5.3.5.1', module: 'M5',
  heading: '5.3.5.1 Clinical study report — §9.7 statistical methods',
  note: 'Section 9.7 of the ICH E3 clinical study report.',
};
const ECTD_EFFICACY_SUMMARY: Rule = {
  required: 'required', code: '2.7.3', module: 'M2',
  heading: '2.7.3 Summary of clinical efficacy — statistical methods and results across studies',
  note: 'The cross-study statistical narrative belongs in the Module 2 clinical summary, not in Module 5.',
};
const ECTD_RANDOMIZATION: Rule = {
  required: 'required', code: '5.3.5.1', module: 'M5',
  heading: '5.3.5.1 Study report — appendix 16.1.7 (randomisation scheme and codes)',
  note: 'ICH E3 appendix 16.1.7 holds the randomisation scheme; the blinding plan sits with the protocol.',
};
const ECTD_DMC: Rule = {
  required: 'conditional', code: '5.3.5.1', module: 'M5',
  heading: '5.3.5.1 Study report — appendix 16.1.9 (DMC charter with the SAP)',
  note: 'Filed with the statistical documentation when the study has an independent data monitoring committee.',
};
const ECTD_INTERIM: Rule = {
  required: 'conditional', code: '5.3.5.1', module: 'M5',
  heading: '5.3.5.1 Study report — appendix 16.1.9 (interim analysis plan)',
  note: 'Only studies with a planned interim analysis file one; it is part of the SAP documentation.',
};
const ECTD_TLF: Rule = {
  required: 'expected', code: '5.3.5.1', module: 'M5',
  heading: '5.3.5.1 Study report — appendix 16.1.9 (TLF shells with the SAP)',
  note: 'Shells accompany the SAP; the populated tables are the CSR §14 appendices.',
};
const REVIEWER_RESPONSE_FDA: Rule = {
  required: 'conditional', code: '1.11.3', module: 'M1',
  heading: '1.11.3 Information amendment — clinical (response to a statistical information request)',
  note: 'FDA regional Module 1: answers to statistical review questions file as a clinical information amendment.',
};
const REVIEWER_RESPONSE_EU: Rule = {
  required: 'conditional', code: '1.0', module: 'M1',
  heading: 'EU Module 1.0 — cover letter with the response document (Day 120 / Day 180 List of Questions)',
  note: 'EU regional Module 1: responses to the CHMP list of questions travel as a response document under the cover letter.',
};

const withGrade = (rule: Rule, required: RequirementGrade, note?: string): Rule => ({ ...rule, required, ...(note ? { note } : {}) });

const ESTAR = (code: string, heading: string, required: RequirementGrade, note: string): Rule => ({
  required, code, heading, module: null, note,
});
const CTIS = (code: string, heading: string, required: RequirementGrade, note: string): Rule => ({
  required, code, heading, module: null, note,
});
const NA = (heading: string, note: string): Rule => ({ required: 'not_applicable', code: null, heading, module: null, note });

/**
 * The catalog. Each deliverable resolves its rule per application type; a
 * deliverable missing an application here is a test failure, not a runtime
 * fallback — the totality test walks every pair.
 */
const RULES: Record<StatisticalDocumentType, Record<ApplicationType, Rule>> = {
  // ── Internal working papers ────────────────────────────────────────────────
  statistical_risk_memo: allTypes(UNPLACED_INTERNAL),
  design_assumption_note: allTypes(UNPLACED_INTERNAL),
  scenario_comparison_brief: allTypes(UNPLACED_INTERNAL),

  // ── Sample size rationale: lives in the protocol's statistical section ─────
  sample_size_rationale: {
    ind: withGrade(ECTD_PROTOCOL, 'required', 'The sample-size justification is part of the protocol the IND submits under 5.3.5 (21 CFR 312.23(a)(6)).'),
    cta: CTIS('part-i.protocol', 'CTIS Part I — protocol (statistical considerations, sample size)', 'required', 'EU CTR Annex I requires the sample-size justification in the Part I protocol.'),
    nda: ECTD_PROTOCOL, bla: ECTD_PROTOCOL, maa: ECTD_PROTOCOL,
    anda: ESTAR_like('5.3.1.2', 'M5', '5.3.1.2 Comparative BA/BE study report — protocol statistical section', 'required', 'Bioequivalence studies file under 5.3.1.2; the sample-size rationale sits in the study protocol.'),
    '510k': ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (protocol and SAP)', 'conditional', 'Only 510(k)s that rely on clinical data include a protocol; most do not.'),
    de_novo: ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (protocol and SAP)', 'expected', 'De Novo requests usually carry clinical evidence; the protocol includes the sizing rationale.'),
    pma: ESTAR('clinical-investigations', 'eSTAR PMA — Clinical investigations (protocol, 21 CFR 814.20(b)(6)(ii))', 'required', 'The PMA clinical section must include the protocol and its statistical basis.'),
  },

  // ── Protocol statistical section ───────────────────────────────────────────
  protocol_statistical_section: {
    ind: withGrade(ECTD_PROTOCOL, 'required', 'Every protocol submitted to the IND carries its statistical section (ICH E6(R3) §6.9).'),
    cta: CTIS('part-i.protocol', 'CTIS Part I — protocol §9 statistical considerations', 'required', 'EU CTR Part I protocol requirement.'),
    nda: ECTD_PROTOCOL, bla: ECTD_PROTOCOL, maa: ECTD_PROTOCOL,
    anda: ESTAR_like('5.3.1.2', 'M5', '5.3.1.2 Comparative BA/BE study report — protocol', 'required', 'The BE protocol\'s statistical section (ANOVA on log-transformed PK, 80–125% bounds).'),
    '510k': ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (protocol)', 'conditional', 'Only when clinical data support substantial equivalence.'),
    de_novo: ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (protocol)', 'expected', 'Clinical evidence is usual for De Novo; the protocol files with it.'),
    pma: ESTAR('clinical-investigations', 'eSTAR PMA — Clinical investigations (protocol)', 'required', '21 CFR 814.20(b)(6)(ii) requires the protocol with the clinical data.'),
  },

  // ── The SAP ────────────────────────────────────────────────────────────────
  full_statistical_analysis_plan: {
    ind: withGrade(ECTD_SAP, 'expected', 'For pivotal protocols FDA expects the SAP with the protocol or before unblinding; file it as an information amendment under 5.3.5.'),
    cta: CTIS('part-i.protocol.annex', 'CTIS Part I — protocol annex (statistical analysis plan)', 'expected', 'Not mandatory at initial application, but expected before the first interim or final analysis.'),
    nda: ECTD_SAP, bla: ECTD_SAP, maa: ECTD_SAP,
    anda: ESTAR_like('5.3.1.2', 'M5', '5.3.1.2 Comparative BA/BE study report — appendix (SAP)', 'expected', 'The BE study report appends its analysis plan.'),
    '510k': ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (SAP)', 'conditional', 'Only when a clinical study supports the submission.'),
    de_novo: ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (SAP)', 'expected', 'Clinical evidence in a De Novo carries its analysis plan.'),
    pma: ESTAR('clinical-investigations', 'eSTAR PMA — Clinical investigations (statistical analysis plan)', 'required', '21 CFR 814.20(b)(6)(ii) — the SAP is part of the clinical investigation record.'),
  },
  sap_section_draft: {
    ind: withGrade(ECTD_SAP, 'expected', 'A section of the SAP; files with the SAP under 5.3.5.'),
    cta: CTIS('part-i.protocol.annex', 'CTIS Part I — protocol annex (SAP section)', 'expected', 'Part of the SAP annex.'),
    nda: withGrade(ECTD_SAP, 'expected'), bla: withGrade(ECTD_SAP, 'expected'), maa: withGrade(ECTD_SAP, 'expected'),
    anda: ESTAR_like('5.3.1.2', 'M5', '5.3.1.2 Comparative BA/BE study report — appendix (SAP)', 'expected', 'Part of the BE study\'s analysis plan.'),
    '510k': ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (SAP)', 'conditional', 'Part of the SAP, when one is filed.'),
    de_novo: ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (SAP)', 'expected', 'Part of the SAP.'),
    pma: ESTAR('clinical-investigations', 'eSTAR PMA — Clinical investigations (SAP)', 'expected', 'Part of the SAP.'),
  },

  // ── CSR statistical methods ────────────────────────────────────────────────
  statistical_methods_section: {
    ind: withGrade(ECTD_CSR_METHODS, 'conditional', 'An IND has no CSR at opening; a completed study\'s report files here later under 5.3.5.'),
    cta: NA('CTIS — clinical study results summary (end of trial)', 'CTIS takes a results summary, not a CSR §9.7; the CSR files with the marketing application.'),
    nda: ECTD_CSR_METHODS, bla: ECTD_CSR_METHODS, maa: ECTD_CSR_METHODS,
    anda: ESTAR_like('5.3.1.2', 'M5', '5.3.1.2 Comparative BA/BE study report — statistical methods', 'required', 'The BE study report\'s methods section.'),
    '510k': ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (study report)', 'conditional', 'Only when a clinical study is reported.'),
    de_novo: ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (study report)', 'expected', 'The clinical study report\'s statistical methods.'),
    pma: ESTAR('clinical-investigations', 'eSTAR PMA — Clinical investigations (study report, statistical methods)', 'required', 'The PMA clinical study report.'),
  },

  // ── Cross-study statistical summary ────────────────────────────────────────
  submission_statistical_note: {
    ind: NA('Not filed at IND', 'An IND has no Module 2.7 clinical summary; the note is internal until a marketing application.'),
    cta: NA('Not filed with a CTA', 'A CTA carries the protocol, not a cross-study efficacy summary.'),
    nda: ECTD_EFFICACY_SUMMARY, bla: ECTD_EFFICACY_SUMMARY, maa: ECTD_EFFICACY_SUMMARY,
    anda: ESTAR_like('2.7.1', 'M2', '2.7.1 Summary of biopharmaceutic studies and associated analytical methods', 'required', 'ANDA statistical summaries sit in the biopharmaceutics summary, not 2.7.3.'),
    '510k': ESTAR('summary-of-clinical-data', 'eSTAR — Summary of clinical data', 'conditional', 'Only when clinical data are part of the substantial-equivalence argument.'),
    de_novo: ESTAR('summary-of-clinical-data', 'eSTAR — Summary of clinical data', 'expected', 'The De Novo benefit-risk narrative summarises the clinical statistics.'),
    pma: ESTAR('summary-of-safety-and-effectiveness', 'eSTAR PMA — Summary of safety and effectiveness data (SSED)', 'required', 'The SSED carries the statistical summary FDA publishes on approval.'),
  },

  // ── Interim analysis plan ──────────────────────────────────────────────────
  interim_analysis_plan: {
    ind: withGrade(ECTD_INTERIM, 'conditional', 'Filed with the protocol/SAP when interims are planned; FDA expects it before the first look.'),
    cta: CTIS('part-i.protocol.annex', 'CTIS Part I — protocol annex (interim analysis plan)', 'conditional', 'Only when the protocol plans an interim analysis.'),
    nda: ECTD_INTERIM, bla: ECTD_INTERIM, maa: ECTD_INTERIM,
    anda: NA('Not applicable to BE studies', 'Bioequivalence studies do not run interim analyses (two-stage designs are pre-specified in the protocol).'),
    '510k': ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (interim plan with SAP)', 'conditional', 'Only when the clinical study plans an interim look.'),
    de_novo: ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (interim plan with SAP)', 'conditional', 'Only when the clinical study plans an interim look.'),
    pma: ESTAR('clinical-investigations', 'eSTAR PMA — Clinical investigations (interim plan, adaptive design)', 'conditional', 'FDA adaptive-design guidance expects the interim plan with the SAP.'),
  },

  // ── DMC charter ────────────────────────────────────────────────────────────
  dsmb_charter: {
    ind: withGrade(ECTD_DMC, 'conditional', 'Submitted to the IND when a DMC is used (FDA 2006 DMC guidance); files with the protocol under 5.3.5.'),
    cta: CTIS('part-i.protocol.annex', 'CTIS Part I — protocol annex (DMC charter)', 'conditional', 'Only when the trial has a DMC.'),
    nda: ECTD_DMC, bla: ECTD_DMC, maa: ECTD_DMC,
    anda: NA('Not applicable to BE studies', 'Bioequivalence studies do not convene a data monitoring committee.'),
    '510k': ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (DMC charter)', 'conditional', 'Only when the clinical study has a DMC.'),
    de_novo: ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (DMC charter)', 'conditional', 'Only when the clinical study has a DMC.'),
    pma: ESTAR('clinical-investigations', 'eSTAR PMA — Clinical investigations (DMC charter)', 'conditional', 'Pivotal device trials commonly have a DMC; file the charter when one exists.'),
  },

  // ── TLF shells ─────────────────────────────────────────────────────────────
  tlf_shell_plan: {
    ind: withGrade(ECTD_TLF, 'conditional', 'Shells are not needed at IND opening; they accompany the SAP for a pivotal study.'),
    cta: NA('Not filed with a CTA', 'TLF shells are SAP working documents; CTIS does not take them.'),
    nda: ECTD_TLF, bla: ECTD_TLF, maa: ECTD_TLF,
    anda: ESTAR_like('5.3.1.2', 'M5', '5.3.1.2 Comparative BA/BE study report — appendix (TLF shells)', 'conditional', 'Occasionally appended with the BE analysis plan.'),
    '510k': NA('Not filed with a 510(k)', 'Shells are working documents; the populated tables go in the study report.'),
    de_novo: NA('Not filed with a De Novo', 'Shells are working documents; the populated tables go in the study report.'),
    pma: ESTAR('clinical-investigations', 'eSTAR PMA — Clinical investigations (TLF shells with SAP)', 'expected', 'Accompanies the SAP in the PMA clinical section.'),
  },

  // ── Randomisation and blinding ─────────────────────────────────────────────
  randomization_plan: {
    ind: withGrade(ECTD_RANDOMIZATION, 'expected', 'The randomisation and blinding plan is described in the protocol at IND; the scheme and codes (16.1.7) come with the CSR.'),
    cta: CTIS('part-i.protocol', 'CTIS Part I — protocol (randomisation and blinding)', 'required', 'EU CTR Part I protocol requirement for randomised trials.'),
    nda: ECTD_RANDOMIZATION, bla: ECTD_RANDOMIZATION, maa: ECTD_RANDOMIZATION,
    anda: ESTAR_like('5.3.1.2', 'M5', '5.3.1.2 Comparative BA/BE study report — randomisation (crossover sequence)', 'conditional', 'Crossover BE studies document the sequence randomisation in the report.'),
    '510k': ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (randomisation)', 'conditional', 'Only for randomised clinical studies supporting the 510(k).'),
    de_novo: ESTAR('clinical-performance-testing', 'eSTAR — Clinical Performance Testing (randomisation)', 'conditional', 'Only for randomised clinical studies.'),
    pma: ESTAR('clinical-investigations', 'eSTAR PMA — Clinical investigations (randomisation and blinding)', 'expected', 'Pivotal device trials are usually randomised; describe the scheme and blinding.'),
  },

  // ── Reviewer response ──────────────────────────────────────────────────────
  statistical_reviewer_response: {
    ind: REVIEWER_RESPONSE_FDA,
    nda: REVIEWER_RESPONSE_FDA, bla: REVIEWER_RESPONSE_FDA, anda: REVIEWER_RESPONSE_FDA,
    maa: REVIEWER_RESPONSE_EU,
    cta: CTIS('rfi-response', 'CTIS — response to a request for information', 'conditional', 'Answers to Part I assessment questions are submitted as RFI responses in CTIS.'),
    '510k': ESTAR('additional-information-response', 'eSTAR — response to an Additional Information request', 'conditional', 'Statistical questions from FDA review arrive as an AI request; the response files against it.'),
    de_novo: ESTAR('additional-information-response', 'eSTAR — response to an Additional Information request', 'conditional', 'Statistical questions from FDA review arrive as an AI request; the response files against it.'),
    pma: ESTAR('major-deficiency-response', 'eSTAR PMA — response to a major deficiency letter', 'conditional', 'Statistical deficiencies are answered as a PMA amendment.'),
  },
};

function allTypes(rule: Rule): Record<ApplicationType, Rule> {
  const out = {} as Record<ApplicationType, Rule>;
  for (const t of APPLICATION_TYPE_VALUES) out[t] = rule;
  return out;
}

/** An eCTD rule that is not one of the shared constants above. */
function ESTAR_like(code: string, module: Rule['module'], heading: string, required: RequirementGrade, note: string): Rule {
  return { required, code, heading, module, note };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function isApplicationType(v: unknown): v is ApplicationType {
  return typeof v === 'string' && (APPLICATION_TYPE_VALUES as readonly string[]).includes(v);
}

export function isStatisticalDeliverable(v: unknown): v is StatisticalDocumentType {
  return typeof v === 'string' && (STATISTICAL_DELIVERABLES as readonly string[]).includes(v);
}

/** Where one deliverable files for one application type. Total over both vocabularies. */
export function placementFor(deliverable: StatisticalDocumentType, applicationType: ApplicationType): FilingPlacement {
  const rule = RULES[deliverable][applicationType];
  return { deliverable, applicationType, backbone: BACKBONE_FOR_APPLICATION[applicationType], ...rule };
}

/** Every deliverable's placement for one application type, filed ones first. */
export function placementsForApplication(applicationType: ApplicationType): FilingPlacement[] {
  const order: RequirementGrade[] = ['required', 'expected', 'conditional', 'not_applicable'];
  return STATISTICAL_DELIVERABLES
    .map((d) => placementFor(d, applicationType))
    .sort((a, b) => order.indexOf(a.required) - order.indexOf(b.required));
}

/**
 * The application type a regulatory program files under, from the program's
 * `programType` (shared/schema/programs.ts: CER, 510K, IND, NDA, BLA, PMA,
 * DE_NOVO — plus the drug spine's MAA/CTA/ANDA). A CER is a technical-file
 * document, not an application, so it returns null rather than a guess.
 */
export function applicationTypeForProgramType(programType: string | null | undefined): ApplicationType | null {
  const key = String(programType ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const map: Record<string, ApplicationType> = {
    ind: 'ind', nda: 'nda', bla: 'bla', anda: 'anda', maa: 'maa', cta: 'cta',
    '510k': '510k', denovo: 'de_novo', pma: 'pma',
  };
  return map[key] ?? null;
}

/**
 * The authoring-store module a deliverable should be filed under for an
 * application type — the replacement for the surface's blanket 'M5'. Returns
 * null when the deliverable is not a submission document for that filing, so
 * the caller can say so instead of filing it somewhere plausible.
 */
export function authoringModuleFor(deliverable: StatisticalDocumentType, applicationType: ApplicationType | null): FilingPlacement['module'] {
  if (!applicationType) return null;
  const p = placementFor(deliverable, applicationType);
  return p.required === 'not_applicable' ? null : p.module;
}
