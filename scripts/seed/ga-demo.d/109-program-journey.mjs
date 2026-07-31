/**
 * Wave-3 domain seed — program-journey spine (BX-204 · NDA 212345) into the REAL store.
 *
 * One program-journey INSTANCE for the demo org, seeded into the REAL, org-scoped
 * `program_journeys` + `program_journey_stages` tables (migration
 * 20260801_program_journey_store.sql) — the exact tables program-journey-service.ts
 * writes via POST /api/program-journey, and that GET /api/program-journey now reads.
 * No blob: the per-stage overlay is one REAL row per lifecycle stage. The 9-stage
 * lifecycle catalog stays definitional in the surface; only per-org instance state
 * is seeded. to_regclass guarded, org-scoped, idempotent (skips when the org already
 * has a live journey for the segment), created_by resolved from a real org member.
 */
const PROGRAMS = [
  {
    seg: 'pharma', seq: 1,
    code: 'BX-204', name: '', app: 'NDA 212345',
    modality: 'Small molecule · 505(b)(1)',
    indication: 'Oncology · pivotal ORR 38.6%, OS HR 0.62',
    pathway: 'NDA · 505(b)(1)', sponsor: 'Concept2Cure', agency: 'FDA',
    readiness: 88, current: 'review',
    target: { label: 'PDUFA target action', v: '04 Apr 2027', agency: 'FDA · 41 days out' },
    overlay: {
      discovery: ['done', 100], preind: ['done', 100], ind: ['done', 100], clinical: ['done', 100],
      presub: ['done', 100], assemble: ['done', 95], review: ['active', 60],
      approval: ['upcoming', 0], lifecycle: ['upcoming', 0],
    },
    modules: [
      { m: '1', label: 'Administrative', pct: 95, risk: false },
      { m: '2', label: 'CTD summaries', pct: 81, risk: false },
      { m: '3', label: 'CMC', pct: 88, risk: false },
      { m: '4', label: 'Nonclinical reports', pct: 100, risk: false },
      { m: '5', label: 'Clinical reports', pct: 74, risk: true },
    ],
    clock: [
      { l: 'NDA submission filed', day: 'Day 0', date: '04 Jun 2026', st: 'done' },
      { l: 'Filing decision', day: 'Day 74', date: '17 Aug 2026', st: 'done' },
      { l: 'Day-120 safety update', day: 'Day 120', date: '02 Oct 2026', st: 'done' },
      { l: 'Mid-cycle communication', day: '--', date: '15 Dec 2026', st: 'done' },
      { l: 'PDUFA goal date', day: '--', date: '04 Apr 2027', st: 'current' },
    ],
    haqs: [
      { conf: 91, t: 'Pediatric: rationale for the 12--17 age-range exclusion in the pivotal (PRED-PED-01)' },
      { conf: 86, t: 'CMC: comparability protocol for the forthcoming DS supplier change (PRED-CMC-01)' },
      { conf: 72, t: 'Statistical: handling of subjects switching arms in BX204-301 (PRED-STAT-01)' },
    ],
    contra: {
      t: 'Exposure-response narrative', tag: 'err · blocks promotion',
      d: 'Module 2.7.2 PK/PD discussion uses the pre-amendment dose; Module 2.5 efficacy section cites post-amendment exposure. (M2 §2.5.4 · M2 §2.7.2)',
    },
    blockers: [
      { sev: 'high', t: 'Drug substance stability -- 24-month projection', m: 'M3 §3.2.S.7.3', who: 'AR', due: 'Day 9 of 14' },
      { sev: 'med', t: 'Statistical analysis plan -- interim dataset cut', m: 'M5 §5.3.5.1', who: 'BK', due: '2 days' },
      { sev: 'med', t: 'Pediatric assessment waiver justification', m: 'M1 §1.9', who: 'TP', due: 'Next Thu' },
    ],
  },
];

export default async function seed(client, { org, admin }) {
  for (const t of ['program_journeys', 'program_journey_stages']) {
    const r = await client.query(`SELECT to_regclass($1) AS c`, [`public.${t}`]);
    if (!r.rows[0]?.c) {
      console.log(`   ⚠ ${t} not found — run migrations first, skipping program-journey seed`);
      return;
    }
  }
  const u = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 1`,
    [org.id],
  );
  const userId = u.rows[0]?.user_id ?? admin?.id ?? null;

  let inserted = 0;
  for (const p of PROGRAMS) {
    const existing = await client.query(
      `SELECT 1 FROM program_journeys WHERE organization_id = $1 AND seg = $2 AND deleted_at IS NULL LIMIT 1`,
      [org.id, p.seg],
    );
    if (existing.rowCount) continue;

    const parent = await client.query(
      `INSERT INTO program_journeys (
         organization_id, seg, seq, code, name, app, modality, indication, pathway,
         sponsor, agency, readiness, current_stage, target_label, target_value, target_agency,
         modules, clock, haqs, contra, blockers, created_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16,
         $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, $22
       ) RETURNING id`,
      [
        org.id, p.seg, p.seq, p.code, p.name, p.app, p.modality, p.indication, p.pathway,
        p.sponsor, p.agency, p.readiness, p.current,
        p.target?.label ?? null, p.target?.v ?? null, p.target?.agency ?? null,
        JSON.stringify(p.modules), JSON.stringify(p.clock), JSON.stringify(p.haqs),
        JSON.stringify(p.contra), JSON.stringify(p.blockers), userId,
      ],
    );
    const journeyId = parent.rows[0].id;

    // One REAL row per lifecycle stage (the 9-stage vocabulary), from the overlay.
    const STAGES = ['discovery', 'preind', 'ind', 'clinical', 'presub', 'assemble', 'review', 'approval', 'lifecycle'];
    for (const stageId of STAGES) {
      const entry = p.overlay?.[stageId] ?? ['upcoming', 0];
      await client.query(
        `INSERT INTO program_journey_stages (organization_id, journey_id, stage_id, status, pct)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (journey_id, stage_id) DO NOTHING`,
        [org.id, journeyId, stageId, entry[0], entry[1] ?? 0],
      );
    }
    inserted += 1;
  }
  console.log(`   ✓ program journey: ${inserted} journey(s) seeded into program_journeys (+ 9 stage rows each)`);
}
