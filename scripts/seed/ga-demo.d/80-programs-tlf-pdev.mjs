/**
 * 80-programs-tlf-pdev.mjs — GA demo seed: biopharma regulatory programs +
 * regulatory correspondence + Biostat TLF build queue + one CMC submission with
 * its Module-3 / obligation children + PDEV → IND program activities.
 *
 * Surfaces fed by this module (READ QUERIES are authoritative for column /
 * org-scoping choices):
 *
 *   1. GET /api/biopharma/programs (server/routes/biopharma/programs.ts:70)
 *      → FROM regulatory_programs p
 *         WHERE p.organization_id = $org
 *           AND p.program_type = ANY(['IND','NDA','BLA','MAA','JNDA','DE_NOVO'])
 *         ORDER BY p.updated_at DESC
 *      Org column: organization_id (int). Filter that actually selects rows:
 *      organization_id + program_type. (NB the route's SELECT list also names
 *      p.sponsor_name / p.lead_indication / p.filing_date / p.pdufa_date /
 *      p.completion_percentage — columns that do NOT exist on regulatory_programs
 *      in any migration; that is a pre-existing route/schema drift this seed
 *      cannot fix. We seed only real columns and satisfy the WHERE clause.)
 *
 *   2. GET /api/regulatory-correspondence/correspondence
 *      (server/routes/regulatory-correspondence.ts:696)
 *      → SELECT * FROM c2c_correspondence WHERE organization_id = $org
 *         ORDER BY received_at DESC NULLS LAST, created_at DESC
 *      c2c_correspondence.submission_id → c2c_submissions.id (NOT NULL);
 *      c2c_submissions.project_id → projects.id (NOT NULL). Org col:
 *      organization_id (int) on both. Parents resolved-or-created under
 *      SAVEPOINTs so a bare DB degrades to a skipped part.
 *
 *   3. GET /api/intelligence/biostat → tlfQueue
 *      (server/routes/intelligence-cluster.ts:96)
 *      → FROM c2c_tlf_builds t JOIN regulatory_programs p ON p.id = t.project_id
 *         WHERE p.organization_id = $org AND p.deleted_at IS NULL
 *         ORDER BY t.due_at ASC
 *      c2c_tlf_builds.project_id holds a regulatory_programs.id (uuid; no FK).
 *      Tenant isolation is via the program join, so builds hang off the seeded
 *      biopharma programs (which carry organization_id + are not soft-deleted).
 *
 *   4. GET /api/cmc/overview (server/api/cmc/portfolio.ts:68)
 *      → reg_submissions (sub_id, product_id, region, sub_type, tenant_id) is the
 *        one-row-per-submission list; per row it counts open reg_questions,
 *        reg_obligations and reg_m3_sections keyed by sub_id. Org col on the
 *        parent: tenant_id (int).
 *      Faithfulness caveats encoded as guards:
 *        • reg_submissions / reg_m3_sections are created only by the legacy
 *          regulatory-foundation SQL (sub_id shape); the canonical drizzle
 *          schema does not define them. Guarded on table + tenant_id/sub_id.
 *        • the canonical reg_questions is org-scoped (id, organization_id,
 *          question_text …) with NO sub_id, so the overview's
 *          `reg_questions WHERE sub_id = …` can never match it — a route/schema
 *          mismatch. We seed reg_questions ONLY when it actually has a sub_id
 *          column (i.e. the legacy IR-hub shape); otherwise we skip and note it.
 *        • the overview reads reg_m3_sections.up_stability, a column no migration
 *          creates (the real column is upstream_json). We seed upstream_json
 *          (real) so the missing-section count is honest; the coverage subquery
 *          stays null, matching production.
 *
 *   5. PDEV → IND workflow (pdev_program_activities, read by
 *      server/services/pdev/pdev-readiness-service.ts and the pdev routes,
 *      tenant-isolated by joining regulatory_programs). One row per
 *      (program_id, activity_key); UNIQUE (program_id, activity_key).
 *      activity_key / workstream / stage / state values come from the closed
 *      registry in server/services/pdev/pdev-activity-registry.ts.
 *
 * DDL sources:
 *   migrations/20260524_program_workbench_schema.sql   regulatory_programs
 *   db/migrations/20260331_regulatory_correspondence_os.sql  c2c_submissions,
 *                                                            c2c_correspondence
 *   migrations/20260529_phase11_intelligence.sql        c2c_tlf_builds
 *   db/migrations/_legacy/060_regulatory_foundation.sql reg_submissions,
 *                                                       reg_m3_sections
 *   migrations/0000_sweet_joseph.sql                    reg_obligations,
 *                                                       reg_questions
 *   migrations/20260520_pdev_workflow_activities.sql    pdev_program_activities
 *
 * Program naming is consistent with the established demo universe (org
 * 'Concept2Cure', biologics BX-099/BX-256/BX-301/BX-420 and the 70-vault memory
 * atoms): BX-099 → MAA (EU), BX-301 → BLA (US), BX-420 → J-NDA (Japan) are the
 * three biopharma programs; BX-256 and BX-512 are the two PDEV INDs.
 *
 * Idempotency: programs key on the UNIQUE (organization_id, code); TLF builds on
 * the text PK id; correspondence on (organization_id, source_message_id);
 * submissions on (tenant_id, product_id, sub_type); m3 sections on (sub_id, code);
 * obligations on (sub_id, title); pdev activities on (program_id, activity_key).
 * Re-running inserts nothing new.
 */

