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
 *   A) the core GCP principles (ICH E6(R2) §2 — the "13 principles");
 *   B) the essential documents that individually and collectively permit
 *      evaluation of the conduct of a trial and the quality of the data, grouped
 *      by trial stage (ICH E6(R2) §8.2 "before", §8.3 "during", §8.4 "after");
 *   C) the responsibility split between sponsor (ICH E6(R2) §5) and investigator
 *      (ICH E6(R2) §4).
 *
 * Pure / deterministic — no DB, no IO. The lists are the minimum set per
 * ICH E6(R2); the ICH E6(R3) (Step 4, 2023; effective 2025) modernization
 * recasts §8 as an "essential records" expectation tied to the Trial Master
 * File (TMF) and emphasizes quality-by-design and risk-based approaches.
 * Confirm scope per trial against E6(R2)/E6(R3) and the applicable regional
 * GCP (e.g. FDA 21 CFR 50/56/312, EU CTR 536/2014). Honest-by-construction:
 * this is a readiness/reference aid, not the authoritative checklist.
 *
 * Reference: ICH E6(R2) Good Clinical Practice (Step 4, 9 Nov 2016) §§2, 4, 5,
 * 8; ICH E6(R3) Good Clinical Practice (Step 4, 2023); WMA Declaration of
 * Helsinki.
 *
 * @module server/services/global-ri/gcp-essential-documents
 */

/** The trial stages used to group essential documents (ICH E6(R2) §8). */
export type GcpStage = 'before' | 'during' | 'after';

/** The two parties whose GCP responsibilities are modeled. */
export type GcpParty = 'sponsor' | 'investigator';

/** Who is expected to hold a given essential document. */
export type GcpDocumentHolder = 'sponsor' | 'investigator' | 'both';

/** A single GCP principle (ICH E6(R2) §2). */
export interface GcpPrinciple {
  /** Stable principle id (e.g. 'p1'). */
  id: string;
  /** The principle statement. */
  statement: string;
}

/** A single essential document (ICH E6(R2) §8). */
export interface GcpEssentialDocument {
  /** Stable document id (e.g. 'before_icf'). */
  id: string;
  /** Document title. */
  title: string;
  /** Party expected to hold the document in its file. */
  heldBy: GcpDocumentHolder;
}

/** A single party responsibility (ICH E6(R2) §4 investigator / §5 sponsor). */
export interface GcpResponsibility {
  /** Stable responsibility id (e.g. 'sponsor_monitoring'). */
  id: string;
  /** Responsibility title. */
  title: string;
}

const E6_PRINCIPLES_CITATION = 'ICH E6(R2) §2 (Principles of ICH GCP)';
const E6_RESPONSIBILITY_NOTE =
  'ICH E6 lists the minimum set; confirm scope per trial against E6(R2)/E6(R3) and the applicable regional GCP.';

/** A) The core ICH GCP principles (ICH E6(R2) §2.1–§2.13). */
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

