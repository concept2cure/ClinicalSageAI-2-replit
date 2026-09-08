/**
 * A document assembles in the order its sections belong in — against PGlite.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Every reader of a document — the section tree, the export assembler, the PDF
 * and DOCX branches — orders by `order_index`. POST /api/authoring/sections
 * defaulted that column to 0 and no client sends a value, so every section of
 * every document was created at index 0. `ORDER BY order_index` over a table of
 * ties returns whatever Postgres returns; creating 5.6 then 5.1 left 5.6 above
 * 5.1, permanently, and the assembled dossier inherited it (W1-2).
 *
 * The reorder endpoint that exists could repair a document after the fact, but
 * only if a human noticed and dragged. Nothing made a document come out right
 * on its own.
 *
 * ── What is exercised ────────────────────────────────────────────────────────
 * The router's real INSERT and shift statements, verbatim, against a real
 * Postgres. The comparator's own behaviour is covered by
 * shared/regulatory/__tests__/section-code.test.ts; what is proven here is that
 * the DATABASE ends up in the right state — including that the rows below an
 * insertion point actually move, which no unit test of a pure function can show.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sectionInsertIndex } from '../../../shared/regulatory/section-code';

let pg: PGlite;
const TENANT = 4242;
const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** The router's read of the current order, verbatim. */
const ORDER_SQL = `SELECT id, code FROM authoring_sections
   WHERE doc_id = $1 AND tenant_id = $2
   ORDER BY order_index, created_at
   FOR UPDATE`;

/** The router's shift statement, verbatim. */
const SHIFT_SQL = `UPDATE authoring_sections SET order_index = order_index + 1
   WHERE doc_id = $1 AND tenant_id = $2 AND order_index >= $3`;

/** What POST /sections does now: resolve a position, shift, insert. */
async function createSection(code: string, explicitIndex?: number) {
  let orderIndex = explicitIndex;
  if (orderIndex === undefined) {
    const existing = await pg.query<{ code: string }>(ORDER_SQL, [DOC, TENANT]);
    orderIndex = sectionInsertIndex(
      existing.rows.map((r) => String(r.code ?? '')),
      code,
    );
    await pg.query(SHIFT_SQL, [DOC, TENANT, orderIndex]);
  }
  await pg.query(
    `INSERT INTO authoring_sections
       (id, doc_id, code, title, content, order_index, created_at, updated_at, tenant_id)
     VALUES ($1, $2, $3, $4, '', $5, NOW(), NOW(), $6)`,
    [randomUUID(), DOC, code, `Section ${code}`, orderIndex, TENANT],
  );
}

/** What POST /sections used to do: default the index to 0. */
async function createSectionOldWay(code: string) {
  await pg.query(
    `INSERT INTO authoring_sections
       (id, doc_id, code, title, content, order_index, created_at, updated_at, tenant_id)
     VALUES ($1, $2, $3, $4, '', 0, NOW(), NOW(), $5)`,
    [randomUUID(), DOC, code, `Section ${code}`, TENANT],
  );
}