async function tableExists(client, table) {
  const { rows } = await client.query('SELECT to_regclass($1) AS t', [`public.${table}`]);
  return Boolean(rows[0]?.t);
}

async function hasColumn(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

/* Resolve a user id by email (team members are created by the parent script
   before domain modules run); fall back to admin. */
async function resolveUserId(client, email, admin) {
  const { rows } = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
  return rows[0]?.id ?? admin.id;
}

/* ── Correspondence parent resolvers (SAVEPOINT-guarded) ──────────────────────
   Mirror the resolve-or-create pattern used by 70-vault so a missing parent
   degrades to a skipped part rather than aborting the orchestrator tx. */

async function resolveWorkspaceId(client, org, admin) {
  if (!(await tableExists(client, 'client_workspaces'))) return null;
  try {
    await client.query('SAVEPOINT sp_pgm_ws');
    let { rows } = await client.query(
      'SELECT id FROM client_workspaces WHERE organization_id = $1 ORDER BY id LIMIT 1',
      [org.id],
    );
    if (!rows[0]) {
      await client.query(
        `INSERT INTO client_workspaces (organization_id, name, slug, status, created_by_id)
         VALUES ($1, 'Concept2Cure Therapeutics', 'concept2cure', 'active', $2)
         ON CONFLICT (organization_id, slug) DO NOTHING`,
        [org.id, admin.id],
      );
      ({ rows } = await client.query(
        'SELECT id FROM client_workspaces WHERE organization_id = $1 ORDER BY id LIMIT 1',
        [org.id],
      ));
    }
    await client.query('RELEASE SAVEPOINT sp_pgm_ws');
    return rows[0]?.id ?? null;
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_pgm_ws');
    return null;
  }
}

/* Prefer an existing org project; only fabricate a minimal holder project in a
   bare DB so the correspondence chain has a valid project_id. */
async function resolveProjectId(client, org, admin) {
  const existing = await client.query(
    'SELECT id FROM projects WHERE organization_id = $1 ORDER BY id LIMIT 1',
    [org.id],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const wsId = await resolveWorkspaceId(client, org, admin);
  const name = 'Concept2Cure regulatory workspace';
  const desc = 'Container program for demo regulatory correspondence.';

  if (wsId !== null) {
    try {
      await client.query('SAVEPOINT sp_pgm_proj');
      const ins = await client.query(
        `INSERT INTO projects (organization_id, client_workspace_id, name, code, description,
           status, type, depth, priority)
         VALUES ($1, $2, $3, 'BX-DEMO', $4, 'active', 'regulatory', 0, 'high')
         RETURNING id`,
        [org.id, wsId, name, desc],
      );
      await client.query('RELEASE SAVEPOINT sp_pgm_proj');
      return ins.rows[0].id;
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT sp_pgm_proj');
    }
  }

  try {
    await client.query('SAVEPOINT sp_pgm_proj2');
    const ins = await client.query(
      `INSERT INTO projects (organization_id, name, code, description,
         status, type, depth, priority)
       VALUES ($1, $2, 'BX-DEMO', $3, 'active', 'regulatory', 0, 'high')
       RETURNING id`,
      [org.id, name, desc],
    );
    await client.query('RELEASE SAVEPOINT sp_pgm_proj2');
    return ins.rows[0].id;
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_pgm_proj2');
    return null;
  }
}

/* ── Regulatory programs fixture ───────────────────────────────────────────────
   program_type ∈ biopharma pathways so the /api/biopharma/programs filter admits
   them. product_type ∈ biologic|drug. status 'active'. */
const PROGRAMS = [
  {
    code: 'BX-099', name: 'BX-099 · generalized myasthenia gravis (MAA)',
    programType: 'MAA', productType: 'biologic', primaryAgency: 'EMA',
    targetAgencies: ['EMA'], productName: 'BX-099',
    indication: 'Generalized myasthenia gravis · anti-AChR antibody positive',
    status: 'active', phase: 'submission', priority: 'high',
    submitInDays: 45, progress: 71, kind: 'biopharma',
    metadata: { pathway: 'centralised', region: 'EU' },
  },
  {
    code: 'BX-301', name: 'BX-301 · paroxysmal nocturnal hemoglobinuria (BLA)',
    programType: 'BLA', productType: 'biologic', primaryAgency: 'FDA',
    targetAgencies: ['FDA'], productName: 'BX-301',
    indication: 'Paroxysmal nocturnal hemoglobinuria',
    status: 'active', phase: 'submission', priority: 'high',
    submitInDays: 90, progress: 58, kind: 'biopharma',
    metadata: { pathway: '351(a)', region: 'US' },
  },
  {
    code: 'BX-420', name: 'BX-420 · neuromyelitis optica (J-NDA)',
    programType: 'JNDA', productType: 'biologic', primaryAgency: 'PMDA',
    targetAgencies: ['PMDA'], productName: 'BX-420',
    indication: 'Neuromyelitis optica spectrum disorder',
    status: 'active', phase: 'submission', priority: 'medium',
    submitInDays: 150, progress: 44, kind: 'biopharma',
    metadata: { pathway: 'J-NDA', region: 'JP' },
  },
  {
    code: 'BX-256', name: 'BX-256 · systemic lupus erythematosus (IND)',
    programType: 'IND', productType: 'biologic', primaryAgency: 'FDA',
    targetAgencies: ['FDA'], productName: 'BX-256',
    indication: 'Systemic lupus erythematosus',
    status: 'active', phase: 'planning', priority: 'high',
    submitInDays: 210, progress: 62, kind: 'pdev',
    metadata: { blocker: 'Drug substance stability data pending 6-month pull' },
  },
  {
    code: 'BX-512', name: 'Vorelinib · KIT-mutant GIST (IND)',
    programType: 'IND', productType: 'drug', primaryAgency: 'FDA',
    targetAgencies: ['FDA'], productName: 'Vorelinib · BX-512',
    indication: 'KIT-mutant gastrointestinal stromal tumor · 4L+',
    status: 'active', phase: 'planning', priority: 'high',
    submitInDays: 270, progress: 39, kind: 'pdev',
    metadata: { blocker: 'GLP toxicology summary missing for Module 4' },
  },
];

async function seedPrograms(client, org, admin) {
  if (!(await tableExists(client, 'regulatory_programs'))) {
    console.log('   ⚠ regulatory_programs not found — skipping');
    return null;
  }
  const leadId = await resolveUserId(client, 'sarah.chen@concept2cure.pro', admin);

  const ids = {};
  let inserted = 0;
  let existing = 0;

  for (const p of PROGRAMS) {
    const found = await client.query(
      'SELECT id FROM regulatory_programs WHERE organization_id = $1 AND code = $2 LIMIT 1',
      [org.id, p.code],
    );
    if (found.rows[0]) {
      ids[p.code] = found.rows[0].id;
      existing += 1;
      continue;
    }
    const ins = await client.query(
      `INSERT INTO regulatory_programs (
         organization_id, name, code, program_type, product_type, primary_agency,
         target_agencies, product_name, indication, status, phase, priority,
         target_submission_date, progress_percent, lead_user_id, metadata, created_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7::json, $8, $9, $10, $11, $12,
         CURRENT_DATE + ($13::int * interval '1 day'), $14, $15, $16::json, $17
       )
       ON CONFLICT (organization_id, code) DO NOTHING
       RETURNING id`,
      [
        org.id, p.name, p.code, p.programType, p.productType, p.primaryAgency,
        JSON.stringify(p.targetAgencies), p.productName, p.indication, p.status,
        p.phase, p.priority, p.submitInDays, p.progress, leadId,
        JSON.stringify(p.metadata), 'sarah.chen@concept2cure.pro',
      ],
    );
    if (ins.rows[0]) {
      ids[p.code] = ins.rows[0].id;
      inserted += 1;
    } else {
      // Lost an insert race — re-resolve.
      const re = await client.query(
        'SELECT id FROM regulatory_programs WHERE organization_id = $1 AND code = $2 LIMIT 1',
        [org.id, p.code],
      );
      if (re.rows[0]) ids[p.code] = re.rows[0].id;
    }
  }

  const skippedNote = existing > 0 ? ` (${existing} already present)` : '';
  console.log(`   ✓ programs: ${inserted} regulatory programs seeded${skippedNote}`);
  return ids;
}

/* ── Regulatory correspondence fixture ──────────────────────────────────────── */
const SUBMISSIONS = [
  {
    key: 'bx099-maa',
    submissionType: 'MAA', regulator: 'EMA', center: 'CHMP',
    applicationNumber: 'EMEA/H/C/BX099', sequenceNumber: '0000',
    lifecycleState: 'under_review',
  },
  {
    key: 'bx301-bla',
    submissionType: 'BLA', regulator: 'FDA', center: 'CBER', division: 'DHT',
    applicationNumber: 'BLA-761301', sequenceNumber: '0002',
    lifecycleState: 'under_review',
  },
];

const CORRESPONDENCE = [
  {
    submission: 'bx099-maa', sourceMessageId: 'gademo-corr-bx099-loq120',
    direction: 'inbound', sourceChannel: 'agency_portal',
    communicationType: 'list_of_questions',
    subject: 'BX-099 MAA — day 120 list of questions',
    sender: 'EMA CHMP rapporteur',
    recipients: ['regulatory@concept2cure.pro'],
    receivedDaysAgo: 12, dueInDays: 78, urgency: 'high',
    responseRequired: true, status: 'new',
    summary:
      'Day-120 list of questions received from the rapporteur and co-rapporteur. '
      + 'Major objections focus on the immunogenicity strategy and one quality '
      + 'question on drug product comparability.',
  },
  {
    submission: 'bx099-maa', sourceMessageId: 'gademo-corr-bx099-resp120',
    direction: 'outbound', sourceChannel: 'agency_portal',
    communicationType: 'response',
    subject: 'BX-099 MAA — response to day 120 list of questions',
    sender: 'Concept2Cure regulatory affairs',
    recipients: ['ema-submissions@ema.europa.eu'],
    sentDaysAgo: 2, urgency: 'medium',
    responseRequired: false, status: 'submitted',
    summary:
      'Consolidated responses to the day-120 list of questions, including the '
      + 'revised immunogenicity risk assessment and updated comparability data '
      + 'package, submitted ahead of the clock restart.',
  },
  {
    submission: 'bx301-bla', sourceMessageId: 'gademo-corr-bx301-ir-cmc',
    direction: 'inbound', sourceChannel: 'esg',
    communicationType: 'information_request',
    subject: 'BX-301 BLA — information request (drug product stability)',
    sender: 'FDA CBER project manager',
    recipients: ['regulatory@concept2cure.pro'],
    receivedDaysAgo: 6, dueInDays: 24, urgency: 'high',
    responseRequired: true, status: 'in_review',
    summary:
      'Information request seeking additional long-term stability data for the '
      + 'drug product and clarification of the proposed shelf-life extrapolation.',
  },
  {
    submission: 'bx301-bla', sourceMessageId: 'gademo-corr-bx301-prebla-minutes',
    direction: 'inbound', sourceChannel: 'email',
    communicationType: 'meeting_minutes',
    subject: 'BX-301 BLA — type B pre-BLA meeting minutes',
    sender: 'FDA CBER regulatory project manager',
    recipients: ['regulatory@concept2cure.pro'],
    receivedDaysAgo: 40, urgency: 'medium',
    responseRequired: false, status: 'closed',
    summary:
      'Official minutes of the type B pre-BLA meeting. The agency agreed with the '
      + 'proposed clinical data package and requested the immunogenicity analysis '
      + 'plan be finalized before filing.',
  },
];

async function seedCorrespondence(client, org, admin) {
  if (!(await tableExists(client, 'c2c_correspondence'))) {
    console.log('   ⚠ c2c_correspondence not found — skipping');
    return;
  }
  if (!(await tableExists(client, 'c2c_submissions'))) {
    console.log('   ⚠ c2c_submissions not found — skipping correspondence');
    return;
  }
  const projectId = await resolveProjectId(client, org, admin);
  if (projectId === null) {
    console.log('   ⚠ no usable project for correspondence — skipping');
    return;
  }

  // Resolve-or-create the submission rows (parents of correspondence).
  const submissionIds = {};
  for (const s of SUBMISSIONS) {
    const found = await client.query(
      `SELECT id FROM c2c_submissions
        WHERE organization_id = $1 AND application_number = $2 LIMIT 1`,
      [org.id, s.applicationNumber],
    );
    if (found.rows[0]) {
      submissionIds[s.key] = found.rows[0].id;
      continue;
    }
    const ins = await client.query(
      `INSERT INTO c2c_submissions (
         organization_id, project_id, submission_type, regulator, center, division,
         application_number, sequence_number, lifecycle_state
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        org.id, projectId, s.submissionType, s.regulator, s.center ?? null,
        s.division ?? null, s.applicationNumber, s.sequenceNumber, s.lifecycleState,
      ],
    );
    submissionIds[s.key] = ins.rows[0].id;
  }

  let inserted = 0;
  let existing = 0;

  for (const c of CORRESPONDENCE) {
    const submissionId = submissionIds[c.submission];
    if (!submissionId) continue;

    const found = await client.query(
      `SELECT id FROM c2c_correspondence
        WHERE organization_id = $1 AND source_message_id = $2 LIMIT 1`,
      [org.id, c.sourceMessageId],
    );
    if (found.rows[0]) {
      existing += 1;
      continue;
    }
    await client.query(
      `INSERT INTO c2c_correspondence (
         organization_id, project_id, submission_id, direction, source_channel,
         communication_type, subject, sender, recipients, received_at, sent_at,
         due_date, urgency, response_required, status, source_message_id, summary
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9::jsonb,
         CASE WHEN $10::numeric IS NULL THEN NULL ELSE NOW() - ($10::numeric * interval '1 day') END,
         CASE WHEN $11::numeric IS NULL THEN NULL ELSE NOW() - ($11::numeric * interval '1 day') END,
         CASE WHEN $12::numeric IS NULL THEN NULL ELSE NOW() + ($12::numeric * interval '1 day') END,
         $13, $14, $15, $16, $17
       )`,
      [
        org.id, projectId, submissionId, c.direction, c.sourceChannel,
        c.communicationType, c.subject, c.sender ?? null, JSON.stringify(c.recipients ?? []),
        c.receivedDaysAgo ?? null, c.sentDaysAgo ?? null, c.dueInDays ?? null,
        c.urgency, c.responseRequired, c.status, c.sourceMessageId, c.summary,
      ],
    );
    inserted += 1;
  }

  const skippedNote = existing > 0 ? ` (${existing} already present)` : '';
  console.log(`   ✓ correspondence: ${inserted} correspondence rows seeded${skippedNote}`);
}

/* ── Biostat TLF build queue fixture ──────────────────────────────────────────
   project_id references a regulatory_programs.id (the clinical-stage biopharma
   programs BX-301 / BX-099). status ∈ queued|building|review|locked. */
const TLF_BUILDS = [
  {
    id: 'tlf_gademo_bx301_t1421', program: 'BX-301',
    what: 'Table 14.2.1 — primary efficacy analysis (LDH normalization)',
    dueInDays: 10, pct: 65, status: 'building',
  },
  {
    id: 'tlf_gademo_bx301_t1431', program: 'BX-301',
    what: 'Table 14.3.1 — treatment-emergent adverse events by SOC and PT',
    dueInDays: 6, pct: 80, status: 'review',
  },
  {
    id: 'tlf_gademo_bx301_f1423', program: 'BX-301',
    what: 'Figure 14.2.3 — Kaplan-Meier of time to first breakthrough hemolysis',
    dueInDays: 18, pct: 10, status: 'queued',
  },
  {
    id: 'tlf_gademo_bx099_l1621', program: 'BX-099',
    what: 'Listing 16.2.1 — subject disposition',
    dueInDays: -2, pct: 100, status: 'locked',
  },
  {
    id: 'tlf_gademo_bx099_t1412', program: 'BX-099',
    what: 'Table 14.1.2 — demographics and baseline characteristics',
    dueInDays: 14, pct: 45, status: 'building',
  },
];

async function seedTlfBuilds(client, org, admin, programIds) {
  if (!(await tableExists(client, 'c2c_tlf_builds'))) {
    console.log('   ⚠ c2c_tlf_builds not found — skipping');
    return;
  }
  if (!programIds) {
    console.log('   ⚠ no seeded programs for TLF builds — skipping');
    return;
  }
  const ownerId = await resolveUserId(client, 'david.kim@concept2cure.pro', admin);

  let inserted = 0;
  let skipped = 0;

  for (const t of TLF_BUILDS) {
    const projectId = programIds[t.program];
    if (!projectId) {
      skipped += 1;
      continue;
    }
    const r = await client.query(
      `INSERT INTO c2c_tlf_builds (id, project_id, what, due_at, pct_complete, status, owner_id, created_at)
       VALUES ($1, $2, $3, NOW() + ($4::numeric * interval '1 day'), $5, $6, $7,
               NOW() - (interval '20 day'))
       ON CONFLICT (id) DO NOTHING`,
      [t.id, projectId, t.what, t.dueInDays, t.pct, t.status, ownerId],
    );
    inserted += r.rowCount ?? 0;
  }

  const skipNote = skipped > 0 ? ` (${skipped} skipped — program not seeded)` : '';
  console.log(`   ✓ tlf: ${inserted} TLF builds seeded${skipNote}`);
}

/* ── CMC submission + Module-3 / obligation children ──────────────────────────
   Parent list: reg_submissions (org col tenant_id). Children keyed by sub_id.
   The CMC "project" is one IND CMC submission for BX-256 (drug substance focus). */
const CMC_SUB = {
  productId: 'BX-256', subType: 'IND', region: 'FDA', status: 'REVIEW',
  title: 'BX-256 · IND CMC (drug substance, Module 3)',
  description: 'Module 3 quality package for the BX-256 IND (mammalian cell culture).',
};

const CMC_M3_SECTIONS = [
  { code: '3.2.S.2.2', title: 'Description of manufacturing process and process controls', status: 'READY' },
  { code: '3.2.S.4.1', title: 'Specification (drug substance)', status: 'DRAFT' },
  { code: '3.2.P.5.1', title: 'Specification (drug product)', status: 'DRAFT' },
  { code: '3.2.P.8.3', title: 'Stability data (drug product)', status: 'DRAFT', coverageMonths: 6 },
];

const CMC_OBLIGATIONS = [
  {
    title: 'Submit updated drug substance stability data at 12-month pull',
    severity: 'MAJOR', status: 'OPEN', dueInDays: 60, priority: 'High',
  },
  {
    title: 'Provide validation report for the release potency assay',
    severity: 'MAJOR', status: 'IN_PROGRESS', dueInDays: 30, priority: 'High',
  },
  {
    title: 'Confirm CDMO GMP certificate renewal for drug product site',
    severity: 'MINOR', status: 'OPEN', dueInDays: -5, priority: 'Medium',
  },
];

async function seedCmc(client, org, admin) {
  if (!(await tableExists(client, 'reg_submissions'))) {
    console.log('   ⚠ reg_submissions not found — skipping CMC submission');
    return;
  }
  // The portfolio /overview shape is the legacy sub_id/tenant_id table; only seed
  // when those columns are actually present (a different reg_submissions shape
  // without tenant_id/sub_id belongs to another consumer and is left untouched).
  if (!(await hasColumn(client, 'reg_submissions', 'tenant_id'))
    || !(await hasColumn(client, 'reg_submissions', 'sub_id'))) {
    console.log('   ⚠ reg_submissions lacks tenant_id/sub_id (non-portfolio shape) — skipping CMC submission');
    return;
  }

  // Resolve-or-create the one CMC submission; children hang off its sub_id.
  let subId;
  const found = await client.query(
    `SELECT sub_id FROM reg_submissions
      WHERE tenant_id = $1 AND product_id = $2 AND sub_type = $3 LIMIT 1`,
    [org.id, CMC_SUB.productId, CMC_SUB.subType],
  );
  if (found.rows[0]) {
    subId = found.rows[0].sub_id;
  } else {
    const ins = await client.query(
      `INSERT INTO reg_submissions (tenant_id, product_id, sub_type, region, status, title, description, target_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE + interval '210 day')
       RETURNING sub_id`,
      [org.id, CMC_SUB.productId, CMC_SUB.subType, CMC_SUB.region, CMC_SUB.status, CMC_SUB.title, CMC_SUB.description],
    );
    subId = ins.rows[0].sub_id;
  }

  // Module-3 sections (child; FK to reg_submissions). Real column is
  // upstream_json — the overview reads up_stability, which no migration creates,
  // so the coverage subquery stays null in production; we record coverage in the
  // real column for honesty. Unique natural key (sub_id, code).
  let sectionsInserted = 0;
  if (await tableExists(client, 'reg_m3_sections') && await hasColumn(client, 'reg_m3_sections', 'sub_id')) {
    const hasUpstream = await hasColumn(client, 'reg_m3_sections', 'upstream_json');
    for (const s of CMC_M3_SECTIONS) {
      const exists = await client.query(
        'SELECT 1 FROM reg_m3_sections WHERE sub_id = $1 AND code = $2 LIMIT 1',
        [subId, s.code],
      );
      if (exists.rows[0]) continue;
      if (hasUpstream) {
        await client.query(
          `INSERT INTO reg_m3_sections (sub_id, code, title, status, upstream_json)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [subId, s.code, s.title, s.status,
            JSON.stringify(s.coverageMonths != null ? { coverage_months: s.coverageMonths } : {})],
        );
      } else {
        await client.query(
          `INSERT INTO reg_m3_sections (sub_id, code, title, status)
           VALUES ($1, $2, $3, $4)`,
          [subId, s.code, s.title, s.status],
        );
      }
      sectionsInserted += 1;
    }
  }

  // Obligations (child; keyed by sub_id, no FK). Natural key (sub_id, title).
  let obligationsInserted = 0;
  if (await tableExists(client, 'reg_obligations') && await hasColumn(client, 'reg_obligations', 'sub_id')) {
    for (const o of CMC_OBLIGATIONS) {
      const exists = await client.query(
        'SELECT 1 FROM reg_obligations WHERE sub_id = $1 AND title = $2 LIMIT 1',
        [subId, o.title],
      );
      if (exists.rows[0]) continue;
      await client.query(
        `INSERT INTO reg_obligations (sub_id, product_id, region, title, source, severity, status, priority, due_date)
         VALUES ($1, $2, $3, $4, 'AGENCY', $5, $6, $7,
                 NOW() + ($8::numeric * interval '1 day'))`,
        [subId, CMC_SUB.productId, CMC_SUB.region, o.title, o.severity, o.status, o.priority, o.dueInDays],
      );
      obligationsInserted += 1;
    }
  }

  // Information requests: the canonical reg_questions is org-scoped (no sub_id);
  // the overview's `reg_questions WHERE sub_id = …` can only match the legacy
  // IR-hub shape. Seed only if that shape is present.
  let questionsInserted = 0;
  let questionsSkipped = false;
  if (await tableExists(client, 'reg_questions')
    && await hasColumn(client, 'reg_questions', 'sub_id')
    && await hasColumn(client, 'reg_questions', 'question_text')) {
    const IR = [
      { q: 'Provide the drug substance stability protocol and 6-month data.', status: 'OPEN', dueInDays: 20 },
      { q: 'Clarify the shelf-life extrapolation for the drug product.', status: 'DRAFTED', dueInDays: 34 },
    ];
    for (const item of IR) {
      const exists = await client.query(
        'SELECT 1 FROM reg_questions WHERE sub_id = $1 AND question_text = $2 LIMIT 1',
        [subId, item.q],
      );
      if (exists.rows[0]) continue;
      await client.query(
        `INSERT INTO reg_questions (sub_id, question_text, status, due_date)
         VALUES ($1, $2, $3, CURRENT_DATE + ($4::int * interval '1 day'))`,
        [subId, item.q, item.status, item.dueInDays],
      );
      questionsInserted += 1;
    }
  } else if (await tableExists(client, 'reg_questions')) {
    questionsSkipped = true;
  }

  const parts = [`1 submission`, `${sectionsInserted} m3 sections`, `${obligationsInserted} obligations`];
  if (questionsInserted > 0) parts.push(`${questionsInserted} IRs`);
  const qNote = questionsSkipped ? ' (reg_questions is org-scoped — no sub_id, IRs skipped)' : '';
  console.log(`   ✓ cmc: ${parts.join(', ')} seeded${qNote}`);
}

