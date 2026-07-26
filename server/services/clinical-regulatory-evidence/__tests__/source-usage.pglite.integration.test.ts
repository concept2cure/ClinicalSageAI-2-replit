/**
 * Source usage — END-TO-END against in-process PGlite.
 *
 * "What was this section written from?" had no answer anywhere in the platform:
 * canonical sources existed, authored sections existed, and nothing joined them.
 *
 * These tests apply the REAL migration DDL — CRE spine, program scope, the
 * authoring document-loop tables and the source-usage index — and prove against
 * real Postgres that:
 *   - a citation records the source's checksum AT CITE TIME, which is what makes
 *     later change detection a recorded fact rather than a per-render guess;
 *   - both ends are tenant-checked before anything is written, so a caller cannot
 *     attach a citation to another tenant's section or cite another tenant's source;
 *   - when a source's content moves, the citation keeps the OLD checksum and is
 *     reported as `changed` — the point is to notice, not to quietly re-sync;
 *   - a citation whose source no longer resolves is still LISTED, with a null
 *     source, because turning "cites something unavailable" into "cites nothing"
 *     is the more dangerous of the two;
 *   - free-text `reference_id` values left by the data-token flow cannot raise
 *     22P02 and take these queries down.
 *
 * One PGlite instance for the file: several instances per file is what made the
 * pglite suites flake under combined load.
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

import * as spine from '../evidence-spine.service';
import * as usage from '../source-usage.service';

const ORG_A = 511;
const ORG_B = 622;
const PROGRAM_A = '33333333-3333-4333-8333-333333333333';
const PROGRAM_B = '44444444-4444-4444-8444-444444444444';
const ACTOR = 'user-1';

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

/** A client document as the chat upload route records it. */
function clientDoc(checksum: string, over: Record<string, unknown> = {}) {
  return {
    sourceType: 'client_document' as const,
    visibilityClass: 'project_private' as const,
    clientProgramId: PROGRAM_A,
    title: 'protocol.pdf',
    checksum,
    ingestionStatus: 'ingested' as const,
    extractionStatus: 'extracted' as const,
    provenance: { origin: 'chat_upload', fileUploadId: 'file_' + checksum },
    metadata: { mimeType: 'application/pdf' },
    ...over,
  };
}

/** Create a document + section in the authoring store, returning the section id. */
async function makeSection(orgId: number, docTitle: string, code: string): Promise<{ docId: string; sectionId: string }> {
  const docId = crypto.randomUUID();
  const sectionId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id)
     VALUES ($1, $2, 'M3', 'draft', $3, $4)`,
    [docId, docTitle, ACTOR, orgId],
  );
  await pool.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id)
     VALUES ($1, $2, $3, $4, '', $5)`,
    [sectionId, docId, code, 'Section ' + code, orgId],
  );
  return { docId, sectionId };
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('migrations/20260726_cre_source_program_scope.sql'));
  await pglite.exec(migration('db/migrations/20260725_authoring_document_loop_tables.sql'));
  await pglite.exec(migration('migrations/20260726_authoring_citation_source_usage.sql'));
  // Four real migrations into a cold WASM Postgres exceeds the 10s default hook
  // timeout on a loaded runner.
}, 90_000);
afterAll(async () => {
  await pglite.close();
}, 30_000);

