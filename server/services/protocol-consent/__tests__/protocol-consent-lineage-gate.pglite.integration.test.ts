/**
 * Ledger L158 — Informed-consent form prose carries lineage through the shared gate.
 *
 * `updateElementTx` used to write `consent_form_elements.content` with no lineage at
 * all; it now enlists the same gate every other prose writer does, inside the
 * caller's transaction, and with `sources` records verbatim clauses against
 * the cited Data Room source. Proven on a real PGlite database with the real
 * evidence-spine and span-lineage migrations.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const exec = {
  query: async <R = any>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number }> => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as R[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => exec.query(s, p) } }));

import { updateElementTx } from '../protocol-consent-service';

const ORG = 902;
const USER = 4242;
const QUOTED = 'The primary endpoint was met at week twelve in the intent-to-treat population.';
const ORIGINAL = 'These findings were consistent across every prespecified subgroup we examined.';

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}
async function spans(elementId: number) {
  const r = await exec.query(
    `SELECT provenance_kind, reference_id FROM document_span_lineage
      WHERE document_table = 'consent_form_elements' AND document_id = $1 AND deleted_at IS NULL`,
    [String(elementId)],
  );
  return r.rows as Array<{ provenance_kind: string; reference_id: string | null }>;
}
async function seed(): Promise<number> {
  await exec.query(`INSERT INTO consent_forms (id, organization_id, status) VALUES (1, $1, 'draft') ON CONFLICT DO NOTHING`, [ORG]);
  const r = await exec.query(
    `INSERT INTO consent_form_elements (organization_id, consent_form_id, content) VALUES ($1, 1, '') RETURNING id`,
    [ORG],
  );
  return (r.rows[0] as { id: number }).id;
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG}, 'org');`);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
  await pglite.exec(`
    CREATE TABLE consent_forms (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft', updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE consent_form_elements (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, consent_form_id INTEGER NOT NULL, content TEXT, present BOOLEAN DEFAULT false, updated_at TIMESTAMPTZ DEFAULT now());
  `);
}, 60_000);
afterAll(async () => {
  await pglite?.close();
});

describe('protocol-consent-service updateElementTx', () => {
  it('records author lineage for the content it writes', async () => {
    const id = await seed();
    await updateElementTx(exec as any, ORG, id, { content: `${QUOTED} ${ORIGINAL}` }, USER);
    const rows = await spans(id);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.provenance_kind === 'author_assertion')).toBe(true);
  });

  it('with sources, the verbatim clause lands on the source and the rest on the author (ledger L154)', async () => {
    const id = await seed();
    const src = await exec.query(
      `INSERT INTO cre_evidence_sources (organization_id, visibility_class, source_type, title, checksum, ingestion_status, extraction_status)
       VALUES ($1, 'tenant_private', 'client_document', 'csr.pdf', 'sha-protocol-consent-service', 'ingested', 'extracted') RETURNING id`,
      [ORG],
    );
    const sourceId = (src.rows[0] as { id: number }).id;
    const lineage = await updateElementTx(
      exec as any, ORG, id,
      { content: `${QUOTED} ${ORIGINAL}`, sources: [{ sourceId, content: `Clinical study report. ${QUOTED} More.` }] },
      USER,
    );
    expect(lineage?.sourceSpans).toBe(1);
    const rows = await spans(id);
    expect(rows.some((r) => r.provenance_kind === 'cre_evidence_source' && r.reference_id === String(sourceId))).toBe(true);
    expect(rows.some((r) => r.provenance_kind === 'author_assertion')).toBe(true);
  });

  it('a flag-only edit records no lineage (nothing authored)', async () => {
    const id = await seed();
    await updateElementTx(exec as any, ORG, id, { present: true }, USER);
    expect(await spans(id)).toHaveLength(0);
  });
});
