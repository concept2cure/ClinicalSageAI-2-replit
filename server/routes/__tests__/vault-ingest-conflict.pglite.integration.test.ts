/**
 * POST /api/vault/ingest — a re-upload never destroys the governed record.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The route's ON CONFLICT (program_id, document_code, version) DO UPDATE
 * replaced s3_key, content_hash, file_size, file_name and extracted_text on the
 * existing row. Uploading DIFFERENT bytes under the same code and version
 * therefore erased the record of what had been admitted — the prior hash, the
 * one the audit trail says was checked, was simply gone from the row.
 *
 * It was not an edge case. `version` is a free-text client field defaulting to
 * '1.0', and useVaultUpload.ts sends the raw filename as document_code, so the
 * default client path collides on the second upload of any file with a repeated
 * name. Uploading Protocol.pdf twice erased the first.
 *
 * ── Why this test extracts the real SQL ──────────────────────────────────────
 * The behaviour under test IS the ON CONFLICT clause, and a paraphrase of it in
 * a fixture would drift from the route without either one failing. So the clause
 * is pulled out of vault-ingest.service.ts by regex and executed against a real
 * PostgreSQL (PGlite) — if someone edits or removes the predicate, the extract
 * fails or the assertions do.
 *
 * The last case runs the clause with the predicate STRIPPED, to hold the defect
 * itself: it must still be possible to demonstrate the destruction the predicate
 * prevents. Without that, a future "simplification" that removes the WHERE could
 * leave every other assertion passing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/* The governed ingest moved out of the route into the vault service — ONE
   implementation, so the AnA tool that files a chat upload performs the same
   admission. This test reads it where it now lives; pointing at the route
   would silently stop testing anything, since the SQL is no longer there. */
const ROUTE = fs.readFileSync(
  path.join(repoRoot, 'server', 'services', 'vault', 'vault-ingest.service.ts'),
  'utf8',
);

/** The shipped ON CONFLICT clause, including its refusal predicate. */
const ON_CONFLICT = (() => {
  const m = ROUTE.match(
    /ON CONFLICT \(program_id, document_code, version\) DO UPDATE SET[\s\S]*?WHERE vault\.documents\.content_hash = EXCLUDED\.content_hash/,
  );
  if (!m) {
    throw new Error(
      'Could not find the ON CONFLICT clause with its content_hash predicate in vault-ingest.service.ts. ' +
        'If the refusal was removed, a re-upload destroys the governed record again — see this file header.',
    );
  }
  return m[0];
})();

const PROG = '11111111-1111-1111-1111-111111111111';
let db: PGlite;

async function ingest(
  clause: string,
  o: { code: string; version: string; hash: string; key: string },
): Promise<{ rows?: Record<string, unknown>[]; errCode?: string }> {
  const sql = `
    INSERT INTO vault.documents (
      program_id, organization_id, document_code, document_title, document_type, version,
      s3_bucket, s3_key, file_name, file_size, mime_type, content_hash,
      classification, placement_status, processing_status
    ) VALUES ($1,1,$2,'t','CSR',$3,'local',$4,'f.pdf',10,'application/pdf',$5,'INTERNAL','unfiled','PENDING')
    ${clause}
    RETURNING id, content_hash, s3_key`;
  try {
    const r = await db.query<Record<string, unknown>>(sql, [
      PROG,
      o.code,
      o.version,
      o.key,
      o.hash,
    ]);
    return { rows: r.rows };
  } catch (e: unknown) {
    return { errCode: (e as { code?: string })?.code ?? 'UNKNOWN' };
  }
}

