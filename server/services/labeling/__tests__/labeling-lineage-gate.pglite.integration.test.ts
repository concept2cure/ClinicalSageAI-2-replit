/**
 * Labeling (USPI) prose lineage gate — END-TO-END against in-process PGlite.
 *
 * labeling_pi_sections.content is JSONB ({ heading, body[] }). This proves the
 * gate derives the canonical rendered text (heading + body) and records author
 * lineage in the same transaction the upsert runs in:
 *
 *   - content present → the section is written AND document_span_lineage carries
 *     author spans for ('labeling_pi_sections', rowId) covering the derived text
 *   - content absent  → no lineage rows (the gate no-ops)
 *
 * The service opens its own transaction (pool.connect), so the db mock returns a
 * PGlite-backed client.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const wrap = async (sql: string, params?: unknown[]) => {
  const r = await pglite.query(sql, params as unknown[]);
  return {
    rows: r.rows as any[],
    rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
  };
};
// The service calls pool.connect() and runs BEGIN/COMMIT/ROLLBACK on the client;
// PGlite is a single connection, so the "client" just wraps its query.
vi.mock('../../../db', () => ({
  pool: {
    connect: async () => ({ query: wrap, release: () => undefined }),
    query: (s: string, p?: unknown[]) => wrap(s, p),
  },
  db: {},
}));

import { upsertLabelingPiSection } from '../labeling-pi-service';

const ORG = 71;
const USER = 4242;

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

async function spanCount(documentId: string): Promise<number> {
  const r = await wrap(
    `SELECT COUNT(*)::int AS n FROM document_span_lineage
      WHERE organization_id = $1 AND document_table = 'labeling_pi_sections' AND document_id = $2 AND deleted_at IS NULL`,
    [ORG, documentId],
  );
  return Number((r.rows[0] as any).n);
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG},'a');`);
  // Minimal labeling_pi_sections shape + the partial unique index the upsert's
  // ON CONFLICT target requires.
  await pglite.exec(`
    CREATE TABLE labeling_pi_sections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id integer NOT NULL,
      section_no text NOT NULL,
      label text NOT NULL,
      status text NOT NULL DEFAULT 'draft',
      flag text,
      program text,
      content jsonb,
      negotiation jsonb,
      created_by integer,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      deleted_at timestamptz);
    CREATE UNIQUE INDEX uq_labeling_pi_sections_org_section
      ON labeling_pi_sections (organization_id, section_no) WHERE deleted_at IS NULL;
  `);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

describe('labeling (USPI) prose lineage gate', () => {
  it('derives heading+body text and records author lineage for a label section', async () => {
    const row = await upsertLabelingPiSection(ORG, {
      sectionNo: '1',
      label: 'Indications and Usage',
      content: {
        heading: 'Indications and Usage',
        body: [
          'DRUG X is indicated for the treatment of adults with advanced disease.',
          'Limitations of use: not indicated for pediatric patients.',
        ],
      },
      createdBy: USER,
    });
    expect(row.id).toBeTruthy();
    expect(await spanCount(String(row.id))).toBeGreaterThan(0);
  });

  it('re-authoring the same section (upsert) keeps one live row and stays covered', async () => {
    const first = await upsertLabelingPiSection(ORG, {
      sectionNo: 'BW',
      label: 'Boxed Warning',
      content: { heading: 'Boxed Warning', body: ['Serious risk of hepatotoxicity.'] },
      createdBy: USER,
    });
    const second = await upsertLabelingPiSection(ORG, {
      sectionNo: 'BW',
      label: 'Boxed Warning',
      content: { heading: 'Boxed Warning', body: ['Serious risk of hepatotoxicity. Monitor LFTs.'] },
      createdBy: USER,
    });
    expect(second.id).toBe(first.id); // same live row (upsert on org+section_no)
    expect(await spanCount(String(second.id))).toBeGreaterThan(0);
  });

  it('a section recorded without content writes NO lineage (gate no-ops)', async () => {
    const row = await upsertLabelingPiSection(ORG, {
      sectionNo: '2',
      label: 'Dosage and Administration',
      createdBy: USER,
    });
    expect(await spanCount(String(row.id))).toBe(0);
  });
});
