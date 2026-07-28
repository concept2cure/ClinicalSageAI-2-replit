/**
 * Schema contract: literature_entries (G-02 canonicalization).
 *
 * server/services/regulatory-programs.service.ts reads literature_entries for the
 * CER literature-density chart and the portfolio corpus insight, and
 * scripts/seed-mdx-content.mjs writes it — but the only CREATE TABLE lived in the
 * ARCHIVED db/migrations/_consolidated/ (excluded from the scanners, on no apply
 * path), so on a fresh database the reads fall into their `42P01 → zero buckets`
 * tolerance and the chart silently shows nothing.
 * db/migrations/20260728_literature_entries.sql is the canonical durable definition.
 *
 * This suite applies that migration to real Postgres (PGlite), seeds with the EXACT
 * column list seed-mdx-content.mjs INSERTs, then runs the EXACT queries
 * regulatory-programs.service.ts issues — the year-bucket chart query and the
 * portfolio count — proving the reconstruction matches the code AND that the
 * explicit `organization_id` filter isolates organizations (org A's chart never
 * counts org B's rows).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = 'db/migrations/20260728_literature_entries.sql';
let db: PGlite;
const q = (sql: string, params?: unknown[]) => db.query(sql, params as unknown[]);

// scripts/seed-mdx-content.mjs seedLiterature() — the exact live INSERT shape.
const seed = (r: {
  source_name: string;
  source_id: string;
  title: string;
  abstract: string;
  publication_date: string;
  journal: string;
  organization_id: string;
}) =>
  q(
    `INSERT INTO literature_entries (
       id, source_name, source_id, title, abstract, publication_date, journal,
       organization_id, created_at, updated_at
     ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::date, $6, $7::text, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [r.source_name, r.source_id, r.title, r.abstract, r.publication_date, r.journal, r.organization_id],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.resolve(MIGRATION), 'utf8'));

  // Org A corpus: three "Acme" hits in the window (two by title, one by abstract),
  // one non-matching product, one "Acme" hit BEFORE the window.
  await seed({ source_name: 'pubmed', source_id: 'A1', title: 'Acme Widget pivotal trial', abstract: 'efficacy', publication_date: '2022-03-01', journal: 'J Dev', organization_id: 'orgA' });
  await seed({ source_name: 'pubmed', source_id: 'A2', title: 'Acme Widget follow-up', abstract: 'safety', publication_date: '2023-06-01', journal: 'J Dev', organization_id: 'orgA' });
  await seed({ source_name: 'pubmed', source_id: 'A3', title: 'Unrelated device review', abstract: 'mentions the Acme Widget in passing', publication_date: '2022-09-01', journal: 'J Rev', organization_id: 'orgA' });
  await seed({ source_name: 'pubmed', source_id: 'A4', title: 'Beta Gadget study', abstract: 'other', publication_date: '2023-01-01', journal: 'J Dev', organization_id: 'orgA' });
  await seed({ source_name: 'pubmed', source_id: 'A5', title: 'Acme Widget legacy paper', abstract: 'old', publication_date: '2019-01-01', journal: 'J Old', organization_id: 'orgA' });

  // Org B corpus: two "Acme" hits in the same years as A — the isolation trap.
  await seed({ source_name: 'pubmed', source_id: 'B1', title: 'Acme Widget competitor analysis', abstract: 'x', publication_date: '2022-05-01', journal: 'J Comp', organization_id: 'orgB' });
  await seed({ source_name: 'pubmed', source_id: 'B2', title: 'Acme Widget market note', abstract: 'y', publication_date: '2023-07-01', journal: 'J Comp', organization_id: 'orgB' });
}, 60_000);

afterAll(async () => {
  await db?.close();
});

// regulatory-programs.service.ts getLiterature() — the year-bucket chart query.
const yearBuckets = (orgId: string, product: string, windowStart: string) =>
  q(
    `SELECT EXTRACT(YEAR FROM publication_date)::int AS year, COUNT(*)::int AS n
       FROM literature_entries
      WHERE organization_id::text = $1::text
        AND ( title ILIKE $2 OR abstract ILIKE $2 )
        AND publication_date >= $3
      GROUP BY 1
      ORDER BY 1`,
    [orgId, `%${product}%`, windowStart],
  );

// regulatory-programs.service.ts portfolio insight — the corpus count.
const corpusCount = (orgId: string) =>
  q(`SELECT COUNT(*)::int AS total FROM literature_entries WHERE organization_id::text = $1::text`, [orgId]);

describe('literature_entries (G-02) matches the code', () => {
  it('year-bucket chart query returns only the acting org, matched + in-window', async () => {
    const a = await yearBuckets('orgA', 'Acme Widget', '2021-01-01');
    const rows = a.rows as { year: number; n: number }[];
    // 2022 → A1 + A3 (title + abstract match); 2023 → A2. A4 fails product; A5 pre-window.
    expect(rows).toEqual([
      { year: 2022, n: 2 },
      { year: 2023, n: 1 },
    ]);
    // The counts EXCLUDE org B's 2022/2023 "Acme Widget" rows — proof of isolation.
    const byYear = new Map(rows.map((r) => [r.year, r.n]));
    expect(byYear.get(2022)).toBe(2); // not 3
    expect(byYear.get(2023)).toBe(1); // not 2
  });

  it('org B sees only its own two rows for the same product/window', async () => {
    const b = await yearBuckets('orgB', 'Acme Widget', '2021-01-01');
    expect(b.rows).toEqual([
      { year: 2022, n: 1 },
      { year: 2023, n: 1 },
    ]);
  });

  it('a non-tenant org sees nothing for the same product', async () => {
    const c = await yearBuckets('orgC', 'Acme Widget', '2021-01-01');
    expect(c.rows.length).toBe(0);
  });

  it('corpus count is isolated by organization_id', async () => {
    expect((((await corpusCount('orgA')).rows[0]) as { total: number }).total).toBe(5);
    expect((((await corpusCount('orgB')).rows[0]) as { total: number }).total).toBe(2);
    expect((((await corpusCount('orgC')).rows[0]) as { total: number }).total).toBe(0);
  });
});
