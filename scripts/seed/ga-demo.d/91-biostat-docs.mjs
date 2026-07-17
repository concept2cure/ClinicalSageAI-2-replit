/**
 * 91-biostat-docs.mjs — GA demo seed: Biostatistics store for the Phase 11
 * Intelligence · Biostatistics surface.
 *
 * Fills the three sections GET /api/intelligence/biostat serves from the
 * org-scoped c2c_biostat_* store (server/routes/intelligence-cluster.ts):
 *
 *   c2c_biostat_saps          → out.saps        (SAP documents table)
 *   c2c_biostat_sample_sizes  → out.sampleSize  (is_primary row → calculator card)
 *   c2c_biostat_interims      → out.interims    (pre-planned DSMB analyses)
 *
 * The fourth section, tlfQueue, is seeded elsewhere (80-programs-tlf-pdev.mjs
 * over c2c_tlf_builds) and is untouched here.
 *
 * READ CONTRACT (authoritative for column / alias / ordering choices) —
 * server/routes/intelligence-cluster.ts biostat handler:
 *   saps        WHERE organization_id = $org ORDER BY updated_at DESC
 *               (primary_endpoint AS primary; updated = locked ? 'locked' :
 *                relative "N ago" from updated_at)
 *   sampleSize  WHERE organization_id = $org ORDER BY is_primary DESC, id ASC LIMIT 1
 *               (alpha/power/delta/sd/expected numeric-coerced)
 *   interims    WHERE organization_id = $org ORDER BY sort_order ASC, analysis_date ASC
 *               (analysis_date → to_char YYYY-MM-DD)
 *
 * Program-consistent with the established demo universe:
 *   BX-099 (gMG · MAA/EMA) and BX-301 (PNH · BLA/FDA) — the clinical-stage
 *   biopharma programs that also carry the live tlfQueue TLF builds
 *   (80-programs-tlf-pdev.mjs); BX-256 (SLE · IND); BX-204 (CGM device
 *   accuracy study, 10-risk.mjs). SAP owner is Michael Brown, the demo team's
 *   biostatistician (scripts/seed-ga-demo.mjs).
 *
 * Org-scoped (organization_id), FK-free, idempotent via
 * ON CONFLICT (organization_id, id) DO NOTHING. to_regclass-guarded per table
 * so a DB migrated without db/migrations/20260717_biostat_docs.sql degrades to
 * a skip rather than aborting the orchestrator transaction.
 */

async function tableExists(client, table) {
  const { rows } = await client.query('SELECT to_regclass($1) AS t', [`public.${table}`]);
  return Boolean(rows[0]?.t);
}

/* Statistical analysis plans. updatedHoursAgo drives updated_at (relative
   label computed on read); locked → the surface renders 'locked'. */
const SAPS = [
  {
    id: 'SAP-BX099-301-v2.1', program: 'BX-099', study: 'BX099-301',
    primary: 'MG-ADL change from baseline @ 26w', alpha: '0.025 1-sided', power: '90%',
    size: '480 (240/240)', status: 'review', owner: 'Michael Brown',
    updatedHoursAgo: 2, locked: false,
  },
  {
    id: 'SAP-BX204-PIV-v2.0', program: 'BX-204', study: 'BX204-PIV',
    primary: '%20/20 agreement vs YSI reference', alpha: '0.05 2-sided', power: '90%',
    size: '160 (paired)', status: 'review', owner: 'Michael Brown',
    updatedHoursAgo: 5, locked: false,
  },
  {
    id: 'SAP-BX256-201-v1.2', program: 'BX-256', study: 'BX256-201',
    primary: 'SRI-4 response @ 52w', alpha: '0.05 2-sided', power: '80%',
    size: '240 (1:1:1)', status: 'drafted', owner: 'Michael Brown',
    updatedHoursAgo: 24, locked: false,
  },
  {
    id: 'SAP-BX099-302-v1.0', program: 'BX-099', study: 'BX099-302',
    primary: 'QMG responder rate @ 52w (descriptive)', alpha: 'n/a', power: 'n/a',
    size: '120 (OLE)', status: 'drafted', owner: 'Michael Brown',
    updatedHoursAgo: 72, locked: false,
  },
  {
    id: 'SAP-BX301-201-v3.0', program: 'BX-301', study: 'BX301-201',
    primary: 'LDH normalization @ 26w', alpha: '0.025 1-sided', power: '90%',
    size: '120 (60/60)', status: 'approved', owner: 'Michael Brown',
    updatedHoursAgo: 624, locked: true,
  },
];

