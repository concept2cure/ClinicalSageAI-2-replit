/**
 * Wave-3 domain seed — safety-narrative SAE case worklist into the REAL store.
 *
 * Three individual SAE cases on the BX-099 / BX-204 oncology programs, in mixed
 * expedited-reporting clocks (FDA 15-day IND safety report; EMA 7-day fatal/life-
 * threatening SUSAR; one expected → no expedited clock), seeded into the REAL,
 * org-scoped pharmacovigilance store (`adverse_events`, migrations/
 * 20260603_pv_operational.sql) — the exact table pharmacovigilanceService writes,
 * and that GET /api/safety-narratives/cases now reads (see server/services/pv/
 * sae-cases-view-assembler.ts). No blob, no fixture.
 *
 * The surface computes each case's 312.32(c)/E2A clock live from the stored facts
 * (report_date = Day-0 awareness + seriousness_criteria + causality + expectedness
 * + outcome), so those are the fields that matter and they are all real columns.
 * Trial demographics the PV intake store does not model (age/sex/arm/first-dose,
 * medical history, con-meds) are intentionally omitted — the surface shows them
 * null-safe. Idempotent, org-scoped, to_regclass-guarded.
 */
const CASES = [
  {
    id: 'ICSR-8841', studyId: 'BX204-301', subjectId: '2041-0087',
    studyDrug: 'BX-099', dose: '200 mg IV every 3 weeks',
    awarenessDate: '2026-07-06', expectedness: 'unexpected',
    term: 'immune-mediated pneumonitis',
    description: 'Grade 3 immune-mediated pneumonitis; CT chest showed bilateral ground-glass opacities, infectious work-up negative. Study drug permanently discontinued; treated with high-dose IV methylprednisolone.',
    seriousnessCriteria: ['hospitalization', 'medically important'], causality: 'possibly related', outcome: 'recovering',
  },
  {
    id: 'ICSR-8839', studyId: 'BX204-301', subjectId: '2041-0112',
    studyDrug: 'BX-099', dose: '200 mg IV every 3 weeks',
    awarenessDate: '2026-07-13', expectedness: 'unexpected',
    term: 'grade 3 infusion-related reaction',
    description: 'Life-threatening grade 3 infusion-related reaction on first dose; infusion interrupted and study drug withheld; treated with IV diphenhydramine, corticosteroids, and fluid resuscitation.',
    seriousnessCriteria: ['life-threatening', 'hospitalization'], causality: 'related', outcome: 'recovered',
  },
  {
    id: 'ICSR-8832', studyId: 'BX204-204', subjectId: '2288-0043',
    studyDrug: 'BX-204', dose: '400 mg orally once daily',
    awarenessDate: '2026-07-10', expectedness: 'expected',
    term: 'hepatic enzyme elevation (ALT >5x ULN)',
    description: 'Grade 3 hepatic enzyme elevation (ALT >5x ULN); no bilirubin elevation, Hy\'s Law criteria not met. Dose interrupted. Listed in the IB (expected).',
    seriousnessCriteria: ['medically important'], causality: 'probably related', outcome: 'recovering',
  },
];

async function has(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS c`, [`public.${table}`]);
  return !!r.rows[0]?.c;
}

export default async function seed(client, { org, admin }) {
  if (!(await has(client, 'adverse_events'))) {
    console.log('   ⚠ adverse_events not found — run migrations first, skipping safety-narrative seed');
    return;
  }
  const u = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 1`,
    [org.id],
  );
  const userId = u.rows[0]?.user_id ?? admin?.id;

  const orgText = String(org.id);
  let inserted = 0;
  for (const c of CASES) {
    const exists = await client.query(
      `SELECT id FROM adverse_events WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      [orgText, c.id],
    );
    if (exists.rows.length > 0) continue;
    const susar = c.expectedness === 'unexpected' && ['related', 'probably related', 'possibly related'].includes(c.causality);
    await client.query(
      `INSERT INTO adverse_events (
         id, organization_id, project_id, event_type, patient_id, event_description,
         report_date, seriousness_criteria, causality, outcome, reporter_type,
         expectedness, reaction_pt, suspect_product, suspect_product_dose,
         expedited_report_required, case_status, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'investigator',$11,$12,$13,$14,$15,'draft',$16)`,
      [
        c.id, orgText, c.studyId, susar ? 'SUSAR' : 'SAE', c.subjectId, c.description,
        c.awarenessDate, JSON.stringify(c.seriousnessCriteria), c.causality, c.outcome,
        c.expectedness, c.term, c.studyDrug, c.dose, susar, userId != null ? String(userId) : null,
      ],
    );
    inserted += 1;
  }
  console.log(`   ✓ safety narrative: ${inserted} SAE case(s) seeded into adverse_events`);
}
