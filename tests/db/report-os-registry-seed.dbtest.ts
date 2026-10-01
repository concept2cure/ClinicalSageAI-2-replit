/**
 * D2 (2026-09-30): the report type registry reaches a provisioned database, and
 * a run of a seeded type is created and recorded.
 *
 * Before this, report_type_registry was empty on every database provisioned
 * the canonical way (drizzle-kit push + the migration set): no migration
 * inserted into it, and its only writer, POST /api/report-os/taxonomy/seed, was
 * refused in production (that route was deleted in review round 1; the
 * migration is the one writer now). report_runs.report_type_id references it, so
 * POST /api/report-os/runs answered 404 "Unknown reportTypeId" for every type.
 *
 * This applies migrations/20260930_report_type_registry_seed.sql through the
 * deploy's own applier (applyMigrationFiles) to the provisioned test database,
 * then, through the real router on the shared two-tenant fixture — app_service,
 * not superuser, no BYPASSRLS, app.rls_enforce=on, asserted by the fixture —
 * runs one seeded type and reads back the run and its audit row.
 *
 * Owner reads are used for counts: reading through the app role would be
 * circular, since a row RLS hid would look like a row never written.
 */
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import reportOsRouter from '../../server/routes/report-os';
import { getPool } from '../../server/db/runtime';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { setTenantContextTx } from '../../server/services/tenant/governed-tenant-context';
import { buildSealedRecord } from '../../server/services/report-os/sealing/seal';
import type { RenderedReport } from '../../server/services/report-os/render/types';
import { applyMigrationFiles } from '../../scripts/db/migration-set.mjs';
import {
  REPORT_TYPE_REGISTRY_SEED,
  REPORT_TYPE_REGISTRY_SEED_FILE,
} from '../../scripts/db/generate-report-type-registry-seed';
import {
  ORG_B,
  owner,
  tokenA,
  tokenB,
  userB,
  ids,
  auth,
  accessToken,
  provisionMember,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

const repoRoot = path.resolve(__dirname, '..', '..');
const SEEDED_IDS = REPORT_TYPE_REGISTRY_SEED.map((t) => t.typeId);
/** The row an operator disables between deploys. */
const DISABLED = REPORT_TYPE_REGISTRY_SEED[1].typeId;
/** The type the run case uses: standard plan, project scope. */
const RUN_TYPE = 'readiness.executive_digest';

async function applySeed(): Promise<void> {
  const migrator = await owner.connect();
  try {
    const { failures } = await applyMigrationFiles(migrator, repoRoot, [REPORT_TYPE_REGISTRY_SEED_FILE], {
      stopOnFirstFailure: true,
    });
    expect(failures).toEqual([]);
  } finally {
    migrator.release();
  }
}

async function seededRows() {
  const { rows } = await owner.query(
    `SELECT type_id, label, family, enabled, updated_at,
            allowed_scopes::text AS allowed_scopes, allowed_personas::text AS allowed_personas,
            allowed_client_segments::text AS allowed_client_segments,
            data_dependencies::text AS data_dependencies, artifact_dependencies::text AS artifact_dependencies,
            workflow_dependencies::text AS workflow_dependencies, ana_modules::text AS ana_modules,
            export_template, governance_requirements::text AS governance_requirements,
            truthfulness_rules::text AS truthfulness_rules
       FROM report_type_registry WHERE type_id = ANY($1::text[]) ORDER BY type_id`,
    [SEEDED_IDS]
  );
  return rows as Array<Record<string, unknown>>;
}

beforeAll(provisionTwoTenantFixture, 60_000);
afterAll(async () => {
  // The disable is the test's, not the database's: put it back.
  await owner?.query('UPDATE report_type_registry SET enabled = true WHERE type_id = $1', [DISABLED]).catch(() => {});
  await removeFixtureReportAuditRows().catch((err) => console.warn('[report-os seed] audit rows left in place:', err));
  await teardownTwoTenantFixture();
});

/**
 * The run's audit row belongs to the reserved fixture tenant, which the
 * teardown deletes. audit_logs is append-only (trg_audit_logs_no_delete), so —
 * as the fixture's own teardown does for its rows — the owner disables that
 * trigger inside one transaction, scoped to this fixture tenant's report-os
 * actions only.
 */
async function removeFixtureReportAuditRows(): Promise<void> {
  const cleanup = await owner.connect();
  try {
    await cleanup.query('BEGIN');
    // The finalize cases' signatures, removed as the owner (append-only otherwise),
    // as compliance-reports.dbtest.ts removes its own: they reference fixture users.
    await cleanup.query('ALTER TABLE electronic_signatures DISABLE TRIGGER trg_electronic_signatures_immutable');
    await cleanup.query(`DELETE FROM electronic_signatures WHERE organization_id = $1 AND signed_target LIKE 'report-run:%'`, [ORG_B]);
    await cleanup.query('ALTER TABLE electronic_signatures ENABLE TRIGGER trg_electronic_signatures_immutable');
    await cleanup.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await cleanup.query(
      `DELETE FROM audit_logs WHERE tenant_id = $1 AND (action LIKE 'report\\_os.%' OR action = 'c2c.work.sign')`,
      [ORG_B]
    );
    await cleanup.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await cleanup.query('COMMIT');
  } catch (err) {
    await cleanup.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cleanup.release();
  }
}

describe('report type registry seed (D2)', () => {
  it('applies to the provisioned database and registers every in-code type, column for column', async () => {
    await applySeed();
    const rows = await seededRows();
    expect(rows.map((r) => r.type_id)).toEqual([...SEEDED_IDS].sort());
    const byId = new Map(rows.map((r) => [r.type_id, r]));
    for (const t of REPORT_TYPE_REGISTRY_SEED) {
      // The JSON text is what drizzle's json column sends for these values.
      expect(byId.get(t.typeId)).toMatchObject({
        label: t.label,
        family: t.family,
        allowed_scopes: JSON.stringify(t.allowedScopes),
        allowed_personas: JSON.stringify(t.allowedPersonas),
        allowed_client_segments: JSON.stringify(t.allowedClientSegments),
        data_dependencies: JSON.stringify(t.dataDependencies),
        artifact_dependencies: JSON.stringify(t.artifactDependencies),
        workflow_dependencies: JSON.stringify(t.workflowDependencies),
        ana_modules: JSON.stringify(t.anaModules),
        export_template: t.exportTemplate,
        governance_requirements: JSON.stringify(t.governanceRequirements),
        truthfulness_rules: JSON.stringify(t.truthfulnessRules),
      });
    }
  });

  it("re-applies idempotently: the code's values return, an operator's disable survives", async () => {
    const seededTotal = (await seededRows()).length;
    await owner.query(
      `UPDATE report_type_registry SET enabled = false, label = 'hand-edited between deploys'
        WHERE type_id = $1`,
      [DISABLED]
    );
    const before = (await seededRows()).find((r) => r.type_id === DISABLED)!;

    await applySeed();

    const after = await seededRows();
    expect(after).toHaveLength(seededTotal);
    const row = after.find((r) => r.type_id === DISABLED)!;
    expect(row.enabled, "an operator's disable must survive the deploy").toBe(false);
    expect(row.label, "the code's label is restored").toBe(REPORT_TYPE_REGISTRY_SEED[1].label);
    expect((row.updated_at as Date).getTime()).toBeGreaterThanOrEqual((before.updated_at as Date).getTime());
    expect(after.filter((r) => r.type_id !== DISABLED).every((r) => r.enabled === true)).toBe(true);
  });

  it('as app_service under RLS, POST /runs for a seeded type creates the run and records it', async () => {
    const ro = express();
    ro.use(express.json());
    ro.use('/api/report-os', reportOsRouter);

    const created = await request(ro)
      .post('/api/report-os/runs')
      .set(auth(tokenB))
      .send({ scopeType: 'project', scopeId: ids.B.projects, reportTypeId: RUN_TYPE });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const runId = created.body.data.run.id as number;

    const run = await owner.query(
      'SELECT organization_id, report_type_id, requested_by FROM report_runs WHERE id = $1',
      [runId]
    );
    expect(run.rows).toEqual([{ organization_id: ORG_B, report_type_id: RUN_TYPE, requested_by: userB }]);

    const audit = await owner.query(
      `SELECT action, table_name, actor_id, new_values::jsonb AS details, sha256_chain IS NOT NULL AS chained
         FROM audit_logs WHERE tenant_id = $1 AND record_id = $2 AND action = 'report_os.run_created'`,
      [ORG_B, String(runId)]
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ table_name: 'report_run', actor_id: userB, chained: true });
    expect(audit.rows[0].details).toMatchObject({ reportTypeId: RUN_TYPE, scopeType: 'project' });
  });
});

