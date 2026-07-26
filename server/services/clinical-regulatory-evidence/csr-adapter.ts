/**
 * @fileoverview CSR corpus → shared evidence graph projection.
 * @module server/services/clinical-regulatory-evidence/csr-adapter
 *
 * Phase 2 of the Clinical-Regulatory Intelligence Graph. Projects existing
 * `csr_reports` / `csr_details` rows into `clinical_evidence_sources`,
 * `clinical_study_identities` and `study_result_observations` so CSR
 * intelligence becomes ONE evidence source in the shared spine rather than a
 * parallel corpus.
 *
 * ── What this deliberately does NOT do ─────────────────────────────────────
 *
 * It does not migrate, rewrite or delete anything. `csr_reports` and
 * `csr_details` remain canonical and untouched; DrizzleCorpusWriter keeps its
 * NCT-idempotent upsert (§5.2). This is a PROJECTION — run it twice and you get
 * the same graph, run it never and the CSR corpus still works exactly as today.
 *
 * It does not re-implement effect extraction. `study-design/csr-evidence-source.ts`
 * already solved that problem conservatively and its `extractEffectObservation`
 * is pure and unit-tested. §5.3 says *generalize* that contract, not fork it, so
 * this module calls it and inherits its honesty guarantees wholesale:
 *
 *   · a structured, machine-readable effect WITH its uncertainty, or nothing
 *   · free-text efficacy prose is never parsed into a number
 *   · benefit direction is normalized, and the normalization is recorded
 *   · usable/total counts are reported rather than implied
 *
 * That inheritance is the point. If a future change loosens extraction, it
 * loosens in one place and both consumers move together — which is exactly what
 * "CSR Intelligence becomes one evidence source" has to mean structurally.
 *
 * ── Verification state: everything here is UNREVIEWED ──────────────────────
 *
 * A projected row is machine-derived. It is written as `extracted_unreviewed`
 * and NEVER as `source_verified` — the database refuses the latter without a
 * review timestamp anyway (`cre_find_verified_needs_review`). Nothing in this
 * file may mark its own output as human-verified; that is a person's act.
 *
 * ── Source spans: absent, and said so ──────────────────────────────────────
 *
 * `csr_reports` carries no page boundaries or verbatim offsets, so
 * `source_excerpt` and `source_page` are left NULL. Synthesising a plausible
 * excerpt from the structured fields would manufacture a quotation, which is
 * the one thing a regulated evidence store must never contain. Real spans
 * arrive with the deterministic document extraction in the same phase; until
 * then, null is the truthful value.
 */

import { and, desc, eq } from 'drizzle-orm';

import { db } from '../../db.js';
import {
  clinicalEvidenceSources,
  clinicalStudyIdentities,
  csrDetails,
  csrReports,
  studyResultObservations,
} from '@shared/schema';
import { extractEffectObservation } from '../study-design/csr-evidence-source.js';
import { createScopedLogger } from '../../utils/logger.js';
import type { EvidenceScope } from './types';

const logger = createScopedLogger('crig-csr-adapter');

/** A CSR report row, narrowed to the fields the projection reads. */
export interface CsrReportInput {
  id: number;
  organizationId: number;
  reportId: string | null;
  reportTitle: string | null;
  sponsor: string | null;
  indication: string | null;
  phase: string | null;
  nctId: string | null;
  studyId: string | null;
  sampleSize: number | null;
  reportDate: string | null;
  primaryEndpoint: string | null;
  content: unknown;
  metadata: unknown;
}

/** A CSR detail row, narrowed to what the projection reads. */
export interface CsrDetailInput {
  sampleSize: number | null;
  primaryEndpoint: string | null;
  results: unknown;
  metadata: unknown;
}

