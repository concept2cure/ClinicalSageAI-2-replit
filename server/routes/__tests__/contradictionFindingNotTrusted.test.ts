/**
 * A caller must not supply the finding that decides whether their action is
 * permitted.
 *
 * /execute-, /plan- and /explain-contradiction-resolution took `finding` — the
 * whole object — out of the request body and passed it straight downstream,
 * where its own fields drive the resolution. For /execute that includes
 * finding.authority*, which decides whether the action is allowed at all. So the
 * client supplied both the subject of the decision and the authority state used
 * to judge it, and nothing checked that the finding existed, belonged to the
 * caller's organization, or matched the findingId sent alongside it.
 *
 * /contradiction-consequence in the same file already did it correctly: take the
 * id, load the row scoped to the caller's org, refuse when it does not resolve.
 * These three now use that pattern, and a `finding` in the body is ignored.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getFindingCalls, findingRow, bridgeCalls } = vi.hoisted(() => ({
  getFindingCalls: [] as Array<{ id: string; orgId: number }>,
  findingRow: { value: null as unknown },
  bridgeCalls: [] as Array<{ fn: string; finding: unknown }>,
}));

vi.mock('../../services/contradiction-engine-service.js', () => ({
  contradictionEngineService: {
    getFinding: async (id: string, orgId: number) => {
      getFindingCalls.push({ id, orgId });
      return findingRow.value;
    },
  },
}));

vi.mock('../../services/resolution/contradiction-resolution-bridge.js', () => ({
  executeContradictionResolution: async (
    _o: number, _u: number, _p: number, _fid: string, finding: unknown,
  ) => {
    bridgeCalls.push({ fn: 'execute', finding });
    return { success: true };
  },
  planContradictionResolution: async (
    _o: number, _u: number, _p: number, _fid: string, finding: unknown,
  ) => {
    bridgeCalls.push({ fn: 'plan', finding });
    return { success: true };
  },
  explainContradictionResolution: async (
    _o: number, _p: number, _fid: string, finding: unknown,
  ) => {
    bridgeCalls.push({ fn: 'explain', finding });
    return { success: true };
  },
}));

import router from '../authoring-actions';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { tenantId: number }).tenantId = 7;
    (req as unknown as { userId: number }).userId = 42;
    (req as unknown as { userRole: string }).userRole = 'submission_lead';
    next();
  });
  app.use('/api/authoring-actions', router);
  return app;
}

/** What an attacker would send: a forged finding claiming its own authority. */
const FORGED = {
  id: 'F-1',
  authorityState: 'auto_resolvable',
  authority: { level: 'autonomous-write', requiresReviewerApproval: false },
  severity: 'trivial',
};

/** What the store actually holds for that id. */
const REAL = {
  id: 'F-1',
  authorityState: 'blocks_promotion',
  authority: { level: 'requires-approval', requiresReviewerApproval: true },
  severity: 'critical',
};

const ROUTES = [
  'execute-contradiction-resolution',
  'plan-contradiction-resolution',
  'explain-contradiction-resolution',
];

beforeEach(() => {
  getFindingCalls.length = 0;
  bridgeCalls.length = 0;
  findingRow.value = null;
});

describe.each(ROUTES)('POST /%s', (route) => {
  it('loads the finding from the store, scoped to the caller’s org', async () => {
    findingRow.value = REAL;
    await request(makeApp())
      .post(`/api/authoring-actions/${route}`)
      .send({ projectId: 1, findingId: 'F-1', finding: FORGED });

    expect(getFindingCalls).toEqual([{ id: 'F-1', orgId: 7 }]);
  });

  it('passes the STORED finding downstream, never the one in the body', async () => {
    findingRow.value = REAL;
    await request(makeApp())
      .post(`/api/authoring-actions/${route}`)
      .send({ projectId: 1, findingId: 'F-1', finding: FORGED });

    expect(bridgeCalls).toHaveLength(1);
    // The forged authority state must not reach the resolver.
    expect(bridgeCalls[0].finding).toEqual(REAL);
    expect(JSON.stringify(bridgeCalls[0].finding)).not.toMatch(/auto_resolvable/);
  });

  it('refuses when the id does not resolve for this organization', async () => {
    // Another tenant's finding id: getFinding is org-scoped, so it returns null.
    findingRow.value = null;
    const res = await request(makeApp())
      .post(`/api/authoring-actions/${route}`)
      .send({ projectId: 1, findingId: 'F-OTHER-TENANT', finding: FORGED });

    expect(res.status).toBe(404);
    // Nothing downstream ran on a finding the caller invented.
    expect(bridgeCalls).toHaveLength(0);
  });

  it('does not accept a body-only finding with no id', async () => {
    findingRow.value = REAL;
    const res = await request(makeApp())
      .post(`/api/authoring-actions/${route}`)
      .send({ projectId: 1, finding: FORGED });

    expect(res.status).toBe(400);
    expect(bridgeCalls).toHaveLength(0);
  });
});
