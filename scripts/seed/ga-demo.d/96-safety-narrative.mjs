/**
 * Wave-3 domain seed — safety-narrative SAE case worklist.
 *
 * Three individual SAE cases on the BX-099 / BX-204 oncology programs, in
 * mixed expedited-reporting clocks (FDA 15-day IND safety report, EMA 7-day
 * fatal/life-threatening SUSAR). Read by GET /api/safety-narratives/cases; the
 * v2 SafetyNarrative surface renders the worklist and runs the deterministic
 * ICH E3 §16 composer over the selected case. Grounded in the app's PV signals
 * — no fabricated patient identity beyond study-subject codes. to_regclass
 * guarded, org-scoped, idempotent (ON CONFLICT DO NOTHING).
 */
const CASES = [
  {
    id: 'ICSR-8841', due: 'Day 15', clock: 'FDA 15-day (IND safety report)', dueDays: 6,
    // Serious + unexpected + suspected, not fatal/life-threatening ⇒ live 15-day clock.
    awarenessDate: '2026-07-06', expectedness: 'unexpected',
    subjectId: '2041-0087', age: 67, sex: 'Female', studyId: 'BX204-301', treatmentArm: 'BX-099 200 mg Q3W',
    studyDrug: 'BX-099', dose: '200 mg IV every 3 weeks', firstDoseDate: '12 Mar 2026',
    medicalHistory: ['stage IIIB non-small-cell lung cancer', 'former smoker (28 pack-years)', 'hypertension'],
    concomitantMeds: ['amlodipine 5 mg daily', 'as-needed acetaminophen'],
    event: {
      term: 'immune-mediated pneumonitis', dayOnStudy: 64, severity: 'grade 3 (severe)',
      seriousnessCriteria: ['hospitalization', 'medically important'], causality: 'possibly related',
      actionTaken: 'study drug permanently discontinued', treatment: 'high-dose IV methylprednisolone 2 mg/kg/day with taper',
      dechallenge: 'positive', outcome: 'recovering',
      notes: 'CT chest showed bilateral ground-glass opacities; infectious work-up was negative.',
    },
  },
  {
    id: 'ICSR-8839', due: 'Day 7', clock: 'EMA 7-day (fatal/life-threatening SUSAR)', dueDays: 2,
    // Serious + unexpected + suspected + life-threatening ⇒ live 7-day clock (urgent).
    awarenessDate: '2026-07-13', expectedness: 'unexpected',
    subjectId: '2041-0112', age: 58, sex: 'Male', studyId: 'BX204-301', treatmentArm: 'BX-099 200 mg Q3W',
    studyDrug: 'BX-099', dose: '200 mg IV every 3 weeks', firstDoseDate: '02 Apr 2026',
    medicalHistory: ['metastatic urothelial carcinoma', 'type 2 diabetes mellitus'],
    concomitantMeds: ['metformin 1000 mg twice daily'],
    event: {
      term: 'grade 3 infusion-related reaction', dayOnStudy: 1, severity: 'grade 3 (severe)',
      seriousnessCriteria: ['life-threatening', 'hospitalization'], causality: 'related',
      actionTaken: 'infusion interrupted; study drug withheld', treatment: 'IV diphenhydramine, corticosteroids, and fluid resuscitation',
      dechallenge: 'positive', rechallenge: 'not done', outcome: 'recovered',
    },
  },
  {
    id: 'ICSR-8832', due: 'Day 15', clock: 'FDA 15-day (IND safety report)', dueDays: 11,
    // Serious + suspected but EXPECTED (listed in the IB) ⇒ no expedited clock ('none').
    awarenessDate: '2026-07-10', expectedness: 'expected',
    subjectId: '2288-0043', age: 61, sex: 'Male', studyId: 'BX204-204', treatmentArm: 'BX-204 rezatinib 400 mg QD',
    studyDrug: 'BX-204', dose: '400 mg orally once daily', firstDoseDate: '18 Feb 2026',
    medicalHistory: ['EGFR-mutant NSCLC'],
    concomitantMeds: [],
    event: {
      term: 'hepatic enzyme elevation (ALT >5x ULN)', dayOnStudy: 42, severity: 'grade 3',
      seriousnessCriteria: ['medically important'], causality: 'probably related',
      actionTaken: 'dose interrupted', outcome: 'recovering',
      notes: 'No bilirubin elevation; Hy\'s Law criteria not met.',
    },
  },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_sae_cases') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_sae_cases not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (const c of CASES) {
    const r = await client.query(
      `INSERT INTO c2c_sae_cases (
         id, organization_id, due, clock, due_days, subject_id, age, sex,
         study_id, treatment_arm, study_drug, dose, first_dose_date,
         medical_history, concomitant_meds, event, awareness_date, expectedness
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14::jsonb, $15::jsonb, $16::jsonb, $17, $18)
       ON CONFLICT (organization_id, id) DO NOTHING`,
      [
        c.id, org.id, c.due, c.clock, c.dueDays, c.subjectId, c.age, c.sex,
        c.studyId, c.treatmentArm, c.studyDrug, c.dose, c.firstDoseDate,
        JSON.stringify(c.medicalHistory), JSON.stringify(c.concomitantMeds), JSON.stringify(c.event),
        c.awarenessDate ?? null, c.expectedness ?? null,
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ safety narrative: ${inserted} SAE cases seeded`);
}
