/**
 * assembleOrgNdaModules — END-TO-END against in-process PGlite.
 *
 * Proves the GA read: an NDA/BLA created in the REAL, org-scoped eCTD submission core
 * (submissions + ectd_sequences + submission_leaves + coauthor_documents) is rolled up
 * into exactly the shape the v2 NdaCockpit "CTD readiness" panel renders — one row per
 * CTD module (M1–M5) as { m, label, pct, required, complete, open, docs, gate } — with no
 * blob, no fallback fixture, strict org scope, the coauthor authoring vocabulary mapped to
 * readiness, the placed-leaf linkage exercised end to end, and — critically — an IND's
 * sections NEVER leaking into the NDA view (and vice versa the IND assembler filters ='ind').
 *
 * 2026-10-15: these cases asserted pct over the AUTHORED sections and only the modules
 * that had one ("M4 absent — no doc"; two approved sections → every pct 100). They now
 * assert the canonical denominator — the NDA/BLA required-section profile, pinned in
 * nda-modules-measured-against-required-sections.pglite.integration.test.ts.
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

import { assembleOrgNdaModules, type NdaModuleRow } from '../nda-modules-view-assembler';

const ORG = 7;
const OTHER = 9;

const DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text);
CREATE TABLE submissions (id serial PRIMARY KEY, organization_id int, title text, product_name text, application_type text, primary_region text NOT NULL DEFAULT 'fda', updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
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
    const rows = await assembleOrgNdaModules(ORG);

    // Every module, ordered M1→M5 — M4 has no doc and reads 0 of its 3 required sections.
    expect(rows.map((r) => r.m)).toEqual(['1', '2', '3', '4', '5']);

    const byM = Object.fromEntries(rows.map((r) => [r.m, r])) as Record<string, NdaModuleRow>;

    // M1 — of the NDA's 8 required sections only 1.1 (356h, approved) is complete;
    // 1.12.14 is in drafting and six are not started. The gate is a not-started one.
    expect(byM['1']).toMatchObject({ label: 'Administrative & prescribing (Module 1)', docs: 2, required: 8, complete: 1, open: 7, pct: 13 });
    expect(byM['1'].gate).toBe('1.2 Cover Letter not started · 6 more open');

    // M2 — Clinical Overview (review) and 2.7 (its 2.7.4 in draft) are open; 0 of 6.
    expect(byM['2']).toMatchObject({ docs: 2, required: 6, complete: 0, open: 6, pct: 0 });

    // M3 — 3.2.S holds an approved 3.2.S.2 and a finalized 3.2.S.4, an unsigned freeze
    // (open since DP-35, 2026-10-01), so 3.2.S is not complete: 0 of 4.
    expect(byM['3']).toMatchObject({ docs: 2, required: 4, complete: 0, pct: 0 });

    expect(byM['4']).toMatchObject({ docs: 0, required: 3, complete: 0, pct: 0 });
    expect(byM['4'].gate).toBe('4.2.1 Pharmacology not started · 2 more open');

    // M5 — 5.2 signed (complete); 5.3.5 holds an approved CSR and the ISS in draft (open) → 1 of 2.
    expect(byM['5']).toMatchObject({ docs: 3, required: 2, complete: 1, open: 1, pct: 50 });
    expect(byM['5'].gate).toBe('Integrated Summary of Safety (ISS) in drafting');
  });

  it('maps the coarse coauthor vocabulary to readiness (draft/review/finalized open; approved/signed complete)', async () => {
    // One doc per status on Module 2's six required sections (2.2–2.7, none nested), to
    // read the open/complete classification cleanly. (This used Module 1 codes 1.4–1.6,
    // which an NDA does not require — they counted only under the authored denominator.)
    await seedApp(ORG, 'nda', [
      ['m2.2', 'draft', 'A'], ['m2.3', 'in-progress', 'B'], ['m2.4', 'review', 'C'],
      ['m2.5', 'approved', 'D'], ['m2.6', 'finalized', 'E'], ['m2.7', 'signed', 'F'],
    ]);
    const rows = await assembleOrgNdaModules(ORG);
    const m2 = rows.find((r) => r.m === '2');
    // draft, in-progress, review, finalized (an unsigned freeze, DP-35) → open (4);
    // approved, signed → complete (2).
    expect(m2).toMatchObject({ docs: 6, required: 6, complete: 2, open: 4, pct: 33 });
    expect(m2?.gate).toBe('A in drafting · 3 more open');
  });

  it('includes BLA submissions (application_type IN nda/bla), not just NDA', async () => {
    await seedApp(ORG, 'bla', [['m3.2.S.2', 'approved', 'CMC'], ['m2.3', 'draft', 'QOS']]);
    const rows = await assembleOrgNdaModules(ORG);
    const byM = Object.fromEntries(rows.map((r) => [r.m, r])) as Record<string, NdaModuleRow>;
    expect(rows.map((r) => r.m)).toEqual(['1', '2', '3', '4', '5']);
    expect(byM['2']).toMatchObject({ docs: 1, complete: 0 });
    expect(byM['3']).toMatchObject({ docs: 1, complete: 1, required: 4 });
    // Held to the BLA profile (21 CFR 601.2), which has no separate 4.2.2.
    expect(byM['4']).toMatchObject({ docs: 0, required: 2 });
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
    const rows = await assembleOrgNdaModules(ORG);
    const byM = Object.fromEntries(rows.map((r) => [r.m, r])) as Record<string, NdaModuleRow>;
    // M1 has exactly the NDA's 2 sections — the IND's two m1.* docs did not leak in —
    // and M2 exactly the NDA's 2 (the IND's approved m2.3 QOS is not among them).
    expect(byM['1'].docs).toBe(2);
    expect(byM['2']).toMatchObject({ docs: 2, complete: 0 });
    expect(rows.map((r) => r.m)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('falls back to the org workspace when the NDA has no leaves — excluding IND-placed docs', async () => {
    // NDA submission exists but nothing is placed into a sequence yet; its sections live
    // only in the authoring workspace.
    await seedApp(ORG, 'nda', [['m2.3', 'approved', 'QOS'], ['m3.2.S.2', 'approved', 'Manufacture']], { withLeaves: false });
    // An IND, fully placed, sharing Module 1 — its placed doc must be excluded from the fallback.
    await seedApp(ORG, 'ind', [['m1.1', 'approved', 'IND 356']], { withLeaves: true });

    const rows = await assembleOrgNdaModules(ORG);
    const byM = Object.fromEntries(rows.map((r) => [r.m, r])) as Record<string, NdaModuleRow>;
    // Only the NDA's unplaced workspace sections (M2, M3) — the IND's placed m1.1 is gone.
    expect(byM['1']).toMatchObject({ docs: 0, complete: 0 });
    // Two approved sections are 1 of Module 2's 6 and 1 of Module 3's 4 required sections,
    // not two complete modules (this asserted every pct === 100).
    expect(byM['2']).toMatchObject({ docs: 1, complete: 1, required: 6, pct: 17 });
    expect(byM['3']).toMatchObject({ docs: 1, complete: 1, required: 4, pct: 25 });
  });
});
