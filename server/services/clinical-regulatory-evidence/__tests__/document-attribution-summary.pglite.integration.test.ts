/**
 * Document-level attribution summary — END-TO-END on PGlite (ledger L179).
 *
 * The figure an author is shown about their own document has to be arithmetic,
 * not a vibe, so every case here pins exact character counts against the real
 * span-lineage schema.
 *
 * What these tests are really defending:
 *
 *   - CHARACTERS, NOT SPANS. Ten short citations and one long author paragraph
 *     is "10 from sources, 1 authored" by span count while most of the text is
 *     the author's. The partition is measured in characters for that reason.
 *   - "ATTRIBUTED" IS NOT "SOURCED". getSelectionOrigins.coveragePercent counts
 *     any lineage, author assertions included — correct for the selection panel,
 *     and false as a document-level claim that text "traces to a source".
 *   - THE PARTITION IS EXACT. byKind sums to attributedChars, and
 *     attributed + unattributed = contentLength. A surface that stacks these
 *     into one bar cannot be made to render more than the document.
 *   - PRECEDENCE NEVER FLATTERS. Where two kinds claim a character, the weaker
 *     claim is what gets reported.
 *   - STALE IS REPORTED, NOT SUBTRACTED. A citation whose source moved is still
 *     a citation; it must not silently become "unattributed", and it must not
 *     vanish either.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const exec = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as any[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../../db', () => ({
  pool: { query: (s: string, p?: unknown[]) => exec.query(s, p) },
  db: {},
}));

import { summarizeDocumentAttribution } from '../span-lineage.service';

const ORG = 91;
const DOC = { documentTable: 'concept2cure_artifacts', documentId: '501' };

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

/** Checksum each source carried when it was created, so a citation can record
 *  the value that was current — recordSourceSpan copies it, and a fixed stand-in
 *  would make EVERY source span born stale and the stale test vacuous. */
const sourceChecksums = new Map<number, string>();

/** Insert a span directly: these tests are about the arithmetic, not the writers. */
async function span(opts: {
  kind: 'cre_evidence_source' | 'author_assertion' | 'accepted_machine_draft' | 'machine_draft';
  start: number;
  end: number;
  sourceId?: number;
  machineAuthorId?: string;
}) {
  const { kind, start, end } = opts;
  const common = [ORG, DOC.documentTable, DOC.documentId, start, end, 'a'.repeat(64), kind];
  if (kind === 'cre_evidence_source') {
    await exec.query(
      `INSERT INTO document_span_lineage
         (organization_id, document_table, document_id, char_start, char_end,
          span_text_sha256, provenance_kind, source, reference_id, payload_sha256, usage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'cre_evidence_source',$8,$9,'quoted')`,
      [...common, String(opts.sourceId), sourceChecksums.get(opts.sourceId!) ?? 'unknown'],
    );
    return;
  }
  if (kind === 'author_assertion') {
    await exec.query(
      `INSERT INTO document_span_lineage
         (organization_id, document_table, document_id, char_start, char_end,
          span_text_sha256, provenance_kind, asserted_by, asserted_at, usage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'42', now(),'asserted')`,
      common,
    );
    return;
  }
  if (kind === 'accepted_machine_draft') {
    await exec.query(
      `INSERT INTO document_span_lineage
         (organization_id, document_table, document_id, char_start, char_end,
          span_text_sha256, provenance_kind, machine_author_id, asserted_by, asserted_at, usage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'42', now(),'asserted')`,
      [...common, opts.machineAuthorId ?? 'ana'],
    );
    return;
  }
  await exec.query(
    `INSERT INTO document_span_lineage
       (organization_id, document_table, document_id, char_start, char_end,
        span_text_sha256, provenance_kind, machine_author_id, usage)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'asserted')`,
    [...common, opts.machineAuthorId ?? 'ana'],
  );
}

