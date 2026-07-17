/**
 * Wave-3 domain seed — CTD / eCTD dossier module map (BX-204 · BLA 761xyz).
 *
 * Five per-module map rows mirroring the v2 DossierMap fixture (DOSSIER), so the
 * module-map grid renders each module's completeness, readiness tone, and child
 * CTD sections off real org data. Read by GET /api/dossier-map. Distinct from
 * the /api/dossier-readiness artifact roll-up. to_regclass guarded, org-scoped,
 * idempotent (ON CONFLICT DO NOTHING).
 */
const MODULES = [
  { m: '1', label: 'Administrative & prescribing', pct: 92, tone: 'ok', sections: ['1.1 Forms', '1.3 Labeling', '1.14 Meeting'] },
  { m: '2', label: 'CTD summaries', pct: 64, tone: 'warn', sections: ['2.3 QOS', '2.4 Nonclinical', '2.5 Clinical', '2.7 Summary'] },
  { m: '3', label: 'Quality', pct: 58, tone: 'warn', sections: ['3.2.S Substance', '3.2.P Product', '3.2.R Regional'] },
  { m: '4', label: 'Nonclinical reports', pct: 100, tone: 'ok', sections: ['4.2.1 Pharmacology', '4.2.3 Toxicology'] },
  { m: '5', label: 'Clinical reports', pct: 71, tone: 'warn', sections: ['5.3.1 Biopharm', '5.3.5 Efficacy/safety'] },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_dossier_map') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_dossier_map not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (const mod of MODULES) {
    const r = await client.query(
      `INSERT INTO c2c_dossier_map (organization_id, m, label, pct, tone, sections)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (organization_id, m) DO NOTHING`,
      [org.id, mod.m, mod.label, mod.pct, mod.tone, JSON.stringify(mod.sections)],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ dossier map: ${inserted} CTD module-map rows seeded`);
}
