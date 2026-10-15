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

/**
 * One comparable trial as the corpus records it. Every field is a stored value
 * or null — nothing is defaulted. `registryStatus` is the registry's status
 * (completed, terminated, …), which says whether the trial ran to completion,
 * not whether it met its endpoint.
 */
export interface ComparableTrial {
  id: number;
  title: string;
  sponsor: string | null;
  nctId: string | null;
  indication: string | null;
  phase: string | null;
  registryStatus: string | null;
  sampleSize: number | null;
  durationWeeks: number | null;
  studyDesign: string | null;
  primaryEndpoint: string | null;
  efficacyResults: string | null;
  safetyResults: string | null;
}

export interface PrecedentComparison {
  benchmark: PrecedentBenchmark;
  /** The comparable trials the benchmark was computed from, newest first. */
  trials: ComparableTrial[];
}

/** The first value that is present, or null. */
function first<T>(...values: Array<T | null | undefined>): T | null {
  for (const v of values) if (v !== null && v !== undefined) return v;
  return null;
}

type DetailRow = typeof csrDetails.$inferSelect;

function toComparableTrial(
  r: {
    id: number;
    title: string | null;
    reportTitle: string;
    sponsor: string | null;
    nctId: string | null;
    indication: string | null;
    phase: string | null;
    status: string;
    sampleSize: number | null;
    durationWeeks: number | null;
    studyDesign: string | null;
    primaryEndpoint: string | null;
  },
  detail: DetailRow | undefined
): ComparableTrial {
  return {
    id: r.id,
    title: first(r.title) ?? r.reportTitle,
    sponsor: r.sponsor,
    nctId: r.nctId,
    indication: r.indication,
    phase: r.phase,
    registryStatus: r.status,
    sampleSize: first(r.sampleSize, detail?.sampleSize),
    durationWeeks: r.durationWeeks,
    studyDesign: first(r.studyDesign, detail?.studyDesign),
    primaryEndpoint: first(
      r.primaryEndpoint,
      detail?.primaryEndpoint,
      endpointsFromDetail(detail?.endpoints)[0]
    ),
    efficacyResults: first(detail?.efficacyResults),
    safetyResults: first(detail?.safetyResults),
  };
}

export class PrecedentBenchmarkReader {
  /**
   * Build a benchmark for the given indication + phase from corpus trials.
   * Matching is exact on indication and phase (as stored by the normalizer).
   */
  async benchmark(indication: string, phase: string): Promise<PrecedentBenchmark> {
    return (await this.compare(indication, phase)).benchmark;
  }

  /**
   * The benchmark together with the trials it was computed from — one read, so
   * a caller listing the trials and quoting the benchmark is quoting the same
   * set. A failed read throws; it is never reported as "no comparable trials".
   */
  async compare(indication: string, phase: string): Promise<PrecedentComparison> {
    const reports = await db
      .select({
        id: csrReports.id,
        title: csrReports.title,
        reportTitle: csrReports.reportTitle,
        sponsor: csrReports.sponsor,
        nctId: csrReports.nctId,
        indication: csrReports.indication,
        phase: csrReports.phase,
        status: csrReports.status,
        durationWeeks: csrReports.durationWeeks,
        sampleSize: csrReports.sampleSize,
        studyDesign: csrReports.studyDesign,
        primaryEndpoint: csrReports.primaryEndpoint,
        reportDate: csrReports.reportDate,
      })
      .from(csrReports)
      .where(and(eq(csrReports.indication, indication), eq(csrReports.phase, phase)));

    if (reports.length === 0) {
      return { benchmark: computeBenchmark(indication, phase, []), trials: [] };
    }

    const reportIds = reports.map(r => r.id);
    const details = await db
      .select()
      .from(csrDetails)
      .where(sql`${csrDetails.reportId} IN (${sql.join(reportIds, sql`, `)})`);

    const detailByReport = new Map<number, (typeof details)[number]>();
    for (const d of details) detailByReport.set(d.reportId, d);

    const precedent: PrecedentTrial[] = reports.map(r => {
      const detail = detailByReport.get(r.id);
      return {
        sampleSize: r.sampleSize ?? detail?.sampleSize ?? null,
        durationWeeks: r.durationWeeks ?? null,
        studyDesign: r.studyDesign ?? detail?.studyDesign ?? null,
        endpoints: endpointsFromDetail(detail?.endpoints),
        outcome: statusToOutcome(r.status),
      };
    });

    const trials = reports
      .map(r => ({
        trial: toComparableTrial(r, detailByReport.get(r.id)),
        reportDate: r.reportDate,
      }))
      .sort(
        (a, b) =>
          String(b.reportDate ?? '').localeCompare(String(a.reportDate ?? '')) ||
          b.trial.id - a.trial.id
      )
      .map(x => x.trial);

    return { benchmark: computeBenchmark(indication, phase, precedent), trials };
  }
}

export const precedentBenchmarkReader = new PrecedentBenchmarkReader();
