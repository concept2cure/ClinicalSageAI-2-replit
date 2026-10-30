/**
 * Training compliance counts the people assigned, through the real routes
 * (P-49, P-50 Q3; MR-12 Stage 4 slice 3a; docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md
 * §3.6). On PostgreSQL as the runtime role with RLS on, on the fixture the
 * assignment suites share:
 *   - GET /qms/training/compliance: a document assigned to nobody has no
 *     figure; an assigned one counts the distinct active people assigned and
 *     those of them with a current receipt; each row carries the reader's own
 *     line; meta.summary is the one register figure;
 *   - GET /qms/training and GET /qms/training/expiring, person by person, are
 *     for administrators and designated QMS approvers (the Approver role stands
 *     in while nobody is designated); anyone else gets their own rows.
 * The production read itself: server/services/qms/__tests__/training-compliance.pglite.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  A, assign, call, effectiveDocument, owner, provisionTrainingAssignmentFixture, role, teardownTrainingAssignmentFixture, type Actor,
} from './qms-training-assignments-fixture';

beforeAll(provisionTrainingAssignmentFixture, 120_000);
afterAll(teardownTrainingAssignmentFixture);

/** Acknowledge the release in force as `who`, through the real read and acknowledgement routes. */
async function acknowledge(who: Actor, documentId: number): Promise<void> {
  const read = await call(who, 'get', `/documents/${documentId}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  const training = read.body.meta.training as { documentVersion: string; contentDigest: string };
  const res = await call(who, 'post', `/documents/${documentId}/training-ack`,
    { documentVersion: training.documentVersion, contentDigest: training.contentDigest, understood: true, method: 'attestation' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}
const compliance = async (who: Actor) => {
  const res = await call(who, 'get', '/training/compliance');
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as { data: Array<Record<string, unknown> & { id: number }>; meta: { summary: Record<string, unknown> } };
};

describe('compliance counts the people assigned (P-49)', () => {
  it('a document assigned to nobody has no figure; one assigned by role and by name counts those people, with the reader\'s own line', async () => {
    const nobody = await effectiveDocument();
    const assigned = await effectiveDocument();
    const qa = await role(A.admin, 'Compliance QA', [A.qa1, A.qa2]);
    expect((await assign(A.admin, assigned, { jobRoleId: qa })).status).toBe(201);
    expect((await assign(A.admin, assigned, { userId: A.named.id })).status).toBe(201);
    await acknowledge(A.qa1, assigned);
    await acknowledge(A.member, assigned);
    const body = await compliance(A.qa1);
    const row = (id: number) => body.data.find((r) => r.id === id);
    expect(row(nobody)).toMatchObject({ assignment: 'not_assigned', current: null, of: null });
    expect(row(assigned), 'the member who is not assigned does not count').toMatchObject({
      assignment: 'assigned', current: 1, of: 3, me: { assigned: true, countsNow: true } });
    expect(body.meta.summary).toMatchObject({ documents: 2, assigned: 1, notAssigned: 1, noActiveAssignees: 0, averageCurrentPct: 33 });
    const asMember = await compliance(A.member);
    expect(asMember.data.find((r) => r.id === assigned)?.me, 'their receipt is valid; nobody requires it').toEqual({ assigned: false, countsNow: true });
  });
});

describe('training person by person is for administrators and QMS approvers (P-50 Q3)', () => {
  it('the training records: an administrator and the Approver-role stand-in see every member\'s; anyone else only their own', async () => {
    const docId = await effectiveDocument();
    await acknowledge(A.qa1, docId);
    await acknowledge(A.qa2, docId);
    for (const who of [A.admin, A.approver]) {
      const body = (await call(who, 'get', '/training')).body;
      expect(body.meta.scope).toBe('everyone');
      expect(body.data.map((r: { user_id: number }) => r.user_id)).toEqual(expect.arrayContaining([A.qa1.id, A.qa2.id]));
    }
    const own = (await call(A.qa1, 'get', '/training')).body;
    expect(own.meta.scope).toBe('own');
    expect(new Set(own.data.map((r: { user_id: number }) => r.user_id))).toEqual(new Set([A.qa1.id]));
    expect((await call(A.viewer, 'get', '/training')).body).toMatchObject({ data: [], meta: { scope: 'own' } });
  });

  it('training due to lapse: the people assigned only; every one for an administrator, only their own for anyone else', async () => {
    const docId = await effectiveDocument();
    expect((await assign(A.admin, docId, { userId: A.qa1.id })).status).toBe(201);
    expect((await assign(A.admin, docId, { userId: A.qa2.id })).status).toBe(201);
    await acknowledge(A.qa1, docId);
    await acknowledge(A.qa2, docId);
    await acknowledge(A.member, docId);
    await owner.query("UPDATE qms_training_records SET expires_at = now() + interval '10 days' WHERE document_id = $1", [docId]);
    const forAdmin = (await call(A.admin, 'get', '/training/expiring?within=60')).body;
    expect(forAdmin.meta.scope).toBe('everyone');
    expect(forAdmin.data.filter((r: { documentId: number }) => r.documentId === docId).map((r: { userId: number }) => r.userId).sort((a: number, b: number) => a - b),
      'the member who is not assigned is not listed').toEqual([A.qa1.id, A.qa2.id].sort((a, b) => a - b));
    const forQa1 = (await call(A.qa1, 'get', '/training/expiring?within=60')).body;
    expect(forQa1.meta.scope).toBe('own');
    expect(forQa1.data.length).toBeGreaterThan(0);
    expect(forQa1.data.every((r: { userId: number }) => r.userId === A.qa1.id)).toBe(true);
  });
});
