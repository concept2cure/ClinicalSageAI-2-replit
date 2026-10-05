#!/usr/bin/env node
/**
 * Self-test for check-audit-logs-fixture.mjs (npm run ci:audit-logs-fixture).
 *
 * On a correct tree the gate passes (every fixture a superset of the writer's
 * 17 columns), so its failure branch never fires in normal use, and a guard
 * whose failure branch has never been seen has not been tested (CLAUDE.md,
 * "verify by making the check fail").
 *
 * This builds a fixture repository in a temp directory: a stand-in
 * server/services/auditService.ts whose writeChainedAuditRow INSERTs the same
 * columns, written the same way, as the real one (including the conditional
 * reason column, a template expression), plus test and harness sources that
 * declare audit_logs. It writes a copy of the gate whose ROOT is that tree, runs
 * it, and asserts its verdict per case.
 *
 *  - FAILS, naming file:line and the missing columns, on the shapes the gate
 *    was written for: the twelve-column fixture eleven suites carried (no
 *    old_values, new_values, ip_address, user_agent); the harness constant that
 *    declared only what the chain + seal verifiers READ; a fixture missing only
 *    the conditional `reason` (0f317d69); a column present only as a SQL
 *    comment; omitted columns listed "(a, b)" in a block comment inside the
 *    table, whose commas must not start new columns; a column the writer gains
 *    after the fixture was written (the list is read from the writer, not
 *    restated); bad fixtures in every scan root;
 *    a writer function the gate cannot find, where it must fail closed rather
 *    than pass every fixture against an empty list; and a writer whose INSERT
 *    it cannot read, where it must fail closed rather than fall back to the
 *    narrower INSERT EARLIER in the same file. (A LATER one it does read: see
 *    "Known false negatives".)
 *  - PASSES on the clean shapes a sloppy gate would flag: the shared harness
 *    DDL, whose extra columns and comments carrying "(a, b)" and a leading "--"
 *    directly before a real column are the shape 0f317d69 fixed; constraints,
 *    DEFAULT now(), commas inside parentheses and upper-case column names
 *    (Postgres folds unquoted identifiers, so OLD_VALUES declares old_values);
 *    tables whose names merely contain audit_log, both in files of their own
 *    and in the same file as a real audit_logs table, where the per-table
 *    pattern rather than the per-file pre-filter has to tell them apart; and
 *    sources the gate deliberately does not scan (node_modules, dist, _legacy,
 *    production migrations).
 *
 * The gate has no baseline, so there are no baseline cases.
 *
 * ── Known false negatives ────────────────────────────────────────────────────
 * Each was reproduced against the gate as of 0f317d69. None is pinned by a
 * case: a case asserting a miss would go red the day the gate is fixed.
 *
 *  - A LATER INSERT is read as the writer's. The gate matches its INSERT
 *    pattern over everything from `writeChainedAuditRow` to the END OF THE
 *    FILE. If the writer builds its INSERT at run time and any function below
 *    it has a literal `INSERT INTO audit_logs (id, tenant_id, action) …`, the
 *    gate reports "columns the writer writes : 3" and passes a twelve-column
 *    fixture. The fix belongs in the gate: bound the search to the writer's
 *    body (up to the next top-level `export`). Then the dynamic-INSERT case
 *    below should gain a later literal INSERT.
 *  - A schema-qualified or quoted table name (public.audit_logs, "audit_logs")
 *    is not recognised as a fixture, so however narrow, it is never checked.
 *  - Block comments are not stripped. Inside parentheses their commas are
 *    harmless (a case below pins that), but a top-level list such as
 *    "Not provisioned: old_values, new_values, ip_address" declares
 *    new_values and ip_address as far as the gate can tell.
 *  - Only .ts, .tsx and .mjs files are scanned. scripts/db-verify/
 *    00_bootstrap_base.sql declares audit_logs without old_values, new_values,
 *    ip_address and user_agent today, and is not checked.
 *
 * This file lives under scripts/, which the real gate scans, so it never spells
 * a table header literally: every header is built by ddlHeader(). The real
 * gate's report on the real tree is unchanged by this file's presence.
 *
 * SELFTEST_GATE_PATH runs the cases against another copy of the gate (a
 * mutant, for the mutation check). It defaults to the real gate.
 *
 * Usage: node scripts/ci/check-audit-logs-fixture.selftest.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:audit-logs-fixture:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-audit-logs-fixture.mjs');

// ── Builders ──────────────────────────────────────────────────────────────────

const TABLE = 'audit' + '_logs';
const KEYWORD = ['CREATE', 'TABLE'].join(' ');

/** A table header, assembled so this file never contains one literally. */
function ddlHeader({ ifNotExists = false, lower = false, name = TABLE } = {}) {
  const h = `${KEYWORD} ${ifNotExists ? 'IF NOT EXISTS ' : ''}${name} (`;
  return lower ? h.toLowerCase() : h;
}

