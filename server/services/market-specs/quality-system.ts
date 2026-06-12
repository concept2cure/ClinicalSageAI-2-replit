/**
 * Quality management system (ISO 13485 ↔ FDA QMSR/QSR) — the quality-system clause
 * structure, the FDA mapping, and a deterministic readiness assessment.
 *
 * WHY THIS EXISTS: a QMS is shared evidence across every device market (the global
 * strategy flags it), yet the platform modelled none of it. This catalogs the major
 * ISO 13485:2016 clauses with their FDA mapping — 21 CFR 820 (QSR) until 2026-02-02,
 * then the QMSR, which incorporates ISO 13485:2016 by reference + FDA-specific
 * additions — and the questions an auditor/reviewer asks.
 *
 * HONESTY: reflects the ISO 13485:2016 clause structure and the FDA QSR→QMSR
 * transition. The expected clause set + audit questions, not an audit verdict.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/quality-system
 */

export interface QmsClause {
  id: string;
  number: string;
  title: string;
  purpose: string;
  /** Corresponding FDA requirement (21 CFR 820 reference / QMSR note). */
  fdaMapping: string;
  required: boolean;
  reviewerQuestions: string[];
}

/** The major ISO 13485:2016 clauses with FDA mapping. */
export const QMS_CLAUSES: QmsClause[] = [
  {
    id: 'qms_general', number: '4', title: 'Quality Management System',
    purpose: 'Establish, document, implement and maintain the QMS, including the quality manual, document control and records (incl. a Medical Device File / DMR equivalent).',
    fdaMapping: '21 CFR 820.20/820.40/820.181 (QSR); QMSR retains the Device Master Record concept.',
    required: true,
    reviewerQuestions: [
      'Is the QMS scope and any non-applicable clauses justified?',
      'Are documents and records controlled, with a defined retention period?',
    ],
  },
  {
    id: 'management', number: '5', title: 'Management Responsibility',
    purpose: 'Management commitment, quality policy and objectives, responsibilities/authorities, management representative, and management review.',
    fdaMapping: '21 CFR 820.20 (management responsibility, management review).',
    required: true,
    reviewerQuestions: [
      'Are management reviews conducted at defined intervals with documented outputs/actions?',
      'Is a management representative appointed with defined authority?',
    ],
  },
  {
    id: 'resources', number: '6', title: 'Resource Management',
    purpose: 'Provision of resources, competence/training, infrastructure, and work environment / contamination control.',
    fdaMapping: '21 CFR 820.25 (personnel), 820.70 (environment).',
    required: true,
    reviewerQuestions: [
      'Is personnel competence (training, education, experience) defined and recorded?',
      'Are environmental/contamination controls established where product quality requires it?',
    ],
  },
  {
    id: 'design_controls', number: '7.3', title: 'Design and Development (Design Controls)',
    purpose: 'Design planning, inputs, outputs, review, verification, validation, transfer, change control, and the design history file (DHF).',
    fdaMapping: '21 CFR 820.30 (design controls) — a frequent inspection focus.',
    required: true,
    reviewerQuestions: [
      'Are design inputs traceable to outputs, verification AND validation, and the risk file?',
      'Is design validation performed under actual or simulated use conditions, incl. usability?',
      'Is the design history file complete and is design transfer controlled?',
    ],
  },
  {
    id: 'purchasing', number: '7.4', title: 'Purchasing',
    purpose: 'Supplier evaluation/control, purchasing information, and verification of purchased product.',
    fdaMapping: '21 CFR 820.50 (purchasing controls).',
    required: true,
    reviewerQuestions: [
      'Are suppliers evaluated and controlled commensurate with the risk of the purchased product?',
    ],
  },
  {
    id: 'production', number: '7.5', title: 'Production and Service Provision',
    purpose: 'Controlled production, process validation, identification and traceability, and preservation of product (incl. sterile/implantable special requirements).',
    fdaMapping: '21 CFR 820.70/820.75 (production + process validation), 820.60/820.65 (identification/traceability).',
    required: true,
    reviewerQuestions: [
      'Are special processes (e.g. sterilisation, welding) validated and revalidated?',
      'Is UDI-level identification and traceability implemented (for implantable/required devices)?',
    ],
  },
  {
    id: 'measuring_equipment', number: '7.6', title: 'Control of Monitoring and Measuring Equipment',
    purpose: 'Calibration/verification of measuring equipment and its records.',
    fdaMapping: '21 CFR 820.72 (inspection, measuring, and test equipment).',
    required: true,
    reviewerQuestions: ['Is measuring equipment calibrated/traceable with records and out-of-tolerance handling?'],
  },
  {
    id: 'feedback_complaints', number: '8.2', title: 'Monitoring & Measurement — Feedback, Complaints, Reporting',
    purpose: 'Feedback collection, complaint handling, and reporting to regulatory authorities (vigilance / MDR).',
    fdaMapping: '21 CFR 820.198 (complaint files), 803 (MDR reporting); QMSR strengthens complaint linkage.',
    required: true,
    reviewerQuestions: [
      'Is every complaint evaluated for reportability (MDR / vigilance) within the required timeframe?',
      'Does post-market feedback flow back into risk management and the clinical/performance evaluation?',
    ],
  },
  {
    id: 'nonconforming', number: '8.3', title: 'Control of Nonconforming Product',
    purpose: 'Identify, segregate, and disposition nonconforming product; rework; advisory notices / recalls.',
    fdaMapping: '21 CFR 820.90 (nonconforming product).',
    required: true,
    reviewerQuestions: ['Is nonconforming product controlled, and are advisory notices/recalls procedures defined?'],
  },
  {
    id: 'capa', number: '8.5.2', title: 'Corrective and Preventive Action (CAPA)',
    purpose: 'Investigate causes of nonconformities, take corrective/preventive action, and verify effectiveness.',
    fdaMapping: '21 CFR 820.100 (CAPA) — the most-cited inspection finding.',
    required: true,
    reviewerQuestions: [
      'Are CAPA root-cause investigations documented and is effectiveness verified before closure?',
      'Do data sources (complaints, NCRs, audits, trends) feed the CAPA system?',
    ],
  },
];

