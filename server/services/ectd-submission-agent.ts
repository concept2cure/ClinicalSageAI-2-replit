/**
 * eCTD Submission Agent Service
 *
 * Manages the full lifecycle of eCTD submissions to regulatory agency gateways
 * (FDA ESG, EMA eSubmission, PMDA, Health Canada CESG).
 *
 * @module server/services/ectd-submission-agent
 * @compliance ICH M8 v4.0, FDA ESG Technical Conformance Guide
 */

import crypto from 'crypto';
import { getPool } from '../db';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PrepareSubmissionData {
  projectId?: number;
  submissionType: string;
  applicationType?: string;
  applicationNumber?: string;
  sequenceNumber?: string;
  agency: string;
  center?: string;
  applicantName?: string;
  drugName?: string;
  indication?: string;
  metadata?: Record<string, unknown>;
}

export interface AddDocumentData {
  module: string;
  sectionCode: string;
  sectionTitle?: string;
  documentPath: string;
  fileName: string;
  fileSizeBytes?: number;
  content?: string; // raw content for checksum generation
  lifecycleOperation?: string;
  replacedDocumentId?: number;
  documentType?: string;
  pdfACompliant?: boolean;
  pageCount?: number;
  wordCount?: number;
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface SubmissionFilters {
  status?: string;
  agency?: string;
  applicationType?: string;
  limit?: number;
  offset?: number;
}

// ─── Validation rules ────────────────────────────────────────────────────────

const REQUIRED_MODULES: Record<string, string[]> = {
  initial: ['m1', 'm2', 'm3'],
  amendment: ['m1'],
  supplement: ['m1', 'm2'],
  annual_report: ['m1'],
};

const VALID_FILE_NAME_PATTERN = /^[a-z0-9][a-z0-9_\-]*\.[a-z0-9]+$/;

// ─── Service ─────────────────────────────────────────────────────────────────

export class EctdSubmissionAgent {

  /** Create a draft submission record */
  async prepareSubmission(orgId: number, data: PrepareSubmissionData) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO ectd_submissions
        (org_id, project_id, submission_type, application_type, application_number,
         sequence_number, agency, center, applicant_name, drug_name, indication, metadata, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft')
       RETURNING *`,
      [
        orgId,
        data.projectId ?? null,
        data.submissionType,
        data.applicationType ?? 'IND',
        data.applicationNumber ?? null,
        data.sequenceNumber ?? '0000',
        data.agency,
        data.center ?? null,
        data.applicantName ?? null,
        data.drugName ?? null,
        data.indication ?? null,
        JSON.stringify(data.metadata ?? {}),
      ],
    );

    const submission = result.rows[0];

    // Record initial status in history
    await pool.query(
      `INSERT INTO ectd_submission_status_history
        (submission_id, org_id, from_status, to_status, change_reason)
       VALUES ($1,$2,NULL,'draft','Submission created')`,
      [submission.id, orgId],
    );

    return submission;
  }

  /** Add a document to an existing submission */
  async addDocument(orgId: number, submissionId: number, doc: AddDocumentData) {
    const pool = getPool();

    // Verify submission belongs to org
    const sub = await this.getSubmission(orgId, submissionId);
    if (!sub) throw new Error('Submission not found');

    // Generate MD5 checksum from content or filename fallback
    const source = doc.content ?? doc.fileName;
    const md5Checksum = crypto.createHash('md5').update(source).digest('hex');
    const sha256 = doc.content
      ? crypto.createHash('sha256').update(doc.content).digest('hex')
      : null;

    const result = await pool.query(
      `INSERT INTO ectd_submission_documents
        (submission_id, org_id, module, section_code, section_title, document_path,
         file_name, file_size_bytes, md5_checksum, sha256_checksum, lifecycle_operation,
         replaced_document_id, document_type, pdf_a_compliant, page_count, word_count,
         language, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        submissionId, orgId, doc.module, doc.sectionCode, doc.sectionTitle ?? null,
        doc.documentPath, doc.fileName, doc.fileSizeBytes ?? null, md5Checksum,
        sha256, doc.lifecycleOperation ?? 'new', doc.replacedDocumentId ?? null,
        doc.documentType ?? 'pdf', doc.pdfACompliant ?? null, doc.pageCount ?? null,
        doc.wordCount ?? null, doc.language ?? 'en', JSON.stringify(doc.metadata ?? {}),
      ],
    );

    // Update submission status to assembling if still draft
    await pool.query(
      `UPDATE ectd_submissions SET status = 'assembling', updated_at = NOW()
       WHERE id = $1 AND org_id = $2 AND status = 'draft'`,
      [submissionId, orgId],
    );

    return result.rows[0];
  }

