/**
 * The canonical submission core must reach a real database.
 *
 * ── The defect this locks shut ───────────────────────────────────────────────
 * MDX UAT 2026-08-18, item A2: `GET /api/submissions` returned 500 on every
 * call while `GET /api/510k/estar/submissions` returned 200 — reported as one
 * service being "down" while another was healthy.
 *
 * They are not two services. They are two STORES, and only one of them existed.
 * `migrations/20260604_submission_core_canonical.sql` creates the region-agnostic
 * core — `submissions`, `submission_regions`, `ectd_sequences`,
 * `submission_leaves` — that `server/routes/submissions.ts` serves and
 * `services/submission-service/submission-service.ts` reads through Drizzle. It
 * was referenced by NOTHING in this repository except an audit document:
 *
 *   • not in `C2C_MIGRATION_FILES`, so deploy-migrate never ran it;
 *   • no `_gcc_` infix, so the CI psql loop never matched it;
 *   • not in the drizzle journal, so `migrate()` never replayed it.
 *
 * Only `install-fresh.mjs`'s root-tree overlay created it, i.e. fresh databases
 * only. Any database provisioned before 2026-06-04 and kept current with
 * deploy-migrate has never had these tables, so `listSubmissions`' first
 * statement raised 42P01 and the route 500'd — permanently, for every tenant on
 * that database. The device eSTAR path has its own tables
 * (`migrations/20260730_estar_submission.sql`, which IS on the deploy path),
 * which is the whole of why one endpoint answered and the other did not.
 *
 * ── Why a test and not just the fix ──────────────────────────────────────────
 * The fix is one line in `scripts/db/migration-set.mjs`, and one line is exactly
 * what gets lost in a merge. This asserts the property the product depends on —
 * "the tables the submissions API queries are created by something a real
 * deployment runs" — rather than the line that currently provides it.
 *
 * NOTE ON SCOPE. `scripts/ci/check-migration-reachability.mjs` is the general
 * guard for this class and it reported green throughout, because `isDurable()`
 * treats the ENTIRE root `migrations/` tree as durable ("the drizzle lineage the
 * journal replays"). That is true of the journaled baseline and false of every
 * hand-written phase migration added since — as `migration-set.mjs`'s own header
 * states: "drizzle's runtime migrate() replays only the journaled baseline".
 * Correcting `isDurable` surfaces 18 further server-referenced tables in the
 * same position, each needing a real-Postgres verification run before being
 * wired (scripts/db/verify-migration-set.mjs). That is tracked separately; this
 * contract covers the store the UAT actually caught.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SUBMISSION_CORE = 'migrations/20260604_submission_core_canonical.sql';

/** The tables the submissions API cannot serve a single request without. */
const CORE_TABLES = ['submissions', 'submission_regions', 'ectd_sequences', 'submission_leaves'];

describe('canonical submission core reachability', () => {
  it('is on the deploy path (C2C_MIGRATION_FILES)', () => {
    expect(C2C_MIGRATION_FILES).toContain(SUBMISSION_CORE);
  });

  it('still creates every table the submissions API queries', () => {
    // Guards the other direction: wiring the file is worthless if the file
    // stops creating what the route needs.
    const sql = fs.readFileSync(path.join(REPO_ROOT, SUBMISSION_CORE), 'utf8');
    for (const table of CORE_TABLES) {
      expect(
        new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:public\\.)?"?${table}"?\\s*\\(`, 'i').test(sql),
        `${SUBMISSION_CORE} no longer creates ${table}`,
      ).toBe(true);
    }
  });

  it('is idempotent, because deploy-migrate re-runs the whole set every deploy', () => {
    // A non-idempotent entry does not break the deploy that adds it — it breaks
    // the NEXT one, which is the expensive way to find out.
    const sql = fs.readFileSync(path.join(REPO_ROOT, SUBMISSION_CORE), 'utf8');
    const creates = [...sql.matchAll(/CREATE TABLE(?<guard> IF NOT EXISTS)?/gi)];
    expect(creates.length).toBeGreaterThan(0);
    for (const m of creates) expect(m.groups?.guard).toBeTruthy();
  });

  it('is ordered after the tables it references and before its consumers', () => {
    // It FKs organizations(id) and users(id) — both drizzle-push base tables, so
    // no ordering constraint inside this set — but the eSTAR submission store
    // must not be mistaken for it. Assert only what matters: it precedes the
    // eSTAR entries, which is where the two stores are easiest to confuse.
    const core = C2C_MIGRATION_FILES.indexOf(SUBMISSION_CORE);
    const estar = C2C_MIGRATION_FILES.indexOf('migrations/20260730_estar_submission.sql');
    expect(core).toBeGreaterThanOrEqual(0);
    if (estar >= 0) expect(core).toBeLessThan(estar);
  });
});
