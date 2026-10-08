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
CREATE TABLE submissions (id serial PRIMARY KEY, organization_id int, program_id uuid, title text, product_name text, application_type text, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE ectd_sequences (id serial PRIMARY KEY, organization_id int, submission_id int, sequence_number text NOT NULL DEFAULT '0000', deleted_at timestamptz);
CREATE TABLE submission_leaves (id serial PRIMARY KEY, organization_id int, sequence_id int, section_code text, lifecycle_op text NOT NULL DEFAULT 'new', document_table text, document_id int, document_uuid uuid, document_type text, deleted_at timestamptz);
CREATE TABLE rendered_leaf_files (id serial PRIMARY KEY, organization_id int, rendered_from text, file_name text, sha256 text, section_code text);
CREATE TABLE coauthor_documents (id serial PRIMARY KEY, organization_id int, module_number text, status text, module_name text);
CREATE TABLE regulatory_programs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int, name text, code text, program_type text, product_name text, target_submission_date timestamptz, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
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
    // finalized (an unsigned freeze) → 'frozen': not signed (2026-09-23), and
    // not complete either (DP-35, 2026-10-01).
    expect(sec['m1.2']).toMatchObject({ title: 'Cover Letter', module: 'M1', status: 'frozen', ai: true });
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

/* upsertLeaf stores a section code exactly as written, and the writers do not
   agree on a spelling: the Vault filing dialog stores judgeSectionCode's
   canonical form ('1.1.1'), a person may type 'M1.2' or '3.2.s.4', and the
   server-side writers store 'm'-prefixed codes. The checklist must read all of
   them as the section they name. */
describe('assembleOrgIndChecklists — a section is the same section however it was spelled', () => {
  async function seedSpelled(org: number, leaves: Array<[string, string, string?]>): Promise<void> {
    const s = await pglite.query(
      `INSERT INTO submissions (organization_id, title, product_name, application_type) VALUES ($1,'BX-301','BX-301','ind') RETURNING id`,
      [org],
    );
    const subId = (s.rows[0] as { id: number }).id;
    const q = await pglite.query(`INSERT INTO ectd_sequences (organization_id, submission_id) VALUES ($1,$2) RETURNING id`, [org, subId]);
    const seqId = (q.rows[0] as { id: number }).id;
    for (const [code, status, name] of leaves) {
      const d = await pglite.query(
        `INSERT INTO coauthor_documents (organization_id, module_number, status, module_name) VALUES ($1,$2,$3,$4) RETURNING id`,
        [org, code, status, name ?? code],
      );
      await pglite.query(
        `INSERT INTO submission_leaves (organization_id, sequence_id, section_code, document_table, document_id) VALUES ($1,$2,$3,'coauthor_documents',$4)`,
        [org, seqId, code, (d.rows[0] as { id: number }).id],
      );
    }
  }

  it('completes a form and enriches a blueprint section whatever the stored spelling', async () => {
    await seedSpelled(ORG, [['1.1.1', 'approved'], ['M1.2', 'finalized'], ['3.2.s.4', 'draft']]);
    const ind = (await assembleOrgIndChecklists(ORG))[0] as any;
    const done = Object.fromEntries(ind.forms.map((f: any) => [f.id, f.done]));
    expect(done.FDA_1571).toBe(true);
    const sec = Object.fromEntries(ind.sections.map((x: any) => [x.code, x]));
    // Shown under the blueprint's own spelling, with the blueprint's title and
    // reference — not as an unrecognised code titled by its file name.
    expect(sec['m1.2']).toMatchObject({ title: 'Cover Letter', module: 'M1', status: 'frozen' });
    expect(sec['m3.2.S.4']).toMatchObject({ title: 'Control of Drug Substance', module: 'M3', status: 'drafting' });
    // A form's section is the form, not a stray section beside it.
    expect(Object.keys(sec).sort()).toEqual(['m1.2', 'm3.2.S.4']);
  });

  /* 2026-09-23 (W5/D7, co-author final pass). coauthor 'finalized' is what a
     FROZEN authoring document files as, and any org member may freeze, with no
     signature. The checklist showed it as 'signed' — a Form 1571 reported
     signed that nobody signed. It became 'locked', still complete, leaving
     whether an unsigned freeze counts as done to the founder. Decided
     2026-10-01 (DP-35): it does not. It is now 'frozen', which claims no
     signature and no completion. 'signed' stays for a status that records one;
     and each current document must be complete: another approval cannot
     hide a current unsigned freeze. */
  it("maps finalized to frozen, never signed or complete; another approval cannot hide current unsigned content", async () => {
    await seedSpelled(ORG, [
      ['1.1.1', 'finalized'],
      ['m1.2', 'finalized'], ['1.2', 'approved'],
      ['m2.3', 'signed'], ['2.3', 'finalized'],
      ['m2.4', 'finalized'],
    ]);
    const ind = (await assembleOrgIndChecklists(ORG))[0] as any;
    const sec = Object.fromEntries(ind.sections.map((x: any) => [x.code, x.status]));
    expect(sec).toEqual({ 'm1.2': 'frozen', 'm2.3': 'frozen', 'm2.4': 'frozen' });
    // DP-35: a frozen, unsigned Form 1571 is not done.
    const done = Object.fromEntries(ind.forms.map((f: any) => [f.id, f.done]));
    expect(done.FDA_1571).toBe(false);
  });

  it('two spellings of one section are one section, with the least complete current document', async () => {
    await seedSpelled(ORG, [['m1.2', 'draft'], ['1.2', 'approved']]);
    const ind = (await assembleOrgIndChecklists(ORG))[0] as any;
    expect(ind.sections).toHaveLength(1);
    expect(ind.sections[0]).toMatchObject({ code: 'm1.2', status: 'drafting' });
  });

  it('a section the blueprint does not model keeps the document’s own name, never an invented title', async () => {
    await seedSpelled(ORG, [['3.2.S.4.2', 'draft', 'Analytical Procedures']]);
    const ind = (await assembleOrgIndChecklists(ORG))[0] as any;
    expect(ind.sections).toEqual([expect.objectContaining({ code: 'm3.2.S.4.2', title: 'Analytical Procedures', module: 'M3' })]);
  });
});

// The loaded filing is not the complete requirement set; missing leaves must
// remain blockers. The server verdict is what both the screen and Ana consume.
describe('IND checklist authoritative readiness and program identity', () => {
  it('does not call three forms and a single approved section a complete IND', async () => {
    const subId = await seedIND(ORG);
    await pglite.query(`UPDATE coauthor_documents SET status = 'approved' WHERE organization_id = $1`, [ORG]);
    const [ind] = await assembleOrgIndChecklists(ORG) as any[];
    expect(ind.submissionId).toBe(subId);
    expect(ind.readiness.ready).toBe(false);
    expect(ind.readiness.requiredSections.total).toBeGreaterThan(ind.sections.length);
    expect(ind.readiness.blockers.some((b: any) => b.kind === 'required_section' && b.code === 'm4.2.3')).toBe(true);
  });

  it('uses the recorded program ID and its date despite duplicate names and a rename', async () => {
    const actual = '10000000-0000-4000-8000-000000000001';
    const other = '10000000-0000-4000-8000-000000000002';
    await pglite.query(`INSERT INTO regulatory_programs (id, organization_id, name, product_name, program_type, target_submission_date) VALUES ($1,$2,'Renamed program','Different product','IND','2026-11-03T00:00:00Z'),($3,$2,'BX-301','BX-301','IND','2026-12-04T00:00:00Z')`, [actual, ORG, other]);
    const subId = await seedIND(ORG);
    await pglite.query(`UPDATE submissions SET program_id = $1 WHERE id = $2`, [actual, subId]);
    const [ind] = await assembleOrgIndChecklists(ORG) as any[];
    expect(ind.programId).toBe(actual);
    expect(ind.targetReceiptDate).toBe('2026-11-03T00:00:00.000Z');
  });

  it('does not guess a date between two same-named unlinked programs', async () => {
    await seedIND(ORG);
    await seedProgram(ORG);
    await seedProgram(ORG, { target: '2026-12-01T00:00:00Z' });
    const [ind] = await assembleOrgIndChecklists(ORG) as any[];
    expect(ind.programId).toBeNull();
    expect(ind.targetReceiptDate).toBeNull();
  });

  it('does not borrow a name-matched date when a recorded link cannot be resolved', async () => {
    const subId = await seedIND(ORG);
    await seedProgram(ORG);
    await pglite.query(`UPDATE submissions SET program_id = '10000000-0000-4000-8000-000000000099' WHERE id = $1`, [subId]);
    const [ind] = await assembleOrgIndChecklists(ORG) as any[];
    expect(ind.targetReceiptDate).toBeNull();
  });
});

// Current placement inventory, not agency acceptance: retain untouched leaves,
// fold repeated document identities in sequence order, and apply withdrawals.
async function sequence(subId: number, number: string): Promise<number> {
  const r = await pglite.query<{ id: number }>(
    `INSERT INTO ectd_sequences (organization_id, submission_id, sequence_number) VALUES ($1,$2,$3) RETURNING id`,
    [ORG, subId, number],
  );
  return r.rows[0].id;
}
async function place(seq: number, code: string, status: string): Promise<number> {
  const r = await pglite.query<{ id: number }>(
    `INSERT INTO coauthor_documents (organization_id,module_number,status,module_name) VALUES ($1,$2,$3,$2) RETURNING id`,
    [ORG, code, status],
  );
  const id = r.rows[0].id;
  await pglite.query(
    `INSERT INTO submission_leaves (organization_id,sequence_id,section_code,document_table,document_id) VALUES ($1,$2,$3,'coauthor_documents',$4)`,
    [ORG, seq, code, id],
  );
  return id;
}
async function withdraw(seq: number, code: string, id: number | null): Promise<void> {
  await pglite.query(
    `INSERT INTO submission_leaves (organization_id,sequence_id,section_code,lifecycle_op,document_table,document_id) VALUES ($1,$2,$3,'delete',$4,$5)`,
    [ORG, seq, code, id == null ? null : 'coauthor_documents', id],
  );
}


describe('IND checklist current lifecycle inventory', () => {
  it('does not hide a later draft behind an earlier approval in the same section', async () => {
    const sub = await seedIND(ORG, { withLeaves: false });
    await place(await sequence(sub, '0000'), 'm3.2.S.1', 'approved');
    await place(await sequence(sub, '0001'), '3.2.s.1', 'draft');
    const [ind] = await assembleOrgIndChecklists(ORG) as any[];
    expect(ind.sections.find((s: any) => s.code === 'm3.2.S.1').status).toBe('drafting');
    expect(ind.readiness.blockers.some((b: any) => b.code === 'm3.2.S.1')).toBe(true);
  });

  it('removes a named withdrawn leaf without removing another document in that section', async () => {
    const sub = await seedIND(ORG, { withLeaves: false });
    const original = await sequence(sub, '0000');
    const old = await place(original, 'm3.2.S.1', 'approved');
    await place(original, 'm3.2.S.1', 'draft');
    await place(original, 'm2.3', 'approved');
    await withdraw(await sequence(sub, '0001'), '3.2.s.1', old);
    const [ind] = await assembleOrgIndChecklists(ORG) as any[];
    expect(ind.sections.find((s: any) => s.code === 'm3.2.S.1').status).toBe('drafting');
    expect(ind.sections.find((s: any) => s.code === 'm2.3').status).toBe('approved');
  });

  it('a withdrawn authored FDA form is no longer complete, including when sequence IDs are out of order', async () => {
    const sub = await seedIND(ORG, { withLeaves: false });
    const later = await sequence(sub, '0001');
    const doc = await place(await sequence(sub, '0000'), '1.1.1', 'approved');
    await withdraw(later, 'm1.1.1', doc);
    const [ind] = await assembleOrgIndChecklists(ORG) as any[];
    expect(ind.forms.find((f: any) => f.id === 'FDA_1571').done).toBe(false);
    expect(ind.readiness.forms.completed).not.toContain('FDA_1571');
  });

  it('a unique section-only withdrawal removes the old content; a later new placement remains current', async () => {
    const sub = await seedIND(ORG, { withLeaves: false });
    await place(await sequence(sub, '0000'), 'm2.3', 'approved');
    await withdraw(await sequence(sub, '0001'), '2.3', null);
    const [withdrawn] = await assembleOrgIndChecklists(ORG) as any[];
    expect(withdrawn.sections).toEqual([]);
    await place(await sequence(sub, '0002'), 'm2.3', 'draft');
    const [restored] = await assembleOrgIndChecklists(ORG) as any[];
    expect(restored.sections).toEqual([expect.objectContaining({ code: 'm2.3', status: 'drafting' })]);
  });

  it('does not mistake a named withdrawal of an unknown document for a section withdrawal', async () => {
    const sub = await seedIND(ORG, { withLeaves: false });
    await place(await sequence(sub, '0000'), 'm2.3', 'approved');
    await withdraw(await sequence(sub, '0001'), 'm2.3', 99999);
    const [ind] = await assembleOrgIndChecklists(ORG) as any[];
    expect(ind.sections).toEqual([expect.objectContaining({ code: 'm2.3', status: 'approved' })]);
    expect(ind.readiness.blockers).toContainEqual(expect.objectContaining({ kind: 'lifecycle' }));
    expect(ind.readiness.ready).toBe(false);
  });

});

describe('IND checklist lifecycle refusals and retained form history', () => {
  it('a withdrawn sponsor-completed form does not remain complete merely because its retained file still exists', async () => {
    const sub = await seedIND(ORG, { withLeaves: false });
    const original = await sequence(sub, '0000');
    const file = await pglite.query<{ id: number }>(
      `INSERT INTO rendered_leaf_files (organization_id,file_name) VALUES ($1,'signed-1571.pdf') RETURNING id`, [ORG],
    );
    await pglite.query(
      `INSERT INTO submission_leaves (organization_id,sequence_id,section_code,document_table,document_id,document_type) VALUES ($1,$2,'m1.1','rendered_leaf_files',$3,'form_1571')`,
      [ORG, original, file.rows[0].id],
    );
    const [before] = await assembleOrgIndChecklists(ORG) as any[];
    expect(before.forms.find((f: any) => f.id === 'FDA_1571').done).toBe(true);
    await pglite.query(
      `INSERT INTO submission_leaves (organization_id,sequence_id,section_code,lifecycle_op,document_table,document_id) VALUES ($1,$2,'1.1','delete','rendered_leaf_files',$3)`,
      [ORG, await sequence(sub, '0001'), file.rows[0].id],
    );
    const [after] = await assembleOrgIndChecklists(ORG) as any[];
    expect(after.forms.find((f: any) => f.id === 'FDA_1571').done).toBe(false);
    expect((await pglite.query(`SELECT id FROM rendered_leaf_files`)).rows).toHaveLength(1);
    expect((await pglite.query(`SELECT id FROM submission_leaves`)).rows).toHaveLength(2);
  });

  it('an ambiguous section withdrawal blocks readiness and preserves the documents instead of guessing', async () => {
    const sub = await seedIND(ORG, { withLeaves: false });
    const original = await sequence(sub, '0000');
    await place(original, 'm2.3', 'approved');
    await place(original, 'm2.3', 'draft');
    await withdraw(await sequence(sub, '0001'), 'm2.3', null);
    const [ind] = await assembleOrgIndChecklists(ORG) as any[];
    expect(ind.sections[0].status).toBe('drafting');
    expect(ind.readiness.blockers).toContainEqual(expect.objectContaining({ kind: 'lifecycle', message: expect.stringContaining('unambiguous') }));
  });

  it('a replacement without a matching document identity blocks readiness', async () => {
    const sub = await seedIND(ORG, { withLeaves: false });
    const original = await sequence(sub, '0000');
    await place(original, 'm2.3', 'approved');
    const latest = await sequence(sub, '0001');
    const doc = await place(latest, 'm2.3', 'approved');
    await pglite.query(`UPDATE submission_leaves SET lifecycle_op='replace' WHERE sequence_id=$1 AND document_id=$2`, [latest, doc]);
    const [ind] = await assembleOrgIndChecklists(ORG) as any[];
    expect(ind.readiness.blockers).toContainEqual(expect.objectContaining({ kind: 'lifecycle', message: expect.stringContaining('replace names no current document') }));
  });

  it('an append to the same document identity remains current once, while deleted sequences do not withdraw it', async () => {
    const sub = await seedIND(ORG, { withLeaves: false });
    const original = await sequence(sub, '0000');
    const doc = await place(original, 'm2.3', 'approved');
    const latest = await sequence(sub, '0001');
    await pglite.query(
      `INSERT INTO submission_leaves (organization_id,sequence_id,section_code,lifecycle_op,document_table,document_id) VALUES ($1,$2,'2.3','append','coauthor_documents',$3)`,
      [ORG, latest, doc],
    );
    const deleted = await sequence(sub, '0002');
    await withdraw(deleted, 'm2.3', doc);
    await pglite.query(`UPDATE ectd_sequences SET deleted_at=now() WHERE id=$1`, [deleted]);
    const [ind] = await assembleOrgIndChecklists(ORG) as any[];
    expect(ind.sections).toEqual([expect.objectContaining({ code: 'm2.3', status: 'approved' })]);
    expect(ind.readiness.blockers.some((b: any) => b.kind === 'lifecycle')).toBe(false);
  });
});

/* QA 2026-10-08 (j7, finding 9). The Vorelinib checklist marked m1.1 "FDA
   Forms" approved, and the only approved document at 1.1 was a placed Form FDA
   356h — an NDA / ANDA / BLA form. For an IND the forms heading is satisfied
   by the forms an IND requires (1571, 1572, 3674), and by nothing else. */
describe('IND checklist: the forms heading counts only the forms an IND requires', () => {
  it('an approved Form 356h placed at 1.1 does not satisfy m1.1, and is not listed as the forms section', async () => {
    const sub = await seedIND(ORG, { withLeaves: false });
    const seq = await sequence(sub, '0000');
    await place(seq, '1.1', 'approved'); // the 356h, authored and approved, placed at the forms heading

    const [ind] = (await assembleOrgIndChecklists(ORG)) as any[];

    expect(ind.readiness.blockers).toContainEqual(expect.objectContaining({ kind: 'required_section', code: 'm1.1' }));
    expect(ind.sections.some((s: any) => s.code === 'm1.1')).toBe(false);
    expect(ind.forms.every((f: any) => f.done === false)).toBe(true);
  });

  it('m1.1 is complete when the IND\'s own forms are, whatever else sits at the heading', async () => {
    const sub = await seedIND(ORG, { withLeaves: false });
    const seq = await sequence(sub, '0000');
    for (const code of ['m1.1.1', 'm1.1.2', 'm1.1.3']) await place(seq, code, 'approved');
    await place(seq, '1.1', 'draft'); // a draft at the heading itself does not hold the forms back either

    const [ind] = (await assembleOrgIndChecklists(ORG)) as any[];

    expect(ind.forms.every((f: any) => f.done === true)).toBe(true);
    expect(ind.readiness.blockers.some((b: any) => b.code === 'm1.1')).toBe(false);
  });
});
