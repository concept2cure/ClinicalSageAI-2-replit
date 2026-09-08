/**
 * GET /api/ana-ri/decisions is authenticated (register-ai-routes.ts mounts the
 * ana-ri router behind authenticateToken) but was not tenant-scoped: it read
 * `project_id` straight off the query string and handed back that project's
 * governed decision trail, whoever asked.
 *
 * Authentication is not authorization. Four sibling handlers in the same file
 * already pull `numericOrgId` off the request; this one did not, so any
 * authenticated user of any organization could read another organization's
 * decision records — the same defect closed for authoring-actions in 90bc64a,
 * on a route that pass missed.
 *
 * Decision records live in an in-memory Map, so Postgres RLS is not standing
 * behind this route. The filter has to be in the handler or it does not exist.
 */

import express from 'express';
import request from 'supertest';
import { Router } from 'express';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const ORG_A = 1;
const ORG_B = 2;
const PROJECT_A = '9101';

let app: express.Express;
let decisionLifecycleService: typeof import('../../../services/decision-lifecycle-service').decisionLifecycleService;
/** Set per-test to whatever tenant the caller should present. */
let callerOrgId: number | null = ORG_A;

beforeAll(async () => {
  const { mountUtilityRoutes } = await import('../utility');
  ({ decisionLifecycleService } = await import('../../../services/decision-lifecycle-service'));

  const router = Router();
  mountUtilityRoutes(router);

  app = express();
  app.use(express.json());
  // Stands in for authenticateToken: the caller IS authenticated. What differs
  // between the two cases below is only which organization they belong to.
  app.use((req, _res, next) => {
    (req as any).tenantId = callerOrgId;
    (req as any).userId = 42;
    next();
  });
  app.use('/api/ana-ri', router);
});

beforeEach(() => {
  callerOrgId = ORG_A;
});

/** A governed decision owned by ORG_A, on ORG_A's project. */
function seedOrgADecision() {
  return decisionLifecycleService.recordPreflightDecision({
    projectId: PROJECT_A,
    organizationId: ORG_A,
    kind: 'section-preflight-judgment',
    sectionCode: '2.5',
    moduleCode: 'm2',
    overall: 'blocked',
    summary: 'Org A confidential: unresolved safety contradiction in 2.5',
    sourceSignals: [],
  });
}

describe('GET /api/ana-ri/decisions — tenant scoping', () => {
  it("returns the caller's own organization's decisions", async () => {
    seedOrgADecision();
    callerOrgId = ORG_A;

    const res = await request(app).get(`/api/ana-ri/decisions?project_id=${PROJECT_A}`);

    expect(res.status).toBe(200);
    // The owning tenant still sees its own trail — the fix must scope, not just deny.
    expect(JSON.stringify(res.body)).toContain('Org A confidential');
  });

  it('does NOT hand another organization the decision trail for a project it does not own', async () => {
    seedOrgADecision();
    // Same authenticated request, different tenant. Nothing else changes.
    callerOrgId = ORG_B;

    const res = await request(app).get(`/api/ana-ri/decisions?project_id=${PROJECT_A}`);

    // Either a refusal or an empty trail is acceptable; leaking the summary is not.
    expect(JSON.stringify(res.body)).not.toContain('Org A confidential');
  });

  it('a caller with no resolvable tenant gets nothing, not everything', async () => {
    seedOrgADecision();
    callerOrgId = null;

    const res = await request(app).get(`/api/ana-ri/decisions?project_id=${PROJECT_A}`);

    // Fail closed: an unresolvable tenant must not read as "no filter".
    expect(JSON.stringify(res.body)).not.toContain('Org A confidential');
  });
});
