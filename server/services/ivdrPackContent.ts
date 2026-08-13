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

// ── Row summarisers (canonical columns → renderer strings) ──────────────────

/** Compact display of a JSONB criteria object; em-dash when absent. */
function summarizeJson(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v || '—';
  const s = JSON.stringify(v);
  return s && s !== '{}' && s !== '[]' ? s : '—';
}

/** Honest summary of the RECORDED analytical parameters — nothing invented.
 *  Values are echoed as stored; the store does not pin units, so none are
 *  asserted here. */
function summarizeAnalytical(r: any): string {
  const parts: string[] = [];
  if (r.lod != null) parts.push(`LoD ${r.lod}`);
  if (r.loq != null) parts.push(`LoQ ${r.loq}`);
  if (r.precision_cv != null) parts.push(`Precision CV ${r.precision_cv}`);
  if (r.sensitivity != null) parts.push(`Sensitivity ${r.sensitivity}`);
  if (r.specificity != null) parts.push(`Specificity ${r.specificity}`);
  if (r.accuracy != null) parts.push(`Accuracy ${r.accuracy}`);
  return parts.length ? parts.join(' · ') : '—';
}

/** Conclusion text when recorded, else the computed 2x2 metrics, else —. */
function summarizeClinical(r: any): string {
  if (r.conclusion_text) return String(r.conclusion_text);
  const parts: string[] = [];
  if (r.calculated_sensitivity != null) parts.push(`Sensitivity ${r.calculated_sensitivity}`);
  if (r.calculated_specificity != null) parts.push(`Specificity ${r.calculated_specificity}`);
  return parts.length ? parts.join(' · ') : '—';
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

  // Run all DB lookups in parallel.
  //
  // D11d IVDR consolidation (2026-08-13): these four queries previously
  // selected columns that exist in NO shape of these tables (risk_class,
  // device_type, classification_rationale, parameter_name, study_name,
  // population_size, outcome_summary, companion_drug, assay_technology) — the
  // catch() swallowed the 42703 on every build, so every pack rendered its
  // sections empty while reporting success. Re-pointed to the canonical
  // columns the tables actually carry.
  const [classRes, analyticalRes, clinicalRes, cdxRes] = await Promise.all([
    pool
      .query(
        `SELECT ivdr_class, device_name, intended_purpose, rationale, created_at
         FROM ivdr_classifications WHERE organization_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [organizationId]
      )
      .catch(() => ({ rows: [] })),

    pool
      .query(
        `SELECT analyte_name, validation_type, acceptance_criteria, status,
                lod, loq, precision_cv, sensitivity, specificity, accuracy
         FROM ivdr_analytical_validations WHERE organization_id = $1 ORDER BY created_at`,
        [organizationId]
      )
      .catch(() => ({ rows: [] })),

    pool
      .query(
        `SELECT study_title, study_type, sample_size, conclusion_text, status,
                calculated_sensitivity, calculated_specificity
         FROM ivdr_clinical_evidence WHERE organization_id = $1 ORDER BY created_at`,
        [organizationId]
      )
      .catch(() => ({ rows: [] })),

    pool
      .query(
        `SELECT medicinal_product_name, therapeutic_indication, biomarker, biomarker_type, status
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
          riskClass: classRow.ivdr_class || 'Not classified',
          deviceType: classRow.device_name || '—',
          intendedPurpose: classRow.intended_purpose || '—',
          rationale: classRow.rationale || '—',
          classifiedDate: classRow.created_at
            ? new Date(classRow.created_at).toISOString().split('T')[0]
            : '—',
        }
      : null,

    analyticalValidations: analyticalRes.rows.map((r: any) => ({
      parameterName: r.analyte_name || r.validation_type || '—',
      acceptanceCriteria: summarizeJson(r.acceptance_criteria),
      resultSummary: summarizeAnalytical(r),
      status: r.status || '—',
    })),

    clinicalEvidence: clinicalRes.rows.map((r: any) => ({
      studyName: r.study_title || '—',
      studyType: r.study_type || '—',
      populationSize: String(r.sample_size ?? '—'),
      outcomeSummary: summarizeClinical(r),
      status: r.status || '—',
    })),

    cdx: cdxRow
      ? {
          companionDrug: cdxRow.medicinal_product_name || '—',
          therapeuticArea: cdxRow.therapeutic_indication || '—',
          biomarker: cdxRow.biomarker || '—',
          assayTechnology: cdxRow.biomarker_type || '—',
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
