/**
 * assembleOrgNdaModules measures every CTD module against its REQUIRED sections.
 *
 * What the code used to do (until 2026-10-15): a module's pct was
 * complete / authored — the denominator was the sections someone had already
 * authored — and a module with no authored section was left out of the result.
 * One approved Module 1 section therefore came back as the only row,
 * { m: '1', pct: 100, gate: null }, which the NDA cockpit rendered as
 * "M1 100% · module complete", and the cockpit's overall (the mean of the
 * returned rows) was 100.
 *
 * The denominator is now the canonical required-section profile for the
 * application — server/services/ectd/required-sections.ts
 * requiredSectionProfileFor, the list the eCTD leaf validator, the
 * validate-completeness engine and the dispatch-readiness gate read — every
 * module is returned, and a module nobody has started reads 0 of N. The
 * expected counts below are derived from that profile rather than restated, so
 * this test pins "the denominator IS the canonical list", not a copy of it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { requiredSectionProfileFor } from '../../ectd/required-sections';

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

const DDL = `
CREATE TABLE submissions (id serial PRIMARY KEY, organization_id int, title text, product_name text, application_type text, primary_region text NOT NULL DEFAULT 'fda', updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE ectd_sequences (id serial PRIMARY KEY, organization_id int, submission_id int, deleted_at timestamptz);
CREATE TABLE submission_leaves (id serial PRIMARY KEY, organization_id int, sequence_id int, section_code text, document_table text, document_id int, deleted_at timestamptz);
CREATE TABLE coauthor_documents (id serial PRIMARY KEY, organization_id int, module_number text, status text, module_name text);
`;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
}, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(`DELETE FROM submissions; DELETE FROM ectd_sequences; DELETE FROM submission_leaves; DELETE FROM coauthor_documents;`);
});

/** A submission with the full submission → sequence → leaf → coauthor doc linkage. */
async function seedApp(appType: string, docs: Array<[string, string, string]>, region = 'fda'): Promise<void> {
  const s = await pglite.query(
    `INSERT INTO submissions (organization_id, title, application_type, primary_region) VALUES ($1,$2,$3,$4) RETURNING id`,
    [ORG, `${appType} submission`, appType, region],
  );
  const subId = (s.rows[0] as { id: number }).id;
  const q = await pglite.query(`INSERT INTO ectd_sequences (organization_id, submission_id) VALUES ($1,$2) RETURNING id`, [ORG, subId]);
  const seqId = (q.rows[0] as { id: number }).id;
  for (const [code, status, name] of docs) {
    const d = await pglite.query(
      `INSERT INTO coauthor_documents (organization_id, module_number, status, module_name) VALUES ($1,$2,$3,$4) RETURNING id`,
      [ORG, code, status, name],
    );
    await pglite.query(
      `INSERT INTO submission_leaves (organization_id, sequence_id, section_code, document_table, document_id) VALUES ($1,$2,$3,'coauthor_documents',$4)`,
      [ORG, seqId, code, (d.rows[0] as { id: number }).id],
    );
  }
}

/** The canonical profile's required codes, grouped by CTD module ('1'..'5'). */
function requiredByModule(type: 'NDA' | 'BLA'): Record<string, string[]> {
  const profile = requiredSectionProfileFor(type);
  if (!profile) throw new Error(`no canonical profile for ${type}`);
  const out: Record<string, string[]> = { '1': [], '2': [], '3': [], '4': [], '5': [] };
  for (const code of profile.sections) out[code[0]].push(code);
  return out;
}

const rowsOf = () => assembleOrgNdaModules(ORG);
const byModule = (rows: NdaModuleRow[]) => Object.fromEntries(rows.map((r) => [r.m, r])) as Record<string, NdaModuleRow>;

