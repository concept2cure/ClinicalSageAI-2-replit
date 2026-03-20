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
  organizationId: string;
}

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

const ENSURE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS gdpr_processing_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    lawful_basis TEXT NOT NULL,
    data_categories JSONB NOT NULL DEFAULT '[]',
    data_subject_categories JSONB NOT NULL DEFAULT '[]',
    recipients JSONB NOT NULL DEFAULT '[]',
    third_country_transfers JSONB NOT NULL DEFAULT '[]',
    retention_period TEXT NOT NULL,
    technical_measures JSONB NOT NULL DEFAULT '[]',
    organizational_measures JSONB NOT NULL DEFAULT '[]',
    dpia_conducted BOOLEAN NOT NULL DEFAULT FALSE,
    dpa_contact_info TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    organization_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gdpr_dpias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_activity_id UUID NOT NULL REFERENCES gdpr_processing_activities(id),
    description TEXT NOT NULL,
    necessity_assessment TEXT NOT NULL,
    risk_assessment JSONB NOT NULL,
    dpo_opinion TEXT,
    supervisory_authority_consulted BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'draft',
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    organization_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gdpr_consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_subject_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    consent_given BOOLEAN NOT NULL,
    consent_method TEXT NOT NULL,
    consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawal_timestamp TIMESTAMPTZ,
    lawful_basis TEXT NOT NULL,
    organization_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gdpr_data_subject_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_subject_id TEXT NOT NULL,
    request_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    response_deadline TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    response_details TEXT,
    organization_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gdpr_transfer_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_region TEXT NOT NULL,
    destination_region TEXT NOT NULL,
    transfer_mechanism TEXT NOT NULL,
    legal_basis TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    tia_completed BOOLEAN NOT NULL DEFAULT FALSE,
    supplementary_measures JSONB NOT NULL DEFAULT '[]',
    organization_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gdpr_data_breaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    data_affected TEXT NOT NULL,
    subjects_affected INTEGER NOT NULL DEFAULT 0,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reported_to_authority_at TIMESTAMPTZ,
    reported_to_subjects_at TIMESTAMPTZ,
    severity TEXT NOT NULL DEFAULT 'medium',
    within_notification_window BOOLEAN NOT NULL DEFAULT TRUE,
    remediation_steps JSONB NOT NULL DEFAULT '[]',
    organization_id TEXT NOT NULL
  );
`;

/**
 * Ensures all GDPR-related tables exist. Called lazily before each
 * database operation so the service is safe to import at module level
 * without requiring migrations to have run first.
 */
async function ensureTables(): Promise<void> {
  try {
    await pool.query(ENSURE_TABLES_SQL);
  } catch (error) {
    console.error('[GDPR] Failed to ensure tables:', error);
    throw error;
  }
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
    console.error('[GDPR] createProcessingActivity failed:', error);
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
    console.error('[GDPR] getProcessingActivities failed:', error);
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
    console.error('[GDPR] updateProcessingActivity failed:', error);
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
    console.error('[GDPR] createDPIA failed:', error);
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
    console.error('[GDPR] getDPIAsForActivity failed:', error);
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
    console.error('[GDPR] recordConsent failed:', error);
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
    console.error('[GDPR] withdrawConsent failed:', error);
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
    console.error('[GDPR] getConsentStatus failed:', error);
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
    console.error('[GDPR] createDataSubjectRequest failed:', error);
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
export async function completeDataSubjectRequest(
  id: string,
  responseDetails: string
): Promise<DataSubjectRequest> {
  try {
    await ensureTables();

    const result = await pool.query(
      `UPDATE gdpr_data_subject_requests
       SET status = 'completed',
           completed_at = NOW(),
           response_details = $1
       WHERE id = $2
       RETURNING *`,
      [responseDetails, id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Data subject request ${id} not found`);
    }

    return mapDataSubjectRequestRow(result.rows[0]);
  } catch (error) {
    console.error('[GDPR] completeDataSubjectRequest failed:', error);
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
    console.error('[GDPR] getOverdueRequests failed:', error);
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
    console.error('[GDPR] assessTransfer failed:', error);
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
    console.error('[GDPR] getTransfersForOrg failed:', error);
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
    console.error('[GDPR] reportBreach failed:', error);
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
