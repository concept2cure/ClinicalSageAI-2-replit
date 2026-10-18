/**
 * VR-14 (D7): only an approved, current Vault version leaves for an agency.
 *
 * Until 2026-10-01 the vault branch of materializeLeafSources never asked
 * whether the document had been approved. FINALIZED_STATUSES_BY_STORE had no
 * vault entry and the branch never reported an unfinalized leaf, so an
 * unreviewed upload — or an Authoring export stamped WORKING DRAFT — passed
 * transmit's "only approved documents" rule and could be sent to FDA.
 *
 * VR-13 gave a Vault version a lifecycle record (canonical_documents, one per
 * version, naming it in source_refs.vault_documents.nativeId). A vault leaf is
 * now finalized only when that record is at a steady stage (approved, placed,
 * packaged, submitted — STEADY_STAGES), the version is current (no live later
 * version in its family), and the record's content hash — what was approved —
 * is the hash of the bytes being staged. Anything else is counted in
 * `unfinalized`, which transmit, the governed freeze and dispatch already
 * refuse on (assembledTransmitBlockers). No second gate.
 *
 * FD5 (grandfathering vault leaves already in open sequences) is not decided,
 * so nothing is grandfathered.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createHash, randomUUID } from 'crypto';
import { syncCompanyLegalRegistry } from '../../company-documents/legal-registry';
import type { CompanyLegalDocument } from '../../../../shared/company-documents';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));

const store = vi.hoisted(() => ({ objects: new Map<string, Buffer>() }));
vi.mock('../../storage', () => {
  const fake = {
    name: 'test',
    async get(vaultVersionId: string) {
      const bytes = store.objects.get(vaultVersionId);
      return bytes ? { bytes, sizeBytes: bytes.length, sha256: '', mime: 'application/pdf', filename: 'v.pdf' } : null;
    },
  };
  return { getStorageProvider: () => fake, getStorageProviderFor: () => fake };
});

import { materializeLeafSources } from '../leaf-source-resolver';
import { assembledTransmitBlockers } from '../assemble-from-core';
import type { LegalDocumentContext } from '../../../../shared/company-documents';

let harness: IndPgliteDb;
let stageDir = '';
const ORG = 31;
const OTHER_ORG = 32;
const PROGRAM = '44444444-4444-4444-8444-444444444444';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const pdf = (label: string) => Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF\n`, 'utf8');

/** A Vault version: its row, its bytes, and (optionally) its lifecycle record. */
async function seedVersion(opts: {
  label: string;
  stage?: string | null;
  supersedes?: string;
  documentCode?: string;
  /** The content hash the lifecycle record was approved for, when not these bytes. */
  approvedHash?: string;
  recordOrg?: number;
}): Promise<string> {
  const id = randomUUID();
  const bytes = pdf(opts.label);
  store.objects.set(`ver-${id}`, bytes);
  await harness.pglite.query(
    `INSERT INTO vault.documents
       (id, program_id, organization_id, storage_version_id, content_hash, file_name, supersedes_id, document_code)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid, $8)`,
    [id, PROGRAM, ORG, `ver-${id}`, sha(bytes), `${opts.label}.pdf`, opts.supersedes ?? null, opts.documentCode ?? null],
  );
  if (opts.stage) {
    await harness.pglite.query(
      `INSERT INTO canonical_documents (canonical_id, organization_id, project_id, title, document_type, stage, has_content, content_hash, source_refs)
       VALUES ($1, $2, $3, $4, 'CSR', $5, true, $6, $7::jsonb)`,
      [
        `cd-${id}`,
        opts.recordOrg ?? ORG,
        PROGRAM,
        opts.label,
        opts.stage,
        opts.approvedHash ?? sha(bytes),
        JSON.stringify({ vault_documents: { nativeId: id, role: 'artifact' } }),
      ],
    );
  }
  return id;
}

const run = (uuid: string, legalTarget?: LegalDocumentContext) =>
  materializeLeafSources({
    leaves: [{ documentTable: 'vault_documents', documentId: null, documentUuid: uuid }],
    organizationId: ORG,
    stageDir,
    legalTarget,
  });

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  await harness.pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE IF NOT EXISTS organizations (id INTEGER PRIMARY KEY, settings JSONB NOT NULL DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS regulatory_programs (id UUID PRIMARY KEY, organization_id INTEGER, deleted_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS vault.documents (
      id UUID PRIMARY KEY,
      program_id UUID NOT NULL,
      organization_id INTEGER,
      storage_version_id TEXT,
      storage_provider TEXT,
      content_hash TEXT,
      file_name TEXT,
      supersedes_id UUID,
      document_code TEXT,
      deleted_at TIMESTAMPTZ
    );
  `);
  await harness.pglite.exec(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
    CREATE TABLE IF NOT EXISTS vault.legal_holds (organization_id INTEGER, lifted_at TIMESTAMPTZ);`);
  await harness.pglite.exec(readFileSync(new URL('../../../../migrations/20261018_company_legal_registry.sql', import.meta.url), 'utf8'));
  await harness.pglite.query('INSERT INTO organizations(id) VALUES($1)', [ORG]);
  // The real binary-availability predicate requires the existing disposition
  // ledger; apply its canonical constraints and guards to exercise that read.
  await harness.pglite.exec(readFileSync(new URL('../../../../migrations/20261006_document_data_dispositions.sql', import.meta.url), 'utf8'));
  await harness.pglite.query(`INSERT INTO regulatory_programs (id, organization_id) VALUES ($1::uuid, $2)`, [PROGRAM, ORG]);
  stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-finalized-'));
});

