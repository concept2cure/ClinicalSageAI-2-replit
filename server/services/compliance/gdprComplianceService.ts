/**
 * GDPR Compliance Service
 *
 * Implements the core requirements of the EU General Data Protection Regulation
 * (Regulation 2016/679) for the Concept2Cure.RI platform, covering:
 * (Regulation 2016/679) for the Concept2Cure platform, covering:
 *
 * - Records of Processing Activities (Article 30)
 * - Data Protection Impact Assessments (Article 35)
 * - Consent Management (Articles 6-7)
 * - Data Subject Rights (Articles 15-22)
 * - Cross-Border Transfer Assessments (Articles 44-49)
 * - Breach Notification (Articles 33-34)
 */

import { pool } from '../../db';

import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('gdprComplianceService');

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

/** Lawful bases for processing under GDPR Article 6(1) */
export type LawfulBasis =
  | 'consent'
  | 'contract'
  | 'legal_obligation'
  | 'vital_interest'
  | 'public_task'
  | 'legitimate_interest';

/**
 * Records of Processing Activities — GDPR Article 30
 *
 * Each controller (and processor) must maintain a record of processing
 * activities under its responsibility.
 */
export interface ProcessingActivity {
  id: string;
  name: string;
  purpose: string;
  lawfulBasis: LawfulBasis;
  dataCategories: string[];
  dataSubjectCategories: string[];
  recipients: string[];
  thirdCountryTransfers: string[];
  retentionPeriod: string;
  technicalMeasures: string[];
  organizationalMeasures: string[];
  dpiaConducted: boolean;
  dpaContactInfo: string;
  createdAt: Date;
  updatedAt: Date;
  organizationId: string;
}

/**
 * Data Protection Impact Assessment — GDPR Article 35
 *
 * Required where processing is likely to result in a high risk to the rights
 * and freedoms of natural persons.
 */
export interface DPIA {
  id: string;
  processingActivityId: string;
  description: string;
  necessityAssessment: string;
  riskAssessment: {
    likelihood: string;
    impact: string;
    mitigations: string[];
  };
  dpoOpinion: string;
  supervisoryAuthorityConsulted: boolean;
  status: 'draft' | 'in_review' | 'approved' | 'requires_changes';
  approvedBy: string | null;
  approvedAt: Date | null;
  organizationId: string;
}

/**
 * Consent Record — GDPR Articles 6-7
 *
 * The controller must be able to demonstrate that the data subject has
 * consented to processing. Consent must be freely given, specific, informed,
 * and unambiguous.
 */
export interface ConsentRecord {
  id: string;
  dataSubjectId: string;
  purpose: string;
  consentGiven: boolean;
  consentMethod: string;
  consentTimestamp: Date;
  withdrawalTimestamp: Date | null;
  lawfulBasis: LawfulBasis;
  organizationId: string;
}

/**
 * Data Subject Request — GDPR Articles 15-22
 *
 * Data subjects have the right to access, rectification, erasure ("right to
 * be forgotten"), restriction of processing, data portability, and objection.
 * Controllers must respond within one calendar month.
 */
export interface DataSubjectRequest {
  id: string;
  dataSubjectId: string;
  requestType: 'access' | 'rectification' | 'erasure' | 'restriction' | 'portability' | 'objection';
  status: 'received' | 'in_progress' | 'completed' | 'denied';
  receivedAt: Date;
  responseDeadline: Date;
  completedAt: Date | null;
  responseDetails: string | null;
  /** What was actually carried out. NULL on rows completed before this existed. */
  executionEvidence: DataSubjectRequestExecution | null;
  organizationId: string;
}

/**
 * The work performed to satisfy a data subject request.
 *
 * `completeDataSubjectRequest` used to take free text and nothing else. For an
 * erasure that made "completed" a claim under GDPR Art. 17 that personal data
 * is gone, while Art. 5(2) requires the controller to be able to DEMONSTRATE
 * it — and prose cannot be checked. This structure can.
 *
 * `scopes` carries the distinction that free text collapses: a subject who
 * genuinely holds no data yields `rows: 0` across the scopes that were
 * SEARCHED, which is a true and defensible outcome, whereas an empty `scopes`
 * list means nothing was searched at all. Those are the same sentence in prose
 * and different facts in an inspection, so an empty list is refused.
 */
