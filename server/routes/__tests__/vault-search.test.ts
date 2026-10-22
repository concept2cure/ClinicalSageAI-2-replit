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

/* The current-access gate (installProjectRouteAccess, 14362ef00) admits every
   /:id on a current member of the caller's organization. Its reads are answered
   from seats (support/current-member.ts); an unseated caller or program is
   refused exactly as the real gate refuses. */
vi.mock('../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('../c2c/__tests__/support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});

import createProjectVaultRoutes from '../c2c/project-vault';
import { clearSeats, seatMember, seatProgram } from '../c2c/__tests__/support/current-member';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const USER = 3;

function app(org: number | null = 7) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: USER };
    // The request's own connection, which the production request scope supplies.
    (req as unknown as { dbClient: unknown }).dbClient = { query };
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
  // The current member is seated; the program only when it is this org's.
  clearSeats();
  seatMember(7, USER, 'member');
  if (programFound) seatProgram(7, PROGRAM);
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
  it('refuses without organization context, concealed as 404 on a read, and searches nothing', async () => {
    // The current-access gate refuses a caller with no organization actor
    // (403 PROJECT_ACTOR_REQUIRED) and, on a GET, conceals every 403 as the 404
    // a missing project answers (sendProjectAccessFailure, 14362ef00).
    store();
    const res = await request(app(null)).get(url('stability'));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('PROJECT_NOT_FOUND');
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not a current member, concealed as 404, and searches nothing', async () => {
    store();
    clearSeats();
    seatProgram(7, PROGRAM);
    const res = await request(app()).get(url('stability'));
    expect(res.status).toBe(404);
    expect(query).not.toHaveBeenCalled();
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
    /* Matched on the SHAPE of the paging clause, not on `$3`/`$4`, and read from
       the END of the parameter list where limit and offset always sit. Pinning
       the placeholder NUMBERS coupled this assertion to how many predicates
       happen to precede them: adding the organization_id predicate to the
       statement shifted them to $4/$5, `find` returned undefined, and the test
       stopped checking the clamp. It failed loudly here, but the same shape one
       `?.` away from an optional assertion is how a test goes quiet instead. */
    const page = query.mock.calls.find(c => /LIMIT \$\d+ OFFSET \$\d+/.test(String(c[0])));
    expect(page, 'no paged query was issued').toBeDefined();
    const params = page![1] as unknown[];
    expect(params.slice(-2)).toEqual([100, 0]);
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
    store();
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

/* VR-18 (Veeva gap 7 slice B, row D2): metadata filters on the same search.
   A value outside the Vault's vocabularies is refused by name before the
   corpus is read; a dropped filter would answer a wider question than the one
   asked. Filters with no text browse instead of answering EMPTY_QUERY. */
describe('metadata filters', () => {
  const vaultReads = () => query.mock.calls.filter(c => /FROM vault\.documents d/.test(String(c[0])));

  it.each([
    ['classification=SECRET', 'classification'],
    ['documentType=memo', 'documentType'],
    ['evidenceKind=gossip', 'evidenceKind'],
    ['placementStatus=done', 'placementStatus'],
    ['ctdSection=banana', 'ctdSection'],
    ['lifecycleStage=archived', 'lifecycleStage'],
    ['folderId=module-9', 'folderId'],
  ])('refuses %s by name, with no corpus read', async (qs, parameter) => {
    store({ total: 3, rows: [HIT] });
    const res = await request(app()).get(`${url('stability')}&${qs}`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: 'INVALID_FILTER', parameter });
    expect(vaultReads()).toHaveLength(0);
  });

  it('names the allowed values for a closed vocabulary', async () => {
    store();
    const res = await request(app()).get(`${url('stability')}&classification=SECRET`);
    expect(res.body.allowed).toEqual(['CONFIDENTIAL', 'INTERNAL', 'CONTROLLED', 'PUBLIC']);
  });

  it('refuses processingStatus, which the Vault does not record', async () => {
    store();
    const res = await request(app()).get(`${url('stability')}&processingStatus=INDEXED`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'UNSUPPORTED_PARAMETER', parameter: 'processingStatus' });
    expect(vaultReads()).toHaveLength(0);
  });

  it('browses on filters alone, rather than answering EMPTY_QUERY', async () => {
    store({ total: 1, rows: [{ ...HIT, evidence_kind: 'report', classification: 'CONTROLLED', lifecycle_stage: 'approved', updated_at: '2026-10-02T00:00:00Z' }] });
    const res = await request(app()).get(`${url('')}&documentType=REPORT&documentType=SAR`);
    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBeUndefined();
    expect(res.body.data.mode).toBe('browse');
    expect(res.body.data.filters).toEqual({ documentTypes: ['REPORT', 'SAR'] });
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.results[0]).toMatchObject({ evidenceKind: 'report', classification: 'CONTROLLED', lifecycleStage: 'approved', updatedAt: '2026-10-02T00:00:00.000Z' });
    expect(vaultReads()).toHaveLength(2);
    // No text, so no text match: browse is not a search that matched everything.
    // The query is bound as null and the predicate holds no full-text match.
    for (const [sql, params] of vaultReads()) {
      expect((params as unknown[])[1]).toBeNull();
      expect(String(sql).slice(String(sql).search(/\n\s*WHERE\s/))).not.toMatch(/@@/);
    }
  });

  it('binds filter values after the organisation, query and program list', async () => {
    store({ total: 0 });
    await request(app()).get(`${url('stability')}&classification=CONTROLLED&ctdSection=m3.2.p`);
    const [counted] = vaultReads();
    const params = counted[1] as unknown[];
    expect(params[0]).toBe(7);
    expect(params[1]).toBe('stability');
    expect(params.slice(3)).toEqual([['CONTROLLED'], ['3.2.P'], ['3.2.P.%']]);
  });

  it('the library search refuses a folder (one project\'s cabinet) and a malformed project id', async () => {
    store();
    const lib = (qs: string) => request(app()).get(`/api/c2c/project-vault/search?q=stability&${qs}`);
    const folder = await lib('folderId=module-3');
    expect(folder.status).toBe(400);
    expect(folder.body.parameter).toBe('folderId');
    const program = await lib('programId=not-a-uuid');
    expect(program.status).toBe(400);
    expect(program.body.parameter).toBe('programId');
    expect(vaultReads()).toHaveLength(0);
  });
});
