/** The numeric compatibility route shares the project's artifact-stage reader. */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../db.js', () => ({ pool: { query } }));
import router from '../dossier-readiness';

function app(orgId = 7) {
  const a = express();
  a.use((req, _res, next) => { (req as express.Request & { tenantId: number }).tenantId = orgId; next(); });
  a.use('/api/dossier-readiness', router);
  return a;
}

beforeEach(() => { query.mockReset(); });

describe('recorded artifact stage, without a second dossier figure', () => {
  it('approved plus locked remains approved, and keeps all stage counts and the latest timestamp', async () => {
    query.mockResolvedValue({ rows: [
      { ctd_section: '2.5', status: 'approved', count: 2, last_updated: new Date('2026-10-20T10:00:00Z') },
      { ctd_section: '2.5', status: 'locked', count: 1, last_updated: new Date('2026-10-21T10:00:00Z') },
    ] });
    const res = await request(app()).get('/api/dossier-readiness/41');
    expect(res.status).toBe(200);
    expect(res.body.sections).toEqual([{
      ctdSection: '2.5', status: 'approved', artifactCount: 3,
      draftCount: 0, reviewCount: 0, approvedCount: 2, lockedCount: 1, unknownCount: 0,
      lastUpdated: '2026-10-21T10:00:00.000Z',
    }]);
    expect(query.mock.calls[0][1]).toEqual([41, 7]);
  });

  it.each(['unknown', 'toString', '__proto__', null])('keeps unsupported status %s unassessed rather than ready', async (status) => {
    query.mockResolvedValue({ rows: [
      { ctd_section: '3.2.P.1', status, count: 1, last_updated: null },
      { ctd_section: '3.2.P.1', status: 'locked', count: 1, last_updated: null },
    ] });
    const res = await request(app()).get('/api/dossier-readiness/41');
    expect(res.status).toBe(200);
    expect(res.body.sections[0]).toMatchObject({ status: 'not_assessed', artifactCount: 2, unknownCount: 1, lockedCount: 1 });
    expect(res.body.summary).toMatchObject({ totalSections: 1, readySections: 0, inProgressSections: 0, draftSections: 0, notAssessedSections: 1 });
  });

  it('orders Module 3 parts by the canonical section comparator', async () => {
    query.mockResolvedValue({ rows: ['3.2.R', '3.2.A', '3.2.P', '3.2.S'].map(ctd_section => ({ ctd_section, status: 'review', count: 1, last_updated: null })) });
    const res = await request(app()).get('/api/dossier-readiness/41');
    expect(res.body.sections.map((s: { ctdSection: string }) => s.ctdSection)).toEqual(['3.2.S', '3.2.P', '3.2.A', '3.2.R']);
  });

  it('retains arbitrary recorded section tags and does not invent sections on an empty read', async () => {
    query.mockResolvedValueOnce({ rows: [{ ctd_section: 'appendix-label', status: 'draft', count: 1, last_updated: null }] });
    expect((await request(app()).get('/api/dossier-readiness/41')).body.sections[0].ctdSection).toBe('appendix-label');
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).get('/api/dossier-readiness/41');
    expect(res.body.sections).toEqual([]);
    expect(res.body.summary).toMatchObject({ totalSections: 0, readySections: 0, notAssessedSections: 0 });
  });

  it('keeps a missing store distinct from an empty store', async () => {
    query.mockRejectedValue(Object.assign(new Error('missing'), { code: '42P01' }));
    const res = await request(app()).get('/api/dossier-readiness/41');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ARTIFACT_SCHEMA_MISSING');
    expect(res.body.sections).toBeUndefined();
  });
});
