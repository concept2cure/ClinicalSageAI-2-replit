/**
 * A departing tenant's regulated records leave with the tenant, after custody
 * passes to the customer (P-58, D6, 2026-10-29;
 * docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/).
 *
 * On the deploy-shaped database, through the production stack (the auth
 * boundary and the tenant-export router as app_service, RLS enforced), with
 * two tenants, D and E, each holding one row of every held table
 * (offboarding-custody-fixture.ts):
 *
 *   1. Export first. D's full export holds D's row of every held table and
 *      none of E's, and carries the integrity verdict of each hash chain and
 *      the manifest of each signature.
 *   2. Custody is a signed act. Without it the purge of D is refused before a
 *      row is touched. D's administrator reads the attestation, which lists
 *      the held records still inside D's retention period, and signs it
 *      through the platform's ceremony (password, meaning, reason). Nobody
 *      else can: not a member, not E's administrator, not for a digest that is
 *      not D's.
 *   3. The offboarding certificate. The purge of D writes one row of
 *      tenant_offboarding_certificates: the export's digest, the rows erased
 *      per table, the held records it erased, the custody signature, who purged
 *      and when, and no customer content. It survives the purge, as does the
 *      custody signature it names, and nobody can change or remove it.
 *   4. The held tables are erased. D's row of every held table is gone, through
 *      its purge door where its trigger refuses DELETE; E keeps every one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import * as offboarding from '../../server/services/tenant/tenant-offboarding';
import { discoverTenantTables } from '../../server/services/tenant-export/tenant-full-export.service';
import {
  ALL_HELD, CALLER, ORG_D, ORG_E, OWN_SCOPE_ONLY, PASSWORD, auth, owner, people, provision, purgedTables, routeTasks, seedHeld, seeders, signatures,
  stack, teardown,
} from './offboarding-custody-fixture';
import { qualified, type SeededRow } from './tenant-purge-row-seeder';
import { forgetOffboardingCertificate, signCustody } from './offboarding-custody-signature';

const { PURGE_CHILD_TABLES, PURGE_PARENT_SCOPED } = offboarding;
let unseedable: string[] = [];

type ExportBody = {
  digest: string;
  tables: Array<{ table: string; rows: Array<Record<string, unknown>> }>;
  coverage: { tablesFailed: unknown[]; scope?: { kind: string } };
  integrity?: {
    chains?: Array<{ chain: string; verdict: string }>;
    signatures?: Array<{ id: number; hashIntegrity: string; manifest: unknown; manifestSha256: string; signatureHash: string }>;
  };
};
let exportD: ExportBody;

/** Whether an export holds the seeded row, found by its key. */
const holds = (body: ExportBody, r: SeededRow) => {
  const t = body.tables.find((x) => qualified(x.table) === r.table);
  return !!t && t.rows.some((row) => Object.entries(r.key).every(([k, v]) => String(row[k]) === v));
};

/** The purge as the route runs it: the runtime pool, in the platform scope. */
async function purge(org: number, digest: string) {
  const { pool: runtime } = await import('../../server/db');
  const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
  return runWithSystemTenantScope(CALLER, () => offboarding.purgeTenant(runtime, {
    organizationId: org, purgedByUserId: people.adminD.id, preconditions: { finalExportDigest: digest },
  }));
}
const refusal = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; message?: string }) => e);
const statusOf = async (org: number) => (await owner.query('SELECT status FROM organizations WHERE id = $1', [org])).rows[0].status;

beforeAll(async () => {
  await provision();
  const exercised = await purgedTables([...new Set([...PURGE_CHILD_TABLES, ...Object.keys(PURGE_PARENT_SCOPED)])]);
  // A held table is written for each tenant, never reused as reference data.
  unseedable = await seedHeld(new Set([...exercised, ...ALL_HELD.map(qualified)]));
  const res = await request(await stack()).get('/api/tenant-export/full').set(auth(people.adminD));
  if (res.status !== 200) throw new Error(`[obc] the export answered ${res.status}: ${JSON.stringify(res.body).slice(0, 400)}`);
  exportD = JSON.parse(res.text) as ExportBody;
}, 300_000);

