/**
 * DB-backed reader for precedent benchmarking.
 *
 * Pulls the comparable trials for an indication + phase from the corpus
 * (csr_reports ⨝ csr_details), maps them to the pure {@link PrecedentTrial}
 * shape, and runs {@link computeBenchmark}. All statistical logic lives in the
 * pure module; this file is only the IO boundary, so the math stays unit-tested
 * without a database.
 *
 * Outcome mapping is honest: a trial counts toward the success-rate denominator
 * only when its registry status maps to a definite completed/failed outcome.
 * Ongoing/unknown statuses map to `null` (excluded from the rate), never to a
 * failure.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { csrReports, csrDetails } from 'shared/schema';
import {
  computeBenchmark,
  type PrecedentBenchmark,
  type PrecedentTrial,
} from './precedent-benchmark';

/** Map a free-text registry/CSR status to a definite outcome, or null. */
export function statusToOutcome(status: string | null | undefined): boolean | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s.includes('complete') || s === 'successful' || s === 'approved') return true;
  if (s.includes('terminat') || s.includes('withdraw') || s.includes('suspend') || s === 'failed')
    return false;
  return null; // recruiting, active, unknown, draft, in_review, submitted → not assessable
}

/** Extract endpoint measures from the csr_details.endpoints JSON, defensively. */
export function endpointsFromDetail(endpoints: unknown): string[] {
  if (!endpoints || typeof endpoints !== 'object') return [];
  const obj = endpoints as { primary?: unknown; secondary?: unknown };
  const out: string[] = [];
  for (const group of [obj.primary, obj.secondary]) {
    if (Array.isArray(group)) {
      for (const e of group) if (typeof e === 'string' && e.trim()) out.push(e.trim());
    }
  }
  return out;
}

export class PrecedentBenchmarkReader {
  /**
   * Build a benchmark for the given indication + phase from corpus trials.
   * Matching is exact on indication and phase (as stored by the normalizer).
   */
  async benchmark(indication: string, phase: string): Promise<PrecedentBenchmark> {
    const reports = await db
      .select({
        id: csrReports.id,
        status: csrReports.status,
        durationWeeks: csrReports.durationWeeks,
        sampleSize: csrReports.sampleSize,
        studyDesign: csrReports.studyDesign,
      })
      .from(csrReports)
      .where(and(eq(csrReports.indication, indication), eq(csrReports.phase, phase)));

    if (reports.length === 0) {
      return computeBenchmark(indication, phase, []);
    }

    const reportIds = reports.map(r => r.id);
    const details = await db
      .select()
      .from(csrDetails)
      .where(sql`${csrDetails.reportId} IN (${sql.join(reportIds, sql`, `)})`);

    const detailByReport = new Map<number, (typeof details)[number]>();
    for (const d of details) detailByReport.set(d.reportId, d);

    const trials: PrecedentTrial[] = reports.map(r => {
      const detail = detailByReport.get(r.id);
      return {
        sampleSize: r.sampleSize ?? detail?.sampleSize ?? null,
        durationWeeks: r.durationWeeks ?? null,
        studyDesign: r.studyDesign ?? detail?.studyDesign ?? null,
        endpoints: endpointsFromDetail(detail?.endpoints),
        outcome: statusToOutcome(r.status),
      };
    });

    return computeBenchmark(indication, phase, trials);
  }
}

export const precedentBenchmarkReader = new PrecedentBenchmarkReader();
