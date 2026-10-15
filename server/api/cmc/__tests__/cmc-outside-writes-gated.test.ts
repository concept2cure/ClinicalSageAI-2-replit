/**
 * The two CMC write doors outside /api/cmc refuse a viewer too.
 *
 * cmcWriteRoleGate covers /api/cmc. Change control (/api/cmc-changes) and the
 * stability programme router (/api/stability) are mounted outside it, so a
 * viewer could log a CMC change or create a stability study, condition or
 * result (security review 2026-10-05, IAM-31). Each router now refuses a
 * write from a role that may not write, before any handler runs.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const touched = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../../db', () => {
  const query = async () => {
    touched.n += 1;
    return { rows: [], rowCount: 0 };
  };
  const client = { query, release: () => undefined };
  return { getPool: () => ({ query, connect: async () => client }), pool: { query, connect: async () => client }, db: {} };
});

import cmcChanges from '../../../routes/cmc-changes.routes';
import stability from '../../../src/routes/stability.router';

function app(role: string) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.userRole = role;
    req.user = { id: 42, email: 'person@example.test', role };
    req.userId = 42;
    req.tenantId = 7;
    req.tenantContext = { organizationId: 7 };
    next();
  });
  a.use('/api/cmc-changes', cmcChanges);
  a.use('/api/stability', stability);
  return a;
}

const WRITES: Array<[string, string]> = [
  ['post', '/api/cmc-changes'],
  ['post', '/api/stability/studies'],
  ['post', '/api/stability/studies/s1/conditions'],
  ['delete', '/api/stability/conditions/c1'],
];

describe('CMC writes outside /api/cmc', () => {
  it.each(WRITES)('a viewer is refused before anything is read or written: %s %s', async (method, path) => {
    touched.n = 0;
    const res = await (request(app('viewer')) as any)[method](path).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(touched.n).toBe(0);
  });

  it.each(WRITES)('a member reaches the handler: %s %s', async (method, path) => {
    const res = await (request(app('member')) as any)[method](path).send({});
    expect(res.status).not.toBe(403);
  });

  it('a viewer still reads', async () => {
    const res = await request(app('viewer')).get('/api/cmc-changes?projectId=p1');
    expect(res.status).not.toBe(403);
  });
});
