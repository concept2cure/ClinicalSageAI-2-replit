/**
 * Wave-3 domain seed — CRO sponsor-portfolio roster into the REAL store.
 *
 * Five org-isolated sponsor engagements seeded into the real, org-scoped CRO
 * tables — cro_clients + cro_studies + cro_regulatory_submissions +
 * cro_milestones + cro_team_assignments (migrations/0000_sweet_joseph.sql) —
 * the exact tables the /api/cro CRUD routes write, and that GET
 * /api/cro-portfolio now reads (see server/services/cro/
 * cro-portfolio-view-assembler.ts). No blob: the surface's SOW status is
 * DERIVED on read from the real contract facts (contract_status + risk_level +
 * contract_end_date), the dispatch gate is a live rollup over each submission's
 * cro_milestones, and the engagement lead is the client's active
 * cro_team_assignments row resolved to a REAL org member (not a fictional name).
 *
 * The oncology sponsors stay grounded in the app's canonical BX-204 (rezatinib)
 * and BX-099 programs — no fabricated identities beyond the multi-sponsor
 * engagement structure. to_regclass guarded, org-scoped, idempotent (only seeds
 * when the org has no cro_clients yet).
 */

const DAY = 86_400_000;
const inDays = (n) => new Date(Date.now() + n * DAY);

// Narrative → real contract facts: Meridian reads 'at-risk' via risk_level
// 'high'; Linea reads 'renewal-due' via a contract_end_date 30 days out; the
// rest read 'on-track' (active, low risk, no near-term end date).
const SPONSORS = [
  {
    name: 'Helix Therapeutics', companyType: 'biotech', riskLevel: 'low',
    contractEndDays: 245, notes: 'MSA + 2 active SOWs - renews Q1 2027',
    studies: [
      { number: 'BX204-301', title: 'Rezatinib in RTK-X+ solid tumors (pivotal)', type: 'interventional', area: 'Oncology', indication: 'rezatinib - RTK-X+ solid tumors', phase: 'Phase 3', status: 'recruiting', current: 412, target: 480 },
      { number: 'BX099-201', title: 'BX-099 in second-line NSCLC', type: 'interventional', area: 'Oncology', indication: 'BX-099 - 2L NSCLC', phase: 'Phase 2', status: 'data_lock', current: 186, target: 186 },
    ],
    subs: [
      {
        number: 'BLA 761204', type: 'BLA', region: 'FDA - CBER', status: 'assembling', expected: '2026-11-15',
        milestones: [
          { title: 'Nonclinical data package sign-off', status: 'in_progress' },
          { title: 'Module 3 stability addendum', status: 'planned' },
        ],
      },
    ],
  },
  {
    name: 'Aurora MedTech', companyType: 'medtech', riskLevel: 'low',
    contractEndDays: null, notes: 'Master SOW - 510(k) + post-market surveillance',
    studies: [
      { number: 'AUR-CGM-PIV', title: 'iCGM pivotal accuracy study', type: 'device pivotal', area: 'Endocrinology', indication: 'iCGM accuracy (MARD)', phase: 'Pivotal', status: 'completed', current: 320, target: 320 },
      { number: 'AUR-HF', title: 'iCGM human factors validation', type: 'human factors', area: 'Endocrinology', indication: 'Use-error validation', phase: 'Human factors', status: 'completed', current: 45, target: 45 },
      { number: 'AUR-RWE', title: 'iCGM post-market registry', type: 'observational', area: 'Endocrinology', indication: 'Post-market registry', phase: 'RWE', status: 'ongoing', current: 1240, target: null },
    ],
    subs: [
      {
        number: 'K-Aurora-CGM', type: '510(k)', region: 'FDA - CDRH', status: 'validated', expected: '2026-08-15',
        milestones: [{ title: 'eSTAR validation checks', status: 'completed' }],
      },
      { number: 'CER-Aurora', type: 'CER', region: 'EU MDR', status: 'draft', expected: '2027-02-15', milestones: [] },
    ],
  },
  {
    name: 'Meridian Pharma', companyType: 'pharma', riskLevel: 'high',
    contractEndDays: null, notes: 'SOW-7 change order pending — scope creep flagged',
    studies: [
      { number: 'MRD-401', title: 'MRD-401 in second-line oncology', type: 'interventional', area: 'Oncology', indication: '2L oncology', phase: 'Phase 3', status: 'recruiting', current: 640, target: 900 },
      { number: 'MRD-PK', title: 'MRD PK/PD bridging study', type: 'interventional', area: 'Clinical pharmacology', indication: 'PK / PD bridging', phase: 'Phase 1', status: 'completed', current: 48, target: 48 },
    ],
    subs: [
      { number: 'NDA 215780', type: 'NDA', region: 'FDA - OND', status: 'draft', expected: '2027-08-15', milestones: [] },
    ],
  },
  {
    name: 'Cohort Bio', companyType: 'biotech', riskLevel: 'low',
    contractEndDays: null, notes: 'Single SOW - first-in-human program',
    studies: [
      { number: 'BX099-101', title: 'BX-099 first-in-human (SAD/MAD)', type: 'interventional', area: 'Oncology', indication: 'BX-099 first-in-human (SAD/MAD)', phase: 'Phase 1', status: 'startup', current: 0, target: 32 },
    ],
    subs: [
      {
        number: 'IND 178432', type: 'IND', region: 'FDA', status: 'frozen', expected: null,
        milestones: [{ title: 'Pre-IND meeting minutes closed', status: 'completed' }],
      },
    ],
  },
  {
    name: 'Linea Diagnostics', companyType: 'medtech', riskLevel: 'medium',
    contractEndDays: 30, notes: 'MSA renewal due in 30 days',
    studies: [
      { number: 'LIN-CDx', title: 'Companion diagnostic clinical performance (Annex XIII)', type: 'clinical performance', area: 'Oncology diagnostics', indication: 'Companion Dx (Annex XIII)', phase: 'Clinical perf.', status: 'ongoing', current: 210, target: 300 },
      { number: 'LIN-AV', title: 'Companion diagnostic analytical validation', type: 'analytical validation', area: 'Oncology diagnostics', indication: 'Analytical validation', phase: 'Analytical', status: 'completed', current: 0, target: null },
    ],
    subs: [
      {
        number: 'IVDR-TF-Linea', type: 'IVDR', region: 'EU IVDR - NB', status: 'dispatched', expected: null, submitted: true,
        milestones: [{ title: 'Technical file QC review', status: 'completed' }],
      },
    ],
  },
];

