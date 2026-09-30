/**
 * The section save refuses an image that is not an uploaded figure
 * (periodic review 2026-09-28, editor family, SEC-B-1, SEC-B-2).
 *
 * PATCH /api/authoring/sections/:id stored `content` as it was sent. Any editor
 * of a section could therefore store `<img src="/api/authoring/images/../../
 * tenant-export/full">`, which every later reader's browser requested as
 * `/api/tenant-export/full` in the reader's own name, or an image on another
 * site that every reader's browser contacted. The save now refuses such content
 * with a 400 that says which images, and writes nothing. It never rewrites the
 * content: the words and figures of a governed record change only when their
 * author changes them.
 *
 * The router carries its own JWT gate, so a real HS256 token is signed
 * (mirrors authoring-atomic-mutations.test.ts).
 */
import { promises as fsPromises } from 'node:fs';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const clientQuery = vi.fn();
  const client = { query: clientQuery, release: vi.fn() };
  return {
    poolQuery: vi.fn(),
    clientQuery,
    connect: vi.fn(async () => client),
  };
});

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => h.poolQuery(...a), connect: () => h.connect() },
  getPool: () => ({ query: (...a: unknown[]) => h.poolQuery(...a), connect: () => h.connect() }),
  query: (...a: unknown[]) => h.poolQuery(...a),
  db: {},
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => undefined) },
  writeChainedAuditRow: vi.fn(async () => {}),
}));
// Neither the lineage gate nor the filing commit is under test here.
vi.mock('../../services/clinical-regulatory-evidence/lineage-gate', () => ({
  enforceAuthorLineage: vi.fn(async () => {}),
}));
vi.mock('../../services/c2c/commit-section-to-filing.js', () => ({
  commitSectionToFiling: vi.fn(async () => ({ committed: false, reason: 'unbound' })),
}));
// A numeric account's membership re-check has its own suite.
vi.mock('../../middleware/orgMembership', () => ({
  enforceOrgMembership: (_req: unknown, _res: unknown, next: () => void) => next(),
  invalidateOrgMembershipCache: () => undefined,
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-section-figure-refs';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ sub: '41', organizationId: 7, email: 'author@test.co' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
  return `Bearer ${token}`;
}

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/authoring', router);
  return app;
}

const REASON = 'Replaced the stability figure after review.';
const REF = '/api/authoring/images/file_1727500000000_k3v9qa';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

async function save(content: unknown) {
  return request(makeApp())
    .patch('/api/authoring/sections/S1')
    .set('Authorization', await bearer())
    .send({ content, changeReason: REASON });
}

/** Every write this save could make, on the transaction client or the pool. */
function writes(): string[] {
  return [...h.clientQuery.mock.calls, ...h.poolQuery.mock.calls]
    .map((c) => String(c[0]))
    .filter((s) => /\b(UPDATE|INSERT INTO|DELETE FROM)\b/i.test(s));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.connect.mockImplementation(async () => ({ query: h.clientQuery, release: vi.fn() }));
  h.clientQuery.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(s)) return {};
    if (/UPDATE authoring_sections/i.test(s)) {
      return { rowCount: 1, rows: [{ id: 'S1', doc_id: 'D1', content: 'saved' }] };
    }
    return { rowCount: 1, rows: [{}] };
  });
  h.poolQuery.mockImplementation(async (sql: string) => {
    if (/FROM authoring_sections WHERE id = \$1/i.test(sql)) {
      return { rowCount: 1, rows: [{ id: 'S1', doc_id: 'D1', content: '<p>old</p>' }] };
    }
    if (/JOIN authoring_documents/i.test(sql)) {
      return { rowCount: 1, rows: [{ status: 'draft' }] };
    }
    return { rowCount: 1, rows: [{}] };
  });
});

