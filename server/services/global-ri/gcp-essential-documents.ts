/**
 * ICH E6 Good Clinical Practice expert — principles, essential documents, roles.
 *
 * GCP is the international ethical and scientific quality standard for designing,
 * conducting, recording, and reporting trials that involve human subjects.
 * Compliance with GCP provides public assurance that the rights, safety, and
 * well-being of trial subjects are protected — consistent with the principles
 * originating in the Declaration of Helsinki — and that the clinical trial data
 * are credible. This service encodes three reference tables an RA/clinical
 * operations lead consults daily:
 *
 *   A) the core GCP principles as worded in ICH E6(R2) §2 — the "13 principles"
 *      (historical: superseded by E6(R3), 2025-01-06, whose 11 principles were
 *      rewritten, not renumbered);
 *   B) the essential documents that individually and collectively permit
 *      evaluation of the conduct of a trial and the quality of the data, grouped
 *      by trial stage ("before", "during", "after" the clinical phase) — ICH
 *      E6(R3) Appendix C (essential records). The stage grouping is this
 *      service's, carried over from the E6(R2) §8.2–§8.4 phase tables
 *      (historical, superseded by E6(R3)); it is not an Appendix C heading;
 *   C) the responsibility split between sponsor (ICH E6(R3) Annex 1 §3) and
 *      investigator (ICH E6(R3) Annex 1 §2).
 *
 * Pure / deterministic — no DB, no IO. The lists are the minimum set as
 * tabulated in E6(R2) (superseded by E6(R3), 2025-01-06); ICH E6(R3) (Step 4,
 * 2025-01-06) recasts the R2 §8 essential documents as "essential records"
 * (Appendix C) tied to the Trial Master File (TMF) and emphasizes
 * quality-by-design and risk-based approaches.
 * Confirm scope per trial against ICH E6(R3) and the applicable regional
 * GCP (e.g. FDA 21 CFR 50/56/312, EU CTR 536/2014). Honest-by-construction:
 * this is a readiness/reference aid, not the authoritative checklist.
 *
 * Reference: ICH E6(R3) Good Clinical Practice (Step 4, 2025-01-06) principles,
 * Annex 1 §2, Annex 1 §3, Appendix C; ICH E6(R2) Good Clinical Practice (Step 4,
 * 9 Nov 2016) §2 (historical, superseded by E6(R3), 2025-01-06) for the
 * principle wording; WMA Declaration of Helsinki.
 *
 * @module server/services/global-ri/gcp-essential-documents
 */

/** The trial stages used to group essential records (ICH E6(R3) Appendix C). */
export type GcpStage = 'before' | 'during' | 'after';

/** The two parties whose GCP responsibilities are modeled. */
export type GcpParty = 'sponsor' | 'investigator';

/** Who is expected to hold a given essential document. */
export type GcpDocumentHolder = 'sponsor' | 'investigator' | 'both';

/** A single GCP principle (ICH E6(R2) §2 wording; historical, superseded by E6(R3)). */
export interface GcpPrinciple {
  /** Stable principle id (e.g. 'p1'). */
  id: string;
  /** The principle statement. */
  statement: string;
}

/** A single essential record (ICH E6(R3) Appendix C). */
export interface GcpEssentialDocument {
  /** Stable document id (e.g. 'before_icf'). */
  id: string;
  /** Document title. */
  title: string;
  /** Party expected to hold the document in its file. */
  heldBy: GcpDocumentHolder;
}

/** A single party responsibility (ICH E6(R3) Annex 1 §2 investigator / Annex 1 §3 sponsor). */
export interface GcpResponsibility {
  /** Stable responsibility id (e.g. 'sponsor_monitoring'). */
  id: string;
  /** Responsibility title. */
  title: string;
}

const E6_PRINCIPLES_CITATION =
  'ICH E6(R2) §2 (Principles of ICH GCP; historical wording, superseded by ICH E6(R3) principles 1–11, 2025-01-06)';
