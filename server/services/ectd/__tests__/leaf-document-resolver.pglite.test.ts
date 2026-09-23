/**
 * The leaf document resolver — ONE lookup for the readiness assessment, the
 * Builder's source-document column and (through the assessment) the governed
 * freeze / dispatch gate.
 *
 * ── The defect (MDX demo pack, 2026-09-21, finding F5) ───────────────────────
 * A leaf filed from the vault carries `document_uuid` and a pinned
 * `document_content_sha256`; `document_id` is null because vault.documents is
 * uuid-keyed. The readiness validator tested the integer column alone, so every
 * such leaf was reported UNRESOLVED_DOCUMENT and no vault-built sequence could
 * clear the dispatch gate. The Builder's client made the same test and showed
 * "Source document: unlinked".
 *
 * ── What is locked here (real SQL, in-process PGlite) ────────────────────────
 *   • a vault leaf resolves by its uuid, tenant-scoped through the programme,
 *     and its pin is verified against vault.documents.content_hash;
 *   • an integer-keyed leaf (coauthor_documents) still resolves, pin verified
 *     against sha256(content) — the same reading the write side pinned;
 *   • a pin that no longer matches the stored content is `content_changed`,
 *     never silently passed; an unpinned leaf is `resolved` but says so;
 *   • a document that does not exist in the caller's organization — absent, or
 *     owned by another tenant — is `missing`;
 *   • a vault leaf carrying only an integer names nothing (`no_pointer`);
 *   • drift guard: the tables this resolver looks up are exactly the tables the
 *     write side verifies tenancy for and the assembler materializes, and the
 *     uuid-keyed set here is the write side's.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHash } from 'crypto';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  // submission-service (imported below for the drift guard alone) binds `pool`
  // at module load; nothing here runs a statement through it.
  get pool() { return { query: async () => ({ rows: [] }) }; },
}));
vi.mock('../../auditService', () => ({
  default: {
    logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })),
  },
}));

import {
  compareDocumentPin,
  resolveLeafDocument,
  resolveLeafDocuments,
  RESOLVER_DOCUMENT_TABLES,
} from '../leaf-document-resolver';
import { RESOLVABLE_DOCUMENT_TABLES, UUID_KEYED_DOCUMENT_TABLES } from '../leaf-document-tables';
import { LEAF_SOURCE_TENANCY_TABLES, LEAF_UUID_KEYED_TABLES } from '../../submission-service/submission-service';

let harness: IndPgliteDb;
const ORG = 31;
const OTHER_ORG = 32;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM = '22222222-2222-4222-8222-222222222222';
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

let seq = 0;
const nextUuid = () => `4444${(++seq).toString().padStart(4, '0')}-4444-4444-8444-444444444444`;

async function seedVaultDoc(opts: { program?: string; contentHash?: string | null } = {}): Promise<string> {
  const id = nextUuid();
  await harness.pglite.query(
    `INSERT INTO vault.documents (id, program_id, storage_version_id, content_hash, file_name, deleted_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, NULL)`,
    [id, opts.program ?? PROGRAM, `ver-${id}`, opts.contentHash === undefined ? sha(`bytes-${id}`) : opts.contentHash, 'doc.pdf'],
  );
  return id;
}

async function seedCoauthor(opts: { org?: number; content?: string | null } = {}): Promise<number> {
  const r = await harness.pglite.query<{ id: number }>(
    `INSERT INTO coauthor_documents (organization_id, title, content, module_number, status)
     VALUES ($1, $2, $3, $4, 'approved') RETURNING id`,
    [opts.org ?? ORG, 'Clinical Overview', opts.content === undefined ? 'Authored body.' : opts.content, 'm2.5'],
  );
  return Number(r.rows[0].id);
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  await harness.pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE IF NOT EXISTS regulatory_programs (
      id UUID PRIMARY KEY,
      organization_id INTEGER,
      deleted_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS vault.documents (
      id UUID PRIMARY KEY,
      program_id UUID NOT NULL,
      storage_version_id TEXT,
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
});

afterAll(async () => {
  await harness?.close?.();
});

describe('vault_documents — uuid-keyed', () => {
  it('resolves a vault leaf by its uuid and verifies the pin against content_hash', async () => {
    const uuid = await seedVaultDoc();
    const hash = sha(`bytes-${uuid}`);
    const r = await resolveLeafDocument(
      { documentTable: 'vault_documents', documentId: null, documentUuid: uuid, documentContentSha256: hash },
      ORG,
    );
    expect(r.status).toBe('resolved');
    expect(r.keyKind).toBe('uuid');
    expect(r.pin).toBe('match');
    expect(r.storedSha256).toBe(hash);
  });

  it('reports a pin that no longer matches the stored content as content_changed — never silently passed', async () => {
    const uuid = await seedVaultDoc();
    const r = await resolveLeafDocument(
      { documentTable: 'vault_documents', documentId: null, documentUuid: uuid, documentContentSha256: sha('what was filed') },
      ORG,
    );
    expect(r.status).toBe('content_changed');
    expect(r.pin).toBe('mismatch');
    expect(r.pinnedSha256).toBe(sha('what was filed'));
    expect(r.storedSha256).toBe(sha(`bytes-${uuid}`));
  });

  it('is missing when the document belongs to another organization’s programme', async () => {
    const uuid = await seedVaultDoc({ program: OTHER_PROGRAM });
    const r = await resolveLeafDocument(
      { documentTable: 'vault_documents', documentId: null, documentUuid: uuid, documentContentSha256: null },
      ORG,
    );
    expect(r.status).toBe('missing');
  });

  it('is missing when no such document exists', async () => {
    const r = await resolveLeafDocument(
      { documentTable: 'vault_documents', documentId: null, documentUuid: nextUuid(), documentContentSha256: null },
      ORG,
    );
    expect(r.status).toBe('missing');
    expect(r.reason).toMatch(/not found/);
  });

  it('a vault leaf carrying only an integer names nothing (no_pointer)', async () => {
    const r = await resolveLeafDocument(
      { documentTable: 'vault_documents', documentId: 7, documentUuid: null, documentContentSha256: null },
      ORG,
    );
    expect(r.status).toBe('no_pointer');
    expect(r.reason).toMatch(/document_uuid/);
  });
});

describe('coauthor_documents — integer-keyed', () => {
  it('still resolves an integer-keyed leaf, pin verified against sha256(content)', async () => {
    const id = await seedCoauthor({ content: 'Authored body.' });
    const r = await resolveLeafDocument(
      { documentTable: 'coauthor_documents', documentId: id, documentUuid: null, documentContentSha256: sha('Authored body.') },
      ORG,
    );
    expect(r.status).toBe('resolved');
    expect(r.keyKind).toBe('integer');
    expect(r.pin).toBe('match');
  });

  it('resolves an unpinned leaf and says the pin was never taken', async () => {
    const id = await seedCoauthor();
    const r = await resolveLeafDocument(
      { documentTable: 'coauthor_documents', documentId: id, documentUuid: null, documentContentSha256: null },
      ORG,
    );
    expect(r.status).toBe('resolved');
    expect(r.pin).toBe('unpinned');
    expect(r.reason).toMatch(/no content pin/);
  });

  it('is missing for another organization’s document', async () => {
    const id = await seedCoauthor({ org: OTHER_ORG });
    const r = await resolveLeafDocument(
      { documentTable: 'coauthor_documents', documentId: id, documentUuid: null, documentContentSha256: null },
      ORG,
    );
    expect(r.status).toBe('missing');
  });

  it('a pinned leaf whose document content was emptied after filing is content_changed (unverifiable)', async () => {
    const id = await seedCoauthor({ content: '' });
    const r = await resolveLeafDocument(
      { documentTable: 'coauthor_documents', documentId: id, documentUuid: null, documentContentSha256: sha('was here') },
      ORG,
    );
    expect(r.status).toBe('content_changed');
    expect(r.pin).toBe('unverifiable');
  });
});

describe('pointer shape', () => {
  it('names an unplaceable table rather than looking it up', async () => {
    const r = await resolveLeafDocument(
      { documentTable: 'coauthor_doccuments', documentId: 1, documentUuid: null, documentContentSha256: null },
      ORG,
    );
    expect(r.status).toBe('unplaceable_table');
  });

  it('a leaf with no table is no_pointer', async () => {
    const r = await resolveLeafDocument({ documentTable: null, documentId: null, documentUuid: null }, ORG);
    expect(r.status).toBe('no_pointer');
  });

  it('resolves a batch in input order, reading each distinct pointer once', async () => {
    const uuid = await seedVaultDoc();
    const hash = sha(`bytes-${uuid}`);
    const vault = { documentTable: 'vault_documents', documentId: null, documentUuid: uuid, documentContentSha256: hash };
    const out = await resolveLeafDocuments([vault, { documentTable: null, documentId: null }, vault], ORG);
    expect(out.map((r) => r.status)).toEqual(['resolved', 'no_pointer', 'resolved']);
    expect(out[0]).toBe(out[2]);
  });
});

describe('compareDocumentPin (pure)', () => {
  it('unpinned / unverifiable / match / mismatch', () => {
    expect(compareDocumentPin(null, 'abc')).toBe('unpinned');
    expect(compareDocumentPin('abc', null)).toBe('unverifiable');
    expect(compareDocumentPin('ABC', 'abc')).toBe('match');
    expect(compareDocumentPin('abc', 'abd')).toBe('mismatch');
  });
});

describe('drift guard — one vocabulary across write, read and assembly', () => {
  it('looks up exactly the tables the write side verifies and the assembler materializes', () => {
    expect([...RESOLVER_DOCUMENT_TABLES].sort()).toEqual([...LEAF_SOURCE_TENANCY_TABLES].sort());
    expect([...RESOLVER_DOCUMENT_TABLES].sort()).toEqual([...RESOLVABLE_DOCUMENT_TABLES].sort());
  });

  it('the pure uuid-keyed set is the write side’s', () => {
    expect([...UUID_KEYED_DOCUMENT_TABLES].sort()).toEqual([...LEAF_UUID_KEYED_TABLES].sort());
  });
});
