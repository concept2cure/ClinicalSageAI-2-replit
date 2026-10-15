/**
 * Client-side SOP generator (AnA capability).
 *
 * Produces a GxP-structured Standard Operating Procedure for a client process,
 * region-aware across FDA (US), EMA (EU), and PMDA (Japan). Deterministic: it
 * assembles the canonical SOP section skeleton (Purpose, Scope, Responsibilities,
 * Definitions, Procedure, References, Revision history, Approval), fills the
 * Procedure with a real starter workflow for known regulated processes, and
 * attaches the region-appropriate regulatory references. AnA renders/edits the
 * result; the client owns it.
 *
 * @module server/services/sop-generator
 */

import { SUBMISSION_FORMATS } from './global-ri/electronic-submission-format.js';
import { basisLabel } from '../../shared/regulatory/regulatory-basis.js';
import {
  sopRequirementsFor,
  type SopProductDomain,
  type SopTopic,
  type SopTopicRequirements,
} from '../../shared/regulatory/sop-requirements.js';

export type SopRegion = 'FDA' | 'EMA' | 'PMDA';

export type SopProcessType =
  | 'change_control'
  | 'document_control'
  | 'capa'
  | 'deviation_management'
  | 'ectd_publishing'
  | 'regulatory_submission'
  | 'pharmacovigilance_case'
  | 'training'
  | 'supplier_qualification'
  | 'internal_audit'
  | 'complaint_handling'
  | 'management_review'
  | 'generic';

/** 2026-10-08 (D2): the product the procedure governs. A device's quality system is the QMSR / ISO 13485, not 21 CFR 211. */
export type SopProductType = SopProductDomain;

export interface SopInput {
  /** SOP title, e.g. "Change Control for Manufacturing Processes". */
  title: string;
  /** Known regulated process — drives the starter Procedure steps. */
  processType?: SopProcessType;
  /** Regions the SOP must satisfy (default ['FDA']). */
  regions?: SopRegion[];
  /** Optional filing context (NDA/BLA/MAA/JNDA/IND/…) for the Scope. */
  filingType?: string;
  organization?: string;
  /** Document identifier, e.g. "SOP-QA-001". Generated if omitted. */
  documentId?: string;
  /** ISO date; defaults to today. */
  effectiveDate?: string;
  /** Role accountable for the SOP (e.g. "Head of Quality"). */
  ownerRole?: string;
  /** Extra scope sentence supplied by the client. */
  scopeNote?: string;
  /** The product the procedure governs (drug, biologic, device). Unstated, drug is assumed and the SOP says so. */
  productType?: SopProductType;
}

export interface SopSection {
  number: string;
  title: string;
  content: string;
}

export interface SopResult {
  documentId: string;
  title: string;
  version: string;
  effectiveDate: string;
  regions: SopRegion[];
  processType: SopProcessType;
  productType: SopProductType;
  sections: SopSection[];
  references: string[];
  markdown: string;
  methodology: string[];
}

// ── Region-specific regulatory references ──────────────────────────────────────

const REGION_REFERENCES: Record<SopRegion, string[]> = {
  FDA: [
    '21 CFR Part 11 — Electronic Records; Electronic Signatures',
    '21 CFR Part 210/211 — Current Good Manufacturing Practice',
    'FDA Guidance for Industry — Quality Systems Approach to Pharmaceutical CGMP Regulations (2006)',
  ],
  EMA: [
    'EudraLex Volume 4 — EU Guidelines for Good Manufacturing Practice',
    'EudraLex Volume 4 Annex 11 — Computerised Systems',
    'GVP Module I — Pharmacovigilance Systems and their Quality Systems',
  ],
  PMDA: [
    'MHLW Ministerial Ordinance No. 179 — GMP for Drugs',
    'J-GCP / GPSP Ordinances — Good Clinical / Post-marketing Study Practice',
    'Act on Securing Quality, Efficacy and Safety of Products including Pharmaceuticals (PMD Act)',
  ],
};