/* ── PDEV → IND program activities ────────────────────────────────────────────
   activity_key / workstream / stage / state values are from the closed registry
   (server/services/pdev/pdev-activity-registry.ts). One row per
   (program_id, activity_key). */
const PDEV_ACTIVITIES = {
  'BX-512': [
    { key: 'cmc.ds_manufacturing', workstream: 'cmc', stage: 'late_pdev', state: 'approved',
      owner: 'lisa.johnson@concept2cure.pro', dueInDays: -20,
      notes: 'Drug substance process locked; batch records under QA review.' },
    { key: 'cmc.stability_program', workstream: 'cmc', stage: 'late_pdev', state: 'in_review',
      owner: 'lisa.johnson@concept2cure.pro', dueInDays: 25,
      notes: 'Stability protocol executing; 3-month pull complete.' },
    { key: 'nonclinical.glp_tox', workstream: 'nonclinical', stage: 'late_pdev', state: 'drafting',
      owner: 'raj.patel@concept2cure.pro', dueInDays: 40,
      notes: 'GLP toxicology summary in preparation — gates IND Module 4.' },
    { key: 'clinical.protocol_synopsis', workstream: 'clinical', stage: 'late_pdev', state: 'approved',
      owner: 'emily.watson@concept2cure.pro', dueInDays: -8,
      notes: 'FIH protocol synopsis approved for the Pre-IND package.' },
    { key: 'regulatory.pre_ind_request', workstream: 'regulatory', stage: 'pre_ind_meeting', state: 'submitted',
      owner: 'sarah.chen@concept2cure.pro', dueInDays: -3,
      notes: 'Type B Pre-IND meeting request submitted to the division.' },
  ],
  'BX-256': [
    { key: 'cmc.ds_manufacturing', workstream: 'cmc', stage: 'late_pdev', state: 'in_review',
      owner: 'lisa.johnson@concept2cure.pro', dueInDays: 15,
      notes: 'Drug substance manufacturing summary in second-reviewer QC.' },
    { key: 'cmc.stability_program', workstream: 'cmc', stage: 'late_pdev', state: 'drafting',
      owner: 'lisa.johnson@concept2cure.pro', dueInDays: 45,
      notes: 'Stability program initiated; 6-month pull pending.' },
    { key: 'nonclinical.glp_tox', workstream: 'nonclinical', stage: 'late_pdev', state: 'approved',
      owner: 'raj.patel@concept2cure.pro', dueInDays: -30,
      notes: 'GLP tox in two species complete and reported.' },
    { key: 'regulatory.pre_ind_request', workstream: 'regulatory', stage: 'pre_ind_meeting', state: 'drafting',
      owner: 'sarah.chen@concept2cure.pro', dueInDays: 30,
      notes: 'Pre-IND meeting request in draft pending nonclinical rollup.' },
  ],
};