/**
 * The stand-in writer. Its INSERT is the real writeChainedAuditRow's, column
 * for column and line for line, including `${reason ? ', reason' : ''}`. A
 * narrower INSERT sits earlier in the file: the gate must read the writer's,
 * not the first one it meets. Nothing follows the writer, because the gate
 * reads a later INSERT (see "Known false negatives").
 */
function writerSource({ name = 'writeChainedAuditRow', extraColumn = '', dynamicInsert = false } = {}) {
  const decoy = [
    "import { randomUUID } from 'node:crypto';",
    '',
    '// An older, narrower INSERT earlier in the same file.',
    'export async function logAction(client, entry) {',
    '  await client.query(',
    '    `INSERT INTO audit_logs (id, tenant_id, action, payload_hash, sha256_chain, occurred_at, hmac_seal)',
    '     VALUES ($1,$2,$3,$4,$5,$6,$7)`,',
    '    [randomUUID(), entry.tenantId, entry.action, null, null, new Date(), null],',
    '  );',
    '}',
    '',
  ];
  const head = [
    `export async function ${name}(`,
    '  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },',
    '  entry: AuditLogEntry,',
    '): Promise<void> {',
    "  const reason = typeof entry.reason === 'string' && entry.reason.trim() ? entry.reason : null;",
  ];
  const insert = dynamicInsert
    ? [
        // The column list is built at run time: there is no INSERT text to read.
        '  const sql = buildInsert(AUDIT_COLUMNS, reason);',
        '  await client.query(sql, params);',
      ]
    : [
        '  await client.query(',
        '    `INSERT INTO audit_logs',
        '       (id, tenant_id, user_id, action, table_name, record_id,',
        '        actor_id, target, payload_hash, sha256_chain, occurred_at, hmac_seal,',
        '        old_values, new_values, ip_address, user_agent' +
          (extraColumn ? `, ${extraColumn}` : '') +
          "${reason ? ', reason' : ''})",
        "     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::json,$15,$16${reason ? ',$17' : ''})`,",
        '    params,',
        '  );',
      ];
  return [...decoy, ...head, ...insert, '}', ''].join('\n');
}

/** The twelve-column table eleven suites declared (c2c-section-save's, before the fix). */
const TWELVE_BODY = `
      id text PRIMARY KEY, tenant_id integer, user_id integer, action text,
      table_name text, record_id text, actor_id text, target text,
      target_type text, target_id text, reason text, payload_hash text,
      ana_action_id text, sha256_chain text,
      occurred_at timestamptz DEFAULT now(), hmac_seal text
    );`;