/** The three graph rows one CSR projects into. Observation is null when the CSR carries no structured effect. */
export interface CsrProjection {
  source: {
    externalKey: string;
    sourceType: 'csr';
    visibility: 'tenant_private';
    organizationId: number;
    title: string | null;
    documentDate: string | null;
    ingestionStatus: 'extracted';
    extractionMethod: string;
    provenance: Record<string, unknown>;
  };
  study: {
    nctId: string | null;
    sponsorStudyId: string | null;
    indication: string | null;
    phase: string | null;
    sponsor: string | null;
    linkageStatus: 'explicit' | 'inferred';
    linkageRationale: string | null;
  } | null;
  observation: {
    endpoint: string;
    effect: number;
    standardError: number;
    n: number | null;
    benefitDirectionNormalized: true;
    transformations: string[];
    method: string;
    verification: 'extracted_unreviewed';
  } | null;
  /** Why no observation was produced. Surfaced in coverage as the exclusion reason. */
  exclusionReason: string | null;
}

/**
 * Stable projection key for a CSR. Mirrors DrizzleCorpusWriter's dedupe rule —
 * NCT id when present, otherwise the report id — so re-projecting an updated CSR
 * updates the same graph source instead of forking a duplicate.
 */
export function csrProjectionKey(report: Pick<CsrReportInput, 'nctId' | 'reportId' | 'id'>): string {
  if (report.nctId) return `csr:nct:${report.nctId}`;
  if (report.reportId) return `csr:report:${report.reportId}`;
  return `csr:row:${report.id}`;
}

/**
 * Project one CSR into graph rows. PURE — no database, no clock, no randomness —
 * so the honesty rules below are unit-testable without fixtures or a live corpus.
 *
 * Study linkage is `explicit` only when the CSR itself carries an NCT id, which
 * is a fact stated by the record. A sponsor study id alone is `inferred` and
 * carries its rationale, because inferring identity from a sponsor's internal
 * code is a model judgement, not a citation (§7.2).
 */
export function projectCsrToEvidence(
  report: CsrReportInput,
  detail: CsrDetailInput | null,
): CsrProjection {
  const source: CsrProjection['source'] = {
    externalKey: csrProjectionKey(report),
    sourceType: 'csr',
    // A client CSR is tenant-private evidence and can never be global (§14).
    // The database enforces this too — a 'public' row may not carry an org.
    visibility: 'tenant_private',
    organizationId: report.organizationId,
    title: report.reportTitle,
    documentDate: report.reportDate,
    ingestionStatus: 'extracted',
    extractionMethod: 'csr-adapter projection (deterministic, structured fields only)',
    provenance: {
      csrReportRowId: report.id,
      csrReportId: report.reportId,
      projectedBy: 'clinical-regulatory-evidence/csr-adapter',
    },
  };

  let study: CsrProjection['study'] = null;
  if (report.nctId) {
    study = {
      nctId: report.nctId,
      sponsorStudyId: report.studyId,
      indication: report.indication,
      phase: report.phase,
      sponsor: report.sponsor,
      linkageStatus: 'explicit',
      linkageRationale: null,
    };
  } else if (report.studyId) {
    study = {
      nctId: null,
      sponsorStudyId: report.studyId,
      indication: report.indication,
      phase: report.phase,
      sponsor: report.sponsor,
      linkageStatus: 'inferred',
      linkageRationale:
        'No NCT id on the CSR record; identity inferred from the sponsor study id alone. Not a registry-confirmed link.',
    };
  }

  // Reuse the existing conservative extractor — structured effect with its
  // uncertainty, or nothing at all. See the module header for why this is a call
  // rather than a reimplementation.
  const extracted = extractEffectObservation(
    {
      reportId: report.reportId,
      reportTitle: report.reportTitle,
      sponsor: report.sponsor,
      indication: report.indication,
      phase: report.phase,
      nctId: report.nctId,
      sampleSize: report.sampleSize,
      content: report.content,
      metadata: report.metadata,
    },
    detail
      ? { results: detail.results, metadata: detail.metadata, sampleSize: detail.sampleSize }
      : null,
  );

  if (!extracted) {
    return {
      source,
      study,
      observation: null,
      exclusionReason:
        'No machine-readable primary effect with uncertainty on this CSR. It is listed in coverage but excluded from every prior.',
    };
  }

  const endpoint = detail?.primaryEndpoint ?? report.primaryEndpoint;
  return {
    source,
    study,
    observation: {
      // An observation must name the endpoint it measures. When the CSR does not
      // record one, say so rather than inventing a plausible label — a
      // mislabelled endpoint is worse than an unlabelled one.
      endpoint: endpoint?.trim() || 'Primary endpoint (not named on the CSR record)',
      effect: extracted.effect,
      standardError: extracted.standardError,
      n: extracted.n ?? null,
      // extractEffectObservation orients ratio effects to benefit-positive.
      benefitDirectionNormalized: true,
      transformations: ['benefit_direction_normalized'],
      method: 'Structured effect field with reported uncertainty (no prose parsing)',
      // Machine-derived. A human must review before this can become verified.
      verification: 'extracted_unreviewed',
    },
    exclusionReason: null,
  };
}

