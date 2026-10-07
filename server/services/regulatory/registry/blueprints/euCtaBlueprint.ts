/**
 * EU CTA Blueprint — Clinical Trial Application (EU CTR / CTIS)
 *
 * @module server/services/regulatory/registry/blueprints/euCtaBlueprint
 */

import type { SectionBlueprint, TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';

export const EU_CTA_BLUEPRINT_SOURCES = [
  {
    title: 'Regulation (EU) No 536/2014, Annex I',
    url: 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A32014R0536',
    version: 'Regulation of 16 April 2014; Annex I dossier framework',
    verifiedAt: '2026-10-07',
  },
  {
    title: 'EMA CTIS Sponsor Handbook',
    url: 'https://www.ema.europa.eu/system/files/documents/other/sponsor-handbook-v-64_clean-version_20260716-en.pdf',
    version: 'Version 6.4; cover date 7 July 2026; sections 2.2, 2.4.5, 2.4.6 and 2.5',
    verifiedAt: '2026-10-07',
  },
] as const;

/**
 * Initial medicinal-product CTA dossier. Numeric `module` is a platform grouping:
 * 1 = CTIS Form/MSC, 2 = Part I, 3 = Part II; these are NOT CTD modules.
 * `required` identifies baseline preparation rows for a complete Part I + II
 * application, including alternative documents/justifications. A false flag is
 * conditional scope, not a regulatory waiver. Article 11 Part I-only applications
 * defer Part II; per-product, per-MSC, language and publication review remains
 * necessary. This blueprint neither creates CTIS fields nor validates a filing.
 */
export const sectionBlueprint: SectionBlueprint = {
  id: 'eu_cta_sections',
  name: 'EU CTA Sections (CTIS Form, Part I and Part II)',
  sections: [
    // CTIS Form and Member States Concerned (CTR Annex I B, C, Q and R).
    { code: 'FORM.COVER', title: 'Form — initial application cover letter', module: 1, required: true, contentType: 'narrative', guidance: 'CTR Annex I B; CTIS handbook §2.2: use the initial-application cover letter template.' },
    { code: 'FORM.CATEGORY', title: 'Form — trial category and justification', module: 1, required: true, contentType: 'form', guidance: 'CTIS handbook §2.2: confirm category, phase and population; these affect publication rules.' },
    { code: 'FORM.GDPR', title: 'Form — GDPR compliance statement', module: 1, required: true, contentType: 'form', guidance: 'CTR Annex I R; CTIS handbook §2.2: statement of compliance with Regulation (EU) 2016/679.' },
    { code: 'FORM.FEES', title: 'Form — fee payment evidence', module: 1, required: false, contentType: 'data', guidance: 'CTR Annex I Q; CTIS handbook §2.2: include when applicable under each MSC fee policy.' },
    { code: 'MSC', title: 'Member States Concerned and proposed Reporting Member State', module: 1, required: true, contentType: 'form', guidance: 'CTIS handbook §2.2: MSCs and participant counts; propose an RMS for a multinational application.' },

    // Part I: common scientific and product assessment (CTR Article 6).
    { code: 'PART_I.TRIAL', title: 'Part I — structured trial information', module: 2, required: true, contentType: 'form', guidance: 'CTR Annex I C; CTIS handbook §2.2: identifiers, design, objectives, endpoints, eligibility, population and timelines.' },
    { code: 'PART_I.SPONSOR', title: 'Part I — sponsor and contact information', module: 2, required: true, contentType: 'form', guidance: 'CTIS handbook §2.2: sponsor duties and functional contacts; legal representative when applicable.' },
    { code: 'PART_I.PRODUCTS', title: 'Part I — investigational and auxiliary product information', module: 2, required: true, contentType: 'form', guidance: 'CTIS handbook §§2.2, 2.4.5: each product role, authorisation status, dose and administration; product-specific conditional fields.' },
    { code: 'PART_I.PROTOCOL', title: 'Part I — clinical trial protocol', module: 2, required: true, contentType: 'mixed', guidance: 'CTR Annex I D; CTIS handbook §2.2: versioned protocol; review publication copy for personal data and CCI.' },
    { code: 'PART_I.SYNOPSIS', title: 'Part I — protocol synopsis', module: 2, required: true, contentType: 'narrative', guidance: 'CTR Annex I D; CTIS handbook §2.2: synopsis and required translations; prepare the publication copy.' },
    { code: 'PART_I.DSMC', title: 'Part I — data safety monitoring committee charter', module: 2, required: false, contentType: 'narrative', guidance: 'CTIS handbook §2.2: include when a DSMC is used; justify the trial safety-monitoring arrangements.' },
    { code: 'PART_I.IB_SMPC', title: 'Part I — Investigator Brochure or eligible SmPC alternative', module: 2, required: true, contentType: 'mixed', guidance: 'CTR Annex I E; CTIS handbook §§2.2, 2.4.5: IB or SmPC as applicable; use the correct upload slot to prevent unintended IB publication.' },
    { code: 'PART_I.GMP', title: 'Part I — manufacturing/import authorisation and QP GMP evidence', module: 2, required: false, contentType: 'mixed', guidance: 'CTR Annex I F; CTIS handbook §2.2: manufacturing/import authorisation and QP certification when applicable to the product and supply chain.' },
    { code: 'PART_I.IMPD_Q', title: 'Part I — IMPD quality or justified alternative', module: 2, required: true, contentType: 'mixed', guidance: 'CTR Annex I G; CTIS handbook §§2.2, 2.4.5: IMPD-Q, simplified dossier or justified reference/no-upload alternative for each applicable product.' },
    { code: 'PART_I.IMPD_SE', title: 'Part I — IMPD safety, efficacy and benefit-risk or justified alternative', module: 2, required: true, contentType: 'mixed', guidance: 'CTR Annex I G; CTIS handbook §§2.2, 2.4.5: nonclinical/clinical evidence and benefit-risk; simplified dossier or justified reference/no-upload alternative as applicable.' },
    { code: 'PART_I.AXMP', title: 'Part I — auxiliary medicinal product dossier or no-upload rationale', module: 2, required: false, contentType: 'mixed', guidance: 'CTR Annex I H; CTIS handbook §2.2: dossier or reason for no upload when an auxiliary medicinal product is used.' },
    { code: 'PART_I.SCIENTIFIC_ADVICE', title: 'Part I — scientific advice', module: 2, required: false, contentType: 'mixed', guidance: 'CTR Annex I I; CTIS handbook §2.2: include applicable authority advice and quality advice when received.' },
    { code: 'PART_I.PIP', title: 'Part I — Paediatric Investigation Plan information', module: 2, required: false, contentType: 'mixed', guidance: 'CTR Annex I I; CTIS handbook §2.2: PIP number/opinion when the trial is part of a PIP; do not invent a PIP obligation.' },
    { code: 'PART_I.LABEL', title: 'Part I — investigational medicinal product labelling content', module: 2, required: true, contentType: 'mixed', guidance: 'CTR Annex I J; CTIS handbook §2.2: content labelling for IMPs and linked products; assess product-specific labelling rules.' },

    // Part II: repeat applicable material for each MSC (CTR Article 7).
    { code: 'PART_II.SITES', title: 'Part II — trial sites and principal investigators', module: 3, required: true, contentType: 'form', guidance: 'CTIS handbook §§2.2, 2.4.6: populate sites and investigators per MSC using functional contacts; these data are published.' },
    { code: 'PART_II.RECRUITMENT', title: 'Part II — recruitment arrangements', module: 3, required: true, contentType: 'mixed', guidance: 'CTR Annex I K; CTIS handbook §2.4.6: national templates and recruitment materials; redact publication copies where required.' },
    { code: 'PART_II.CONSENT', title: 'Part II — participant information, consent forms and procedure', module: 3, required: true, contentType: 'mixed', guidance: 'CTR Annex I L; CTIS handbook §2.4.6: MSC languages, population-specific consent and publication/redaction requirements.' },
    { code: 'PART_II.INVESTIGATOR', title: 'Part II — investigator CV and suitability', module: 3, required: true, contentType: 'mixed', guidance: 'CTR Annex I M; CTIS handbook §2.2: CV, suitability and applicable declaration-of-interest documentation.' },
    { code: 'PART_II.FACILITIES', title: 'Part II — suitability of facilities', module: 3, required: true, contentType: 'form', guidance: 'CTR Annex I N; CTIS handbook §2.2: site suitability statement using applicable national requirements.' },
    { code: 'PART_II.INSURANCE', title: 'Part II — insurance cover or indemnification', module: 3, required: true, contentType: 'form', guidance: 'CTR Annex I O; CTIS handbook §2.2: applicable insurance/indemnification evidence; assess low-intervention and national provisions.' },
    { code: 'PART_II.FINANCIAL', title: 'Part II — financial and other arrangements', module: 3, required: true, contentType: 'mixed', guidance: 'CTR Annex I P; CTIS handbook §2.2: funding, compensation and agreements required by the MSC.' },
    { code: 'PART_II.DATA_PROTECTION', title: 'Part II — national data protection material and participant-material translations', module: 3, required: false, contentType: 'mixed', guidance: 'CTIS handbook §§2.2, 2.4.6: additional national compliance documents and patient-facing translations when applicable.' },
    { code: 'PART_II.BIOLOGICAL_SAMPLES', title: 'Part II — biological sample compliance', module: 3, required: false, contentType: 'mixed', guidance: 'CTR Article 7(1)(h), Annex I D; CTIS handbook §2.4.6: collection, storage and future use arrangements when samples are collected.' },
  ],
};

const CTA_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_protocol', title: 'Protocol & IMPD', description: 'Clinical protocol and investigational medicinal product dossier', phase: 'authoring', order: 0,
    tasks: [
      { id: 't_protocol', title: 'Clinical Protocol', description: 'Draft protocol and synopsis against CTR Annex I and applicable ICH E6(R3)', assigneeRole: 'clinical_lead', estimatedDays: 20 },
      { id: 't_impd', title: 'IMPD (Investigational Medicinal Product Dossier)', description: 'Quality, nonclinical/clinical and benefit-risk evidence; confirm simplified or reference alternatives', assigneeRole: 'regulatory_lead', estimatedDays: 25 },
      { id: 't_ib', title: 'Investigator Brochure', description: 'Current IB or eligible SmPC alternative under CTR Annex I E; review the CTIS upload/publication slot', assigneeRole: 'clinical_lead', estimatedDays: 15 },
    ],
  },
  {
    id: 'ms_ctis', title: 'CTIS Application', description: 'EU Clinical Trials Information System submission', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_ctis_form', title: 'CTIS Application Form', description: 'Complete CTIS application form', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
      { id: 't_msc', title: 'Member State Concerned Selection', description: 'Select reporting and concerned member states', assigneeRole: 'regulatory_lead', estimatedDays: 3 },
      { id: 't_informed_consent', title: 'Informed Consent Forms', description: 'Per-country ICFs', assigneeRole: 'clinical_lead', estimatedDays: 10 },
    ],
  },
  {
    id: 'ms_review', title: 'Review', description: 'Internal review', phase: 'review', order: 2,
    tasks: [
      { id: 't_ethics_prep', title: 'Ethics Committee Preparation', description: 'Prepare ethics documentation', assigneeRole: 'regulatory_lead', estimatedDays: 7 },
      { id: 't_qc', title: 'QC Review', description: 'Quality check all documents', assigneeRole: 'qa_lead', estimatedDays: 5 },
    ],
  },
  {
    id: 'ms_submit', title: 'Submission', description: 'CTIS submission', phase: 'finalization', order: 3,
    tasks: [
      { id: 't_ctis_submit', title: 'CTIS Portal Submission', description: 'Submit via CTIS', assigneeRole: 'regulatory_lead', estimatedDays: 2 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'eu_cta_tasks',
  name: 'EU CTA Task Blueprint',
  milestones: CTA_MILESTONES,
};
