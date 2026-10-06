/** New grounding is eligibility gated; recorded citation history remains readable. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Queryable } from '../../clinical-regulatory-evidence/span-lineage.service';
import {
  createDispositionHarness, insertCapturedSuccessor,
  type DispositionFixture, type DispositionHarness,
} from './disposition-fixture';

let harness: DispositionHarness;
vi.mock('../../../db', () => ({
  pool: { query: (sql: string, params?: unknown[]) => harness.db.query(sql, params) },
}));

import { citeSource, listSectionSources, refreshSourceCitation } from '../../clinical-regulatory-evidence/source-usage.service';

beforeAll(async () => {
  harness = await createDispositionHarness();
  await harness.pg.exec(`
    ALTER TABLE authoring_documents ADD COLUMN client_program_id uuid;
    ALTER TABLE authoring_citations ADD COLUMN anchor jsonb;
    ALTER TABLE authoring_citations ADD COLUMN citation_text text;
    ALTER TABLE authoring_citations ADD COLUMN payload_sha256 text;
    ALTER TABLE authoring_citations ADD COLUMN created_by text;
    ALTER TABLE authoring_citations ADD COLUMN created_at timestamptz DEFAULT now();
    ALTER TABLE authoring_citations ADD COLUMN frozen_at timestamptz;
  `);
});
afterAll(async () => { await harness.close(); });

async function section(f: DispositionFixture) {
  const docId = randomUUID();
  const sectionId = randomUUID();
  await harness.pg.query(`INSERT INTO authoring_documents (id,tenant_id,status,client_program_id) VALUES ($1,$2,'draft',$3)`, [docId,f.org,f.program]);
  await harness.pg.query('INSERT INTO authoring_sections (id,doc_id,tenant_id) VALUES ($1,$2,$3)', [sectionId,docId,f.org]);
  return sectionId;
}
const executor = (): Queryable => harness.db as unknown as Queryable;
async function citationRows(f: DispositionFixture, sectionId: string) {
  return (await harness.pg.query('SELECT * FROM authoring_citations WHERE tenant_id=$1 AND section_id=$2 ORDER BY id', [f.org,sectionId])).rows;
}

describe('canonical citation write eligibility', () => {
  it('allows new citations and refreshes against retained extracted data', async () => {
    const f = await harness.seed();
    const sectionId = await section(f);
    await f.apply('keep_data');
    const cited = await citeSource(f.org, { sectionId, sourceId: f.capture, citationText: 'Retained source values', createdBy: '42' }, executor());
    expect(cited).toMatchObject({ created: true, citedChecksum: 'a'.repeat(64) });
    const refreshed = await refreshSourceCitation(f.org, { sectionId, citationId: cited.citationId }, executor());
    expect(refreshed).toMatchObject({ ok: true, changed: false, currentChecksum: 'a'.repeat(64) });
    expect(await citationRows(f,sectionId)).toHaveLength(1);
  });

  it('refuses withdrawn data before creating a new canonical citation', async () => {
    const f = await harness.seed();
    const sectionId = await section(f);
    await f.apply('remove_data');
    await expect(citeSource(f.org, { sectionId, sourceId: f.capture, createdBy: '42' }, executor()))
      .rejects.toMatchObject({ name: 'SourceUsageError', code: 'SOURCE_WITHDRAWN' });
    expect(await citationRows(f,sectionId)).toEqual([]);
  });

  it('refuses reciting or refreshing terminal data while preserving its historical citation', async () => {
    const f = await harness.seed();
    const sectionId = await section(f);
    const cited = await citeSource(f.org, { sectionId, sourceId: f.capture, citationText: 'Original recorded citation', createdBy: '42' }, executor());
    const before = await citationRows(f,sectionId);
    await f.apply('remove_data');
    await expect(citeSource(f.org, { sectionId, sourceId: f.capture, citationText: 'Re-affirmed source grounding', createdBy: '42' }, executor()))
      .rejects.toMatchObject({ code: 'SOURCE_WITHDRAWN' });
    expect(await refreshSourceCitation(f.org, { sectionId, citationId: cited.citationId }, executor()))
      .toEqual({ ok: false, reason: 'source_withdrawn' });
    expect(await citationRows(f,sectionId)).toEqual(before);
    const history = await listSectionSources(f.org,sectionId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ citationId: cited.citationId, citationText: 'Original recorded citation', citedChecksum: 'a'.repeat(64), source: { id: f.capture } });
  });

  it('refuses predecessor grounding after supersession and permits its verified replacement', async () => {
    const f = await harness.seed();
    const sectionId = await section(f);
    const replacementId = await insertCapturedSuccessor(f);
    await f.apply('supersede', { replacementId });
    await expect(citeSource(f.org, { sectionId, sourceId: f.capture, createdBy: '42' }, executor()))
      .rejects.toMatchObject({ code: 'SOURCE_WITHDRAWN' });
    const successorCitation = await citeSource(f.org, { sectionId, sourceId: replacementId, createdBy: '42' }, executor());
    expect(successorCitation).toMatchObject({ created: true, citedChecksum: 'd'.repeat(64) });
    expect(await citationRows(f,sectionId)).toHaveLength(1);
  });

  it.each(['remove_data','supersede'] as const)('the database refuses direct citation INSERT and UPDATE after %s', async choice => {
    const f = await harness.seed();
    const sectionId = await section(f);
    const prior = await citeSource(f.org, { sectionId, sourceId: f.capture, citationText: 'Historical citation', createdBy: '42' }, executor());
    const replacementId = choice === 'supersede' ? await insertCapturedSuccessor(f) : undefined;
    await f.apply(choice, replacementId ? { replacementId } : {});
    await expect(harness.pg.query(`INSERT INTO authoring_citations (id,section_id,tenant_id,source,reference_id,payload_sha256)
      VALUES ($1,$2,$3,'cre_evidence_source',$4,$5)`, [randomUUID(),sectionId,f.org,String(f.capture),'a'.repeat(64)]))
      .rejects.toMatchObject({ code: '55000' });
    await expect(harness.pg.query('UPDATE authoring_citations SET citation_text=$1 WHERE id=$2', ['Re-affirmed citation',prior.citationId]))
      .rejects.toMatchObject({ code: '55000' });
    expect(await citationRows(f,sectionId)).toHaveLength(1);
  });

  it('fails closed when eligibility cannot be read', async () => {
    const f = await harness.seed();
    const sectionId = await section(f);
    await harness.pg.query('ALTER TABLE public.document_data_dispositions RENAME TO unavailable_dispositions');
    try {
      await expect(citeSource(f.org, { sectionId, sourceId: f.capture, createdBy: '42' }, executor()))
        .rejects.toMatchObject({ code: '42P01' });
      expect(await citationRows(f,sectionId)).toEqual([]);
    } finally {
      await harness.pg.query('ALTER TABLE public.unavailable_dispositions RENAME TO document_data_dispositions');
    }
  });
});
