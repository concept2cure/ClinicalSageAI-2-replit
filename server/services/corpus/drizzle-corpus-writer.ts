/**
 * Drizzle-backed corpus writer.
 *
 * Persists a normalized CT.gov study into csr_reports + csr_details, keyed on
 * nct_id for idempotency. If a report with the same NCT id exists it is updated
 * in place (and its details refreshed); otherwise a new report+details pair is
 * created. Mirrors the insert shapes used by server/data-importer.ts.
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

export class DrizzleCorpusWriter implements CorpusWriter {
  constructor(private readonly organizationId: number = DEFAULT_ORG_ID) {}

  async upsert(study: NormalizedStudy): Promise<NormalizedStudyWriteResult> {
    const reportValues: CsrReportInsert = {
      title: study.report.title,
      sponsor: study.report.sponsor,
      indication: study.report.indication,
      phase: study.report.phase,
      status: study.report.status,
      date: study.report.date ?? undefined,
      summary: study.report.summary ?? undefined,
      nctId: study.nctId ?? undefined,
      organizationId: this.organizationId,
    };

    const detailValues: Omit<CsrDetailsInsert, 'reportId'> = {
      studyDesign: study.details.studyDesign ?? undefined,
      primaryObjective: study.details.primaryObjective ?? undefined,
      endpoints: study.details.endpoints ?? undefined,
      treatmentArms: study.details.treatmentArms ?? undefined,
      inclusionCriteria: study.details.inclusionCriteria ?? undefined,
      exclusionCriteria: study.details.exclusionCriteria ?? undefined,
      sampleSize: study.details.sampleSize ?? undefined,
      statisticalMethods: study.details.statisticalMethods ?? undefined,
      studyDuration: study.details.studyDuration ?? undefined,
      results: study.details.results ?? undefined,
      processed: true,
      organizationId: this.organizationId,
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
