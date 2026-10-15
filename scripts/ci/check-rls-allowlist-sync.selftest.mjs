#!/usr/bin/env node
/**
 * Self-test for ci:rls-allowlist-sync (scripts/ci/check-rls-allowlist-sync.mjs).
 *
 * On the real tree the gate reports "OK — 6 entries match across RLS_ALLOWLIST
 * and 4 consumers", so its failure branches never fire in normal use. A gate
 * whose failure branch has never been seen has not been tested (CLAUDE.md,
 * working agreement). This shows each one firing.
 *
 * Each case writes a fixture tree into a temp directory — the source of truth
 * (server/db/rlsAllowlist.ts) and the four hand-copied consumers the gate reads,
 * each modelled on the real file's surroundings — and runs a copy of the REAL
 * gate whose `repoRoot` is patched to that tree. Nothing else in the gate is
 * changed, so what is tested is the command CI runs. (There is a fifth copy the
 * gate does not read; see KNOWN GAPS.)
 *
 * The first failing case is the historical defect verbatim (ledger C-44): the
 * deploy-time sweep shipped a hand-authored 4-entry allowlist —
 * organizations, organization_users, stripe_events, ectd_agency_configs — that
 * dropped api_keys, billing_budgets and billing_alerts. Nothing checked it, the
 * sweep policied api_keys, and under RLS_ENFORCE=on the pre-auth
 * validateApiKey() lookup returned zero rows: every api-key login broke. The
 * gate was widened from 0021 alone to all four copies because of it, so the
 * next cases drift each of the other three copies on its own and require the
 * gate to name that file and only that file.
 *
 * The quiet cases are the near-misses a sloppy gate would flag: the decoy
 * arrays that sit next to each real allowlist (the sweep's
 * nonpublic_integer_tables, the coverage check's schema-qualified carve-out
 * and its `IN ('pg_catalog', …)` / `IN ('organization_id', …)` literals, the
 * smoke assertion's `const failures = [];` declared above its allowlist and
 * its `[TENANT_ALLOWLIST]` query parameter, the TS file's
 * `ARRAY['organization_users', ...]` doc example), a reordered and reflowed
 * set (SQL `<> ALL` / `= ANY` are order-insensitive), and a source of truth
 * that grows with every copy following it (the gate must read the TS, not a
 * hard-coded six).
 *
 * KNOWN GAPS. Each is run as a probe on every invocation and printed under
 * "known gaps", but NOT counted: asserting that a gap is present would enshrine
 * it, because fixing the gate would then turn this selftest red. A probe prints
 * CLOSED once the gate catches its shape. That is the signal to promote it to a
 * RED case. While a gap is open, the summary line's "fails on what it exists to
 * catch" covers the four copies the gate reads, not every copy in the repo.
 *
 *   1. A fifth copy the gate does not read. On 2026-10-01,
 *      scripts/db/verify-migration-set.mjs:72 declares
 *        const TENANT_ALLOWLIST = ['organizations', 'organization_users',
 *                                  'stripe_events', 'ectd_agency_configs'];
 *      That is the C-44 4-entry list, verbatim, the same list the first RED case
 *      puts in the sweep. Line 162 passes it as the exemption to that script's
 *      unpoliced-table query. That script is the migration set's documented
 *      wiring bar (scripts/db/migration-set.mjs,
 *      tests/schema-contract/tenant-isolation-sweep.contract.test.ts). It would
 *      therefore report api_keys, billing_budgets and billing_alerts as "left
 *      without tenant_isolation_policy — cross-tenant readable". That pushes
 *      people back toward policying api_keys, the pre-auth break C-44 describes.
 *      The gate's SOURCES end at deploy-smoke-assert.mjs, so the real gate prints
 *      OK. The fix belongs to the gate and must land as one change, because
 *      adding the file alone turns the gate red on the real tree: add it to
 *      SOURCES (re /TENANT_ALLOWLIST\s*=\s*\[([\s\S]*?)\]/) and correct its list
 *      to the canonical six. Then, here: add verifyMigrationSet() to
 *      consistentTree(), add a RED case that drops api_keys from that file alone,
 *      move "4 consumers" to 5, and delete the probe.
 *
 *   2. A commented-out entry still counts. The gate takes every single-quoted
 *      identifier between the array brackets, comments included. An entry
 *      commented out in place (`-- 'api_keys'` in a SQL copy, `// 'api_keys',`
 *      in the .mjs copy) is still counted, so a copy that no longer exempts the
 *      table passes. This gap is untracked: on 2026-10-01 no ledger entry, issue
 *      or doc records it. This header and the probe below are the only record.
 *      Once the gate strips comments before it reads identifiers, promote the
 *      probe to a RED case.
 *
 * Usage:
 *   node scripts/ci/check-rls-allowlist-sync.selftest.mjs
 *   SELFTEST_GATE_PATH=/tmp/mutant.mjs node scripts/ci/check-rls-allowlist-sync.selftest.mjs
 *     (run the cases against a different copy of the gate — the mutation check)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:rls-allowlist-sync:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-rls-allowlist-sync.mjs');

const ROOT_DECL = /const repoRoot = [^;]+;/;
const gateSrc = fs.readFileSync(GATE, 'utf8');
if (!ROOT_DECL.test(gateSrc)) {
  // Without this the patched copy would resolve repoRoot from its own location
  // and every case would be judging some other tree.
  console.error(`${TAG} cannot find \`const repoRoot = …;\` in ${GATE} — the selftest no longer knows how to point it at a fixture tree.`);
  process.exit(1);
}

// ── Fixture paths (the gate's own, relative to its repoRoot) ─────────────────
const TS = 'server/db/rlsAllowlist.ts';
const MIG_0021 = 'migrations/0021_enable_rls_everywhere.sql';
const SWEEP = 'db/migrations/20260801_tenant_isolation_sweep.sql';
const COVERAGE = 'scripts/db/rls-coverage-check.sql';
const SMOKE = 'scripts/db/deploy-smoke-assert.mjs';
/** Not read by the gate (KNOWN GAPS, 1). */
const VERIFY = 'scripts/db/verify-migration-set.mjs';

