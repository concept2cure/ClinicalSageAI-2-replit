#!/usr/bin/env node
/**
 * Self-test for scripts/ci/check-purge-coverage.mjs (ci:purge-coverage).
 *
 * The gate measures a LIVE schema, so it only runs in the blank-database CI job.
 * Its failure branch — "NEW org-keyed table(s) a tenant purge cannot reach" —
 * has fired there: CI runs 12751 (governed_decision_transitions, its cascade to
 * projects removed), 12756 (collab_presence, project_continuity_snapshots) and
 * 12804 (scheduled_job_claims), all on 2026-10-01 and all recorded beside their
 * entries in tenant-offboarding.ts; and organization_retention_settings in the
 * P1-22 fix round (cd68fb65, docs/evidence/D6/2026-10-01-tranche-4/P1-22-org/red/).
 * But each of those fired against whatever the live schema happened to hold
 * that day. Nothing proved that each detection path works — no FK, a
 * non-cascading FK, a cascade only from organizations, a cascade from an
 * unreached parent — or that the fail-closed branches fail. A path the schema
 * has not yet exercised is a path that can be broken without anyone seeing it
 * (CLAUDE.md, working agreement: verify by making the check fail).
 *
 * The question the gate answers is a graph question over the real catalog: which
 * public base tables carry organization_id and are neither named in
 * PURGE_CHILD_TABLES nor reachable from one by ON DELETE CASCADE. A regex fixture
 * cannot exercise that, so this runs the gate against a real PostgreSQL: PGlite,
 * in this process, behind a Unix socket in a temp directory, speaking the wire
 * protocol to the gate's own `pg` client. Nothing leaves the machine and nothing
 * touches a real database or this repository's baseline.
 *
 * The gate is run as a patched copy whose two edits are path-only: `repoRoot`
 * points at a fixture tree (a fixture tenant-offboarding.ts and baseline), and
 * the bare `pg` import is resolved to this repository's copy so the gate can run
 * from a temp directory. Its SQL, parsing and baseline logic are the real ones.
 *
 * The failing shapes are the ones the gate's header and history name:
 *   - a new org-keyed table nothing reaches (how the residue grew to 615; the
 *     shape of collab_presence, project_continuity_snapshots and
 *     scheduled_job_claims, CI runs 12756 and 12804);
 *   - a foreign key to a purged table that does NOT cascade (SET NULL, NO ACTION);
 *   - a cascade runs parent → child only: a purged child does not reach its
 *     parent, even when the child's FK to that parent is ON DELETE CASCADE;
 *   - a cascade only from organizations, which a purge UPDATEs and never deletes
 *     (the shape of organization_retention_settings, cd68fb65);
 *   - a cascade from a parent the purge never reaches;
 * and the fail-closed branches: no DATABASE_URL, a placeholder, an unreachable
 * database, an unprovisioned or only partly provisioned one, a missing or
 * unreadable list, an entry the gate cannot interpret, a missing baseline (read
 * as empty, so every residue table is NEW). --write-baseline must CARRY FORWARD
 * a baselined table this database cannot see (the 613 → 600 incident), and the
 * carried baseline must still pass on a database that does have it.
 *
 * Near-misses a sloppy gate would get wrong: a list annotated with apostrophes
 * and backticks in its comments, referenced before its declaration; a
 * commented-out entry (must NOT count as listed); schema-qualified vault entries
 * (reported out of scope, never silently dropped); a two-hop cascade; a VIEW
 * that carries organization_id; a table with no organization_id.
 *
 * Not asserted, because the gate does not do it today: a public table whose only
 * cascade path starts at a schema-qualified purge entry (vault.*) is reported as
 * residue although the purge would reach it — the residue query is public-only
 * in both halves. Pinning that here would make the limitation a requirement.
 *
 * Also outside this gate's reach: the ORDER of PURGE_CHILD_TABLES. The gate asks
 * which tables the purge reaches, a set question; it never reads the list as a
 * sequence. So a foreign-key ORDER failure — such as the 23503 from deleting
 * client_workspaces before projects, which reference their workspace with no
 * cascade (2ab30c93, fixed 2026-10-01) — passes this gate and this selftest.
 * That regression is guarded by tests/db/tenant-purge-artifact-records.dbtest.ts,
 * which runs the real list against a tenant with a workspace and a project.
 *
 * SELFTEST_GATE_PATH points the selftest at another copy of the gate (a mutant),
 * to show the selftest fails when the gate's detection is weakened:
 *   SELFTEST_GATE_PATH=/tmp/mutant.mjs node scripts/ci/check-purge-coverage.selftest.mjs
 *
 * Usage: node scripts/ci/check-purge-coverage.selftest.mjs   (exit 0 = every case held)
 */

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const SELF = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(SELF), '..', '..');
const TAG = '[ci:purge-coverage:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-purge-coverage.mjs');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'purge-coverage-'));
const tree = path.join(base, 'tree');
const OFFBOARDING = path.join(tree, 'server', 'services', 'tenant', 'tenant-offboarding.ts');
const BASELINE = path.join(tree, 'docs', 'reports', 'purge-coverage-baseline.json');

