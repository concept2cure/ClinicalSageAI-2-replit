/** Actual SQL against canonical disposition preview/apply and migration guards.
 * PGlite is in-memory; ordered queries are not independent-connection proof.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DocumentDispositionChoice } from '../../../../shared/document-data-disposition';
import {
  createDispositionHarness, insertCapturedSuccessor, insertVaultSuccessor,
  type DispositionFixture, type DispositionHarness,
} from '../../document-data-disposition/__tests__/disposition-fixture';

const connection = vi.hoisted(() => ({
  query: null as null | ((sql: string, params?: unknown[]) => Promise<{ rows: any[] }>),
  transaction: vi.fn(),
  audit: vi.fn(),
  trace: [] as string[],
  failLock: false,
  failAudit: false,
}));
vi.mock('../../../db.js', () => ({
  pool: { query: (sql: string, params?: unknown[]) => connection.query!(sql, params) },
  transaction: (...args: unknown[]) => connection.transaction(...args),
}));
vi.mock('../../auditService.js', () => ({
  writeChainedAuditRow: (...args: unknown[]) => connection.audit(...args),
}));

import {
  findEvidenceDrift, linkSourceEvidence, listLinkableDocuments,
  listSourceEvidence, unlinkSourceEvidence,
} from '../source-evidence';

let harness: DispositionHarness;
const CHOICES: DocumentDispositionChoice[] = ['keep_data', 'remove_data', 'supersede'];
const SOURCE_KEY = 'batch:withdrawal-control';
const SECTION = '3.2.P.5.4';
const REASON = 'A person verified the batch against this certificate.';

beforeAll(async () => {
  harness = await createDispositionHarness();
  connection.query = harness.db.query;
  // TEST-ONLY schema parity additions to the shared disposition harness. They
  // support real CMC/version SQL; no guard, eligibility or tenant check is bypassed.
  await harness.pg.exec(`
    ALTER TABLE vault.documents ADD COLUMN title text, ADD COLUMN file_name text,
      ADD COLUMN filename text, ADD COLUMN version text DEFAULT '1.0',
      ADD COLUMN document_code text DEFAULT 'COA-01', ADD COLUMN ctd_section text,
      ADD COLUMN document_type text, ADD COLUMN created_at timestamptz DEFAULT now(),
      ADD COLUMN created_by integer DEFAULT 42, ADD COLUMN file_size integer;
    ALTER TABLE vault.document_catalog ADD COLUMN document_kind text;
    ALTER TABLE cmc_source_evidence ADD COLUMN source_type text NOT NULL DEFAULT 'batch_record',
      ADD COLUMN source_key text NOT NULL DEFAULT 'fixture', ADD COLUMN content_hash_at_link text NOT NULL DEFAULT '',
      ADD COLUMN version_at_link text, ADD COLUMN title_at_link text,
      ADD COLUMN reason text NOT NULL DEFAULT 'Fixture evidence reason', ADD COLUMN linked_by integer NOT NULL DEFAULT 42,
      ADD COLUMN linked_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN unlinked_by integer, ADD COLUMN unlink_reason text;
    CREATE TABLE cmc_source_objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id integer NOT NULL,
      project_id text NOT NULL, source_type text NOT NULL, source_key text NOT NULL,
      source_payload jsonb NOT NULL, source_hash text NOT NULL, version integer NOT NULL DEFAULT 1,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE cmc_module3_sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id integer NOT NULL,
      project_id text NOT NULL, section_key text NOT NULL, narrative_text text, approval_state text);
    CREATE TABLE cmc_section_lineage (section_id uuid NOT NULL, organization_id integer NOT NULL,
      source_object_id uuid NOT NULL, source_hash_at_compile text, created_at timestamptz DEFAULT now());
    CREATE TABLE test_cmc_evidence_audit (id uuid PRIMARY KEY, organization_id integer NOT NULL, entry jsonb NOT NULL);
    CREATE FUNCTION public.actor_name(integer) RETURNS TABLE(name text,email text)
      LANGUAGE sql AS $$ SELECT 'Fixture editor'::text,NULL::text $$;
  `);
  const migration = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    '../../../../migrations/20261005b_cmc_source_evidence.sql'), 'utf8');
  await harness.pg.exec(migration);
  await harness.pg.exec(migration);
  connection.transaction.mockImplementation(async (work: (q: typeof harness.db) => Promise<unknown>) => {
    const q = {
      query: async (sql: string, params?: unknown[]) => {
        connection.trace.push(sql);
        if (connection.failLock && /pg_advisory_xact_lock/.test(sql)) throw new Error('Fixture lock unavailable');
        return harness.db.query(sql, params);
      },
    };
    await q.query('BEGIN');
    try {
      const result = await work(q as typeof harness.db);
      await q.query('COMMIT');
      return result;
    } catch (err) {
      await q.query('ROLLBACK');
      throw err;
    }
  });
  connection.audit.mockImplementation(async (q: typeof harness.db, entry: { tenantId: number }) => {
    await q.query('INSERT INTO test_cmc_evidence_audit VALUES ($1,$2,$3)',
      [randomUUID(), entry.tenantId, JSON.stringify(entry)]);
    if (connection.failAudit) throw new Error('Fixture audit unavailable');
  });
});
afterAll(async () => { await harness.close(); });
beforeEach(() => {
  vi.clearAllMocks();
  connection.trace.length = 0;
  connection.failLock = false;
  connection.failAudit = false;
});

async function seed() {
  const f = await harness.seed();
  const { rows } = await harness.pg.query<{ id: string }>(`INSERT INTO cmc_source_objects
    (organization_id,project_id,source_type,source_key,source_payload,source_hash)
    VALUES ($1,$2,'batch_record',$3,'{"batchNumber":"CMC-001","assay":99.1}','c') RETURNING id`,
  [f.org, f.program, SOURCE_KEY]);
  return { ...f, sourceObjectId: rows[0].id };
}

async function withdraw(f: DispositionFixture, choice: DocumentDispositionChoice) {
  // A real captured-source disposition also governs the same-hash Vault
  // representation. Supersede has a verified captured successor; it need not
  // supersede the old Vault family to demonstrate binary admission.
  const replacementId = choice === 'supersede' ? await insertCapturedSuccessor(f) : undefined;
  const applied = await f.apply(choice, replacementId ? { replacementId } : {});
  expect(applied.disposition.choice).toBe(choice);
  expect(applied.preview.counts.downstreamReferences).toBeGreaterThanOrEqual(1);
  return applied;
}

const actor = (f: DispositionFixture, documentId = f.vault) => ({
  organizationId: f.org, programId: f.program, userId: 42,
  sourceKey: SOURCE_KEY, documentId, reason: REASON,
});
async function liveLinks(f: DispositionFixture) {
  return (await harness.pg.query<Record<string, unknown>>('SELECT * FROM cmc_source_evidence WHERE organization_id=$1 ORDER BY id', [f.org])).rows;
}
async function audits(f: DispositionFixture) {
  return (await harness.pg.query('SELECT * FROM test_cmc_evidence_audit WHERE organization_id=$1 ORDER BY id', [f.org])).rows;
}
async function rawIdentity(f: DispositionFixture) {
  return (await harness.pg.query(`SELECT to_jsonb(d) AS vault, to_jsonb(s) AS captured
    FROM vault.documents d JOIN cre_evidence_sources s ON s.id=$2
    WHERE d.id=$1`, [f.vault, f.capture])).rows;
}
function assertAdmissionOrder() {
  const trace = connection.trace;
  expect(trace[0]).toBe('BEGIN');
  const advisory = trace.findIndex(sql => /pg_advisory_xact_lock/.test(sql));
  const reservation = trace.findIndex(sql => /LOCK TABLE public\.cmc_source_evidence,\s*vault\.documents IN ROW EXCLUSIVE MODE/.test(sql));
  const sourceRead = trace.findIndex(sql => /SELECT source_type FROM cmc_source_objects/.test(sql));
  const rowRead = trace.findIndex(sql => /FOR SHARE OF d/.test(sql));
  expect(advisory).toBeGreaterThan(0);
  expect(reservation).toBeGreaterThan(advisory);
  expect(sourceRead).toBeGreaterThan(reservation);
  expect(rowRead).toBeGreaterThan(sourceRead);
}

describe('CMC original-document admission after actual canonical withdrawal', () => {
  it.each(CHOICES)('%s excludes the original from selection and refuses a new link without effects', async choice => {
    const f = await seed();
    await withdraw(f, choice);
    const identity = await rawIdentity(f);
    const listed = await listLinkableDocuments(harness.db, { organizationId: f.org, programId: f.program });
    expect.soft(listed).toEqual({ ok: true, documents: [] });
    const linked = await linkSourceEvidence(harness.db, actor(f));
    expect.soft(linked).toMatchObject({ ok: false, status: 409, code: 'DOCUMENT_WITHDRAWN' });
    expect.soft(await liveLinks(f)).toEqual([]);
    expect.soft(await audits(f)).toEqual([]);
    expect(await rawIdentity(f)).toEqual(identity);
    expect.soft(connection.audit).not.toHaveBeenCalled();
    expect.soft(connection.trace.at(-1)).toBe('ROLLBACK');
    expect.soft(connection.trace.some(sql => /UPDATE public\.cmc_source_evidence|INSERT INTO public\.cmc_source_evidence/.test(sql))).toBe(false);
    assertAdmissionOrder();
  });

  it('admits an available current original, records the snapshot, and orders locking before reads/writes', async () => {
    const f = await seed();
    const listed = await listLinkableDocuments(harness.db, { organizationId: f.org, programId: f.program });
    expect(listed.ok && listed.documents.map(d => d.documentId)).toEqual([f.vault]);
    expect(await linkSourceEvidence(harness.db, actor(f))).toMatchObject({ ok: true, moved: [] });
    expect(await liveLinks(f)).toMatchObject([{ vault_document_id: f.vault, content_hash_at_link: 'a'.repeat(64), reason: REASON }]);
    expect(await audits(f)).toHaveLength(1);
    expect(connection.trace.at(-1)).toBe('COMMIT');
    assertAdmissionOrder();
    const reads = await listSourceEvidence(harness.db, { organizationId: f.org, programId: f.program });
    expect(reads.ok && reads.sources[0].evidence[0]).toMatchObject({ state: 'current', originalFileAvailable: true, disposition: null });
  });

  it('does not apply another tenant or program disposition to the same hash', async () => {
    const withdrawn = await seed();
    await withdraw(withdrawn, 'remove_data');
    const otherTenant = await seed();
    const otherProgram = randomUUID();
    const otherDocument = randomUUID();
    await harness.pg.query('INSERT INTO regulatory_programs VALUES ($1,$2,42,NULL)', [otherProgram, withdrawn.org]);
    await harness.pg.query(`INSERT INTO vault.documents (id,organization_id,program_id,document_title,content_hash)
      VALUES ($1,$2,$3,'Other programme original',$4)`, [otherDocument, withdrawn.org, otherProgram, 'a'.repeat(64)]);
    await harness.pg.query(`INSERT INTO cmc_source_objects
      (organization_id,project_id,source_type,source_key,source_payload,source_hash)
      VALUES ($1,$2,'batch_record',$3,'{}','c')`, [withdrawn.org, otherProgram, SOURCE_KEY]);
    for (const a of [actor(otherTenant), { ...actor(withdrawn, otherDocument), programId: otherProgram }]) {
      expect(await linkSourceEvidence(harness.db, a)).toMatchObject({ ok: true });
    }
    expect(await linkSourceEvidence(harness.db, actor(otherTenant, withdrawn.vault)))
      .toMatchObject({ ok: false, status: 404, code: 'DOCUMENT_NOT_FOUND' });
  });

  it('keeps the normal governed withdrawal blocker for an existing active CMC link', async () => {
    const f = await seed();
    expect(await linkSourceEvidence(harness.db, actor(f))).toMatchObject({ ok: true });
    const preview = await f.service.preview(f.scope);
    expect(preview.allowedChoices).toEqual([]);
    await expect(f.service.apply({ ...f.scope, choice: 'keep_data', reason: REASON, previewToken: preview.previewToken }))
      .rejects.toMatchObject({ code: 'DISPOSITION_BLOCKED' });
    expect(await f.records()).toEqual([]);
    expect(await liveLinks(f)).toHaveLength(1);
  });

  it('refuses withdrawn current v2 without moving or rewriting its existing v1 evidence', async () => {
    const f = await seed();
    expect(await linkSourceEvidence(harness.db, actor(f))).toMatchObject({ ok: true });
    const v2 = await insertVaultSuccessor(f);
    await harness.pg.query('UPDATE vault.documents SET version=$2 WHERE id=$1', [v2, '2.0']);
    // The existing v1 link has different bytes. It is outside v2's canonical
    // impact, so this is a normal successful preview/apply, not a blocker bypass.
    await f.apply('remove_data', { targetType: 'vault_document', targetId: v2 });
    const beforeLinks = await liveLinks(f);
    const beforeAudits = await audits(f);
    connection.trace.length = 0;
    connection.audit.mockClear();

    expect(await linkSourceEvidence(harness.db, actor(f, v2)))
      .toMatchObject({ ok: false, status: 409, code: 'DOCUMENT_WITHDRAWN' });
    expect(await liveLinks(f)).toEqual(beforeLinks);
    expect(await audits(f)).toEqual(beforeAudits);
    expect(connection.audit).not.toHaveBeenCalled();
    expect(connection.trace.some(sql => /UPDATE public\.cmc_source_evidence|INSERT INTO public\.cmc_source_evidence/.test(sql))).toBe(false);
    expect(connection.trace.at(-1)).toBe('ROLLBACK');
    assertAdmissionOrder();
  });
});

describe('CMC evidence verification and transaction failures refuse safely', () => {
  it('fails closed when the canonical policy store is unavailable', async () => {
    const f = await seed();
    await harness.pg.exec('ALTER TABLE public.document_data_dispositions RENAME TO test_unavailable_dispositions');
    try {
      await expect(listLinkableDocuments(harness.db, { organizationId: f.org, programId: f.program })).rejects.toThrow();
      await expect(linkSourceEvidence(harness.db, actor(f))).rejects.toThrow();
    } finally {
      await harness.pg.exec('ALTER TABLE public.test_unavailable_dispositions RENAME TO document_data_dispositions');
    }
    expect(await liveLinks(f)).toEqual([]);
    expect(await audits(f)).toEqual([]);
    expect(connection.trace.at(-1)).toBe('ROLLBACK');
  });

  it('fails closed before source reads when the program lock is unavailable', async () => {
    const f = await seed();
    connection.failLock = true;
    await expect(linkSourceEvidence(harness.db, actor(f))).rejects.toThrow('Fixture lock unavailable');
    expect(await liveLinks(f)).toEqual([]);
    expect(await audits(f)).toEqual([]);
    expect(connection.trace.some(sql => /FROM cmc_source_objects|FOR SHARE OF d/.test(sql))).toBe(false);
    expect(connection.trace.at(-1)).toBe('ROLLBACK');
  });

  it('rolls back a link when its audit fails', async () => {
    const f = await seed();
    connection.failAudit = true;
    await expect(linkSourceEvidence(harness.db, actor(f))).rejects.toThrow('Fixture audit unavailable');
    expect(await liveLinks(f)).toEqual([]);
    expect(await audits(f)).toEqual([]);
    expect(connection.trace.at(-1)).toBe('ROLLBACK');
  });
});

async function seedLateLink(f: Awaited<ReturnType<typeof seed>>) {
  // TEST-ONLY late/legacy link seed: ordinary canonical apply blocks an active
  // CMC link. This models the prior admission defect without bypassing guards.
  const linkId = randomUUID();
  const sectionId = randomUUID();
  await harness.pg.query(`INSERT INTO cmc_source_evidence
    (id,organization_id,program_id,source_type,source_key,vault_document_id,content_hash_at_link,reason)
    VALUES ($1,$2,$3,'batch_record',$4,$5,$6,$7)`, [linkId, f.org, f.program, SOURCE_KEY, f.vault, 'a'.repeat(64), REASON]);
  await harness.pg.query(`INSERT INTO cmc_module3_sections (id,organization_id,project_id,section_key,narrative_text,approval_state)
    VALUES ($1,$2,$3,$4,'Historical approved narrative','approved')`, [sectionId, f.org, f.program, SECTION]);
  await harness.pg.query(`INSERT INTO cmc_section_lineage (section_id,organization_id,source_object_id,source_hash_at_compile)
    VALUES ($1,$2,$3,'c')`, [sectionId, f.org, f.sourceObjectId]);
  return { linkId, sectionId };
}

describe('TEST-ONLY late/legacy CMC evidence read and drift defense', () => {
  it.each(CHOICES)('%s projects the data consequence without rewriting historical evidence or approvals', async choice => {
    const f = await seed();
    await withdraw(f, choice);
    const { sectionId } = await seedLateLink(f);
    const oldLinks = await liveLinks(f);
    const oldLineage = (await harness.pg.query('SELECT * FROM cmc_section_lineage WHERE section_id=$1', [sectionId])).rows;
    const read = await listSourceEvidence(harness.db, { organizationId: f.org, programId: f.program });
    expect(read.ok && read.sources[0].evidence[0]).toMatchObject({
      state: choice === 'keep_data' ? 'current' : 'withdrawn', originalFileAvailable: false, disposition: choice,
    });
    const drift = await findEvidenceDrift(harness.db, f.org, f.program);
    if (choice === 'keep_data') expect(drift).toEqual([]);
    else expect(drift).toEqual([{ sectionKey: SECTION, reasons: [expect.stringContaining('withdrawn')] }]);
    expect(await liveLinks(f)).toEqual(oldLinks);
    expect((await harness.pg.query('SELECT * FROM cmc_section_lineage WHERE section_id=$1', [sectionId])).rows).toEqual(oldLineage);
    expect((await harness.pg.query('SELECT approval_state FROM cmc_module3_sections WHERE id=$1', [sectionId])).rows)
      .toEqual([{ approval_state: 'approved' }]);
  });

  it('preserves immutable history and permits only governed unlink', async () => {
    const f = await seed();
    await withdraw(f, 'remove_data');
    const { linkId } = await seedLateLink(f);
    const prior = (await liveLinks(f))[0];
    await expect(harness.pg.query('UPDATE cmc_source_evidence SET reason=$2 WHERE id=$1', [linkId, 'Rewrite history']))
      .rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    await expect(harness.pg.query('DELETE FROM cmc_source_evidence WHERE id=$1', [linkId]))
      .rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    expect(await unlinkSourceEvidence(harness.db, { ...actor(f), linkId })).toEqual({ ok: true });
    const removed = (await liveLinks(f))[0];
    expect(removed).toMatchObject({ ...prior, unlinked_at: expect.any(Date), unlinked_by: 42, unlink_reason: REASON });
    expect(await liveLinks(f)).toHaveLength(1);
    expect(await findEvidenceDrift(harness.db, f.org, f.program)).toEqual([]);
    expect(await unlinkSourceEvidence(harness.db, { ...actor(f), linkId })).toMatchObject({ ok: false, code: 'ALREADY_UNLINKED' });
  });
});
