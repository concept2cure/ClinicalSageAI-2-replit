/**
 * Vault document index — the read model behind the public API's `documents:read`.
 *
 * END-TO-END against real Postgres (in-process PGlite), because the properties
 * under test are SQL properties. A mocked pool would let every one of these
 * pass against a predicate that does not isolate anything.
 *
 * The load-bearing test is "trusts the programme, not the column": the service
 * must scope through `regulatory_programs`, because
 * `vault.documents.organization_id` is nullable by design and its own schema
 * comment records that it "does NOT by itself isolate tenants".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as unknown[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../../db/runtime', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) } }));

import {
  listVaultDocuments,
  getVaultDocument,
  isUuid,
  VaultStoreUnavailableError,
  VAULT_CLASSIFICATIONS,
  VAULT_PROCESSING_STATUSES,
} from '../vault-document-index.service';

const ORG = 11;
const OTHER_ORG = 22;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM = '22222222-2222-4222-8222-222222222222';
const GONE_PROGRAM = '33333333-3333-4333-8333-333333333333';

const DDL = `
  CREATE SCHEMA IF NOT EXISTS vault;
  CREATE TYPE vault.document_classification AS ENUM ('CONFIDENTIAL','INTERNAL','CONTROLLED','PUBLIC');
  CREATE TYPE vault.processing_status AS ENUM ('PENDING','EXTRACTING','VECTORIZING','INDEXED','FAILED','ARCHIVED');
  CREATE TABLE regulatory_programs (
    id UUID PRIMARY KEY,
    organization_id INTEGER,
    deleted_at TIMESTAMPTZ
  );
  CREATE TABLE vault.documents (
    id UUID PRIMARY KEY,
    program_id UUID NOT NULL,
    organization_id INTEGER,
    document_code TEXT NOT NULL,
    document_title TEXT NOT NULL,
    document_type TEXT NOT NULL,
    version TEXT,
    s3_bucket TEXT,
    s3_key TEXT,
    storage_version_id TEXT,
    storage_provider TEXT,
    file_name TEXT NOT NULL,
    file_size BIGINT,
    mime_type TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    classification vault.document_classification NOT NULL DEFAULT 'INTERNAL',
    processing_status vault.processing_status NOT NULL DEFAULT 'PENDING',
    extracted_text TEXT,
    page_count INTEGER,
    word_count INTEGER,
    language TEXT,
    retention_policy TEXT,
    retention_until DATE,
    folder_id TEXT,
    evidence_kind TEXT,
    ctd_section TEXT,
    placement_status TEXT NOT NULL DEFAULT 'unfiled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );
`;

let seq = 0;
async function seed(over: Record<string, unknown> = {}): Promise<string> {
  seq += 1;
  const id = `44444444-4444-4444-8444-${String(seq).padStart(12, '0')}`;
  const row = {
    program_id: PROGRAM,
    organization_id: ORG,
    document_code: `DOC-${seq}`,
    document_title: `Document ${seq}`,
    document_type: 'csr',
    version: '1.0',
    s3_bucket: 'secret-bucket',
    s3_key: 'secret/key/path.pdf',
    storage_version_id: 'ver-secret',
    storage_provider: 'local',
    file_name: `doc-${seq}.pdf`,
    file_size: 1024,
    mime_type: 'application/pdf',
    content_hash: `hash-${seq}`,
    classification: 'INTERNAL',
    processing_status: 'INDEXED',
    extracted_text: 'CONFIDENTIAL CLINICAL NARRATIVE — must never leave via the index',
    placement_status: 'unfiled',
    deleted_at: null,
    ...over,
  } as Record<string, unknown>;
  const cols = Object.keys(row);
  const ph = cols.map((_, i) => `$${i + 2}`).join(',');
  await pglite.query(
    `INSERT INTO vault.documents (id, ${cols.join(',')}) VALUES ($1::uuid, ${ph})`,
    [id, ...cols.map((c) => row[c])],
  );
  return id;
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
});

afterAll(async () => {
  await pglite?.close?.();
});

beforeEach(async () => {
  await pglite.exec('DELETE FROM vault.documents; DELETE FROM regulatory_programs;');
  await pglite.query(
    `INSERT INTO regulatory_programs (id, organization_id, deleted_at) VALUES
       ($1::uuid,$2,NULL), ($3::uuid,$4,NULL), ($5::uuid,$6,now())`,
    [PROGRAM, ORG, OTHER_PROGRAM, OTHER_ORG, GONE_PROGRAM, ORG],
  );
});

const list = (over: Record<string, unknown> = {}) =>
  listVaultDocuments({ organizationId: ORG, limit: 50, offset: 0, ...over } as any);

describe('vault document index — tenant isolation', () => {
  it('returns only documents whose programme belongs to the organization', async () => {
    const mine = await seed({});
    await seed({ program_id: OTHER_PROGRAM, organization_id: OTHER_ORG });

    const out = await list();
    expect(out.documents.map((d) => d.id)).toEqual([mine]);
    expect(out.total).toBe(1);
  });

  it('TRUSTS THE PROGRAMME, NOT THE COLUMN: a row whose organization_id claims this tenant but whose programme belongs to another is invisible', async () => {
    // The exact shape vault.documents.organization_id cannot be relied on for:
    // the column says ORG, the authoritative owner (the programme) says
    // OTHER_ORG. A predicate written against the column leaks this row.
    const spoofed = await seed({ program_id: OTHER_PROGRAM, organization_id: ORG });

    const out = await list();
    expect(out.documents).toEqual([]);
    expect(out.total).toBe(0);
    expect(await getVaultDocument(ORG, spoofed)).toBeNull();
  });

  it('an unattributable row (organization_id NULL) is still reachable through its programme', async () => {
    // NULL means "unattributable", not "nobody's". The programme still owns it,
    // so withholding it from its real owner would be the opposite error.
    const id = await seed({ organization_id: null });
    const out = await list();
    expect(out.documents.map((d) => d.id)).toEqual([id]);
  });

  it("getVaultDocument returns null for another tenant's document, identically to a missing one", async () => {
    const theirs = await seed({ program_id: OTHER_PROGRAM, organization_id: OTHER_ORG });
    expect(await getVaultDocument(ORG, theirs)).toBeNull();
    expect(await getVaultDocument(ORG, '99999999-9999-4999-8999-999999999999')).toBeNull();
  });

  it('excludes soft-deleted documents and documents on a soft-deleted programme', async () => {
    const live = await seed({});
    await seed({ deleted_at: new Date().toISOString() });
    await seed({ program_id: GONE_PROGRAM });

    const out = await list();
    expect(out.documents.map((d) => d.id)).toEqual([live]);
    expect(out.total).toBe(1);
  });

  it('excludes an orphan whose programme row does not exist at all', async () => {
    await seed({ program_id: '88888888-8888-4888-8888-888888888888' });
    const out = await list();
    expect(out.documents).toEqual([]);
    expect(out.total).toBe(0);
  });
});

describe('vault document index — disclosure boundary', () => {
  it('never discloses bytes, extracted text, or storage addressing', async () => {
    await seed({});
    const out = await list();
    const doc = out.documents[0];
    expect(doc).toBeTruthy();

    // Walk the whole serialized projection, not just its top-level keys: a
    // nested object would hide a leak from an own-key check.
    const serialized = JSON.stringify(doc);
    for (const forbidden of [
      'extracted_text', 'extractedText', 'CONFIDENTIAL CLINICAL NARRATIVE',
      's3_bucket', 's3Bucket', 'secret-bucket',
      's3_key', 's3Key', 'secret/key/path.pdf',
      'storage_version_id', 'storageVersionId', 'ver-secret',
      'storage_provider', 'storageProvider',
    ]) {
      expect(serialized, `projection leaked ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('projects the metadata a client actually needs, with file_size as a number', async () => {
    const id = await seed({ file_size: 987654321, page_count: 12, ctd_section: '3.2.P.5' });
    const doc = await getVaultDocument(ORG, id);
    expect(doc).toMatchObject({
      id,
      programId: PROGRAM,
      documentType: 'csr',
      mimeType: 'application/pdf',
      classification: 'INTERNAL',
      processingStatus: 'INDEXED',
      pageCount: 12,
    });
    // bigint arrives from node-postgres as a string; an unconverted value would
    // serialize as "987654321" and quietly change the field's type for clients.
    expect(doc!.fileSize).toBe(987654321);
    expect(typeof doc!.fileSize).toBe('number');
    expect(doc!.placement.ctdSection).toBe('3.2.P.5');
  });
});

describe('vault document index — filters and paging', () => {
  it('filters by classification, processing status, type, programme and CTD section', async () => {
    const target = await seed({ classification: 'CONFIDENTIAL', processing_status: 'FAILED', document_type: 'protocol', ctd_section: '5.3.5.1' });
    await seed({});

    expect((await list({ classification: 'CONFIDENTIAL' })).documents.map((d) => d.id)).toEqual([target]);
    expect((await list({ processingStatus: 'FAILED' })).documents.map((d) => d.id)).toEqual([target]);
    expect((await list({ documentType: 'protocol' })).documents.map((d) => d.id)).toEqual([target]);
    expect((await list({ ctdSection: '5.3.5.1' })).documents.map((d) => d.id)).toEqual([target]);
    expect((await list({ programId: OTHER_PROGRAM })).documents).toEqual([]);
  });

  it('counts the total over the SAME predicate as the page, filters included', async () => {
    for (let i = 0; i < 5; i++) await seed({ classification: 'CONTROLLED' });
    await seed({ classification: 'PUBLIC' });

    const page = await list({ limit: 2, offset: 0, classification: 'CONTROLLED' });
    expect(page.documents).toHaveLength(2);
    // 5, not 6: a total taken over a different set than the rows is how a
    // window lies about the size of the cabinet.
    expect(page.total).toBe(5);
  });

  it('pages without repeating or skipping a row when updated_at ties', async () => {
    const stamp = '2026-01-01T00:00:00Z';
    for (let i = 0; i < 6; i++) await seed({ updated_at: stamp });

    const seen: string[] = [];
    for (let offset = 0; offset < 6; offset += 2) {
      const page = await list({ limit: 2, offset });
      seen.push(...page.documents.map((d) => d.id));
    }
    expect(new Set(seen).size).toBe(6);
  });
});

describe('vault document index — honest failure', () => {
  it('throws VaultStoreUnavailableError when the vault schema is absent, rather than reporting an empty cabinet', async () => {
    const bare = new PGlite();
    await bare.exec('CREATE TABLE regulatory_programs (id UUID PRIMARY KEY, organization_id INTEGER, deleted_at TIMESTAMPTZ);');
    const real = pglite;
    pglite = bare;
    try {
      await expect(list()).rejects.toBeInstanceOf(VaultStoreUnavailableError);
      await expect(getVaultDocument(ORG, PROGRAM)).rejects.toBeInstanceOf(VaultStoreUnavailableError);
    } finally {
      pglite = real;
      await bare.close();
    }
  });

  it('does not swallow an unrelated database error as "store unavailable"', async () => {
    const real = pglite;
    const broken = {
      query: async () => {
        throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
      },
    };
    pglite = broken as unknown as PGlite;
    try {
      await expect(list()).rejects.toThrow('deadlock detected');
      await expect(list()).rejects.not.toBeInstanceOf(VaultStoreUnavailableError);
    } finally {
      pglite = real;
    }
  });
});

describe('vault document index — exported domains', () => {
  it('exposes the schema enum values rather than a restated copy', () => {
    expect(VAULT_CLASSIFICATIONS).toEqual(['CONFIDENTIAL', 'INTERNAL', 'CONTROLLED', 'PUBLIC']);
    expect(VAULT_PROCESSING_STATUSES).toEqual(['PENDING', 'EXTRACTING', 'VECTORIZING', 'INDEXED', 'FAILED', 'ARCHIVED']);
  });

  it('isUuid accepts a real uuid and rejects injection-shaped input', () => {
    expect(isUuid(PROGRAM)).toBe(true);
    expect(isUuid("' OR 1=1 --")).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});
