/**
 * CSR adapter — maps the existing CSR corpus into the unified evidence spine
 * WITHOUT destructive migration (§Phase 2).
 *
 * A live CSR (`csr_reports` + `csr_details`) becomes, in the shared spine:
 *   • one cre_evidence_source (source_type = 'csr', tenant-private), linked back
 *     to the csr_reports row (linked_csr_report_id) — no data copied out of the
 *     corpus, just referenced;
 *   • one cre_clinical_studies identity (upserted on a canonical key);
 *   • a DESCRIBES_STUDY relationship between them.
 *
 * It also EXPOSES (does not persist) the §4.3 study-design features and §4.4
 * result observations as read adapters over the same corpus. Result observations
 * REUSE the canonical, no-fabrication effect extractor in study-design/
 * csr-evidence-source.ts — a CSR only contributes a machine-readable effect, never
 * a number parsed from prose. Every feature carries its provenance (§4.3): source
 * id, source location, extraction method, confidence, explicit-vs-inferred,
 * verification status.
 *
 * @module server/services/clinical-regulatory-evidence/csr-adapter.service
 */

import { pool } from '../../db';
import { createSource, upsertStudy, addRelationship } from './evidence-spine.service';
import type { EvidenceSource, ClinicalStudy, StudyDesignFeature, StudyResultObservation } from './types';
import { gatherCsrEffectEvidence } from '../study-design/csr-evidence-source';

// csr_reports.content / .metadata and csr_details.results are free-shape JSON.
interface CsrReportRow {
  id: number; report_id: string; report_title: string | null; title: string | null;
  sponsor: string | null; indication: string | null; phase: string | null; study_id: string | null;
  sample_size: number | null; duration_weeks: number | null; study_design: string | null;
  primary_endpoint: string | null; secondary_endpoints: string | null; nct_id: string | null;
  regulatory_agency: string | null; content: any; metadata: any;
}
interface CsrDetailRow {
  study_design: string | null; primary_endpoint: string | null; secondary_endpoints: string | null;
  inclusion_criteria: string | null; exclusion_criteria: string | null; sample_size: number | null;
  dropout_rate: number | null; blinding: string | null; randomization: string | null;
  statistical_methods: string | null; endpoints: any; results: any; metadata: any;
}

