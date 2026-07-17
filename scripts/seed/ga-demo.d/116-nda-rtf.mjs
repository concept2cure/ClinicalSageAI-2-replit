/**
 * Wave-3 domain seed — NDA/BLA Refuse-to-File (RtF) risk log (BX-204 · NDA 212345).
 *
 * The filing-risk items matching the v2 NdaCockpit fixture, so the
 * "Refuse-to-File risk" list renders (and appends) off real org data. Read by
 * GET /api/nda-cockpit/rtf, appended by POST /api/nda-cockpit/rtf. to_regclass
 * guarded, org-scoped, idempotent (ON CONFLICT DO NOTHING). `seq` fixes order.
 */
const RTF_ITEMS = [
  { sev: 'high', area: 'Module 5 · datasets', text: 'define.xml validation error in ADaM ADTTE; FDA may deem the dataset package incomplete at filing.', fix: 'Resolve define.xml + refresh reviewer guide (ADRG)' },
  { sev: 'med', area: 'Module 1 · financial', text: '2 investigators missing 3454/3455 — a common RTF trigger if unresolved.', fix: 'Collect outstanding disclosures or certify due diligence' },
  { sev: 'med', area: 'Module 3 · CMC', text: 'Comparability protocol acceptance criteria unreconciled vs post-change lots.', fix: 'Close 3.2.S.4.4 reconciliation' },
  { sev: 'low', area: 'Module 2 · summaries', text: '2.7.4 Safety Summary still drafting; needed for a complete CTD.', fix: 'Finalize ISS-derived safety summary' },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_nda_rtf') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_nda_rtf not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (let i = 0; i < RTF_ITEMS.length; i++) {
    const d = RTF_ITEMS[i];
    const r = await client.query(
      `INSERT INTO c2c_nda_rtf (organization_id, id, sev, area, text, fix, seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (organization_id, id) DO NOTHING`,
      [org.id, `rtf-${i + 1}`, d.sev, d.area, d.text, d.fix, i],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ NDA cockpit: ${inserted} Refuse-to-File risk rows seeded`);
}