/* Sample-size scenarios. The is_primary row (BX099-301) is the calculator
   card's default — its 480 (240/240) design matches the SAP above. */
const SAMPLE_SIZES = [
  {
    id: 'ss-bx099-301', study: 'BX099-301', label: 'MG-ADL change @ 26w (primary)',
    alpha: 0.025, power: 0.90, delta: 1.8, sd: 5.5, expected: 480, isPrimary: true,
  },
  {
    id: 'ss-bx301-201', study: 'BX301-201', label: 'LDH normalization @ 26w',
    alpha: 0.025, power: 0.90, delta: 0.25, sd: 0.45, expected: 120, isPrimary: false,
  },
  {
    id: 'ss-bx256-201', study: 'BX256-201', label: 'SRI-4 response @ 52w',
    alpha: 0.05, power: 0.80, delta: 0.18, sd: 0.48, expected: 240, isPrimary: false,
  },
];

/* Pre-planned interim analyses (DSMB). analysis_date = CURRENT_DATE + days so
   the dates stay near-future as the demo ages. */
const INTERIMS = [
  {
    id: 'ia-bx099-301-fut', study: 'BX099-301', kind: 'Futility',
    dsmb: 'Pre-planned @ 40% events (DSMB)', daysFromNow: 60, order: 1,
  },
  {
    id: 'ia-bx301-201-eff', study: 'BX301-201', kind: 'Efficacy',
    dsmb: 'Pre-planned @ 50% events (DSMB)', daysFromNow: 136, order: 2,
  },
  {
    id: 'ia-bx256-201-safety', study: 'BX256-201', kind: 'Safety run-in',
    dsmb: 'After 30 enrolled (DSMB)', daysFromNow: 34, order: 3,
  },
];

export default async function seed(client, { org }) {
  // ── SAP documents ──
  if (await tableExists(client, 'c2c_biostat_saps')) {
    let inserted = 0;
    for (const s of SAPS) {
      const r = await client.query(
        `INSERT INTO c2c_biostat_saps
           (id, organization_id, program, study, primary_endpoint, alpha, power,
            size, status, owner, locked, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 NOW() - ($12::numeric * interval '1 hour'))
         ON CONFLICT (organization_id, id) DO NOTHING`,
        [s.id, org.id, s.program, s.study, s.primary, s.alpha, s.power,
         s.size, s.status, s.owner, s.locked, s.updatedHoursAgo],
      );
      inserted += r.rowCount ?? 0;
    }
    const existing = SAPS.length - inserted;
    const note = existing > 0 ? ` (${existing} already present)` : '';
    console.log(`   ✓ biostat: ${inserted} SAP documents seeded${note}`);
  } else {
    console.log('   ⚠ c2c_biostat_saps not found — skipping SAPs');
  }

  // ── Sample-size scenarios ──
  if (await tableExists(client, 'c2c_biostat_sample_sizes')) {
    let inserted = 0;
    for (const s of SAMPLE_SIZES) {
      const r = await client.query(
        `INSERT INTO c2c_biostat_sample_sizes
           (id, organization_id, study, label, alpha, power, delta, sd, expected, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (organization_id, id) DO NOTHING`,
        [s.id, org.id, s.study, s.label, s.alpha, s.power, s.delta, s.sd, s.expected, s.isPrimary],
      );
      inserted += r.rowCount ?? 0;
    }
    const existing = SAMPLE_SIZES.length - inserted;
    const note = existing > 0 ? ` (${existing} already present)` : '';
    console.log(`   ✓ biostat: ${inserted} sample-size scenarios seeded${note}`);
  } else {
    console.log('   ⚠ c2c_biostat_sample_sizes not found — skipping sample sizes');
  }

  // ── Pre-planned interim analyses ──
  if (await tableExists(client, 'c2c_biostat_interims')) {
    let inserted = 0;
    for (const it of INTERIMS) {
      const r = await client.query(
        `INSERT INTO c2c_biostat_interims
           (id, organization_id, study, kind, dsmb, analysis_date, sort_order)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE + ($6::int * interval '1 day'), $7)
         ON CONFLICT (organization_id, id) DO NOTHING`,
        [it.id, org.id, it.study, it.kind, it.dsmb, it.daysFromNow, it.order],
      );
      inserted += r.rowCount ?? 0;
    }
    const existing = INTERIMS.length - inserted;
    const note = existing > 0 ? ` (${existing} already present)` : '';
    console.log(`   ✓ biostat: ${inserted} interim analyses seeded${note}`);
  } else {
    console.log('   ⚠ c2c_biostat_interims not found — skipping interims');
  }
}
