/**
 * GET /docs/:docId/exports — the export history, and the staleness verdict.
 *
 * Every export writes an `authoring_export_history` row carrying `doc_sha256`:
 * computeDocHash at that moment. This route reads them back and answers the
 * question the row exists for — is the exported file still this document?
 *
 * Two traps are pinned here because both fail silently and both are wrong in
 * the dangerous direction:
 *
 *   1. computeDocHash walks the section rows and hashes the empty string when
 *      there are none, so an unknown or cross-tenant docId would otherwise
 *      yield sha256("") presented as a real document hash — and `exports: []`
 *      presented as "this document has never been exported". Guarded: 404.
 *   2. `content_changed_since_last_export` must be null, never false, when
 *      there is nothing to compare against. False means "checked, unchanged".
 *      Reporting that for an unchecked document tells an author a stale file
 *      is current.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../../db', () => {
  const api = {
    query: (...a: unknown[]) => mockQuery(...a),
    connect: async () => ({ query: (...a: unknown[]) => mockQuery(...a), release: () => {} }),
  };
  return { pool: api, getPool: () => api, query: (...a: unknown[]) => mockQuery(...a), db: {} };
});

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-export-history';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ sub: 'u1', organizationId: 7, email: 'author@test.co' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
  return `Bearer ${token}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

/** The section rows computeDocHash will hash, and the export rows to return. */
function wireDb(opts: { docExists: boolean; sections?: Array<{ code: string; content: string }>; exports?: any[] }) {
  const sections = opts.sections ?? [{ code: '3.2.S.1', content: '<p>Body.</p>' }];
  const exportRows = opts.exports ?? [];
  mockQuery.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('FROM authoring_documents')) {
      return { rowCount: opts.docExists ? 1 : 0, rows: opts.docExists ? [{ '?column?': 1 }] : [] };
    }
    if (s.includes('SELECT code, content FROM authoring_sections')) {
      return { rowCount: sections.length, rows: sections };
    }
    if (s.includes('COUNT(*)')) {
      return { rowCount: 1, rows: [{ total: String(exportRows.length) }] };
    }
    if (s.includes('FROM authoring_export_history')) {
      return { rowCount: exportRows.length, rows: exportRows };
    }
    // CREATE TABLE IF NOT EXISTS and anything else.
    return { rowCount: 0, rows: [] };
  });
}

describe('GET /docs/:docId/diff-since-export', () => {
  beforeEach(() => mockQuery.mockReset());

  it('404s an unknown document rather than answering "no baseline"', async () => {
    wireDb({ docExists: false });
    const res = await request(makeApp())
      .get('/api/authoring/docs/NOPE/diff-since-export')
      .set('Authorization', await bearer());

    expect(res.status).toBe(404);
    // `{ baseline: null }` is what a real document with no export yet gets.
    expect(res.body.baseline).toBeUndefined();
  });

  it('answers with a null baseline for a real document never exported', async () => {
    wireDb({ docExists: true, exports: [] });
    const res = await request(makeApp())
      .get('/api/authoring/docs/D1/diff-since-export')
      .set('Authorization', await bearer());

    expect(res.status).toBe(200);
    expect(res.body.baseline).toBeNull();
    expect(res.body.changed).toEqual([]);
  });
});

describe('GET /docs/:docId/exports', () => {
  beforeEach(() => mockQuery.mockReset());

  it('404s an unknown or cross-tenant document instead of hashing the empty string', async () => {
    wireDb({ docExists: false });
    const res = await request(makeApp())
      .get('/api/authoring/docs/NOPE/exports')
      .set('Authorization', await bearer());

    expect(res.status).toBe(404);
    // The failure this guards: an empty list reading as "never exported", and
    // sha256("") reading as this document's content hash.
    expect(res.body.exports).toBeUndefined();
    expect(res.body.current_content_hash).toBeUndefined();
  });

  it('reports null — not false — when there is no export to compare against', async () => {
    wireDb({ docExists: true, exports: [] });
    const res = await request(makeApp())
      .get('/api/authoring/docs/D1/exports')
      .set('Authorization', await bearer());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.last_export).toBeNull();
    expect(res.body.content_changed_since_last_export).toBeNull();
    expect(res.body.content_changed_since_last_export).not.toBe(false);
    expect(typeof res.body.current_content_hash).toBe('string');
  });

  it('reports null when the stored export carried no content hash', async () => {
    wireDb({
      docExists: true,
      exports: [{ id: 'X1', export_type: 'docx', doc_sha256: null, exported_at: '2026-08-20T09:00:00Z' }],
    });
    const res = await request(makeApp())
      .get('/api/authoring/docs/D1/exports')
      .set('Authorization', await bearer());

    // A row with no baseline is unchecked, not unchanged.
    expect(res.body.content_changed_since_last_export).toBeNull();
  });

  it('reports drift when the last export hash differs from the document now', async () => {
    wireDb({
      docExists: true,
      exports: [{ id: 'X1', export_type: 'docx', doc_sha256: 'not-the-current-hash', exported_at: '2026-08-20T09:00:00Z' }],
    });
    const res = await request(makeApp())
      .get('/api/authoring/docs/D1/exports')
      .set('Authorization', await bearer());

    expect(res.body.content_changed_since_last_export).toBe(true);
  });

  it('reports no drift when the last export hash IS the document now', async () => {
    // First read the live hash, then feed it back as the stored export hash.
    wireDb({ docExists: true, exports: [] });
    const probe = await request(makeApp())
      .get('/api/authoring/docs/D1/exports')
      .set('Authorization', await bearer());
    const liveHash = probe.body.current_content_hash as string;
    expect(liveHash).toMatch(/^[0-9a-f]{64}$/);

    wireDb({
      docExists: true,
      exports: [{ id: 'X1', export_type: 'docx', doc_sha256: liveHash, exported_at: '2026-08-20T09:00:00Z' }],
    });
    const res = await request(makeApp())
      .get('/api/authoring/docs/D1/exports')
      .set('Authorization', await bearer());

    expect(res.body.content_changed_since_last_export).toBe(false);
  });
});