// ── The gate, patched to read the fixture tree ────────────────────────────────

const gateCopy = path.join(base, 'check-purge-coverage.mjs');
{
  const src = fs.readFileSync(GATE, 'utf8');
  let pgImport = 0;
  let rootConst = 0;
  const patched = src
    .replace(/^import pg from 'pg';$/m, () => {
      pgImport++;
      return `import pg from ${JSON.stringify(import.meta.resolve('pg'))};`;
    })
    .replace(/^const repoRoot = [^;]+;$/m, () => {
      rootConst++;
      return `const repoRoot = ${JSON.stringify(tree)};`;
    });
  if (pgImport !== 1 || rootConst !== 1) {
    // Refuse rather than run a copy that might read the real tree or write the
    // real baseline (--write-baseline is one of the cases).
    console.error(`${TAG} cannot patch ${path.relative(repoRoot, GATE)}: expected one`);
    console.error("  `import pg from 'pg';` and one `const repoRoot = …;` line — the gate's shape changed.");
    fs.rmSync(base, { recursive: true, force: true });
    process.exit(1);
  }
  fs.writeFileSync(gateCopy, patched);
}

// ── A real PostgreSQL behind a Unix socket ────────────────────────────────────

const db = new PGlite();
await db.waitReady;

let sockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcs-'));
if (path.join(sockDir, '.s.PGSQL.5432').length > 100) {
  // sun_path is ~104-108 bytes; a long TMPDIR (macOS) would overflow it.
  fs.rmSync(sockDir, { recursive: true, force: true });
  sockDir = fs.mkdtempSync('/tmp/pcs-');
}
const noServerDir = fs.mkdtempSync(path.join(sockDir, 'none-'));
const dbUrl = (dir) =>
  `postgresql://postgres@localhost/postgres?host=${encodeURIComponent(dir)}&sslmode=disable`;
const DB_URL = dbUrl(sockDir);

/** PGlite is one session; every protocol message goes through this one queue. */
let chain = Promise.resolve();
const server = net.createServer((sock) => {
  sock.on('error', () => {});
  let buf = Buffer.alloc(0);
  let started = false;
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      let msg;
      if (!started) {
        if (buf.length < 4) break;
        const len = buf.readInt32BE(0);
        if (buf.length < len) break;
        msg = buf.subarray(0, len);
        buf = buf.subarray(len);
        if (len === 8 && msg.readInt32BE(4) === 80877103) {
          sock.write('N'); // SSLRequest: no SSL here; the client continues in plaintext.
          continue;
        }
        started = true;
      } else {
        if (buf.length < 5) break;
        const len = buf.readInt32BE(1);
        if (buf.length < len + 1) break;
        msg = buf.subarray(0, len + 1);
        buf = buf.subarray(len + 1);
      }
      const m = new Uint8Array(msg);
      chain = chain.then(async () => {
        if (m[0] === 0x58 /* 'X' Terminate */) {
          sock.end();
          return;
        }
        try {
          const out = await db.execProtocolRaw(m);
          if (out.length && !sock.destroyed) sock.write(Buffer.from(out));
        } catch {
          sock.destroy();
        }
      });
    }
  });
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(path.join(sockDir, '.s.PGSQL.5432'), resolve);
});