const E6_RESPONSIBILITY_NOTE =
  'ICH E6 lists the minimum set; confirm scope per trial against ICH E6(R3) and the applicable regional GCP.';

/** A) The core ICH GCP principles as worded in ICH E6(R2) §2.1–§2.13 (historical; superseded by E6(R3), 2025-01-06). */
const GCP_PRINCIPLES: GcpPrinciple[] = [
  { id: 'p1', statement: 'Clinical trials are conducted in accordance with the ethical principles that have their origin in the Declaration of Helsinki, and that are consistent with GCP and the applicable regulatory requirement(s).' },
  { id: 'p2', statement: 'Before a trial is initiated, foreseeable risks and inconveniences are weighed against the anticipated benefit for the individual subject and society; a trial proceeds only if the anticipated benefits justify the risks.' },
  { id: 'p3', statement: 'The rights, safety, and well-being of the trial subjects are the most important considerations and prevail over the interests of science and society.' },
  { id: 'p4', statement: 'The available nonclinical and clinical information on an investigational product is adequate to support the proposed clinical trial.' },
  { id: 'p5', statement: 'Clinical trials are scientifically sound and described in a clear, detailed protocol.' },
  { id: 'p6', statement: 'A trial is conducted in compliance with the protocol that has received prior institutional review board (IRB)/independent ethics committee (IEC) approval/favourable opinion.' },
  { id: 'p7', statement: 'The medical care given to, and medical decisions made on behalf of, subjects are always the responsibility of a qualified physician (or, when appropriate, a qualified dentist).' },
  { id: 'p8', statement: 'Each individual involved in conducting a trial is qualified by education, training, and experience to perform his or her respective task(s).' },
  { id: 'p9', statement: 'Freely given informed consent is obtained from every subject prior to clinical trial participation.' },
  { id: 'p10', statement: 'All clinical trial information is recorded, handled, and stored in a way that allows its accurate reporting, interpretation, and verification (with this principle applying to all records referenced in the guideline).' },
  { id: 'p11', statement: 'The confidentiality of records that could identify subjects is protected, respecting the privacy and confidentiality rules in accordance with the applicable regulatory requirement(s).' },
  { id: 'p12', statement: 'Investigational products are manufactured, handled, and stored in accordance with applicable good manufacturing practice (GMP), and are used in accordance with the approved protocol.' },
  { id: 'p13', statement: 'Systems with procedures that assure the quality of every aspect of the trial are implemented, with the quality management system using a risk-based (quality-by-design) approach.' },
];

