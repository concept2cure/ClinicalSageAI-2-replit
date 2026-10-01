/**
 * The compliance reports an organisation runs for an inspector, on a real
 * database, as the runtime role, with row-level security enforcing.
 *
 * Founder request 2026-09-26: the security and compliance reports a client may
 * be asked for in an audit, runnable by the client. Evidence:
 * docs/evidence/D6/2026-09-30-compliance-reports/server/.
 *
 * What only a database proves: that every statement the seven reports issue
 * parses and reads real columns; that run as organisation A it returns A's
 * rows and none of B's (each statement carries its own organisation predicate
 * AND runs on a tenant-stamped snapshot under RLS); that the vault reads, which
 * are policied on the organisation's UUID rather than its integer id, are
 * reached rather than silently empty; and that each run writes exactly one
 * `compliance.report_run` row on A's chain before the package is sent.
 *
 * The stack is production's: the real auth boundary (token → membership role
 * → tenant scope), the real route on the runtime pool, which
 * provisionTwoTenantFixture asserts is app_service, NOSUPERUSER, NOBYPASSRLS,
 * with app.rls_enforce=on.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Pool, PoolClient } from 'pg';

import { createAuthBoundary } from '../../server/middleware/authBoundary';
import { createComplianceReportRoutes } from '../../server/routes/audit-compliance-reports';
import tenantUsers from '../../server/routes/tenant-users';
import tenantConfig from '../../server/routes/tenant-config';
import { getPool } from '../../server/db/runtime';
import { verifySignedAuditExport } from '../../server/services/audit/signedAuditExport';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { findReport } from '../../server/services/audit/compliance-reports/catalog';
import { runComplianceReport } from '../../server/services/audit/compliance-reports/generate';
import { platformIntegrityChecks } from '../../server/services/audit/compliance-reports/integrity-checks';
import { parseReportPeriod } from '../../server/services/audit/compliance-reports/period';
import {
  FIXTURE_ORGS,
  ORG_A,
  ORG_B,
  TAG,
  accessToken,
  auth,
  ids,
  owner,
  provisionMember,
  signerA,
  signerB,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
  tokenA,
  userA,
  userB,
} from './two-tenant-fixture';

type Section = { key: string; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean; notes?: string[] };
type Report = { organizationId: number; sections: Section[]; chain: { ok: boolean | null; scope: string } };
/** Review round 1, item 10: every timestamp is ISO-8601 UTC text. */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const REPORTS = [
  'access-review',
  'authentication-events',
  'administrative-changes',
  'electronic-signatures',
  'audit-trail-integrity',
  'retention-legal-holds',
  'controlled-documents',
] as const;

const saved = { key: process.env.AUDIT_EXPORT_SIGNING_KEY, keyId: process.env.AUDIT_EXPORT_SIGNING_KEY_ID };
let app: express.Express;
let adminA: number;
let adminB: number;
let tokenAdminA: string;
let from: string;
const today = new Date().toISOString().slice(0, 10);
const seeded = { A: {} as Record<string, string>, B: {} as Record<string, string> };

/** One tagged audit row per organisation, as the writer stores it (teardown deletes by the TAG prefix). */
async function auditRow(org: number, user: number, action: string, recordId: string, values: Record<string, unknown>) {
  const r = await owner.query(
    `INSERT INTO audit_logs (tenant_id, user_id, actor_id, action, table_name, record_id, new_values, ip_address, occurred_at)
     VALUES ($1,$2,$2,$3,'user',$4,$5::json,'203.0.113.7', now()) RETURNING id::text`,
    [org, user, action, recordId, JSON.stringify(values)],
  );
  return r.rows[0].id as string;
}

