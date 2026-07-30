/**
 * assembleOrgNdaModules — END-TO-END against in-process PGlite.
 *
 * Proves the GA read: an NDA/BLA created in the REAL, org-scoped eCTD submission core
 * (submissions + ectd_sequences + submission_leaves + coauthor_documents) is rolled up
 * into exactly the shape the v2 NdaCockpit "CTD readiness" panel renders — one row per
 * CTD module (M1–M5) as { m, label, pct, docs, open, gate } — with no blob, no fallback
 * fixture, strict org scope, the coauthor authoring vocabulary mapped to readiness, the
 * placed-leaf linkage exercised end to end, and — critically — an IND's sections NEVER
 * leaking into the NDA view (and vice versa the IND assembler filters ='ind').
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

import { assembleOrgNdaModules } from '../nda-modules-view-assembler';

const ORG = 7;
const OTHER = 9;

const DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text);
CREATE TABLE submissions (id serial PRIMARY KEY, organization_id int, title text, product_name text, application_type text, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE ectd_sequences (id serial PRIMARY KEY, organization_id int, submission_id int, deleted_at timestamptz);
CREATE TABLE submission_leaves (id serial PRIMARY KEY, organization_id int, sequence_id int, section_code text, document_table text, document_id int, deleted_at timestamptz);
CREATE TABLE coauthor_documents (id serial PRIMARY KEY, organization_id int, module_number text, status text, module_name text);
`;

// [section code, coauthor status, cached module_name]. Spread across CTD M1/M2/M3/M5.
const NDA_DOCS: Array<[string, string, string]> = [
  ['m1.1', 'approved', 'Form FDA 356h'],
  ['m1.12.14', 'draft', 'Financial Disclosure'],
  ['m2.5', 'review', 'Clinical Overview'],
  ['m2.7.4', 'draft', 'Summary of Clinical Safety'],
  ['m3.2.S.2', 'approved', 'Manufacture (Drug Substance)'],
  ['m3.2.S.4', 'finalized', 'Control of Drug Substance'],
  ['m5.2', 'signed', 'Tabular Listing of Clinical Studies'],
  ['m5.3.5.1', 'approved', 'Controlled Clinical Study Report'],
  ['m5.3.5.3', 'draft', 'Integrated Summary of Safety (ISS)'],
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

/** Seed a submission of `appType` with the full submission → sequence → leaf → coauthor
 *  doc linkage (unless withLeaves:false, which leaves the coauthor docs unplaced). */