/** B) Essential records by trial stage (ICH E6(R3) Appendix C). */
const ESSENTIAL_DOCUMENTS: Record<GcpStage, GcpEssentialDocument[]> = {
  // Before the clinical phase of the trial commences.
  before: [
    { id: 'before_ib', title: "Investigator's Brochure", heldBy: 'both' },
    { id: 'before_protocol', title: 'Signed protocol and amendments, and sample case report form (CRF)', heldBy: 'both' },
    { id: 'before_icf', title: 'Informed consent form (including all translations)', heldBy: 'both' },
    { id: 'before_subject_information', title: 'Any other written information provided to subjects', heldBy: 'both' },
    { id: 'before_advertisement', title: 'Advertisement for subject recruitment (if used)', heldBy: 'investigator' },
    { id: 'before_financial', title: 'Financial aspects of the trial (agreement between investigator/institution and sponsor)', heldBy: 'both' },
    { id: 'before_insurance', title: 'Insurance statement (where required)', heldBy: 'both' },
    { id: 'before_irb_approval', title: 'Dated, documented IRB/IEC approval/favourable opinion of the protocol and related documents', heldBy: 'both' },
    { id: 'before_irb_composition', title: 'IRB/IEC composition (constitution and membership)', heldBy: 'both' },
    { id: 'before_regulatory_authorisation', title: 'Regulatory authority authorisation/approval/notification of the protocol (where required)', heldBy: 'both' },
    { id: 'before_cv', title: 'Curriculum vitae and other relevant documents evidencing qualifications of investigator(s) and sub-investigator(s)', heldBy: 'both' },
    { id: 'before_lab_values', title: 'Normal value(s)/range(s) for medical/laboratory/technical procedures and/or tests', heldBy: 'both' },
    { id: 'before_lab_certification', title: 'Medical/laboratory/technical procedures and/or tests — certification, accreditation, or established quality control/external assessment', heldBy: 'both' },
    { id: 'before_ip_labelling', title: 'Sample of label(s) attached to investigational product container(s)', heldBy: 'sponsor' },
    { id: 'before_ip_instructions', title: 'Instructions for handling of investigational product(s) and trial-related materials', heldBy: 'both' },
    { id: 'before_shipping_records', title: 'Shipping records for investigational product(s) and trial-related materials', heldBy: 'both' },
    { id: 'before_decoding', title: 'Decoding procedures for blinded trials', heldBy: 'both' },
  ],
  // During the clinical conduct of the trial.
  during: [
    { id: 'during_ib_updates', title: "Investigator's Brochure updates", heldBy: 'both' },
    { id: 'during_revisions', title: 'Revisions to protocol/amendments, CRF, informed consent form, and other written information to subjects', heldBy: 'both' },
    { id: 'during_irb_reapproval', title: 'Dated, documented IRB/IEC approval/favourable opinion of revisions and ongoing reviews', heldBy: 'both' },
    { id: 'during_regulatory_updates', title: 'Regulatory authority authorisations/approvals/notifications for protocol revisions and other documents', heldBy: 'both' },
    { id: 'during_new_cv', title: 'Curriculum vitae for new investigator(s) and/or sub-investigator(s)', heldBy: 'both' },
    { id: 'during_lab_updates', title: 'Updates to normal value(s)/range(s) and laboratory certification/accreditation', heldBy: 'both' },
    { id: 'during_monitoring_reports', title: 'Monitoring visit reports', heldBy: 'sponsor' },
    { id: 'during_communications', title: 'Relevant communications other than site visits (letters, meeting notes, telephone call notes)', heldBy: 'both' },
    { id: 'during_signed_icf', title: 'Signed informed consent forms', heldBy: 'investigator' },
    { id: 'during_source_documents', title: 'Source documents', heldBy: 'investigator' },
    { id: 'during_signed_crf', title: 'Signed, dated, and completed case report forms (CRF) and corrections', heldBy: 'both' },
    { id: 'during_sae_notification', title: 'Notification by investigator to sponsor of serious adverse events (SAEs) and related reports', heldBy: 'both' },
    { id: 'during_safety_reporting', title: 'Notification by sponsor and/or investigator to regulators and IRB/IEC of unexpected serious adverse drug reactions and safety information', heldBy: 'both' },
    { id: 'during_interim_reports', title: 'Interim or annual reports to IRB/IEC and authority(ies)', heldBy: 'both' },
    { id: 'during_screening_log', title: 'Subject screening log', heldBy: 'both' },
    { id: 'during_enrolment_log', title: 'Subject enrolment log', heldBy: 'investigator' },
    { id: 'during_id_code_list', title: 'Subject identification code list', heldBy: 'investigator' },
    { id: 'during_signature_sheet', title: 'Signature sheet (signatures/initials of persons authorized to make CRF entries/corrections)', heldBy: 'investigator' },
    { id: 'during_drug_accountability', title: 'Record of retained body fluids/tissue samples and investigational product accountability at the site', heldBy: 'both' },
  ],
  // After completion or termination of the trial.
  after: [
    { id: 'after_site_accountability', title: 'Investigational product accountability at the site', heldBy: 'both' },
    { id: 'after_destruction', title: 'Documentation of investigational product destruction', heldBy: 'both' },
    { id: 'after_id_code_list', title: 'Completed subject identification code list', heldBy: 'investigator' },
    { id: 'after_audit_certificate', title: 'Audit certificate (if available)', heldBy: 'sponsor' },
    { id: 'after_closeout_report', title: 'Final trial close-out monitoring report', heldBy: 'sponsor' },
    { id: 'after_treatment_allocation', title: 'Treatment allocation and decoding documentation', heldBy: 'sponsor' },
    { id: 'after_final_report_to_irb', title: 'Final report by investigator to IRB/IEC where required, and to the regulatory authority(ies) where applicable', heldBy: 'investigator' },
    { id: 'after_clinical_study_report', title: 'Clinical study report (to document trial results and interpretation)', heldBy: 'both' },
  ],
};