/**
 * Review round 1 (DP-47, DP-50), on the same fixture: sealing is for owners,
 * admins and managers; the status, the seal and the chain row commit together
 * or not at all; a final report is not sealed again; a bundle export is
 * recorded, with the hash of its bytes, before it is sent.
 *
 * Reporting review 2026-10-01: finalize is an electronic signature. The admin
 * signs with a real password (re-verified by the ceremony against the stored
 * bcrypt hash), as an approval of a run the member requested, so separation of
 * duties runs against report_runs.requested_by; the signature row lands with
 * the seal.
 */
const ro = express();
ro.use(express.json());
ro.use('/api/report-os', reportOsRouter);
/** The final-eligible run the finalize cases seal and the bundle case packs. */
let runId: number;

let adminToken: string;
let adminId: number;
const REFUSE_FN = `wo03_refuse_finalize_row_${process.pid}`;
const PASSWORD = 'report-finalize-dbtest-password';
const SIGNED = { reason: 'Issued for the review round 1 dbtest', meaning: 'approval', reauth: { password: PASSWORD } };
const finalize = (token: string, body: Record<string, unknown> = SIGNED) =>
  request(ro).post(`/api/report-os/runs/${runId}/finalize`).set(auth(token)).send(body);
const signatureRows = async () =>
  (
    await owner.query(
      `SELECT signer_id, signature_meaning FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2`,
      [ORG_B, `report-run:${runId}`]
    )
  ).rows;