/** The canonical six, in the source of truth's order. */
const CANON = [
  'organization_users',
  '__drizzle_migrations',
  'stripe_events',
  'billing_budgets',
  'billing_alerts',
  'api_keys',
];

const lines = (list, indent) => list.map(t => `${indent}'${t}'`).join(',\n');

// ── Fixture builders, each modelled on the real file around the allowlist ────

function tsSource(list = CANON) {
  return `/**
 * RLS allowlist — tables that have a tenant column but that the blanket
 * ENABLE ROW LEVEL SECURITY migration must NOT enable RLS on.
 *
 * What is NOT in the allowlist (notable cases): organizations, users,
 * sharepoint_audit_log.
 */

export const RLS_ALLOWLIST: readonly string[] = [
  // Tenant-defining / middleware-dependent
${lines(list, '  ')},
] as const;

/**
 * Render the allowlist as a SQL array literal. Returns a string like
 * \`ARRAY['organization_users', ...]::text[]\`.
 *
 *   const sql = \`
 *     DECLARE allowlist text[] := \${rlsAllowlistSqlArray()};
 *   \`;
 */
export function rlsAllowlistSqlArray(): string {
  const escaped = RLS_ALLOWLIST.map(t => \`'\${t}'\`).join(', ');
  return \`ARRAY[\${escaped}]::text[]\`;
}
`;
}

function mig0021(body = `[\n${lines(CANON, '    ')}\n  ]`) {
  return `-- Allowlist (pinned from server/db/rlsAllowlist.ts; see CI gate
-- scripts/ci/check-rls-allowlist-sync.mjs which fails on drift):
--
--   organization_users      — middleware reads it before scope is set
--   api_keys                — super-admin revocation tooling

BEGIN;

DO $$
DECLARE
  rec RECORD;
  policy_name CONSTANT text := 'tenant_isolation_policy';

  allowlist CONSTANT text[] := ARRAY${body};

  applied_count INT := 0;
  skipped_allowlist INT := 0;
BEGIN
  FOR rec IN
    SELECT c.table_schema, c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name IN ('organization_id', 'org_id', 'tenant_id')
  LOOP
    IF rec.table_name = ANY (allowlist) THEN
      skipped_allowlist := skipped_allowlist + 1;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', rec.table_schema, rec.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', rec.table_schema, rec.table_name);
  END LOOP;
END $$;

COMMIT;
`;
}

