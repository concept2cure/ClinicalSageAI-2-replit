/**
 * POST /api/authoring/sections places a new section where its code belongs, and
 * refuses a code the document already has as a conflict, not a lineage failure
 * (QA 2026-10-08, browser walk j4-authoring, docs/evidence/QA-2026-10-08/authoring/).
 *
 * Two defects the walk recorded, both in `createSection`:
 *
 *  1. A section created after the template sections was stored FIRST. The
 *     template seeds its sections at their template ordering (100, 200 … 700);
 *     the create path stored the new section at its LIST position (7), so 2.5.8
 *     sorted ahead of 2.5.1 in the tree, the whole-document view, the DOCX, the
 *     PDF and the filed leaf.
 *  2. A duplicate code answered 500 LINEAGE_REQUIRED ("its data lineage could
 *     not be recorded"). The real cause was the unique index on (doc_id, code,
 *     tenant_id); the catch-all reported every transaction error as lineage.
 *
 * This runs the real `createSection` against a real Postgres (PGlite) with the
 * production unique index. Only the evidence writers (revision ledger, audit
 * row) and the lineage gate are stubbed: none of them is what is under test,
 * and each has its own suite.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

vi.mock('../../clinical-regulatory-evidence/lineage-gate', () => ({
  enforceAuthorLineage: vi.fn(async () => {}),
}));
vi.mock('../authoring-evidence', async (importOriginal) => {
  const real = await importOriginal<typeof import('../authoring-evidence')>();
  return { ...real, createRevision: vi.fn(async () => 'rev'), writeAuthoringAuditTrail: vi.fn(async () => {}) };
});

import { createSection, type CreateContext } from '../authoring-documents';
import { isSectionCodeConflict } from '../section-placement';

const TENANT = 7;
const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let pg: PGlite;

/** A pg-shaped pool over PGlite: query, and a "client" for the transaction. */
function pool() {
  // node-postgres reports rowCount; PGlite reports rows (and affectedRows for a write).
  const query = async (sql: string, params?: unknown[]) => {
    const r = await pg.query(sql, params as any[]);
    return { ...r, rowCount: r.affectedRows || r.rows.length };
  };
  return { query, connect: async () => ({ query, release: () => {} }) };
}

function ctx(): CreateContext {
  return {
    pool: pool() as unknown as CreateContext['pool'],
    tenantId: TENANT,
    actor: { id: '4', email: 'author@test.co' },
    audit: { tenantId: TENANT, actorId: '4', actorEmail: 'author@test.co', actorRole: 'member', ipAddress: '127.0.0.1', userAgent: 'test' },
  } as unknown as CreateContext;
}

async function seedTemplate(codes: string[], spacing = 100) {
  for (const [i, code] of codes.entries()) {
    await pg.query(
      `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, '', $4, $5, NOW() - interval '1 hour')`,
      [DOC, code, `Template ${code}`, (i + 1) * spacing, TENANT],
    );
  }
}

