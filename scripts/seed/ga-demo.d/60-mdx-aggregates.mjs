/**
 * 60-mdx-aggregates.mjs — GA demo seed: the base rows the mdx analytics /
 * engineering / IVDR aggregate surfaces roll up, so those dashboards render
 * non-zero numbers instead of empty aggregates.
 *
 * Surfaces + the mdx-*.ts GET endpoints that back them:
 *
 *   1. AnalyticsSurface  (client useAnalytics → GET /api/mdx/analytics)
 *      server/routes/mdx-analytics.ts. The single kit-shaped aggregate reads:
 *        · regulatory_programs  — total/active/submitted/approved KPIs +
 *          pace24m (24-month bars from actual_submission_date), byPathway.
 *        · cerv2_510k_sections  — AnA acceptance rate + cycle-times by
 *          category (draft_source='ana', drafted_at, accepted_at).
 *        · c2c_blockers         — open-blocker root-cause list
 *          (blocker_type, MAX(document_family) AS pathway, status='open').
 *      (Its other facet routes also read submission_transmittals /
 *      submission_validation_findings [owned by 40-submission-udi], risk_items
 *      [owned by 10-risk], and clinical_studies* / chat_threads /
 *      client_memory_entries — not seeded here; see report.)
 *
 *   2. EngineeringSurface (client useEngineering → GET /api/mdx/engineering/:programId)
 *      server/routes/mdx-engineering.ts. Reads:
 *        · regulatory_programs   — program-ownership 404 gate (:programId).
 *        · cerv2_510k_sections   — dhfCompletion (category='device', required,
 *          status IN ('validated','approved')) + deliverables table.
 *        · concept2cure_artifacts — bomLines (ctd_section ILIKE '3.2.P%' OR
 *          type='bom') + deliverables (ctd_section ILIKE '3%'/'4%').
 *        · risk_items            — riskLastUpdated (owned by 10-risk; BX-204
 *          rows already carry program_id, so this lights up for free).
 *        NOTE: openEcrs filters c2c_blockers.category — a column that does NOT
 *        exist on c2c_blockers (route wraps it in try/catch → always 0). Not
 *        seedable without inventing schema; left at 0 (see report).
 *
 *   3. IvdSurface — "IVDR completeness" (server/routes/mdx-ivdr.ts aggregate
 *      GET /api/mdx/ivdr/:programId + list GET /api/mdx/ivdr/classifications,
 *      /api/mdx/ivdr/per). Reads:
 *        · ivdr_classifications  — classes/rules + NB-required KPI.
 *        · ivdr_per_documents    — PER completeness flags (scientific /
 *          analytical / clinical performance done) + nbTimeline.
 *      Since the D11d IVDR consolidation (2026-08-13) ivdr_classifications
 *      has ONE canonical shape (ivdr_class / companion_diagnostic / … plus
 *      the module columns intended_purpose / rule_trace / analytes), the kit
 *      IvdSurface lists classifications through GET /api/mdx/ivdr/
 *      classifications, and the module detail panels still read GET
 *      /api/ivdr/{validations,clinical-evidence,gspr-checklist}
 *      (ivdr_analytical_validations, ivdr_clinical_evidence,
 *      ivdr_gspr_assessments — all on the durable migration path now). This
 *      module writes canonical columns only; the deprecated shape-1 names
 *      are never repopulated.
 *
 * DDL sources: migrations/0000_sweet_joseph.sql (cerv2_510k_sections,
 * concept2cure_artifacts, regulatory_programs, projects, client_workspaces),
 * migrations/20260506_kit_section_draft_provenance.sql (draft_source/
 * drafted_at/accepted_at), migrations/20260524_c2c_blockers.sql +
 * 0002_phase15_submission_ops.sql (c2c_blockers), migrations/
 * 20260508_ivd_diagnostic_surfaces.sql + 20260813c_ivdr_schema_
 * reconciliation.sql (canonical ivdr_classifications/ivdr_per_documents +
 * ivdr_gspr_assessments), and migrations/001_create_ivdr_tables.sql
 * (ivdr_analytical_validations / ivdr_clinical_evidence).
 *
 * Tenant scoping matches each read exactly: organization_id (int) on
 * regulatory_programs / cerv2_510k_sections / concept2cure_artifacts /
 * ivdr_*; org_id (int) on c2c_blockers. Program links use the deterministic
 * UUIDs from scripts/seed-mdx-beta.mjs so every seeder converges.
 *
 * Conventions: runs inside the orchestrator's open transaction (no
 * BEGIN/COMMIT); every table guarded via to_regclass; every risky part wrapped
 * in a SAVEPOINT so a schema drift degrades to a skip instead of aborting the
 * whole seed; idempotent (ON CONFLICT on natural unique keys, else
 * SELECT-before-INSERT). Program-consistent Concept2Cure demo data, sentence
 * case, no emoji.
 */

/* Deterministic program UUIDs — must match scripts/seed-mdx-beta.mjs PROG so
   this seeder, 10-risk.mjs, and the beta seeder all converge on one row set. */