function sweep(decl = `allowlist TEXT[] := ARRAY[\n${lines(CANON, '    ')}\n  ]`, use = 'allowlist') {
  return `DO $$
DECLARE
  rec RECORD;
  -- Integer-keyed tenant tables outside \`public\` that both passes treat as
  -- \`public\` ones.
  nonpublic_integer_tables TEXT[] := ARRAY[
    'lumen.council_sessions',
    'lumen.agent_executions',
    'lumen.data_verifications'
  ];
  -- Tables that carry a tenant column but must NOT be policied — the canonical
  -- RLS allowlist. This list MUST equal server/db/rlsAllowlist.ts → RLS_ALLOWLIST.
  ${decl};
BEGIN
  FOR rec IN
    SELECT DISTINCT ON (c.table_schema, c.table_name)
           c.table_schema, c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    WHERE (c.table_schema = 'public' OR c.table_schema || '.' || c.table_name = ANY (nonpublic_integer_tables))
      AND c.column_name IN ('organization_id', 'org_id', 'tenant_id')
  LOOP
    IF rec.table_name = ANY (${use}) THEN
      CONTINUE;
    END IF;
    EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I.%I', rec.table_schema, rec.table_name);
  END LOOP;
END $$;
`;
}

const CARVE_OUT = `  AND (c.table_schema || '.' || c.table_name) <> ALL (ARRAY[
    'intelligence.ana_interactions',
    'intelligence.outcome_feature_vectors',
    'precedent.quality_checkpoints'
  ])`;

function coverage(body = `[\n${lines(CANON, '    ')}\n  ]`, { carveOutFirst = false } = {}) {
  const allow = `  AND c.table_name <> ALL (ARRAY${body})`;
  return `-- Emits one row per offending table (empty result = full coverage).
SELECT c.table_schema || '.' || c.table_name || ' (' || c.column_name || ')' AS unprotected
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema
 AND t.table_name = c.table_name
 AND t.table_type = 'BASE TABLE'
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
  AND c.column_name IN ('organization_id', 'org_id', 'tenant_id')
  AND c.data_type IN ('integer', 'bigint', 'smallint')
${carveOutFirst ? `${CARVE_OUT}\n${allow}` : `${allow}\n${CARVE_OUT}`}
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = c.table_schema
      AND p.tablename = c.table_name
      AND p.policyname = 'tenant_isolation_policy'
  )
ORDER BY 1;

SELECT c.relname FROM pg_class c
WHERE NOT c.relrowsecurity
  AND c.relname <> ALL (ARRAY[]::text[])
ORDER BY 1;
`;
}

function smoke(body = `[\n${lines(CANON, '  ')},\n]`) {
  // The real file declares its failure accumulator above the allowlist; it is
  // the first `= [` in the file, so a regex not anchored on TENANT_ALLOWLIST
  // reads it (an empty list) instead of the allowlist.
  return `const client = new pg.Client({ connectionString: url });
await client.connect();

const failures = [];
const ok = (label) => console.log(\`  ✓ \${label}\`);
const fail = (label, detail) => {
  failures.push(label);
  console.error(\`  ✗ \${label}\${detail ? \` — \${detail}\` : ''}\`);
};

// Tables that carry a tenant column but are deliberately NOT policied — the
// canonical RLS allowlist (server/db/rlsAllowlist.ts → RLS_ALLOWLIST).
const TENANT_ALLOWLIST = ${body};

{
  const { rows } = await client.query(
    \`SELECT DISTINCT c.table_name
       FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name IN ('organization_id', 'org_id', 'tenant_id')
        AND c.table_name <> ALL($1::text[])
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies p
           WHERE p.schemaname = c.table_schema
             AND p.tablename = c.table_name
             AND p.policyname = 'tenant_isolation_policy'
        )
      ORDER BY 1\`,
    [TENANT_ALLOWLIST],
  );
  if (rows.length === 0) ok('every integer-tenant table carries tenant_isolation_policy');
}
`;
}

/**
 * The fifth copy, which the gate does not read (KNOWN GAPS, 1). Modelled on the
 * real file: two decoy arrays directly above a one-line allowlist, then the
 * unpoliced-table query that takes it as `$1`. Used only by the probe until the
 * gate reads this file.
 */
