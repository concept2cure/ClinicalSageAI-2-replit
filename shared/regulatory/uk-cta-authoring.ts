/** UK medicinal-trial preparation data, shared by project setup and authoring. */
import type { SectionBlueprint, TaskBlueprint } from './document-taxonomy';
import type { RegulatoryBasis } from './regulatory-basis';

export const UK_CTA_BLUEPRINT_SOURCES = [
  { id: 'approval', title: 'MHRA: apply for approval in the UK', url: 'https://www.gov.uk/guidance/clinical-trials-for-medicines-apply-for-approval-in-the-uk', updated: '2026-04-28', checked: '2026-11-06' },
  { id: 'transition', title: 'MHRA: Clinical Trials Regulations transitional arrangements', url: 'https://www.gov.uk/guidance/clinical-trials-for-medicines-clinical-trials-regulations-transitional-arrangements', updated: '2026-07-15', checked: '2026-11-06' },
  { id: 'notifiable', title: 'MHRA: notifiable trials', url: 'https://www.gov.uk/guidance/clinical-trials-for-medicines-notifiable-trials', updated: '2026-04-28', checked: '2026-11-06' },
  { id: 'hra', title: 'HRA: document management for combined review applications', url: 'https://www.hra.nhs.uk/planning-and-improving-research/policies-standards-legislation/clinical-trials-investigational-medicinal-products-ctimps/combined-ways-working-pilot/combined-review/document-management-combined-review-applications/', updated: '2026-07-02', checked: '2026-11-06' },
] as const;

export const outlineBasis: RegulatoryBasis = {
  ref: 'Platform UK medicinal-trial preparation groups informed by MHRA approval guidance effective 28 April 2026 and HRA combined-review document guidance',
  url: UK_CTA_BLUEPRINT_SOURCES[0].url,
  confidence: 'platform-convention', checked: '2026-11-06',
  note: 'Sources were read on the checked date; the preparation groups are not an official IRAS form schema or a legal applicability decision.',
};

export const outlineLimitations: readonly string[] = [
  'This outline covers medicinal-product clinical trial preparation only; it does not cover standalone device investigations or IVD performance studies, or widen product-class admission.',
  'The initial application submission date determines old/new rules: before 28 April 2026 is old rules even if the outcome is later; on or after that date is new rules. The present date and use of combined review do not decide this. The initial date and lifecycle remain unassessed here; this is not an automatic rule selector.',
  'Numeric modules are platform groups: 1 = application and scope, 2 = MHRA product/scientific evidence, 3 = REC and study-wide material. They are not UK eCTD module designations.',
  'Required flags are baseline preparation expectations including permitted alternatives, not universal legal requirements. A false flag leaves applicability unresolved, not waived. Confirm each IMP, population, sponsor and trial scope from source records.',
  'Quality, nonclinical, prior human experience and benefit-risk are evidence groups that may be contained or cross-referenced in the IMPD, IB or other permitted documents; they do not demand duplicate mandatory standalone IRAS uploads.',
  'Standard initial applications use combined IRAS review by MHRA and REC. Exceptional separate applications require advance written approval from the licensing authority (MHRA); retain the agreement and its instructions.',
  'This outline provides no IRAS field schema, completed forms, technical validation or transmission. Prepare content here and complete/validate the actual forms in IRAS. It does not establish package readiness or trial-start approval; verify joint MHRA authorisation and a favourable REC opinion, plus other applicable approvals before trial start.',
  'The HRA page is dated 2 July 2026 but still links to pre-28 April MHRA authorisation guidance; those links do not establish currency. The current MHRA approval page repeats nonclinical wording under previous human experience; use its explicit GCP/registry points and resolve the source ambiguity with MHRA, rather than inventing a replacement requirement.',
  ...UK_CTA_BLUEPRINT_SOURCES.map(source => `${source.title}; updated ${source.updated}, read ${source.checked}: ${source.url}`),
];

