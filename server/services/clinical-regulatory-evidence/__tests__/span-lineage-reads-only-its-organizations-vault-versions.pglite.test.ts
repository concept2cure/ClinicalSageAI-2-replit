/**
 * A lineage read resolves a Vault citation only against the reading
 * organization's own Vault versions.
 *
 * What the code used to do (until 2026-10-15): `withVaultVersions` looked the
 * cited `vault.documents` rows up by id alone. The lineage rows were the
 * caller's organization's, but the Vault lookup was not — so a span whose
 * reference named another organization's version came back `current`, carrying
 * that organization's document title, in both `listDocumentSpans` and
 * `getSelectionOrigins` (which reads on the process-wide pool, outside any
 * request's tenant scope). ci:tenant-isolation flagged the statement.
 *
 * The writer (`replaceVaultFigureSpans`) refuses such a span, so the row is
 * inserted directly here: the read must not depend on every row having come
 * through that one writer.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Queryable } from '../span-lineage.service';

let pglite: PGlite;
const pool: Queryable = {
  query: async <R = any>(sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as R[], rowCount: r.rows.length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) } }));

import * as lineage from '../span-lineage.service';

const ORG_A = 711;
const ORG_B = 822;
const HASH = 'b'.repeat(64);
const MINE = '11111111-1111-4111-8111-111111111111';
const THEIRS = '22222222-2222-4222-8222-222222222222';
const DOC = { documentTable: 'authoring_sections', documentId: 'sec-vault-scope' };

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

async function vaultSpan(charStart: number, charEnd: number, vaultDocumentId: string): Promise<void> {
  await pool.query(
    `INSERT INTO document_span_lineage (document_table, document_id, char_start, char_end, span_text_sha256,
       provenance_kind, source, reference_id, payload_sha256, usage, organization_id)
     VALUES ($1, $2, $3, $4, $5, 'vault_document', 'vault_document', $6, $7, 'derived', $8)`,
    [DOC.documentTable, DOC.documentId, charStart, charEnd, 'e'.repeat(64), vaultDocumentId, HASH, ORG_A],
  );
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG_A},'a'), (${ORG_B},'b');`);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
  await pglite.exec(migration('migrations/20260907_span_lineage_accepted_machine_draft.sql'));
  await pglite.exec(migration('migrations/20260908_span_lineage_machine_draft.sql'));
  // Only the columns the lineage read touches.
  await pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY, organization_id int NOT NULL,
      content_hash text, document_title text, deleted_at timestamptz);`);
  await pool.query(
    `INSERT INTO vault.documents (id, organization_id, content_hash, document_title)
     VALUES ($1, $2, $3, 'Our clinical study report'), ($4, $5, $3, 'Their clinical study report')`,
    [MINE, ORG_A, HASH, THEIRS, ORG_B],
  );
  await vaultSpan(0, 5, MINE);
  await vaultSpan(5, 10, THEIRS);
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

describe("a lineage read resolves a Vault citation only against its own organization's versions", () => {
  it('listDocumentSpans: its own version is current; another organization\'s is unresolved and untitled', async () => {
    const spans = await lineage.listDocumentSpans(ORG_A, DOC, pool);
    const mine = spans.find((s) => s.referenceId === MINE);
    const theirs = spans.find((s) => s.referenceId === THEIRS);
    expect(mine).toMatchObject({ state: 'current', sourceTitle: 'Our clinical study report' });
    expect(theirs?.sourceTitle, "another organization's Vault title must not be read").toBeNull();
    expect(theirs?.state).toBe('unresolved');
  });

  it('getSelectionOrigins (process-wide pool): the same, for a selection across both spans', async () => {
    const { origins } = await lineage.getSelectionOrigins(ORG_A, DOC, 0, 10);
    const mine = origins.find((s) => s.referenceId === MINE);
    const theirs = origins.find((s) => s.referenceId === THEIRS);
    expect(mine).toMatchObject({ state: 'current', sourceTitle: 'Our clinical study report' });
    expect(theirs?.sourceTitle, "another organization's Vault title must not be read").toBeNull();
    expect(theirs?.state).toBe('unresolved');
  });
});