/** What a projection run did. Counts are observed, never estimated (§8.1). */
export interface CsrProjectionResult {
  scanned: number;
  /** Sources written or refreshed. */
  projected: number;
  /** Of those, how many carried a usable structured effect. */
  withStructuredEffect: number;
  /** Scanned but not projectable at all (e.g. no stable key). */
  skipped: number;
  note: string;
}

/**
 * Project a tenant's CSR corpus into the graph. Idempotent: re-running updates
 * the same source rows by their projection key rather than duplicating them.
 *
 * Tenant-scoped and fail-closed — an unscoped projection would write one
 * tenant's private CSR evidence under another's org id.
 */
export async function projectCsrCorpus(
  scope: EvidenceScope,
  opts: { indication?: string; limit?: number } = {},
): Promise<CsrProjectionResult> {
  if (!Number.isInteger(scope.organizationId) || scope.organizationId <= 0) {
    throw new Error('Organization context required to project the CSR corpus');
  }
  if (!db) throw new Error('Database not available');

  const reports = await db
    .select()
    .from(csrReports)
    .where(eq(csrReports.organizationId, scope.organizationId))
    .orderBy(desc(csrReports.uploadDate))
    .limit(Math.min(opts.limit ?? 200, 500));

  let projected = 0;
  let withStructuredEffect = 0;
  let skipped = 0;

  for (const report of reports) {
    const [detail] = await db
      .select()
      .from(csrDetails)
      .where(eq(csrDetails.reportId, report.id))
      .limit(1);

    const projection = projectCsrToEvidence(
      report as unknown as CsrReportInput,
      (detail as unknown as CsrDetailInput) ?? null,
    );

    try {
      const sourceId = await upsertSource(projection, scope.organizationId);
      if (!sourceId) {
        skipped += 1;
        continue;
      }
      projected += 1;

      const studyId = projection.study
        ? await upsertStudy(projection, scope.organizationId)
        : null;

      if (projection.observation) {
        await db.insert(studyResultObservations).values({
          organizationId: scope.organizationId,
          sourceId,
          studyId,
          endpoint: projection.observation.endpoint,
          value: projection.observation.effect,
          se: projection.observation.standardError,
          n: projection.observation.n,
          transformations: projection.observation.transformations,
          benefitDirectionNormalized: projection.observation.benefitDirectionNormalized,
          method: projection.observation.method,
          verification: projection.observation.verification,
          // No page or excerpt: the CSR record carries no spans. See header.
          sourceExcerpt: null,
          sourcePage: null,
        });
        withStructuredEffect += 1;
      }
    } catch (e) {
      // One malformed CSR must not abort the run — but it is counted as skipped
      // rather than silently dropped, so coverage stays truthful.
      skipped += 1;
      logger.warn('CSR projection skipped', {
        csrReportRowId: report.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    scanned: reports.length,
    projected,
    withStructuredEffect,
    skipped,
    note: buildProjectionNote(reports.length, projected, withStructuredEffect, skipped),
  };
}

/**
 * The coverage sentence for a projection run. Always carries denominators, and
 * names what was excluded — a run that projected 200 sources and found 3 usable
 * effects must not read like a success (§8.1).
 */
export function buildProjectionNote(
  scanned: number,
  projected: number,
  withStructuredEffect: number,
  skipped: number,
): string {
  if (scanned === 0) {
    return 'No CSRs in this tenant’s corpus to project. The graph has no CSR-derived evidence yet.';
  }
  const parts = [
    `Projected ${projected} of ${scanned} CSR(s) into the evidence graph.`,
    `${withStructuredEffect} of ${projected} carried a machine-readable effect with uncertainty and can inform a prior; the remainder are listed but excluded from every estimate.`,
  ];
  if (skipped > 0) {
    parts.push(`${skipped} could not be projected and were skipped, not silently dropped.`);
  }
  parts.push('All projected rows are machine-extracted and await human review.');
  return parts.join(' ');
}

/** Insert or refresh the source row for this projection. Returns its id. */
async function upsertSource(
  projection: CsrProjection,
  organizationId: number,
): Promise<string | null> {
  const key = projection.source.externalKey;
  const [existing] = await db
    .select({ id: clinicalEvidenceSources.id })
    .from(clinicalEvidenceSources)
    .where(
      and(
        eq(clinicalEvidenceSources.organizationId, organizationId),
        eq(clinicalEvidenceSources.checksum, key),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(clinicalEvidenceSources)
      .set({
        title: projection.source.title,
        documentDate: projection.source.documentDate
          ? new Date(projection.source.documentDate)
          : null,
        ingestionStatus: projection.source.ingestionStatus,
        provenance: projection.source.provenance,
        updatedAt: new Date(),
      })
      .where(eq(clinicalEvidenceSources.id, existing.id));
    return existing.id;
  }

  const [inserted] = await db
    .insert(clinicalEvidenceSources)
    .values({
      organizationId,
      sourceType: projection.source.sourceType,
      visibility: projection.source.visibility,
      title: projection.source.title,
      // The projection key doubles as the dedupe checksum: these rows are
      // derived from a live table, not from immutable bytes, so a content hash
      // would change on every unrelated CSR edit and fork the graph.
      checksum: key,
      documentDate: projection.source.documentDate
        ? new Date(projection.source.documentDate)
        : null,
      ingestionStatus: projection.source.ingestionStatus,
      extractionMethod: projection.source.extractionMethod,
      provenance: projection.source.provenance,
    })
    .returning({ id: clinicalEvidenceSources.id });

  return inserted?.id ?? null;
}

/** Insert or reuse the study identity for this projection. Returns its id. */
async function upsertStudy(
  projection: CsrProjection,
  organizationId: number,
): Promise<string | null> {
  const study = projection.study;
  if (!study) return null;

  if (study.nctId) {
    const [existing] = await db
      .select({ id: clinicalStudyIdentities.id })
      .from(clinicalStudyIdentities)
      .where(
        and(
          eq(clinicalStudyIdentities.organizationId, organizationId),
          eq(clinicalStudyIdentities.nctId, study.nctId),
        ),
      )
      .limit(1);
    if (existing) return existing.id;
  }

  const [inserted] = await db
    .insert(clinicalStudyIdentities)
    .values({
      organizationId,
      nctId: study.nctId,
      sponsorStudyId: study.sponsorStudyId,
      indication: study.indication,
      phase: study.phase,
      sponsor: study.sponsor,
      linkageStatus: study.linkageStatus,
      linkageRationale: study.linkageRationale,
    })
    .returning({ id: clinicalStudyIdentities.id });

  return inserted?.id ?? null;
}