const finalizedRows = async () =>
  (
    await owner.query(
      `SELECT new_values::jsonb AS details, sha256_chain IS NOT NULL AS chained FROM audit_logs
        WHERE tenant_id = $1 AND record_id = $2 AND action = 'report_os.run_finalized'`,
      [ORG_B, String(runId)]
    )
  ).rows;
const runState = async () =>
  (
    await owner.query(
      `SELECT r.status, s.snapshot_metadata::jsonb -> 'seal' ->> 'contentHash' AS seal_hash
         FROM report_runs r JOIN report_snapshots s ON s.run_id = r.id AND s.is_latest
        WHERE r.id = $1`,
      [runId]
    )
  ).rows[0];

describe('finalize on the record (review round 1, DP-47)', () => {
  beforeAll(async () => {
    await applySeed();
    adminId = await provisionMember(ORG_B, 'admin', 'report-admin');
    adminToken = accessToken(adminId, ORG_B, 'admin');
    await owner.query('UPDATE users SET password_hash = $2 WHERE id = $1', [adminId, await bcrypt.hash(PASSWORD, 4)]);
    // A run the truthfulness gate lets be final: no blockers, no critical
    // blockers. Requested by the member, so the admin's approval is independent.
    const run = await owner.query(
      `INSERT INTO report_runs (organization_id,scope_type,scope_id,report_type_id,status,confidence,blockers,dependency_summary,requested_by)
       VALUES ($1,'project',$2,$3,'completed',90,'[]'::json,$4::json,$5) RETURNING id`,
      [ORG_B, ids.B.projects, RUN_TYPE, JSON.stringify({ providers: [], summary: {}, criticalBlockers: [] }), userB]
    );
    runId = run.rows[0].id;
    await owner.query(
      `INSERT INTO report_snapshots (run_id,organization_id,scope_type,scope_id,snapshot_version,is_latest,snapshot_metadata)
       VALUES ($1,$2,'project',$3,1,true,$4::json)`,
      [runId, ORG_B, ids.B.projects, JSON.stringify({ reportTypeId: RUN_TYPE })]
    );
  });

  it('refuses a member: nothing is sealed and nothing is recorded', async () => {
    const res = await finalize(tokenB);
    expect(res.status).toBe(403);
    expect(await runState()).toEqual({ status: 'completed', seal_hash: null });
    expect(await finalizedRows()).toEqual([]);
  });

  it('refuses a password that is not the signer\'s: nothing is sealed, signed or recorded', async () => {
    const res = await finalize(adminToken, { ...SIGNED, reauth: { password: 'not the password' } });
    expect(res.status, JSON.stringify(res.body)).toBe(401);
    expect(await runState()).toEqual({ status: 'completed', seal_hash: null });
    expect(await finalizedRows()).toEqual([]);
    expect(await signatureRows()).toEqual([]);
  });

  it('when the chain row is refused, the status and the seal roll back with it (503, nothing changed)', async () => {
    await owner.query(
      `CREATE FUNCTION ${REFUSE_FN}() RETURNS trigger LANGUAGE plpgsql AS
         $$ BEGIN RAISE EXCEPTION 'refused by the review round 1 dbtest'; END $$`
    );
    await owner.query(
      `CREATE TRIGGER ${REFUSE_FN} BEFORE INSERT ON audit_logs FOR EACH ROW
         WHEN (NEW.action = 'report_os.run_finalized' AND NEW.tenant_id = ${ORG_B})
         EXECUTE FUNCTION ${REFUSE_FN}()`
    );
    try {
      const res = await finalize(adminToken);
      expect(res.status, JSON.stringify(res.body)).toBe(503);
      expect(res.body.error.code).toBe('REPORT_FINALIZE_NOT_RECORDED');
    } finally {
      await owner.query(`DROP TRIGGER IF EXISTS ${REFUSE_FN} ON audit_logs`);
      await owner.query(`DROP FUNCTION IF EXISTS ${REFUSE_FN}()`);
    }
    expect(await runState(), 'nothing may have changed').toEqual({ status: 'completed', seal_hash: null });
    expect(await finalizedRows()).toEqual([]);
    expect(await signatureRows()).toEqual([]);
  });

  it('an admin finalizes: status, seal, one chained row and the signature, together', async () => {
    const res = await finalize(adminToken);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const sealHash = res.body.data.seal.contentHash as string;
    expect(res.body.data.signature).toMatchObject({ meaning: 'approval' });
    expect(await runState()).toEqual({ status: 'final', seal_hash: sealHash });
    const rows = await finalizedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      chained: true,
      details: { sealHash, reportTypeId: RUN_TYPE, reason: SIGNED.reason, meaning: 'approval', priorStatus: 'completed' },
    });
    expect(await signatureRows()).toEqual([{ signer_id: adminId, signature_meaning: 'approval' }]);
  });

  it('a second finalize is refused: the seal stands and nothing more is recorded', async () => {
    const before = await runState();
    const res = await finalize(adminToken);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RUN_ALREADY_FINAL');
    expect(await runState()).toEqual(before);
    expect(await finalizedRows()).toHaveLength(1);
  });
});

