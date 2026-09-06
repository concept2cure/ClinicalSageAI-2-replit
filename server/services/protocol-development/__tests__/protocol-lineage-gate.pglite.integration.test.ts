/**
 * Protocol prose lineage gate — END-TO-END against in-process PGlite.
 *
 * Proves that the two protocol prose writers enforce author lineage in the
 * caller's transaction, exactly like the authoring save gate:
 *
 *   - updateSectionTx with content   → protocol_sections.content is written AND
 *     document_span_lineage carries author spans for ('protocol_sections', id)
 *   - updateSectionTx status-only    → no lineage rows (the gate no-ops when no
 *     content is set, matching the COALESCE that leaves content unchanged)
 *   - updateSynopsisTx               → document_span_lineage carries author
 *     spans for ('protocol_documents', id)
 *
 * The span-lineage tables come from the real migrations; the protocol tables are
 * the minimal columns these two functions touch.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const exec = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as any[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => exec.query(s, p) }, db: {} }));

import { updateSectionTx, updateSynopsisTx } from '../protocol-development-service';

const ORG = 71;
const USER = 4242;

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

async function spanCount(documentTable: string, documentId: string): Promise<number> {
  const { rows } = await exec.query(
    `SELECT COUNT(*)::int AS n FROM document_span_lineage
      WHERE organization_id = $1 AND document_table = $2 AND document_id = $3 AND deleted_at IS NULL`,
    [ORG, documentTable, documentId],
  );
  return Number((rows[0] as any).n);
}

async function seedDocWithSection(): Promise<{ docId: number; sectionId: number }> {
  const d = await exec.query(
    `INSERT INTO protocol_documents (organization_id, protocol_kind, title, version, status)
     VALUES ($1,'clinical','A Phase 2 Study','0.1','draft') RETURNING id`,
    [ORG],
  );
  const docId = Number((d.rows[0] as any).id);
  const s = await exec.query(
    `INSERT INTO protocol_sections (organization_id, protocol_document_id, section_key, title, status, order_index)
     VALUES ($1,$2,'background','Background','not_started',0) RETURNING id`,
    [ORG, docId],
  );
  return { docId, sectionId: Number((s.rows[0] as any).id) };
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG},'a');`);
  // Minimal protocol tables — only the columns these two functions read/write.
  await pglite.exec(`
    CREATE TABLE protocol_documents (
      id serial PRIMARY KEY, organization_id int, protocol_kind text, title text,
      version text, status text, synopsis text, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
    CREATE TABLE protocol_sections (
      id serial PRIMARY KEY, organization_id int, protocol_document_id int, section_key text,
      title text, content text, status text, order_index int,
      updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
  `);
  // Real span-lineage schema (the gate writes/reads document_span_lineage).
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

describe('protocol prose lineage gate', () => {
  it('updateSectionTx with content writes the content AND records author lineage', async () => {
    const { sectionId } = await seedDocWithSection();
    const content = 'The study population comprises adults with advanced disease. Prior therapy is required.';
    await updateSectionTx(exec as any, ORG, sectionId, { content, status: 'draft' }, USER);

    const sec = await exec.query(`SELECT content FROM protocol_sections WHERE id = $1`, [sectionId]);
    expect((sec.rows[0] as any).content).toBe(content);
    expect(await spanCount('protocol_sections', String(sectionId))).toBeGreaterThan(0);
  });

  it('updateSectionTx with sources records the verbatim clause against the source and the rest as the author (ledger L154)', async () => {
    const { sectionId } = await seedDocWithSection();
    const src = await exec.query(
      `INSERT INTO cre_evidence_sources (organization_id, visibility_class, source_type, title, checksum, ingestion_status, extraction_status)
       VALUES ($1, 'tenant_private', 'client_document', 'csr.pdf', 'sha-l154-p', 'ingested', 'extracted') RETURNING id`,
      [ORG],
    );
    const sourceId = (src.rows[0] as { id: number }).id;
    const content = 'The primary endpoint was met at week twelve in the intent-to-treat population. These findings were consistent across every prespecified subgroup we examined.';
    const lineage = await updateSectionTx(exec as any, ORG, sectionId, { content, status: 'draft', sources: [{ sourceId, content: 'Clinical study report. The primary endpoint was met at week twelve in the intent-to-treat population. More.' }] }, USER);
    expect(lineage?.sourceSpans).toBe(1);
    expect(lineage?.authorSpans).toBeGreaterThanOrEqual(1);
    const kinds = await exec.query(
      `SELECT provenance_kind, reference_id FROM document_span_lineage WHERE document_table = $1 AND document_id = $2 AND deleted_at IS NULL`,
      ['protocol_sections', String(sectionId)],
    );
    const rows = kinds.rows as Array<{ provenance_kind: string; reference_id: string | null }>;
    expect(rows.some((k) => k.provenance_kind === 'cre_evidence_source' && k.reference_id === String(sourceId))).toBe(true);
    expect(rows.some((k) => k.provenance_kind === 'author_assertion')).toBe(true);
  });

  it('updateSectionTx status-only edit records NO lineage (gate no-ops on absent content)', async () => {
    const { sectionId } = await seedDocWithSection();
    await updateSectionTx(exec as any, ORG, sectionId, { status: 'draft' }, USER);
    expect(await spanCount('protocol_sections', String(sectionId))).toBe(0);
  });

  it('updateSynopsisTx records author lineage for the document synopsis', async () => {
    const { docId } = await seedDocWithSection();
    const synopsis = 'This is a randomized, double-blind trial. The primary endpoint is overall response rate.';
    await updateSynopsisTx(exec as any, ORG, docId, synopsis, USER);

    const doc = await exec.query(`SELECT synopsis FROM protocol_documents WHERE id = $1`, [docId]);
    expect((doc.rows[0] as any).synopsis).toBe(synopsis);
    expect(await spanCount('protocol_documents', String(docId))).toBeGreaterThan(0);
  });
});