async function resetDatabase(ddl) {
  await chain;
  await db.exec('DROP SCHEMA IF EXISTS vault CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  if (ddl) await db.exec(ddl);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Provisioned: the four tables the gate's provisioning probe looks for exist. */
const BASE_DDL = `
  CREATE TABLE organizations (id serial PRIMARY KEY, name text NOT NULL, status text NOT NULL DEFAULT 'active');
  CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL);
  -- Named in PURGE_CHILD_TABLES.
  CREATE TABLE module_access_requests (
    id serial PRIMARY KEY,
    organization_id integer NOT NULL REFERENCES organizations(id),
    justification text
  );
  CREATE TABLE projects (
    id serial PRIMARY KEY,
    organization_id integer NOT NULL REFERENCES organizations(id),
    name text
  );
  -- Reached by ON DELETE CASCADE from a listed table: one hop, then two.
  CREATE TABLE documents (
    id serial PRIMARY KEY,
    organization_id integer NOT NULL,
    project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE TABLE document_versions (
    id serial PRIMARY KEY,
    organization_id integer NOT NULL,
    document_id integer NOT NULL REFERENCES documents(id) ON DELETE CASCADE
  );
  -- Retained on purpose (the audit trail outlives the tenant) and baselined.
  CREATE TABLE audit_logs (id serial PRIMARY KEY, organization_id integer, action text NOT NULL);
  -- Not org-keyed: cross-tenant reference data.
  CREATE TABLE code_lists (id serial PRIMARY KEY, code text NOT NULL);
  -- A VIEW carrying organization_id holds no rows of its own.
  CREATE VIEW org_document_counts AS
    SELECT organization_id, count(*) AS n FROM documents GROUP BY organization_id;
  -- Listed schema-qualified; outside the gate's public-only scope.
  CREATE SCHEMA vault;
  CREATE TABLE vault.documents (id serial PRIMARY KEY, organization_id integer NOT NULL);
  CREATE TABLE vault.document_chunks (
    id serial PRIMARY KEY,
    organization_id integer NOT NULL,
    document_id integer NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE
  );
`;

/**
 * Annotated the way the real list is: apostrophes and backticks in the comments
 * (the defect that once read prose between two apostrophes as a table name),
 * schema-qualified vault entries, and one entry commented out — which must not
 * count as listed.
 */
const BASE_ENTRIES = [
  "  // Access requests hold the member's free-text business justification and",
  "  // the administrator's decision reason: the tenant's words, not ours.",
  "  'module_access_requests',",
  '  /* SCHEMA-QUALIFIED, and chunks BEFORE documents: the vault holds the',
  "     customer's actual regulatory documents. */",
  "  'vault.document_chunks',",
  "  'vault.documents',",
  "  // 'adverse_events', -- held back: its FK order hasn't been reviewed yet.",
  "  // `projects` last; a project's documents and their versions cascade from it.",
  "  'projects',",
];

function service(entries = BASE_ENTRIES) {
  return [
    "import type { Pool } from 'pg';",
    '',
    'export async function purgeTenant(',
    '  pool: Pool,',
    '  organizationId: number,',
    '  params: { childTables?: readonly string[] } = {},',
    ') {',
    '  // Referenced BEFORE its declaration, as in the real service.',
    '  const childTables = params.childTables ?? PURGE_CHILD_TABLES;',
    '  for (const t of childTables) {',
    "    await pool.query('DELETE FROM ' + t + ' WHERE organization_id = $1', [organizationId]);",
    '  }',
    "  await pool.query(\"UPDATE organizations SET status = 'purged' WHERE id = $1\", [organizationId]);",
    '}',
    '',
    '/**',
    ' * Tenant-owned tables emptied by a purge, in foreign-key-safe order. The audit',
    ' * trail is NOT here: it must outlive the tenant.',
    ' */',
    'export const PURGE_CHILD_TABLES: readonly string[] = Object.freeze([',
    ...entries,
    ']);',
    '',
  ].join('\n');
}

const baselineJson = (tables) =>
  `${JSON.stringify({ generatedAt: '2026-09-19T00:00:00.000Z', purgeChildTables: [], count: tables.length, tables }, null, 2)}\n`;

// ── Running one case ──────────────────────────────────────────────────────────

const scrubbedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => k !== 'DATABASE_URL' && !/^PG/.test(k)),
);

