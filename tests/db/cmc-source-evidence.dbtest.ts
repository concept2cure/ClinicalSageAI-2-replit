/**
 * CMC source evidence: the Vault document a CMC record was taken from
 * (row D2; discovery map 2026-10-04, no-data-room-to-cmc-source-path).
 *
 * No CMC record could cite a document: a batch's results were typed into the
 * register and composed into §3.2.P.5.4 while the certificate of analysis they
 * came from sat in the same program's Vault with nothing between them, and a
 * reissued certificate left the approved section reading current. Here, on
 * PostgreSQL as the runtime role with RLS on, through the real Vault ingest and
 * the real routes:
 *
 *   - a person links a record to a current Vault version of the program, with
 *     a reason, and the section's records list it with who linked it and why;
 *   - no reason, a superseded version, another program's or organisation's
 *     document, an unknown record, a duplicate, a viewer and another
 *     organisation's project are refused;
 *   - when a later version supersedes the linked one, the record says so, and
 *     the export gate and readiness hold the approved section that read it;
 *   - linking the later version moves the link, with the same reason, and the
 *     hold lifts; a withdrawn version is named as withdrawn;
 *   - removing a link requires a reason, keeps the row, and cannot be done twice;
 *   - every link and unlink is a chained row on the Vault document's history;
 *   - the table refuses every other change, DELETE and TRUNCATE, for every
 *     role, and another organisation reads none of it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-cse ';
const CODE = 'DBTEST-CSE';
const SECTION = '3.2.P.5.4';
const REASON = 'Values transcribed from the CDMO certificate of analysis.';

type Tenant = { orgId: number; orgUuid: string; programId: string; otherProgramId: string };
type Outcome = { ok: true; rows: Array<Record<string, unknown>> } | { ok: false; message: string };
let owner: Pool;
let userId: number;
let mine: Tenant;
let theirs: Tenant;
const ids = { coaV1: '', coaV2: '', report: '', elsewhere: '', theirDoc: '' };

async function appFor(t: Tenant, role = 'admin'): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const evidenceRoutes = (await import('../../server/api/cmc/sourceEvidenceRoutes')).default;
  const module3Routes = (await import('../../server/api/cmc/module3OperatingSystemRoutes')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, {
      userId, tenantId: t.orgId, userRole: role,
      user: { id: userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role },
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  a.use('/api/cmc/module3-os', evidenceRoutes);
  a.use('/api/cmc/module3-os', module3Routes);
  return a;
}

async function ingest(t: Tenant, text: string, fields: Record<string, string>, programId = t.programId): Promise<string> {
  let r = request(await appFor(t)).post('/api/vault/ingest').field('programId', programId).field('documentType', 'OTHER');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  const res = await r.attach('file', Buffer.from(text, 'utf8'), { filename: 'record.txt', contentType: 'text/plain' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body.document.id);
}

const base = (t: Tenant, programId = t.programId) => `/api/cmc/module3-os/source-evidence/${programId}`;
const link = async (t: Tenant, body: Record<string, unknown>, role = 'admin', programId = t.programId) =>
  request(await appFor(t, role)).post(base(t, programId)).send(body);
const unlink = async (t: Tenant, linkId: string, body: Record<string, unknown>) =>
  request(await appFor(t)).post(`${base(t)}/${linkId}/unlink`).send(body);
const sectionRecords = async (t: Tenant) => {
  const res = await request(await appFor(t)).get(`${base(t)}?sectionKey=${SECTION}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data as Array<{ sourceKey: string; label: string; evidence: Array<Record<string, unknown>> }>;
};
const batchEvidence = async (t: Tenant) => (await sectionRecords(t)).find((s) => s.sourceKey === 'batch:1')!.evidence;
const historyEvents = async (t: Tenant, doc: string): Promise<string[]> => {
  const h = await request(await appFor(t)).get(`/api/c2c/project-vault/${t.programId}/documents/${doc}/history`);
  expect(h.status).toBe(200);
  return h.body.data.entries.map((e: { event: string }) => e.event);
};

async function asRuntime(sql: string, params: unknown[], scope: Tenant): Promise<Outcome> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { pool } = await import('../../server/db');
  return runWithTenantScope(
    { tenantId: String(scope.orgId), orgUuid: scope.orgUuid, role: 'admin', source: 'request', caller: 'tests/db/cmc-source-evidence.dbtest.ts' },
    async (): Promise<Outcome> => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const r = await client.query(sql, params);
        await client.query('COMMIT');
        return { ok: true, rows: r.rows };
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      } finally {
        client.release();
      }
    },
  );
}

const refused = (r: Outcome) => {
  expect(r.ok, 'the change was applied').toBe(false);
  if (!r.ok) expect(r.message).toMatch(/IMMUTABILITY_VIOLATION/);
};

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = 'active' RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-cse-${slug}`],
  );
  const program = async (suffix: string, name: string) => (await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Evidra 10 mg tablets') RETURNING id`,
    [`${PROBE}${slug} ${name}`, `${CODE}-${slug.toUpperCase()}${suffix}`, org.rows[0].id],
  )).rows[0].id;
  return {
    orgId: Number(org.rows[0].id),
    orgUuid: String(org.rows[0].uuid),
    programId: String(await program('', 'program')),
    otherProgramId: String(await program('-B', 'second program')),
  };
}

/** batch:1 and stability:2 recorded, then §3.2.P.5.4 compiled from batch:1 and approved. */
async function recordAndApprove(t: Tenant): Promise<void> {
  const src = async (type: string, key: string, payload: Record<string, unknown>) => (await owner.query(
    `INSERT INTO cmc_source_objects (organization_id, project_id, source_type, source_key, source_payload, source_hash)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
    [t.orgId, t.programId, type, key, JSON.stringify(payload), `hash-${key}`],
  )).rows[0].id as string;
  const batch = await src('batch', 'batch:1', { batchNumber: 'DP-001', releaseTesting: [{ test: 'Assay', result: '99.1%' }] });
  await src('stability', 'stability:2', { studyName: 'DP long-term 25C/60%RH' });
  const section = await owner.query(
    `INSERT INTO cmc_module3_sections
       (organization_id, project_id, section_key, section_path, deterministic_json, narrative_text, compiled_hash, approval_state)
     VALUES ($1, $2, $3, $3, $4::jsonb, 'Batch analyses.', 'compiled', 'approved') RETURNING id`,
    [t.orgId, t.programId, SECTION, JSON.stringify({ completeness: 100, missingInputs: [], tables: [] })],
  );
  await owner.query(
    `INSERT INTO cmc_section_lineage (organization_id, section_id, source_object_id, source_hash_at_compile)
     VALUES ($1, $2, $3, 'hash-batch:1')`,
    [t.orgId, section.rows[0].id, batch],
  );
}

async function cleanup(): Promise<void> {
  const orgs = `(SELECT id FROM organizations WHERE slug LIKE 'dbtest-cse-%')`;
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(`DELETE FROM audit_logs WHERE tenant_id IN ${orgs}`);
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  // The links go with their versions, by the purge's own cascade: the one
  // DELETE the table's guard admits.
  await owner.query(`DELETE FROM cmc_section_lineage WHERE organization_id IN ${orgs}`);
  await owner.query(`DELETE FROM cmc_module3_sections WHERE organization_id IN ${orgs}`);
  await owner.query(`DELETE FROM cmc_source_objects WHERE organization_id IN ${orgs}`);
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1 AND supersedes_id IS NOT NULL', [`${CODE}%`]);
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ('dbtest-cse@example.test', 'Cora Evidence', 'not-a-real-hash')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  userId = Number(user.rows[0].id);
  await cleanup();
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  ids.coaV1 = await ingest(mine, 'Certificate of analysis DP-001. Assay 99.1%.', { documentCode: `${CODE}-COA`, documentTitle: 'CoA DP-001' });
  ids.report = await ingest(mine, 'Stability report, 6 months.', { documentCode: `${CODE}-STAB`, documentTitle: 'Stability report' });
  ids.elsewhere = await ingest(mine, 'A certificate of another program.', { documentCode: `${CODE}-ELSE`, documentTitle: 'Other CoA' }, mine.otherProgramId);
  ids.theirDoc = await ingest(theirs, 'Their certificate.', { documentCode: `${CODE}-THEIRS`, documentTitle: 'Their CoA' });
  await recordAndApprove(mine);
}, 120_000);

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner.end().catch(() => {});
  for (const t of [mine, theirs]) {
    if (t) await fs.rm(path.resolve(process.cwd(), 'storage', 'vault', String(t.orgId)), { recursive: true, force: true }).catch(() => {});
  }
});

let v1Link = '';
let v2Link = '';

describe('a CMC record cites the Vault document it was taken from', () => {
  it('links a record to a current version, and the section lists it with who and why', async () => {
    const res = await link(mine, { sourceKey: 'batch:1', documentId: ids.coaV1, reason: REASON });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    v1Link = res.body.data.id;
    expect(res.body.data.moved).toEqual([]);

    const records = await sectionRecords(mine);
    expect(records.map((r) => r.sourceKey)).toEqual(expect.arrayContaining(['batch:1']));
    const batch = records.find((r) => r.sourceKey === 'batch:1')!;
    expect(batch.label).toBe('batch DP-001');
    expect(batch.evidence).toEqual([expect.objectContaining({
      id: v1Link, documentId: ids.coaV1, title: 'CoA DP-001', version: '1.0', state: 'current',
      currentVersion: null, reason: REASON, linkedBy: 'Cora Evidence',
    })]);
    expect(String(batch.evidence[0].contentHash)).toMatch(/^[0-9a-f]{64}$/);

    // The Vault names the use from its side: the version lists the record and
    // the Module 3 section that read it.
    const versions = await request(await appFor(mine)).get(`/api/c2c/project-vault/${mine.programId}/documents/${ids.coaV1}/versions`);
    expect(versions.status).toBe(200);
    expect(versions.body.data.versions[0].cmcEvidence).toEqual([
      { linkId: v1Link, sourceType: 'batch', sourceKey: 'batch:1', sections: [SECTION] },
    ]);
  });

  it('refuses no reason, an unknown record, another program’s or organisation’s document, and a duplicate', async () => {
    const noReason = await link(mine, { sourceKey: 'batch:1', documentId: ids.report, reason: ' ' });
    expect(noReason.status).toBe(422);
    expect(noReason.body.error).toBe('REASON_REQUIRED');
    const unknown = await link(mine, { sourceKey: 'batch:999', documentId: ids.report, reason: REASON });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe('SOURCE_NOT_FOUND');
    for (const doc of [ids.elsewhere, ids.theirDoc]) {
      const r = await link(mine, { sourceKey: 'batch:1', documentId: doc, reason: REASON });
      expect(r.status).toBe(404);
      expect(r.body.error).toBe('DOCUMENT_NOT_FOUND');
    }
    const dup = await link(mine, { sourceKey: 'batch:1', documentId: ids.coaV1, reason: REASON });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('ALREADY_LINKED');
  });

  it('refuses a viewer, and another organisation’s project before anything is read', async () => {
    const viewer = await link(mine, { sourceKey: 'batch:1', documentId: ids.report, reason: REASON }, 'viewer');
    expect(viewer.status).toBe(403);
    const foreign = await link(mine, { sourceKey: 'batch:1', documentId: ids.theirDoc, reason: REASON }, 'admin', theirs.programId);
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe('PROJECT_NOT_FOUND');
    const read = await request(await appFor(mine)).get(base(mine, theirs.programId));
    expect(read.status).toBe(404);
  });

  it('holds nothing while the linked version is current', async () => {
    const res = await request(await appFor(mine)).get(`/api/cmc/module3-os/readiness/${mine.programId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.supersededEvidenceSections).toEqual([]);
  });
});

