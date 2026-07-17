/**
 * Wave-3 domain seed — non-US MAA Module-1 assembled components.
 *
 * A realistic mid-assembly state for the v2 MaaCockpit so the readiness view
 * opens with real assembled-vs-missing data (not an empty store): EMA partway
 * through (cover letter + eAF + product information assembled; experts / ERA /
 * RMP outstanding) and PMDA started (application form + package insert). Read by
 * GET /api/maa-module1/:market, toggled by POST /api/maa-module1/:market.
 * to_regclass guarded, org-scoped, idempotent (ON CONFLICT DO NOTHING).
 */
const ASSEMBLED = [
  // EMA — 3 of 6 assembled.
  { market: 'EMA', component_code: 'eu_cover_letter' },
  { market: 'EMA', component_code: 'eu_eaf' },
  { market: 'EMA', component_code: 'eu_product_information' },
  // PMDA — 2 of 4 assembled.
  { market: 'PMDA', component_code: 'jp_application_form' },
  { market: 'PMDA', component_code: 'jp_product_information' },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_maa_module1_components') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_maa_module1_components not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (const a of ASSEMBLED) {
    const r = await client.query(
      `INSERT INTO c2c_maa_module1_components (organization_id, market, component_code, status)
       VALUES ($1, $2, $3, 'assembled')
       ON CONFLICT (organization_id, market, component_code) DO NOTHING`,
      [org.id, a.market, a.component_code],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ MAA cockpit: ${inserted} non-US Module-1 assembled-component rows seeded`);
}
