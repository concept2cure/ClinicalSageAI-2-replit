/**
 * Canada CTA Blueprint — Clinical Trial Application (Health Canada)
 *
 * Health Canada CTAs are filed under the Food and Drug Regulations (Division 5).
 * The application uses regional Modules 1–3. REB approval before trial start and
 * investigator undertakings retained in site records are separate obligations;
 * they are not universal attachments to an initial CTA.
 *
 * @module server/services/regulatory/registry/blueprints/canadaCtaBlueprint
 */

import type { SectionBlueprint, SectionDefinition, TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';

export const CA_CTA_BLUEPRINT_SOURCES = [
  {
    title: 'Health Canada Guidance Document for Clinical Trial Sponsors: Clinical Trial Applications',
    url: 'https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/clinical-trials/clinical-trial-sponsors-applications.html',
    version: 'Effective 29 May 2013; revised 17 March 2016; page details 17 August 2026; sections 2.3.2, 2.4.4, 2.7 and Appendix 3',
    verifiedAt: '2026-10-07',
  },
  {
    title: 'Health Canada Organization and document placement for Canadian module 1',
    url: 'https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/organization-document-placement-canadian-module-1.html',
    version: 'Revision history 2 April 2024; takes precedence for document placement',
    verifiedAt: '2026-10-07',
  },
  {
    title: 'Health Canada Management of drug submissions and applications: Pre-application and filing',
    url: 'https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/management-drug-submissions-applications/pre-application-filing.html',
    version: 'Page details 20 May 2026; CTA/CTA-A-specific format and delivery instructions',
    verifiedAt: '2026-10-07',
  },
  {
    title: 'Health Canada Interim policy for the modernization of the clinical trial framework',
    url: 'https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/announcements/interim-policy-modernization-clinical-trial-framework-notice.html',
    version: 'Notice 14 September 2026; targeted REB, investigator qualification and documented-consent policy',
    verifiedAt: '2026-10-07',
  },
] as const;

/**
 * Initial human-drug CTA: administrative/clinical material in Module 1, quality
 * summaries in Module 2 and additional supporting quality in Module 3. This is
 * not a full marketing CTD. `required` is a baseline platform expectation, not
 * a complete legal applicability decision. Conditional quality, references,
 * format, sites and product-specific requirements must be resolved with the
 * sponsor; a false flag does not waive an applicable requirement.
 */
export const sectionBlueprint: SectionBlueprint = {
  id: 'ca_cta_sections',
  name: 'Canada CTA Sections (Health Canada Modules 1–3)',
  sections: [
    { code: '1.0.1', title: 'Module 1 — cover letter', module: 1, required: true, contentType: 'narrative', guidance: 'CTA guidance §2.3.2; Module 1 placement table: identify the initial CTA and supporting package.' },
    { code: '1.0.5', title: 'Module 1 — relevant meeting information', module: 1, required: false, contentType: 'mixed', guidance: 'CTA guidance §2.3.2: include pre-CTA discussions/conclusions or other meeting information when applicable.' },
    { code: '1.1', title: 'Module 1 — table of contents (non-eCTD only)', module: 1, required: false, contentType: 'list', guidance: 'Current Module 1 placement table: non-eCTD format only; do not provide a table of contents in an eCTD transaction.' },
    { code: '1.2.1', title: 'Module 1 — signed HC/SC 3011 application and applicable appendices', module: 1, required: true, contentType: 'form', guidance: 'CTA guidance §2.3.2; Module 1 placement: signed HC/SC 3011, including Appendix 3 attestations and applicable appendices, as one file.' },
    { code: '1.2.3', title: 'Module 1 — applicable certifications and additional-drug attestation', module: 1, required: false, contentType: 'form', guidance: 'CTA guidance §2.3.2: certifications and Summary of Additional Drugs when applicable; keep HC/SC 3011 appendices with that form.' },
    { code: '1.2.5.1', title: 'Module 1 — clinical trial site information', module: 1, required: false, contentType: 'form', guidance: 'CTA guidance §§2.3.2, 2.7.3; current Module 1 placement: use online CTSI when sites are known; provide before site trial start.' },
    { code: '1.2.6', title: 'Module 1 — reference/access authorisation', module: 1, required: false, contentType: 'form', guidance: 'CTA guidance §2.3.2: identify referenced authorised applications or master files and supply access authorisation when needed.' },
    { code: '1.2.7', title: 'Module 1 — foreign regulatory and ethics refusals', module: 1, required: false, contentType: 'mixed', guidance: 'CTA guidance §2.3.2: disclose foreign regulatory/REB refusals when applicable; follow current Module 1 placement.' },
    { code: '1.2.9', title: 'Module 1 — other administrative information', module: 1, required: false, contentType: 'mixed', guidance: 'CTA guidance §2.3.2; Module 1 placement: administrative material without another location; no scientific data here.' },
    { code: '1.3.4', title: 'Module 1 — current Investigator Brochure or Canadian Product Monograph reference', module: 1, required: true, contentType: 'mixed', guidance: 'CTA guidance §2.3.2: current IB and relevant updates; dated Canadian Product Monograph reference may be used for marketed products if an updated IB is unavailable.' },
    { code: '1.4.1', title: 'Module 1 — protocol synopsis (PSEAT-CTA)', module: 1, required: true, contentType: 'mixed', guidance: 'CTA guidance §2.3.2: initial CTA synopsis using PSEAT-CTA; this initial-only item is excluded from CTA-A.' },
    { code: '1.7.1', title: 'Module 1 — final proposed clinical trial protocol', module: 1, required: true, contentType: 'mixed', guidance: 'CTA guidance §2.3.2: final proposed protocol with version number.' },
    { code: '1.7.2', title: 'Module 1 — proposed informed consent materials', module: 1, required: true, contentType: 'mixed', guidance: 'CTA guidance §2.3.2: risk/benefit consent specimens; assess documented-consent processes under the 14 September 2026 interim policy and applicable consent law.' },
    { code: '1.7.3', title: 'Module 1 — Canadian REB refusals', module: 1, required: false, contentType: 'mixed', guidance: 'CTA guidance §2.3.2: known refusals with REB details, reason and date; not a universal REB approval attachment.' },
    { code: '1.7.4', title: 'Module 1 — prior-related applications', module: 1, required: false, contentType: 'list', guidance: 'CTA guidance §2.3.2: related ongoing authorised Canadian trials when applicable.' },
    { code: '2.1', title: 'Module 2 — quality-summary table of contents', module: 2, required: false, contentType: 'list', guidance: 'CTA guidance §2.3.2: quality-only Module 2 contents; confirm current electronic format requirements.' },
    { code: '2.3', title: 'Module 2 — phase/product-appropriate quality summary (QOS/QIS)', module: 2, required: false, contentType: 'mixed', guidance: 'CTA guidance §2.3.2: quality only; NOC/DIN-authorised unmodified products are exempt. Assess phase/product template and permitted prior-quality reference.' },
    { code: '3.1', title: 'Module 3 — supporting-quality table of contents', module: 3, required: false, contentType: 'list', guidance: 'CTA guidance §2.3.2: when Module 3 is provided, follow current electronic format requirements.' },
    { code: '3.2', title: 'Module 3 — additional supporting quality data', module: 3, required: false, contentType: 'mixed', guidance: 'CTA guidance §2.3.2: additional quality evidence when needed, cross-referenced from QOS/QIS; scope depends on product and development phase.' },
    { code: '3.3', title: 'Module 3 — quality literature references', module: 3, required: false, contentType: 'list', guidance: 'CTA guidance Appendix 3: quality references when relied upon.' },
  ],
};

const AMENDMENT_GUIDANCE: Record<string, string> = {
  '1.0.1': 'CTA guidance §§2.3.2, 2.4: identify original CTA(s)/CTA-As with file and control numbers; describe amendment scope. For biologic/radiopharmaceutical quality amendments list proposed quality changes.',
  '1.2.5.1': 'CTA guidance §2.4.4: clinical amendment site information when applicable, not a quality-only CTA-A item; use current online CTSI instructions and site-start timing.',
  '1.2.7': 'CTA guidance §2.4.4: clinical amendment foreign refusal information when applicable, not a quality-only CTA-A item.',
  '1.3.4': 'CTA guidance §2.3.2: duration-extending clinical amendment needs updated IB/equivalent toxicology and clinical safety support. Biologic/radiopharmaceutical quality amendment: revised IB/addendum if applicable.',
  '1.7.1': 'CTA guidance §2.3.2: clinical amendment requires amended/working and most recently authorized protocols; show original versus revised wording and rationale. Cross-reference alone is not acceptable.',
  '1.7.2': 'CTA guidance §§2.3.2, 2.4.4: clinical amendment revised annotated consent if participant information changes, not a quality-only CTA-A item.',
  '1.7.3': 'CTA guidance §2.3.2: clinical amendment known Canadian REB refusals with reason/date and contact details.',
  '2.3': 'CTA guidance §§2.3.2, 2.4.2: quality amendment uses the applicable QOS/QIS and supporting changed-quality evidence; confirm product-specific amendment versus notification classification.',
  '3.2': 'CTA guidance §§2.3.2, 2.4.2: quality amendment supporting changed-quality data when needed; cross-reference from the applicable QOS/QIS.',
};

/**
 * CTA-A is a change to an authorised trial, not a resubmitted initial CTA.
 * Clinical-only, quality-only and combined amendments have different content.
 * In particular §2.4.4 excludes PSEAT for all CTA-As and CTSI, international
 * information and ICF from quality-only CTA-As. Only cover/application are
 * baseline required here; every applicable change-specific row remains necessary.
 */
export const amendmentSectionBlueprint: SectionBlueprint = {
  id: 'ca_cta_a_sections',
  name: 'Canada CTA-A Sections (clinical and/or quality amendment, Modules 1–3)',
  sections: sectionBlueprint.sections
    .filter(section => section.code !== '1.4.1')
    .map((section): SectionDefinition => ({
      ...section,
      title: section.code === '1.7.1' ? 'Module 1 — clinical amendment protocol and change package' : section.title,
      required: section.code === '1.0.1' || section.code === '1.2.1',
      guidance: AMENDMENT_GUIDANCE[section.code] ?? section.guidance,
    })),
};

const CTA_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_protocol', title: 'Protocol, IB & CTA-Quality', description: 'Clinical protocol, Investigator Brochure and CTA quality (CMC) information', phase: 'authoring', order: 0,
    tasks: [
      { id: 't_protocol', title: 'Clinical Protocol', description: 'Draft final versioned protocol and PSEAT-CTA synopsis under current Health Canada and applicable ICH E6(R3) guidance', assigneeRole: 'clinical_lead', estimatedDays: 20 },
      { id: 't_ib', title: 'Investigator Brochure', description: 'Prepare current IB with updates or eligible dated Canadian Product Monograph reference', assigneeRole: 'clinical_lead', estimatedDays: 15 },
      { id: 't_cta_quality', title: 'CTA Quality (Chemistry & Manufacturing) Information', description: 'Module 2 quality summary with Module 3 supporting evidence when needed; assess authorised-product and reference exceptions', assigneeRole: 'cmc_lead', estimatedDays: 20 },
    ],
  },
  {
    id: 'ms_hc_package', title: 'Health Canada CTA Package', description: 'Assemble the Health Canada regional CTA application', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_cta_form', title: 'Clinical Trial Application Form (HC/SC)', description: 'Complete and sign HC/SC 3011 with applicable appendices and Appendix 3 attestations', assigneeRole: 'regulatory_lead', estimatedDays: 3 },
      { id: 't_reb', title: 'Research Ethics Board (REB) Approval', description: 'Ensure REB approval before each site starts the trial; keep approval records and disclose applicable refusals', assigneeRole: 'clinical_lead', estimatedDays: 15 },
      { id: 't_qidp', title: 'Qualified Investigator / Site Documentation', description: 'Retain investigator undertaking in site records; submit CTSI online under current instructions before site trial start', assigneeRole: 'clinical_lead', estimatedDays: 7 },
    ],
  },
  {
    id: 'ms_review', title: 'Review', description: 'Internal QC and compliance review', phase: 'review', order: 2,
    tasks: [
      { id: 't_qc', title: 'QC Review', description: 'Quality check all CTA documents', assigneeRole: 'qa_lead', estimatedDays: 5 },
      { id: 't_compliance', title: 'Compliance Check', description: 'Food and Drug Regulations (Division 5) compliance', assigneeRole: 'regulatory_lead', estimatedDays: 3 },
    ],
  },
  {
    id: 'ms_submit', title: 'Submission', description: 'Submit to Health Canada (30-day default review)', phase: 'finalization', order: 3,
    tasks: [
      { id: 't_submit', title: 'Health Canada Submission', description: 'Prepare the accepted eCTD or non-eCTD activity and confirm current Health Canada delivery instructions', assigneeRole: 'regulatory_lead', estimatedDays: 2 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'ca_cta_tasks',
  name: 'Canada CTA Task Blueprint',
  milestones: CTA_MILESTONES,
};