// Process-specific references appended on top of the region set.
const PROCESS_REFERENCES: Partial<Record<SopProcessType, Partial<Record<SopRegion, string[]>>>> = {
  change_control: {
    FDA: ['21 CFR 314.70 / 601.12 — Supplements and changes to an approved application', 'ICH Q12 — Lifecycle Management'],
    EMA: ['Commission Regulation (EC) No 1234/2008 — Variations', 'ICH Q12 — Lifecycle Management'],
    PMDA: ['Partial Change Application / Minor Change Notification (PMD Act)', 'ICH Q12 — Lifecycle Management'],
  },
  pharmacovigilance_case: {
    FDA: ['21 CFR 314.80 / 600.80 — Postmarketing reporting of adverse experiences'],
    EMA: ['GVP Module VI — Collection, management and submission of reports of suspected ADRs'],
    PMDA: ['GVP Ordinance — Adverse event reporting timelines (PMDA)'],
  },
  ectd_publishing: {
    FDA: ['FDA eCTD Technical Conformance Guide', 'ICH M8 — Electronic Common Technical Document'],
    EMA: ['EU Module 1 eCTD specification (eSubmission)', 'ICH M8 — eCTD'],
    PMDA: ['Japan eCTD / J-CTD notification', 'ICH M8 — eCTD'],
  },
  regulatory_submission: {
    FDA: ['FDA ESG (Electronic Submissions Gateway) user guide'],
    /* The one EMA channel wording (global-ri/electronic-submission-format.ts):
       eSubmission Gateway / Web Client, CESP for national procedures.
       2026-10-05 (D2 record, step g-channel-prose-and-us-ectd-format; finding
       42): this read 'EMA eSubmission Gateway / CESP', as if either served. */
    EMA: [`EMA ${SUBMISSION_FORMATS.EMA.gateway}`],
    PMDA: ['PMDA submission gateway / FD application'],
  },
};

// ── Starter procedures for known regulated processes ───────────────────────────