/** The shared harness DDL as it is now: every writer column, plus other readers'. */
const FULL_BODY = `
  id           TEXT PRIMARY KEY,
  tenant_id    INTEGER,
  user_id      INTEGER,
  action       TEXT,
  table_name   TEXT,
  record_id    TEXT,
  actor_id     INTEGER,
  target       TEXT,
  payload_hash TEXT,
  sha256_chain TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  hmac_seal    TEXT,
  old_values   JSON,
  new_values   JSON,
  ip_address   TEXT,
  user_agent   TEXT,
  -- Production has it (migrations/20260527_mutation_primitives.sql, on the
  -- deploy set): the stated reason the inspector's ledger shows.
  reason       TEXT,
  -- The governed-action ledger's columns (recordGovernedAction,
  -- server/routes/c2c/actions.ts), so a signed act can be exercised here too.
  target_type   TEXT,
  target_id     TEXT,
  ana_action_id TEXT
);`;

/** A test file that provisions a table inside pg.exec, as the real suites do. */
function suiteFile(ddl, { name = 'section-save' } = {}) {
  return `import { PGlite } from '@electric-sql/pglite';
import { beforeAll, it, expect } from 'vitest';

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(\`
    -- The ${name} suite reaches the chained audit write, so the harness
    -- provisions the table rather than stubbing the writer out.
    ${ddl}
  \`);
});

it('${name} commits the mutation and its audit row together', async () => {
  expect(pg).toBeDefined();
});
`;
}

/** A harness module exporting the table as a constant, as pglite-harness.ts does. */
function harnessFile(ddl, docComment) {
  return `/**
 * ${docComment}
 */
export const AUDIT_LOGS_PGLITE_DDL = \`
${ddl}
\`;
`;
}

// ── Fixture tree and gate runner ──────────────────────────────────────────────

function resetTree(writer = writerSource()) {
  fs.rmSync(tree, { recursive: true, force: true });
  fs.mkdirSync(tree, { recursive: true });
  put('server/services/auditService.ts', writer);
}

