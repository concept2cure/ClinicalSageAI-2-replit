/**
 * IVDR Pack Content Builder
 *
 * Single canonical content model consumed by both DOCX and PDF renderers.
 * Performs all DB queries once, returns a renderer-agnostic structure.
 *
 * Architecture:
 *   buildIvdrPackContent(opts) → IvdrPackContent
 *   ↓                          ↓
 *   docxGenerator.ts           ivdrPackHtml.ts → renderers.ts (puppeteer/fallback)
 *
 * @module server/services/ivdrPackContent
 */

import { Pool } from 'pg';
import type { ManifestV1 } from './ivdrPackManifest';

// ── Content model types ─────────────────────────────────────────────────────

export interface IvdrPackContent {
  /** Pack identification */
  meta: {
    packId: string;
    packType: string;
    packVersion: number;
    organizationId: number;
    projectId: string;
    generatedAt: string;
  };

  /** § 1 Classification */
  classification: {
    riskClass: string;
    deviceType: string;
    intendedPurpose: string;
    rationale: string;
    classifiedDate: string;
  } | null;

  /** § 2 Analytical validation rows */
  analyticalValidations: Array<{
    parameterName: string;
    acceptanceCriteria: string;
    resultSummary: string;
    status: string;
  }>;

  /** § 3 Clinical evidence rows */
  clinicalEvidence: Array<{
    studyName: string;
    studyType: string;
    populationSize: string;
    outcomeSummary: string;
    status: string;
  }>;

  /** § 4 CDx summary */
  cdx: {
    companionDrug: string;
    therapeuticArea: string;
    biomarker: string;
    assayTechnology: string;
    status: string;
  } | null;

  /** § 5 Binder evidence appendix (from manifest) */
  binderEvidence: ManifestV1['binderEvidence'];

  /** § 6 AI provenance chain (from manifest) */
  provenanceChain: ManifestV1['provenanceChain'];

  /** § 7 Integrity hashes */
  hashes: {
    snapshotHashSha256: string;
    manifestHashSha256: string;
  };
}

// ── Builder ─────────────────────────────────────────────────────────────────

export interface BuildContentOpts {
  pool: Pool;
  organizationId: number;
  projectId: string;
  packId: string;
  packType: string;
  packVersion: number;
  manifest: ManifestV1;
}

/**
 * Build the canonical content model from DB + manifest.
 * All DB queries happen here — renderers receive pure data.
 */
export async function buildIvdrPackContent(opts: BuildContentOpts): Promise<IvdrPackContent> {
  const { pool, organizationId, projectId, packId, packType, packVersion, manifest } = opts;

  // Run all DB lookups in parallel
  const [classRes, analyticalRes, clinicalRes, cdxRes] = await Promise.all([
    pool
      .query(
        `SELECT risk_class, device_type, intended_purpose, classification_rationale, created_at
         FROM ivdr_classifications WHERE organization_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [organizationId]
      )
      .catch(() => ({ rows: [] })),

    pool
      .query(
        `SELECT parameter_name, acceptance_criteria, result_summary, status
         FROM ivdr_analytical_validations WHERE organization_id = $1 ORDER BY created_at`,
        [organizationId]
      )
      .catch(() => ({ rows: [] })),

    pool
      .query(
        `SELECT study_name, study_type, population_size, outcome_summary, status
         FROM ivdr_clinical_evidence WHERE organization_id = $1 ORDER BY created_at`,
        [organizationId]
      )
      .catch(() => ({ rows: [] })),

    pool
      .query(
        `SELECT companion_drug, therapeutic_area, biomarker, assay_technology, status
         FROM ivdr_cdx_workflows WHERE organization_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [organizationId]
      )
      .catch(() => ({ rows: [] })),
  ]);

  const classRow = classRes.rows[0] || null;
  const cdxRow = cdxRes.rows[0] || null;

  return {
    meta: {
      packId,
      packType,
      packVersion,
      organizationId,
      projectId,
      generatedAt: manifest.generatedAt,
    },

    classification: classRow
      ? {
          riskClass: classRow.risk_class || 'Not classified',
          deviceType: classRow.device_type || '—',
          intendedPurpose: classRow.intended_purpose || '—',
          rationale: classRow.classification_rationale || '—',
          classifiedDate: classRow.created_at
            ? new Date(classRow.created_at).toISOString().split('T')[0]
            : '—',
        }
      : null,

    analyticalValidations: analyticalRes.rows.map((r: any) => ({
      parameterName: r.parameter_name || '—',
      acceptanceCriteria: r.acceptance_criteria || '—',
      resultSummary: r.result_summary || '—',
      status: r.status || '—',
    })),

    clinicalEvidence: clinicalRes.rows.map((r: any) => ({
      studyName: r.study_name || '—',
      studyType: r.study_type || '—',
      populationSize: String(r.population_size ?? '—'),
      outcomeSummary: r.outcome_summary || '—',
      status: r.status || '—',
    })),

    cdx: cdxRow
      ? {
          companionDrug: cdxRow.companion_drug || '—',
          therapeuticArea: cdxRow.therapeutic_area || '—',
          biomarker: cdxRow.biomarker || '—',
          assayTechnology: cdxRow.assay_technology || '—',
          status: cdxRow.status || '—',
        }
      : null,

    binderEvidence: manifest.binderEvidence,
    provenanceChain: manifest.provenanceChain,

    hashes: {
      snapshotHashSha256: manifest.hashes.snapshotHashSha256,
      manifestHashSha256: manifest.hashes.manifestHashSha256,
    },
  };
}