async function makeSource(checksum: string): Promise<number> {
  const { rows } = await exec.query(
    `INSERT INTO cre_evidence_sources
       (organization_id, visibility_class, source_type, title, checksum, ingestion_status, extraction_status)
     VALUES ($1,'tenant_private','client_document','csr.pdf',$2,'ingested','extracted') RETURNING id`,
    [ORG, checksum],
  );
  const id = Number((rows[0] as any).id);
  sourceChecksums.set(id, checksum);
  return id;
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG},'a');`);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
  await pglite.exec(migration('migrations/20260907_span_lineage_accepted_machine_draft.sql'));
  await pglite.exec(migration('migrations/20260908_span_lineage_machine_draft.sql'));
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

beforeEach(async () => {
  await pglite.exec(`DELETE FROM document_span_lineage; DELETE FROM cre_evidence_sources;`);
  sourceChecksums.clear();
});

describe('summarizeDocumentAttribution', () => {
  it('partitions the document by character, and the parts sum exactly', async () => {
    const sourceId = await makeSource('s1');
    await span({ kind: 'cre_evidence_source', start: 0, end: 40, sourceId });
    await span({ kind: 'author_assertion', start: 40, end: 70 });

    const s = await summarizeDocumentAttribution(ORG, DOC, 100, exec as any);

    expect(s.contentLength).toBe(100);
    expect(s.byKind.fromSources).toBe(40);
    expect(s.byKind.authorAsserted).toBe(30);
    expect(s.attributedChars).toBe(70);
    expect(s.unattributedChars).toBe(30);

    // The invariants a stacked bar depends on.
    const parts =
      s.byKind.fromSources + s.byKind.authorAsserted + s.byKind.machineDrafted + s.byKind.machineDraftedUnaccepted;
    expect(parts).toBe(s.attributedChars);
    expect(s.attributedChars + s.unattributedChars).toBe(s.contentLength);
  });

  it('counts characters, not spans — the figure span counts would get wrong', async () => {
    const sourceId = await makeSource('s1');
    // Ten short citations (2 chars each) and one long author paragraph.
    for (let i = 0; i < 10; i += 1) {
      await span({ kind: 'cre_evidence_source', start: i * 2, end: i * 2 + 2, sourceId });
    }
    await span({ kind: 'author_assertion', start: 20, end: 100 });

    const s = await summarizeDocumentAttribution(ORG, DOC, 100, exec as any);

    // By span count this is "10 from sources, 1 authored". By character — which
    // is what a percentage has to mean — it is overwhelmingly the author's.
    expect(s.byKind.fromSources).toBe(20);
    expect(s.byKind.authorAsserted).toBe(80);
  });

  it('counts overlapping citations once rather than over-crediting the document', async () => {
    const a = await makeSource('s1');
    const b = await makeSource('s2');
    // Two sources backing the same sentence.
    await span({ kind: 'cre_evidence_source', start: 0, end: 50, sourceId: a });
    await span({ kind: 'cre_evidence_source', start: 25, end: 60, sourceId: b });

    const s = await summarizeDocumentAttribution(ORG, DOC, 100, exec as any);
    expect(s.byKind.fromSources).toBe(60);
    expect(s.attributedChars).toBe(60);
  });

  it('reports the WEAKER claim where two kinds cover the same characters', async () => {
    const sourceId = await makeSource('s1');
    // A citation and an unaccepted machine draft over the same range. Reporting
    // it as sourced would hide that nobody has accepted this text.
    await span({ kind: 'cre_evidence_source', start: 0, end: 50, sourceId });
    await span({ kind: 'machine_draft', start: 0, end: 50 });

    const s = await summarizeDocumentAttribution(ORG, DOC, 50, exec as any);
    expect(s.byKind.machineDraftedUnaccepted).toBe(50);
    expect(s.byKind.fromSources).toBe(0);
    expect(s.attributedChars).toBe(50);
  });

  it('reports stale citations as stale AND still sourced, never as unattributed', async () => {
    const sourceId = await makeSource('current-checksum');
    await span({ kind: 'cre_evidence_source', start: 0, end: 30, sourceId });

    // Control: a citation recording the checksum that is current is NOT stale.
    // Without this the assertion below would pass even if nothing ever moved.
    expect((await summarizeDocumentAttribution(ORG, DOC, 30, exec as any)).staleChars).toBe(0);

    // The source moves underneath the citation.
    await exec.query(`UPDATE cre_evidence_sources SET checksum = 'moved' WHERE id = $1`, [sourceId]);

    const s = await summarizeDocumentAttribution(ORG, DOC, 30, exec as any);
    expect(s.staleChars).toBe(30);
    // Still a citation: the link exists, it just no longer matches.
    expect(s.byKind.fromSources).toBe(30);
    expect(s.unattributedChars).toBe(0);
  });

  it('clips a span that reaches past the end of the current text', async () => {
    const sourceId = await makeSource('s1');
    // The document was edited down; the span still describes the old length.
    await span({ kind: 'cre_evidence_source', start: 0, end: 500, sourceId });

    const s = await summarizeDocumentAttribution(ORG, DOC, 100, exec as any);
    expect(s.byKind.fromSources).toBe(100);
    expect(s.attributedChars).toBe(100);
    expect(s.unattributedChars).toBe(0);
  });

  it('reports a document with no lineage as fully unattributed, not as covered', async () => {
    const s = await summarizeDocumentAttribution(ORG, DOC, 250, exec as any);
    expect(s.attributedChars).toBe(0);
    expect(s.unattributedChars).toBe(250);
    expect(s.byKind).toEqual({
      fromSources: 0,
      authorAsserted: 0,
      machineDrafted: 0,
      machineDraftedUnaccepted: 0,
    });
  });

  it('projects the spans for painting — clipped, ordered, and without the checksum', async () => {
    const sourceId = await makeSource('s1');
    await span({ kind: 'author_assertion', start: 60, end: 90 });
    await span({ kind: 'cre_evidence_source', start: 0, end: 500, sourceId }); // past the end

    const s = await summarizeDocumentAttribution(ORG, DOC, 100, exec as any);

    // Document order, not insertion order — a painter walks them in sequence.
    expect(s.spans.map((sp) => [sp.charStart, sp.charEnd])).toEqual([
      [0, 100],
      [60, 90],
    ]);
    expect(s.spans[0].provenanceKind).toBe('cre_evidence_source');
    expect(s.spans[0].sourceTitle).toBe('csr.pdf');
    expect(s.spans[0].stale).toBe(false);

    // A projection, not the row: nothing here hands a browser a checksum or an
    // actor id it has no use for.
    expect(Object.keys(s.spans[0]).sort()).toEqual([
      'charEnd', 'charStart', 'provenanceKind', 'sourceTitle', 'stale', 'usage',
    ]);
  });

  it('marks a span whose source moved as stale for the painter too', async () => {
    const sourceId = await makeSource('before');
    await span({ kind: 'cre_evidence_source', start: 0, end: 30, sourceId });
    await exec.query(`UPDATE cre_evidence_sources SET checksum = 'after' WHERE id = $1`, [sourceId]);

    const s = await summarizeDocumentAttribution(ORG, DOC, 30, exec as any);
    expect(s.spans).toHaveLength(1);
    expect(s.spans[0].stale).toBe(true);
  });

  it('reports empty content as empty rather than dividing by zero', async () => {
    const s = await summarizeDocumentAttribution(ORG, DOC, 0, exec as any);
    expect(s.contentLength).toBe(0);
    expect(s.attributedChars).toBe(0);
    expect(s.unattributedChars).toBe(0);
  });
});
