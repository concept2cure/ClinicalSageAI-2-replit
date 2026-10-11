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

const run = (uuid: string) =>
  materializeLeafSources({
    leaves: [{ documentTable: 'vault_documents', documentId: null, documentUuid: uuid }],
    organizationId: ORG,
    stageDir,
  });

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  await harness.pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
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