function verifyMigrationSet(list = CANON) {
  return `const TAG = '[db:verify-migration-set]';

/** Extensions a real cluster provides; each is optional so a lean box still runs. */
const EXTENSIONS = ['vector', 'pgcrypto', 'pg_trgm', 'uuid-ossp', 'citext'];
/** Schemas migrations expect to exist but do not themselves create. */
const SCHEMAS = ['predicate', 'precedent', 'core', 'intelligence', 'regulatory'];
/** Tables that intentionally hold no tenant-scoped rows (mirrors the sweep). */
const TENANT_ALLOWLIST = [${list.map(t => `'${t}'`).join(', ')}];

const { rows: unpoliced } = await client.query(
  \`SELECT DISTINCT c.table_name
     FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name IN ('organization_id','org_id','tenant_id')
      AND c.data_type IN ('integer','bigint','smallint')
      AND c.table_name <> ALL ($1)
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
         WHERE p.tablename = c.table_name AND p.policyname = 'tenant_isolation_policy'
      )
    ORDER BY 1\`,
  [TENANT_ALLOWLIST],
);
`;
}

/** The C-44 list, verbatim (ledger C-44; the real verify-migration-set.mjs:72 on 2026-10-01). */
const C44_LIST = ['organizations', 'organization_users', 'stripe_events', 'ectd_agency_configs'];

/** The four copies and the source of truth, all in agreement. */
function consistentTree() {
  return {
    [TS]: tsSource(),
    [MIG_0021]: mig0021(),
    [SWEEP]: sweep(),
    [COVERAGE]: coverage(),
    [SMOKE]: smoke(),
  };
}

// ── Runner ───────────────────────────────────────────────────────────────────