describe('the source-usage migration', () => {
  it('creates the back-reference index the Data Room reads by', async () => {
    // Existing indexes cover "citations of this section". The back-reference asks
    // the opposite question, and without this index it is a full scan per source
    // per render.
    const { rows } = await pool.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'authoring_citations' AND indexname = 'authoring_citations_reference_idx'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('is idempotent — applying it twice is a no-op', async () => {
    await pglite.exec(migration('migrations/20260726_authoring_citation_source_usage.sql'));
    const { rows } = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE indexname = 'authoring_citations_reference_idx'`,
    );
    expect(rows).toHaveLength(1);
  });
});

describe('recording what a section was drafted from', () => {
  it("captures the source's checksum at the moment it is cited", async () => {
    const src = await spine.createSource(ORG_A, clientDoc('sha-cite-1'));
    const { sectionId } = await makeSection(ORG_A, 'CTD 3.2.P', 'P.1');

    const result = await usage.citeSource(ORG_A, {
      sectionId,
      sourceId: src.id,
      citationText: 'Drug product composition per protocol §5',
      createdBy: ACTOR,
    });

    expect(result.created).toBe(true);
    expect(result.citedChecksum).toBe('sha-cite-1');

    const listed = await usage.listSectionSources(ORG_A, sectionId);
    expect(listed).toHaveLength(1);
    expect(listed[0].state).toBe('current');
    expect(listed[0].source?.id).toBe(src.id);
    expect(listed[0].source?.title).toBe('protocol.pdf');
    expect(listed[0].source?.fileUploadId).toBe('file_sha-cite-1');
    expect(listed[0].citationText).toBe('Drug product composition per protocol §5');
  });

  it('citing the same source twice re-resolves rather than duplicating', async () => {
    const src = await spine.createSource(ORG_A, clientDoc('sha-dup'));
    const { sectionId } = await makeSection(ORG_A, 'CTD 3.2.S', 'S.1');

    const first = await usage.citeSource(ORG_A, { sectionId, sourceId: src.id, createdBy: ACTOR });
    const second = await usage.citeSource(ORG_A, { sectionId, sourceId: src.id, createdBy: ACTOR });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.citationId).toBe(first.citationId);
    // A section's source list is a set of sources, not a log of clicks.
    expect(await usage.listSectionSources(ORG_A, sectionId)).toHaveLength(1);
  });

  it("refuses to cite onto another tenant's section", async () => {
    const src = await spine.createSource(ORG_A, clientDoc('sha-xsection'));
    const { sectionId } = await makeSection(ORG_B, 'Their document', 'X.1');

    // The pre-existing POST /cite shape would have written this row, stamped with
    // the caller's own tenant_id, keyed on a section they do not own.
    await expect(
      usage.citeSource(ORG_A, { sectionId, sourceId: src.id, createdBy: ACTOR }),
    ).rejects.toThrow(/section not found/i);

    const { rows } = await pool.query(`SELECT 1 FROM authoring_citations WHERE section_id = $1`, [sectionId]);
    expect(rows).toHaveLength(0);
  });

  it("refuses to cite another tenant's source", async () => {
    const theirs = await spine.createSource(ORG_B, clientDoc('sha-xsource'));
    const { sectionId } = await makeSection(ORG_A, 'Our document', 'A.1');

    await expect(
      usage.citeSource(ORG_A, { sectionId, sourceId: theirs.id, createdBy: ACTOR }),
    ).rejects.toThrow(/source not found/i);
  });

  it('keeps the cited checksum and reports the citation as changed once the source moves', async () => {
    const src = await spine.createSource(ORG_A, clientDoc('sha-v1'));
    const { sectionId } = await makeSection(ORG_A, 'Changing doc', 'C.1');
    await usage.citeSource(ORG_A, { sectionId, sourceId: src.id, createdBy: ACTOR });

    // The document is replaced: same identity, new content.
    await pool.query(`UPDATE cre_evidence_sources SET checksum = 'sha-v2', updated_at = NOW() WHERE id = $1`, [
      src.id,
    ]);

    const listed = await usage.listSectionSources(ORG_A, sectionId);
    expect(listed[0].state).toBe('changed');
    // The recorded checksum is NOT quietly advanced — it is the evidence that this
    // section was written against the earlier content.
    expect(listed[0].citedChecksum).toBe('sha-v1');
    expect(listed[0].source?.checksum).toBe('sha-v2');
  });

  it('rejects a non-numeric source id instead of letting Postgres cast it', async () => {
    const { sectionId } = await makeSection(ORG_A, 'Guard', 'G.1');
    await expect(
      usage.citeSource(ORG_A, { sectionId, sourceId: 'not-an-id', createdBy: ACTOR }),
    ).rejects.toThrow(/positive integer/i);
  });
});

describe('citations that no longer resolve', () => {
  it('lists a deleted source as unresolved instead of dropping the row', async () => {
    const src = await spine.createSource(ORG_A, clientDoc('sha-deleted'));
    const { sectionId } = await makeSection(ORG_A, 'Orphaned cite', 'D.1');
    await usage.citeSource(ORG_A, { sectionId, sourceId: src.id, createdBy: ACTOR });

    await pool.query(`UPDATE cre_evidence_sources SET deleted_at = NOW() WHERE id = $1`, [src.id]);

    const listed = await usage.listSectionSources(ORG_A, sectionId);
    expect(listed).toHaveLength(1);
    expect(listed[0].state).toBe('unresolved');
    expect(listed[0].source).toBeNull();
  });

  it('reports a citation with no recorded checksum as unverified, never current', async () => {
    const src = await spine.createSource(ORG_A, clientDoc('sha-unverified'));
    const { sectionId } = await makeSection(ORG_A, 'Pre-convention', 'V.1');
    // A citation written before the convention existed: no payload_sha256.
    await pool.query(
      `INSERT INTO authoring_citations (id, section_id, source, reference_id, created_by, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), sectionId, usage.CRE_SOURCE_CITATION, String(src.id), ACTOR, ORG_A],
    );

    const listed = await usage.listSectionSources(ORG_A, sectionId);
    expect(listed[0].state).toBe('unverified');
  });

  it('survives free-text reference_ids left by the data-token flow', async () => {
    const { sectionId } = await makeSection(ORG_A, 'Mixed citations', 'F.1');
    // The pre-existing /cite endpoint takes `source` as free text and
    // `reference_id` as an untyped string. If any query cast reference_id to int,
    // this row alone would raise 22P02 and take the whole read down.
    await pool.query(
      `INSERT INTO authoring_citations (id, section_id, source, reference_id, citation_text, created_by, tenant_id)
       VALUES ($1, $2, 'lims_result', 'BATCH-2024-A/17', 'Assay result', $3, $4)`,
      [crypto.randomUUID(), sectionId, ACTOR, ORG_A],
    );
    const src = await spine.createSource(ORG_A, clientDoc('sha-mixedref'));
    await usage.citeSource(ORG_A, { sectionId, sourceId: src.id, createdBy: ACTOR });

    // Only the canonical-source citation is returned; the data token is untouched.
    const listed = await usage.listSectionSources(ORG_A, sectionId);
    expect(listed).toHaveLength(1);
    expect(listed[0].source?.id).toBe(src.id);
  });
});