async function seed(side: 'A' | 'B', org: number, member: number, admin: number) {
  const s = seeded[side];
  const rp = await owner.query(
    `INSERT INTO regulatory_programs (organization_id, name, code, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', $2) RETURNING id::text`,
    [org, `${TAG}-RP-${side}`, `${TAG}-RP-${side}`],
  );
  const program = rp.rows[0].id as string;
  // A vault document under a named policy: read through the vault's UUID policy, not the integer one.
  const vdoc = await owner.query(
    `INSERT INTO vault.documents (program_id, organization_id, content_hash, document_code, title, retention_policy, retention_until)
     VALUES ($1, $2, repeat('c', 64), $3, $4, $5, DATE '2030-01-01') RETURNING id::text`,
    [program, org, `${TAG}-VDOC-${side}`, `${TAG}-VDOC-${side}`, `${TAG}-policy-${side}`],
  );
  s.vaultDoc = vdoc.rows[0].id;
  s.login = await auditRow(org, member, 'user_login', `${TAG}-login-${side}`, {
    outcome: 'success', reason: 'mfa_verified', email: `${TAG}-${side.toLowerCase()}@example.invalid`,
  });
  s.invite = await auditRow(org, admin, 'user_invited', `${TAG}-invite-${side}`, { email: `${TAG}-invitee-${side}@example.invalid`, role: 'member' });
  s.disposition = await auditRow(org, 0, 'vault.document.retention_soft_delete', `${TAG}-disp-${side}`, {
    documentCode: `${TAG}-DOC-${side}`, retentionPolicy: `${TAG}-policy`, retentionUntil: '2026-01-01', archived: true,
  });
  const hold = await owner.query(
    `INSERT INTO vault.legal_holds (organization_id, reference, reason, scope, program_id, placed_by, placed_at)
     VALUES ($1,$2,'Litigation hold for the compliance report probe','program',$3,$4, now()) RETURNING id::text`,
    [org, `${TAG}-hold-${side}`, program, admin],
  );
  s.hold = hold.rows[0].id;
  Object.assign(s, await effectiveQmsDocument(side, org, admin));
  // Closed two days ago: on today's register (raised by the date), though no longer open.
  const change = await owner.query(
    `INSERT INTO qms_change_controls (organization_id, change_number, title, description, reason, status, created_at, closed_at)
     VALUES ($1,$2,$3,'Probe change','Probe reason','closed', now() - interval '3 days', now() - interval '2 days')
     RETURNING id::text`,
    [org, `${TAG}-CC-${side}`, `${TAG} change ${side}`],
  );
  s.change = change.rows[0].id;
}

/** An approval signature on a side's QMS document, written as the approval writer anchors one; removed in afterAll. */
async function approvalSignature(
  db: Pool | PoolClient,
  { side, docId, label, ago, revoked }: { side: 'A' | 'B'; docId: string; label: string; ago: string; revoked: boolean },
): Promise<string> {
  const r = await db.query(
    `INSERT INTO electronic_signatures
       (organization_id, signed_target, signature_type, signature_purpose, signature_meaning, signer_id, signer_name,
        signer_email, authentication_method, authentication_timestamp, signature_hash, signature_manifest, is_valid,
        verification_status, signed_at)
     VALUES ($1, $2, 'qms-document-approval', 'Approve the probe SOP', 'APPROVED', $3, $4,
             $5, 'password', now(), $6, $7::json, $8, $9, now() - $10::interval)
     RETURNING id::text`,
    [
      side === 'A' ? ORG_A : ORG_B, `qms-document:${docId}`, side === 'A' ? signerA : signerB, `WO03 signer ${side}`,
      `wo03-fixture-signer-${side.toLowerCase()}@example.invalid`, `${TAG}-${label}`, JSON.stringify({ version: '1.0' }),
      !revoked, revoked ? 'revoked' : null, ago,
    ],
  );
  return r.rows[0].id;
}

/**
 * A controlled document made effective the way the approval writer makes one: the status and its
 * approval signature on ONE transaction. The database refuses an effective document without that
 * (P0-18, migrations/20261001_qms_document_signature_required.sql), so the fixture signs it.
 */
