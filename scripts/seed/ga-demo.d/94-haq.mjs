/**
 * Wave-2 domain seed — HAQ response manager store.
 *
 * Seeds the EXISTING /api/haq-manager backend (feature store over
 * project_memory_entries, category 'haq_question'): two authority letters
 * (FDA mid-cycle Information Request, EMA Day-120 List of Questions) and their
 * questions in mixed workflow states. Each payload carries the exact display
 * keys the v2 HaqManager surface renders (letterId/qid, disc, tone, status,
 * q, analysis, draft, cites, commitments, precedentNote), so GET /rounds maps
 * them straight onto the surface's fixture shape.
 *
 * Parent chain: project_memory_entries needs a project (project_id NOT NULL)
 * and a project_intelligence_profiles row (project_profile_id NOT NULL). Both
 * are resolved from the org, and only a minimal holder is fabricated in a bare
 * DB — mirroring the vault seed's resolve-or-create discipline. Idempotent:
 * SELECT-before-INSERT on (organization_id, category, subcategory, title).
 */

const CATEGORY = 'haq_question';

const LETTERS = [
  {
    letterId: 'fda-ir1', agency: 'FDA', flag: 'US', authority: 'FDA / CDER / OND',
    submission: 'BX-204 -- NDA 212345', type: 'Information Request (mid-cycle)',
    received: '2026-06-09', due: '2026-06-23', clockDays: 6, clockTotal: 14,
    note: 'Single 14-day IR clock. Responses roll into the review; non-response risks an extension or CRL.',
  },
  {
    letterId: 'ema-d120', agency: 'EMA', flag: 'EU', authority: 'EMA / CHMP (Rapporteur)',
    submission: 'BX-204 -- MAA EMEA/H/C/006012', type: 'Day-120 List of Questions',
    received: '2026-05-28', due: '2026-08-26', clockDays: 64, clockTotal: 90,
    note: 'Clock stops at Day 120; responses due before the clock restarts at Day 121.',
  },
];

