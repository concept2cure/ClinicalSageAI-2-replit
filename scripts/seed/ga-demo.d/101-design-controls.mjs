/**
 * Wave-3 domain seed — design-controls DHF traceability worklist.
 *
 * Seven 21 CFR 820.30(c) design inputs for the BX-204 CGM device program,
 * each carrying its linked design outputs, verification and validation state,
 * so the traceability matrix rehydrates with real gaps (a pending
 * biocompatibility verification, an untraced functional requirement). Read by
 * GET /api/design-controls; the v2 DesignControls surface renders the
 * input → output → verification → validation matrix and derives the 820.30
 * completeness roll-up client-side. Mirrors the surface fixture; grounded in
 * the BX-204 continuous-glucose-monitor device program. to_regclass guarded,
 * org-scoped, idempotent (ON CONFLICT DO NOTHING).
 */
const INPUTS = [
  { id: 'DI-01', cat: 'intended_use', req: 'Continuously measure interstitial glucose over a 14-day wear period.', riskRef: 'HZ-01',
    outputs: [{ id: 'DO-01', desc: 'Sensor + algorithm spec, 14-day claim' }], ver: 'pass', verRef: 'V&V-114 accuracy', val: 'pass', valRef: 'HF summative' },
  { id: 'DI-02', cat: 'performance', req: 'MARD <= 10% across the glycemic range vs. YSI reference.', riskRef: 'HZ-01',
    outputs: [{ id: 'DO-02', desc: 'Accuracy algorithm; calibration model' }], ver: 'pass', verRef: 'V&V-114 MARD 8.2%', val: 'pass', valRef: 'Pivotal accuracy study' },
  { id: 'DI-03', cat: 'safety', req: 'No therapy decision on a single erroneous low reading.', riskRef: 'HZ-01',
    outputs: [{ id: 'DO-03', desc: 'Dual-sensor cross-check; alert logic' }], ver: 'pass', verRef: 'V&V-118 alert logic', val: 'pending', valRef: 'HF validation open' },
  { id: 'DI-04', cat: 'usability', req: 'Applicator usable by an untrained lay user without injury.', riskRef: 'HZ-02',
    outputs: [{ id: 'DO-04', desc: 'One-press applicator; IFU' }], ver: 'pass', verRef: 'V&V-121 wear study', val: 'pending', valRef: 'Summative HF not prod-equiv' },
  { id: 'DI-05', cat: 'interface', req: 'Secure BLE pairing; encrypted telemetry to the reader app.', riskRef: 'HZ-03',
    outputs: [{ id: 'DO-05', desc: 'AES-128 link; authenticated pairing' }], ver: 'pass', verRef: 'Pen-test PT-09', val: 'pass', valRef: 'Cybersecurity validation' },
  { id: 'DI-06', cat: 'regulatory', req: 'ISO 10993 biocompatibility for a 14-day skin-contact device.', riskRef: 'HZ-04',
    outputs: [{ id: 'DO-06', desc: 'Materials selection; adhesive' }], ver: 'pending', verRef: 'ISO 10993-11 pending', val: null, valRef: null },
  { id: 'DI-07', cat: 'functional', req: 'Report a reading every 5 minutes with < 0.5% data loss.', riskRef: null,
    outputs: [], ver: null, verRef: null, val: null, valRef: null },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_design_controls') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_design_controls not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (const d of INPUTS) {
    const r = await client.query(
      `INSERT INTO c2c_design_controls (
         id, organization_id, cat, req, risk_ref, outputs, ver, ver_ref, val, val_ref
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
       ON CONFLICT (organization_id, id) DO NOTHING`,
      [
        d.id, org.id, d.cat, d.req, d.riskRef, JSON.stringify(d.outputs),
        d.ver, d.verRef, d.val, d.valRef,
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ design controls: ${inserted} design inputs seeded`);
}