export const sectionBlueprint: SectionBlueprint = {
  id: 'uk_cta_sections',
  name: 'UK medicinal clinical trial: combined IRAS preparation',
  sections: [
    { code: 'uk_cta_scope', title: 'Initial application scope and regulatory date', module: 1, required: true, contentType: 'mixed',
      guidance: 'Record medicinal-trial scope, IMPs, sponsor, population and the initial application submission date. Assess the 28 April 2026 old/new-rules boundary from that date, not today. Confirm initial versus modification scope and any additional approvals; missing facts remain unassessed. MHRA transitional arrangements.' },
    { code: 'uk_cta_cover_letter', title: 'Cover letter', module: 1, required: true, contentType: 'narrative',
      guidance: 'Prepare trial identifiers/IRAS ID, notifiable status and rationale, safety concerns, novel/adaptive design, IMP/NIMP dose/route/duration, population, registry details, dated document index and purchase order. Identify IB/RSI for each IMP and pivotal GLP study titles/numbers, countries, sponsor and OECD compliance or explanation. Include applicable resubmission, separate-route agreement, first-in-human/UK use, DM, specialist, scientific-advice/PIP and IVD details. MHRA approval guidance: Cover letter.' },
    { code: 'uk_cta_application_form', title: 'IRAS medicines form preparation', module: 1, required: true, contentType: 'form',
      guidance: 'Reconcile trial identification, sponsor, applicant, IMP, general trial, population and investigator facts for the current medicines form in IRAS. This authored content is not the completed IRAS form or a field schema. The study information dataset goes to REC/study-wide review. MHRA approval guidance: Medicines form.' },
    { code: 'uk_cta_protocol', title: 'Protocol and synopsis', module: 2, required: true, contentType: 'mixed', therapeuticContext: 'protocol',
      guidance: 'Use the current protocol, version/date and synopsis: objectives, design, methodology, statistics, recruitment/consent, special populations, risks/benefits, comparator justification, end-of-trial definition, aftercare, sub-studies, safety reporting and unblinding. Record adaptive/multi-part limits and applicable sponsor and chief/coordinating investigator signatures. MHRA approval guidance: Protocol.' },
    { code: 'uk_cta_ib', title: 'Investigator’s Brochure or permitted equivalent', module: 2, required: true, contentType: 'mixed',
      guidance: 'Prepare the current IB for each IMP, with clinical/nonclinical evidence and an identified RSI section listing expected serious adverse reactions and frequencies; check/update at least annually. An eligible IMP authorised in the EU, EEA or an ICH country may use an SmPC or equivalent. If used outside authorised conditions, supplement it with relevant nonclinical and clinical data. Identify the relevant SmPC RSI section. MHRA approval guidance: Investigator’s Brochure.' },
    { code: 'uk_cta_impd', title: 'IMPD or justified equivalent and references', module: 2, required: true, contentType: 'mixed',
      guidance: 'Account for every IMP, including placebo/reference products. Prepare an IMPD or explain its absence and justify an eligible simplified dossier, SmPC/equivalent or cross-reference. Only a UK IMPD from an approved trial with the same IMP may be referenced; another sponsor/organisation needs a letter of authorisation. Trial-specific GMP and labelling documents cannot be cross-referenced from a previous trial. An ASMF is not a substitute. MHRA approval guidance: Cross-referencing and simplified IMP dossiers; HRA document table.' },
    { code: 'uk_cta_quality', title: 'Product quality evidence', module: 2, required: true, contentType: 'mixed',
      guidance: 'Prepare trial-appropriate product quality/manufacture/control evidence in the IMPD or justified equivalent using CTD Module 3 structure. Account for the actual chemical/biological product, modification and clinical materials; describe dose preparation in P.2 or reference the full protocol method. This does not require a marketing dossier or expand CMC composition scope. MHRA approval guidance: Quality data.' },
    { code: 'uk_cta_gmp', title: 'Applicable manufacturing, import and GMP evidence', module: 2, required: false, contentType: 'mixed',
      guidance: 'Assess manufacturing/import/batch certification locations and applicable MIA(IMP), authorisations, trial/product-specific QP declarations and GB oversight. Confirmation is not required for an IMP authorised in the UK or EU and not modified; verify the actual exception and labelling/manufacture conditions. A simplified IMPD is not an automatic GMP waiver. Previous-trial GMP documents cannot be reused by reference. MHRA approval guidance: GMP compliance and simplified dossiers; HRA manufacturing row.' },
    { code: 'uk_cta_nonclinical', title: 'Nonclinical pharmacology and toxicology evidence', module: 2, required: true, contentType: 'mixed',
      guidance: 'Summarise available pharmacology/toxicology, preferably using CTD Module 4 headings with tables and brief narrative. Include study/literature references, titles/numbers, facilities, dates, GLP compliance or robust justification, adequate study detail, critical safety analysis and impurity representativeness of test versus clinical materials. Justify missing data; do not fabricate studies. MHRA approval guidance: Non-clinical pharmacology and toxicology data.' },
    { code: 'uk_cta_human_experience', title: 'Prior clinical trial and human experience evidence', module: 2, required: true, contentType: 'mixed',
      guidance: 'Prepare available human experience in the IMPD/IB or justified equivalent. Record the GCP compliance statement for referenced trials, issues affecting use of their data, and public registry/results links or justified absence. The source repeats a nonclinical paragraph under this heading; do not treat that as a prescribed human-evidence format. MHRA approval guidance: Previous clinical trial and human experience data.' },
    { code: 'uk_cta_benefit_risk', title: 'Trial-specific risk and benefit analysis', module: 2, required: true, contentType: 'narrative',
      guidance: 'Critically relate nonclinical and clinical evidence to the proposed trial, premature study terminations/reasons, exposure-based safety margins where possible, clinical relevance and further monitoring. An absent result stays an evidence gap; a disease label does not establish benefit. MHRA approval guidance: Risk and benefit assessment.' },
    { code: 'uk_cta_labelling', title: 'IMP label content or justified alternative', module: 2, required: true, contentType: 'mixed',
      guidance: 'Prepare label content for all IMPs under current trial-specific labelling guidance or the applicable Part 13 Human Medicines Regulations statement; explain any justified absence. These are trial-specific records, not labels reused by reference from another trial. Assess transitional labelling rules separately. MHRA approval guidance: Other required documents; HRA label row.' },
    { code: 'uk_cta_references', title: 'Source, version and document index', module: 2, required: true, contentType: 'list',
      guidance: 'Reconcile document versions/dates, studies, literature, registry/results links and authorised cross-references with the cover index and submitted evidence. Preserve source lineage. Confirm copy-and-paste functionality and no password protection. MHRA approval guidance: Cover letter, nonclinical data and Other required documents.' },
    { code: 'uk_cta_notifiable', title: 'Notifiable trial criteria and confirmation', module: 1, required: false, contentType: 'mixed',
      guidance: 'If seeking the notifiable route, assess current inclusion/exclusion criteria and practical reasons for full assessment, prepare the Confirmation of notifiable trial criteria form and cover-letter statement, and retain standard accompanying documents. Automatic MHRA authorisation does not replace combined clinical trial approval. MHRA notifiable-trials guidance.' },
    { code: 'uk_cta_scientific_advice', title: 'Applicable scientific advice and PIP records', module: 2, required: false, contentType: 'mixed',
      guidance: 'If received, include relevant scientific advice/correspondence and any paediatric investigation plan opinion; reconcile their relevance to this protocol and IMP. An absent PIP opinion is not automatically a defect for every trial. MHRA approval guidance: Other required documents; HRA scientific-advice/PIP row.' },
    { code: 'uk_cta_specialist', title: 'Applicable committee and specialist material', module: 2, required: false, contentType: 'mixed',
      guidance: 'When the trial needs committee/specialist consultation, include the supporting information and flag this in the cover letter. Confirm product-specific consultation, for example xenogenic-cell considerations, from current instructions. MHRA approval guidance: Consultation and Other required documents.' },
    { code: 'uk_cta_ivd', title: 'IVD and companion diagnostic trial support', module: 2, required: false, contentType: 'mixed',
      guidance: 'If an IVD/companion diagnostic is used within the medicinal trial, record validation/marking status and applicable additional documentation under the dedicated MHRA guidance. This row does not cover a standalone device investigation or IVD performance study or establish conformity. MHRA approval guidance: Cover letter and Other required documents.' },
    { code: 'uk_cta_decentralised', title: 'Decentralised manufacturing records', module: 2, required: false, contentType: 'mixed',
      guidance: 'If the IMP is decentralised manufactured, record the DM designation number in the cover letter and include the DM master file with the full application, together with applicable manufacture/quality evidence. MHRA approval guidance: Cover letter.' },
    { code: 'uk_cta_auxiliary', title: 'Applicable auxiliary and non-investigational product information', module: 2, required: false, contentType: 'mixed',
      guidance: 'When applicable, identify NIMPs and auxiliary product information needed for the actual trial, and assess whether an AMPD or other supporting record is appropriate. HRA lists AMPD as not mandatory; do not turn that category into a universal attachment or a waiver of product-specific evidence. MHRA cover letter; HRA AMPD row.' },
    { code: 'uk_cta_rec_dataset', title: 'IRAS study information for REC and study-wide review', module: 3, required: true, contentType: 'form',
      guidance: 'Prepare the study information dataset and applicable study-wide facts through the current IRAS instructions, separately from MHRA medicines-form preparation. This outline does not supply IRAS field names or replace the actual completed dataset. MHRA medicines-form guidance; HRA combined-review document management.' },
    { code: 'uk_cta_participant_info', title: 'Participant information and consent documents', module: 3, required: true, contentType: 'mixed',
      guidance: 'Prepare current participant information and informed-consent documents for REC/study-wide review, identifying separate arms/populations and versions clearly. Confirm special-population/consent arrangements against actual records; an outline does not approve consent. HRA participant information and informed consent row: mandatory initial submission.' },
    { code: 'uk_cta_ci_cv', title: 'Chief Investigator CV', module: 3, required: true, contentType: 'mixed',
      guidance: 'Prepare the Chief Investigator’s CV demonstrating relevant education, training and experience for REC/study-wide review. HRA marks this mandatory for initial applications and modifications changing the Chief Investigator; do not infer every site investigator CV is a universal initial upload.' },
    { code: 'uk_cta_insurance', title: 'Insurance, indemnity or permitted NHS/HSC statement', module: 3, required: true, contentType: 'mixed',
      guidance: 'Prepare current insurance/indemnity evidence for the actual sponsor. For an NHS/HSC-sponsored study with no additional insurance needed, prepare the permitted Word statement instead. Confirm the alternative from source records; do not invent a certificate or blanket insurance exemption. HRA proof-of-insurance row, for REC/study-wide review.' },
    { code: 'uk_cta_rec_support', title: 'Applicable recruitment, facilities and financial support', module: 3, required: false, contentType: 'mixed',
      guidance: 'When applicable, prepare recruitment materials/invitations, site facilities statements, funder letters, financial arrangements and other REC/study-wide supporting documents. HRA distinguishes additional support from baseline verification uploads; assess what the study needs rather than requiring every optional document.' },
    { code: 'uk_cta_local_info', title: 'Applicable UK local information pack and schedule', module: 3, required: false, contentType: 'mixed',
      guidance: 'For non-commercial studies with participating NHS/HSC organisations where a UK Local Information Pack is required, prepare a Schedule of Events or SoECAT per outline Organisation Information Document, in the requested Excel format. Confirm the applicable local pack and supporting templates. HRA marks the category not mandatory for IRAS verification but states this conditional requirement; it is not a waiver.' },
  ],
};