async function seedPdevActivities(client, org, admin, programIds) {
  if (!(await tableExists(client, 'pdev_program_activities'))) {
    console.log('   ⚠ pdev_program_activities not found — skipping');
    return;
  }
  if (!programIds) {
    console.log('   ⚠ no seeded programs for PDEV activities — skipping');
    return;
  }

  const ownerCache = {};
  async function owner(email) {
    if (!(email in ownerCache)) ownerCache[email] = await resolveUserId(client, email, admin);
    return ownerCache[email];
  }

  let inserted = 0;
  let programs = 0;

  for (const [code, activities] of Object.entries(PDEV_ACTIVITIES)) {
    const programId = programIds[code];
    if (!programId) continue;
    programs += 1;
    for (const a of activities) {
      const ownerId = await owner(a.owner);
      const r = await client.query(
        `INSERT INTO pdev_program_activities (
           program_id, activity_key, workstream, stage, state, owner_user_id,
           reviewer_user_id, notes, due_date, state_changed_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           NOW() + ($9::numeric * interval '1 day'), $10
         )
         ON CONFLICT (program_id, activity_key) DO NOTHING`,
        [programId, a.key, a.workstream, a.stage, a.state, ownerId, admin.id, a.notes, a.dueInDays, admin.id],
      );
      inserted += r.rowCount ?? 0;
    }
  }

  console.log(`   ✓ pdev: ${inserted} program activities across ${programs} programs seeded`);
}

export default async function seed(client, { org, admin }) {
  const programIds = await seedPrograms(client, org, admin);
  await seedCorrespondence(client, org, admin);
  await seedTlfBuilds(client, org, admin, programIds);
  await seedCmc(client, org, admin);
  await seedPdevActivities(client, org, admin, programIds);
}
