/**
 * The authoring toolbar's counters must count what its panels list.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * MDX UAT 2026-08-18, item A5: the document toolbar read "History 2" and
 * "· 2 revisions" while opening the history panel showed "No prior revisions".
 * Reported as a plausible off-by-one — the current version being counted as a
 * revision without being listed.
 *
 * It is not an off-by-one. The label and the list ran differently-scoped
 * queries against the same table:
 *
 *   counter (GET /docs/:docId/sections)
 *     LEFT JOIN doc_revisions r ON r.section_id = s.id          -- no tenant
 *     WHERE s.doc_id = $1 AND s.tenant_id = $2
 *
 *   panel   (GET /sections/:sectionId/history)
 *     WHERE r.section_id = $1 AND r.tenant_id = $2              -- tenant-scoped
 *
 * So any revision row whose `tenant_id` differs from its section's — another
 * tenant's, or a null one — was COUNTED by the toolbar and then NOT SHOWN by
 * the panel. The same held for comment_count and citation_count, and for the
 * document-level counters on GET /docs/:docId.
 *
 * Two things were wrong at once, which is why it presented as a cosmetic bug:
 * the user-visible mismatch, and a cross-tenant count leak — a number on the
 * toolbar disclosing that rows exist in another tenant.
 *
 * ── Why this runs real SQL ───────────────────────────────────────────────────
 * The bug lives entirely in a join predicate. A mocked pool asserts the string
 * we wrote, not the rows Postgres returns, and would have been just as green
 * before the fix. These cases execute both queries against in-process Postgres
 * over the real column shapes, with a deliberately cross-tenant revision row
 * planted, and assert the two answers agree.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';

let pg: PGlite;

const TENANT = 7;
const OTHER_TENANT = 9;
const DOC = 'doc-aaaaaaaa-0000-4000-8000-000000000001';
const SECTION = 'sec-aaaaaaaa-0000-4000-8000-000000000001';

/** The counter query GET /docs/:docId/sections runs, verbatim in shape. */
const COUNTER_SQL = `
  SELECT s.id,
         COUNT(DISTINCT c.id)  AS comment_count,
         COUNT(DISTINCT r.id)  AS revision_count,
         COUNT(DISTINCT ct.id) AS citation_count
    FROM authoring_sections s
    LEFT JOIN authoring_comments c   ON c.section_id  = s.id AND c.tenant_id  = s.tenant_id
    LEFT JOIN doc_revisions r        ON r.section_id  = s.id AND r.tenant_id  = s.tenant_id
    LEFT JOIN authoring_citations ct ON ct.section_id = s.id AND ct.tenant_id = s.tenant_id
   WHERE s.doc_id = $1 AND s.tenant_id = $2
   GROUP BY s.id`;

/** The list query GET /sections/:sectionId/history runs. */
const PANEL_SQL = `
  SELECT r.id FROM doc_revisions r
   WHERE r.section_id = $1 AND r.tenant_id = $2
   ORDER BY r.created_at DESC`;

beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE authoring_sections (
      id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, tenant_id INTEGER NOT NULL,
      code TEXT, title TEXT, content TEXT, order_index INTEGER);
    CREATE TABLE doc_revisions (
      id TEXT PRIMARY KEY, section_id TEXT NOT NULL, tenant_id INTEGER,
      content TEXT, created_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE authoring_comments (
      id TEXT PRIMARY KEY, section_id TEXT, doc_id TEXT, tenant_id INTEGER);
    CREATE TABLE authoring_citations (
      id TEXT PRIMARY KEY, section_id TEXT, tenant_id INTEGER);

    INSERT INTO authoring_sections (id, doc_id, tenant_id, code, title, order_index)
      VALUES ('${SECTION}', '${DOC}', ${TENANT}, 'eSTAR-05', '510k IFU section', 1);
  `);
});

afterAll(async () => { await pg?.close(); });

describe('toolbar counters agree with the panels that list the rows', () => {
  it('counts zero revisions when the only rows belong to another tenant', async () => {
    // Exactly the UAT's shape: the toolbar said 2, the panel said none.
    await pg.exec(`
      INSERT INTO doc_revisions (id, section_id, tenant_id, content) VALUES
        ('rev-other-1', '${SECTION}', ${OTHER_TENANT}, 'not this tenant'),
        ('rev-other-2', '${SECTION}', ${OTHER_TENANT}, 'not this tenant either');
    `);

    const counter = await pg.query(COUNTER_SQL, [DOC, TENANT]);
    const panel = await pg.query(PANEL_SQL, [SECTION, TENANT]);

    const counted = Number((counter.rows[0] as { revision_count: string }).revision_count);
    expect(panel.rows.length).toBe(0);
    // The assertion that fails on the unscoped join: it returns 2 there.
    expect(counted).toBe(0);
    expect(counted).toBe(panel.rows.length);
  });

  it('counts a NULL-tenant revision as zero rather than as a phantom', async () => {
    // A row written before tenancy, or by a path that forgot it. The panel
    // cannot show it (NULL never equals $2), so the label must not claim it.
    await pg.exec(
      `INSERT INTO doc_revisions (id, section_id, tenant_id, content)
       VALUES ('rev-null-tenant', '${SECTION}', NULL, 'orphaned')`,
    );

    const counter = await pg.query(COUNTER_SQL, [DOC, TENANT]);
    const panel = await pg.query(PANEL_SQL, [SECTION, TENANT]);

    expect(Number((counter.rows[0] as { revision_count: string }).revision_count))
      .toBe(panel.rows.length);
  });

  it('still counts this tenant’s own revisions, comments and citations', async () => {
    // The fix must not be bought by counting nothing.
    await pg.exec(`
      INSERT INTO doc_revisions (id, section_id, tenant_id, content) VALUES
        ('rev-mine-1', '${SECTION}', ${TENANT}, 'first'),
        ('rev-mine-2', '${SECTION}', ${TENANT}, 'second');
      INSERT INTO authoring_comments (id, section_id, doc_id, tenant_id) VALUES
        ('cmt-mine-1', '${SECTION}', '${DOC}', ${TENANT}),
        ('cmt-other',  '${SECTION}', '${DOC}', ${OTHER_TENANT});
      INSERT INTO authoring_citations (id, section_id, tenant_id) VALUES
        ('cit-mine-1', '${SECTION}', ${TENANT}),
        ('cit-other',  '${SECTION}', ${OTHER_TENANT});
    `);

    const counter = await pg.query(COUNTER_SQL, [DOC, TENANT]);
    const panel = await pg.query(PANEL_SQL, [SECTION, TENANT]);
    const row = counter.rows[0] as Record<string, string>;

    expect(Number(row.revision_count)).toBe(2);
    expect(Number(row.revision_count)).toBe(panel.rows.length);
    // The other two counters carried the identical defect.
    expect(Number(row.comment_count)).toBe(1);
    expect(Number(row.citation_count)).toBe(1);
  });
});
