#!/usr/bin/env node
/**
 * Fresh-install gap analysis.
 *
 * Compares the set of tables that server code actually queries against the set of
 * tables that exist after running the repo's own documented from-scratch installer
 * (scripts/db/install-fresh.mjs) on an empty Postgres.
 *
 * Any table in "queried but absent" is a feature that 500s or silently no-ops on a
 * brand-new production deployment.
 *
 * Requires DATABASE_URL pointing at the freshly installed DB.
 * Usage: DATABASE_URL=... node docs/audit-2026-07/evidence/fresh-install-gap.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'docs/audit-2026-07/evidence')
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'tmp', 'logs'])

function* walk(dir) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) { if (!SKIP.has(e.name)) yield* walk(full) }
    else yield full
  }
}

const isTest = (p) => /\.(test|spec)\.[jt]sx?$/.test(p) || /__tests__/.test(p)
const rel = (p) => path.relative(ROOT, p)

// Only look INSIDE string literals that are actually SQL. Scanning raw source
// matches English prose in comments ("derived from the registry") and ES imports
// ("from 'express'"), which produces garbage. Two stages:
//   1. extract string literals that contain a SQL verb
//   2. pull FROM/JOIN/INTO/UPDATE targets from within those literals only
const SQL_LITERAL = /`([^`]{12,4000})`|'([^'\n]{12,2000})'|"([^"\n]{12,2000})"/g
const LOOKS_LIKE_SQL = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i
// Capture the FULL qualified reference so `innovation.foo` is not mistaken for a
// public table called `innovation`. Group 1 = optional schema, group 2 = table.
const SQL_REF = /\b(?:FROM|JOIN|INSERT\s+INTO|INTO|UPDATE)\s+(?:ONLY\s+)?"?([a-z_][a-z0-9_]*)"?\s*(?:\.\s*"?([a-z_][a-z0-9_]*)"?)?/gi

// Non-table identifiers that legitimately follow FROM/JOIN inside real SQL.
const NOT_TABLES = new Set([
  'select', 'lateral', 'unnest', 'generate_series', 'jsonb_array_elements', 'json_array_elements',
  'jsonb_array_elements_text', 'jsonb_to_recordset', 'json_to_recordset', 'values', 'dual', 'only',
  'set', 'where', 'information_schema', 'current_setting', 'string_to_array', 'regexp_split_to_table',
  'jsonb_each', 'json_each', 'jsonb_object_keys', 'row', 'rows', 'table', 'temp',
])
const isPgInternal = (t) => t.startsWith('pg_') || t.startsWith('information_schema')

/** Strip // line comments and block comments so prose never reaches the matcher. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
}

const refs = new Map() // table -> Set(file:line)

for (const f of walk(path.join(ROOT, 'server'))) {
  if (!/\.(ts|js|mjs)$/.test(f)) continue
  const r = rel(f)
  if (isTest(r)) continue
  const raw = fs.readFileSync(f, 'utf8')
  const src = stripComments(raw)

  let lit
  SQL_LITERAL.lastIndex = 0
  while ((lit = SQL_LITERAL.exec(src)) !== null) {
    const body = lit[1] || lit[2] || lit[3] || ''
    if (!LOOKS_LIKE_SQL.test(body)) continue
    const line = src.slice(0, lit.index).split('\n').length
    let m
    SQL_REF.lastIndex = 0
    while ((m = SQL_REF.exec(body)) !== null) {
      const schema = m[2] ? m[1].toLowerCase() : 'public'
      const t = (m[2] || m[1]).toLowerCase()
      if (NOT_TABLES.has(t) || isPgInternal(t) || isPgInternal(schema)) continue
      if (NOT_TABLES.has(schema)) continue
      const key = `${schema}.${t}`
      if (!refs.has(key)) refs.set(key, new Set())
      refs.get(key).add(`${r}:${line}`)
    }
  }
}

const { Client } = pg
const client = new Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const res = await client.query(
  `select table_schema, table_name from information_schema.tables
   where table_schema not in ('pg_catalog','information_schema')`
)
const present = new Set(res.rows.map((r) => `${r.table_schema.toLowerCase()}.${r.table_name.toLowerCase()}`))
const schemasRes = await client.query(
  `select nspname from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema'`
)
const schemasPresent = new Set(schemasRes.rows.map((r) => r.nspname.toLowerCase()))

const rlsRes = await client.query(
  `select c.relname, c.relrowsecurity,
          (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r'`
)
await client.end()

const missing = []
const missingSchemas = new Map()
for (const [qualified, sites] of refs) {
  if (present.has(qualified)) continue
  const [schema, table] = qualified.split('.')
  if (!schemasPresent.has(schema)) {
    if (!missingSchemas.has(schema)) missingSchemas.set(schema, { refs: 0, tables: new Set(), site: [...sites][0] })
    const e = missingSchemas.get(schema)
    e.refs += sites.size
    e.tables.add(table)
    continue
  }
  missing.push({ table: qualified, referenceCount: sites.size, sites: [...sites].slice(0, 12) })
}
missing.sort((a, b) => b.referenceCount - a.referenceCount)
const missingSchemaList = [...missingSchemas.entries()]
  .map(([s, e]) => ({ schema: s, referenceSites: e.refs, distinctTables: e.tables.size, exampleSite: e.site }))
  .sort((a, b) => b.referenceSites - a.referenceSites)

// Tenant-bearing tables with RLS enabled but zero policies = unprotected even when enforced.
const rlsEnabledNoPolicy = rlsRes.rows.filter((r) => r.relrowsecurity && Number(r.policies) === 0).map((r) => r.relname)
const rlsDisabled = rlsRes.rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)

const report = {
  generatedAt: new Date().toISOString(),
  method: 'raw-SQL table references in server/ (non-test) vs information_schema after scripts/db/install-fresh.mjs on an empty database',
  tablesPresentAfterFreshInstall: present.size,
  schemasPresentAfterFreshInstall: [...schemasPresent].sort(),
  distinctTablesReferencedInServerSql: refs.size,
  missingTableCount: missing.length,
  totalDanglingReferenceSites: missing.reduce((a, b) => a + b.referenceCount, 0),
  missingSchemaCount: missingSchemaList.length,
  missingSchemas: missingSchemaList,
  rlsEnabledButZeroPolicies: rlsEnabledNoPolicy.length,
  rlsEnabledButZeroPoliciesList: rlsEnabledNoPolicy,
  rlsNotEnabled: rlsDisabled.length,
  rlsNotEnabledList: rlsDisabled,
  // Committed artifact keeps the top of the distribution with one example site
  // each, so the file stays reviewable in a diff. Re-run with GAP_FULL=1 for the
  // complete list with every reference site.
  missingTop: missing.slice(0, 120).map((m) => ({
    table: m.table,
    referenceCount: m.referenceCount,
    exampleSite: m.sites[0],
  })),
  ...(process.env.GAP_FULL ? { missing } : {}),
}

fs.writeFileSync(path.join(OUT, '10-fresh-install-gap.json'), JSON.stringify(report, null, 2))

console.log(`tables present after fresh install : ${present.size}`)
console.log(`distinct tables referenced in SQL  : ${refs.size}`)
console.log(`MISSING (queried but absent)       : ${missing.length}`)
console.log(`dangling reference sites           : ${report.totalDanglingReferenceSites}`)
console.log(`RLS enabled but ZERO policies      : ${rlsEnabledNoPolicy.length}`)
console.log(`RLS not enabled at all             : ${rlsDisabled.length}`)
console.log("\nmissing SCHEMAS (code queries them; installer never creates them):");
for (const s of missingSchemaList.slice(0,20)) console.log(`  ${String(s.referenceSites).padStart(4)} refs  ${s.schema}  (${s.distinctTables} tables)  e.g. ${s.exampleSite}`);
console.log("\ntop 25 missing PUBLIC tables by reference count:")
for (const m of missing.slice(0, 25)) console.log(`  ${String(m.referenceCount).padStart(4)}  ${m.table}   e.g. ${m.sites[0]}`)
