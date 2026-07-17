/**
 * Wave-3 domain seed — NDA/BLA CTD module readiness (BX-204 · NDA 212345).
 *
 * Five per-module completeness roll-ups matching the v2 NdaCockpit fixture, so
 * the "CTD readiness" panel and overall % ready render off real org data.
 * Read by GET /api/nda-cockpit/modules. to_regclass guarded, org-scoped,
 * idempotent (ON CONFLICT DO NOTHING).
 */
const MODULES = [
  { m: '1', label: 'Administrative & prescribing (Module 1)', pct: 78, docs: 14, open: 3, gate: 'Financial disclosure (3454/3455) — 2 investigators outstanding' },
  { m: '2', label: 'CTD summaries (Module 2)', pct: 71, docs: 9, open: 2, gate: '2.5 Clinical Overview in review; 2.7.4 Safety Summary drafting' },
  { m: '3', label: 'Quality / CMC (Module 3)', pct: 84, docs: 31, open: 2, gate: '3.2.S.4.4 comparability vs 3 post-change lots unreconciled' },
  { m: '4', label: 'Nonclinical study reports (Module 4)', pct: 96, docs: 22, open: 0, gate: null },
  { m: '5', label: 'Clinical study reports (Module 5)', pct: 69, docs: 18, open: 3, gate: 'ISS/ISE integrated summaries pending; define.xml validation 1 error' },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_nda_modules') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_nda_modules not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (const mod of MODULES) {
    const r = await client.query(
      `INSERT INTO c2c_nda_modules (organization_id, m, label, pct, docs, open_count, gate)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (organization_id, m) DO NOTHING`,
      [org.id, mod.m, mod.label, mod.pct, mod.docs, mod.open, mod.gate],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ NDA cockpit: ${inserted} CTD module readiness rows seeded`);
}