/** C) Responsibility split — sponsor (ICH E6(R3) Annex 1 §3) vs investigator (Annex 1 §2). */
const RESPONSIBILITIES: Record<GcpParty, GcpResponsibility[]> = {
  sponsor: [
    { id: 'sponsor_qms', title: 'Implement a quality management system using a risk-based (quality-by-design) approach (Annex 1 §3.10)' },
    { id: 'sponsor_qa_qc', title: 'Implement and maintain quality assurance and quality control systems with written SOPs (Annex 1 §3.11)' },
    { id: 'sponsor_trial_management', title: 'Trial management, data handling, recordkeeping, and validated computerized systems (Annex 1 §3.16, §4.3)' },
    { id: 'sponsor_investigator_selection', title: 'Select qualified investigator(s)/institution(s) and define their responsibilities (Annex 1 §3.7)' },
    { id: 'sponsor_monitoring', title: 'Monitor the trial (risk-based, on-site and/or centralized) to verify rights/well-being of participants, accuracy/completeness of data, and protocol/GCP compliance (Annex 1 §3.11.4)' },
    { id: 'sponsor_audit', title: 'Conduct audits independent of routine monitoring to evaluate trial conduct and compliance (Annex 1 §3.11.2)' },
    { id: 'sponsor_safety_reporting', title: 'Safety evaluation and expedited reporting of adverse drug reactions to investigators, IRB/IEC, and regulators (Annex 1 §3.13)' },
    { id: 'sponsor_imp_supply', title: 'Supply, label, package, and account for the investigational product(s) (Annex 1 §3.15)' },
    { id: 'sponsor_audit_trail', title: 'Ensure data integrity and an attributable audit trail across systems and records (Annex 1 §4)' },
    { id: 'sponsor_noncompliance', title: 'Secure agreements, address noncompliance, and notify authorities of premature termination/suspension (Annex 1 §3.6/§3.12)' },
  ],
  investigator: [
    { id: 'investigator_qualifications', title: 'Be qualified by education, training, and experience and provide evidence thereof (Annex 1 §2.1)' },
    { id: 'investigator_resources', title: 'Demonstrate adequate resources — sufficient time, qualified staff, and adequate facilities (Annex 1 §2.2)' },
    { id: 'investigator_medical_care', title: 'Provide medical care for trial-related decisions; a qualified physician is responsible for medical decisions (Annex 1 §2.7)' },
    { id: 'investigator_irb_communication', title: 'Obtain and maintain communication with the IRB/IEC, including approval before initiation (Annex 1 §2.4)' },
    { id: 'investigator_protocol_compliance', title: 'Comply with the approved protocol and document/justify any deviations (Annex 1 §2.5)' },
    { id: 'investigator_imp_accountability', title: 'Maintain investigational product accountability and storage at the trial site (Annex 1 §2.10)' },
    { id: 'investigator_informed_consent', title: 'Obtain freely given informed consent from each participant before participation (Annex 1 §2.8)' },
    { id: 'investigator_records', title: 'Maintain accurate source records and reports (attributable, legible, contemporaneous, original, accurate — ALCOA) (Annex 1 §2.12)' },
    { id: 'investigator_safety_reporting', title: 'Report serious adverse events to the sponsor and safety information to the IRB/IEC as required (Annex 1 §2.7)' },
    { id: 'investigator_progress_reports', title: 'Provide progress reports to the IRB/IEC and a final report on completion/termination (Annex 1 §2.13)' },
  ],
};

