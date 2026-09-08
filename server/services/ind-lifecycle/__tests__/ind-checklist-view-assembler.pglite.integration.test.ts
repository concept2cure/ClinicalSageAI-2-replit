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
CREATE TABLE submission_leaves (id serial PRIMARY KEY, organization_id int, sequence_id int, section_code text, document_table text, document_id int, document_type text, deleted_at timestamptz);
CREATE TABLE rendered_leaf_files (id serial PRIMARY KEY, organization_id int, rendered_from text, file_name text, sha256 text, section_code text);
CREATE TABLE coauthor_documents (id serial PRIMARY KEY, organization_id int, module_number text, status text, module_name text);
CREATE TABLE regulatory_programs (id serial PRIMARY KEY, organization_id int, name text, code text, program_type text, product_name text, target_submission_date timestamptz, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
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
  await pglite.exec(`DELETE FROM submissions; DELETE FROM ectd_sequences; DELETE FROM submission_leaves; DELETE FROM coauthor_documents; DELETE FROM regulatory_programs; DELETE FROM rendered_leaf_files;`);
});

/** Seed an IND regulatory program (the store that records the target date). */
async function seedProgram(
  org: number,
  opts: { productName?: string | null; name?: string; code?: string; programType?: string; target?: string | null; deleted?: boolean } = {},
): Promise<void> {
  await pglite.query(
    `INSERT INTO regulatory_programs (organization_id, name, code, program_type, product_name, target_submission_date, deleted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      org,
      opts.name ?? 'BX-301 IND program',
      opts.code ?? 'IND-2026-001',
      opts.programType ?? 'IND',
      opts.productName === undefined ? 'BX-301' : opts.productName,
      opts.target === undefined ? '2026-10-01T00:00:00Z' : opts.target,
      opts.deleted ? new Date() : null,
    ],
  );
}

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
    // No regulatory program is seeded → no recorded target date. Honest null,
    // never an invented offset.
    expect(ind.targetReceiptDate).toBeNull();

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

describe('assembleOrgIndChecklists — targetReceiptDate (regulatory_programs)', () => {
  it("resolves the org's RECORDED target_submission_date by identity match", async () => {
    await seedIND(ORG);
    await seedProgram(ORG); // product_name 'BX-301' matches the submission's product
    const rows = await assembleOrgIndChecklists(ORG) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].targetReceiptDate).toBe('2026-10-01T00:00:00.000Z');
  });

  it('matches on the program name/code when product names differ', async () => {
    await seedIND(ORG);
    // The program's name equals the submission TITLE ('BX-301 (anti-BCMA mAb)').
    await seedProgram(ORG, { productName: null, name: 'BX-301 (anti-BCMA mAb)', target: '2027-01-15T00:00:00Z' });
    const rows = await assembleOrgIndChecklists(ORG) as any[];
    expect(rows[0].targetReceiptDate).toBe('2027-01-15T00:00:00.000Z');
  });

  it('returns null when the matching program records no target date', async () => {
    await seedIND(ORG);
    await seedProgram(ORG, { target: null });
    const rows = await assembleOrgIndChecklists(ORG) as any[];
    expect(rows[0].targetReceiptDate).toBeNull();
  });

  it('returns null when no program matches the submission identity', async () => {
    await seedIND(ORG);
    await seedProgram(ORG, { productName: 'ZX-9', name: 'ZX-9 IND', code: 'IND-ZX9' });
    const rows = await assembleOrgIndChecklists(ORG) as any[];
    expect(rows[0].targetReceiptDate).toBeNull();
  });

  it('never resolves across tenants, program type, or soft-deleted programs', async () => {
    await seedIND(ORG);
    await seedProgram(OTHER); // right identity, wrong org
    await seedProgram(ORG, { programType: 'NDA' }); // right identity, wrong program type
    await seedProgram(ORG, { deleted: true }); // right identity, soft-deleted
    const rows = await assembleOrgIndChecklists(ORG) as any[];
    expect(rows[0].targetReceiptDate).toBeNull();
  });
});

/* ── WO-9 Click 2: a sponsor-completed official form placed as a leaf ────────
   The forms panel's upload path stores the sponsor's completed, signed FDA form
   (rendered_leaf_files) and places it as a Module 1 leaf typed form_<n>. The
   checklist above this panel says "Form FDA 3674 — Open" from the coauthor
   status alone; once the signed official form is placed, that is the complete
   form, and the chip must say so from the placed leaf — never from a fixture. */
describe('assembleOrgIndChecklists — sponsor-completed official form leaves', () => {
  async function placeUploadedForm(org: number, seqId: number, documentType: string, sectionCode = 'm1.1'): Promise<number> {
    const f = await pglite.query(
      `INSERT INTO rendered_leaf_files (organization_id, rendered_from, file_name, sha256, section_code)
       VALUES ($1, 'ind_form_sponsor_upload', 'form-fda-3674-signed.pdf', 'abc', $2) RETURNING id`,
      [org, sectionCode],
    );
    const fileId = (f.rows[0] as { id: number }).id;
    await pglite.query(
      `INSERT INTO submission_leaves (organization_id, sequence_id, section_code, document_table, document_id, document_type)
       VALUES ($1, $2, $3, 'rendered_leaf_files', $4, $5)`,
      [org, seqId, sectionCode, fileId, documentType],
    );
    return fileId;
  }
  async function sequenceOf(subId: number): Promise<number> {
    const q = await pglite.query(`SELECT id FROM ectd_sequences WHERE submission_id = $1 LIMIT 1`, [subId]);
    return (q.rows[0] as { id: number }).id;
  }

  it('a placed form_3674 leaf backed by a retained file marks FDA 3674 complete; the others keep their authored state', async () => {
    const subId = await seedIND(ORG);            // 1571/1572 approved, 3674 still draft
    await placeUploadedForm(ORG, await sequenceOf(subId), 'form_3674');
    const [ind] = (await assembleOrgIndChecklists(ORG)) as any[];
    const byId: Record<string, boolean> = Object.fromEntries(ind.forms.map((f: any) => [f.id, f.done]));
    expect(byId).toMatchObject({ FDA_1571: true, FDA_1572: true, FDA_3674: true });
    // The uploaded form is a Module 1 form, not a tracked eCTD section.
    expect(ind.sections.some((sec: any) => sec.code === 'm1.1')).toBe(false);
  });

  it('a leaf whose file belongs to another organisation does not complete the form', async () => {
    const subId = await seedIND(ORG);
    const seqId = await sequenceOf(subId);
    const f = await pglite.query(
      `INSERT INTO rendered_leaf_files (organization_id, rendered_from, file_name, sha256) VALUES ($1, 'ind_form_sponsor_upload', 'x.pdf', 'x') RETURNING id`,
      [OTHER],
    );
    await pglite.query(
      `INSERT INTO submission_leaves (organization_id, sequence_id, section_code, document_table, document_id, document_type)
       VALUES ($1, $2, 'm1.1', 'rendered_leaf_files', $3, 'form_3674')`,
      [ORG, seqId, (f.rows[0] as { id: number }).id],
    );
    const [ind] = (await assembleOrgIndChecklists(ORG)) as any[];
    expect(ind.forms.find((x: any) => x.id === 'FDA_3674').done).toBe(false);
  });

  it('a form leaf with no document behind it (awaiting the sponsor\'s file) does not complete the form', async () => {
    const subId = await seedIND(ORG);
    await pglite.query(
      `INSERT INTO submission_leaves (organization_id, sequence_id, section_code, document_table, document_id, document_type)
       VALUES ($1, $2, 'm1.1', NULL, NULL, 'form_3674')`,
      [ORG, await sequenceOf(subId)],
    );
    const [ind] = (await assembleOrgIndChecklists(ORG)) as any[];
    expect(ind.forms.find((x: any) => x.id === 'FDA_3674').done).toBe(false);
  });
});

/* ── An absent authoring store must not erase a real IND ────────────────────
   The checklist's IDENTITY comes from `submissions`; `coauthor_documents` only
   supplies per-section authoring status. The read of it was unguarded inside the
   bulk Promise.all, so on a database where the authoring store is not
   provisioned the whole assembly threw 42P01, the route degraded the ENTIRE
   response to `[]`, and a tenant with real IND submissions was shown "No IND
   checklist yet". The honest degradation is no section status, not no IND. */
describe('assembleOrgIndChecklists — a missing authoring store degrades sections, not the IND', () => {
  it('still reports the IND, with honest empty sections, when coauthor_documents is absent', async () => {
    await seedIND(ORG);
    await pglite.exec('DROP TABLE coauthor_documents');
    try {
      const rows = (await assembleOrgIndChecklists(ORG)) as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].code).toBe('BX-301');
      expect(rows[0].sponsorName).toBe('Concept2Cure');
      expect(rows[0].sections).toEqual([]);
      expect(rows[0].forms.every((f: any) => f.done === false)).toBe(true);
    } finally {
      await pglite.exec(
        `CREATE TABLE coauthor_documents (id serial PRIMARY KEY, organization_id int, module_number text, status text, module_name text);`,
      );
    }
  });
});
