/**
 * Wave-3 domain seed — non-US MAA Module-1 assembled components.
 *
 * A realistic mid-assembly state for the v2 MaaCockpit so the readiness view
 * opens with real assembled-vs-missing data (not an empty store) across every
 * market the requirements engine models: EMA (cover letter + eAF + product
 * information; experts / ERA / RMP outstanding), PMDA (application form +
 * package insert), MHRA (cover letter + application form + product information;
 * UK RMP outstanding), Health Canada (cover letter + HC/SC 3011), TGA (cover
 * letter + application form), and NMPA (application form). Read by
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
  // MHRA (UK) — 3 of 4 assembled (UK RMP outstanding).
  { market: 'MHRA', component_code: 'uk_cover_letter' },
  { market: 'MHRA', component_code: 'uk_application_form' },
  { market: 'MHRA', component_code: 'uk_product_information' },
  // Health Canada — 2 of 4 assembled.
  { market: 'HEALTH_CANADA', component_code: 'ca_cover_letter' },
  { market: 'HEALTH_CANADA', component_code: 'ca_hc3011' },
  // TGA (Australia) — 2 of 5 assembled.
  { market: 'TGA', component_code: 'au_cover_letter' },
  { market: 'TGA', component_code: 'au_application_form' },
  // NMPA (China) — 1 of 3 assembled.
  { market: 'NMPA', component_code: 'cn_application_form' },
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
