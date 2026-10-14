/** Real source admission and DOCX bibliography against PGlite. Historical
 * references remain readable; a pasted marker cannot invent an association. */
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import type { Queryable } from '../../clinical-regulatory-evidence/span-lineage.service';
import { createDispositionHarness, type DispositionHarness, type DispositionFixture } from '../../document-data-disposition/__tests__/disposition-fixture';

let harness: DispositionHarness;
vi.mock('../../../db', () => ({ pool: { query: (sql: string, params?: unknown[]) => harness.db.query(sql, params) } }));
import { citeSource, refreshSourceCitation, listCitationSources } from '../../clinical-regulatory-evidence/source-usage.service';
import { renderAuthoringExport, type ExportSectionRow } from '../authoring-export';

beforeAll(async () => {
  harness = await createDispositionHarness();
  await harness.pg.exec(`
    ALTER TABLE authoring_citations ADD COLUMN anchor jsonb, ADD COLUMN citation_text text, ADD COLUMN payload_sha256 text,
      ADD COLUMN created_by text, ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN frozen_at timestamptz;
    ALTER TABLE cre_evidence_sources ADD COLUMN sponsor text, ADD COLUMN document_date date, ADD COLUMN source_record_identifier text,
      ADD COLUMN trial_registry_identifier text, ADD COLUMN application_number text;
    CREATE TABLE authoring_audit_trail (id uuid,doc_id uuid,section_id uuid,tenant_id integer,operation_type text,metadata jsonb,created_at timestamptz);
  `);
});
afterAll(async () => { await harness?.close(); });
const executor = (): Queryable => harness.db as unknown as Queryable;

async function section(f: DispositionFixture, docId = randomUUID()) {
  await harness.pg.query("INSERT INTO authoring_documents (id,tenant_id,status,client_program_id) VALUES ($1,$2,'draft',$3) ON CONFLICT DO NOTHING", [docId, f.org, f.program]);
  const sectionId = randomUUID();
  await harness.pg.query('INSERT INTO authoring_sections (id,doc_id,tenant_id) VALUES ($1,$2,$3)', [sectionId, docId, f.org]);
  return { docId, sectionId };
}

async function otherProjectSource(f: DispositionFixture) {
  const programId = randomUUID();
  await harness.pg.query('INSERT INTO regulatory_programs VALUES ($1,$2,42,NULL)', [programId, f.org]);
  return (await harness.pg.query<{ id: number }>(`INSERT INTO cre_evidence_sources
    (organization_id,client_program_id,source_type,title,checksum,is_current)
    VALUES ($1,$2,'client_document','Other project protocol',$3,true) RETURNING id`, [f.org, programId, 'b'.repeat(64)])).rows[0].id;
}

const marker = (sourceId: number) => `<p>Source-supported claim <a data-cite="${sourceId}">Source name cache</a>.</p>`;
const exportSection = (sectionId: string, sourceId: number): ExportSectionRow => ({ id: sectionId, code: '3.2.S.1', title: 'Overview', content: marker(sourceId) });
async function render(f: DispositionFixture, docId: string, sections: ExportSectionRow[], query: Queryable = executor()) {
  const output = await renderAuthoringExport({ executor: query, tenantId: f.org,
    doc: { id: docId, title: 'Working document', status: 'draft', client_program_id: f.program }, sections, format: 'docx', signatures: [] });
  return new AdmZip(output.fileContent).getEntry('word/document.xml')!.getData().toString();
}

