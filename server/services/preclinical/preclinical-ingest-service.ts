/**
 * Preclinical ingest service — runs the extractor and persists the
 * resulting study to `ctd_nonclinical_studies` with provenance fields.
 *
 * Fail-closed when PRECLINICAL_INGEST_ENABLED is unset. Callers (the
 * HTTP route) are responsible for short-circuiting earlier; the guard
 * here is a defence-in-depth.
 */

import { db, pool } from '../../db';
import { ctdNonclinicalStudies } from '../../../shared/schema/csr-knowledge-db';
import { createScopedLogger } from '../../utils/logger';
import { PRECLINICAL_INGEST_ENABLED } from './feature-flags';
import { extractFromPdf } from './preclinical-extractor';
import { bridgeIngestedStudyTx } from './preclinical-governed-bridge';
import { recordGovernedAction } from '../../routes/c2c/actions';
import type { PreclinicalStudy } from './preclinical-extraction-schema';
import type { PoolClient } from 'pg';

const log = createScopedLogger('preclinical-ingest');

/**
 * Optional governance context. When supplied, the digested study is threaded into
 * the governed nonclinical registry (org-scoped, audited) with provenance to CTD
 * Module 4. Omit it to retain the legacy program-only digestion behaviour.
 */
export interface IngestGovernance {
  organizationId: number;
  userId: number;
  submissionId?: number | null;
  iacucProtocolId?: number | null;
  reason?: string;
}

export interface IngestStudyInput {
  programId: number;
  pdfBuffer: Buffer;
  sourcePdfId: string;
  /** Optional override (testing). */
  model?: string;
  /** When present, bridge the digested study into the governed registry. */
  governance?: IngestGovernance;
}

export interface IngestStudyResult {
  studyId: number;
  extractionConfidence: number;
  model: string;
  data: PreclinicalStudy;
  /** Registration does not establish scientific review or submission readiness. */
  registration: GovernedRegistrationOutcome;
  /** Governed nonclinical_studies.id only after registration COMMIT is confirmed. */
  governedStudyId?: number;
  ctdSection?: string;
}

export type GovernedRegistrationOutcome =
  | { status: 'not_requested' }
  | { status: 'registered'; governedStudyId: number; ctdSection: string; reviewRequired: true }
  | { status: 'failed'; code: 'PRECLINICAL_GOVERNED_REGISTRATION_FAILED' };

const INPUT_ERROR_MESSAGES = {
  PRECLINICAL_INGEST_BAD_PROGRAM_ID: 'programId is required and must be a positive integer',
  PRECLINICAL_INGEST_GOVERNANCE_CONTEXT_REQUIRED: 'Valid organization and user context is required for governed registration',
  PRECLINICAL_INGEST_BAD_SUBMISSION_ID: 'submissionId must be a positive integer when supplied',
  PRECLINICAL_INGEST_BAD_IACUC_PROTOCOL_ID: 'iacucProtocolId must be a positive integer when supplied',
} as const;

export class PreclinicalIngestInputError extends Error {
  constructor(readonly code: keyof typeof INPUT_ERROR_MESSAGES) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'PreclinicalIngestInputError';
  }
}

export class PreclinicalIngestDisabledError extends Error {
  constructor() {
    super('Preclinical ingest is disabled (PRECLINICAL_INGEST_ENABLED=false)');
    this.name = 'PreclinicalIngestDisabledError';
  }
}

export async function ingestStudy(input: IngestStudyInput): Promise<IngestStudyResult> {
  if (!PRECLINICAL_INGEST_ENABLED) {
    throw new PreclinicalIngestDisabledError();
  }

  validateIngestInput(input);

  const { data, model } = await extractFromPdf(input.pdfBuffer, {
    sourcePdfId: input.sourcePdfId,
    model: input.model,
    callerModule: 'preclinical-ingest-service',
  });

  const [row] = await db
    .insert(ctdNonclinicalStudies)
    .values({
      programId: input.programId,
      studyType: data.studyType,
      studyTitle: data.studyTitle,
      species: data.species,
      strain: data.strain,
      routeOfAdministration: data.routeOfAdministration,
      durationWeeks: data.durationWeeks,
      glpCompliant: data.glpCompliant,
      noael: data.noael,
      loael: data.loael,
      mtd: data.mtd,
      keyFindings: data.keyFindings,
      targetOrganToxicity: data.targetOrganToxicity,
      carcinogenicityFindings: data.carcinogenicityFindings,
      genotoxicityResults: data.genotoxicityResults,
      reproductiveToxicity: data.reproductiveToxicity,
      safetyMargins: data.safetyMargins,
      studyReportNumber: data.studyReportNumber,
      testingFacility: data.testingFacility,
      studyCompletionDate: data.studyCompletionDate,
      sourcePdfId: input.sourcePdfId,
      extractionModel: model,
      extractionConfidence: data.extractionConfidence,
      extractedAt: new Date(),
    })
    .returning({ id: ctdNonclinicalStudies.id });

  if (!row) {
    throw new Error('preclinical-ingest: insert returned no row');
  }

  log.info('Inserted preclinical study', {
    programId: input.programId,
    studyId: row.id,
    sourcePdfId: input.sourcePdfId,
    confidence: data.extractionConfidence,
    model,
  });

  const result: IngestStudyResult = {
    studyId: row.id,
    extractionConfidence: data.extractionConfidence,
    model,
    data,
    registration: { status: 'not_requested' },
  };

  // Governed bridge: thread the digested study into the governed registry + Module 4.
  if (input.governance) {
    await registerGovernedStudy(input, result, input.governance);
  }

  return result;
}

