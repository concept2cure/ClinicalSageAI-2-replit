#!/usr/bin/env node
/**
 * seed-mdx-content.mjs — content data for MDX paying-client demo
 *
 * Companion to seed-mdx-beta.mjs. The base seed creates programs +
 * Q-Subs (the data-domain that's structurally complete out of the box).
 * This script extends with the content tables a paying-client demo
 * needs to demonstrate every kit surface working with real data:
 *
 *   - cerv2_510k_sections   → K510Surface eSTAR list, PMA modules,
 *                              CER sections panel, all three editors
 *   - c2c_submission_packages → Submissions Workbench pane
 *   - safety_signals        → CER signals table
 *   - literature_entries    → CER literature corpus chart + portfolio
 *                              insights "literature density" computation
 *   - saved_precedent_queries → PrecedentSurface saved queries panel
 *
 * Idempotent — re-running upserts by deterministic id and skips
 * existing children. Safe to run after the base seed.
 *
 * Prerequisites:
 *   1. seed-ga-demo.mjs has run (org + admin user)
 *   2. seed-mdx-beta.mjs has run (programs + Q-Subs)
 *   3. migrations/20260505_saved_precedent_queries.sql has been applied
 *
 * Usage:
 *   node scripts/seed-mdx-content.mjs
 */

import pg from 'pg';

const { Pool } = pg;

function getDbUrl() {
  const raw = process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL;
  if (!raw) {
    console.error('ERROR: Set DATABASE_URL or DATABASE_NEON_NEW_SECRET');
    process.exit(1);
  }
  let url = raw;
  if (url.includes('-pooler.')) {
    url = url.replace(/-pooler\.[a-z0-9-]+\.neon\.tech/, (m) =>
      m.replace('-pooler.', '.'),
    );
  }
  return url;
}

const ORG_NAME = 'concept2cure';
const PROG = {
  BX_204: '11111111-2222-3333-4444-000000000204',
  OR_801: '11111111-2222-3333-4444-000000000801',
  RX_340: '11111111-2222-3333-4444-000000000340',
  PM_660: '11111111-2222-3333-4444-000000000660',
  NM_512: '11111111-2222-3333-4444-000000000512',
  IV_415: '11111111-2222-3333-4444-000000000415',
};

/* ─── 510(k) eSTAR section taxonomy (FDA canonical) ─────────────────── */
const ESTAR_SECTIONS = [
  { num: '1',  key: 'user-fee-cover',           title: 'Medical Device User Fee Cover Sheet',          cat: 'administrative', req: true,  status: 'validated', pct: 100 },
  { num: '2',  key: 'cdrh-cover',               title: 'CDRH Premarket Review Submission Cover Sheet', cat: 'administrative', req: true,  status: 'validated', pct: 100 },
  { num: '3',  key: 'cover-letter',             title: '510(k) Cover Letter',                          cat: 'administrative', req: true,  status: 'drafting',  pct: 60 },
  { num: '4',  key: 'indications-for-use',      title: 'Indications for Use Statement',                cat: 'administrative', req: true,  status: 'validated', pct: 100 },
  { num: '5',  key: '510k-summary',             title: '510(k) Summary',                               cat: 'administrative', req: true,  status: 'drafting',  pct: 40 },
  { num: '6',  key: 'truthful-accuracy',        title: 'Truthful and Accuracy Statement',              cat: 'administrative', req: true,  status: 'validated', pct: 100 },
  { num: '7',  key: 'class-iii-summary',        title: 'Class III Summary and Certification',          cat: 'administrative', req: false, status: 'not_applicable', pct: 0 },
  { num: '8',  key: 'financial-disclosure',     title: 'Financial Certification or Disclosure',        cat: 'administrative', req: true,  status: 'validated', pct: 100 },
  { num: '9',  key: 'declarations-conformity',  title: 'Declarations of Conformity',                   cat: 'administrative', req: true,  status: 'validated', pct: 100 },
  { num: '10', key: 'device-description',       title: 'Device Description',                           cat: 'device',         req: true,  status: 'drafting',  pct: 70 },
  { num: '11', key: 'substantial-equivalence',  title: 'Substantial Equivalence Discussion',           cat: 'device',         req: true,  status: 'drafting',  pct: 55 },
  { num: '12', key: 'sterilization',            title: 'Sterilization and Shelf Life',                 cat: 'testing',        req: true,  status: 'validated', pct: 100 },
  { num: '13', key: 'biocompatibility',         title: 'Biocompatibility',                             cat: 'testing',        req: true,  status: 'in_review', pct: 90 },
  { num: '14', key: 'software',                 title: 'Software',                                     cat: 'software',       req: true,  status: 'drafting',  pct: 65 },
  { num: '15', key: 'electromagnetic',          title: 'Electromagnetic Compatibility and Safety',     cat: 'testing',        req: true,  status: 'validated', pct: 100 },
  { num: '16', key: 'performance-bench',        title: 'Performance Testing — Bench',                  cat: 'testing',        req: true,  status: 'in_review', pct: 85 },
  { num: '17', key: 'performance-animal',       title: 'Performance Testing — Animal',                 cat: 'testing',        req: false, status: 'not_applicable', pct: 0 },
  { num: '18', key: 'performance-clinical',     title: 'Performance Testing — Clinical',               cat: 'clinical',       req: true,  status: 'drafting',  pct: 50 },
  { num: '19', key: 'labeling',                 title: 'Labeling',                                     cat: 'additional',     req: true,  status: 'drafting',  pct: 75 },
  { num: '20', key: 'cybersecurity',            title: 'Cybersecurity',                                cat: 'software',       req: true,  status: 'todo',      pct: 0 },
];

