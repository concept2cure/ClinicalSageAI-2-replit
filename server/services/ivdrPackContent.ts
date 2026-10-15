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
import { programInOrganization } from './c2c/program-access';
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
   * query failed. See the note on readSection below. Section 'provenanceChain'
   * comes from the manifest (ManifestV1.provenanceReadFailure).
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
 *  Values are echoed as stored. The one unit the store pins is bias: the
 *  `accuracy` column holds bias in percent (migration 001: `accuracy NUMERIC
 *  -- Bias %`), so it is labelled as that; no other unit is asserted. */
function summarizeAnalytical(r: any): string {
  const parts: string[] = [];
  if (r.lod != null) parts.push(`LoD ${r.lod}`);
  if (r.loq != null) parts.push(`LoQ ${r.loq}`);
  if (r.precision_cv != null) parts.push(`Precision CV ${r.precision_cv}`);
  if (r.sensitivity != null) parts.push(`Sensitivity ${r.sensitivity}`);
  if (r.specificity != null) parts.push(`Specificity ${r.specificity}`);
  // 2026-10-15: printed as "Accuracy <n>" — a bias of 2.1 % read as an accuracy.
  if (r.accuracy != null) parts.push(`Bias (%) ${r.accuracy}`);
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
  /** The pack's project: a live regulatory programme id, or the build is refused. */
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

/**
 * The regulatory programme an IVDR pack is filed for — or a refusal.
 *
 * A pack's projectId IS its programme id, the convention of every IVDR read
 * (ivdr-routes.ts, POST /submission-package/:projectId). A projectId that is not
 * a live programme of the organization names no device, so there is nothing the
 * pack could truthfully contain: the build is refused (IVDR_NO_PROGRAM) rather
 * than filled from the organisation at large.
 */
export async function resolveIvdrPackProgram(
  pool: Pool,
  organizationId: number,
  projectId: string
): Promise<string> {
  if (!(await programInOrganization(pool, projectId, organizationId))) {
    throw new Error(
      `IVDR_NO_PROGRAM: project ${projectId} is not a live regulatory programme of organization ${organizationId}`
    );
  }
  return projectId;
}

/**
 * The four section reads for ONE programme. Shared by the content below and the
 * worker's snapshot (readIvdrPackRecordIds), so the two cannot disagree on which
 * records a pack contains.
 *
 * ── 2026-10-15 ───────────────────────────────────────────────────────────────
 * These read by organization alone. The pack is filed per project, so in an
 * organisation with more than one IVD programme it printed the organisation's
 * latest classification (another device's, or a soft-deleted one) and every
 * device's validation, clinical-evidence and CDx rows as its own. They now read
 * the programme as ivdr-routes.ts does: the classification by program_id, the
 * other three through their classification, live classifications only.
 */
async function readProgrammeSections(pool: Pool, organizationId: number, programId: string) {
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
        `SELECT id, ivdr_class, device_name, intended_purpose, rationale, created_at
         FROM ivdr_classifications
         WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
         ORDER BY created_at DESC, id DESC LIMIT 1`,
        [organizationId, programId]
      )
    ),

    readSection(readFailures, 'analyticalValidations', () =>
      pool.query(
        `SELECT v.id, v.analyte_name, v.validation_type, v.acceptance_criteria, v.status,
                v.lod, v.loq, v.precision_cv, v.sensitivity, v.specificity, v.accuracy
         FROM ivdr_analytical_validations v
         JOIN ivdr_classifications c ON c.id = v.classification_id
         WHERE v.organization_id = $1 AND c.organization_id = $1
           AND c.program_id = $2 AND c.deleted_at IS NULL
         ORDER BY v.created_at, v.id`,
        [organizationId, programId]
      )
    ),

    readSection(readFailures, 'clinicalEvidence', () =>
      pool.query(
        `SELECT e.id, e.study_title, e.study_type, e.sample_size, e.conclusion_text, e.status,
                e.calculated_sensitivity, e.calculated_specificity
         FROM ivdr_clinical_evidence e
         JOIN ivdr_classifications c ON c.id = e.classification_id
         WHERE e.organization_id = $1 AND c.organization_id = $1
           AND c.program_id = $2 AND c.deleted_at IS NULL
         ORDER BY e.created_at, e.id`,
        [organizationId, programId]
      )
    ),

    readSection(readFailures, 'cdx', () =>
      pool.query(
        `SELECT w.id, w.medicinal_product_name, w.therapeutic_indication, w.biomarker,
                w.biomarker_type, w.status
         FROM ivdr_cdx_workflows w
         JOIN ivdr_classifications c ON c.id = w.classification_id
         WHERE w.organization_id = $1 AND c.organization_id = $1
           AND c.program_id = $2 AND c.deleted_at IS NULL
         ORDER BY w.created_at DESC, w.id DESC LIMIT 1`,
        [organizationId, programId]
      )
    ),
  ]);

  return {
    classRow: classRes.rows[0] ?? null,
    analyticalRows: analyticalRes.rows,
    clinicalRows: clinicalRes.rows,
    cdxRow: cdxRes.rows[0] ?? null,
    readFailures,
  };
}

/** The IVDR records a pack for this project contains, by id, as the worker's snapshot records them. */
export interface IvdrPackRecordIds {
  classificationId: number | undefined;
  analyticalValidationIds: number[];
  clinicalEvidenceIds: number[];
  cdxWorkflowId: number | undefined;
  /** Sections whose read failed — their id lists are NOT a statement that none exist. */
  readFailures: Array<{ section: string; error: string }>;
}

/** Refuses (IVDR_NO_PROGRAM) exactly as buildIvdrPackContent does. */
export async function readIvdrPackRecordIds(
  pool: Pool,
  organizationId: number,
  projectId: string
): Promise<IvdrPackRecordIds> {
  const programId = await resolveIvdrPackProgram(pool, organizationId, projectId);
  const s = await readProgrammeSections(pool, organizationId, programId);
  return {
    classificationId: s.classRow?.id ?? undefined,
    analyticalValidationIds: s.analyticalRows.map((r: any) => r.id),
    clinicalEvidenceIds: s.clinicalRows.map((r: any) => r.id),
    cdxWorkflowId: s.cdxRow?.id ?? undefined,
    readFailures: s.readFailures,
  };
}

export async function buildIvdrPackContent(opts: BuildContentOpts): Promise<IvdrPackContent> {
  const { pool, organizationId, projectId, packId, packType, packVersion, manifest } = opts;

  const programId = await resolveIvdrPackProgram(pool, organizationId, projectId);
  const { classRow, analyticalRows, clinicalRows, cdxRow, readFailures } =
    await readProgrammeSections(pool, organizationId, programId);
  // §6 is read by the manifest builder; its failure is this pack's failure too.
  if (manifest.provenanceReadFailure) {
    readFailures.push({ section: 'provenanceChain', error: manifest.provenanceReadFailure.error });
  }

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

    analyticalValidations: analyticalRows.map((r: any) => ({
      parameterName: r.analyte_name || r.validation_type || '—',
      acceptanceCriteria: summarizeJson(r.acceptance_criteria),
      resultSummary: summarizeAnalytical(r),
      status: r.status || '—',
    })),

    clinicalEvidence: clinicalRows.map((r: any) => ({
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
