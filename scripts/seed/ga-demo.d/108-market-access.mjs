/**
 * Wave-3 domain seed — market-access payer/HTA positions into the REAL store.
 *
 * The BX-204 CGM payer/HTA coverage narrative, seeded into the REAL, org-scoped
 * store `market_access_positions` (migration 20260801_market_access_store.sql) —
 * the exact table market-access-service.ts writes via POST /api/market-access,
 * and that GET /api/market-access now reads. No blob: the surface's KPIs and its
 * coding-strategy view are DERIVED from these flat position rows on read (the old
 * c2c_market_access JSONB record — including its dossier/coding lists, which have
 * no real store — is retired). Rows are staggered one minute apart so the
 * newest-first list renders in narrative order (US → UK → DE → FR → JP).
 * to_regclass guarded, org-scoped, idempotent (only seeds when the org has none yet).
 */
const POSITIONS = [
  { market: 'United States', payer: 'CMS -- Medicare', mechanism: 'NCD / LCD', code: 'HCPCS E2103', status: 'covered', note: 'Therapeutic CGM covered; DME benefit category.' },
  { market: 'United States', payer: 'Commercial (UNH · Aetna · Cigna)', mechanism: 'Medical policy', code: 'CPT 95249', status: 'covered', note: 'Coverage with prior auth; A1c + insulin-use criteria.' },
  { market: 'United States', payer: 'Medicaid (state)', mechanism: 'State plan', code: null, status: 'partial', note: 'Coverage varies by state; 32 of 50 cover therapeutic CGM.' },
  { market: 'United Kingdom', payer: 'NHS -- NICE', mechanism: 'HTA appraisal', code: null, status: 'review', note: 'NICE TA in progress; positioned vs Libre 3 on cost-comparability.' },
  { market: 'Germany', payer: 'G-BA / GKV', mechanism: 'NUB / DiGA', code: null, status: 'review', note: 'Benefit assessment pending; PMCF data supports.' },
  { market: 'France', payer: 'HAS / CNEDiMTS', mechanism: 'HTA appraisal', code: null, status: 'planned', note: 'LPPR listing application planned post-CE.' },
  { market: 'Japan', payer: 'MHLW / Chuikyo', mechanism: 'Reimbursement pricing', code: null, status: 'planned', note: 'C2 functional category sought after Shonin.' },
];

export default async function seed(client, { org, admin }) {
  const t = await client.query(`SELECT to_regclass('public.market_access_positions') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ market_access_positions not found — run migrations first, skipping');
    return;
  }
  const existing = await client.query(
    `SELECT 1 FROM market_access_positions WHERE organization_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [org.id],
  );
  if (existing.rowCount) {
    console.log('   ✓ market access: already present, skipping');
    return;
  }
  const u = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 1`,
    [org.id],
  );
  const userId = u.rows[0]?.user_id ?? admin?.id ?? null;

  let inserted = 0;
  for (let i = 0; i < POSITIONS.length; i++) {
    const p = POSITIONS[i];
    const r = await client.query(
      `INSERT INTO market_access_positions
         (organization_id, program, market, payer, mechanism, code, status, note, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               now() - make_interval(mins => $10), now() - make_interval(mins => $10))`,
      [org.id, 'BX-204', p.market, p.payer, p.mechanism, p.code, p.status, p.note, userId, i],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ market access: ${inserted} payer/HTA position row(s) seeded into market_access_positions`);
}
