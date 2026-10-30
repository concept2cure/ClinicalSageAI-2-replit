/**
 * Who must train on a controlled document: its assignments, by job role and by
 * name (P-49, P-50; MR-12 Stage 4; docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md
 * §3.2, the assignment half of §3.8, and D4, slice 2).
 *
 * An assignment belongs to the document, not to a version, and names exactly
 * one job role or one person. Who is assigned is computed in one place, the
 * resolver in server/services/qms/training-assignment.ts. Here, on PostgreSQL
 * as the runtime role with RLS on, through the real routes:
 *   - an administrator, a designated QMS approver and (while nobody is
 *     designated) the Approver-role stand-in assign a role and a person; each
 *     write is one row and one ledger pair, committed by one transaction;
 *   - a member and a manager are refused by the authority rule, a viewer by the
 *     editor gate, an approver who cannot read the authored document by the
 *     rule that nobody requires someone to read what they cannot read, an
 *     organization pending deletion by its standing; nothing is written;
 *   - a duplicate, another organization's document, role or person, a deleted
 *     role, a form or a specification, a retired document, and a body naming
 *     both subjects are each refused, with nothing written;
 *   - removal is soft and audited, and removing an assignment that covers the
 *     actor (by name, or by a role they hold) is refused;
 *   - the read resolves the people: named people and role members, active
 *     only, each once with every path; removed members, removed assignments,
 *     deleted roles, suspended and departed accounts and another
 *     organization's users are not assigned;
 *   - the people are listed in full to an administrator; a member who is not
 *     assigned sees the count (P-50 Q3).
 * Review round 1's cases are in qms-training-assignments-review.dbtest.ts, on
 * the same fixture (qms-training-assignments-fixture.ts).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { withNativeCatalogClient } from './catalog-native-fixture';
import {
  A, B, C, D, REASON, TAG, account, assign, assignmentRows, call, countAll, document, effectiveDocument, ledger, listing,
  orgA, orgB, orgC, orgD, owner, programId, provisionTrainingAssignmentFixture, retiredDocument, role, teardownTrainingAssignmentFixture, unassign,
} from './qms-training-assignments-fixture';

/* The governed ledger writer, real unless a case asks the next assignment write's pair to fail. */
const failLedger = vi.hoisted(() => ({ on: false }));
vi.mock('../../server/routes/c2c/actions', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../server/routes/c2c/actions')>();
  return {
    ...real,
    recordGovernedAction: async (...args: Parameters<typeof real.recordGovernedAction>) => {
      const payload = (args[1]?.payload ?? {}) as { change?: unknown };
      if (failLedger.on && String(args[1]?.target ?? '').startsWith('qms-document:') && String(payload.change ?? '').startsWith('training-')) {
        failLedger.on = false;
        throw new Error('injected ledger write failure');
      }
      return real.recordGovernedAction(...args);
    },
  };
});

beforeAll(provisionTrainingAssignmentFixture, 120_000);
afterAll(teardownTrainingAssignmentFixture);

