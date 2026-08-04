/**
 * Span lineage — END-TO-END against in-process PGlite.
 *
 * The service is exercised against the real migrations rather than a mock, so
 * what is verified here is what a deployed database will actually do: the
 * CHECK constraints, the unique index that makes re-persisting converge, the
 * checksum captured at cite time, and the three reads that make the lineage
 * useful (forward, backward, propagation).
 *
 * The propagation case is the one worth reading. A span cites a source and
 * records that source's checksum. The source is then re-ingested with different
 * content. Nothing recomputes anything — the span still carries the OLD
 * checksum, so the database can state that this specific range of this specific
 * document is now written against superseded content. That is the difference
 * between provenance that is recorded and provenance that is guessed at.
 *
 * One PGlite instance for the file: several per file is slow and, worse, lets
 * state leak between cases in ways that hide ordering bugs.
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

import * as lineage from '../span-lineage.service';

const ORG_A = 711;
const ORG_B = 822;
const DOC = { documentTable: 'authoring_sections', documentId: 'sec-1' };

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

/** Insert a source directly — the spine service is not what is under test here. */
async function makeSource(
  orgId: number | null,
  checksum: string,
  title = 'protocol.pdf',
): Promise<number> {
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

describe('recordSourceSpan — citing a Data Room source', () => {
  it('records the span and captures the source checksum at cite time', async () => {
    const sourceId = await makeSource(ORG_A, 'sha-v1');
    const r = await lineage.recordSourceSpan(ORG_A, {
      ...DOC,
      charStart: 0,
      charEnd: 42,
      spanText: 'The primary endpoint was met at week 12.',
      sourceId,
      usage: 'paraphrased',
      sourceLocator: 'p.14',
    });

    expect(r.created).toBe(true);
    // The captured checksum is the mechanism, not a detail: it is what makes
    // staleness provable after the source moves.
    expect(r.citedChecksum).toBe('sha-v1');
  });

  it('is idempotent — re-persisting the same span reconciles instead of duplicating', async () => {
    const sourceId = await makeSource(ORG_A, 'sha-idem');
    const args = {
      ...DOC,
      documentId: 'sec-idem',
      charStart: 0,
      charEnd: 10,
      spanText: 'first ten',
      sourceId,
      usage: 'quoted' as const,
    };

    const first = await lineage.recordSourceSpan(ORG_A, args);
    const second = await lineage.recordSourceSpan(ORG_A, args);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);

    const spans = await lineage.listDocumentSpans(ORG_A, { ...DOC, documentId: 'sec-idem' });
    expect(spans).toHaveLength(1);
  });

  it('refuses a source belonging to another tenant', async () => {
    // Without this check the row is written stamped with the CALLER's org, so
    // it never surfaces but exists — the leak citeSource() documents.
    const foreign = await makeSource(ORG_B, 'sha-foreign');
    await expect(
      lineage.recordSourceSpan(ORG_A, {
        ...DOC,
        documentId: 'sec-foreign',
        charStart: 0,
        charEnd: 5,
        spanText: 'hello',
        sourceId: foreign,
        usage: 'quoted',
      }),
    ).rejects.toThrow(/not found in this organization/);
  });

  it('refuses an empty span and an unknown usage verb before touching the database', async () => {
    const sourceId = await makeSource(ORG_A, 'sha-guard');
    await expect(
      lineage.recordSourceSpan(ORG_A, {
        ...DOC,
        charStart: 7,
        charEnd: 7,
        spanText: '',
        sourceId,
        usage: 'quoted',
      }),
    ).rejects.toThrow(/greater than charStart/);

    await expect(
      lineage.recordSourceSpan(ORG_A, {
        ...DOC,
        charStart: 0,
        charEnd: 5,
        spanText: 'hello',
        sourceId,
        usage: 'vibes' as never,
      }),
    ).rejects.toThrow(/usage must be one of/);
  });
});