async function seedApp(
  org: number,
  appType: string,
  docs: Array<[string, string, string]>,
  opts: { withLeaves?: boolean } = {},
): Promise<number> {
  const withLeaves = opts.withLeaves ?? true;
  const s = await pglite.query(
    `INSERT INTO submissions (organization_id, title, product_name, application_type) VALUES ($1,$2,$3,$4) RETURNING id`,
    [org, `${appType.toUpperCase()} submission`, `P-${appType}`, appType],
  );
  const subId = (s.rows[0] as { id: number }).id;
  let seqId: number | null = null;
  if (withLeaves) {
    const q = await pglite.query(`INSERT INTO ectd_sequences (organization_id, submission_id) VALUES ($1,$2) RETURNING id`, [org, subId]);
    seqId = (q.rows[0] as { id: number }).id;
  }
  for (const [code, status, name] of docs) {
    const d = await pglite.query(
      `INSERT INTO coauthor_documents (organization_id, module_number, status, module_name) VALUES ($1,$2,$3,$4) RETURNING id`,
      [org, code, status, name],
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

describe('assembleOrgNdaModules', () => {
  it('rolls a full real NDA up into the CTD-readiness contract (placed-leaf path)', async () => {
    await seedApp(ORG, 'nda', NDA_DOCS);
    const rows = (await assembleOrgNdaModules(ORG)) as Array<Record<string, unknown>>;

    // Only the modules with authored sections appear, ordered M1→M5 (M4 absent — no doc).
    expect(rows.map((r) => r.m)).toEqual(['1', '2', '3', '5']);

    const byM = Object.fromEntries(rows.map((r) => [r.m, r])) as Record<string, Record<string, unknown>>;

    // M1 — 356h approved (complete), Financial Disclosure draft (open) → 1/2 = 50%.
    expect(byM['1']).toMatchObject({ label: 'Administrative & prescribing (Module 1)', docs: 2, open: 1, pct: 50 });
    expect(byM['1'].gate).toContain('Financial Disclosure');
    expect(byM['1'].gate).toContain('drafting');

    // M2 — Clinical Overview review (open) + Safety Summary draft (open) → 0/2 = 0%.
    // Gate = the least-advanced open section (draft ranks below review).
    expect(byM['2']).toMatchObject({ docs: 2, open: 2, pct: 0 });
    expect(byM['2'].gate).toContain('Summary of Clinical Safety');
    expect(byM['2'].gate).toContain('1 more open');

    // M3 — approved + finalized (both complete) → 2/2 = 100%, no gate.
    expect(byM['3']).toMatchObject({ docs: 2, open: 0, pct: 100, gate: null });

    // M5 — signed + approved complete, ISS draft open → 2/3 = 67%.
    expect(byM['5']).toMatchObject({ docs: 3, open: 1, pct: 67 });
    expect(byM['5'].gate).toContain('Integrated Summary of Safety');
  });

  it('maps the coarse coauthor vocabulary to readiness (draft/review open; approved/finalized/signed complete)', async () => {
    // One module, one doc per status, to read the open/complete classification cleanly.
    await seedApp(ORG, 'nda', [
      ['m1.1', 'draft', 'A'], ['m1.2', 'in-progress', 'B'], ['m1.3', 'review', 'C'],
      ['m1.4', 'approved', 'D'], ['m1.5', 'finalized', 'E'], ['m1.6', 'signed', 'F'],
    ]);
    const rows = (await assembleOrgNdaModules(ORG)) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    // draft, in-progress, review → open (3); approved, finalized, signed → complete (3).
    expect(rows[0]).toMatchObject({ m: '1', docs: 6, open: 3, pct: 50 });
  });

  it('includes BLA submissions (application_type IN nda/bla), not just NDA', async () => {
    await seedApp(ORG, 'bla', [['m3.2.S.2', 'approved', 'CMC'], ['m2.3', 'draft', 'QOS']]);
    const rows = (await assembleOrgNdaModules(ORG)) as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.m)).toEqual(['2', '3']);
  });

  it('never crosses tenants and returns [] for an org with no NDA/BLA', async () => {
    await seedApp(ORG, 'nda', NDA_DOCS);
    expect(await assembleOrgNdaModules(OTHER)).toEqual([]);
  });

  it('excludes soft-deleted submissions', async () => {
    const id = await seedApp(ORG, 'nda', NDA_DOCS);
    await pglite.query(`UPDATE submissions SET deleted_at = now() WHERE id = $1`, [id]);
    expect(await assembleOrgNdaModules(ORG)).toEqual([]);
  });

  it('ignores IND submissions and never lets an IND section leak into the NDA view (placed path)', async () => {
    // An IND authored in the same org, fully placed — its m1.* sections must NOT inflate
    // the NDA's Module 1, and an IND-only org must yield [].
    await seedApp(ORG, 'ind', [['m1.1', 'approved', 'IND 356'], ['m1.2', 'approved', 'IND cover'], ['m2.3', 'approved', 'IND QOS']]);
    expect(await assembleOrgNdaModules(ORG)).toEqual([]);

    // Add the NDA alongside the IND; the NDA view reflects ONLY the NDA's placed sections.
    await seedApp(ORG, 'nda', NDA_DOCS);
    const rows = (await assembleOrgNdaModules(ORG)) as Array<Record<string, unknown>>;
    const byM = Object.fromEntries(rows.map((r) => [r.m, r])) as Record<string, Record<string, unknown>>;
    // M1 has exactly the NDA's 2 sections — the IND's two m1.* docs did not leak in.
    expect(byM['1'].docs).toBe(2);
    expect(rows.map((r) => r.m)).toEqual(['1', '2', '3', '5']);
  });

  it('falls back to the org workspace when the NDA has no leaves — excluding IND-placed docs', async () => {
    // NDA submission exists but nothing is placed into a sequence yet; its sections live
    // only in the authoring workspace.
    await seedApp(ORG, 'nda', [['m2.3', 'approved', 'QOS'], ['m3.2.S.2', 'approved', 'Manufacture']], { withLeaves: false });
    // An IND, fully placed, sharing Module 1 — its placed doc must be excluded from the fallback.
    await seedApp(ORG, 'ind', [['m1.1', 'approved', 'IND 356']], { withLeaves: true });

    const rows = (await assembleOrgNdaModules(ORG)) as Array<Record<string, unknown>>;
    // Only the NDA's unplaced workspace sections (M2, M3) — the IND's placed m1.1 is gone.
    expect(rows.map((r) => r.m)).toEqual(['2', '3']);
    expect(rows.every((r) => (r.pct as number) === 100)).toBe(true);
  });
});
