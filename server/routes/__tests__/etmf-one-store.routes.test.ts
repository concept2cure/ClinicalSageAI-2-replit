/**
 * One trial master file store behind /api/etmf (eTMF convergence E4 step 4, 2026-11-12;
 * docs/design/ETMF_CONVERGENCE_E4_PLAN_2026-11-10.md; founder decisions P-74, P-124).
 *
 * Two route families shared the mount: the deployed store's (routes/etmf.routes.ts) and the second store's
 * (routes/etmf.ts: tmf_files and tmf_artifacts, which no deploy creates). Every caller of the second family
 * converged in steps 1-3, so it is deleted with its metrics. This pins that the mount carries the one family: the
 * second family's eight paths are not served, and the deployed store's still are.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  default: (_req: any, _res: any, next: any) => next(),
}));

const exists = (rel: string) => fs.existsSync(fileURLToPath(new URL(rel, import.meta.url)));
const read = (rel: string) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
let app: express.Express;

/** The route modules the bootstrap's eTMF block imports, as it imports them: what /api/etmf serves. */
function etmfModulesOfTheBootstrap(): string[] {
  const source = read('../../bootstrap/register-inline-routes.ts');
  const start = source.indexOf('// eTMF —');
  const block = source.slice(start, source.indexOf("app.use('/api/etmf'", start));
  return [...block.matchAll(/import\('\.\.\/routes\/(etmf[^']*)'\)/g)].map((m) => m[1]);
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: 9, organizationId: 1, roles: ['regulatory-author'] }; next(); });
  // Mounted as server/bootstrap/register-inline-routes.ts mounts /api/etmf: every router its eTMF block imports.
  const gateway = express.Router();
  for (const name of etmfModulesOfTheBootstrap()) gateway.use((await import(`../${name}.ts`)).default);
  app.use('/api/etmf', gateway);
});

describe('/api/etmf serves the deployed trial master file store only', () => {
  it('the second store\'s route file and metrics are gone, and the bootstrap mounts the one router', () => {
    expect(exists('../etmf.ts')).toBe(false);
    expect(exists('../../services/etmf-metrics.ts')).toBe(false);
    expect(etmfModulesOfTheBootstrap()).toEqual(['etmf.routes']);
    expect(read('../../startup/inline-endpoints.ts')).not.toMatch(/etmf-metrics/);
  });

  it.each([
    ['post', '/api/etmf/files'],
    ['get', '/api/etmf/files'],
    ['post', '/api/etmf/files/1/seed'],
    ['post', '/api/etmf/files/1/artifacts'],
    ['get', '/api/etmf/files/1/artifacts'],
    ['patch', '/api/etmf/artifacts/1/status'],
    ['get', '/api/etmf/files/1/completeness'],
    ['get', '/api/etmf/classify?artifactName=Protocol'],
  ] as const)('%s %s is not served', async (method, path) => {
    const res = await (request(app) as any)[method](path).send({ reason: 'A reason of some length.' });
    expect(res.status).toBe(404);
  });

  it('the deployed store\'s routes still answer', async () => {
    expect((await request(app).get('/api/etmf/reference-model')).status).toBe(200);
    expect((await request(app).post('/api/etmf/completeness').send({ providedArtifacts: [] })).status).toBe(200);
  });
});