/** The order every reader of the document uses (tree, export, filing copy). */
async function readOrder(): Promise<string[]> {
  const r = await pg.query<{ code: string }>(
    `SELECT code FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index, created_at, id`,
    [DOC, TENANT],
  );
  return r.rows.map((x) => x.code);
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE authoring_documents (id UUID PRIMARY KEY, tenant_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft');
    CREATE TABLE authoring_sections (
      id UUID PRIMARY KEY, doc_id UUID NOT NULL, code TEXT NOT NULL, title TEXT NOT NULL,
      content TEXT DEFAULT '', order_index INTEGER DEFAULT 0, track_changes BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), tenant_id INTEGER NOT NULL
    );
    -- The production index (db/migrations/20260730_authoring_comments_router_columns.sql).
    CREATE UNIQUE INDEX authoring_sections_doc_code_tenant_uq ON authoring_sections (doc_id, code, tenant_id);
  `);
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  await pg.exec(`DELETE FROM authoring_sections; DELETE FROM authoring_documents;`);
  await pg.query(`INSERT INTO authoring_documents (id, tenant_id, status) VALUES ($1, $2, 'draft')`, [DOC, TENANT]);
});

const TEMPLATE_25 = ['2.5.1', '2.5.2', '2.5.3', '2.5.4', '2.5.5', '2.5.6', '2.5.7'];

describe('a new section is stored where its code belongs among template-seeded sections', () => {
  it('2.5.8 created after a seeded 2.5 template assembles LAST, not first (the walk’s case)', async () => {
    await seedTemplate(TEMPLATE_25);
    const out = await createSection(ctx(), { doc_id: DOC, code: '2.5.8', title: 'Added section' });
    expect(out.kind).toBe('created');
    expect(await readOrder()).toEqual([...TEMPLATE_25, '2.5.8']);
  });

  it('a code that belongs in the middle lands in the middle, and nothing else changes order', async () => {
    await seedTemplate(['2.5.1', '2.5.2', '2.5.4', '2.5.5']);
    await createSection(ctx(), { doc_id: DOC, code: '2.5.3', title: 'Middle' });
    expect(await readOrder()).toEqual(['2.5.1', '2.5.2', '2.5.3', '2.5.4', '2.5.5']);
  });

  it('a code that belongs first lands first', async () => {
    await seedTemplate(['2.5.2', '2.5.3']);
    await createSection(ctx(), { doc_id: DOC, code: '2.5.1', title: 'First' });
    expect(await readOrder()).toEqual(['2.5.1', '2.5.2', '2.5.3']);
  });

  it('sections created into an empty document still converge on code order, at contiguous indexes', async () => {
    for (const code of ['5.6', '5.1', '5.3']) await createSection(ctx(), { doc_id: DOC, code, title: code });
    expect(await readOrder()).toEqual(['5.1', '5.3', '5.6']);
    const idx = await pg.query<{ order_index: number }>(
      `SELECT order_index FROM authoring_sections WHERE doc_id = $1 ORDER BY order_index`, [DOC],
    );
    expect(idx.rows.map((r) => r.order_index)).toEqual([0, 1, 2]);
  });

  it('an explicit order_index is still honoured', async () => {
    await seedTemplate(['2.5.1', '2.5.2']);
    await createSection(ctx(), { doc_id: DOC, code: '9.9', title: 'Pinned', order_index: 0 });
    expect((await readOrder())[0]).toBe('9.9');
  });
});

describe('a code the document already has is refused as a conflict', () => {
  it('answers 409 SECTION_CODE_EXISTS naming the code — not 500 lineage — and writes nothing', async () => {
    await seedTemplate(TEMPLATE_25);
    const before = await readOrder();
    const out = await createSection(ctx(), { doc_id: DOC, code: '2.5.1', title: 'Duplicate' });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') return;
    expect(out.status).toBe(409);
    expect(out.code).toBe('SECTION_CODE_EXISTS');
    expect(out.error).toContain('2.5.1');
    expect(out.error).not.toMatch(/lineage/i);
    expect(await readOrder()).toEqual(before);
    // The rows did not move: the refusal came before the shift.
    const idx = await pg.query<{ order_index: number }>(
      `SELECT order_index FROM authoring_sections WHERE doc_id = $1 ORDER BY order_index`, [DOC],
    );
    expect(idx.rows.map((r) => r.order_index)).toEqual([100, 200, 300, 400, 500, 600, 700]);
  });

  it('compares codes as the structure check does, so 3.2.s is the 3.2.S the document already has', async () => {
    await seedTemplate(['3.2.S']);
    const out = await createSection(ctx(), { doc_id: DOC, code: ' 3.2.s', title: 'Same part' });
    expect(out.kind === 'refused' && out.status).toBe(409);
    expect(await readOrder()).toEqual(['3.2.S']);
  });

  it('recognises the unique-index violation a concurrent create loses with, so it too reads as a conflict', async () => {
    await seedTemplate(['2.5.1']);
    let caught: unknown = null;
    try {
      await pg.query(
        `INSERT INTO authoring_sections (id, doc_id, code, title, tenant_id) VALUES (gen_random_uuid(), $1, '2.5.1', 'x', $2)`,
        [DOC, TENANT],
      );
    } catch (e) { caught = e; }
    expect(caught).not.toBeNull();
    expect(isSectionCodeConflict(caught)).toBe(true);
    expect(isSectionCodeConflict(new Error('lineage coverage below threshold'))).toBe(false);
  });
});
