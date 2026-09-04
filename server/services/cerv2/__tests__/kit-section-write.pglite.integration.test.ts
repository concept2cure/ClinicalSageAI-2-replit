/**
 * Ledger L160 — the one AnA writer of device-kit section prose.
 *
 * Real PGlite with the kit tables, the evidence spine and the span-lineage
 * store: the writer locks the prior row, writes the content, appends the
 * version row through the shared version writer, and records lineage — all
 * on the caller's client — or refuses.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeKitSectionTx, KitSectionNotFoundError } from '../kit-section-write';

const ORG = 61;
const OTHER_ORG = 62;
const USER = 41;
const QUOTED = 'The primary endpoint was met at week twelve in the intent-to-treat population.';
const ORIGINAL = 'These findings were consistent across every prespecified subgroup we examined.';
let pglite: PGlite;
const exec = {
  query: async <R = any>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number }> => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as R[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}
async function seedSection(key: string, orgId = ORG): Promise<number> {
  const r = await exec.query(
    `INSERT INTO cerv2_510k_sections (organization_id, section_number, section_title, section_key, category, display_order, content, status, completion_percentage)
     VALUES ($1, '5.0', 'Substantial Equivalence', $2, 'Device', 1, 'ORIGINAL body text', 'drafting', 10) RETURNING id`,
    [orgId, key],
  );
  return (r.rows[0] as { id: number }).id;
}
async function spans(id: number) {
  const r = await exec.query(
    `SELECT provenance_kind, reference_id FROM document_span_lineage WHERE document_table = 'cerv2_510k_sections' AND document_id = $1 AND deleted_at IS NULL`,
    [String(id)],
  );
  return r.rows as Array<{ provenance_kind: string; reference_id: string | null }>;
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'a'), (${OTHER_ORG}, 'b');
    CREATE TABLE cerv2_510k_sections (
      id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, section_number TEXT, section_title TEXT NOT NULL,
      section_key TEXT NOT NULL, category TEXT NOT NULL, display_order INTEGER NOT NULL, content TEXT,
      status TEXT DEFAULT 'todo', completion_percentage INTEGER DEFAULT 0, last_edited_by INTEGER,
      draft_source TEXT, drafted_at TIMESTAMP, drafted_summary TEXT, accepted_at TIMESTAMP, accepted_by INTEGER,
      sources JSON, created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now());
    CREATE TABLE cerv2_section_versions (
      id SERIAL PRIMARY KEY, section_id INTEGER NOT NULL, organization_id INTEGER NOT NULL, version_number INTEGER NOT NULL,
      version_label TEXT, change_type TEXT NOT NULL, change_summary TEXT, content TEXT, field_data JSON, status TEXT,
      completion_percentage INTEGER, fields_changed TEXT[], previous_values JSON, new_values JSON, changed_by INTEGER,
      changed_by_name TEXT, changed_by_email TEXT, changed_at TIMESTAMP NOT NULL DEFAULT now(), ip_address TEXT,
      user_agent TEXT, comment TEXT, created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP DEFAULT now());
  `);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
}, 60_000);
afterAll(async () => {
  await pglite?.close();
});

describe('writeKitSectionTx', () => {
  it('by section_key: writes the content, marks it an AnA draft, appends the version row, records author lineage', async () => {
    const id = await seedSection('se-by-key');
    const r = await writeKitSectionTx(exec, ORG, { sectionKey: 'se-by-key' }, {
      content: `${QUOTED} ${ORIGINAL}`, status: 'ready_for_review', completionPercentage: 85, note: 'SE drafted', changeSummary: 'SE drafted', actorUserId: USER,
    });
    expect(r.row.id).toBe(id);
    expect(r.versionNumber).toBe(1);
    expect(r.fieldsChanged).toEqual(['content', 'status', 'completion_percentage']);
    const row = (await exec.query(`SELECT content, status, draft_source, accepted_at, last_edited_by FROM cerv2_510k_sections WHERE id = $1`, [id])).rows[0] as any;
    expect(row.draft_source).toBe('ana');
    expect(row.accepted_at).toBeNull();
    expect(row.last_edited_by).toBe(USER);
    const v = (await exec.query(`SELECT version_number, change_summary, previous_values FROM cerv2_section_versions WHERE section_id = $1`, [id])).rows[0] as any;
    expect(v.change_summary).toBe('SE drafted');
    expect(v.previous_values.content).toBe('ORIGINAL body text');
    const sp = await spans(id);
    expect(sp.length).toBeGreaterThanOrEqual(2);
    expect(sp.every((s) => s.provenance_kind === 'author_assertion')).toBe(true);
  });

  it('by section id, omitting status and completion keeps the current ones and says only content changed', async () => {
    const id = await seedSection('se-by-id');
    const r = await writeKitSectionTx(exec, ORG, { sectionId: id }, {
      content: `${ORIGINAL}`, changeSummary: 'Edited via AnA (thread t1)', actorUserId: USER, changedByName: `ana:${USER}`,
    });
    expect(r.row.status).toBe('drafting');
    expect(r.row.completionPercentage).toBe(10);
    expect(r.fieldsChanged).toEqual(['content']);
  });

  it('with sources, the verbatim clause is recorded against the cited Data Room source', async () => {
    const id = await seedSection('se-sources');
    const src = await exec.query(
      `INSERT INTO cre_evidence_sources (organization_id, visibility_class, source_type, title, checksum, ingestion_status, extraction_status)
       VALUES ($1, 'tenant_private', 'client_document', 'csr.pdf', 'sha-kit', 'ingested', 'extracted') RETURNING id`, [ORG]);
    const sourceId = (src.rows[0] as { id: number }).id;
    const r = await writeKitSectionTx(exec, ORG, { sectionId: id }, {
      content: `${QUOTED} ${ORIGINAL}`, changeSummary: 'cited', actorUserId: USER,
      sources: [{ sourceId, content: `Clinical study report. ${QUOTED} More.` }],
    });
    expect(r.gate?.sourceSpans).toBe(1);
    expect((await spans(id)).some((s) => s.provenance_kind === 'cre_evidence_source' && s.reference_id === String(sourceId))).toBe(true);
  });

  it('refuses a section of another organization, and refuses with no identified author', async () => {
    const theirs = await seedSection('se-theirs', OTHER_ORG);
    await expect(writeKitSectionTx(exec, ORG, { sectionId: theirs }, { content: 'x', changeSummary: 'x', actorUserId: USER }))
      .rejects.toBeInstanceOf(KitSectionNotFoundError);
    const mine = await seedSection('se-noauthor');
    await expect(writeKitSectionTx(exec, ORG, { sectionId: mine }, { content: 'x', changeSummary: 'x', actorUserId: 0 }))
      .rejects.toThrow(/identified author/);
    expect(((await exec.query(`SELECT content FROM cerv2_510k_sections WHERE id = $1`, [mine])).rows[0] as any).content).toBe('ORIGINAL body text');
  });
});
