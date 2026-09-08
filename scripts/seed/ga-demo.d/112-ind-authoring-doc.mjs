/**
 * Domain seed — an authored document for the demo's IND program.
 *
 * The GA demo's only authoring document belongs to BX-204, the BLA. The
 * document editor scopes its list to the OPEN program
 * (`authoring_documents.client_program_id`, filtered by
 * server/routes/authoring.router.ts), so with the IND program open the editor
 * had nothing to show — and "Place into filing", which lives on an open
 * document, was therefore unreachable for the one program the IND demo path
 * uses. Landing on an IND program, opening its Module 1 forms, and placing a
 * document into its sequence were three journeys on two different programs.
 *
 * This gives BX-512 (Vorelinib) a real authored document in the same store the
 * editor writes: CTD 3.2.S.4, Control of Drug Substance, with its published
 * subsections. 3.2.S.4.2 is deliberately among them — it is the precision case
 * the placement path has to carry end to end (a leaf filed at 3.2.S.4.2 must
 * stay 3.2.S.4.2, not collapse to its heading), so the demo can exercise it
 * without anyone typing a code from memory.
 *
 * Columns mirror authoring.router.ts exactly (uuid ids, created_by as a string,
 * tenant_id scoping). Idempotent: skips when the document already exists for
 * this program. Org-scoped, and every table and column is guarded so a schema
 * without them degrades to a warning rather than aborting the seed run.
 */
import crypto from 'node:crypto';

const PROGRAM_CODE = 'BX-512';
const TITLE = 'Control of Drug Substance (CTD 3.2.S.4)';
const MODULE = 'M3';

/** The published 3.2.S.4 subsections, with content a reviewer could read. */
const SECTIONS = [
  {
    code: '3.2.S.4.1', order: 0, title: '3.2.S.4.1  Specification',
    content:
      'The drug substance specification covers appearance, identity (IR, HPLC retention), assay (98.0–102.0% on the anhydrous basis), ' +
      'related substances, residual solvents and water content. Acceptance criteria are justified by batch data from the three ' +
      'registration lots and by the stability profile at the proposed storage condition.',
  },
  {
    code: '3.2.S.4.2', order: 1, title: '3.2.S.4.2  Analytical procedures',
    content:
      'Assay and related substances are determined by reversed-phase HPLC with UV detection at 254 nm on a C18 column, gradient ' +
      'elution, 1.0 mL/min. Identity is confirmed by IR against the reference standard and by HPLC retention. Water content is ' +
      'determined by Karl Fischer titration; residual solvents by headspace GC-FID.',
  },
  {
    code: '3.2.S.4.3', order: 2, title: '3.2.S.4.3  Validation of analytical procedures',
    content:
      'The HPLC assay and impurity methods were validated per ICH Q2(R2) for specificity, linearity, accuracy, precision, range, ' +
      'detection and quantitation limits, and robustness. Forced-degradation studies demonstrate peak purity and mass balance for ' +
      'the drug substance and its specified degradation products.',
  },
];

async function has(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS c`, [`public.${table}`]);
  return !!r.rows[0]?.c;
}

export default async function seedIndAuthoringDoc(client, { org, admin }) {
  for (const t of ['authoring_documents', 'authoring_sections', 'regulatory_programs']) {
    if (!(await has(client, t))) {
      console.log(`   ⚠ ${t} not found — skipping ind-authoring-doc seed`);
      return;
    }
  }
  const col = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'authoring_documents' AND column_name = 'client_program_id'`,
  );
  if (col.rows.length === 0) {
    console.log('   ⚠ authoring_documents.client_program_id missing — skipping ind-authoring-doc seed');
    return;
  }

  const prog = await client.query(
    `SELECT id, product_name FROM regulatory_programs
      WHERE organization_id = $1 AND code = $2 AND deleted_at IS NULL LIMIT 1`,
    [org.id, PROGRAM_CODE],
  );
  const program = prog.rows[0];
  if (!program) {
    console.log(`   ⚠ ind authoring doc: program ${PROGRAM_CODE} not seeded — skipping`);
    return;
  }

  const existing = await client.query(
    `SELECT id FROM authoring_documents
      WHERE tenant_id = $1 AND client_program_id = $2 AND title = $3 LIMIT 1`,
    [org.id, program.id, TITLE],
  );
  if (existing.rows.length > 0) {
    console.log(`   ✓ ind authoring doc: already seeded for ${PROGRAM_CODE}`);
    return;
  }

  const u = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 1`,
    [org.id],
  );
  const createdBy = String(u.rows[0]?.user_id ?? admin?.id ?? '');
  if (!createdBy) {
    console.log('   ⚠ ind authoring doc: no org member to own the document — skipping');
    return;
  }

  const docId = crypto.randomUUID();
  const created = new Date('2026-08-20T09:30:00Z');
  const updated = new Date('2026-09-01T09:30:00Z');
  await client.query(
    `INSERT INTO authoring_documents
       (id, title, module, product_code, locale, status, created_by, template_id,
        version, tenant_id, client_program_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'en-US', 'APPROVED', $5, NULL, '1.0', $6, $7, $8, $9)`,
    [docId, TITLE, MODULE, PROGRAM_CODE, createdBy, org.id, program.id, created, updated],
  );

  for (const s of SECTIONS) {
    await client.query(
      `INSERT INTO authoring_sections
         (id, doc_id, code, title, content, order_index, track_changes, tenant_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, $9)`,
      [crypto.randomUUID(), docId, s.code, s.title, s.content, s.order, org.id, created, updated],
    );
  }

  console.log(
    `   ✓ ind authoring doc: "${TITLE}" seeded for ${PROGRAM_CODE} (${SECTIONS.length} sections, incl. 3.2.S.4.2)`,
  );
}
