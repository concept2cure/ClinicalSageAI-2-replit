/**
 * 90-evidence-objects.mjs — GA demo seed: the PDEV Evidence Picker's searchable
 * evidence library.
 *
 * Surface fed by this module:
 *   GET /api/evidence-objects (server/routes/evidence-objects.routes.ts)
 *   → SELECT id, title, evidence_type AS type, evidence_category AS category,
 *            COALESCE(source_reference, source_type, '') AS source
 *       FROM evidence_objects
 *      WHERE organization_id = $org [AND … ILIKE $q]
 *      ORDER BY title
 *   consumed by client/src/concept2cure/pdev/surfaces/EvidencePicker.tsx, which
 *   renders {title} and {type} · {category} · {source} per row.
 *
 * This writes the REAL, canonical `evidence_objects` graph table
 * (shared/schema/programs.ts) as PRIMARY — the same store the picker now reads
 * directly, the attach POST resolves against
 * (POST /api/pdev/programs/:programId/activities/:activityKey/evidence →
 *  server/services/pdev/pdev-evidence-attach.ts), and 10+ live services consume.
 * The seed-only `c2c_evidence_objects` blob is DEPRECATED and no longer written
 * here (its migration db/migrations/20260717_evidence_objects_store.sql carries
 * the deprecation header).
 *
 * Org col: organization_id (int). PK: id (uuid). Idempotent via ON CONFLICT (id)
 * DO NOTHING; to_regclass-guarded on the table and its NOT-NULL column shape.
 *
 * `id` is a deterministic UUID so the picker can hand the selected row straight
 * to the attach POST, which resolves the id against the same evidence_objects
 * rows this module writes.
 *
 * Program-consistent with the demo universe: BX-204 (CGM device), BX-099 (gMG
 * MAA biologic), BX-256 (SLE IND biologic), BX-512 (GIST IND). Evidence kinds
 * span study reports, datasets, literature, and protocols. Program context is
 * carried in the title / code / source text (the real table's `program_id` is a
 * nullable link the library does not populate); the picker's `q` search covers it.
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

/* Deterministic UUID ids so search → select → attach shares keys end-to-end.
   sourceType feeds the canonical evidence_objects.source_type (NOT NULL); the
   picker derives its "source" display from source_reference (this module's
   `source`) with source_type as the fallback. */
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

/* The NOT-NULL / display columns this seed writes on the real evidence_objects
   graph. Guard the write on their presence so an unexpected schema is skipped,
   not force-inserted. */
const REQUIRED_COLS = [
  'id', 'organization_id', 'title', 'evidence_type', 'evidence_category',
  'source_type', 'source_reference', 'status',
];

export default async function seed(client, { org }) {
  if (!(await tableExists(client, 'evidence_objects'))) {
    console.log('   ⚠ evidence_objects not found — skipping evidence-objects seed');
    return;
  }
  const cols = await columnSet(client, 'evidence_objects');
  if (!REQUIRED_COLS.every((c) => cols.has(c))) {
    console.log('   ⚠ evidence_objects shape unexpected — evidence-objects seed skipped');
    return;
  }

  let inserted = 0;
  let existing = 0;
  for (const e of EVIDENCE) {
    const r = await client.query(
      `INSERT INTO evidence_objects
         (id, organization_id, title, code, description,
          evidence_type, evidence_category, source_type, source_reference, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved')
       ON CONFLICT (id) DO NOTHING`,
      [e.id, org.id, e.title, e.code, e.description ?? null,
        e.type, e.category, e.sourceType, e.source],
    );
    const n = r.rowCount ?? 0;
    inserted += n;
    if (n === 0) existing += 1;
  }

  const skippedNote = existing > 0 ? ` (${existing} already present)` : '';
  console.log(`   ✓ evidence-objects: ${inserted} evidence objects seeded into evidence_objects${skippedNote}`);
}
