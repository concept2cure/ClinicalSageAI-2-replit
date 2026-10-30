/**
 * Training assignment, slice 2's review round 1 (P-49, P-50 Q3; MR-12 Stage 4;
 * docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md D4, §3.8). On the fixture
 * qms-training-assignments-fixture.ts shares with qms-training-assignments.dbtest.ts:
 *   - a designated QMS approver whose persisted role is, or becomes while the
 *     write waits, viewer is refused on the role read inside the write's
 *     transaction (a designation is not cleared when the role changes), and is
 *     never offered the change;
 *   - canAssign is unknown (null), never "may not", when the read check could
 *     not run;
 *   - the people assigned are listed in full only to administrators and
 *     designated QMS approvers; anyone else sees their own line and the count;
 *   - a pending first version, a withdrawal by someone who has left the role,
 *     the covered-since instant and a departed named person, which slices 3 and
 *     4 build on, are each pinned (slice2-fix-mutations.txt kills a mutant of each).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  A, D, PASSWORD, REASON, account, assign, assignmentRows, call, countAll, document, listing,
  orgA, orgD, owner, provisionTrainingAssignmentFixture, role, teardownTrainingAssignmentFixture, unassign,
} from './qms-training-assignments-fixture';

/* The content read check, real unless a case asks it to be unavailable (a 503 from the governance it consults). */
const failRead = vi.hoisted(() => ({ on: false }));
vi.mock('../../server/services/qms/controlled-document-content', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../server/services/qms/controlled-document-content')>();
  return {
    ...real,
    authorizeQmsContentRead: async (...args: Parameters<typeof real.authorizeQmsContentRead>) => {
      if (failRead.on) throw new real.QmsContentRefusedError(503, 'QMS_CONTENT_GOVERNANCE_UNAVAILABLE', 'Content governance could not be read.');
      return real.authorizeQmsContentRead(...args);
    },
  };
});

beforeAll(provisionTrainingAssignmentFixture, 120_000);
afterAll(teardownTrainingAssignmentFixture);

describe('review round 1: the designee\'s role is part of the authority, read on the write\'s transaction', () => {
  it('a designated QMS approver whose role is viewer is offered nothing and refused; nothing is written', async () => {
    const docId = await document(orgD);
    const designee = await account(orgD.id, 'viewer-designee', 'member');
    await owner.query(`UPDATE organization_users SET qms_approver_designated_at = now(), qms_approver_designated_by = $3
       WHERE organization_id = $1 AND user_id = $2`, [orgD.id, designee.id, D.admin.id]);
    await owner.query("UPDATE organization_users SET role = 'viewer' WHERE organization_id = $1 AND user_id = $2", [orgD.id, designee.id]);
    const before = await countAll();
    expect((await listing(designee, docId)).body.data.canAssign, 'the screen is not offered a change the server refuses').toBe(false);
    expect((await assign(designee, docId, { userId: D.member.id })).status).toBe(403);
    expect(await countAll()).toBe(before);
  });

  it('canAssign is unknown (null), never "may not", when whether the reader can read the document could not be checked', async () => {
    const docId = await document(orgA);
    failRead.on = true;
    try {
      const read = await listing(A.admin, docId);
      expect(read.status, 'the listing itself is still served').toBe(200);
      expect(read.body.data.canAssign).toBeNull();
    } finally {
      failRead.on = false;
    }
    expect((await listing(A.admin, docId)).body.data.canAssign).toBe(true);
  });

  it('a designee demoted to viewer while the write waits on the membership row is seen: 403, nothing written', async () => {
    const docId = await document(orgD);
    const racer = await account(orgD.id, 'racing-designee', 'member');
    await owner.query(`UPDATE organization_users SET qms_approver_designated_at = now(), qms_approver_designated_by = $3
       WHERE organization_id = $1 AND user_id = $2`, [orgD.id, racer.id, D.admin.id]);
    const before = await countAll();
    const demotion = await owner.connect();
    let settled = false;
    try {
      await demotion.query('BEGIN');
      await demotion.query("UPDATE organization_users SET role = 'viewer' WHERE organization_id = $1 AND user_id = $2", [orgD.id, racer.id]);
      const pending = assign(racer, docId, { userId: D.member.id }).then((res) => { settled = true; return res; });
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      expect(settled, 'the write waits on the membership row the demotion holds (FOR SHARE)').toBe(false);
      await demotion.query('COMMIT');
      const res = await pending;
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(res.body.error).toBe('QMS_TRAINING_ASSIGN_AUTHORITY');
    } finally {
      await demotion.query('ROLLBACK').catch(() => undefined);
      demotion.release();
    }
    expect(await assignmentRows(docId)).toHaveLength(0);
    expect(await countAll(), 'no assignment and no ledger row').toBe(before);
  });
});

