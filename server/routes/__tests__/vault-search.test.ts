/**
 * GET /api/c2c/project-vault/:id/search — the vault search that did not exist.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Vault.tsx has exactly one `<input>` and it is the file picker. There was no
 * search box on a document management system, and the only text filtering
 * anywhere on the surface was a client-side substring match over the rows
 * already in memory — so it could not match document CONTENT, and it silently
 * missed everything the folder tree had not loaded.
 *
 * That is worse than slow. A reviewer who cannot find a document concludes it is
 * absent, and in a regulated vault "absent" is a finding.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * The three ways a search endpoint on governed data goes wrong, all refusals
 * rather than results:
 *
 *   TENANT.       The programme is re-checked against the caller's organization
 *                 before any of its documents are listed, exactly as the read
 *                 and download routes do. A programme id alone reaches nothing.
 *   EMPTY QUERY.  An empty box is not "match everything". Returning the whole
 *                 vault would make an unused search look like a search that
 *                 found all of it.
 *   FAILURE.      A search that ERRORED and a search that found nothing are the
 *                 same screen unless the route distinguishes them, and the
 *                 second is the one a reviewer believes. An error is a 500 with
 *                 a message saying nothing was searched — never an empty list.
 *
 * The SQL itself (ranking, weighting, snippet, soft-delete exclusion, and that
 * arbitrary user text cannot raise) is exercised against real PostgreSQL rather
 * than mocked — the index expression has to match character-for-character or the
 * query silently falls back to a sequential scan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query, connect: vi.fn() } }));

import createProjectVaultRoutes from '../c2c/project-vault';

const PROGRAM = '11111111-1111-4111-8111-111111111111';

function app(org: number | null = 7) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: 3 };
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

const url = (q?: string, extra = '') =>
  `/api/c2c/project-vault/${PROGRAM}/search${q === undefined ? '' : `?q=${encodeURIComponent(q)}`}${extra}`;

/** Programme found (or not), then the count, then the page. */
function store(opts: { programFound?: boolean; total?: number; rows?: Record<string, unknown>[] } = {}) {
  const { programFound = true, total = 0, rows = [] } = opts;
  query.mockImplementation(async (sql: string) => {
    if (/SELECT\s+id\s+FROM\s+regulatory_programs/.test(sql)) {
      return { rows: programFound ? [{ id: PROGRAM }] : [] };
    }
    if (/count\(\*\)/.test(sql)) return { rows: [{ total }] };
    return { rows };
  });
}

const HIT = {
  id: '22222222-2222-4222-8222-222222222222',
  document_title: 'Stability Report',
  file_name: 'stability.pdf',
  document_type: 'REPORT',
  file_size: 2048,
  folder_id: 'module-3',
  ctd_section: '3.2.P.8',
  placement_status: 'confirmed',
  rank: 0.9,
  snippet: 'the <b>stability</b> of the formulation',
};

beforeEach(() => query.mockReset());

describe('tenant scope', () => {
  it('403s without organization context', async () => {
    store();
    const res = await request(app(null)).get(url('stability'));
    expect(res.status).toBe(403);
  });

  it("404s when the programme is not this org's, and never searches it", async () => {
    store({ programFound: false });
    const res = await request(app()).get(url('stability'));
    expect(res.status).toBe(404);
    // The ownership check ran; no search query followed it.
    const searched = query.mock.calls.some(c => /websearch_to_tsquery/.test(String(c[0])));
    expect(searched).toBe(false);
  });

  it('404s on a non-uuid programme id rather than 500ing on the cast', async () => {
    store();
    const res = await request(app()).get('/api/c2c/project-vault/not-a-uuid/search?q=x');
    expect(res.status).toBe(404);
  });
});

describe('empty query', () => {
  it('returns no results rather than the whole vault', async () => {
    store({ total: 999, rows: [HIT] });
    const res = await request(app()).get(url(''));
    expect(res.status).toBe(200);
    expect(res.body.data.results).toEqual([]);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.reason).toBe('EMPTY_QUERY');
  });

  it('does not query at all for an absent or whitespace query', async () => {
    store({ total: 999, rows: [HIT] });
    await request(app()).get(url());
    await request(app()).get(url('   '));
    expect(query.mock.calls.some(c => /websearch_to_tsquery/.test(String(c[0])))).toBe(false);
  });
});

describe('results', () => {
  it('returns the page and the REAL total, not the page length', async () => {
    // So the surface can say "1 of 340" instead of implying the page is all of it.
    store({ total: 340, rows: [HIT] });
    const res = await request(app()).get(url('stability'));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(340);
    expect(res.body.data.results).toHaveLength(1);
    expect(res.body.data.results[0]).toMatchObject({
      id: HIT.id,
      title: 'Stability Report',
      ctdSection: '3.2.P.8',
    });
  });

  it('carries a body snippet when the match was in the content', async () => {
    store({ total: 1, rows: [HIT] });
    const res = await request(app()).get(url('stability'));
    expect(res.body.data.results[0].snippet).toContain('stability');
  });

  it('omits an empty snippet rather than rendering a blank line', async () => {
    store({ total: 1, rows: [{ ...HIT, snippet: '   ' }] });
    const res = await request(app()).get(url('stability'));
    expect(res.body.data.results[0].snippet).toBeNull();
  });

  it('clamps limit and offset to a sane page', async () => {
    store({ total: 5, rows: [] });
    await request(app()).get(url('x', '&limit=99999&offset=-4'));
    const page = query.mock.calls.find(c => /LIMIT \$3 OFFSET \$4/.test(String(c[0])));
    expect(page?.[1]?.[2]).toBe(100);
    expect(page?.[1]?.[3]).toBe(0);
  });

  it('reports an honest zero when nothing matches', async () => {
    store({ total: 0, rows: [] });
    const res = await request(app()).get(url('nothingmatchesthis'));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.reason).toBeUndefined();
  });
});

describe('failure is not an empty result', () => {
  it('500s with a message saying nothing was searched', async () => {
    query.mockImplementation(async (sql: string) => {
      if (/SELECT\s+id\s+FROM\s+regulatory_programs/.test(sql)) return { rows: [{ id: PROGRAM }] };
      // Only the SEARCH fails. A blanket throw also breaks the audit service's
      // load-time table init, which shares this pool and would surface as an
      // unhandled rejection unrelated to what is under test.
      if (/websearch_to_tsquery/.test(sql)) throw new Error('index unavailable');
      return { rows: [] };
    });

    const res = await request(app()).get(url('stability'));

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('SEARCH_FAILED');
    // The distinction a reviewer needs: this is not "no documents match".
    expect(res.body.message).toMatch(/not an empty result/i);
    expect(res.body.data).toBeUndefined();
  });
});