async function readReport(orgId: number, csrReportId: number): Promise<{ report: CsrReportRow; detail: CsrDetailRow | null } | null> {
  const rep = await pool.query(
    `SELECT * FROM csr_reports WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [csrReportId, orgId],
  );
  if (rep.rows.length === 0) return null;
  const det = await pool.query(`SELECT * FROM csr_details WHERE report_id = $1 LIMIT 1`, [csrReportId]);
  return { report: rep.rows[0] as CsrReportRow, detail: (det.rows[0] as CsrDetailRow) ?? null };
}

/** Existing spine source for a CSR (idempotency). */
async function findSourceForCsr(orgId: number, csrReportId: number): Promise<number | null> {
  const { rows } = await pool.query(
    `SELECT id FROM cre_evidence_sources
      WHERE source_type = 'csr' AND linked_csr_report_id = $1
        AND (organization_id IS NULL OR organization_id = $2) AND deleted_at IS NULL
      LIMIT 1`,
    [csrReportId, orgId],
  );
  return rows[0]?.id ?? null;
}

/** A stable canonical study key for a CSR: prefer NCT, then sponsor study id, then report id. */
function canonicalKey(report: CsrReportRow): string {
  return report.nct_id || report.study_id || `csr:${report.report_id}`;
}

/**
 * Adapt one CSR into the spine (idempotent). Returns the linked source + study.
 * `null` when the CSR is not visible to the org.
 */
export async function adaptCsrReport(orgId: number, csrReportId: number): Promise<{ source: EvidenceSource; study: ClinicalStudy; featureCount: number } | null> {
  const read = await readReport(orgId, csrReportId);
  if (!read) return null;
  const { report, detail } = read;

  // A CSR is tenant-private evidence unless a lawful public designation exists.
  const existingSourceId = await findSourceForCsr(orgId, csrReportId);
  const source = existingSourceId
    ? (await getSourceById(orgId, existingSourceId))!
    : await createSource(orgId, {
        sourceType: 'csr', visibilityClass: 'tenant_private',
        title: report.report_title || report.title || `CSR ${report.report_id}`,
        sourceRecordIdentifier: report.report_id, sponsor: report.sponsor,
        indication: report.indication, phase: report.phase, agency: report.regulatory_agency,
        trialRegistryIdentifier: report.nct_id, linkedCsrReportId: report.id,
        provenance: { adapter: 'csr-adapter', extraction: 'reference-only' },
      });

  const study = await upsertStudy(orgId, {
    canonicalStudyKey: canonicalKey(report), visibilityClass: 'tenant_private',
    nctId: report.nct_id, sponsorStudyId: report.study_id, indication: report.indication,
    phase: report.phase, sponsor: report.sponsor, studyStatus: null,
    metadata: { fromCsrReportId: report.id },
  });

  // Idempotent-ish DESCRIBES_STUDY edge (only add when we just minted the source).
  if (!existingSourceId) {
    await addRelationship(orgId, {
      fromEntityType: 'source', fromEntityId: source.id,
      toEntityType: 'study', toEntityId: study.id, relationshipType: 'describes_study',
    });
  }

  const featureCount = extractDesignFeatures(report, detail, source.id, study.id).length;
  return { source, study, featureCount };
}

async function getSourceById(orgId: number, id: number): Promise<EvidenceSource | null> {
  // Local re-read (the spine's getSource applies the same visibility clause).
  const mod = await import('./evidence-spine.service');
  return mod.getSource(orgId, id);
}

/**
 * §4.3 study-design features from a CSR — a READ adapter (not persisted). Every
 * feature carries provenance and an explicit-vs-inferred flag. Deterministic:
 * only fields actually present in a column are emitted, never guessed.
 */
export function extractDesignFeatures(
  report: CsrReportRow, detail: CsrDetailRow | null, sourceId: number | null, studyId: number | null,
): StudyDesignFeature[] {
  const feats: StudyDesignFeature[] = [];
  const push = (featureKey: string, value: string | number | null, loc: string) => {
    if (value === null || value === undefined || value === '') return;
    feats.push({
      studyId, featureKey, value, sourceId, sourceLocation: loc,
      extractionMethod: 'deterministic', extractionConfidence: 1, explicitOrInferred: 'explicit',
      verificationStatus: 'unverified',
    });
  };
  const primaryEndpoint = detail?.primary_endpoint ?? report.primary_endpoint;
  push('primary_endpoint', primaryEndpoint ?? null, 'csr_details.primary_endpoint');
  const secondary = detail?.secondary_endpoints ?? report.secondary_endpoints;
  if (secondary) {
    for (const ep of String(secondary).split(/[;\n]/).map((s) => s.trim()).filter(Boolean)) {
      push('secondary_endpoint', ep, 'csr_details.secondary_endpoints');
    }
  }
  push('study_design', detail?.study_design ?? report.study_design ?? null, 'csr_details.study_design');
  push('randomization', detail?.randomization ?? null, 'csr_details.randomization');
  push('blinding', detail?.blinding ?? null, 'csr_details.blinding');
  push('sample_size', detail?.sample_size ?? report.sample_size ?? null, 'csr_details.sample_size');
  push('duration_weeks', report.duration_weeks ?? null, 'csr_reports.duration_weeks');
  push('phase', report.phase ?? null, 'csr_reports.phase');
  push('inclusion_criteria', detail?.inclusion_criteria ?? null, 'csr_details.inclusion_criteria');
  push('exclusion_criteria', detail?.exclusion_criteria ?? null, 'csr_details.exclusion_criteria');
  push('statistical_methods', detail?.statistical_methods ?? null, 'csr_details.statistical_methods');
  push('dropout_rate', detail?.dropout_rate ?? null, 'csr_details.dropout_rate');
  return feats;
}

/**
 * §4.4 result observations for an indication — a READ adapter that REUSES the
 * canonical CSR effect extractor (no fabrication; a CSR contributes only a
 * machine-readable primary effect). Returns the observations plus an honest
 * coverage note (how many CSRs were scanned vs carried a usable effect).
 */
export async function gatherResultObservations(args: {
  orgId: number; indication: string; phase?: string; direction?: 'increase' | 'decrease';
}): Promise<{ observations: StudyResultObservation[]; scanned: number; withStructuredEffect: number; note: string }> {
  const res = await gatherCsrEffectEvidence({
    tenantId: args.orgId, indication: args.indication, phase: args.phase, direction: args.direction,
  });
  const observations: StudyResultObservation[] = res.observations.map((o) => ({
    studyId: null,
    endpoint: 'primary',
    endpointRole: 'primary',
    estimand: null,
    analysisPopulation: null,
    effectMeasure: 'benefit_oriented_effect',   // the extractor orients ratios to benefit-positive
    effectValue: o.effect,
    standardError: o.standardError,
    ciLower: null,
    ciUpper: null,
    pValue: null,
    directionOfBenefit: 'positive',
    timepoint: null,
    sampleSize: o.n ?? null,
    missingness: null,
    subgroup: null,
    multiplicityStatus: null,
    sourceLocation: o.source.ref ?? o.source.source ?? null,
  }));
  return { observations, scanned: res.scanned, withStructuredEffect: res.withStructuredEffect, note: res.note };
}
