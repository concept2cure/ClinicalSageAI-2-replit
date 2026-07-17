/**
 * Wave-3 domain seed — CRO sponsor-portfolio roster.
 *
 * Five org-isolated sponsor clients rolled up in one CRO console, mirroring the
 * v2 CroPortfolio surface's CroSponsor shape (type, engagement lead, SOW status
 * + nested studies and regulatory submissions). Read by GET /api/cro-portfolio;
 * the surface renders the roster and drills into a sponsor's studies + shared
 * Submission Center lifecycle. The oncology sponsors are grounded in the app's
 * canonical BX-204 (rezatinib) and BX-099 programs — no fabricated identities
 * beyond the multi-sponsor engagement structure. to_regclass guarded,
 * org-scoped, idempotent (ON CONFLICT DO NOTHING).
 */
const SPONSORS = [
  {
    id: 'helix', ord: 0, name: 'Helix Therapeutics', type: 'biotech', lead: 'M. Webb',
    sow: 'on-track', sowNote: 'MSA + 2 active SOWs - renews Q1 2027',
    studies: [
      { code: 'BX204-301', phase: 'Phase 3', ind: 'rezatinib - RTK-X+ solid tumors', status: 'Enrolling', n: '412 / 480' },
      { code: 'BX099-201', phase: 'Phase 2', ind: 'BX-099 - 2L NSCLC', status: 'Data lock', n: '186 / 186' },
    ],
    subs: [
      { id: 'BLA 761204', type: 'BLA', region: 'FDA - CBER', state: 'assembling', gate: '2 gates open', due: 'Q4 2026' },
    ],
  },
  {
    id: 'aurora', ord: 1, name: 'Aurora MedTech', type: 'medtech', lead: 'J. Chen',
    sow: 'on-track', sowNote: 'Master SOW - 510(k) + post-market surveillance',
    studies: [
      { code: 'AUR-CGM-PIV', phase: 'Pivotal', ind: 'iCGM accuracy (MARD)', status: 'Complete', n: '320 / 320' },
      { code: 'AUR-HF', phase: 'Human factors', ind: 'Use-error validation', status: 'Complete', n: '45 / 45' },
      { code: 'AUR-RWE', phase: 'RWE', ind: 'Post-market registry', status: 'Ongoing', n: '1,240 / —' },
    ],
    subs: [
      { id: 'K-Aurora-CGM', type: '510(k)', region: 'FDA - CDRH', state: 'validated', gate: 'gate clear', due: 'Aug 2026' },
      { id: 'CER-Aurora', type: 'CER', region: 'EU MDR', state: 'draft', gate: '—', due: 'Q1 2027' },
    ],
  },
  {
    id: 'meridian', ord: 2, name: 'Meridian Pharma', type: 'pharma', lead: 'A. Muller',
    sow: 'at-risk', sowNote: 'SOW-7 change order pending — scope creep flagged',
    studies: [
      { code: 'MRD-401', phase: 'Phase 3', ind: '2L oncology', status: 'Enrolling', n: '640 / 900' },
      { code: 'MRD-PK', phase: 'Phase 1', ind: 'PK / PD bridging', status: 'Complete', n: '48 / 48' },
    ],
    subs: [
      { id: 'NDA 215780', type: 'NDA', region: 'FDA - OND', state: 'draft', gate: '—', due: 'Q3 2027' },
    ],
  },
  {
    id: 'cohort', ord: 3, name: 'Cohort Bio', type: 'biotech', lead: 'R. Nair',
    sow: 'on-track', sowNote: 'Single SOW - first-in-human program',
    studies: [
      { code: 'BX099-101', phase: 'Phase 1', ind: 'BX-099 first-in-human (SAD/MAD)', status: 'Startup', n: '0 / 32' },
    ],
    subs: [
      { id: 'IND 178432', type: 'IND', region: 'FDA', state: 'frozen', gate: 'gate clear', due: 'Pre-IND cleared' },
    ],
  },
  {
    id: 'linea', ord: 4, name: 'Linea Diagnostics', type: 'medtech', lead: 'A. Muller',
    sow: 'renewal-due', sowNote: 'MSA renewal due in 30 days',
    studies: [
      { code: 'LIN-CDx', phase: 'Clinical perf.', ind: 'Companion Dx (Annex XIII)', status: 'Ongoing', n: '210 / 300' },
      { code: 'LIN-AV', phase: 'Analytical', ind: 'Analytical validation', status: 'Complete', n: '—' },
    ],
    subs: [
      { id: 'IVDR-TF-Linea', type: 'IVDR', region: 'EU IVDR - NB', state: 'dispatched', gate: 'gate clear', due: 'NB submitted' },
    ],
  },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_cro_portfolio') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_cro_portfolio not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (const s of SPONSORS) {
    const r = await client.query(
      `INSERT INTO c2c_cro_portfolio (
         id, organization_id, ord, name, type, lead, sow, sow_note, studies, subs
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
       ON CONFLICT (organization_id, id) DO NOTHING`,
      [
        s.id, org.id, s.ord, s.name, s.type, s.lead, s.sow, s.sowNote,
        JSON.stringify(s.studies), JSON.stringify(s.subs),
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ cro portfolio: ${inserted} sponsor clients seeded`);
}
