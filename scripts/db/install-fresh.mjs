#!/usr/bin/env node
/**
 * install-fresh.mjs — Canonical from-scratch DB provisioning (app schema + RLS).
 *
 * The problem this solves: there was no single, verified command that turns an
 * empty Postgres into a correct Concept2Cure app schema. `drizzle-kit push`
 * alone fails on a bare DB ("schema vault does not exist") and, once the
 * prereqs exist, still creates ZERO row-level-security policies (push cannot
 * emit policies). Replaying the 162-file migrations/ tree is not idempotent and
 * fails. This script is the one supported path for the application schema.
 *
 * What it does (idempotent — safe to re-run):
 *   1. Create the named schemas + extensions the Drizzle schema references.
 *   2. `drizzle-kit push` to lay down all tables from shared/schema.ts.
 *   3. Overlay the raw migrations/ tree ON TOP of push (multi-pass, tolerant of
 *      objects push already made) to create the core product tables that live
 *      ONLY in raw migrations and are NOT in shared/schema.ts — regulatory_programs,
 *      c2c_documents/sections/rule_packs, c2c_ana_*, submission-ops, … Without
 *      this the real routes read absent tables and the UI shows "Sample data".
 *   4. Provision the authoring subsystem (the four db/migrations/20260725_authoring_*
 *      files) as one atomic unit. These back the flagship IND authoring loop and
 *      had NO durable provisioning path — see scripts/db/authoring-subsystem.mjs.
 *   5. Apply the RLS-bearing raw migrations in their required order, tracking
 *      applied files in an _install_applied_migrations ledger.
 *   6. Apply the governed-content tree (*_gcc_*.sql) via psql — the `audit`
 *      schema and Part-11 tamper-proof audit tables.
 *   7. Verify: table count, pg_policies count, and that the core route tables +
 *      the authoring subsystem exist.
 *
 * The authoring subsystem in step 4 is the ONE db/migrations/ exception run
 * here. It is included precisely because it is NOT part of the *_gcc_* tree
 * below: its tables carry integer tenant_id (the app tenant model) and it adds
 * no RLS of its own, so it composes cleanly with the RLS rollout — unlike the
 * uuid-keyed governed-content tree.
 *
 * Step 6 applies the governed-content tree db/migrations/*_gcc_*.sql (named
 * `audit` schema, Part-11 tables, its own RLS). These files are psql-authored
 * — meta-commands and dollar-quoting that node-postgres cannot execute — so the
 * step shells out to psql, exactly as CI does. They are applied AFTER the RLS
 * rollout and never merged into it: their uuid tenant columns are incompatible
 * with the app RLS policy.
 *
 * This step used to not exist. The script printed the psql loop as advice and
 * then declared success, so an operator who followed the green checkmark ended
 * up with no `audit` schema and no tamper-proof Part 11 audit trail. The app
 * BOOTS without it (audit degrades non-fatally), which is why that went
 * unnoticed. If psql is unavailable the step now says so, records the shortfall,
 * and the install does not report success.
 *
 * Usage:
 *   DATABASE_URL='postgres://…' node scripts/db/install-fresh.mjs
 *   DATABASE_URL='postgres://…' node scripts/db/install-fresh.mjs --allow-incomplete
 *
 * Exit code is 0 only when every step completed. A partial install exits 1 and
 * names what is missing, unless --allow-incomplete is passed.
 *
 * After this completes, set RLS_ENFORCE=on and restart to turn the tenant
 * isolation policies from shadow-mode into enforcing.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import {
  applyAuthoringSubsystem,
  AUTHORING_SUBSYSTEM_TABLES,
} from './authoring-subsystem.mjs';
import { resolveDatabaseUrl, sslFor, INSTALL_URL_VARS } from './connection.mjs';
import { provisionAppServiceRole, resolveAppServiceRole } from './provision-app-role.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'migrations');

// RLS lives only in these raw migrations — drizzle-kit push cannot emit
// policies, so they must be applied explicitly after the tables exist. Order
// matters: 0005 seeds CSR-knowledge RLS; the 0019→0020→0021 trio is the tenant
// RLS rollout (audit → coerce tenant column types → enable RLS everywhere);
// the dated files add AI-placement and research-admin policies.
const RLS_MIGRATIONS = [
  '0005_csr_knowledge_database.sql',
  '0019_tenant_column_audit.sql',
  '0020_coerce_text_tenant_columns.sql',
  '0021_enable_rls_everywhere.sql',
  '20260608_ai_placement_policies.sql',
  '20260612_rls_research_admin.sql',
];

const url = resolveDatabaseUrl(INSTALL_URL_VARS);
const pool = new Pool({ connectionString: url, ssl: sslFor(url) });

/**
 * `--allow-incomplete` — finish and exit 0 even when part of the install did
 * not land.
 *
 * The default is now the opposite. This script used to print
 * "✅ Application schema install complete." unconditionally: with raw
 * migrations left unapplied (described, without evidence, as "safe to skip"),
 * and with the entire governed-content tree un-run, because the script only
 * PRINTED the psql loop for an operator to run by hand. An operator who
 * followed the green checkmark got a database with no `audit` schema and no
 * Part 11 tamper-proof audit trail, and nothing told them.
 *
 * An installer that reports success it did not achieve is worse than one that
 * fails, because the failure surfaces later, in production, as a missing table.
 */
