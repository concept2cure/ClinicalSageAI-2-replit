/**
 * The route writer is a role, never a setting (D5, founder decision P-59,
 * 2026-10-29; docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/).
 *
 * Until P-59 the database trigger unified_tasks_route_rows_guard admitted a
 * write to a route row on any transaction that set c2c.review_route_writer.
 * PostgreSQL lets every role set a custom setting, and the runtime role did
 * (docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/guc-probe.txt). The
 * guard now admits a route-row write only when current_user is the NOLOGIN,
 * NOINHERIT role review_route_writer, which is true only inside its SECURITY
 * DEFINER doors (migrations/20261023_review_routes.sql, amended in place), the
 * ana_run_events_purger pattern (20261008f). This gate pins that:
 *   - no server or shared file sets the old setting (it would now be a dead
 *     write, and a sign that someone expects it to admit something);
 *   - the guard reads current_user, and reads no session setting at all;
 *   - the role is created NOLOGIN NOINHERIT and nothing grants it to the
 *     runtime role;
 *   - every door is SECURITY DEFINER with a pinned search_path, verified in the
 *     owner block, reviewed on scripts/db/security-definer-allowlist.json, and
 *     every door the server calls exists.
 * Each check is seen failing on the case it exists to catch.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const MIGRATION = path.join(ROOT, 'migrations/20261023_review_routes.sql');
const ALLOWLIST = path.join(ROOT, 'scripts/db/security-definer-allowlist.json');
const CALLERS = [
  'server/services/review/review-route.ts',
  'server/services/tasking/create-task.ts',
  'server/services/tasking/task-assignment.ts',
];
const SETTER = /set_config\(\s*'c2c\.review_route_writer'|SET\s+(LOCAL\s+)?c2c\.review_route_writer/i;

function routeWriterSetters(root = ROOT, dirs = ['server', 'shared']): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        walk(full);
      } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        if (SETTER.test(fs.readFileSync(full, 'utf8'))) found.push(path.relative(root, full));
      }
    }
  };
  for (const d of dirs) walk(path.join(root, d));
  return found.sort();
}

function functionBody(sql: string, name: string): string | null {
  const head = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([^)]*\\)[\\s\\S]*?AS (\\$[a-z]*\\$)`, 'i').exec(sql);
  if (!head) return null;
  const tag = head[1];
  const start = head.index + head[0].length;
  const end = sql.indexOf(tag, start);
  return end < 0 ? null : sql.slice(head.index, end + tag.length);
}

const DOOR_DEF = /CREATE OR REPLACE FUNCTION public\.(review_route_[a-z_]+)\(/g;

/** The guard and the role: what admits a route-row write, and who can become it. */
function guardFindings(sql: string, guard: string): string[] {
  const findings: string[] = [];
  if (/current_setting\s*\(/i.test(guard)) findings.push('GUARD_READS_A_SETTING');
  if (!/IF current_user = 'review_route_writer' THEN/.test(guard)) findings.push('GUARD_NOT_ON_THE_ROLE');
  if (!/CREATE ROLE review_route_writer\s+NOLOGIN[^;]*NOINHERIT/.test(sql)) findings.push('ROLE_NOT_NOLOGIN_NOINHERIT');
  if (/GRANT\s+review_route_writer\s+TO\s+(app_service|PUBLIC)/i.test(sql)) findings.push('ROLE_GRANTED_TO_RUNTIME');
  if (SETTER.test(sql.replace(/^\s*--.*$/gm, ''))) findings.push('MIGRATION_SETS_THE_SETTING');
  return findings;
}

/** Every finding is a way the route rows could be written without the route writer's doors. */
function routeWriterFindings(sql: string, allowlist: Record<string, unknown>, callers: string[]): string[] {
  const guard = functionBody(sql, 'unified_tasks_route_rows_guard');
  if (!guard) return ['GUARD_MISSING'];
  return [...guardFindings(sql, guard), ...doorFindings(sql, allowlist, callers)];
}

/** Each door: a definer function, pinned, scoped, verified in the owner block, reviewed; and every called door exists. */
function doorFindings(sql: string, allowlist: Record<string, unknown>, callers: string[]): string[] {
  const findings: string[] = [];
  const doors = new Set<string>();
  for (const m of sql.matchAll(DOOR_DEF)) {
    const body = functionBody(sql, m[1]) ?? '';
    if (/SECURITY DEFINER/.test(body)) doors.add(m[1]);
  }
  const reviewed = Object.keys(allowlist).map((k) => k.replace(/^public\./, '').replace(/\(.*$/, ''));
  for (const door of doors) {
    const body = functionBody(sql, door) ?? '';
    if (!/SET search_path = pg_catalog, public/.test(body)) findings.push(`SEARCH_PATH_UNPINNED:${door}`);
    if (!/review_route_door_scope\(p_org\)/.test(body)) findings.push(`NO_TENANT_SCOPE:${door}`);
    if (!new RegExp(`'public\\.${door}\\(`).test(sql)) findings.push(`NOT_IN_OWNER_BLOCK:${door}`);
    if (!reviewed.includes(door)) findings.push(`NOT_REVIEWED:${door}`);
  }
  for (const src of callers) {
    for (const m of src.matchAll(/public\.(review_route_[a-z_]+)\(/g)) {
      if (!doors.has(m[1])) findings.push(`CALLED_NOT_A_DOOR:${m[1]}`);
    }
  }
  return findings;
}

const sql = fs.readFileSync(MIGRATION, 'utf8');
const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8')).functions as Record<string, unknown>;
const callers = CALLERS.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));

describe('the route writer is a role, never a setting (P-59)', () => {
  it('no server or shared file sets c2c.review_route_writer', () => {
    expect(routeWriterSetters()).toEqual([]);
  });

  it('fails when a server file sets it (the gate seen failing)', () => {
    const tmp = fs.mkdtempSync(path.join(ROOT, 'server', '.route-writer-gate-'));
    try {
      fs.writeFileSync(path.join(tmp, 'rogue.ts'), "await q.query(`SELECT set_config('c2c.review_route_writer', 'on', true)`);\n");
      expect(routeWriterSetters()).toContain(path.relative(ROOT, path.join(tmp, 'rogue.ts')));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('the guard admits the role alone, through seven reviewed doors the server calls', () => {
    expect(routeWriterFindings(sql, allowlist, callers)).toEqual([]);
    const doors = [...sql.matchAll(DOOR_DEF)].map((m) => m[1]).filter((d) => /SECURITY DEFINER/.test(functionBody(sql, d) ?? ''));
    expect(doors.sort()).toEqual([
      'review_route_cancel_member', 'review_route_enlist_member', 'review_route_open_step', 'review_route_reassign_member',
      'review_route_record_signature', 'review_route_restep_approver', 'review_route_stamp_act',
    ]);
  });

  it.each([
    ['a guard that reads the setting again', (s: string) => s.replace(
      "IF current_user = 'review_route_writer' THEN",
      "IF current_setting('c2c.review_route_writer', true) = 'on' THEN"), ['GUARD_READS_A_SETTING', 'GUARD_NOT_ON_THE_ROLE']],
    ['a guard that also admits the setting', (s: string) => s.replace(
      "IF current_user = 'review_route_writer' THEN",
      "IF current_user = 'review_route_writer' OR current_setting('c2c.review_route_writer', true) = 'on' THEN"),
    ['GUARD_READS_A_SETTING', 'GUARD_NOT_ON_THE_ROLE']],
    ['a role that can log in', (s: string) => s.replace('CREATE ROLE review_route_writer\n      NOLOGIN', 'CREATE ROLE review_route_writer\n      LOGIN'),
      ['ROLE_NOT_NOLOGIN_NOINHERIT']],
    ['the role granted to the runtime role', (s: string) => s.replace('GRANT USAGE ON SCHEMA public TO review_route_writer;',
      'GRANT USAGE ON SCHEMA public TO review_route_writer;\n  GRANT review_route_writer TO app_service;'), ['ROLE_GRANTED_TO_RUNTIME']],
    ['a door with no pinned search_path', (s: string) => s.replace(
      /(FUNCTION public\.review_route_cancel_member\([^)]*\)[\s\S]*?SECURITY DEFINER\n)SET search_path = pg_catalog, public\n/, '$1'),
    ['SEARCH_PATH_UNPINNED:review_route_cancel_member']],
  ])('fails on %s (the gate seen failing)', (_name, mutate, expected) => {
    const mutant = mutate(sql);
    expect(mutant).not.toBe(sql);
    expect(routeWriterFindings(mutant, allowlist, callers)).toEqual(expect.arrayContaining(expected));
  });

  it('fails on an unreviewed door, and on a call to a door that does not exist', () => {
    const rest = Object.fromEntries(Object.entries(allowlist).filter(([k]) => k !== 'public.review_route_open_step(p_org integer, p_route uuid, p_task_id text)'));
    expect(routeWriterFindings(sql, rest, callers)).toContain('NOT_REVIEWED:review_route_open_step');
    expect(routeWriterFindings(sql, allowlist, [...callers, "q.query('SELECT public.review_route_force_close($1)')"]))
      .toContain('CALLED_NOT_A_DOOR:review_route_force_close');
  });
});
