/**
 * §14.3.3 of an imported CSR is held by reference to the build's narrative
 * store (shared/csr-narrative-reference.ts). The editor shows it read-only;
 * this pins the server's own refusal, so a save through the API cannot change
 * the text either (document-lock.ts refuseNarrativeReferenceContentWrite).
 * The receipts are written in the shape insertSectionSeedTx writes them
 * (authoring-section-seed.ts). SQL runs against PGlite. SYNTHETIC data.
 */
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DocumentWriteReservationError, refuseNarrativeReferenceContentWrite } from '../document-lock';
import { CSR_NARRATIVE_REFERENCE_SCHEMA } from '../../../../shared/csr-narrative-reference';

const ORG = 41;
const OTHER_ORG = 42;
let pg: PGlite;
const q = { query: async (sql: string, params?: unknown[]) => {
  const result = await pg.query(sql, params as unknown[]);
  return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
} };
const migration = (file: string) => readFileSync(new URL(`../../../../${file}`, import.meta.url), 'utf8');

const reference = { schema: CSR_NARRATIVE_REFERENCE_SCHEMA, jobId: 7, sectionNumber: '14.3.3', narratives: 1500,
  storeDigest: 'a'.repeat(64), landedSha256: 'b'.repeat(64), landedLength: 2_327_062, openingSha256: 'c'.repeat(64) };
const origin = (code: string, withReference: boolean) => ({ code, sourceRowId: `csr_section_outputs:${code}`, contentSha256: 'd'.repeat(64),
  originalAuthorship: 'machine', model: null, modelEvidence: 'unrecorded', ...(withReference ? { narrativeReference: reference } : {}) });
const importSource = (withReference: boolean, kind = 'csr') => ({ kind, id: '7', programId: '11111111-1111-4111-8111-111111111111',
  sectionOrigins: [origin('11.4', false), origin('14.3.3', withReference)] });

/** One imported document's section, with the creation receipt insertSectionSeedTx writes. */
async function importedSection(code: string, source: Record<string, unknown>, tenant = ORG): Promise<string> {
  const docId = randomUUID();
  const sectionId = randomUUID();
  await q.query(`INSERT INTO authoring_documents(id,title,module,locale,version,created_by,tenant_id) VALUES($1,'CSR','M5','en','1.0','9',$2)`, [docId, tenant]);
  await q.query(`INSERT INTO authoring_sections(id,doc_id,code,title,content,tenant_id) VALUES($1,$2,$3,NULL,'<p>Opening.</p>',$4)`, [sectionId, docId, code, tenant]);
  const sectionOrigins = (source.sectionOrigins as Array<{ code: string }>);
  await q.query(`INSERT INTO authoring_audit_trail(doc_id,section_id,operation_type,actor_email,actor_id,tenant_id,metadata)
    VALUES($1,$2,'CREATE','author@example.test','9',$3,$4::jsonb)`, [docId, sectionId, tenant, JSON.stringify({
    provenance: { importSource: source }, drafted: true, workflowSourceOrigin: sectionOrigins.find(o => o.code === code) ?? null, section_code: code })]);
  return sectionId;
}

async function refusal(sectionId: string, tenant = ORG): Promise<unknown> {
  return refuseNarrativeReferenceContentWrite(q, sectionId, tenant).then(() => null, (error: unknown) => error);
}

beforeAll(async () => {
  pg = new PGlite();
  for (const file of ['db/migrations/20260725_authoring_document_loop_tables.sql', 'db/migrations/20260725_authoring_audit_trail.sql']) {
    await pg.exec(migration(file));
  }
}, 90_000);
afterAll(async () => { await pg.close(); });

describe('a save that changes §14.3.3 held by reference is refused (SYNTHETIC)', () => {
  it('refuses the section the import holds by reference, with 409 and its code', async () => {
    const error = await refusal(await importedSection('14.3.3', importSource(true)));
    expect(error).toBeInstanceOf(DocumentWriteReservationError);
    expect(error).toMatchObject({ status: 409, code: 'CSR_NARRATIVE_REFERENCE_READ_ONLY' });
  });

  it('keeps refusing after the section is renamed: the creation receipt decides, not the current code', async () => {
    const sectionId = await importedSection('14.3.3', importSource(true));
    await q.query(`UPDATE authoring_sections SET code = '14.3.4' WHERE id = $1`, [sectionId]);
    expect(await refusal(sectionId)).toMatchObject({ code: 'CSR_NARRATIVE_REFERENCE_READ_ONLY' });
  });

  it('allows every other section of the same import', async () => {
    expect(await refusal(await importedSection('11.4', importSource(true)))).toBeNull();
  });

  it('allows a §14.3.3 imported before the reference existed (held as its own text)', async () => {
    expect(await refusal(await importedSection('14.3.3', importSource(false)))).toBeNull();
  });

  it('allows a section that is not a CSR import, and does not read across tenants', async () => {
    expect(await refusal(await importedSection('14.3.3', importSource(true, 'protocol')))).toBeNull();
    const elsewhere = await importedSection('14.3.3', importSource(true), OTHER_ORG);
    expect(await refusal(elsewhere, ORG)).toBeNull();
    expect(await refusal(elsewhere, OTHER_ORG)).toMatchObject({ code: 'CSR_NARRATIVE_REFERENCE_READ_ONLY' });
  });
});