async function has(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS c`, [`public.${table}`]);
  return !!r.rows[0]?.c;
}

export default async function seed(client, { org, admin }) {
  for (const t of ['cro_clients', 'cro_studies', 'cro_regulatory_submissions', 'cro_milestones', 'cro_team_assignments']) {
    if (!(await has(client, t))) {
      console.log(`   ⚠ ${t} not found — run migrations first, skipping cro-portfolio seed`);
      return;
    }
  }

  const existing = await client.query(
    `SELECT 1 FROM cro_clients WHERE organization_id = $1 LIMIT 1`,
    [org.id],
  );
  if (existing.rowCount) {
    console.log('   ✓ cro portfolio: already present, skipping');
    return;
  }

  // Engagement leads are REAL org members (cro_team_assignments.user_id is a
  // NOT NULL FK to users) — round-robin the org's membership; fall back to the
  // demo admin; skip the assignment (lead renders honest-null) if neither exists.
  const m = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 8`,
    [org.id],
  );
  const members = m.rows.map((r) => r.user_id);
  if (members.length === 0 && admin?.id) members.push(admin.id);

  let clients = 0, studies = 0, subs = 0, milestones = 0, assignments = 0;
  for (let i = 0; i < SPONSORS.length; i++) {
    const sp = SPONSORS[i];
    const c = await client.query(
      `INSERT INTO cro_clients
         (organization_id, name, company_type, contract_status, risk_level,
          contract_start_date, contract_end_date, notes)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7) RETURNING id`,
      [org.id, sp.name, sp.companyType, sp.riskLevel, inDays(-365),
       sp.contractEndDays != null ? inDays(sp.contractEndDays) : null, sp.notes],
    );
    const clientId = Number(c.rows[0].id);
    clients += 1;

    for (const st of sp.studies) {
      await client.query(
        `INSERT INTO cro_studies
           (organization_id, client_id, study_number, study_title, study_type,
            therapeutic_area, indication, study_phase, study_status,
            current_enrollment, target_enrollment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [org.id, clientId, st.number, st.title, st.type, st.area, st.indication,
         st.phase, st.status, st.current, st.target],
      );
      studies += 1;
    }

    for (const sb of sp.subs) {
      const s = await client.query(
        `INSERT INTO cro_regulatory_submissions
           (organization_id, client_id, submission_number, submission_type,
            regulatory_region, submission_status, submission_date, expected_approval_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [org.id, clientId, sb.number, sb.type, sb.region, sb.status,
         sb.submitted ? inDays(-14) : null, sb.expected ? new Date(sb.expected) : null],
      );
      const subId = Number(s.rows[0].id);
      subs += 1;

      for (const ms of sb.milestones) {
        await client.query(
          `INSERT INTO cro_milestones
             (organization_id, client_id, submission_id, title, category, status)
           VALUES ($1, $2, $3, $4, 'regulatory', $5)`,
          [org.id, clientId, subId, ms.title, ms.status],
        );
        milestones += 1;
      }
    }

    if (members.length > 0) {
      await client.query(
        `INSERT INTO cro_team_assignments
           (organization_id, user_id, client_id, role, assignment_type, start_date, status)
         VALUES ($1, $2, $3, 'Engagement lead', 'primary', $4, 'active')`,
        [org.id, members[i % members.length], clientId, inDays(-180)],
      );
      assignments += 1;
    }
  }

  console.log(
    `   ✓ cro portfolio: ${clients} sponsor clients seeded into cro_clients ` +
    `(${studies} studies, ${subs} submissions, ${milestones} milestones, ${assignments} lead assignments)`,
  );
}