/** The order every reader of the document sees. */
async function assembledOrder(): Promise<string[]> {
  const r = await pg.query<{ code: string }>(
    `SELECT code FROM authoring_sections
      WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index`,
    [DOC, TENANT],
  );
  return r.rows.map((x) => String(x.code));
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE authoring_sections (
      id UUID PRIMARY KEY,
      doc_id UUID NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      order_index INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      tenant_id INTEGER NOT NULL
    );
  `);
});

afterAll(async () => { await pg.close(); });
beforeEach(async () => { await pg.exec('DELETE FROM authoring_sections;'); });

describe('this file exercises the router\u2019s own statements', () => {
  /* The router cannot be imported here — it pulls the whole app graph — so its
     two statements are reproduced above. A reproduction that drifts from the
     original proves nothing about the original, so it is checked against the
     source rather than trusted. */
  const ROUTER = readFileSync(
    path.resolve(__dirname, '../authoring.router.ts'),
    'utf8',
  );
  const normalise = (sql: string) => sql.replace(/\s+/g, ' ').trim();

  it('still contains the order read this file mirrors', () => {
    expect(normalise(ROUTER)).toContain(normalise(ORDER_SQL));
  });

  it('still contains the shift this file mirrors', () => {
    expect(normalise(ROUTER)).toContain(normalise(SHIFT_SQL));
  });

  it('still resolves the position with the shared comparator', () => {
    expect(ROUTER).toContain('sectionInsertIndex(codes, String(code))');
  });
});

describe('the defect, demonstrated against a real database', () => {
  it('leaves every section at index 0 the old way, so the order is not determined by anything', async () => {
    for (const code of ['5.6', '5.1', '5.3']) await createSectionOldWay(code);
    const idx = await pg.query<{ order_index: number }>(
      `SELECT order_index FROM authoring_sections WHERE doc_id = $1`, [DOC],
    );
    // Three sections, one index. ORDER BY order_index cannot separate them, so
    // the assembled order is whatever the heap happens to return.
    expect(idx.rows.map((r) => r.order_index)).toEqual([0, 0, 0]);
    expect(new Set(idx.rows.map((r) => r.order_index)).size).toBe(1);
  });
});

describe('sections assemble in code order regardless of creation order', () => {
  it('creating 5.6 then 5.1 assembles 5.1 first — the W1-2 acceptance criterion', async () => {
    await createSection('5.6');
    await createSection('5.1');
    expect(await assembledOrder()).toEqual(['5.1', '5.6']);
  });

  it('converges on full order however scrambled the creation sequence', async () => {
    for (const code of ['5.6', '5.1', '5.10', '5.3', '5.9']) await createSection(code);
    expect(await assembledOrder()).toEqual(['5.1', '5.3', '5.6', '5.9', '5.10']);
  });

  it('nests sub-sections under their parent', async () => {
    for (const code of ['5.7.2', '5.8', '5.7', '5.7.1']) await createSection(code);
    expect(await assembledOrder()).toEqual(['5.7', '5.7.1', '5.7.2', '5.8']);
  });

  it('puts drug substance before drug product, whichever was created first', async () => {
    for (const code of ['3.2.P', '3.2.A', '3.2.S']) await createSection(code);
    expect(await assembledOrder()).toEqual(['3.2.S', '3.2.P', '3.2.A']);
  });

  it('assigns contiguous indices, so no two sections tie', async () => {
    for (const code of ['5.6', '5.1', '5.3']) await createSection(code);
    const r = await pg.query<{ order_index: number }>(
      `SELECT order_index FROM authoring_sections WHERE doc_id = $1 ORDER BY order_index`, [DOC],
    );
    expect(r.rows.map((x) => x.order_index)).toEqual([0, 1, 2]);
  });

  it('actually moves the rows below an insertion point', async () => {
    await createSection('5.1');
    await createSection('5.9');
    // 5.3 lands between them; 5.9 must be pushed from 1 to 2, or the two tie
    // and the whole scheme silently degrades back to the defect.
    await createSection('5.3');
    const r = await pg.query<{ code: string; order_index: number }>(
      `SELECT code, order_index FROM authoring_sections WHERE doc_id = $1 ORDER BY order_index`,
      [DOC],
    );
    expect(r.rows.map((x) => [String(x.code), x.order_index])).toEqual([
      ['5.1', 0], ['5.3', 1], ['5.9', 2],
    ]);
  });
});

describe('an explicit position still wins', () => {
  it('honours a caller-supplied order_index instead of deriving one', async () => {
    // The governed reorder endpoint and any deliberate placement depend on this.
    await createSection('5.1');
    await createSection('5.9');
    await createSection('9.9', 0);
    const r = await pg.query<{ code: string; order_index: number }>(
      `SELECT code, order_index FROM authoring_sections WHERE doc_id = $1 AND code = '9.9'`, [DOC],
    );
    expect(r.rows[0].order_index).toBe(0);
  });

  it('does not re-sort a document someone deliberately reordered', async () => {
    // A human dragged 5.6 above 5.1. Adding 5.3 must not quietly undo that.
    await createSection('5.6', 0);
    await createSection('5.1', 1);
    await createSection('5.3');
    expect(await assembledOrder()).toEqual(['5.3', '5.6', '5.1']);
  });
});

describe('tenant isolation', () => {
  it('reads only this tenant’s sections when resolving a position', async () => {
    await pg.query(
      `INSERT INTO authoring_sections
         (id, doc_id, code, title, content, order_index, created_at, updated_at, tenant_id)
       VALUES ($1, $2, '1.1', 'Foreign', '', 0, NOW(), NOW(), 9999)`,
      [randomUUID(), DOC],
    );
    await createSection('5.1');
    // Another tenant's 1.1 must not push this section to index 1.
    const r = await pg.query<{ order_index: number }>(
      `SELECT order_index FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2`,
      [DOC, TENANT],
    );
    expect(r.rows[0].order_index).toBe(0);
    // And the foreign row must not have been shifted by our UPDATE.
    const foreign = await pg.query<{ order_index: number }>(
      `SELECT order_index FROM authoring_sections WHERE tenant_id = 9999`,
    );
    expect(foreign.rows[0].order_index).toBe(0);
  });
});
