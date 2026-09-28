/**
 * PATCH and DELETE /api/stability/results/:resultId act on the tenant's own
 * result, in one transaction with the audit record of what changed.
 *
 * Security audit 2026-09-24, IAM-11 (plan P1-8): both handlers wrote by
 * result_id alone with no tenant predicate, answered { ok: true } whether or
 * not a row existed, and wrote no audit record; result_add and result_review
 * beside them do. 21 CFR 11.10(e): a change to a stability result is recorded
 * with its previous value, and a deletion is recorded at all.
 *
 * Same scaffold as stability-upload-guards.test.ts: the pool is a client
 * double that records every statement, and the tenant scope is 7.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({
  owned: true,
  calls: [] as { sql: string; params: unknown[] }[],
}));
const { connect } = vi.hoisted(() => {
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      state.calls.push({ sql, params });
      if (/^\s*select/i.test(sql) && /from stab_results/i.test(sql)) {
        return state.owned
          ? { rows: [{ result_id: 'r-1', study_id: 'st-1', value: '1.0', unit: 'mg', pass: true, remarks: null }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (/^\s*(update|delete)/i.test(sql)) return { rows: [], rowCount: state.owned ? 1 : 0 };
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  };
  return { connect: vi.fn(async () => client) };
});
// The router (server/src/routes) imports '../../db' = server/db; from this test that is '../../../db'.
vi.mock('../../../db', () => ({ getPool: () => ({ connect, query: vi.fn() }), pool: { connect, query: vi.fn() } }));
vi.mock('../../../db/tenantStore', () => ({ getTenantScope: () => ({ tenantId: 7, orgUuid: 'org-7', role: 'editor' }) }));

import router from '../stability.router';

function app(user: unknown = { id: 1, email: 'qa@example.test', organizationId: 7, role: 'editor' }) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = user;
    (req as any).tenantId = 7;
    next();
  });
  a.use('/api/stability', router);
  return a;
}

const heads = () => state.calls.map(c => c.sql.trim().split(/\s+/).slice(0, 2).join(' ').toUpperCase());
const writes = () => state.calls.filter(c => /^\s*(update|delete)\s+(from\s+)?stab_results/i.test(c.sql));
const audits = () => state.calls.filter(c => /insert into stab_audit/i.test(c.sql));

beforeEach(() => {
  state.owned = true;
  state.calls.length = 0;
  connect.mockClear();
});

describe('PATCH /results/:resultId', () => {
  it('updates the tenant\'s own result in one transaction: read with the tenant predicate, write, audit with the previous value, COMMIT', async () => {
    const res = await request(app()).patch('/api/stability/results/r-1').send({ value: '1.2', remarks: 'reassayed' });
    expect(res.status).toBe(200);
    const read = state.calls.find(c => /^\s*select/i.test(c.sql) && /from stab_results/i.test(c.sql));
    expect(read?.sql).toMatch(/tenant_id\s*=\s*\$2/);
    expect(String(read?.params[1])).toBe('7');
    expect(writes()).toHaveLength(1);
    expect(writes()[0].sql).toMatch(/^\s*update stab_results/i);
    expect(writes()[0].sql).toMatch(/tenant_id\s*=/);
    expect(audits()).toHaveLength(1);
    expect(audits()[0].params[2]).toBe('result_update');
    const payload = JSON.parse(String(audits()[0].params[3]));
    expect(payload.previous).toMatchObject({ value: '1.0', unit: 'mg' });
    expect(payload.changes).toMatchObject({ value: '1.2', remarks: 'reassayed' });
    const h = heads();
    expect(h.indexOf('BEGIN')).toBeLessThan(h.indexOf('UPDATE STAB_RESULTS'));
    expect(h.indexOf('UPDATE STAB_RESULTS')).toBeLessThan(h.indexOf('INSERT INTO'));
    expect(h.indexOf('INSERT INTO')).toBeLessThan(h.indexOf('COMMIT'));
  });

  it('is 404 for a result outside the tenant, and writes nothing', async () => {
    state.owned = false;
    const res = await request(app()).patch('/api/stability/results/r-9').send({ value: '1.2' });
    expect(res.status).toBe(404);
    expect(writes()).toHaveLength(0);
    expect(audits()).toHaveLength(0);
    expect(heads()).not.toContain('COMMIT');
  });

  it('is 401 without a verified actor, before any connection is taken', async () => {
    const res = await request(app(null)).patch('/api/stability/results/r-1').send({ value: '1.2' });
    expect(res.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('DELETE /results/:resultId', () => {
  it('deletes the tenant\'s own result and records what was deleted, in one transaction', async () => {
    const res = await request(app()).delete('/api/stability/results/r-1');
    expect(res.status).toBe(200);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].sql).toMatch(/^\s*delete from stab_results/i);
    expect(writes()[0].sql).toMatch(/tenant_id\s*=/);
    expect(audits()).toHaveLength(1);
    expect(audits()[0].params[2]).toBe('result_delete');
    expect(JSON.parse(String(audits()[0].params[3])).previous).toMatchObject({ value: '1.0', unit: 'mg', pass: true });
    const h = heads();
    expect(h.indexOf('DELETE FROM')).toBeLessThan(h.indexOf('INSERT INTO'));
    expect(h.indexOf('INSERT INTO')).toBeLessThan(h.indexOf('COMMIT'));
  });

  it('is 404 for a result outside the tenant, and deletes nothing', async () => {
    state.owned = false;
    const res = await request(app()).delete('/api/stability/results/r-9');
    expect(res.status).toBe(404);
    expect(writes()).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });

  it('is 401 without a verified actor', async () => {
    const res = await request(app(null)).delete('/api/stability/results/r-1');
    expect(res.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });
});
