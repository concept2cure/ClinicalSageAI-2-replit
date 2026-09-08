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
import { FILENAME_PATTERN } from './ectd/ectd-regional-rules';
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

// The eCTD file-name rule is FILENAME_PATTERN (ectd-regional-rules): lowercase
// a-z, 0-9, '.' and '-', at most 64 characters including the extension. A
// second, weaker pattern here allowed '_' and had no length bound, so a
// 200-character name "followed naming conventions".
const hasExtension = (name: string) => /\.[a-z0-9]+$/.test(name);

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

    // Adding a document invalidates any prior validation: the persisted
    // ectd_submission_validations rows covered the OLD document set and say
    // nothing about the one just added. Regress the submission out of
    // 'validated' (as well as 'draft') back to 'assembling' AND delete the stale
    // validation rows, so submitToGateway's gate — which blocks when there are
    // zero validation rows — forces a fresh validateSubmission over the current
    // document set. Without this, a document added after validate (e.g. one with
    // a non-conformant filename, no checksum, or a missing required module)
    // would sail through submit on a stale "0 errors" verdict that never
    // examined it.
    await pool.query(
      `UPDATE ectd_submissions
         SET status = CASE WHEN status IN ('draft','validated') THEN 'assembling' ELSE status END,
             updated_at = NOW()
       WHERE id = $1 AND org_id = $2`,
      [submissionId, orgId],
    );
    await pool.query(
      `DELETE FROM ectd_submission_validations WHERE submission_id = $1 AND org_id = $2`,
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
      const passed = FILENAME_PATTERN.test(doc.file_name) && hasExtension(doc.file_name);
      validations.push({
        ruleId: 'FILE_NAMING', ruleCategory: 'naming', severity: passed ? 'info' : 'error',
        message: passed
          ? `File "${doc.file_name}" follows the eCTD file-name rule`
          : `File "${doc.file_name}" breaks the eCTD file-name rule (lowercase a-z, 0-9, '.', '-'; at most 64 characters including the extension)`,
        sectionCode: doc.section_code, documentPath: doc.document_path,
        passed, fixSuggestion: passed ? null : 'Rename the file to lowercase letters, digits, hyphens and a single extension, at most 64 characters',
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

    // Rule 3: PDF/A status. The platform does not verify PDF/A here — the flag
    // is what the uploader declared. A null used to read as "status
    // acceptable"; an unassessed document is not an acceptable one.
    const pdfDocs = docs.filter((d: any) => d.document_type === 'pdf');
    for (const doc of pdfDocs) {
      const declared: boolean | null = doc.pdf_a_compliant === true ? true : doc.pdf_a_compliant === false ? false : null;
      const passed = declared === true;
      validations.push({
        ruleId: 'PDF_A_CHECK', ruleCategory: 'content', severity: passed ? 'info' : 'warning',
        message: declared === true
          ? `Document "${doc.file_name}" is declared PDF/A compliant by the uploader; not verified by the platform`
          : declared === false
            ? `Document "${doc.file_name}" is not PDF/A compliant`
            : `Document "${doc.file_name}" PDF/A status has not been verified`,
        sectionCode: doc.section_code, documentPath: doc.document_path,
        passed,
        fixSuggestion: passed ? null : declared === false
          ? 'Convert document to PDF/A format before submission'
          : 'Verify the document is PDF/A and record the result before submission',
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

    // ── THIS METHOD DOES NOT TRANSMIT ANYTHING ───────────────────────────────
    // There is no gateway client here: no AS2 handshake, no ESG connection, no
    // bytes leaving the process, no transmittal record, no acknowledgement. The
    // work above is validation-gating and nothing more.
    //
    // It previously wrote `status = 'submitted'` with a history row reading
    // "Submitted to agency gateway", and returned `{ status: 'submitted' }`. A
    // regulatory affairs lead reading that record — in the UI, in an export, or
    // during an inspection — would conclude the sequence had been filed. It had
    // not. That is a fabricated regulatory record, and the same defect already
    // found and closed in ESGSubmissionService and medicalDeviceService; this is
    // the third site.
    //
    // The record therefore stays at 'validated' — which is exactly what is true.
    //
    // 'validated' rather than a new 'ready_for_transmission': the status column
    // carries a CHECK constraint (db/migrations/082_ectd_submission_agent.sql:71)
    // listing draft/assembling/validated/submitted/acknowledged/under_review/
    // approved/rejected/withdrawn/amendment_required. Introducing a new value
    // needs a migration on the durable apply path, and inventing one to carry a
    // message would be schema churn for prose. It is also the more honest
    // outcome: pressing "submit" on a build that cannot submit SHOULD leave the
    // record where it was, so the queue of sequences genuinely awaiting filing
    // stays visible instead of silently emptying itself.
    //
    // The history row is where the operator's intent and our refusal are
    // recorded, so the attempt is auditable rather than invisible.
    await pool.query(
      `UPDATE ectd_submissions SET status = 'validated', updated_at = NOW()
       WHERE id = $1 AND org_id = $2`,
      [submissionId, orgId],
    );

    await pool.query(
      `INSERT INTO ectd_submission_status_history
        (submission_id, org_id, from_status, to_status, change_reason)
       VALUES ($1,$2,$3,'validated',
               'Transmission requested and validation passed. NOT transmitted: this build performs no agency gateway transmission, so the sequence remains awaiting filing.')`,
      [submissionId, orgId, prevStatus],
    );

    return {
      id: submissionId,
      status: 'validated',
      transmitted: false,
      submittedAt: null,
      message:
        'Validation passed. This sequence has NOT been transmitted to any agency gateway — ' +
        'this build performs no gateway transmission. It remains awaiting filing.',
    };
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
