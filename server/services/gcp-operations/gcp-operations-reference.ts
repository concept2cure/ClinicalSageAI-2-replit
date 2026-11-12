/**
 * GCP & Clinical Trial Operations — reference data for the deterministic
 * knowledge engine in `gcp-operations-knowledge.ts` (same service, same purity
 * contract: no LLM, no network, no database). Split out of that module on
 * 2026-10-15 to keep it under the repository's 100 KB file ceiling; the tables
 * are unchanged, and their types are re-exported from the engine module.
 *
 * @module server/services/gcp-operations/gcp-operations-reference
 */

import { tmfArtifactByCode, tmfZoneByNumber } from '../../../shared/constants/domain/tmf-reference-model';

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
  /** The DIA TMF Reference Model zone the document is filed in: a zone number (1–11) of the one catalog. */
  tmfZone: number;
  /** That zone's name, read from the catalog, never typed here. */
  tmfZoneName: string;
  /** The catalog artifact this document is, when it is one. Its zone is then that artifact's. */
  catalogArtifact?: string;
  /** Who keeps it: the sponsor's TMF, the investigator site file, or both. */
  heldBy: Array<'sponsor' | 'investigator'>;
  purpose: string;
  citation: string;
}

/**
 * A library document, with its zone's name read from the catalog. Refused: a zone the catalog does not hold, a
 * `catalogArtifact` the catalog does not hold, and a zone other than that artifact's.
 */
export function essentialDocument(d: Omit<EssentialDocument, 'tmfZoneName'>): EssentialDocument {
  const zone = tmfZoneByNumber(d.tmfZone);
  if (!zone) throw new Error(`Essential document ${d.id}: zone ${d.tmfZone} is not a TMF Reference Model zone.`);
  if (d.catalogArtifact !== undefined) {
    const tied = tmfArtifactByCode(d.catalogArtifact);
    if (!tied) throw new Error(`Essential document ${d.id}: "${d.catalogArtifact}" is not a catalog artifact.`);
    if (tied.zone.number !== d.tmfZone) {
      throw new Error(`Essential document ${d.id}: zone ${d.tmfZone}, but catalog artifact ${d.catalogArtifact} is in zone ${tied.zone.number}.`);
    }
  }
  return { ...d, tmfZoneName: zone.name };
}

/**
 * Essential-document library aligned to ICH E6(R3) Appendix C essential-records concepts, each document placed in
 * a zone of the one TMF Reference Model catalog (shared/constants/domain/tmf-reference-model.ts).
 *
 * Until 2026-11-10 each document named one of seven "abridged" zones kept in this file ("Central & Site
 * Management", "Ethics", "IP & Trial Information", "Statistics / Data", "Site (ISF)", …), and AnA's
 * plan_essential_documents returned those seven as the TMF's structure, beside an eTMF and a Vault that show the
 * model's eleven. The seven are gone. The investigator site file was one of them; it is not a zone but a holder,
 * and `heldBy` already says it.
 *
 * How each zone was chosen, so that no placement is new regulatory content invented here:
 *   1. `catalogArtifact` set: the document is that catalog artifact, and takes its zone (pinned by
 *      server/services/__tests__/vault-taxonomy-etmf.test.ts).
 *   2. Otherwise the group this library already gave it, where that group is one zone of the model: Trial
 *      Management → 1, Central & Site Management → 5, Ethics → 4, IP & Trial Information → 6, Safety → 7.
 *   3. Four exceptions:
 *      - Monitoring visit reports are in zone 5, not the library's zone 1: the TMF classifier files a monitoring
 *        visit report in Site Management (etmf-logic.ts), and the product says one thing.
 *      - Source documents were "Site (ISF)", which is not a zone. Zone 5: the TMF Reference Model lists Source
 *        Data as a site-level Site Management record (05.04.11).
 *      - The clinical study report was "Statistics / Data", which is two zones. Zone 2: the CDISC TMF terminology
 *        places it in the Central Trial Documents zone.
 *      - The device trial's IDE document (gcp-operations-knowledge.ts) was "IP & Trial Information". Zone 3: the
 *        IDE application and its approval are regulatory records. It also names malfunction reports and device
 *        accountability, so it is tied to no one catalog artifact.
 *      The source documents and the study report were read on 2026-11-10 through search summaries of
 *      tmfrefmodel.com and the CDISC TMF terminology, not from the model's spreadsheet; QA should confirm those
 *      two and the device document against it.
 *
 * Rule 2 keeps what this library said; it does not verify it against the model. A review on 2026-11-11 doubted
 * four of those placements, from memory of the model and without its spreadsheet: protocol deviations (zone 1
 * here; a Site Management record, zone 5), the approved consent form and subject information (zone 4 here; the
 * catalog's own consent form, `sample_icf`, is in zone 2), signed consent forms (zone 4 here; site-level, zone 5),
 * and the close-out monitoring report half of ED-CLOSEOUT (zone 1 here, right for the audit certificate; zone 5).
 * None is changed from memory. QA confirms the four with the three above.
 */