/* Reporting review 2026-10-01 (Part 11): the seal is read back and re-verified.
   Runs after the finalize cases above, over the run the admin sealed. */
describe('the seal on the record', () => {
  it('reads the seal back and re-verifies it, with the signer and the act (GET /runs/:id/seal)', async () => {
    const res = await request(ro).get(`/api/report-os/runs/${runId}/seal`).set(auth(tokenB));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({
      sealed: true,
      signature: { signerName: expect.any(String), meaning: 'approval' },
      finalization: { reason: SIGNED.reason, meaning: 'approval', priorStatus: 'completed' },
      verification: { verdict: 'intact' },
    });
    // The chain row's json text hashes to its payload_hash on a real database.
    expect(res.body.data.verification.checks[0]).toMatchObject({ check: 'audit-chain', ok: true });
    expect(res.body.data.seal.contentHash).toBe((await runState()).seal_hash);
  });

  it("another organisation's session reads neither the seal nor the sealed document: 404, nothing in the body", async () => {
    for (const path of ['seal', 'rendered']) {
      const res = await request(ro).get(`/api/report-os/runs/${runId}/${path}`).set(auth(tokenA));
      expect(res.status, path).toBe(404);
      expect(JSON.stringify(res.body)).not.toMatch(/sealHash|contentHash|signerName|sections/);
    }
  });

  it('shows the final run as the stored sealed document (GET /runs/:id/rendered)', async () => {
    const res = await request(ro).get(`/api/report-os/runs/${runId}/rendered`).set(auth(tokenB));
    expect(res.status).toBe(200);
    expect(res.body.sealed).toBe(true);
    expect(res.body.data.status).toBe('final');
  });

  it('a stored document changed after sealing reads as a mismatch, not intact', async () => {
    const restore = (
      await owner.query(
        `SELECT id, snapshot_metadata::text AS meta FROM report_snapshots WHERE run_id = $1 AND is_latest`,
        [runId]
      )
    ).rows[0] as { id: number; meta: string };
    const meta = JSON.parse(restore.meta);
    meta.sealedDocument.sections[0].title = 'Edited after sealing';
    await owner.query('UPDATE report_snapshots SET snapshot_metadata = $2::json WHERE id = $1', [restore.id, JSON.stringify(meta)]);
    try {
      const res = await request(ro).get(`/api/report-os/runs/${runId}/seal`).set(auth(tokenB));
      expect(res.status).toBe(200);
      expect(res.body.data.verification.verdict).toBe('mismatch');
      // ...and the changed copy is not shown as the sealed record.
      const shown = await request(ro).get(`/api/report-os/runs/${runId}/rendered`).set(auth(tokenB));
      expect(shown.status).toBe(409);
      expect(shown.body.error.code).toBe('SEALED_DOCUMENT_MISMATCH');
    } finally {
      await owner.query('UPDATE report_snapshots SET snapshot_metadata = $2::json WHERE id = $1', [restore.id, restore.meta]);
    }
  });
});

