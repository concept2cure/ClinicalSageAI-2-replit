/**
 * GET /api/c2c/project-vault/:id — the filing cabinet is bounded, and the facts
 * derived alongside it are not derived from the bound.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The route fetched EVERY vault.documents row for a program — seventeen columns
 * and a users join, no LIMIT — and held them all in memory to render one tree.
 * For a product whose object is a data room that rivals Veeva, the read that
 * renders the room grew without limit with the room.
 *
 * ── Why a LIMIT alone would have been worse than the leak ────────────────────
 * Two facts were computed from that same in-memory array, and capping the array
 * without moving them would have turned a slow page into a WRONG one — silently,
 * and in the direction that reads as good news:
 *
 *   unfiledCount  was `uploads.filter(unfiled).length`. Past the cap it counts
 *                 unfiled documents in the PAGE, so the review queue would
 *                 shrink as the backlog grew. A queue that empties itself as
 *                 work piles up is not a slow queue, it is a false one.
 *
 *   filed         was `new Set(uploads.map(content_hash)).has(source.checksum)`.
 *                 Past the cap a document that IS in the vault reports as not
 *                 filed. That is a compliance answer — the Data Room's own
 *                 capture→classify→file pipeline — not a display detail.
 *
 * ── How this test can actually fail ──────────────────────────────────────────
 * The page and the aggregates are given DELIBERATELY CONTRADICTORY data. Every
 * row in the page is filed; the program-wide count says 137 are unfiled. The
 * one data-room source's checksum appears nowhere in the page, but the database
 * says it is in the vault. So a regression to either page-derived form does not
 * merely lose precision — it returns 0 where the test demands 137, and `false`
 * where the test demands `true`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query, connect: vi.fn() } }));

const { listClientDocuments } = vi.hoisted(() => ({ listClientDocuments: vi.fn() }));
vi.mock('../../services/clinical-regulatory-evidence/evidence-spine.service.js', () => ({
  listClientDocuments,
}));

import createProjectVaultRoutes from '../c2c/project-vault';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const CAP = 2;

/** A checksum that is in the vault but NOT in the page the tree fetched. */
const HASH_BEYOND_PAGE = 'sha256-outside-the-page';

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

/** A page row that is FILED — so a page-derived unfiled count would be 0. */
function filedRow(n: number) {
  return {
    id: `doc-${n}`,
    document_code: `DOC-${n}`,
    document_title: `Filed document ${n}`,
    document_type: 'report',
    version: 1,
    file_name: `doc-${n}.pdf`,
    file_size: 1024,
    mime_type: 'application/pdf',
    content_hash: `sha256-in-page-${n}`,
    folder_id: 'folder-1',
    evidence_kind: 'report',
    ctd_section: '2.5',
    placement_status: 'filed',
    placement_confidence: 'high',
    placement_rationale: null,
    updated_at: new Date('2026-09-01T00:00:00Z'),
    owner_name: 'A Reviewer',
  };
}

/**
 * Route each statement the handler issues by its shape.
 *
 * MOST SPECIFIC FIRST, deliberately. Every vault read carries the tenant check
 * as `EXISTS (SELECT 1 FROM regulatory_programs rp ...)`, so a naive
 * `/FROM regulatory_programs/` branch matches the page and the count queries
 * too and answers both with a programme row — which is silent, because the
 * handler then reads `total` off an object that has no `total` and falls back.
 * Match on columns unique to each statement instead.
 */
function dispatch(opts: {
  total: number;
  unfiled: number;
  filedHashes: string[];
  page: Record<string, unknown>[];
}) {
  return async (sql: string) => {
    const q = String(sql);
    if (/content_hash = ANY/.test(q)) {
      return { rows: opts.filedHashes.map(h => ({ content_hash: h })) };
    }
    if (/COUNT\(\*\)::int AS total/.test(q)) {
      return { rows: [{ total: opts.total, unfiled: opts.unfiled }] };
    }
    if (/d\.document_code/.test(q)) return { rows: opts.page };
    if (/SELECT id, name, product_type/.test(q)) {
      return { rows: [{ id: PROGRAM, name: 'Test Program', product_type: null }] };
    }
    if (/SELECT DISTINCT product_type/.test(q)) return { rows: [] };
    return { rows: [] };
  };
}

