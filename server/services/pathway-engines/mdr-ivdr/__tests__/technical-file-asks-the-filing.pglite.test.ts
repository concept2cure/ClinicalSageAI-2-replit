/**
 * The EU technical file is assembled only from a filing that holds the
 * document's text (P-29.3, docs/EXIT_ATTESTATION_DECISION_2026-10-18.md).
 *
 * `assembleTechnicalFileFromProgram` builds the MDR/IVDR technical-file ZIP
 * from the program's governed document (`c2c_document_sections`). Until
 * 2026-11-02 it asked nothing of the editing layer, so a filed copy that no
 * longer held the text the author edits and signs went into the file a notified
 * body reviews. The filing-exit gate could not see it: it did not scan
 * `loadGovernedDeviceSections` (docs/evidence/MDX-JOURNEY/2026-11-02-slice-3-estar-exits-ask-the-filing/).
 *
 * Run against PostgreSQL (PGlite) with the leaf materializer and the governed
 * store from the harness, and the editing store shaped as the shipped
 * migrations shape it (`authoring_documents.c2c_document_id` text, non-unique).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pool: null as any, audit: [] as any[] }));
vi.mock('../../../../db', () => ({
  get db() { return holder.db; },
  get pool() { return holder.pool; },
}));
vi.mock('../../../auditService', () => ({
  default: { logAction: vi.fn(async (row: any) => { holder.audit.push(row); return { persisted: true }; }) },
}));

import { assembleTechnicalFileFromProgram } from '../assemble-technical-file-from-core';

let h: IndPgliteDb;
const ORG = 8;
const PROGRAM = '6b0f2f0e-9a7d-4a2e-8c3f-2d1e6f7a8b9c';
const EDITING = '3c1d5e7f-2a4b-4c6d-8e9f-0a1b2c3d4e5f';
const IVDR: Array<[string, string]> = [
  ['II.1.a', 'Product name and intended purpose'],
  ['II.2.b', 'Instructions for use'],
  ['II.3.b', 'Manufacturing processes'],
  ['II.4.a', 'GSPR checklist'],
  ['II.5.a', 'Risk management plan and file'],
  ['II.6.1.a', 'Analytical sensitivity'],
  ['II.6.2.b', 'Clinical performance'],
  ['II.6.2.c', 'Performance evaluation plan and report'],
  ['II.6.3.a', 'Claimed shelf life and real-time stability'],
  ['III.1', 'Post-market surveillance plan (Article 79)'],
];
const body = (key: string) => `Authored body for ${key}.`;
const assemble = () => assembleTechnicalFileFromProgram({ programId: PROGRAM, organizationId: ORG, userId: 4, regulation: 'ivdr' });

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, governedSections: true });
  holder.db = h.db;
  holder.pool = h.pglite;
  await h.pglite.exec(`
    CREATE TABLE IF NOT EXISTS authoring_documents (id uuid PRIMARY KEY, tenant_id int NOT NULL, status text,
      c2c_document_id text REFERENCES c2c_documents(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS authoring_sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_id uuid REFERENCES authoring_documents(id),
      code text, title text, content text, order_index int, created_at timestamptz NOT NULL DEFAULT now(), tenant_id int NOT NULL);
    INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title)
      VALUES ('doc_ivdr', ${ORG}, '${PROGRAM}', 'ivdr', 'ema', 'eu-ivdr', 'IVDR TF');
  `);
}, 120_000);
afterAll(async () => { await h?.close?.(); });

/** Every required IVDR slot authored and filed; the editor holds the same text for II.6.1.a. */
beforeEach(async () => {
  holder.audit.length = 0;
  await h.pglite.exec(`TRUNCATE authoring_sections, authoring_documents; DELETE FROM c2c_document_sections WHERE document_id = 'doc_ivdr';`);
  for (const [i, [key, label]] of IVDR.entries()) {
    await h.pglite.query(`INSERT INTO c2c_document_sections (document_id, section_key, label, path_order, mandatory, status, content)
      VALUES ('doc_ivdr', $1, $2, $3, true, 'approved', jsonb_build_object('text', $4::text))`, [key, label, i + 1, body(key)]);
  }
  await h.pglite.query(`INSERT INTO authoring_documents (id, tenant_id, status, c2c_document_id) VALUES ($1, $2, 'DRAFT', 'doc_ivdr')`, [EDITING, ORG]);
  await h.pglite.query(`INSERT INTO authoring_sections (doc_id, code, title, content, order_index, tenant_id)
    VALUES ($1, 'II.6.1.a', 'Analytical sensitivity', $2, 1, $3)`, [EDITING, body('II.6.1.a'), ORG]);
});

describe('the EU technical file asks whether the filing holds the document\'s text', () => {
  it('assembles from a filing that holds its editing copy', async () => {
    const result = await assemble();
    expect(result.fileCount).toBeGreaterThan(0);
  });

  it('refuses a filed copy that was rewritten, naming it and the remedy, and assembles nothing', async () => {
    await h.pglite.query(`UPDATE c2c_document_sections SET content = jsonb_build_object('text', 'Sensitivity was not evaluated.'::text)
      WHERE document_id = 'doc_ivdr' AND section_key = 'II.6.1.a'`);
    const refused = await assemble().then(() => null, (e: unknown) => e as Error & { code?: string });
    expect(refused, 'a technical file was assembled over a rewritten filed copy').not.toBeNull();
    expect(refused!.code).toBe('FILING_DIVERGED');
    expect(refused!.message).toMatch(/^The technical file was not assembled\. The filed copy of section II\.6\.1\.a is not the document's text\./);
    expect(refused!.message).toMatch(/Re-file saved text/);
    expect(holder.audit.filter((r) => r.action === 'DEVICE_TECHNICAL_FILE_ASSEMBLED')).toEqual([]);
  });

  it('a filing no editing document is bound to is not applicable, and assembles', async () => {
    await h.pglite.query('UPDATE authoring_documents SET c2c_document_id = NULL');
    await h.pglite.query(`UPDATE c2c_document_sections SET content = jsonb_build_object('text', 'Edited outside the editor.'::text)
      WHERE document_id = 'doc_ivdr' AND section_key = 'II.6.1.a'`);
    const result = await assemble();
    expect(result.fileCount).toBeGreaterThan(0);
  });
});