const BY_ID = new Map(QMS_CLAUSES.map((c) => [c.id, c]));

export function getQmsClause(id: string): QmsClause | undefined {
  return BY_ID.get(id);
}

export function qmsReviewerQuestions(): Array<{ clauseId: string; question: string }> {
  return QMS_CLAUSES.flatMap((c) => c.reviewerQuestions.map((q) => ({ clauseId: c.id, question: q })));
}

/** FDA QSR → QMSR transition note (the QMSR is effective 2026-02-02). */
export const FDA_QMSR_NOTE =
  'FDA QMSR (final rule amending 21 CFR Part 820) is effective 2026-02-02 and incorporates ISO 13485:2016 by reference with FDA-specific additions (e.g. labelling/packaging, UDI, complaint and servicing records, definitions). Before that date, 21 CFR 820 (QSR) applies.';

export interface QmsAssessment {
  ready: boolean;
  missingRequiredClauses: string[];
  presentCount: number;
  totalRequired: number;
  fdaNote: string;
}

/** Assess QMS readiness against the major clauses. */
export function assessQmsReadiness(presentClauseIds: string[]): QmsAssessment {
  const present = new Set(presentClauseIds);
  const required = QMS_CLAUSES.filter((c) => c.required);
  const missingRequiredClauses = required.filter((c) => !present.has(c.id)).map((c) => c.id);
  return {
    ready: missingRequiredClauses.length === 0,
    missingRequiredClauses,
    presentCount: required.length - missingRequiredClauses.length,
    totalRequired: required.length,
    fdaNote: FDA_QMSR_NOTE,
  };
}

export default { QMS_CLAUSES, getQmsClause, qmsReviewerQuestions, assessQmsReadiness, FDA_QMSR_NOTE };
