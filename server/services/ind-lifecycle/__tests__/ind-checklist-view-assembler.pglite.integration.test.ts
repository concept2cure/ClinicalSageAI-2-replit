/**
 * assembleOrgIndChecklists — END-TO-END against in-process PGlite.
 *
 * Proves the GA read: an IND created in the REAL, org-scoped eCTD submission core
 * (submissions + ectd_sequences + submission_leaves + coauthor_documents) is assembled
 * into exactly the shape the v2 IndLifecycle surface renders — identity, the 1571/1572/
 * 3674 forms with real done state, and the eCTD sections with their authoring status
 * mapped from the real coauthor vocabulary — with no blob, no fallback, strict org scope,
 * and the placed-leaf linkage exercised end to end.
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

import { assembleOrgIndChecklists } from '../ind-checklist-view-assembler';

const ORG = 7;
const OTHER = 9;

const DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text);
CREATE TABLE submissions (id serial PRIMARY KEY, organization_id int, title text, product_name text, application_type text, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE ectd_sequences (id serial PRIMARY KEY, organization_id int, submission_id int, deleted_at timestamptz);
CREATE TABLE submission_leaves (id serial PRIMARY KEY, organization_id int, sequence_id int, section_code text, document_table text, document_id int, deleted_at timestamptz);
CREATE TABLE coauthor_documents (id serial PRIMARY KEY, organization_id int, module_number text, status text, module_name text);
`;

// [section code, coauthor status]. Forms are m1.1.1/.2/.3.
const DOCS: Array<[string, string]> = [
  ['m1.1.1', 'approved'], ['m1.1.2', 'approved'], ['m1.1.3', 'draft'],
  ['m1.2', 'finalized'], ['m1.6.2', 'review'], ['m1.7', 'draft'], ['m2.3', 'approved'],
];

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
  await pglite.query(`INSERT INTO organizations (id, name) VALUES ($1,'Concept2Cure'),($2,'Other Org')`, [ORG, OTHER]);
}, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(`DELETE FROM submissions; DELETE FROM ectd_sequences; DELETE FROM submission_leaves; DELETE FROM coauthor_documents;`);
});

/** Seed a full IND with the submission → sequence → leaf → coauthor doc linkage. */
async function seedIND(org: number, opts: { withLeaves?: boolean } = {}): Promise<number> {
  const withLeaves = opts.withLeaves ?? true;
  const s = await pglite.query(
    `INSERT INTO submissions (organization_id, title, product_name, application_type) VALUES ($1,'BX-301 (anti-BCMA mAb)','BX-301','ind') RETURNING id`,
    [org],
  );
  const subId = (s.rows[0] as { id: number }).id;
  let seqId: number | null = null;
  if (withLeaves) {
    const q = await pglite.query(`INSERT INTO ectd_sequences (organization_id, submission_id) VALUES ($1,$2) RETURNING id`, [org, subId]);
    seqId = (q.rows[0] as { id: number }).id;
  }
  for (const [code, status] of DOCS) {
    const d = await pglite.query(
      `INSERT INTO coauthor_documents (organization_id, module_number, status, module_name) VALUES ($1,$2,$3,$4) RETURNING id`,
      [org, code, status, code],
    );
    const docId = (d.rows[0] as { id: number }).id;
    if (seqId != null) {
      await pglite.query(
        `INSERT INTO submission_leaves (organization_id, sequence_id, section_code, document_table, document_id) VALUES ($1,$2,$3,'coauthor_documents',$4)`,
        [org, seqId, code, docId],
      );
    }
  }
  return subId;
}

