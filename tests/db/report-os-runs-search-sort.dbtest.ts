/**
 * GET /api/report-os/runs — `search` and `sortBy` must be applied by the
 * DATABASE, before `limit`, not in JavaScript after it.
 *
 * ── The defect (2026-10-11 reporting coverage review, C-1) ───────────────────
 * The handler used to SELECT the newest `limit` rows ordered by createdAt, then
 * filter by `search` and re-sort by `sortBy` over that array. Both operations
 * therefore saw only the window:
 *
 *   • A search could match only inside the newest `limit` rows that passed the
 *     equality filters. An operator searching for a run that is the 900th
 *     newest got `{"data": []}` — an honest-looking empty table for a run that
 *     exists, with no offset or cursor anywhere in the API to reach past the
 *     window. The failure mode this repo's working agreement names exactly:
 *     "an error is never rendered as an empty result", and a hidden match reads
 *     as an authoritative "no such run".
 *   • `sortBy` only reordered the same window, so `?sortBy=confidence&limit=10`
 *     returned the ten highest-confidence runs AMONG the newest `limit`, never
 *     the organisation's true top ten — while presenting them as if it had.
 *
 * ── Why this is a real-database test ────────────────────────────────────────
 * The fix is SQL: a nine-predicate `OR` of `strpos(lower(...), lower(term))`,
 * a `->> 'registryId'` JSON path, `COALESCE` NULL ordering, and an `id`
 * tiebreaker. A mocked pool returns whatever the mock is told to return and
 * would pass against the defect as readily as against the fix. Only PostgreSQL
 * can say whether that query selects the row.
 *
 * Every assertion below is written so it FAILS on the pre-fix handler. The
 * needle rows are deliberately the OLDEST in the organisation and there are
 * more than `limit` newer ones, so a JavaScript filter over the window cannot
 * see them.
 *
 * Read through the real router on the shared two-tenant fixture: `app_service`,
 * not superuser, no BYPASSRLS, `app.rls_enforce=on`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import reportOsRouter from '../../server/routes/report-os';
import {
  TAG,
  ORG_A,
  ORG_B,
  owner,
  tokenA,
  tokenB,
  ids,
  auth,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

const TYPE_ID = `${TAG}.runs_search_sort`;
/** Must start with the TAG so the fixture teardown's LIKE sweep removes it. */
const TYPE_LABEL = `${TAG} runs search and sort`;

/** `limit` is capped at 500 by listRunsSchema, so the window is at most 500. */
const MAX_LIMIT = 500;
const FILLER = 520;

/* Distinctive enough that no other suite's rows can satisfy a search for it. */
const NEEDLE_SCOPE = `needle-scope-${TAG}`;
const NEEDLE_REGISTRY = `needle-registry-${TAG}`;
/* A literal percent sign. Under `ILIKE '%' || term || '%'` this would be a
   wildcard and match every row; under strpos it matches only itself. */
const PERCENT_SCOPE = `pct-100%-${TAG}`;

const ro = express();
ro.use(express.json());
ro.use('/api/report-os', reportOsRouter);

const runs = (
  query: string,
  token = tokenB,
): Promise<request.Response> =>
  request(ro).get(`/api/report-os/runs?${query}`).set(auth(token));

const rowsOf = (res: request.Response): any[] => {
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
};

/** Ids of the two runs that deliberately share the newest created_at. */
let tiedIds: number[] = [];
let needleScopeRunId = 0;
let needleRegistryRunId = 0;
let topConfidenceRunId = 0;
let unscoredRunId = 0;

const insertRun = async (opts: {
  org: number;
  scopeId: string;
  createdAt: string;
  confidence?: number | null;
  registryId?: string | null;
  status?: string;
}): Promise<number> => {
  const summary =
    opts.registryId == null
      ? { summary: {} }
      : { summary: { regulatory: { registryId: opts.registryId, regionCode: 'USA_FDA', agency: 'FDA' } } };
  const { rows } = await owner.query(
    `INSERT INTO report_runs
       (organization_id, scope_type, scope_id, report_type_id, status,
        dependency_summary, confidence, created_at)
     VALUES ($1,'project',$2,$3,$4,$5::json,$6,$7::timestamp)
     RETURNING id`,
    [
      opts.org,
      opts.scopeId,
      TYPE_ID,
      opts.status ?? 'complete',
      JSON.stringify(summary),
      opts.confidence ?? null,
      opts.createdAt,
    ],
  );
  return Number(rows[0].id);
};