/** GET /seal's verdict and GET /rendered's answer for the run, through the app role. */
async function sealAndRendered() {
  const seal = await request(ro).get(`/api/report-os/runs/${runId}/seal`).set(auth(tokenB));
  const shown = await request(ro).get(`/api/report-os/runs/${runId}/rendered`).set(auth(tokenB));
  return { verdict: seal.body.data?.verification?.verdict, rendered: [shown.status, shown.body.error?.code] };
}

describe('the seal on the record: what a rewrite of the mutable rows cannot hide', () => {
  it('a sealed document removed from the snapshot reads as a mismatch, and nothing is re-rendered in its place', async () => {
    const restore = (
      await owner.query(`SELECT id, snapshot_metadata::text AS meta FROM report_snapshots WHERE run_id = $1 AND is_latest`, [runId])
    ).rows[0] as { id: number; meta: string };
    const meta = JSON.parse(restore.meta);
    delete meta.sealedDocument;
    await owner.query('UPDATE report_snapshots SET snapshot_metadata = $2::json WHERE id = $1', [restore.id, JSON.stringify(meta)]);
    try {
      expect(await sealAndRendered()).toEqual({ verdict: 'mismatch', rendered: [409, 'SEALED_DOCUMENT_MISMATCH'] });
    } finally {
      await owner.query('UPDATE report_snapshots SET snapshot_metadata = $2::json WHERE id = $1', [restore.id, restore.meta]);
    }
  });

  it("a run whose status was rewritten after finalizing reads as a mismatch, not as a run never sealed", async () => {
    await owner.query(`UPDATE report_runs SET status = 'completed' WHERE id = $1`, [runId]);
    try {
      expect(await sealAndRendered()).toEqual({ verdict: 'mismatch', rendered: [409, 'SEALED_DOCUMENT_MISMATCH'] });
    } finally {
      await owner.query(`UPDATE report_runs SET status = 'final' WHERE id = $1`, [runId]);
    }
    expect(await sealAndRendered()).toEqual({ verdict: 'intact', rendered: [200, undefined] });
  });
});