describe('review round 1: who sees the people assigned (P-50 Q3), and the branches later slices build on', () => {
  it('administrators and designated QMS approvers see every person assigned; anyone else sees their own line and the count', async () => {
    const docId = await document(orgD);
    const qa = await role(D.admin, 'Narrowed roster', [D.member, D.approver]);
    expect((await assign(D.admin, docId, { jobRoleId: qa })).status).toBe(201);
    const both = [D.member.id, D.approver.id].sort((a, b) => a - b);
    for (const who of [D.admin, D.designated]) {
      const data = (await listing(who, docId)).body.data;
      expect(data).toMatchObject({ peopleScope: 'everyone', peopleCount: 2 });
      expect(data.people.map((p: { userId: number }) => p.userId).sort((a: number, b: number) => a - b)).toEqual(both);
    }
    const asMember = (await listing(D.member, docId)).body.data;
    expect(asMember).toMatchObject({ peopleScope: 'own', peopleCount: 2 });
    expect(asMember.people.map((p: { userId: number }) => p.userId), 'only their own line').toEqual([D.member.id]);
    const reader = await account(orgD.id, 'not-assigned-reader', 'member');
    expect((await listing(reader, docId)).body.data).toMatchObject({ peopleScope: 'own', peopleCount: 2, people: [] });
  });

  it('a first version approved for a later day is pending, with nothing yet in force', async () => {
    const docId = await document(orgA, { status: 'in_review' });
    const approved = await call(A.approver, 'post', `/documents/${docId}/approve`,
      { password: PASSWORD, meaning: 'APPROVED', reason: 'Independent release of the procedure for a later day.', effectiveDate: '2099-01-01' });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect((await listing(A.member, docId)).body.data.trainable).toEqual({ inForce: null, pending: { version: '1.0', effectiveDate: '2099-01-01' } });
  });

  it('an administrator who has left a role may withdraw that role\'s assignment; while they held it, they could not', async () => {
    const docId = await document(orgA);
    const held = await role(A.admin, 'Left before withdrawal', [A.admin]);
    const assignmentId = Number((await assign(A.admin2, docId, { jobRoleId: held })).body.data.id);
    expect((await unassign(A.admin, docId, assignmentId)).status, 'it covers them').toBe(403);
    expect((await call(A.admin2, 'delete', `/job-roles/${held}/members/${A.admin.id}`, { reason: REASON })).status).toBe(200);
    const res = await unassign(A.admin, docId, assignmentId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it('a person is covered from the later of the assignment and their joining the role: the instant a late assignment\'s grace runs from', async () => {
    const docId = await document(orgA);
    const late = await role(A.admin, 'Late joiner');
    expect((await assign(A.admin, docId, { jobRoleId: late })).status).toBe(201);
    const assignedAt = (await owner.query('SELECT assigned_at FROM qms_training_assignments WHERE document_id = $1', [docId])).rows[0].assigned_at as Date;
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect((await call(A.admin, 'post', `/job-roles/${late}/members`, { userId: A.unassigned.id, reason: REASON })).status).toBe(201);
    const added = (await owner.query('SELECT added_at FROM qms_job_role_members WHERE job_role_id = $1 AND user_id = $2', [late, A.unassigned.id])).rows[0].added_at as Date;
    expect(added.getTime()).toBeGreaterThan(assignedAt.getTime());
    const person = (await listing(A.admin, docId)).body.data.people.find((p: { userId: number }) => p.userId === A.unassigned.id);
    expect(person?.coveredSince).toBe(added.toISOString());
  });

  it('a named person who leaves keeps the assignment row, shown as not active, and is no longer among the people', async () => {
    const docId = await document(orgA);
    const leaver = await account(orgA.id, 'named-leaver', 'member');
    const id = Number((await assign(A.admin, docId, { userId: leaver.id })).body.data.id);
    await owner.query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [orgA.id, leaver.id]);
    const data = (await listing(A.admin, docId)).body.data;
    expect(data.assignments.find((a: { id: number }) => a.id === id)).toMatchObject({ kind: 'person', userId: leaver.id, active: false });
    expect(data).toMatchObject({ people: [], peopleCount: 0 });
  });
});
