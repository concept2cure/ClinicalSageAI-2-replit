/**
 * A filing holds only its own project's documents (PF-11, the placement half;
 * LX-11, the ledger half).
 *
 * upsertLeaf proved a leaf's document belongs to the caller's ORGANIZATION.
 * Nothing compared projects: a Vault document of project B could be placed into
 * project A's sequence, pinned, and transmitted in A's filing. Now, when both
 * are recorded — the document's project, and the project of the submission the
 * sequence belongs to (submissions.program_id, LX-22) — they must be the same,
 * or the placement is refused 409 CROSS_PROJECT and nothing is written. When the
 * submission records no project (created before submissions carried one), the
 * placement cannot be judged and is allowed, and the ledger records both sides
 * so it can be judged later.
 *
 * The LEAF_CREATED / LEAF_UPDATED ledger rows used to carry the sequence, the
 * section and a reason — not the document placed or the pin it took. They now
 * name the document (table and id or uuid), the pin, and both projects.
 *
 * Real SQL on in-process PGlite: the harness's submission core and governed
 * sections, the program table, and the vault table as the ingest writes it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import { VAULT_DDL } from '../../../routes/__tests__/_authoring-canvas-fixture';

const holder = vi.hoisted(() => ({ db: null as any, pool: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  get pool() { return holder.pool; },
}));
const logAction = vi.hoisted(() => vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })));
vi.mock('../../auditService', () => ({ default: { logAction } }));

import { upsertLeaf, SubmissionError } from '../submission-service';

let harness: IndPgliteDb;
const CTX = { organizationId: 1, userId: 9 };
const P_A = '0a000000-0000-4000-8000-00000000000a';
const P_B = '0b000000-0000-4000-8000-00000000000b';
const V_A = 'a1000000-0000-4000-8000-0000000000a1';
const V_B = 'b1000000-0000-4000-8000-0000000000b1';
// P_B's, with no organization attribution: vault.documents.organization_id is
// nullable (20260905 leaves rows it cannot attribute NULL).
const V_N = 'b2000000-0000-4000-8000-0000000000b2';

let SEQ_A = 0; // on a submission anchored to P_A
let SEQ_L = 0; // on a submission with no recorded project
let SECTION_B = 0; // a governed section of P_B's filing document
let COPY_B = 0; // an authoring filing copy (coauthor_documents) of P_B's document
const DOC_B = 'd0c00000-0000-4000-8000-0000000000b0';
const ROOT = join(__dirname, '..', '..', '..', '..');

async function q<T = any>(text: string, params: unknown[] = []) {
  return (await harness.pglite.query<T>(text, params)).rows;
}

async function sequenceOn(programId: string | null): Promise<number> {
  const [s] = await q<{ id: number }>(
    `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, organization_id, created_by, program_id)
     VALUES ('IND', 'Alpha', 'ind', 'pharma', 'fda', $1, $2, $3) RETURNING id`,
    [CTX.organizationId, CTX.userId, programId],
  );
  const [seq] = await q<{ id: number }>(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, organization_id, created_by)
     VALUES ($1, 'fda', '0000', 'draft', $2, $3) RETURNING id`,
    [Number(s.id), CTX.organizationId, CTX.userId],
  );
  return Number(seq.id);
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, governedSections: true, programSpine: true });
  holder.db = harness.db;
  holder.pool = { query: (text: string, params?: unknown[]) => harness.pglite.query(text, params as unknown[]) };
  await harness.pglite.exec(VAULT_DDL);

  for (const [id, code] of [[P_A, 'A-1'], [P_B, 'B-1']]) {
    await q(
      `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_name)
       VALUES ($1, $2, $3, $4, 'ind', 'Alpha')`,
      [id, CTX.organizationId, `Program ${code}`, code],
    );
  }
  for (const [id, programId, hash] of [[V_A, P_A, 'a'.repeat(64)], [V_B, P_B, 'b'.repeat(64)]]) {
    await q(
      `INSERT INTO vault.documents (id, program_id, organization_id, document_code, document_title, document_type, content_hash)
       VALUES ($1, $2, $3, $4, $4, 'PROTOCOL', $5)`,
      [id, programId, CTX.organizationId, `doc-${id.slice(0, 2)}`, hash],
    );
  }
  await q(
    `INSERT INTO vault.documents (id, program_id, organization_id, document_code, document_title, document_type, content_hash)
     VALUES ($1, $2, NULL, 'doc-n', 'doc-n', 'PROTOCOL', $3)`,
    [V_N, P_B, 'c'.repeat(64)],
  );
  await q(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title)
     VALUES ('doc-b', $1, $2, 'ind', 'fda', '1.0', 'Program B filing')`,
    [CTX.organizationId, P_B],
  );
  const [sec] = await q<{ id: number }>(
    `INSERT INTO c2c_document_sections (document_id, section_key, label, path_order, content)
     VALUES ('doc-b', '2.5', 'Clinical overview', 1, $1) RETURNING id`,
    [JSON.stringify({ text: 'Program B clinical overview.' })],
  );
  SECTION_B = Number(sec.id);

  // An authoring document of P_B and its filing copy, joined by the alias map:
  // the real tables, so the join the placement reads is the deployed one.
  for (const rel of [
    'db/migrations/20260725_authoring_document_loop_tables.sql',
    'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
    'db/migrations/20260730_authoring_comments_router_columns.sql',
    'migrations/20260727_authoring_document_program_scope.sql',
    'migrations/20260814d_document_alias_map.sql',
  ]) {
    await harness.pglite.exec(readFileSync(join(ROOT, rel), 'utf8'));
  }
  await q(
    `INSERT INTO authoring_documents (id, title, created_by, tenant_id, client_program_id) VALUES ($1, 'IB', 'u9', $2, $3)`,
    [DOC_B, CTX.organizationId, P_B],
  );
  const [copy] = await q<{ id: number }>(
    `INSERT INTO coauthor_documents (organization_id, title, content) VALUES ($1, 'IB (filing copy)', 'Investigator brochure.') RETURNING id`,
    [CTX.organizationId],
  );
  COPY_B = Number(copy.id);
  await q(
    `INSERT INTO c2c_document_aliases (canonical_id, store, native_id, organization_id) VALUES ($1, 'coauthor_documents', $2, $3)`,
    [DOC_B, String(COPY_B), CTX.organizationId],
  );

  SEQ_A = await sequenceOn(P_A);
  SEQ_L = await sequenceOn(null);
}, 60_000);

afterAll(async () => {
  await harness?.close();
});

const vaultLeaf = (sequenceId: number, documentUuid: string, sectionCode = 'm5.3.5') =>
  upsertLeaf({ sequenceId, sectionCode, title: 'Protocol', documentTable: 'vault_documents', documentUuid }, CTX);

async function leafCount(sequenceId: number): Promise<number> {
  const [r] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM submission_leaves WHERE sequence_id = $1`, [sequenceId]);
  return r.n;
}

function lastLedgerDetails(): Record<string, unknown> {
  const call = logAction.mock.calls[logAction.mock.calls.length - 1]?.[0] as { details?: Record<string, unknown> } | undefined;
  return call?.details ?? {};
}

describe('upsertLeaf keeps a filing inside its project', () => {
  it('refuses a Vault document of another project, and writes nothing', async () => {
    const before = await leafCount(SEQ_A);
    const err = await vaultLeaf(SEQ_A, V_B).catch((e) => e);
    expect(err).toBeInstanceOf(SubmissionError);
    expect(err.code).toBe('CROSS_PROJECT');
    expect(await leafCount(SEQ_A)).toBe(before);
  });

  it('refuses another project’s Vault document that carries no organization attribution', async () => {
    // Its project is read through the program, the scope the tenancy check
    // uses. Filtering on the nullable organization_id would read no project,
    // and a placement with no document project is not judged.
    const before = await leafCount(SEQ_A);
    const err = await vaultLeaf(SEQ_A, V_N).catch((e) => e);
    expect(err).toBeInstanceOf(SubmissionError);
    expect(err.code).toBe('CROSS_PROJECT');
    expect(await leafCount(SEQ_A)).toBe(before);
  });

  it('refuses a governed section of another project’s filing document', async () => {
    const err = await upsertLeaf(
      { sequenceId: SEQ_A, sectionCode: 'm2.5', title: 'Clinical overview', documentTable: 'c2c_document_sections', documentId: SECTION_B },
      CTX,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(SubmissionError);
    expect(err.code).toBe('CROSS_PROJECT');
  });

  it('refuses another project’s authoring filing copy (reached through the alias map)', async () => {
    const err = await upsertLeaf(
      { sequenceId: SEQ_A, sectionCode: 'm1.14.4.1', title: 'Investigator brochure', documentTable: 'coauthor_documents', documentId: COPY_B },
      CTX,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(SubmissionError);
    expect(err.code).toBe('CROSS_PROJECT');
  });

  it('places the project’s own document, and the ledger names the document, its pin and the project', async () => {
    const leaf = await vaultLeaf(SEQ_A, V_A);
    expect(leaf.documentContentSha256).toBe('a'.repeat(64));
    expect(lastLedgerDetails()).toMatchObject({
      sequenceId: SEQ_A,
      documentTable: 'vault_documents',
      documentUuid: V_A,
      documentContentSha256: 'a'.repeat(64),
      programId: P_A,
      documentProgramId: P_A,
    });
  });

  it('refuses re-pointing an existing leaf at another project’s document', async () => {
    const leaf = await vaultLeaf(SEQ_A, V_A, 'm5.3.6');
    const err = await upsertLeaf(
      { leafId: leaf.id, sequenceId: SEQ_A, sectionCode: 'm5.3.6', title: 'Protocol', documentTable: 'vault_documents', documentUuid: V_B },
      CTX,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(SubmissionError);
    expect(err.code).toBe('CROSS_PROJECT');
    const [row] = await q<{ document_uuid: string }>(`SELECT document_uuid FROM submission_leaves WHERE id = $1`, [leaf.id]);
    expect(row.document_uuid).toBe(V_A);
  });

  it('allows a placement it cannot judge (the submission records no project), and records both sides', async () => {
    await vaultLeaf(SEQ_L, V_B);
    expect(lastLedgerDetails()).toMatchObject({ documentUuid: V_B, programId: null, documentProgramId: P_B });
  });
});
