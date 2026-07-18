/**
 * Wave-3 domain seed — post-approval CMC change control.
 *
 * A realistic set of proposed manufacturing/quality changes for the approved
 * portfolio so the v2 Lifecycle "CMC change control" card opens LIVE (each row's
 * FDA reporting category + risk band COMPUTED by the deterministic SUPAC/variations
 * classifier on read, not stored). Read by GET /api/cmc-changes
 * (projectCmcChanges → classifyVariation). Rows carry the STRUCTURED change
 * attributes the classifier consumes. to_regclass guarded, org-scoped, idempotent
 * (only seeds when the org has none yet).
 */
const CHANGES = [
  {
    title: 'Bioreactor scale-up 2,000L → 5,000L',
    area: 'Drug substance',
    programs: 'BX-099, BX-204',
    dosage_form_family: 'biologic',
    change_category: 'scale_up',
    scale_change_factor: 'within_10x',
    affects: 'drug_substance',
    touches_critical_step: true,
    has_comparability_data: false,
    status: 'evaluating',
    description: 'Production bioreactor scale-up from 2,000 L to 5,000 L for the DS process.',
  },
  {
    title: 'Stopper supplier switch',
    area: 'Drug product',
    programs: 'BX-099',
    dosage_form_family: 'sterile_injectable',
    change_category: 'container_closure',
    affects: 'drug_product',
    touches_critical_step: false,
    has_comparability_data: true,
    status: 'planned',
    description: 'Alternate stopper supplier for the DP container-closure system.',
  },
  {
    title: 'Tighten aggregate specification',
    area: 'Specifications',
    programs: 'BX-099',
    dosage_form_family: 'biologic',
    change_category: 'specifications',
    affects: 'drug_product',
    touches_critical_step: false,
    has_comparability_data: true,
    status: 'implemented',
    description: 'Tighten the high-molecular-weight aggregate acceptance criterion.',
  },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_cmc_changes') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_cmc_changes not found — run migrations first, skipping');
    return;
  }
  const existing = await client.query(
    `SELECT 1 FROM c2c_cmc_changes WHERE organization_id = $1 LIMIT 1`,
    [org.id],
  );
  if (existing.rowCount) {
    console.log('   ✓ CMC changes: already present, skipping');
    return;
  }
  let inserted = 0;
  for (const c of CHANGES) {
    const r = await client.query(
      `INSERT INTO c2c_cmc_changes
         (organization_id, title, area, programs, dosage_form_family, change_category,
          scale_change_factor, affects, touches_critical_step, has_comparability_data, status, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        org.id, c.title, c.area, c.programs, c.dosage_form_family, c.change_category,
        c.scale_change_factor ?? null, c.affects, c.touches_critical_step, c.has_comparability_data,
        c.status, c.description,
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ CMC change control: ${inserted} proposed-change rows seeded`);
}