/**
 * The forgery the second review found: the app role can write report_runs,
 * report_snapshots and audit_logs, so in three writes it could make a run that
 * was never finalized read "intact" over a document it wrote. A finalization row
 * inserted without a chain position (the trigger lets an unchained row through as
 * legacy) is not the record.
 */
describe('the seal on the record: a forgery by the app role is not the record', () => {
  it('a run given final status, a forged sealed document and an unchained finalization row reads as a mismatch', async () => {
    const created = await request(ro).post('/api/report-os/runs').set(auth(tokenB)).send({ scopeType: 'project', scopeId: ids.B.projects, reportTypeId: RUN_TYPE });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const forgedRun = created.body.data.run.id as number;
    const forged: RenderedReport = {
      reportTypeId: RUN_TYPE, scopeType: 'project', scopeId: String(ids.B.projects), generatedAt: new Date().toISOString(), status: 'final',
      sections: [{ id: 's', title: 'Summary', blocks: [{ kind: 'summary', text: 'FORGED: ready to file.' }] }],
    };
    const seal = buildSealedRecord(forged, new Date().toISOString());
    const nv = JSON.stringify({ sealHash: seal.contentHash, algorithm: seal.algorithm, canonVersion: seal.canonVersion, atomCount: seal.atomCount, sealedAt: seal.sealedAt, documentStored: true });
    await runWithTenantScope({ tenantId: String(ORG_B), role: 'member', source: 'test', caller: 'report-seal-forgery' }, async () => {
      const app = await getPool().connect();
      try {
        await app.query('BEGIN');
        await setTenantContextTx(app, ORG_B);
        await app.query(`UPDATE report_runs SET status = 'final' WHERE id = $1`, [forgedRun]);
        await app.query('UPDATE report_snapshots SET snapshot_metadata = $2::json WHERE run_id = $1 AND is_latest', [forgedRun, JSON.stringify({ seal, sealedDocument: forged })]);
        await app.query(
          `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, new_values, payload_hash)
           VALUES ($1, 'report_os.run_finalized', 'report_run', $2, $3::json, $4)`,
          [ORG_B, String(forgedRun), nv, createHash('sha256').update(nv).digest('hex')]
        );
        await app.query('COMMIT');
      } finally {
        app.release();
      }
    });
    const seen = await request(ro).get(`/api/report-os/runs/${forgedRun}/seal`).set(auth(tokenB));
    expect(seen.body.data.verification.verdict).toBe('mismatch');
    expect(seen.body.data.verification.checks[0].detail).toMatch(/no position on the audit chain/);
    const shown = await request(ro).get(`/api/report-os/runs/${forgedRun}/rendered`).set(auth(tokenB));
    expect(shown.status).toBe(409);
    expect(JSON.stringify(shown.body)).not.toContain('FORGED');
  });
});

describe('a bundle export on the record (review round 1, DP-50)', () => {
  it('a bundle export is recorded on the chain with the hash of the bytes sent', async () => {
    const made = await request(ro)
      .post('/api/report-os/bundles')
      .set(auth(tokenB))
      .send({ name: 'Review round 1 bundle', runIds: [runId] });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const bundleId = made.body.data.bundleId as string;

    const res = await request(ro)
      .get(`/api/report-os/bundles/${bundleId}/export.pdf`)
      .set(auth(tokenB))
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const body = res.body as Buffer;
    expect(body.subarray(0, 4).toString()).toBe('%PDF');
    const rows = (
      await owner.query(
        `SELECT table_name, new_values::jsonb AS details, sha256_chain IS NOT NULL AS chained FROM audit_logs
          WHERE tenant_id = $1 AND record_id = $2 AND action = 'report_os.bundle_exported'`,
        [ORG_B, bundleId]
      )
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      table_name: 'report_bundle',
      chained: true,
      details: { runIds: [runId], byteLength: body.length, sha256: createHash('sha256').update(body).digest('hex') },
    });
  });
});
