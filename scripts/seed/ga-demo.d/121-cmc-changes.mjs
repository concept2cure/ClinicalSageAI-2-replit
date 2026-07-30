/**
 * Wave-3 domain seed — post-approval CMC change control into the REAL store.
 *
 * A realistic set of proposed manufacturing/quality changes for the approved
 * portfolio, seeded into the REAL, org-scoped store `cmc_change_controls`
 * (migration 20260730_cmc_change_control_store.sql) — the exact table
 * cmc-change-control-service.ts writes via POST /api/cmc-changes, and that GET
 * /api/cmc-changes now reads. No blob: each row's FDA reporting category + risk band
 * is COMPUTED by the deterministic SUPAC/variations classifier on read (never stored).
 * Rows carry the STRUCTURED change attributes the classifier consumes.
 * to_regclass guarded, org-scoped, idempotent (only seeds when the org has none yet).
 */
const CHANGES = [
  {
    title: 'Bioreactor scale-up 2,000L → 5,000L', area: 'Drug substance', programs: 'BX-099, BX-204',
    dosage_form_family: 'biologic', change_category: 'scale_up', scale_change_factor: 'within_10x',
    affects: 'drug_substance', touches_critical_step: true, has_comparability_data: false,
    status: 'evaluating', description: 'Production bioreactor scale-up from 2,000 L to 5,000 L for the DS process.',
  },
  {
    title: 'Stopper supplier switch', area: 'Drug product', programs: 'BX-099',
    dosage_form_family: 'sterile_injectable', change_category: 'container_closure',
    affects: 'drug_product', touches_critical_step: false, has_comparability_data: true,
    status: 'planned', description: 'Alternate stopper supplier for the DP container-closure system.',
  },
  {
    title: 'Tighten aggregate specification', area: 'Specifications', programs: 'BX-099',
    dosage_form_family: 'biologic', change_category: 'specifications',
    affects: 'drug_product', touches_critical_step: false, has_comparability_data: true,
    status: 'implemented', description: 'Tighten the high-molecular-weight aggregate acceptance criterion.',
  },
];

export default async function seed(client, { org, admin }) {
  const t = await client.query(`SELECT to_regclass('public.cmc_change_controls') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ cmc_change_controls not found — run migrations first, skipping');
    return;
  }
  const existing = await client.query(
    `SELECT 1 FROM cmc_change_controls WHERE organization_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [org.id],
  );
  if (existing.rowCount) {
    console.log('   ✓ CMC changes: already present, skipping');
    return;
  }
  const u = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 1`,
    [org.id],
  );
  const userId = u.rows[0]?.user_id ?? admin?.id ?? null;

  let inserted = 0;
  for (const c of CHANGES) {
    const r = await client.query(
      `INSERT INTO cmc_change_controls
         (organization_id, title, area, programs, dosage_form_family, change_category,
          scale_change_factor, affects, touches_critical_step, has_comparability_data, status, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        org.id, c.title, c.area, c.programs, c.dosage_form_family, c.change_category,
        c.scale_change_factor ?? null, c.affects, c.touches_critical_step, c.has_comparability_data,
        c.status, c.description, userId,
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ CMC change control: ${inserted} proposed-change row(s) seeded into cmc_change_controls`);
}
