#!/usr/bin/env node
/**
 * program-same-org-preflight.mjs — which records name a project of ANOTHER
 * organization, or a project that does not exist?
 *
 *     DATABASE_URL='postgres://owner@…/db' node scripts/db/program-same-org-preflight.mjs
 *
 * ── Why (PF-04, D3, 2026-09-26) ──────────────────────────────────────────────
 * migrations/20260926b_program_same_org_keys.sql holds each record's project
 * key to the record's own organization. The keys are NOT VALID: rows written
 * before them are not scanned, so a legacy cross-organization anchor does not
 * fail the deploy. It also is not cured. A tenant purge's ON DELETE SET NULL
 * matches only rows whose (key, organization) equals the deleted program's, so
 * a legacy row naming another organization's program is left pointing at a
 * deleted one. This lists those rows, for the operator to clear their keys
 * (SET the key to NULL; a cre source with no organization loses its key)
 * before any tenant purge and before any VALIDATE CONSTRAINT.
 *
 * Every statement is a SELECT, inside a READ ONLY transaction that is rolled
 * back. The row-level policies are lifted for the transaction
 * (app.rls_enforce / app.bypass_rls): otherwise they hide other tenants' rows,
 * and a cross-tenant report under-counts exactly the rows it exists to find.
 *
 * The integer project key on concept2cure_artifacts and c2c_submission_packages
 * (migrations/20261001_integer_project_same_org_keys.sql, PF-03) is checked
 * the same way, against projects (id, organization_id).
 *
 * vault.documents and submission_transmittals are listed but not keyed by
 * 20260926b (see its header); their rows are reported so the same clean-up
 * covers them before their keys land.
 *
 * Exit: 0 no record names a foreign or missing project
 *       1 at least one does (listed)
 *       2 configuration
 */

import { pathToFileURL } from 'node:url';

/**
 * One check per keyed store. `sql` returns the violating rows; the test runs
 * the same text (tests/schema-contract/program-same-org-keys.pglite.test.ts).
 */
