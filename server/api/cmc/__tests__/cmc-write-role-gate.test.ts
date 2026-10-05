/**
 * Every write under /api/cmc needs a writing role; a viewer reads.
 *
 * The gate is mounted once ahead of every CMC router. The first case is the
 * defect: a viewer created a drug substance, recompiled Module 3 and swept
 * contradictions, because none of those routes checked a role.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cmcWriteRoleGate } from '../cmc-write-role-gate';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.userRole = req.header('x-test-role');
    req.tenantContext = { organizationId: 7 };
    next();
  });
  a.use('/api/cmc', cmcWriteRoleGate);
  a.use('/api/cmc', (_req, res) => res.status(200).json({ reached: true }));
  return a;
}

const WRITES: Array<[string, string]> = [
  ['post', '/api/cmc/drug-substances'],
  ['put', '/api/cmc/drug-substances/5'],
  ['post', '/api/cmc/specifications'],
  ['put', '/api/cmc/batch-records/9'],
  ['post', '/api/cmc/module3-os/compile/p1'],
  ['post', '/api/cmc/module3-os/contradictions/p1'],
  ['post', '/api/cmc/module3-os/sections/p1/3.2.S.1/refresh'],
  ['post', '/api/cmc/module3-os/build-section/p1/3.2.S.1'],
  ['patch', '/api/cmc/agency-questions/3'],
  ['post', '/api/cmc/stability-studies'],
  // No DELETE route remains under /api/cmc — the last ones went with
  // documentRoutes.ts and projectRoutes.ts on 2026-10-05 — so this is the
  // method on a live prefix: the gate refuses it before any router is asked.
  ['delete', '/api/cmc/specifications/1'],
];

const COMPUTATIONS = [
  '/api/cmc/ich-compliance',
  '/api/cmc/control-strategy',
  '/api/cmc/variations/classify',
  '/api/cmc/stability-studies/12/shelf-life',
  '/api/cmc/stability-studies/12/trending',
  '/api/cmc/stability-studies/poolability',
  '/api/cmc/module3-os/guard/final-export/p1',
];

describe('/api/cmc write-role gate', () => {
  it.each(WRITES)('a viewer is refused: %s %s', async (method, path) => {
    const r = await (request(app()) as any)[method](path).set('x-test-role', 'viewer').send({});
    expect(r.status).toBe(403);
    expect(r.body.reached).toBeUndefined();
  });

  it.each(WRITES)('a member writes: %s %s', async (method, path) => {
    const r = await (request(app()) as any)[method](path).set('x-test-role', 'member').send({});
    expect(r.status).toBe(200);
  });

  it('a request with no role writes nothing', async () => {
    const r = await request(app()).post('/api/cmc/drug-substances').send({});
    expect(r.status).toBe(403);
  });

  it('a viewer reads', async () => {
    const r = await request(app()).get('/api/cmc/drug-substances?projectId=p1').set('x-test-role', 'viewer');
    expect(r.status).toBe(200);
  });

  it.each(COMPUTATIONS)('a viewer runs a computation that saves nothing: POST %s', async (path) => {
    const r = await request(app()).post(path).set('x-test-role', 'viewer').send({});
    expect(r.status).toBe(200);
  });

  it('the exemptions are exact: a write beside a computation is still refused', async () => {
    for (const path of ['/api/cmc/stability-studies/12', '/api/cmc/ich-compliance/extra', '/api/cmc/module3-os/guard/final-export/p1/x']) {
      const r = await request(app()).post(path).set('x-test-role', 'viewer').send({});
      expect(r.status, path).toBe(403);
    }
  });

  it('is mounted ahead of every /api/cmc router', () => {
    const src = readFileSync(resolve(__dirname, '../../../bootstrap/register-core-routes.ts'), 'utf8');
    const mounts = [...src.matchAll(/app\.use\('(\/api\/cmc[^']*)',\s*([A-Za-z0-9_]+)/g)].map((m) => ({ at: m.index ?? 0, path: m[1], fn: m[2] }));
    const gate = mounts.find((m) => m.fn === 'cmcWriteRoleGate');
    expect(gate?.path).toBe('/api/cmc');
    const routers = mounts.filter((m) => m.fn !== 'cmcWriteRoleGate');
    expect(routers.length).toBeGreaterThan(5);
    for (const m of routers) expect(m.at, m.path).toBeGreaterThan(gate!.at);
  });
});