describe('recordAuthorSpan — original prose', () => {
  it("records the author as the span's provenance", async () => {
    const r = await lineage.recordAuthorSpan(ORG_A, {
      ...DOC,
      documentId: 'sec-author',
      charStart: 0,
      charEnd: 30,
      spanText: 'In our assessment this is not clinically meaningful.',
      assertedBy: 'user-7',
    });
    expect(r.created).toBe(true);

    const spans = await lineage.listDocumentSpans(ORG_A, { ...DOC, documentId: 'sec-author' });
    expect(spans).toHaveLength(1);
    expect(spans[0].provenanceKind).toBe('author_assertion');
    expect(spans[0].assertedBy).toBe('user-7');
    expect(spans[0].usage).toBe('asserted');
    // An assertion is not against external content, so it cannot go stale.
    expect(spans[0].state).toBe('current');
  });

  it('requires an author', async () => {
    await expect(
      lineage.recordAuthorSpan(ORG_A, {
        ...DOC,
        documentId: 'sec-noauthor',
        charStart: 0,
        charEnd: 5,
        spanText: 'hello',
        assertedBy: '',
      }),
    ).rejects.toThrow(/assertedBy is required/);
  });
});

describe('the three reads', () => {
  it('forward — what backs this document, in document order', async () => {
    const s1 = await makeSource(ORG_A, 'sha-f1', 'CSR 2019');
    const doc = { ...DOC, documentId: 'sec-forward' };

    await lineage.recordAuthorSpan(ORG_A, {
      ...doc,
      charStart: 50,
      charEnd: 80,
      spanText: 'our interpretation',
      assertedBy: 'user-7',
    });
    await lineage.recordSourceSpan(ORG_A, {
      ...doc,
      charStart: 0,
      charEnd: 20,
      spanText: 'quoted bit',
      sourceId: s1,
      usage: 'quoted',
    });

    const spans = await lineage.listDocumentSpans(ORG_A, doc);
    expect(spans.map((s) => s.charStart)).toEqual([0, 50]); // document order
    expect(spans[0].sourceTitle).toBe('CSR 2019');
    expect(spans[0].state).toBe('current');
  });

  it('backward — where is this source used, across documents', async () => {
    const shared = await makeSource(ORG_A, 'sha-shared', 'shared protocol');
    for (const id of ['sec-b1', 'sec-b2']) {
      await lineage.recordSourceSpan(ORG_A, {
        ...DOC,
        documentId: id,
        charStart: 0,
        charEnd: 12,
        spanText: 'twelve chars',
        sourceId: shared,
        usage: 'summarized',
      });
    }

    const uses = await lineage.listSpansCitingSource(ORG_A, shared);
    expect(uses.map((u) => u.documentId).sort()).toEqual(['sec-b1', 'sec-b2']);
  });

  it('propagation — a source that moved makes its spans stale, provably', async () => {
    const sourceId = await makeSource(ORG_A, 'sha-before', 'moving source');
    const doc = { ...DOC, documentId: 'sec-stale' };

    await lineage.recordSourceSpan(ORG_A, {
      ...doc,
      charStart: 0,
      charEnd: 25,
      spanText: 'written from v1 content',
      sourceId,
      usage: 'derived',
    });

    // Fresh, nothing stale.
    expect(await lineage.listStaleSpans(ORG_A)).toHaveLength(0);

    // The source's content identity moves underneath the citation.
    await pool.query(`UPDATE cre_evidence_sources SET checksum = 'sha-after' WHERE id = $1`, [
      sourceId,
    ]);

    const stale = await lineage.listStaleSpans(ORG_A);
    expect(stale).toHaveLength(1);
    expect(stale[0].documentId).toBe('sec-stale');
    // The span still carries what it cited, which is why this is a fact rather
    // than a recomputation.
    expect(stale[0].payloadSha256).toBe('sha-before');

    const forward = await lineage.listDocumentSpans(ORG_A, doc);
    expect(forward[0].state).toBe('changed');
  });

  it('does not leak another tenant\'s spans', async () => {
    const mine = await makeSource(ORG_A, 'sha-mine');
    await lineage.recordSourceSpan(ORG_A, {
      ...DOC,
      documentId: 'sec-tenant',
      charStart: 0,
      charEnd: 8,
      spanText: 'eight ch',
      sourceId: mine,
      usage: 'quoted',
    });

    expect(await lineage.listDocumentSpans(ORG_B, { ...DOC, documentId: 'sec-tenant' })).toEqual([]);
    expect(await lineage.listSpansCitingSource(ORG_B, mine)).toEqual([]);
  });
});