function wireStore(opts: { total: number; unfiled: number; filedHashes: string[] }) {
  // cap + 1 rows, so the handler sees the overflow. All of them filed.
  query.mockImplementation(
    dispatch({ ...opts, page: [filedRow(1), filedRow(2), filedRow(3)] }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VAULT_TREE_MAX_DOCS = String(CAP);
  listClientDocuments.mockResolvedValue([]);
});

afterEach(() => {
  delete process.env.VAULT_TREE_MAX_DOCS;
});

describe('the filing cabinet page is bounded and says so', () => {
  it('caps the rows it fetches and reports the window rather than implying it is the whole vault', async () => {
    wireStore({ total: 500, unfiled: 137, filedHashes: [] });
    const res = await request(app()).get(`/api/c2c/project-vault/${PROGRAM}`);
    expect(res.status).toBe(200);
    expect(res.body.data.uploadsWindow).toEqual({ shown: CAP, total: 500, truncated: true });
  });

  it('asks the database for cap + 1 rows, which is how the overflow is detected', async () => {
    wireStore({ total: 500, unfiled: 137, filedHashes: [] });
    await request(app()).get(`/api/c2c/project-vault/${PROGRAM}`);
    const page = query.mock.calls.find(
      ([sql]) => /FROM vault\.documents d/.test(String(sql)) && /LEFT JOIN users/.test(String(sql)),
    );
    expect(page, 'the filing-cabinet page query was never issued').toBeDefined();
    expect(String(page![0])).toMatch(/LIMIT \$3/);
    expect((page![1] as unknown[])[2]).toBe(CAP + 1);
  });

  it('does not report truncation when the vault fits inside the cap', async () => {
    query.mockImplementation(
      dispatch({ total: 1, unfiled: 0, filedHashes: [], page: [filedRow(1)] }),
    );
    const res = await request(app()).get(`/api/c2c/project-vault/${PROGRAM}`);
    expect(res.body.data.uploadsWindow).toEqual({ shown: 1, total: 1, truncated: false });
  });
});

describe('the unfiled queue counts the program, not the page', () => {
  it('reports the program-wide unfiled count even though every fetched row is filed', async () => {
    // The trap: page-derived would be 0, because filedRow() sets folder_id and
    // placement_status='filed' on every row the page carries.
    wireStore({ total: 500, unfiled: 137, filedHashes: [] });
    const res = await request(app()).get(`/api/c2c/project-vault/${PROGRAM}`);
    expect(res.body.data.unfiledCount).toBe(137);
  });

  it('takes that count with the same predicate as the page, so the two cannot describe different sets', async () => {
    wireStore({ total: 500, unfiled: 137, filedHashes: [] });
    await request(app()).get(`/api/c2c/project-vault/${PROGRAM}`);
    const counts = query.mock.calls.find(
      ([sql]) => /COUNT\(\*\)/.test(String(sql)) && /vault\.documents/.test(String(sql)),
    );
    expect(counts, 'the program-wide count was never taken').toBeDefined();
    const sql = String(counts![0]);
    expect(sql).toMatch(/d\.program_id = \$1/);
    expect(sql).toMatch(/d\.deleted_at IS NULL/);
    expect(sql).toMatch(/rp\.organization_id = \$2/);
  });
});

describe("a source's filed stage is answered by the database, not by the page", () => {
  const source = {
    id: 'src-1',
    title: 'A captured source',
    checksum: HASH_BEYOND_PAGE,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    metadata: { mimeType: 'application/pdf', fileSize: 2048 },
    extractionStatus: 'extracted',
  };

  it('reports filed for a document the page never carried', async () => {
    // The trap: HASH_BEYOND_PAGE appears in no filedRow(), so a page-derived
    // Set would answer false here.
    listClientDocuments.mockResolvedValue([source]);
    wireStore({ total: 500, unfiled: 137, filedHashes: [HASH_BEYOND_PAGE] });
    const res = await request(app()).get(`/api/c2c/project-vault/${PROGRAM}`);
    expect(res.body.data.dataRoom.sources[0].stage).toBe('filed');
    expect(res.body.data.dataRoom.filed).toBe(1);
  });

  it('still reports not-filed when the database says the checksum is absent', async () => {
    listClientDocuments.mockResolvedValue([source]);
    wireStore({ total: 500, unfiled: 137, filedHashes: [] });
    const res = await request(app()).get(`/api/c2c/project-vault/${PROGRAM}`);
    expect(res.body.data.dataRoom.sources[0].stage).not.toBe('filed');
    expect(res.body.data.dataRoom.filed).toBe(0);
  });

  it('probes only the checksums it actually holds, scoped to program and tenant', async () => {
    listClientDocuments.mockResolvedValue([source]);
    wireStore({ total: 500, unfiled: 137, filedHashes: [HASH_BEYOND_PAGE] });
    await request(app()).get(`/api/c2c/project-vault/${PROGRAM}`);
    const probe = query.mock.calls.find(([sql]) => /content_hash = ANY/.test(String(sql)));
    expect(probe, 'the filed probe was never issued').toBeDefined();
    expect(probe![1]).toEqual([PROGRAM, 7, [HASH_BEYOND_PAGE]]);
    expect(String(probe![0])).toMatch(/rp\.organization_id = \$2/);
  });

  it('issues no probe at all when there are no sources to ask about', async () => {
    listClientDocuments.mockResolvedValue([]);
    wireStore({ total: 500, unfiled: 137, filedHashes: [] });
    await request(app()).get(`/api/c2c/project-vault/${PROGRAM}`);
    expect(query.mock.calls.filter(([sql]) => /content_hash = ANY/.test(String(sql)))).toHaveLength(0);
  });
});