/* ─── Submission packages ──────────────────────────────────────────── */
const SUBMISSION_PACKAGES = [
  { progCode: 'OR-902', family: '510k',   title: 'OR-902 Spinal implant — final eSTAR',         status: 'active',     phase: 'transmit', target: '2026-06-15', meta: { stage: 'transmit', gateErrs: 0, gateWarns: 0, gateOk: 20, fileCount: 48, bytes: '142 MB', cover: 'signed', esig: true } },
  { progCode: 'OR-801', family: '510k',   title: 'OR-801 Screw system — Q1 filing',              status: 'active',     phase: 'validate', target: '2026-07-22', meta: { stage: 'validate', blocker: true, gateErrs: 1, gateWarns: 4, gateOk: 15, fileCount: 41, bytes: '98 MB', cover: 'draft', esig: false } },
  { progCode: 'BX-204', family: '510k',   title: 'BX-204 CGM — pre-submission bundle',           status: 'active',     phase: 'package',  target: '2026-08-15', meta: { stage: 'package', gateErrs: 0, gateWarns: 5, gateOk: 15, fileCount: 24, bytes: '62 MB', cover: 'draft', esig: false } },
  { progCode: 'IV-415', family: 'cer',    title: 'IV-415 CoDx · notified body bundle',           status: 'active',     phase: 'package',  target: '2026-Q1',    meta: { stage: 'package', gateErrs: 0, gateWarns: 3, gateOk: 9, fileCount: 52, bytes: '88 MB', cover: 'draft', esig: false } },
  { progCode: 'CV-117', family: '510k',   title: 'CV-117 ECG patch · K254481',                   status: 'completed',  phase: 'decision', target: null,         meta: { stage: 'decision', gateErrs: 0, gateWarns: 0, gateOk: 20, fileCount: 37, bytes: '76 MB', cover: 'signed', esig: true, transmitAt: 'Feb 3, 2026' } },
];

/* ─── CER safety signals (IV-415) ─────────────────────────────────── */
const SAFETY_SIGNALS = [
  { source: 'spontaneous',    description: 'Lead dislodgement post-implant — N=12',                  status: 'confirmed',        action: 'label_update' },
  { source: 'literature',     description: 'Imaging artifact at 3T MRI scanner',                     status: 'under_evaluation', action: 'none' },
  { source: 'clinical_trial', description: 'Battery longevity below specification at 18 months',     status: 'confirmed',        action: 'rems' },
  { source: 'registry',       description: 'Device migration in <2% of pediatric subset',            status: 'refuted',          action: 'none' },
];