describe('assembleOrgNdaModules — the denominator is the required-section profile', () => {
  it('one approved Module 1 section is 1 of the NDA\'s required Module 1 sections, not a complete module', async () => {
    await seedApp('nda', [['m1.1', 'approved', 'Form FDA 356h']]);
    const req = requiredByModule('NDA');
    const m1 = byModule(await rowsOf())['1'];

    expect(m1?.pct, 'one authored section is not the whole of Module 1').toBe(Math.round((1 / req['1'].length) * 100));
    expect(m1).toMatchObject({ required: req['1'].length, complete: 1, open: req['1'].length - 1, docs: 1 });
    // The module is gated by a required section nobody has started, named from the canonical record.
    expect(m1.gate).toMatch(/^1\.2 Cover Letter not started · \d+ more open$/);
  });

  it('returns all five modules — a module nobody has started reads 0 of N, it is not omitted', async () => {
    await seedApp('nda', [['m1.1', 'approved', 'Form FDA 356h']]);
    const req = requiredByModule('NDA');
    const rows = await rowsOf();

    expect(rows.map((r) => r.m)).toEqual(['1', '2', '3', '4', '5']);
    for (const m of ['2', '3', '4', '5']) {
      const row = byModule(rows)[m];
      expect(row, `Module ${m}`).toMatchObject({ pct: 0, complete: 0, docs: 0, required: req[m].length, open: req[m].length });
      expect(String(row.gate), `Module ${m}`).toMatch(/ not started/);
    }
  });

  it('the overall over the rows is required-complete / required across the whole profile — never 100 from one section', async () => {
    await seedApp('nda', [['m1.1', 'approved', 'Form FDA 356h']]);
    const rows = await rowsOf();
    const complete = rows.reduce((a, r) => a + Number(r.complete), 0);
    const required = rows.reduce((a, r) => a + Number(r.required), 0);

    expect(required).toBe(requiredSectionProfileFor('NDA')!.sections.size);
    expect(complete).toBe(1);
    expect(Math.round((complete / required) * 100)).toBeLessThan(100);
  });

  it('one approved Module 3 section satisfies 3.2.S only — Module 3 is not complete', async () => {
    await seedApp('nda', [['m3.2.S.2', 'approved', 'Manufacture (Drug Substance)']]);
    const req = requiredByModule('NDA');
    const m3 = byModule(await rowsOf())['3'];

    expect(m3).toMatchObject({ required: req['3'].length, complete: 1, docs: 1 });
    expect(m3.pct).toBe(Math.round((1 / req['3'].length) * 100));
    expect(m3.gate).toMatch(/^3\.2\.P Drug Product not started/);
  });

  it('a required heading is complete only when every section authored beneath it is', async () => {
    // One approval under 3.2.S must not conceal a draft under the same heading.
    await seedApp('nda', [
      ['m3.2.S.2', 'approved', 'Manufacture (Drug Substance)'],
      ['m3.2.S.4', 'draft', 'Control of Drug Substance'],
    ]);
    expect(byModule(await rowsOf())['3']).toMatchObject({ complete: 0, pct: 0, docs: 2 });
  });

  it('a BLA is measured against the BLA profile, not the NDA one', async () => {
    await seedApp('bla', [['m4.2.1', 'approved', 'Pharmacology']]);
    const req = requiredByModule('BLA');
    const m4 = byModule(await rowsOf())['4'];
    expect(m4).toMatchObject({ required: req['4'].length, complete: 1 });
    expect(m4.pct).toBe(Math.round((1 / req['4'].length) * 100));
    expect(String(m4.basis)).toContain('21 CFR 601.2');
  });

  it('reads 100% with no gate only when every required section is complete', async () => {
    const all = [...requiredSectionProfileFor('NDA')!.sections].map((c): [string, string, string] => [`m${c}`, 'approved', c]);
    await seedApp('nda', all);
    const rows = await rowsOf();
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r, `Module ${r.m}`).toMatchObject({ pct: 100, open: 0, gate: null });
      expect(r.required, `Module ${r.m}`).toBeGreaterThan(0);
      expect(r.complete).toBe(r.required);
    }
  });

  it('an application with no canonical required-section profile is not assessed — no percentage, and it says why', async () => {
    // An "NDA" recorded against the EU: the FDA NDA list is not its requirement,
    // and borrowing it would be a confident wrong answer.
    await seedApp('nda', [['m1.1', 'approved', 'Form FDA 356h']], 'eu');
    const rows = await rowsOf();
    expect(rows.map((r) => r.m)).toEqual(['1', '2', '3', '4', '5']);
    for (const r of rows) {
      expect(r, `Module ${r.m}`).toMatchObject({ pct: null, required: null, complete: null, open: null, gate: null, basis: null });
      expect(String(r.notAssessed)).toMatch(/no canonical required-section profile/i);
    }
    expect(byModule(rows)['1'].docs).toBe(1);
  });
});
