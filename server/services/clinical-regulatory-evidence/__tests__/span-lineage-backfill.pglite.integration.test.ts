/**
 * Span lineage backfill — END-TO-END against in-process PGlite.
 *
 * The property under test is a refusal, not a capability. The backfill must
 * attribute a section only when doc_revisions proves who wrote the text
 * currently in it, and must leave everything else alone.
 *
 * That matters more than the happy path. A backfill that attributes what it
 * cannot prove writes a Part 11 attestation nobody made — it names an author
 * against text they may never have seen, and it does so across the entire
 * historical corpus at once, silently, in a single run. The cases below pin the
 * boundary: exact content match attributes, anything less does not.
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

import { backfillSectionLineage } from '../span-lineage-backfill';
import * as lineage from '../span-lineage.service';

const ORG = 901;
const OTHER_ORG = 902;

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

async function makeSection(orgId: number, content: string): Promise<string> {
  const docId = uuid();
  const secId = uuid();
  await pool.query(
    `INSERT INTO authoring_documents (id, title, status, created_by, tenant_id)
     VALUES ($1, 'doc', 'draft', 'seed', $2)`,
    [docId, orgId],
  );
  await pool.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id)
     VALUES ($1, $2, '2.7.3', 'Section', $3, $4)`,
    [secId, docId, content, orgId],
  );
  return secId;
}

async function addRevision(
  sectionId: string,
  orgId: number,
  content: string,
  author: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO doc_revisions (id, section_id, content, created_by, tenant_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [uuid(), sectionId, content, author, orgId],
  );
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(
    `INSERT INTO organizations (id, name) VALUES (${ORG},'a'), (${OTHER_ORG},'b');`,
  );
  await pglite.exec(migration('db/migrations/20260725_authoring_document_loop_tables.sql'));
  // listDocumentSpans LEFT JOINs the canonical source registry to report
  // staleness, so the reads need it even though the backfill writes only
  // author assertions.
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

const TEXT = 'The primary endpoint was met, which we consider clinically meaningful.';

describe('backfill — attributes only what a revision proves', () => {
  it('attributes a section whose content exactly matches a revision', async () => {
    const sec = await makeSection(ORG, TEXT);
    await addRevision(sec, ORG, TEXT, 'user-alice');

    const r = await backfillSectionLineage(ORG, { apply: true, limit: 100 });
    expect(r.attributed).toBeGreaterThanOrEqual(1);

    const spans = await lineage.listDocumentSpans(ORG, {
      documentTable: 'authoring_sections',
      documentId: sec,
    });
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every((s) => s.provenanceKind === 'author_assertion')).toBe(true);
    expect(spans.every((s) => s.assertedBy === 'user-alice')).toBe(true);
  });

  it('leaves a section alone when no revision matches its current text', async () => {
    // The section was edited after its last recorded revision, so nobody can be
    // shown to have written what is there now.
    const sec = await makeSection(ORG, 'Text with no matching revision at all.');
    await addRevision(sec, ORG, 'An older, different body of text.', 'user-bob');

    const r = await backfillSectionLineage(ORG, { apply: true, limit: 100 });
    expect(r.unattributableIds).toContain(sec);

    const spans = await lineage.listDocumentSpans(ORG, {
      documentTable: 'authoring_sections',
      documentId: sec,
    });
    // No lineage is the honest answer — Data Origins will say so.
    expect(spans).toEqual([]);
  });

  it('leaves a section alone when the matching revision has no author', async () => {
    const sec = await makeSection(ORG, 'Authorless revision text.');
    await addRevision(sec, ORG, 'Authorless revision text.', null);

    const r = await backfillSectionLineage(ORG, { apply: true, limit: 100 });
    expect(r.unattributableIds).toContain(sec);
    expect(
      await lineage.listDocumentSpans(ORG, {
        documentTable: 'authoring_sections',
        documentId: sec,
      }),
    ).toEqual([]);
  });

  it('does not treat a near-match as proof', async () => {
    // One character apart. "Close enough" is how a backfill starts naming
    // people against text they did not write.
    const sec = await makeSection(ORG, 'The dose was 10 mg.');
    await addRevision(sec, ORG, 'The dose was 20 mg.', 'user-carol');

    const r = await backfillSectionLineage(ORG, { apply: true, limit: 100 });
    expect(r.unattributableIds).toContain(sec);
  });
});

describe('backfill — safety properties', () => {
  it('dry run writes nothing but reports the same analysis', async () => {
    const sec = await makeSection(ORG, 'Dry run body text here.');
    await addRevision(sec, ORG, 'Dry run body text here.', 'user-dave');

    const dry = await backfillSectionLineage(ORG, { apply: false, limit: 100 });
    expect(dry.applied).toBe(false);
    expect(dry.attributed).toBeGreaterThanOrEqual(1);
    expect(
      await lineage.listDocumentSpans(ORG, {
        documentTable: 'authoring_sections',
        documentId: sec,
      }),
    ).toEqual([]);
  });

  it('is idempotent — a rerun skips sections already covered', async () => {
    const sec = await makeSection(ORG, 'Idempotence check body.');
    await addRevision(sec, ORG, 'Idempotence check body.', 'user-erin');

    await backfillSectionLineage(ORG, { apply: true, limit: 100 });
    const before = await lineage.listDocumentSpans(ORG, {
      documentTable: 'authoring_sections',
      documentId: sec,
    });

    const second = await backfillSectionLineage(ORG, { apply: true, limit: 100 });
    const after = await lineage.listDocumentSpans(ORG, {
      documentTable: 'authoring_sections',
      documentId: sec,
    });

    expect(after).toHaveLength(before.length);
    // Already-covered sections are not even candidates on the rerun.
    expect(second.unattributableIds).not.toContain(sec);
  });

  it('never crosses tenants', async () => {
    const mine = await makeSection(ORG, 'Tenant scoped body text.');
    await addRevision(mine, ORG, 'Tenant scoped body text.', 'user-frank');

    const theirs = await makeSection(OTHER_ORG, 'Other tenant body text.');
    await addRevision(theirs, OTHER_ORG, 'Other tenant body text.', 'user-grace');

    await backfillSectionLineage(ORG, { apply: true, limit: 100 });

    // The other tenant's section is untouched by a run scoped to ORG.
    expect(
      await lineage.listDocumentSpans(OTHER_ORG, {
        documentTable: 'authoring_sections',
        documentId: theirs,
      }),
    ).toEqual([]);
  });

  it('records when the text was authored, not when the backfill ran', async () => {
    // Stamping "now" would date every historical assertion to the migration and
    // flatten the timeline the record exists to preserve.
    const sec = await makeSection(ORG, 'Historical body text.');
    await pool.query(
      `INSERT INTO doc_revisions (id, section_id, content, created_by, tenant_id, created_at)
       VALUES ($1, $2, $3, 'user-hana', $4, TIMESTAMPTZ '2024-03-04 10:00:00+00')`,
      [uuid(), sec, 'Historical body text.', ORG],
    );

    await backfillSectionLineage(ORG, { apply: true, limit: 100 });

    const spans = await lineage.listDocumentSpans(ORG, {
      documentTable: 'authoring_sections',
      documentId: sec,
    });
    expect(spans.length).toBeGreaterThan(0);
    expect(new Date(spans[0].assertedAt as unknown as string).getUTCFullYear()).toBe(2024);
  });
});
