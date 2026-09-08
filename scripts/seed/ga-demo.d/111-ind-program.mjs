/**
 * Domain seed — the demo org's IND programs carry their IND numbers and their
 * canonical submission spine.
 *
 * The GA demo seeds two IND programs — BX-256 (systemic lupus erythematosus)
 * and BX-512 Vorelinib (KIT-mutant GIST) — but
 * `regulatory_programs.application_number` arrived later
 * (migrations/20260907_regulatory_programs_application_number.sql), so neither
 * carries an agency number and the landing honestly says "not assigned".
 *
 * This module gives those two programs their IND numbers so the biotech
 * landing has a seeded IND program to open. It numbers ONLY programs whose
 * program_type is IND and whose number is still null; it never inserts a
 * program and never touches a BLA/NDA/MAA/device program (the GA demo's BX-301
 * is a BLA — its number is a BLA number and is not this module's to invent).
 *
 * Every value the landing shows then comes from the row or its organisation:
 * sponsor = organizations.name, product = product_name, indication =
 * indication, IND number = application_number. The numbers are demo values in
 * the agency's six-digit format, deliberately low so they cannot be read as a
 * live sponsor's, and each echoes the program code so a reader can see they
 * are seeded.
 *
 * It also gives each of those two programs the canonical `submissions` row and
 * the original eCTD sequence 0000 that self-serve intake now creates in the same
 * transaction as the program (routes/c2c/project-intake.ts `ensureSubmissionSpine`).
 * The GA demo seeded these programs before intake did that, so they had a
 * program record and no submission — and every canonical-core surface (the IND
 * checklist, dispatch readiness, the Module 1 forms panel's filing path) reads
 * the submission core. Without the spine the demo's IND programs could be
 * opened but nothing could be filed into them.
 *
 * The submission is linked by the SAME identity convention intake and the
 * checklist assembler use (application type + product_name / title), so it is
 * matched, not duplicated, if one already exists. The sequence is created as
 * `draft` 0000: which sequence a document is filed into is a regulatory
 * decision, and nothing else in the product creates one as a side effect.
 *
 * Idempotent: a program that already carries a number is left exactly as it
 * is, an existing submission is linked rather than replaced, and a submission
 * that already has any sequence is left alone. Org-scoped. Fail-safe: a schema
 * without the column or the table degrades to a warning.
 */
const DEMO_IND_NUMBERS = {
  'BX-256': '000256',
  'BX-512': '000512',
};

/** Does this table exist in the target database? */
async function has(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS c`, [`public.${table}`]);
  return !!r.rows[0]?.c;
}

/**
 * The canonical submission + original sequence for one program, by the identity
 * convention `resolveSubmissionSpine` matches on. Returns a short note for the
 * run log; never throws past the caller's guard.
 */
async function ensureSpine(client, org, userId, program) {
  const identityKeys = [program.product_name, program.name, program.code]
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (identityKeys.length === 0) return 'no identity keys — skipped';

  const existing = await client.query(
    `SELECT id FROM submissions
      WHERE organization_id = $1 AND deleted_at IS NULL
        AND lower(application_type) = 'ind'
        AND (lower(coalesce(product_name, '')) = ANY($2) OR lower(title) = ANY($2))
      ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1`,
    [org.id, identityKeys],
  );
  let submissionId = existing.rows[0]?.id ?? null;
  let created = false;
  if (submissionId == null) {
    const ins = await client.query(
      `INSERT INTO submissions
         (title, product_name, application_type, client_type, primary_region, status, lifecycle_stage, organization_id, created_by)
       VALUES ($1, $2, 'ind', 'biotech', 'fda', 'active', 'original', $3, $4) RETURNING id`,
      [program.name, program.product_name, org.id, userId],
    );
    submissionId = ins.rows[0].id;
    created = true;
  }

  if (!(await has(client, 'ectd_sequences'))) return `submission ${submissionId}${created ? ' (created)' : ''}, no sequence store`;
  const seq = await client.query(
    `SELECT id, sequence_number FROM ectd_sequences
      WHERE submission_id = $1 AND organization_id = $2 AND deleted_at IS NULL
      ORDER BY sequence_number DESC, id DESC LIMIT 1`,
    [submissionId, org.id],
  );
  if (seq.rows[0]) {
    return `submission ${submissionId}${created ? ' (created)' : ''}, sequence ${seq.rows[0].sequence_number} already present`;
  }
  const newSeq = await client.query(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, organization_id, created_by)
     VALUES ($1, 'fda', '0000', 'original', 'draft', $2, $3) RETURNING id`,
    [submissionId, org.id, userId],
  );
  return `submission ${submissionId}${created ? ' (created)' : ''}, sequence 0000 created (${newSeq.rows[0].id})`;
}

export default async function seedIndProgramNumbers(client, { org, admin }) {
  const table = await client.query(`SELECT to_regclass('public.regulatory_programs') AS t`);
  if (!table.rows[0]?.t) {
    console.log('   ⚠ regulatory_programs not found — skipping ind-program seed');
    return;
  }
  const col = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'regulatory_programs' AND column_name = 'application_number'`,
  );
  if (col.rows.length === 0) {
    console.log('   ⚠ regulatory_programs.application_number missing — run migrations first, skipping ind-program seed');
    return;
  }
  // submissions.created_by is NOT NULL and an integer FK to users; a real org
  // member owns the record, falling back to the demo admin the runner provides.
  const u = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 1`,
    [org.id],
  );
  const userId = u.rows[0]?.user_id ?? admin?.id ?? null;
  const canSeedSpine = userId != null && (await has(client, 'submissions'));

  for (const [code, indNumber] of Object.entries(DEMO_IND_NUMBERS)) {
    const r = await client.query(
      `SELECT id, name, code, product_name, application_number, program_type FROM regulatory_programs
        WHERE organization_id = $1 AND code = $2 AND deleted_at IS NULL LIMIT 1`,
      [org.id, code],
    );
    const row = r.rows[0];
    if (!row) { console.log(`   ⚠ ind program ${code}: not seeded by the GA demo — skipping`); continue; }
    if (String(row.program_type).toUpperCase() !== 'IND') {
      console.log(`   ⚠ ind program ${code}: program_type is ${row.program_type}, not IND — left untouched`);
      continue;
    }
    if (row.application_number) {
      console.log(`   ✓ ind program ${code}: already carries ${row.application_number}`);
    } else {
      await client.query(
        `UPDATE regulatory_programs SET application_number = $2, updated_at = NOW() WHERE id = $1`,
        [row.id, indNumber],
      );
      console.log(`   ✓ ind program ${code}: given IND ${indNumber}`);
    }

    if (!canSeedSpine) {
      console.log(`   ⚠ ind program ${code}: no submission store or no org member — spine skipped`);
      continue;
    }
    try {
      console.log(`   ✓ ind program ${code}: ${await ensureSpine(client, org, userId, row)}`);
    } catch (e) {
      // A spine failure degrades this block, exactly as the sibling domain
      // seeds do — it must not abort the whole demo seed run.
      console.log(`   ⚠ ind program ${code}: spine not seeded (${e.message ?? e})`);
    }
  }
}
