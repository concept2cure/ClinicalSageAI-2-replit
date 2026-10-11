/**
 * SOP requirements: what a regulated procedure must address, by topic and by
 * the product it governs, with the clause and its basis.
 *
 * WHY (2026-10-08, D2): AnA wrote SOPs from one generic list of regional
 * references, with no product type. A device manufacturer's CAPA SOP cited
 * 21 CFR 210/211 (drug CGMP) and never ISO 13485:2016 or the QMSR, and no SOP
 * said which clauses its procedure answers. A quality reviewer or inspector
 * reads an SOP against those clauses. This record holds them, and three
 * consumers read it: the SOP generator (server/services/sop-generator.ts),
 * AnA's SOP review (`review_sop_requirements`, ./sop-review.ts) and the SOP question flow's
 * citations (a test keeps the flow consistent with it).
 *
 * DEVICES: the governing citation comes from the one QMSR crosswalk
 * (./qmsr-crosswalk.ts, `citeQms`), so it follows the effective date: the QMSR
 * section with the removed QSR section as "formerly" on and after 2026-02-02,
 * the QSR section alone before. The ISO 13485:2016 subclause content is from
 * the standard, which is not a regulator page, so it is `recall`.
 *
 * DRUGS AND BIOLOGICS: 21 CFR 210/211 (biologics also 21 CFR 600/601), ICH Q10.
 * Every one is `recall`: this record was written where the eCFR and the ICH
 * site were not reachable (egress policy), so no wording here has been checked
 * against the regulator's text, and the reader is told so (`basisLabel`).
 * Where a practice is common but no regulation states it, the basis is
 * `platform-convention`, never a citation.
 *
 * HONESTY: the elements are what a reviewer reads for; `reviewSopText` (./sop-review.ts) reports
 * whether wording for each was found, which is not a compliance verdict.
 *
 * No IO, no clock (the date is passed in), no model. Client- and server-safe.
 *
 * @module shared/regulatory/sop-requirements
 */

import type { RegulatoryBasis } from './regulatory-basis.js';
import { citeQms, qmsrRow, QMSR_EFFECTIVE, type QmsrCrosswalkId } from './qmsr-crosswalk.js';

export type SopProductDomain = 'drug' | 'biologic' | 'device';

export const SOP_TOPICS = [
  'capa',
  'deviation',
  'complaint_handling',
  'document_control',
  'training',
  'supplier_qualification',
  'internal_audit',
  'management_review',
  'change_control',
] as const;
export type SopTopic = (typeof SOP_TOPICS)[number];

/** ICH Q10 (2008) section numbers and titles, so a citation to a section that does not exist is caught. */
export const ICH_Q10_SECTIONS: Readonly<Record<string, string>> = Object.freeze({
  '1': 'Pharmaceutical Quality System',
  '2': 'Management Responsibility',
  '2.1': 'Management Commitment',
  '2.2': 'Quality Policy',
  '2.3': 'Quality Planning',
  '2.4': 'Resource Management',
  '2.5': 'Internal Communication',
  '2.6': 'Management Review',
  '2.7': 'Management of Outsourced Activities and Purchased Materials',
  '2.8': 'Management of Change in Product Ownership',
  '3': 'Continual Improvement of Process Performance and Product Quality',
  '3.1': 'Lifecycle Stage Goals',
  '3.2': 'Pharmaceutical Quality System Elements',
  '3.2.1': 'Process Performance and Product Quality Monitoring System',
  '3.2.2': 'Corrective Action and Preventive Action (CAPA) System',
  '3.2.3': 'Change Management System',
  '3.2.4': 'Management Review of Process Performance and Product Quality',
  '4': 'Continual Improvement of the Pharmaceutical Quality System',
  '4.1': 'Management Review of the Pharmaceutical Quality System',
  '4.2': 'Monitoring of Internal and External Factors Impacting the Pharmaceutical Quality System',
  '4.3': 'Outcomes of Management Review and Monitoring',
});

/** One thing the procedure must address. */
export interface SopRequirementElement {
  id: string;
  /** What the SOP must say it does, in the reviewer's words. */
  requirement: string;
  basis: RegulatoryBasis;
  /**
   * Wording that addresses it. Each alternative is one pattern, or several
   * that must all occur in the same sentence.
   */
  detect: ReadonlyArray<RegExp | readonly RegExp[]>;
}

export interface SopTopicRequirements {
  topic: SopTopic;
  domain: SopProductDomain;
  title: string;
  /** The regulation the procedure answers to, in force on `asOf`. */
  governing: RegulatoryBasis[];
  elements: SopRequirementElement[];
  /** Facts the reviewer should know that are not elements (reporting clocks, inspection scope). */
  notes: string[];
}

// ── Bases ────────────────────────────────────────────────────────────────────

const UNREAD =
  'Written where the eCFR and the ICH site were not reachable from the authoring environment; the wording has not been checked against the regulator’s text.';

function recall(ref: string, note = UNREAD): RegulatoryBasis {
  return { ref, confidence: 'recall', note };
}

function convention(ref: string): RegulatoryBasis {
  return { ref, confidence: 'platform-convention' };
}