const QUESTIONS = [
  {
    qid: 'IR-1', letterId: 'fda-ir1', disc: 'Clinical', tone: 'err', status: 'in-review', owner: 'J. Chen',
    q: 'Provide the objective response rate by age subgroup (<65 vs >=65) with corresponding 95% confidence intervals from the pivotal study BX204-201, and discuss whether efficacy is maintained in the elderly subpopulation.',
    analysis: 'A standard subgroup-consistency probe -- the reviewer wants assurance the ORR holds in >=65y, where the label will see heavy use. They are not questioning the primary result; they want the stratified table and a consistency narrative. Drawn from the locked ADaM ADRS.',
    draft: 'In the pivotal study BX204-201, the objective response rate was 42.1% (95% CI 35.8-48.6) overall. By age subgroup, ORR was 43.4% (95% CI 35.1-51.9) in patients <65 years (n=138) and 39.5% (95% CI 28.4-51.4) in patients >=65 years (n=76), per the locked CSR-201 primary analysis (ADaM ADRS, data lock 18 Apr 2026). The confidence intervals overlap substantially, and the point estimates are consistent with the overall result; efficacy is maintained in the elderly subpopulation.',
    cites: [
      { src: 'CSR-201 7.4 -- primary efficacy', ok: true },
      { src: 'ADaM ADRS (locked)', ok: true },
      { src: '2.7.3 Summary of Clinical Efficacy', ok: true },
    ],
    commitments: [],
    precedentNote: 'In 3 of 4 comparable accelerated-approval oncology NDAs, the same age-subgroup IR was resolved with a stratified ORR table + a one-paragraph consistency statement; none required new analyses.',
  },
  {
    qid: 'IR-2', letterId: 'fda-ir1', disc: 'CMC', tone: 'err', status: 'draft', owner: 'M. Webb',
    q: 'Justify the proposed commercial drug substance specification acceptance criterion for the acidic charge variant (<=18.0%) in light of the observed range across registration lots, and confirm the comparability of pre- and post-process-change material.',
    analysis: 'A specification-justification question tied to the Module 3 comparability item already on our critical path (T-204-31). The reviewer wants the acidic-variant criterion tied to clinical experience + the registration-lot distribution, and the pre/post-change comparability conclusion. Partially blocked until the comparability reconciliation closes.',
    draft: 'The proposed acidic charge variant acceptance criterion (<=18.0%) is justified by the observed range across 14 registration lots (11.2-16.8%), bracketed by clinical experience (clinical lots up to 17.4% with no impact on PK or efficacy). Pre- vs post-process-change comparability was demonstrated across the analytical similarity panel (n=3 post-change lots) per 3.2.S.4.',
    cites: [
      { src: '3.2.S.4.3 -- batch analysis', ok: true },
      { src: 'Comparability protocol CP-204', ok: false },
      { src: '3.2.S.7 stability', ok: true },
    ],
    commitments: ['Post-approval commitment: tighten to <=16.0% after 25 commercial lots (PACMP).'],
    precedentNote: 'Acidic-variant specification IRs are commonly resolved by linking the criterion to the clinical-experience max + a PACMP tightening commitment. AnA found this pattern in 5 recent mAb BLAs.',
  },
  {
    qid: 'IR-3', letterId: 'fda-ir1', disc: 'Clinical pharmacology', tone: 'warn', status: 'approved', owner: 'S. Park',
    q: 'Provide an exposure-response analysis for the primary efficacy endpoint and discuss the adequacy of the proposed dose.',
    analysis: 'The reviewer wants the E-R for efficacy supporting the proposed dose. The population-PK and E-R analyses already exist in 2.7.2; this is an assembly + narrative task, not new work.',
    draft: 'An exposure-response analysis for ORR was conducted using the population-PK-derived steady-state exposure (Cavg,ss). The relationship was flat across the exposure range observed at the proposed dose, indicating the dose is on the plateau of the E-R curve and supporting adequacy of the proposed regimen (2.7.2; population-PK report PMX-204).',
    cites: [
      { src: '2.7.2 Summary of Clinical Pharmacology', ok: true },
      { src: 'Pop-PK report PMX-204', ok: true },
    ],
    commitments: [],
    precedentNote: 'Flat E-R at the proposed dose is the strongest framing; consistent with how the predicate program cleared the same question.',
  },
  {
    qid: 'IR-4', letterId: 'fda-ir1', disc: 'Biostatistics', tone: 'warn', status: 'draft', owner: 'A. Muller',
    q: 'Clarify the handling of missing data and the sensitivity analyses performed for the primary endpoint, including the assumptions underlying the primary imputation approach.',
    analysis: 'A standard missing-data robustness question. The SAP pre-specified the primary as non-responder imputation with tipping-point sensitivity; this is a restatement from 2.7.3 + the SAP, not new analysis.',
    draft: 'Missing responses were handled by non-responder imputation (NRI) for the primary ORR analysis, as pre-specified in the SAP. Sensitivity analyses included complete-case and a tipping-point analysis; the conclusion was robust to plausible departures from the primary assumption.',
    cites: [
      { src: 'SAP v3.0 9.4', ok: true },
      { src: '2.7.3 efficacy', ok: true },
    ],
    commitments: [],
    precedentNote: 'NRI + tipping-point is the expected answer for ORR endpoints; matches recent oncology precedent.',
  },
  {
    qid: 'IR-5', letterId: 'fda-ir1', disc: 'Labeling', tone: 'ok', status: 'draft', owner: 'J. Chen',
    q: 'Revise the proposed USPI Section 8.1 (Pregnancy) to align with the nonclinical reproductive toxicology findings and the Pregnancy and Lactation Labeling Rule (PLLR) format.',
    analysis: 'A labeling-conformance request. The DART findings in 2.6.6 drive the 8.1 risk-summary language; this is a drafting task in PLLR format, dependent on the SPL conversion already tracked (T-204-12).',
    draft: 'Section 8.1 (Pregnancy) -- Risk Summary: Based on findings from animal reproduction studies and the mechanism of action, BX-204 can cause fetal harm when administered to a pregnant woman. There are no available data on BX-204 use in pregnant women to inform a drug-associated risk.',
    cites: [
      { src: '2.6.6 nonclinical DART', ok: true },
      { src: 'USPI 8.1 (draft)', ok: true },
    ],
    commitments: [],
    precedentNote: 'PLLR risk-summary phrasing is templated from the DART NOAEL; AnA aligned wording to the approved class labeling.',
  },
  {
    qid: 'D120-1', letterId: 'ema-d120', disc: 'Clinical', tone: 'err', status: 'in-review', owner: 'S. Chen',
    q: 'Discuss the clinical relevance of the chosen non-inferiority margin and justify it with reference to historical placebo-controlled evidence.',
    analysis: 'A CHMP margin-justification question. The Rapporteur wants the NI margin anchored to the historical effect size preserved fraction; the meta-analysis exists in 2.7.3 and the SAP pre-specifies the margin.',
    draft: 'The non-inferiority margin of 10% was pre-specified in the SAP and preserves >50% of the historical placebo-controlled treatment effect (meta-analysis of three prior trials, 2.7.3). The margin is clinically justified as the smallest difference considered clinically meaningful by the treating-physician advisory panel.',
    cites: [
      { src: '2.7.3 historical evidence', ok: true },
      { src: 'SAP v3.0 8.2', ok: true },
    ],
    commitments: [],
    precedentNote: 'CHMP margin questions are resolved by the preserved-fraction argument + advisory-panel clinical anchor; standard EMA practice.',
  },
  {
    qid: 'D120-2', letterId: 'ema-d120', disc: 'Safety', tone: 'warn', status: 'draft', owner: 'R. Okafor',
    q: 'Provide an updated cumulative safety analysis including the integrated summary of safety and a discussion of hepatic adverse events by severity and outcome.',
    analysis: 'A cumulative-safety update. The ISS exists; the hepatic-AE breakdown needs the latest data-cut refresh. Dependent on the safety database lock scheduled for the D121 response window.',
    draft: 'The cumulative integrated summary of safety across the BX-204 program is provided in the updated 2.7.4. Hepatic adverse events are tabulated by CTCAE grade and outcome; the majority were Grade 1-2 and reversible, with no Hy\'s Law cases identified.',
    cites: [
      { src: '2.7.4 integrated safety', ok: true },
      { src: 'Hepatic-AE narrative appendix', ok: false },
    ],
    commitments: ['Refresh hepatic-AE tables at the D121 safety database lock.'],
    precedentNote: 'Cumulative-safety LoQ items are answered with a refreshed ISS + a Hy\'s Law assessment; expected for the Day-120 stage.',
  },
  {
    qid: 'D120-3', letterId: 'ema-d120', disc: 'Quality', tone: 'ok', status: 'approved', owner: 'M. Webb',
    q: 'Confirm the shelf-life claim is supported by the available stability data and describe the extrapolation approach per ICH Q1E.',
    analysis: 'A quality shelf-life question. The stability package supports the claim with ICH Q1E extrapolation; this is a restatement from 3.2.P.8 already reviewed internally.',
    draft: 'The proposed 24-month shelf life is supported by 18 months of long-term stability data with statistical extrapolation per ICH Q1E. The extrapolation is justified by the absence of any significant change and a favourable statistical trend analysis (3.2.P.8.3).',
    cites: [
      { src: '3.2.P.8.3 stability data', ok: true },
      { src: 'ICH Q1E extrapolation memo', ok: true },
    ],
    commitments: [],
    precedentNote: 'ICH Q1E extrapolation with 18 months of data routinely supports a 24-month claim; standard quality resolution.',
  },
];