async function effectiveQmsDocument(side: 'A' | 'B', org: number, author: number): Promise<{ qms: string; approval: string }> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    const doc = await c.query(
      `INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, version, status, author_id)
       VALUES ($1,$2,$3,'SOP','1.0','draft',$4) RETURNING id::text`,
      [org, `${TAG}-QMS-${side}`, `${TAG} controlled document ${side}`, author],
    );
    const qms = doc.rows[0].id as string;
    const label = side === 'A' ? 'approval-valid' : 'approval-valid-B';
    const approval = await approvalSignature(c, { side, docId: qms, label, ago: '2 hours', revoked: false });
    await c.query(`UPDATE qms_documents SET status = 'effective' WHERE id = $1`, [qms]);
    await c.query('COMMIT');
    return { qms, approval };
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

/** The production stack, built per request: each run here gets a fresh rate-limit allowance (run-limits.ts). */
function stack(): express.Express {
  const a = express();
  a.use('/api', createAuthBoundary());
  a.use('/api', createComplianceReportRoutes(getPool()));
  return a;
}

async function run(report: string, query = '') {
  const res = await request(stack()).get(`/api/audit/reports/${report}${query}`).set(auth(tokenAdminA));
  return res;
}

/** This run's own rows: another suite on the same fixture organisations may have left rows of its own. */
function tagged(rows: Record<string, unknown>[], key: string): Record<string, unknown>[] {
  return rows.filter((r) => String(r[key] ?? '').startsWith(TAG));
}

function section(data: Report, key: string): Section {
  const s = data.sections.find((x) => x.key === key);
  if (!s) throw new Error(`no section ${key}`);
  return s;
}

beforeAll(async () => {
  process.env.AUTH_BOUNDARY_MODE = 'enforce';
  process.env.AUDIT_EXPORT_SIGNING_KEY = `cr-dbtest-export-key-${'x'.repeat(32)}`;
  process.env.AUDIT_EXPORT_SIGNING_KEY_ID = 'k-cr-dbtest';
  await provisionTwoTenantFixture();
  adminA = await provisionMember(ORG_A, 'admin', 'cr-admin-a');
  adminB = await provisionMember(ORG_B, 'admin', 'cr-admin-b');
  tokenAdminA = accessToken(adminA, ORG_A, 'admin');
  await seed('A', ORG_A, userA, adminA);
  await seed('B', ORG_B, userB, adminB);
  // seed() signed each document effective (seeded.X.approval). The later signature is revoked:
  // the register must show the earlier, valid one.
  seeded.A.approvalRevoked = await approvalSignature(owner, {
    side: 'A', docId: seeded.A.qms, label: 'approval-revoked', ago: '1 hour', revoked: true,
  });
  // The fixture signature is permanent (§11.70) and reused for the life of the database:
  // the period starts on the day it was written, within the 366-day limit.
  const sig = await owner.query(
    `SELECT GREATEST(COALESCE(signed_at, created_at)::date, (now() - interval '365 days')::date)::text AS d
       FROM electronic_signatures WHERE id = $1`,
    [ids.A.signatures],
  );
  from = sig.rows[0].d;

  app = stack();
}, 60_000);

