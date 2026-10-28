/** Bounded, resumable indexing over the existing CSR adapter. No new queue or
 * corpus. Failed and empty reports are not counted as successfully indexed. */
import type { CsrContentCoverage } from './csr-content-projection.js';
export interface CsrIndexOptions { limit?: number; afterId?: number }
export function parseCsrIndexOptions(value: CsrIndexOptions = {}) {
  const limit = value.limit ?? 100;
  const afterId = value.afterId ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500 || !Number.isSafeInteger(afterId) || afterId < 0)
    throw new RangeError('limit must be 1–500 and afterId a nonnegative safe integer');
  return { limit, afterId };
}
type Result = { total: number; embedded: number; skippedUnsupported: number; coverage?: CsrContentCoverage };
export interface CsrIndexDependencies {
  list: (organizationId: number, afterId: number, limit: number) => Promise<Array<{ id: number }>>;
  atomize: (organizationId: number, reportId: number) => Promise<Result | null>;
}
export async function runCsrIndexBatch(organizationId: number, options: CsrIndexOptions, deps: CsrIndexDependencies) {
  if (!Number.isSafeInteger(organizationId) || organizationId < 1) throw new RangeError('Valid organization required');
  const { limit, afterId } = parseCsrIndexOptions(options);
  const rows = await deps.list(organizationId, afterId, limit + 1);
  if (rows.length > limit + 1 || rows.some((r, i) => !Number.isSafeInteger(r.id) || r.id <= (i ? rows[i - 1].id : afterId)))
    throw new Error('CSR cursor query returned an invalid ordered page');
  const page = rows.slice(0, limit);
  const reports: Array<{ reportId: number; status: 'indexed' | 'partial' | 'empty' | 'failed'; atoms: number; embedded: number; coverage?: CsrContentCoverage }> = [];
  const summary = { scanned: page.length, indexed: 0, failed: 0, empty: 0, partial: 0, atoms: 0, embedded: 0,
    failures: [] as number[], hasMore: rows.length > limit,
    nextAfterId: rows.length > limit && page.length ? page[page.length - 1].id : null as number | null,
    reports, complete: false };
  for (const row of page) {
    try {
      const result = await deps.atomize(organizationId, row.id);
      if (!result || !Number.isSafeInteger(result.total) || result.total < 0 || !Number.isSafeInteger(result.embedded) || result.embedded < 0 || result.embedded > result.total || !Number.isSafeInteger(result.skippedUnsupported) || result.skippedUnsupported < 0)
        throw new Error('CSR indexing did not return a valid receipt');
      const status = result.total === 0 ? 'empty' : result.skippedUnsupported > 0 || result.coverage?.status === 'partial' || result.embedded < result.total ? 'partial' : 'indexed';
      if (status === 'empty') summary.empty++; else summary.indexed++;
      if (status === 'partial') summary.partial++;
      summary.atoms += result.total; summary.embedded += result.embedded;
      reports.push({ reportId: row.id, status, atoms: result.total, embedded: result.embedded, ...(result.coverage ? { coverage: result.coverage } : {}) });
    } catch {
      summary.failed++; summary.failures.push(row.id);
      reports.push({ reportId: row.id, status: 'failed', atoms: 0, embedded: 0 });
    }
  }
  summary.complete = summary.scanned > 0 && !summary.hasMore && !summary.failed && !summary.empty && !summary.partial;
  return summary;
}
