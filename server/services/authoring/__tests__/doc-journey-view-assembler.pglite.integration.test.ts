/**
 * assembleOrgDocJourney — END-TO-END against in-process PGlite.
 *
 * Proves the GA read: a document created in the REAL authoring store
 * (authoring_documents + authoring_sections + doc_revisions + authoring_comments +
 * frozen_documents) is reconstructed into exactly the ordered { id, label, ic, when,
 * who, ver, done, active, sub, kind, snap } stage list the v2 DocJourney surface renders
 * — one stage per recorded milestone (created / authoring / review / submitted / approved
 * / frozen), every when/who/ver from a real column, milestones the store never recorded
 * absent (never fabricated), actors resolved through the users join, with no blob, strict
 * tenant scoping, and newest-document selection.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import { assembleOrgDocJourney } from '../doc-journey-view-assembler';

const ORG = 7;
const OTHER = 9;

// Minimal DDL — only the columns the assembler reads (mirrors the authoring loop tables).
const DDL = `
CREATE TABLE users (id serial PRIMARY KEY, name text, email text);
CREATE TABLE authoring_documents (id text PRIMARY KEY, title text, module text, product_code text, status text, version text, created_by text, created_at timestamptz, updated_at timestamptz, submitted_at timestamptz, approved_at timestamptz, frozen_at timestamptz, tenant_id int);
CREATE TABLE authoring_sections (id text PRIMARY KEY, doc_id text, code text, title text, content text, order_index int, updated_at timestamptz, tenant_id int);
CREATE TABLE doc_revisions (id text PRIMARY KEY, section_id text, content text, created_by text, created_at timestamptz, tenant_id int);
CREATE TABLE authoring_comments (id text PRIMARY KEY, section_id text, doc_id text, body text, status text, created_by text, user_name text, user_email text, created_at timestamptz, resolved_at timestamptz, resolved_by text, tenant_id int);
CREATE TABLE frozen_documents (id serial PRIMARY KEY, document_id text, version text, content_hash text, frozen_by text, frozen_reason text, frozen_at timestamptz, tenant_id int);
`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (iso: string) => { const d = new Date(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); }, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(
    `DELETE FROM users; DELETE FROM authoring_documents; DELETE FROM authoring_sections;
     DELETE FROM doc_revisions; DELETE FROM authoring_comments; DELETE FROM frozen_documents;`,
  );
});

async function user(id: number, name: string, email: string): Promise<void> {
  await pglite.query(`INSERT INTO users (id, name, email) VALUES ($1,$2,$3)`, [id, name, email]);
}
async function doc(o: {
  id: string; org: number; title: string; status: string; createdBy: string;
  version?: string | null; module?: string | null; product?: string | null;
  createdAt: string; updatedAt?: string; submittedAt?: string | null; approvedAt?: string | null; frozenAt?: string | null;
}): Promise<void> {
  await pglite.query(
    `INSERT INTO authoring_documents (id, title, module, product_code, status, version, created_by, created_at, updated_at, submitted_at, approved_at, frozen_at, tenant_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [o.id, o.title, o.module ?? null, o.product ?? null, o.status, o.version ?? null, o.createdBy,
     o.createdAt, o.updatedAt ?? o.createdAt, o.submittedAt ?? null, o.approvedAt ?? null, o.frozenAt ?? null, o.org],
  );
}
async function section(id: string, docId: string, org: number, code: string, title: string, content: string, order: number, updatedAt: string): Promise<void> {
  await pglite.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, updated_at, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, docId, code, title, content, order, updatedAt, org],
  );
}
async function revision(id: string, sectionId: string, org: number, content: string, createdBy: string, createdAt: string): Promise<void> {
  await pglite.query(
    `INSERT INTO doc_revisions (id, section_id, content, created_by, created_at, tenant_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, sectionId, content, createdBy, createdAt, org],
  );
}
async function comment(id: string, sectionId: string, docId: string, org: number, body: string, status: string, createdBy: string, userName: string, createdAt: string, resolvedBy: string | null = null): Promise<void> {
  await pglite.query(
    `INSERT INTO authoring_comments (id, section_id, doc_id, body, status, created_by, user_name, created_at, resolved_at, resolved_by, tenant_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, sectionId, docId, body, status, createdBy, userName, createdAt, resolvedBy ? createdAt : null, resolvedBy, org],
  );
}
async function frozen(docId: string, org: number, version: string, hash: string, frozenBy: string, frozenAt: string): Promise<void> {
  await pglite.query(
    `INSERT INTO frozen_documents (document_id, version, content_hash, frozen_by, frozen_reason, frozen_at, tenant_id) VALUES ($1,$2,$3,$4,'Approved and frozen',$5,$6)`,
    [docId, version, hash, frozenBy, frozenAt, org],
  );
}

const DISPLAY_KEYS = ['id', 'label', 'ic', 'when', 'who', 'ver', 'done', 'active', 'sub', 'kind', 'snap'];

describe('assembleOrgDocJourney', () => {
  it('reconstructs the full lifecycle into ordered, real-column-mapped stages', async () => {
    const createdAt = daysAgo(28), revisedAt = daysAgo(22), commentAt = daysAgo(18), submittedAt = daysAgo(14), approvedAt = daysAgo(7);
    await user(101, 'Dana Okafor', 'dana@example.com');
    await doc({ id: 'd1', org: ORG, title: 'Clinical Overview (CTD Module 2.5)', status: 'APPROVED', createdBy: '101', version: '1.0', module: 'M2', product: 'BX-204', createdAt, updatedAt: approvedAt, submittedAt, approvedAt });
    await section('s251', 'd1', ORG, '2.5.1', '2.5.1  Rationale', 'Rationale content.', 0, revisedAt);
    await section('s254', 'd1', ORG, '2.5.4', '2.5.4  Overview of efficacy', 'ORR was 42.1% (n=214).', 1, revisedAt);
    await revision('r1', 's254', ORG, 'ORR was 42.1% (n=214).', '101', revisedAt);
    await comment('c1', 's254', 'd1', ORG, 'Add the data-lock provenance for the ORR claim.', 'resolved', '101', 'Dana Okafor', commentAt, 'dana@example.com');
    await frozen('d1', ORG, '1.0', 'abcdef0123456789', 'dana@example.com', approvedAt);

    const stages = await assembleOrgDocJourney(ORG) as any[];
    expect(stages.map((s) => s.id)).toEqual(['created', 'authoring', 'review', 'submitted', 'approved', 'frozen']);
    for (const s of stages) for (const k of DISPLAY_KEYS) expect(s).toHaveProperty(k);

    // created — identity from real columns, actor resolved via the users join.
    const created = stages[0];
    expect(created).toMatchObject({ kind: 'brief', done: true, active: false, who: 'Dana Okafor', ver: '1.0' });
    expect(created.when).toBe(fmt(createdAt));
    expect((created.snap.lines as [string, string][])).toContainEqual(['Document', 'Clinical Overview (CTD Module 2.5)']);

    // authoring — revision-backed, latest section content in view.
    const authoring = stages[1];
    expect(authoring.sub).toBe('1 revision · 2 sections');
    expect(authoring.snap.mode).toBe('doc');
    expect(authoring.snap.heading).toContain('2.5.4');
    expect(authoring.snap.body[0]).toContain('42.1%');

    // review — comment-backed, the resolved comment carried into the snapshot.
    const review = stages[2];
    expect(review.sub).toBe('1 comment · 1 resolved');
    expect(review.snap.comment).toMatchObject({ by: 'Dana Okafor', status: 'resolved' });
    expect(review.snap.comment.body).toBe('Add the data-lock provenance for the ORR claim.');

    // submitted / approved / frozen — from submitted_at / approved_at / the freeze row.
    expect(stages[3].when).toBe(fmt(submittedAt));
    expect(stages[4]).toMatchObject({ ver: '1.0', who: 'dana@example.com' });
    expect(stages[4].snap.seal).toBe('APPROVED 1.0');
    expect(stages[5].who).toBe('dana@example.com');
    expect(stages[5].sub).toContain('SHA-256');

    // Terminal document (APPROVED) → every stage complete, none pulsing.
    expect(stages.every((s) => s.done === true)).toBe(true);
    expect(stages.some((s) => s.active === true)).toBe(false);
  });

  it('emits only the created stage for a bare draft, marked active (in progress)', async () => {
    await user(101, 'Dana Okafor', 'dana@example.com');
    await doc({ id: 'd2', org: ORG, title: 'New protocol synopsis', status: 'draft', createdBy: '101', version: null, createdAt: daysAgo(2) });
    const stages = await assembleOrgDocJourney(ORG) as any[];
    expect(stages.map((s) => s.id)).toEqual(['created']);
    // Non-terminal head is active, not done; missing version honest-nulls to '—'.
    expect(stages[0]).toMatchObject({ active: true, done: false, who: 'Dana Okafor', ver: '—' });
  });

  it('omits milestones the store never recorded — never fabricates a stage', async () => {
    const createdAt = daysAgo(20), submittedAt = daysAgo(3);
    await user(101, 'Dana Okafor', 'dana@example.com');
    // Submitted but never approved and never frozen, one authored section, no comments.
    await doc({ id: 'd5', org: ORG, title: 'In-review overview', status: 'IN_REVIEW', createdBy: '101', version: '0.9', createdAt, submittedAt });
    await section('s5', 'd5', ORG, '2.5', 'Overview', 'Some content.', 0, createdAt);
    const stages = await assembleOrgDocJourney(ORG) as any[];
    expect(stages.map((s) => s.id)).toEqual(['created', 'authoring', 'submitted']);
    expect(stages.some((s) => s.id === 'review' || s.id === 'approved' || s.id === 'frozen')).toBe(false);
    // The last recorded milestone is the active (in-progress) head.
    expect(stages[stages.length - 1]).toMatchObject({ id: 'submitted', active: true, done: false });
  });

  it('is strictly tenant-scoped and never crosses orgs', async () => {
    await user(101, 'Dana Okafor', 'dana@example.com');
    await doc({ id: 'dO', org: ORG, title: 'Ours', status: 'draft', createdBy: '101', createdAt: daysAgo(1) });
    await doc({ id: 'dX', org: OTHER, title: 'Theirs', status: 'draft', createdBy: '101', createdAt: daysAgo(1) });

    const theirs = await assembleOrgDocJourney(OTHER) as any[];
    expect((theirs[0].snap.lines as [string, string][])).toContainEqual(['Document', 'Theirs']);
    // A third org with no documents gets an honest empty journey.
    expect(await assembleOrgDocJourney(555)).toEqual([]);
  });

  it('selects the org’s most-recently-updated document', async () => {
    await user(101, 'Dana Okafor', 'dana@example.com');
    await doc({ id: 'old', org: ORG, title: 'Older doc', status: 'draft', createdBy: '101', createdAt: daysAgo(30), updatedAt: daysAgo(30) });
    await doc({ id: 'new', org: ORG, title: 'Newer doc', status: 'draft', createdBy: '101', createdAt: daysAgo(10), updatedAt: daysAgo(1) });
    const stages = await assembleOrgDocJourney(ORG) as any[];
    expect((stages[0].snap.lines as [string, string][])).toContainEqual(['Document', 'Newer doc']);
  });
});