export const ESSENTIAL_DOCUMENTS: EssentialDocument[] = ([
  // ── Before the trial begins ──
  { id: 'ED-IB', name: 'Investigator’s Brochure (current version)', stage: 'before', tmfZone: 2, catalogArtifact: 'investigators_brochure', heldBy: ['sponsor', 'investigator'], purpose: 'Documents the available nonclinical/clinical information relevant to the IP.', citation: 'ICH E6(R3) Appendix C (essential records); 21 CFR 312.55' },
  { id: 'ED-PROTOCOL', name: 'Signed protocol and amendments', stage: 'before', tmfZone: 2, catalogArtifact: 'protocol', heldBy: ['sponsor', 'investigator'], purpose: 'Documents agreement to the protocol and any changes.', citation: 'ICH E6(R3) Appendix B (protocol); 21 CFR 312.23(a)(6)' },
  { id: 'ED-CONSENT', name: 'IRB-approved informed consent form(s) and any subject information', stage: 'before', tmfZone: 4, heldBy: ['sponsor', 'investigator'], purpose: 'Documents the consent materials approved for use.', citation: '21 CFR 50.25; 56.111' },
  { id: 'ED-IRB-APPROVAL', name: 'IRB/IEC approval and composition/statement', stage: 'before', tmfZone: 4, catalogArtifact: 'irb_approval', heldBy: ['sponsor', 'investigator'], purpose: 'Documents independent ethics review and approval before enrollment.', citation: '21 CFR 56.108; 56.115' },
  { id: 'ED-1572', name: 'Statement of Investigator (Form FDA-1572) and signed agreement', stage: 'before', tmfZone: 5, heldBy: ['sponsor'], purpose: 'Documents the investigator’s commitments and qualifications.', citation: '21 CFR 312.53(c)' },
  { id: 'ED-CV', name: 'Curriculum vitae / qualification of investigator(s) and sub-investigators', stage: 'before', tmfZone: 5, catalogArtifact: 'investigator_cv', heldBy: ['sponsor', 'investigator'], purpose: 'Documents qualifications and eligibility to conduct the trial.', citation: 'ICH E6(R3) Principle 5; 21 CFR 312.53(c)' },
  { id: 'ED-FINANCIAL', name: 'Financial disclosure information (Form FDA-3454/3455)', stage: 'before', tmfZone: 5, catalogArtifact: 'financial_disclosure', heldBy: ['sponsor'], purpose: 'Documents financial interests for disclosure to FDA.', citation: '21 CFR Part 54' },
  { id: 'ED-LAB-CERT', name: 'Normal ranges and laboratory certification/accreditation', stage: 'before', tmfZone: 8, catalogArtifact: 'lab_certification', heldBy: ['sponsor', 'investigator'], purpose: 'Documents competence of facilities to perform required tests.', citation: 'ICH E6(R3) Appendix C; CLIA where applicable' },
  { id: 'ED-IP-RELEASE', name: 'IP labeling, instructions, shipping and handling records', stage: 'before', tmfZone: 6, heldBy: ['sponsor'], purpose: 'Documents proper labeling and conditions for IP.', citation: 'ICH E6(R3) Principle 11; Annex 1 §3.15 (investigational product); 21 CFR 312.57' },
  { id: 'ED-RANDOM', name: 'Randomization/blinding procedures and code (sponsor-held)', stage: 'before', tmfZone: 11, catalogArtifact: 'randomization_plan', heldBy: ['sponsor'], purpose: 'Documents the randomization method and emergency unblinding procedure.', citation: 'ICH E6(R3) Annex 1 §2.11 (randomisation procedures and unblinding); ICH E9' },

  // ── During the trial ──
  { id: 'ED-IB-UPDATE', name: 'Updates to Investigator’s Brochure and other current documents', stage: 'during', tmfZone: 2, catalogArtifact: 'investigators_brochure', heldBy: ['sponsor', 'investigator'], purpose: 'Documents revisions made available during conduct.', citation: 'ICH E6(R3) Appendix C' },
  { id: 'ED-IRB-CONTINUING', name: 'IRB continuing-review approvals and correspondence', stage: 'during', tmfZone: 4, heldBy: ['sponsor', 'investigator'], purpose: 'Documents ongoing ethics oversight.', citation: '21 CFR 56.108(a); 56.109(f)' },
  { id: 'ED-CONSENT-SIGNED', name: 'Signed informed-consent forms (source/site)', stage: 'during', tmfZone: 4, heldBy: ['investigator'], purpose: 'Documents that consent was obtained before procedures.', citation: '21 CFR 50.27' },
  { id: 'ED-SOURCE', name: 'Source documents and case-report forms / eCRFs', stage: 'during', tmfZone: 5, heldBy: ['investigator'], purpose: 'Documents trial data (ALCOA+).', citation: '21 CFR 312.62(b); ICH E6(R3) Principle 9' },
  { id: 'ED-SAE', name: 'Safety reports, SAE source and reporting documentation', stage: 'during', tmfZone: 7, catalogArtifact: 'sae_reports', heldBy: ['sponsor', 'investigator'], purpose: 'Documents AE/SAE ascertainment and reporting.', citation: '21 CFR 312.32; 312.64(b)' },
  { id: 'ED-MONITORING', name: 'Monitoring visit reports and follow-up letters', stage: 'during', tmfZone: 5, heldBy: ['sponsor'], purpose: 'Documents sponsor monitoring and issue follow-up.', citation: '21 CFR 312.56; FDA RBM Guidance (2013)' },
  { id: 'ED-DELEGATION', name: 'Delegation-of-authority / signature and training logs', stage: 'during', tmfZone: 5, catalogArtifact: 'site_signature_sheet', heldBy: ['investigator'], purpose: 'Documents who performed and was qualified for each delegated task.', citation: 'ICH E6(R3) Annex 1 §2.3 (investigator responsibilities); 21 CFR 312.60' },
  { id: 'ED-IP-ACCOUNT', name: 'IP accountability (receipt, dispensing, return, destruction)', stage: 'during', tmfZone: 6, catalogArtifact: 'ip_accountability', heldBy: ['sponsor', 'investigator'], purpose: 'Documents IP control throughout the trial.', citation: '21 CFR 312.62(a); 812.140' },
  { id: 'ED-DEVIATION', name: 'Protocol-deviation log and CAPA records', stage: 'during', tmfZone: 1, heldBy: ['sponsor', 'investigator'], purpose: 'Documents deviations, importance and corrective actions.', citation: 'ICH E6(R3) Annex 1 §2.5 (compliance with protocol); 21 CFR 312.60' },

  // ── After completion ──
  { id: 'ED-IP-RECON', name: 'Final IP accountability and destruction records', stage: 'after', tmfZone: 6, catalogArtifact: 'ip_destruction', heldBy: ['sponsor', 'investigator'], purpose: 'Documents final reconciliation of IP.', citation: 'ICH E6(R3) Appendix C' },
  { id: 'ED-CLOSEOUT', name: 'Audit certificate / monitoring close-out report', stage: 'after', tmfZone: 1, heldBy: ['sponsor'], purpose: 'Documents close-out of the site and trial.', citation: 'ICH E6(R3) Appendix C' },
  { id: 'ED-FINAL-IRB', name: 'Final IRB notification of study completion', stage: 'after', tmfZone: 4, heldBy: ['investigator'], purpose: 'Documents notification of completion to the IRB.', citation: '21 CFR 56.108(a)' },
  { id: 'ED-DB-LOCK', name: 'Database lock documentation and final datasets', stage: 'after', tmfZone: 10, catalogArtifact: 'database_lock', heldBy: ['sponsor'], purpose: 'Documents the controlled finalization of trial data.', citation: 'ICH E6(R3) Annex 1 §4 (data governance)' },
  { id: 'ED-CSR', name: 'Clinical Study Report (CSR)', stage: 'after', tmfZone: 2, heldBy: ['sponsor'], purpose: 'Documents trial results and conclusions.', citation: 'ICH E3; ICH E6(R3) Appendix C' },
] satisfies Array<Omit<EssentialDocument, 'tmfZoneName'>>).map(essentialDocument);