/** An ISO 13485:2016 subclause under the QMSR (21 CFR 820.10 incorporates the standard). */
function iso(clause: string): RegulatoryBasis {
  return recall(
    `ISO 13485:2016 §${clause} (via 21 CFR 820.10)`,
    'The ISO subclause content is from the standard, not a regulator page; 21 CFR 820.10 incorporating ISO 13485:2016 is in the QMSR crosswalk (shared/regulatory/qmsr-crosswalk.ts).',
  );
}

/** The device governing citation, from the crosswalk, as of `asOf`. */
function deviceGoverning(id: QmsrCrosswalkId, asOf: string): RegulatoryBasis {
  const row = qmsrRow(id);
  if (!row) throw new Error(`sop-requirements: no QMSR crosswalk row "${id}"`);
  return { ...row.basis, ref: citeQms(id, asOf) };
}

const Q10 = (section: string) => recall(`ICH Q10 §${section} (${ICH_Q10_SECTIONS[section]})`);
const CFR = (ref: string) => recall(ref);

// ── Patterns shared by several topics ────────────────────────────────────────

const QUALITY_UNIT = /quality (control )?unit|quality assurance|\bQA\b|\bQCU\b/i;
const ROOT_CAUSE = /root[- ]cause|determin\w* (the |its )?causes?|cause[s]? (is|are) (determined|identified)/i;
const EFFECTIVENESS = /effectiveness/i;
const RISK_PROPORTION = /proportionate|commensurate|risk[- ]based|according to (the )?risk|based on (the )?risk/i;
const RECORDS = /\brecord(s|ed)?\b/i;

// ── Topics ───────────────────────────────────────────────────────────────────

type Builder = (asOf: string) => Omit<SopTopicRequirements, 'topic' | 'domain'>;

