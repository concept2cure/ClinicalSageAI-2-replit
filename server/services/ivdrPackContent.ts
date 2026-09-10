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
  /**
   * Sections whose database read FAILED, so a renderer can say "could not be
   * read" instead of "no records". Empty on a healthy build.
   *
   * IVDR (EU) 2017/746 Annex II makes analytical performance and clinical
   * evidence mandatory content, so "No clinical evidence records." is a claim
   * that the manufacturer holds none — a different document from one whose
   * query failed. See the note on readSection below.
   */
  readFailures: Array<{ section: string; error: string }>;

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

/**
 * IVDR pack section reads, with failures recorded rather than swallowed.
 *
 * ── 2026-09-10 ───────────────────────────────────────────────────────────────
 * The four queries below each carried `.catch(() => ({ rows: [] }))`. A failed
 * read therefore produced an empty section, and the renderers turned that into
 * a printed assertion in the technical documentation a manufacturer files:
 *   server/services/docxGenerator.ts:221  "No analytical validation records."
 *   server/services/docxGenerator.ts:261  "No clinical evidence records."
 *   server/services/ivdrPackHtml.ts:108,126  the same two, in HTML.
 *
 * Under IVDR (EU) 2017/746 Annex II, analytical performance and clinical
 * evidence are mandatory content. "No records." is a statement that the
 * manufacturer holds none — a very different document from one that could not
 * read them. This preserves partial packs (a broken section must not fail the
 * whole build) while making the gap explicit in `readFailures`, which the
 * renderers now print instead of the sentence above.
 */
async function readSection(
  failures: Array<{ section: string; error: string }>,
  section: string,
  run: () => Promise<{ rows: any[] }>
): Promise<{ rows: any[] }> {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ section, error: message.slice(0, 200) });
    return { rows: [] };
  }
}

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
  const readFailures: Array<{ section: string; error: string }> = [];
  const [classRes, analyticalRes, clinicalRes, cdxRes] = await Promise.all([
    readSection(readFailures, 'classification', () =>
      pool.query(
        `SELECT ivdr_class, device_name, intended_purpose, rationale, created_at
         FROM ivdr_classifications WHERE organization_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [organizationId]
      )
    ),

    readSection(readFailures, 'analyticalValidations', () =>
      pool.query(
        `SELECT analyte_name, validation_type, acceptance_criteria, status,
                lod, loq, precision_cv, sensitivity, specificity, accuracy
         FROM ivdr_analytical_validations WHERE organization_id = $1 ORDER BY created_at`,
        [organizationId]
      )
    ),

    readSection(readFailures, 'clinicalEvidence', () =>
      pool.query(
        `SELECT study_title, study_type, sample_size, conclusion_text, status,
                calculated_sensitivity, calculated_specificity
         FROM ivdr_clinical_evidence WHERE organization_id = $1 ORDER BY created_at`,
        [organizationId]
      )
    ),

    readSection(readFailures, 'cdx', () =>
      pool.query(
        `SELECT medicinal_product_name, therapeutic_indication, biomarker, biomarker_type, status
         FROM ivdr_cdx_workflows WHERE organization_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [organizationId]
      )
    ),
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

    readFailures,

    binderEvidence: manifest.binderEvidence,
    provenanceChain: manifest.provenanceChain,

    hashes: {
      snapshotHashSha256: manifest.hashes.snapshotHashSha256,
      manifestHashSha256: manifest.hashes.manifestHashSha256,
    },
  };
}

/**
 * The sentence a renderer prints for an EMPTY section — which is not the same
 * sentence for a section that could not be read.
 *
 * Both the DOCX and HTML renderers used to print a flat "No <label> records."
 * whichever it was. Under IVDR (EU) 2017/746 Annex II these sections are
 * mandatory content, so that sentence asserts the manufacturer holds no
 * analytical performance data or no clinical evidence — a claim a failed query
 * must never make on their behalf.
 *
 * Exported and shared so the two renderers cannot drift into two wordings.
 */
export function sectionEmptyText(
  content: Pick<IvdrPackContent, 'readFailures'>,
  section: string,
  label: string
): string {
  const failure = (content.readFailures ?? []).find(f => f.section === section);
  return failure
    ? `The ${label} records could not be read (${failure.error}). This section is INCOMPLETE — ` +
      `it is not a statement that no ${label} records exist.`
    : `No ${label} records.`;
}
