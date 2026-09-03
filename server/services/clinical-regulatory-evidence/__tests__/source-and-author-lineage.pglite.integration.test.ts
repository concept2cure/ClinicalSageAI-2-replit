/**
 * enforceSourceAndAuthorLineage — the automated source+author gate, END-TO-END
 * against in-process PGlite with the real migrations.
 *
 * This is the honesty-critical proof of source-attribution Phase 3: accepting a
 * draft records the verifiably-quoted clauses as `cre_evidence_source` spans and
 * EVERY OTHER clause as an author assertion, the union covers the content so the
 * save gate passes, and — the property re-verification exists to give — a quote
 * the author edited away is RETIRED rather than left citing characters that are
 * gone. Proven against the same schema a deployed database runs, and read back
 * through the very reads the Data Origins panel uses.
 *
 * One PGlite instance for the file.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const exec = {
  query: async <R = any>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number }> => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as R[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => exec.query(s, p) } }));

import { enforceSourceAndAuthorLineage, enforceAuthorLineage } from '../lineage-gate';
import * as lineage from '../span-lineage.service';

const ORG_A = 711;
const ORG_B = 822;
const ACTOR = '4242';

// One clause verbatim in the source (→ verified quote), one that is not (→ author).
const QUOTED = 'The primary endpoint was met at week twelve in the intent-to-treat population.';
const ORIGINAL = 'These findings were consistent across every prespecified subgroup we examined.';
const CONTENT = `${QUOTED} ${ORIGINAL}`;
const SOURCE_TEXT = `Clinical study report. ${QUOTED} Additional narrative detail follows here.`;

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

async function makeSource(orgId: number | null, checksum: string, title = 'csr.pdf'): Promise<number> {
  const { rows } = await exec.query(
    `INSERT INTO cre_evidence_sources
       (organization_id, visibility_class, source_type, title, checksum,
        ingestion_status, extraction_status)
     VALUES ($1, $2, 'client_document', $3, $4, 'ingested', 'extracted')
     RETURNING id`,
    [orgId, orgId === null ? 'global_public' : 'tenant_private', title, checksum],
  );
  return (rows[0] as { id: number }).id;
}

async function spansOf(documentId: string) {
  return lineage.listDocumentSpans(ORG_A, { documentTable: 'authoring_sections', documentId });
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

describe('enforceSourceAndAuthorLineage', () => {
  it('records the quoted clause as a source span and the rest as author spans; the gate passes', async () => {
    const sourceId = await makeSource(ORG_A, 'sha-p3-1');
    const documentId = 'sec-p3-1';
    const ref = { documentTable: 'authoring_sections', documentId };

    const result = await enforceSourceAndAuthorLineage(
      exec,
      ORG_A,
      ref,
      CONTENT,
      ACTOR,
      [{ sourceId, content: SOURCE_TEXT }],
    );

    expect(result.sourceSpans).toBe(1);
    expect(result.authorSpans).toBeGreaterThanOrEqual(1);
    expect(result.distinctSources).toBe(1);
    expect(result.coverage).toBeGreaterThan(0);
    expect(result.coverage).toBeLessThan(100); // author-original text is not "quoted"

    const spans = await spansOf(documentId);
    const source = spans.filter((s) => s.provenanceKind === 'cre_evidence_source');
    const author = spans.filter((s) => s.provenanceKind === 'author_assertion');
    expect(source).toHaveLength(1);
    expect(source[0].referenceId).toBe(String(sourceId));
    expect(source[0].usage).toBe('quoted');
    expect(source[0].state).toBe('current'); // checksum captured at record time
    expect(author.length).toBeGreaterThanOrEqual(1);

    // The Data Origins click-through over the quoted range resolves to the source.
    const origins = await lineage.getSelectionOrigins(ORG_A, ref, 0, QUOTED.length, QUOTED);
    expect(origins.origins.some((o) => o.referenceId === String(sourceId))).toBe(true);
  });

  it('is author-only (no source span) when nothing is verifiably quoted — honest silence', async () => {
    const sourceId = await makeSource(ORG_A, 'sha-p3-2');
    const documentId = 'sec-p3-2';
    const ref = { documentTable: 'authoring_sections', documentId };

    const result = await enforceSourceAndAuthorLineage(
      exec,
      ORG_A,
      ref,
      CONTENT,
      ACTOR,
      [{ sourceId, content: 'A wholly unrelated source about manufacturing controls.' }],
    );

    expect(result.sourceSpans).toBe(0);
    expect(result.coverage).toBe(0);
    const spans = await spansOf(documentId);
    expect(spans.filter((s) => s.provenanceKind === 'cre_evidence_source')).toHaveLength(0);
    expect(spans.filter((s) => s.provenanceKind === 'author_assertion').length).toBeGreaterThanOrEqual(1);
  });

  it('RETIRES a quote the edited text no longer contains (a citation can never go stale)', async () => {
    const sourceId = await makeSource(ORG_A, 'sha-p3-3');
    const documentId = 'sec-p3-3';
    const ref = { documentTable: 'authoring_sections', documentId };
    const sources = [{ sourceId, content: SOURCE_TEXT }];

    // Accept 1: the quote is present → one source span.
    await enforceSourceAndAuthorLineage(exec, ORG_A, ref, CONTENT, ACTOR, sources);
    let spans = await spansOf(documentId);
    expect(spans.filter((s) => s.provenanceKind === 'cre_evidence_source')).toHaveLength(1);

    // Accept 2: the author edited the quote away; nothing now matches the source.
    const EDITED = 'Efficacy was summarized qualitatively by the study team. ' + ORIGINAL;
    const result = await enforceSourceAndAuthorLineage(exec, ORG_A, ref, EDITED, ACTOR, sources);

    expect(result.sourceSpans).toBe(0);
    spans = await spansOf(documentId);
    // The stale source span is gone from the reads (soft-deleted), not lingering.
    expect(spans.filter((s) => s.provenanceKind === 'cre_evidence_source')).toHaveLength(0);
    expect(spans.filter((s) => s.provenanceKind === 'author_assertion').length).toBeGreaterThanOrEqual(1);
  });

  it('empty content retires prior spans and records nothing new', async () => {
    const sourceId = await makeSource(ORG_A, 'sha-p3-4');
    const documentId = 'sec-p3-4';
    const ref = { documentTable: 'authoring_sections', documentId };

    await enforceSourceAndAuthorLineage(exec, ORG_A, ref, CONTENT, ACTOR, [{ sourceId, content: SOURCE_TEXT }]);
    expect((await spansOf(documentId)).length).toBeGreaterThan(0);

    const result = await enforceSourceAndAuthorLineage(exec, ORG_A, ref, '', ACTOR, []);
    expect(result.sourceSpans).toBe(0);
    expect(result.authorSpans).toBe(0);
    expect(await spansOf(documentId)).toHaveLength(0);
  });

  it('throws rather than cite a source the tenant cannot see', async () => {
    const foreign = await makeSource(ORG_B, 'sha-p3-foreign');
    const documentId = 'sec-p3-foreign';
    const ref = { documentTable: 'authoring_sections', documentId };

    await expect(
      enforceSourceAndAuthorLineage(exec, ORG_A, ref, CONTENT, ACTOR, [{ sourceId: foreign, content: SOURCE_TEXT }]),
    ).rejects.toThrow();
  });
});

describe('a later author-only save (ledger L157)', () => {
  it('keeps a verified quote that is still exactly in place, and covers the rest as the author', async () => {
    const sourceId = await makeSource(ORG_A, 'sha-l157-1');
    const ref = { documentTable: 'authoring_sections', documentId: 'sec-l157-1' };
    await enforceSourceAndAuthorLineage(exec, ORG_A, ref, CONTENT, ACTOR, [{ sourceId, content: SOURCE_TEXT }]);

    // A human appends a clause AFTER the quote: its offsets are untouched.
    const edited = `${CONTENT} A closing remark the editor added.`;
    await enforceAuthorLineage(exec, ORG_A, ref, edited, ACTOR);

    const spans = await spansOf(ref.documentId);
    const source = spans.filter((s) => s.provenanceKind === 'cre_evidence_source');
    expect(source).toHaveLength(1);
    expect(source[0].referenceId).toBe(String(sourceId));
    // Coverage over the new text holds with the surviving quote plus author spans.
    await expect(lineage.assertLineageCoversContent(ORG_A, ref, edited, exec)).resolves.toBeUndefined();
  });

  it('retires a verified quote whose text moved, rather than leaving it to answer for the wrong words', async () => {
    const sourceId = await makeSource(ORG_A, 'sha-l157-2');
    const ref = { documentTable: 'authoring_sections', documentId: 'sec-l157-2' };
    await enforceSourceAndAuthorLineage(exec, ORG_A, ref, CONTENT, ACTOR, [{ sourceId, content: SOURCE_TEXT }]);
    const before = (await spansOf(ref.documentId)).filter((s) => s.provenanceKind === 'cre_evidence_source');
    expect(before).toHaveLength(1);

    // A human prepends a sentence: the quoted text is still present but its
    // offsets no longer point at it — and nothing here can re-verify it.
    const edited = `${ORIGINAL} ${QUOTED}`;
    await enforceAuthorLineage(exec, ORG_A, ref, edited, ACTOR);

    const spans = await spansOf(ref.documentId);
    expect(spans.filter((s) => s.provenanceKind === 'cre_evidence_source')).toHaveLength(0);
    expect(spans.filter((s) => s.provenanceKind === 'author_assertion').length).toBeGreaterThanOrEqual(2);
    await expect(lineage.assertLineageCoversContent(ORG_A, ref, edited, exec)).resolves.toBeUndefined();
  });
});