afterAll(async () => {
  process.env.AUDIT_EXPORT_SIGNING_KEY = saved.key;
  process.env.AUDIT_EXPORT_SIGNING_KEY_ID = saved.keyId;
  if (owner) {
    const c = await owner.connect();
    try {
      await c.query("SELECT set_config('app.rls_enforce','off',false)");
      // The table owner may remove a recorded vault version (vault.documents_delete_guard); nobody else can.
      await c.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${TAG}%`]);
      await c.query('DELETE FROM vault.legal_holds WHERE organization_id = ANY($1::int[])', [FIXTURE_ORGS]);
      await c.query('DELETE FROM qms_documents WHERE doc_number LIKE $1', [`${TAG}%`]);
      await c.query('DELETE FROM qms_change_controls WHERE change_number LIKE $1', [`${TAG}%`]);
      // This run's own probe signatures, removed as the owner the way audit rows are (append-only otherwise).
      await c.query('BEGIN');
      await c.query('ALTER TABLE electronic_signatures DISABLE TRIGGER trg_electronic_signatures_immutable');
      await c.query('DELETE FROM electronic_signatures WHERE signature_hash LIKE $1', [`${TAG}%`]);
      await c.query('ALTER TABLE electronic_signatures ENABLE TRIGGER trg_electronic_signatures_immutable');
      await c.query('COMMIT');
      // The runs' own chain rows: the tail of each fixture organisation's chain, removed the way
      // the fixture removes its audit rows (the no-delete trigger off for this transaction only).
      await c.query('BEGIN');
      await c.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
      await c.query(
        "DELETE FROM audit_logs WHERE tenant_id = ANY($1::int[]) AND action = 'compliance.report_run'",
        [FIXTURE_ORGS],
      );
      // The administrator changes this run made through the real writers (P1-41).
      await c.query(
        'DELETE FROM audit_logs WHERE tenant_id = ANY($1::int[]) AND action = ANY($2::text[]) AND actor_id = $3',
        [FIXTURE_ORGS, ['member_role_changed', 'member_removed', 'tenant_settings_changed'], adminA],
      );
      await c.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
      await c.query('COMMIT');
    } catch (err) {
      await c.query('ROLLBACK').catch(() => undefined);
      console.warn('[compliance-reports] cleanup incomplete:', err);
    } finally {
      c.release();
    }
  }
  await teardownTwoTenantFixture();
});

describe('compliance reports on a real database, as app_service with RLS enforcing', () => {
  it('a member who is not an audit reader is refused before anything is read', async () => {
    const res = await request(app).get('/api/audit/reports/access-review').set(auth(tokenA));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUDIT_READ_RESTRICTED');
  });

  it.each(REPORTS)('%s runs as organisation A, verifies, and carries only A rows', async (report) => {
    const res = await run(report, `?from=${from}&to=${today}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const exp = res.body.export;
    expect(verifySignedAuditExport(exp.data, exp.manifest, exp.signature)).toMatchObject({ valid: true, signingKeyId: 'k-cr-dbtest' });
    const data = JSON.parse(exp.data) as Report;
    expect(data.organizationId).toBe(ORG_A);
    // Review round 1, item 2: only the attestation walks the chain.
    expect(data.chain.scope).toBe(report === 'audit-trail-integrity' ? 'integrity-checks' : 'not-checked');
    expect(exp.manifest.chainAtGeneration).toEqual(data.chain);
    expect(exp.manifest.organizationId).toBe(ORG_A);
    // Nothing of B's, by any of its seeded identifiers.
    const uuids = Object.values(seeded.B).filter((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(v));
    for (const marker of [`${TAG}-B`, `${TAG}-b@`, `${TAG}-invitee-B`, `${TAG}-hold-B`, `${TAG}-QMS-B`, `${TAG}-DOC-B`, `${TAG}-VDOC-B`, `${TAG}-policy-B`, ...uuids]) {
      expect(exp.data).not.toContain(marker);
    }
  });

});

describe('each report as organisation A, section by section', () => {
  it('access review: A members only, with the last sign-in read from the sign-in audit row', async () => {
    const data = JSON.parse((await run('access-review', `?to=${today}`)).body.export.data) as Report;
    const members = section(data, 'members').rows;
    expect(members.map((r) => r.user_id).sort()).toEqual([userA, adminA].sort());
    expect(members.find((r) => r.user_id === userA)?.last_sign_in_at).toMatch(ISO_UTC);
    for (const m of members) expect(m.member_since).toMatch(ISO_UTC);
    expect(section(data, 'privileged').rows.map((r) => r.user_id)).toEqual([adminA]);
  });

  it('sign-in events and administrative changes: A rows are there, B rows are not', async () => {
    const auth1 = JSON.parse((await run('authentication-events', `?from=${today}&to=${today}`)).body.export.data) as Report;
    const auditIds = section(auth1, 'events').rows.map((r) => String(r.audit_id));
    expect(auditIds).toContain(seeded.A.login);
    expect(auditIds).not.toContain(seeded.B.login);
    for (const e of section(auth1, 'events').rows) expect(e.occurred_at).toMatch(ISO_UTC);
    expect(section(auth1, 'summary').rows).toContainEqual({ action: 'user_login', outcome: 'success', events: expect.any(Number) });

    const admin = JSON.parse((await run('administrative-changes', `?from=${today}&to=${today}`)).body.export.data) as Report;
    const targets = section(admin, 'changes').rows.map((r) => r.target_id);
    expect(targets).toContain(`${TAG}-invite-A`);
    expect(targets).not.toContain(`${TAG}-invite-B`);
  });

  it('signature register: the A fixture signature, never the B one', async () => {
    const data = JSON.parse((await run('electronic-signatures', `?from=${from}&to=${today}`)).body.export.data) as Report;
    const sigIds = section(data, 'signatures').rows.map((r) => String(r.id));
    expect(sigIds).toContain(ids.A.signatures);
    expect(sigIds).not.toContain(ids.B.signatures);
    // Item 6: the meaning as stored (the fixture declared none), the purpose and signed version as their own columns.
    const fixture = section(data, 'signatures').rows.find((r) => String(r.id) === ids.A.signatures)!;
    expect(fixture).toMatchObject({ meaning: null, signature_type: 'approval', signature_purpose: 'fixture-body-A', signed_version: null });
    expect(fixture.signed_at).toMatch(ISO_UTC);
  });

  it('retention and holds: the vault is reached under its own policy, A hold and disposition only', async () => {
    const data = JSON.parse((await run('retention-legal-holds', `?from=${today}&to=${today}`)).body.export.data) as Report;
    const holds = tagged(section(data, 'holds').rows, 'reference');
    expect(holds.map((r) => r.id)).toEqual([seeded.A.hold]);
    expect(holds[0].placed_by_name).toBe('WO03 cr-admin-a');
    expect(holds[0].placed_at).toMatch(ISO_UTC);
    const disposed = tagged(section(data, 'dispositions').rows, 'document_id');
    expect(disposed.map((r) => String(r.audit_id))).toEqual([seeded.A.disposition]);
    // The vault read ran rather than coming back empty for want of its UUID policy: the A document's
    // policy, counted; B's not there.
    expect(tagged(section(data, 'policies').rows, 'policy_name')).toEqual([
      {
        policy_name: `${TAG}-policy-A`,
        defined: false,
        retention_days: null,
        archive_before_delete: null,
        hard_delete: null,
        active: null,
        documents: 1,
        next_expiry: '2030-01-01',
      },
    ]);
  });

  it('with no organisation UUID in the session scope (the degraded membership path), the vault is still read as A, not read as empty', async () => {
    // The pool binds app.current_org_id from the scope's UUID; this scope has none, so only the
    // report's own binding (currentTenantOrgUuid → organizations row of the scope's tenant) reaches the vault.
    const def = findReport('retention-legal-holds')!;
    const window = parseReportPeriod({ from: today, to: today }, 'range');
    if (!window.ok) throw new Error(window.message);
    const { data } = await runWithTenantScope(
      { tenantId: String(ORG_A), orgUuid: null, role: 'admin', source: 'request', caller: 'compliance-reports dbtest' },
      () =>
        runComplianceReport(getPool(), def, ORG_A, window, {
          walkChain: async () => ({ ok: null, reason: 'not walked by this probe' }),
          checks: platformIntegrityChecks,
        }),
    );
    const policies = tagged(data.sections.find((x) => x.key === 'policies')!.rows, 'policy_name');
    expect(policies.map((r) => r.policy_name)).toEqual([`${TAG}-policy-A`]);
  });

  it('controlled documents: the A document only', async () => {
    const data = JSON.parse((await run('controlled-documents', `?to=${today}`)).body.export.data) as Report;
    const docs = tagged(section(data, 'documents').rows, 'doc_number');
    expect(docs.map((r) => String(r.id))).toEqual([seeded.A.qms]);
    expect(docs[0]).toMatchObject({ doc_number: `${TAG}-QMS-A`, status: 'effective', author: 'WO03 cr-admin-a' });
    // Item 7: the valid approval, not the later revoked one; who signed, with what meaning; the revoked count.
    expect(docs[0]).toMatchObject({
      approval_signature_id: Number(seeded.A.approval),
      approval_signer_name: 'WO03 signer A',
      approval_meaning: 'APPROVED',
      revoked_approval_signatures: 1,
      superseded_by_id: null,
    });
    expect(docs[0].approval_signed_at).toMatch(ISO_UTC);
    // Every change control raised by the date, closed ones included, with its description and reason.
    const changes = tagged(section(data, 'changes').rows, 'change_number');
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ id: Number(seeded.A.change), status: 'closed', description: 'Probe change', reason: 'Probe reason' });
    expect(changes[0].closed_at).toMatch(ISO_UTC);
  });

});

