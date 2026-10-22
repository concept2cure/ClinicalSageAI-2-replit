/**
 * The shared fixture of the commitment fulfilment suites (rows D2 and D5,
 * 2026-10-19; decision P-41): one organisation with two programs anchored to
 * two projects (X public, Y private), a project with no program (Z), another
 * organisation (B), submissions and sequences in every dispatch state, and
 * Vault versions, one with its data withdrawn. The routes are the real ones
 * with their own chains; the runtime role is APP_DATABASE_URL with RLS on.
 *
 * Each test file calls setupFixture with its own label, so the files never
 * share an organisation; the per-signer attempt limiter is mocked by each
 * file (vi.mock is per file).
 *
 * Used by tests/db/commitment-fulfilment-evidence.dbtest.ts (the routes) and
 * tests/db/commitment-fulfilment-database.dbtest.ts (what the database holds).
 */
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { expect } from 'vitest';
import { databaseUrl } from '../setup.db';

export const PASSWORD = 'Dbcf-Commitment-Fulfilment-2026!';
const RUN = randomUUID();
/** Set per test file by setupFixture, so two files never share an organisation. */
export let PREFIX = `dbcf-${RUN}`;
export const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export type Who = 'signer' | 'prober' | 'viewer' | 'member' | 'foreign';
export let owner: Pool;
export let app: express.Express;
export let orgId: number;
export let orgUuid: string;
export let foreignOrgId: number;
export const users: Record<Who, { id: number; token: string }> = {} as never;
export const program = { P: '', Q: '', B: '' };
export const project = { X: 0, Y: 0, Z: 0, B: 0 };
export const seq = { ok: 0, ack: 0, pending: 0, rejected: 0, frozen: 0, q: 0, foreign: 0 };
export const vault = { P: '', P2: '', Q: '', B: '', withdrawn: '' };
export const hashes: Record<string, string> = {};
export const sub = { P: 0, Q: 0 };

export async function mintToken(userId: number, org: number): Promise<string> {
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return jwt.sign({ type: 'access', userId, organizationId: String(org) }, activeJwtSecret(), { expiresIn: '15m' });
}

export async function user(key: Who, org: number, role: string): Promise<void> {
  const { rows } = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
    [`${PREFIX}-${key}@example.invalid`, `Fulfil ${key[0].toUpperCase()}${key.slice(1)}`, await bcrypt.hash(PASSWORD, 4)],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role, created_at) VALUES ($1, $2, $3, now() - interval '1 day')`,
    [org, id, role],
  );
  users[key] = { id, token: await mintToken(id, org) };
}

export async function organization(label: string): Promise<{ id: number; uuid: string }> {
  const { rows } = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $1, 'active') RETURNING id, uuid`,
    [`${PREFIX}-${label}`],
  );
  return { id: Number(rows[0].id), uuid: String(rows[0].uuid) };
}

export async function regulatoryProgram(org: number, code: string): Promise<string> {
  const { rows } = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Fulfila 5mg') RETURNING id`,
    [`${PREFIX} ${code}`, `DBCF-${randomUUID().slice(0, 13)}-${code}`, org],
  );
  return String(rows[0].id);
}

export async function projectRow(org: number, label: string, actor: number, programId: string | null, visibility?: 'private'): Promise<number> {
  const ws = await owner.query(
    `INSERT INTO client_workspaces (organization_id, name, slug) VALUES ($1, $2, $2) RETURNING id`,
    [org, `${PREFIX}-${label}-ws`],
  );
  const p = await owner.query(
    `INSERT INTO projects (organization_id, client_workspace_id, name, type, status, owner_id, created_by_id, regulatory_program_id, settings)
     VALUES ($1, $2, $3, 'regulatory', 'active', $4, $4, $5, '{}'::jsonb) RETURNING id`,
    [org, Number(ws.rows[0].id), `${PREFIX}-${label}`, actor, programId],
  );
  const id = Number(p.rows[0].id);
  if (visibility) {
    await owner.query(`INSERT INTO project_visibility_settings (organization_id, project_id, visibility) VALUES ($1, $2, $3)`, [org, id, visibility]);
  }
  return id;
}

export async function submission(org: number, title: string, programId: string | null, actor: number): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by, program_id)
     VALUES ($1, 'ind', 'pharma', 'fda', $2, $3, $4) RETURNING id`,
    [`${PREFIX} ${title}`, org, actor, programId],
  );
  return Number(rows[0].id);
}

export async function sequence(s: { org: number; submissionId: number; number: string; status: string; dispatchStatus: string | null; actor: number }): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, dispatch_status, organization_id, created_by)
     VALUES ($1, 'fda', $2, $3, $4, $5, $6) RETURNING id`,
    [s.submissionId, s.number, s.status, s.dispatchStatus, s.org, s.actor],
  );
  return Number(rows[0].id);
}