function runGate(args, url) {
  const env = { ...scrubbedEnv };
  if (url !== null) env.DATABASE_URL = url;
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [gateCopy, ...args],
      { cwd: tree, env, encoding: 'utf8', timeout: 30_000 },
      (err, stdout, stderr) => {
        const code = !err ? 0 : typeof err.code === 'number' ? err.code : 1;
        const timedOut = err?.killed ? '\n(selftest: gate killed after 30 s)' : '';
        resolve({ code, out: `${stdout ?? ''}${stderr ?? ''}${timedOut}` });
      },
    );
  });
}

async function arrange(c) {
  fs.rmSync(tree, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(OFFBOARDING), { recursive: true });
  if (c.source !== null) fs.writeFileSync(OFFBOARDING, c.source ?? service(c.entries));
  if (c.baseline !== null) {
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(BASELINE, baselineJson(c.baseline ?? ['audit_logs']));
  }
  await resetDatabase(c.ddl ?? BASE_DDL);
}

/** The tables the gate named as NEW residue, read from its `  - <table>` lines. */
const namedNew = (out) => [...out.matchAll(/^ {2}- (\S+)$/gm)].map((m) => m[1]).sort();

const okLine = (residue, known, covered = 0) =>
  `✅ purge-coverage: ${residue} org-keyed tables outside the purge reach ` +
  `(baseline ${known}, new 0${covered ? `, ${covered} now covered` : ''}).`;

// ── Cases ─────────────────────────────────────────────────────────────────────

