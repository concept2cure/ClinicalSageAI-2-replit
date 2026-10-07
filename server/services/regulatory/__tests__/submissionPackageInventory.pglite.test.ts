import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { loadSavedSubmissionInventory } from '../submissionPackageInventory';
import type { CanonicalStoreHandle } from '../canonicalDocumentStore';

const program = '0a000000-0000-4000-8000-00000000000a';
const other = '0b000000-0000-4000-8000-00000000000b';
let pg: PGlite;
let store: CanonicalStoreHandle;
let ordinal = 0;
const context = { organizationId: 42, projectRef: program };
const read = () => loadSavedSubmissionInventory({ pool: pg, db: store, context, registryId: 'US_NDA' });

async function seed(type: string, stage: string, extras: Record<string, unknown> = {}) {
  ordinal++;
  const id = `00000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
  await pg.query(`INSERT INTO canonical_documents
    (canonical_id, organization_id, project_id, title, document_type, stage, has_content, content_hash, approval_signature, placement)
    VALUES ($1, $2, $3, 'Saved source', $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
  [id, extras.org ?? 42, extras.project ?? program, type, stage, extras.hasContent ?? true, extras.hash ?? 'saved-hash',
    extras.signature === false ? null : extras.signature ? JSON.stringify(extras.signature) : JSON.stringify({ actor: '7', role: 'approver', meaning: 'approved', boundContentHash: 'saved-hash', signatureRef: 'saved-signature', signedAt: '2026-10-07T00:00:00Z' }),
    extras.placement ? JSON.stringify(extras.placement) : null]);
  return id;
}

beforeAll(async () => {
  pg = new PGlite();
  store = drizzle(pg) as unknown as CanonicalStoreHandle;
  await pg.exec(readFileSync('migrations/20260731c_canonical_documents.sql', 'utf8'));
  await pg.exec(`CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamptz);
    INSERT INTO regulatory_programs VALUES ('${program}', 42, NULL), ('${other}', 43, NULL);`);
});
afterAll(async () => { await pg.close(); });

describe('saved package inventory uses the canonical store with real SQL', () => {
  it('reads only this project and tenant, using exact saved document types and placements', async () => {
    const id = await seed('ICH_CSR', 'placed', { placement: { registryId: 'US_NDA', sectionCode: '5.3', ctdModule: 'M5' } });
    await seed('form_356h', 'authoring');
    await seed('cover_letter', 'approved', { org: 43 });
    await seed('prescribing_info', 'approved', { project: other });
    await seed('quality_overall_summary', 'placed', { placement: { registryId: 'EU_MAA', sectionCode: '2.3', ctdModule: 'M2' } });
    const result = (await read())!;
    expect(result.programId).toBe(program);
    expect(result.artifacts.map(a => a.type)).toEqual(['csr', 'form_356h']);
    expect(result.artifacts.find(a => a.type === 'csr')).toMatchObject({ status: 'approved', documentId: id });
    expect(result.artifacts.find(a => a.type === 'form_356h')?.status).toBe('draft');
    expect(result.sections).toEqual([{ code: '5.3', status: 'approved', documentIds: [id] }]);
    expect(result.notices.join(' ')).toMatch(/Unlinked working documents/);
  });

  it('empty content and incomplete approval projections cannot vouch for completed evidence', async () => {
    await seed('clinical_overview', 'approved', { signature: false });
    await seed('nonclinical_overview', 'approved', { hasContent: false });
    await seed('investigator_brochure', 'approved', { hash: '' });
    const result = (await read())!;
    expect(result.artifacts.find(a => a.type === 'clinical_overview')?.status).toBe('review');
    expect(result.artifacts.find(a => a.type === 'nonclinical_overview')?.status).toBe('missing');
    expect(result.artifacts.find(a => a.type === 'investigator_brochure')?.status).toBe('missing');
  });

  it('wrong-meaning, malformed or stale-bound signatures cannot count as approved progress', async () => {
    const base = { actor: '7', role: 'approver', signatureRef: 'saved-signature', signedAt: '2026-10-07T00:00:00Z', meaning: 'approved', boundContentHash: 'saved-hash' };
    const reviewed = await seed('cover_letter', 'approved', { signature: { ...base, meaning: 'reviewed' } });
    const stale = await seed('cover_letter', 'approved', { signature: { ...base, boundContentHash: 'earlier-hash' } });
    const empty = await seed('cover_letter', 'approved', { signature: {} });
    const result = (await read())!;
    for (const id of [reviewed, stale, empty]) expect(result.artifacts.find(a => a.documentId === id)?.status).toBe('review');
  });

  it('retired empty projections retain their retired status and cannot defeat current evidence', async () => {
    await seed('clinical_overview', 'superseded', { hasContent: false, hash: '' });
    await seed('nonclinical_overview', 'withdrawn', { hasContent: false, hash: '' });
    const result = (await read())!;
    expect(result.artifacts.filter(a => a.type === 'clinical_overview').map(a => a.status)).toContain('superseded');
    expect(result.artifacts.filter(a => a.type === 'nonclinical_overview').map(a => a.status)).toContain('withdrawn');
  });

  it('a foreign or deleted active project cannot be assessed', async () => {
    expect(await loadSavedSubmissionInventory({ pool: pg, db: store, context: { organizationId: 42, projectRef: other }, registryId: 'US_NDA' })).toBeNull();
    await pg.query('UPDATE regulatory_programs SET deleted_at = now() WHERE id = $1', [program]);
    expect(await read()).toBeNull();
    await pg.query('UPDATE regulatory_programs SET deleted_at = NULL WHERE id = $1', [program]);
  });

  it('a failed content query throws instead of returning a successful empty inventory', async () => {
    await pg.exec('ALTER TABLE canonical_documents RENAME TO canonical_documents_unavailable');
    await expect(read()).rejects.toThrow(/canonical_documents/);
    await pg.exec('ALTER TABLE canonical_documents_unavailable RENAME TO canonical_documents');
  });
});
