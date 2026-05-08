/**
 * Preclinical ingest service — runs the extractor and persists the
 * resulting study to `ctd_nonclinical_studies` with provenance fields.
 *
 * Fail-closed when PRECLINICAL_INGEST_ENABLED is unset. Callers (the
 * HTTP route) are responsible for short-circuiting earlier; the guard
 * here is a defence-in-depth.
 */

import { db } from '../../db';
import { ctdNonclinicalStudies } from '../../../shared/schema/csr-knowledge-db';
import { createScopedLogger } from '../../utils/logger';
import { PRECLINICAL_INGEST_ENABLED } from './feature-flags';
import { extractFromPdf } from './preclinical-extractor';
import type { PreclinicalStudy } from './preclinical-extraction-schema';

const log = createScopedLogger('preclinical-ingest');

export interface IngestStudyInput {
  programId: number;
  pdfBuffer: Buffer;
  sourcePdfId: string;
  /** Optional override (testing). */
  model?: string;
}

export interface IngestStudyResult {
  studyId: number;
  extractionConfidence: number;
  model: string;
  data: PreclinicalStudy;
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

  return {
    studyId: row.id,
    extractionConfidence: data.extractionConfidence,
    model,
    data,
  };
}
