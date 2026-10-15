/**
 * GCP & Clinical Trial Operations — reference data for the deterministic
 * knowledge engine in `gcp-operations-knowledge.ts` (same service, same purity
 * contract: no LLM, no network, no database). Split out of that module on
 * 2026-10-15 to keep it under the repository's 100 KB file ceiling; the tables
 * are unchanged, and their types are re-exported from the engine module.
 *
 * @module server/services/gcp-operations/gcp-operations-reference
 */

// ─────────────────────────────────────────────────────────────────────────────
// ICH E6(R3) Unifying Principles
// ─────────────────────────────────────────────────────────────────────────────

export interface E6Principle {
  id: string;
  title: string;
  statement: string;
  citation: string;
}

/**
 * The ICH E6(R3) "Principles of ICH GCP." R3 rewrote the 13 principles of
 * E6(R2) (superseded by E6(R3), 2025-01-06) as 11 overarching, media-neutral
 * principles built on quality-by-design and proportionate effort. The
 * statements below are paraphrased operational summaries; the local ids
 * (P1–P9) are this engine's own and are not R3 principle numbers — each
 * summary's citation names the R3 principle whose content it carries.
 */
export const E6R3_PRINCIPLES: E6Principle[] = [
  {
    id: 'P1',
    title: 'Ethical conduct',
    statement:
      'Clinical trials are conducted in accordance with ethical principles originating in the Declaration of Helsinki, consistent with GCP and applicable regulatory requirements.',
    citation: 'ICH E6(R3) Principle 1; Declaration of Helsinki',
  },
  {
    id: 'P2',
    title: 'Informed consent & rights of participants',
    statement:
      'Freely given informed consent is obtained from every participant prior to participation; the rights, safety and well-being of participants prevail over the interests of science and society.',
    citation: 'ICH E6(R3) Principle 2; 21 CFR 50.20',
  },
  {
    id: 'P3',
    title: 'Independent ethics review',
    statement:
      'Trials are subject to objective review by an IRB/IEC that is adequately constituted and operates independently of the investigator and sponsor.',
    citation: 'ICH E6(R3) Principle 3; 21 CFR Part 56',
  },
  {
    id: 'P4',
    title: 'Scientific soundness & quality by design',
    statement:
      'Trials are scientifically sound and described in a clear, detailed protocol; quality is built into the design and conduct by identifying factors critical to quality (CtQ) and managing risks to those factors proportionately.',
    citation: 'ICH E6(R3) Principle 4; Principle 6 (quality by design); ICH E8(R1)',
  },
  {
    id: 'P5',
    title: 'Proportionate, fit-for-purpose processes',
    statement:
      'Trial processes and the effort applied to them are proportionate to the risks to participants and to the reliability of trial results; activities that do not add value are avoided.',
    citation: 'ICH E6(R3) Principle 7 (proportionality)',
  },
  {
    id: 'P6',
    title: 'Roles, responsibilities & oversight',
    statement:
      'Roles and responsibilities are clear; the sponsor maintains oversight of delegated activities and service providers; investigators retain responsibility for the trial at their site.',
    citation: 'ICH E6(R3) Principle 10; Annex 1 §3.9 (sponsor oversight); 21 CFR 312.50; 312.60',
  },
  {
    id: 'P7',
    title: 'Qualified personnel',
    statement:
      'Persons conducting the trial are qualified by education, training and experience to perform their respective tasks.',
    citation: 'ICH E6(R3) Principle 5; 21 CFR 312.53(c)',
  },
  {
    id: 'P8',
    title: 'Investigational product quality & handling',
    statement:
      'Investigational products are manufactured under GMP and handled and stored in accordance with the protocol and product specifications, with accountability maintained.',
    citation: 'ICH E6(R3) Principle 11; ICH E6(R3) Annex 1 §3.15 (sponsor) and §2.10 (investigator), IP management',
  },
  {
    id: 'P9',
    title: 'Reliable results & data governance',
    statement:
      'Trial processes and data governance support the generation of reliable results; data are attributable, legible, contemporaneous, original, accurate and complete (ALCOA+) throughout the data life cycle, regardless of medium.',
    citation: 'ICH E6(R3) Principle 9; ICH E6(R3) Annex 1 §4.3 (computerised systems)',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Common Form FDA-483 observations (FDA BIMO)
// ─────────────────────────────────────────────────────────────────────────────

export type InspectionTarget = 'sponsor' | 'cro' | 'clinical_investigator' | 'irb';

export interface Common483Finding {
  area: string;
  finding: string;
  citation: string;
  preventiveAction: string;
}

/** Common BIMO 483 / Form FDA-483 observations by inspection target. */
export const COMMON_483_FINDINGS: Record<InspectionTarget, Common483Finding[]> = {
  clinical_investigator: [
    {
      area: 'Protocol adherence',
      finding: 'Failure to conduct the investigation in accordance with the signed Statement of Investigator / protocol.',
      citation: '21 CFR 312.60; FDA-1572',
      preventiveAction: 'Maintain a current deviation log with root-cause and CAPA; train staff on protocol amendments before implementation.',
    },
    {
      area: 'Informed consent',
      finding: 'Inadequate informed consent — missing signatures/dates, consent obtained after procedures, outdated consent version.',
      citation: '21 CFR 50.20; 50.27; 56.109',
      preventiveAction: 'Consent QC checklist; confirm IRB-approved version; verify consent precedes any study procedure.',
    },
    {
      area: 'Records & data',
      finding: 'Inadequate or inaccurate case histories / source records (ALCOA+ deficiencies).',
      citation: '21 CFR 312.62(b); ICH E6(R3) Principle 9',
      preventiveAction: 'Contemporaneous documentation, controlled corrections, validated systems with audit trails.',
    },
    {
      area: 'Investigational product',
      finding: 'Failure to maintain adequate drug/device disposition and accountability records.',
      citation: '21 CFR 312.62(a); 812.140',
      preventiveAction: 'Reconcile receipt, dispensing, return and destruction; periodic accountability checks.',
    },
    {
      area: 'Safety reporting',
      finding: 'Failure to report adverse events / promptly report to sponsor and IRB.',
      citation: '21 CFR 312.64(b); 312.66',
      preventiveAction: 'Standardize AE ascertainment and reporting timelines; reconcile against safety database.',
    },
    {
      area: 'Delegation & oversight',
      finding: 'Inadequate supervision of the clinical investigation / delegation to unqualified or untrained staff.',
      citation: '21 CFR 312.60; ICH E6(R3) Annex 1 §2.3 (investigator responsibilities)',
      preventiveAction: 'Maintain a current delegation-of-authority log mapped to training and qualification records.',
    },
  ],
  sponsor: [
    {
      area: 'Monitoring & oversight',
      finding: 'Failure to monitor the investigation adequately / to ensure proper monitoring.',
      citation: '21 CFR 312.50; 312.56; FDA RBM Guidance (2013)',
      preventiveAction: 'Document a risk-based monitoring plan, evidence of execution and follow-up on findings.',
    },
    {
      area: 'Vendor oversight',
      finding: 'Inadequate oversight of delegated parties (CRO/vendors) without documented sponsor retention of responsibility.',
      citation: '21 CFR 312.52; ICH E6(R3) Principle 10; Annex 1 §3.9 (sponsor oversight of service providers)',
      preventiveAction: 'Written transfer-of-obligation agreements; documented governance and KPI oversight of vendors.',
    },
    {
      area: 'Safety reporting',
      finding: 'Failure to submit IND safety reports (SUSARs) within required timeframes.',
      citation: '21 CFR 312.32',
      preventiveAction: 'Pharmacovigilance SOPs with timeline controls; reconciliation of expedited reports.',
    },
    {
      area: 'Investigator selection & control',
      finding: 'Failure to ensure investigators were qualified and that the IP was shipped/controlled appropriately.',
      citation: '21 CFR 312.53; 312.57',
      preventiveAction: 'Qualification documentation; IP shipment/accountability records retained centrally.',
    },
    {
      area: 'TMF / records',
      finding: 'Incomplete or non-contemporaneous Trial Master File; essential documents missing.',
      citation: 'ICH E6(R3) Appendix C (essential records); 21 CFR 312.57',
      preventiveAction: 'TMF completeness/QC plan with periodic reconciliation against the reference model.',
    },
  ],
  cro: [
    {
      area: 'Delegated obligations',
      finding: 'Performing transferred obligations without adequate procedures or documented sponsor oversight interface.',
      citation: '21 CFR 312.52; ICH E6(R3) Annex 1 §3.3 (allocation of activities)',
      preventiveAction: 'Map each transferred obligation to an SOP and to evidence of execution.',
    },
    {
      area: 'Monitoring execution',
      finding: 'Monitoring visit reports missing, untimely, or lacking documented issue follow-up.',
      citation: 'FDA RBM Guidance (2013); 21 CFR 312.56',
      preventiveAction: 'Standardize monitoring report templates, timelines and issue-tracking to closure.',
    },
    {
      area: 'Data management',
      finding: 'Query management and database controls not adequately documented or validated.',
      citation: 'ICH E6(R3) Annex 1 §4.3 (computerised systems); 21 CFR Part 11',
      preventiveAction: 'Validation evidence, audit-trail review, and documented data-handling procedures.',
    },
  ],
  irb: [
    {
      area: 'Membership & quorum',
      finding: 'IRB membership/quorum deficiencies or conflicting members voting.',
      citation: '21 CFR 56.107; 56.108',
      preventiveAction: 'Maintain roster with expertise; document quorum and recusal at each meeting.',
    },
    {
      area: 'Continuing review',
      finding: 'Failure to conduct continuing review at appropriate intervals.',
      citation: '21 CFR 56.108(a); 56.109(f)',
      preventiveAction: 'Tracking system for review intervals and expirations.',
    },
    {
      area: 'Records',
      finding: 'Inadequate IRB records (minutes lacking required detail, no documentation of determinations).',
      citation: '21 CFR 56.115',
      preventiveAction: 'Minutes capturing votes, rationale for controverted issues, and required determinations.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Essential records / Trial Master File
// ─────────────────────────────────────────────────────────────────────────────

export type TrialStage = 'before' | 'during' | 'after';

export interface EssentialDocument {
  id: string;
  name: string;
  stage: TrialStage;
  tmfZone: string;
  heldBy: Array<'sponsor' | 'investigator'>;
  purpose: string;
  citation: string;
}

export interface TmfZone {
  zone: string;
  description: string;
  exampleSections: string[];
}

/**
 * Essential-document library aligned to ICH E6(R3) Appendix C essential-records concepts and
 * the DIA TMF Reference Model zone structure.
 */
export const ESSENTIAL_DOCUMENTS: EssentialDocument[] = [
  // ── Before the trial begins ──
  { id: 'ED-IB', name: 'Investigator’s Brochure (current version)', stage: 'before', tmfZone: 'IP & Trial Information', heldBy: ['sponsor', 'investigator'], purpose: 'Documents the available nonclinical/clinical information relevant to the IP.', citation: 'ICH E6(R3) Appendix C (essential records); 21 CFR 312.55' },
  { id: 'ED-PROTOCOL', name: 'Signed protocol and amendments', stage: 'before', tmfZone: 'Trial Management', heldBy: ['sponsor', 'investigator'], purpose: 'Documents agreement to the protocol and any changes.', citation: 'ICH E6(R3) Appendix B (protocol); 21 CFR 312.23(a)(6)' },
  { id: 'ED-CONSENT', name: 'IRB-approved informed consent form(s) and any subject information', stage: 'before', tmfZone: 'Ethics', heldBy: ['sponsor', 'investigator'], purpose: 'Documents the consent materials approved for use.', citation: '21 CFR 50.25; 56.111' },
  { id: 'ED-IRB-APPROVAL', name: 'IRB/IEC approval and composition/statement', stage: 'before', tmfZone: 'Ethics', heldBy: ['sponsor', 'investigator'], purpose: 'Documents independent ethics review and approval before enrollment.', citation: '21 CFR 56.108; 56.115' },
  { id: 'ED-1572', name: 'Statement of Investigator (Form FDA-1572) and signed agreement', stage: 'before', tmfZone: 'Central & Site Management', heldBy: ['sponsor'], purpose: 'Documents the investigator’s commitments and qualifications.', citation: '21 CFR 312.53(c)' },
  { id: 'ED-CV', name: 'Curriculum vitae / qualification of investigator(s) and sub-investigators', stage: 'before', tmfZone: 'Central & Site Management', heldBy: ['sponsor', 'investigator'], purpose: 'Documents qualifications and eligibility to conduct the trial.', citation: 'ICH E6(R3) Principle 5; 21 CFR 312.53(c)' },
  { id: 'ED-FINANCIAL', name: 'Financial disclosure information (Form FDA-3454/3455)', stage: 'before', tmfZone: 'Central & Site Management', heldBy: ['sponsor'], purpose: 'Documents financial interests for disclosure to FDA.', citation: '21 CFR Part 54' },
  { id: 'ED-LAB-CERT', name: 'Normal ranges and laboratory certification/accreditation', stage: 'before', tmfZone: 'Central & Site Management', heldBy: ['sponsor', 'investigator'], purpose: 'Documents competence of facilities to perform required tests.', citation: 'ICH E6(R3) Appendix C; CLIA where applicable' },
  { id: 'ED-IP-RELEASE', name: 'IP labeling, instructions, shipping and handling records', stage: 'before', tmfZone: 'IP & Trial Information', heldBy: ['sponsor'], purpose: 'Documents proper labeling and conditions for IP.', citation: 'ICH E6(R3) Principle 11; Annex 1 §3.15 (investigational product); 21 CFR 312.57' },
  { id: 'ED-RANDOM', name: 'Randomization/blinding procedures and code (sponsor-held)', stage: 'before', tmfZone: 'Trial Management', heldBy: ['sponsor'], purpose: 'Documents the randomization method and emergency unblinding procedure.', citation: 'ICH E6(R3) Annex 1 §2.11 (randomisation procedures and unblinding); ICH E9' },

  // ── During the trial ──
  { id: 'ED-IB-UPDATE', name: 'Updates to Investigator’s Brochure and other current documents', stage: 'during', tmfZone: 'IP & Trial Information', heldBy: ['sponsor', 'investigator'], purpose: 'Documents revisions made available during conduct.', citation: 'ICH E6(R3) Appendix C' },
  { id: 'ED-IRB-CONTINUING', name: 'IRB continuing-review approvals and correspondence', stage: 'during', tmfZone: 'Ethics', heldBy: ['sponsor', 'investigator'], purpose: 'Documents ongoing ethics oversight.', citation: '21 CFR 56.108(a); 56.109(f)' },
  { id: 'ED-CONSENT-SIGNED', name: 'Signed informed-consent forms (source/site)', stage: 'during', tmfZone: 'Ethics / Site (ISF)', heldBy: ['investigator'], purpose: 'Documents that consent was obtained before procedures.', citation: '21 CFR 50.27' },
  { id: 'ED-SOURCE', name: 'Source documents and case-report forms / eCRFs', stage: 'during', tmfZone: 'Site (ISF)', heldBy: ['investigator'], purpose: 'Documents trial data (ALCOA+).', citation: '21 CFR 312.62(b); ICH E6(R3) Principle 9' },
  { id: 'ED-SAE', name: 'Safety reports, SAE source and reporting documentation', stage: 'during', tmfZone: 'Safety', heldBy: ['sponsor', 'investigator'], purpose: 'Documents AE/SAE ascertainment and reporting.', citation: '21 CFR 312.32; 312.64(b)' },
  { id: 'ED-MONITORING', name: 'Monitoring visit reports and follow-up letters', stage: 'during', tmfZone: 'Trial Management', heldBy: ['sponsor'], purpose: 'Documents sponsor monitoring and issue follow-up.', citation: '21 CFR 312.56; FDA RBM Guidance (2013)' },
  { id: 'ED-DELEGATION', name: 'Delegation-of-authority / signature and training logs', stage: 'during', tmfZone: 'Site (ISF)', heldBy: ['investigator'], purpose: 'Documents who performed and was qualified for each delegated task.', citation: 'ICH E6(R3) Annex 1 §2.3 (investigator responsibilities); 21 CFR 312.60' },
  { id: 'ED-IP-ACCOUNT', name: 'IP accountability (receipt, dispensing, return, destruction)', stage: 'during', tmfZone: 'IP & Trial Information', heldBy: ['sponsor', 'investigator'], purpose: 'Documents IP control throughout the trial.', citation: '21 CFR 312.62(a); 812.140' },
  { id: 'ED-DEVIATION', name: 'Protocol-deviation log and CAPA records', stage: 'during', tmfZone: 'Trial Management', heldBy: ['sponsor', 'investigator'], purpose: 'Documents deviations, importance and corrective actions.', citation: 'ICH E6(R3) Annex 1 §2.5 (compliance with protocol); 21 CFR 312.60' },

  // ── After completion ──
  { id: 'ED-IP-RECON', name: 'Final IP accountability and destruction records', stage: 'after', tmfZone: 'IP & Trial Information', heldBy: ['sponsor', 'investigator'], purpose: 'Documents final reconciliation of IP.', citation: 'ICH E6(R3) Appendix C' },
  { id: 'ED-CLOSEOUT', name: 'Audit certificate / monitoring close-out report', stage: 'after', tmfZone: 'Trial Management', heldBy: ['sponsor'], purpose: 'Documents close-out of the site and trial.', citation: 'ICH E6(R3) Appendix C' },
  { id: 'ED-FINAL-IRB', name: 'Final IRB notification of study completion', stage: 'after', tmfZone: 'Ethics', heldBy: ['investigator'], purpose: 'Documents notification of completion to the IRB.', citation: '21 CFR 56.108(a)' },
  { id: 'ED-DB-LOCK', name: 'Database lock documentation and final datasets', stage: 'after', tmfZone: 'Statistics / Data', heldBy: ['sponsor'], purpose: 'Documents the controlled finalization of trial data.', citation: 'ICH E6(R3) Annex 1 §4 (data governance)' },
  { id: 'ED-CSR', name: 'Clinical Study Report (CSR)', stage: 'after', tmfZone: 'Statistics / Data', heldBy: ['sponsor'], purpose: 'Documents trial results and conclusions.', citation: 'ICH E3; ICH E6(R3) Appendix C' },
];

/** DIA TMF Reference Model zone concepts (abridged). */
export const TMF_ZONES: TmfZone[] = [
  { zone: 'Trial Management', description: 'Oversight, planning, monitoring and reporting of the trial.', exampleSections: ['Trial oversight', 'Monitoring', 'Deviations & CAPA', 'Meetings'] },
  { zone: 'Central & Site Management', description: 'Site identification, qualification, and investigator documentation.', exampleSections: ['Site qualification', 'Form FDA-1572', 'CVs/qualifications', 'Financial disclosure'] },
  { zone: 'Ethics', description: 'IRB/IEC review, approvals, consent materials and correspondence.', exampleSections: ['IRB approvals', 'Consent forms', 'Continuing review'] },
  { zone: 'IP & Trial Information', description: 'Investigational product handling, labeling, accountability and the IB.', exampleSections: ['Investigator’s Brochure', 'IP accountability', 'Labeling/shipping'] },
  { zone: 'Safety', description: 'Adverse-event and safety-reporting documentation.', exampleSections: ['SAE reports', 'Safety correspondence', 'DSMB materials'] },
  { zone: 'Statistics / Data', description: 'Data management, statistics, database lock and the CSR.', exampleSections: ['SAP', 'Database lock', 'Final datasets', 'CSR'] },
  { zone: 'Site (ISF)', description: 'The Investigator Site File: site-held source and essential records.', exampleSections: ['Signed consents', 'Source documents', 'Delegation log', 'Site IP records'] },
];