export async function vaultVersion(org: number, programId: string, title: string, actor: number): Promise<string> {
  const hash = sha(`${PREFIX} ${title}`);
  const { rows } = await owner.query(
    `INSERT INTO vault.documents (program_id, content_hash, organization_id, document_code, document_title, version,
                                  file_name, mime_type, created_by, status)
     VALUES ($1, $2, $3, $4, $5, '2.0', 'record.txt', 'text/plain', $6, 'completed') RETURNING id::text AS id`,
    [programId, hash, org, `${PREFIX}-${title}`.slice(0, 80), title, actor],
  );
  hashes[String(rows[0].id)] = hash;
  return String(rows[0].id);
}

export const as = (who: Who) => ({ Authorization: `Bearer ${users[who].token}` });
export const ORG = '/api/ha-interactions/commitments';
export const projectBase = (pid: number) => `/api/concept2cure/projects/${pid}`;

export async function orgCommitment(type: string, description: string): Promise<number> {
  const res = await request(app).post(ORG).set(as('signer')).send({ commitmentType: type, description, reason: 'Recording the commitment for the dbtest.' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return Number(res.body.id);
}

export async function projectCommitment(pid: number, type: string, description: string): Promise<number> {
  const letter = await request(app).post(`${projectBase(pid)}/agency-communications`).set(as('signer')).send({
    sourceType: 'uploaded_official_correspondence', communicationType: 'Information request', sourceChannel: 'esg',
    urgency: 'high', responseRequired: true, dueDate: '2026-11-15T00:00:00.000Z', visibilityTier: 'client_internal',
  });
  expect(letter.status, JSON.stringify(letter.body)).toBe(200);
  const eventId = String(letter.body.data.id);
  const q = await request(app).post(`${projectBase(pid)}/agency-communications/${eventId}/questions`).set(as('signer'))
    .send({ questionRef: 'Q1', questionText: 'Commit to the study.', severity: 'major', reason: 'Recording the question as asked.' });
  expect(q.status, JSON.stringify(q.body)).toBe(201);
  const made = await request(app).post(`${projectBase(pid)}/agency-communications/${eventId}/questions/${q.body.data.id}/commitments`)
    .set(as('signer')).send({ commitmentType: type, description, dueDate: '2028-03-31', reason: 'Commitment made in the Q1 response.' });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return Number(made.body.data.id);
}

export type Evidence = { sequenceId?: number; vaultDocumentId?: string };
export const signedBody = (evidence: Evidence | undefined, extra: Record<string, unknown> = {}) => ({
  fulfilledDate: '2026-10-01',
  reason: 'The final study report was filed and acknowledged.',
  ...(evidence ? { evidence } : {}),
  meaning: 'responsibility',
  password: PASSWORD,
  ...extra,
});
export const fulfilUrl = (door: 'org' | number, cid: number) =>
  door === 'org' ? `${ORG}/${cid}/fulfill` : `${projectBase(door)}/commitments/${cid}/fulfill`;
export const optionsUrl = (door: 'org' | number, cid: number) =>
  door === 'org' ? `${ORG}/${cid}/fulfilment-options` : `${projectBase(door)}/commitments/${cid}/fulfilment-options`;

export async function stateOf(cid: number) {
  const r = await owner.query(
    `SELECT status, to_char(fulfilled_date, 'YYYY-MM-DD') AS fulfilled_date, fulfilment_sequence_id, fulfilment_vault_document_id::text AS vault,
            fulfilment_vault_sha256 AS sha, fulfilment_recorded_by AS recorded_by, fulfilment_recorded_at IS NOT NULL AS recorded
       FROM regulatory_commitments WHERE id = $1`,
    [cid],
  );
  return r.rows[0];
}
export async function signaturesOn(cid: number) {
  return (await owner.query(
    `SELECT id, signer_id, signature_type, signature_meaning, binding_basis, bound_payload_digest, signature_manifest::jsonb AS manifest
       FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2 ORDER BY id`,
    [orgId, `regulatory-commitment:${cid}`],
  )).rows;
}
export async function failedAttempts(who: Who): Promise<number> {
  return Number((await owner.query('SELECT coalesce(failed_login_attempts, 0) AS n FROM users WHERE id = $1', [users[who].id])).rows[0].n);
}

/** Statements on one runtime-role transaction in this organisation's tenant scope; the outcome of its COMMIT. */
export async function asRuntime(statements: Array<[string, unknown[]]>, org = orgId, uuid = orgUuid): Promise<{ ok: true } | { ok: false; message: string }> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { getPool } = await import('../../server/db/runtime');
  return runWithTenantScope({ tenantId: String(org), orgUuid: uuid, role: 'admin', source: 'request', caller: 'commitment-fulfilment-evidence.dbtest' }, async () => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (const [sql, params] of statements) await client.query(sql, params);
      await client.query('COMMIT');
      return { ok: true as const };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
    } finally {
      client.release();
    }
  });
}

