/**
 * Wave-2 domain seed — human factors (IEC 62366-1) store.
 *
 * One HFE/UE file for the BX-204 CGM program (element presence map with
 * realistic gaps) plus six hazard-related use scenarios in mixed mitigation
 * states. Read by GET /api/human-factors; the surface computes completeness
 * and use-related risk deterministically from these rows.
 */
export default async function seed(client, { org }) {
  const t = await client.query(
    `SELECT to_regclass('public.c2c_hf_files') AS f, to_regclass('public.c2c_hf_scenarios') AS s`,
  );
  if (!t.rows[0]?.f || !t.rows[0]?.s) {
    console.log('   ⚠ c2c_hf_* not found — run migrations first, skipping');
    return;
  }

  await client.query(
    `INSERT INTO c2c_hf_files (id, organization_id, device, framework, present)
     VALUES ($1, $2, $3, 'IEC 62366-1', $4::jsonb)
     ON CONFLICT (organization_id, id) DO NOTHING`,
    [
      'hf-bx204',
      org.id,
      'BX-204 CGM — continuous glucose monitor',
      JSON.stringify({
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
      }),
    ],
  );

  const scenarios = [
    { id: 'hfs-1', task: 'Low-glucose alert response', useError: 'Alert dismissed while asleep — hypoglycemia untreated', sev: 'critical', mit: true },
    { id: 'hfs-2', task: 'Sensor insertion', useError: 'Inserter fired at wrong angle — sensor fails to read', sev: 'minor', mit: true },
    { id: 'hfs-3', task: 'Result interpretation (trend arrows)', useError: 'Misreading trend arrow — incorrect bolus decision', sev: 'critical', mit: true },
    { id: 'hfs-4', task: 'Transmitter pairing', useError: 'Paired to another patient’s receiver in a clinic', sev: 'serious', mit: false },
    { id: 'hfs-5', task: 'Calibration entry', useError: 'Fingerstick value entered with decimal shift', sev: 'serious', mit: true },
    { id: 'hfs-6', task: 'Adhesive replacement', useError: 'Sensor reattached after partial detachment', sev: 'minor', mit: false },
  ];
  for (const s of scenarios) {
    await client.query(
      `INSERT INTO c2c_hf_scenarios (id, organization_id, file_id, task, use_error, potential_harm_severity, mitigated)
       VALUES ($1, $2, 'hf-bx204', $3, $4, $5, $6)
       ON CONFLICT (organization_id, id) DO NOTHING`,
      [s.id, org.id, s.task, s.useError, s.sev, s.mit],
    );
  }
  console.log('   ✓ human factors: 1 HFE/UE file + 6 use scenarios seeded');
}