describe('PATCH /sections/:id refuses an image that is not an uploaded figure', () => {
  it.each([
    ['dot segments', '/api/authoring/images/../../tenant-export/full'],
    ['percent-encoded dot segments', '/api/authoring/images/%2e%2e/%2e%2e/users/me'],
    ['backslash segments', '/api/authoring/images/..\\..\\tenant-export\\full'],
    ['a query', '/api/authoring/images/file_1_a?download=1'],
    ['another API route', '/api/c2c/projects'],
    ['an external address', 'https://collector.example/p.png?d=secret'],
    ['a protocol-relative address', '//collector.example/p.png'],
    ['an inline SVG', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['an inline WebP', 'data:image/webp;base64,UklGRg=='],
  ])('%s: 400, names the image, writes nothing', async (_label, src) => {
    const res = await save(`<p>Stability results.</p><img src="${src}" alt="Figure 1">`);

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error?.code).toBe('FIGURE_NOT_UPLOADED');
    expect(res.body.field).toBe('content');
    expect(res.body.refusedImages).toEqual([{ position: 1, src }]);
    expect(String(res.body.error?.message)).toMatch(/^Image 1 \(/);
    // The client suppresses any message carrying an API route; this one must reach the author.
    expect(String(res.body.error?.message)).not.toContain('/api/');
    // Nothing was written, and no transaction was opened.
    expect(writes()).toEqual([]);
    expect(h.connect).not.toHaveBeenCalled();
  });

  it('names only the images that are not figures, by their position in the section', async () => {
    const res = await save(
      `<img src="${REF}"><p>t</p><img src="https://collector.example/a.png"><img src="${PNG}">` +
        `<table><tbody><tr><td><IMG SRC=https://collector.example/b.png></td></tr></tbody></table>`,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.refusedImages).toEqual([
      { position: 2, src: 'https://collector.example/a.png' },
      { position: 4, src: 'https://collector.example/b.png' },
    ]);
    expect(writes()).toEqual([]);
  });

  it('returns a long refused src shortened, so a megabyte data: URI is not echoed back', async () => {
    const svg = `data:image/svg+xml;base64,${'A'.repeat(5000)}`;
    const res = await save(`<img src="${svg}">`);
    expect(res.status).toBe(400);
    const echoed = String(res.body.refusedImages?.[0]?.src);
    expect(echoed.length).toBe(201);
    expect(echoed.endsWith('…')).toBe(true);
    expect(svg.startsWith(echoed.slice(0, 200))).toBe(true);
    expect(writes()).toEqual([]);
  });

  it('saves a governed reference and an inline PNG, exactly as sent', async () => {
    const content = `<p>Figure 1.</p><img src="${REF}" alt="Chromatogram"><img src="${PNG}" alt="Inline">`;
    const res = await save(content);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const update = h.clientQuery.mock.calls.find((c) => /UPDATE authoring_sections/i.test(String(c[0])));
    expect(update).toBeDefined();
    // Not rewritten: the stored value is the value sent.
    expect((update?.[1] as unknown[])[0]).toBe(content);
  });

  it('leaves a metadata-only save alone', async () => {
    const res = await request(makeApp())
      .patch('/api/authoring/sections/S1')
      .set('Authorization', await bearer())
      .send({ title: 'Stability' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it('accepts every reference the image store mints (bound to saveDerivedUpload)', async () => {
    // The store writes bytes to disk and a row to file_uploads; neither is under test.
    const mkdir = vi.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined);
    const writeFile = vi.spyOn(fsPromises, 'writeFile').mockResolvedValue(undefined);
    // Short base-36 tails, including the empty one, are what the minting expression produces
    // for these values of Math.random().
    const random = vi.spyOn(Math, 'random');
    const { saveDerivedUpload } = await import('../../services/ana/uploaded-file-access.js');
    try {
      for (const r of [0.123456789, 0.5, 0.25, 0]) {
        random.mockReturnValueOnce(r);
        const { fileId } = await saveDerivedUpload({
          buffer: Buffer.from('png-bytes'),
          fileName: 'figure.png',
          mimeType: 'image/png',
          organizationId: 7,
          userId: 41,
        });
        // The URL POST /api/authoring/images returns for that id.
        const url = `/api/authoring/images/${fileId}`;
        const res = await save(`<img src="${url}" alt="uploaded">`);
        expect(res.status, `${url}: ${JSON.stringify(res.body)}`).toBe(200);
      }
    } finally {
      mkdir.mockRestore();
      writeFile.mockRestore();
      random.mockRestore();
    }
  });
});