const cases = [
  // The shapes the gate exists to catch.
  {
    // An org-keyed leaf with no foreign key: collab_presence and
    // project_continuity_snapshots (CI run 12756), scheduled_job_claims (12804).
    name: 'FAILS on a new org-keyed table nothing reaches — and a commented-out entry does not count as listed',
    ddl: `${BASE_DDL}
      CREATE TABLE adverse_events (id serial PRIMARY KEY, organization_id integer NOT NULL, narrative text);`,
    expect: 1,
    newTables: ['adverse_events'],
    mustSay: ['NEW org-keyed table(s) a tenant purge cannot reach', 'add it to PURGE_CHILD_TABLES'],
  },
  {
    name: 'FAILS on a foreign key to a purged table that does not cascade (SET NULL, NO ACTION)',
    ddl: `${BASE_DDL}
      CREATE TABLE agency_correspondence (
        id serial PRIMARY KEY, organization_id integer NOT NULL,
        project_id integer REFERENCES projects(id) ON DELETE SET NULL);
      CREATE TABLE ai_threads (
        id serial PRIMARY KEY, organization_id integer NOT NULL,
        project_id integer REFERENCES projects(id));`,
    expect: 1,
    newTables: ['agency_correspondence', 'ai_threads'],
  },
  {
    // FK direction only. A purged child does not reach its parent, even when the
    // child's FK to it is ON DELETE CASCADE: the cascade runs from the parent's
    // delete. A gate that followed foreign keys in both directions would call
    // the unlisted parent reached. (The table names are illustrative; the real
    // list does name client_workspaces, and its 2026-10-01 fix was an ORDER fix
    // this gate cannot see — see "Also outside this gate's reach" above.)
    name: 'FAILS on an unlisted parent of a purged table — a purged child does not reach its parent',
    ddl: `${BASE_DDL}
      CREATE TABLE client_workspaces (id serial PRIMARY KEY, organization_id integer NOT NULL);
      ALTER TABLE projects ADD COLUMN client_workspace_id integer
        REFERENCES client_workspaces(id) ON DELETE CASCADE;`,
    expect: 1,
    newTables: ['client_workspaces'],
  },
  {
    // organization_retention_settings (cd68fb65): its only FK is to
    // organizations ON DELETE CASCADE, so the cascade never fires.
    name: 'FAILS on a table that cascades only from organizations — a purge UPDATEs that row, never deletes it',
    ddl: `${BASE_DDL}
      CREATE TABLE tenant_branding (
        id serial PRIMARY KEY,
        organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        logo bytea);`,
    expect: 1,
    newTables: ['tenant_branding'],
  },
  {
    name: 'FAILS on a cascade from a parent the purge never reaches (cascade is followed only from reached tables)',
    ddl: `${BASE_DDL}
      CREATE TABLE review_threads (
        id serial PRIMARY KEY, organization_id integer NOT NULL,
        document_id integer REFERENCES documents(id) ON DELETE SET NULL);
      CREATE TABLE review_comments (
        id serial PRIMARY KEY, organization_id integer NOT NULL,
        thread_id integer NOT NULL REFERENCES review_threads(id) ON DELETE CASCADE);`,
    expect: 1,
    newTables: ['review_comments', 'review_threads'],
  },

  // Clean shapes, and the near-misses a sloppy gate would flag or drop.
  {
    name: 'quiet — listed, cascade-reached in one and two hops, or baselined; view / non-org / vault tables ignored',
    expect: 0,
    mustSay: [
      okLine(1, 1),
      // The vault entries are named as out of scope — never silently dropped.
      "2 schema-qualified purge entr(y/ies) are OUTSIDE this gate's scope",
      'vault.document_chunks, vault.documents',
    ],
    mustNotSay: ['NEW org-keyed', 'cannot interpret'],
  },
  {
    name: 'quiet — a residue table already in the baseline stays suppressed',
    ddl: `${BASE_DDL}
      CREATE TABLE adverse_events (id serial PRIMARY KEY, organization_id integer NOT NULL);`,
    baseline: ['adverse_events', 'audit_logs'],
    expect: 0,
    mustSay: [okLine(2, 2)],
  },
  {
    name: 'reports a baselined table the purge now reaches, and asks for the gain to be locked in',
    ddl: `${BASE_DDL}
      CREATE TABLE legacy_notes (
        id serial PRIMARY KEY, organization_id integer NOT NULL,
        project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE);`,
    baseline: ['audit_logs', 'legacy_notes'],
    expect: 0,
    mustSay: [okLine(1, 2, 1), 'Newly covered — re-run with --write-baseline', '     legacy_notes'],
  },
  {
    name: '--write-baseline KEEPS a baselined table this database cannot see, drops only an earned one',
    ddl: `${BASE_DDL}
      CREATE TABLE legacy_notes (
        id serial PRIMARY KEY, organization_id integer NOT NULL,
        project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE);`,
    baseline: ['audit_logs', 'ghost_findings', 'legacy_notes'],
    args: ['--write-baseline'],
    expect: 0,
    mustSay: [
      'wrote baseline: docs/reports/purge-coverage-baseline.json (2 tables)',
      '1 table(s) genuinely covered and removed from the baseline',
      '     legacy_notes',
      '1 table(s) are ABSENT from this database and were KEPT',
      '     ghost_findings',
    ],
    after: async () => {
      const problems = [];
      const written = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
      if (JSON.stringify(written.tables) !== JSON.stringify(['audit_logs', 'ghost_findings'])) {
        problems.push(`written baseline tables were ${JSON.stringify(written.tables)}`);
      }
      if (written.count !== 2) problems.push(`written baseline count was ${written.count}`);
      // The consequence that made carry-forward necessary: a database that DOES
      // have the table (the blank-database CI job) must still pass the ratchet.
      await resetDatabase(`${BASE_DDL}
        CREATE TABLE ghost_findings (id serial PRIMARY KEY, organization_id integer NOT NULL);`);
      const again = await runGate([], DB_URL);
      if (again.code !== 0 || !again.out.includes(okLine(2, 2))) {
        problems.push(`the written baseline failed on a database that has ghost_findings (exit ${again.code}):`);
        problems.push(...again.out.trimEnd().split('\n').map((l) => `  | ${l}`));
      }
      return problems;
    },
  },

  // Fail closed: the gate never reports success for something it did not measure.
  {
    // A deleted or moved baseline must not turn the ratchet off. The gate reads
    // a missing file as an EMPTY baseline, so the retained audit_logs — quiet
    // only because the baseline names it — is reported as NEW. Check mode must
    // not write the missing file either; only --write-baseline does that.
    name: 'FAILS closed on a missing baseline — every residue table counts as NEW',
    baseline: null,
    expect: 1,
    newTables: ['audit_logs'],
    mustSay: ['NEW org-keyed table(s) a tenant purge cannot reach'],
    mustNotSay: ['✅'],
    after: async () =>
      fs.existsSync(BASELINE) ? ['check mode created the missing baseline file'] : [],
  },
  {
    name: 'FAILS closed when DATABASE_URL is unset',
    url: null,
    expect: 1,
    mustSay: ['DATABASE_URL is unset or a placeholder'],
  },
  {
    name: 'FAILS closed on a placeholder DATABASE_URL',
    url: 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
    expect: 1,
    mustSay: ['DATABASE_URL is unset or a placeholder'],
  },
  {
    name: 'FAILS closed, readably, when the database cannot be reached',
    url: dbUrl(noServerDir),
    expect: 1,
    mustSay: ['cannot connect to DATABASE_URL'],
    mustNotSay: ['\n    at '],
  },
  {
    // Three of the four probe tables (no documents): a database some migrations
    // never reached. One missing probe table is enough to refuse — measuring it
    // would report whatever subset happened to be applied.
    name: 'FAILS closed on a partly provisioned database (3 of 4 probe tables) rather than measuring it',
    ddl: `CREATE TABLE organizations (id serial PRIMARY KEY);
      CREATE TABLE users (id serial PRIMARY KEY);
      CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL);
      CREATE TABLE adverse_events (id serial PRIMARY KEY, organization_id integer NOT NULL);`,
    expect: 1,
    mustSay: ['this database is not provisioned'],
    mustNotSay: ['✅', 'NEW org-keyed'],
  },
  {
    name: 'FAILS closed on an empty database rather than measuring it',
    ddl: '',
    expect: 1,
    mustSay: ['this database is not provisioned'],
    mustNotSay: ['✅', 'NEW org-keyed'],
  },
  {
    name: 'FAILS closed when the offboarding service is missing',
    source: null,
    expect: 1,
    mustSay: ['tenant-offboarding.ts not found'],
  },
  {
    name: 'FAILS closed when PURGE_CHILD_TABLES is not a frozen literal it can read',
    source: "export const PURGE_CHILD_TABLES: readonly string[] = ['module_access_requests', 'projects'];\n",
    expect: 1,
    mustSay: ['could not parse PURGE_CHILD_TABLES'],
  },
  {
    name: 'FAILS closed on an entry it cannot interpret instead of dropping it',
    entries: [...BASE_ENTRIES, "  'Documents',"],
    expect: 1,
    mustSay: ["cannot interpret PURGE_CHILD_TABLES entry 'Documents'"],
  },
  {
    name: 'FAILS closed on a list with no public-schema entries',
    entries: ["  'vault.document_chunks',", "  'vault.documents',"],
    expect: 1,
    mustSay: ['has no public-schema entries'],
  },
  {
    name: 'FAILS closed on a list that parses to zero entries',
    entries: ["  // 'projects', — everything commented out"],
    expect: 1,
    mustSay: ['parsed to zero entries'],
  },
];

