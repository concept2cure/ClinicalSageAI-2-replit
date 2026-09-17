/**
 * WO-16C finding 42 — the unified work view rolled up a complete-looking total
 * over sources it never read.
 *
 * `loadUnifiedWork` (server/services/unified-work/unified-work-view.ts) reads
 * four independent trackers — project_tasks, c2c_project_work_items,
 * estar_submissions, unified_tasks. Each SELECT ended in `.catch(() => [])`,
 * with no error parameter, so a rejected query (a column dropped by migration
 * drift, a per-table permission error, a statement timeout, a pool lost after
 * boot) contributed zero rows with no log line and no marker.
 * `summarizeUnifiedWork` then rolled up whatever survived, and the returned
 * shape — `{ items, summary }` — carried nothing that distinguishes "the table
 * is empty" from "the query failed", while the function's own docstring claimed
 * "the summary counts make the shortfall visible". GET
 * /api/submission-ops/unified-work shipped that as HTTP 200 and appended a
 * hard-coded `sources: ['project_tasks','c2c_project_work_items',
 * 'estar_submissions']` — a completeness assertion nothing checked, stale since
 * unified_tasks became the fourth source. The Workbench "Tasks and reviews"
 * header then under-stated off-board work, or — when the failing source held all
 * of it — printed nothing at all beneath the standing claim "Everything assigned
 * across the portfolio".
 *
 * HOW THE FAILURE IS INJECTED: at the dependency, one level below the ORM. The
 * process-wide `pg` stub's `query()` rejects the SELECT against a chosen table
 * with a Postgres permission error and answers every other query the way a
 * database would. Nothing in the module under test is mocked; only the scoped
 * logger is intercepted, to read the line an operator would be given.
 *
 * RED on the pre-fix head: the result carries no `sources` and no
 * `summary.partial`, so a failed read reaches the surface as a zero.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPool } from '../../setup';
import { assertNoVerdictClaims } from '../../../scripts/ci/lib/verdict-inspector.mjs';

const logs = vi.hoisted(() => ({ error: [] as Array<{ msg: string; ctx: unknown }> }));

vi.mock('../../../server/utils/logger', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../server/utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: (msg: string, ctx?: unknown) => void logs.error.push({ msg, ctx }),
    }),
  };
});

import { loadUnifiedWork } from '../../../server/services/unified-work/unified-work-view';

/** What a per-table GRANT failure looks like coming out of the driver. */
const denied = (table: string) =>
  Object.assign(new Error(`permission denied for table ${table}`), { code: '42501' });

function queryText(arg: unknown): string {
  return typeof arg === 'string' ? arg : String((arg as { text?: string })?.text ?? '');
}

const originalQuery = mockPool.query;

/** Reject the SELECT against each named table; answer every other query. */
function failReadsOf(...tables: string[]) {
  (mockPool as { query: unknown }).query = vi.fn(async (arg: unknown) => {
    const text = queryText(arg);
    const hit = tables.find(t => text.includes(`from "${t}"`));
    if (hit) throw denied(hit);
    return { rows: [], rowCount: 0 };
  });
}

const ALL_SOURCES = [
  'project_tasks',
  'c2c_project_work_items',
  'estar_submissions',
  'unified_tasks',
] as const;

beforeEach(() => {
  logs.error.length = 0;
  failReadsOf(); // every query answers normally unless a test says otherwise
});

afterEach(() => {
  (mockPool as { query: unknown }).query = originalQuery;
});

describe('unified work view: a count only over the sources that were read', () => {
  it('names the source whose SELECT failed instead of counting it as zero rows', async () => {
    failReadsOf('project_tasks');

    const view = await loadUnifiedWork({ organizationId: 7 });

    expect(view.sources.project_tasks.ran).toBe(false);
    expect(view.sources.c2c_project_work_items.ran).toBe(true);
    expect(view.sources.estar_submissions.ran).toBe(true);
    expect(view.sources.unified_tasks.ran).toBe(true);
    // The counts below it are a floor, not a total, and say so.
    expect(view.summary.partial).toBe(true);
  });

  it('gives the operator the driver reason in the log, and not to the client', async () => {
    failReadsOf('estar_submissions');

    const view = await loadUnifiedWork({ organizationId: 7, projectId: 3 });

    const logged = logs.error.map(l => `${l.msg} ${JSON.stringify(l.ctx)}`).join('\n');
    expect(logged).toContain('estar_submissions');
    expect(logged).toContain('42501'); // the real reason reaches the log
    const read = view.sources.estar_submissions;
    if (read.ran) throw new Error('expected the filings read to be marked as not run');
    // …and not the response: a relation name / driver string in a body is an
    // information-disclosure finding (see scripts/ci/check-server-error-leaks.mjs).
    expect(read.reason).not.toMatch(/permission denied/);
    expect(read.reason.length).toBeGreaterThan(0);
  });

  it('does not present "nothing outstanding" when every source rejected', async () => {
    failReadsOf(...ALL_SOURCES);

    const view = await loadUnifiedWork({ organizationId: 7 });

    expect(view.items).toEqual([]);
    expect(view.summary.total).toBe(0);
    expect(view.summary.blocking).toBe(0);
    expect(view.summary.partial).toBe(true);
    expect(ALL_SOURCES.every(t => view.sources[t].ran === false)).toBe(true);
    assertNoVerdictClaims(view, 'loadUnifiedWork (every source rejected)');
  });

  it('marks a clean read complete — four empty tables are not a degraded view', async () => {
    const view = await loadUnifiedWork({ organizationId: 7 });

    expect(view.summary.partial).toBe(false);
    expect(ALL_SOURCES.every(t => view.sources[t].ran === true)).toBe(true);
    expect(logs.error).toHaveLength(0);
  });
});
