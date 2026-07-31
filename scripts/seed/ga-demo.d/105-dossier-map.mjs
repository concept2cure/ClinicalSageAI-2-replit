/**
 * Wave-3 domain seed — CTD / eCTD dossier module map into the REAL store.
 *
 * Seeds the demo org's CTD dossier as real project_sections rows (BX-204 · BLA
 * 761xyz) — the canonical, org-scoped per-(project, section) tracking table a
 * tenant populates by creating a regulatory project and working its sections
 * through the authoring workflow (db/migrations/20260220_ind_section_tracking.sql),
 * and that GET /api/dossier-map now reads (see
 * server/services/dossier/dossier-map-view-assembler.ts). No blob, no fixture:
 * this is a real dossier a user could have authored, with real per-section status.
 *
 * The assembler rolls these sections up to CTD module grain and DERIVES each
 * module's completeness % and readiness tone from the section statuses, so the
 * statuses below are chosen to produce a believable mid-filing dossier
 * (M1 75%, M2 50%, M3 40%, M4 100%, M5 67%). Complete = approved / signed / locked.
 *
 * A parent project is required (project_sections.project_id is NOT NULL, FK
 * projects). We resolve-or-create a dedicated CTD demo project (+ a default
 * client workspace, since projects.client_workspace_id is NOT NULL). Idempotent:
 * the project is keyed by (organization_id, code) via an existence check, and the
 * sections by the table's own UNIQUE (project_id, section_code). to_regclass-guarded
 * so a bare DB degrades this block cleanly instead of aborting the run.
 */

// [eCTD section code, CTD module, section title, tracking status]. Real eCTD codes
// (m-prefixed) and real project_sections.status vocabulary; the assembler strips the
// leading 'm' for display and maps approved/signed/locked → complete.
const SECTIONS = [
  // Module 1 — Administrative & prescribing (3 of 4 complete → 75%)
  ['m1.1', 'M1', 'FDA Forms', 'approved'],
  ['m1.3.1', 'M1', 'Draft Labeling', 'approved'],
  ['m1.14.1', 'M1', 'Meeting Materials', 'signed'],
  ['m1.12.4', 'M1', 'Financial Disclosure', 'drafting'],
  // Module 2 — CTD summaries (2 of 4 complete → 50%)
  ['m2.3', 'M2', 'Quality Overall Summary', 'approved'],
  ['m2.4', 'M2', 'Nonclinical Overview', 'approved'],
  ['m2.5', 'M2', 'Clinical Overview', 'qa_review'],
  ['m2.7', 'M2', 'Clinical Summary', 'drafting'],
  // Module 3 — Quality (2 of 5 complete → 40%)
  ['m3.2.S.2', 'M3', 'Manufacture (Drug Substance)', 'approved'],
  ['m3.2.S.4', 'M3', 'Control of Drug Substance', 'approved'],
  ['m3.2.P.3', 'M3', 'Manufacture (Drug Product)', 'drafting'],
  ['m3.2.P.8', 'M3', 'Stability (Drug Product)', 'drafting'],
  ['m3.2.R', 'M3', 'Regional Information', 'not_started'],
  // Module 4 — Nonclinical study reports (3 of 3 complete → 100%)
  ['m4.2.1', 'M4', 'Pharmacology', 'approved'],
  ['m4.2.2', 'M4', 'Pharmacokinetics', 'approved'],
  ['m4.2.3', 'M4', 'Toxicology', 'signed'],
  // Module 5 — Clinical study reports (2 of 3 complete → 67%)
  ['m5.3.1', 'M5', 'Biopharmaceutic Study Reports', 'approved'],
  ['m5.3.5', 'M5', 'Efficacy & Safety Study Reports', 'approved'],
  ['m5.3.5.3', 'M5', 'Integrated Summary of Safety', 'drafting'],
];

const PROJECT_CODE = 'BX-204';
const PROJECT_NAME = 'BX-204 · BLA 761xyz (dossier map)';

async function has(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS c`, [`public.${table}`]);
  return !!r.rows[0]?.c;
}

/** Resolve the org's default client workspace, creating one if needed
 *  (projects.client_workspace_id is NOT NULL). Returns null if the table is absent. */
async function resolveWorkspaceId(client, org, userId) {
  if (!(await has(client, 'client_workspaces'))) return null;
  let { rows } = await client.query(
    'SELECT id FROM client_workspaces WHERE organization_id = $1 ORDER BY id LIMIT 1',
    [org.id],
  );
  if (rows[0]) return rows[0].id;
  await client.query(
    `INSERT INTO client_workspaces (organization_id, name, slug, status, created_by_id)
     VALUES ($1, 'Concept2Cure Therapeutics', 'concept2cure', 'active', $2)
     ON CONFLICT DO NOTHING`,
    [org.id, userId],
  );
  ({ rows } = await client.query(
    'SELECT id FROM client_workspaces WHERE organization_id = $1 ORDER BY id LIMIT 1',
    [org.id],
  ));
  return rows[0]?.id ?? null;
}

export default async function seed(client, { org, admin }) {
  for (const t of ['project_sections', 'projects']) {
    if (!(await has(client, t))) {
      console.log(`   ⚠ ${t} not found — run migrations first, skipping dossier-map seed`);
      return;
    }
  }

  // A real org member owns the project (projects.created_by_id / owner_id are FK users);
  // fall back to the demo admin the runner provides.
  const u = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 1`,
    [org.id],
  );
  const userId = u.rows[0]?.user_id ?? admin?.id ?? null;

  // Resolve-or-create the CTD demo project (idempotent by organization_id + code).
  let projectId;
  const existing = await client.query(
    `SELECT id FROM projects WHERE organization_id = $1 AND code = $2 ORDER BY id LIMIT 1`,
    [org.id, PROJECT_CODE],
  );
  if (existing.rows[0]) {
    projectId = existing.rows[0].id;
  } else {
    const wsId = await resolveWorkspaceId(client, org, userId);
    if (wsId === null) {
      console.log('   ⚠ client_workspaces unavailable — cannot create dossier-map project, skipping');
      return;
    }
    const ins = await client.query(
      `INSERT INTO projects (organization_id, client_workspace_id, name, code, description,
         status, type, depth, priority, created_by_id, owner_id)
       VALUES ($1, $2, $3, $4, $5, 'active', 'bla', 0, 'high', $6, $6)
       RETURNING id`,
      [
        org.id,
        wsId,
        PROJECT_NAME,
        PROJECT_CODE,
        'BLA 761xyz dossier — CTD module map demo (BX-204).',
        userId,
      ],
    );
    projectId = ins.rows[0].id;
  }

  // Seed the real CTD sections; idempotent via UNIQUE (project_id, section_code).
  let inserted = 0;
  for (const [code, mod, title, status] of SECTIONS) {
    const r = await client.query(
      `INSERT INTO project_sections (organization_id, project_id, section_code, module, title, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id, section_code) DO NOTHING`,
      [org.id, projectId, code, mod, title, status],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ dossier map: project ${projectId} (${PROJECT_CODE}) + ${inserted} real CTD project_sections seeded`);
}