describe('administrator changes, as their writers record them, appear in the administrative changes report (P1-41)', () => {
  /** The routes an administrator changes access and configuration through, mounted as production mounts them. */
  function adminStack(): express.Express {
    const a = express();
    a.use(express.json());
    a.use('/api', createAuthBoundary());
    a.use('/api/tenant-users', tenantUsers);
    a.use('/api/tenant-config', tenantConfig);
    return a;
  }

  it('a role change, a removal and a security settings change each appear, with what changed and why', async () => {
    const member = await provisionMember(ORG_A, 'member', 'cr-rerole');
    const saved = (await owner.query('SELECT settings FROM organizations WHERE id = $1', [ORG_A])).rows[0]?.settings;
    const reason = `${TAG} periodic access review`;
    try {
      const admin = adminStack();
      const reroled = await request(admin)
        .patch(`/api/tenant-users/${ORG_A}/${member}`)
        .set(auth(tokenAdminA))
        .send({ role: 'viewer', reason });
      expect(reroled.status, JSON.stringify(reroled.body)).toBe(200);
      const removed = await request(admin).delete(`/api/tenant-users/${ORG_A}/${member}`).set(auth(tokenAdminA)).send({ reason });
      expect(removed.status, JSON.stringify(removed.body)).toBe(200);
      const configured = await request(admin)
        .patch(`/api/tenant-config/${ORG_A}/settings/security`)
        .set(auth(tokenAdminA))
        .send({ sessionTimeoutMinutes: 25 });
      expect(configured.status, JSON.stringify(configured.body)).toBe(200);

      const data = JSON.parse((await run('administrative-changes', `?from=${today}&to=${today}`)).body.export.data) as Report;
      const mine = section(data, 'changes').rows.filter((r) => r.actor_user_id === adminA);
      const role = mine.find((r) => r.action === 'member_role_changed' && r.target_id === String(member));
      expect(role, 'the role change is in the report').toMatchObject({ target_type: 'organization_users', reason });
      expect(JSON.parse(String(role!.detail))).toMatchObject({ targetUserId: member, previousRole: 'member', newRole: 'viewer' });
      const removal = mine.find((r) => r.action === 'member_removed' && r.target_id === String(member));
      expect(removal, 'the removal is in the report').toMatchObject({ reason });
      expect(JSON.parse(String(removal!.detail))).toMatchObject({ previousRole: 'viewer', newRole: null });
      const settings = mine.find((r) => r.action === 'tenant_settings_changed');
      expect(settings, 'the settings change is in the report').toMatchObject({ target_id: String(ORG_A) });
      expect(JSON.parse(String(settings!.detail))).toMatchObject({
        sections: ['security'],
        values: { security: { after: { sessionTimeoutMinutes: 25 } } },
      });
      for (const r of mine) expect(r.occurred_at).toMatch(ISO_UTC);
    } finally {
      await owner.query('UPDATE organizations SET settings = $2 WHERE id = $1', [ORG_A, saved == null ? null : JSON.stringify(saved)]);
      await owner.query('DELETE FROM organization_users WHERE user_id = $1', [member]);
    }
  });
});