describe('new canonical grounding and refresh use current same-project data', () => {
  it('refuses normal source retirement before creating or re-affirming a citation', async () => {
    const f = await harness.seed(); const s = await section(f);
    const cited = await citeSource(f.org, { sectionId: s.sectionId, sourceId: f.capture, createdBy: '42' }, executor());
    await harness.pg.query('UPDATE cre_evidence_sources SET is_current=false WHERE id=$1', [f.capture]);
    const fresh = await section(f);
    for (const sectionId of [s.sectionId, fresh.sectionId]) {
      await expect(citeSource(f.org, { sectionId, sourceId: f.capture, citationText: 'New grounding', createdBy: '42' }, executor()))
        .rejects.toMatchObject({ code: 'SOURCE_WITHDRAWN' });
    }
    expect((await harness.pg.query('SELECT id FROM authoring_citations WHERE section_id=ANY($1::uuid[])', [[s.sectionId, fresh.sectionId]])).rows).toEqual([{ id: cited.citationId }]);
  });

  it('refuses refresh of a retired source without changing its recorded checksum', async () => {
    const f = await harness.seed(); const s = await section(f);
    const cited = await citeSource(f.org, { sectionId: s.sectionId, sourceId: f.capture, createdBy: '42' }, executor());
    await harness.pg.query('UPDATE cre_evidence_sources SET is_current=false WHERE id=$1', [f.capture]);
    expect(await refreshSourceCitation(f.org, { sectionId: s.sectionId, citationId: cited.citationId }, executor()))
      .toEqual({ ok: false, reason: 'source_withdrawn' });
    expect((await harness.pg.query('SELECT payload_sha256 FROM authoring_citations WHERE id=$1', [cited.citationId])).rows)
      .toEqual([{ payload_sha256: 'a'.repeat(64) }]);
  });

  it('refuses refreshing a legacy same-organization cross-project citation', async () => {
    const f = await harness.seed(); const s = await section(f); const sourceId = await otherProjectSource(f);
    const citationId = randomUUID();
    await harness.pg.query(`INSERT INTO authoring_citations (id,section_id,tenant_id,source,reference_id,payload_sha256)
      VALUES ($1,$2,$3,'cre_evidence_source',$4,$5)`, [citationId, s.sectionId, f.org, String(sourceId), 'a'.repeat(64)]);
    expect(await refreshSourceCitation(f.org, { sectionId: s.sectionId, citationId }, executor())).toEqual({ ok: false, reason: 'cross_project' });
    expect((await harness.pg.query('SELECT payload_sha256 FROM authoring_citations WHERE id=$1', [citationId])).rows)
      .toEqual([{ payload_sha256: 'a'.repeat(64) }]);
  });
});

describe('bibliographies resolve only the exact section association', () => {
  it.each(['own', 'other'] as const)('pasted unregistered %s-project markers take no number or reference entry', async scope => {
    const f = await harness.seed(); const s = await section(f);
    const sourceId = scope === 'own' ? f.capture : await otherProjectSource(f);
    const xml = await render(f, s.docId, [exportSection(s.sectionId, sourceId)]);
    expect(xml).toContain('Citation unresolved');
    expect(xml).not.toContain('References');
    expect(xml).not.toContain(scope === 'own' ? 'Captured study.pdf' : 'Other project protocol');
  });

  it('an association elsewhere in the document cannot legitimize an earlier pasted marker', async () => {
    const f = await harness.seed(); const recorded = await section(f); const pasted = await section(f, recorded.docId);
    await citeSource(f.org, { sectionId: recorded.sectionId, sourceId: f.capture, createdBy: '42' }, executor());
    const xml = await render(f, recorded.docId, [exportSection(pasted.sectionId, f.capture), exportSection(recorded.sectionId, f.capture)]);
    expect(xml).toContain('Citation unresolved');
    expect(xml).toContain('[1]');
    expect(xml).not.toContain('[2]');
    expect(xml.match(/Captured study\.pdf/g)).toHaveLength(1);
  });

  it('withdrawn recorded data cannot lend its name to a new bibliography', async () => {
    const f = await harness.seed(); const s = await section(f);
    await citeSource(f.org, { sectionId: s.sectionId, sourceId: f.capture, createdBy: '42' }, executor());
    await f.apply('remove_data');
    expect(await listCitationSources(f.org, [f.capture], { documentId: s.docId, sectionId: s.sectionId }, executor())).toEqual([]);
    const xml = await render(f, s.docId, [exportSection(s.sectionId, f.capture)]);
    expect(xml).toContain('Citation unresolved');
    expect(xml).not.toContain('Captured study.pdf');
  });

  it('eligible registered frozen history remains resolvable after ordinary supersession', async () => {
    const f = await harness.seed(); const s = await section(f);
    const cited = await citeSource(f.org, { sectionId: s.sectionId, sourceId: f.capture, createdBy: '42' }, executor());
    await harness.pg.query('UPDATE authoring_citations SET frozen_at=now(),payload_sha256=NULL WHERE id=$1', [cited.citationId]);
    await harness.pg.query('UPDATE cre_evidence_sources SET is_current=false WHERE id=$1', [f.capture]);
    const xml = await render(f, s.docId, [exportSection(s.sectionId, f.capture)]);
    expect(xml).toContain('Captured study.pdf');
    expect(xml).toContain('[1]');
    expect(xml).not.toContain('Citation unresolved');
  });

  it('valid retained citations resolve through the supplied render executor, with no global-pool read', async () => {
    const f = await harness.seed(); const s = await section(f);
    await citeSource(f.org, { sectionId: s.sectionId, sourceId: f.capture, createdBy: '42' }, executor());
    await f.apply('keep_data');
    const queries: string[] = [];
    const observed: Queryable = { query: async <R>(sql: string, params?: unknown[]) => { queries.push(sql); return executor().query<R>(sql, params); } };
    const xml = await render(f, s.docId, [exportSection(s.sectionId, f.capture)], observed);
    expect(xml).toContain('Captured study.pdf');
    expect(queries.some(sql => /FROM cre_evidence_sources/.test(sql))).toBe(true);
  });
});