export interface DataSubjectRequestExecution {
  action: 'erased' | 'exported' | 'rectified' | 'restricted' | 'decision_recorded';
  /** Every store searched, with the number of rows affected in each. */
  scopes: Array<{ scope: string; rows: number }>;
  /** The operator or job that carried it out. */
  performedBy: string;
  performedAt?: Date;
}

/**
 * The action that has to have been performed for each kind of request. A
 * request is not satisfied by an action aimed at a different right — recording
 * an export against an erasure would leave the data in place while the row
 * reads "completed".
 */
const REQUIRED_ACTION: Record<
  DataSubjectRequest['requestType'],
  DataSubjectRequestExecution['action']
> = {
  erasure: 'erased',
  access: 'exported',
  portability: 'exported',
  rectification: 'rectified',
  restriction: 'restricted',
  objection: 'decision_recorded',
};

/**
 * Cross-Border Transfer Assessment — GDPR Articles 44-49
 *
 * Transfers of personal data to third countries or international organisations
 * require appropriate safeguards.
 */
export interface TransferAssessment {
  id: string;
  sourceRegion: string;
  destinationRegion: string;
  transferMechanism: 'adequacy_decision' | 'sccs' | 'bcrs' | 'derogation' | 'explicit_consent';
  legalBasis: string;
  riskLevel: string;
  tiaCompleted: boolean;
  supplementaryMeasures: string[];
  organizationId: string;
}

/**
 * Data Breach record — GDPR Articles 33-34
 *
 * Personal data breaches must be reported to the supervisory authority within
 * 72 hours of becoming aware, and to data subjects without undue delay where
 * the breach is likely to result in a high risk.
 */
export interface DataBreach {
  id: string;
  description: string;
  dataAffected: string;
  subjectsAffected: number;
  detectedAt: Date;
  reportedToAuthorityAt: Date | null;
  reportedToSubjectsAt: Date | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  withinNotificationWindow: boolean;
  remediationSteps: string[];
  organizationId: string;
}

// ---------------------------------------------------------------------------
// Table-creation helpers (idempotent)
// ---------------------------------------------------------------------------

/**
 * The six tables this service reads and writes. Owned by
 * db/migrations/20260317_global_regulatory_compliance.sql — which creates
 * exactly this set — NOT by this module.
 */
const GDPR_TABLES = [
  'gdpr_processing_activities',
  'gdpr_dpias',
  'gdpr_consent_records',
  'gdpr_data_subject_requests',
  'gdpr_transfer_assessments',
  'gdpr_data_breaches',
] as const;

/**
 * Assert the GDPR tables are present. Verifies; it does not provision.
 *
 * ── Why this no longer runs DDL ─────────────────────────────────────────────
 * It used to execute `CREATE TABLE IF NOT EXISTS` for all six tables before
 * every operation, "so the service is safe to import without requiring
 * migrations to have run first". Under the production runtime role that is not
 * safe — it is fatal. PostgreSQL checks CREATE on the schema BEFORE the
 * IF NOT EXISTS short-circuit, so the statement is refused even when the table
 * already exists:
 *
 *   app_service=> CREATE TABLE IF NOT EXISTS gdpr_data_subject_requests (id uuid);
 *   ERROR:  permission denied for schema public
 *
 * Verified against a provisioned database as the non-superuser app_service role
 * (has_schema_privilege(current_user,'public','CREATE') = false). And the old
 * helper re-raised, so all fourteen exported functions — every one of which
 * awaits it first — would have thrown on their first call in production.
 *
 * The DDL was redundant as well as fatal:
 * db/migrations/20260317_global_regulatory_compliance.sql creates exactly these
 * six tables, and they are present on a provisioned schema.
 *
 * The check is cached after the first success: this runs before every
 * operation, and a per-call round trip to the catalog for a fact that cannot
 * change within a process is waste.
 */