/* ─── Literature corpus (BX-204 CGM + IV-415 CoDx) ────────────────── */
function literatureRows() {
  const subjects = ['Continuous Glucose Monitor', 'Companion Diagnostic'];
  const journals = ['NEJM', 'Lancet', 'Diabetes Care', 'JAMA', 'Clinical Chemistry'];
  const rows = [];
  let id = 1;
  for (const subject of subjects) {
    for (let year = new Date().getFullYear() - 5; year <= new Date().getFullYear(); year++) {
      const count = 4 + Math.floor(Math.random() * 8);
      for (let i = 0; i < count; i++) {
        rows.push({
          source_name:      'pubmed',
          source_id:        `pm-${id}`,
          title:            `${subject} clinical study — cohort ${id}`,
          abstract:         `${subject} performance evaluation across ${100 + id * 12} subjects with mean follow-up ${6 + (id % 12)} months.`,
          publication_date: `${year}-${String(1 + (id % 12)).padStart(2, '0')}-15`,
          journal:          journals[id % journals.length],
        });
        id++;
      }
    }
  }
  return rows;
}

/* ─── Saved precedent queries ─────────────────────────────────────── */
const SAVED_QUERIES = [
  { label: 'CGM sensor 14-day wear',                      query: 'continuous glucose monitor 14-day wear',     hits: 47,  scope: { pathway: '510k' } },
  { label: 'IVD cartridge 14 analytes',                   query: 'IVD cartridge 14 analytes companion',         hits: 23,  scope: { pathway: 'cer' } },
  { label: 'Implantable cardiac monitor',                 query: 'implantable cardiac monitor pacemaker',       hits: 182, scope: { pathway: 'pma' } },
  { label: 'SaMD Class II clinical decision support',     query: 'SaMD Class II clinical decision support',     hits: 419, scope: { pathway: '510k', deviceClass: 'II' } },
];

/* ─── Helpers ─────────────────────────────────────────────────────── */

async function getOrgId(client) {
  const { rows } = await client.query(
    `SELECT id FROM organizations WHERE name = $1 LIMIT 1`,
    [ORG_NAME],
  );
  if (rows.length === 0) {
    throw new Error(`Organization '${ORG_NAME}' not found. Run seed-ga-demo.mjs first.`);
  }
  return rows[0].id;
}

