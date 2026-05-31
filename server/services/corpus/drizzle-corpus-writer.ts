/**
 * Drizzle-backed corpus writer.
 *
 * Persists a normalized CT.gov study into csr_reports + csr_details, keyed on
 * nct_id for idempotency. If a report with the same NCT id exists it is updated
 * in place (and its details refreshed); otherwise a new report+details pair is
 * created. Maps strictly to columns that exist in shared/schema.ts — fields the
 * registry provides that have no dedicated column (brief summary, treatment
 * arms, study duration, registry success hint) are preserved in the `metadata`
 * JSON so nothing is silently dropped and nothing is written to a non-existent
 * column.
 *
 * This is the production wiring for the CorpusWriter interface; the ingestion
 * orchestrator (ingest-ctgov.ts) stays IO-free and testable by depending on the
 * interface, not on this module.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { csrReports, csrDetails } from 'shared/schema';
import type { CorpusWriter, NormalizedStudyWriteResult } from './ingest-ctgov';
import type { NormalizedStudy } from './ctgov-normalizer';

const DEFAULT_ORG_ID = 1;

type CsrReportInsert = typeof csrReports.$inferInsert;
type CsrDetailsInsert = typeof csrDetails.$inferInsert;

/** Parse a "<n> weeks" duration string back to an integer count, or null. */
function durationToWeeks(duration: string | null): number | null {
  if (!duration) return null;
  const m = duration.match(/(\d+)\s*weeks?/i);
  return m ? Number(m[1]) : null;
}

export class DrizzleCorpusWriter implements CorpusWriter {
  constructor(private readonly organizationId: number = DEFAULT_ORG_ID) {}

  async upsert(study: NormalizedStudy): Promise<NormalizedStudyWriteResult> {
    // csr_reports.report_id is NOT NULL + UNIQUE; use the NCT id when present,
    // otherwise a deterministic title-derived key, so the row is well-formed and
    // re-ingestion stays idempotent.
    const reportKey = study.nctId ?? `ctgov:${study.report.title}`;

    const reportValues: CsrReportInsert = {
      organizationId: this.organizationId,
      reportId: reportKey,
      reportTitle: study.report.title,
      title: study.report.title,
      sponsor: study.report.sponsor,
      indication: study.report.indication,
      phase: study.report.phase,
      status: study.report.status,
      reportDate: study.report.date ?? undefined,
      durationWeeks: durationToWeeks(study.details.studyDuration) ?? undefined,
      studyDesign: study.details.studyDesign ?? undefined,
      sampleSize: study.details.sampleSize ?? undefined,
      nctId: study.nctId ?? undefined,
      // Fields without a dedicated column are kept in metadata, not dropped.
      metadata: {
        source: 'clinicaltrials.gov',
        summary: study.report.summary,
        successHint: study.successHint,
        treatmentArms: study.details.treatmentArms,
        studyDuration: study.details.studyDuration,
      },
    };

    const detailValues: Omit<CsrDetailsInsert, 'reportId'> = {
      studyDesign: study.details.studyDesign ?? undefined,
      primaryObjective: study.details.primaryObjective ?? undefined,
      endpoints: study.details.endpoints ?? undefined,
      inclusionCriteria: study.details.inclusionCriteria ?? undefined,
      exclusionCriteria: study.details.exclusionCriteria ?? undefined,
      sampleSize: study.details.sampleSize ?? undefined,
      statisticalMethods: study.details.statisticalMethods ?? undefined,
      results: study.details.results ?? undefined,
      metadata: {
        treatmentArms: study.details.treatmentArms,
        studyDuration: study.details.studyDuration,
      },
    };

    // Look up an existing report by NCT id (when present) for idempotency.
    const existing = study.nctId
      ? await db
          .select({ id: csrReports.id })
          .from(csrReports)
          .where(eq(csrReports.nctId, study.nctId))
          .limit(1)
      : [];

    if (existing.length > 0) {
      const reportId = existing[0].id;
      await db.update(csrReports).set(reportValues).where(eq(csrReports.id, reportId));
      // Refresh details: delete-then-insert keeps a single current detail row.
      await db.delete(csrDetails).where(eq(csrDetails.reportId, reportId));
      await db.insert(csrDetails).values({ ...detailValues, reportId });
      return 'updated';
    }

    const [report] = await db.insert(csrReports).values(reportValues).returning({
      id: csrReports.id,
    });
    await db.insert(csrDetails).values({ ...detailValues, reportId: report.id });
    return 'inserted';
  }
}
