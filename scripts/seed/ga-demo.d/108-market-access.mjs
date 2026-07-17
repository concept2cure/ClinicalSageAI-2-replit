/**
 * Wave-3 domain seed — market-access & reimbursement record (BX-204 CGM).
 *
 * One market-access program row mirroring the v2 MarketAccess fixture, so the
 * surface renders the payer-coverage table, value-dossier section list and
 * coding-strategy table off real org data. The three rendered lists are stored
 * as JSONB nested arrays (coverage[], dossier[], coding[]). Read by
 * GET /api/market-access. Grounded in the app's device program — no fabricated
 * data beyond the program code. to_regclass guarded, org-scoped, idempotent
 * (ON CONFLICT DO NOTHING).
 */
const PROGRAMS = [
  {
    program: 'BX-204',
    coverage: [
      { region: 'United States', payer: 'CMS -- Medicare', basis: 'NCD / LCD', code: 'HCPCS E2103', status: 'covered', note: 'Therapeutic CGM covered; DME benefit category.' },
      { region: 'United States', payer: 'Commercial (UNH · Aetna · Cigna)', basis: 'Medical policy', code: 'CPT 95249', status: 'covered', note: 'Coverage with prior auth; A1c + insulin-use criteria.' },
      { region: 'United States', payer: 'Medicaid (state)', basis: 'State plan', code: '--', status: 'partial', note: 'Coverage varies by state; 32 of 50 cover therapeutic CGM.' },
      { region: 'United Kingdom', payer: 'NHS -- NICE', basis: 'HTA appraisal', code: '--', status: 'review', note: 'NICE TA in progress; positioned vs Libre 3 on cost-comparability.' },
      { region: 'Germany', payer: 'G-BA / GKV', basis: 'NUB / DiGA', code: '--', status: 'review', note: 'Benefit assessment pending; PMCF data supports.' },
      { region: 'France', payer: 'HAS / CNEDiMTS', basis: 'HTA appraisal', code: '--', status: 'planned', note: 'LPPR listing application planned post-CE.' },
      { region: 'Japan', payer: 'MHLW / Chuikyo', basis: 'Reimbursement pricing', code: '--', status: 'planned', note: 'C2 functional category sought after Shonin.' },
    ],
    dossier: [
      { n: '1', label: 'Executive value proposition', owner: 'HEOR', st: 'complete', pct: 100 },
      { n: '2', label: 'Disease & unmet-need background', owner: 'Med affairs', st: 'complete', pct: 100 },
      { n: '3', label: 'Clinical evidence summary (MARD, outcomes)', owner: 'Clinical', st: 'review', pct: 80 },
      { n: '4', label: 'Economic model -- budget impact', owner: 'HEOR', st: 'draft', pct: 55, blocker: true },
      { n: '5', label: 'Cost-effectiveness (ICER vs SMBG / Libre 3)', owner: 'HEOR', st: 'draft', pct: 40 },
      { n: '6', label: 'Comparative effectiveness table', owner: 'HEOR', st: 'review', pct: 75 },
    ],
    coding: [
      { code: 'HCPCS E2103', desc: 'Non-adjunctive CGM receiver/monitor', kind: 'Existing', status: 'mapped', note: 'Therapeutic CGM DME code applies.' },
      { code: 'CPT 95249', desc: 'CGM patient-owned -- startup/training', kind: 'Existing', status: 'mapped', note: 'Used for patient-owned device setup.' },
      { code: 'CPT 0XXXT', desc: 'Category III -- predictive-low algorithm', kind: 'New PLA/Cat-III', status: 'pursue', note: 'AnA recommends a Cat-III code application for the predictive feature.' },
    ],
  },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_market_access') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_market_access not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (const p of PROGRAMS) {
    const r = await client.query(
      `INSERT INTO c2c_market_access (organization_id, program, coverage, dossier, coding)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb)
       ON CONFLICT (organization_id, program) DO NOTHING`,
      [org.id, p.program, JSON.stringify(p.coverage), JSON.stringify(p.dossier), JSON.stringify(p.coding)],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ market access: ${inserted} market-access program record(s) seeded`);
}