const DEVICE: Record<SopTopic, Builder> = {
  capa: (asOf) => ({
    title: 'Corrective and preventive action',
    governing: [deviceGoverning('capa', asOf)],
    elements: [
      { id: 'review_nonconformities', requirement: 'Review nonconformities, including complaints.', basis: iso('8.5.2(a)'),
        detect: [[/review|evaluat|analy/i, /nonconformit|complaint/i]] },
      { id: 'determine_causes', requirement: 'Determine the causes of nonconformities.', basis: iso('8.5.2(b)'), detect: [ROOT_CAUSE] },
      { id: 'evaluate_need', requirement: 'Evaluate the need for action to ensure nonconformities do not recur.', basis: iso('8.5.2(c)'),
        detect: [/recur(rence)?|re-?occur/i] },
      { id: 'plan_implement', requirement: 'Plan, document and implement the action needed, including updating documentation.', basis: iso('8.5.2(d)'),
        detect: [[/plan|implement|document/i, /action/i], /updat\w*[^.]{0,40}document/i] },
      { id: 'no_adverse_effect', requirement: 'Verify that the corrective action does not adversely affect the ability to meet regulatory requirements or the safety and performance of the device.', basis: iso('8.5.2(e)'),
        detect: [[/advers|does not affect|no (negative )?impact/i, /safety|performance|regulatory requirement/i]] },
      { id: 'effectiveness', requirement: 'Review the effectiveness of the corrective action taken.', basis: iso('8.5.2(f)'), detect: [EFFECTIVENESS] },
      { id: 'proportionate', requirement: 'Take action without undue delay, proportionate to the effects of the nonconformities.', basis: iso('8.5.2'),
        detect: [RISK_PROPORTION, /undue delay/i] },
      { id: 'preventive_action', requirement: 'Determine potential nonconformities and their causes, and act to prevent their occurrence (preventive action).', basis: iso('8.5.3'),
        // Naming "preventive action" (a title, a purpose line) does not address it: the
        // wording must say how potential nonconformities are found or acted on.
        detect: [/potential nonconformit/i, [/preventive action/i, /potential|determin|identif|trend/i], /prevent (their |the )?occurrence/i] },
      { id: 'records', requirement: 'Record the results of any investigation and of action taken.', basis: iso('8.5.2'),
        detect: [[RECORDS, /investigat|action/i]] },
    ],
    notes: [],
  }),
  deviation: (asOf) => ({
    title: 'Control of nonconforming product (deviations)',
    governing: [deviceGoverning('nonconforming', asOf)],
    elements: [
      { id: 'identify', requirement: 'Identify and document product that does not conform to requirements.', basis: iso('8.3.1'),
        detect: [[/identif|document|record/i, /nonconform|deviat/i]] },
      { id: 'segregate', requirement: 'Prevent its unintended use or delivery (identification, segregation).', basis: iso('8.3.1'),
        detect: [/segregat|quarantin|unintended (use|delivery)|hold\b/i] },
      { id: 'evaluate', requirement: 'Evaluate the nonconformity, including the need for an investigation and for notifying any external party responsible for it.', basis: iso('8.3.1'),
        detect: [[/evaluat|assess/i, /investigat|notif/i]] },
      { id: 'disposition', requirement: 'Record the nature of the nonconformity, the action taken (disposition) and who authorised it.', basis: iso('8.3.1; 8.3.2'), detect: [/disposition/i] },
      { id: 'concession', requirement: 'Accept by concession only when justified, approved and the product still meets regulatory requirements.', basis: iso('8.3.2'),
        detect: [/concession|use[- ]as[- ]is/i] },
      { id: 'after_delivery', requirement: 'Act on nonconforming product found after delivery, appropriate to the effects (and issue advisory notices where needed).', basis: iso('8.3.3'),
        detect: [/after delivery|after (it is |it has been )?(distributed|shipped)|in the field|advisory notice/i] },
      { id: 'rework', requirement: 'Rework only under a documented procedure that considers its effect, with re-verification.', basis: iso('8.3.4'), detect: [/rework/i] },
    ],
    notes: [],
  }),
  complaint_handling: (asOf) => ({
    title: 'Complaint handling',
    governing: [deviceGoverning('feedback_complaints', asOf), recall('21 CFR 803 (medical device reporting)')],
    elements: [
      { id: 'receive_record', requirement: 'Receive and record complaint information.', basis: iso('8.2.2(a)'),
        detect: [[/receiv|intake|log/i, /record|document|log/i]] },
      { id: 'is_complaint', requirement: 'Evaluate whether the feedback is a complaint.', basis: iso('8.2.2(b)'),
        detect: [/whether[^.]{0,60}complaint|constitutes a complaint|meets the definition/i] },
      { id: 'investigate', requirement: 'Investigate complaints.', basis: iso('8.2.2(c)'), detect: [/investigat/i] },
      { id: 'report_authorities', requirement: 'Determine whether the information must be reported to the regulatory authority (in the US, a medical device report under 21 CFR 803), and notify it when the criteria are met.', basis: iso('8.2.2(d); 8.2.3'),
        detect: [/medical device report|\bMDR\b|part 803|21 CFR 803|report\w*[^.]{0,30}(FDA|regulatory authorit|competent authorit)/i] },
      { id: 'related_product', requirement: 'Handle the product related to the complaint.', basis: iso('8.2.2(e)'),
        detect: [/related product|affected product|product (involved|concerned|returned)|returned (device|product)/i] },
      { id: 'correction', requirement: 'Determine the need to initiate a correction or corrective action.', basis: iso('8.2.2(f)'),
        detect: [/correction|corrective action|\bCAPA\b/i] },
      { id: 'not_investigated', requirement: 'When a complaint is not investigated, document the justification.', basis: iso('8.2.2'),
        detect: [/not (be )?investigated|no investigation|justif/i] },
      { id: 'udi', requirement: 'Keep complaint records that include the device name, the date received and any unique device identifier (UDI) or UPC.', basis: qmsrRow('feedback_complaints')!.basis,
        detect: [/\bUDI\b|unique device identifier|\bUPC\b/i] },
      { id: 'timely', requirement: 'Handle complaints in a timely manner (stated timelines).', basis: iso('8.2.2'),
        detect: [/timely|within \d+|\d+ (calendar |working |business )?days/i] },
    ],
    notes: [
      'US medical device reporting (21 CFR 803, recall): 30 calendar days for a death, serious injury or reportable malfunction; 5 work days for an event needing remedial action to prevent an unreasonable risk of substantial harm, or when FDA asks.',
    ],
  }),
  document_control: (asOf) => ({
    title: 'Control of documents and records',
    governing: [deviceGoverning('qms_general', asOf)],
    elements: [
      { id: 'approve_before_issue', requirement: 'Review and approve documents for adequacy before issue.', basis: iso('4.2.4(a)'),
        detect: [[/approv/i, /prior to|before/i], /review and approv/i] },
      { id: 'review_update', requirement: 'Review, update as necessary and re-approve documents.', basis: iso('4.2.4(b)'),
        detect: [/periodic(ally)? review|re-?approv|review and update/i] },
      { id: 'revision_status', requirement: 'Identify the current revision status of documents and their changes.', basis: iso('4.2.4(c)'),
        detect: [/revision|version/i] },
      { id: 'point_of_use', requirement: 'Make relevant versions available at points of use.', basis: iso('4.2.4(d)'),
        detect: [/points? of use|available (to|at) (the )?(user|personnel|staff)/i] },
      { id: 'external_documents', requirement: 'Identify documents of external origin and control their distribution.', basis: iso('4.2.4(f)'),
        detect: [/external (document|origin)/i] },
      { id: 'obsolete', requirement: 'Prevent unintended use of obsolete documents and identify any that are retained.', basis: iso('4.2.4(h)'),
        detect: [/obsolete|supersed|withdraw/i] },
      { id: 'change_approval', requirement: 'Have changes reviewed and approved by the original approving function or a designated one.', basis: iso('4.2.4'),
        detect: [[/change/i, /approv|review/i]] },
      { id: 'obsolete_retention', requirement: 'Keep at least one copy of an obsolete controlled document for at least the lifetime of the device, and not less than the record retention period.', basis: iso('4.2.4'),
        detect: [/lifetime of the (medical )?device|retention period/i] },
      { id: 'records', requirement: 'Control records: identification, storage, security, integrity, retrieval, retention and disposition.', basis: iso('4.2.5'),
        detect: [[RECORDS, /retriev|retention|retain|integrity/i]] },
    ],
    notes: [],
  }),
  training: (asOf) => ({
    title: 'Competence and training',
    governing: [deviceGoverning('resources', asOf)],
    elements: [
      { id: 'competence', requirement: 'Determine the competence needed by personnel whose work affects product quality.', basis: iso('6.2(a)'), detect: [/competen/i] },
      { id: 'provide_training', requirement: 'Provide training or other action to achieve that competence.', basis: iso('6.2(b)'), detect: [/\btrain/i] },
      { id: 'effectiveness', requirement: 'Evaluate the effectiveness of the training.', basis: iso('6.2(c)'), detect: [EFFECTIVENESS, /assess\w*[^.]{0,40}(comprehension|understanding)/i] },
      { id: 'awareness', requirement: 'Ensure personnel are aware of the relevance and importance of their activities.', basis: iso('6.2(d)'),
        detect: [/aware|relevance|importance/i] },
      { id: 'records', requirement: 'Keep records of education, training, skills and experience.', basis: iso('6.2(e)'),
        detect: [[RECORDS, /training|education|experience|skills/i]] },
      { id: 'documented_process', requirement: 'Document the process for establishing competence, providing training and ensuring awareness.', basis: iso('6.2'),
        detect: [/process for (establishing|determining) competence|competence[^.]{0,40}(process|procedure|matrix)/i] },
    ],
    notes: [],
  }),
  supplier_qualification: (asOf) => ({
    title: 'Purchasing and supplier control',
    governing: [deviceGoverning('purchasing', asOf)],
    elements: [
      { id: 'criteria', requirement: 'Set criteria for evaluating and selecting suppliers, based on their ability to provide product that meets requirements.', basis: iso('7.4.1'),
        detect: [[/criteria/i, /select|evaluat|approv/i]] },
      { id: 'performance', requirement: 'Base selection on supplier performance and the effect of the purchased product on device quality.', basis: iso('7.4.1'), detect: [/performance/i] },
      { id: 'risk', requirement: 'Make the controls proportionate to the risk associated with the device.', basis: iso('7.4.1'), detect: [/risk/i] },
      { id: 'monitor', requirement: 'Plan the monitoring and re-evaluation of suppliers.', basis: iso('7.4.1'),
        detect: [/re-?evaluat|monitor|re-?qualif/i] },
      { id: 'records', requirement: 'Keep records of evaluation, selection, monitoring and re-evaluation, and of actions arising.', basis: iso('7.4.1'),
        detect: [[RECORDS, /evaluat|select|supplier/i]] },
      { id: 'change_notification', requirement: 'Agree in writing that the supplier notifies changes to the purchased product before they are implemented.', basis: iso('7.4.2'),
        detect: [[/notif/i, /change/i], /quality agreement|supply agreement/i] },
      { id: 'verify_purchased', requirement: 'Verify that purchased product meets the purchasing requirements.', basis: iso('7.4.3'),
        detect: [/incoming inspection|receiving inspection|verif\w*[^.]{0,40}(purchased|incoming|received)/i] },
    ],
    notes: [],
  }),
  internal_audit: () => ({
    title: 'Internal audit',
    governing: [iso('8.2.4')],
    elements: [
      { id: 'intervals', requirement: 'Audit at planned intervals.', basis: iso('8.2.4'),
        detect: [/planned intervals?|audit (schedule|programme|program|plan)|annual(ly)?|frequency/i] },
      { id: 'procedure', requirement: 'Define responsibilities for planning, conducting, recording and reporting audits.', basis: iso('8.2.4'),
        detect: [[/plan|conduct/i, /audit/i]] },
      { id: 'criteria_scope', requirement: 'Define the audit criteria, scope, interval and methods.', basis: iso('8.2.4'), detect: [/criteria|scope/i] },
      { id: 'objectivity', requirement: 'Ensure auditors do not audit their own work, so the process is objective and impartial.', basis: iso('8.2.4'),
        detect: [/own work|independen|objectiv|impartial/i] },
      { id: 'actions', requirement: 'Have the management of the audited area act without undue delay to correct and remove causes.', basis: iso('8.2.4'),
        detect: [/undue delay|corrective action|\bCAPA\b/i] },
      { id: 'follow_up', requirement: 'Verify the actions taken and report the verification results.', basis: iso('8.2.4'), detect: [/follow[- ]up|verif/i] },
      { id: 'records', requirement: 'Keep records of audits and their results, including the processes and areas audited.', basis: iso('8.2.4'), detect: [RECORDS] },
    ],
    notes: [
      'Under the QMSR, FDA can review management review, internal audit and supplier audit reports during an inspection; the QSR exempted them (formerly 21 CFR 820.180(c)). Recall — not checked against the regulator’s text.',
    ],
  }),
  management_review: (asOf) => ({
    title: 'Management review',
    governing: [deviceGoverning('management', asOf)],
    elements: [
      { id: 'intervals', requirement: 'Review the QMS at documented, planned intervals.', basis: iso('5.6.1'),
        detect: [/planned intervals?|at least (annually|once)|annual(ly)?|quarterl|frequency/i] },
      { id: 'input_feedback', requirement: 'Inputs include feedback and complaint handling.', basis: iso('5.6.2'), detect: [/feedback|complaint/i] },
      { id: 'input_reporting', requirement: 'Inputs include reporting to regulatory authorities.', basis: iso('5.6.2'),
        detect: [/report\w*[^.]{0,30}(regulatory|authorit|FDA)|vigilance|\bMDR\b/i] },
      { id: 'input_audits', requirement: 'Inputs include audits.', basis: iso('5.6.2'), detect: [/audit/i] },
      { id: 'input_monitoring', requirement: 'Inputs include monitoring and measurement of processes and of product.', basis: iso('5.6.2'),
        detect: [/monitoring|measurement|process performance|product (conformity|quality)/i] },
      { id: 'input_capa', requirement: 'Inputs include corrective and preventive action.', basis: iso('5.6.2'), detect: [/corrective|preventive|\bCAPA\b/i] },
      { id: 'input_previous', requirement: 'Inputs include follow-up actions from previous reviews.', basis: iso('5.6.2'),
        detect: [/previous (management )?review|prior review|follow[- ]up action/i] },
      { id: 'input_changes', requirement: 'Inputs include changes that could affect the QMS.', basis: iso('5.6.2(j)'),
        detect: [/changes? (that could|which could|that may|affecting)[^.]{0,30}(QMS|quality (management )?system)/i] },
      { id: 'input_recommendations', requirement: 'Inputs include recommendations for improvement.', basis: iso('5.6.2(k)'),
        detect: [/recommendations? for improvement|improvement (recommendation|opportunit)/i] },
      { id: 'input_regulatory', requirement: 'Inputs include new or revised regulatory requirements.', basis: iso('5.6.2'),
        detect: [/(new|revised|changed?) regulatory requirement|regulatory change/i] },
      { id: 'outputs', requirement: 'Record outputs: improvements needed, changes for new or revised regulatory requirements, and resource needs.', basis: iso('5.6.3'),
        detect: [/output|resource|improvement/i] },
    ],
    notes: [
      'Under the QMSR, FDA can review management review reports during an inspection (formerly exempt under 21 CFR 820.180(c)). Recall — not checked against the regulator’s text.',
    ],
  }),
  change_control: (asOf) => ({
    title: 'Change control',
    governing: [deviceGoverning('designChanges', asOf), iso('4.1.4')],
    elements: [
      { id: 'identify_review', requirement: 'Identify design and development changes and determine their significance to function, performance, usability, safety and regulatory requirements.', basis: iso('7.3.9'),
        detect: [/significan/i, [/identif|determin|assess/i, /impact|effect/i]] },
      { id: 'verify_validate', requirement: 'Review, verify, validate as appropriate, and approve changes before they are implemented.', basis: iso('7.3.9'),
        detect: [[/verif|validat/i, /change/i], [/approv/i, /before|prior to/i]] },
      { id: 'effect_on_product', requirement: 'Evaluate the effect of the change on constituent parts, product in process or already delivered, and on risk management inputs and outputs.', basis: iso('7.3.9'),
        detect: [/risk management|already delivered|in process|constituent part/i] },
      { id: 'regulatory_assessment', requirement: 'Assess whether the change needs a regulatory submission before it is made (in the US, a new 510(k) under 21 CFR 807.81(a)(3), or a PMA supplement under 21 CFR 814.39).', basis: recall('21 CFR 807.81(a)(3); 21 CFR 814.39'),
        detect: [/510\(k\)|PMA supplement|807\.81|814\.39|regulatory (assessment|impact|submission|filing)/i] },
      { id: 'qms_change', requirement: 'Evaluate changes to QMS processes for their impact on the QMS and on the devices produced.', basis: iso('4.1.4'),
        detect: [[/impact|effect/i, /quality (management )?system|QMS|process/i]] },
      { id: 'records', requirement: 'Keep records of changes, their review and any necessary actions.', basis: iso('7.3.9'), detect: [[RECORDS, /change/i]] },
    ],
    notes: [],
  }),
};

