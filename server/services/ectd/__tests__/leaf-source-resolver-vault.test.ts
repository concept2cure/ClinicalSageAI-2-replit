/**
 * `materializeLeafSources` can finally materialize a leaf that points at a
 * VAULT document — the gap the assessment called the most important parity item
 * on its list: a customer could upload a CSR and then not put it in the NDA.
 *
 * ── What had to fall first ───────────────────────────────────────────────────
 * The refusal was correct for two independent reasons, and both are gone:
 *   - BYTES. Vault ingest wrote to a raw uploads/ path, so the packager — which
 *     fetches through getStorageProvider() — could not address the bytes even
 *     given a correct id. Ingest now writes through the provider and records the
 *     version id it returns.
 *   - ID SPACE. submission_leaves.document_id is INTEGER and vault.documents.id
 *     is a UUID. The leaf now carries document_uuid alongside it. The integer
 *     column is untouched: widening it is Option A of the identity contract and
 *     remains rejected.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * Every gate on the path, because what leaves here goes to a regulator. The
 * eCTD index md5 is computed from whatever is staged, so there is NO downstream
 * check that would catch wrong bytes — they would ship with a valid-looking
 * checksum. Each refusal below is therefore the last line of defence, and each
 * is an EXPLAINED unresolved leaf rather than a silent drop.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));

const store = vi.hoisted(() => ({
  objects: new Map<string, { bytes: Buffer; orgId: number }>(),
  gets: [] as Array<{ vaultVersionId: string; orgId: number }>,
}));
vi.mock('../../storage', () => {
  const fake = {
    name: 'test',
    async get(vaultVersionId: string, orgId: number) {
      store.gets.push({ vaultVersionId, orgId });
      const hit = store.objects.get(vaultVersionId);
      // The provider's contract: a foreign org reads as absent, never throws.
      if (!hit || hit.orgId !== orgId) return null;
      return { bytes: hit.bytes, sizeBytes: hit.bytes.length, sha256: '', mime: 'application/pdf', filename: 'v.pdf' };
    },
  };
  // The resolver reads a vault row from its recorded store; here there is one.
  return {
    getStorageProvider: () => fake,
    getStorageProviderFor: (recorded: string | null) => {
      if (recorded === 'unopenable') throw new Error("storage provider 'unopenable' cannot be opened");
      return fake;
    },
  };
});

import { materializeLeafSources, leafSourceKey } from '../leaf-source-resolver';

let harness: IndPgliteDb;
let stageDir = '';
const ORG = 21;
const OTHER_ORG = 22;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM = '22222222-2222-4222-8222-222222222222';

const PDF = Buffer.from('%PDF-1.4\n% a governed CSR\ntrailer<< /Root 1 0 R >>\n%%EOF\n', 'utf8');
/** No %PDF- header. The fake provider reports application/pdf regardless, so
 *  only a check on the BYTES catches this — which is the point. */
const NOT_PDF = Buffer.from('This is plain text pretending to be a PDF.\n', 'utf8');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

let seq = 0;
const nextUuid = () => `3333${(++seq).toString().padStart(4, '0')}-3333-4333-8333-333333333333`;