const recorded = async (code: string) =>
  (
    await db.query<{ content_hash: string; s3_key: string }>(
      `SELECT content_hash, s3_key FROM vault.documents WHERE document_code = $1`,
      [code],
    )
  ).rows[0];

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id UUID NOT NULL,
      -- The ingest INSERT writes this (added after the fixture was first
      -- written, by the change that made a new vault upload attributable).
      -- Omitting it made every statement here fail 42703 rather than exercise
      -- the ON CONFLICT clause — which is the fixture drifting from the route,
      -- exactly what extracting the real SQL is meant to surface.
      organization_id INTEGER,
      document_code TEXT NOT NULL,
      document_title TEXT, document_type TEXT,
      version TEXT DEFAULT '1.0',
      s3_bucket TEXT, s3_key TEXT, file_name TEXT, file_size BIGINT, mime_type TEXT,
      content_hash TEXT NOT NULL,
      classification TEXT, retention_policy TEXT,
      parent_document_id UUID, supersedes_id UUID,
      extracted_text TEXT, page_count INT, word_count INT,
      folder_id TEXT, evidence_kind TEXT, ctd_section TEXT,
      placement_status TEXT NOT NULL DEFAULT 'unfiled',
      placement_confidence TEXT, placement_rationale TEXT,
      placed_by INT, placed_at TIMESTAMPTZ,
      processing_status TEXT, created_by INT,
      -- The tenant key the real table carries (its own migration) and the
      -- ingest writes; the retrieval path filters on it, so a row left NULL is
      -- an orphan no tenant can retrieve.
      organization_id INT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT vault_documents_program_doc_version UNIQUE (program_id, document_code, version)
    );
    -- The SECOND unique constraint, which the ON CONFLICT clause does NOT target:
    -- db/migrations/044c_gcc_vault_schema.sql:106.
    CREATE UNIQUE INDEX idx_vault_documents_program_hash_unique
      ON vault.documents(program_id, content_hash);
  `);
});

afterAll(async () => {
  await db?.close?.();
});

describe('re-upload at the same code and version', () => {
  it('inserts the first upload', async () => {
    const r = await ingest(ON_CONFLICT, {
      code: 'Protocol.pdf',
      version: '1.0',
      hash: 'HASH_A',
      key: 'uploads/a.pdf',
    });
    expect(r.rows).toHaveLength(1);
  });

  it('is idempotent for identical bytes — a retry still succeeds', async () => {
    // A dropped connection mid-upload must remain retryable. The refusal is for
    // DIFFERENT content, not for the same content arriving twice.
    const r = await ingest(ON_CONFLICT, {
      code: 'Protocol.pdf',
      version: '1.0',
      hash: 'HASH_A',
      key: 'uploads/a.pdf',
    });
    expect(r.rows).toHaveLength(1);
  });

  it('returns NO row for different bytes, which the route turns into a 409', async () => {
    const r = await ingest(ON_CONFLICT, {
      code: 'Protocol.pdf',
      version: '1.0',
      hash: 'HASH_B',
      key: 'uploads/b.pdf',
    });
    expect(r.rows).toHaveLength(0);
  });

  it('leaves the original hash and storage key untouched', async () => {
    // The whole point: the record of what was admitted survives the attempt.
    expect(await recorded('Protocol.pdf')).toMatchObject({
      content_hash: 'HASH_A',
      s3_key: 'uploads/a.pdf',
    });
  });

  it('accepts the new bytes under a new version', async () => {
    const r = await ingest(ON_CONFLICT, {
      code: 'Protocol.pdf',
      version: '2.0',
      hash: 'HASH_B',
      key: 'uploads/b.pdf',
    });
    expect(r.rows).toHaveLength(1);
  });
});

describe('the second unique constraint', () => {
  it('raises 23505 for the same bytes under a different code', async () => {
    // (program_id, content_hash) is unique, and the ON CONFLICT targets the
    // other constraint — so this was an UNHANDLED 23505 and a 500. It is the
    // case a user hits first, by filing one PDF under two names, and it is a
    // refusal rather than a server error. The route maps it to 409
    // DUPLICATE_CONTENT.
    const r = await ingest(ON_CONFLICT, {
      code: 'Protocol-copy.pdf',
      version: '1.0',
      hash: 'HASH_A',
      key: 'uploads/a.pdf',
    });
    expect(r.errCode).toBe('23505');
  });

  it('is handled by the route rather than falling through to INGEST_FAILED', () => {
    expect(ROUTE).toMatch(/err\?\.code === '23505'/);
    expect(ROUTE).toContain('DUPLICATE_CONTENT');
  });
});

describe('the defect the predicate prevents is still demonstrable', () => {
  it('WITHOUT the predicate, the same upload overwrites the recorded hash', async () => {
    const destructive = ON_CONFLICT.replace(
      /\s*WHERE vault\.documents\.content_hash = EXCLUDED\.content_hash$/,
      '',
    );
    expect(destructive).not.toContain('WHERE vault.documents.content_hash');

    await db.exec(`DELETE FROM vault.documents`);
    await ingest(ON_CONFLICT, { code: 'X', version: '1.0', hash: 'HASH_A', key: 'uploads/a.pdf' });
    await ingest(destructive, { code: 'X', version: '1.0', hash: 'HASH_B', key: 'uploads/b.pdf' });

    // This is what shipped: the governed record now describes bytes nobody
    // admitted, and the hash the audit trail recorded is gone from the row.
    expect(await recorded('X')).toMatchObject({ content_hash: 'HASH_B' });
  });
});