const PROCEDURES: Record<SopProcessType, string[]> = {
  change_control: [
    'Initiate a change request capturing the proposed change, rationale, and affected materials/processes/documents.',
    'Assess impact across quality attributes, validated state, registered details, and regulatory filings.',
    'Classify the change (e.g. major/moderate/minor) and determine the regulatory reporting category per the applicable region.',
    'Define required actions, validation/comparability studies, and acceptance criteria before implementation.',
    'Route for cross-functional review and approval (Quality, Regulatory, Manufacturing) with electronic signatures.',
    'Implement the change only after approval; execute the planned studies and update affected documents.',
    'File the corresponding regulatory submission/variation/notification where required before or after implementation per category.',
    'Close the change after verification of effectiveness; retain the record in the controlled archive.',
  ],
  document_control: [
    'Author the document using the approved template and unique identifier.',
    'Route the draft for technical and quality review with tracked changes.',
    'Approve via electronic signature; assign version and effective date.',
    'Release the approved version to the controlled repository and withdraw superseded versions.',
    'Train affected personnel before the effective date.',
    'Schedule periodic review; initiate change control for revisions.',
    'Archive obsolete versions for the required retention period.',
  ],
  capa: [
    'Document the problem statement with objective evidence and scope.',
    'Perform root-cause analysis using a structured method (e.g. 5-Whys, fishbone).',
    'Define corrective actions (address the existing nonconformity) and preventive actions (prevent recurrence).',
    'Assess risk and assign owners, due dates, and effectiveness criteria.',
    'Implement actions under change control where they affect validated/registered details.',
    'Verify effectiveness against the predefined criteria before closure.',
    'Trend CAPAs in the quality management review.',
  ],
  deviation_management: [
    'Record the deviation immediately with date, description, and immediate containment.',
    'Classify severity (critical/major/minor) and assess product/patient impact.',
    'Investigate root cause and document the rationale for the disposition.',
    'Determine impact on batches, validated state, and regulatory commitments.',
    'Raise CAPA where systemic; implement corrections under change control as needed.',
    'Approve the disposition (Quality) with electronic signature and close within the defined timeline.',
  ],
  ectd_publishing: [
    'Confirm the dossier content plan and the target region(s) and sequence type.',
    'Compile Module 1 in the region-specific structure (FDA / EU / PMDA) and the ICH-common Modules 2–5.',
    'Generate the eCTD backbone (index, leaf map, lifecycle operations) per ICH M8.',
    'Run technical validation against the region validation profile; resolve errors and warnings.',
    'Apply the cryptographic integrity hash and assemble the submission-ready bundle.',
    'Obtain QA review and approval of the published sequence before transmission.',
    'Archive the published sequence and its validation report.',
  ],
  regulatory_submission: [
    'Confirm the filing type and target region(s); verify the application is acceptance-ready (no Refuse-to-File triggers).',
    'Finalize and validate the published eCTD/CTD sequence.',
    'Authenticate to the region gateway (FDA ESG / EMA eSubmission / PMDA) with the registered account/certificate.',
    'Transmit the sequence and capture the gateway acknowledgement chain (receipt → technical → application).',
    'Reconcile acknowledgements; escalate and resubmit on rejection.',
    'Record the submission in the regulatory tracking system and notify stakeholders.',
  ],
  pharmacovigilance_case: [
    'Receive and date-stamp the adverse event report; assign a unique case identifier.',
    'Triage for seriousness, expectedness, and causality; determine the reporting clock start.',
    'Perform medical coding (MedDRA) and assess the case for completeness; request follow-up as needed.',
    'Author the case narrative and quality-review the assessment.',
    'Submit expedited reports within the region timelines (FDA 15-day / EMA / PMDA) via the applicable safety gateway.',
    'Track follow-up information and aggregate the case into periodic safety reports.',
  ],
  training: [
    'Identify the training requirement from the SOP/role matrix.',
    'Deliver the training and assess comprehension.',
    'Record completion with date and trainee/trainer signatures before the SOP effective date.',
    'Maintain the training record for inspection readiness.',
  ],
  supplier_qualification: [
    'Define the material/service criticality and qualification requirements.',
    'Evaluate the supplier (questionnaire, audit, sample testing) against acceptance criteria.',
    'Approve and add the supplier to the Approved Supplier List under change control.',
    'Establish a quality agreement and periodic re-qualification schedule.',
    'Monitor performance; trigger re-evaluation on quality events.',
  ],
  internal_audit: [
    'Plan the audit scope, criteria, and schedule from the audit program.',
    'Conduct the audit and record objective evidence of conformance and findings.',
    'Classify findings and issue the audit report to the auditee.',
    'Require CAPA for findings; verify corrective actions before closure.',
    'Feed audit results into management review.',
  ],
  complaint_handling: [
    'Receive and record each complaint, written or oral, with the date received and the product and lot or device identifier concerned.',
    'Evaluate whether the information is a complaint and whether it must be reported to the regulatory authority, and start the reporting clock.',
    'Investigate, or record why no investigation is needed and who decided.',
    'Handle the product concerned and decide whether a correction or corrective action is needed.',
    'Reply to the complainant where appropriate and close the record after Quality review.',
    'Trend complaints into management review.',
  ],
  management_review: [
    'Schedule the review at the defined interval and assemble the inputs.',
    'Review each input: complaints and feedback, regulatory reporting, audits and inspections, process and product monitoring, CAPA, changes, previous actions and new regulatory requirements.',
    'Decide the outputs: improvements, changes needed for regulatory requirements, and resource needs.',
    'Record the review, its decisions and owners; track the actions to closure.',
  ],
  generic: [
    'Define the trigger and inputs that start this procedure.',
    'Describe the step-by-step actions and the responsible role for each.',
    'Specify the records generated and where they are retained.',
    'Define the review/approval and any electronic-signature requirements.',
    'State the acceptance criteria and how completion is verified.',
  ],
};

const PROCESS_LABELS: Record<SopProcessType, string> = {
  change_control: 'Change Control',
  document_control: 'Document Control',
  capa: 'Corrective and Preventive Action (CAPA)',
  deviation_management: 'Deviation Management',
  ectd_publishing: 'eCTD Publishing',
  regulatory_submission: 'Regulatory Submission',
  pharmacovigilance_case: 'Pharmacovigilance Case Processing',
  training: 'Training',
  supplier_qualification: 'Supplier Qualification',
  internal_audit: 'Internal Audit',
  complaint_handling: 'Complaint Handling',
  management_review: 'Management Review',
  generic: 'Procedure',
};

function defaultDocId(processType: SopProcessType): string {
  const map: Partial<Record<SopProcessType, string>> = {
    change_control: 'SOP-QA-CC-001',
    document_control: 'SOP-QA-DC-001',
    capa: 'SOP-QA-CAPA-001',
    deviation_management: 'SOP-QA-DEV-001',
    ectd_publishing: 'SOP-RA-ECTD-001',
    regulatory_submission: 'SOP-RA-SUB-001',
    pharmacovigilance_case: 'SOP-PV-CASE-001',
    training: 'SOP-QA-TRN-001',
    supplier_qualification: 'SOP-QA-SUP-001',
    internal_audit: 'SOP-QA-AUD-001',
    complaint_handling: 'SOP-QA-CMP-001',
    management_review: 'SOP-QA-MR-001',
  };
  return map[processType] ?? 'SOP-001';
}

