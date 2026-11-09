/**
 * A filing section drafted from a Vault version is listed as changed once a later version of that document is approved
 * (S12; founder decisions P-83, P-109, option (A) of 2026-11-09). End to end on in-process PGlite, with the authoring
 * read scope's real tables, the span lineage's real migrations and the Vault's own family readers
 * (vault-version-family.ts). The Vault tables carry only the columns those readers and the lifecycle read touch, as
 * span-lineage-reads-only-its-organizations-vault-versions.pglite.test.ts does.
 */
import { seedSourceReadParents } from './source-read-fixture';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const pool = {
  query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]) => {
    const r = await pglite.query<R>(sql, params);
    return { rows: r.rows, rowCount: (r as { affectedRows?: number }).affectedRows ?? r.rows.length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) } }));

import { listChangedVaultCitations, listVaultFedSections } from '../vault-citation-changes';

const ORG_A = 931;
const ORG_B = 942;
const PROGRAM_A = '66666666-6666-4666-8666-666666666666';
const PROGRAM_B = '77777777-7777-4777-8777-777777777777';

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

async function section(orgId: number, programId: string, code: string): Promise<string> {
  const docId = crypto.randomUUID();
  const sectionId = crypto.randomUUID();
  await pool.query(`INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id, client_program_id)
    VALUES ($1, 'Module 3 quality', 'M3', 'draft', '1', $2, $3)`, [docId, orgId, programId]);
  await pool.query(`INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id)
    VALUES ($1, $2, $3, $4, '', $5)`, [sectionId, docId, code, `Section ${code}`, orgId]);
  return sectionId;
}

/** A version of a Vault document (a family is program + document code); `after` is the version it supersedes. */
async function version(orgId: number, programId: string, code: string, label: string, after: string | null = null): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(`INSERT INTO vault.documents (id, organization_id, program_id, document_code, version, document_title, supersedes_id)
    VALUES ($1, $2, $3, $4, $5, 'Drug substance specification', $6)`, [id, orgId, programId, code, label, after]);
  return id;
}

/** The version's lifecycle record at a stage (vault-lifecycle.ts: one canonical_documents row per version). */
async function stage(orgId: number, vaultId: string, at: string): Promise<void> {
  await pool.query(`INSERT INTO canonical_documents (canonical_id, organization_id, source_refs, stage)
    VALUES ($1, $2, jsonb_build_object('vault_documents', jsonb_build_object('nativeId', $3::text)), $4)`,
  [crypto.randomUUID(), orgId, vaultId, at]);
}

/** A drafted figure the version states, in the section (span-lineage-vault.ts's row shape). */
async function drafted(orgId: number, sectionId: string, vaultId: string, start = 0): Promise<void> {
  await pool.query(`INSERT INTO document_span_lineage (document_table, document_id, char_start, char_end, span_text_sha256,
      provenance_kind, source, reference_id, payload_sha256, usage, organization_id)
    VALUES ('authoring_sections', $1, $2, $3, $4, 'vault_document', 'vault_document', $5, $6, 'derived', $7)`,
  [sectionId, start, start + 5, 'e'.repeat(64), vaultId, 'b'.repeat(64), orgId]);
}

const changes = (orgId = ORG_A, programId = PROGRAM_A) => listChangedVaultCitations(pool, orgId, { userId: 1, programId });

