/**
 * `materializeLeafSources` must be able to materialize a leaf that points at
 * the GOVERNED authoring store (`c2c_document_sections`) — the rows the MDx
 * editor and the eu-mdr / eu-ivdr rule packs write. Before this branch existed
 * every such leaf came back unresolved with "unsupported document_table", so no
 * authored MDR/IVDR section could ever reach a package. Runs on PGlite.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));

import { materializeLeafSources, leafSourceKey } from '../leaf-source-resolver';

let harness: IndPgliteDb;
const ORG = 8;
const OTHER_ORG = 9;
const PROGRAM = '5b0f2f0e-9a7d-4a2e-8c3f-2d1e6f7a8b9c';
const OTHER_PROGRAM = '6c1a3a1f-0b8e-4b3f-9d4a-3e2f7a8b9c0d';
const ids: Record<string, number> = {};
let stageDir = '';

beforeAll(async () => {
  harness = await createIndPgliteDb({ leafSources: true, governedSections: true });
  holder.db = harness.db;
  stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'leaf-src-governed-'));

  await harness.pglite.exec(`
    INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title)
    VALUES ('doc_mdr_8', ${ORG}, '${PROGRAM}', 'mdr', 'ema', 'eu-mdr-2017-745-annex-ii-v1.0', 'AcmeScope technical documentation'),
           ('doc_mdr_9', ${OTHER_ORG}, '${OTHER_PROGRAM}', 'mdr', 'ema', 'eu-mdr-2017-745-annex-ii-v1.0', 'Other tenant document');

    INSERT INTO c2c_document_sections (document_id, section_key, parent_key, label, path_order, mandatory, status, content)
    VALUES
      ('doc_mdr_8', 'II.1.a', 'II.1', 'Product/trade name, general description, intended purpose and intended users', 3, true, 'approved',
        '{"text":"AcmeScope is a single-use sterile arthroscope intended for visualisation of joint spaces."}'::jsonb),
      ('doc_mdr_8', 'II.5.a', 'II.5', 'Risk management plan and file — EN ISO 14971', 21, true, 'locked',
        '{"paragraphs":[{"text":"Risk management is conducted per EN ISO 14971:2019."},{"text":"Residual risks are acceptable."}]}'::jsonb),
      ('doc_mdr_8', 'II.6.1.g', 'II.6.1', 'Clinical evaluation report — Annex XIV Part A', 31, true, 'drafted',
        '{"text":"Clinical evaluation draft based on equivalence to the predicate generation."}'::jsonb),
      ('doc_mdr_8', 'II.2.b', 'II.2', 'Instructions for use, in the required Union languages', 12, true, 'todo', '{}'::jsonb),
      ('doc_mdr_9', 'II.1.a', 'II.1', 'Cross-tenant section', 3, true, 'approved',
        '{"text":"This body belongs to another organisation and must never render for ORG 8."}'::jsonb);
  `);
  const rows = await harness.pglite.query<{ id: number | string; document_id: string; section_key: string }>(
    'SELECT id, document_id, section_key FROM c2c_document_sections',
  );
  for (const r of rows.rows) ids[`${r.document_id}:${r.section_key}`] = Number(r.id);
});

afterAll(async () => {
  await harness.close();
  await fs.rm(stageDir, { recursive: true, force: true });
});

describe('materializeLeafSources — c2c_document_sections', () => {
  it('renders approved, locked and drafted sections to real PDFs; flags the draft as unfinalized', async () => {
    const leaves = ['II.1.a', 'II.5.a', 'II.6.1.g'].map((k) => ({
      documentTable: 'c2c_document_sections',
      documentId: ids[`doc_mdr_8:${k}`],
    }));
    const result = await materializeLeafSources({ leaves, organizationId: ORG, stageDir });

    expect(result.unresolved).toEqual([]);
    expect(result.materialized).toBe(3);
    for (const leaf of leaves) {
      const resolved = result.byKey.get(leafSourceKey(leaf.documentTable, leaf.documentId));
      expect(resolved).toBeDefined();
      expect(resolved!.md5).toMatch(/^[0-9a-f]{32}$/);
      const buf = await fs.readFile(resolved!.sourcePath);
      expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
    // approved + locked are finalized; drafted is not.
    expect(result.unfinalized).toBe(1);
    expect(result.unfinalizedSections).toEqual([{ sectionCode: 'II.6.1.g', status: 'drafted' }]);
  });

  it('never materializes an empty section — it is unresolved with an honest reason', async () => {
    const result = await materializeLeafSources({
      leaves: [{ documentTable: 'c2c_document_sections', documentId: ids['doc_mdr_8:II.2.b'] }],
      organizationId: ORG,
      stageDir,
    });
    expect(result.materialized).toBe(0);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].reason).toMatch(/no authored content/i);
  });

  it('never renders a section whose parent document belongs to another organization', async () => {
    const result = await materializeLeafSources({
      leaves: [{ documentTable: 'c2c_document_sections', documentId: ids['doc_mdr_9:II.1.a'] }],
      organizationId: ORG,
      stageDir,
    });
    expect(result.materialized).toBe(0);
    expect(result.byKey.size).toBe(0);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].reason).toMatch(/not found in this organization/i);
  });
});