export const PROGRAM_SAME_ORG_CHECKS = Object.freeze([
  {
    relation: 'public.projects',
    keyColumn: 'regulatory_program_id',
    keyedBy: 'projects_regulatory_program_same_org_fk',
    sql: `SELECT p.id, p.organization_id AS org, p.regulatory_program_id AS program_id,
                 rp.organization_id AS program_org, (rp.id IS NULL) AS program_missing
            FROM public.projects p
            LEFT JOIN public.regulatory_programs rp ON rp.id = p.regulatory_program_id
           WHERE p.regulatory_program_id IS NOT NULL
             AND (rp.id IS NULL OR rp.organization_id <> p.organization_id)
           ORDER BY p.id`,
  },
  {
    relation: 'public.authoring_documents',
    keyColumn: 'client_program_id',
    keyedBy: 'authoring_documents_program_same_org_fk',
    sql: `SELECT d.id, d.tenant_id AS org, d.client_program_id AS program_id,
                 rp.organization_id AS program_org, (rp.id IS NULL) AS program_missing
            FROM public.authoring_documents d
            LEFT JOIN public.regulatory_programs rp ON rp.id = d.client_program_id
           WHERE d.client_program_id IS NOT NULL
             AND (rp.id IS NULL OR rp.organization_id <> d.tenant_id)
           ORDER BY d.id`,
  },
  {
    // Also a key on a GLOBAL_PUBLIC (NULL-organization) source.
    relation: 'public.cre_evidence_sources',
    keyColumn: 'client_program_id',
    keyedBy: 'cre_evidence_sources_program_same_org_fk',
    sql: `SELECT s.id, s.organization_id AS org, s.client_program_id AS program_id,
                 rp.organization_id AS program_org, (rp.id IS NULL) AS program_missing
            FROM public.cre_evidence_sources s
            LEFT JOIN public.regulatory_programs rp ON rp.id = s.client_program_id
           WHERE s.client_program_id IS NOT NULL
             AND (s.organization_id IS NULL OR rp.id IS NULL OR rp.organization_id <> s.organization_id)
           ORDER BY s.id`,
  },
  {
    // The document's own key already proves the program exists.
    relation: 'public.c2c_documents',
    keyColumn: 'project_id',
    keyedBy: 'c2c_documents_project_same_org_fk',
    sql: `SELECT d.id, d.org_id AS org, d.project_id AS program_id,
                 rp.organization_id AS program_org, FALSE AS program_missing
            FROM public.c2c_documents d
            JOIN public.regulatory_programs rp ON rp.id = d.project_id
           WHERE rp.organization_id <> d.org_id
           ORDER BY d.id`,
  },
  {
    relation: 'public.cdisc_prm_studies',
    keyColumn: 'program_id',
    keyedBy: 'cdisc_prm_studies_program_same_org_fk',
    sql: `SELECT s.id, s.tenant_id AS org, s.program_id,
                 rp.organization_id AS program_org, (rp.id IS NULL) AS program_missing
            FROM public.cdisc_prm_studies s
            LEFT JOIN public.regulatory_programs rp ON rp.id = s.program_id
           WHERE s.program_id IS NOT NULL
             AND (rp.id IS NULL OR rp.organization_id <> s.tenant_id)
           ORDER BY s.id`,
  },
  {
    // The integer key (PF-03, 20261001): an artifact of one organization under
    // another organization's projects row.
    relation: 'public.concept2cure_artifacts',
    keyColumn: 'project_id',
    // project_id is NOT NULL here, so the key cannot be cleared.
    remedy: 're-file the row under a project of its own organization (project_id is NOT NULL)',
    keyedBy: 'concept2cure_artifacts_project_same_org_fk',
    references: 'public.projects',
    sql: `SELECT a.id, a.organization_id AS org, a.project_id,
                 p.organization_id AS project_org, (p.id IS NULL) AS project_missing
            FROM public.concept2cure_artifacts a
            LEFT JOIN public.projects p ON p.id = a.project_id
           WHERE a.project_id IS NOT NULL
             AND (p.id IS NULL OR p.organization_id <> a.organization_id)
           ORDER BY a.id`,
  },
  {
    relation: 'public.c2c_submission_packages',
    keyColumn: 'project_id',
    // project_id is NOT NULL here, so the key cannot be cleared.
    remedy: 're-file the row under a project of its own organization (project_id is NOT NULL)',
    keyedBy: 'c2c_submission_packages_project_same_org_fk',
    references: 'public.projects',
    sql: `SELECT k.id, k.org_id AS org, k.project_id,
                 p.organization_id AS project_org, (p.id IS NULL) AS project_missing
            FROM public.c2c_submission_packages k
            LEFT JOIN public.projects p ON p.id = k.project_id
           WHERE k.project_id IS NOT NULL
             AND (p.id IS NULL OR p.organization_id <> k.org_id)
           ORDER BY k.id`,
  },
  {
    relation: 'public.concept2cure_conversations',
    keyColumn: 'project_id',
    // project_id is NOT NULL here, so the key cannot be cleared.
    remedy: 're-file the row under a project of its own organization (project_id is NOT NULL)',
    keyedBy: 'concept2cure_conversations_project_same_org_fk',
    references: 'public.projects',
    sql: `SELECT c.id, c.organization_id AS org, c.project_id,
                 p.organization_id AS project_org, (p.id IS NULL) AS project_missing
            FROM public.concept2cure_conversations c
            LEFT JOIN public.projects p ON p.id = c.project_id
           WHERE c.project_id IS NOT NULL
             AND (p.id IS NULL OR p.organization_id <> c.organization_id)
           ORDER BY c.id`,
  },
  {
    // Data Room catalog S3 (20261008d): the study a capture names.
    relation: 'public.cre_evidence_sources',
    keyColumn: 'study_ref',
    keyedBy: 'cre_evidence_sources_study_same_org_fk',
    references: 'public.cdisc_prm_studies',
    sql: `SELECT s.id, s.organization_id AS org, s.study_ref,
                 st.tenant_id AS study_org, (st.id IS NULL) AS study_missing
            FROM public.cre_evidence_sources s
            LEFT JOIN public.cdisc_prm_studies st ON st.id = s.study_ref
           WHERE s.study_ref IS NOT NULL
             AND (st.id IS NULL OR st.tenant_id <> s.organization_id)
           ORDER BY s.id`,
  },
  {
    // PF-10 S11 (20261001, amended): the project AnA's working memory names.
    // project_id is nullable, so a legacy row can be cleared rather than moved.
    relation: 'public.conversation_working_memory',
    keyColumn: 'project_id',
    remedy: 'clear project_id (the summary then stays out of project memory), or set it to a project of the row\'s organization',
    keyedBy: 'conversation_working_memory_project_same_org_fk',
    references: 'public.projects',
    sql: `SELECT w.id, w.organization_id AS org, w.project_id,
                 p.organization_id AS project_org, (p.id IS NULL) AS project_missing
            FROM public.conversation_working_memory w
            LEFT JOIN public.projects p ON p.id = w.project_id
           WHERE w.project_id IS NOT NULL
             AND (p.id IS NULL OR p.organization_id <> w.organization_id)
           ORDER BY w.id`,
  },
  {
    // PF-10 S1 (20261001c): the project a conversation was held in. The column
    // is new and written only after an organization check, so this is a guard
    // on the guard; a backfilled thread is same-organization by construction.
    relation: 'public.chat_threads',
    keyColumn: 'program_id',
    keyedBy: 'chat_threads_program_same_org_fk',
    sql: `SELECT t.id, t.organization_id AS org, t.program_id,
                 rp.organization_id AS program_org, (rp.id IS NULL) AS program_missing
            FROM public.chat_threads t
            LEFT JOIN public.regulatory_programs rp ON rp.id = t.program_id
           WHERE t.program_id IS NOT NULL
             AND (rp.id IS NULL OR t.organization_id IS NULL OR rp.organization_id <> t.organization_id)
           ORDER BY t.id`,
  },
  {
    relation: 'vault.documents',
    keyColumn: 'program_id',
    keyedBy: null,
    sql: `SELECT d.id, d.organization_id AS org, d.program_id,
                 rp.organization_id AS program_org, (rp.id IS NULL) AS program_missing
            FROM vault.documents d
            LEFT JOIN public.regulatory_programs rp ON rp.id = d.program_id
           WHERE d.organization_id IS NOT NULL
             AND (rp.id IS NULL OR rp.organization_id <> d.organization_id)
           ORDER BY d.id`,
  },
  {
    relation: 'public.submission_transmittals',
    keyColumn: 'program_id',
    keyedBy: null,
    sql: `SELECT t.id, t.organization_id AS org, t.program_id,
                 rp.organization_id AS program_org, (rp.id IS NULL) AS program_missing
            FROM public.submission_transmittals t
            LEFT JOIN public.regulatory_programs rp ON rp.id = t.program_id
           WHERE t.program_id IS NOT NULL
             AND (rp.id IS NULL OR rp.organization_id <> t.organization_id)
           ORDER BY t.id`,
  },
]);