/** The trial stages used to group essential documents. */
export const GCP_STAGES: GcpStage[] = ['before', 'during', 'after'];

/** The parties whose GCP responsibilities are modeled. */
export const GCP_PARTIES: GcpParty[] = ['sponsor', 'investigator'];

export interface GcpPrinciplesResult {
  principles: GcpPrinciple[];
  citation: string;
  notes: string[];
}

export interface GcpEssentialDocumentsResult {
  stage: GcpStage;
  documents: GcpEssentialDocument[];
  citation: string;
  notes: string[];
}

export interface GcpResponsibilitiesResult {
  party: GcpParty;
  responsibilities: GcpResponsibility[];
  citation: string;
  notes: string[];
}

/**
 * Return the core ICH GCP principles (ICH E6(R2) §2 wording; historical,
 * superseded by E6(R3), 2025-01-06). Pure / deterministic.
 */
export function getGcpPrinciples(): GcpPrinciplesResult {
  return {
    principles: GCP_PRINCIPLES,
    citation: E6_PRINCIPLES_CITATION,
    notes: [
      'These are the E6(R2) foundational principles (historical, superseded by E6(R3), 2025-01-06); ICH E6(R3) rewrote them as 11 principles while emphasizing quality-by-design, risk-proportionate approaches, and a media-neutral view of records.',
      E6_RESPONSIBILITY_NOTE,
    ],
  };
}

const E6_STAGE_CITATION: Record<GcpStage, string> = {
  before: 'ICH E6(R3) Appendix C (Essential Records for the Conduct of a Clinical Trial) — records expected before the clinical phase of the trial commences',
  during: 'ICH E6(R3) Appendix C (Essential Records for the Conduct of a Clinical Trial) — records expected during the clinical conduct of the trial',
  after: 'ICH E6(R3) Appendix C (Essential Records for the Conduct of a Clinical Trial) — records expected after completion or termination of the trial',
};

/**
 * Return the essential records expected at a given trial stage (ICH E6(R3)
 * Appendix C). Pure / deterministic. Throws for an unmodeled stage.
 */
export function getEssentialDocuments(stage: GcpStage): GcpEssentialDocumentsResult {
  const documents = ESSENTIAL_DOCUMENTS[stage];
  if (!documents) {
    throw new Error(`Unknown GCP trial stage "${stage}". Expected one of: ${GCP_STAGES.join(', ')}.`);
  }
  return {
    stage,
    documents,
    citation: E6_STAGE_CITATION[stage],
    notes: [
      'This is the minimum essential-documents set; the sponsor/investigator file (TMF) may require additional records per the trial and applicable regional GCP.',
      'ICH E6(R3) Appendix C recasts the essential documents of E6(R2) (superseded, 2025-01-06) as an "essential records" expectation tied to the Trial Master File; confirm the records inventory per trial.',
    ],
  };
}

/**
 * Return the GCP responsibilities for a party — sponsor (ICH E6(R3) Annex 1 §3)
 * or investigator (Annex 1 §2). Pure / deterministic. Throws for an unmodeled party.
 */
export function getResponsibilities(party: GcpParty): GcpResponsibilitiesResult {
  const responsibilities = RESPONSIBILITIES[party];
  if (!responsibilities) {
    throw new Error(`Unknown GCP party "${party}". Expected one of: ${GCP_PARTIES.join(', ')}.`);
  }
  return {
    party,
    responsibilities,
    citation: party === 'sponsor' ? 'ICH E6(R3) Annex 1 §3 (Sponsor)' : 'ICH E6(R3) Annex 1 §2 (Investigator)',
    notes: [
      'Responsibilities may be delegated (e.g. sponsor functions to a CRO under ICH E6(R3) Annex 1 §3.3), but accountability for GCP compliance remains with the named party.',
      E6_RESPONSIBILITY_NOTE,
    ],
  };
}
