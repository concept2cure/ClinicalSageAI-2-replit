/**
 * Automated source attribution — END-TO-END against in-process PGlite.
 *
 * The unit tests (source-attribution.test.ts) pin the pure match rules. This
 * proves the persistence bridge closes the loop against the real schema: a
 * drafted passage whose sentences are verbatim in a retrieved source is recorded
 * as `cre_evidence_source` spans, and then the very reads the Data Origins panel
 * uses (getSelectionOrigins, listDocumentSpans) return them — with the source
 * resolved and the span standing as `current`. This is the mechanism that was
 * built but had no writer; here it has one, proven against the migrations a
 * deployed database runs.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as unknown[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) } }));

import { attributeAndRecordSourceSpans } from '../source-attribution';
import * as lineage from '../span-lineage.service';

const ORG_A = 711;
const ORG_B = 822;

// A sentence that will be verbatim in the source, and one that will not.
const QUOTED = 'The primary endpoint was met at week twelve in the intent-to-treat population.';
const ORIGINAL = 'These findings were consistent across every prespecified subgroup we examined.';
const GENERATED = `${QUOTED} ${ORIGINAL}`;
const SOURCE_TEXT = `Clinical study report. ${QUOTED} Additional narrative detail follows here.`;

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

async function makeSource(orgId: number | null, checksum: string, title = 'csr.pdf'): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO cre_evidence_sources
       (organization_id, visibility_class, source_type, title, checksum,
        ingestion_status, extraction_status)
     VALUES ($1, $2, 'client_document', $3, $4, 'ingested', 'extracted')
     RETURNING id`,
    [orgId, orgId === null ? 'global_public' : 'tenant_private', title, checksum],
  );
  return (rows[0] as { id: number }).id;
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG_A},'a'), (${ORG_B},'b');`);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

describe('attributeAndRecordSourceSpans — the write side, end to end', () => {
  it('records only the verifiably-quoted sentence, and the Data Origins reads return it', async () => {
    const sourceId = await makeSource(ORG_A, 'sha-csr-1');
    const doc = { documentTable: 'authoring_sections', documentId: 'sec-e2e-1' };

    const result = await attributeAndRecordSourceSpans(
      ORG_A,
      doc,
      GENERATED,
      [{ sourceId, content: SOURCE_TEXT }],
      { granularity: 'sentence', createdBy: 'user-1' },
      pool,
    );

    // Exactly the quoted sentence was recorded; the original prose was not.
    expect(result.recorded).toBe(1);
    expect(result.distinctSources).toBe(1);
    expect(result.spans[0].spanText).toBe(QUOTED);
    expect(result.coverage).toBeGreaterThan(0);
    expect(result.coverage).toBeLessThan(100);

    // The forward read the Data Origins panel uses now returns a real source span.
    const spans = await lineage.listDocumentSpans(ORG_A, doc);
    expect(spans).toHaveLength(1);
    expect(spans[0].provenanceKind).toBe('cre_evidence_source');
    expect(spans[0].referenceId).toBe(String(sourceId));
    expect(spans[0].usage).toBe('quoted');
    // Checksum was captured at record time from the source, so it stands current.
    expect(spans[0].state).toBe('current');

    // getSelectionOrigins over the quoted range resolves to that source.
    const origins = await lineage.getSelectionOrigins(
      ORG_A,
      doc,
      0,
      QUOTED.length,
      QUOTED,
    );
    expect(origins.counts.fromSources).toBe(1);
    expect(origins.origins.some((o) => o.referenceId === String(sourceId))).toBe(true);
  });

  it('is idempotent — re-recording the same draft converges instead of duplicating', async () => {
    const sourceId = await makeSource(ORG_A, 'sha-csr-2');
    const doc = { documentTable: 'authoring_sections', documentId: 'sec-e2e-idem' };
    const sources = [{ sourceId, content: SOURCE_TEXT }];

    await attributeAndRecordSourceSpans(ORG_A, doc, GENERATED, sources, { granularity: 'sentence' }, pool);
    await attributeAndRecordSourceSpans(ORG_A, doc, GENERATED, sources, { granularity: 'sentence' }, pool);

    const spans = await lineage.listDocumentSpans(ORG_A, doc);
    expect(spans).toHaveLength(1);
  });

  it('records nothing when no sentence is verifiably quoted', async () => {
    const sourceId = await makeSource(ORG_A, 'sha-csr-3');
    const doc = { documentTable: 'authoring_sections', documentId: 'sec-e2e-none' };

    const result = await attributeAndRecordSourceSpans(
      ORG_A,
      doc,
      GENERATED,
      [{ sourceId, content: 'A wholly unrelated source about manufacturing controls.' }],
      { granularity: 'sentence' },
      pool,
    );

    expect(result.recorded).toBe(0);
    expect(await lineage.listDocumentSpans(ORG_A, doc)).toHaveLength(0);
  });

  it('throws rather than record a citation to a source the tenant cannot see', async () => {
    // A source owned by ORG_B, cited while writing an ORG_A document.
    const foreignSource = await makeSource(ORG_B, 'sha-foreign');
    const doc = { documentTable: 'authoring_sections', documentId: 'sec-e2e-foreign' };

    await expect(
      attributeAndRecordSourceSpans(
        ORG_A,
        doc,
        GENERATED,
        [{ sourceId: foreignSource, content: SOURCE_TEXT }],
        { granularity: 'sentence' },
        pool,
      ),
    ).rejects.toThrow();

    // And nothing leaked into the document's lineage.
    expect(await lineage.listDocumentSpans(ORG_A, doc)).toHaveLength(0);
  });

  it('records the multi-source case honestly — same sentence, two sources', async () => {
    const src1 = await makeSource(ORG_A, 'sha-multi-1');
    const src2 = await makeSource(ORG_A, 'sha-multi-2');
    const doc = { documentTable: 'authoring_sections', documentId: 'sec-e2e-multi' };

    const result = await attributeAndRecordSourceSpans(
      ORG_A,
      doc,
      QUOTED,
      [
        { sourceId: src1, content: `One: ${QUOTED}` },
        { sourceId: src2, content: `Two: ${QUOTED}` },
      ],
      { granularity: 'sentence' },
      pool,
    );

    expect(result.recorded).toBe(2);
    expect(result.distinctSources).toBe(2);
    const spans = await lineage.listDocumentSpans(ORG_A, doc);
    expect(spans.map((s) => s.referenceId).sort()).toEqual([String(src1), String(src2)].sort());
  });
});
