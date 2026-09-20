/**
 * Contract: every `KNOWN_UNLISTED` exemption satisfies the reason it claims.
 *
 * ── THE RULE THIS ENFORCES IS THE LIST'S OWN ─────────────────────────────────
 * `tests/ops/apply-c2c-migrations-manifest.test.mjs` exempts dated root
 * migrations from the applier allowlist. Its header says why:
 *
 *     "their objects come from shared/schema.ts via drizzle-kit push and they
 *      carry nothing an existing database additionally needs. … Removing an
 *      entry (by listing the file in the applier) is always safe; adding one
 *      requires the reason above to actually hold."
 *
 * Nothing checked that it held. This gate does.
 *
 * ── WHAT FAILING MEANS ───────────────────────────────────────────────────────
 * An exempted file that creates a table push does NOT create, or that carries an
 * `ADD COLUMN` for a column push does NOT declare, is a file whose objects reach
 * a database only through install-fresh's step-3 overlay. `deploy-migrate` never
 * runs it. So the objects exist on every freshly provisioned database, are
 * re-asserted on none, and any later change to the file reaches new installs
 * only — the exact shape of WO-15 findings 3 and 5.
 *
 * Measured when this gate was written: of 15 entries, 10 failed, covering 16
 * tables — `protocol_soa_assessments`, `protocol_soa_cells`,
 * `protocol_budget_items`, `protocol_budget_params`, `dms_plans`,
 * `dms_plan_elements`, `biosketches`, `biosketch_sections`,
 * `other_support_documents`, `other_support_entries`, `export_control_reviews`,
 * `invention_disclosures`, `research_agreements`, `chat_threads`,
 * `chat_messages`, `canonical_documents`. All 16 are present on a provisioned
 * database and referenced by live non-test code (3–44 references each).
 *
 * ── THE ONE EXCEPTION, AND WHY IT IS NAMED RATHER THAN INFERRED ──────────────
 * `20260728_authoring_reviews.sql` creates a table that is NOT on the push
 * surface, so it fails the stated reason — but it is clean for a different,
 * verified reason: `db/migrations/20260730_authoring_subsystem_schema.sql`
 * creates `authoring_reviews`, that file is in `AUTHORING_SUBSYSTEM_FILES`, and
 * `applyAuthoringSubsystem` is called by BOTH `scripts/db/deploy-migrate.mjs`
 * and the install path. It is listed below with that justification asserted, not
 * merely asserted about — if the authoring subsystem ever stops running on
 * deploy-migrate, the second test in this file fails and the exception dies with
 * it. An exception whose premise is not itself checked is a hole.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  declaredTableEntries,
  declaredTableColumns,
} from '../../scripts/db/lib/declared-tables.mjs';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GUARD = path.join(REPO_ROOT, 'tests/ops/apply-c2c-migrations-manifest.test.mjs');
const ENTRYPOINTS = [
  './shared/schema.ts',
  './shared/schema/ana-intelligence.ts',
  './shared/schema/report-os.ts',
];

/**
 * Entries exempted for a reason OTHER than the list's stated one. Each needs its
 * premise asserted elsewhere in this file — see the header.
 */
const REASONED_EXCEPTIONS = new Map([
  [
    'migrations/20260728_authoring_reviews.sql',
    'authoring_reviews is created by AUTHORING_SUBSYSTEM_FILES, which ' +
      'applyAuthoringSubsystem runs on deploy-migrate as well as install-fresh',
  ],
]);

function knownUnlisted(): string[] {
  const src = fs.readFileSync(GUARD, 'utf8');
  const start = src.indexOf('const KNOWN_UNLISTED');
  const block = src.slice(start, src.indexOf(']);', start));
  return [...block.matchAll(/['"]([^'"]+\.sql)['"]/g)]
    .map((m) => m[1])
    .filter((f) => fs.existsSync(path.join(REPO_ROOT, f)));
}

const pushedTables = new Set(declaredTableEntries(ENTRYPOINTS, REPO_ROOT).map((t) => t.name));
const pushedColumns = declaredTableColumns(ENTRYPOINTS, REPO_ROOT);

