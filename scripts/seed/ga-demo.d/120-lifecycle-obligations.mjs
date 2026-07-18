/**
 * Wave-3 domain seed — post-approval recurring lifecycle obligations.
 *
 * A realistic recurring-obligation set for the approved lead product (BX-099) so
 * the v2 Lifecycle surface "Renewal cycles" card opens LIVE (region→authority,
 * recurrence→interval, urgency bucket computed by the tested lifecycle composer)
 * instead of falling back to the static fixture. Read by
 * GET /api/lifecycle/renewals (projectRenewalObligations); the full governed
 * CRUD lives at /api/lifecycle. to_regclass guarded, org-scoped, idempotent
 * (only seeds when the org has no obligations yet). created_by is the demo admin.
 */
const OBLIGATIONS = [
  // FDA annual PADER — soonest due.
  { obligation_type: 'annual_report', region: 'fda', classification: 'PADER', title: 'BX-099', due_date: '2026-09-30', recurrence_months: 12 },
  // EU periodic safety report (PSUR) — annual cadence.
  { obligation_type: 'periodic_report', region: 'eu', classification: 'PSUR', title: 'BX-099', due_date: '2026-08-15', recurrence_months: 12 },
  // EMA 5-year marketing-authorisation renewal.
  { obligation_type: 'renewal', region: 'eu', classification: 'Renewal', title: 'BX-099', due_date: '2030-02-14', recurrence_months: 60 },
  // PMDA re-examination (8-year).
  { obligation_type: 'renewal', region: 'jp', classification: 'Re-examination', title: 'BX-099', due_date: '2032-02-14', recurrence_months: 96 },
];

export default async function seed(client, { org, admin }) {
  const t = await client.query(`SELECT to_regclass('public.lifecycle_obligations') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ lifecycle_obligations not found — run migrations first, skipping');
    return;
  }
  if (!admin?.id) {
    console.log('   ⚠ no admin user in seed context — skipping lifecycle obligations');
    return;
  }
  // No natural unique key — only seed when this org has none yet.
  const existing = await client.query(
    `SELECT 1 FROM lifecycle_obligations WHERE organization_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [org.id],
  );
  if (existing.rowCount) {
    console.log('   ✓ Lifecycle obligations: already present, skipping');
    return;
  }
  let inserted = 0;
  for (const o of OBLIGATIONS) {
    const r = await client.query(
      `INSERT INTO lifecycle_obligations
         (organization_id, obligation_type, region, classification, title, status, due_date, recurrence_months, created_by)
       VALUES ($1, $2, $3, $4, $5, 'planned', $6, $7, $8)`,
      [org.id, o.obligation_type, o.region, o.classification, o.title, o.due_date, o.recurrence_months, admin.id],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ Lifecycle: ${inserted} recurring post-approval obligation rows seeded`);
}
