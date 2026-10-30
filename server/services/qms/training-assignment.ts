/**
 * Who must train on a controlled document (P-49, P-50;
 * docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md). Slice 1: each
 * organization's job roles and who holds them. Slice 2: each controlled
 * document's training assignments, by job role and by name, and the one
 * resolver of who is assigned (§3.2).
 *
 * A job role is a job function the organization manages (QA, Manufacturing,
 * Clinical Operations), not a permission role (organization_users.role), so
 * assigning a document to a role never means "everyone with access". The store
 * is migrations/20261029g_qms_job_roles_and_training_assignments.sql and this
 * module is its one writer. Every function here runs on the caller's governed
 * transaction (governedQmsWrite), which writes the ledger pair this returns on
 * the same client before COMMIT, and refuses with GovernedRefusal, so a refusal
 * rolls back with nothing written. Who may is the route's decision
 * (server/routes/mdx-qms-training.ts, decision D4: job roles are an
 * administrator's; a document's assignments an administrator's or a designated
 * QMS approver's). What only this module can know is decided here: the document
 * is trainable and in use, and the person requiring the training can read it.
 *
 * Nothing is hard-deleted: a role is deleted, a member removed and an
 * assignment withdrawn by stamping who and when. Every statement carries the
 * organization, beside RLS.
 *
 * @module server/services/qms/training-assignment
 */
import { memberLabels } from '../../../shared/utils/member-labels';
import { ACCOUNT_STATUS_ACTIVE } from '../account-standing';
import { GovernedRefusal } from './governed-qms-write';
import { authorizeQmsContentRead, QmsContentRefusedError } from './controlled-document-content';
import { dayOrNull, isPendingEffective, readInForceReleases, resolveInForceRelease } from './in-force-release';
import type { QmsDocumentRow } from './document-approval-signature';
import {
  QMS_TRAINABLE_DOCUMENT_TYPES, type QmsJobRoleCreate, type QmsJobRoleUpdate, type QmsTrainingAssignmentInput,
} from '../../../shared/qms/training';

export interface JobRoleSqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** What a governed write records: its ledger target and payload, and the record it answers with. */
export interface TrainingStoreChange {
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
 * The roster the listing offers, the `active` flag on each holder, the check
 * on a person added or assigned, and the resolver's people (who is assigned is
 * resolved among exactly these) all read it. The roster in
 * training-compliance.ts (:17-21) is the one other copy; slice 3 deletes it.
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

/**
 * Labels people as memberLabels does, so two of one name are told apart. Only
 * rows with a name or an address are labelled (memberLabels' own fallback is
 * the bare id); anyone else is `Account #<id>`, never a bare number and never
 * someone else's name. Rows carry user_id, name and email.
 */
function personLabeller(rows: ReadonlyArray<Record<string, unknown>>): (userId: unknown) => string {
  const named = rows.filter(r => r.name || r.email)
    .map(r => ({ id: Number(r.user_id), name: r.name as string | null, email: r.email as string | null }));
  const labels = memberLabels([...new Map(named.map(m => [m.id, m])).values()]);
  return (userId: unknown) => labels.get(String(userId)) ?? `Account #${userId}`;
}

/** Name and address for people this organization's record names (public.actor_name), for personLabeller. */
async function actorNameRows(client: JobRoleSqlClient, userIds: readonly number[]) {
  if (userIds.length === 0) return [];
  const { rows } = await client.query(
    `SELECT x.id AS user_id, n.name, n.email FROM unnest($1::int[]) AS x(id) LEFT JOIN LATERAL public.actor_name(x.id) n ON TRUE`,
    [[...new Set(userIds)]],
  );
  return rows;
}

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
  const label = personLabeller([...roster.rows, ...members.rows]);
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