describe('who may assign training (D4): an administrator or a designated QMS approver', () => {
  it('an administrator assigns a role and a person: one row and one ledger pair each, committed together', async () => {
    const docId = await document(orgA);
    const qa = await role(A.admin, 'Quality Assurance', [A.qa1, A.qa2]);
    const byRole = await assign(A.admin, docId, { jobRoleId: qa });
    expect(byRole.status, JSON.stringify(byRole.body)).toBe(201);
    const roleAssignmentId = Number(byRole.body.data.id);
    expect(byRole.body.data).toMatchObject({ id: roleAssignmentId, documentId: docId, kind: 'role', jobRoleId: qa, userId: null });
    const byName = await assign(A.admin, docId, { userId: A.named.id });
    expect(byName.status, JSON.stringify(byName.body)).toBe(201);
    expect(byName.body.data).toMatchObject({ documentId: docId, kind: 'person', jobRoleId: null, userId: A.named.id });
    const rows = await assignmentRows(docId);
    expect(rows.map((r) => [r.job_role_id, r.user_id, r.assigned_by, r.removed])).toEqual([
      [qa, null, A.admin.id, false], [null, A.named.id, A.admin.id, false]]);
    const pairs = await ledger(orgA.id, `qms-document:${docId}`);
    expect(pairs.map((p) => [p.command, p.domain, p.reason, p.user_id, p.payload])).toEqual([
      ['create', 'qms', REASON, A.admin.id, { change: 'training-assigned', assignmentId: roleAssignmentId, jobRoleId: qa }],
      ['create', 'qms', REASON, A.admin.id, { change: 'training-assigned', assignmentId: Number(byName.body.data.id), userId: A.named.id }],
    ]);
    expect(pairs[0].audit_xmin, 'the audit row was written by the transaction that wrote the assignment').toBe(rows[0].xmin);
    expect(pairs[0].action_xmin).toBe(rows[0].xmin);
    expect(pairs[1].audit_xmin).toBe(rows[1].xmin);
  });

  it('the Approver role stands in while nobody is designated; once someone is, the designee assigns and the Approver role alone does not', async () => {
    const docA = await document(orgA);
    const standIn = await assign(A.approver, docA, { userId: A.member.id });
    expect(standIn.status, JSON.stringify(standIn.body)).toBe(201);
    const docD = await document(orgD);
    const designated = await assign(D.designated, docD, { userId: D.member.id });
    expect(designated.status, JSON.stringify(designated.body)).toBe(201);
    const before = await countAll();
    const notDesignated = await assign(D.approver, docD, { userId: D.admin.id });
    expect(notDesignated.status, JSON.stringify(notDesignated.body)).toBe(403);
    expect(notDesignated.body).toMatchObject({ error: 'QMS_TRAINING_ASSIGN_AUTHORITY', message: expect.stringMatching(/Nothing was changed\.$/) });
    expect(await countAll()).toBe(before);
    expect((await listing(D.designated, docD)).body.data.canAssign).toBe(true);
    expect((await listing(D.approver, docD)).body.data.canAssign, 'the screen is not offered a change the server refuses').toBe(false);
  });

  it('a member and a manager are refused by the authority rule, a viewer by the editor gate, on assigning and on removing; nothing is written', async () => {
    const docId = await document(orgA);
    const kept = Number((await assign(A.admin, docId, { userId: A.named.id })).body.data.id);
    const before = await countAll();
    const viewer = await assign(A.viewer, docId, { userId: A.member.id });
    expect(viewer.status).toBe(403);
    expect(viewer.body.error).toBe('Insufficient permissions');
    for (const who of [A.member, A.manager]) {
      for (const res of [await assign(who, docId, { userId: A.unassigned.id }), await unassign(who, docId, kept)]) {
        expect(res.status, JSON.stringify(res.body)).toBe(403);
        expect(res.body.error).toBe('QMS_TRAINING_ASSIGN_AUTHORITY');
      }
    }
    expect(await countAll()).toBe(before);
    expect((await assignmentRows(docId)).map((r) => r.removed)).toEqual([false]);
    const asMember = (await listing(A.member, docId)).body.data;
    expect(asMember.canAssign).toBe(false);
    expect(asMember.trainable, 'a first draft has nothing in force and nothing pending').toEqual({ inForce: null, pending: null });
    expect((await listing(A.admin, docId)).body.data.canAssign).toBe(true);
  });

  it('an approver who cannot read the authored document is refused with QMS_DOCUMENT_VIEW_DENIED; shared onto it, the same approver may assign', async () => {
    const created = await call(A.author, 'post', '/documents', {
      title: `${TAG} authored procedure`, docType: 'sop', programId, templateKey: 'sop', reason: 'Author the controlled handling procedure.' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const docId = Number(created.body.data.id);
    const authoredId = String(created.body.data.authoring_document_id);
    expect(authoredId).toMatch(/^[0-9a-f-]{36}$/);
    const before = await countAll();
    const denied = await assign(A.approver, docId, { userId: A.member.id });
    expect(denied.status, JSON.stringify(denied.body)).toBe(403);
    expect(denied.body).toMatchObject({ error: 'QMS_DOCUMENT_VIEW_DENIED', message: expect.stringMatching(/Nothing was changed\.$/) });
    expect(await countAll(), 'nobody requires someone to read what they cannot read').toBe(before);
    expect((await listing(A.approver, docId)).body.data.canAssign).toBe(false);
    // An administrator is an authoring administrator (authoring-permissions.ts), so may read it, and assign.
    expect((await assign(A.admin, docId, { userId: A.member.id })).status).toBe(201);
    await withNativeCatalogClient({ organizationId: orgA.id, organizationUuid: orgA.uuid, userId: A.author.id, role: 'member', caller: 'qms-training-assign-share' },
      async (sqlClient) => {
        const { grantAuthoringPermission } = await import('../../server/services/authoring/authoring-permissions');
        await grantAuthoringPermission({ pool: sqlClient, tenantId: orgA.id, docId: authoredId,
          principalId: String(A.approver.id), role: 'VIEWER', grantedBy: String(A.author.id), reason: 'QA reads the procedure it assigns' });
      });
    expect((await listing(A.approver, docId)).body.data.canAssign).toBe(true);
    const allowed = await assign(A.approver, docId, { userId: A.named.id });
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(201);
  });

});

describe('the authority is read on the write\'s own transaction', () => {
  it('a demotion committed while the write waits on the membership row is seen: 403, nothing written', async () => {
    const docId = await document(orgA);
    const before = await countAll();
    const demotion = await owner.connect();
    let settled = false;
    try {
      await demotion.query('BEGIN');
      await demotion.query("UPDATE organization_users SET role = 'member' WHERE organization_id = $1 AND user_id = $2", [orgA.id, A.demoted.id]);
      const pending = assign(A.demoted, docId, { userId: A.member.id }).then((res) => { settled = true; return res; });
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

  it('an organization pending deletion takes no assignment, though the lifecycle guard still holds it as active', async () => {
    const docId = await document(orgC);
    // A role, not a person: the person check would also refuse a member of an organization that is not active.
    const qa = await role(C.admin, 'Pending deletion QA', [C.admin]);
    // The guard trusts a resolved posture for 60 s (tenant-lifecycle.ts); this read primes it as active.
    expect((await listing(C.admin, docId)).body.data.canAssign).toBe(true);
    await owner.query("UPDATE organizations SET status = 'pending_deletion' WHERE id = $1", [orgC.id]);
    const res = await assign(C.admin, docId, { jobRoleId: qa });
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body).toMatchObject({ error: 'TENANT_PENDING_DELETION', message: expect.stringMatching(/Nothing was changed\.$/) });
    expect(await assignmentRows(docId)).toHaveLength(0);
    const read = await listing(C.admin, docId);
    expect(read.status, 'the record stays readable').toBe(200);
    expect(read.body.data.canAssign).toBe(false);
  });
});

describe('the refusals, each with nothing written', () => {
  it('the same role or person twice is 409 QMS_ALREADY_ASSIGNED', async () => {
    const docId = await document(orgA);
    const qa = await role(A.admin, 'Duplicate check', [A.qa1]);
    expect((await assign(A.admin, docId, { jobRoleId: qa })).status).toBe(201);
    expect((await assign(A.admin, docId, { userId: A.named.id })).status).toBe(201);
    const before = await countAll();
    for (const subject of [{ jobRoleId: qa }, { userId: A.named.id }]) {
      const res = await assign(A.admin2, docId, subject);
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.error).toBe('QMS_ALREADY_ASSIGNED');
    }
    expect(await countAll()).toBe(before);
  });

  it('another organization\'s document is 404 on the read, the assignment and the removal', async () => {
    const docB = await document(orgB);
    const theirs = Number((await assign(B.admin, docB, { userId: B.member.id })).body.data.id);
    const before = await countAll();
    expect((await listing(A.admin, docB)).status).toBe(404);
    expect((await assign(A.admin, docB, { userId: A.member.id })).status).toBe(404);
    expect((await unassign(A.admin, docB, theirs)).status).toBe(404);
    expect(await countAll()).toBe(before);
    expect((await assignmentRows(docB)).map((r) => r.removed)).toEqual([false]);
  });

  it('a role that is not live in this organization is 422 QMS_JOB_ROLE_NOT_FOUND; a person who is not an active member is 422 QMS_NOT_A_MEMBER', async () => {
    const docId = await document(orgA);
    const theirRole = await role(B.admin, 'Their QA', [B.member]);
    const deletedRole = await role(A.admin, 'Deleted before assignment');
    expect((await call(A.admin, 'delete', `/job-roles/${deletedRole}`, { reason: REASON })).status).toBe(200);
    const suspended = await account(orgA.id, 'suspended-before', 'member');
    await owner.query("UPDATE users SET status = 'suspended' WHERE id = $1", [suspended.id]);
    const before = await countAll();
    for (const jobRoleId of [theirRole, deletedRole, 2_000_000_000]) {
      const res = await assign(A.admin, docId, { jobRoleId });
      expect(res.status, `${jobRoleId}: ${JSON.stringify(res.body)}`).toBe(422);
      expect(res.body.error).toBe('QMS_JOB_ROLE_NOT_FOUND');
    }
    for (const userId of [B.member.id, suspended.id, 2_000_000_000]) {
      const res = await assign(A.admin, docId, { userId });
      expect(res.status, `${userId}: ${JSON.stringify(res.body)}`).toBe(422);
      expect(res.body.error).toBe('QMS_NOT_A_MEMBER');
    }
    expect(await countAll()).toBe(before);
  });

  it('a form or a specification is 409 QMS_NOT_TRAINABLE_TYPE; a retired document is 409 QMS_DOCUMENT_RETIRED', async () => {
    const form = await document(orgA, { docType: 'form' });
    const spec = await document(orgA, { docType: 'spec' });
    const retired = await retiredDocument();
    const before = await countAll();
    for (const docId of [form, spec]) {
      const res = await assign(A.admin, docId, { userId: A.member.id });
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.error).toBe('QMS_NOT_TRAINABLE_TYPE');
      expect((await listing(A.admin, docId)).body.data.canAssign).toBe(false);
    }
    const res = await assign(A.admin, retired, { userId: A.member.id });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('QMS_DOCUMENT_RETIRED');
    expect(await countAll()).toBe(before);
  });

  it('a body naming both subjects, neither, or an unknown field is 422; a seven-character reason is 400; a bad id is 422', async () => {
    const docId = await document(orgA);
    const qa = await role(A.admin, 'Body shape');
    const before = await countAll();
    for (const body of [{ jobRoleId: qa, userId: A.member.id }, {}, { userId: A.member.id, organizationId: orgB.id }]) {
      const res = await call(A.admin, 'post', `/documents/${docId}/training-assignments`, { ...body, reason: REASON });
      expect(res.status, JSON.stringify(res.body)).toBe(422);
      expect(res.body.error).toBe('QMS_TRAINING_INPUT_INVALID');
    }
    const short = await call(A.admin, 'post', `/documents/${docId}/training-assignments`, { userId: A.member.id, reason: 'Because' });
    expect(short.status).toBe(400);
    expect(short.body.error).toBe('REASON_REQUIRED');
    expect((await assign(A.admin, 0, { userId: A.member.id })).status).toBe(422);
    expect((await call(A.admin, 'delete', `/documents/${docId}/training-assignments/abc`, { reason: REASON })).status).toBe(422);
    expect((await call(A.admin, 'get', '/documents/abc/training-assignments')).status).toBe(422);
    expect(await countAll()).toBe(before);
  });

  it('a ledger that cannot be written is 500 AUDIT_WRITE_FAILED, and the assignment was not made', async () => {
    const docId = await document(orgA);
    const before = await countAll();
    failLedger.on = true;
    const res = await assign(A.admin, docId, { userId: A.member.id });
    const reached = !failLedger.on;
    failLedger.on = false;
    expect(reached, 'the injected failure was reached').toBe(true);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(await assignmentRows(docId)).toHaveLength(0);
    expect(await countAll()).toBe(before);
  });
});

describe('removing an assignment', () => {
  it('is soft and audited; the same subject can be assigned again, and both rows stay', async () => {
    const docId = await document(orgA);
    const qa = await role(A.admin, 'Removal');
    const first = Number((await assign(A.admin, docId, { jobRoleId: qa })).body.data.id);
    const removed = await unassign(A.admin, docId, first);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect(removed.body.data).toMatchObject({ id: first, documentId: docId, removed: true });
    const [row] = await assignmentRows(docId);
    expect(row).toMatchObject({ id: first, removed: true, removed_by: A.admin.id });
    const pairs = await ledger(orgA.id, `qms-document:${docId}`);
    expect(pairs[1]).toMatchObject({ command: 'delete', reason: REASON, payload: { change: 'training-unassigned', assignmentId: first, jobRoleId: qa } });
    expect(pairs[1].audit_xmin).toBe(row.xmin);
    expect((await unassign(A.admin, docId, first)).status, 'no live assignment left').toBe(404);
    expect((await assign(A.admin, docId, { jobRoleId: qa })).status).toBe(201);
    expect((await assignmentRows(docId)).map((r) => r.removed)).toEqual([true, false]);
    expect((await listing(A.member, docId)).body.data.assignments).toHaveLength(1);
  });

  it('an assignment of another document is 404 on this one', async () => {
    const docId = await document(orgA);
    const other = await document(orgA);
    const theirs = Number((await assign(A.admin, other, { userId: A.member.id })).body.data.id);
    const res = await unassign(A.admin, docId, theirs);
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body.error).toBe('QMS_TRAINING_ASSIGNMENT_NOT_FOUND');
    expect((await assignmentRows(other)).map((r) => r.removed)).toEqual([false]);
  });

  it('nobody removes an assignment that covers themselves, by name or by a role they hold: 403 QMS_TRAINING_SELF_UNASSIGN; another administrator may', async () => {
    const docId = await document(orgA);
    const held = await role(A.admin, 'Held by the administrator', [A.admin]);
    const byName = Number((await assign(A.admin, docId, { userId: A.admin.id })).body.data.id);
    const byRole = Number((await assign(A.admin, docId, { jobRoleId: held })).body.data.id);
    const before = await countAll();
    for (const id of [byName, byRole]) {
      const res = await unassign(A.admin, docId, id);
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(res.body).toMatchObject({ error: 'QMS_TRAINING_SELF_UNASSIGN', message: expect.stringMatching(/Nothing was changed\.$/) });
    }
    expect(await countAll()).toBe(before);
    expect((await assignmentRows(docId)).map((r) => r.removed)).toEqual([false, false]);
    for (const id of [byName, byRole]) expect((await unassign(A.admin2, docId, id)).status).toBe(200);
  });
});

describe('who is assigned: the one resolver', () => {
  it('the read lists the assignments and resolves the people: active only, each once, with every path', async () => {
    const docId = await effectiveDocument();
    const qa = await role(A.admin, 'Resolved QA', [A.qa1, A.qa2, A.both, A.suspended, A.departed, A.dropped]);
    const old = await role(A.admin, 'Deleted after assignment', [A.oldRole]);
    // Another organization's user written into this role directly, past the route that refuses it.
    await owner.query(`INSERT INTO qms_job_role_members (organization_id, job_role_id, user_id, added_by) VALUES ($1, $2, $3, $4)`,
      [orgA.id, qa, B.member.id, A.admin.id]);
    const byRole = Number((await assign(A.admin, docId, { jobRoleId: qa })).body.data.id);
    const named = Number((await assign(A.approver, docId, { userId: A.named.id })).body.data.id);
    expect((await assign(A.admin, docId, { userId: A.both.id })).status).toBe(201);
    expect((await assign(A.admin, docId, { jobRoleId: old })).status).toBe(201);
    const gone = Number((await assign(A.admin, docId, { userId: A.unassigned.id })).body.data.id);
    expect((await unassign(A.admin, docId, gone)).status).toBe(200);
    expect((await call(A.admin, 'delete', `/job-roles/${qa}/members/${A.dropped.id}`, { reason: REASON })).status).toBe(200);
    await owner.query("UPDATE users SET status = 'suspended' WHERE id = $1", [A.suspended.id]);
    await owner.query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [orgA.id, A.departed.id]);
    // A role deleted while still assigned (past the in-use refusal) covers nobody.
    await owner.query('UPDATE qms_job_roles SET deleted_at = now(), deleted_by = $2 WHERE id = $1', [old, A.admin.id]);

    const asMember = await listing(A.member, docId);
    expect(asMember.status, JSON.stringify(asMember.body)).toBe(200);
    expect(asMember.body.data, 'a member who is not assigned sees the count, not the names (P-50 Q3)')
      .toMatchObject({ canAssign: false, peopleScope: 'own', peopleCount: 4, people: [] });
    const res = await listing(A.admin, docId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { assignments, people, trainable } = res.body.data;
    expect(res.body.data).toMatchObject({ peopleScope: 'everyone', peopleCount: 4 });
    expect(trainable).toMatchObject({ inForce: { version: '1.0' }, pending: null });
    expect(assignments.map((a: { id: number; kind: string }) => [a.id, a.kind]), 'live assignments only').toEqual(expect.arrayContaining([
      [byRole, 'role'], [named, 'person']]));
    expect(assignments.map((a: { id: number }) => a.id)).not.toContain(gone);
    expect(assignments.find((a: { id: number }) => a.id === named)).toMatchObject({
      kind: 'person', jobRoleId: null, jobRoleName: null, userId: A.named.id, userLabel: `${TAG} invented named`,
      assignedBy: A.approver.id, assignedByLabel: `${TAG} invented approver`, assignedAt: expect.any(String) });
    expect(assignments.find((a: { id: number }) => a.id === byRole)).toMatchObject({ kind: 'role', jobRoleId: qa, userId: null, userLabel: null });
    const resolved = people.map((p: { userId: number; label: string; via: string[] }) => [p.userId, p.label, p.via]);
    expect(resolved).toEqual(expect.arrayContaining([
      [A.qa1.id, `${TAG} invented qa1`, [`role:${qa}`]],
      [A.qa2.id, `${TAG} invented qa2`, [`role:${qa}`]],
      [A.named.id, `${TAG} invented named`, ['person']],
      [A.both.id, `${TAG} invented both`, ['person', `role:${qa}`]],
    ]));
    expect(resolved, 'nobody else: not the suspended, the departed, the dropped, the unassigned, the deleted role\'s member, or another organization\'s user')
      .toHaveLength(4);
    for (const p of people) expect(Number.isNaN(Date.parse(p.coveredSince)), 'covered since a moment').toBe(false);
    expect((await listing(A.viewer, docId)).status, 'reads are open to every member').toBe(200);
  });

  it('the resolver tells "assigned to nobody" from "assigned, but nobody active", and answers whether one person is assigned', async () => {
    const assigned = await document(orgA);
    const unassignedDoc = await document(orgA);
    const nobodyActive = await document(orgA);
    const qa = await role(A.admin, 'Resolver QA', [A.qa1]);
    const lapsed = await account(orgA.id, 'lapsed-only', 'member');
    const empty = await role(A.admin, 'Only a lapsed member', [lapsed]);
    await owner.query("UPDATE users SET status = 'suspended' WHERE id = $1", [lapsed.id]);
    expect((await assign(A.admin, assigned, { jobRoleId: qa })).status).toBe(201);
    expect((await assign(A.admin, assigned, { userId: A.named.id })).status).toBe(201);
    expect((await assign(A.admin, nobodyActive, { jobRoleId: empty })).status).toBe(201);
    const { readQmsTrainingAssignees, isQmsTrainingAssignee } = await import('../../server/services/qms/training-assignment');
    await withNativeCatalogClient({ organizationId: orgA.id, organizationUuid: orgA.uuid, userId: A.admin.id, role: 'admin', caller: 'qms-training-resolver' },
      async (sqlClient) => {
        const all = await readQmsTrainingAssignees(sqlClient, orgA.id, [assigned, unassignedDoc, nobodyActive]);
        expect(all.get(assigned)).toMatchObject({ assignmentRows: 2 });
        expect(all.get(assigned)!.assignees.map((p) => [p.userId, p.via])).toEqual([[A.qa1.id, [`role:${qa}`]], [A.named.id, ['person']]]
          .sort((a, b) => Number(a[0]) - Number(b[0])));
        expect(all.get(unassignedDoc), 'assigned to nobody').toEqual({ assignmentRows: 0, assignees: [] });
        expect(all.get(nobodyActive), 'assigned, but nobody active').toEqual({ assignmentRows: 1, assignees: [] });
        const one = await readQmsTrainingAssignees(sqlClient, orgA.id, [assigned], { userIds: [A.named.id] });
        expect(one.get(assigned)!.assignees.map((p) => p.userId)).toEqual([A.named.id]);
        expect(await isQmsTrainingAssignee(sqlClient, orgA.id, assigned, A.qa1.id), 'by role').toBe(true);
        expect(await isQmsTrainingAssignee(sqlClient, orgA.id, assigned, A.named.id), 'by name').toBe(true);
        expect(await isQmsTrainingAssignee(sqlClient, orgA.id, assigned, A.member.id), 'not assigned').toBe(false);
        expect(await isQmsTrainingAssignee(sqlClient, orgA.id, nobodyActive, lapsed.id), 'suspended').toBe(false);
        expect(await isQmsTrainingAssignee(sqlClient, orgA.id, assigned, B.member.id), 'another organization').toBe(false);
      });
  });
});