/** B) Essential documents by trial stage (ICH E6(R2) §8.2 / §8.3 / §8.4). */
const ESSENTIAL_DOCUMENTS: Record<GcpStage, GcpEssentialDocument[]> = {
  // §8.2 — Before the clinical phase of the trial commences.
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
  // §8.3 — During the clinical conduct of the trial.
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
  // §8.4 — After completion or termination of the trial.
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

/** C) Responsibility split — sponsor (§5) vs investigator (§4). */
const RESPONSIBILITIES: Record<GcpParty, GcpResponsibility[]> = {
  sponsor: [
    { id: 'sponsor_qms', title: 'Implement a quality management system using a risk-based (quality-by-design) approach (§5.0)' },
    { id: 'sponsor_qa_qc', title: 'Implement and maintain quality assurance and quality control systems with written SOPs (§5.1)' },
    { id: 'sponsor_trial_management', title: 'Trial management, data handling, recordkeeping, and validated computerized systems (§5.5)' },
    { id: 'sponsor_investigator_selection', title: 'Select qualified investigator(s)/institution(s) and define their responsibilities (§5.6)' },
    { id: 'sponsor_monitoring', title: 'Monitor the trial (risk-based, on-site and/or centralized) to verify rights/well-being of subjects, accuracy/completeness of data, and protocol/GCP compliance (§5.18)' },
    { id: 'sponsor_audit', title: 'Conduct audits independent of routine monitoring to evaluate trial conduct and compliance (§5.19)' },
    { id: 'sponsor_safety_reporting', title: 'Safety evaluation and expedited reporting of adverse drug reactions to investigators, IRB/IEC, and regulators (§5.16/§5.17)' },
    { id: 'sponsor_imp_supply', title: 'Supply, label, package, and account for the investigational product(s) (§5.13/§5.14)' },
    { id: 'sponsor_audit_trail', title: 'Ensure data integrity and an attributable audit trail across systems and records (§5.5)' },
    { id: 'sponsor_noncompliance', title: 'Secure agreements, address noncompliance, and notify authorities of premature termination/suspension (§5.20/§5.21)' },
  ],
  investigator: [
    { id: 'investigator_qualifications', title: 'Be qualified by education, training, and experience and provide evidence thereof (§4.1)' },
    { id: 'investigator_resources', title: 'Demonstrate adequate resources — sufficient time, qualified staff, and adequate facilities (§4.2)' },
    { id: 'investigator_medical_care', title: 'Provide medical care for trial-related decisions; a qualified physician is responsible for medical decisions (§4.3)' },
    { id: 'investigator_irb_communication', title: 'Obtain and maintain communication with the IRB/IEC, including approval before initiation (§4.4)' },
    { id: 'investigator_protocol_compliance', title: 'Comply with the approved protocol and document/justify any deviations (§4.5)' },
    { id: 'investigator_imp_accountability', title: 'Maintain investigational product accountability and storage at the trial site (§4.6)' },
    { id: 'investigator_informed_consent', title: 'Obtain freely given informed consent from each subject before participation (§4.8)' },
    { id: 'investigator_records', title: 'Maintain accurate source records and reports (attributable, legible, contemporaneous, original, accurate — ALCOA) (§4.9)' },
    { id: 'investigator_safety_reporting', title: 'Report serious adverse events to the sponsor and safety information to the IRB/IEC as required (§4.11)' },
    { id: 'investigator_progress_reports', title: 'Provide progress reports to the IRB/IEC and a final report on completion/termination (§4.10/§4.13)' },
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
 * Return the core ICH GCP principles (ICH E6(R2) §2). Pure / deterministic.
 */
export function getGcpPrinciples(): GcpPrinciplesResult {
  return {
    principles: GCP_PRINCIPLES,
    citation: E6_PRINCIPLES_CITATION,
    notes: [
      'These are the foundational principles; ICH E6(R3) reaffirms them while emphasizing quality-by-design, risk-proportionate approaches, and a media-neutral view of records.',
      E6_RESPONSIBILITY_NOTE,
    ],
  };
}

const E6_STAGE_CITATION: Record<GcpStage, string> = {
  before: 'ICH E6(R2) §8.2 (Before the clinical phase of the trial commences)',
  during: 'ICH E6(R2) §8.3 (During the clinical conduct of the trial)',
  after: 'ICH E6(R2) §8.4 (After completion or termination of the trial)',
};

/**
 * Return the essential documents expected at a given trial stage (ICH E6(R2)
 * §8). Pure / deterministic. Throws for an unmodeled stage.
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
      'ICH E6(R3) recasts §8 as an "essential records" expectation tied to the Trial Master File; confirm the records inventory per trial.',
    ],
  };
}

/**
 * Return the GCP responsibilities for a party — sponsor (§5) or investigator
 * (§4). Pure / deterministic. Throws for an unmodeled party.
 */
export function getResponsibilities(party: GcpParty): GcpResponsibilitiesResult {
  const responsibilities = RESPONSIBILITIES[party];
  if (!responsibilities) {
    throw new Error(`Unknown GCP party "${party}". Expected one of: ${GCP_PARTIES.join(', ')}.`);
  }
  return {
    party,
    responsibilities,
    citation: party === 'sponsor' ? 'ICH E6(R2) §5 (Sponsor)' : 'ICH E6(R2) §4 (Investigator)',
    notes: [
      'Responsibilities may be delegated (e.g. sponsor functions to a CRO under §5.2), but accountability for GCP compliance remains with the named party.',
      E6_RESPONSIBILITY_NOTE,
    ],
  };
}