describe('a reissued document holds the sections that read the record', () => {
  it('names the record’s version as superseded once a later version is filed', async () => {
    ids.coaV2 = await ingest(mine, 'Certificate of analysis DP-001, reissued. Assay 99.1%.', {
      supersedesDocumentId: ids.coaV1, documentTitle: 'CoA DP-001',
    });
    const [e] = await batchEvidence(mine);
    expect(e).toEqual(expect.objectContaining({ id: v1Link, state: 'superseded', version: '1.0' }));
    expect(e.currentVersion).toBeTruthy();
  });

  it('the export gate refuses the approved section and says which record and document', async () => {
    const gate = await request(await appFor(mine)).post(`/api/cmc/module3-os/guard/final-export/${mine.programId}`).send({});
    expect(gate.status).toBe(409);
    expect(gate.body.error).toMatch(/superseded or withdrawn/);
    expect(gate.body.error).toContain('batch:1');
    expect(gate.body.error).toContain('CoA DP-001');
    expect(gate.body.data.supersededEvidenceSections).toEqual([
      { sectionKey: SECTION, reasons: [expect.stringMatching(/^batch:1 was taken from "CoA DP-001" version 1\.0, which version .+ has superseded$/)] },
    ]);
    const ready = await request(await appFor(mine)).get(`/api/cmc/module3-os/readiness/${mine.programId}`);
    expect(ready.body.data.exportReady).toBe(false);
    expect(ready.body.data.supersededEvidenceSections).toHaveLength(1);
    expect(ready.body.data.blockedBecause).toBe(gate.body.error);
  });

  it('refuses a link to the superseded version', async () => {
    const res = await link(mine, { sourceKey: 'stability:2', documentId: ids.coaV1, reason: REASON });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('DOCUMENT_SUPERSEDED');
  });

  it('linking the current version moves the link with the same reason, and the hold lifts', async () => {
    const reverified = 'Re-verified DP-001 against the reissued certificate: values unchanged.';
    const res = await link(mine, { sourceKey: 'batch:1', documentId: ids.coaV2, reason: reverified });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    v2Link = res.body.data.id;
    expect(res.body.data.moved).toEqual([v1Link]);
    expect(await batchEvidence(mine)).toEqual([expect.objectContaining({ id: v2Link, documentId: ids.coaV2, state: 'current' })]);
    const closed = await owner.query('SELECT unlink_reason, unlinked_by FROM cmc_source_evidence WHERE id = $1', [v1Link]);
    expect(closed.rows[0]).toEqual({ unlink_reason: reverified, unlinked_by: userId });
    const ready = await request(await appFor(mine)).get(`/api/cmc/module3-os/readiness/${mine.programId}`);
    expect(ready.body.data.supersededEvidenceSections).toEqual([]);
  });

  it('names a withdrawn version as withdrawn', async () => {
    const res = await link(mine, { sourceKey: 'stability:2', documentId: ids.report, reason: 'Stability data taken from the 6-month report.' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await owner.query('UPDATE vault.documents SET deleted_at = now() WHERE id = $1', [ids.report]);
    const all = await request(await appFor(mine)).get(base(mine));
    const stab = (all.body.data as Array<{ sourceKey: string; evidence: Array<{ state: string }> }>).find((s) => s.sourceKey === 'stability:2')!;
    expect(stab.evidence.map((e) => e.state)).toEqual(['withdrawn']);
  });
});

describe('removing a link, and the record it leaves', () => {
  it('requires a reason, keeps the row, and cannot be done twice', async () => {
    const none = await unlink(mine, v2Link, {});
    expect(none.status).toBe(422);
    const ok = await unlink(mine, v2Link, { reason: 'Linked to the wrong batch record.' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const again = await unlink(mine, v2Link, { reason: 'Linked to the wrong batch record.' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('ALREADY_UNLINKED');
    expect(await batchEvidence(mine)).toEqual([]);
    const kept = await owner.query('SELECT count(*)::int AS n FROM cmc_source_evidence WHERE source_key = $1 AND organization_id = $2', ['batch:1', mine.orgId]);
    expect(kept.rows[0].n).toBe(2);
  });

  it('each link and unlink is a chained row on the document’s own history', async () => {
    // One family, so each version's history is the family's.
    const events = await historyEvents(mine, ids.coaV1);
    expect(events.filter((e) => /evidence for CMC record/.test(e))).toEqual([
      'No longer evidence for CMC record batch:1',
      'Linked as evidence for CMC record batch:1',
      expect.stringMatching(/^No longer evidence for CMC record batch:1: moved to version /),
      'Linked as evidence for CMC record batch:1',
    ]);
    expect(await historyEvents(mine, ids.coaV2)).toEqual(events);
  });

  it('the table refuses every other change, for every role, and another organisation reads none of it', async () => {
    refused(await asRuntime('UPDATE cmc_source_evidence SET reason = $2 WHERE id = $1', [v1Link, 'rewritten'], mine));
    refused(await asRuntime('UPDATE cmc_source_evidence SET unlink_reason = $2 WHERE id = $1', [v1Link, 'rewritten'], mine));
    refused(await asRuntime('DELETE FROM cmc_source_evidence WHERE id = $1', [v1Link], mine));
    // The runtime role never holds TRUNCATE (provision-app-role grants SELECT,
    // INSERT, UPDATE, DELETE), so PostgreSQL refuses it before the trigger runs.
    const truncate = await asRuntime('TRUNCATE cmc_source_evidence', [], mine);
    expect(truncate.ok, 'the table was truncated').toBe(false);
    if (!truncate.ok) expect(truncate.message).toMatch(/permission denied|IMMUTABILITY_VIOLATION/);
    const asOwner = await owner.query('UPDATE cmc_source_evidence SET reason = $2 WHERE id = $1', [v1Link, 'rewritten']).then(
      () => ({ ok: true as const, rows: [] }),
      (e: Error) => ({ ok: false as const, message: e.message }),
    );
    refused(asOwner);
    const other = await asRuntime('SELECT id FROM cmc_source_evidence', [], theirs);
    expect(other).toEqual({ ok: true, rows: [] });
  });
});
