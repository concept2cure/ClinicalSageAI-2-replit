#!/usr/bin/env node
/**
 * Mechanical ground-truth sweep for the 2026-07 purchase-grade audit.
 *
 * Deterministic only — no LLM judgment. Reads every file in scope and emits JSON
 * evidence so that every number in the audit report traces to a re-runnable command.
 *
 * Usage: node docs/audit-2026-07/evidence/sweep.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const OUT = path.join(ROOT, 'docs/audit-2026-07/evidence')

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.cache',
  'playwright-report', 'test-results', '.turbo', 'tmp', 'logs',
])

/** Recursively walk a directory, yielding absolute file paths. */
function* walk(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.github') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      yield* walk(full)
    } else if (e.isFile()) {
      yield full
    }
  }
}

const rel = (p) => path.relative(ROOT, p)
const read = (p) => {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const isTest = (p) => /\.(test|spec)\.[jt]sx?$/.test(p) || /(^|\/)__tests__(\/|$)/.test(p) || /(^|\/)tests?(\/)/.test(p)

// ---------------------------------------------------------------------------
// 1. File census — every file in the repo, by layer
// ---------------------------------------------------------------------------
function fileCensus() {
  const byLayer = {}
  const byExt = {}
  let totalFiles = 0
  let totalLines = 0
  const oversized = []

  for (const f of walk(ROOT)) {
    const r = rel(f)
    const ext = path.extname(f)
    totalFiles++
    byExt[ext] = (byExt[ext] || 0) + 1

    const layer = r.split('/')[0]
    byLayer[layer] ??= { files: 0, lines: 0, codeFiles: 0, codeLines: 0, testFiles: 0 }
    byLayer[layer].files++

    if (!CODE_EXT.has(ext)) continue
    const lines = read(f).split('\n').length
    totalLines += lines
    byLayer[layer].lines += lines
    byLayer[layer].codeFiles++
    byLayer[layer].codeLines += lines
    if (isTest(r)) byLayer[layer].testFiles++
    if (lines > 1500) oversized.push({ file: r, lines })
  }

  oversized.sort((a, b) => b.lines - a.lines)
  return { totalFiles, totalCodeLines: totalLines, byLayer, byExt, oversized }
}

// ---------------------------------------------------------------------------
// 2. Debt census — escape hatches and work markers, per directory
// ---------------------------------------------------------------------------
function debtCensus() {
  const PATTERNS = {
    any: /(?::\s*any\b|\bas\s+any\b|<any>|\bany\[\])/g,
    tsIgnore: /@ts-ignore/g,
    tsExpectError: /@ts-expect-error/g,
    asUnknownAs: /as\s+unknown\s+as/g,
    eslintDisable: /eslint-disable/g,
    todoMarker: /\/\/\s*TODO|\/\*\s*TODO|\bFIXME\b|\bHACK\b|\bXXX\b/g,
    notImplemented: /not\s+implemented|notImplemented/gi,
    inRealImplementation: /in a real implementation|for now,? (?:we|return|just)|simplified implementation/gi,
    mathRandom: /Math\.random\(\)/g,
    consoleLog: /console\.(log|warn|error|info)\(/g,
    dangerousHtml: /dangerouslySetInnerHTML/g,
    rawSqlTemplate: /\.query\(\s*`[^`]*\$\{/g,
    sqlRaw: /sql\.raw\(/g,
  }

  const scopes = {
    'server/routes': {}, 'server/services': {}, 'server/middleware': {},
    'server/api': {}, 'server/db': {}, 'server/startup': {}, 'server/bootstrap': {},
    'client/src': {}, 'shared': {}, 'scripts': {},
  }
  const detail = {}

  for (const scope of Object.keys(scopes)) {
    const dir = path.join(ROOT, scope)
    if (!fs.existsSync(dir)) continue
    const counts = Object.fromEntries(Object.keys(PATTERNS).map((k) => [k, 0]))
    counts._files = 0
    counts._testFilesExcluded = 0
    for (const f of walk(dir)) {
      if (!CODE_EXT.has(path.extname(f))) continue
      const r = rel(f)
      if (isTest(r)) { counts._testFilesExcluded++; continue }
      counts._files++
      const src = read(f)
      for (const [name, re] of Object.entries(PATTERNS)) {
        const m = src.match(re)
        if (!m) continue
        counts[name] += m.length
        if (['dangerousHtml', 'mathRandom', 'sqlRaw', 'rawSqlTemplate', 'inRealImplementation'].includes(name)) {
          detail[name] ??= []
          src.split('\n').forEach((ln, i) => {
            const single = new RegExp(re.source, re.flags.replace('g', ''))
            if (single.test(ln)) detail[name].push({ file: r, line: i + 1, text: ln.trim().slice(0, 200) })
          })
        }
      }
    }
    scopes[scope] = counts
  }
  return { scopes, detail }
}

// ---------------------------------------------------------------------------
// 3. Endpoint matrix — every declared HTTP endpoint and its guards
// ---------------------------------------------------------------------------
function endpointMatrix() {
  const EP = /\b(?:app|router|r)\s*\.\s*(get|post|put|patch|delete|all)\s*\(\s*(['"`])([^'"`]+)\2\s*,?([^)]*)/g
  const GUARDS = [
    'authenticateToken', 'requireAuth', 'requireRole', 'requirePermission', 'requireOrgAccess',
    'requirePlatformAdmin', 'requireBusinessAdmin', 'requireTenantContext', 'requireLicenseAcceptance',
    'validateApiKey', 'isAuthenticated', 'ensureAuth', 'requireSuperAdmin',
  ]
  const rows = []
  for (const base of ['server/routes', 'server/api', 'server/startup', 'server/bootstrap', 'server/src/routes']) {
    const dir = path.join(ROOT, base)
    if (!fs.existsSync(dir)) continue
    for (const f of walk(dir)) {
      if (!CODE_EXT.has(path.extname(f))) continue
      const r = rel(f)
      if (isTest(r)) continue
      const src = read(f)
      const lines = src.split('\n')
      let m
      EP.lastIndex = 0
      while ((m = EP.exec(src)) !== null) {
        const line = src.slice(0, m.index).split('\n').length
        const inlineArgs = m[4] || ''
        // look at the declaration line plus the next 3 for middleware
        const window = lines.slice(line - 1, line + 3).join(' ')
        const guards = GUARDS.filter((g) => window.includes(g) || inlineArgs.includes(g))
        rows.push({
          file: r, line, method: m[1].toUpperCase(), routePath: m[3],
          guards, guarded: guards.length > 0,
        })
      }
    }
  }
  const byFile = {}
  for (const row of rows) {
    byFile[row.file] ??= { total: 0, guarded: 0 }
    byFile[row.file].total++
    if (row.guarded) byFile[row.file].guarded++
  }
  return {
    totalEndpoints: rows.length,
    guardedEndpoints: rows.filter((r) => r.guarded).length,
    unguardedEndpoints: rows.filter((r) => !r.guarded).length,
    filesWithEndpoints: Object.keys(byFile).length,
    byFile,
    unguarded: rows.filter((r) => !r.guarded),
  }
}

// ---------------------------------------------------------------------------
// 4. Table matrix — every table created anywhere, and where
// ---------------------------------------------------------------------------
function tableMatrix() {
  const created = {}   // table -> [{file, line, kind}]
  const drizzle = {}   // table -> [file]

  for (const f of walk(ROOT)) {
    const r = rel(f)
    const ext = path.extname(f)
    if (ext === '.sql') {
      const src = read(f)
      const re = /CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(?:public\.)?["']?([a-zA-Z0-9_]+)/gi
      let m
      while ((m = re.exec(src)) !== null) {
        const line = src.slice(0, m.index).split('\n').length
        const t = m[1].toLowerCase()
        created[t] ??= []
        created[t].push({ file: r, line, kind: 'sql' })
      }
    } else if (CODE_EXT.has(ext) && !isTest(r)) {
      const src = read(f)
      if (!src.includes('pgTable(')) continue
      const re = /pgTable\(\s*(['"`])([^'"`]+)\1/g
      let m
      while ((m = re.exec(src)) !== null) {
        const t = m[2].toLowerCase()
        drizzle[t] ??= []
        drizzle[t].push(r)
      }
    }
  }

  const dupSql = Object.entries(created).filter(([, v]) => new Set(v.map((x) => x.file)).size > 1)
  const dupDrizzle = Object.entries(drizzle).filter(([, v]) => new Set(v).size > 1)
  const sqlOnly = Object.keys(created).filter((t) => !drizzle[t])
  const drizzleOnly = Object.keys(drizzle).filter((t) => !created[t])

  return {
    distinctTablesInSql: Object.keys(created).length,
    distinctTablesInDrizzle: Object.keys(drizzle).length,
    duplicateSqlDefinitions: dupSql.length,
    duplicateDrizzleDefinitions: dupDrizzle.length,
    sqlOnlyTables: sqlOnly.length,
    drizzleOnlyTables: drizzleOnly.length,
    duplicateSqlDetail: Object.fromEntries(dupSql.map(([k, v]) => [k, [...new Set(v.map((x) => x.file))]])),
    duplicateDrizzleDetail: Object.fromEntries(dupDrizzle.map(([k, v]) => [k, [...new Set(v)]])),
  }
}

// ---------------------------------------------------------------------------
// 5. Migration apply-path analysis
// ---------------------------------------------------------------------------
function migrationPaths() {
  const trees = {}
  for (const f of walk(ROOT)) {
    if (path.extname(f) !== '.sql') continue
    const r = rel(f)
    const dir = path.dirname(r)
    trees[dir] = (trees[dir] || 0) + 1
  }
  // which files does deploy-migrate reference?
  const dm = read(path.join(ROOT, 'scripts/db/migration-set.mjs')) + read(path.join(ROOT, 'scripts/db/deploy-migrate.mjs'))
  const referenced = [...dm.matchAll(/['"]([^'"]*\.sql)['"]/g)].map((m) => m[1])
  const installFresh = read(path.join(ROOT, 'scripts/db/install-fresh.mjs'))
  const ifRefs = [...installFresh.matchAll(/['"]([^'"]*\.sql)['"]/g)].map((m) => m[1])
  return {
    sqlFilesByDirectory: Object.fromEntries(Object.entries(trees).sort((a, b) => b[1] - a[1])),
    deployMigrateReferencedFiles: referenced.length,
    deployMigrateReferences: referenced,
    installFreshExplicitReferences: ifRefs.length,
  }
}

// ---------------------------------------------------------------------------
// 6. Service coverage — which service dirs have tests / callers
// ---------------------------------------------------------------------------
function serviceCoverage() {
  const svcDir = path.join(ROOT, 'server/services')
  if (!fs.existsSync(svcDir)) return {}
  const dirs = fs.readdirSync(svcDir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== '__tests__').map((d) => d.name)
  const out = { total: dirs.length, withTests: 0, withoutTests: 0, noTestList: [] }
  for (const d of dirs) {
    let hasTest = false
    for (const f of walk(path.join(svcDir, d))) {
      if (isTest(rel(f))) { hasTest = true; break }
    }
    if (hasTest) out.withTests++
    else { out.withoutTests++; out.noTestList.push(`server/services/${d}`) }
  }
  return out
}

// ---------------------------------------------------------------------------
// 7. Suppression ledger — every baseline/allowlist and its size
// ---------------------------------------------------------------------------
function suppressionLedger() {
  const CANDIDATES = [
    '.typecheck-baseline.json',
    'scripts/ci/unbacked-tables-baseline.json',
    'scripts/ci/duplicate-table-ddl-baseline.json',
    'scripts/ci/unreferenced-modules-baseline.json',
    'scripts/ci/gateway-bypass-baseline.json',
    'migrations/.prefix-collisions-baseline.json',
    'docs/reports/tenant-isolation-baseline.json',
    'docs/reports/route-mount-audit-baseline.json',
    'docs/reports/requestdb-coverage-baseline.json',
    'docs/reports/no-mock-in-prod-routes-baseline.json',
    'docs/reports/env-var-docs-baseline.json',
    'docs/reports/orphan-endpoints-latest.json',
    'docs/reports/repo-health-scan-latest.json',
  ]
  const out = {}
  let totalSuppressed = 0
  for (const c of CANDIDATES) {
    const p = path.join(ROOT, c)
    if (!fs.existsSync(p)) { out[c] = { present: false }; continue }
    let json
    try { json = JSON.parse(read(p)) } catch { out[c] = { present: true, parseError: true }; continue }
    const shape = {}
    let size = 0
    for (const [k, v] of Object.entries(json)) {
      if (Array.isArray(v)) { shape[k] = v.length; size = Math.max(size, v.length) }
      else if (v && typeof v === 'object') { shape[k] = Object.keys(v).length; size = Math.max(size, Object.keys(v).length) }
      else shape[k] = v
    }
    out[c] = { present: true, shape, suppressedCount: size }
    totalSuppressed += size
  }
  out._totalSuppressedItems = totalSuppressed
  return out
}

// ---------------------------------------------------------------------------
// 8. Secret scan (working tree)
// ---------------------------------------------------------------------------
function secretScan() {
  const RULES = [
    ['openai_key', /\bsk-[A-Za-z0-9]{20,}/],
    ['anthropic_key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
    ['aws_access_key', /\bAKIA[0-9A-Z]{16}\b/],
    ['github_pat', /\bghp_[A-Za-z0-9]{30,}/],
    ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['stripe_live', /\bsk_live_[A-Za-z0-9]{20,}/],
    ['slack_token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
    ['jwt_hardcoded', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./],
  ]
  const hits = []
  for (const f of walk(ROOT)) {
    const ext = path.extname(f)
    if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.sh', '.env', '.example', '.md', '.tf'].includes(ext)) continue
    const src = read(f)
    if (!src) continue
    const lines = src.split('\n')
    for (const [name, re] of RULES) {
      lines.forEach((ln, i) => {
        if (re.test(ln)) hits.push({ rule: name, file: rel(f), line: i + 1, snippet: ln.trim().slice(0, 120) })
      })
    }
  }
  return { hitCount: hits.length, hits }
}

// ---------------------------------------------------------------------------
// 9. Multer / upload safety adoption
// ---------------------------------------------------------------------------
function uploadSafety() {
  const sites = []
  for (const f of walk(path.join(ROOT, 'server'))) {
    if (!CODE_EXT.has(path.extname(f))) continue
    const r = rel(f)
    if (isTest(r)) continue
    const src = read(f)
    if (!/multer\s*\(/.test(src)) continue
    sites.push({
      file: r,
      hasFileFilter: /fileFilter/.test(src),
      hasSizeLimit: /limits\s*:\s*\{[^}]*fileSize/.test(src),
      usesUploadAllowlist: /uploadAllowlist|assertAllowedUpload/.test(src),
      usesUploadSafety: /uploadSafety|scanUpload|verifyFileSignature/.test(src),
    })
  }
  return {
    totalMulterSites: sites.length,
    withFileFilter: sites.filter((s) => s.hasFileFilter).length,
    withSizeLimit: sites.filter((s) => s.hasSizeLimit).length,
    withAllowlist: sites.filter((s) => s.usesUploadAllowlist).length,
    withSafetyMiddleware: sites.filter((s) => s.usesUploadSafety).length,
    sites,
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const write = (name, data) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2))
  console.log(`  wrote ${name}`)
}

console.log('sweep: file census')
const census = fileCensus()
write('01-file-census.json', census)

console.log('sweep: debt census')
write('02-debt-census.json', debtCensus())

console.log('sweep: endpoint matrix')
const eps = endpointMatrix()
write('03-endpoint-matrix.json', eps)

console.log('sweep: table matrix')
const tables = tableMatrix()
write('04-table-matrix.json', tables)

console.log('sweep: migration paths')
write('05-migration-paths.json', migrationPaths())

console.log('sweep: service coverage')
const svc = serviceCoverage()
write('06-service-coverage.json', svc)

console.log('sweep: suppression ledger')
const supp = suppressionLedger()
write('07-suppression-ledger.json', supp)

console.log('sweep: secret scan')
const secrets = secretScan()
write('08-secret-scan.json', secrets)

console.log('sweep: upload safety')
const up = uploadSafety()
write('09-upload-safety.json', up)

console.log('\n=== HEADLINES ===')
console.log(`files=${census.totalFiles} codeLines=${census.totalCodeLines} oversized(>1500L)=${census.oversized.length}`)
console.log(`endpoints=${eps.totalEndpoints} guarded=${eps.guardedEndpoints} unguarded=${eps.unguardedEndpoints}`)
console.log(`tables: sql=${tables.distinctTablesInSql} drizzle=${tables.distinctTablesInDrizzle} dupSql=${tables.duplicateSqlDefinitions} dupDrizzle=${tables.duplicateDrizzleDefinitions} sqlOnly=${tables.sqlOnlyTables}`)
console.log(`services: ${svc.withTests}/${svc.total} have tests (${svc.withoutTests} without)`)
console.log(`suppressed items across baselines: ${supp._totalSuppressedItems}`)
console.log(`secret-scan hits: ${secrets.hitCount}`)
console.log(`multer sites=${up.totalMulterSites} fileFilter=${up.withFileFilter} sizeLimit=${up.withSizeLimit} allowlist=${up.withAllowlist}`)