afterAll(async () => {
  await teardown();
}, 300_000);

describe('1. export first: every held record is in the tenant export', () => {
  it('seeds one row of every held table for D and for E', () => {
    expect(unseedable).toEqual([]);
    for (const t of ALL_HELD) {
      for (const org of [ORG_D, ORG_E]) {
        expect(seeders.get(org)!.rows.some((r) => r.table === qualified(t)), `${t} for ${org}`).toBe(true);
      }
    }
  });

  it('every held table is one the export reads', async () => {
    const read = new Set((await discoverTenantTables(owner)).map((d) => `${d.schema}.${d.table}`));
    expect(ALL_HELD.map(qualified).filter((t) => !read.has(t)), 'held tables the export does not read').toEqual([]);
  });

  it("D's export holds D's row of every held table and none of E's", () => {
    expect(exportD.coverage.tablesFailed).toEqual([]);
    const held = new Set(ALL_HELD.map(qualified));
    const missing: string[] = [];
    const leaked: string[] = [];
    for (const org of [ORG_D, ORG_E]) {
      for (const r of seeders.get(org)!.rows.filter((x) => held.has(x.table) || x === routeTasks.get(org))) {
        const has = holds(exportD, r);
        if (org === ORG_D && !has) missing.push(r.table);
        if (org === ORG_E && has) leaked.push(r.table);
      }
    }
    expect(leaked, "E's held rows in D's export").toEqual([]);
    expect([...new Set(missing)], "D's held rows missing from D's export").toEqual([]);
  });

  it("holds D's row of every table the platform scope returned none of, the Vault's among them, and none of E's", () => {
    // P-58's data return (2026-10-29): the route read in the platform scope, where these policies
    // return none of a tenant's rows and nothing fails. In D's own scope they return all of D's.
    const missing: string[] = [];
    const leaked: string[] = [];
    for (const org of [ORG_D, ORG_E]) {
      for (const r of seeders.get(org)!.rows.filter((x) => OWN_SCOPE_ONLY.includes(x.table))) {
        const has = holds(exportD, r);
        if (org === ORG_D && !has) missing.push(r.table);
        if (org === ORG_E && has) leaked.push(r.table);
      }
    }
    expect(leaked, "E's rows in D's export").toEqual([]);
    expect([...new Set(missing)], "D's rows missing from D's export").toEqual([]);
    for (const t of OWN_SCOPE_ONLY) {
      expect(seeders.get(ORG_D)!.rows.some((r) => r.table === t), `${t} seeded for D`).toBe(true);
    }
    expect(exportD.coverage.scope?.kind, 'the scope the export states, inside its digest').toBe('organization');
  });

  it('carries the verdict of the audit ledger every signature cites', () => {
    const ledger = exportD.integrity?.chains?.find((c) => c.chain === 'audit_logs');
    expect(ledger, 'no audit_logs chain verdict in the export').toBeDefined();
    expect(['INTACT', 'BROKEN', 'EMPTY', 'NOT_VERIFIED']).toContain(ledger!.verdict);
  });

  it("walks each of D's report seal chains with the report engine's own link check, and names the event where a link breaks", async () => {
    expect(exportD.integrity?.chains?.find((c) => c.chain === 'report_seal_events')?.verdict).toBe('INTACT');
    const sealRow = seeders.get(ORG_D)!.rows.find((r) => r.table === 'public.report_seal_events')!;
    const { exportIntegrity } = await import('../../server/services/tenant-export/held-record-integrity');
    const ledger = async () => ({ ok: true, rowsChecked: 0 });
    const c = await owner.connect();
    try {
      // Read in a transaction that is rolled back: D's held counts are attested below.
      await c.query('BEGIN');
      const { rows: [first] } = await c.query('SELECT report_id, chain_hash FROM report_seal_events WHERE id = $1', [sealRow.key.id]);
      const add = async (previous: string | null) => (await c.query(
        `INSERT INTO report_seal_events (report_id, organization_id, event_type, chain_hash, previous_event_hash, created_at)
         VALUES ($1, $2, 'obc-link', md5(random()::text), $3, now() + interval '1 day') RETURNING id, chain_hash`,
        [first.report_id, ORG_D, previous])).rows[0];
      const linked = await add(first.chain_hash);
      const seals = async () => (await exportIntegrity(c, ORG_D, ledger)).chains.find((x) => x.chain === 'report_seal_events')!;
      expect((await seals()).verdict, 'a second event linked to the first').toBe('INTACT');
      expect(linked.id).toBeGreaterThan(Number(sealRow.key.id));
      const unlinked = await add('not-the-prior-chain-hash');
      const broken = await seals();
      expect(broken.verdict).toBe('BROKEN');
      expect(broken.reports?.find((r) => r.reportId === first.report_id)?.brokenAtEventId).toBe(unlinked.id);
    } finally {
      await c.query('ROLLBACK').catch(() => undefined);
      c.release();
    }
  });

  it("carries each of D's signatures with its manifest and the §11.200 hash verdict, and none of E's", () => {
    const listed = new Map((exportD.integrity?.signatures ?? []).map((s) => [s.id, s]));
    for (const s of signatures.get(ORG_D)!) {
      const entry = listed.get(s.id);
      expect(entry, `signature ${s.id} is not in the export's integrity section`).toBeDefined();
      expect(entry!.manifest).toBeTruthy();
      expect(entry!.hashIntegrity).toBe(s.verified ? 'VERIFIED' : 'COMPROMISED');
      expect(entry!.manifestSha256 === entry!.signatureHash).toBe(s.verified);
    }
    for (const s of signatures.get(ORG_E)!) expect(listed.has(s.id), `E's signature ${s.id} in D's export`).toBe(false);
  });
});