/**
 * Run every check the schema can answer. A store this database lacks, or
 * whose key column it lacks, is reported as skipped, never as clean.
 * `client.query(text, params)` must return `{ rows }` (pg or PGlite).
 */
export async function runProgramSameOrgPreflight(client) {
  const results = [];
  for (const check of PROGRAM_SAME_ORG_CHECKS) {
    const [schema, table] = check.relation.split('.');
    const present = await client.query(
      `SELECT to_regclass($1) IS NOT NULL AS rel,
              EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = $2 AND table_name = $3 AND column_name = $4) AS col,
              to_regclass($5) IS NOT NULL AS programs`,
      [check.relation, schema, table, check.keyColumn, check.references ?? 'public.regulatory_programs'],
    );
    const { rel, col, programs } = present.rows[0];
    if (!rel || !col || !programs) {
      results.push({ relation: check.relation, keyedBy: check.keyedBy, skipped: true, rows: [] });
      continue;
    }
    const { rows } = await client.query(check.sql);
    results.push({ relation: check.relation, keyedBy: check.keyedBy, skipped: false, rows, remedy: check.remedy ?? null });
  }
  return results;
}

async function main() {
  const [{ Client }, dotenv, { resolveDatabaseUrl, sslFor, APPLY_URL_VARS }] = await Promise.all([
    import('pg').then((m) => m.default ?? m),
    import('dotenv').then((m) => m.default ?? m),
    import('./connection.mjs'),
  ]);
  dotenv.config({ quiet: true });
  let url;
  try {
    url = resolveDatabaseUrl(APPLY_URL_VARS);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(2);
  }
  const client = new Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  let found = 0;
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SELECT set_config('app.rls_enforce', 'off', true), set_config('app.bypass_rls', 'true', true)`);
    for (const r of await runProgramSameOrgPreflight(client)) {
      if (r.skipped) {
        console.info(`  - ${r.relation}: not in this schema (skipped)`);
        continue;
      }
      found += r.rows.length;
      console.info(`  ${r.rows.length ? '✗' : '✓'} ${r.relation}: ${r.rows.length} record(s) name a foreign or missing project`);
      if (r.rows.length && r.remedy) console.info(`      remedy: ${r.remedy}`);
      for (const row of r.rows) console.info(`      ${JSON.stringify(row)}`);
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
  }
  if (found) {
    console.error(`\n✗ ${found} record(s) to clear before any tenant purge or VALIDATE CONSTRAINT (set the key to NULL, unless a store names another remedy above).`);
    process.exit(1);
  }
  console.info('\n✓ every project key names a project of its own organization.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}
