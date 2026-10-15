/**
 * Quality management system (ISO 13485 ↔ FDA QMSR/QSR) — the quality-system clause
 * structure, the FDA mapping, and a deterministic readiness assessment.
 *
 * WHY THIS EXISTS: a QMS is shared evidence across every device market (the global
 * strategy flags it), yet the platform modelled none of it. This catalogs the major
 * ISO 13485:2016 clauses with their FDA mapping and the questions an
 * auditor/reviewer asks.
 *
 * FDA MAPPING: every clause's QMSR basis, former QSR section and the transition
 * note come from the one crosswalk, shared/regulatory/qmsr-crosswalk.ts. The
 * QMSR is in force (currency fact `us-qmsr`), so `fdaMapping` is the citation
 * as of the effective date onward: the QMSR section first, the removed QSR
 * section only as "formerly". A historical date goes through `citeQms`.
 *
 * HONESTY: the expected clause set + audit questions, not an audit verdict.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/quality-system
 */

import {
  QMSR_EFFECTIVE,
  citeQms,
  qmsrRow,
  qmsrTransitionNote,
  type QmsrCrosswalkId,
} from '../../../shared/regulatory/qmsr-crosswalk.js';

export interface QmsClause {
  id: string;
  number: string;
  title: string;
  purpose: string;
  /** The FDA citation in force: the QMSR basis, then "formerly" the removed QSR section. */
  fdaMapping: string;
  /** The QMSR section and ISO 13485:2016 clause (from the crosswalk). */
  qmsrBasis: string;
  /** The removed QSR section(s) this clause replaced (from the crosswalk). */
  legacyQsr: string;
  required: boolean;
  reviewerQuestions: string[];
}

type ClauseDef = Omit<QmsClause, 'fdaMapping' | 'qmsrBasis' | 'legacyQsr'> & { id: QmsrCrosswalkId };

/** The FDA fields of a clause, read from its crosswalk row. */
function withFdaMapping(def: ClauseDef): QmsClause {
  const row = qmsrRow(def.id);
  if (!row) throw new Error(`quality-system: clause "${def.id}" has no QMSR crosswalk row`);
  return { ...def, fdaMapping: citeQms(def.id, QMSR_EFFECTIVE), qmsrBasis: row.qmsrBasis, legacyQsr: row.legacyQsr };
}

const CLAUSE_DEFS: ClauseDef[] = [
  {
    id: 'qms_general', number: '4', title: 'Quality Management System',
    purpose:
      'Establish, document, implement and maintain the QMS, including the quality manual, document control, records, the medical device file (ISO 13485:2016 §4.2.3) and the design and development files (§7.3.10). These are ISO clauses, not FDA terms: the QMSR does not use Device Master Record, Device History Record or Design History File.',
    required: true,
    reviewerQuestions: [
      'Is the QMS scope and any non-applicable clauses justified?',
      'Are documents and records controlled, with a defined retention period?',
    ],
  },
  {
    id: 'management', number: '5', title: 'Management Responsibility',
    purpose: 'Management commitment, quality policy and objectives, responsibilities/authorities, management representative, and management review.',
    required: true,
    reviewerQuestions: [
      'Are management reviews conducted at defined intervals with documented outputs/actions?',
      'Is a management representative appointed with defined authority?',
    ],
  },
  {
    id: 'resources', number: '6', title: 'Resource Management',
    purpose: 'Provision of resources, competence/training, infrastructure, and work environment / contamination control.',
    required: true,
    reviewerQuestions: [
      'Is personnel competence (training, education, experience) defined and recorded?',
      'Are environmental/contamination controls established where product quality requires it?',
    ],
  },
  {
    id: 'design_controls', number: '7.3', title: 'Design and Development (Design Controls)',
    purpose: 'Design planning, inputs, outputs, review, verification, validation, transfer, change control, and the design and development files (ISO 13485:2016 §7.3.10; the QSR called this the design history file).',
    required: true,
    reviewerQuestions: [
      'Are design inputs traceable to outputs, verification AND validation, and the risk file?',
      'Is design validation performed under actual or simulated use conditions, incl. usability?',
      'Are the design and development files (ISO 13485:2016 §7.3.10) complete and is design transfer controlled?',
    ],
  },
  {
    id: 'purchasing', number: '7.4', title: 'Purchasing',
    purpose: 'Supplier evaluation/control, purchasing information, and verification of purchased product.',
    required: true,
    reviewerQuestions: [
      'Are suppliers evaluated and controlled commensurate with the risk of the purchased product?',
    ],
  },
  {
    id: 'production', number: '7.5', title: 'Production and Service Provision',
    purpose: 'Controlled production, process validation, identification and traceability, and preservation of product (incl. sterile/implantable special requirements).',
    required: true,
    reviewerQuestions: [
      'Are special processes (e.g. sterilisation, welding) validated and revalidated?',
      'Is UDI-level identification and traceability implemented (for implantable/required devices)?',
    ],
  },
  {
    id: 'measuring_equipment', number: '7.6', title: 'Control of Monitoring and Measuring Equipment',
    purpose: 'Calibration/verification of measuring equipment and its records.',
    required: true,
    reviewerQuestions: ['Is measuring equipment calibrated/traceable with records and out-of-tolerance handling?'],
  },
  {
    id: 'feedback_complaints', number: '8.2', title: 'Monitoring & Measurement — Feedback, Complaints, Reporting',
    purpose: 'Feedback collection, complaint handling, and reporting to regulatory authorities (vigilance / MDR).',
    required: true,
    reviewerQuestions: [
      'Is every complaint evaluated for reportability (MDR / vigilance) within the required timeframe?',
      'Does post-market feedback flow back into risk management and the clinical/performance evaluation?',
    ],
  },
  {
    id: 'nonconforming', number: '8.3', title: 'Control of Nonconforming Product',
    purpose: 'Identify, segregate, and disposition nonconforming product; rework; advisory notices / recalls.',
    required: true,
    reviewerQuestions: ['Is nonconforming product controlled, and are advisory notices/recalls procedures defined?'],
  },
  {
    id: 'capa', number: '8.5.2', title: 'Corrective and Preventive Action (CAPA)',
    purpose: 'Investigate causes of nonconformities, take corrective/preventive action, and verify effectiveness.',
    required: true,
    reviewerQuestions: [
      'Are CAPA root-cause investigations documented and is effectiveness verified before closure?',
      'Do data sources (complaints, NCRs, audits, trends) feed the CAPA system?',
    ],
  },
];

/** The major ISO 13485:2016 clauses with FDA mapping. */
export const QMS_CLAUSES: QmsClause[] = CLAUSE_DEFS.map(withFdaMapping);

const BY_ID = new Map(QMS_CLAUSES.map((c) => [c.id, c]));

export function getQmsClause(id: string): QmsClause | undefined {
  return BY_ID.get(id);
}

export function qmsReviewerQuestions(): Array<{ clauseId: string; question: string }> {
  return QMS_CLAUSES.flatMap((c) => c.reviewerQuestions.map((q) => ({ clauseId: c.id, question: q })));
}

/** FDA QSR → QMSR transition note, from the crosswalk (shared/regulatory/qmsr-crosswalk.ts). */
export const FDA_QMSR_NOTE = qmsrTransitionNote();

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
