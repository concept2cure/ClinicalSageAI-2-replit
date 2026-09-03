#!/usr/bin/env node
/**
 * How much of a tenant survives a tenant purge.
 *
 * ── The question this answers ────────────────────────────────────────────────
 * server/services/tenant/tenant-offboarding.ts purges a tenant by running
 * `DELETE FROM <table> WHERE organization_id = $1` over PURGE_CHILD_TABLES, and
 * then UPDATEs the organizations row to status='purged' rather than deleting it
 * (deliberately — the deletion has to stay auditable). Nothing cascades from
 * organizations as a result.
 *
 * That list names 8 tables. Against a provisioned schema, 666 tables carry an
 * organization_id column. Following every ON DELETE CASCADE out of those 8
 * reaches 74. So 615 org-keyed tables still hold the tenant's rows after a
 * purge — and only 19 of those match the audit/billing/ledger pattern the
 * implementation deliberately retains.
 *
 * The rest is customer content: adverse_events, agency_correspondence,
 * ai_threads, adaptive_trial_plans, and hundreds more.
 *
 * ── What this script is, and is not ──────────────────────────────────────────
 * It is NOT a second purge implementation, and it does not edit the list. The
 * offboarding service is owned elsewhere and actively being built; duplicating
 * its design would be worse than useless. This measures the gap so the number
 * is checkable instead of adjectival, and RATCHETS it: the residue may shrink
 * but never grow. That last property is the point — the gap reached 615 because
 * new org-keyed tables were added for years with nothing watching whether the
 * purge could reach them.
 *
 * Run against a provisioned database (the blank-db-provisioning CI job).
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const repoRoot = process.cwd();
const OFFBOARDING = path.join(repoRoot, 'server', 'services', 'tenant', 'tenant-offboarding.ts');
const baselinePath = path.join(repoRoot, 'docs', 'reports', 'purge-coverage-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');

/**
 * Read PURGE_CHILD_TABLES out of the service rather than restating it.
 * A copy here would be a second source of truth that silently disagrees the
 * first time someone extends the real one — the exact failure mode this
 * codebase keeps producing.
 */
