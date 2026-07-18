/**
 * Wave-3 domain seed — BLA 351(a) biologics science-engine assessments.
 *
 * A realistic in-progress set for the NdaCockpit "BLA biologics" tab so it opens
 * with real persisted assessments (not an empty store): the three science
 * engines (analytical similarity, comparability, immunogenicity) plus the
 * RTF/CRL filing-risk profile, all in draft. Read by
 * GET /api/biopharma/bla/assessments; authored/signed by the biologics
 * workbench. to_regclass guarded, org-scoped, idempotent.
 *
 * `verdict` is the denormalized top-line the route computes on write
 * (verdictFor): conclusion for similarity/comparability, risk.tier for
 * immunogenicity, crlRisk for filing_risk. `result` carries the matching field
 * so a re-read stays consistent; it is a compact honest projection, not a full
 * engine run — the workbench recomputes the full result on demand.
 */
const ASSESSMENTS = [
  {
    kind: 'analytical_similarity',
    title: 'BX-204 vs US-licensed reference',
    modality: 'mAb',
    reference_product: 'US-licensed reference',
    target_agency: 'FDA',
    verdict: 'similar',
    result: { conclusion: 'similar' },
  },
  {
    kind: 'comparability',
    title: 'Post-change drug substance (Process C)',
    modality: 'mAb',
    target_agency: 'FDA',
    verdict: 'comparable',
    result: { conclusion: 'comparable' },
  },
  {
    kind: 'immunogenicity',
    title: 'Pivotal ADA / NAb integrated analysis',
    modality: 'mAb',
    target_agency: 'FDA',
    verdict: 'low',
    result: { risk: { tier: 'low' } },
  },
  {
    kind: 'filing_risk',
    title: 'BLA 761xxx filing-risk profile',
    modality: 'mAb',
    target_agency: 'FDA',
    verdict: 'moderate',
    result: { crlRisk: 'moderate' },
  },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_bla_assessments') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_bla_assessments not found — run migrations first, skipping');
    return;
  }
  // Idempotent without a natural key: only seed when this org has no rows yet.
  const existing = await client.query(
    `SELECT 1 FROM c2c_bla_assessments WHERE org_id = $1 LIMIT 1`,
    [org.id],
  );
  if (existing.rowCount) {
    console.log('   ✓ BLA assessments: already present, skipping');
    return;
  }
  let inserted = 0;
  for (const a of ASSESSMENTS) {
    const r = await client.query(
      `INSERT INTO c2c_bla_assessments
         (org_id, kind, title, modality, reference_product, target_agency, status, verdict, input, result, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, '{}'::jsonb, $8::jsonb, $9)`,
      [
        org.id,
        a.kind,
        a.title,
        a.modality,
        a.reference_product ?? null,
        a.target_agency,
        a.verdict,
        JSON.stringify(a.result),
        String(org.id),
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ BLA cockpit: ${inserted} biologics assessment rows seeded`);
}