beforeAll(async () => {
  await provisionTwoTenantFixture();
  await owner.query(
    `INSERT INTO report_type_registry (type_id,label,family,allowed_scopes)
     VALUES ($1,$2,'readiness','["project"]'::json)`,
    [TYPE_ID, TYPE_LABEL],
  );

  /* ── The needles: oldest rows in the organisation ──────────────────────────
     Dated 2001 so no row any other suite writes can be older, and so the
     ordering below is a property of the data rather than of insertion order.
     The top confidence lives here too: 0.99 on the OLDEST row, which is the
     one a window-bounded sort can never reach. */
  needleScopeRunId = await insertRun({
    org: ORG_B,
    scopeId: NEEDLE_SCOPE,
    createdAt: '2001-01-01 00:00:00',
    confidence: 99,
  });
  topConfidenceRunId = needleScopeRunId;
  needleRegistryRunId = await insertRun({
    org: ORG_B,
    scopeId: ids.B.projects,
    createdAt: '2001-01-02 00:00:00',
    registryId: NEEDLE_REGISTRY,
    confidence: 10,
  });
  await insertRun({
    org: ORG_B,
    scopeId: PERCENT_SCOPE,
    createdAt: '2001-01-03 00:00:00',
    confidence: 20,
  });

  /* One run with NO confidence at all, to pin the null ordering below. */
  unscoredRunId = await insertRun({
    org: ORG_B,
    scopeId: ids.B.projects,
    createdAt: '2001-01-05 00:00:00',
    confidence: null,
  });

  /* The same needle under the OTHER tenant, so a search that matched it would
     be a cross-tenant read rather than a window bug. */
  await insertRun({
    org: ORG_A,
    scopeId: NEEDLE_SCOPE,
    createdAt: '2001-01-04 00:00:00',
    confidence: 98,
  });

  /* FILLER newer rows, so the needles sit outside any permitted window. Their
     confidences stay below 99 so the global maximum remains on the 2001 row.
     One batch INSERT: 520 round trips is 520 round trips. */
  await owner.query(
    `INSERT INTO report_runs
       (organization_id, scope_type, scope_id, report_type_id, status,
        dependency_summary, confidence, created_at)
     SELECT $1,'project',$2,$3,'complete','{"summary":{}}'::json,
            50 + (g % 7),
            timestamp '2010-01-01 00:00:00' + (g || ' minutes')::interval
       FROM generate_series(1,$4::int) AS g`,
    [ORG_B, ids.B.projects, TYPE_ID, FILLER],
  );

  /* Two rows sharing the newest created_at, to pin the id tiebreaker. A batch
     generate stamps several runs in the same millisecond, and without a
     tiebreaker PostgreSQL may return them in either order — so `limit=1`
     could answer differently for two identical requests. */
  const tieAt = '2030-06-01 00:00:00';
  tiedIds = [
    await insertRun({ org: ORG_B, scopeId: ids.B.projects, createdAt: tieAt, confidence: 30 }),
    await insertRun({ org: ORG_B, scopeId: ids.B.projects, createdAt: tieAt, confidence: 30 }),
  ];
}, 180_000);

afterAll(async () => {
  if (owner) {
    await owner.query('DELETE FROM report_runs WHERE report_type_id = $1', [TYPE_ID]);
    await owner.query('DELETE FROM report_type_registry WHERE type_id = $1', [TYPE_ID]);
  }
  await teardownTwoTenantFixture();
}, 120_000);