describe('assembleOrgIndChecklists', () => {
  it('maps a full real IND into the IndLifecycle contract (placed-leaf path)', async () => {
    await seedIND(ORG);
    const rows = await assembleOrgIndChecklists(ORG);
    expect(rows).toHaveLength(1);
    const ind = rows[0] as any;

    // Identity — real fields; indication honest-null; sponsor = the tenant org.
    expect(ind.code).toBe('BX-301');
    expect(ind.drugName).toBe('BX-301');
    expect(ind.productName).toBe('BX-301 (anti-BCMA mAb)');
    expect(ind.indication).toBeNull();
    expect(ind.sponsorName).toBe('Concept2Cure');
    expect(ind.submissionType).toBe('IND');
    expect(ind.targetReceiptOffsetDays).toBe(14);

    // Forms — 1571/1572 complete (approved), 3674 open (draft). Form sections are
    // NOT duplicated into the section list.
    const byId: Record<string, boolean> = Object.fromEntries(ind.forms.map((f: any) => [f.id, f.done]));
    expect(byId).toMatchObject({ FDA_1571: true, FDA_1572: true, FDA_3674: false });
    expect(ind.forms.find((f: any) => f.id === 'FDA_1571').ref).toBe('21 CFR 312.23(a)(1)');
    expect(ind.sections.some((sec: any) => sec.code.startsWith('m1.1.'))).toBe(false);

    // Sections — real coauthor status mapped into the surface vocabulary, enriched
    // from the canonical blueprint (title / module / CFR ref / AI-draftable).
    const sec = Object.fromEntries(ind.sections.map((x: any) => [x.code, x]));
    expect(sec['m1.2']).toMatchObject({ title: 'Cover Letter', module: 'M1', status: 'signed', ai: true });
    expect(sec['m1.2'].ref).toContain('312.23');
    expect(sec['m1.6.2'].status).toBe('qa_review');   // review → qa_review
    expect(sec['m1.7'].status).toBe('drafting');      // draft → drafting
    expect(sec['m2.3'].status).toBe('approved');      // approved → approved
  });

  it('renders an honest empty section list (no org-wide fallback) when a submission has no placed leaves', async () => {
    // Docs exist in the org authoring workspace but none are placed into this filing.
    // The checklist must NOT borrow those org-wide docs — the submission still appears
    // (its identity is real) but with zero placed sections and no forms marked done.
    await seedIND(ORG, { withLeaves: false });
    const rows = await assembleOrgIndChecklists(ORG);
    expect(rows).toHaveLength(1);
    const ind = rows[0] as any;
    expect(ind.code).toBe('BX-301');                 // identity is still real
    expect(ind.sections).toEqual([]);                // nothing placed → honest empty, not org-wide
    expect(ind.forms.every((f: any) => f.done === false)).toBe(true); // no form completed via fallback
  });

  it('does not leak one submission\'s org docs into a sibling submission with no leaves', async () => {
    // Submission A is fully placed; submission B (same org) has no leaves. B must stay
    // empty — the org-wide document pool must not bleed A's/the workspace's docs into B.
    await seedIND(ORG);                    // A — with leaves
    await seedIND(ORG, { withLeaves: false }); // B — no leaves
    const rows = await assembleOrgIndChecklists(ORG) as any[];
    expect(rows).toHaveLength(2);
    // Exactly one has placed sections; the other is honestly empty.
    const withSections = rows.filter((r) => r.sections.length > 0);
    const emptyOnes = rows.filter((r) => r.sections.length === 0);
    expect(withSections).toHaveLength(1);
    expect(emptyOnes).toHaveLength(1);
    expect(emptyOnes[0].forms.every((f: any) => f.done === false)).toBe(true);
  });

  it('returns [] for an org with no IND submission, and never crosses tenants', async () => {
    await seedIND(ORG);
    expect(await assembleOrgIndChecklists(OTHER)).toEqual([]);
  });

  it('excludes soft-deleted submissions', async () => {
    const id = await seedIND(ORG);
    await pglite.query(`UPDATE submissions SET deleted_at = now() WHERE id = $1`, [id]);
    expect(await assembleOrgIndChecklists(ORG)).toEqual([]);
  });

  it('ignores non-IND submissions', async () => {
    await pglite.query(`INSERT INTO submissions (organization_id, title, product_name, application_type) VALUES ($1,'A BLA','BLA-9','bla')`, [ORG]);
    expect(await assembleOrgIndChecklists(ORG)).toEqual([]);
  });
});
