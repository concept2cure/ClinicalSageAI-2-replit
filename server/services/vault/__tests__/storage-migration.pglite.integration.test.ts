/**
 * Moving a tenant's vault bytes onto the storage provider.
 *
 * ── Why PGlite ───────────────────────────────────────────────────────────────
 * The behaviour under test is largely a candidate QUERY — which rows are still
 * path-addressed, scoped to one tenant through the program join — plus an
 * UPDATE that must not re-migrate a row. Mocking those would restate the fix
 * rather than test it, and the two things most likely to be wrong (the join
 * that carries the org, and the `storage_version_id IS NULL` guard that makes a
 * rerun safe) are invisible without a real engine.
 *
 * ── What these pin ───────────────────────────────────────────────────────────
 * The sweep's fail-closed rules, each of which exists because the alternative
 * quietly corrupts a governed record:
 *   - bytes are migrated only when they hash to what the record already claims;
 *   - a mismatch, a missing file and a foreign tenant's row are left ALONE and
 *     never counted as done;
 *   - a rerun is a no-op, so a partial run can be resumed;
 *   - the original file survives the migration.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import { createHash } from 'node:crypto';
import { migrateVaultStorage, type MigrationStorage } from '../storage-migration.service';

const ORG = 7;
const OTHER_ORG = 9;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM = '33333333-3333-4333-8333-333333333333';

let db: PGlite;
let cwd: string;
let put: ReturnType<typeof vi.fn>;
let storage: MigrationStorage;

const asExec = () => ({
  query: (sql: string, params?: unknown[]) => db.query(sql, params),
}) as never;

/** Write a legacy file where a row's s3_key points, and return that key. */
function writeLegacy(name: string, body: string): { key: string; hash: string } {
  const key = `uploads/vault/${PROGRAM}/${name}`;
  const abs = nodePath.resolve(cwd, key);
  fsSync.mkdirSync(nodePath.dirname(abs), { recursive: true });
  fsSync.writeFileSync(abs, body);
  return { key, hash: createHash('sha256').update(Buffer.from(body)).digest('hex') };
}

async function insertDoc(over: Record<string, unknown> = {}) {
  const d = {
    id: over.id ?? '22222222-2222-4222-8222-222222222222',
    program_id: over.program_id ?? PROGRAM,
    s3_key: over.s3_key ?? null,
    content_hash: over.content_hash ?? null,
    storage_version_id: over.storage_version_id ?? null,
    file_name: over.file_name ?? 'doc.pdf',
    mime_type: over.mime_type ?? 'application/pdf',
  };
  await db.query(
    `INSERT INTO vault.documents
       (id, program_id, s3_key, content_hash, storage_version_id, file_name, mime_type, document_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'CODE')`,
    [d.id, d.program_id, d.s3_key, d.content_hash, d.storage_version_id, d.file_name, d.mime_type],
  );
  return d.id as string;
}

const rowOf = async (id: string) =>
  (
    await db.query<{ storage_version_id: string | null; storage_provider: string | null; s3_key: string | null }>(
      `SELECT storage_version_id, storage_provider, s3_key FROM vault.documents WHERE id = $1`,
      [id],
    )
  ).rows[0];

beforeEach(async () => {
  cwd = fsSync.mkdtempSync(nodePath.join(os.tmpdir(), 'vaultmig-'));
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA vault;
    CREATE TABLE regulatory_programs (
      id UUID PRIMARY KEY, organization_id INTEGER, deleted_at TIMESTAMPTZ
    );
    CREATE TABLE vault.documents (
      id UUID PRIMARY KEY,
      program_id UUID NOT NULL,
      s3_key TEXT, s3_bucket TEXT,
      content_hash TEXT,
      storage_version_id TEXT, storage_provider TEXT,
      file_name TEXT, mime_type TEXT, document_code TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
  `);
  await db.query(`INSERT INTO regulatory_programs (id, organization_id) VALUES ($1,$2),($3,$4)`, [
    PROGRAM, ORG, OTHER_PROGRAM, OTHER_ORG,
  ]);

  let n = 0;
  put = vi.fn(async () => {
    n += 1;
    return { vaultFileId: `vault://${ORG}/${PROGRAM}/f${n}`, vaultVersionId: `ver-${n}`, provider: 'local' };
  });
  storage = { put } as unknown as MigrationStorage;
});

afterEach(async () => {
  await db?.close();
  fsSync.rmSync(cwd, { recursive: true, force: true });
});