describe('replaceAuthorSpans — surviving an edit', () => {
  const doc = { ...DOC, documentId: 'sec-replace' };

  it('writes the whole set on first save', async () => {
    const r = await lineage.replaceAuthorSpans(
      ORG_A,
      doc,
      [
        { charStart: 0, charEnd: 10, spanText: 'first ten!' },
        { charStart: 11, charEnd: 20, spanText: 'next nine' },
      ],
      { assertedBy: 'user-7' },
    );
    expect(r).toEqual({ written: 2, retired: 0 });
    expect(await lineage.listDocumentSpans(ORG_A, doc)).toHaveLength(2);
  });

  it('retires spans the edited text no longer contains', async () => {
    // The author deletes the second clause and lengthens the first. Without
    // retirement the old [11,20) row survives, resolves cleanly, and describes
    // characters that are now something else entirely.
    const r = await lineage.replaceAuthorSpans(
      ORG_A,
      doc,
      [{ charStart: 0, charEnd: 14, spanText: 'first fourteen' }],
      { assertedBy: 'user-7' },
    );

    expect(r.written).toBe(1);
    expect(r.retired).toBe(2); // both prior ranges are gone

    const spans = await lineage.listDocumentSpans(ORG_A, doc);
    expect(spans).toHaveLength(1);
    expect(spans[0].charStart).toBe(0);
    expect(spans[0].charEnd).toBe(14);
  });

  it('retires by soft delete — the record of what was asserted survives', async () => {
    // A regulated system does not destroy the fact that something was once
    // asserted; it stops reporting it as current.
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM document_span_lineage
        WHERE document_id = 'sec-replace' AND deleted_at IS NOT NULL`,
    );
    expect((rows[0] as { n: number }).n).toBe(2);
  });

  it('leaves source citations alone when the prose is re-saved', async () => {
    // Saving prose must not silently drop evidence someone attached.
    const sourceId = await makeSource(ORG_A, 'sha-keep');
    const d2 = { ...DOC, documentId: 'sec-keepcite' };

    await lineage.recordSourceSpan(ORG_A, {
      ...d2, charStart: 0, charEnd: 12, spanText: 'cited twelve', sourceId, usage: 'quoted',
    });
    await lineage.replaceAuthorSpans(
      ORG_A,
      d2,
      [{ charStart: 20, charEnd: 30, spanText: 'my own bit' }],
      { assertedBy: 'user-7' },
    );

    const spans = await lineage.listDocumentSpans(ORG_A, d2);
    expect(spans.map((s) => s.provenanceKind).sort()).toEqual([
      'author_assertion',
      'cre_evidence_source',
    ]);
  });

  it('retires everything when the document is emptied', async () => {
    const d3 = { ...DOC, documentId: 'sec-emptied' };
    await lineage.replaceAuthorSpans(
      ORG_A, d3, [{ charStart: 0, charEnd: 5, spanText: 'hello' }], { assertedBy: 'user-7' },
    );
    const r = await lineage.replaceAuthorSpans(ORG_A, d3, [], { assertedBy: 'user-7' });
    expect(r).toEqual({ written: 0, retired: 1 });
    expect(await lineage.listDocumentSpans(ORG_A, d3)).toEqual([]);
  });
});

describe('assertLineageCoversContent — the save gate', () => {
  const doc = { ...DOC, documentId: 'sec-gate' };

  it('passes when the spans cover the content end to end', async () => {
    await lineage.replaceAuthorSpans(
      ORG_A,
      doc,
      [
        { charStart: 0, charEnd: 20, spanText: 'a'.repeat(20) },
        { charStart: 20, charEnd: 45, spanText: 'b'.repeat(25) },
      ],
      { assertedBy: 'user-7' },
    );
    await expect(lineage.assertLineageCoversContent(ORG_A, doc, 'x'.repeat(45))).resolves.toBeUndefined();
  });

  it('throws when the content extends past the last span', async () => {
    // The save that produced this content did not attribute its tail. Letting
    // it commit is how a document ends up with provenance for its first half.
    await expect(lineage.assertLineageCoversContent(ORG_A, doc, 'x'.repeat(80))).rejects.toThrow(
      /does not cover the saved content/,
    );
  });

  it('names the unattributed ranges so the failure is actionable', async () => {
    await expect(lineage.assertLineageCoversContent(ORG_A, doc, 'x'.repeat(80))).rejects.toThrow(/45-80/);
  });

  it('throws when there is a hole in the middle', async () => {
    const holed = { ...DOC, documentId: 'sec-hole' };
    await lineage.replaceAuthorSpans(
      ORG_A,
      holed,
      [
        { charStart: 0, charEnd: 10, spanText: '0123456789' },
        { charStart: 30, charEnd: 40, spanText: '0123456789' },
      ],
      { assertedBy: 'user-7' },
    );
    await expect(lineage.assertLineageCoversContent(ORG_A, holed, 'x'.repeat(40))).rejects.toThrow(/10-30/);
  });

  it('throws when a document has no lineage at all', async () => {
    await expect(
      lineage.assertLineageCoversContent(ORG_A, { ...DOC, documentId: 'sec-nothing' }, 'x'.repeat(25)),
    ).rejects.toThrow(/does not cover/);
  });

  it('passes trivially for empty content', async () => {
    await expect(
      lineage.assertLineageCoversContent(ORG_A, { ...DOC, documentId: 'sec-blank' }, ''),
    ).resolves.toBeUndefined();
  });

  it('ignores whitespace between spans — the gate must be satisfiable', async () => {
    // Clause spans are trimmed, so separators belong to no span by design.
    // Requiring every character to be attributed made the gate unsatisfiable
    // for any multi-clause text: it refused every real save while a
    // single-clause document passed. That is not a stricter invariant, it is a
    // broken one, and it reached CI before the authoring journey caught it.
    const ws = { ...DOC, documentId: 'sec-ws' };
    const content = 'First clause, second clause.';
    // Spans as detectSpans produces them: trimmed, with the space at 13 in
    // neither.
    await lineage.replaceAuthorSpans(
      ORG_A,
      ws,
      [
        { charStart: 0, charEnd: 13, spanText: 'First clause,' },
        { charStart: 14, charEnd: 28, spanText: 'second clause.' },
      ],
      { assertedBy: 'user-7' },
    );
    await expect(
      lineage.assertLineageCoversContent(ORG_A, ws, content),
    ).resolves.toBeUndefined();
  });

  it('still fails when the gap contains real characters', async () => {
    // The whitespace exemption must not become a hole: a gap with content in
    // it is exactly what the gate exists to catch.
    const ws = { ...DOC, documentId: 'sec-ws2' };
    const content = 'First clause, UNTRACED, second clause.';
    await lineage.replaceAuthorSpans(
      ORG_A,
      ws,
      [
        { charStart: 0, charEnd: 13, spanText: 'First clause,' },
        { charStart: 23, charEnd: 37, spanText: 'second clause.' },
      ],
      { assertedBy: 'user-7' },
    );
    await expect(lineage.assertLineageCoversContent(ORG_A, ws, content)).rejects.toThrow(
      /13-23/,
    );
  });

  it('does not count another tenant\'s spans as coverage', async () => {
    // Otherwise a tenant could satisfy their own gate with rows they cannot see.
    await expect(lineage.assertLineageCoversContent(ORG_B, doc, 'x'.repeat(45))).rejects.toThrow(
      /does not cover/,
    );
  });

  it('sees uncommitted rows when run on the same connection as the write', async () => {
    // This is the property the gate depends on: it runs inside the save's
    // transaction, so it must observe what that transaction has written but not
    // yet committed. Verified here against the same executor the route uses.
    const tx = { ...DOC, documentId: 'sec-tx' };
    await lineage.replaceAuthorSpans(
      ORG_A, tx, [{ charStart: 0, charEnd: 12, spanText: 'twelve chars' }], { assertedBy: 'u' },
      pool as never,
    );
    await expect(
      lineage.assertLineageCoversContent(ORG_A, tx, 'twelve chars', pool as never),
    ).resolves.toBeUndefined();
  });
});

describe('getSelectionOrigins — the read behind "Data Origins"', () => {
  const doc = { ...DOC, documentId: 'sec-selection' };
  let sourceId: number;

  it('sets up a document with a cited span and an authored span', async () => {
    sourceId = await makeSource(ORG_A, 'sha-sel', 'CSR 2021');
    await lineage.recordSourceSpan(ORG_A, {
      ...doc, charStart: 0, charEnd: 40, spanText: 'a'.repeat(40), sourceId, usage: 'paraphrased',
      sourceLocator: 'p.14',
    });
    await lineage.recordAuthorSpan(ORG_A, {
      ...doc, charStart: 40, charEnd: 70, spanText: 'b'.repeat(30), assertedBy: 'user-7',
    });
    expect(await lineage.listDocumentSpans(ORG_A, doc)).toHaveLength(2);
  });

  it('returns spans that OVERLAP the selection, not only those contained by it', async () => {
    // A reader drags from the middle of one clause into the next. Both are the
    // origin of what they highlighted; containment would return neither.
    const r = await lineage.getSelectionOrigins(ORG_A, doc, 20, 50, 'the highlighted text');
    expect(r.origins).toHaveLength(2);
    expect(r.counts.fromSources).toBe(1);
    expect(r.counts.authorAsserted).toBe(1);
    expect(r.coveragePercent).toBe(100);
  });

  it('reports gaps clipped to the selection, not to the whole document', async () => {
    // Selecting past the end of the attributed text must report the untraced
    // tail — and only the part the reader actually selected.
    const r = await lineage.getSelectionOrigins(ORG_A, doc, 60, 100);
    expect(r.uncovered).toEqual([{ charStart: 70, charEnd: 100 }]);
    expect(r.coveragePercent).toBe(25); // 10 of 40 characters covered
  });

  it('reports a wholly unattributed selection honestly', async () => {
    const r = await lineage.getSelectionOrigins(ORG_A, doc, 200, 260);
    expect(r.origins).toEqual([]);
    expect(r.uncovered).toEqual([{ charStart: 200, charEnd: 260 }]);
    expect(r.coveragePercent).toBe(0);
  });

  it('carries source title, locator and usage through for the panel', async () => {
    const r = await lineage.getSelectionOrigins(ORG_A, doc, 0, 10);
    expect(r.origins[0]).toMatchObject({
      sourceTitle: 'CSR 2021',
      sourceLocator: 'p.14',
      usage: 'paraphrased',
      state: 'current',
    });
  });

  it('marks an origin stale when its source has moved', async () => {
    await pool.query(`UPDATE cre_evidence_sources SET checksum = 'sha-sel-2' WHERE id = $1`, [
      sourceId,
    ]);
    const r = await lineage.getSelectionOrigins(ORG_A, doc, 0, 10);
    expect(r.origins[0].state).toBe('changed');
    expect(r.counts.stale).toBe(1);
  });

  it('does not answer for another tenant', async () => {
    const r = await lineage.getSelectionOrigins(ORG_B, doc, 0, 70);
    expect(r.origins).toEqual([]);
    expect(r.coveragePercent).toBe(0);
  });

  it('rejects a collapsed selection', async () => {
    await expect(lineage.getSelectionOrigins(ORG_A, doc, 5, 5)).rejects.toThrow(
      /greater than charStart/,
    );
  });
});

describe('findUncoveredRanges — what has no lineage yet', () => {
  it('reports the gaps between covered spans', async () => {
    const sourceId = await makeSource(ORG_A, 'sha-cover');
    const doc = { ...DOC, documentId: 'sec-cover' };

    await lineage.recordSourceSpan(ORG_A, {
      ...doc,
      charStart: 0,
      charEnd: 10,
      spanText: '0123456789',
      sourceId,
      usage: 'quoted',
    });
    await lineage.recordAuthorSpan(ORG_A, {
      ...doc,
      charStart: 20,
      charEnd: 30,
      spanText: 'authored!!',
      assertedBy: 'user-7',
    });

    // [10,20) and [30,40) are unattributed.
    expect(await lineage.findUncoveredRanges(ORG_A, doc, 40)).toEqual([
      { charStart: 10, charEnd: 20 },
      { charStart: 30, charEnd: 40 },
    ]);
  });

  it('treats overlapping spans as one covered run, not a gap', async () => {
    const a = await makeSource(ORG_A, 'sha-ov-a');
    const b = await makeSource(ORG_A, 'sha-ov-b');
    const doc = { ...DOC, documentId: 'sec-overlap' };

    // Two sources backing overlapping text is two lineage facts about one run
    // of characters — it must not read as a hole between them.
    await lineage.recordSourceSpan(ORG_A, {
      ...doc, charStart: 0, charEnd: 15, spanText: 'a'.repeat(15), sourceId: a, usage: 'quoted',
    });
    await lineage.recordSourceSpan(ORG_A, {
      ...doc, charStart: 10, charEnd: 25, spanText: 'b'.repeat(15), sourceId: b, usage: 'derived',
    });

    expect(await lineage.findUncoveredRanges(ORG_A, doc, 25)).toEqual([]);
  });

  it('reports the whole document when nothing is attributed', async () => {
    expect(
      await lineage.findUncoveredRanges(ORG_A, { ...DOC, documentId: 'sec-empty' }, 100),
    ).toEqual([{ charStart: 0, charEnd: 100 }]);
  });
});
