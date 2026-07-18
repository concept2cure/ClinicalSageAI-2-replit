/**
 * Wave-3 domain seed — biopharma specialty sub-cards (batch 2).
 *
 * Seeds the three cards that were still static surface fixtures so they open
 * LIVE: pediatric PREA/PIP milestones, orphan Rare-Pediatric-Disease vouchers /
 * grants, and orphan patient-advocacy engagements. Read by
 * GET /api/biopharma/{prea-milestones,orphan-rpd,orphan-advocacy}. to_regclass
 * guarded per table, org-scoped, idempotent (ON CONFLICT DO NOTHING).
 */
const PREA = [
  { id: 'prea-1', product: 'BX-204', milestone: 'Adolescent PK substudy — interim', due: 'Aug 2026' },
  { id: 'prea-2', product: 'BX-420', milestone: 'Juvenile tox study report — final', due: 'Oct 2026' },
  { id: 'prea-3', product: 'BX-301', milestone: 'Cohort C enrollment — first patient in', due: 'Nov 2026' },
];

const RPD = [
  { id: 'rpd-1', product: 'BX-256', kind: 'Rare Pediatric Disease', value: '$100M+', notes: 'Voucher issued at approval, sold 2024', status: 'received' },
  { id: 'rpd-2', product: 'BX-420', kind: 'NIH rare disease grant', value: '$2.4M', notes: '4-yr funded · year 2', status: 'awarded' },
];

const ADV = [
  { id: 'adv-1', product: 'BX-256', org_name: 'RPE65 Foundation', engagement: 'Steering committee · Q monthly' },
  { id: 'adv-2', product: 'BX-301', org_name: 'Multiple Myeloma Research', engagement: 'CAB · biannual' },
  { id: 'adv-3', product: 'BX-115', org_name: 'Childhood Neurology Net', engagement: 'Early dialogue' },
];

async function seedTable(client, org, table, cols, rows) {
  const t = await client.query(`SELECT to_regclass($1) AS c`, [`public.${table}`]);
  if (!t.rows[0]?.c) {
    console.log(`   ⚠ ${table} not found — run migrations first, skipping`);
    return 0;
  }
  const colList = ['organization_id', 'id', ...cols].join(', ');
  let inserted = 0;
  for (const r of rows) {
    const values = [org.id, r.id, ...cols.map((c) => r[c])];
    const params = values.map((_, i) => `$${i + 1}`).join(', ');
    const res = await client.query(
      `INSERT INTO ${table} (${colList}) VALUES (${params})
       ON CONFLICT (organization_id, id) DO NOTHING`,
      values,
    );
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

export default async function seed(client, { org }) {
  const p = await seedTable(client, org, 'biopharma_prea_milestones', ['product', 'milestone', 'due'], PREA);
  const r = await seedTable(client, org, 'biopharma_orphan_rpd', ['product', 'kind', 'value', 'notes', 'status'], RPD);
  const a = await seedTable(client, org, 'biopharma_orphan_advocacy', ['product', 'org_name', 'engagement'], ADV);
  console.log(`   ✓ Specialty sub-cards: ${p} PREA milestone(s), ${r} RPD/grant(s), ${a} advocacy row(s) seeded`);
}
