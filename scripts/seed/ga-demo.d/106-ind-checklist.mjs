/**
 * Wave-3 domain seed — IND lifecycle (BX-301 initial IND) into the REAL store.
 *
 * Seeds the demo org's initial IND (BX-301, an anti-BCMA mAb in R/R multiple
 * myeloma) into the canonical, org-scoped eCTD submission core — submissions +
 * ectd_sequences + submission_leaves + coauthor_documents — the exact tables the
 * submission service and the eCTD co-authoring flow write, and that GET
 * /api/ind-checklist now reads (see server/services/ind-lifecycle/
 * ind-checklist-view-assembler.ts). No blob, no fixture: this is a real IND a
 * user could have authored, with real per-section authoring status.
 *
 * The full linkage is seeded (submission → sequence → leaf → coauthor doc) so the
 * demo renders through the same placed-leaf path a live tenant's filing uses.
 * Each coauthor status is the real, coarse authoring vocabulary
 * (draft / review / approved / finalized) the surface maps to its section status.
 * Idempotent (skips when the IND already exists for the org), org-scoped,
 * created_by resolved from a real org member, and each block is to_regclass-guarded
 * + fail-safe so a schema drift degrades that block rather than aborting the run.
 */

// [eCTD section code, blueprint title, coauthor authoring status]. The three
// Module-1 forms (m1.1.1/.2/.3) are rendered as the 1571/1572/3674 forms checklist;
// the rest are the eCTD sections the surface tracks.
const FORM_DOCS = [
  ['m1.1.1', 'Form FDA 1571', 'approved'],   // 1571 — complete
  ['m1.1.2', 'Form FDA 1572', 'approved'],   // 1572 — complete
  ['m1.1.3', 'Form FDA 3674', 'draft'],      // 3674 — still open
];
const SECTION_DOCS = [
  ['m1.2', 'Cover Letter', 'finalized'],
  ['m1.3.3', 'Debarment Certification', 'approved'],
  ['m1.5', 'Table of Contents', 'approved'],
  ['m1.6.1', 'Introductory Statement', 'approved'],
  ['m1.6.2', 'General Investigational Plan', 'review'],
  ['m1.7', "Investigator's Brochure", 'draft'],
  ['m1.9', 'Environmental Assessment or Claim of Categorical Exclusion', 'approved'],
  ['m2.3', 'Quality Overall Summary', 'approved'],
  ['m2.4', 'Nonclinical Overview', 'review'],
  ['m2.6', 'Nonclinical Written and Tabulated Summaries', 'approved'],
  ['m3.2.S.2', 'Manufacture', 'approved'],
  ['m3.2.S.4', 'Control of Drug Substance', 'approved'],
  ['m3.2.S.7', 'Stability', 'draft'],
  ['m3.2.P.3', 'Manufacture', 'approved'],
  ['m3.2.P.8', 'Stability', 'draft'],
  ['m4.2.1', 'Pharmacology', 'approved'],
  ['m4.2.2', 'Pharmacokinetics', 'approved'],
];
const ALL_DOCS = [...FORM_DOCS, ...SECTION_DOCS];

async function has(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS c`, [`public.${table}`]);
  return !!r.rows[0]?.c;
}

export default async function seed(client, { org, admin }) {
  for (const t of ['submissions', 'coauthor_documents', 'ectd_sequences', 'submission_leaves']) {
    if (!(await has(client, t))) {
      console.log(`   ⚠ ${t} not found — run migrations first, skipping ind-checklist seed`);
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
    console.log('   ⚠ no org member to own the IND — skipping ind-checklist seed');
    return;
  }

  const exists = await client.query(
    `SELECT id FROM submissions
      WHERE organization_id = $1 AND lower(application_type) = 'ind'
        AND product_name = 'BX-301' AND deleted_at IS NULL LIMIT 1`,
    [org.id],
  );
  if (exists.rows.length > 0) {
    console.log('   ✓ ind checklist: already seeded');
    return;
  }

  const sub = await client.query(
    `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, status, lifecycle_stage, organization_id, created_by)
     VALUES ($1, 'BX-301', 'ind', 'biotech', 'fda', 'active', 'original', $2, $3) RETURNING id`,
    ['BX-301 (anti-BCMA mAb)', org.id, userId],
  );
  const submissionId = Number(sub.rows[0].id);

  const guard = async (label, fn) => {
    try { await fn(); } catch (e) { console.log(`   ⚠ ind-checklist ${label}: ${e.message ?? e}`); }
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
    for (const [code, title, status] of ALL_DOCS) {
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

  console.log(`   ✓ ind checklist: 1 real IND seeded (submission ${submissionId}: ${ALL_DOCS.length} coauthor sections + leaves)`);
}
