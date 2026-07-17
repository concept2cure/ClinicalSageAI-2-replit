/**
 * 90-evidence-objects.mjs — GA demo seed: the PDEV Evidence Picker's searchable
 * evidence library.
 *
 * Surface fed by this module:
 *   GET /api/evidence-objects (server/routes/evidence-objects.routes.ts)
 *   → SELECT id, title, evidence_type AS type, evidence_category AS category,
 *            source
 *       FROM c2c_evidence_objects
 *      WHERE organization_id = $org [AND … ILIKE $q]
 *      ORDER BY title
 *   consumed by client/src/concept2cure/pdev/surfaces/EvidencePicker.tsx, which
 *   renders {title} and {type} · {category} · {source} per row.
 *
 * Org col: organization_id (int). PK (organization_id, id); idempotent via
 * ON CONFLICT DO NOTHING.
 *
 * `id` is a deterministic UUID so the picker can hand the selected row straight
 * to the already-real attach POST
 * (POST /api/pdev/programs/:programId/activities/:activityKey/evidence →
 *  server/services/pdev/pdev-evidence-attach.ts), which resolves the id against
 * the canonical `evidence_objects` graph (uuid PK, org-scoped). To keep the
 * whole search → select → attach flow honest, this module mirrors each row into
 * `evidence_objects` under the SAME uuid when that table is present — guarded on
 * to_regclass + the NOT-NULL column shape, idempotent by id. If `evidence_objects`
 * is absent the search list still populates; only the attach resolution degrades.
 *
 * Program-consistent with the demo universe: BX-204 (CGM device), BX-099 (gMG
 * MAA biologic), BX-256 (SLE IND biologic), BX-512 (GIST IND). Evidence kinds
 * span study reports, datasets, literature, and protocols.
 */

async function tableExists(client, table) {
  const { rows } = await client.query('SELECT to_regclass($1) AS t', [`public.${table}`]);
  return Boolean(rows[0]?.t);
}

async function columnSet(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return new Set(rows.map((r) => r.column_name));
}

/* Deterministic UUID ids so the search store and the evidence graph share keys.
   sourceType feeds the canonical evidence_objects.source_type (NOT NULL) on the
   mirror; it is not surfaced by the picker. */
const EVIDENCE = [
  {
    id: 'ecf00001-0000-4000-8000-000000000001', code: 'CSR-204-301',
    title: 'BX-204 CGM pivotal accuracy study report (MARD 8.1%)',
    type: 'study_report', category: 'clinical', source: 'Internal CSR · TR-204-301',
    program: 'BX-204', sourceType: 'internal',
    description: 'Clinical accuracy report for the BX-204 continuous glucose monitor pivotal study.',
  },
  {
    id: 'ecf00002-0000-4000-8000-000000000002', code: 'DS-204-CLIN',
    title: 'BX-204 CGM paired sensor–YSI reference dataset (n=412)',
    type: 'dataset', category: 'clinical', source: 'Internal data lake · CLIN-204',
    program: 'BX-204', sourceType: 'internal',
    description: 'Paired interstitial-vs-reference glucose measurements for accuracy analysis.',
  },
  {
    id: 'ecf00003-0000-4000-8000-000000000003', code: 'BIO-204-001',
    title: 'BX-204 adhesive biocompatibility evaluation (ISO 10993-10/-23)',
    type: 'study_report', category: 'nonclinical', source: 'Internal lab · BIO-204-001',
    program: 'BX-204', sourceType: 'internal',
    description: 'Skin sensitization and irritation battery for the sensor adhesive.',
  },
  {
    id: 'ecf00004-0000-4000-8000-000000000004', code: 'LIT-204-07',
    title: 'Continuous glucose monitoring accuracy standards — consensus review',
    type: 'literature', category: 'clinical', source: 'PubMed · PMID 34567890',
    program: 'BX-204', sourceType: 'literature',
    description: 'Peer-reviewed consensus on CGM accuracy reporting (MARD, Clarke error grid).',
  },
  {
    id: 'ecf00005-0000-4000-8000-000000000005', code: 'CSR-099-201',
    title: 'BX-099 gMG Phase 2 clinical study report (MG-ADL change)',
    type: 'study_report', category: 'clinical', source: 'Internal CSR · TR-099-201',
    program: 'BX-099', sourceType: 'internal',
    description: 'Efficacy and safety report supporting the BX-099 MAA clinical package.',
  },
  {
    id: 'ecf00006-0000-4000-8000-000000000006', code: 'IMM-099-003',
    title: 'BX-099 immunogenicity assessment (ADA incidence and titers)',
    type: 'study_report', category: 'safety', source: 'Internal bioanalytical · IMM-099-003',
    program: 'BX-099', sourceType: 'internal',
    description: 'Anti-drug-antibody analysis referenced by the CHMP day-120 response.',
  },
  {
    id: 'ecf00007-0000-4000-8000-000000000007', code: 'DS-099-PK',
    title: 'BX-099 population pharmacokinetics analysis dataset',
    type: 'dataset', category: 'clinical', source: 'Internal data lake · PK-099',
    program: 'BX-099', sourceType: 'internal',
    description: 'NONMEM-ready concentration-time dataset for the popPK model.',
  },
  {
    id: 'ecf00008-0000-4000-8000-000000000008', code: 'LIT-099-12',
    title: 'Anti-AChR antibody titers as a biomarker in generalized myasthenia gravis',
    type: 'literature', category: 'clinical', source: 'PubMed · PMID 33111222',
    program: 'BX-099', sourceType: 'literature',
    description: 'Literature support for the BX-099 mechanism and endpoint selection.',
  },
  {
    id: 'ecf00009-0000-4000-8000-000000000009', code: 'TX-256-702',
    title: 'BX-256 39-week cynomolgus GLP toxicology study report',
    type: 'study_report', category: 'nonclinical', source: 'GLP CRO · TX-256-702',
    program: 'BX-256', sourceType: 'internal',
    description: 'Chronic non-human-primate toxicology supporting the SLE IND Module 4.',
  },
  {
    id: 'ecf0000a-0000-4000-8000-00000000000a', code: 'PROT-256-FIH',
    title: 'BX-256 first-in-human protocol synopsis (SLE)',
    type: 'protocol', category: 'clinical', source: 'Protocol repository · PROT-256-FIH',
    program: 'BX-256', sourceType: 'internal',
    description: 'FIH dose-escalation protocol synopsis for the BX-256 Pre-IND package.',
  },
  {
    id: 'ecf0000b-0000-4000-8000-00000000000b', code: 'TX-512-GLP',
    title: 'Vorelinib (BX-512) GLP repeat-dose toxicology summary',
    type: 'study_report', category: 'nonclinical', source: 'GLP CRO · TX-512-GLP',
    program: 'BX-512', sourceType: 'internal',
    description: 'Repeat-dose toxicology rollup gating the BX-512 IND Module 4.',
  },
];

