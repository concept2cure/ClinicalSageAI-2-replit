/**
 * Who must train on a controlled document (P-49, P-50;
 * docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md). Slice 1: each
 * organization's job roles and who holds them.
 *
 * A job role is a job function the organization manages (QA, Manufacturing,
 * Clinical Operations), not a permission role (organization_users.role), so
 * assigning a document to a role never means "everyone with access". The store
 * is migrations/20261029g_qms_job_roles_and_training_assignments.sql and this
 * module is its one writer. Every function here runs on the caller's governed
 * transaction (governedQmsWrite), which writes the ledger pair this returns on
 * the same client before COMMIT, and refuses with GovernedRefusal, so a refusal
 * rolls back with nothing written. Who may is the route's decision
 * (server/routes/mdx-qms-training.ts: an administrator, decision D4).
 *
 * Nothing is hard-deleted: a role is deleted, and a member removed, by stamping
 * who and when. Every statement carries the organization, beside RLS.
 *
 * @module server/services/qms/training-assignment
 */
import { memberLabels } from '../../../shared/utils/member-labels';
import { ACCOUNT_STATUS_ACTIVE } from '../account-standing';
import { GovernedRefusal } from './governed-qms-write';
import type { QmsJobRoleCreate, QmsJobRoleUpdate } from '../../../shared/qms/training';

export interface JobRoleSqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** What a governed write records: its ledger target and payload, and the record it answers with. */
export interface JobRoleChange {
  target: string;
  payload: Record<string, unknown>;
  data: Record<string, unknown>;
}

export interface QmsJobRoleListing {
  roles: Array<{
    id: number; name: string; description: string | null; documentCount: number;
    members: Array<{ userId: number; label: string; addedAt: string; active: boolean }>;
  }>;
  /** The active roster, to choose a member from. */
  people: Array<{ userId: number; label: string }>;
}

const NOTHING_CHANGED = 'Nothing was changed.';

/**
 * This module's one test of "an active member of this organization": a
 * membership row, an active account and an active organization. $1 the
 * organization, $2 ACCOUNT_STATUS_ACTIVE, $3 one user id or NULL for everyone.
 * The roster the listing offers, the `active` flag on each holder and the check
 * on a person added all read it. The roster in training-compliance.ts (:17-21)
 * is the one other copy; slice 3 deletes it, and the resolver's `active` CTE
 * (design §3.2) states this same predicate.
 */
const ACTIVE_MEMBERS_SQL = `SELECT ou.user_id, u.name, u.email FROM organization_users ou
    JOIN users u ON u.id = ou.user_id JOIN organizations o ON o.id = ou.organization_id
   WHERE ou.organization_id = $1 AND u.status = $2 AND o.status = $2 AND ($3::int IS NULL OR ou.user_id = $3::int)
   ORDER BY u.name, ou.user_id`;
const roleTarget = (roleId: number) => `qms-job-role:${roleId}`;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const roleRecord = (r: Record<string, unknown>) => ({
  id: Number(r.id), name: String(r.name), description: r.description == null ? null : String(r.description),
});
/** An empty description is no description. */
const descriptionOf = (v: string | null | undefined) => (v ? v : null);

function liveUniqueViolation(error: unknown, constraint: string): boolean {
  const e = error as { code?: string; constraint?: string } | null;
  return e?.code === '23505' && e.constraint === constraint;
}

const roleNotFound = () => new GovernedRefusal(404, {
  error: 'QMS_JOB_ROLE_NOT_FOUND', message: `There is no such job role in this organization. ${NOTHING_CHANGED}`,
});
const nameTaken = (name: string) => new GovernedRefusal(409, {
  error: 'QMS_JOB_ROLE_EXISTS', message: `A job role named "${name}" already exists in this organization. ${NOTHING_CHANGED}`,
});

/** The live role, locked for the rest of the transaction; 404 when it is not this organization's. */
async function lockLiveRole(client: JobRoleSqlClient, orgId: number, roleId: number, mode: 'UPDATE' | 'SHARE') {
  const { rows } = await client.query(
    mode === 'UPDATE'
      ? `SELECT id, name, description FROM qms_job_roles WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`
      : `SELECT id, name, description FROM qms_job_roles WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR SHARE`,
    [roleId, orgId],
  );
  if (!rows[0]) throw roleNotFound();
  return roleRecord(rows[0]);
}

/**
 * The roles, their live members and the active roster, labelled so two people
 * of one name can be told apart. A holder who left keeps the row (design Risk
 * 10) with `active: false`. users RLS hides a departed account, so holders are
 * named through public.actor_name (migrations/20260929_actor_names.sql;
 * server/services/tenant/actor-names.ts), which answers for someone this
 * organization's record names; anyone else is `Account #<id>`, never a bare
 * number and never someone else's name.
 */
