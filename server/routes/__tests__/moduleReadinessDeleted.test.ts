/**
 * A route that blamed a working service for its own bug.
 *
 * GET /module-readiness/:projectId/:moduleCode never once returned readiness
 * data. It built the engine payload by hand — `{ project: { id },
 * organizationId }` cast through `as any` — carrying none of the five fields
 * computeReadinessAssessment reads. The engine evaluates `completeness` first,
 * whose first statement is `payload.moduleMap.filter(...)`, so it threw a
 * TypeError on EVERY call. A bare catch swallowed it and the handler answered
 * HTTP 200 with "Readiness engine is not available."
 *
 * The engine is available and works. The caller passed it garbage and then
 * named the service as the cause — so anyone investigating would go looking for
 * an outage that never happened.
 *
 * Deleted rather than repaired because an equivalent exists and is correct:
 * GET /api/orchestration/projects/:projectId/readiness?module=… resolves the
 * org from the request, validates the project id, builds the payload with
 * assembleCrossObjectPayload, and calls the engine properly.
 *
 * (The same malformed payload at /promotion-blockers was FIXED, not deleted —
 * that route has no canonical equivalent, and there it was silently dropping
 * every readiness blocker and answering blocked:false for a gate that had
 * evaluated nothing.)
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(repo, p), 'utf8');

const actions = read('server/routes/authoring-actions.ts');
const orchestration = read('server/routes/orchestration.ts');
const bootstrap = read('server/bootstrap/register-inline-routes.ts');

describe('module readiness has one implementation', () => {
  it('the broken duplicate is gone', () => {
    expect(actions).not.toMatch(/router\.get\('\/module-readiness/);
  });

  it('the canonical route exists and is mounted', () => {
    expect(orchestration).toMatch(/router\.get\('\/projects\/:projectId\/readiness'/);
    expect(bootstrap).toMatch(/app\.use\('\/api\/orchestration'/);
  });

  it('the canonical route builds its payload with the canonical builder', () => {
    // The hand-rolled payload is precisely what threw on every call.
    expect(orchestration).toMatch(/assembleCrossObjectPayload\(\{/);
    expect(orchestration).toMatch(/organizationId: orgId/);
    // And it still covers the per-module breakdown the deleted route provided.
    expect(orchestration).toMatch(/module,/);
  });

  it('no hand-rolled readiness payload survives in authoring-actions', () => {
    /* Comments stripped: the deletion note quotes the malformed shape it is
       describing, and a prose mention is not a caller. */
    const code = actions
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/project:\s*\{\s*id:\s*Number\(projectId\)\s*\}\s*as any/);
  });
});

describe('the deleted route is unreachable', () => {
  it('404s where it used to answer 200', async () => {
    const router = (await import('../authoring-actions')).default;
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { tenantId: number }).tenantId = 7;
      next();
    });
    app.use('/api/authoring-actions', router);

    const res = await request(app).get('/api/authoring-actions/module-readiness/123/m3');

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/Readiness engine is not available/);
  });
});