export async function createQmsJobRole(client: JobRoleSqlClient, orgId: number, actorId: number, input: Pick<QmsJobRoleCreate, 'name' | 'description'>): Promise<TrainingStoreChange> {
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

export async function updateQmsJobRole(client: JobRoleSqlClient, orgId: number, actorId: number, roleId: number, input: Pick<QmsJobRoleUpdate, 'name' | 'description'>): Promise<TrainingStoreChange> {
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
export async function deleteQmsJobRole(client: JobRoleSqlClient, orgId: number, actorId: number, roleId: number): Promise<TrainingStoreChange> {
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

/** 422 unless the person is an active member of this organization: the membership row is locked first, so it cannot be removed before COMMIT; then the one active-member test. */
async function requireActiveMember(client: JobRoleSqlClient, orgId: number, userId: number): Promise<void> {
  await client.query(`SELECT 1 FROM organization_users WHERE organization_id = $1 AND user_id = $2 FOR SHARE`, [orgId, userId]);
  const { rows } = await client.query(ACTIVE_MEMBERS_SQL, [orgId, ACCOUNT_STATUS_ACTIVE, userId]);
  if (!rows[0]) {
    throw new GovernedRefusal(422, {
      error: 'QMS_NOT_A_MEMBER', message: `That person is not an active member of this organization. ${NOTHING_CHANGED}`,
    });
  }
}

/** Adds an obligation only, so an administrator may add themselves. The person must be an active member of this organization. */
export async function addQmsJobRoleMember(client: JobRoleSqlClient, orgId: number, actorId: number, roleId: number, userId: number): Promise<TrainingStoreChange> {
  const role = await lockLiveRole(client, orgId, roleId, 'SHARE');
  await requireActiveMember(client, orgId, userId);
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
export async function removeQmsJobRoleMember(client: JobRoleSqlClient, orgId: number, actorId: number, roleId: number, userId: number): Promise<TrainingStoreChange> {
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

/* ─── Who must train on a document: the one resolver (design §3.2) ─── */

/**
 * The only definition of "assigned". $1 the organization, $2 the document ids
 * (distinct), $3 the people to resolve among: ACTIVE_MEMBERS_SQL's, narrowed to
 * those asked about, so "active" has one definition in this module. A person is
 * assigned to a document by a live assignment naming them, or by a live
 * assignment naming a live job role they hold. One row per document and person,
 * with every path in `via` ('person', 'role:<id>') and `covered_since`, the
 * earliest moment a path covered them; a document nobody active is assigned to
 * gives one row with no person. `assignment_rows` counts its live assignment
 * rows, so "assigned to nobody" (0) and "assigned, but nobody active" (rows, no
 * person) are told apart: a document assigned to nobody never reads 0 of N.
 */
export const QMS_TRAINING_ASSIGNEES_SQL = `WITH live AS (
  SELECT a.document_id, a.job_role_id, a.user_id, a.assigned_at
    FROM qms_training_assignments a
   WHERE a.organization_id = $1 AND a.document_id = ANY($2::int[]) AND a.removed_at IS NULL
), paths AS (
  SELECT l.document_id, m.user_id, 'role:' || r.id::text AS via, GREATEST(l.assigned_at, m.added_at) AS since
    FROM live l
    JOIN qms_job_roles r        ON r.id = l.job_role_id AND r.organization_id = $1 AND r.deleted_at IS NULL
    JOIN qms_job_role_members m ON m.job_role_id = r.id AND m.organization_id = $1 AND m.removed_at IS NULL
  UNION ALL
  SELECT l.document_id, l.user_id, 'person', l.assigned_at FROM live l WHERE l.user_id IS NOT NULL
)
SELECT d.document_id,
       (SELECT COUNT(*)::int FROM live WHERE live.document_id = d.document_id) AS assignment_rows,
       p.user_id,
       array_agg(DISTINCT p.via ORDER BY p.via) FILTER (WHERE p.user_id IS NOT NULL) AS via,
       MIN(p.since) AS covered_since
  FROM unnest($2::int[]) AS d(document_id)
  LEFT JOIN paths p ON p.document_id = d.document_id AND p.user_id = ANY($3::int[])
 GROUP BY d.document_id, p.user_id
 ORDER BY d.document_id, p.user_id`;

export interface QmsTrainingAssignee {
  userId: number;
  /** Every path that covers the person: 'person' (named), 'role:<id>' (a job role they hold). */
  via: string[];
  /** The earliest moment a path covered them (ISO). */
  coveredSince: string;
}
export interface QmsDocumentAssignees {
  /** Live assignment rows on the document: 0 means assigned to nobody. */
  assignmentRows: number;
  /** The distinct active people assigned, by user id. */
  assignees: QmsTrainingAssignee[];
}

/** The active members of this organization among `userIds` (everyone when absent), by ACTIVE_MEMBERS_SQL. */
async function activeMemberIds(client: JobRoleSqlClient, orgId: number, userIds?: readonly number[]): Promise<number[]> {
  if (userIds && userIds.length === 0) return [];
  const one = userIds?.length === 1 ? userIds[0] : null;
  const { rows } = await client.query(ACTIVE_MEMBERS_SQL, [orgId, ACCOUNT_STATUS_ACTIVE, one]);
  const ids = rows.map(r => Number(r.user_id));
  if (!userIds || one !== null) return ids;
  const wanted = new Set(userIds);
  return ids.filter(id => wanted.has(id));
}

/** Who is assigned to each document, by document id; every id asked about is in the map. `userIds` narrows the people. */
export async function readQmsTrainingAssignees(
  client: JobRoleSqlClient, orgId: number, documentIds: readonly number[], opts: { userIds?: readonly number[] } = {},
): Promise<Map<number, QmsDocumentAssignees>> {
  const out = new Map<number, QmsDocumentAssignees>();
  const ids = [...new Set(documentIds)];
  if (ids.length === 0) return out;
  const people = await activeMemberIds(client, orgId, opts.userIds);
  const { rows } = await client.query(QMS_TRAINING_ASSIGNEES_SQL, [orgId, ids, people]);
  for (const r of rows) {
    const documentId = Number(r.document_id);
    const entry = out.get(documentId) ?? { assignmentRows: Number(r.assignment_rows ?? 0), assignees: [] };
    if (r.user_id != null) entry.assignees.push({ userId: Number(r.user_id), via: (r.via as string[] | null) ?? [], coveredSince: iso(r.covered_since) });
    out.set(documentId, entry);
  }
  return out;
}

/** Whether this person is assigned to train on this document now. */
export async function isQmsTrainingAssignee(client: JobRoleSqlClient, orgId: number, documentId: number, userId: number): Promise<boolean> {
  const entry = (await readQmsTrainingAssignees(client, orgId, [documentId], { userIds: [userId] })).get(documentId);
  return (entry?.assignees.length ?? 0) > 0;
}

/**
 * Who may read a version for training (D3, confirmed by P-50 Q2). Inline
 * register text is the organization's to read, as before. Authored text is read
 * by whoever its authored copy is shared with (authorizeQmsContentRead) and, in
 * the training reader only, by the people assigned to train on the document:
 * being assigned is the reason to read it, so it grants reading the released
 * version, and nothing else (not the editor, not the version history). The
 * bound authored document must still exist in this organization.
 */
export async function authorizeQmsTrainingRead(client: JobRoleSqlClient, orgId: number, userId: number, release: QmsDocumentRow): Promise<void> {
  if (!release.authoring_document_id) return;
  if (!(await isQmsTrainingAssignee(client, orgId, Number(release.id), userId))) {
    return authorizeQmsContentRead(client as Parameters<typeof authorizeQmsContentRead>[0], orgId, userId, release);
  }
  const { rows } = await client.query('SELECT client_program_id FROM authoring_documents WHERE id = $1 AND tenant_id = $2', [release.authoring_document_id, orgId]);
  if (!rows[0]?.client_program_id) throw new QmsContentRefusedError(409, 'QMS_CONTENT_REQUIRED', 'The bound authored document is unavailable.');
}

/* ─── Each controlled document's assignments (design §3.8, D4) ─── */

const documentTarget = (documentId: number) => `qms-document:${documentId}`;
const documentNotFound = () => new GovernedRefusal(404, {
  error: 'QMS_DOCUMENT_NOT_FOUND', message: `Document not found in this organization. ${NOTHING_CHANGED}`,
});

/** This organization's live document, or null. Inside a write it is locked FOR SHARE, so it is not retired or approved under the change. */
export async function readTrainingDocument(client: JobRoleSqlClient, orgId: number, documentId: number, lock = false): Promise<QmsDocumentRow | null> {
  const { rows } = await client.query(
    lock
      ? `SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR SHARE`
      : `SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [documentId, orgId],
  );
  return (rows[0] as unknown as QmsDocumentRow | undefined) ?? null;
}

async function lockTrainingDocument(client: JobRoleSqlClient, orgId: number, documentId: number): Promise<QmsDocumentRow> {
  const document = await readTrainingDocument(client, orgId, documentId, true);
  if (!document) throw documentNotFound();
  return document;
}

/**
 * Nobody requires someone to read what they cannot read (design D3, §3.8): the
 * actor must be able to read every version people train on, the release in
 * force (or, with none, the working copy) and, when this row is approved for a
 * later day, the row itself, which training opens to the people assigned
 * (P-50 Q2). Each revision is its own authored copy, so reading one says
 * nothing about the other. Inline register text is the organization's to read,
 * as for training; authored text needs project access and a grant
 * (authorizeQmsContentRead), as the reader asks.
 */
async function documentReadRefusal(client: JobRoleSqlClient, orgId: number, actorId: number, document: QmsDocumentRow): Promise<GovernedRefusal | null> {
  const inForce = (await resolveInForceRelease(client, document))?.release ?? document;
  const versions = inForce !== document && isPendingEffective(document) ? [inForce, document] : [inForce];
  for (const release of versions) {
    const refusal = await releaseReadRefusal(client, orgId, actorId, document, release);
    if (refusal) return refusal;
  }
  return null;
}

/** One version's read check, as a refusal of the assignment. */
async function releaseReadRefusal(
  client: JobRoleSqlClient, orgId: number, actorId: number, document: QmsDocumentRow, release: QmsDocumentRow,
): Promise<GovernedRefusal | null> {
  try {
    await authorizeQmsContentRead(client, orgId, actorId, release);
    return null;
  } catch (error) {
    if (!(error instanceof QmsContentRefusedError)) throw error;
    if (error.status === 403 || error.status === 404) {
      return new GovernedRefusal(403, {
        error: 'QMS_DOCUMENT_VIEW_DENIED',
        message: `You cannot read ${document.doc_number}, so you cannot require anyone to train on it. ${NOTHING_CHANGED}`,
      });
    }
    if (error.status === 503) {
      return new GovernedRefusal(503, { error: error.code, message: `Whether you can read this document could not be checked. ${NOTHING_CHANGED}` });
    }
    return new GovernedRefusal(error.status, { error: error.code, message: `${error.message} ${NOTHING_CHANGED}` });
  }
}

/**
 * Why training on this document cannot be required by this actor, or null: a
 * form or a specification carries no read-and-understood
 * (QMS_TRAINABLE_DOCUMENT_TYPES); a retired document is withdrawn from use; and
 * the actor must be able to read it. The route's GET answers `canAssign` from
 * the same rule, so the screen is never offered a change the server refuses.
 */
export async function trainingAssignmentRefusal(client: JobRoleSqlClient, orgId: number, actorId: number, document: QmsDocumentRow): Promise<GovernedRefusal | null> {
  if (!(QMS_TRAINABLE_DOCUMENT_TYPES as readonly string[]).includes(document.doc_type)) {
    return new GovernedRefusal(409, {
      error: 'QMS_NOT_TRAINABLE_TYPE',
      message: `${document.doc_number} is a ${document.doc_type}, which carries no read-and-understood training. ${NOTHING_CHANGED}`,
    });
  }
  if (document.status === 'retired') {
    return new GovernedRefusal(409, {
      error: 'QMS_DOCUMENT_RETIRED', message: `${document.doc_number} is retired, so nobody trains on it. ${NOTHING_CHANGED}`,
    });
  }
  return documentReadRefusal(client, orgId, actorId, document);
}

/** Exactly one is set (the body schema and the table's CHECK). */
interface AssignmentSubject { jobRoleId?: number; userId?: number }

/** The live job role (422 when it is not live in this organization) or the active member (422) an assignment names, locked FOR SHARE. */
async function lockAssignmentSubject(client: JobRoleSqlClient, orgId: number, subject: AssignmentSubject): Promise<void> {
  if (subject.jobRoleId === undefined) return requireActiveMember(client, orgId, Number(subject.userId));
  try {
    await lockLiveRole(client, orgId, subject.jobRoleId, 'SHARE');
  } catch (error) {
    // The role is a field of the body, not the path: not found there is the body's error.
    if (error instanceof GovernedRefusal && error.status === 404) throw new GovernedRefusal(422, error.body);
    throw error;
  }
}

const subjectKey = (a: { job_role_id?: unknown; user_id?: unknown }) =>
  (a.job_role_id != null ? { jobRoleId: Number(a.job_role_id) } : { userId: Number(a.user_id) });

/** One requirement on the document, by job role or by name. The document is locked FOR SHARE, and the subject with it. */
export async function addQmsTrainingAssignment(
  client: JobRoleSqlClient, orgId: number, actorId: number, documentId: number, input: Pick<QmsTrainingAssignmentInput, 'jobRoleId' | 'userId'>,
): Promise<TrainingStoreChange> {
  const document = await lockTrainingDocument(client, orgId, documentId);
  const refusal = await trainingAssignmentRefusal(client, orgId, actorId, document);
  if (refusal) throw refusal;
  const subject: AssignmentSubject = input.jobRoleId !== undefined ? { jobRoleId: input.jobRoleId } : { userId: input.userId };
  await lockAssignmentSubject(client, orgId, subject);
  let rows: Array<Record<string, unknown>>;
  try {
    ({ rows } = await client.query(
      `INSERT INTO qms_training_assignments (organization_id, document_id, job_role_id, user_id, assigned_by) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, job_role_id, user_id, assigned_at`,
      [orgId, documentId, subject.jobRoleId ?? null, subject.userId ?? null, actorId],
    ));
  } catch (error) {
    if (liveUniqueViolation(error, 'qms_training_assignments_live_role_uq') || liveUniqueViolation(error, 'qms_training_assignments_live_user_uq')) {
      throw new GovernedRefusal(409, {
        error: 'QMS_ALREADY_ASSIGNED',
        message: `${subject.jobRoleId !== undefined ? 'That job role' : 'That person'} is already assigned to train on ${document.doc_number}. ${NOTHING_CHANGED}`,
      });
    }
    throw error;
  }
  const row = rows[0];
  const assignmentId = Number(row.id);
  return {
    target: documentTarget(documentId),
    payload: { change: 'training-assigned', assignmentId, ...subjectKey(row) },
    data: {
      id: assignmentId, documentId, kind: row.job_role_id != null ? 'role' : 'person',
      jobRoleId: row.job_role_id == null ? null : Number(row.job_role_id), userId: row.user_id == null ? null : Number(row.user_id),
      assignedAt: iso(row.assigned_at),
    },
  };
}

/** Whether the assignment covers the actor: it names them, or names a job role they hold. */
async function coversActor(client: JobRoleSqlClient, orgId: number, assignment: Record<string, unknown>, actorId: number): Promise<boolean> {
  if (assignment.user_id != null) return Number(assignment.user_id) === actorId;
  const { rows } = await client.query(
    `SELECT 1 FROM qms_job_role_members WHERE organization_id = $1 AND job_role_id = $2 AND user_id = $3 AND removed_at IS NULL`,
    [orgId, assignment.job_role_id, actorId],
  );
  return rows.length > 0;
}

/**
 * Soft. Nobody withdraws an assignment that covers themselves, by name or by a
 * job role they hold: that would clear their own obligation (D4, as
 * refuseSelf in qms-approver-designation.ts). Another assigner may.
 */
export async function removeQmsTrainingAssignment(
  client: JobRoleSqlClient, orgId: number, actorId: number, documentId: number, assignmentId: number,
): Promise<TrainingStoreChange> {
  const document = await lockTrainingDocument(client, orgId, documentId);
  const { rows } = await client.query(
    `SELECT id, job_role_id, user_id FROM qms_training_assignments
      WHERE id = $1 AND organization_id = $2 AND document_id = $3 AND removed_at IS NULL FOR UPDATE`,
    [assignmentId, orgId, documentId],
  );
  const assignment = rows[0];
  if (!assignment) {
    throw new GovernedRefusal(404, {
      error: 'QMS_TRAINING_ASSIGNMENT_NOT_FOUND', message: `${document.doc_number} has no such training assignment. ${NOTHING_CHANGED}`,
    });
  }
  if (await coversActor(client, orgId, assignment, actorId)) {
    throw new GovernedRefusal(403, {
      error: 'QMS_TRAINING_SELF_UNASSIGN',
      message: `This assignment covers you, so another administrator or QMS approver removes it; you still train on ${document.doc_number}. ${NOTHING_CHANGED}`,
    });
  }
  await client.query(
    `UPDATE qms_training_assignments SET removed_at = now(), removed_by = $3 WHERE id = $1 AND organization_id = $2 AND removed_at IS NULL`,
    [assignmentId, orgId, actorId],
  );
  return {
    target: documentTarget(documentId),
    payload: { change: 'training-unassigned', assignmentId, ...subjectKey(assignment) },
    data: { id: assignmentId, documentId, removed: true },
  };
}

export interface QmsTrainingAssignmentListing {
  assignments: Array<{
    id: number; kind: 'role' | 'person'; jobRoleId: number | null; jobRoleName: string | null;
    userId: number | null; userLabel: string | null;
    /** For a named person: whether they are an active member now. A person who left keeps the row (design Risk 10). */
    active: boolean | null;
    assignedBy: number; assignedByLabel: string; assignedAt: string;
  }>;
  /** The versions people train on: the release in force, and one approved for a later day. */
  trainable: { inForce: { version: string; effectiveDate: string | null } | null; pending: { version: string; effectiveDate: string | null } | null };
  /**
   * The distinct active people assigned, each with every path that covers them:
   * all of them for an administrator or a designated QMS approver, otherwise
   * only the reader's own line (P-50 Q3).
   */
  people: Array<{ userId: number; label: string; via: string[]; coveredSince: string }>;
  /** How many active people are assigned, whoever reads it. */
  peopleCount: number;
  peopleScope: 'everyone' | 'own';
}

/** Who reads the listing: whether they see every person assigned (P-50 Q3), decided by the route. */
export interface TrainingAssignmentReader { userId: number | null; seesEveryone: boolean }

const trainableVersion = (row: QmsDocumentRow) => ({ version: String(row.version), effectiveDate: dayOrNull(row.effective_date) });

/**
 * The document's live assignments, the versions people train on, and who is
 * assigned (the resolver). Open to every member (D4); the people, person by
 * person, only as far as `reader` may see them (P-50 Q3).
 */
export async function readQmsTrainingAssignments(
  client: JobRoleSqlClient, orgId: number, document: QmsDocumentRow, reader: TrainingAssignmentReader,
): Promise<QmsTrainingAssignmentListing> {
  const { rows } = await client.query(
    `SELECT a.id, a.job_role_id, r.name AS job_role_name, a.user_id, a.assigned_by, a.assigned_at
       FROM qms_training_assignments a
       LEFT JOIN qms_job_roles r ON r.id = a.job_role_id AND r.organization_id = a.organization_id
      WHERE a.organization_id = $1 AND a.document_id = $2 AND a.removed_at IS NULL
      ORDER BY a.assigned_at, a.id`,
    [orgId, document.id],
  );
  const people = (await readQmsTrainingAssignees(client, orgId, [document.id])).get(document.id)?.assignees ?? [];
  const shown = reader.seesEveryone ? people : people.filter(p => p.userId === reader.userId);
  const named = rows.flatMap(r => [r.user_id, r.assigned_by]).filter(v => v != null).map(Number);
  const label = personLabeller(await actorNameRows(client, [...named, ...shown.map(p => p.userId)]));
  const inForce = (await readInForceReleases(client, orgId, [document])).get(document.id);
  const assigned = new Set(people.map(p => p.userId));
  return {
    assignments: rows.map(r => ({
      id: Number(r.id), kind: r.job_role_id != null ? 'role' as const : 'person' as const,
      jobRoleId: r.job_role_id == null ? null : Number(r.job_role_id), jobRoleName: r.job_role_name == null ? null : String(r.job_role_name),
      userId: r.user_id == null ? null : Number(r.user_id), userLabel: r.user_id == null ? null : label(r.user_id),
      active: r.user_id == null ? null : assigned.has(Number(r.user_id)),
      assignedBy: Number(r.assigned_by), assignedByLabel: label(r.assigned_by), assignedAt: iso(r.assigned_at),
    })),
    trainable: {
      inForce: inForce ? trainableVersion(inForce.release) : null,
      pending: isPendingEffective(document) ? trainableVersion(document) : null,
    },
    people: shown.map(p => ({ userId: p.userId, label: label(p.userId), via: p.via, coveredSince: p.coveredSince })),
    peopleCount: people.length,
    peopleScope: reader.seesEveryone ? 'everyone' : 'own',
  };
}