const DRUG: Record<SopTopic, Builder> = {
  capa: () => ({
    title: 'Corrective and preventive action',
    governing: [CFR('21 CFR 211.192 (production record review)'), Q10('3.2.2')],
    elements: [
      { id: 'investigate', requirement: 'Thoroughly investigate any unexplained discrepancy or failure of a batch or its components to meet specifications.', basis: CFR('21 CFR 211.192'),
        detect: [/investigat/i] },
      { id: 'other_batches', requirement: 'Extend the investigation to other batches of the product and other products that may have been associated with the failure.', basis: CFR('21 CFR 211.192'),
        detect: [/other (batch|lot|product)|associated (batch|lot|product)|extend\w* (the investigation )?to/i] },
      { id: 'written_record', requirement: 'Make a written record of the investigation, including its conclusions and follow-up.', basis: CFR('21 CFR 211.192'),
        detect: [/conclusion|follow[- ]up/i] },
      { id: 'determine_causes', requirement: 'Determine the root cause with a structured approach.', basis: Q10('3.2.2'), detect: [ROOT_CAUSE] },
      { id: 'effectiveness', requirement: 'Evaluate the effectiveness of the corrective and preventive actions.', basis: Q10('3.2.2'), detect: [EFFECTIVENESS] },
      { id: 'proportionate', requirement: 'Make the level of effort, formality and documentation of the investigation commensurate with the level of risk (ICH Q9).', basis: Q10('3.2.2'),
        detect: [RISK_PROPORTION] },
      { id: 'quality_unit', requirement: 'Have the quality unit review and approve the investigation and its outcome.', basis: CFR('21 CFR 211.22(a)'), detect: [QUALITY_UNIT] },
      { id: 'trending', requirement: 'Include complaints, recalls and 211.192 investigations in the annual product review.', basis: CFR('21 CFR 211.180(e)(2)'), detect: [/annual product review|product quality review|\bAPR\b|\bPQR\b/i] },
    ],
    notes: [],
  }),
  deviation: () => ({
    title: 'Deviation management',
    governing: [CFR('21 CFR 211.100(b) (deviations from written procedures)'), CFR('21 CFR 211.192')],
    elements: [
      { id: 'record', requirement: 'Record any deviation from written procedures.', basis: CFR('21 CFR 211.100(b)'),
        detect: [[/record|document/i, /deviation/i]] },
      { id: 'justify', requirement: 'Justify the deviation.', basis: CFR('21 CFR 211.100(b)'), detect: [/justif/i] },
      { id: 'investigate', requirement: 'Investigate unexplained discrepancies, extending to other batches that may be associated.', basis: CFR('21 CFR 211.192'),
        detect: [/investigat/i] },
      { id: 'other_batches', requirement: 'Assess the impact on other batches.', basis: CFR('21 CFR 211.192'),
        detect: [/other (batch|lot)|associated (batch|lot)|batch(es)? (impact|affected)/i] },
      { id: 'quality_unit', requirement: 'Have the quality unit review and approve the disposition.', basis: CFR('21 CFR 211.22(a)'), detect: [QUALITY_UNIT] },
      { id: 'classify', requirement: 'Classify deviations by risk (for example critical, major, minor) to set the depth of investigation.', basis: convention('Deviation classification by risk (industry practice; no CFR section states it)'),
        detect: [/critical|major|minor|classif/i] },
      { id: 'field_alert', requirement: 'For a product under an NDA or ANDA, submit a field alert report within 3 working days for a distributed batch that may not meet specifications.', basis: CFR('21 CFR 314.81(b)(1)'),
        detect: [/field alert|\bFAR\b|(3|three) working days/i] },
    ],
    notes: [],
  }),
  complaint_handling: () => ({
    title: 'Complaint handling',
    governing: [CFR('21 CFR 211.198 (complaint files)')],
    elements: [
      { id: 'written_oral', requirement: 'Handle written and oral complaints under a written procedure.', basis: CFR('21 CFR 211.198(a)'),
        detect: [/oral|verbal|telephone|written complaint/i] },
      { id: 'quality_unit', requirement: 'Have the quality unit review any complaint involving a possible failure to meet specifications.', basis: CFR('21 CFR 211.198(a)'), detect: [QUALITY_UNIT] },
      { id: 'investigate', requirement: 'Determine whether an investigation is needed under 21 CFR 211.192.', basis: CFR('21 CFR 211.198(a)'), detect: [/investigat/i] },
      { id: 'adverse_experience', requirement: 'Determine whether the complaint is a serious and unexpected adverse drug experience that must be reported to FDA.', basis: CFR('21 CFR 211.198(a) (refers to 21 CFR 310.305); 21 CFR 314.80 for NDA/ANDA products'),
        detect: [/adverse (drug )?(experience|event|reaction)|serious and unexpected|report\w*[^.]{0,20}FDA/i] },
      { id: 'record_content', requirement: 'Record the product name and strength, lot number, complainant, nature of the complaint and the reply.', basis: CFR('21 CFR 211.198(b)'),
        detect: [/lot number|batch number|complainant/i] },
      { id: 'no_investigation', requirement: 'When no investigation is made, record the reason and the person who decided.', basis: CFR('21 CFR 211.198(b)'),
        detect: [/no investigation|not (be )?investigated|reason[^.]{0,40}investigat/i] },
      { id: 'retention', requirement: 'Keep the complaint file for at least 1 year after the product’s expiration date, or 1 year after the complaint was received, whichever is longer.', basis: CFR('21 CFR 211.198(b)'),
        detect: [/retain|retention|kept for/i] },
    ],
    notes: [],
  }),
  document_control: () => ({
    title: 'Document and record control',
    governing: [CFR('21 CFR 211.100(a); 21 CFR 211.180'), CFR('21 CFR Part 11')],
    elements: [
      { id: 'quality_unit_approval', requirement: 'Have written procedures, and changes to them, drafted, reviewed and approved by the appropriate units and reviewed and approved by the quality unit.', basis: CFR('21 CFR 211.100(a)'),
        detect: [[QUALITY_UNIT, /approv/i]] },
      { id: 'retention', requirement: 'Keep records for at least 1 year after the batch’s expiration date.', basis: CFR('21 CFR 211.180(a)'), detect: [/retain|retention/i] },
      { id: 'inspection', requirement: 'Keep records readily available for authorized inspection.', basis: CFR('21 CFR 211.180(c)'),
        detect: [/inspection|readily available|retriev/i] },
      { id: 'electronic', requirement: 'Control electronic records and signatures (audit trail, signature manifestation).', basis: CFR('21 CFR Part 11'),
        detect: [/part 11|electronic (record|signature)|audit trail/i] },
      { id: 'revision_status', requirement: 'Identify the current version of each document and withdraw superseded versions from use.', basis: convention('Version control and withdrawal of superseded documents (industry practice; 21 CFR 211 states no single section for it)'),
        detect: [/version|revision|supersed|obsolete/i] },
      { id: 'periodic_review', requirement: 'Review documents periodically.', basis: convention('Periodic document review (industry practice)'),
        detect: [/periodic(ally)? review|review (every|each) \d+/i] },
    ],
    notes: [],
  }),
  training: () => ({
    title: 'Personnel qualification and training',
    governing: [CFR('21 CFR 211.25 (personnel qualifications)')],
    elements: [
      { id: 'qualified', requirement: 'Have education, training and experience to perform assigned functions.', basis: CFR('21 CFR 211.25(a)'),
        detect: [/education|experience|qualif/i] },
      { id: 'cgmp_training', requirement: 'Train personnel in the particular operations they perform and in current good manufacturing practice.', basis: CFR('21 CFR 211.25(a)'),
        detect: [[/train/i, /c?GMP|good manufacturing|operations?|procedure/i]] },
      { id: 'qualified_trainers', requirement: 'Have training conducted by qualified individuals.', basis: CFR('21 CFR 211.25(a)'),
        detect: [/qualified (individual|trainer|person)|trainers? (are|is) qualified/i] },
      { id: 'frequency', requirement: 'Train on a continuing basis and with sufficient frequency.', basis: CFR('21 CFR 211.25(a)'),
        detect: [/frequency|continu|refresher|periodic|annual/i] },
      { id: 'supervisors', requirement: 'Ensure supervisors are qualified for the supervision they perform.', basis: CFR('21 CFR 211.25(b)'), detect: [/supervis/i] },
      { id: 'records', requirement: 'Record training before personnel perform the task independently.', basis: convention('Training records before independent work (industry practice; 211.25 does not name a record)'),
        detect: [[RECORDS, /train/i]] },
    ],
    notes: [],
  }),
  supplier_qualification: () => ({
    title: 'Supplier qualification',
    governing: [CFR('21 CFR 211.84 (testing and approval or rejection of components)'), Q10('2.7')],
    elements: [
      { id: 'identity', requirement: 'Perform at least one identity test on each lot of each component.', basis: CFR('21 CFR 211.84(d)(1)'), detect: [/identity/i] },
      { id: 'coa', requirement: 'Accept a supplier’s report (certificate) of analysis only with at least one specific identity test, and validate the supplier’s results at appropriate intervals.', basis: CFR('21 CFR 211.84(d)(2)'),
        detect: [/(certificate|report) of analysis|\bC[oO]A\b/] },
      { id: 'quality_unit', requirement: 'Have the quality unit approve or reject components, including those from a contractor.', basis: CFR('21 CFR 211.22(a)'), detect: [QUALITY_UNIT] },
      { id: 'quality_agreement', requirement: 'Define responsibilities with contract facilities in a written quality agreement.', basis: recall('FDA guidance, Contract Manufacturing Arrangements for Drugs: Quality Agreements (2016)'),
        detect: [/quality agreement/i] },
      { id: 'outsourced', requirement: 'Control outsourced activities and purchased materials, assessing the supplier before contracting.', basis: Q10('2.7'),
        detect: [/outsourc|contract (manufactur|organi|laborator|facilit)/i] },
      { id: 'monitor', requirement: 'Monitor and re-evaluate suppliers.', basis: Q10('2.7'), detect: [/monitor|re-?qualif|re-?evaluat|periodic (audit|review)/i] },
    ],
    notes: [],
  }),
  internal_audit: () => ({
    title: 'Internal audit (self-inspection)',
    governing: [recall('EudraLex Volume 4, Part I, Chapter 9 (Self Inspection)'), recall('FDA guidance, Quality Systems Approach to Pharmaceutical CGMP Regulations (2006)')],
    elements: [
      { id: 'schedule', requirement: 'Audit to a planned schedule covering all GMP areas.', basis: recall('EudraLex Volume 4, Part I, Chapter 9'),
        detect: [/schedule|planned|annual|frequency|programme|program/i] },
      { id: 'independence', requirement: 'Have self-inspections done in an independent and detailed way by designated competent people.', basis: recall('EudraLex Volume 4, Part I, Chapter 9'),
        detect: [/independen|objectiv|own (work|area)|impartial/i] },
      { id: 'report', requirement: 'Record each self-inspection; the report holds the observations made.', basis: recall('EudraLex Volume 4, Part I, Chapter 9'),
        detect: [/report|finding/i] },
      { id: 'capa', requirement: 'Propose corrective measures in the report, and record the actions taken.', basis: recall('EudraLex Volume 4, Part I, Chapter 9'),
        detect: [/corrective action|\bCAPA\b/i] },
      { id: 'follow_up', requirement: 'Follow up the actions to closure.', basis: recall('FDA guidance, Quality Systems Approach to Pharmaceutical CGMP Regulations (2006)'),
        detect: [/follow[- ]up|verif|clos/i] },
    ],
    notes: [
      '21 CFR Part 211 has no internal-audit section; FDA’s 2006 quality systems guidance recommends audits, and EU GMP Chapter 9 requires self-inspection. Recall — not checked against the regulator’s text.',
    ],
  }),
  management_review: () => ({
    title: 'Management review',
    governing: [Q10('2.6'), Q10('3.2.4'), Q10('4.1')],
    elements: [
      { id: 'senior_management', requirement: 'Have senior management review the pharmaceutical quality system.', basis: Q10('2.6'),
        detect: [/senior management|executive management|top management/i] },
      { id: 'intervals', requirement: 'Review at defined intervals.', basis: Q10('4.1'), detect: [/interval|annual|quarterl|frequency/i] },
      { id: 'input_inspections', requirement: 'Inputs include results of regulatory inspections and audits.', basis: Q10('3.2.4'), detect: [/inspection|audit/i] },
      { id: 'input_quality_reviews', requirement: 'Inputs include periodic quality reviews: complaints, recalls and customer satisfaction.', basis: Q10('3.2.4'),
        detect: [/complaint|recall/i] },
      { id: 'input_monitoring', requirement: 'Inputs include process performance and product quality monitoring.', basis: Q10('3.2.4'),
        detect: [/process performance|product quality|monitoring/i] },
      { id: 'input_changes', requirement: 'Inputs include the effectiveness of process and product changes, and of CAPA.', basis: Q10('3.2.4'),
        detect: [/change|\bCAPA\b|corrective/i] },
      { id: 'input_previous', requirement: 'Inputs include follow-up actions from previous reviews.', basis: Q10('3.2.4'),
        detect: [/previous (management )?review|prior review|follow[- ]up action/i] },
      { id: 'outputs', requirement: 'Record outputs: improvements, resource reallocation and changes, with actions tracked.', basis: Q10('4.3'),
        detect: [/output|resource|improvement|action/i] },
    ],
    notes: [],
  }),
  change_control: () => ({
    title: 'Change control',
    governing: [Q10('3.2.3'), CFR('21 CFR 211.100(a)'), CFR('21 CFR 314.70 (changes to an approved NDA)')],
    elements: [
      { id: 'quality_unit', requirement: 'Have changes to procedures and specifications reviewed and approved by the quality unit.', basis: CFR('21 CFR 211.100(a); 21 CFR 211.160(a)'),
        detect: [[QUALITY_UNIT, /approv|review/i]] },
      { id: 'regulatory_impact', requirement: 'Evaluate each proposed change against the marketing authorisation and decide whether it needs a regulatory submission.', basis: Q10('3.2.3'),
        detect: [/marketing authori|registered|regulatory (impact|assessment|filing|submission)|supplement|annual report/i] },
      { id: 'expertise', requirement: 'Draw on expertise from the relevant areas to assess the change.', basis: Q10('3.2.3'),
        detect: [/cross[- ]functional|relevant (areas|functions|departments)|subject matter expert|\bSME\b/i] },
      { id: 'risk', requirement: 'Use quality risk management to evaluate proposed changes, with effort and formality commensurate with the risk.', basis: Q10('3.2.3'), detect: [/risk/i] },
      { id: 'post_implementation', requirement: 'Evaluate the change after implementation to confirm its objectives were met and there was no deleterious impact on product quality.', basis: Q10('3.2.3'),
        detect: [/post[- ]implementation|after implementation|effectiveness/i] },
      { id: 'reporting_category', requirement: 'Assign the US reporting category: prior approval supplement, changes being effected supplement (CBE-30 or CBE-0), or annual report.', basis: CFR('21 CFR 314.70'),
        detect: [/prior approval|\bPAS\b|\bCBE|changes being effected|annual report/i] },
    ],
    notes: [],
  }),
};