describe('removing a citation', () => {
  it('removes an unfrozen citation and leaves frozen ones alone', async () => {
    const src = await spine.createSource(ORG_A, clientDoc('sha-remove'));
    const open = await makeSection(ORG_A, 'Removable', 'X.1');
    const frozen = await makeSection(ORG_A, 'Locked', 'X.2');
    await usage.citeSource(ORG_A, { sectionId: open.sectionId, sourceId: src.id, createdBy: ACTOR });
    const f = await usage.citeSource(ORG_A, { sectionId: frozen.sectionId, sourceId: src.id, createdBy: ACTOR });
    await pool.query(`UPDATE authoring_citations SET frozen_at = NOW() WHERE id = $1`, [f.citationId]);

    expect(await usage.removeSourceCitation(ORG_A, open.sectionId, src.id)).toBe(true);
    expect(await usage.listSectionSources(ORG_A, open.sectionId)).toHaveLength(0);

    expect(await usage.removeSourceCitation(ORG_A, frozen.sectionId, src.id)).toBe(false);
    expect(await usage.listSectionSources(ORG_A, frozen.sectionId)).toHaveLength(1);
  });

  it("cannot remove another tenant's citation", async () => {
    const src = await spine.createSource(ORG_A, clientDoc('sha-xremove'));
    const { sectionId } = await makeSection(ORG_A, 'Mine', 'X.3');
    await usage.citeSource(ORG_A, { sectionId, sourceId: src.id, createdBy: ACTOR });
    expect(await usage.removeSourceCitation(ORG_B, sectionId, src.id)).toBe(false);
    expect(await usage.listSectionSources(ORG_A, sectionId)).toHaveLength(1);
  });
});