/** The quality-system topic a process maps to in the SOP requirements record, if any. */
const TOPIC_OF: Partial<Record<SopProcessType, SopTopic>> = {
  capa: 'capa',
  deviation_management: 'deviation',
  complaint_handling: 'complaint_handling',
  document_control: 'document_control',
  training: 'training',
  supplier_qualification: 'supplier_qualification',
  internal_audit: 'internal_audit',
  management_review: 'management_review',
  change_control: 'change_control',
};

/** The quality-system framework a device SOP answers to in each region (replaces drug CGMP for devices). */
const DEVICE_REGION_REFERENCES: Record<SopRegion, string[]> = {
  FDA: ['21 CFR Part 11 — Electronic Records; Electronic Signatures', '21 CFR Part 820 — Quality Management System Regulation (QMSR), incorporating ISO 13485:2016'],
  EMA: ['Regulation (EU) 2017/745 (MDR) Article 10(9) — manufacturer’s quality management system', 'EN ISO 13485:2016 — Medical devices — Quality management systems'],
  PMDA: ['MHLW Ministerial Ordinance No. 169 — QMS Ordinance for medical devices and IVDs', 'Act on Securing Quality, Efficacy and Safety of Products including Pharmaceuticals (PMD Act)'],
};

function buildReferences(
  regions: SopRegion[],
  processType: SopProcessType,
  productType: SopProductType,
  requirements: SopTopicRequirements | null,
): string[] {
  const refs: string[] = [];
  /* 2026-10-08 (D2): the clauses the procedure answers to, by product, first —
     a device SOP cited drug CGMP (21 CFR 210/211) and never the QMSR. */
  if (requirements && regions.includes('FDA')) refs.push(...requirements.governing.map(basisLabel));
  for (const region of regions) {
    refs.push(...(productType === 'device' ? DEVICE_REGION_REFERENCES[region] : REGION_REFERENCES[region]));
    if (productType === 'biologic' && region === 'FDA') refs.push('21 CFR Parts 600–680 — Biologics');
    const procRegion = PROCESS_REFERENCES[processType]?.[region];
    if (procRegion && !(productType === 'device' && /314\.70|601\.12/.test(procRegion.join(' ')))) refs.push(...procRegion);
  }
  // De-duplicate while preserving order.
  return [...new Set(refs)];
}

/** The SOP section that names, per requirement, the clause it answers and that clause's basis. */
function requirementsSection(req: SopTopicRequirements): string {
  const lines = req.elements.map((e) => `- ${e.requirement} — ${basisLabel(e.basis)}`);
  const notes = req.notes.map((n) => `- Note: ${n}`);
  return [
    `This procedure is written to address the following requirements for ${req.title.toLowerCase()} (${req.domain}). The procedure owner confirms each against the current regulation before approval.`,
    ...lines,
    ...notes,
  ].join('\n');
}

/** The product (drug unless stated), the clauses its topic answers to, and the references, as of the effective date. */
function resolveClauses(input: SopInput, processType: SopProcessType, regions: SopRegion[], asOf: string) {
  const productType: SopProductType = input.productType ?? 'drug';
  const topic = TOPIC_OF[processType];
  const requirements = topic ? sopRequirementsFor(topic, productType, asOf) : null;
  return { productType, requirements, references: buildReferences(regions, processType, productType, requirements) };
}

/** The SOP's header block. An unstated product type is named as assumed, never presented as given. */
function sopHeader(h: {
  title: string;
  documentId: string;
  effectiveDate: string;
  regionList: string;
  productType: SopProductType;
  stated: boolean;
}): string {
  const assumed = h.stated
    ? ''
    : ' (assumed: the product type was not given; state drug, biologic or device to cite the right quality system)';
  return (
    `# ${h.title}\n\n` +
    `**Document ID:** ${h.documentId}  \n` +
    `**Version:** 1.0  \n` +
    `**Effective date:** ${h.effectiveDate}  \n` +
    `**Applicable regions:** ${h.regionList}  \n` +
    `**Product type:** ${h.productType}${assumed}\n`
  );
}

