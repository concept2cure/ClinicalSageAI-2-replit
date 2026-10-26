/**
 * GET /api/c2c/projects/:id/dossier — the project's dossier, read once
 * (FILING_SPINE F23). The figures themselves are pinned on PostgreSQL by
 * server/services/c2c/__tests__/dossier-read.pglite.test.ts; this pins the
 * route: who may read it, what an unprovisioned store answers, and that a
 * failure is a failure. /workstreams, which it replaces, is gone, and so is
 * /vault-structure, which no client called (F23 4/9).
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const poolQuery = vi.hoisted(() => vi.fn());
vi.mock('../../../db', () => ({
  pool: { query: (...args: unknown[]) => poolQuery(...args) },
}));
vi.mock('../../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});

import router from '../projects';
import { clearSeats, seatMember, seatProgram } from './support/current-member';

const P1 = '11111111-1111-4111-8111-111111111111';
const OTHER = '33333333-3333-4333-8333-333333333333';
const USER = 41;

function app(orgId: number | null, withRequestDb = true) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    if (orgId != null) req.organizationId = orgId;
    req.userId = USER;
    if (withRequestDb) req.dbClient = { query: (...args: unknown[]) => queryMock(...args) };
    next();
  });
  a.use('/api/c2c/projects', router);
  return a;
}

const isOwnership = (sql: unknown) => /FROM regulatory_programs WHERE id = \$1 AND organization_id = \$2/.test(String(sql));
const isDossier = (sql: unknown) => /FROM c2c_documents d\s+JOIN c2c_document_sections s/.test(String(sql));

beforeEach(() => {
  queryMock.mockReset();
  poolQuery.mockReset().mockRejectedValue(new Error('Unscoped pool must not be used'));
  clearSeats();
  seatMember(7, USER, 'member');
  seatProgram(7, P1);
});

describe('GET /api/c2c/projects/:id/dossier', () => {
  it('reads the project’s sections in the caller’s organization and answers the dossier', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (isOwnership(sql)) return { rows: [{ id: P1 }] };
      if (isDossier(sql)) {
        return { rows: [
          { project_id: P1, document_id: 'd1', doc_type: 'nda', agency: 'fda', title: 'NDA', filing_scope: 'home', section_key: 'M1', parent_key: null, label: 'Module 1 · Administrative (US)', status: 'todo', updated_at: null },
          { project_id: P1, document_id: 'd1', doc_type: 'nda', agency: 'fda', title: 'NDA', filing_scope: 'home', section_key: '1.1', parent_key: 'M1', label: 'Forms', status: 'approved', updated_at: '2026-10-20T10:00:00.000Z' },
        ] };
      }
      return { rows: [] };
    });
    const res = await request(app(7)).get(`/api/c2c/projects/${P1}/dossier`);
    expect(res.status).toBe(200);
    // 'M1' holds 1.1, so it is a heading and is not counted (F23 8/9); the
    // module row is still named by it.
    expect(res.body.home).toEqual({ state: 'measured', pct: 100, counted: 1, complete: 1 });
    expect(res.body.rows).toEqual([expect.objectContaining({
      module: '1', label: 'Module 1 · Administrative (US)', counted: 1, complete: 1,
      sections: [{ key: '1.1', label: 'Forms', status: 'approved' }],
    })]);
    const [, params] = queryMock.mock.calls.find(([sql]) => isDossier(sql))!;
    expect(params).toEqual([[P1], 7]);
    expect(queryMock.mock.calls.filter(([sql]) => isDossier(sql))).toHaveLength(1);
    expect(res.body.supportingReadiness).toEqual({
      artifactReadiness: { state: 'read', sections: [], summary: { totalSections: 0, readySections: 0, inProgressSections: 0, draftSections: 0, unknownSections: 0 } },
      sectionTracking: { state: 'read', modules: [] },
    });
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('does not fall back to a pool when request database context is absent', async () => {
    const res = await request(app(7, false)).get(`/api/c2c/projects/${P1}/dossier`);
    expect(res.status).toBe(503);
    expect(res.body.supportingReadiness).toBeUndefined();
    expect(poolQuery).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('keeps unavailable artifact and tracking branches explicit beside the governed figure', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (isOwnership(sql)) return { rows: [{ id: P1 }] };
      if (sql.includes('FROM concept2cure_artifacts')) throw Object.assign(new Error('missing artifacts'), { code: '42P01' });
      if (sql.includes('FROM project_sections')) throw Object.assign(new Error('secret failure'), { code: '08006' });
      return { rows: [] };
    });
    const res = await request(app(7)).get(`/api/c2c/projects/${P1}/dossier`);
    expect(res.status).toBe(200);
    expect(res.body.home).toEqual({ state: 'no_sections', pct: null });
    expect(res.body.supportingReadiness).toMatchObject({ artifactReadiness: { state: 'unavailable', code: 'STORE_UNAVAILABLE' },
      sectionTracking: { state: 'unavailable', code: 'READ_FAILED' } });
    expect(JSON.stringify(res.body)).not.toContain('secret failure');
  });

  it('refuses an exact accepted anchor/client mapping that changes before the result returns', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (isOwnership(sql)) return { rows: [{ id: P1 }] };
      if (sql.includes('FROM project_sections')) seatProgram(7, P1, { projectId: 1, clientWorkspaceId: 99 });
      return { rows: [] };
    });
    const res = await request(app(7)).get(`/api/c2c/projects/${P1}/dossier`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PROJECT_ACCESS_CHANGED');
    expect(res.body.home).toBeUndefined();
  });

  it('a project the caller cannot read is 404 and no section is read', async () => {
    const res = await request(app(7)).get(`/api/c2c/projects/${OTHER}/dossier`);
    expect(res.status).toBe(404);
    expect(queryMock.mock.calls.some(([sql]) => isDossier(sql))).toBe(false);
  });

  it('an unprovisioned store is every figure unavailable, with the reason, and no 0', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (isOwnership(sql)) return { rows: [{ id: P1 }] };
      if (isDossier(sql)) throw Object.assign(new Error('relation "c2c_document_sections" does not exist'), { code: '42P01' });
      return { rows: [] };
    });
    const res = await request(app(7)).get(`/api/c2c/projects/${P1}/dossier`);
    expect(res.status).toBe(200);
    expect(res.body.home).toEqual({ state: 'unavailable', pct: null, reason: 'The governed section store is not provisioned in this environment.' });
    expect(JSON.stringify(res.body)).not.toMatch(/"pct":0\b/);
  });

  it('any other failure is a 500, never an empty dossier', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (isOwnership(sql)) return { rows: [{ id: P1 }] };
      if (isDossier(sql)) throw Object.assign(new Error('connection reset'), { code: '08006' });
      return { rows: [] };
    });
    const res = await request(app(7)).get(`/api/c2c/projects/${P1}/dossier`);
    expect(res.status).toBe(500);
    expect(res.body.home).toBeUndefined();
  });

  it('/workstreams, which it replaces, is gone', async () => {
    queryMock.mockImplementation(async (sql: string) => (isOwnership(sql) ? { rows: [{ id: P1 }] } : { rows: [] }));
    const res = await request(app(7)).get(`/api/c2c/projects/${P1}/workstreams`);
    expect(res.status).toBe(404);
  });

  it('/vault-structure, which no client called, is gone: the Vault tree is project-vault /:id and the figures are /dossier', async () => {
    // Its own project read is answered, so while the route existed this was a
    // 200 with a section tree (red against the router before F23 4/9).
    queryMock.mockImplementation(async (sql: string) =>
      (/FROM regulatory_programs\s+WHERE id = \$1 AND organization_id = \$2/.test(String(sql))
        ? { rows: [{ id: P1, name: 'NDA', product_type: 'drug' }] } : { rows: [] }));
    const res = await request(app(7)).get(`/api/c2c/projects/${P1}/vault-structure`);
    expect(res.status).toBe(404);
    expect(queryMock.mock.calls.some(([sql]) => /c2c_documents/.test(String(sql)))).toBe(false);
  });
});
