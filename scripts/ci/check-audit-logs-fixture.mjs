#!/usr/bin/env node
/**
 * A test fixture's `audit_logs` must accept every column the audit writer writes.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `writeChainedAuditRow` — the primitive behind every hash-chained,
 * HMAC-sealed §11.10(e) audit row — INSERTs sixteen columns. Eleven test
 * fixtures declared an `audit_logs` table with only twelve of them, missing
 * `old_values`, `new_values`, `ip_address` and `user_agent`. The shared
 * harness constant declared eight, and described itself as "minimal … just the
 * columns the chain + seal verifiers READ" — which was true of the verifier and
 * false of the fixture, because the same table is what the WRITER writes into.
 *
 * ── Why it mattered more than a broken test ──────────────────────────────────
 * The chained write is deliberately fail-closed: the audit row and the mutation
 * it records commit together or neither does. So against these fixtures a
 * governed write did not merely fail to log — it raised
 * `column "old_values" of relation "audit_logs" does not exist` and ROLLED THE
 * MUTATION BACK.
 *
 * A suite could therefore only stay green by never reaching the chained audit
 * path at all. That is exactly what happened: the two suites that do verify it
 * (esignature-audit-atomicity, the IND authoring journey) each wrote their own
 * fuller copy of the DDL, and every other suite silently tested a world in
 * which governed writes leave no entry in the chain. The gap was found by
 * closing a real hole — the section save never reaching the chain — and
 * watching eleven suites go red at once.
 *
 * ── What is checked ──────────────────────────────────────────────────────────
 * The writer's column list is READ FROM THE WRITER, not restated here — a
 * hand-copied list is the same drift one level up. Every `CREATE TABLE …
 * audit_logs` in test and harness sources must declare a superset of it.
 *
 * A fixture may legitimately declare MORE (several carry `target_type`,
 * `reason`, `ana_action_id` for other readers); only a missing column is a
 * finding, because only a missing column makes the writer unusable.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRITER = path.join(ROOT, 'server', 'services', 'auditService.ts');
const SCAN = ['tests', 'server', 'client', 'scripts'];

/** The columns `writeChainedAuditRow` INSERTs, read from its own INSERT. */
function writerColumns() {
  const src = readFileSync(WRITER, 'utf8');
  const at = src.indexOf('export async function writeChainedAuditRow');
  if (at < 0) throw new Error('writeChainedAuditRow not found in ' + path.relative(ROOT, WRITER));
  const m = /INSERT INTO audit_logs\s*\(([\s\S]*?)\)\s*\n?\s*VALUES/i.exec(src.slice(at));
  if (!m) throw new Error('could not read the INSERT column list from writeChainedAuditRow');
  return m[1]
    .split(',')
    .map((c) => c.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map((c) => c.toLowerCase());
}

/** Column names declared by a `CREATE TABLE … audit_logs ( … )` body. */
function declaredColumns(body) {
  const cols = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      cols.push(cur);
      cur = '';
    } else cur += ch;
  }
  cols.push(cur);
  return cols
    .map((c) => c.trim().split(/\s+/)[0]?.toLowerCase())
    .filter((c) => c && !/^(primary|unique|constraint|check|foreign)$/.test(c));
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === '_legacy') continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

function main() {
  const required = writerColumns();
  const findings = [];
  let fixtures = 0;

  for (const root of SCAN) {
    for (const file of walk(path.join(ROOT, root))) {
      let src;
      try {
        src = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      if (!/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?audit_logs/i.test(src)) continue;

      const re = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?audit_logs\s*\(/gi;
      let m;
      while ((m = re.exec(src))) {
        // Take the balanced parenthesised body.
        let i = m.index + m[0].length;
        let depth = 1;
        const start = i;
        while (i < src.length && depth > 0) {
          if (src[i] === '(') depth++;
          else if (src[i] === ')') depth--;
          i++;
        }
        fixtures++;
        const declared = new Set(declaredColumns(src.slice(start, i - 1)));
        const missing = required.filter((c) => !declared.has(c));
        if (missing.length) {
          findings.push({
            where: `${path.relative(ROOT, file)}:${src.slice(0, m.index).split('\n').length}`,
            missing,
          });
        }
      }
    }
  }

  console.log('[ci:audit-logs-fixture] audit_logs fixtures vs writeChainedAuditRow');
  console.log(`  columns the writer writes : ${required.length}`);
  console.log(`  fixtures found            : ${fixtures}`);

  if (!findings.length) {
    console.log(`\n✅ every audit_logs fixture accepts the writer's full column list.`);
    return 0;
  }

  console.log(`\n❌ ${findings.length} fixture(s) the audit writer cannot write into:\n`);
  for (const f of findings) console.log(`  ${f.where}\n      missing: ${f.missing.join(', ')}`);
  console.log(
    '\n  The chained audit write is fail-closed — the audit row and the mutation\n' +
      '  commit together or neither does. A fixture missing one of these columns\n' +
      '  does not merely skip the log: it ROLLS THE MUTATION BACK, so the suite can\n' +
      '  only stay green by never reaching a governed write. Add the missing\n' +
      "  columns, or import AUDIT_LOGS_PGLITE_DDL from server/db/pglite-harness.ts,\n" +
      '  which carries the full set.',
  );
  return 1;
}

process.exit(main());