beforeAll(async () => {
  pglite = new PGlite();
  await seedSourceReadParents(pglite, [ORG_A, ORG_B], [PROGRAM_A, PROGRAM_B]);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260725_authoring_document_loop_tables.sql'));
  await pglite.exec(migration('db/migrations/20260817_doc_revisions_immutable_ledger.sql'));
  await pglite.exec(migration('db/migrations/20260730_authoring_comments_router_columns.sql'));
  await pglite.exec(migration('migrations/20260727_authoring_document_program_scope.sql'));
  await pglite.exec(migration('db/migrations/20260727_authoring_object_permissions.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
  await pglite.exec(migration('migrations/20260907_span_lineage_accepted_machine_draft.sql'));
  await pglite.exec(migration('migrations/20260908_span_lineage_machine_draft.sql'));
  // The family's uploader is named through public.actor_name (migrations/20260929_actor_names.sql, which installs it
  // only where its own preconditions hold), with the same signature.
  await pglite.exec(`CREATE OR REPLACE FUNCTION public.actor_name(p_user_id integer) RETURNS TABLE(name text, email text)
    LANGUAGE sql STABLE AS $$ SELECT u.name::text, u.email::text FROM users u WHERE u.id = p_user_id $$;`);
  await pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY, organization_id int NOT NULL, program_id uuid, document_code text,
      version text, document_title text, supersedes_id uuid, deleted_at timestamptz, content_hash text, file_size bigint,
      file_name text, created_by int, restored_from_id uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
    CREATE TABLE canonical_documents (canonical_id text PRIMARY KEY, organization_id int NOT NULL, source_refs jsonb,
      stage text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());`);
}, 90_000);
afterAll(async () => { await pglite.close(); }, 30_000);

describe('a section drafted from a Vault version, once a later version is approved (S12)', () => {
  it('is listed, naming the cited version and the approved one; a later draft alone does not list it', async () => {
    const sectionId = await section(ORG_A, PROGRAM_A, '3.2.S.4.1');
    const v1 = await version(ORG_A, PROGRAM_A, 'DS-SPEC', '1.0');
    await stage(ORG_A, v1, 'approved');
    await drafted(ORG_A, sectionId, v1);
    const v2 = await version(ORG_A, PROGRAM_A, 'DS-SPEC', '2.0', v1);
    await stage(ORG_A, v2, 'in_review');
    expect((await changes()).filter((c) => c.sectionId === sectionId)).toEqual([]);
    await pool.query("UPDATE canonical_documents SET stage = 'approved' WHERE source_refs->'vault_documents'->>'nativeId' = $1", [v2]);
    const [change] = (await changes()).filter((c) => c.sectionId === sectionId);
    expect(change).toMatchObject({ sectionCode: '3.2.S.4.1', citedVaultId: v1, citedVersion: '1.0', approvedVaultId: v2,
      approvedVersion: '2.0', vaultTitle: 'Drug substance specification', spans: 1 });
  });

  it('names the latest approved version across several, and a section citing it is not listed', async () => {
    const oldSection = await section(ORG_A, PROGRAM_A, '3.2.P.5.1');
    const v1 = await version(ORG_A, PROGRAM_A, 'DP-SPEC', '1.0');
    await drafted(ORG_A, oldSection, v1);
    const v2 = await version(ORG_A, PROGRAM_A, 'DP-SPEC', '2.0', v1);
    await stage(ORG_A, v2, 'placed');
    const v3 = await version(ORG_A, PROGRAM_A, 'DP-SPEC', '3.0', v2);
    await stage(ORG_A, v3, 'approved');
    const freshSection = await section(ORG_A, PROGRAM_A, '3.2.P.5.6');
    await drafted(ORG_A, freshSection, v3);
    const listed = await changes();
    expect(listed.filter((c) => c.sectionId === oldSection).map((c) => c.approvedVersion)).toEqual(['3.0']);
    expect(listed.filter((c) => c.sectionId === freshSection)).toEqual([]);
  });

  it('is not listed once its span is retired, nor through a link the family rule refuses', async () => {
    const retired = await section(ORG_A, PROGRAM_A, '3.2.S.2.2');
    const v1 = await version(ORG_A, PROGRAM_A, 'DS-PROCESS', '1.0');
    await drafted(ORG_A, retired, v1);
    await stage(ORG_A, await version(ORG_A, PROGRAM_A, 'DS-PROCESS', '2.0', v1), 'approved');
    await pool.query('UPDATE document_span_lineage SET deleted_at = now() WHERE document_id = $1', [retired]);
    // A row naming v1 as its predecessor under another document code is not v1's next version.
    const other = await section(ORG_A, PROGRAM_A, '3.2.S.3.1');
    const w1 = await version(ORG_A, PROGRAM_A, 'DS-CHAR', '1.0');
    await drafted(ORG_A, other, w1);
    await stage(ORG_A, await version(ORG_A, PROGRAM_A, 'DS-IMPURITIES', '2.0', w1), 'approved');
    const listed = await changes();
    expect(listed.filter((c) => c.sectionId === retired || c.sectionId === other)).toEqual([]);
  });

  it("reads only its own organization's sections and versions", async () => {
    const theirs = await section(ORG_B, PROGRAM_B, '3.2.S.4.1');
    const t1 = await version(ORG_B, PROGRAM_B, 'DS-SPEC', '1.0');
    await drafted(ORG_B, theirs, t1);
    await stage(ORG_B, await version(ORG_B, PROGRAM_B, 'DS-SPEC', '2.0', t1), 'approved');
    // Organization A's section naming organization B's version is not resolved against it.
    const mine = await section(ORG_A, PROGRAM_A, '3.2.S.7.1');
    await drafted(ORG_A, mine, t1);
    expect((await changes()).some((c) => c.sectionId === theirs || c.sectionId === mine)).toBe(false);
    expect((await changes(ORG_B, PROGRAM_B)).map((c) => c.sectionId)).toEqual([theirs]);
  });

  it('the program map lists every Vault-fed section with its standing, current or replaced (S12 gap 5)', async () => {
    const replaced = await section(ORG_A, PROGRAM_A, '3.2.P.3.3');
    const current = await section(ORG_A, PROGRAM_A, '3.2.P.3.4');
    const m1 = await version(ORG_A, PROGRAM_A, 'DP-MFG', '1.0');
    await drafted(ORG_A, replaced, m1);
    const m2 = await version(ORG_A, PROGRAM_A, 'DP-MFG', '2.0', m1);
    await stage(ORG_A, m2, 'approved');
    await drafted(ORG_A, current, m2);
    const fed = await listVaultFedSections(pool, ORG_A, { userId: 1, programId: PROGRAM_A });
    expect(fed.find((f) => f.sectionId === replaced)).toMatchObject({ state: 'replaced', citedVersion: '1.0', approvedVaultId: m2, approvedVersion: '2.0' });
    expect(fed.find((f) => f.sectionId === current)).toMatchObject({ state: 'current', citedVersion: '2.0', approvedVaultId: null, approvedVersion: null });
    // The changed list is the replaced half of the same read.
    const changed = await changes();
    expect(changed.some((c) => c.sectionId === replaced)).toBe(true);
    expect(changed.some((c) => c.sectionId === current)).toBe(false);
  });
});