export async function readQmsJobRoles(client: JobRoleSqlClient, orgId: number): Promise<QmsJobRoleListing> {
  const roles = await client.query(
    `SELECT r.id, r.name, r.description,
            (SELECT COUNT(DISTINCT a.document_id)::int FROM qms_training_assignments a
               JOIN qms_documents d ON d.id = a.document_id AND d.organization_id = a.organization_id AND d.deleted_at IS NULL
              WHERE a.organization_id = r.organization_id AND a.job_role_id = r.id AND a.removed_at IS NULL) AS document_count
       FROM qms_job_roles r WHERE r.organization_id = $1 AND r.deleted_at IS NULL
      ORDER BY lower(r.name), r.id`,
    [orgId],
  );
  const members = await client.query(
    `SELECT m.job_role_id, m.user_id, m.added_at, n.name, n.email
       FROM qms_job_role_members m
       JOIN qms_job_roles r ON r.id = m.job_role_id AND r.organization_id = m.organization_id AND r.deleted_at IS NULL
       LEFT JOIN LATERAL public.actor_name(m.user_id) n ON TRUE
      WHERE m.organization_id = $1 AND m.removed_at IS NULL
      ORDER BY m.job_role_id, m.added_at, m.id`,
    [orgId],
  );
  const roster = await client.query(ACTIVE_MEMBERS_SQL, [orgId, ACCOUNT_STATUS_ACTIVE, null]);
  const active = new Set(roster.rows.map(r => Number(r.user_id)));
  // Only people with a name or an address are labelled by memberLabels, whose
  // own fallback is the bare id; the rest are `Account #<id>`.
  const named = [...roster.rows, ...members.rows].filter(r => r.name || r.email)
    .map(r => ({ id: Number(r.user_id), name: r.name as string | null, email: r.email as string | null }));
  const unique = [...new Map(named.map(m => [m.id, m])).values()];
  const labels = memberLabels(unique);
  const label = (userId: unknown) => labels.get(String(userId)) ?? `Account #${userId}`;
  const byRole = new Map<number, QmsJobRoleListing['roles'][number]['members']>();
  for (const m of members.rows) {
    const list = byRole.get(Number(m.job_role_id)) ?? [];
    list.push({ userId: Number(m.user_id), label: label(m.user_id), addedAt: iso(m.added_at), active: active.has(Number(m.user_id)) });
    byRole.set(Number(m.job_role_id), list);
  }
  return {
    roles: roles.rows.map(r => ({ ...roleRecord(r), documentCount: Number(r.document_count ?? 0), members: byRole.get(Number(r.id)) ?? [] })),
    people: roster.rows.map(r => ({ userId: Number(r.user_id), label: label(r.user_id) })),
  };
}

export async function createQmsJobRole(client: JobRoleSqlClient, orgId: number, actorId: number, input: Pick<QmsJobRoleCreate, 'name' | 'description'>): Promise<JobRoleChange> {
  const description = descriptionOf(input.description);
  let rows: Array<Record<string, unknown>>;
  try {
    ({ rows } = await client.query(
      `INSERT INTO qms_job_roles (organization_id, name, description, created_by) VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, created_at`,
      [orgId, input.name, description, actorId],
    ));
  } catch (error) {
    if (liveUniqueViolation(error, 'qms_job_roles_live_name_uq')) throw nameTaken(input.name);
    throw error;
  }
  const role = roleRecord(rows[0]);
  return { target: roleTarget(role.id), payload: { name: role.name, description: role.description }, data: { ...role, createdAt: iso(rows[0].created_at) } };
}

