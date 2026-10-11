/** Run the actual source/catalog/pin readers against the disposition migration. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createDispositionHarness } from './disposition-fixture';
import * as eligibility from '../eligibility';

const connection = vi.hoisted(() => ({ query: null as null | ((sql: string, params?: unknown[]) => Promise<{ rows: any[] }>) }));
vi.mock('../../../db.js', () => ({ pool: {
  query: (sql: string, params?: unknown[]) => connection.query!(sql, params),
} }));

let harness: Awaited<ReturnType<typeof createDispositionHarness>>;
const sourceExecutor = {
  query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]) => ({ rows: (await harness.pg.query<R>(sql, params)).rows }),
};
let spine: typeof import('../../clinical-regulatory-evidence/evidence-spine.service');
let catalog: typeof import('../../vault/document-catalog.service');
let retained: typeof import('../../clinical-regulatory-evidence/retained-source-context');
let links: typeof import('../../clinical-regulatory-evidence/retrieval-source-link');

beforeAll(async () => {
  harness = await createDispositionHarness();
  connection.query = harness.db.query;
  await harness.pg.exec(`
    ALTER TABLE cre_evidence_sources ADD COLUMN visibility_class text DEFAULT 'tenant_private',
      ADD COLUMN client_workspace_id integer, ADD COLUMN created_at timestamptz DEFAULT now();
    ALTER TABLE regulatory_programs ADD COLUMN name text DEFAULT 'Study program';
    ALTER TABLE vault.documents ADD COLUMN document_code text DEFAULT 'STUDY-01',
      ADD COLUMN document_type text DEFAULT 'CSR', ADD COLUMN file_name text DEFAULT 'Study.pdf',
      ADD COLUMN mime_type text DEFAULT 'application/pdf', ADD COLUMN folder_id text,
      ADD COLUMN evidence_kind text, ADD COLUMN ctd_section text,
      ADD COLUMN placement_status text DEFAULT 'unfiled', ADD COLUMN created_at timestamptz DEFAULT now();
    ALTER TABLE vault.document_catalog ADD COLUMN catalog_status text DEFAULT 'cataloged',
      ADD COLUMN extraction_method text DEFAULT 'pdf_text', ADD COLUMN extraction_confidence numeric,
      ADD COLUMN extraction_error text, ADD COLUMN char_count integer DEFAULT 22,
      ADD COLUMN word_count integer, ADD COLUMN page_count integer, ADD COLUMN document_kind text,
      ADD COLUMN purpose text, ADD COLUMN summary text, ADD COLUMN cataloged_at timestamptz DEFAULT now();
  `);
  spine = await import('../../clinical-regulatory-evidence/evidence-spine.service');
  catalog = await import('../../vault/document-catalog.service');
  retained = await import('../../clinical-regulatory-evidence/retained-source-context');
  links = await import('../../clinical-regulatory-evidence/retrieval-source-link');
});
afterAll(async () => { await harness.close(); });

describe('source and catalog consumers of an actual recorded disposition', () => {
  it('starts with a readable file and an eligible, identifiable source', async () => {
    const f = await harness.seed();
    expect(await spine.resolveSourceUploadIds(f.org, [f.capture])).toEqual([f.upload]);
    expect((await spine.listClientDocuments(f.org, { programId: f.program }))[0])
      .toMatchObject({ id: f.capture, dataEligible: true, originalFileAvailable: true, disposition: null });
    expect((await catalog.listProjectDocuments(f.org, { programId: f.program })).documents).toHaveLength(1);
  });

  it('retains extracted text and lineage while refusing original-file pins', async () => {
    const f = await harness.seed();
    await f.apply('keep_data');
    expect(await spine.resolveSourceUploadIds(f.org, [f.capture])).toEqual([]);
    expect((await spine.listClientDocuments(f.org, { programId: f.program }))[0])
      .toMatchObject({ dataEligible: true, originalFileAvailable: false, disposition: 'keep_data' });
    expect(await catalog.loadDocumentForOrg(f.vault, f.org, { includeText: true }))
      .toMatchObject({ extractedText: 'Extracted study values', originalFileAvailable: false, disposition: 'keep_data' });
    expect(await retained.readRetainedSourceContexts(f.org, f.program, [f.capture])).toEqual([
      expect.objectContaining({ sourceId: f.capture, text: 'Extracted study values', sha256: 'a'.repeat(64),
        textSha256: createHash('sha256').update('Extracted study values').digest('hex'), originalFileAvailable: false }),
    ]);
    expect(await retained.readRetainedSourceContexts(f.org, randomUUID(), [f.capture])).toEqual([]);
    expect(await retained.readRetainedSourceContexts(f.org + 1, f.program, [f.capture])).toEqual([]);
    expect((await links.resolveEvidenceSourceIdsByArtifact(f.org, [`cre_source:${f.capture}`], sourceExecutor)).get(`cre_source:${f.capture}`)).toBe(f.capture);
  });

  it('resolves retained Vault text through the programme tenant for legacy null organization metadata', async () => {
    const f = await harness.seed();
    await harness.pg.query('UPDATE vault.documents SET organization_id=NULL WHERE id=$1', [f.vault]);
    await f.apply('keep_data');
    expect(await retained.readRetainedSourceContexts(f.org, f.program, [f.capture])).toEqual([
      expect.objectContaining({ text: 'Extracted study values', representationId: `vault:${f.vault}` }),
    ]);
    expect(await retained.readRetainedSourceContexts(f.org + 1, f.program, [f.capture])).toEqual([]);
  });

  it('withdraws new grounding without rewriting the historical captured identity', async () => {
    const f = await harness.seed();
    await f.apply('remove_data');
    expect((await spine.listClientDocuments(f.org, { programId: f.program }))[0])
      .toMatchObject({ id: f.capture, dataEligible: false, originalFileAvailable: false, disposition: 'remove_data' });
    expect(await retained.readRetainedSourceContexts(f.org, f.program, [f.capture])).toEqual([]);
    expect(await catalog.loadDocumentForOrg(f.vault, f.org, { includeText: true })).toBeNull();
    expect((await catalog.listProjectDocuments(f.org, { programId: f.program })).documents).toEqual([]);
    expect(await links.resolveEvidenceSourceIdsByArtifact(f.org, [`cre_source:${f.capture}`], sourceExecutor)).toEqual(new Map());
    expect(await spine.getSource(f.org, f.capture)).toMatchObject({ id: f.capture, checksum: 'a'.repeat(64), dataEligible: false });
    expect((await harness.pg.query('SELECT * FROM document_span_lineage WHERE organization_id=$1', [f.org])).rows).toHaveLength(1);
  });

  it('detects the original-file leak if the binary-availability predicate is removed', async () => {
    const f = await harness.seed();
    await f.apply('keep_data');
    expect(await spine.resolveSourceUploadIds(f.org, [f.capture])).toEqual([]);
    const mutant = vi.spyOn(eligibility, 'capturedBinaryAvailableSql').mockReturnValue('TRUE');
    try { expect(await spine.resolveSourceUploadIds(f.org, [f.capture])).toEqual([f.upload]); }
    finally { mutant.mockRestore(); }
    expect(await spine.resolveSourceUploadIds(f.org, [f.capture])).toEqual([]);
  });
});