const PROG = {
  BX_204: '11111111-2222-3333-4444-000000000204', // CGM (device / 510k)
  OR_801: '11111111-2222-3333-4444-000000000801', // pedicle screw (510k)
  RX_340: '11111111-2222-3333-4444-000000000340', // surgical stapler (510k)
  PM_660: '11111111-2222-3333-4444-000000000660', // patient monitor / SaMD (510k)
  NM_512: '11111111-2222-3333-4444-000000000512', // neuromodulation lead (pma)
  IV_415: '11111111-2222-3333-4444-000000000415', // companion diagnostic (cer / IVD)
  CV_117: '11111111-2222-3333-4444-000000000117', // ECG patch — cleared (510k)
};

/* ─── low-level helpers ─────────────────────────────────────────────── */

async function tableExists(client, table) {
  const { rows } = await client.query(`SELECT to_regclass($1) AS t`, [`public.${table}`]);
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

/* Resolve a user id for program leadership; fall back to admin. */
async function resolveUserId(client, email, admin) {
  const { rows } = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
  return rows[0]?.id ?? admin.id;
}

/* Run one part inside a SAVEPOINT so a failed statement (schema drift, an
   unexpected NOT NULL) rolls back only that part rather than aborting the
   orchestrator's whole transaction (Postgres 25P02). Returns the fn result,
   or null on rollback. */
let __sp = 0;
async function runPart(client, label, fn) {
  const name = `sp_mdxagg_${__sp++}`;
  await client.query(`SAVEPOINT ${name}`);
  try {
    const out = await fn();
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return out;
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    console.log(`   ⚠ mdx-aggregates: ${label} skipped — ${err.message?.split('\n')[0] ?? err}`);
    return null;
  }
}

/* ─── regulatory_programs — analytics portfolio / pace + program scoping ── */

const PROGRAMS = [
  { id: PROG.BX_204, code: 'BX-204', name: 'BX-204 Continuous Glucose Monitor', productName: 'BX-204 CGM',
    programType: '510K', productType: 'device', deviceClass: 'II', path: '510k', agency: 'FDA',
    status: 'active',    phase: 'authoring',   priority: 'high',   submittedMonthsAgo: null, approvedMonthsAgo: null },
  { id: PROG.OR_801, code: 'OR-801', name: 'OR-801 Pedicle Screw System', productName: 'OR-801 Pedicle Screw System',
    programType: '510K', productType: 'device', deviceClass: 'II', path: '510k', agency: 'FDA',
    status: 'submitted', phase: 'in_review',   priority: 'high',   submittedMonthsAgo: 2,    approvedMonthsAgo: null },
  { id: PROG.RX_340, code: 'RX-340', name: 'RX-340 Surgical Stapler', productName: 'RX-340 Surgical Stapler',
    programType: '510K', productType: 'device', deviceClass: 'II', path: '510k', agency: 'FDA',
    status: 'active',    phase: 'predicate',   priority: 'medium', submittedMonthsAgo: 14,   approvedMonthsAgo: null },
  { id: PROG.PM_660, code: 'PM-660', name: 'PM-660 Patient Monitor', productName: 'PM-660 Patient Monitor',
    programType: '510K', productType: 'device', deviceClass: 'II', path: '510k', agency: 'FDA',
    status: 'approved',  phase: 'cleared',     priority: 'medium', submittedMonthsAgo: 8,    approvedMonthsAgo: 2 },
  { id: PROG.NM_512, code: 'NM-512', name: 'NM-512 Neuromodulation Lead', productName: 'NM-512 Lead',
    programType: 'PMA',  productType: 'device', deviceClass: 'III', path: 'pma', agency: 'FDA',
    status: 'blocked',   phase: 'manufacturing', priority: 'high', submittedMonthsAgo: 19,   approvedMonthsAgo: null },
  { id: PROG.IV_415, code: 'IV-415', name: 'IV-415 Companion Diagnostic', productName: 'IV-415 CoDx Assay',
    programType: 'CER',  productType: 'ivd',    deviceClass: 'III', path: 'cer', agency: 'EMA',
    status: 'active',    phase: 'clinical_evaluation', priority: 'high', submittedMonthsAgo: null, approvedMonthsAgo: null },
  { id: PROG.CV_117, code: 'CV-117', name: 'CV-117 ECG Patch', productName: 'CV-117 ECG Patch',
    programType: '510K', productType: 'device', deviceClass: 'II', path: '510k', agency: 'FDA',
    status: 'complete',  phase: 'cleared',     priority: 'low',    submittedMonthsAgo: 5,    approvedMonthsAgo: 4 },
];

async function seedPrograms(client, org, admin) {
  if (!(await tableExists(client, 'regulatory_programs'))) {
    console.log('   ⚠ regulatory_programs not found — skipping (portfolio/pace/program scoping will be empty)');
    return 0;
  }
  const leadUserId = await resolveUserId(client, 'admin@concept2cure.pro', admin);
  let inserted = 0;
  for (const p of PROGRAMS) {
    const found = await client.query(
      `SELECT id FROM regulatory_programs WHERE organization_id = $1 AND code = $2 LIMIT 1`,
      [org.id, p.code],
    );
    if (found.rows[0]) continue;
    const ok = await runPart(client, `program ${p.code}`, async () => {
      await client.query(
        `INSERT INTO regulatory_programs (
           id, organization_id, name, code, description, program_type, product_type,
           device_class, regulatory_path, primary_agency, product_name, status, phase, priority,
           actual_submission_date, approval_date, created_at, updated_at, lead_user_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           CASE WHEN $15::int IS NULL THEN NULL ELSE NOW() - ($15 * interval '1 month') END,
           CASE WHEN $16::int IS NULL THEN NULL ELSE NOW() - ($16 * interval '1 month') END,
           NOW(), NOW(), $17
         )
         ON CONFLICT DO NOTHING`,
        [
          p.id, org.id, p.name, p.code,
          `${p.name} — Concept2Cure demo program.`,
          p.programType, p.productType, p.deviceClass, p.path, p.agency, p.productName,
          p.status, p.phase, p.priority, p.submittedMonthsAgo, p.approvedMonthsAgo, leadUserId,
        ],
      );
      return true;
    });
    if (ok) inserted += 1;
  }
  console.log(`   ✓ mdx-aggregates: ${inserted} regulatory programs seeded (portfolio + 24-month pace)`);
  return inserted;
}

/* ─── projects backing FK for c2c_blockers + concept2cure_artifacts ─────── */

/* Both c2c_blockers.project_id and concept2cure_artifacts.project_id are
   NOT NULL and FK → projects(id). Resolve an existing project, else create a
   client_workspace + project with just the columns that are NOT NULL on this
   database (introspected), inside a SAVEPOINT. Returns id or null. */
async function resolveProjectId(client, org) {
  if (!(await tableExists(client, 'projects'))) return null;
  const existing = await client.query(
    `SELECT id FROM projects WHERE organization_id = $1 ORDER BY id LIMIT 1`,
    [org.id],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  return runPart(client, 'demo project bootstrap', async () => {
    let workspaceId = null;
    if (await tableExists(client, 'client_workspaces')) {
      const wf = await client.query(
        `SELECT id FROM client_workspaces WHERE organization_id = $1 ORDER BY id LIMIT 1`,
        [org.id],
      );
      if (wf.rows[0]) {
        workspaceId = wf.rows[0].id;
      } else {
        const ins = await client.query(
          `INSERT INTO client_workspaces (organization_id, name, slug, status, created_at, updated_at)
           VALUES ($1, 'Concept2Cure demo workspace', 'concept2cure-demo', 'active', NOW(), NOW())
           ON CONFLICT (organization_id, slug) DO NOTHING
           RETURNING id`,
          [org.id],
        );
        workspaceId = ins.rows[0]?.id
          ?? (await client.query(
                `SELECT id FROM client_workspaces WHERE organization_id = $1 AND slug = 'concept2cure-demo' LIMIT 1`,
                [org.id],
              )).rows[0]?.id ?? null;
      }
    }

    const cols = await columnSet(client, 'projects');
    // Only the NOT NULL/no-default columns need explicit values; the rest
    // default. Build the column list from what actually exists.
    const fields = [];
    const vals = [];
    const push = (col, val) => { if (cols.has(col)) { fields.push(col); vals.push(val); } };
    push('organization_id', org.id);
    if (cols.has('client_workspace_id')) {
      if (workspaceId === null) throw new Error('client_workspace_id is required but no workspace could be resolved');
      fields.push('client_workspace_id'); vals.push(workspaceId);
    }
    push('name', 'Concept2Cure device portfolio');
    push('code', 'C2C-PORT');
    push('status', 'active');
    push('priority', 'high');
    push('type', '510k');
    push('depth', 0);
    push('knowledge_token_estimate', 0);
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    const ins = await client.query(
      `INSERT INTO projects (${fields.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      vals,
    );
    return ins.rows[0]?.id ?? null;
  });
}

/* ─── cerv2_510k_sections — analytics AnA metrics + engineering DHF ─────── */

/* Org-scoped (no program_id column). draftSource='ana' + drafted/accepted
   drives analytics acceptance rate + cycle-times; category='device' + required
   + validated/approved drives engineering dhfCompletion; every device-category
   row also appears in the engineering deliverables table. */
const SECTIONS = [
  { num: 'DHF-10', key: 'device-description-bx204',      title: 'Device description — BX-204 CGM',                cat: 'device',         req: true, status: 'validated',       pct: 100, draft: 'ana',   draftedDaysAgo: 30, acceptedDaysAgo: 24 },
  { num: 'DHF-11', key: 'substantial-equivalence-bx204', title: 'Substantial equivalence discussion — BX-204',    cat: 'device',         req: true, status: 'approved',        pct: 100, draft: 'ana',   draftedDaysAgo: 28, acceptedDaysAgo: 20, content: 'Subject device is substantially equivalent to predicate K221847 (Dexcom G7 CGM System). See device description and bench performance for supporting data.' },
  { num: 'DHF-12', key: 'sterilization-bx204',           title: 'Sterilization and shelf life — BX-204',          cat: 'device',         req: true, status: 'validated',       pct: 100, draft: 'human', draftedDaysAgo: null, acceptedDaysAgo: null },
  { num: 'DHF-13', key: 'emc-safety-bx204',              title: 'Electromagnetic compatibility and safety — BX-204', cat: 'device',      req: true, status: 'approved',        pct: 100, draft: 'human', draftedDaysAgo: null, acceptedDaysAgo: null },
  { num: 'DHF-14', key: 'human-factors-bx204',           title: 'Human factors and usability engineering — BX-204', cat: 'device',       req: true, status: 'in_review',       pct: 85,  draft: 'ana',   draftedDaysAgo: 19, acceptedDaysAgo: 10 },
  { num: 'DHF-15', key: 'risk-management-file-bx204',    title: 'Risk management file (ISO 14971) — BX-204',      cat: 'device',         req: true, status: 'drafting',        pct: 60,  draft: 'human', draftedDaysAgo: null, acceptedDaysAgo: null },
  { num: 'SW-14',  key: 'software-architecture-bx204',   title: 'Software architecture and IEC 62304 — BX-204',   cat: 'software',       req: true, status: 'validated',       pct: 100, draft: 'ana',   draftedDaysAgo: 26, acceptedDaysAgo: 18 },
  { num: 'SW-20',  key: 'cybersecurity-sbom-bx204',      title: 'Cybersecurity and SBOM — BX-204',                cat: 'software',       req: true, status: 'drafting',        pct: 45,  draft: 'ana',   draftedDaysAgo: 6,  acceptedDaysAgo: null },
  { num: 'TST-13', key: 'biocompatibility-bx204',        title: 'Biocompatibility per ISO 10993 — BX-204',        cat: 'testing',        req: true, status: 'in_review',       pct: 90,  draft: 'ana',   draftedDaysAgo: 22, acceptedDaysAgo: 12 },
  { num: 'TST-16', key: 'performance-bench-bx204',       title: 'Performance testing — bench — BX-204',           cat: 'testing',        req: true, status: 'validated',       pct: 100, draft: 'human', draftedDaysAgo: null, acceptedDaysAgo: null },
  { num: 'CLN-18', key: 'performance-clinical-bx204',    title: 'Performance testing — clinical — BX-204',        cat: 'clinical',       req: true, status: 'drafting',        pct: 50,  draft: 'ana',   draftedDaysAgo: 5,  acceptedDaysAgo: null },
  { num: 'ADM-05', key: '510k-summary-bx204',            title: '510(k) summary — BX-204',                        cat: 'administrative', req: true, status: 'drafting',        pct: 40,  draft: 'human', draftedDaysAgo: null, acceptedDaysAgo: null },
];

async function seedSections(client, org, admin) {
  if (!(await tableExists(client, 'cerv2_510k_sections'))) {
    console.log('   ⚠ cerv2_510k_sections not found — skipping (analytics AnA metrics + engineering DHF empty)');
    return;
  }
  const cols = await columnSet(client, 'cerv2_510k_sections');
  const hasProvenance = ['draft_source', 'drafted_at', 'accepted_at'].every((c) => cols.has(c));
  let inserted = 0;
  let existing = 0;
  for (const s of SECTIONS) {
    const found = await client.query(
      `SELECT id FROM cerv2_510k_sections WHERE organization_id = $1 AND section_key = $2 LIMIT 1`,
      [org.id, s.key],
    );
    if (found.rows[0]) { existing += 1; continue; }

    const fields = ['organization_id', 'section_number', 'section_title', 'section_key', 'category',
      'is_required', 'status', 'completion_percentage', 'level', 'display_order', 'content',
      'created_at', 'updated_at'];
    const params = [org.id, s.num, s.title, s.key, s.cat, s.req, s.status, s.pct, 1,
      Number(String(s.num).replace(/\D/g, '')) || 100, s.content ?? ''];
    // created_at / updated_at as literals so ordering (last_edit DESC) looks real.
    const literals = {
      created_at: `NOW() - interval '${s.draftedDaysAgo ?? 40} days'`,
      updated_at: `NOW() - interval '${s.acceptedDaysAgo ?? s.draftedDaysAgo ?? 3} days'`,
    };
    if (hasProvenance && s.draft === 'ana') {
      fields.splice(fields.indexOf('created_at'), 0, 'draft_source', 'drafted_at', 'accepted_at');
      params.push('ana');
      literals.drafted_at = `NOW() - interval '${s.draftedDaysAgo} days'`;
      literals.accepted_at = s.acceptedDaysAgo === null ? 'NULL' : `NOW() - interval '${s.acceptedDaysAgo} days'`;
    }

    // Build the VALUES list: params get $-placeholders, timestamp columns get
    // literals. draft_source is a param; drafted_at/accepted_at are literals.
    const valueSql = [];
    let pi = 0;
    for (const f of fields) {
      if (f === 'drafted_at' || f === 'accepted_at' || f === 'created_at' || f === 'updated_at') {
        valueSql.push(literals[f]);
      } else {
        pi += 1;
        valueSql.push(`$${pi}`);
      }
    }
    const ok = await runPart(client, `section ${s.key}`, async () => {
      await client.query(
        `INSERT INTO cerv2_510k_sections (${fields.join(', ')}) VALUES (${valueSql.join(', ')})`,
        params,
      );
      return true;
    });
    if (ok) inserted += 1;
  }
  const note = existing > 0 ? ` (${existing} already present)` : '';
  console.log(`   ✓ mdx-aggregates: ${inserted} kit sections seeded — AnA drafts + device DHF${note}`);
}

/* ─── c2c_blockers — analytics open-blocker root-cause list ────────────── */

const BLOCKERS = [
  { key: 'bx204-pred-perf',  type: 'validation_failure',  family: '510k', severity: 'high',     status: 'open',     title: 'Predicate K221847 performance data mismatch', desc: 'Bench accuracy delta versus the cited predicate exceeds the equivalence margin in the low-glucose range.', next: 'Re-run comparative bench study with revised low-range calibration.', owner: 'S. Chen' },
  { key: 'bx204-sbom',       type: 'missing_artifact',    family: '510k', severity: 'medium',   status: 'open',     title: 'Cybersecurity SBOM not finalized',            desc: 'Software bill of materials for the transmitter firmware is incomplete; three third-party components remain unversioned.', next: 'Complete SBOM and map residual CVEs to mitigations.', owner: 'A. Muller' },
  { key: 'or801-biocompat',  type: 'approval_pending',    family: '510k', severity: 'high',     status: 'open',     title: 'Biocompatibility report pending supplier signature', desc: 'ISO 10993 evaluation report awaits the contract laboratory countersignature before it can be locked.', next: 'Escalate to supplier quality for signature by end of week.', owner: 'D. Kim' },
  { key: 'iv415-faers',      type: 'unresolved_review',   family: 'cer',  severity: 'critical', status: 'open',     title: 'FAERS signal adjudication — 3 events under review', desc: 'Three adverse-event reports require clinical adjudication before the clinical evaluation report can close.', next: 'Convene safety review board for signal disposition.', owner: 'R. Patel' },
  { key: 'nm512-qs',         type: 'requested_changes',   family: 'pma',  severity: 'medium',   status: 'open',     title: 'QS audit finding 21 CFR 820.50 — supplier controls', desc: 'Supplier control procedure lacks documented acceptance activities for a critical component.', next: 'Update purchasing controls and re-audit the supplier.', owner: 'D. Kim' },
  { key: 'bx204-labeling',   type: 'overdue_review',      family: '510k', severity: 'low',      status: 'resolved', title: 'IFU labeling review overdue',                 desc: 'Instructions-for-use review passed its target date; resolved after the labeling revision was approved.', next: 'Closed — labeling rev D approved.', owner: 'E. Watson' },
];

async function seedBlockers(client, org, projectId) {
  if (!(await tableExists(client, 'c2c_blockers'))) {
    console.log('   ⚠ c2c_blockers not found — skipping (analytics blockers list empty)');
    return;
  }
  if (projectId === null) {
    console.log('   ⚠ c2c_blockers: no backing project could be resolved — skipping blockers');
    return;
  }
  let inserted = 0;
  for (const b of BLOCKERS) {
    const ok = await runPart(client, `blocker ${b.key}`, async () => {
      const r = await client.query(
        `INSERT INTO c2c_blockers (
           blocker_id, org_id, project_id, blocker_type, document_family,
           severity, title, description, next_action, owner_name, status,
           created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
         )
         ON CONFLICT (blocker_id) DO NOTHING`,
        [
          `blk_demo_${b.key}`, org.id, projectId, b.type, b.family,
          b.severity, b.title, b.desc, b.next, b.owner, b.status,
        ],
      );
      return r.rowCount > 0;
    });
    if (ok) inserted += 1;
  }
  console.log(`   ✓ mdx-aggregates: ${inserted} submission blockers seeded (analytics root-cause list)`);
}

/* ─── concept2cure_artifacts — engineering BOM lines + deliverables ─────── */

const ARTIFACTS = [
  { key: 'art-bx204-bom-drug',    type: 'bom',           category: 'cmc',         section: '3.2.P.1', status: 'approved', title: 'BX-204 sensor assembly bill of materials',      content: 'Bill of materials for the BX-204 sensor and applicator assembly (revision C).' },
  { key: 'art-bx204-bom-device',  type: 'bom',           category: 'engineering', section: '3.2.P.3', status: 'locked',   title: 'BX-204 transmitter bill of materials',          content: 'Bill of materials for the BX-204 BLE transmitter (revision B).' },
  { key: 'art-bx204-spec-elec',   type: 'specification', category: 'engineering', section: '3.2.R',   status: 'approved', title: 'BX-204 electronics design specification',       content: 'Electronics design specification covering the analog front end and BLE radio.' },
  { key: 'art-bx204-drawing',     type: 'drawing',       category: 'engineering', section: '4.2.1',   status: 'draft',    title: 'BX-204 mechanical assembly drawing',            content: 'Mechanical assembly drawing set for the wearable housing and adhesive patch.' },
  { key: 'art-bx204-verif',       type: 'report',        category: 'engineering', section: '4.2.2',   status: 'in_review', title: 'BX-204 design verification report',            content: 'Design verification report summarizing bench and environmental testing.' },
  { key: 'art-bx204-trace',       type: 'matrix',        category: 'engineering', section: '3.2.R',   status: 'draft',    title: 'BX-204 requirements traceability matrix',       content: 'Traceability matrix linking user needs to design inputs, outputs, and verification.' },
];

async function seedArtifacts(client, org, admin, projectId) {
  if (!(await tableExists(client, 'concept2cure_artifacts'))) {
    console.log('   ⚠ concept2cure_artifacts not found — skipping (engineering BOM + deliverables empty)');
    return;
  }
  if (projectId === null) {
    console.log('   ⚠ concept2cure_artifacts: no backing project could be resolved — skipping artifacts');
    return;
  }
  const cols = await columnSet(client, 'concept2cure_artifacts');
  const hasCreatedBy = cols.has('created_by_id');
  let inserted = 0;
  for (const a of ARTIFACTS) {
    const ok = await runPart(client, `artifact ${a.key}`, async () => {
      const fields = ['artifact_id', 'project_id', 'organization_id', 'type', 'category',
        'title', 'content', 'version', 'ctd_section', 'status', 'created_at', 'updated_at'];
      const params = [a.key, projectId, org.id, a.type, a.category, a.title, a.content, 1, a.section, a.status];
      if (hasCreatedBy) { fields.splice(fields.indexOf('created_at'), 0, 'created_by_id'); params.push(admin.id); }
      const valueSql = [];
      let pi = 0;
      for (const f of fields) {
        if (f === 'created_at' || f === 'updated_at') valueSql.push('NOW()');
        else { pi += 1; valueSql.push(`$${pi}`); }
      }
      const r = await client.query(
        `INSERT INTO concept2cure_artifacts (${fields.join(', ')}) VALUES (${valueSql.join(', ')})
         ON CONFLICT (artifact_id) DO NOTHING`,
        params,
      );
      return r.rowCount > 0;
    });
    if (ok) inserted += 1;
  }
  console.log(`   ✓ mdx-aggregates: ${inserted} engineering artifacts seeded (BOM lines + deliverables)`);
}

/* ─── ivdr_classifications + ivdr_per_documents — IVDR completeness ─────── */

const IVDR_CLASSES = [
  { device: 'IV-415 companion diagnostic assay', ivdrClass: 'C', rule: '3', cdx: true,  selfTest: false, nearPatient: false, nb: 'BSI Group', nbId: '2797', cert: 'CE-IVD-2797-2025-041',
    intendedPurpose: 'Qualitative detection of the target biomarker to inform eligibility for the paired targeted therapy.',
    analytes: ['Target biomarker'], rationale: 'Companion diagnostic informing a treatment decision — IVDR Annex VIII Rule 3(f), Class C.' },
  { device: 'IV-415 control reagent kit',        ivdrClass: 'B', rule: '6', cdx: false, selfTest: false, nearPatient: false, nb: 'BSI Group', nbId: '2797', cert: 'CE-IVD-2797-2025-042',
    intendedPurpose: 'Positive and negative controls for the IV-415 assay workflow.',
    analytes: ['Assay control'], rationale: 'Control material not otherwise specified — IVDR Annex VIII Rule 6, Class B.' },
  { device: 'IV-415 analyte calibrator',         ivdrClass: 'B', rule: '6', cdx: false, selfTest: false, nearPatient: false, nb: 'BSI Group', nbId: '2797', cert: 'CE-IVD-2797-2025-043',
    intendedPurpose: 'Calibration material establishing metrological traceability for the IV-415 assay.',
    analytes: ['Calibrator'], rationale: 'Calibrator not otherwise specified — IVDR Annex VIII Rule 6, Class B.' },
];

const IVDR_PERS = [
  { device: 'IV-415 companion diagnostic assay', version: 'v1.2', status: 'approved', sci: true, anal: true,  clin: true,  pmpf: true,  dateMonthsAgo: 3,  author: 'Dr A. Muller', authorQual: 'PhD clinical chemistry, EU authorised person',
    conclusion: 'Scientific validity, analytical performance, and clinical performance are established; the benefit-risk balance is favourable for the intended purpose.' },
  { device: 'IV-415 companion diagnostic assay', version: 'v0.9', status: 'review',   sci: true, anal: true,  clin: false, pmpf: false, dateMonthsAgo: 7,  author: 'Dr A. Muller', authorQual: 'PhD clinical chemistry, EU authorised person',
    conclusion: 'Scientific validity and analytical performance complete; clinical performance study read-out pending.' },
  { device: 'IV-415 control reagent kit',        version: 'v1.0', status: 'draft',    sci: true, anal: false, clin: false, pmpf: false, dateMonthsAgo: 1,  author: 'L. Johnson', authorQual: 'Senior regulatory affairs specialist',
    conclusion: null },
];

async function seedIvdr(client, org) {
  const classIds = [];
  if (!(await tableExists(client, 'ivdr_classifications'))) {
    console.log('   ⚠ ivdr_classifications not found — skipping (IVDR classes/rules empty)');
  } else {
    const cols = await columnSet(client, 'ivdr_classifications');
    const hasNewShape = ['device_name', 'ivdr_class'].every((c) => cols.has(c));
    if (!hasNewShape) {
      console.log('   ⚠ ivdr_classifications lacks the device_name/ivdr_class shape — skipping classifications');
    } else {
      const hasProgram = cols.has('program_id');
      /* Canonical module columns (D11d consolidation) — presence-guarded so
         the seed converges on databases not yet reconciled by
         20260813c_ivdr_schema_reconciliation.sql. */
      const legacy = {
        intended_purpose: cols.has('intended_purpose'),
        rule_trace: cols.has('rule_trace'),
        analytes: cols.has('analytes'),
      };
      let inserted = 0;
      for (const c of IVDR_CLASSES) {
        const found = await client.query(
          `SELECT id FROM ivdr_classifications WHERE organization_id = $1 AND device_name = $2 LIMIT 1`,
          [org.id, c.device],
        );
        if (found.rows[0]) { classIds.push(found.rows[0].id); continue; }
        const id = await runPart(client, `ivdr class ${c.device}`, async () => {
          const fields = ['organization_id', 'device_name', 'ivdr_class', 'classification_rule',
            'rationale', 'companion_diagnostic', 'self_test', 'near_patient_test',
            'notified_body_required', 'notified_body_name', 'notified_body_id', 'certificate_no'];
          const params = [org.id, c.device, c.ivdrClass, c.rule, c.rationale, c.cdx, c.selfTest,
            c.nearPatient, c.ivdrClass !== 'A', c.nb, c.nbId, c.cert];
          if (hasProgram) { fields.push('program_id'); params.push(PROG.IV_415); }
          // Canonical module columns (intended_purpose / rule_trace / analytes
          // survived the D11d IVDR consolidation as canonical; the shape-1
          // duplicates classification / is_cdx / is_self_test / is_near_patient
          // are deprecated and deliberately UNWRITTEN — the backfill in
          // 20260813c_ivdr_schema_reconciliation.sql owns legacy data, and no
          // writer may repopulate the deprecated names). Column-guarded so the
          // seed still converges on a not-yet-reconciled database.
          if (legacy.intended_purpose) { fields.push('intended_purpose'); params.push(c.intendedPurpose); }
          if (legacy.rule_trace)       { fields.push('rule_trace');       params.push(JSON.stringify([{ rule: `Rule ${c.rule}`, matched: true, resultClass: c.ivdrClass }])); }
          if (legacy.analytes)         { fields.push('analytes');         params.push(JSON.stringify(c.analytes)); }
          const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
          const r = await client.query(
            `INSERT INTO ivdr_classifications (${fields.join(', ')}) VALUES (${placeholders}) RETURNING id`,
            params,
          );
          return r.rows[0]?.id ?? null;
        });
        if (id != null) { classIds.push(id); inserted += 1; }
      }
      console.log(`   ✓ mdx-aggregates: ${inserted} IVDR classifications seeded (IV-415 CoDx)`);
    }
  }

  if (!(await tableExists(client, 'ivdr_per_documents'))) {
    console.log('   ⚠ ivdr_per_documents not found — skipping (IVDR PER completeness empty)');
  } else {
    const cols = await columnSet(client, 'ivdr_per_documents');
    const hasProgram = cols.has('program_id');
    let inserted = 0;
    for (const p of IVDR_PERS) {
      const found = await client.query(
        `SELECT id FROM ivdr_per_documents WHERE organization_id = $1 AND device_name = $2 AND per_version = $3 LIMIT 1`,
        [org.id, p.device, p.version],
      );
      if (found.rows[0]) continue;
      const ok = await runPart(client, `ivdr PER ${p.device} ${p.version}`, async () => {
        const fields = ['organization_id', 'device_name', 'per_version', 'per_status',
          'scientific_validity_done', 'analytical_performance_done', 'clinical_performance_done',
          'benefit_risk_conclusion', 'pmpf_plan_attached', 'author_name', 'author_qualifications', 'per_date'];
        const params = [org.id, p.device, p.version, p.status, p.sci, p.anal, p.clin,
          p.conclusion, p.pmpf, p.author, p.authorQual];
        // per_date is a literal interval (not a param); program_id, if present,
        // is appended after per_date so its placeholder follows the 11 params.
        const dateSql = `(NOW() - interval '${p.dateMonthsAgo} months')::date`;
        if (hasProgram) { fields.push('program_id'); params.push(PROG.IV_415); }
        const valueSql = [];
        let pi = 0;
        for (const f of fields) {
          if (f === 'per_date') { valueSql.push(dateSql); }
          else { pi += 1; valueSql.push(`$${pi}`); }
        }
        await client.query(
          `INSERT INTO ivdr_per_documents (${fields.join(', ')}) VALUES (${valueSql.join(', ')})`,
          params,
        );
        return true;
      });
      if (ok) inserted += 1;
    }
    console.log(`   ✓ mdx-aggregates: ${inserted} IVDR PER documents seeded (completeness flags)`);
  }

  return classIds;
}

/* ─── legacy ivdr-routes.ts detail tables — best-effort (guarded) ───────── */

const IVDR_VALIDATIONS = [
  { device: 'IV-415 companion diagnostic assay', analyte: 'Target biomarker', type: 'qualitative', status: 'pass', lod: 0.5, loq: 1.0, precisionCv: 4.2, sensitivity: 0.97, specificity: 0.95 },
  { device: 'IV-415 companion diagnostic assay', analyte: 'Assay control',    type: 'qualitative', status: 'pass', lod: null, loq: null, precisionCv: 3.1, sensitivity: null, specificity: null },
  { device: 'IV-415 analyte calibrator',         analyte: 'Calibrator',       type: 'quantitative', status: 'in_progress', lod: 0.3, loq: 0.8, precisionCv: 5.6, sensitivity: null, specificity: null },
];

const IVDR_EVIDENCE = [
  { study: 'IV-415 pivotal clinical performance study', type: 'clinical_performance', n: 412, tp: 188, fp: 12, tn: 200, fn: 12, status: 'completed' },
  { study: 'IV-415 concordance study versus trial assay', type: 'method_comparison', n: 260, tp: 118, fp: 6,  tn: 128, fn: 8,  status: 'completed' },
];

const GSPR_CHAPTERS = { I: [1, 9], II: [10, 18], III: [19, 23] };
function gsprRequirements() {
  const reqs = [];
  for (const [chapter, [lo, hi]] of Object.entries(GSPR_CHAPTERS)) {
    for (let n = lo; n <= hi; n++) {
      // Deterministic status spread: most compliant, a few partial / not assessed.
      const mod = n % 5;
      const status = mod === 0 ? 'not_assessed' : mod === 3 ? 'partially_compliant' : 'compliant';
      reqs.push({
        id: `gspr-${n}`, chapter, number: n,
        title: `GSPR ${n}`, status, applicable: true,
        evidenceLinks: status === 'compliant' ? [`TF-ANNEX-I-${n}`] : [],
        notes: '',
      });
    }
  }
  return reqs;
}

async function seedIvdrLegacyDetail(client, org, classIds) {
  // ivdr_analytical_validations
  if (await tableExists(client, 'ivdr_analytical_validations')) {
    const classId = classIds[0] ?? null;
    let inserted = 0;
    for (const v of IVDR_VALIDATIONS) {
      const found = await client.query(
        `SELECT id FROM ivdr_analytical_validations WHERE organization_id = $1 AND device_name = $2 AND analyte_name = $3 LIMIT 1`,
        [org.id, v.device, v.analyte],
      );
      if (found.rows[0]) continue;
      const ok = await runPart(client, `ivdr validation ${v.analyte}`, async () => {
        await client.query(
          `INSERT INTO ivdr_analytical_validations (
             classification_id, device_name, analyte_name, validation_type, status,
             lod, loq, precision_cv, sensitivity, specificity, organization_id, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW())`,
          [classId, v.device, v.analyte, v.type, v.status, v.lod, v.loq, v.precisionCv, v.sensitivity, v.specificity, org.id],
        );
        return true;
      });
      if (ok) inserted += 1;
    }
    if (inserted > 0) console.log(`   ✓ mdx-aggregates: ${inserted} IVDR analytical validations seeded (legacy IvdSurface)`);
  } else {
    console.log('   • ivdr_analytical_validations not present — skipped (created lazily by /api/ivdr routes)');
  }

  // ivdr_clinical_evidence
  if (await tableExists(client, 'ivdr_clinical_evidence')) {
    const classId = classIds[0] ?? null;
    let inserted = 0;
    for (const e of IVDR_EVIDENCE) {
      const found = await client.query(
        `SELECT id FROM ivdr_clinical_evidence WHERE organization_id = $1 AND study_title = $2 LIMIT 1`,
        [org.id, e.study],
      );
      if (found.rows[0]) continue;
      const ok = await runPart(client, `ivdr evidence ${e.study}`, async () => {
        const sens = e.tp + e.fn > 0 ? Number((e.tp / (e.tp + e.fn)).toFixed(4)) : null;
        const spec = e.tn + e.fp > 0 ? Number((e.tn / (e.tn + e.fp)).toFixed(4)) : null;
        const ppv = e.tp + e.fp > 0 ? Number((e.tp / (e.tp + e.fp)).toFixed(4)) : null;
        const npv = e.tn + e.fn > 0 ? Number((e.tn / (e.tn + e.fn)).toFixed(4)) : null;
        const acc = e.n > 0 ? Number(((e.tp + e.tn) / e.n).toFixed(4)) : null;
        await client.query(
          `INSERT INTO ivdr_clinical_evidence (
             classification_id, study_title, study_type, sample_size,
             true_positive, false_positive, true_negative, false_negative,
             calculated_sensitivity, calculated_specificity, calculated_ppv,
             calculated_npv, calculated_accuracy, status, organization_id, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, NOW())`,
          [classId, e.study, e.type, e.n, e.tp, e.fp, e.tn, e.fn, sens, spec, ppv, npv, acc, e.status, org.id],
        );
        return true;
      });
      if (ok) inserted += 1;
    }
    if (inserted > 0) console.log(`   ✓ mdx-aggregates: ${inserted} IVDR clinical evidence rows seeded (legacy IvdSurface)`);
  } else {
    console.log('   • ivdr_clinical_evidence not present — skipped (created lazily by /api/ivdr routes)');
  }

  // ivdr_gspr_assessments — project_id is the program UUID string the surface
  // passes to /api/ivdr/gspr-checklist/:projectId/matrix.
  if (await tableExists(client, 'ivdr_gspr_assessments')) {
    const found = await client.query(
      `SELECT id FROM ivdr_gspr_assessments WHERE organization_id = $1 AND project_id = $2 LIMIT 1`,
      [org.id, PROG.IV_415],
    );
    if (!found.rows[0]) {
      const ok = await runPart(client, 'ivdr gspr assessment', async () => {
        await client.query(
          `INSERT INTO ivdr_gspr_assessments (
             organization_id, project_id, device_name, classification, requirements, created_by, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [org.id, PROG.IV_415, 'IV-415 companion diagnostic assay', 'C', JSON.stringify(gsprRequirements()), 'seed'],
        );
        return true;
      });
      if (ok) console.log('   ✓ mdx-aggregates: 1 IVDR GSPR assessment seeded (Annex I completeness)');
    }
  } else {
    console.log('   • ivdr_gspr_assessments not present — skipped (created lazily by /api/ivdr routes)');
  }
}

/* ─── entrypoint ────────────────────────────────────────────────────────── */

export default async function seed(client, { org, admin }) {
  await seedPrograms(client, org, admin);
  await seedSections(client, org, admin);

  const projectId = await resolveProjectId(client, org);
  await seedBlockers(client, org, projectId);
  await seedArtifacts(client, org, admin, projectId);

  const classIds = await seedIvdr(client, org);
  await seedIvdrLegacyDetail(client, org, classIds ?? []);
}
