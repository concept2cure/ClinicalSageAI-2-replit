/**
 * Biosketch prose lineage gate — END-TO-END against in-process PGlite.
 *
 * Proves updateSectionTx enforces author lineage in the caller's transaction:
 *   - with content   → biosketch_sections.content written AND document_span_lineage
 *     carries author spans for ('biosketch_sections', id)
 *   - addressed-only  → no lineage rows (gate no-ops when no content is set)
 *
 * The span-lineage tables come from the real migrations; the biosketch tables
 * are the minimal columns updateSectionTx touches.
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

import { updateSectionTx } from '../biosketch-service';

const ORG = 71;
const USER = 4242;

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

async function spanCount(documentId: string): Promise<number> {
  const { rows } = await exec.query(
    `SELECT COUNT(*)::int AS n FROM document_span_lineage
      WHERE organization_id = $1 AND document_table = 'biosketch_sections' AND document_id = $2 AND deleted_at IS NULL`,
    [ORG, documentId],
  );
  return Number((rows[0] as any).n);
}

async function seedBiosketchWithSection(): Promise<number> {
  const b = await exec.query(
    `INSERT INTO biosketches (organization_id, status) VALUES ($1,'draft') RETURNING id`,
    [ORG],
  );
  const bioId = Number((b.rows[0] as any).id);
  const s = await exec.query(
    `INSERT INTO biosketch_sections (organization_id, biosketch_id, section_key, title, addressed, order_index)
     VALUES ($1,$2,'personal_statement','Personal Statement',false,0) RETURNING id`,
    [ORG, bioId],
  );
  return Number((s.rows[0] as any).id);
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG},'a');`);
  await pglite.exec(`
    CREATE TABLE biosketches (
      id serial PRIMARY KEY, organization_id int, status text, updated_at timestamptz DEFAULT now());
    CREATE TABLE biosketch_sections (
      id serial PRIMARY KEY, organization_id int, biosketch_id int, section_key text, title text,
      content text, addressed boolean, order_index int, updated_at timestamptz DEFAULT now());
  `);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

describe('biosketch prose lineage gate', () => {
  it('updateSectionTx with content writes the content AND records author lineage', async () => {
    const sectionId = await seedBiosketchWithSection();
    const content = 'I am a translational scientist. My research focuses on oncology drug development.';
    await updateSectionTx(exec as any, ORG, sectionId, { content, addressed: true }, USER);

    const sec = await exec.query(`SELECT content FROM biosketch_sections WHERE id = $1`, [sectionId]);
    expect((sec.rows[0] as any).content).toBe(content);
    expect(await spanCount(String(sectionId))).toBeGreaterThan(0);
  });

  it('updateSectionTx with sources records the verbatim clause against the source and the rest as the author (ledger L154)', async () => {
    const sectionId = await seedBiosketchWithSection();
    const src = await exec.query(
      `INSERT INTO cre_evidence_sources (organization_id, visibility_class, source_type, title, checksum, ingestion_status, extraction_status)
       VALUES ($1, 'tenant_private', 'client_document', 'csr.pdf', 'sha-l154-b', 'ingested', 'extracted') RETURNING id`,
      [ORG],
    );
    const sourceId = (src.rows[0] as { id: number }).id;
    const content = 'The primary endpoint was met at week twelve in the intent-to-treat population. These findings were consistent across every prespecified subgroup we examined.';
    const lineage = await updateSectionTx(exec as any, ORG, sectionId, { content, addressed: true, sources: [{ sourceId, content: 'Clinical study report. The primary endpoint was met at week twelve in the intent-to-treat population. More.' }] }, USER);
    expect(lineage?.sourceSpans).toBe(1);
    expect(lineage?.authorSpans).toBeGreaterThanOrEqual(1);
    const kinds = await exec.query(
      `SELECT provenance_kind, reference_id FROM document_span_lineage WHERE document_table = $1 AND document_id = $2 AND deleted_at IS NULL`,
      ['biosketch_sections', String(sectionId)],
    );
    const rows = kinds.rows as Array<{ provenance_kind: string; reference_id: string | null }>;
    expect(rows.some((k) => k.provenance_kind === 'cre_evidence_source' && k.reference_id === String(sourceId))).toBe(true);
    expect(rows.some((k) => k.provenance_kind === 'author_assertion')).toBe(true);
  });

  it('updateSectionTx addressed-only edit records NO lineage (gate no-ops on absent content)', async () => {
    const sectionId = await seedBiosketchWithSection();
    await updateSectionTx(exec as any, ORG, sectionId, { addressed: true }, USER);
    expect(await spanCount(String(sectionId))).toBe(0);
  });
});
