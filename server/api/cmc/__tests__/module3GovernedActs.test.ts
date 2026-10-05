/**
 * Placing Module 3 into the IND asks what the Submission Center asks of any
 * leaf placement (discovery map 2026-10-04, placement-second-door): a role
 * that may author regulatory content, and the person's reason. The route had
 * neither, so a viewer could place Module 3 into a regulator-facing sequence
 * and the ledger recorded what changed but never why.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const place = vi.fn();
vi.mock('../../../services/cmc/place-module3-into-submission', () => ({
  placeModule3IntoSubmission: (...a: unknown[]) => place(...a),
}));
const resolve = vi.fn();
// Its rules (reason, already resolved, tenant, audit row) are proven on PGlite in
// services/cmc/__tests__/contradiction-lifecycle.pglite.test.ts; here, who reaches it.
vi.mock('../../../services/cmc/contradiction-lifecycle', () => ({
  reconcileContradictions: vi.fn(),
  resolveContradiction: (...a: unknown[]) => resolve(...a),
}));
vi.mock('../../../services/cmc/project-membership', () => ({ projectBelongsToTenant: async () => true }));
vi.mock('../../../db', () => ({
  getPool: () => ({ query: vi.fn(async () => ({ rows: [] })), connect: async () => ({ query: vi.fn(), release: vi.fn() }) }),
}));

import router from '../module3OperatingSystemRoutes';

const PROGRAM = 'aaaaaaaa-0000-4000-8000-00000000000a';
const REASON = 'Initial IND: approved Module 3 placed into sequence 0001.';

function appAs(role: string) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.tenantId = 7;
    req.userId = 42;
    req.userRole = role;
    req.user = { id: 42, organizationId: 7, role, roles: role === 'viewer' ? ['viewer'] : [role, 'regulatory-author'] };
    next();
  });
  a.use('/api/cmc/module3-os', router);
  return a;
}

const post = (role: string, body: Record<string, unknown>) =>
  request(appAs(role)).post(`/api/cmc/module3-os/place-into-submission/${PROGRAM}`).send(body);

beforeEach(() => {
  resolve.mockReset();
  resolve.mockResolvedValue({ ok: true, projectId: PROGRAM });
  place.mockReset();
  place.mockResolvedValue({ placed: true, submissionId: 10, sequenceId: 20, placements: [], skipped: [] });
});

describe('placing Module 3 into the IND is a governed act', () => {
  it('refuses a viewer before anything is placed', async () => {
    const res = await post('viewer', { submissionId: 10, sequenceId: 20, reason: REASON });
    expect(res.status).toBe(403);
    expect(place).not.toHaveBeenCalled();
  });

  it('refuses a placement with no stated reason, naming the field', async () => {
    for (const reason of [undefined, '', '   ', 'short']) {
      const res = await post('member', { submissionId: 10, sequenceId: 20, ...(reason === undefined ? {} : { reason }) });
      expect(res.status, String(reason)).toBe(400);
      expect(res.body).toMatchObject({ code: 'REASON_REQUIRED', field: 'reason' });
    }
    expect(place).not.toHaveBeenCalled();
  });

  it('places for an author with a reason, and carries the reason to every leaf', async () => {
    const res = await post('member', { submissionId: 10, sequenceId: 20, reason: `  ${REASON}  ` });
    expect(res.status).toBe(200);
    expect(place).toHaveBeenCalledWith(expect.objectContaining({ orgId: 7, submissionId: 10, sequenceId: 20, reason: REASON }));
  });
});

describe('resolving a contradiction is a governed act', () => {
  const NOTE = 'Method AM-1 revalidated for the specification range (VR-021).';
  const patch = (role: string, body: Record<string, unknown>) =>
    request(appAs(role)).patch('/api/cmc/module3-os/contradictions/cccccccc-0000-4000-8000-00000000000c/resolve').send(body);

  it('refuses a viewer before anything is resolved', async () => {
    const res = await patch('viewer', { resolutionNote: NOTE });
    expect(res.status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('resolves for a member, under their own id, with their note', async () => {
    const res = await patch('member', { resolutionNote: NOTE });
    expect(res.status).toBe(200);
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7, userId: 42, reason: NOTE }));
  });

  it('answers the service’s refusal with its own status and sentence', async () => {
    resolve.mockResolvedValueOnce({ ok: false, status: 422, code: 'REASON_REQUIRED', message: 'A reason for change is required.' });
    const res = await patch('member', {});
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: 'REASON_REQUIRED', field: 'resolutionNote' });
  });
});
