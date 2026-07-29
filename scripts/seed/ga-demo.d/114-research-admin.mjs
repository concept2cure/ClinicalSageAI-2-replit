/**
 * Wave-3 domain seed — research-administration CITI training matrix.
 *
 * The org's study personnel (PI, sub-I, coordinator, biostatistician, attending
 * veterinarian, lab tech) and each person's per-module CITI completion state
 * (Human Subjects, GCP, IACUC, Biosafety/IBC, Conflict of Interest). Read by
 * GET /api/research-admin; the v2 ResearchAdmin surface renders these as the
 * Training-section matrix rows. Mirrors the codebase fixture (PDEV_CITI.personnel)
 * exactly — no fabricated data. The per-module status vector is stored as JSONB
 * and stays aligned to the surface's `trainings` column order. to_regclass
 * guarded, org-scoped, idempotent (ON CONFLICT DO NOTHING).
 */
const PERSONNEL = [
  { id: 'tp1', seq: 1, name: 'Dr. Elena Vasquez', role: 'PI', cells: ['current', 'current', 'n/a', 'n/a', 'current'] },
  { id: 'tp2', seq: 2, name: 'Dr. A. Nwosu', role: 'Sub-I', cells: ['current', 'current', 'n/a', 'n/a', 'expiring'] },
  { id: 'tp3', seq: 3, name: 'M. Delgado, RN', role: 'Coordinator', cells: ['current', 'expiring', 'n/a', 'n/a', 'current'] },
  { id: 'tp4', seq: 4, name: 'S. Okafor', role: 'Biostat', cells: ['current', 'current', 'n/a', 'n/a', 'missing'] },
  { id: 'tp5', seq: 5, name: 'Dr. K. Osei, DVM', role: 'Veterinarian', cells: ['n/a', 'current', 'current', 'current', 'current'] },
  { id: 'tp6', seq: 6, name: 'R. Patel', role: 'Lab tech', cells: ['expired', 'n/a', 'current', 'current', 'missing'] },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_research_admin') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_research_admin not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (const p of PERSONNEL) {
    const r = await client.query(
      `INSERT INTO c2c_research_admin (id, organization_id, seq, name, role, cells)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (organization_id, id) DO NOTHING`,
      [p.id, org.id, p.seq, p.name, p.role, JSON.stringify(p.cells)],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ research admin: ${inserted} CITI training rows seeded`);
}
