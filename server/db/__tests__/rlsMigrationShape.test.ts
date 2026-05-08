import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RLS_ALLOWLIST } from '../rlsAllowlist';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const enableSql = fs.readFileSync(
  path.join(repoRoot, 'migrations', '0021_enable_rls_everywhere.sql'),
  'utf8'
);
const rollbackSql = fs.readFileSync(
  path.join(repoRoot, 'scripts', 'db-rollback', '0021_disable_rls_everywhere.sql'),
  'utf8'
);
const coerceSql = fs.readFileSync(
  path.join(repoRoot, 'migrations', '0020_coerce_text_tenant_columns.sql'),
  'utf8'
);

describe('0021_enable_rls_everywhere.sql shape', () => {
  it('uses FORCE ROW LEVEL SECURITY (Neon: app role IS the owner)', () => {
    expect(enableSql).toMatch(/FORCE ROW LEVEL SECURITY/i);
  });

  it('includes a shadow-mode bypass clause keyed on app.rls_enforce', () => {
    expect(enableSql).toContain("current_setting('app.rls_enforce', TRUE)");
    expect(enableSql).toMatch(/IS DISTINCT FROM 'on'/);
  });

  it('OR-matches both session-var names (current_tenant_id, current_org_id)', () => {
    expect(enableSql).toMatch(/current_setting\(\s*'app\.current_tenant_id'\s*,\s*TRUE\s*\)/);
    expect(enableSql).toMatch(/current_setting\(\s*'app\.current_org_id'\s*,\s*TRUE\s*\)/);
  });

  it('honors the super-admin escape hatch via app.current_user_role', () => {
    expect(enableSql).toContain("current_setting('app.current_user_role', TRUE)");
    expect(enableSql).toContain("'app_super_admin'");
  });

  it('embeds the RLS allowlist (TS and SQL must agree)', () => {
    for (const t of RLS_ALLOWLIST) {
      expect(enableSql, `migration must list ${t}`).toContain(`'${t}'`);
    }
  });

  it('aborts loud on residual TEXT tenant columns (forces 0020 to run first)', () => {
    expect(enableSql).toMatch(/RAISE EXCEPTION[^;]*0020_coerce_text_tenant_columns/);
  });

  it('targets the canonical column names only', () => {
    expect(enableSql).toMatch(/IN\s*\(\s*'organization_id',\s*'org_id',\s*'tenant_id'\s*\)/);
  });

  it('wraps the whole thing in a single transaction', () => {
    // Strip leading SQL comments to find the first executable statement.
    const stripComments = (s: string) =>
      s
        .split('\n')
        .filter(line => !/^\s*--/.test(line) && line.trim() !== '')
        .join('\n');
    const exec = stripComments(enableSql).trim();
    expect(exec.startsWith('BEGIN;')).toBe(true);
    expect(exec.endsWith('COMMIT;')).toBe(true);
  });
});

describe('rollback companion', () => {
  it('drops the same policy name the enable migration creates', () => {
    expect(enableSql).toContain("'tenant_isolation_policy'");
    expect(rollbackSql).toContain("'tenant_isolation_policy'");
  });

  it('lives outside migrations/ so the runner does not auto-apply it', () => {
    const stray = fs.existsSync(
      path.join(repoRoot, 'migrations', '0021_disable_rls_everywhere_rollback.sql')
    );
    expect(stray, 'rollback must NOT live next to the enable migration').toBe(false);
  });

  it('disables both ENABLE and FORCE row-level security', () => {
    expect(rollbackSql).toMatch(/NO FORCE ROW LEVEL SECURITY/i);
    expect(rollbackSql).toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });
});

describe('0020_coerce_text_tenant_columns.sql shape', () => {
  it('aborts with a useful message before mutating schema', () => {
    expect(coerceSql).toMatch(/RAISE EXCEPTION/);
    expect(coerceSql).toMatch(/non-numeric/i);
  });

  it('lists every column the audit migration surfaced', () => {
    const expected = [
      ['gap_analysis_results', 'organization_id'],
      ['cmc_projects', 'organization_id'],
      ['workflow_templates', 'organization_id'],
      ['multi_agency_validation_sessions', 'tenant_id'],
    ];
    for (const [tbl, col] of expected) {
      expect(coerceSql, `${tbl}.${col} missing`).toContain(`'${tbl}'`);
      expect(coerceSql, `${tbl}.${col} missing`).toContain(`'${col}'`);
    }
  });

  it('uses USING column::integer to drive the type cast', () => {
    expect(coerceSql).toMatch(/TYPE integer USING/);
  });
});