function put(rel, content) {
  const full = path.join(tree, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

/** The 1-based line on which `needle` starts in `content` (the gate's file:line). */
function lineOf(content, needle, from = 0) {
  const at = content.indexOf(needle, from);
  if (at < 0) throw new Error(`selftest bug: ${JSON.stringify(needle)} not in fixture`);
  return content.slice(0, at).split('\n').length;
}

let gateRuns = 0;
function runGate() {
  const src = fs.readFileSync(GATE, 'utf8');
  const patched = src.replace(/const ROOT = [^;]+;/, `const ROOT = ${JSON.stringify(tree)};`);
  if (patched === src) {
    throw new Error(`cannot point ${GATE} at the fixture tree: it has no "const ROOT = …;" to patch`);
  }
  // Outside the fixture tree, so the gate never scans its own copy.
  const gatePath = path.join(tmp, `gate-${gateRuns++}.mjs`);
  fs.writeFileSync(gatePath, patched);
  try {
    const out = execFileSync(process.execPath, [gatePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

// nosemgrep: detect-non-literal-regexp -- a self-test: n is a number the test passes
const found = (n) => new RegExp(`fixtures found\\s*:\\s*${n}\\n`);
// nosemgrep: detect-non-literal-regexp -- a self-test: n is a number the test passes
const writes = (n) => new RegExp(`columns the writer writes\\s*:\\s*${n}\\n`);
const OK_LINE = "every audit_logs fixture accepts the writer's full column list";

// ── Cases ─────────────────────────────────────────────────────────────────────

const cases = [
  {
    name: 'FAILS on the eleven suites\' fixture: twelve writer columns, no old_values/new_values/ip_address/user_agent',
    setup() {
      const file = suiteFile(`${ddlHeader()}${TWELVE_BODY}`);
      put('tests/schema-contract/c2c-section-save.contract.test.ts', file);
      const line = lineOf(file, ddlHeader());
      return {
        expectExit: 1,
        expectIn: [
          '1 fixture(s) the audit writer cannot write into',
          `tests/schema-contract/c2c-section-save.contract.test.ts:${line}\n`,
          // Exactly these four: a gate that read the earlier, narrower INSERT
          // in the writer file would report nothing missing here.
          'missing: old_values, new_values, ip_address, user_agent\n',
          'ROLLS THE MUTATION BACK',
        ],
        expectRe: [writes(17), found(1)],
      };
    },
  },
  {
    name: 'FAILS on the harness constant that declared only what the chain + seal verifiers READ',
    setup() {
      const ddl = `${ddlHeader({ ifNotExists: true })}
  tenant_id    INTEGER,
  action       TEXT,
  actor_id     INTEGER,
  target       TEXT,
  payload_hash TEXT,
  sha256_chain TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  hmac_seal    TEXT
);`;
      const file = harnessFile(
        ddl,
        'audit_logs DDL: minimal, just the columns the chain + seal verifiers READ.',
      );
      put('server/db/pglite-harness.ts', file);
      return {
        expectExit: 1,
        expectIn: [
          `server/db/pglite-harness.ts:${lineOf(file, ddlHeader({ ifNotExists: true }))}\n`,
          'missing: id, user_id, table_name, record_id, old_values, new_values, ip_address, user_agent, reason\n',
        ],
        expectRe: [found(1)],
      };
    },
  },
  {
    name: 'FAILS on a fixture missing only the conditional `reason` column (0f317d69)',
    setup() {
      const body = FULL_BODY.replace(/\n {2}-- Production has it[\s\S]*?reason {7}TEXT,/, '');
      if (body.includes('reason')) throw new Error('selftest bug: reason still declared');
      const file = suiteFile(`${ddlHeader()}${body}`, { name: 'esignature-audit-atomicity' });
      put('server/routes/__tests__/esignature-audit-atomicity.contract.test.ts', file);
      return {
        expectExit: 1,
        expectIn: [
          `server/routes/__tests__/esignature-audit-atomicity.contract.test.ts:${lineOf(file, ddlHeader())}\n`,
          'missing: reason\n',
        ],
        expectRe: [writes(17)],
      };
    },
  },
  {
    name: 'FAILS on a column that is present only as a SQL comment',
    setup() {
      const body = FULL_BODY.replace(
        '  old_values   JSON,',
        '  -- old_values   JSON,   (dropped: the verifier never reads it)',
      );
      const file = suiteFile(`${ddlHeader()}${body}`, { name: 'qms-vault-audit' });
      put('server/services/ana/__tests__/qms-vault-audit-atomicity.contract.test.ts', file);
      return {
        expectExit: 1,
        expectIn: [
          `server/services/ana/__tests__/qms-vault-audit-atomicity.contract.test.ts:${lineOf(file, ddlHeader())}\n`,
          'missing: old_values\n',
        ],
      };
    },
  },
  {
    // The omission annotated in the DDL itself, as the harness constant's doc
    // comment did. The commas sit inside parentheses, so only a gate that
    // tracks depth keeps them from starting new "columns" named new_values
    // and ip_address.
    name: 'FAILS when the omitted columns are listed "(a, b, …)" in a block comment inside the table',
    setup() {
      const body = TWELVE_BODY.replace(
        'hmac_seal text\n',
        'hmac_seal text\n      /* Not provisioned (old_values, new_values, ip_address, user_agent):\n         the chain and seal verifiers never read them. */\n',
      );
      if (body === TWELVE_BODY) throw new Error('selftest bug: block comment not inserted');
      const file = suiteFile(`${ddlHeader()}${body}`, { name: 'document-lifecycle' });
      put('tests/schema-contract/document-lifecycle.contract.test.ts', file);
      return {
        expectExit: 1,
        expectIn: [
          `tests/schema-contract/document-lifecycle.contract.test.ts:${lineOf(file, ddlHeader())}\n`,
          'missing: old_values, new_values, ip_address, user_agent\n',
        ],
      };
    },
  },
  {
    name: 'FAILS when the writer gains a column the fixtures lack (read from the writer, not restated)',
    writer: writerSource({ extraColumn: 'session_id' }),
    setup() {
      const file = harnessFile(`${ddlHeader({ ifNotExists: true })}${FULL_BODY}`, 'audit_logs DDL.');
      put('server/db/pglite-harness.ts', file);
      return {
        expectExit: 1,
        expectIn: [`server/db/pglite-harness.ts:${lineOf(file, ddlHeader({ ifNotExists: true }))}\n`, 'missing: session_id\n'],
        expectRe: [writes(18), found(1)],
      };
    },
  },
  {
    name: 'FAILS in every scan root and extension, naming only the bad table when a file holds two',
    setup() {
      const good = `${ddlHeader()}${FULL_BODY}`;
      const bad = `${ddlHeader()}${TWELVE_BODY}`;
      // tests/: a good table first, a bad one lower in the same file.
      const journey = `${suiteFile(good, { name: 'ind-authoring' })}\n${suiteFile(bad, { name: 'ind-amendment' })
        .split('\n')
        .filter((l) => !l.startsWith('import ') && !l.startsWith('let pg'))
        .join('\n')}`;
      put('tests/golden-journeys/ind-authoring.journey.test.ts', journey);
      const goodLine = lineOf(journey, ddlHeader());
      const badLine = lineOf(journey, ddlHeader(), journey.indexOf(ddlHeader()) + 1);
      // client/: lower-case keywords, .tsx.
      const lowerHeader = ddlHeader({ ifNotExists: true, lower: true });
      const panel = suiteFile(`${lowerHeader}${TWELVE_BODY}`, { name: 'audit-panel' });
      put('client/src/components/__tests__/AuditPanel.test.tsx', panel);
      // scripts/: .mjs.
      const seed = `export const DDL = \`\n${bad}\n\`;\n`;
      put('scripts/db/seed-audit-fixture.mjs', seed);
      // server/: a clean harness, which must not be named.
      put('server/db/audit-harness.ts', harnessFile(`${ddlHeader({ ifNotExists: true })}${FULL_BODY}`, 'x'));
      return {
        expectExit: 1,
        expectIn: [
          '3 fixture(s) the audit writer cannot write into',
          `tests/golden-journeys/ind-authoring.journey.test.ts:${badLine}\n`,
          `client/src/components/__tests__/AuditPanel.test.tsx:${lineOf(panel, lowerHeader)}\n`,
          `scripts/db/seed-audit-fixture.mjs:${lineOf(seed, ddlHeader())}\n`,
        ],
        expectNotIn: [`ind-authoring.journey.test.ts:${goodLine}\n`, 'server/db/audit-harness.ts'],
        expectRe: [found(5)],
      };
    },
  },
  {
    name: 'FAILS closed when writeChainedAuditRow is not in the writer file (renamed)',
    writer: writerSource({ name: 'writeAuditRow' }),
    setup() {
      put('server/db/pglite-harness.ts', harnessFile(`${ddlHeader({ ifNotExists: true })}${FULL_BODY}`, 'x'));
      return { expectExit: 1, expectIn: ['writeChainedAuditRow not found'], expectNotIn: [OK_LINE] };
    },
  },
  {
    // Proves only the EARLIER direction: the decoy INSERT above the writer is
    // not read. A later literal INSERT would be (see "Known false negatives").
    name: 'FAILS closed when the writer\'s INSERT cannot be read, not falling back to the EARLIER INSERT in the file',
    writer: writerSource({ dynamicInsert: true }),
    setup() {
      put('server/db/pglite-harness.ts', harnessFile(`${ddlHeader({ ifNotExists: true })}${FULL_BODY}`, 'x'));
      return {
        expectExit: 1,
        expectIn: ['could not read the INSERT column list from writeChainedAuditRow'],
        expectNotIn: [OK_LINE],
      };
    },
  },
  {
    name: 'FAILS against the REAL writer (server/services/auditService.ts) on the twelve-column fixture',
    // Read when the case runs, inside the try that removes the temp dir.
    get writer() {
      return fs.readFileSync(path.join(repoRoot, 'server', 'services', 'auditService.ts'), 'utf8');
    },
    setup() {
      const file = suiteFile(`${ddlHeader()}${TWELVE_BODY}`);
      put('tests/schema-contract/c2c-section-save.contract.test.ts', file);
      return {
        expectExit: 1,
        expectIn: [`tests/schema-contract/c2c-section-save.contract.test.ts:${lineOf(file, ddlHeader())}\n`],
        // The real writer's conditional column must be read as `reason`, not
        // as the template expression it is written as.
        expectNotIn: ['${', 'reason ?'],
        // Each on the missing: line, in whatever order the real INSERT lists
        // them: reordering that INSERT does not make the gate wrong.
        expectRe: ['old_values', 'new_values', 'ip_address', 'user_agent'].map(
          // nosemgrep: detect-non-literal-regexp -- a self-test: c is one of four literal column names
          (c) => new RegExp(`missing: [^\\n]*\\b${c}\\b`),
        ),
      };
    },
  },
  {
    name: 'quiet: the shared harness DDL, extra columns and comments with "(a, b)" and a leading "--" before a column',
    setup() {
      put('server/db/pglite-harness.ts', harnessFile(`${ddlHeader({ ifNotExists: true })}${FULL_BODY}`, 'audit_logs DDL.'));
      return { expectExit: 0, expectIn: [OK_LINE], expectRe: [writes(17), found(1)] };
    },
  },
  {
    name: 'quiet: several columns per line, upper-case names, DEFAULT now(), CHECK lists, numeric(10, 2), table constraints',
    setup() {
      const ddl = `${ddlHeader()}
      ID text, TENANT_ID integer NOT NULL, user_id integer,
      action text CHECK (action IN ('create', 'update', 'delete')),
      table_name text, record_id text, actor_id integer, target text,
      payload_hash text, sha256_chain text, occurred_at timestamptz DEFAULT now(),
      hmac_seal text, OLD_VALUES JSON, NEW_VALUES JSON, IP_ADDRESS TEXT,
      USER_AGENT TEXT, reason text, latency_ms numeric(10, 2),
      PRIMARY KEY (id),
      UNIQUE (tenant_id, sha256_chain),
      CONSTRAINT audit_actor_ck CHECK (actor_id IS NULL OR actor_id > 0),
      FOREIGN KEY (tenant_id) REFERENCES organizations (id)
    );`;
      put('server/routes/c2c/__tests__/governed-action.pglite.integration.test.ts', suiteFile(ddl, { name: 'governed-action' }));
      return { expectExit: 0, expectIn: [OK_LINE], expectRe: [found(1)] };
    },
  },
  {
    name: 'quiet: narrow tables whose names merely contain audit_log are not audit_logs fixtures',
    setup() {
      // The real tree's own neighbours, each far narrower than the writer.
      put(
        'server/services/compute/__tests__/artifactWriteback-lineage.pglite.integration.test.ts',
        suiteFile(`${ddlHeader({ name: 'regulatory_' + TABLE })}\n      id serial PRIMARY KEY, action text\n    );`),
      );
      put(
        'server/routes/__tests__/approval-workflow.contract.test.ts',
        suiteFile(`${ddlHeader({ ifNotExists: true, name: 'document_' + TABLE })}id serial PRIMARY KEY, document_id int);`),
      );
      put(
        'server/routes/test-assembly.ts',
        `export const DDL = \`${ddlHeader({ ifNotExists: true, name: 'assembly_' + TABLE })}id serial, action text)\`;\n`,
      );
      put(
        'tests/schema-contract/column-reachability-guard.contract.test.ts',
        `const sql = \`${ddlHeader({ name: 'audit_log' })}id bigint, at timestamptz) PARTITION BY RANGE (at);\`;\n`,
      );
      put(
        'tests/schema-contract/audit-archive.contract.test.ts',
        `const sql = \`${ddlHeader({ name: TABLE + '_archive' })}id text, archived_at timestamptz);\`;\n`,
      );
      // And one real fixture, so the run is not vacuous.
      put('server/db/pglite-harness.ts', harnessFile(`${ddlHeader({ ifNotExists: true })}${FULL_BODY}`, 'x'));
      return { expectExit: 0, expectIn: [OK_LINE], expectRe: [found(1)] };
    },
  },
  {
    // Above, each neighbour is alone in its file, so the per-file pre-filter
    // drops it before the per-table pattern runs. Here they share one pg.exec
    // string with a real audit_logs, as a suite that provisions
    // document_audit_logs (approval-workflow) does the day it also reaches the
    // chained write: only the per-table pattern can tell them apart.
    name: 'quiet: narrow neighbours in the SAME file as a real audit_logs are not counted as fixtures',
    setup() {
      const ddl = [
        `${ddlHeader({ ifNotExists: true, name: 'document_' + TABLE })}id serial PRIMARY KEY, document_id int);`,
        `${ddlHeader({ name: 'regulatory_' + TABLE })}\n      id serial PRIMARY KEY, action text\n    );`,
        `${ddlHeader({ ifNotExists: true })}${FULL_BODY}`,
        `${ddlHeader({ name: TABLE + '_archive' })}id text, archived_at timestamptz);`,
        `${ddlHeader({ name: 'audit_log' })}id bigint, at timestamptz) PARTITION BY RANGE (at);`,
      ].join('\n    ');
      put('server/routes/__tests__/approval-workflow.contract.test.ts', suiteFile(ddl, { name: 'approval-workflow' }));
      return {
        expectExit: 0,
        expectIn: [OK_LINE],
        expectNotIn: ['approval-workflow.contract.test.ts:'],
        expectRe: [writes(17), found(1)],
      };
    },
  },
  {
    name: 'quiet: node_modules, dist, _legacy and production migrations are not scanned',
    setup() {
      const bad = suiteFile(`${ddlHeader()}${TWELVE_BODY}`);
      put('tests/node_modules/some-pkg/fixture.ts', bad);
      put('server/dist/harness.mjs', bad);
      put('client/_legacy/AuditPanel.test.tsx', bad);
      // Production DDL is created narrow and widened by later ALTERs; it is not
      // a fixture and lives outside the scanned roots.
      put('migrations/0000_init.sql', `${ddlHeader()}\n  id text PRIMARY KEY,\n  action text\n);\n`);
      put('server/db/pglite-harness.ts', harnessFile(`${ddlHeader({ ifNotExists: true })}${FULL_BODY}`, 'x'));
      return { expectExit: 0, expectIn: [OK_LINE], expectRe: [found(1)] };
    },
  },
];

// ── Run ───────────────────────────────────────────────────────────────────────

// Created here, after every case is built, and removed in the finally: nothing
// between creating it and the try can throw and leak it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-logs-fixture-'));
const tree = path.join(tmp, 'repo');

let failed = 0;
try {
  for (const c of cases) {
    resetTree(c.writer);
    const expect = c.setup();
    const { code, out } = runGate();
    const problems = [];
    if (code !== expect.expectExit) problems.push(`expected exit ${expect.expectExit}, got ${code}`);
    for (const s of expect.expectIn ?? []) if (!out.includes(s)) problems.push(`output lacked: ${JSON.stringify(s)}`);
    for (const s of expect.expectNotIn ?? []) if (out.includes(s)) problems.push(`output should not contain: ${JSON.stringify(s)}`);
    for (const re of expect.expectRe ?? []) if (!re.test(out)) problems.push(`output did not match: ${re}`);
    console.log(`  ${problems.length ? '✗' : '✓'} ${c.name}`);
    if (problems.length) {
      failed++;
      for (const p of problems) console.log(`      ${p}`);
      console.log(out.trimEnd().split('\n').map((l) => `      | ${l}`).join('\n'));
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) failed against ${path.relative(repoRoot, GATE) || GATE}`);
  process.exit(1);
}
console.log(`\n${TAG} ${cases.length} passed — the gate fails on what it exists to catch.`);
