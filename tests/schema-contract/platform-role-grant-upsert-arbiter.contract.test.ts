/** Static deployment relationship only. The separately retained native
 * read-only 42P10 observation establishes the actual missing-arbiter defect;
 * this suite does not claim SQL execution, RLS or grant/audit qualification. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = 'migrations/20260928_platform_role_grants_platform_writes.sql';
const migration = readFileSync(path.join(root, migrationPath), 'utf8');
const sql = migration.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const schema = readFileSync(path.join(root, 'shared/schema.ts'), 'utf8');
const writer = readFileSync(path.join(root, 'server/routes/admin/access-management.ts'), 'utf8');

describe('platform role grant canonical upsert arbiter deployment', () => {
  it('backs the existing writer identity with the existing schema index in the canonical replayed migration', () => {
    expect(schema).toMatch(/uniqueIndex\('platform_role_grants_user_role_idx'\)\.on\(table\.userId, table\.role\)/);
    expect(writer).toMatch(/ON CONFLICT\s*\(user_id, role\)\s*DO UPDATE/);
    expect(C2C_MIGRATION_FILES.filter(file => file === migrationPath)).toEqual([migrationPath]);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS platform_role_grants_user_role_idx\s+ON public\.platform_role_grants\s*\(user_id, role\)/);
    expect(sql.indexOf("IF to_regclass('public.platform_role_grants') IS NULL")).toBeLessThan(sql.indexOf('CREATE UNIQUE INDEX'));
    expect(sql.indexOf('CREATE UNIQUE INDEX')).toBeLessThan(sql.indexOf('ALTER TABLE public.platform_role_grants ENABLE ROW LEVEL SECURITY'));
  });
  it('verifies actual index identity rather than accepting any object with the canonical name', () => {
    expect(sql).toMatch(/i\.indexrelid\s*=\s*to_regclass\('public\.platform_role_grants_user_role_idx'\)/);
    expect(sql).toMatch(/i\.indrelid\s*=\s*'public\.platform_role_grants'::regclass/);
    for (const condition of [/i\.indisunique/, /i\.indisvalid/, /i\.indisready/, /i\.indimmediate/, /i\.indnkeyatts\s*=\s*2/, /i\.indnatts\s*=\s*2/,
      /i\.indpred IS NULL/, /i\.indexprs IS NULL/, /unnest\(i\.indkey\) WITH ORDINALITY/, /ORDER BY k\.ord/]) expect(sql).toMatch(condition);
    expect(sql).toMatch(/ARRAY\['user_id', 'role'\]/);
    expect(sql).toMatch(/RAISE EXCEPTION 'Platform role grant identity requires reconciliation;/);
  });
  it('preserves open reads and only the existing platform-scoped write policies', () => {
    expect(sql).toContain("current_setting('app.current_user_role', true) = 'app_super_admin'");
    expect(sql).toContain("('platform_role_grants_read',            'SELECT', '(true)',      NULL)");
    for (const [name, command] of [['insert', 'INSERT'], ['update', 'UPDATE'], ['delete', 'DELETE']]) {
      expect(sql).toMatch(new RegExp(`'platform_role_grants_platform_${name}'\\s*,\\s*'${command}'`));
    }
    expect(sql).toMatch(/ALTER TABLE public\.platform_role_grants FORCE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER POLICY %I ON public\.platform_role_grants/);
    expect(sql).toMatch(/CREATE POLICY %I ON public\.platform_role_grants/);
    expect(sql).not.toContain("= 'app_service'");
  });
  it('uses additive replay without repairing retained rows or dropping conflicting objects', () => {
    expect(sql).not.toMatch(/\bDROP\s+(?:INDEX|TABLE|CONSTRAINT|POLICY)\b/i);
    expect(sql).not.toMatch(/\b(?:INSERT INTO|DELETE FROM|UPDATE|TRUNCATE)\s+(?:public\.)?platform_role_grants\b/i);
    expect(sql).not.toMatch(/^\s*(?:GRANT|REVOKE)\b/im);
    expect(migration).toContain('2026-10-14 additive convergence correction');
  });
});