let tablesVerified = false;

async function ensureTables(): Promise<void> {
  if (tablesVerified) return;
  const { rows } = await pool.query(
    `SELECT t.name FROM unnest($1::text[]) AS t(name)
      WHERE to_regclass('public.' || t.name) IS NULL`,
    [GDPR_TABLES as unknown as string[]],
  );
  if (rows.length > 0) {
    const missing = rows.map((r: { name: string }) => r.name).join(', ');
    throw new Error(
      `GDPR compliance tables missing: ${missing}. They are created by ` +
        'db/migrations/20260317_global_regulatory_compliance.sql; apply the ' +
        'migration set (npm run db:migrate:deploy).',
    );
  }
  tablesVerified = true;
}

// ---------------------------------------------------------------------------
// 1. Records of Processing Activities (Article 30)
// ---------------------------------------------------------------------------

/**
 * Create a new Record of Processing Activity.
 *
 * @see GDPR Article 30 — Records of processing activities
 * @param activity - The processing activity data (id, createdAt, updatedAt are generated)
 * @returns The created ProcessingActivity
 */
export async function createProcessingActivity(
  activity: Omit<ProcessingActivity, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ProcessingActivity> {
  try {
    await ensureTables();

    const result = await pool.query(
      `INSERT INTO gdpr_processing_activities
        (name, purpose, lawful_basis, data_categories, data_subject_categories,
         recipients, third_country_transfers, retention_period,
         technical_measures, organizational_measures, dpia_conducted,
         dpa_contact_info, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        activity.name,
        activity.purpose,
        activity.lawfulBasis,
        JSON.stringify(activity.dataCategories),
        JSON.stringify(activity.dataSubjectCategories),
        JSON.stringify(activity.recipients),
        JSON.stringify(activity.thirdCountryTransfers),
        activity.retentionPeriod,
        JSON.stringify(activity.technicalMeasures),
        JSON.stringify(activity.organizationalMeasures),
        activity.dpiaConducted,
        activity.dpaContactInfo,
        activity.organizationId,
      ]
    );

    return mapProcessingActivityRow(result.rows[0]);
  } catch (error) {
    logger.error('createProcessingActivity failed', { err: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Retrieve all Records of Processing Activities for an organisation.
 *
 * @see GDPR Article 30(1) — Each controller shall maintain a record
 * @param organizationId - The organisation whose records to retrieve
 * @returns Array of ProcessingActivity records
 */
export async function getProcessingActivities(
  organizationId: string
): Promise<ProcessingActivity[]> {
  try {
    await ensureTables();

    const result = await pool.query(
      `SELECT * FROM gdpr_processing_activities
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [organizationId]
    );

    return result.rows.map(mapProcessingActivityRow);
  } catch (error) {
    logger.error('getProcessingActivities failed', { err: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Update an existing Record of Processing Activity.
 *
 * @see GDPR Article 30 — Records of processing activities
 * @param id - The ID of the processing activity to update
 * @param updates - Partial fields to update
 * @returns The updated ProcessingActivity
 */
export async function updateProcessingActivity(
  id: string,
  updates: Partial<Omit<ProcessingActivity, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<ProcessingActivity> {
  try {
    await ensureTables();

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const columnMap: Record<string, string> = {
      name: 'name',
      purpose: 'purpose',
      lawfulBasis: 'lawful_basis',
      dataCategories: 'data_categories',
      dataSubjectCategories: 'data_subject_categories',
      recipients: 'recipients',
      thirdCountryTransfers: 'third_country_transfers',
      retentionPeriod: 'retention_period',
      technicalMeasures: 'technical_measures',
      organizationalMeasures: 'organizational_measures',
      dpiaConducted: 'dpia_conducted',
      dpaContactInfo: 'dpa_contact_info',
      organizationId: 'organization_id',
    };

    const jsonFields = new Set([
      'dataCategories',
      'dataSubjectCategories',
      'recipients',
      'thirdCountryTransfers',
      'technicalMeasures',
      'organizationalMeasures',
    ]);

    for (const [key, value] of Object.entries(updates)) {
      const column = columnMap[key];
      if (!column) continue;
      setClauses.push(`${column} = $${paramIndex}`);
      values.push(jsonFields.has(key) ? JSON.stringify(value) : value);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields provided for update');
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE gdpr_processing_activities
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error(`Processing activity ${id} not found`);
    }

    return mapProcessingActivityRow(result.rows[0]);
  } catch (error) {
    logger.error('updateProcessingActivity failed', { err: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 2. Data Protection Impact Assessment (Article 35)
// ---------------------------------------------------------------------------

/**
 * Create a new Data Protection Impact Assessment.
 *
 * @see GDPR Article 35 — Data protection impact assessment
 * @param dpia - The DPIA data (id is generated)
 * @returns The created DPIA
 */
export async function createDPIA(
  dpia: Omit<DPIA, 'id' | 'approvedAt' | 'approvedBy'> & {
    approvedBy?: string | null;
    approvedAt?: Date | null;
  }
): Promise<DPIA> {
  try {
    await ensureTables();

    const result = await pool.query(
      `INSERT INTO gdpr_dpias
        (processing_activity_id, description, necessity_assessment,
         risk_assessment, dpo_opinion, supervisory_authority_consulted,
         status, approved_by, approved_at, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        dpia.processingActivityId,
        dpia.description,
        dpia.necessityAssessment,
        JSON.stringify(dpia.riskAssessment),
        dpia.dpoOpinion,
        dpia.supervisoryAuthorityConsulted,
        dpia.status,
        dpia.approvedBy ?? null,
        dpia.approvedAt ?? null,
        dpia.organizationId,
      ]
    );

    return mapDPIARow(result.rows[0]);
  } catch (error) {
    logger.error('createDPIA failed', { err: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Retrieve all DPIAs linked to a specific processing activity.
 *
 * @see GDPR Article 35(7) — Assessment shall contain at minimum…
 * @param activityId - The processing activity ID
 * @returns Array of DPIA records
 */
export async function getDPIAsForActivity(activityId: string): Promise<DPIA[]> {
  try {
    await ensureTables();

    const result = await pool.query(
      `SELECT * FROM gdpr_dpias
       WHERE processing_activity_id = $1
       ORDER BY id DESC`,
      [activityId]
    );

    return result.rows.map(mapDPIARow);
  } catch (error) {
    logger.error('getDPIAsForActivity failed', { err: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 3. Consent Management (Articles 6-7)
// ---------------------------------------------------------------------------

/**
 * Record a consent decision from a data subject.
 *
 * @see GDPR Article 7(1) — Controller must demonstrate consent
 * @param consent - The consent record data (id and consentTimestamp are generated)
 * @returns The created ConsentRecord
 */
export async function recordConsent(
  consent: Omit<ConsentRecord, 'id' | 'consentTimestamp' | 'withdrawalTimestamp'>
): Promise<ConsentRecord> {
  try {
    await ensureTables();

    const result = await pool.query(
      `INSERT INTO gdpr_consent_records
        (data_subject_id, purpose, consent_given, consent_method,
         lawful_basis, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        consent.dataSubjectId,
        consent.purpose,
        consent.consentGiven,
        consent.consentMethod,
        consent.lawfulBasis,
        consent.organizationId,
      ]
    );

    return mapConsentRow(result.rows[0]);
  } catch (error) {
    logger.error('recordConsent failed', { err: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Withdraw consent for a data subject and purpose.
 *
 * @see GDPR Article 7(3) — The data subject shall have the right to withdraw
 *   consent at any time. It shall be as easy to withdraw as to give consent.
 * @param dataSubjectId - The data subject whose consent to withdraw
 * @param purpose - The specific processing purpose
 * @returns The updated ConsentRecord
 */
export async function withdrawConsent(
  dataSubjectId: string,
  purpose: string
): Promise<ConsentRecord> {
  try {
    await ensureTables();

    const result = await pool.query(
      `UPDATE gdpr_consent_records
       SET consent_given = FALSE,
           withdrawal_timestamp = NOW()
       WHERE data_subject_id = $1
         AND purpose = $2
         AND consent_given = TRUE
         AND withdrawal_timestamp IS NULL
       RETURNING *`,
      [dataSubjectId, purpose]
    );

    if (result.rows.length === 0) {
      throw new Error(
        `No active consent found for subject ${dataSubjectId} and purpose "${purpose}"`
      );
    }

    return mapConsentRow(result.rows[0]);
  } catch (error) {
    logger.error('withdrawConsent failed', { err: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Retrieve all consent records for a data subject.
 *
 * @see GDPR Article 7(1) — Controller must be able to demonstrate consent
 * @param dataSubjectId - The data subject to look up
 * @returns Array of ConsentRecord entries for the subject
 */
export async function getConsentStatus(dataSubjectId: string): Promise<ConsentRecord[]> {
  try {
    await ensureTables();

    const result = await pool.query(
      `SELECT * FROM gdpr_consent_records
       WHERE data_subject_id = $1
       ORDER BY consent_timestamp DESC`,
      [dataSubjectId]
    );

    return result.rows.map(mapConsentRow);
  } catch (error) {
    logger.error('getConsentStatus failed', { err: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 4. Data Subject Rights (Articles 15-22)
// ---------------------------------------------------------------------------

/**
 * Create a new Data Subject Request.
 *
 * The response deadline is automatically set to 30 calendar days from receipt,
 * per GDPR Article 12(3).
 *
 * @see GDPR Articles 15-22 — Rights of the data subject
 * @param request - The request data (id, receivedAt, responseDeadline are generated)
 * @returns The created DataSubjectRequest
 */
export async function createDataSubjectRequest(
  request: Omit<DataSubjectRequest, 'id' | 'receivedAt' | 'responseDeadline' | 'completedAt' | 'responseDetails'> & {
    responseDetails?: string | null;
  }
): Promise<DataSubjectRequest> {
  try {
    await ensureTables();

    const result = await pool.query(
      `INSERT INTO gdpr_data_subject_requests
        (data_subject_id, request_type, status, received_at,
         response_deadline, response_details, organization_id)
       VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '30 days', $4, $5)
       RETURNING *`,
      [
        request.dataSubjectId,
        request.requestType,
        request.status,
        request.responseDetails ?? null,
        request.organizationId,
      ]
    );

    return mapDataSubjectRequestRow(result.rows[0]);
  } catch (error) {
    logger.error('createDataSubjectRequest failed', { err: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Mark a Data Subject Request as completed.
 *
 * @see GDPR Article 12(3) — Controller shall provide information without undue
 *   delay and in any event within one month of receipt
 * @param id - The request ID
 * @param responseDetails - Description of how the request was fulfilled
 * @returns The updated DataSubjectRequest
 */
/**
 * Refuse evidence that would not survive being asked about.
 *
 * Each rejection here corresponds to a way the old free-text field could read
 * as a completed request while describing nothing that happened.
 */
function assertExecutionSatisfies(
  requestType: DataSubjectRequest['requestType'],
  execution: DataSubjectRequestExecution | undefined
): void {
  if (!execution) {
    throw new Error(
      `Cannot complete data subject request: no record of what was carried out. ` +
        `A '${requestType}' request marked completed asserts the right was honoured, ` +
        `and GDPR Art. 5(2) requires that to be demonstrable.`
    );
  }

  const required = REQUIRED_ACTION[requestType];
  if (execution.action !== required) {
    throw new Error(
      `Cannot complete a '${requestType}' request with action '${execution.action}': ` +
        `that right is satisfied by '${required}'. Recording one right's action against ` +
        `another leaves the obligation unmet while the record reads completed.`
    );
  }

  if (!Array.isArray(execution.scopes) || execution.scopes.length === 0) {
    throw new Error(
      `Cannot complete data subject request: the evidence lists no searched scope. ` +
        `A subject who holds no data yields rows: 0 across the stores that WERE ` +
        `searched; an empty list means none were, and the two must not be recorded ` +
        `the same way.`
    );
  }

  const malformed = execution.scopes.find(
    (s) => !s || typeof s.scope !== 'string' || !s.scope || !Number.isInteger(s.rows) || s.rows < 0
  );
  if (malformed) {
    throw new Error(
      `Cannot complete data subject request: a scope entry is malformed ` +
        `(${JSON.stringify(malformed)}). Each entry needs a named scope and a ` +
        `non-negative integer row count.`
    );
  }

  if (!execution.performedBy || !execution.performedBy.trim()) {
    throw new Error(
      'Cannot complete data subject request: the evidence does not say who or what ' +
        'carried it out.'
    );
  }
}

/**
 * Mark a data subject request completed, recording what was actually done.
 *
 * This used to set status='completed' with free-text response_details and
 * perform nothing. Nothing erased, nothing exported, nothing rectified — the
 * row was the whole outcome. For an erasure request that row asserts under
 * GDPR Art. 17 that the subject's personal data is gone, and Art. 5(2) puts
 * the burden on the controller to demonstrate it. A sentence of prose cannot
 * be checked, and it cannot distinguish "we searched and found nothing" from
 * "we never looked" — the two readings that matter most.
 *
 * So completion now requires evidence of execution, and refuses without it.
 * This deliberately does NOT implement subject-level erasure: which stores hold
 * a data subject's content, and how they are purged, is unsettled and belongs
 * to whoever owns that area. What is settled is that the platform must not
 * record a right as honoured when it has no account of honouring it. Until an
 * executor exists, this function fails closed and no request can be marked
 * completed — which is the true state of affairs, and is why nothing here
 * fabricates a default.
 *
 * @throws when evidence is absent, records no searched scope, or describes an
 *         action that does not satisfy the right that was requested.
 */
export async function completeDataSubjectRequest(
  id: string,
  responseDetails: string,
  execution: DataSubjectRequestExecution
): Promise<DataSubjectRequest> {
  try {
    await ensureTables();

    const existing = await pool.query(
      `SELECT request_type FROM gdpr_data_subject_requests WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      throw new Error(`Data subject request ${id} not found`);
    }
    const requestType = existing.rows[0].request_type as DataSubjectRequest['requestType'];

    assertExecutionSatisfies(requestType, execution);

    const evidence = {
      action: execution.action,
      scopes: execution.scopes,
      performedBy: execution.performedBy,
      performedAt: (execution.performedAt ?? new Date()).toISOString(),
    };

    const result = await pool.query(
      `UPDATE gdpr_data_subject_requests
       SET status = 'completed',
           completed_at = NOW(),
           response_details = $1,
           execution_evidence = $2
       WHERE id = $3
       RETURNING *`,
      [responseDetails, JSON.stringify(evidence), id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Data subject request ${id} not found`);
    }

    return mapDataSubjectRequestRow(result.rows[0]);
  } catch (error) {
    logger.error('completeDataSubjectRequest failed', { err: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Retrieve all overdue Data Subject Requests for an organisation.
 *
 * A request is overdue when it has passed the 30-day response deadline
 * without being completed or denied.
 *
 * @see GDPR Article 12(3) — One-month deadline for response
 * @param organizationId - The organisation to check
 * @returns Array of overdue DataSubjectRequest records
 */
export async function getOverdueRequests(
  organizationId: string
): Promise<DataSubjectRequest[]> {
  try {
    await ensureTables();

    const result = await pool.query(
      `SELECT * FROM gdpr_data_subject_requests
       WHERE organization_id = $1
         AND status IN ('received', 'in_progress')
         AND response_deadline < NOW()
       ORDER BY response_deadline ASC`,
      [organizationId]
    );

    return result.rows.map(mapDataSubjectRequestRow);
  } catch (error) {
    logger.error('getOverdueRequests failed', { err: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 5. Cross-Border Transfer Assessment (Articles 44-49)
// ---------------------------------------------------------------------------

/**
 * Create a transfer assessment for cross-border data transfers.
 *
 * @see GDPR Article 44 — General principle for transfers
 * @see GDPR Article 46 — Transfers subject to appropriate safeguards
 * @param assessment - The transfer assessment data (id is generated)
 * @returns The created TransferAssessment
 */
export async function assessTransfer(
  assessment: Omit<TransferAssessment, 'id'>
): Promise<TransferAssessment> {
  try {
    await ensureTables();

    const result = await pool.query(
      `INSERT INTO gdpr_transfer_assessments
        (source_region, destination_region, transfer_mechanism,
         legal_basis, risk_level, tia_completed,
         supplementary_measures, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        assessment.sourceRegion,
        assessment.destinationRegion,
        assessment.transferMechanism,
        assessment.legalBasis,
        assessment.riskLevel,
        assessment.tiaCompleted,
        JSON.stringify(assessment.supplementaryMeasures),
        assessment.organizationId,
      ]
    );

    return mapTransferAssessmentRow(result.rows[0]);
  } catch (error) {
    logger.error('assessTransfer failed', { err: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Retrieve all transfer assessments for an organisation.
 *
 * @see GDPR Articles 44-49 — Transfers of personal data to third countries
 * @param organizationId - The organisation to look up
 * @returns Array of TransferAssessment records
 */
export async function getTransfersForOrg(
  organizationId: string
): Promise<TransferAssessment[]> {
  try {
    await ensureTables();

    const result = await pool.query(
      `SELECT * FROM gdpr_transfer_assessments
       WHERE organization_id = $1
       ORDER BY id DESC`,
      [organizationId]
    );

    return result.rows.map(mapTransferAssessmentRow);
  } catch (error) {
    logger.error('getTransfersForOrg failed', { err: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 6. Breach Notification (Articles 33-34)
// ---------------------------------------------------------------------------

/**
 * Report a personal data breach.
 *
 * Automatically calculates whether the breach is within the 72-hour
 * notification window required by GDPR Article 33(1).
 *
 * @see GDPR Article 33 — Notification of a personal data breach to the
 *   supervisory authority
 * @see GDPR Article 34 — Communication of a personal data breach to the
 *   data subject
 * @param breach - The breach data (id and withinNotificationWindow are generated)
 * @returns The created DataBreach record
 */
export async function reportBreach(
  breach: Omit<DataBreach, 'id' | 'withinNotificationWindow'>
): Promise<DataBreach> {
  try {
    await ensureTables();

    const withinWindow = isWithinNotificationWindow(breach.detectedAt);

    const result = await pool.query(
      `INSERT INTO gdpr_data_breaches
        (description, data_affected, subjects_affected, detected_at,
         reported_to_authority_at, reported_to_subjects_at, severity,
         within_notification_window, remediation_steps, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        breach.description,
        breach.dataAffected,
        breach.subjectsAffected,
        breach.detectedAt,
        breach.reportedToAuthorityAt,
        breach.reportedToSubjectsAt,
        breach.severity,
        withinWindow,
        JSON.stringify(breach.remediationSteps),
        breach.organizationId,
      ]
    );

    return mapDataBreachRow(result.rows[0]);
  } catch (error) {
    logger.error('reportBreach failed', { err: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Check whether the current time is still within the 72-hour notification
 * window from the moment the breach was detected.
 *
 * @see GDPR Article 33(1) — "not later than 72 hours after having become
 *   aware of it"
 * @param detectedAt - The timestamp when the breach was detected
 * @returns true if fewer than 72 hours have elapsed since detection
 */
export function isWithinNotificationWindow(detectedAt: Date): boolean {
  const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
  const now = new Date();
  const detected = new Date(detectedAt);
  return now.getTime() - detected.getTime() <= SEVENTY_TWO_HOURS_MS;
}

// ---------------------------------------------------------------------------
// Row-mapping helpers
// ---------------------------------------------------------------------------

function mapProcessingActivityRow(row: Record<string, unknown>): ProcessingActivity {
  return {
    id: row.id as string,
    name: row.name as string,
    purpose: row.purpose as string,
    lawfulBasis: row.lawful_basis as LawfulBasis,
    dataCategories: row.data_categories as string[],
    dataSubjectCategories: row.data_subject_categories as string[],
    recipients: row.recipients as string[],
    thirdCountryTransfers: row.third_country_transfers as string[],
    retentionPeriod: row.retention_period as string,
    technicalMeasures: row.technical_measures as string[],
    organizationalMeasures: row.organizational_measures as string[],
    dpiaConducted: row.dpia_conducted as boolean,
    dpaContactInfo: row.dpa_contact_info as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    organizationId: row.organization_id as string,
  };
}

function mapDPIARow(row: Record<string, unknown>): DPIA {
  return {
    id: row.id as string,
    processingActivityId: row.processing_activity_id as string,
    description: row.description as string,
    necessityAssessment: row.necessity_assessment as string,
    riskAssessment: row.risk_assessment as DPIA['riskAssessment'],
    dpoOpinion: row.dpo_opinion as string,
    supervisoryAuthorityConsulted: row.supervisory_authority_consulted as boolean,
    status: row.status as DPIA['status'],
    approvedBy: (row.approved_by as string) ?? null,
    approvedAt: row.approved_at ? new Date(row.approved_at as string) : null,
    organizationId: row.organization_id as string,
  };
}

function mapConsentRow(row: Record<string, unknown>): ConsentRecord {
  return {
    id: row.id as string,
    dataSubjectId: row.data_subject_id as string,
    purpose: row.purpose as string,
    consentGiven: row.consent_given as boolean,
    consentMethod: row.consent_method as string,
    consentTimestamp: new Date(row.consent_timestamp as string),
    withdrawalTimestamp: row.withdrawal_timestamp
      ? new Date(row.withdrawal_timestamp as string)
      : null,
    lawfulBasis: row.lawful_basis as LawfulBasis,
    organizationId: row.organization_id as string,
  };
}

function mapDataSubjectRequestRow(row: Record<string, unknown>): DataSubjectRequest {
  return {
    id: row.id as string,
    dataSubjectId: row.data_subject_id as string,
    requestType: row.request_type as DataSubjectRequest['requestType'],
    status: row.status as DataSubjectRequest['status'],
    receivedAt: new Date(row.received_at as string),
    responseDeadline: new Date(row.response_deadline as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    responseDetails: (row.response_details as string) ?? null,
    executionEvidence:
      (row.execution_evidence as DataSubjectRequestExecution | null) ?? null,
    organizationId: row.organization_id as string,
  };
}

function mapTransferAssessmentRow(row: Record<string, unknown>): TransferAssessment {
  return {
    id: row.id as string,
    sourceRegion: row.source_region as string,
    destinationRegion: row.destination_region as string,
    transferMechanism: row.transfer_mechanism as TransferAssessment['transferMechanism'],
    legalBasis: row.legal_basis as string,
    riskLevel: row.risk_level as string,
    tiaCompleted: row.tia_completed as boolean,
    supplementaryMeasures: row.supplementary_measures as string[],
    organizationId: row.organization_id as string,
  };
}

function mapDataBreachRow(row: Record<string, unknown>): DataBreach {
  return {
    id: row.id as string,
    description: row.description as string,
    dataAffected: row.data_affected as string,
    subjectsAffected: row.subjects_affected as number,
    detectedAt: new Date(row.detected_at as string),
    reportedToAuthorityAt: row.reported_to_authority_at
      ? new Date(row.reported_to_authority_at as string)
      : null,
    reportedToSubjectsAt: row.reported_to_subjects_at
      ? new Date(row.reported_to_subjects_at as string)
      : null,
    severity: row.severity as DataBreach['severity'],
    withinNotificationWindow: row.within_notification_window as boolean,
    remediationSteps: row.remediation_steps as string[],
    organizationId: row.organization_id as string,
  };
}