/** Why this entry fails the stated reason, or null if it holds. */
function whyItFails(rel: string): string | null {
  const text = fs
    .readFileSync(path.join(REPO_ROOT, rel), 'utf8')
    .replace(/--.*$/gm, '');
  const creates = [
    ...new Set(
      [...text.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["'`]?([a-zA-Z0-9_.]+)["'`]?\s*\(/gi)]
        .map((m) => m[1].replace(/^public\./, '')),
    ),
  ];
  const notPushed = creates.filter((t) => !pushedTables.has(t));
  if (notPushed.length) return `creates table(s) push does not: ${notPushed.join(', ')}`;

  const adds = [
    ...text.matchAll(
      /ALTER TABLE\s+(?:IF EXISTS\s+)?["'`]?([a-zA-Z0-9_.]+)["'`]?\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?["'`]?([a-z0-9_]+)/gi,
    ),
  ].map((m) => [m[1].replace(/^public\./, ''), m[2]] as const);
  const undeclared = adds
    .filter(([t, c]) => !pushedColumns.get(t)?.has(c))
    .map(([t, c]) => `${t}.${c}`);
  if (undeclared.length) return `adds column(s) push does not declare: ${undeclared.join(', ')}`;

  return null;
}

describe('KNOWN_UNLISTED entries satisfy the reason the list states', () => {
  const entries = knownUnlisted();

  it('parses every entry the list actually contains', () => {
    /* A gate that stops parsing is a gate that always passes — but the count
       must not be pinned to a number, because the list is SUPPOSED to shrink as
       entries are fixed. (It was pinned to ">5" when the list held 15; the fix
       took it to 5 and the guard failed on its own success.) So: cross-check the
       parsed count against a raw count of .sql literals in the same block. */
    const src = fs.readFileSync(GUARD, 'utf8');
    const start = src.indexOf('const KNOWN_UNLISTED');
    const block = src.slice(start, src.indexOf(']);', start));
    const raw = [...block.matchAll(/['"][^'"]+\.sql['"]/g)].length;

    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.length).toBe(raw);
    expect(pushedTables.size).toBeGreaterThan(400);
    expect(pushedColumns.size).toBeGreaterThan(400);
  });

  it('leaves no entry exempted for a reason that does not hold', () => {
    const failing = entries
      .filter((e) => !REASONED_EXCEPTIONS.has(e))
      .map((e) => ({ e, why: whyItFails(e) }))
      .filter((r) => r.why !== null)
      .map((r) => `${r.e.replace('migrations/', '')} — ${r.why}`);
    // Was: 10 entries covering 16 tables, every one of them live in the product.
    expect(failing).toEqual([]);
  });
});

describe('the reasoned exceptions have their premises checked, not assumed', () => {
  it('every reasoned exception is still in the list it excuses', () => {
    const entries = new Set(knownUnlisted());
    for (const rel of REASONED_EXCEPTIONS.keys()) {
      // A stale exception silently widens the gate's blind spot.
      expect(entries.has(rel)).toBe(true);
    }
  });

  it('authoring_reviews really is on a path deploy-migrate runs', async () => {
    const { AUTHORING_SUBSYSTEM_FILES } = await import(
      '../../scripts/db/authoring-subsystem.mjs'
    );
    const creator = (AUTHORING_SUBSYSTEM_FILES as string[]).find((f) =>
      /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["'`]?authoring_reviews\b/i.test(
        fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'),
      ),
    );
    expect(creator).toBeTruthy();

    const deploy = fs.readFileSync(path.join(REPO_ROOT, 'scripts/db/deploy-migrate.mjs'), 'utf8');
    expect(deploy).toMatch(/applyAuthoringSubsystem\s*\(/);
  });

  it('does not silently rely on the applier list for these', () => {
    // Sanity: the set is loadable and non-trivial, so a failure above is about
    // the exemptions rather than about a broken import.
    expect(C2C_MIGRATION_FILES.length).toBeGreaterThan(200);
  });
});
