import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  AdvancedRAGPipeline, type RetrievedDocument, type RetrievalOptions,
} from '../advancedRAGPipeline.js';
import {
  createDispositionHarness, type DispositionHarness, type DispositionFixture,
} from '../document-data-disposition/__tests__/disposition-fixture.js';

type Internal = Pick<AdvancedRAGPipeline, 'queryWithGeneration'> & {
  revalidateCandidates(documents: RetrievedDocument[], options: RetrievalOptions): Promise<RetrievedDocument[]>;
};
let harness: DispositionHarness;
beforeAll(async () => {
  harness = await createDispositionHarness();
  await harness.pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, uuid uuid NOT NULL);
    ALTER TABLE vault.documents ADD COLUMN file_name text;
    ALTER TABLE lumen_data_atoms ADD COLUMN title text;
    ALTER TABLE rag_documents ADD COLUMN title text;
  `);
});
afterAll(async () => { await harness.close(); });

async function sources(f: DispositionFixture) {
  const uuid = randomUUID();
  await f.pg.query('INSERT INTO organizations VALUES ($1,$2)', [f.org, uuid]);
  const chunk = (await f.pg.query<{ id: string }>('SELECT id FROM vault.document_chunks WHERE document_id=$1', [f.vault])).rows[0].id;
  const rag = (await f.pg.query<{ id: string; document_id: string }>(`SELECT c.id,d.id AS document_id FROM rag_chunks c
    JOIN rag_documents d ON d.id=c.document_id WHERE d.organization_id=$1`, [f.org])).rows[0];
  const atom = (await f.pg.query<{ id: number }>(`SELECT id FROM lumen_data_atoms
    WHERE organization_id=$1 AND source_type='vault_document'`, [f.org])).rows[0].id;
  const document = (id: string, type: string, documentId?: string): RetrievedDocument => ({
    id, chunkId: id, documentId, atomType: type, title: 'Study source',
    content: 'Captured stored study passage', initialScore: 1, finalScore: 1,
  });
  return {
    options: { strategy: 'basic' as const, organizationUuid: uuid, organizationId: f.org },
    docs: [document(chunk, 'vault_chunk', f.vault), document(rag.id, 'rag_chunk', rag.document_id),
      document(String(atom), 'project_atom')],
  };
}
function pipeline(f: DispositionFixture): Internal {
  const instance = Object.create(AdvancedRAGPipeline.prototype) as Internal;
  Object.assign(instance, { pool: f.db });
  return instance;
}

describe('RAG candidate policy checks execute against canonical disposition SQL', () => {
  it('keeps scoped guidance and refuses foreign private rows and identities without a tenant', async () => {
    const f = await harness.seed();
    const own = await sources(f);
    const other = await sources(await harness.seed());
    const p = pipeline(f);
    const result = await p.revalidateCandidates([...own.docs, ...other.docs], own.options);
    expect(result.map(d => d.id)).toEqual(own.docs.map(d => d.id));
    expect(await p.revalidateCandidates(own.docs, { strategy: 'basic' })).toEqual([]);
    expect(await p.revalidateCandidates([{ ...own.docs[0], documentId: randomUUID() }], own.options)).toEqual([]);
  });

  it('marks retained Vault, RAG and atom text, then excludes it after the later withdrawal without deleting history', async () => {
    const f = await harness.seed();
    const selected = await sources(f);
    const p = pipeline(f);
    await f.apply('keep_data');
    const retained = await p.revalidateCandidates(selected.docs, selected.options);
    expect(retained).toHaveLength(3);
    expect(retained.every(d => d.originalFileAvailable === false && d.title.includes('original file unavailable'))).toBe(true);
    await f.apply('remove_data');
    expect(await p.revalidateCandidates(selected.docs, selected.options)).toEqual([]);
    expect((await f.pg.query('SELECT id FROM vault.document_chunks WHERE document_id=$1', [f.vault])).rows).toHaveLength(1);
    expect(await f.records()).toHaveLength(2);
  });

  it('withholds a generated answer when a real disposition commits during the provider await', async () => {
    const f = await harness.seed();
    const selected = await sources(f);
    const p = pipeline(f);
    const route = vi.fn(async () => {
      await f.apply('remove_data');
      return { content: 'A draft answer based on the now withdrawn study.' };
    });
    Object.assign(p, {
      retrieve: vi.fn(async () => ({ documents: selected.docs, totalCandidates: 3, retrievalStrategy: 'basic',
        tokensUsed: 0, processingTimeMs: 0 })), aiRouter: { route },
    });
    const result = await p.queryWithGeneration('Describe the study', selected.options);
    expect(route).toHaveBeenCalledOnce();
    expect(result.sources).toEqual([]);
    expect(result.answer).toContain('could not find relevant information');
    expect(result.answer).not.toContain('withdrawn study');
  });
});