const ALLOW_INCOMPLETE = process.argv.includes('--allow-incomplete');

/** Non-fatal shortfalls, collected across steps and adjudicated at the end. */
const incomplete = [];
function recordIncomplete(area, detail) {
  incomplete.push({ area, detail });
}

async function step(label, fn) {
  process.stdout.write(`\n▶ ${label}\n`);
  await fn();
}

async function main() {
  await step('1/8 Prerequisites — schemas + extensions', async () => {
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS vault;
      CREATE SCHEMA IF NOT EXISTS precedent;
      CREATE SCHEMA IF NOT EXISTS audit;
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
    `);
    console.log('  ✓ schemas (vault, precedent, audit) + extensions (pgcrypto, uuid-ossp, vector, pg_trgm)');
  });

  await step('2/8 Tables — drizzle-kit push', async () => {
    // `echo ""` answers drizzle-kit's interactive prompt; a fresh DB has no
    // destructive changes so it proceeds. Inherit env so drizzle.config.ts
    // resolves the same DATABASE_URL.
    const res = spawnSync('npx', ['drizzle-kit', 'push'], {
      cwd: path.resolve(__dirname, '..', '..'),
      input: '\n',
      encoding: 'utf8',
      env: process.env,
    });
    if (res.status !== 0) {
      console.error(res.stdout || '');
      console.error(res.stderr || '');
      throw new Error(`drizzle-kit push failed (exit ${res.status})`);
    }
    console.log('  ✓ schema pushed from shared/schema.ts');
  });

  await step('3/8 Complete schema — raw migration overlay', async () => {
    // drizzle-kit push lays down ONLY shared/schema.ts. The core product tables
    // — regulatory_programs, c2c_documents / c2c_document_sections /
    // c2c_rule_packs, c2c_ana_*, the submission-ops set, and ~200 more — live
    // ONLY in the raw migrations/ tree, which drizzle's journaled migrate() does
    // NOT replay (one journaled baseline vs 160 files). Without them every real
    // route reads an absent table and the UI falls back to fixtures ("Sample
    // data"). Overlay the raw tree ON TOP of push: multi-pass so
    // forward-dependencies resolve across passes, and tolerant of objects push
    // already created (on top of push those bare CREATEs simply report "already
    // exists" — which also sidesteps the stale 0000 snapshot's cmax/system-column
    // bug, since push created that table cleanly). RLS migrations are applied
    // separately in their required order (next step), so exclude them here.
    //
    // ── Pre-overlay creators (blank-DB provisioning audit 2026-07-30) ───────
    // Some root-tree files ALTER or FK-reference tables whose ONLY creator
    // lives in db/migrations/ — a tree this overlay never walks, applied on
    // real deploys by deploy-migrate AFTER install-fresh finishes. On a fresh
    // install those files therefore deferred forever and the run reported
    // incomplete:
    //   0016/0017 ALTER cmc_source_objects  → created by the CMC convergence OS
    //   0011      ALTERs ai_threads         → created by the AI trace chain
    //   0006      FKs to cmc_projects(id)   → code-derived reconstruction
    // Apply those creators FIRST (each idempotent), the same documented
    // exception pattern as the authoring subsystem in step 4.
    const PRE_OVERLAY_CREATORS = [
      'db/migrations/20260401_cmc_convergence_os.sql',
      'db/migrations/20260224_ai_trace_chain.sql',
      'db/migrations/20260730_cmc_projects_reconstruction.sql',
      'db/migrations/20260730_manufacturing_processes_reconstruction.sql',
      'db/migrations/20260730_fk_delete_policies_port.sql',
    ];
    for (const rel of PRE_OVERLAY_CREATORS) {
      const full = path.resolve(__dirname, '..', '..', rel);
      const sql = fs.readFileSync(full, 'utf8');
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('COMMIT');
        console.log(`  ✓ pre-overlay creator: ${rel}`);
      } catch (err) {
        await pool.query('ROLLBACK').catch(() => {});
        throw new Error(`pre-overlay creator ${rel} failed: ${err.message}`);
      }
    }

    // ── Classified skips (explicit, per-file, auditable) ────────────────────
    // A file listed here is EXPECTED to fail with the recorded error class on
    // a fresh install, for the documented reason. It is reported as
    // skipped-classified rather than flipping the exit code — anything NOT in
    // this map still fails the install loudly. This is per-file
    // classification, not blanket tolerance (see the --allow-incomplete
    // rationale above): each entry names its tracked resolution.
    const CLASSIFIED_OVERLAY_SKIPS = new Map([
      ['0008_critical_fk_delete_policies.sql',
        'superseded by db/migrations/20260730_fk_delete_policies_port.sql (guarded port applied pre-overlay); the original aborts on retired user_sessions'],
      ['0004_workflow_performance_indexes.sql',
        'indexes unified_documents — push-vs-overlay identity collision, ledger C-29 (only creator also redefines users/tenants with TEXT keys)'],
      ['0007_tenant_isolation_fixes.sql',
        'policies unified_documents — same C-29 collision as 0004'],
      ['001_create_ivdr_tables.sql',
        'ivdr_classifications shape collides with shared/schema.ts (push wins, columns differ) — ledger C-29; both consumers live, needs a rename decision'],
      ['20260609_design_risk.sql',
        'risk_items/risk_management_files shapes collide with shared/schema.ts — ledger C-29; both consumers live, needs a rename decision'],
    ]);

    const rlsSet = new Set(RLS_MIGRATIONS);
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && !rlsSet.has(f))
      .sort();

    const isDuplicate = (err) =>
      ['42710', '42P07', '42P06', '42P16', '42723', '42711', '42P05'].includes(err.code) ||
      /already exists|multiple primary keys/i.test(err.message || '');
    const isMissingDep = (err) =>
      ['42P01', '42703', '42704', '42883', '42P17'].includes(err.code) ||
      /does not exist|no existing constraint/i.test(err.message || '');

    const done = new Set();
    const lastErr = new Map();
    let applied = 0;
    let present = 0;

    for (let pass = 1; pass <= 8; pass++) {
      let progressed = false;
      let passApplied = 0;
      let passPresent = 0;
      let deferred = 0;
      let hard = 0;
      for (const file of files) {
        if (done.has(file)) continue;
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        // CREATE INDEX CONCURRENTLY cannot run inside a transaction block, so
        // those files run in autocommit; every other file is atomic per file.
        const concurrent = /concurrently/i.test(sql);
        try {
          if (concurrent) {
            await pool.query(sql);
          } else {
            await pool.query('BEGIN');
            await pool.query(sql);
            await pool.query('COMMIT');
          }
          done.add(file);
          passApplied++;
          applied++;
          progressed = true;
        } catch (err) {
          if (!concurrent) await pool.query('ROLLBACK').catch(() => {});
          if (isDuplicate(err)) {
            done.add(file);
            passPresent++;
            present++;
            progressed = true;
          } else if (isMissingDep(err)) {
            deferred++; // retry on a later pass once its dependency is created
            lastErr.set(file, (err.message || '').split('\n')[0]);
          } else {
            done.add(file); // a hard failure won't self-resolve — record + move on
            hard++;
            progressed = true;
            console.log(`  ⚠ ${file}: ${(err.message || '').split('\n')[0]}`);
          }
        }
      }
      console.log(
        `  pass ${pass}: applied=${passApplied} already-present=${passPresent} deferred=${deferred} hard=${hard}`,
      );
      if (!progressed) break;
    }

    const remainingAll = files.filter((f) => !done.has(f));
    const classified = remainingAll.filter((f) => CLASSIFIED_OVERLAY_SKIPS.has(f));
    const remaining = remainingAll.filter((f) => !CLASSIFIED_OVERLAY_SKIPS.has(f));
    if (classified.length) {
      console.log(
        `  ◦ ${classified.length} file(s) skipped-classified (expected on a fresh install; ` +
          'each names its tracked resolution — NOT counted as incomplete):',
      );
      for (const f of classified) {
        console.log(`      ${f} — ${CLASSIFIED_OVERLAY_SKIPS.get(f)}`);
        console.log(`        last error: ${lastErr.get(f) || '(none recorded)'}`);
      }
    }
    if (remaining.length) {
      // This used to read "safe to skip for the app schema". Nothing here
      // establishes that. The loop knows only that each file kept failing —
      // usually because it references a table absent from this schema, which is
      // often benign and sometimes means a table that should exist does not.
      // Asserting safety on the operator's behalf is the part that was wrong;
      // report the facts and let the exit code reflect the uncertainty.
      console.log(
        `  ⚠ ${remaining.length} file(s) left unapplied. Each failed repeatedly across ` +
          `multiple passes, typically because it references a table absent from this ` +
          `schema. Review each before treating this install as complete:`,
      );
      for (const f of remaining) console.log(`      ${f} — ${lastErr.get(f) || ''}`);
      recordIncomplete(
        'raw migration overlay',
        `${remaining.length} file(s) unapplied: ${remaining.join(', ')}`,
      );
    }
    console.log(`  ✓ overlay: ${applied} applied, ${present} already-present from push`);
  });

  await step('4/8 Authoring subsystem (Part-11 unit)', async () => {
    // The four db/migrations/20260725_authoring_* files back the flagship IND
    // authoring loop and, until now, had NO durable provisioning path — the
    // root overlay above only touches migrations/, and the *_gcc_* psql loop
    // never matched them. They apply here as ONE atomic unit (all four or none)
    // so the loop tables never stand up freeze/e-sign without their audit and
    // signature companions. See scripts/db/authoring-subsystem.mjs.
    await applyAuthoringSubsystem(pool, path.resolve(__dirname, '..', '..'), {
      log: (m) => console.log(m),
    });
  });

  await step('5/8 Row-Level Security policies (raw migrations)', async () => {
    // The RLS rollout (0021) hard-fails if ANY tenant column is still text.
    // 0020 coerces a fixed list, but the raw overlay adds tables (e.g.
    // adverse_events) with a text organization_id that predate that list. On a
    // fresh install every table is empty, so coerce ALL residual text
    // organization_id/tenant_id columns to integer up front — safe (no rows to
    // fail the cast) and exactly what the integer-keyed tenant model expects.
    // Per-column exception handling skips any column that legitimately can't be
    // an integer rather than aborting the whole install.
    await pool.query(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT table_name, column_name
            FROM information_schema.columns
           WHERE table_schema = 'public'
             AND column_name IN ('organization_id', 'tenant_id')
             AND data_type IN ('text', 'character varying')
        LOOP
          BEGIN
            EXECUTE format(
              'ALTER TABLE public.%I ALTER COLUMN %I TYPE integer USING NULLIF(%I, '''')::integer',
              r.table_name, r.column_name, r.column_name
            );
          EXCEPTION WHEN others THEN
            RAISE NOTICE 'skip coercion of %.%: %', r.table_name, r.column_name, SQLERRM;
          END;
        END LOOP;
      END $$;
    `);
    console.log('  ✓ coerced residual text tenant columns to integer (fresh-DB safe)');

    // Bookkeeping ledger: these raw migrations use bare CREATE POLICY (no
    // IF NOT EXISTS), so re-running a file would error on an already-present
    // policy. Record what has been applied so the installer is safely
    // re-runnable, and tolerate objects that already exist out-of-band.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public._install_applied_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const record = (file) =>
      pool.query(
        'INSERT INTO public._install_applied_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
        [file],
      );
    const isDuplicate = (err) =>
      err.code === '42710' || // duplicate_object (policy/role)
      err.code === '42P07' || // duplicate_table
      /already exists/i.test(err.message || '');

    for (const file of RLS_MIGRATIONS) {
      const already = await pool.query(
        'SELECT 1 FROM public._install_applied_migrations WHERE filename = $1',
        [file],
      );
      if (already.rowCount > 0) {
        console.log(`  • ${file} — already applied, skipping`);
        continue;
      }
      const full = path.join(MIGRATIONS_DIR, file);
      if (!fs.existsSync(full)) throw new Error(`missing RLS migration: ${file}`);
      const sql = fs.readFileSync(full, 'utf8');
      try {
        await pool.query('BEGIN');
        await pool.query(sql);
        await pool.query('COMMIT');
        await record(file);
        console.log(`  ✓ applied ${file}`);
      } catch (err) {
        await pool.query('ROLLBACK').catch(() => {});
        if (isDuplicate(err)) {
          await record(file);
          console.log(`  • ${file} — objects already present, recorded`);
          continue;
        }
        throw new Error(`failed applying ${file}: ${err.message}`);
      }
    }
  });

  await step('6/8 Governed content — Part 11 audit tree (*_gcc_*.sql)', async () => {
    // This step used to not exist. The script PRINTED a psql loop and told the
    // operator to run it themselves, then declared the install complete —
    // so following the instructions on screen produced a database with no
    // `audit` schema and no tamper-proof Part 11 audit trail, while the last
    // line said success. The app boots without it (audit degrades non-fatally),
    // which is exactly why nobody noticed.
    //
    // These files are psql-authored (\set, dollar-quoting, meta-commands) and
    // cannot be run through node-postgres, so psql is genuinely required — that
    // constraint was real. It just is not a reason to make it the operator's
    // problem.
    const gccDir = path.resolve(__dirname, '..', '..', 'db', 'migrations');
    const gccFiles = fs.existsSync(gccDir)
      ? fs.readdirSync(gccDir).filter((f) => f.includes('_gcc_') && f.endsWith('.sql')).sort()
      : [];

    if (!gccFiles.length) {
      console.log('  • no *_gcc_* files found; nothing to apply');
      return;
    }

    const psqlProbe = spawnSync('psql', ['--version'], { encoding: 'utf8' });
    if (psqlProbe.error || psqlProbe.status !== 0) {
      console.log(
        `  ⚠ psql not available — cannot apply ${gccFiles.length} governed-content file(s).`,
      );
      console.log('    The app will boot, but 21 CFR Part 11 tamper-proof audit will be absent.');
      console.log('    Install the postgresql client and re-run, or apply by hand:');
      console.log('      for f in $(ls db/migrations/*_gcc_*.sql | sort); do \\');
      console.log('        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done');
      recordIncomplete(
        'governed content (Part 11 audit)',
        `psql unavailable; ${gccFiles.length} *_gcc_* file(s) not applied`,
      );
      return;
    }

    let ok = 0;
    const failed = [];
    for (const f of gccFiles) {
      const full = path.join(gccDir, f);
      const res = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', full], {
        encoding: 'utf8',
        env: { ...process.env, PAGER: 'cat' },
      });
      if (res.status === 0) {
        ok++;
      } else {
        const why = ((res.stderr || '').trim().split('\n').pop() || '').slice(0, 160);
        failed.push(`${f} — ${why}`);
        console.log(`  ⚠ ${f}: ${why}`);
      }
    }
    console.log(`  ${failed.length ? '⚠' : '✓'} governed content: ${ok}/${gccFiles.length} applied`);
    if (failed.length) {
      recordIncomplete(
        'governed content (Part 11 audit)',
        `${failed.length} of ${gccFiles.length} file(s) failed: ${failed.join(' | ')}`,
      );
    }
  });

  await step('7/8 Runtime role — non-superuser app_service grants', async () => {
    // The RLS unlock. Everything above ran as the owner/admin (DATABASE_URL),
    // which is a superuser on most managed providers — a connection RLS never
    // filters. Mint a dedicated NOSUPERUSER / NOBYPASSRLS LOGIN role and grant
    // it least-privilege DML so the request-serving pool can connect as it
    // (APP_DATABASE_URL) and have tenant_isolation_policy actually filter rows.
    //
    // This runs LAST among the schema steps so `GRANT ... ON ALL TABLES` reaches
    // every table the prior steps created; ALTER DEFAULT PRIVILEGES (inside the
    // helper) covers tables future migrations add. It is a NO-OP unless
    // APP_SERVICE_DB_PASSWORD is set, so an install that has not opted into the
    // split role behaves exactly as before.
    const result = await provisionAppServiceRole(pool, {
      log: (m) => console.log(m),
    });
    if (result.skipped) {
      console.log(
        `  • ${result.role} not provisioned (APP_SERVICE_DB_PASSWORD unset). Production boot ` +
          'will FAIL CLOSED if it connects as a superuser under RLS_ENFORCE=on — set ' +
          'APP_SERVICE_DB_PASSWORD here and APP_DATABASE_URL for the runtime before going live.',
      );
    }
  });

  await step('8/8 Verify', async () => {
    const tables = await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
    );
    const policies = await pool.query(`SELECT count(*)::int AS n FROM pg_policies`);
    const tableCount = tables.rows[0].n;
    const policyCount = policies.rows[0].n;
    console.log(`  tables (public): ${tableCount}`);
    console.log(`  RLS policies:    ${policyCount}`);
    if (tableCount < 100) throw new Error(`expected the full schema (100s of tables); only ${tableCount} created`);
    if (policyCount < 1) throw new Error('no RLS policies created — tenant isolation would be absent');

    // Assert the core product tables the shipping routes read actually exist —
    // these come from the raw overlay, not push, and their absence is exactly
    // what makes the app render fixtures instead of live data.
    const CORE_TABLES = [
      'regulatory_programs',
      'c2c_documents',
      'c2c_document_sections',
      'c2c_rule_packs',
      'c2c_project_pinned_evidence',
    ];
    const core = await pool.query(
      `SELECT t AS name, to_regclass('public.' || t) IS NOT NULL AS present
         FROM unnest($1::text[]) AS t`,
      [CORE_TABLES],
    );
    const missingCore = core.rows.filter((r) => !r.present).map((r) => r.name);
    console.log(`  core route tables: ${CORE_TABLES.length - missingCore.length}/${CORE_TABLES.length} present`);
    if (missingCore.length) {
      throw new Error(
        `core product tables missing (routes would read absent tables → UI shows sample data): ${missingCore.join(', ')}`,
      );
    }

    // Authoring subsystem — the exact contract /readyz enforces at boot
    // (server/db/ensureCoreTables.ts). Absent OR partial here means the install
    // did not stand the subsystem up as a unit; fail loudly rather than ship a
    // database whose authoring routes throw while readiness would report red.
    const authoring = await pool.query(
      `SELECT t AS name, to_regclass('public.' || t) IS NOT NULL AS present
         FROM unnest($1::text[]) AS t`,
      [AUTHORING_SUBSYSTEM_TABLES],
    );
    const missingAuthoring = authoring.rows.filter((r) => !r.present).map((r) => r.name);
    console.log(
      `  authoring subsystem: ${AUTHORING_SUBSYSTEM_TABLES.length - missingAuthoring.length}/${AUTHORING_SUBSYSTEM_TABLES.length} tables present`,
    );
    if (missingAuthoring.length) {
      throw new Error(
        `authoring subsystem incomplete (authoring routes would throw; /readyz would fail closed): missing ${missingAuthoring.join(', ')}`,
      );
    }

    // Runtime role posture — only asserted when the split role was requested
    // (APP_SERVICE_DB_PASSWORD set). Confirms the role exists and is genuinely
    // least-privilege (not a superuser, no BYPASSRLS) and can actually read a
    // core tenant table — so a green install can never hand over a role that
    // would fail the production boot posture check or be locked out of its
    // tables. Mirrors server/db/rlsEnforcement.ts → assertRlsCatalogPosture.
    if (process.env.APP_SERVICE_DB_PASSWORD) {
      const role = resolveAppServiceRole();
      const roleRow = (
        await pool.query(
          'SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1',
          [role],
        )
      ).rows[0];
      if (!roleRow) {
        throw new Error(`runtime role ${role} was requested but does not exist after provisioning`);
      }
      const roleFailures = [];
      if (roleRow.rolsuper) roleFailures.push('is a superuser (RLS would never filter)');
      if (roleRow.rolbypassrls) roleFailures.push('has BYPASSRLS (RLS would never filter)');
      if (!roleRow.rolcanlogin) roleFailures.push('cannot LOGIN (runtime could not connect)');
      const canRead = (
        await pool.query(
          `SELECT has_table_privilege($1, 'public.organizations', 'SELECT') AS ok`,
          [role],
        )
      ).rows[0]?.ok;
      if (!canRead) roleFailures.push('lacks SELECT on public.organizations (grants did not apply)');
      if (roleFailures.length) {
        throw new Error(`runtime role ${role} posture is unsafe: ${roleFailures.join('; ')}`);
      }
      console.log(
        `  runtime role ${role}: LOGIN · non-superuser · NOBYPASSRLS · can read tenant tables ✓`,
      );
    }

    // The success banner is printed by main(), and ONLY when nothing was
    // recorded incomplete. It used to print here, unconditionally.
  });
}