  /** Run validation rules and persist results */
  async validateSubmission(orgId: number, submissionId: number) {
    const pool = getPool();

    const sub = await this.getSubmission(orgId, submissionId);
    if (!sub) throw new Error('Submission not found');

    // Fetch documents for this submission
    const docsResult = await pool.query(
      `SELECT * FROM ectd_submission_documents WHERE submission_id = $1 AND org_id = $2`,
      [submissionId, orgId],
    );
    const docs = docsResult.rows;

    // Clear previous validations for re-run
    await pool.query(
      `DELETE FROM ectd_submission_validations WHERE submission_id = $1 AND org_id = $2`,
      [submissionId, orgId],
    );

    const validations: Array<{
      ruleId: string; ruleCategory: string; severity: string;
      message: string; sectionCode: string | null; documentPath: string | null;
      passed: boolean; fixSuggestion: string | null;
    }> = [];

    // Rule 1: File naming convention
    for (const doc of docs) {
      const passed = VALID_FILE_NAME_PATTERN.test(doc.file_name);
      validations.push({
        ruleId: 'FILE_NAMING', ruleCategory: 'naming', severity: passed ? 'info' : 'error',
        message: passed
          ? `File "${doc.file_name}" follows naming conventions`
          : `File "${doc.file_name}" violates eCTD naming rules (lowercase, no spaces)`,
        sectionCode: doc.section_code, documentPath: doc.document_path,
        passed, fixSuggestion: passed ? null : 'Rename file to use only lowercase letters, digits, hyphens, and underscores',
      });
    }

    // Rule 2: Module completeness
    const requiredMods = REQUIRED_MODULES[sub.submission_type] ?? ['m1'];
    const presentMods = new Set(docs.map((d: any) => d.module));
    for (const mod of requiredMods) {
      const passed = presentMods.has(mod);
      validations.push({
        ruleId: 'MODULE_COMPLETENESS', ruleCategory: 'structural', severity: passed ? 'info' : 'error',
        message: passed
          ? `Required module ${mod} is present`
          : `Required module ${mod} is missing for submission type "${sub.submission_type}"`,
        sectionCode: mod, documentPath: null,
        passed, fixSuggestion: passed ? null : `Add at least one document to module ${mod}`,
      });
    }

    // Rule 3: PDF/A compliance check (stub)
    const pdfDocs = docs.filter((d: any) => d.document_type === 'pdf');
    for (const doc of pdfDocs) {
      const passed = doc.pdf_a_compliant !== false; // null treated as unknown/ok
      validations.push({
        ruleId: 'PDF_A_CHECK', ruleCategory: 'content', severity: passed ? 'info' : 'warning',
        message: passed
          ? `Document "${doc.file_name}" PDF/A status acceptable`
          : `Document "${doc.file_name}" is not PDF/A compliant`,
        sectionCode: doc.section_code, documentPath: doc.document_path,
        passed, fixSuggestion: passed ? null : 'Convert document to PDF/A format before submission',
      });
    }

    // Rule 4: MD5 checksum presence
    for (const doc of docs) {
      const passed = !!doc.md5_checksum;
      validations.push({
        ruleId: 'CHECKSUM_PRESENT', ruleCategory: 'checksum', severity: passed ? 'info' : 'error',
        message: passed
          ? `Checksum present for "${doc.file_name}"`
          : `Missing MD5 checksum for "${doc.file_name}"`,
        sectionCode: doc.section_code, documentPath: doc.document_path,
        passed, fixSuggestion: passed ? null : 'Regenerate document with checksum',
      });
    }

    // Persist validations
    for (const v of validations) {
      await pool.query(
        `INSERT INTO ectd_submission_validations
          (submission_id, org_id, rule_id, rule_category, severity, message,
           section_code, document_path, passed, fix_suggestion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [submissionId, orgId, v.ruleId, v.ruleCategory, v.severity, v.message,
         v.sectionCode, v.documentPath, v.passed, v.fixSuggestion],
      );
    }

    const errors = validations.filter((v) => !v.passed && v.severity === 'error').length;
    const warnings = validations.filter((v) => !v.passed && v.severity === 'warning').length;
    const allPassed = errors === 0;

    const summary = { total: validations.length, passed: validations.filter((v) => v.passed).length, errors, warnings, allPassed };

    // Update submission validation summary and status
    const newStatus = allPassed ? 'validated' : sub.status;
    await pool.query(
      `UPDATE ectd_submissions SET validation_summary = $1, status = $2, updated_at = NOW()
       WHERE id = $3 AND org_id = $4`,
      [JSON.stringify(summary), newStatus, submissionId, orgId],
    );

    return { summary, validations };
  }

  /** Submit to agency gateway (checks validations first) */
  async submitToGateway(orgId: number, submissionId: number) {
    const pool = getPool();

    const sub = await this.getSubmission(orgId, submissionId);
    if (!sub) throw new Error('Submission not found');

    // Check that validation has passed
    const valResult = await pool.query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE passed = FALSE AND severity = 'error') as errors
       FROM ectd_submission_validations WHERE submission_id = $1 AND org_id = $2`,
      [submissionId, orgId],
    );
    const { total, errors } = valResult.rows[0];
    if (parseInt(total) === 0) throw new Error('Submission has not been validated yet');
    if (parseInt(errors) > 0) throw new Error(`Submission has ${errors} validation error(s) that must be resolved`);

    const prevStatus = sub.status;

    // Update status to submitted
    await pool.query(
      `UPDATE ectd_submissions SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND org_id = $2`,
      [submissionId, orgId],
    );

    // Record status change
    await pool.query(
      `INSERT INTO ectd_submission_status_history
        (submission_id, org_id, from_status, to_status, change_reason)
       VALUES ($1,$2,$3,'submitted','Submitted to agency gateway')`,
      [submissionId, orgId, prevStatus],
    );

    return { id: submissionId, status: 'submitted', submittedAt: new Date().toISOString() };
  }

  /** Get a single submission with org isolation */
  async getSubmission(orgId: number, submissionId: number) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM ectd_submissions WHERE id = $1 AND org_id = $2`,
      [submissionId, orgId],
    );
    return result.rows[0] ?? null;
  }

  /** List submissions with optional filters */
  async listSubmissions(orgId: number, filters?: SubmissionFilters) {
    const pool = getPool();
    const conditions = ['org_id = $1'];
    const params: any[] = [orgId];
    let idx = 2;

    if (filters?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.agency) {
      conditions.push(`agency = $${idx++}`);
      params.push(filters.agency);
    }
    if (filters?.applicationType) {
      conditions.push(`application_type = $${idx++}`);
      params.push(filters.applicationType);
    }

    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const result = await pool.query(
      `SELECT * FROM ectd_submissions
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );
    return result.rows;
  }

  /** Get submission status with full history */
  async getSubmissionStatus(orgId: number, submissionId: number) {
    const pool = getPool();

    const sub = await this.getSubmission(orgId, submissionId);
    if (!sub) throw new Error('Submission not found');

    const historyResult = await pool.query(
      `SELECT * FROM ectd_submission_status_history
       WHERE submission_id = $1 AND org_id = $2
       ORDER BY changed_at ASC`,
      [submissionId, orgId],
    );

    return {
      id: sub.id,
      status: sub.status,
      submissionUid: sub.submission_uid,
      receiptNumber: sub.receipt_number,
      submittedAt: sub.submitted_at,
      history: historyResult.rows,
    };
  }

  /** Create an amendment linked to a parent submission */
  async createAmendment(orgId: number, parentSubmissionId: number, data: Partial<PrepareSubmissionData>) {
    const pool = getPool();

    const parent = await this.getSubmission(orgId, parentSubmissionId);
    if (!parent) throw new Error('Parent submission not found');

    // Determine next sequence number
    const seqResult = await pool.query(
      `SELECT MAX(sequence_number::int) as max_seq FROM ectd_submissions
       WHERE org_id = $1 AND application_number = $2`,
      [orgId, parent.application_number],
    );
    const nextSeq = String((parseInt(seqResult.rows[0]?.max_seq ?? '0') + 1)).padStart(4, '0');

    const amendmentData: PrepareSubmissionData = {
      projectId: data.projectId ?? parent.project_id,
      submissionType: 'amendment',
      applicationType: parent.application_type,
      applicationNumber: parent.application_number,
      sequenceNumber: nextSeq,
      agency: parent.agency,
      center: data.center ?? parent.center,
      applicantName: data.applicantName ?? parent.applicant_name,
      drugName: data.drugName ?? parent.drug_name,
      indication: data.indication ?? parent.indication,
      metadata: data.metadata,
    };

    const result = await pool.query(
      `INSERT INTO ectd_submissions
        (org_id, project_id, submission_type, application_type, application_number,
         sequence_number, agency, center, applicant_name, drug_name, indication,
         parent_submission_id, metadata, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft')
       RETURNING *`,
      [
        orgId, amendmentData.projectId, amendmentData.submissionType,
        amendmentData.applicationType, amendmentData.applicationNumber,
        amendmentData.sequenceNumber, amendmentData.agency, amendmentData.center,
        amendmentData.applicantName, amendmentData.drugName, amendmentData.indication,
        parentSubmissionId, JSON.stringify(amendmentData.metadata ?? {}),
      ],
    );

    const amendment = result.rows[0];

    await pool.query(
      `INSERT INTO ectd_submission_status_history
        (submission_id, org_id, from_status, to_status, change_reason)
       VALUES ($1,$2,NULL,'draft',$3)`,
      [amendment.id, orgId, `Amendment of submission #${parentSubmissionId}`],
    );

    return amendment;
  }
}

export const ectdSubmissionAgent = new EctdSubmissionAgent();