/**
 * P-58's data return (2026-10-29): read as the route read until then, in the
 * platform scope, the export misses D's Vault documents and knowledge graph and
 * fails nothing, so it records no receipt; and a receipt recorded before the
 * receipt stated its scope opens neither custody, the purge nor the doors.
 * Run while D is pending deletion and before its custody is signed.
 */
async function oldWayExportOpensNothing(): Promise<void> {
  const { pool: runtime } = await import('../../server/db');
  const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
  const { companyExportSnapshot } = await import('../../server/services/tenant-export/company-export-snapshot');
  const { digestOf, exportTenantFull, recordExportReceipt } = await import('../../server/services/tenant-export/tenant-full-export.service');
  const old = await runWithSystemTenantScope(CALLER, () => companyExportSnapshot(runtime, ORG_D, (c) => exportTenantFull(c, ORG_D)));
  expect(old.coverage.scope?.kind).toBe('restricted');
  expect(old.coverage.tablesFailed).toEqual([]);
  expect(old.tables.find((x) => qualified(x.table) === 'vault.documents')?.rows ?? [], 'the platform scope returned D\'s Vault documents').toEqual([]);
  const recorded = await runWithSystemTenantScope(CALLER, () => recordExportReceipt(runtime, {
    organizationId: ORG_D, digest: digestOf(old), tableCount: old.coverage.tablesExported, rowCount: old.coverage.totalRows,
    createdBy: people.adminD.id, coverage: old.coverage,
  }));
  expect(recorded).toMatchObject({ recorded: false, incomplete: { scope: 'restricted' } });
  // A receipt recorded before the receipt stated its scope (export_scope NULL).
  const legacy = `sha256:${'0'.repeat(63)}1`;
  await owner.query(
    'INSERT INTO tenant_export_receipts (organization_id, digest, table_count, row_count, created_by) VALUES ($1, $2, 1, 1, NULL)', [ORG_D, legacy]);
  try {
    const res = await request(await stack()).get(`/api/tenant-export/custody?digest=${encodeURIComponent(legacy)}`).set(auth(people.adminD));
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error?.code).toBe('CUSTODY_EXPORT_SCOPE_UNVERIFIED');
    expect((await refusal(purge(ORG_D, legacy)))?.code).toBe('EXPORT_SCOPE_UNVERIFIED');
    // And the database: custody signed on such a receipt does not open the doors.
    await signCustody(owner, ORG_D, people.adminD.id, legacy);
    const opened = (await owner.query('SELECT public.tenant_export_custody_signed($1) AS ok', [ORG_D])).rows[0].ok;
    expect(opened, 'the doors accept custody of an export with no scope').toBe(false);
    expect(await statusOf(ORG_D)).toBe('pending_deletion');
  } finally {
    await forgetOffboardingCertificate(owner, ORG_D);
    await owner.query('DELETE FROM tenant_export_receipts WHERE organization_id = $1 AND digest = $2', [ORG_D, legacy]);
  }
}