/** Insert a vault.documents row, and register its bytes with the fake store. */
async function seedVaultDoc(opts: {
  program?: string;
  bytes?: Buffer;
  /** Override the recorded hash, to simulate a source altered after filing. */
  contentHash?: string | null;
  /** Leave storage_version_id NULL — a row that predates the provider. */
  noStorageVersion?: boolean;
  /** Register the bytes under a different org than the programme's. */
  bytesOwnedBy?: number;
  /** Do not register bytes at all (a lost object). */
  withholdBytes?: boolean;
  /** vault.documents.storage_provider, the store the bytes were written to. */
  storageProvider?: string | null;
}): Promise<string> {
  const id = nextUuid();
  const versionId = `ver-${id}`;
  const bytes = opts.bytes ?? PDF;
  if (!opts.noStorageVersion && !opts.withholdBytes) {
    store.objects.set(versionId, { bytes, orgId: opts.bytesOwnedBy ?? ORG });
  }
  await harness.pglite.query(
    `INSERT INTO vault.documents
       (id, program_id, storage_version_id, content_hash, file_name, deleted_at, storage_provider)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, NULL, $6)`,
    [
      id,
      opts.program ?? PROGRAM,
      opts.noStorageVersion ? null : versionId,
      opts.contentHash === undefined ? sha(bytes) : opts.contentHash,
      'csr-201.pdf',
      opts.storageProvider ?? null,
    ],
  );
  return id;
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  // The vault lives in its own schema and the harness does not carry it; the
  // resolver reads it with raw SQL through the programme, so both are needed.
  await harness.pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    -- The programme spine: the resolver scopes a vault document through it,
    -- because that is the authoritative owner of one.
    CREATE TABLE IF NOT EXISTS regulatory_programs (
      id UUID PRIMARY KEY,
      organization_id INTEGER,
      deleted_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS vault.documents (
      id UUID PRIMARY KEY,
      program_id UUID NOT NULL,
      storage_version_id TEXT,
      storage_provider TEXT,
      content_hash TEXT,
      file_name TEXT,
      deleted_at TIMESTAMPTZ
    );
  `);
  await harness.pglite.query(
    `INSERT INTO regulatory_programs (id, organization_id) VALUES ($1::uuid,$2),($3::uuid,$4)
     ON CONFLICT (id) DO NOTHING`,
    [PROGRAM, ORG, OTHER_PROGRAM, OTHER_ORG],
  );
  stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'leaf-src-vault-'));
});

afterAll(async () => {
  await harness?.close?.();
  if (stageDir) await fs.rm(stageDir, { recursive: true, force: true });
});

beforeEach(() => {
  store.gets.length = 0;
});

const run = (leaves: Array<{ documentTable: string; documentId: number | null; documentUuid?: string | null }>) =>
  materializeLeafSources({ leaves, organizationId: ORG, stageDir });

describe('materializeLeafSources — vault_documents', () => {
  it('materializes the vault copy, staging the RAW bytes', async () => {
    const id = await seedVaultDoc({});
    const out = await run([{ documentTable: 'vault_documents', documentId: null, documentUuid: id }]);

    expect(out.unresolved).toEqual([]);
    expect(out.materialized).toBe(1);
    const file = out.byKey.get(leafSourceKey('vault_documents', null, id));
    expect(file, 'the vault leaf did not resolve').toBeTruthy();
    // Raw, never re-rendered: the vault copy IS the governed record, and
    // re-rendering would file something the vault has never seen.
    expect(await fs.readFile(file!.sourcePath)).toEqual(PDF);
    expect(file!.sha256).toBe(sha(PDF));
  });

  it('fetches the bytes with the CALLER organization', async () => {
    // Object storage sits outside Postgres RLS, so this argument is the only
    // tenant boundary the bytes themselves get.
    const id = await seedVaultDoc({});
    await run([{ documentTable: 'vault_documents', documentId: null, documentUuid: id }]);
    expect(store.gets.at(-1)?.orgId).toBe(ORG);
  });

  it('gives two vault leaves DISTINCT keys', async () => {
    // Both carry documentId null, so a key built from the integer alone would
    // collapse them onto `vault_documents:` and stage the first document for
    // both — a WRONG file in a submission, not a missing one.
    const a = await seedVaultDoc({});
    const b = await seedVaultDoc({ bytes: Buffer.from('%PDF-1.4\n% a second document\n%%EOF\n', 'utf8') });
    const out = await run([
      { documentTable: 'vault_documents', documentId: null, documentUuid: a },
      { documentTable: 'vault_documents', documentId: null, documentUuid: b },
    ]);
    expect(out.materialized).toBe(2);
    expect(out.byKey.size).toBe(2);
  });
});

describe('every refusal is explained, never a silent drop', () => {
  const reasonOf = async (leaf: { documentId?: number | null; documentUuid?: string | null }) => {
    const out = await run([{ documentTable: 'vault_documents', documentId: null, ...leaf }]);
    expect(out.materialized).toBe(0);
    expect(out.unresolved).toHaveLength(1);
    return out.unresolved[0].reason;
  };

  it('a LEGACY vault leaf addressed by an integer says an integer cannot name one', async () => {
    // upsertLeaf refuses this shape now, but the generic PUT route accepted any
    // placeable table with an integer before it did, so such a row can exist.
    // It reaches the branch (it has a pointer) and is refused there with the
    // reason, rather than resolving to whatever document has that integer.
    expect(await reasonOf({ documentId: 7, documentUuid: null })).toMatch(/document_uuid/i);
  });

  it('a leaf with NEITHER pointer is skipped here and reported by the dispatch gate', async () => {
    // Not this module's job: a leaf with no document reference at all never
    // reaches a resolver branch, and computeDispatchReadiness raises
    // UNRESOLVED_DOCUMENT for it. Asserted so the empty result below is
    // understood as that division of labour and not as a silent drop.
    const out = await run([{ documentTable: 'vault_documents', documentId: null, documentUuid: null }]);
    expect(out.materialized).toBe(0);
    expect(out.unresolved).toEqual([]);
  });

  it('a malformed uuid is refused rather than raising 22P02 across the whole assembly', async () => {
    expect(await reasonOf({ documentUuid: 'not-a-uuid' })).toMatch(/not a uuid/i);
  });

  it('another organization vault document is not found', async () => {
    const id = await seedVaultDoc({ program: OTHER_PROGRAM });
    expect(await reasonOf({ documentUuid: id })).toMatch(/not found in this organization/i);
  });

  it('a row that predates the storage provider names the backfill that fixes it', async () => {
    // Readable by its legacy path, but the packager fetches only through the
    // provider — so say what makes it filable instead of guessing.
    const id = await seedVaultDoc({ noStorageVersion: true });
    expect(await reasonOf({ documentUuid: id })).toMatch(/backfill-vault-storage/);
  });

  it('bytes the provider will not return for this org are refused', async () => {
    const id = await seedVaultDoc({ withholdBytes: true });
    expect(await reasonOf({ documentUuid: id })).toMatch(/not retrievable/i);
  });

  it('bytes in a store this server cannot open are refused, and no other store is asked', async () => {
    const id = await seedVaultDoc({ storageProvider: 'unopenable' });
    const before = store.gets.length;
    expect(await reasonOf({ documentUuid: id })).toMatch(/store this server cannot open/i);
    expect(store.gets.length, 'the configured store must not answer for another one').toBe(before);
  });

  it('bytes that do not match the recorded hash are REFUSED, not staged', async () => {
    // The md5 in the eCTD index is computed from whatever is staged, so there is
    // no downstream check that would catch this. It ships with a valid-looking
    // checksum or it does not ship.
    const id = await seedVaultDoc({ contentHash: 'f'.repeat(64) });
    expect(await reasonOf({ documentUuid: id })).toMatch(/do not match the content hash/i);
  });

  it('a vault document that is not a PDF is refused on its BYTES, not its mime', async () => {
    const id = await seedVaultDoc({ bytes: NOT_PDF });
    expect(await reasonOf({ documentUuid: id })).toMatch(/not a valid PDF/i);
  });
});