// ── Run ───────────────────────────────────────────────────────────────────────

if (process.env.SELFTEST_GATE_PATH) console.log(`${TAG} testing ${GATE} (SELFTEST_GATE_PATH)`);

let failed = 0;
try {
  for (const c of cases) {
    await arrange(c);
    const res = await runGate(c.args ?? [], c.url === undefined ? DB_URL : c.url);
    const problems = [];
    if (res.code !== c.expect) problems.push(`expected exit ${c.expect}, got ${res.code}`);
    for (const s of c.mustSay ?? []) {
      if (!res.out.includes(s)) problems.push(`output lacked: ${JSON.stringify(s)}`);
    }
    for (const s of c.mustNotSay ?? []) {
      if (res.out.includes(s)) problems.push(`output should not contain: ${JSON.stringify(s)}`);
    }
    if (c.newTables) {
      const named = namedNew(res.out);
      if (JSON.stringify(named) !== JSON.stringify([...c.newTables].sort())) {
        problems.push(`named as new ${JSON.stringify(named)}, expected exactly ${JSON.stringify(c.newTables)}`);
      }
    }
    if (c.after && problems.length === 0) {
      try {
        problems.push(...(await c.after()));
      } catch (err) {
        problems.push(`check threw: ${err.message}`);
      }
    }
    console.log(`  ${problems.length ? '✗' : '✓'} ${c.name}`);
    if (problems.length) {
      failed++;
      for (const p of problems) console.log(`      ${p}`);
      console.log(res.out.trimEnd().split('\n').map((l) => `      | ${l}`).join('\n'));
    }
  }
} finally {
  await chain.catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  fs.rmSync(base, { recursive: true, force: true });
  fs.rmSync(sockDir, { recursive: true, force: true });
}

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold.`);
  process.exit(1);
}
console.log(`\n${TAG} ${cases.length} passed — the gate fails on what it exists to catch.`);
