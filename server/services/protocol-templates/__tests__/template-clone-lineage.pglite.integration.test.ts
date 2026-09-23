/**
 * Template-clone prose lineage gate — END-TO-END against in-process PGlite
 * (ledger L177, the last of that row's four).
 *
 * `cloneTemplateToDocumentTx` seeds a brand-new protocol's sections from a
 * template. It recorded no span lineage, so a protocol could be created with
 * real prose in it and nothing saying where any of that prose came from — and
 * the section would then acquire lineage only on its SECOND write, when
 * protocol-development-service.ts's gate finally ran.
 *
 * Seeded text is not boilerplate that can be waved through: saveDocumentAsTemplateTx
 * snapshots a real protocol's sections INTO a template, so what is seeded here
 * can be previously-authored prose landing in a new document. The round trip is
 * exercised below rather than described.
 *
 * The span-lineage tables come from the real migrations; the protocol tables are
 * the minimal columns these functions touch.
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

import {
  createTemplateTx,
  addTemplateSectionTx,
  cloneTemplateToDocumentTx,
  saveDocumentAsTemplateTx,
} from '../protocol-templates-service';

const ORG = 73;
const USER = 4242;

const SEEDED_PROSE =
  'The study population comprises adults with advanced disease. Prior systemic therapy is required.';

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

async function spansFor(documentId: string): Promise<any[]> {
  const { rows } = await exec.query(
    `SELECT provenance_kind, char_start, char_end, asserted_by
       FROM document_span_lineage
      WHERE organization_id = $1 AND document_table = 'protocol_sections'
        AND document_id = $2 AND deleted_at IS NULL
      ORDER BY char_start`,
    [ORG, documentId],
  );
  return rows;
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG},'a');`);
  await pglite.exec(`
    CREATE TABLE protocol_documents (
      id serial PRIMARY KEY, organization_id int, protocol_kind text, protocol_number text,
      title text, design_type text, version text, status text, synopsis text,
      created_by int, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
    CREATE TABLE protocol_sections (
      id serial PRIMARY KEY, organization_id int, protocol_document_id int, section_key text,
      title text, content text, required boolean, status text, order_index int,
      created_by int, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
    CREATE TABLE protocol_templates (
      id serial PRIMARY KEY, organization_id int, name text, protocol_kind text,
      design_type text, description text, source text, status text, created_by int,
      deleted_at timestamptz);
    CREATE TABLE protocol_template_sections (
      id serial PRIMARY KEY, organization_id int, template_id int, section_key text,
      title text, content text, required boolean, order_index int, created_by int);
  `);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
  await pglite.exec(migration('migrations/20260907_span_lineage_accepted_machine_draft.sql'));
  await pglite.exec(migration('migrations/20260908_span_lineage_machine_draft.sql'));
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

describe('cloning a template attributes the prose it seeds', () => {
  it('records author lineage for every seeded section that carries text', async () => {
    const { id: templateId } = await createTemplateTx(exec as any, ORG, USER, {
      name: 'Phase 2 starter',
      protocolKind: 'clinical',
    });
    await addTemplateSectionTx(exec as any, ORG, USER, templateId, {
      sectionKey: 'population',
      title: 'Study Population',
      content: SEEDED_PROSE,
      orderIndex: 0,
    });

    const { documentId } = await cloneTemplateToDocumentTx(exec as any, ORG, USER, templateId, {
      title: 'A Phase 2 Study',
    });

    const secs = await exec.query(
      `SELECT id, content FROM protocol_sections WHERE protocol_document_id = $1 AND content IS NOT NULL AND content <> ''`,
      [documentId],
    );
    expect(secs.rows.length).toBeGreaterThanOrEqual(1);

    const seeded = secs.rows.find((r: any) => r.content === SEEDED_PROSE);
    expect(seeded).toBeDefined();

    const spans = await spansFor(String(seeded.id));
    expect(spans.length).toBeGreaterThanOrEqual(1);
    expect(spans.every((s) => s.provenance_kind === 'author_assertion')).toBe(true);
    expect(spans.every((s) => String(s.asserted_by) === String(USER))).toBe(true);
    // The attribution covers the seeded text, not a corner of it.
    expect(Math.max(...spans.map((s) => Number(s.char_end)))).toBe(SEEDED_PROSE.length);
  });

  it('attributes nothing for a section the merge leaves empty', async () => {
    const { id: templateId } = await createTemplateTx(exec as any, ORG, USER, {
      name: 'Empty starter',
      protocolKind: 'clinical',
    });
    await addTemplateSectionTx(exec as any, ORG, USER, templateId, {
      sectionKey: 'background',
      title: 'Background',
      content: null,
      orderIndex: 0,
    });

    const { documentId } = await cloneTemplateToDocumentTx(exec as any, ORG, USER, templateId, {
      title: 'A protocol with an empty background',
    });

    const secs = await exec.query(
      `SELECT id, content, status FROM protocol_sections WHERE protocol_document_id = $1 AND section_key = 'background'`,
      [documentId],
    );
    const empty = secs.rows[0] as any;
    expect(empty.status).toBe('not_started');
    // A span over text that is not there would be a claim about nothing.
    expect(await spansFor(String(empty.id))).toHaveLength(0);
  });

  it('carries attribution across the snapshot-and-reclone round trip', async () => {
    // This is why seeded content is not boilerplate: a real protocol's authored
    // sections can be snapshotted INTO a template and seeded back out into a
    // different protocol. Both copies must be attributable.
    const { id: firstTemplate } = await createTemplateTx(exec as any, ORG, USER, {
      name: 'Round trip source',
      protocolKind: 'clinical',
    });
    await addTemplateSectionTx(exec as any, ORG, USER, firstTemplate, {
      sectionKey: 'population',
      title: 'Study Population',
      content: SEEDED_PROSE,
      orderIndex: 0,
    });
    const { documentId } = await cloneTemplateToDocumentTx(exec as any, ORG, USER, firstTemplate, {
      title: 'Original protocol',
    });

    // Snapshot that protocol back into a template, then clone it into a NEW one.
    const { templateId: snapshot } = await saveDocumentAsTemplateTx(
      exec as any, ORG, USER, documentId, { name: 'Snapshot of original' },
    );
    const { documentId: secondDocId } = await cloneTemplateToDocumentTx(
      exec as any, ORG, USER, snapshot, { title: 'Derived protocol' },
    );

    const secs = await exec.query(
      `SELECT id FROM protocol_sections WHERE protocol_document_id = $1 AND content = $2`,
      [secondDocId, SEEDED_PROSE],
    );
    expect(secs.rows.length).toBe(1);
    const spans = await spansFor(String((secs.rows[0] as any).id));
    expect(spans.length).toBeGreaterThanOrEqual(1);
    expect(spans.every((s) => s.provenance_kind === 'author_assertion')).toBe(true);
  });
});
