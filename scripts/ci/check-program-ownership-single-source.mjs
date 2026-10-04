#!/usr/bin/env node
/**
 * CI Guard: "is this program the caller's organization's?" has one answer.
 *
 * ── The rule ──────────────────────────────────────────────────────────────────
 * Every governed chain starts at a project, so a request that names a program
 * (`regulatory_programs.id`) must be checked against the caller's organization
 * before anything is read for it or anchored to it. That question is answered
 * by `programInOrganization` (server/services/c2c/program-access.ts): a
 * UUID-shaped id, a live (not deleted) row of `regulatory_programs`, owned by
 * the integer organization. A lookup that cannot run throws; it never answers
 * "not yours".
 *
 * ── Why a gate ────────────────────────────────────────────────────────────────
 * LX-20 (2026-09-25) made that function canonical and migrated a dozen copies.
 * Five days later there were about 35 again (D3, 2026-10-01): three helper
 * functions named `programBelongsToOrg` that disagreed with each other and with
 * the canonical one — one consulted two registries nothing writes, one asked
 * whether the caller had RBM records that mention the program rather than
 * whether it owns it — plus inline SQL and Drizzle copies, most of which
 * admitted a deleted project. A canonical function with no gate is a
 * suggestion; each copy was reasonable on its own, and the set was the drift.
 *
 * ── What this catches ─────────────────────────────────────────────────────────
 *   1. An inline yes/no ownership query on regulatory_programs: SELECT 1 or
 *      SELECT id, keyed on the id and the organization (either order, any
 *      alias, with or without ::text casts, deleted_at or LIMIT).
 *   2. The same in Drizzle: `.select({ id: regulatoryPrograms.id })` whose
 *      where clause keys on regulatoryPrograms.id and .organizationId.
 *   3. A helper declared under the names the copies used
 *      (`programBelongsToOrg`, `ownsProgram`).
 *
 * A query that LOADS a program's own fields scoped to the organization (its
 * name, type, metadata, lead) is a read, not a copy of the check, and passes.
 * There is no baseline: the count is zero and stays zero.
 *
 * Usage:
 *   node scripts/ci/check-program-ownership-single-source.mjs
 *   node scripts/ci/check-program-ownership-single-source.mjs --self-test
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const CANONICAL = 'server/services/c2c/program-access.ts';

const ID = String.raw`(?:\w+\.)?id(?:::text)?\s*=\s*\$\d+`;
const ORG = String.raw`(?:\w+\.)?organization_id(?:::text)?\s*=\s*\$\d+`;

const RULES = [
  {
    what: 'inline yes/no program-ownership query',
    re: new RegExp(
      String.raw`SELECT\s+(?:1|(?:\w+\.)?id)(?:\s+AS\s+\w+)?\s+FROM\s+(?:public\.)?regulatory_programs(?:\s+(?!WHERE\b)\w+)?\s+WHERE\s+(?:${ID}\s+AND\s+${ORG}|${ORG}\s+AND\s+${ID})`,
      'gi',
    ),
  },
  {
    what: 'Drizzle yes/no program-ownership query',
    // An argument may itself be a call — eq(regulatoryPrograms.id, String(req.params.programId)) —
    // so the first eq() is matched through one level of nested parentheses.
    re: /\.select\(\s*\{\s*id:\s*regulatoryPrograms\.id\s*,?\s*\}\s*\)\s*\.from\(\s*regulatoryPrograms\s*\)\s*\.where\(\s*and\(\s*(?:eq\(\s*regulatoryPrograms\.id\b(?:[^()]|\([^()]*\))*\)\s*,\s*eq\(\s*regulatoryPrograms\.organizationId\b|eq\(\s*regulatoryPrograms\.organizationId\b(?:[^()]|\([^()]*\))*\)\s*,\s*eq\(\s*regulatoryPrograms\.id\b)/g,
  },
  {
    what: 'a second program-ownership helper',
    re: /\b(?:async\s+)?function\s+(?:programBelongsToOrg|ownsProgram)\s*\(|\b(?:const|let)\s+(?:programBelongsToOrg|ownsProgram)\s*=/g,
  },
];

/** Every finding in one file's text, as { line, what, text }. */
export function findCopies(text) {
  const out = [];
  for (const { what, re } of RULES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split('\n').length;
      out.push({ line, what, text: m[0].replace(/\s+/g, ' ').slice(0, 120) });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

function serverFiles() {
  return execSync("git ls-files 'server/**/*.ts' 'server/*.ts'", { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter(f => f !== CANONICAL)
    .filter(f => !/(^|\/)__tests__\//.test(f) && !/\.(test|spec|dbtest)\.ts$/.test(f));
}

function selfTest() {
  const MUST_FIND = [
    "pool.query('SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1', [a, b])",
    'q(`SELECT id FROM regulatory_programs\n      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`)',
    "q('SELECT 1 FROM regulatory_programs WHERE id::text = $1 AND organization_id::text = $2 LIMIT 1')",
    'q(`SELECT 1 AS present FROM regulatory_programs WHERE id::text = $1 AND organization_id = $2`)',
    'q(`SELECT rp.id FROM public.regulatory_programs rp WHERE rp.organization_id = $2 AND rp.id = $1`)',
    'await db\n  .select({ id: regulatoryPrograms.id })\n  .from(regulatoryPrograms)\n  .where(and(eq(regulatoryPrograms.id, programId), eq(regulatoryPrograms.organizationId, orgId)))',
    'await db.select({ id: regulatoryPrograms.id }).from(regulatoryPrograms).where(\n and(eq(regulatoryPrograms.organizationId, orgId), eq(regulatoryPrograms.id, x)))',
    'const [row] = await db\n    .select({ id: regulatoryPrograms.id })\n    .from(regulatoryPrograms)\n    .where(and(eq(regulatoryPrograms.id, String(req.params.programId)), eq(regulatoryPrograms.organizationId, orgId)))',
    'async function programBelongsToOrg(programId: string, orgId: number) {}',
    'export async function ownsProgram(id) {}',
  ];
  const MUST_PASS = [
    'q(`SELECT lead_user_id FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`)',
    'q(`SELECT id, name, product_type FROM regulatory_programs WHERE id = $1 AND organization_id = $2`)',
    'q(`SELECT id FROM regulatory_programs WHERE organization_id = $1 AND deleted_at IS NULL`)',
    'await db.select({ metadata: regulatoryPrograms.metadata }).from(regulatoryPrograms).where(and(eq(regulatoryPrograms.id, p), eq(regulatoryPrograms.organizationId, o)))',
    'await db.select().from(regulatoryPrograms).where(and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, orgId)))',
    'if (!(await programInOrganization(pool, programId, orgId))) return send404(res);',
  ];
  let failed = 0;
  for (const s of MUST_FIND) {
    if (findCopies(s).length === 0) {
      failed++;
      console.error(`[self-test] MISSED a copy: ${s.replace(/\s+/g, ' ').slice(0, 100)}`);
    }
  }
  for (const s of MUST_PASS) {
    const hits = findCopies(s);
    if (hits.length > 0) {
      failed++;
      console.error(`[self-test] FLAGGED a read that is not a copy: ${s.replace(/\s+/g, ' ').slice(0, 100)}`);
    }
  }
  if (failed) {
    console.error(`[self-test] ${failed} case(s) wrong`);
    process.exit(1);
  }
  console.log(`[self-test] OK — ${MUST_FIND.length} copies found, ${MUST_PASS.length} reads passed.`);
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const findings = [];
  for (const file of serverFiles()) {
    const text = readFileSync(path.join(ROOT, file), 'utf8');
    for (const f of findCopies(text)) findings.push({ file, ...f });
  }
  if (findings.length === 0) {
    console.log(`[ci:program-ownership-single-source] OK — every program-ownership check calls programInOrganization (${CANONICAL}).`);
    return;
  }
  console.error(`[ci:program-ownership-single-source] ${findings.length} copy(ies) of the program-ownership check outside ${CANONICAL}:`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.what}: ${f.text}`);
  console.error(
    '\nCall programInOrganization(db, programId, organizationId) instead. It is the one definition of a program\n' +
      "the organization may act on: live, theirs, in regulatory_programs. A copy drifts — see this script's header.",
  );
  process.exit(1);
}

main();