async function seedSections(client, orgId) {
  /* Sections are org-scoped (not program-scoped) — the cerv2_510k_sections
     table backs the 510(k) eSTAR taxonomy at the org level. One copy per
     org; the kit's section panels render the same template for every
     program in the org. This matches existing route behavior. */
  for (const s of ESTAR_SECTIONS) {
    await client.query(
      `INSERT INTO cerv2_510k_sections (
         organization_id, section_number, section_title, section_key, category,
         is_required, status, completion_percentage, level, display_order, content,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [
        orgId,
        s.num,
        s.title,
        s.key,
        s.cat,
        s.req,
        s.status,
        s.pct,
        Number(s.num) * 10,
        /* Cross-reference + K-number content so RIM recommendations and
           change-impact endpoints have something to scan against. */
        s.key === 'substantial-equivalence'
          ? 'Subject device is substantially equivalent to predicate K221847 (Dexcom G7 CGM System). See §10 for device description and §16 for performance data.'
          : s.key === 'biocompatibility'
          ? 'Biocompatibility per ISO 10993-1, ISO 10993-5 and ISO 10993-10. Reference ISO 11135:2014 for sterilization validation.'
          : '',
      ],
    );
  }
}

async function getProgramDbId(client, orgId, programUuid) {
  /* c2c_submission_packages references projects.id (integer), not
     regulatory_programs.id (uuid). Many beta orgs don't have a 1:1 link
     between regulatory_programs and projects yet — for the demo seed
     we create a backing project row when missing so the FK holds. */
  const { rows } = await client.query(
    `SELECT id FROM projects WHERE organization_id = $1 AND name = (
       SELECT name FROM regulatory_programs WHERE id = $2
     ) LIMIT 1`,
    [orgId, programUuid],
  );
  if (rows.length > 0) return rows[0].id;
  /* Create a backing project record. */
  const { rows: progRows } = await client.query(
    `SELECT name FROM regulatory_programs WHERE id = $1 LIMIT 1`,
    [programUuid],
  );
  if (progRows.length === 0) return null;
  const { rows: created } = await client.query(
    `INSERT INTO projects (organization_id, name, description, status, priority, created_at, updated_at)
     VALUES ($1, $2, 'MDX program project', 'in_progress', 'medium', NOW(), NOW())
     RETURNING id`,
    [orgId, progRows[0].name],
  );
  return created[0].id;
}

async function seedSubmissionPackages(client, orgId) {
  for (const pkg of SUBMISSION_PACKAGES) {
    /* Match the kit's prog code to a regulatory_programs row. Tolerant
       of programs that don't exist (skip silently — keeps the seed
       safe to run with subset orgs). */
    const { rows: progRows } = await client.query(
      `SELECT id FROM regulatory_programs WHERE organization_id = $1 AND code = $2 LIMIT 1`,
      [orgId, pkg.progCode],
    );
    if (progRows.length === 0) continue;
    const projectDbId = await getProgramDbId(client, orgId, progRows[0].id);
    if (projectDbId == null) continue;
    /* Idempotent: deterministic packageId from project + family. */
    const packageId = `pkg-mdx-${pkg.progCode.toLowerCase()}-${pkg.family}`;
    await client.query(
      `INSERT INTO c2c_submission_packages (
         package_id, org_id, project_id, package_family, title, target_date, status, metadata, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8::jsonb, NOW(), NOW())
       ON CONFLICT (package_id) DO UPDATE SET
         title       = EXCLUDED.title,
         status      = EXCLUDED.status,
         metadata    = EXCLUDED.metadata,
         updated_at  = NOW()`,
      [
        packageId,
        orgId,
        projectDbId,
        pkg.family,
        pkg.title,
        pkg.target,
        pkg.status,
        JSON.stringify({ ...pkg.meta, programCode: pkg.progCode }),
      ],
    );
  }
}

async function seedSafetySignals(client, orgId) {
  /* safety_signals table is created by the pharmacovigilanceService at
     runtime. Skip if missing. */
  try {
    for (const s of SAFETY_SIGNALS) {
      await client.query(
        `INSERT INTO safety_signals (
           organization_id, project_id, signal_source, description, detected_at,
           evaluation_status, action, risk_benefit_assessment, created_at
         ) VALUES ($1::text, $2, $3, $4, NOW() - interval '30 days' * random(), $5, $6, $7, NOW())
         ON CONFLICT DO NOTHING`,
        [
          String(orgId),
          PROG.IV_415,
          s.source,
          s.description,
          s.status,
          s.action,
          'IV-415 risk-benefit pending notified-body review.',
        ],
      );
    }
  } catch (err) {
    if (err.code === '42P01') {
      console.log('   ⓘ safety_signals table not provisioned — skipping');
      return;
    }
    throw err;
  }
}

async function seedLiterature(client, orgId) {
  try {
    for (const r of literatureRows()) {
      await client.query(
        `INSERT INTO literature_entries (
           id, source_name, source_id, title, abstract, publication_date, journal,
           organization_id, created_at, updated_at
         ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::date, $6, $7::text, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [r.source_name, r.source_id, r.title, r.abstract, r.publication_date, r.journal, String(orgId)],
      );
    }
  } catch (err) {
    if (err.code === '42P01') {
      console.log('   ⓘ literature_entries table not provisioned — skipping');
      return;
    }
    throw err;
  }
}

async function seedSavedQueries(client, orgId) {
  for (const q of SAVED_QUERIES) {
    await client.query(
      `INSERT INTO saved_precedent_queries (
         organization_id, label, query, scope, hits, last_run_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5, NOW(), NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [orgId, q.label, q.query, JSON.stringify(q.scope), q.hits],
    );
  }
}

/* ─── Main ───────────────────────────────────────────────────────── */

async function seed() {
  const pool = new Pool({ connectionString: getDbUrl() });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orgId = await getOrgId(client);
    console.log(`Org: ${orgId}`);
    console.log('');
    console.log(`[1/5] cerv2_510k_sections (${ESTAR_SECTIONS.length})…`);
    await seedSections(client, orgId);
    console.log(`[2/5] c2c_submission_packages (${SUBMISSION_PACKAGES.length})…`);
    await seedSubmissionPackages(client, orgId);
    console.log(`[3/5] safety_signals (${SAFETY_SIGNALS.length})…`);
    await seedSafetySignals(client, orgId);
    console.log(`[4/5] literature_entries (~${literatureRows().length})…`);
    await seedLiterature(client, orgId);
    console.log(`[5/5] saved_precedent_queries (${SAVED_QUERIES.length})…`);
    await seedSavedQueries(client, orgId);

    await client.query('COMMIT');
    console.log('');
    console.log('✓ MDX content seed complete.');
    console.log('');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
