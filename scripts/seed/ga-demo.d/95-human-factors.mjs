/**
 * Wave-2 domain seed — human-factors engineering (IEC 62366-1) into the REAL store.
 *
 * The org's HFE/UE file for the BX-204 CGM program (element presence map with
 * realistic gaps) is seeded into the REAL, org-scoped store `hf_engineering_files`
 * (migration 20260801_hf_files_store.sql) — the exact table hf-files-service.ts
 * writes via POST /api/human-factors, and that GET /api/human-factors now reads.
 * No blob: the surface computes element completeness deterministically from
 * `present` on read (never stored).
 *
 * The file's six hazard-related use scenarios (mixed mitigation states) are seeded
 * into the existing wired store c2c_hf_scenarios (its own writer is
 * POST /api/human-factors/scenarios), referencing the new file's id — preserving
 * the demo's use-related risk analysis. to_regclass guarded, org-scoped,
 * idempotent (only seeds when the org has no HFE/UE file yet). created_by resolves
 * from organization_users, falling back to the demo admin.
 */
const SCENARIOS = [
  { task: 'Low-glucose alert response', useError: 'Alert dismissed while asleep — hypoglycemia untreated', sev: 'critical', mit: true },
  { task: 'Sensor insertion', useError: 'Inserter fired at wrong angle — sensor fails to read', sev: 'minor', mit: true },
  { task: 'Result interpretation (trend arrows)', useError: 'Misreading trend arrow — incorrect bolus decision', sev: 'critical', mit: true },
  { task: 'Transmitter pairing', useError: 'Paired to another patient’s receiver in a clinic', sev: 'serious', mit: false },
  { task: 'Calibration entry', useError: 'Fingerstick value entered with decimal shift', sev: 'serious', mit: true },
  { task: 'Adhesive replacement', useError: 'Sensor reattached after partial detachment', sev: 'minor', mit: false },
];

export default async function seed(client, { org, admin }) {
  const t = await client.query(
    `SELECT to_regclass('public.hf_engineering_files') AS f, to_regclass('public.c2c_hf_scenarios') AS s`,
  );
  if (!t.rows[0]?.f) {
    console.log('   ⚠ hf_engineering_files not found — run migrations first, skipping');
    return;
  }
  const existing = await client.query(
    `SELECT 1 FROM hf_engineering_files WHERE organization_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [org.id],
  );
  if (existing.rowCount) {
    console.log('   ✓ human factors: already present, skipping');
    return;
  }
  const u = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 1`,
    [org.id],
  );
  const userId = u.rows[0]?.user_id ?? admin?.id ?? null;

  const present = {
    useSpecification: true,
    userProfiles: true,
    useEnvironments: true,
    userInterfaceCharacteristics: true,
    knownUseProblems: true,
    hazardRelatedUseScenarios: true,
    criticalTasks: true,
    formativeEvaluation: true,
    summativeEvaluation: false,
    hfeUeReport: false,
  };

  const fileRes = await client.query(
    `INSERT INTO hf_engineering_files (organization_id, device, framework, present, created_by)
     VALUES ($1, $2, 'IEC 62366-1', $3::jsonb, $4)
     RETURNING id`,
    [org.id, 'BX-204 CGM — continuous glucose monitor', JSON.stringify(present), userId],
  );
  const fileId = fileRes.rows[0].id;

  let scenarioCount = 0;
  if (t.rows[0]?.s) {
    for (let i = 0; i < SCENARIOS.length; i++) {
      const s = SCENARIOS[i];
      const r = await client.query(
        `INSERT INTO c2c_hf_scenarios (id, organization_id, file_id, task, use_error, potential_harm_severity, mitigated)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (organization_id, id) DO NOTHING`,
        [`hfs-bx204-${i + 1}`, org.id, fileId, s.task, s.useError, s.sev, s.mit],
      );
      scenarioCount += r.rowCount ?? 0;
    }
  } else {
    console.log('   ⚠ c2c_hf_scenarios not found — seeded file only, no use scenarios');
  }
  console.log(`   ✓ human factors: 1 HFE/UE file + ${scenarioCount} use scenario(s) seeded into hf_engineering_files`);
}
