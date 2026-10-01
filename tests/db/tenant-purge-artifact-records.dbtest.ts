/**
 * A tenant purge reaches a signed artifact (rows D5/D6, 2026-10-01).
 *
 * 20260929_concept2cure_signatures_append_only.sql made an artifact's
 * signatures and lock snapshots append-only for every role, and refused the
 * cascade from deleting the artifact, so a signed artifact cannot be deleted
 * along with its signatures. The tenant purge deletes `projects`, which
 * cascades to the artifacts. So a purge of any tenant that had signed or
 * locked an artifact failed, and the tenant could not be offboarded.
 *
 * Each signing's chained ledger row (recordGovernedAction, written with the
 * signature in artifact-signed-act.ts) is the audit-trail record, and the
 * purge keeps it. The signature and snapshot rows are the tenant's records:
 * the export returns them, and the purge erases them through
 * public.purge_tenant_artifact_records, the one door the triggers admit. The
 * same shape as the AnA turn records (20260926_ana_turn_records.sql).
 *
 * The purge runs its real table list here (PURGE_CHILD_TABLES), on PostgreSQL
 * built by install-fresh + deploy-migrate.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { purgeTenant } from '../../server/services/tenant/tenant-offboarding';
import { TurnRecorder, writeTurnRecord } from '../../server/services/ana/turn-record';

const ORG = 90631;
const TAG = `artpurge_${process.pid}_${Date.now().toString(36)}`;
const DIGEST = `${TAG}-digest`;

let owner: Pool;
let signer: number;

const count = async (sql: string) => (await owner.query(sql, [ORG])).rows[0].n as number;
const signatures = () => count('SELECT count(*)::int AS n FROM concept2cure_signatures WHERE organization_id = $1');
const snapshots = () => count('SELECT count(*)::int AS n FROM concept2cure_submission_snapshots WHERE organization_id = $1');
const artifacts = () => count('SELECT count(*)::int AS n FROM concept2cure_artifacts WHERE organization_id = $1');
const ledger = () => count(`SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND record_id LIKE 'artifact:%'`);

/**
 * What a client has after some real work: a membership, a program with its
 * anchor project, a workspace, a locked artifact with its signed version,
 * signature, snapshot and ledger row, a review thread with a comment on it,
 * and an AnA turn record.
 */
