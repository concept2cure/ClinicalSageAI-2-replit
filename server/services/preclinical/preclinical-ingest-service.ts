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
  /** Governed nonclinical_studies.id when a governance context was supplied. */
  governedStudyId?: number;
  ctdSection?: string;
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
  };

  // Governed bridge: thread the digested study into the governed registry + Module 4.
  if (input.governance) {
    const g = input.governance;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const bridged = await bridgeIngestedStudyTx(client, g.organizationId, g.userId, {
        ctdStudyId: row.id, data, sourcePdfId: input.sourcePdfId,
        submissionId: g.submissionId ?? null, iacucProtocolId: g.iacucProtocolId ?? null,
      });
      await recordGovernedAction(client, {
        orgId: g.organizationId, userId: g.userId, command: 'create',
        target: `nonclinical-study:${bridged.governedStudyId}`,
        reason: g.reason && g.reason.trim().length >= 8 ? g.reason : 'Digested nonclinical study bridged to governed registry',
        payload: { ctdStudyId: row.id, sourcePdfId: input.sourcePdfId, ctdSection: bridged.ctdSection, studyType: mapStudyTypeLabel(data.studyType) },
        domain: 'nonclinical', surface: 'preclinical-ingest',
      });
      await client.query('COMMIT');
      result.governedStudyId = bridged.governedStudyId;
      result.ctdSection = bridged.ctdSection;
      log.info('Bridged digested study to governed registry', { ctdStudyId: row.id, governedStudyId: bridged.governedStudyId, ctdSection: bridged.ctdSection });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      // Digestion already succeeded and is persisted; surface the bridge failure without losing the extraction.
      log.error('Governed bridge failed (digestion retained)', { ctdStudyId: row.id, message: err instanceof Error ? err.message : String(err) });
    } finally {
      client.release();
    }
  }

  return result;
}

function mapStudyTypeLabel(t: PreclinicalStudy['studyType']): string { return String(t); }