describe('the integrity attestation and the record of a run', () => {
  it("integrity attestation: A's stores counted as the owner counts them, and each check a stated verdict", async () => {
    const data = JSON.parse((await run('audit-trail-integrity', `?from=${today}&to=${today}`)).body.export.data) as Report;
    const owned = await owner.query('SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1', [ORG_A]);
    const logs = section(data, 'stores').rows.find((r) => r.store === 'audit_logs')!;
    // The count is read before this run's own record is written.
    expect(Number(logs.rows_total)).toBe(owned.rows[0].n - 1);
    for (const v of section(data, 'verdicts').rows) expect(['intact', 'broken', 'not verified']).toContain(v.verdict);
  });

  it("each run writes exactly one compliance.report_run row on A's chain, and none on B's", async () => {
    const count = async (org: number) =>
      (
        await owner.query(
          "SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND action = 'compliance.report_run' AND record_id = 'access-review'",
          [org],
        )
      ).rows[0].n as number;
    const [a0, b0] = [await count(ORG_A), await count(ORG_B)];
    const res = await run('access-review', `?to=${today}`);
    expect(res.status).toBe(200);
    expect(await count(ORG_A)).toBe(a0 + 1);
    expect(await count(ORG_B)).toBe(b0);
    const row = await owner.query(
      `SELECT actor_id, sha256_chain, new_values->>'exportId' AS export_id, new_values->>'dataHash' AS data_hash
         FROM audit_logs
        WHERE tenant_id = $1 AND action = 'compliance.report_run' AND record_id = 'access-review'
        ORDER BY occurred_at DESC LIMIT 1`,
      [ORG_A],
    );
    expect(row.rows[0]).toMatchObject({
      actor_id: adminA,
      export_id: res.body.export.manifest.exportId,
      data_hash: res.body.export.manifest.dataHash,
    });
    expect(row.rows[0].sha256_chain).toMatch(/^[0-9a-f]{64}$/);
  });
});