function purgeChildTables() {
  if (!fs.existsSync(OFFBOARDING)) {
    console.error(`❌ purge-coverage: ${path.relative(repoRoot, OFFBOARDING)} not found.`);
    process.exit(1);
  }
  const src = fs.readFileSync(OFFBOARDING, 'utf8');
  const m = src.match(/PURGE_CHILD_TABLES[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  if (!m) {
    console.error('❌ purge-coverage: could not parse PURGE_CHILD_TABLES from the service.');
    console.error('   Refusing to report success for a list that was never read.');
    process.exit(1);
  }
  const tables = [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
  if (tables.length === 0) {
    console.error('❌ purge-coverage: PURGE_CHILD_TABLES parsed to zero entries — broken scan.');
    process.exit(1);
  }
  return tables;
}

const RESIDUE_SQL = `
WITH RECURSIVE seed(t) AS (
  SELECT unnest($1::text[])::text COLLATE "C"
),
casc(t) AS (
  SELECT t FROM seed
  UNION
  SELECT (ch.relname)::text COLLATE "C"
    FROM casc
    JOIN pg_class p ON (p.relname)::text COLLATE "C" = casc.t
                   AND p.relnamespace = 'public'::regnamespace
    JOIN pg_constraint con ON con.confrelid = p.oid AND con.contype = 'f'
                          AND con.confdeltype = 'c'
    JOIN pg_class ch ON ch.oid = con.conrelid
                    AND ch.relnamespace = 'public'::regnamespace
),
orgkeyed AS (
  SELECT (t.table_name)::text COLLATE "C" AS t
    FROM information_schema.tables t
   WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
     AND EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = 'public' AND c.table_name = t.table_name
                    AND c.column_name = 'organization_id')
)
SELECT o.t FROM orgkeyed o WHERE o.t NOT IN (SELECT t FROM casc) ORDER BY 1
`;

const url = process.env.DATABASE_URL;
if (!url || url.includes('placeholder')) {
  console.error('❌ purge-coverage: DATABASE_URL is unset or a placeholder.');
  console.error('   This check measures a LIVE schema; refusing to pass without one.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
} catch (err) {
  // A connection failure must read as one. Left unhandled this exits non-zero
  // with a pg-protocol stack trace, which is technically fail-closed and
  // practically unreadable — and an unreadable guard is one people learn to
  // scroll past.
  console.error(`❌ purge-coverage: cannot connect to DATABASE_URL — ${err?.message ?? err}`);
  process.exit(1);
}
try {
  // Same fail-closed posture as ci:tables-live-schema: on an unprovisioned
  // database every table looks absent, so the result would measure the fixture.
  const { rows: base } = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN
        ('organizations','users','projects','documents')`,
  );
  if (base[0].n < 4) {
    console.error('❌ purge-coverage: this database is not provisioned — refusing to check against it.');
    process.exit(1);
  }

  const tables = purgeChildTables();
  const { rows } = await client.query(RESIDUE_SQL, [tables]);
  const residue = rows.map((r) => r.t);

  if (writeBaseline) {
    /* A table that DISAPPEARED from the residue is not automatically a gain.
       It is a gain only when the purge can now reach it; when it is simply
       absent from THIS database it was never measured, and dropping it from the
       baseline silently lowers the ratchet for every other environment.
       That is not hypothetical: a baseline written from a developer database
       missing eleven org-keyed tables took the count from 613 to 600, of which
       only two were earned — and the blank-database CI job, whose schema does
       have those tables, would then have reported eleven NEW unreachable tables
       and failed the release gate.

       So: anything the previous baseline listed that this database cannot see
       is CARRIED FORWARD, and said out loud. */
    const previous = fs.existsSync(baselinePath)
      ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
      : { tables: [] };
    const previousTables = Array.isArray(previous.tables) ? previous.tables : [];
    const nowInResidue = new Set(residue);
    const dropped = previousTables.filter((t) => !nowInResidue.has(t));

    let carried = [];
    if (dropped.length > 0) {
      const { rows: present } = await client.query(
        `SELECT table_name AS t FROM information_schema.tables
          WHERE table_schema='public' AND table_name = ANY($1::text[])`,
        [dropped],
      );
      const visible = new Set(present.map((r) => r.t));
      carried = dropped.filter((t) => !visible.has(t)).sort();
    }

    const finalTables = [...residue, ...carried].sort();
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(
      baselinePath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          purgeChildTables: tables,
          count: finalTables.length,
          tables: finalTables,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    console.log(`✅ wrote baseline: ${path.relative(repoRoot, baselinePath)} (${finalTables.length} tables)`);
    const earned = dropped.filter((t) => !carried.includes(t));
    if (earned.length > 0) {
      console.log(`   ${earned.length} table(s) genuinely covered and removed from the baseline:`);
      for (const t of earned.sort()) console.log(`     ${t}`);
    }
    if (carried.length > 0) {
      console.log(
        `   ${carried.length} table(s) are ABSENT from this database and were KEPT in the baseline —`,
      );
      console.log('   a table this database cannot see was not covered, it was not measured:');
      for (const t of carried) console.log(`     ${t}`);
    }
    process.exit(0);
  }

  const baseline = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : { tables: [] };
  const known = new Set(baseline.tables ?? []);
  const added = residue.filter((t) => !known.has(t));
  const removed = [...known].filter((t) => !residue.includes(t));

  if (added.length > 0) {
    console.error('❌ purge-coverage: NEW org-keyed table(s) a tenant purge cannot reach:');
    for (const t of added) console.error(`  - ${t}`);
    console.error(
      '\nEither add it to PURGE_CHILD_TABLES (FK-safe order) or give it an ON DELETE',
    );
    console.error('CASCADE path from a table already there. A tenant that asks to be erased');
    console.error('must not keep rows in a table nobody remembered to list.');
    process.exit(1);
  }

  console.log(
    `✅ purge-coverage: ${residue.length} org-keyed tables outside the purge reach ` +
      `(baseline ${known.size}, new 0${removed.length ? `, ${removed.length} now covered` : ''}).`,
  );
  if (removed.length > 0) {
    console.log('   Newly covered — re-run with --write-baseline to lock the gain in:');
    for (const t of removed) console.log(`     ${t}`);
  }
} finally {
  await client.end();
}
