/**
 * GET /api/data-origins/document — how much of this document is attributed.
 *
 * The existing Data Origins reads answer "what backs the text I selected". An
 * author had no way to ask the question about the document as a whole without
 * selecting all of it, so there was no at-a-glance signal that a section was
 * half unattributed until someone went looking.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * The ways a coverage figure on regulated content goes wrong, all refusals
 * rather than numbers:
 *
 *   THE DENOMINATOR IS THE SERVER'S.  Coverage is attributed characters over
 *                                     total characters, so whoever supplies the
 *                                     total controls the percentage. A caller
 *                                     passing a length cannot move it, because
 *                                     the route reads the governed row itself.
 *   TENANT.                           The length read is org-scoped, so naming
 *                                     another organization's document is a 404,
 *                                     not a figure about their text.
 *   UNKNOWN TABLE IS A REFUSAL.       A table this route cannot locate text in
 *                                     is refused by name. A percentage over the
 *                                     wrong denominator is worse than no answer.
 *   MISSING IS NOT EMPTY.             A document that does not exist is a 404 —
 *                                     never a 0% that reads as "assessed, and
 *                                     nothing is attributed".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db', () => ({ pool: { query, connect: vi.fn() }, db: {} }));

import router from '../data-origins.routes';

function app(org: number | null = 7) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: 3 };
    next();
  });
  a.use('/api/data-origins', router);
  return a;
}

const url = (params: Record<string, string>) =>
  `/api/data-origins/document?${new URLSearchParams(params).toString()}`;

/**
 * Two reads in order: the content length, then the document's spans.
 * `len` null stands for "no such row for this organization".
 */
function store(opts: { len: number | null; spans?: Record<string, unknown>[] }) {
  query.mockReset();
  query.mockImplementation(async (sql: string) => {
    if (/char_length/i.test(sql)) {
      return { rows: opts.len === null ? [] : [{ len: opts.len }], rowCount: opts.len === null ? 0 : 1 };
    }
    if (/document_span_lineage/i.test(sql)) {
      return { rows: opts.spans ?? [], rowCount: (opts.spans ?? []).length };
    }
    return { rows: [], rowCount: 0 };
  });
}

function sourceSpan(start: number, end: number) {
  return {
    id: `s-${start}`,
    document_table: 'concept2cure_artifacts',
    document_id: '501',
    char_start: start,
    char_end: end,
    provenance_kind: 'cre_evidence_source',
    reference_id: '12',
    payload_sha256: 'abc',
    current_checksum: 'abc',
    usage: 'quoted',
  };
}

beforeEach(() => query.mockReset());

describe('GET /api/data-origins/document', () => {
  it('reports the partition over the length the SERVER read', async () => {
    store({ len: 100, spans: [sourceSpan(0, 40)] });

    const res = await request(app()).get(
      url({ documentTable: 'concept2cure_artifacts', documentId: '501' }),
    );

    expect(res.status).toBe(200);
    expect(res.body.summary.contentLength).toBe(100);
    expect(res.body.summary.byKind.fromSources).toBe(40);
    expect(res.body.summary.unattributedChars).toBe(60);
  });

  it('IGNORES a caller-supplied length — the denominator is not theirs to set', async () => {
    // The document is 100 characters with 40 attributed. A caller claiming it is
    // 40 characters long would turn that into "100% attributed" if the route
    // believed them.
    store({ len: 100, spans: [sourceSpan(0, 40)] });

    const res = await request(app()).get(
      url({
        documentTable: 'concept2cure_artifacts',
        documentId: '501',
        contentLength: '40',
        length: '40',
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body.summary.contentLength).toBe(100);
    expect(res.body.summary.unattributedChars).toBe(60);
  });

  it('scopes the length read to the caller\'s organization', async () => {
    store({ len: 100, spans: [] });
    await request(app(7)).get(url({ documentTable: 'concept2cure_artifacts', documentId: '501' }));

    const lengthCall = query.mock.calls.find((c) => /char_length/i.test(c[0] as string));
    expect(lengthCall).toBeDefined();
    expect((lengthCall![0] as string)).toMatch(/organization_id = \$2/);
    expect(lengthCall![1]).toEqual(['501', 7]);
  });

  it('404s for a document that is not this organization\'s, rather than reporting 0%', async () => {
    store({ len: null });

    const res = await request(app()).get(
      url({ documentTable: 'concept2cure_artifacts', documentId: '999' }),
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    // Nothing that could be rendered as an assessed document.
    expect(res.body.summary).toBeUndefined();
  });

  it('refuses a table it cannot locate text in, by name', async () => {
    store({ len: 100 });

    const res = await request(app()).get(
      url({ documentTable: 'labeling_pi_sections', documentId: '1' }),
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_DOCUMENT_TABLE');
    // It refused before reading anything.
    expect(query).not.toHaveBeenCalled();
  });

  it('requires an organization context', async () => {
    store({ len: 100 });
    const res = await request(app(null)).get(
      url({ documentTable: 'concept2cure_artifacts', documentId: '501' }),
    );
    expect(res.status).toBe(401);
  });

  it('requires both identifiers', async () => {
    store({ len: 100 });
    const res = await request(app()).get(url({ documentTable: 'concept2cure_artifacts' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});
