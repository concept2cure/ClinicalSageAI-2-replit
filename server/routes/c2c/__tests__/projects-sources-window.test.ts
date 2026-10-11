/**
 * GET /api/c2c/projects/:id/sources — the window, and which sources are current.
 *
 * The route read listClientDocuments with its default 200-row cap and said
 * nothing past it, and it gave its readers no way to tell a source a re-upload
 * had retired (is_current = false) from its successor — so Project home counted
 * one re-uploaded file as two. The route stays inclusive (the authoring canvas
 * and sources rail read it too); it now reports the window and each source's
 * currency, and its readers decide what to count.
 *
 * Since 2026-10-08 (Data Room catalog S2) the route reads searchDataRoom, which
 * returns the real total and pages; a "full window" is a page with more after
 * it. The SQL is proven on PostgreSQL in tests/db/data-room-processing.dbtest.ts.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../../db', () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));
const { listClientDocuments, searchDataRoom } = vi.hoisted(() => ({ listClientDocuments: vi.fn(), searchDataRoom: vi.fn() }));
vi.mock('../../../services/clinical-regulatory-evidence/evidence-spine.service.js', () => ({ listClientDocuments }));
vi.mock('../../../services/clinical-regulatory-evidence/data-room-search.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/clinical-regulatory-evidence/data-room-search.js')>()),
  searchDataRoom,
}));
vi.mock('../../../services/clinical-regulatory-evidence/source-usage.service.js', () => ({
  summarizeSourceUsage: async () => new Map(),
}));

import router from '../projects';

const P = '11111111-1111-1111-1111-111111111111';
function app() {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => { req.organizationId = 7; next(); });
  a.use('/api/c2c/projects', router);
  return a;
}
const src = (id: number, isCurrent?: boolean) => ({
  id, title: `s${id}`, checksum: `h${id}`, ingestionStatus: 'ingested', extractionStatus: 'extracted',
  createdAt: '2026-09-01', updatedAt: '2026-09-01', metadata: {}, provenance: {},
  ...(isCurrent === undefined ? {} : { isCurrent }),
});

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ '?column?': 1 }] });
  listClientDocuments.mockReset();
  searchDataRoom.mockReset();
});

describe('GET /:id/sources', () => {
  it('asks for the newest 200 by default and reports a page with more after it as truncated, with the total', async () => {
    searchDataRoom.mockResolvedValue({ total: 250, sources: Array.from({ length: 200 }, (_, i) => src(i + 1)) });
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources`);
    expect(res.status).toBe(200);
    expect(searchDataRoom.mock.calls[0][1]).toMatchObject({ programId: P, limit: 200, offset: 0, q: null });
    expect(res.body.sources).toHaveLength(200);
    expect(res.body.total).toBe(250);
    expect(res.body.window).toEqual({ shown: 200, truncated: true });
  });

  it('passes a search and a page through, and refuses an unreadable filter with 400', async () => {
    searchDataRoom.mockResolvedValue({ total: 1, sources: [src(9)] });
    await request(app()).get(`/api/c2c/projects/${P}/sources`).query({ q: 'stability', limit: '25', offset: '50' });
    expect(searchDataRoom.mock.calls[0][1]).toMatchObject({ q: 'stability', limit: 25, offset: 50 });
    const bad = await request(app()).get(`/api/c2c/projects/${P}/sources`).query({ limit: '9999' });
    expect(bad.status).toBe(400);
    expect(searchDataRoom).toHaveBeenCalledTimes(1);
  });

  it('says which sources a re-upload retired; a row older than the column is current', async () => {
    searchDataRoom.mockResolvedValue({ total: 3, sources: [src(1, false), src(2, true), src(3)] });
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources`);
    const cur = Object.fromEntries(res.body.sources.map((s: { id: number; isCurrent: boolean }) => [s.id, s.isCurrent]));
    expect(cur).toEqual({ 1: false, 2: true, 3: true });
    expect(res.body.window).toEqual({ shown: 3, truncated: false });
  });
});