describe('2. custody is a signed act', () => {
  const REASON = 'We received the export and hold it under our own retention.';
  let draft: { attestation: Record<string, any>; attestationSha256: string };
  let backdated: SeededRow;

  beforeAll(async () => {
    // D asked to leave: pending deletion, its window closed.
    await owner.query(
      `UPDATE organizations SET status = 'pending_deletion', deletion_requested_at = now() - interval '40 days',
         deletion_requested_by = $2, deletion_reason = 'obc', purge_eligible_at = now() - interval '1 day' WHERE id = $1`,
      [ORG_D, people.adminD.id]);
    // A one-year period, set with its rule, and one held record from three years ago: it is held and
    // exported, but past the period, so the attestation does not list it as a record to keep.
    await owner.query(
      `INSERT INTO organization_retention_settings (organization_id, retention_years, reason, governing_rule, set_by)
       VALUES ($1, 1, 'Short-lived pilot records, kept for the sponsor''s own period.', '21 CFR 312.62(c)', $2)`,
      [ORG_D, people.adminD.id]);
    backdated = seeders.get(ORG_D)!.rows.find((r) => r.table === 'public.account_canon_resolution_log')!;
    await owner.query(`UPDATE account_canon_resolution_log SET created_at = now() - interval '3 years' WHERE id = $1`, [backdated.key.id]);
  }, 120_000);

  it('the purge of a tenant holding a held record is refused without it, and nothing is touched', async () => {
    const failure = await refusal(purge(ORG_D, exportD.digest));
    expect(failure?.code).toBe('CUSTODY_ATTESTATION_REQUIRED');
    expect(await statusOf(ORG_D)).toBe('pending_deletion');
  }, 120_000);

  it('an export made the old way, in the platform scope, records no receipt, and a receipt from before opens neither custody nor the purge',
    oldWayExportOpensNothing, 120_000);

  it("D's administrator reads what they will sign: every held record, and those inside the retention period", async () => {
    const res = await request(await stack()).get(`/api/tenant-export/custody?digest=${encodeURIComponent(exportD.digest)}`).set(auth(people.adminD));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    draft = res.body;
    const a = draft.attestation;
    expect(a.exportDigest).toBe(exportD.digest);
    expect(a.exportScope, 'custody names an export read in the organization\'s own scope').toBe('organization');
    expect(a.organizationId).toBe(ORG_D);
    expect(a.retention).toMatchObject({ years: 1, isDefault: false, governingRule: '21 CFR 312.62(c)' });
    for (const t of ALL_HELD) expect(a.heldRecords[t], t).toBeGreaterThan(0);
    const listed = new Map((a.withinRetention as Array<{ table: string; ids: unknown[] }>).map((x) => [x.table, x]));
    expect(listed.has('account_canon_resolution_log'), 'a record past the period is listed as one to keep').toBe(false);
    expect(listed.has('electronic_signatures')).toBe(true);
    expect(a.withinRetentionTotal).toBe(a.heldRecordTotal - 1);
    expect(a.statement).toMatch(/accepts the obligation to retain them/);
    expect(draft.attestationSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('nobody else signs it: a member, the other tenant, a digest that is not this tenant\'s, a changed attestation', async () => {
    const app = await stack();
    const body = { digest: exportD.digest, attestationSha256: draft.attestationSha256, reason: REASON, meaning: 'responsibility', password: PASSWORD };
    const member = await request(app).post('/api/tenant-export/custody').set(auth(people.memberD)).send(body);
    expect(member.status, JSON.stringify(member.body)).toBe(403);
    // E is not leaving: the custody act is signed only from an organization pending deletion, so E's
    // administrator has no authority for it at all (the gate refuses before the password).
    const other = await request(app).post('/api/tenant-export/custody').set(auth(people.adminE)).send(body);
    expect(other.status, JSON.stringify(other.body)).toBe(403);
    expect(other.body.error.code).toBe('ESIGNATURE_NO_AUTHORITY');
    const wrong = await request(app).post('/api/tenant-export/custody').set(auth(people.adminD)).send({ ...body, digest: `sha256:${'0'.repeat(64)}` });
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(404);
    const changed = await request(app).post('/api/tenant-export/custody').set(auth(people.adminD)).send({ ...body, attestationSha256: 'f'.repeat(64) });
    expect(changed.status, JSON.stringify(changed.body)).toBe(409);
    expect(changed.body.error.code).toBe('CUSTODY_ATTESTATION_CHANGED');
    const unsigned = await owner.query(`SELECT count(*)::int AS n FROM electronic_signatures WHERE signed_target LIKE 'tenant-export-custody:%' AND organization_id = ANY($1::int[])`, [[ORG_D, ORG_E]]);
    expect(unsigned.rows[0].n).toBe(0);
  });

  it("D's administrator signs custody through the ceremony: one signature on the export's digest, its manifest the attestation", async () => {
    const res = await request(await stack()).post('/api/tenant-export/custody').set(auth(people.adminD)).send({
      digest: exportD.digest, attestationSha256: draft.attestationSha256, reason: REASON, meaning: 'responsibility', password: PASSWORD,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { rows } = await owner.query(
      `SELECT id, signer_id, signature_meaning, signature_type, signed_target, signature_hash, signature_manifest FROM electronic_signatures
        WHERE organization_id = $1 AND signed_target = $2`, [ORG_D, `tenant-export-custody:${exportD.digest}`]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ signer_id: people.adminD.id, signature_meaning: 'responsibility', signature_type: 'governed-action' });
    expect(Number(res.body.signatureId)).toBe(Number(rows[0].id));
    const { manifestSignatureHash } = await import('../../server/services/part11/signature-persistence');
    expect(manifestSignatureHash(rows[0].signature_manifest)).toBe(rows[0].signature_hash);
    expect(rows[0].signature_manifest.act).toMatchObject({ exportDigest: exportD.digest, heldRecordTotal: draft.attestation.heldRecordTotal });
  });

  it("with custody signed, the purge's custody check passes on that receipt and no other", async () => {
    const { custodyForPurge } = await import('../../server/services/tenant/offboarding-custody');
    const passed = await custodyForPurge(owner, ORG_D, exportD.digest);
    expect(passed.refusal).toBeUndefined();
    expect(passed.signature?.signerId).toBe(people.adminD.id);
    const other = await custodyForPurge(owner, ORG_D, `sha256:${'1'.repeat(64)}`);
    expect(other.refusal?.code).toBe('CUSTODY_ATTESTATION_REQUIRED');
  });

  it('a held record added after custody was signed makes it stale, and the purge is refused', async () => {
    const { custodyForPurge } = await import('../../server/services/tenant/offboarding-custody');
    const added = await owner.query(
      `INSERT INTO account_events (event_id, organization_id, event_type) VALUES ($1, $2, 'obc.after-custody') RETURNING id`,
      [`obc-after-${Date.now()}`, ORG_D]);
    try {
      expect((await custodyForPurge(owner, ORG_D, exportD.digest)).refusal?.code).toBe('CUSTODY_ATTESTATION_STALE');
      const failure = await refusal(purge(ORG_D, exportD.digest));
      expect(failure?.code).toBe('CUSTODY_ATTESTATION_STALE');
      expect(await statusOf(ORG_D)).toBe('pending_deletion');
    } finally {
      await owner.query('DELETE FROM account_events WHERE id = $1', [added.rows[0].id]);
    }
  }, 120_000);
});

describe('2b. the doors hold the database to it, and the runtime role has no way around them', () => {
  /** A statement as the runtime role in the platform scope, rolled back. */
  async function asPlatform(sql: string, params: unknown[] = []) {
    const { Pool } = await import('pg');
    const runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 1 });
    const c = await runtime.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.current_tenant_id','0',true), set_config('app.current_user_role','app_super_admin',true),
                            set_config('app.rls_enforce','on',true)`);
      return await c.query(sql, params);
    } finally {
      await c.query('ROLLBACK').catch(() => undefined);
      c.release();
      await runtime.end();
    }
  }

  it("each door refuses the other tenant's held records without custody, in the platform scope", async () => {
    await owner.query(`UPDATE organizations SET status = 'pending_deletion' WHERE id = $1`, [ORG_E]);
    try {
      for (const door of ['purge_tenant_signed_records', 'purge_tenant_lineage_records', 'purge_tenant_ivdr_histories', 'purge_tenant_reg_questions', 'purge_tenant_review_routes']) {
        await expect(asPlatform(`SELECT * FROM public.${door}($1)`, [ORG_E]), door).rejects.toThrow(/CUSTODY_ATTESTATION_REQUIRED/);
      }
    } finally {
      await owner.query(`UPDATE organizations SET status = 'active' WHERE id = $1`, [ORG_E]);
    }
  });

  it('the runtime role cannot delete a held record itself, nor become the doors\' role', async () => {
    const sig = signatures.get(ORG_E)![0].id;
    await expect(asPlatform('DELETE FROM electronic_signatures WHERE id = $1', [sig])).rejects.toThrow(/permission denied|IMMUTABILITY_VIOLATION/);
    await expect(asPlatform('DELETE FROM reg_questions WHERE organization_id = $1', [ORG_E])).rejects.toThrow(/permission denied|read-only/);
    await expect(asPlatform('SET ROLE tenant_record_purger')).rejects.toThrow(/permission denied/);
    await expect(asPlatform("SELECT set_config('role', 'tenant_record_purger', true)")).rejects.toThrow(/permission denied/);
  });
});

describe('3 and 4. the purge erases the held records and keeps one certificate', () => {
  let result: Awaited<ReturnType<typeof purge>> | null = null;
  let failure: { code?: string; message?: string } | null = null;

  beforeAll(async () => {
    failure = await refusal(purge(ORG_D, exportD.digest).then((r) => { result = r; }));
  }, 300_000);

  it('purges D', async () => {
    expect(failure, `${failure?.code} ${failure?.message}`).toBeNull();
    expect(result!.status).toBe('purged');
    expect(await statusOf(ORG_D)).toBe('purged');
  });

  it('writes one certificate: the digest, the counts, the custody signature, the purge; no customer content', async () => {
    const { rows } = await owner.query('SELECT * FROM tenant_offboarding_certificates WHERE organization_id = $1', [ORG_D]);
    expect(rows).toHaveLength(1);
    const c = rows[0];
    const custody = (await owner.query(
      'SELECT id FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2', [ORG_D, `tenant-export-custody:${exportD.digest}`])).rows[0];
    expect(custody, 'the custody signature did not survive the purge').toBeDefined();
    expect(c).toMatchObject({ export_digest: exportD.digest, custody_signature_id: Number(custody.id), purged_by: people.adminD.id });
    expect(new Date(c.purged_at).getTime()).toBe(new Date((await owner.query('SELECT purged_at FROM organizations WHERE id = $1', [ORG_D])).rows[0].purged_at).getTime());
    for (const t of ALL_HELD) expect(c.held_records[t], `held ${t}`).toBeGreaterThan(0);
    expect(c.held_record_total).toBe(Object.values(c.held_records as Record<string, number>).reduce((n, x) => n + x, 0));
    expect(c.deleted_rows.document_audit_trail).toBeGreaterThan(0);
    expect(c.certificate_sha256).toMatch(/^[0-9a-f]{64}$/);
    // Counts, identifiers and hashes only: every value is a number, an id, a digest or a time.
    const text = JSON.stringify(c);
    expect(text).not.toMatch(/obc-custody|Custody adminD|obc@example|example\.invalid/);
  });

  it('the certificate is a platform record: it cannot be changed or removed', async () => {
    await expect(owner.query('UPDATE tenant_offboarding_certificates SET held_record_total = 0 WHERE organization_id = $1', [ORG_D]))
      .rejects.toThrow(/OFFBOARDING_CERTIFICATE_IMMUTABLE/);
    await expect(owner.query('DELETE FROM tenant_offboarding_certificates WHERE organization_id = $1', [ORG_D]))
      .rejects.toThrow(/OFFBOARDING_CERTIFICATE_IMMUTABLE/);
  });

  it('the database refuses a certificate of an export whose receipt states no scope', async () => {
    // P-58's data return: a receipt recorded before the receipt stated its scope (export_scope NULL)
    // may name an export that held none of D's Vault documents; no certificate may rest on it.
    const legacy = `sha256:${'0'.repeat(63)}2`;
    await owner.query(
      'INSERT INTO tenant_export_receipts (organization_id, digest, table_count, row_count, created_by) VALUES ($1, $2, 1, 1, NULL)', [ORG_D, legacy]);
    try {
      await expect(owner.query(
        `INSERT INTO tenant_offboarding_certificates (organization_id, export_digest, export_table_count, export_row_count, deleted_rows,
           held_records, held_record_total, custody_signature_id, purged_by, purged_at, certificate_sha256)
         SELECT organization_id, $2, 1, 1, deleted_rows, '{}'::jsonb, 0, NULL, purged_by, purged_at, certificate_sha256
           FROM tenant_offboarding_certificates WHERE organization_id = $1`, [ORG_D, legacy]))
        .rejects.toThrow(/OFFBOARDING_CERTIFICATE_REFUSED: the export .* states no complete scope/);
    } finally {
      await owner.query('DELETE FROM tenant_export_receipts WHERE organization_id = $1 AND digest = $2', [ORG_D, legacy]);
    }
  });

  it("D's row of every held table is gone, and E keeps every one of its rows", async () => {
    const { stillThere } = await import('./tenant-purge-row-seeder');
    // The held tables, and the tables only D's own scope returned (the export holds them, so the purge erases them).
    const held = new Set([...ALL_HELD.map(qualified), ...OWN_SCOPE_ONLY]);
    const kept: string[] = [];
    const lost: string[] = [];
    for (const org of [ORG_D, ORG_E]) {
      for (const r of seeders.get(org)!.rows) {
        const there = await stillThere(owner, r);
        if (org === ORG_D && (held.has(r.table) || r === routeTasks.get(org)) && there) kept.push(r.table);
        if (org === ORG_E && !there) lost.push(r.table);
      }
    }
    expect(lost, "E's rows the purge of D took").toEqual([]);
    expect([...new Set(kept)], "D's held rows the purge left").toEqual([]);
  });
});