describe('a path-addressed document whose bytes match the record', () => {
  it('is migrated, and the row now carries the provider handle', async () => {
    const { key, hash } = writeLegacy('a.pdf', '%PDF-1.7 real');
    const id = await insertDoc({ s3_key: key, content_hash: hash });

    const r = await migrateVaultStorage(asExec(), storage, { organizationId: ORG, apply: true, cwd });
    expect(r.migrated).toBe(1);
    expect(r.skipped).toEqual([]);

    const row = await rowOf(id);
    expect(row.storage_version_id).toBe('ver-1');
    expect(row.storage_provider).toBe('local');
    expect(row.s3_key).toBe(`vault://${ORG}/${PROGRAM}/f1`);
  });

  it('hands the provider the organization from the PROGRAM, not from the row', async () => {
    const { key, hash } = writeLegacy('b.pdf', '%PDF-1.7 b');
    await insertDoc({ s3_key: key, content_hash: hash });
    await migrateVaultStorage(asExec(), storage, { organizationId: ORG, apply: true, cwd });
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ orgId: ORG, projectId: PROGRAM }));
  });

  it('leaves the original file in place', async () => {
    const { key, hash } = writeLegacy('c.pdf', '%PDF-1.7 c');
    await insertDoc({ s3_key: key, content_hash: hash });
    await migrateVaultStorage(asExec(), storage, { organizationId: ORG, apply: true, cwd });
    // Deleting the only other copy of a regulatory document in the same pass
    // that writes a new one is not a trade worth making for disk.
    expect(fsSync.existsSync(nodePath.resolve(cwd, key))).toBe(true);
  });
});

describe('the dry run', () => {
  it('reports what it would move and writes nothing', async () => {
    const { key, hash } = writeLegacy('d.pdf', '%PDF-1.7 d');
    const id = await insertDoc({ s3_key: key, content_hash: hash });

    const r = await migrateVaultStorage(asExec(), storage, { organizationId: ORG, apply: false, cwd });
    expect(r.migrated).toBe(1);
    expect(put).not.toHaveBeenCalled();
    expect((await rowOf(id)).storage_version_id).toBeNull();
  });
});

describe('rows that are left alone', () => {
  it('refuses bytes that do not hash to what the record claims', async () => {
    // Copying these into the governed store would launder the contradiction
    // into a fresh, provider-minted record that looks clean.
    const { key } = writeLegacy('e.pdf', '%PDF-1.7 actual bytes');
    const id = await insertDoc({ s3_key: key, content_hash: 'a'.repeat(64) });

    const r = await migrateVaultStorage(asExec(), storage, { organizationId: ORG, apply: true, cwd });
    expect(r.migrated).toBe(0);
    expect(r.skipped[0]).toMatchObject({ documentId: id, reason: 'hash_mismatch' });
    expect(put).not.toHaveBeenCalled();
    expect((await rowOf(id)).storage_version_id).toBeNull();
  });

  it('reports a row whose file is gone rather than counting it done', async () => {
    const id = await insertDoc({ s3_key: `uploads/vault/${PROGRAM}/never-written.pdf`, content_hash: 'b'.repeat(64) });
    const r = await migrateVaultStorage(asExec(), storage, { organizationId: ORG, apply: true, cwd });
    expect(r.migrated).toBe(0);
    expect(r.skipped[0]).toMatchObject({ documentId: id, reason: 'bytes_missing' });
  });

  it('refuses a storage key that resolves outside the uploads root', async () => {
    const id = await insertDoc({ s3_key: '../../etc/passwd', content_hash: 'c'.repeat(64) });
    const r = await migrateVaultStorage(asExec(), storage, { organizationId: ORG, apply: true, cwd });
    expect(r.skipped[0]).toMatchObject({ documentId: id, reason: 'key_escapes_root' });
  });

  it('reports a row with no storage key at all', async () => {
    const id = await insertDoc({ s3_key: null });
    const r = await migrateVaultStorage(asExec(), storage, { organizationId: ORG, apply: true, cwd });
    expect(r.skipped[0]).toMatchObject({ documentId: id, reason: 'no_storage_key' });
  });
});

describe('scope and repeatability', () => {
  it('does not touch another tenant, whose program carries a different org', async () => {
    const { key, hash } = writeLegacy('f.pdf', '%PDF-1.7 f');
    const id = await insertDoc({
      id: '44444444-4444-4444-8444-444444444444',
      program_id: OTHER_PROGRAM, s3_key: key, content_hash: hash,
    });
    const r = await migrateVaultStorage(asExec(), storage, { organizationId: ORG, apply: true, cwd });
    expect(r.examined).toBe(0);
    expect((await rowOf(id)).storage_version_id).toBeNull();
  });

  it('is a no-op on a second run — already-migrated rows are not candidates', async () => {
    const { key, hash } = writeLegacy('g.pdf', '%PDF-1.7 g');
    await insertDoc({ s3_key: key, content_hash: hash });

    const first = await migrateVaultStorage(asExec(), storage, { organizationId: ORG, apply: true, cwd });
    expect(first.migrated).toBe(1);

    const second = await migrateVaultStorage(asExec(), storage, { organizationId: ORG, apply: true, cwd });
    expect(second.examined).toBe(0);
    expect(second.migrated).toBe(0);
    expect(put).toHaveBeenCalledTimes(1);
  });
});

describe('a row with no recorded hash', () => {
  it('is migrated but counted separately, because nothing checked it', async () => {
    // Refusing it would strand it forever — nothing can ever supply the missing
    // hash. Migrating it silently would imply a check that did not happen.
    const { key } = writeLegacy('h.pdf', '%PDF-1.7 h');
    const id = await insertDoc({ s3_key: key, content_hash: null });

    const r = await migrateVaultStorage(asExec(), storage, { organizationId: ORG, apply: true, cwd });
    expect(r.migrated).toBe(1);
    expect(r.migratedUnverified).toBe(1);
    expect((await rowOf(id)).storage_version_id).toBe('ver-1');
  });
});