async function seedSignedArtifact(): Promise<void> {
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
    [ORG, signer],
  );
  const program = await owner.query(
    `INSERT INTO regulatory_programs (organization_id, name, code, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'TX-101') RETURNING id`,
    [ORG, `${TAG} program`, `P${Date.now() % 100000000}`],
  );
  const ws = await owner.query(
    `INSERT INTO client_workspaces (organization_id, name, slug) VALUES ($1, $2, $2) RETURNING id`,
    [ORG, `${TAG}-ws-${Date.now()}`],
  );
  const project = await owner.query(
    `INSERT INTO projects (organization_id, client_workspace_id, name, type, regulatory_program_id)
     VALUES ($1, $2, $3, 'ind', $4) RETURNING id`,
    [ORG, ws.rows[0].id, `${TAG}-project`, program.rows[0].id],
  );
  const art = await owner.query(
    `INSERT INTO concept2cure_artifacts (artifact_id, project_id, organization_id, type, category, title, content, status, created_by_id)
     VALUES ($1, $2, $3, 'document', 'clinical', 'Investigator Brochure', 'Body', 'locked', $4) RETURNING id`,
    [`${TAG}-art-${Date.now()}`, project.rows[0].id, ORG, signer],
  );
  const artifactId = art.rows[0].id;
  const version = await owner.query(
    `INSERT INTO concept2cure_artifact_versions (artifact_id, organization_id, version, content, content_hash)
     VALUES ($1, $2, 1, 'Body', $3) RETURNING id`,
    [artifactId, ORG, 'a'.repeat(64)],
  );
  await owner.query(
    `INSERT INTO concept2cure_signatures (signature_id, artifact_id, artifact_version_id, organization_id, signature_type,
       signature_purpose, signer_id, signer_name, signer_email, authentication_method, authentication_timestamp, signature_hash)
     VALUES ($1, $2, $3, $4, 'electronic', 'approval', $5, 'Dana Reviewer', 'dana@example.invalid', 'password+totp', now(), $6)`,
    [`${TAG}-sig-${Date.now()}`, artifactId, version.rows[0].id, ORG, signer, 'b'.repeat(64)],
  );
  await owner.query(
    `INSERT INTO concept2cure_submission_snapshots (snapshot_id, artifact_id, organization_id, version_id, content_hash, title, action_type, actor_name)
     VALUES ($1, $2, $3, $4, $5, 'Investigator Brochure', 'lock', 'Dana Reviewer')`,
    [`${TAG}-snap-${Date.now()}`, artifactId, ORG, version.rows[0].id, 'a'.repeat(64)],
  );
  const thread = await owner.query(
    `INSERT INTO concept2cure_review_threads (thread_id, org_id, project_id, artifact_id, created_by_id, created_by_name, title, status)
     VALUES ($1, $2, $3, $4, $5, 'Dana Reviewer', 'Section 4 dosing', 'open') RETURNING id`,
    [`${TAG}-thread-${Date.now()}`, ORG, project.rows[0].id, artifactId, signer],
  );
  await owner.query(
    `INSERT INTO concept2cure_thread_comments (comment_id, org_id, thread_id, artifact_id, author_id, author_name, body)
     VALUES ($1, $2, $3, $4, $5, 'Dana Reviewer', 'The starting dose needs its rationale.')`,
    [`${TAG}-cmt-${Date.now()}`, ORG, thread.rows[0].id, artifactId, signer],
  );
  const turn = new TurnRecorder();
  turn.setTurn({ organizationId: ORG, runId: `${TAG}-run-${Date.now()}`, actorUserId: signer });
  turn.setRequest('Summarise the dosing rationale.');
  turn.setAnswer({ streamed: 'It is in section 4.', stored: 'It is in section 4.' });
  await writeTurnRecord(owner, turn.seal('answered'));
  await owner.query(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, table_name, record_id, new_values)
     VALUES (gen_random_uuid(), $1, $2, 'approve', 'concept2cure_artifacts', $3, '{}'::json)`,
    [ORG, signer, `artifact:${TAG}`],
  );
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await owner.query(
    `INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $2, 'active') ON CONFLICT (id) DO NOTHING`,
    [ORG, TAG],
  );
  const u = await owner.query(
    `INSERT INTO users (email, name, password_hash, default_organization_id) VALUES ($1, 'Dana Reviewer', 'x', $2) RETURNING id`,
    [`${TAG}@example.invalid`, ORG],
  );
  signer = Number(u.rows[0].id);
});

beforeEach(async () => {
  await owner.query(
    `UPDATE organizations SET status = 'pending_deletion', purged_at = NULL, deletion_requested_at = now() - interval '40 days',
       purge_eligible_at = now() - interval '1 day' WHERE id = $1`,
    [ORG],
  );
  await owner.query('DELETE FROM vault.legal_holds WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM tenant_export_receipts WHERE organization_id = $1', [ORG]);
  await owner.query(
    `INSERT INTO tenant_export_receipts (organization_id, digest, table_count, row_count, created_by) VALUES ($1, $2, 4, 6, NULL)`,
    [ORG, DIGEST],
  );
});

afterAll(async () => {
  if (!owner) return;
  // What a failed run leaves: the triggers refuse even the owner, so the
  // teardown disables them for its own deletes, as other tests/db teardowns do.
  for (const t of ['concept2cure_signatures', 'concept2cure_submission_snapshots']) {
    await owner.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
    await owner.query(`DELETE FROM ${t} WHERE organization_id = $1`, [ORG]);
    await owner.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
  }
  for (const t of ['ana_turn_records', 'ana_record_blobs']) {
    await owner.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
    await owner.query(`DELETE FROM ${t} WHERE organization_id = $1`, [ORG]);
    await owner.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
  }
  await owner.query('DELETE FROM projects WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM regulatory_programs WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM organization_users WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM client_workspaces WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM tenant_export_receipts WHERE organization_id = $1', [ORG]);
  await owner.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
  await owner.query('DELETE FROM audit_logs WHERE tenant_id = $1', [ORG]);
  await owner.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
  await owner.query('DELETE FROM users WHERE id = $1', [signer]);
  await owner.query('DELETE FROM organizations WHERE id = $1', [ORG]);
  await owner.end();
});

describe('a tenant that signed and locked an artifact', () => {
  it('is purged: its signatures, lock snapshots and artifacts are erased, and each signing’s ledger row stays', async () => {
    await seedSignedArtifact();
    const ledgerBefore = await ledger();
    const purged = await purgeTenant(owner, {
      organizationId: ORG,
      purgedByUserId: signer,
      preconditions: { finalExportDigest: DIGEST },
    });
    expect(purged.status).toBe('purged');
    expect(purged.artifactRecordErasure).toEqual({ signatures: 1, snapshots: 1 });
    expect(await signatures()).toBe(0);
    expect(await snapshots()).toBe(0);
    expect(await artifacts()).toBe(0);
    expect(await count('SELECT count(*)::int AS n FROM concept2cure_thread_comments WHERE org_id = $1')).toBe(0);
    expect(await count('SELECT count(*)::int AS n FROM ana_turn_records WHERE organization_id = $1')).toBe(0);
    expect(await count('SELECT count(*)::int AS n FROM projects WHERE organization_id = $1')).toBe(0);
    expect(await count('SELECT count(*)::int AS n FROM client_workspaces WHERE organization_id = $1')).toBe(0);
    expect(await count('SELECT count(*)::int AS n FROM regulatory_programs WHERE organization_id = $1')).toBe(0);
    expect(purged.turnRecordErasure.records).toBe(1);
    expect(await ledger()).toBe(ledgerBefore);
  });
});

describe('outside the purge, a signature still cannot go', () => {
  it('a direct DELETE, and deleting its project, are refused for the owner', async () => {
    await owner.query(`UPDATE organizations SET status = 'active' WHERE id = $1`, [ORG]);
    await seedSignedArtifact();
    const before = await signatures();
    await expect(owner.query('DELETE FROM concept2cure_signatures WHERE organization_id = $1', [ORG])).rejects.toThrow(
      /IMMUTABILITY_VIOLATION/,
    );
    await expect(owner.query('DELETE FROM projects WHERE organization_id = $1', [ORG])).rejects.toThrow(
      /IMMUTABILITY_VIOLATION/,
    );
    expect(await signatures()).toBe(before);
  });

  it('the door refuses an organization that is not pending deletion, and erases nothing', async () => {
    await owner.query(`UPDATE organizations SET status = 'active' WHERE id = $1`, [ORG]);
    const before = await signatures();
    expect(before).toBeGreaterThan(0);
    await expect(owner.query('SELECT * FROM public.purge_tenant_artifact_records($1)', [ORG])).rejects.toThrow(
      /not pending deletion/,
    );
    expect(await signatures()).toBe(before);
  });
});