export function generateSop(input: SopInput): SopResult {
  const processType: SopProcessType = input.processType ?? 'generic';
  const regions = input.regions && input.regions.length ? input.regions : (['FDA'] as SopRegion[]);
  const documentId = input.documentId ?? defaultDocId(processType);
  const effectiveDate = input.effectiveDate ?? new Date().toISOString().slice(0, 10);
  const org = input.organization ?? 'the organization';
  const ownerRole = input.ownerRole ?? 'Head of Quality';
  const { productType, requirements, references } = resolveClauses(input, processType, regions, effectiveDate);

  const regionList = regions.join(', ');
  const filingClause = input.filingType ? ` for ${input.filingType} filings` : '';

  const procedureSteps = PROCEDURES[processType];
  const procedureBody = procedureSteps.map((s, i) => `${i + 1}. ${s}`).join('\n');

  const sections: SopSection[] = [
    {
      number: '1',
      title: 'Purpose',
      content: `This SOP defines the process for ${PROCESS_LABELS[processType].toLowerCase()} at ${org}, to ensure compliance with the applicable regulatory requirements of ${regionList}${filingClause}.`,
    },
    {
      number: '2',
      title: 'Scope',
      content:
        `This procedure applies to all activities, personnel, and records associated with ${PROCESS_LABELS[processType].toLowerCase()} within ${org}` +
        (input.filingType ? `, including ${input.filingType} submissions to ${regionList}.` : `, across submissions to ${regionList}.`) +
        (input.scopeNote ? ` ${input.scopeNote}` : ''),
    },
    {
      number: '3',
      title: 'Responsibilities',
      content: [
        `- ${ownerRole}: owns this SOP and approves changes to it.`,
        '- Process owner: executes the procedure and maintains records.',
        '- Quality Assurance: reviews and approves outputs; ensures compliance.',
        '- Regulatory Affairs: confirms region-specific regulatory requirements are met.',
      ].join('\n'),
    },
    {
      number: '4',
      title: 'Definitions and abbreviations',
      content: [
        '- SOP: Standard Operating Procedure.',
        '- GxP: Good (Clinical/Laboratory/Manufacturing/Pharmacovigilance) Practice.',
        '- CAPA: Corrective and Preventive Action.',
        '- eCTD: electronic Common Technical Document.',
      ].join('\n'),
    },
    {
      number: '5',
      title: 'Procedure',
      content: procedureBody,
    },
    ...(requirements
      ? [{ number: '5a', title: 'Requirements this procedure addresses', content: requirementsSection(requirements) }]
      : []),
    {
      number: '6',
      title: 'Records',
      content:
        'All records generated by this procedure are retained in the controlled system for the required retention period, with audit trails preserved per 21 CFR Part 11 / EU Annex 11 where electronic.',
    },
    {
      number: '7',
      title: 'References',
      content: references.map((r) => `- ${r}`).join('\n'),
    },
    {
      number: '8',
      title: 'Revision history',
      content: ['| Version | Date | Description | Author |', '| --- | --- | --- | --- |', `| 1.0 | ${effectiveDate} | Initial issue | AnA (draft) |`].join('\n'),
    },
    {
      number: '9',
      title: 'Approval',
      content: ['| Role | Name | Signature | Date |', '| --- | --- | --- | --- |', `| ${ownerRole} (Owner) | | | |`, '| Quality Assurance | | | |', '| Regulatory Affairs | | | |'].join('\n'),
    },
  ];

  const header = sopHeader({ title: input.title, documentId, effectiveDate, regionList, productType, stated: !!input.productType });

  const markdown =
    header +
    '\n' +
    sections.map((s) => `## ${s.number}. ${s.title}\n\n${s.content}\n`).join('\n');

  return {
    documentId,
    title: input.title,
    version: '1.0',
    effectiveDate,
    regions,
    processType,
    productType,
    sections,
    references,
    markdown,
    methodology: [
      'SOP follows the canonical GxP section skeleton (Purpose, Scope, Responsibilities, Definitions, Procedure, Records, References, Revision history, Approval).',
      'Procedure steps are a starter workflow for the selected process type; the client tailors them.',
      'References are assembled per selected region(s) (FDA / EMA / PMDA) plus the process-specific regulations.',
      'For a quality-system process, the clauses the procedure answers to come from shared/regulatory/sop-requirements.ts, by product type, each labelled with its basis (regulator text, recall, or platform convention).',
    ],
  };
}
