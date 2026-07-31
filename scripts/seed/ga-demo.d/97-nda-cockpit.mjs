/**
 * Wave-3 domain seed — NDA/BLA CTD module readiness (BX-204 · NDA 212345) into
 * the REAL store.
 *
 * Seeds the demo org's NDA (BX-204, a 505(b)(1) small-molecule NDA) into the
 * canonical, org-scoped eCTD submission core — submissions + ectd_sequences +
 * submission_leaves + coauthor_documents — the exact tables the submission
 * service and the eCTD co-authoring flow write, and that GET
 * /api/nda-cockpit/modules now reads (see
 * server/services/nda/nda-modules-view-assembler.ts). No blob, no fixture: this
 * is a real NDA a user could have authored, with real per-section authoring
 * status; the CTD-readiness roll-up (M1–M5 pct / docs / open / gate) is DERIVED
 * from these statuses, not stored. The c2c_nda_modules blob is no longer written.
 *
 * The full linkage is seeded (submission → sequence → leaf → coauthor doc) so the
 * demo renders through the same placed-leaf path a live tenant's filing uses.
 * Each coauthor status is the real, coarse authoring vocabulary
 * (draft / review / approved / finalized) the assembler maps to readiness.
 * Idempotent (skips when the NDA already exists for the org), org-scoped,
 * created_by resolved from a real org member, and each block is to_regclass-guarded
 * + fail-safe so a schema drift degrades that block rather than aborting the run.
 */

// [eCTD section code, blueprint title, coauthor authoring status] across CTD
// Modules 1–5. The assembler rolls these up per module: docs = sections here,
// open = those not approved/finalized, pct = complete/total, gate = the least-
// advanced open section. No two rows share a section code (dedupe would merge).
const NDA_DOCS = [
  // Module 1 — Administrative & prescribing (80% · Financial Disclosure open)
  ['m1.1', 'Form FDA 356h (Application to Market a New Drug)', 'approved'],
  ['m1.2', 'Cover Letter', 'approved'],
  ['m1.3.1', 'Field Copy Certification', 'approved'],
  ['m1.4.3', 'Application User Fee Cover Sheet (Form FDA 3397)', 'approved'],
  ['m1.12.14', 'Financial Disclosure (Forms FDA 3454 / 3455)', 'draft'],
  // Module 2 — CTD summaries (~71% · Clinical Overview in review, Safety Summary drafting)
  ['m2.2', 'Introduction', 'approved'],
  ['m2.3', 'Quality Overall Summary', 'approved'],
  ['m2.4', 'Nonclinical Overview', 'approved'],
  ['m2.5', 'Clinical Overview', 'review'],
  ['m2.6', 'Nonclinical Written and Tabulated Summaries', 'approved'],
  ['m2.7.3', 'Summary of Clinical Efficacy', 'approved'],
  ['m2.7.4', 'Summary of Clinical Safety', 'draft'],
  // Module 3 — Quality / CMC (~83% · comparability unreconciled)
  ['m3.2.S.2', 'Manufacture (Drug Substance)', 'approved'],
  ['m3.2.S.4', 'Control of Drug Substance', 'approved'],
  ['m3.2.S.4.4', 'Justification of Specification / Comparability (post-change lots)', 'draft'],
  ['m3.2.S.7', 'Stability (Drug Substance)', 'approved'],
  ['m3.2.P.3', 'Manufacture (Drug Product)', 'approved'],
  ['m3.2.P.8', 'Stability (Drug Product)', 'approved'],
  // Module 4 — Nonclinical study reports (100% · complete)
  ['m4.2.1', 'Pharmacology Study Reports', 'approved'],
  ['m4.2.2', 'Pharmacokinetic Study Reports', 'approved'],
  ['m4.2.3', 'Toxicology Study Reports', 'approved'],
  // Module 5 — Clinical study reports (~71% · ISS drafting, ISE in review)
  ['m5.2', 'Tabular Listing of All Clinical Studies', 'approved'],
  ['m5.3.1', 'Reports of Biopharmaceutic Studies', 'approved'],
  ['m5.3.5.1', 'Controlled Clinical Study Report (Study 301)', 'approved'],
  ['m5.3.5.2', 'Uncontrolled Clinical Study Report (Study 302)', 'approved'],
  ['m5.3.5.3', 'Integrated Summary of Safety (ISS)', 'draft'],
  ['m5.3.5.4', 'Integrated Summary of Efficacy (ISE)', 'review'],
  ['m5.3.7', 'Case Report Forms and Individual Patient Listings', 'approved'],
];

async function has(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS c`, [`public.${table}`]);
  return !!r.rows[0]?.c;
}

export default async function seed(client, { org, admin }) {
  for (const t of ['submissions', 'coauthor_documents', 'ectd_sequences', 'submission_leaves']) {
    if (!(await has(client, t))) {
      console.log(`   ⚠ ${t} not found — run migrations first, skipping nda-cockpit seed`);
      return;
    }
  }

  // A real org member owns the records (submissions.created_by is NOT NULL, integer
  // FK to users); fall back to the demo admin the runner provides.
  const u = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 1`,
    [org.id],
  );
  const userId = u.rows[0]?.user_id ?? admin?.id;
  if (!userId) {
    console.log('   ⚠ no org member to own the NDA — skipping nda-cockpit seed');
    return;
  }

  const exists = await client.query(
    `SELECT id FROM submissions
      WHERE organization_id = $1 AND lower(application_type) = 'nda'
        AND product_name = 'BX-204' AND deleted_at IS NULL LIMIT 1`,
    [org.id],
  );
  if (exists.rows.length > 0) {
    console.log('   ✓ nda cockpit: already seeded');
    return;
  }

  const sub = await client.query(
    `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, status, lifecycle_stage, organization_id, created_by)
     VALUES ($1, 'BX-204', 'nda', 'pharma', 'fda', 'active', 'original', $2, $3) RETURNING id`,
    ['BX-204 (NDA 212345 · 505(b)(1))', org.id, userId],
  );
  const submissionId = Number(sub.rows[0].id);

  const guard = async (label, fn) => {
    try { await fn(); } catch (e) { console.log(`   ⚠ nda-cockpit ${label}: ${e.message ?? e}`); }
  };

  let sequenceId = null;
  await guard('sequence', async () => {
    const seq = await client.query(
      `INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, organization_id, created_by)
       VALUES ($1, 'fda', '0000', 'original', 'assembling', $2, $3) RETURNING id`,
      [submissionId, org.id, userId],
    );
    sequenceId = Number(seq.rows[0].id);
  });

  await guard('coauthor-documents + leaves', async () => {
    for (const [code, title, status] of NDA_DOCS) {
      const doc = await client.query(
        `INSERT INTO coauthor_documents (organization_id, title, status, module_number, module_name, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [org.id, title, status, code, title, String(userId)],
      );
      const docId = Number(doc.rows[0].id);
      if (sequenceId != null) {
        await client.query(
          `INSERT INTO submission_leaves (sequence_id, section_code, title, granularity, lifecycle_op, document_table, document_id, organization_id, created_by)
           VALUES ($1, $2, $3, 'leaf', 'new', 'coauthor_documents', $4, $5, $6)`,
          [sequenceId, code, title, docId, org.id, userId],
        );
      }
    }
  });

  console.log(`   ✓ nda cockpit: 1 real NDA seeded (submission ${submissionId}: ${NDA_DOCS.length} coauthor sections + leaves)`);
}