async function tableExists(client, table) {
  const { rows } = await client.query('SELECT to_regclass($1) AS t', [`public.${table}`]);
  return Boolean(rows[0]?.t);
}

/* Prefer an existing org project; only fabricate a minimal holder in a bare DB
   so the HAQ store has a valid project_id. Mirrors the vault seed's two-attempt
   INSERT to tolerate schema variants where client_workspace_id is NOT NULL. */
async function resolveProjectId(client, org, admin) {
  const existing = await client.query(
    'SELECT id FROM projects WHERE organization_id = $1 ORDER BY id LIMIT 1',
    [org.id],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  let wsId = null;
  if (await tableExists(client, 'client_workspaces')) {
    try {
      await client.query('SAVEPOINT sp_haq_ws');
      await client.query(
        `INSERT INTO client_workspaces (organization_id, name, slug, status, created_by_id)
         VALUES ($1, 'Concept2Cure Therapeutics', 'concept2cure', 'active', $2)
         ON CONFLICT (organization_id, slug) DO NOTHING`,
        [org.id, admin.id],
      );
      const ws = await client.query(
        'SELECT id FROM client_workspaces WHERE organization_id = $1 ORDER BY id LIMIT 1',
        [org.id],
      );
      wsId = ws.rows[0]?.id ?? null;
      await client.query('RELEASE SAVEPOINT sp_haq_ws');
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT sp_haq_ws');
    }
  }

  const name = 'Concept2Cure regulatory workspace';
  const desc = 'Container program for demo HAQ records.';
  if (wsId !== null) {
    try {
      await client.query('SAVEPOINT sp_haq_proj');
      const ins = await client.query(
        `INSERT INTO projects (organization_id, client_workspace_id, name, code, description,
           status, type, depth, priority)
         VALUES ($1, $2, $3, 'BX-DEMO', $4, 'active', 'regulatory', 0, 'high')
         RETURNING id`,
        [org.id, wsId, name, desc],
      );
      await client.query('RELEASE SAVEPOINT sp_haq_proj');
      return ins.rows[0].id;
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT sp_haq_proj');
    }
  }
  try {
    await client.query('SAVEPOINT sp_haq_proj2');
    const ins = await client.query(
      `INSERT INTO projects (organization_id, name, code, description,
         status, type, depth, priority)
       VALUES ($1, $2, 'BX-DEMO', $3, 'active', 'regulatory', 0, 'high')
       RETURNING id`,
      [org.id, name, desc],
    );
    await client.query('RELEASE SAVEPOINT sp_haq_proj2');
    return ins.rows[0].id;
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_haq_proj2');
    return null;
  }
}

async function resolveProfileId(client, org, projectId) {
  const sel = `SELECT id FROM project_intelligence_profiles
                WHERE organization_id = $1 AND project_id = $2 ORDER BY id LIMIT 1`;
  let { rows } = await client.query(sel, [org.id, projectId]);
  if (rows[0]) return rows[0].id;
  try {
    await client.query('SAVEPOINT sp_haq_profile');
    await client.query(
      `INSERT INTO project_intelligence_profiles (project_id, organization_id, profile_status)
       VALUES ($1, $2, 'active')`,
      [projectId, org.id],
    );
    ({ rows } = await client.query(sel, [org.id, projectId]));
    await client.query('RELEASE SAVEPOINT sp_haq_profile');
    return rows[0]?.id ?? null;
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_haq_profile');
    return null;
  }
}

async function insertEntry(client, ids, org, subcategory, title, payload) {
  const found = await client.query(
    `SELECT id FROM project_memory_entries
      WHERE organization_id = $1 AND category = $2 AND subcategory = $3 AND title = $4 LIMIT 1`,
    [org.id, CATEGORY, subcategory, title],
  );
  if (found.rows[0]) return 0;
  await client.query(
    `INSERT INTO project_memory_entries (
       project_profile_id, project_id, organization_id, category, subcategory,
       title, content, extracted_by, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'system', 'active')`,
    [ids.profileId, ids.projectId, org.id, CATEGORY, subcategory, title.slice(0, 500), JSON.stringify(payload)],
  );
  return 1;
}

export default async function seed(client, { org, admin }) {
  if (!(await tableExists(client, 'project_memory_entries'))) {
    console.log('   ⚠ project_memory_entries not found — skipping HAQ seed');
    return;
  }
  const projectId = await resolveProjectId(client, org, admin);
  if (projectId === null) {
    console.log('   ⚠ no usable project for HAQ store — skipping');
    return;
  }
  const profileId = await resolveProfileId(client, org, projectId);
  if (profileId === null) {
    console.log('   ⚠ no project intelligence profile for HAQ store — skipping');
    return;
  }
  const ids = { profileId, projectId };

  let letters = 0;
  for (const l of LETTERS) letters += await insertEntry(client, ids, org, 'letter', l.letterId, l);
  let questions = 0;
  for (const q of QUESTIONS) questions += await insertEntry(client, ids, org, 'question', q.qid, q);

  console.log(`   ✓ HAQ: ${letters} authority letters + ${questions} questions seeded`);
}
