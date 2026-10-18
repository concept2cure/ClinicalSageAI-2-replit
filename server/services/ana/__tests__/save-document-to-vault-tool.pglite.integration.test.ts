/**
 * save_document_to_vault — document store consolidation step 2
 * (docs/design/DOCUMENT_STORE_CONSOLIDATION.md, 2026-10-17). The tool inserted a
 * concept2cure_artifacts row while its name said Vault. It now creates the
 * draft where every AnA draft lives, authoring_documents, through the same
 * createDocumentFromDraft path as draft_authoring_document: one section holding
 * the body. It never writes vault.documents (P-30: AnA prose is not governed
 * content without a passed PQ) and says so.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, AUTHORING_ACCESS_DDL, PROGRAM, OTHER_PROGRAM, ORG, AUTHOR } from '../../../routes/__tests__/_authoring-canvas-fixture';
import { approvedToolHandler } from './support/approved-tool-handler';
import { AUTHORING_TOOL_MIGRATIONS, DISPOSITION_IMPACT_PREREQ, authoringCountsOn } from './support/authoring-tool-db';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: async () => {
  throw new Error('Test embedding unavailable');
} }) }));
vi.mock('../../../db.js', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const T = 240_000;
let jdb: JourneyDb;
const requestExecutor = { query: (text: string, values?: unknown[]) => jdb.pglite.query<Record<string, unknown>>(text, values) };
const authoringCounts = () => authoringCountsOn(jdb.pool as never);

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ + VAULT_DDL + DISPOSITION_IMPACT_PREREQ,
    migrations: [...AUTHORING_TOOL_MIGRATIONS],
    testOnlySql: AUTHORING_ACCESS_DDL,
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  // Importing the executor registers every handler as an import side effect.
  await import('../AnaToolExecutor');
}, T);

afterAll(async () => {
  await jdb?.close();
});

describe('save_document_to_vault — the single-body form of draft_authoring_document', () => {
  const SAVE_INPUT = { title: 'Pharmacology summary', content: 'First paragraph, R&D <LOQ.\n\nSecond paragraph.', reason: 'Saving the pharmacology summary draft.' };
  const saveCtx = { organizationId: ORG, userId: Number(AUTHOR.id), sqlClient: requestExecutor, projectRef: PROGRAM, humanConfirmed: true };
  const otherStores = async () => {
    const r = await jdb.pool.query(`SELECT
      (SELECT COUNT(*)::int FROM concept2cure_artifacts) AS artifacts,
      (SELECT COUNT(*)::int FROM vault.documents) AS vault`);
    return r.rows[0] as { artifacts: number; vault: number };
  };
  let save: (input: Record<string, unknown>, ctx?: Record<string, unknown>) => Promise<string>;
  beforeAll(() => {
    const found = approvedToolHandler('save_document_to_vault');
    expect(found, 'save_document_to_vault is not registered').toBeDefined();
    save = found as typeof save;
  });

  it('creates one authoring draft with one section, AnA-attributed, carrying the stated reason — and no artifact or Vault row', async () => {
    const storesBefore = await otherStores();
    const before = await authoringCounts();
    const out = JSON.parse(await save(SAVE_INPUT, saveCtx));
    expect(out.error, JSON.stringify(out)).toBeUndefined();
    expect(out).toMatchObject({ ok: true, saved: true, documentStatus: 'draft', filed_in_vault: false, programId: PROGRAM, title: SAVE_INPUT.title, sectionCount: 1 });
    expect(out.authoringDocId).toMatch(/^[0-9a-f-]{36}$/);
    expect(out.artifact_id).toBeUndefined();
    expect(out.message).toMatch(/not filed in the Vault/);
    expect(out.message).not.toMatch(/to the vault/i);

    expect(await otherStores()).toEqual(storesBefore);
    expect(await authoringCounts()).toEqual({ documents: before.documents + 1, sections: before.sections + 1, revisions: before.revisions + 1, creates: before.creates + 1 });

    const doc = await jdb.pool.query('SELECT status, client_program_id, provenance FROM authoring_documents WHERE id=$1 AND tenant_id=$2', [out.authoringDocId, ORG]);
    const row = doc.rows[0] as { status: string; client_program_id: string; provenance: Record<string, unknown> };
    expect(row).toMatchObject({ status: 'draft', client_program_id: PROGRAM });
    expect(row.provenance).toMatchObject({ source: 'ana' });

    const sec = await jdb.pool.query('SELECT id, title, content FROM authoring_sections WHERE doc_id=$1 AND tenant_id=$2', [out.authoringDocId, ORG]);
    const section = sec.rows[0] as { id: string; title: string; content: string };
    expect(section.title).toBe(SAVE_INPUT.title);
    // Plain text is stored as the editor's HTML: escaped paragraphs.
    expect(section.content).toContain('R&amp;D &lt;LOQ.');
    expect(section.content).toContain('<p>Second paragraph.</p>');

    // The stated reason is the Part 11 CREATE row's reason for change.
    const audit = await jdb.pool.query(`SELECT change_reason FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2 AND operation_type='CREATE'`, [out.authoringDocId, ORG]);
    expect((audit.rows[0] as { change_reason: string }).change_reason).toBe(SAVE_INPUT.reason);

    // AnA's unaccepted draft: machine_draft lineage, asserted by nobody.
    const spans = await jdb.pool.query(`SELECT provenance_kind, machine_author_id, asserted_by FROM document_span_lineage
      WHERE organization_id=$1 AND document_table='authoring_sections' AND document_id=$2 AND deleted_at IS NULL`, [ORG, String(section.id)]);
    expect(spans.rows.length).toBeGreaterThanOrEqual(1);
    for (const s of spans.rows as Array<{ provenance_kind: string; machine_author_id: string; asserted_by: string | null }>) {
      expect(s).toMatchObject({ provenance_kind: 'machine_draft', machine_author_id: 'ana', asserted_by: null });
    }
  });

  it('refuses without an open project and writes nothing anywhere', async () => {
    const before = await authoringCounts();
    const storesBefore = await otherStores();
    const out = JSON.parse(await save(SAVE_INPUT, { organizationId: ORG, userId: Number(AUTHOR.id), sqlClient: requestExecutor, humanConfirmed: true }));
    expect(out.error).toMatch(/save_document_to_vault needs an open project/);
    expect(await authoringCounts()).toEqual(before);
    expect(await otherStores()).toEqual(storesBefore);
  });

  it('refuses another organization’s project as no project — never a cross-tenant write', async () => {
    const before = await authoringCounts();
    const out = JSON.parse(await save(SAVE_INPUT, { ...saveCtx, projectRef: OTHER_PROGRAM }));
    expect(out.error).toMatch(/needs an open project/);
    expect(await authoringCounts()).toEqual(before);
  });

  it('FAILS CLOSED — a broken Part 11 audit write rolls back the document, its section and its revision', async () => {
    const before = await authoringCounts();
    await jdb.pool.query(`ALTER TABLE authoring_audit_trail ADD CONSTRAINT audit_write_broken CHECK (false) NOT VALID`);
    try {
      const out = JSON.parse(await save(SAVE_INPUT, saveCtx));
      expect(out.error).toBe('save_document_to_vault failed: the document could not be written. Nothing was saved.');
      expect(await authoringCounts()).toEqual(before);
    } finally {
      await jdb.pool.query(`ALTER TABLE authoring_audit_trail DROP CONSTRAINT IF EXISTS audit_write_broken`);
    }
  });
});
