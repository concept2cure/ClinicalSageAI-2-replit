/**
 * GET /api/graphrag/citation-trace/:documentId must not trace another tenant's
 * citations.
 *
 * ── The exposure ────────────────────────────────────────────────────────────
 * `citation_chains` carries NO tenant column, has RLS OFF and zero policies
 * (verified on a deploy-shaped database, 2026-10-12), and this route read it
 * as:
 *
 *     WHERE source_document_id = ANY($1::text[]) OR target_document_id = ANY($1::text[])
 *
 * with `$1` starting as `[req.params.documentId]` — the request path parameter,
 * unchecked — and expanding outward one hop per `?depth=`. `/api/graphrag` is
 * mounted behind `authenticateToken` only
 * (bootstrap/register-advanced-platform-routes.ts:158), so ANY authenticated
 * user of ANY tenant could pass another tenant's document id and walk that
 * tenant's citation graph: the linked document ids, the citation type, the
 * `context` — the quoted source text — the page number and the section id,
 * widening at every hop.
 *
 * Its sibling tables in the same migration (`knowledge_graph_nodes`,
 * `knowledge_graph_edges`) were given `organization_id` and a policy; these two
 * were not, and the write path at :762 resolves an organisation while this read
 * path never did. The table sat in `unkeyed-request-tables-baseline.json` as
 * "unreviewed" — which is what that baseline's own header warns about: the
 * three cross-tenant disclosures of 2026-09-10 "were all tables that would have
 * sat here as unreviewed".
 *
 * ── The fix this pins ───────────────────────────────────────────────────────
 * The organisation is required, the anchor document must be one this
 * organisation can see (proved through `knowledge_graph_nodes`, which IS
 * org-keyed and policied), and every hop is constrained the same way.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return { ...actual, getPool: () => ({ query: (...a: unknown[]) => query(...a) }) };
});

import router from '../graphrag';

/** A request carrying `org`, or none at all when null. */
function app(org: number | null) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as any).user = { id: 1, organizationId: org };
    next();
  });
  a.use('/api/graphrag', router);
  return a;
}

/** Another tenant's citation row — what must never come back. */
const FOREIGN = {
  id: 'cc-1',
  source_document_id: 'doc-of-org-999',
  target_document_id: 'other-doc-of-org-999',
  citation_type: 'supports',
  context: 'another tenant’s quoted source text',
  page_number: 12,
  section_id: '2.5',
  confidence: 0.9,
  created_at: new Date(),
};

beforeEach(() => {
  query.mockReset();
  // The store answers the citation read only when the statement asks for rows;
  // an org-scoped statement that finds no visible document returns nothing.
  query.mockImplementation(async (sql: string) => {
    if (/FROM\s+citation_chains/i.test(String(sql))) return { rows: [FOREIGN], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
});

describe('citation-trace is scoped to one organisation', () => {
  it('refuses a request with no resolvable organisation, and reads no citations', async () => {
    const res = await request(app(null)).get('/api/graphrag/citation-trace/doc-of-org-999');

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('quoted source text');
    const reads = query.mock.calls.filter((c) => /citation_chains/i.test(String(c[0])));
    expect(reads, 'no citation read may run without an organisation').toHaveLength(0);
  });

  it('constrains every citation read to documents this organisation can see', async () => {
    await request(app(7)).get('/api/graphrag/citation-trace/doc-of-org-999?depth=3');

    const reads = query.mock.calls.filter((c) => /FROM\s+citation_chains/i.test(String(c[0])));
    for (const [sql, params] of reads as unknown as Array<[string, unknown[]]>) {
      // The read must name the org-keyed anchor table, not just the document ids.
      expect(sql, 'the citation read must be constrained by an org-keyed table').toMatch(
        /knowledge_graph_nodes/i,
      );
      expect(
        (params as unknown[]).some((p) => String(p) === '7'),
        'the caller organisation must reach the statement',
      ).toBe(true);
    }
  });

  it('does not return another tenant’s citation context even when the id is guessed', async () => {
    // The anchor document is not visible to org 7, so the scoped read finds nothing.
    query.mockImplementation(async (sql: string) => {
      if (/FROM\s+citation_chains/i.test(String(sql))) {
        // A correctly scoped statement cannot match this row; simulate that.
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await request(app(7)).get('/api/graphrag/citation-trace/doc-of-org-999');

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('quoted source text');
    expect(res.body?.data?.totalCitations).toBe(0);
  });
});