describe('GET /runs applies search and sort in SQL, before the limit', () => {
  it('finds a run older than the window — the defect, stated as a count', async () => {
    /* The pre-fix handler took the newest 500 and filtered in JS. This run is
       the OLDEST of 500+ in the organisation, so it was never in that array:
       the response was `{"data": []}` for a run that exists. */
    const rows = rowsOf(await runs(`search=${encodeURIComponent(NEEDLE_SCOPE)}&limit=${MAX_LIMIT}`));
    expect(rows.map((r) => r.id)).toEqual([needleScopeRunId]);
    expect(rows[0].scopeId).toBe(NEEDLE_SCOPE);
  });

  it('searches the regional fields through their JSON path, not a parsed copy', async () => {
    /* registryId is read with `dependency_summary -> 'summary' -> 'regulatory'
       ->> 'registryId'`. The row must also CARRY that value, which is what
       proves the searched expression and the selected one are the same one —
       a search that matched while the column came back null would mean two
       different paths. */
    const rows = rowsOf(await runs(`search=${encodeURIComponent(NEEDLE_REGISTRY)}&limit=${MAX_LIMIT}`));
    expect(rows.map((r) => r.id)).toEqual([needleRegistryRunId]);
    expect(rows[0].registryId).toBe(NEEDLE_REGISTRY);
    expect(rows[0].agency).toBe('FDA');
  });

  it('treats % as a character, not a wildcard', async () => {
    /* `ILIKE '%' || term || '%'` would make this term match every row in the
       organisation. strpos matches the one row that contains a literal %. */
    const rows = rowsOf(await runs(`search=${encodeURIComponent('100%')}&limit=${MAX_LIMIT}`));
    expect(rows.map((r) => r.scopeId)).toEqual([PERCENT_SCOPE]);

    /* And a bare % finds only rows containing one — not everything. */
    const bare = rowsOf(await runs(`search=${encodeURIComponent('%')}&limit=${MAX_LIMIT}`));
    expect(bare.length, 'a bare % must not behave as "match all"').toBe(1);
    expect(bare[0].scopeId).toBe(PERCENT_SCOPE);
  });

  it('matches within one field, never across a field boundary', async () => {
    /* Nine separate predicates, not one concatenated haystack. A haystack of
       `scope_type || scope_id || status` would let "projectneedle" match a
       scope_type of "project" adjoining a scope_id starting "needle", which the
       JavaScript `.some()` this replaces never did. */
    const rows = rowsOf(await runs(`search=${encodeURIComponent(`project${NEEDLE_SCOPE}`)}&limit=${MAX_LIMIT}`));
    expect(rows).toEqual([]);
  });

  it('reports how many matched, so the client can say when a window truncated', async () => {
    const res = await runs(`search=${encodeURIComponent(ids.B.projects)}&limit=10`);
    const rows = rowsOf(res);
    expect(rows).toHaveLength(10);
    expect(res.body.meta).toMatchObject({ returned: 10, limit: 10 });
    expect(res.body.meta.matched).toBeGreaterThan(10);

    /* Absent without a search: the count is a second query, and the window can
       only hide a match the reader explicitly asked for. */
    const unsearched = await runs('limit=10');
    rowsOf(unsearched);
    expect(unsearched.body.meta).toBeUndefined();
  });

  it('sorts over the whole organisation, not over the window', async () => {
    /* `confidence` is an integer 0-100. The global maximum is 99, on the
       OLDEST run. The pre-fix handler sorted the newest 500 — whose highest is
       56 — and presented that as the top of the list. */
    const rows = rowsOf(await runs(`sortBy=confidence&sortOrder=desc&limit=1`));
    expect(rows.map((r) => r.id)).toEqual([topConfidenceRunId]);
    expect(rows[0].confidence).toBe(99);
  });

  it('orders a null confidence below every real score, as the sentinel it replaces did', async () => {
    /* The JS comparator used `?? -1`. `COALESCE(confidence, -1)` reproduces it,
       so adding ORDER BY did not quietly change which row comes first. Asserted
       against two KNOWN rows rather than by scanning for a null, so the case
       cannot quietly stop being exercised if another suite's rows change: the
       unscored run must come before the one scoring 10, which is itself the
       lowest score this suite writes. */
    const rows = rowsOf(await runs(`sortBy=confidence&sortOrder=asc&limit=${MAX_LIMIT}`));
    const unscoredAt = rows.findIndex((r) => r.id === unscoredRunId);
    const lowestScoredAt = rows.findIndex((r) => r.id === needleRegistryRunId);
    expect(unscoredAt, 'the unscored run is in the page').toBeGreaterThanOrEqual(0);
    expect(lowestScoredAt, 'the lowest-scored run is in the page').toBeGreaterThanOrEqual(0);
    expect(unscoredAt).toBeLessThan(lowestScoredAt);
    expect(rows[unscoredAt].confidence).toBeNull();
    expect(rows[lowestScoredAt].confidence).toBe(10);
  });

  it('breaks a created_at tie by id, so two identical requests agree', async () => {
    const once = rowsOf(await runs('limit=1'));
    const twice = rowsOf(await runs('limit=1'));
    expect(once.map((r) => r.id)).toEqual(twice.map((r) => r.id));
    /* Newest createdAt is shared by two rows; desc id decides. */
    expect(once[0].id).toBe(Math.max(...tiedIds));
  });

  it('still scopes to the session organisation', async () => {
    /* The same needle exists under ORG_A. Pushing the search into SQL must not
       have widened what a tenant can reach. */
    const mine = rowsOf(await runs(`search=${encodeURIComponent(NEEDLE_SCOPE)}&limit=${MAX_LIMIT}`, tokenA));
    expect(mine.map((r) => r.organizationId)).toEqual([ORG_A]);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).not.toBe(needleScopeRunId);
  });
});
