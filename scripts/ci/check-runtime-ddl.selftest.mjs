#!/usr/bin/env node
/**
 * Self-test for scripts/ci/check-runtime-ddl.mjs — the gate shown failing on
 * every case it exists to catch, and passing on every case it must not flag.
 *
 * Each case builds a throwaway server/ tree and baseline in a temp directory
 * and runs the REAL gate against it as a subprocess, so what is tested is the
 * command CI runs, not a re-implementation of it.
 *
 * The first case is the historical defect verbatim: the runtime CREATE TABLE
 * that POST /api/auth/license-request ran until 2026-09-24, which lost every
 * enterprise onboarding request in production and could not fail on a
 * developer machine.
 *
 * Usage: node scripts/ci/check-runtime-ddl.selftest.mjs   (exit 0 = all cases held)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-runtime-ddl.mjs');
const REASON = 'Selftest fixture: a written reason long enough to satisfy the gate.';

function run({ files, baseline = {}, strict = false }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-ddl-selftest-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    const baselinePath = path.join(root, 'baseline.json');
    fs.writeFileSync(baselinePath, JSON.stringify({ files: baseline }));
    const res = spawnSync(
      process.execPath,
      [
        GATE,
        '--root', path.join(root, 'server'),
        '--baseline', baselinePath,
        '--report-base', root,
        ...(strict ? ['--strict'] : []),
      ],
      { encoding: 'utf8' },
    );
    return { code: res.status, out: `${res.stdout}\n${res.stderr}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const OLD_INTAKE = `
import { sql } from 'drizzle-orm';
export async function intake(db, name) {
  try {
    await db.execute(sql\`INSERT INTO license_requests (name) VALUES (\${name})\`);
  } catch (dbErr) {
    if (dbErr?.code === '42P01') {
      await db.execute(sql\`CREATE TABLE IF NOT EXISTS license_requests (
          id SERIAL PRIMARY KEY,
          name VARCHAR(200) NOT NULL
        )\`);
    }
  }
}
`;

const cases = [
  {
    name: 'RED — the historical license_requests runtime CREATE TABLE is caught and named',
    files: { 'server/routes/auth.ts': OLD_INTAKE },
    expect: 1,
    mustSay: ['server/routes/auth.ts', 'CREATE TABLE IF NOT EXISTS l'],
  },
  {
    name: 'RED — CREATE INDEX on the runtime path',
    files: { 'server/services/a.ts': "await pool.query('CREATE INDEX IF NOT EXISTS idx_a ON a (b)');" },
    expect: 1,
    mustSay: ['server/services/a.ts'],
  },
  {
    name: 'RED — ALTER TABLE … ADD COLUMN IF NOT EXISTS',
    files: { 'server/services/b.ts': 'await pool.query(`ALTER TABLE b ADD COLUMN IF NOT EXISTS c text`);' },
    expect: 1,
    mustSay: ['server/services/b.ts'],
  },
  {
    name: 'RED — CREATE SCHEMA with an interpolated name',
    files: { 'server/services/c.ts': 'await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);' },
    expect: 1,
    mustSay: ['server/services/c.ts'],
  },
  {
    name: 'RED — GRANT … ON',
    files: { 'server/services/d.ts': "await pool.query('GRANT SELECT ON d TO app_service');" },
    expect: 1,
    mustSay: ['server/services/d.ts'],
  },
  {
    name: 'RED — DROP TABLE',
    files: { 'server/services/e.ts': "await pool.query('DROP TABLE IF EXISTS e');" },
    expect: 1,
    mustSay: ['server/services/e.ts'],
  },
  {
    name: 'RED — lower-case SQL is still SQL',
    files: { 'server/services/f.ts': "await pool.query('create table if not exists f (id int)');" },
    expect: 1,
    mustSay: ['server/services/f.ts'],
  },
  {
    name: 'GREEN — prose is not DDL: a prompt naming an ICH E3 table caption',
    files: {
      'server/services/prompt.ts':
        "const p = 'When the user says \"Create Table 2.7.4.1-1\", you do it.';",
    },
    expect: 0,
  },
  {
    name: 'GREEN — prose is not DDL: a log line ending in the keyword',
    files: {
      'server/db/log.ts':
        "logger.warn('extension DDL skipped. Set ALLOW_EXTENSION_DDL=true to attempt CREATE EXTENSION.');",
    },
    expect: 0,
  },
  {
    name: 'GREEN — ordinary English "grant" is not a GRANT',
    files: { 'server/services/g.ts': "const msg = 'Ask an administrator to grant access to this module.';" },
    expect: 0,
  },
  {
    name: 'GREEN — DDL that exists only in a comment',
    files: {
      'server/services/h.ts':
        '// Until 2026-09-24 this ran CREATE TABLE IF NOT EXISTS h (id int) here.\n' +
        '/* CREATE INDEX IF NOT EXISTS idx_h ON h (id) */\nexport const h = 1;',
    },
    expect: 0,
  },
  {
    name: 'GREEN — out of scope: tests, __tests__, migrations, server/scripts',
    files: {
      'server/services/x.test.ts': "await pool.query('CREATE TABLE t (id int)');",
      'server/routes/__tests__/y.ts': "await pool.query('CREATE TABLE t (id int)');",
      'server/migrations/z.ts': "await pool.query('CREATE TABLE t (id int)');",
      'server/scripts/seed.ts': "await pool.query('CREATE TABLE t (id int)');",
    },
    expect: 0,
  },
  {
    name: 'GREEN — a baselined file at its pinned count',
    files: { 'server/services/k.ts': "await pool.query('CREATE TABLE IF NOT EXISTS k (id int)');" },
    baseline: { 'server/services/k.ts': { count: 1, reason: REASON } },
    expect: 0,
  },
  {
    name: 'RED — a baselined file that GAINS a statement',
    files: {
      'server/services/k.ts':
        "await pool.query('CREATE TABLE IF NOT EXISTS k (id int)');\n" +
        "await pool.query('CREATE INDEX IF NOT EXISTS idx_k ON k (id)');",
    },
    baseline: { 'server/services/k.ts': { count: 1, reason: REASON } },
    expect: 1,
    mustSay: ['1 → 2', 'gained DDL'],
  },
  {
    name: 'RED — a baseline entry with no written reason',
    files: { 'server/services/k.ts': "await pool.query('CREATE TABLE IF NOT EXISTS k (id int)');" },
    baseline: { 'server/services/k.ts': { count: 1, reason: '' } },
    expect: 1,
    mustSay: ['no written reason'],
  },
  {
    name: 'GREEN (default) — a baselined file with LESS DDL is reported, not fatal',
    files: { 'server/services/k.ts': 'export const k = 1;' },
    baseline: { 'server/services/k.ts': { count: 1, reason: REASON } },
    expect: 0,
    mustSay: ['LESS DDL', 'server/services/k.ts — 1 → 0'],
  },
  {
    name: 'RED (--strict) — the same overstated baseline is fatal under --strict',
    files: { 'server/services/k.ts': 'export const k = 1;' },
    baseline: { 'server/services/k.ts': { count: 1, reason: REASON } },
    strict: true,
    expect: 1,
    mustSay: ['--strict'],
  },
];

let failed = 0;
for (const c of cases) {
  const { code, out } = run(c);
  const missing = (c.mustSay ?? []).filter((s) => !out.includes(s));
  const ok = code === c.expect && missing.length === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${c.name}  (exit ${code}, expected ${c.expect})`);
  if (!ok) {
    if (missing.length) console.log(`      output did not say: ${missing.map((m) => JSON.stringify(m)).join(', ')}`);
    console.log(out.split('\n').map((l) => `      | ${l}`).join('\n'));
  }
}

console.log(`\n[ci:runtime-ddl:selftest] ${cases.length - failed}/${cases.length} cases held`);
process.exit(failed ? 1 : 0);