export const taskBlueprint: TaskBlueprint = {
  id: 'uk_cta_tasks', name: 'UK combined-review preparation tasks',
  milestones: [
    { id: 'ms_uk_scope', title: 'Confirm trial and evidence scope', phase: 'pre_submission', order: 0,
      description: 'Resolve source facts and missing evidence; durations are planning estimates, not agency review clocks.',
      tasks: [
        { id: 't_uk_scope', title: 'Confirm application scope and initial date', description: 'Record the initial application submission date, medicinal-product trial scope and old/new-rule assessment; retain advance written MHRA approval if using exceptional separate applications.', assigneeRole: 'regulatory_lead', estimatedDays: 3 },
        { id: 't_uk_protocol', title: 'Prepare the protocol and synopsis', description: 'Reconcile objectives, design, statistical methods, population, consent, safety and applicable signatures with current source versions.', assigneeRole: 'clinical_lead', estimatedDays: 15 },
        { id: 't_uk_product', title: 'Prepare product and scientific evidence', description: 'Prepare the IB/permitted equivalent and IMPD/justified reference, quality, nonclinical, human experience, benefit-risk, labelling and applicable trial-specific GMP evidence.', assigneeRole: 'regulatory_lead', estimatedDays: 20 },
      ] },
    { id: 'ms_uk_application', title: 'Prepare combined-review documents', phase: 'authoring', order: 1,
      description: 'Prepare content in the shared editor and complete the current external IRAS forms; no schema or connector is supplied here.',
      tasks: [
        { id: 't_uk_form', title: 'Prepare the cover letter and IRAS information', description: 'Complete the actual medicines form and study information dataset in IRAS; reconcile identifiers and the dated document index with the cover letter.', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
        { id: 't_uk_rec', title: 'Prepare REC and study-wide evidence', description: 'Prepare participant/consent documents, Chief Investigator CV and insurance or permitted NHS/HSC statement; assess local information, SoECAT, recruitment, facilities and financial support.', assigneeRole: 'clinical_lead', estimatedDays: 10 },
        { id: 't_uk_conditional', title: 'Assess conditional trial documents', description: 'Assess notifiable criteria/form, advice/PIP, specialist consultation, DM and IVD material for the actual trial; unknown applicability remains unresolved.', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
      ] },
    { id: 'ms_uk_review', title: 'Review and external submission', phase: 'finalization', order: 2,
      description: 'Human review and external application handling; preparation completion does not establish approval or readiness.',
      tasks: [
        { id: 't_uk_qc', title: 'Review sources, alternatives and final documents', description: 'Review currentness, scope, permitted alternatives, copyable/unprotected files and every unresolved fact; validate current forms in IRAS.', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
        { id: 't_uk_submit', title: 'Submit through the agreed external route', description: 'Submit the reviewed application through combined IRAS review, or the exceptional separate route explicitly agreed in advance by MHRA; record receipt without assuming an agency decision.', assigneeRole: 'regulatory_lead', estimatedDays: 2 },
        { id: 't_uk_approval', title: 'Verify approvals before trial start', description: 'Verify joint MHRA authorisation and favourable REC opinion, plus other applicable approvals and conditions, before trial start; automatic notifiable authorisation alone is insufficient.', assigneeRole: 'clinical_lead', estimatedDays: 2 },
      ] },
  ],
};