export async function updateQmsJobRole(client: JobRoleSqlClient, orgId: number, actorId: number, roleId: number, input: Pick<QmsJobRoleUpdate, 'name' | 'description'>): Promise<JobRoleChange> {
  const before = await lockLiveRole(client, orgId, roleId, 'UPDATE');
  const after = {
    name: input.name ?? before.name,
    description: input.description === undefined ? before.description : descriptionOf(input.description),
  };
  try {
    await client.query(
      `UPDATE qms_job_roles SET name = $3, description = $4, updated_by = $5, updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [roleId, orgId, after.name, after.description, actorId],
    );
  } catch (error) {
    if (liveUniqueViolation(error, 'qms_job_roles_live_name_uq')) throw nameTaken(after.name);
    throw error;
  }
  return {
    target: roleTarget(roleId),
    payload: { before: { name: before.name, description: before.description }, after },
    data: { id: roleId, ...after },
  };
}

/** Soft. Refused while a live assignment of a document still names the role: removing it would change who must train. */
export async function deleteQmsJobRole(client: JobRoleSqlClient, orgId: number, actorId: number, roleId: number): Promise<JobRoleChange> {
  const role = await lockLiveRole(client, orgId, roleId, 'UPDATE');
  const { rows } = await client.query(
    `SELECT DISTINCT d.doc_number FROM qms_training_assignments a
       JOIN qms_documents d ON d.id = a.document_id AND d.organization_id = a.organization_id AND d.deleted_at IS NULL
      WHERE a.organization_id = $1 AND a.job_role_id = $2 AND a.removed_at IS NULL
      ORDER BY d.doc_number`,
    [orgId, roleId],
  );
  if (rows.length > 0) {
    const docNumbers = rows.map(r => String(r.doc_number));
    throw new GovernedRefusal(409, {
      error: 'QMS_JOB_ROLE_IN_USE', docNumbers,
      message: `"${role.name}" is assigned training on ${docNumbers.join(', ')}. Remove those assignments first. Nothing was deleted.`,
    });
  }
  await client.query(
    `UPDATE qms_job_roles SET deleted_at = now(), deleted_by = $3 WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [roleId, orgId, actorId],
  );
  return { target: roleTarget(roleId), payload: { name: role.name }, data: { id: roleId, deleted: true } };
}

/** Adds an obligation only, so an administrator may add themselves. The person must be an active member of this organization. */
export async function addQmsJobRoleMember(client: JobRoleSqlClient, orgId: number, actorId: number, roleId: number, userId: number): Promise<JobRoleChange> {
  const role = await lockLiveRole(client, orgId, roleId, 'SHARE');
  // The membership row is locked first, so it cannot be removed before COMMIT; then the one active-member test.
  await client.query(`SELECT 1 FROM organization_users WHERE organization_id = $1 AND user_id = $2 FOR SHARE`, [orgId, userId]);
  const { rows: standing } = await client.query(ACTIVE_MEMBERS_SQL, [orgId, ACCOUNT_STATUS_ACTIVE, userId]);
  if (!standing[0]) {
    throw new GovernedRefusal(422, {
      error: 'QMS_NOT_A_MEMBER', message: `That person is not an active member of this organization. ${NOTHING_CHANGED}`,
    });
  }
  let rows: Array<Record<string, unknown>>;
  try {
    ({ rows } = await client.query(
      `INSERT INTO qms_job_role_members (organization_id, job_role_id, user_id, added_by) VALUES ($1, $2, $3, $4)
       RETURNING id, added_at`,
      [orgId, roleId, userId, actorId],
    ));
  } catch (error) {
    if (liveUniqueViolation(error, 'qms_job_role_members_live_uq')) {
      throw new GovernedRefusal(409, { error: 'QMS_ALREADY_MEMBER', message: `That person already holds "${role.name}". ${NOTHING_CHANGED}` });
    }
    throw error;
  }
  const memberId = Number(rows[0].id);
  return {
    target: roleTarget(roleId),
    payload: { change: 'member-added', userId, memberId },
    data: { id: memberId, jobRoleId: roleId, userId, addedAt: iso(rows[0].added_at) },
  };
}

/** Soft. Nobody removes their own role: that would clear their own obligation (as refuseSelf in qms-approver-designation.ts). */
export async function removeQmsJobRoleMember(client: JobRoleSqlClient, orgId: number, actorId: number, roleId: number, userId: number): Promise<JobRoleChange> {
  const role = await lockLiveRole(client, orgId, roleId, 'SHARE');
  if (userId === actorId) {
    throw new GovernedRefusal(403, {
      error: 'QMS_TRAINING_SELF_UNASSIGN',
      message: `Your own job roles are changed by another administrator, so you are still in "${role.name}". ${NOTHING_CHANGED}`,
    });
  }
  const { rows } = await client.query(
    `UPDATE qms_job_role_members SET removed_at = now(), removed_by = $4
      WHERE organization_id = $1 AND job_role_id = $2 AND user_id = $3 AND removed_at IS NULL
      RETURNING id`,
    [orgId, roleId, userId, actorId],
  );
  if (!rows[0]) {
    throw new GovernedRefusal(404, { error: 'QMS_JOB_ROLE_MEMBER_NOT_FOUND', message: `That person does not hold "${role.name}". ${NOTHING_CHANGED}` });
  }
  const memberId = Number(rows[0].id);
  return {
    target: roleTarget(roleId),
    payload: { change: 'member-removed', userId, memberId },
    data: { id: memberId, jobRoleId: roleId, userId, removed: true },
  };
}