/** What a biologic adds to the drug requirements. */
function biologicFrom(topic: SopTopic, drug: Omit<SopTopicRequirements, 'topic' | 'domain'>): Omit<SopTopicRequirements, 'topic' | 'domain'> {
  if (topic === 'deviation') {
    return {
      ...drug,
      governing: [...drug.governing, CFR('21 CFR 600.14 (reporting of biological product deviations)')],
      elements: [
        ...drug.elements.filter((e) => e.id !== 'field_alert'),
        { id: 'bpdr', requirement: 'Report to FDA a biological product deviation in a distributed product that may affect its safety, purity or potency, as soon as possible and within 45 calendar days of discovering it.', basis: CFR('21 CFR 600.14'),
          detect: [/biological product deviation|\bBPDR\b|600\.14|45 (calendar )?days/i] },
      ],
      notes: [...drug.notes, 'A biologic licensed under a BLA reports a biological product deviation within 45 calendar days (21 CFR 600.14, recall).'],
    };
  }
  if (topic === 'change_control') {
    return {
      ...drug,
      governing: [...drug.governing.filter((b) => !/314\.70/.test(b.ref)), CFR('21 CFR 601.12 (changes to an approved BLA)')],
      elements: drug.elements.map((e) =>
        e.id === 'reporting_category' ? { ...e, basis: CFR('21 CFR 601.12'), requirement: e.requirement.replace('(CBE-30 or CBE-0)', '(CBE-30 or CBE)') } : e,
      ),
    };
  }
  if (topic === 'complaint_handling') {
    return {
      ...drug,
      elements: drug.elements.map((e) =>
        e.id === 'adverse_experience' ? { ...e, basis: CFR('21 CFR 211.198(a); 21 CFR 600.80') } : e,
      ),
    };
  }
  return drug;
}

/** The requirements for an SOP on `topic` for a product of `domain`, as in force on `asOf` (YYYY-MM-DD). */
export function sopRequirementsFor(topic: SopTopic, domain: SopProductDomain, asOf: string): SopTopicRequirements {
  if (domain === 'device') return { topic, domain, ...DEVICE[topic](asOf) };
  const drug = DRUG[topic](asOf);
  return { topic, domain, ...(domain === 'biologic' ? biologicFrom(topic, drug) : drug) };
}

/** True when `topic` is one this record models. */
export function isSopTopic(topic: unknown): topic is SopTopic {
  return typeof topic === 'string' && (SOP_TOPICS as readonly string[]).includes(topic);
}

/** The QMSR effective date, re-exported for callers that explain the device citation. */
export { QMSR_EFFECTIVE };