/*
 * Reporting review 2026-10-01. HONEST-STATE-9: the access review printed
 * 'emailed_code' as the second factor of an account created by single sign-on,
 * which has no password here and is never asked for a code by the platform.
 * HONEST-STATE-11: the retention policies section is the current state, printed
 * under the chosen period with nothing saying so. Last in the file: the SSO
 * member it provisions would change the member lists asserted above.
 */
describe('what the compliance reports say about what they cannot see', () => {
  it('an account created by single sign-on is not reported as having the emailed code', async () => {
    const ssoMember = await provisionMember(ORG_A, 'member', 'cr-sso-a');
    await owner.query(`UPDATE users SET password_hash = 'saml:' || gen_random_uuid()::text WHERE id = $1`, [ssoMember]);
    const data = JSON.parse((await run('access-review', `?to=${today}`)).body.export.data) as Report;
    const members = section(data, 'members');
    expect(members.rows.find((r) => r.user_id === ssoMember)?.mfa_posture).toBe('Identity provider (not verified by the platform)');
    expect(members.rows.find((r) => r.user_id === userA)?.mfa_posture).toBe('Emailed code');
    expect(members.notes?.join(' ')).toMatch(/has no password here and signs in through the organisation's identity provider/);
  });

  it('the retention policies section says it is as at generation, not as at the period', async () => {
    const data = JSON.parse((await run('retention-legal-holds', `?from=${from}&to=${today}`)).body.export.data) as Report;
    expect(section(data, 'policies').notes?.join(' ')).toMatch(/As at generation, not as at the period/);
  });
});