/** Write `overrides` over the consistent tree (null deletes a file) and run a patched gate. */
function runGate(overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rls-allowlist-sync-selftest-'));
  try {
    const files = { ...consistentTree(), ...overrides };
    for (const [rel, content] of Object.entries(files)) {
      if (content === null) continue;
      const full = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    const gatePath = path.join(tmp, 'gate.mjs');
    fs.writeFileSync(gatePath, gateSrc.replace(ROOT_DECL, `const repoRoot = ${JSON.stringify(tmp)};`));
    try {
      return { code: 0, out: execFileSync(process.execPath, [gatePath], { encoding: 'utf8', stdio: 'pipe' }) };
    } catch (err) {
      return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const without = (t) => CANON.filter(x => x !== t);
const drift = (rel) => `DRIFT — ${rel}`;
const ALL_CONSUMERS = [MIG_0021, SWEEP, COVERAGE, SMOKE];
const othersThan = (rel) => ALL_CONSUMERS.filter(r => r !== rel).map(drift);

const cases = [
  // ── RED: the shapes the gate exists to catch ──────────────────────────────
  {
    name: 'FAILS on the C-44 defect verbatim — the sweep\'s hand-written 4-entry allowlist',
    files: {
      [SWEEP]: sweep(`allowlist TEXT[] := ARRAY[\n${lines(C44_LIST, '    ')}\n  ]`),
    },
    expectExit: 1,
    mustSay: [
      drift(SWEEP),
      'missing (in RLS_ALLOWLIST, not here): __drizzle_migrations, billing_budgets, billing_alerts, api_keys',
      'extra   (here, not in RLS_ALLOWLIST): organizations, ectd_agency_configs',
      'ledger C-44',
    ],
    mustNotSay: othersThan(SWEEP),
  },
  {
    name: 'FAILS when 0021 alone drops api_keys — the install-time sweep would policy the pre-auth table',
    files: { [MIG_0021]: mig0021(`[\n${lines(without('api_keys'), '    ')}\n  ]`) },
    expectExit: 1,
    mustSay: [drift(MIG_0021), 'missing (in RLS_ALLOWLIST, not here): api_keys'],
    mustNotSay: othersThan(MIG_0021),
  },
  {
    name: 'FAILS when rls-coverage-check.sql alone drops api_keys — the CI gate would demand its policy',
    files: { [COVERAGE]: coverage(`[\n${lines(without('api_keys'), '    ')}\n  ]`) },
    expectExit: 1,
    mustSay: [drift(COVERAGE), 'missing (in RLS_ALLOWLIST, not here): api_keys'],
    mustNotSay: othersThan(COVERAGE),
  },
  {
    name: 'FAILS when deploy-smoke-assert.mjs alone drops api_keys — the smoke assertion would demand its policy',
    files: { [SMOKE]: smoke(`[\n${lines(without('api_keys'), '  ')},\n]`) },
    expectExit: 1,
    mustSay: [drift(SMOKE), 'missing (in RLS_ALLOWLIST, not here): api_keys'],
    mustNotSay: othersThan(SMOKE),
  },
  {
    name: 'FAILS when the coverage check exempts a table the source of truth does not (sharepoint_audit_log)',
    files: { [COVERAGE]: coverage(`[\n${lines([...CANON, 'sharepoint_audit_log'], '    ')}\n  ]`) },
    expectExit: 1,
    mustSay: [drift(COVERAGE), 'extra   (here, not in RLS_ALLOWLIST): sharepoint_audit_log'],
    mustNotSay: ['missing (in RLS_ALLOWLIST', ...othersThan(COVERAGE)],
  },
  {
    name: 'FAILS on a one-character typo in a copy (api_key) — both directions reported',
    files: {
      [MIG_0021]: mig0021(`[\n${lines([...without('api_keys'), 'api_key'], '    ')}\n  ]`),
    },
    expectExit: 1,
    mustSay: [
      drift(MIG_0021),
      'missing (in RLS_ALLOWLIST, not here): api_keys',
      'extra   (here, not in RLS_ALLOWLIST): api_key',
    ],
  },
  {
    name: 'FAILS when RLS_ALLOWLIST gains an entry no copy follows — all four named',
    files: { [TS]: tsSource([...CANON, 'webhook_deliveries']) },
    expectExit: 1,
    mustSay: [...ALL_CONSUMERS.map(drift), 'missing (in RLS_ALLOWLIST, not here): webhook_deliveries'],
  },
  {
    name: 'FAILS when a copy is emptied — every exemption missing, not a pass',
    files: { [SMOKE]: smoke('[]') },
    expectExit: 1,
    mustSay: [drift(SMOKE), `missing (in RLS_ALLOWLIST, not here): ${CANON.join(', ')}`],
  },
  {
    name: 'FAILS closed when the sweep\'s allowlist is renamed out from under the gate',
    files: {
      [SWEEP]: sweep(`exempt_tables TEXT[] := ARRAY[\n${lines(CANON, '    ')}\n  ]`, 'exempt_tables'),
    },
    expectExit: 1,
    mustSay: [`could not locate allowlist TEXT[] := ARRAY[...] in ${SWEEP}`],
    mustNotSay: ['OK —'],
  },
  {
    name: 'FAILS closed when RLS_ALLOWLIST loses its `as const` terminator',
    files: { [TS]: tsSource().replace('] as const;', '];') },
    expectExit: 1,
    mustSay: [`could not locate RLS_ALLOWLIST in ${TS}`],
    mustNotSay: ['OK —'],
  },
  {
    name: 'FAILS closed when a consumer file is gone',
    files: { [SMOKE]: null },
    expectExit: 1,
    mustSay: [`missing ${SMOKE}`],
    mustNotSay: ['OK —'],
  },

  // ── QUIET: the near-misses a sloppy gate would flag ───────────────────────
  {
    name: 'quiet — four copies in agreement, each beside its real decoy arrays',
    files: {},
    expectExit: 0,
    mustSay: ['OK — 6 entries match across RLS_ALLOWLIST and 4 consumers'],
    mustNotSay: ['DRIFT'],
  },
  {
    name: 'quiet — same six, reordered and reflowed; the coverage carve-out moved first',
    files: {
      [TS]: tsSource([...CANON].reverse()),
      [MIG_0021]: mig0021(`['api_keys', 'billing_alerts', 'billing_budgets', 'stripe_events', '__drizzle_migrations', 'organization_users']`),
      [SWEEP]: sweep(`allowlist CONSTANT text[] := ARRAY['stripe_events','api_keys','organization_users',
    '__drizzle_migrations','billing_alerts','billing_budgets']::text[]`),
      [COVERAGE]: coverage(`[\n${lines([...CANON].sort(), '    ')}\n  ]`, { carveOutFirst: true }),
      [SMOKE]: smoke(`['billing_budgets', 'api_keys', 'stripe_events', 'organization_users', 'billing_alerts', '__drizzle_migrations']`),
    },
    expectExit: 0,
    mustSay: ['OK — 6 entries match across RLS_ALLOWLIST and 4 consumers'],
    mustNotSay: ['DRIFT'],
  },
  {
    name: 'quiet — RLS_ALLOWLIST grows to seven and every copy follows it',
    files: (() => {
      const seven = [...CANON, 'webhook_deliveries'];
      return {
        [TS]: tsSource(seven),
        [MIG_0021]: mig0021(`[\n${lines(seven, '    ')}\n  ]`),
        [SWEEP]: sweep(`allowlist TEXT[] := ARRAY[\n${lines(seven, '    ')}\n  ]`),
        [COVERAGE]: coverage(`[\n${lines(seven, '    ')}\n  ]`),
        [SMOKE]: smoke(`[\n${lines(seven, '  ')},\n]`),
      };
    })(),
    expectExit: 0,
    mustSay: ['OK — 7 entries match across RLS_ALLOWLIST and 4 consumers'],
    mustNotSay: ['DRIFT'],
  },
];

if (process.env.SELFTEST_GATE_PATH) console.log(`${TAG} testing ${GATE} (SELFTEST_GATE_PATH)`);

let failed = 0;
for (const c of cases) {
  const { code, out } = runGate(c.files);
  const missing = (c.mustSay ?? []).filter(s => !out.includes(s));
  const forbidden = (c.mustNotSay ?? []).filter(s => out.includes(s));
  const ok = code === c.expectExit && missing.length === 0 && forbidden.length === 0;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name}`);
  if (!ok) {
    failed++;
    if (code !== c.expectExit) console.log(`      expected exit ${c.expectExit}, got ${code}`);
    for (const s of missing) console.log(`      output lacked: ${JSON.stringify(s)}`);
    for (const s of forbidden) console.log(`      output should not contain: ${JSON.stringify(s)}`);
    console.log(out.trimEnd().split('\n').map(l => `      | ${l}`).join('\n'));
  }
}

// ── KNOWN GAPS: run and reported, never counted (header, KNOWN GAPS) ─────────
// `caught` is what the gate prints once the gap is closed. A probe never sets
// the exit code. Asserting that the gate misses these shapes would make fixing
// the gate turn this selftest red.
const knownGaps = [
  {
    name: `the gate does not read ${VERIFY}, a fifth copy holding the C-44 list`,
    note: `the real ${VERIFY}:72 holds exactly this list (checked 2026-10-01)`,
    files: { [VERIFY]: verifyMigrationSet(C44_LIST) },
    caught: [
      drift(VERIFY),
      'missing (in RLS_ALLOWLIST, not here): __drizzle_migrations, billing_budgets, billing_alerts, api_keys',
    ],
  },
  {
    name: `an entry commented out in place still counts (\`-- 'api_keys'\` in ${COVERAGE})`,
    note: 'untracked; the selftest header is the only record',
    files: { [COVERAGE]: coverage(`[\n${lines(without('api_keys'), '    ')}\n    -- 'api_keys'\n  ]`) },
    caught: [drift(COVERAGE), 'missing (in RLS_ALLOWLIST, not here): api_keys'],
  },
];

console.log('\n  known gaps (run and reported, not counted; see the header):');
let open = 0;
for (const g of knownGaps) {
  const { code, out } = runGate(g.files);
  if (code !== 0 && g.caught.every(s => out.includes(s))) {
    console.log(`  ✓ CLOSED ${g.name}: the gate now fails it. Promote this probe to a RED case.`);
  } else if (code === 0 && out.includes('OK —')) {
    open++;
    console.log(`  ! OPEN   ${g.name}: the gate exits 0 on it.`);
    console.log(`           ${g.note}`);
  } else {
    console.log(`  ? UNCLEAR ${g.name}: exit ${code}, neither OK nor the expected drift report.`);
    console.log(out.trimEnd().split('\n').map(l => `      | ${l}`).join('\n'));
  }
}

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold.`);
  process.exit(1);
}
if (open) console.log(`\n${TAG} ${open} known gap(s) open: the claim below covers the four copies the gate reads.`);
console.log(`${open ? '' : '\n'}${TAG} ${cases.length} passed — the gate fails on what it exists to catch.`);