/* Mirror the same uuid into the canonical evidence_objects graph so the picker's
   attach step (which validates against evidence_objects) resolves. Guarded on
   the NOT-NULL column shape; idempotent by id. */
async function mirrorToEvidenceGraph(client, org) {
  if (!(await tableExists(client, 'evidence_objects'))) {
    return { mirrored: 0, note: 'evidence_objects absent — attach resolution not seeded' };
  }
  const cols = await columnSet(client, 'evidence_objects');
  const required = ['id', 'organization_id', 'title', 'evidence_type', 'evidence_category', 'source_type', 'status'];
  if (!required.every((c) => cols.has(c))) {
    return { mirrored: 0, note: 'evidence_objects shape unexpected — mirror skipped' };
  }

  let mirrored = 0;
  for (const e of EVIDENCE) {
    const found = await client.query(
      'SELECT 1 FROM evidence_objects WHERE id = $1 AND organization_id = $2 LIMIT 1',
      [e.id, org.id],
    );
    if (found.rows[0]) continue;
    await client.query(
      `INSERT INTO evidence_objects
         (id, organization_id, title, code, description,
          evidence_type, evidence_category, source_type, source_reference, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved')
       ON CONFLICT (id) DO NOTHING`,
      [e.id, org.id, e.title, e.code, e.description ?? null,
        e.type, e.category, e.sourceType, e.source],
    );
    mirrored += 1;
  }
  return { mirrored, note: null };
}

export default async function seed(client, { org }) {
  if (!(await tableExists(client, 'c2c_evidence_objects'))) {
    console.log('   ⚠ c2c_evidence_objects not found — skipping');
    return;
  }

  let inserted = 0;
  let existing = 0;
  for (const e of EVIDENCE) {
    const r = await client.query(
      `INSERT INTO c2c_evidence_objects
         (id, organization_id, title, evidence_type, evidence_category, source, program_code, code, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (organization_id, id) DO NOTHING`,
      [e.id, org.id, e.title, e.type, e.category, e.source, e.program, e.code, e.description ?? null],
    );
    const n = r.rowCount ?? 0;
    inserted += n;
    if (n === 0) existing += 1;
  }

  const { mirrored, note } = await mirrorToEvidenceGraph(client, org);

  const skippedNote = existing > 0 ? ` (${existing} already present)` : '';
  console.log(`   ✓ evidence-objects: ${inserted} evidence objects seeded${skippedNote}`);
  if (note) {
    console.log(`   ⚠ ${note}`);
  } else {
    console.log(`   ✓ evidence-objects: ${mirrored} mirrored into evidence_objects for attach resolution`);
  }
}
