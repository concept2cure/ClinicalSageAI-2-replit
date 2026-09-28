/**
 * GET /api/c2c/projects/:id/sources — the window, and which sources are current.
 *
 * The route read listClientDocuments with its default 200-row cap and said
 * nothing past it, and it gave its readers no way to tell a source a re-upload
 * had retired (is_current = false) from its successor — so Project home counted
 * one re-uploaded file as two. The route stays inclusive (the authoring canvas
 * and sources rail read it too); it now reports the window and each source's
 * currency, and its readers decide what to count.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../../db', () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));
const { listClientDocuments } = vi.hoisted(() => ({ listClientDocuments: vi.fn() }));
vi.mock('../../../services/clinical-regulatory-evidence/evidence-spine.service.js', () => ({ listClientDocuments }));
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
});

describe('GET /:id/sources', () => {
  it('asks for one past the window and reports a full window as truncated', async () => {
    listClientDocuments.mockResolvedValue(Array.from({ length: 201 }, (_, i) => src(i + 1)));
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources`);
    expect(res.status).toBe(200);
    expect(listClientDocuments.mock.calls[0][1]).toMatchObject({ programId: P, limit: 201 });
    expect(res.body.sources).toHaveLength(200);
    expect(res.body.window).toEqual({ shown: 200, truncated: true });
  });

  it('says which sources a re-upload retired; a row older than the column is current', async () => {
    listClientDocuments.mockResolvedValue([src(1, false), src(2, true), src(3)]);
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources`);
    const cur = Object.fromEntries(res.body.sources.map((s: { id: number; isCurrent: boolean }) => [s.id, s.isCurrent]));
    expect(cur).toEqual({ 1: false, 2: true, 3: true });
    expect(res.body.window).toEqual({ shown: 3, truncated: false });
  });
});