/** Validate before making a provider request or retaining a study. */
function validateIngestInput(input: IngestStudyInput): void {
  // The route validates multipart strings; direct callers supply actual IDs.
  if (!isPositiveId(input.programId)) {
    throw new PreclinicalIngestInputError('PRECLINICAL_INGEST_BAD_PROGRAM_ID');
  }
  if (input.governance === undefined) return;
  const g = input.governance;
  if (!g || !isPositiveId(g.organizationId) || !isPositiveId(g.userId)) {
    throw new PreclinicalIngestInputError('PRECLINICAL_INGEST_GOVERNANCE_CONTEXT_REQUIRED');
  }
  if (g.submissionId != null && !isPositiveId(g.submissionId)) {
    throw new PreclinicalIngestInputError('PRECLINICAL_INGEST_BAD_SUBMISSION_ID');
  }
  if (g.iacucProtocolId != null && !isPositiveId(g.iacucProtocolId)) {
    throw new PreclinicalIngestInputError('PRECLINICAL_INGEST_BAD_IACUC_PROTOCOL_ID');
  }
}

/** Record registration separately so its failure cannot lose retained extraction. */
async function registerGovernedStudy(input: IngestStudyInput, result: IngestStudyResult, g: IngestGovernance): Promise<void> {
  const ctdStudyId = result.studyId;
  let client: PoolClient | undefined;
  let releaseError: Error | undefined;
  let phase = 'connect';
  try {
    client = await pool.connect();
    phase = 'begin';
    await client.query('BEGIN');
    phase = 'bridge';
    const bridged = await bridgeIngestedStudyTx(client, g.organizationId, g.userId, {
      ctdStudyId, data: result.data, sourcePdfId: input.sourcePdfId,
      submissionId: g.submissionId ?? null, iacucProtocolId: g.iacucProtocolId ?? null,
    });
    phase = 'audit';
    await recordGovernedAction(client, {
      orgId: g.organizationId, userId: g.userId, command: 'create',
      target: `nonclinical-study:${bridged.governedStudyId}`,
      reason: g.reason && g.reason.trim().length >= 8 ? g.reason : 'Digested nonclinical study bridged to governed registry',
      payload: { ctdStudyId, sourcePdfId: input.sourcePdfId, ctdSection: bridged.ctdSection, studyType: mapStudyTypeLabel(result.data.studyType) },
      domain: 'nonclinical', surface: 'preclinical-ingest',
    });
    phase = 'commit';
    const committed = await client.query('COMMIT');
    if (committed.command !== 'COMMIT') {
      throw new Error('Governed registration commit was not confirmed');
    }
    result.governedStudyId = bridged.governedStudyId;
    result.ctdSection = bridged.ctdSection;
    // The existing bridge creates a planned row. Registration is never a
    // scientific approval, even when the transaction completed successfully.
    result.registration = {
      status: 'registered', governedStudyId: bridged.governedStudyId,
      ctdSection: bridged.ctdSection, reviewRequired: true,
    };
    log.info('Bridged digested study to governed registry', { ctdStudyId, governedStudyId: bridged.governedStudyId, ctdSection: bridged.ctdSection });
  } catch (err) {
    result.registration = { status: 'failed', code: 'PRECLINICAL_GOVERNED_REGISTRATION_FAILED' };
    let rollback = 'not_attempted';
    if (client) {
      try {
        await client.query('ROLLBACK');
        rollback = 'succeeded';
      } catch (rollbackError) {
        rollback = 'failed';
        // A client with an unconfirmed rollback must not return to the pool.
        releaseError = rollbackError instanceof Error ? rollbackError : new Error('Rollback failed');
        log.error('Governed registration rollback failed', { ctdStudyId, message: releaseError.message });
      }
    }
    // A lost COMMIT response can leave the outcome uncertain. Report that
    // registration was not confirmed, without claiming nothing was written.
    log.error('Governed registration was not confirmed (extraction retained)', {
      ctdStudyId, phase, rollback, message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    if (client) {
      try {
        client.release(releaseError);
      } catch (err) {
        // A cleanup failure cannot erase the extraction ID or a confirmed
        // COMMIT. The registration outcome remains the transaction's outcome.
        log.error('Governed registration client release failed', {
          ctdStudyId, message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function mapStudyTypeLabel(t: PreclinicalStudy['studyType']): string { return String(t); }