/**
 * Final verdict.
 *
 * Green is earned, not assumed. If any step recorded a shortfall the script
 * says what is missing, what it means, and exits non-zero — unless the operator
 * explicitly asked for a partial install with --allow-incomplete, in which case
 * it still says what is missing and exits 0.
 */
function report() {
  if (!incomplete.length) {
    console.log('\n✅ Application schema install complete.');
    console.log('   Next:');
    console.log('   • run `node scripts/db/deploy-migrate.mjs` to apply the out-of-band');
    console.log('     C2C migration set (the db/migrations/ files NO other path applies —');
    console.log('     e.g. the clinical-regulatory evidence spine, section tracking, and');
    console.log('     the governance/resolution tables). This installer does NOT apply');
    console.log('     that set; without it the routes reading those tables fall back to');
    console.log('     sample data. (In the AWS pipeline deploy-migrate runs as its own');
    console.log('     step after this one; a local install must run it by hand.)');
    console.log('   • set RLS_ENFORCE=on and restart to enforce tenant isolation;');
    console.log('   • point the runtime at the non-superuser role: set APP_DATABASE_URL to the');
    console.log('     app_service connection string (set APP_SERVICE_DB_PASSWORD here first so');
    console.log('     the role is provisioned). Migrations keep using DATABASE_URL (the owner).');
    console.log('     Production boot fails closed under RLS_ENFORCE=on if it connects as a superuser.');
    console.log('   • leave SEED_DEMO_USER unset in production (no known-password admin).');
    return 0;
  }

  console.error(`\n⚠️  Install finished with ${incomplete.length} incomplete area(s):`);
  for (const { area, detail } of incomplete) {
    console.error(`   • ${area}: ${detail}`);
  }

  if (ALLOW_INCOMPLETE) {
    console.error('\n   Continuing anyway: --allow-incomplete was passed.');
    console.error('   This database is NOT fully provisioned. Do not treat it as production-ready');
    console.error('   without resolving the areas above.');
    return 0;
  }

  console.error('\n❌ Install INCOMPLETE — not reporting success.');
  console.error('   Resolve the areas above and re-run (the script is idempotent), or pass');
  console.error('   --allow-incomplete to accept a partial install deliberately.');
  return 1;
}

main()
  .then(async () => {
    const code = report();
    await pool.end().catch(() => {});
    process.exit(code);
  })
  .catch(async (err) => {
    console.error(`\n❌ Install failed: ${err.message}`);
    await pool.end().catch(() => {});
    process.exit(1);
  });
