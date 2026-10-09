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
 * tenant_id scoping). Idempotent: adds no document when one already exists
 * for this program (it may still seal that one; see the repair note below).
 * Org-scoped, and every table and column is guarded so a schema without them
 * degrades to a warning rather than aborting the seed run.
 *
 * 2026-09-23 (W5/D7, co-author final pass): the document is APPROVED, and an
 * approval always leaves a seal (frozen_documents) — the record of what text
 * was approved. This seed wrote none, so "Place into filing" refused it
 * (409 SOURCE_NOT_SEALED) and the IND demo journey stopped at its third
 * click. It now seals the document in the router's own approval format
 * (../authoring-seal.mjs); the seed is skipped, not half-applied, when
 * frozen_documents is absent.
 *
 * 2026-09-23 (W5/D7, co-author final pass, repair): the existing-document
 * branch used to return without doing anything. A demo database the previous
 * version of this seed populated (the §17 sandbox, seeded 2026-09-08) holds
 * this APPROVED document with no seal, so re-running the seeds never repaired
 * it and Click 3 stayed 409 SOURCE_NOT_SEALED. That branch now seals it, once,
 * and only when all of these hold: it is APPROVED, there is no
 * frozen_documents row at all for (document, tenant), and its sections are
 * exactly the text this seed wrote (code, title, content, order; the title is
 * matched by the lookup). Otherwise it is left alone — a seal of any shape
 * already present means nothing is added, and changed sections get a warning:
 * a seed never seals text it did not write as approved.
 */
import crypto from 'node:crypto';
import { sealAuthoringDocument } from '../authoring-seal.mjs';

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

/** When the seeded approval happened: the document's updated_at and its seal's frozenAt. */
const APPROVED_AT = new Date('2026-09-01T09:30:00Z');

/** The approval's seal, as the router's approval handlers write it. */
async function sealApproval(client, org, admin, docId, createdBy) {
  const approver = String(admin?.email || createdBy);
  await sealAuthoringDocument(client, {
    docId,
    tenantId: org.id,
    version: 'approved',
    frozenBy: approver,
    reason: 'Approved and frozen',
    frozenAt: APPROVED_AT,
    approvedBy: approver,
  });
}

/**
 * The existing-document branch. Seals the document the previous version of
 * this seed left APPROVED and unsealed; see the 2026-09-23 repair note above.
 */
async function sealIfSeededUnsealed(client, org, admin, doc) {
  const seals = await client.query(
    'SELECT count(*)::int AS n FROM frozen_documents WHERE document_id = $1 AND tenant_id = $2',
    [doc.id, org.id],
  );
  if (Number(seals.rows[0]?.n ?? 0) > 0) {
    console.log(`   ✓ ind authoring doc: already seeded for ${PROGRAM_CODE}`);
    return;
  }
  if (String(doc.status ?? '').toUpperCase() !== 'APPROVED') {
    console.log(`   ✓ ind authoring doc: already seeded for ${PROGRAM_CODE} (status ${doc.status}; not sealed)`);
    return;
  }
  const live = await client.query(
    `SELECT code, title, content, order_index FROM authoring_sections
      WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index, created_at, id`,
    [doc.id, org.id],
  );
  const seeded =
    live.rows.length === SECTIONS.length &&
    live.rows.every(
      (r, i) =>
        r.code === SECTIONS[i].code &&
        r.title === SECTIONS[i].title &&
        r.content === SECTIONS[i].content &&
        Number(r.order_index) === SECTIONS[i].order,
    );
  if (!seeded) {
    console.log(
      `   ⚠ ind authoring doc: ${PROGRAM_CODE} is APPROVED with no seal, but its sections are not the text this seed ` +
        'wrote — not sealed; "Place into filing" will refuse it (SOURCE_NOT_SEALED)',
    );
    return;
  }
  await sealApproval(client, org, admin, doc.id, String(doc.created_by ?? ''));
  console.log(`   ✓ ind authoring doc: already seeded for ${PROGRAM_CODE}; its approval was unsealed — sealed now`);
}

async function has(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS c`, [`public.${table}`]);
  return !!r.rows[0]?.c;
}

export default async function seedIndAuthoringDoc(client, { org, admin }) {
  for (const t of ['authoring_documents', 'authoring_sections', 'regulatory_programs', 'frozen_documents']) {
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
    `SELECT id, status, created_by FROM authoring_documents
      WHERE tenant_id = $1 AND client_program_id = $2 AND title = $3 LIMIT 1`,
    [org.id, program.id, TITLE],
  );
  if (existing.rows.length > 0) {
    await sealIfSeededUnsealed(client, org, admin, existing.rows[0]);
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
  const updated = APPROVED_AT;
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

  await sealApproval(client, org, admin, docId, createdBy);

  console.log(
    `   ✓ ind authoring doc: "${TITLE}" seeded for ${PROGRAM_CODE} (${SECTIONS.length} sections, incl. 3.2.S.4.2; approval sealed)`,
  );
}