/** What the runtime role would have to write to fulfil a commitment by hand. */
export const rawFulfil = (cid: number, ev: { seq?: number | null; vault?: string | null; sha?: string | null }, recordedBy: number | null = null): [string, unknown[]] => [
  `UPDATE regulatory_commitments
      SET status = 'fulfilled', fulfilled_date = DATE '2026-10-01',
          fulfilment_sequence_id = $2, fulfilment_vault_document_id = $3::uuid, fulfilment_vault_sha256 = $4,
          fulfilment_recorded_by = $5, fulfilment_recorded_at = CASE WHEN $5::int IS NULL THEN NULL ELSE now() END
    WHERE id = $1`,
  [cid, ev.seq ?? null, ev.vault ?? null, ev.sha ?? null, recordedBy],
];

/** Organisations, users, programs, projects, submissions, sequences and Vault versions; the two routers. */
export async function setupFixture(label: string): Promise<void> {
  PREFIX = `dbcf-${label}-${RUN}`;
  if (!process.env.APP_DATABASE_URL) throw new Error('[dbcf] APP_DATABASE_URL is required: owner execution proves nothing about RLS.');
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  const own = await organization('own');
  orgId = own.id;
  orgUuid = own.uuid;
  await user('signer', orgId, 'admin');
  await user('prober', orgId, 'admin');
  await user('viewer', orgId, 'viewer');
  await user('member', orgId, 'member');
  const foreign = await organization('foreign');
  foreignOrgId = foreign.id;
  await user('foreign', foreignOrgId, 'admin');

  program.P = await regulatoryProgram(orgId, 'P');
  program.Q = await regulatoryProgram(orgId, 'Q');
  program.B = await regulatoryProgram(foreignOrgId, 'B');
  project.X = await projectRow(orgId, 'X', users.signer.id, program.P);
  project.Y = await projectRow(orgId, 'Y', users.signer.id, program.Q, 'private');
  project.Z = await projectRow(orgId, 'Z', users.signer.id, null);
  project.B = await projectRow(foreignOrgId, 'B', users.foreign.id, program.B);

  sub.P = await submission(orgId, 'IND 123456', program.P, users.signer.id);
  sub.Q = await submission(orgId, 'hidden-IND 654321', program.Q, users.signer.id);
  const subB = await submission(foreignOrgId, 'their IND', program.B, users.foreign.id);
  seq.ok = await sequence({ org: orgId, submissionId: sub.P, number: '0042', status: 'dispatched', dispatchStatus: 'sent', actor: users.signer.id });
  seq.ack = await sequence({ org: orgId, submissionId: sub.P, number: '0041', status: 'dispatched', dispatchStatus: 'acknowledged', actor: users.signer.id });
  seq.pending = await sequence({ org: orgId, submissionId: sub.P, number: '0043', status: 'dispatched', dispatchStatus: 'pending', actor: users.signer.id });
  seq.rejected = await sequence({ org: orgId, submissionId: sub.P, number: '0044', status: 'dispatched', dispatchStatus: 'rejected', actor: users.signer.id });
  seq.frozen = await sequence({ org: orgId, submissionId: sub.P, number: '0045', status: 'frozen', dispatchStatus: null, actor: users.signer.id });
  seq.q = await sequence({ org: orgId, submissionId: sub.Q, number: '0917', status: 'dispatched', dispatchStatus: 'sent', actor: users.signer.id });
  seq.foreign = await sequence({ org: foreignOrgId, submissionId: subB, number: '0001', status: 'dispatched', dispatchStatus: 'sent', actor: users.foreign.id });

  vault.P = await vaultVersion(orgId, program.P, 'Final CSR', users.signer.id);
  vault.P2 = await vaultVersion(orgId, program.P, 'Stability report', users.signer.id);
  vault.Q = await vaultVersion(orgId, program.Q, 'Hidden protocol', users.signer.id);
  vault.B = await vaultVersion(foreignOrgId, program.B, 'Their CSR', users.foreign.id);
  vault.withdrawn = await vaultVersion(orgId, program.P, 'Withdrawn listing', users.signer.id);
  await owner.query(
    `INSERT INTO document_data_dispositions (organization_id, program_id, vault_document_id, choice, reason, actor_id, source_sha256,
                                             preview_hash, linked_ids, impact_snapshot, audit_receipt)
     VALUES ($1, $2, $3::uuid, 'remove_data', 'Data withdrawn for the dbtest probe.', $4, $5, $6,
             jsonb_build_object('capturedSourceIds', '[]'::jsonb, 'vaultDocumentIds', jsonb_build_array($7::text), 'artifactIds', '[]'::jsonb, 'uploadIds', '[]'::jsonb),
             '{}'::jsonb, jsonb_build_object('id', 'dbcf', 'sha256Chain', $6::text))`,
    [orgId, program.P, vault.withdrawn, users.signer.id, hashes[vault.withdrawn], 'e'.repeat(64), vault.withdrawn],
  );

  app = express();
  app.use(express.json());
  app.use('/api/concept2cure', (await import('../../server/routes/c2c/communication-center')).default);
  const { authMiddleware } = await import('../../server/auth');
  app.use('/api/ha-interactions', authMiddleware, (await import('../../server/routes/ha-interactions')).default);
}

export async function teardownFixture(): Promise<void> {
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end().catch(() => undefined);
  await owner?.end();
}
