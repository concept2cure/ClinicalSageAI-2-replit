/**
 * Domain seed — the demo org's IND programs carry their IND numbers.
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
 * Idempotent: a program that already carries a number is left exactly as it
 * is. Org-scoped. Fail-safe: a schema without the column degrades to a warning.
 */
const DEMO_IND_NUMBERS = {
  'BX-256': '000256',
  'BX-512': '000512',
};

export default async function seedIndProgramNumbers(client, { org }) {
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
  for (const [code, indNumber] of Object.entries(DEMO_IND_NUMBERS)) {
    const r = await client.query(
      `SELECT id, application_number, program_type FROM regulatory_programs
        WHERE organization_id = $1 AND code = $2 AND deleted_at IS NULL LIMIT 1`,
      [org.id, code],
    );
    const row = r.rows[0];
    if (!row) { console.log(`   ⚠ ind program ${code}: not seeded by the GA demo — skipping`); continue; }
    if (String(row.program_type).toUpperCase() !== 'IND') {
      console.log(`   ⚠ ind program ${code}: program_type is ${row.program_type}, not IND — left untouched`);
      continue;
    }
    if (row.application_number) { console.log(`   ✓ ind program ${code}: already carries ${row.application_number}`); continue; }
    await client.query(
      `UPDATE regulatory_programs SET application_number = $2, updated_at = NOW() WHERE id = $1`,
      [row.id, indNumber],
    );
    console.log(`   ✓ ind program ${code}: given IND ${indNumber}`);
  }
}