afterAll(async () => {
  await harness?.close?.();
  if (stageDir) await fs.rm(stageDir, { recursive: true, force: true });
});

describe('a vault leaf is finalized only when its version is approved, current, and approved for these bytes', () => {
  it('uses the existing assembled transmit blocker for a registered original outside the actual destination, while preserving its bytes and approval', async () => {
    const uuid = await seedVersion({ label: 'company-authorization', stage: 'approved' });
    const original = store.objects.get(`ver-${uuid}`)!;
    const document: CompanyLegalDocument = { id: uuid, title: 'Company authorization', kind: 'authorization', programId: PROGRAM, vaultDocumentId: uuid,
      contentHash: sha(original), version: '1', agencies: ['FDA'], countries: ['US'], submissionTypes: ['IND'], language: 'en',
      effectiveOn: null, expiresOn: null, active: true, registeredAt: '2026-10-01T00:00:00Z', registeredBy: '5' };
    await syncCompanyLegalRegistry(harness.pglite, ORG, [], [document]);
    try {
      const matching = await run(uuid, { programId: PROGRAM, agency: 'FDA', country: 'US', submissionType: 'IND' });
      expect(matching.unfinalized).toBe(0);
      const mismatched = await run(uuid, { programId: PROGRAM, agency: 'EMA', country: 'EU', submissionType: 'IND' });
      expect(mismatched.materialized).toBe(1);
      expect(mismatched.unfinalized).toBe(1);
      const blockers = assembledTransmitBlockers({ skipped: [], unfinalized: mismatched.unfinalized, unfinalizedSections: mismatched.unfinalizedSections });
      expect(blockers.join(' ')).toContain('selected agency is outside');
      expect(await fs.readFile([...mismatched.byKey.values()][0].sourcePath)).toEqual(original);
      expect((await run(uuid)).unfinalizedSections[0].status).toContain('target program');
      const record = await harness.pglite.query('SELECT stage,content_hash FROM canonical_documents WHERE canonical_id=$1', [`cd-${uuid}`]);
      expect(record.rows[0]).toEqual({ stage: 'approved', content_hash: sha(original) });
    } finally { await harness.pglite.exec("TRUNCATE company_legal_registry"); }
  });

  it('an upload nobody reviewed is not finalized', async () => {
    const out = await run(await seedVersion({ label: 'never-reviewed' }));
    expect(out.materialized).toBe(1);
    expect(out.unfinalized).toBe(1);
    expect(out.unfinalizedSections[0].status).toMatch(/not reviewed/);
  });

  it.each(['authoring', 'in_review'])('a version at %s is not finalized', async stage => {
    const out = await run(await seedVersion({ label: `at-${stage}`, stage }));
    expect(out.unfinalized).toBe(1);
    // nosemgrep: detect-non-literal-regexp -- a test: stage is one of two literal stage names
    expect(out.unfinalizedSections[0].status).toMatch(new RegExp(`${stage}, not approved`));
  });

  it.each(['approved', 'placed', 'packaged', 'submitted'])('an approved current version at %s is finalized', async stage => {
    const out = await run(await seedVersion({ label: `steady-${stage}`, stage }));
    expect(out.materialized).toBe(1);
    expect(out.unfinalized).toBe(0);
  });

  it('a version a later one superseded is not finalized for a new assembly', async () => {
    const v1 = await seedVersion({ label: 'v1', stage: 'approved', documentCode: 'CSR-201' });
    await seedVersion({ label: 'v2', stage: 'approved', documentCode: 'CSR-201', supersedes: v1 });
    const out = await run(v1);
    expect(out.unfinalized).toBe(1);
    expect(out.unfinalizedSections[0].status).toMatch(/superseded/);
  });

  it('an approval for different bytes is not an approval of these', async () => {
    const out = await run(await seedVersion({ label: 'swapped', stage: 'approved', approvedHash: sha(pdf('what was approved')) }));
    expect(out.unfinalized).toBe(1);
    expect(out.unfinalizedSections[0].status).toMatch(/approved for different content/);
  });

  it("another organization's lifecycle record approves nothing here", async () => {
    const out = await run(await seedVersion({ label: 'foreign-record', stage: 'approved', recordOrg: OTHER_ORG }));
    expect(out.unfinalized).toBe(1);
    expect(out.unfinalizedSections[0].status).toMatch(/not reviewed/);
  });

  it('names the leaf by its file, so the refusal says which document', async () => {
    const out = await run(await seedVersion({ label: 'named-draft', stage: 'in_review' }));
    expect(out.unfinalizedSections[0].sectionCode).toBe('named-draft.pdf');
  });

  it('transmit, freeze and dispatch refuse it, naming the document and why', async () => {
    const out = await run(await seedVersion({ label: 'csr-draft', stage: 'in_review' }));
    const blockers = assembledTransmitBlockers({ skipped: [], unfinalized: out.unfinalized, unfinalizedSections: out.unfinalizedSections });
    expect(blockers).toEqual(['1 leaf document(s) are not approved (csr-draft.pdf: in_review, not approved)']);
  });
});
