/**
 * Wave-3 domain seed — EU SmPC (QRD) section authoring state.
 *
 * A realistic mid-authoring SmPC so the v2 SmpcLabeling surface opens with real
 * per-section status (front sections final, clinical particulars in draft/review,
 * pharmaceutical particulars still missing) instead of an empty store. Read by
 * GET /api/labeling-smpc, advanced by POST /api/labeling-smpc. to_regclass
 * guarded, org-scoped, idempotent (ON CONFLICT DO NOTHING).
 */
const SECTIONS = [
  ['1', 'final'], ['2', 'final'], ['3', 'final'],
  ['4.1', 'review'], ['4.2', 'draft'], ['4.3', 'draft'], ['4.4', 'draft'], ['4.8', 'draft'],
  ['5.1', 'draft'], ['5.3', 'draft'],
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_smpc_sections') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_smpc_sections not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (const [section_number, status] of SECTIONS) {
    const r = await client.query(
      `INSERT INTO c2c_smpc_sections (organization_id, section_number, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, section_number) DO NOTHING`,
      [org.id, section_number, status],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ EU SmPC: ${inserted} QRD section status rows seeded`);
}
