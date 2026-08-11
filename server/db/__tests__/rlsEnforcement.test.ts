import { describe, it, expect } from 'vitest';
import {
  buildRlsStartupOptions,
  isExplicitEnforcementDecision,
  readEnforcementMode,
  assertRlsEnforcementForProduction,
} from '../rlsEnforcement';

describe('readEnforcementMode', () => {
  it('returns off by default', () => {
    expect(readEnforcementMode({})).toBe('off');
    expect(readEnforcementMode({ RLS_ENFORCE: '' })).toBe('off');
  });

  it('reads on for the canonical value', () => {
    expect(readEnforcementMode({ RLS_ENFORCE: 'on' })).toBe('on');
  });

  it('accepts common truthy aliases', () => {
    for (const v of ['ON', 'enforce', 'true', '1']) {
      expect(readEnforcementMode({ RLS_ENFORCE: v })).toBe('on');
    }
  });

  it('reads shadow as a distinct mode (still no-op)', () => {
    expect(readEnforcementMode({ RLS_ENFORCE: 'shadow' })).toBe('shadow');
  });

  it('treats unknown values as off', () => {
    expect(readEnforcementMode({ RLS_ENFORCE: 'maybe' })).toBe('off');
  });
});

describe('isExplicitEnforcementDecision', () => {
  it('recognizes every accepted on/shadow/off token', () => {
    for (const v of ['on', 'enforce', 'true', '1', 'shadow', 'off', 'false', '0', 'OFF', ' on ']) {
      expect(isExplicitEnforcementDecision({ RLS_ENFORCE: v })).toBe(true);
    }
  });

  it('rejects unset, blank, and unrecognized values', () => {
    expect(isExplicitEnforcementDecision({})).toBe(false);
    expect(isExplicitEnforcementDecision({ RLS_ENFORCE: '' })).toBe(false);
    expect(isExplicitEnforcementDecision({ RLS_ENFORCE: '  ' })).toBe(false);
    expect(isExplicitEnforcementDecision({ RLS_ENFORCE: 'maybe' })).toBe(false);
    expect(isExplicitEnforcementDecision({ RLS_ENFORCE: 'onn' })).toBe(false);
  });
});

describe('assertRlsEnforcementForProduction', () => {
  it('is a no-op (returns mode) outside production, even when unset', () => {
    expect(assertRlsEnforcementForProduction({ NODE_ENV: 'development' })).toBe('off');
    expect(assertRlsEnforcementForProduction({ NODE_ENV: 'test', RLS_ENFORCE: 'shadow' })).toBe(
      'shadow'
    );
    expect(assertRlsEnforcementForProduction({ NODE_ENV: 'staging' })).toBe('off');
    expect(assertRlsEnforcementForProduction({})).toBe('off');
  });

  it('returns "on" without warning when enforced in production', () => {
    expect(assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_ENFORCE: 'on' })).toBe(
      'on'
    );
  });

  it.each(['enforce', 'true', '1'])(
    'rejects the non-canonical on alias %s in production',
    alias => {
      expect(() =>
        assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_ENFORCE: alias })
      ).toThrow(/Set RLS_ENFORCE=on/);
    }
  );

  it('refuses to boot in production when RLS_ENFORCE is unset (no silent default)', () => {
    expect(() => assertRlsEnforcementForProduction({ NODE_ENV: 'production' })).toThrow(
      /REFUSING TO BOOT.*RLS_ENFORCE is not set/s
    );
    expect(() =>
      assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_ENFORCE: '' })
    ).toThrow(/REFUSING TO BOOT/);
  });

  it('refuses to boot in production on an unrecognized value', () => {
    expect(() =>
      assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_ENFORCE: 'onn' })
    ).toThrow(/set to "onn"/);
  });

  it('boot-failure message identifies on as the only production mode', () => {
    try {
      assertRlsEnforcementForProduction({ NODE_ENV: 'production' });
      throw new Error('expected throw');
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toContain('RLS_ENFORCE=on');
      expect(msg).toContain('off and shadow modes are restricted');
    }
  });

  it('fails closed when RLS is explicitly off in production', () => {
    expect(() =>
      assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_ENFORCE: 'off' })
    ).toThrow(/FAIL-CLOSED/);
  });

  it('fails closed when RLS is explicitly shadow in production', () => {
    expect(() =>
      assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_ENFORCE: 'shadow' })
    ).toThrow(/FAIL-CLOSED/);
  });

  it('hard-fails in production when RLS_REQUIRE_ENFORCE=true and RLS is not on', () => {
    // The legacy flag is no longer required, but must not weaken the strict gate.
    expect(() =>
      assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_REQUIRE_ENFORCE: 'true' })
    ).toThrow(/FAIL-CLOSED/);
    // Explicit off remains blocked.
    expect(() =>
      assertRlsEnforcementForProduction({
        NODE_ENV: 'production',
        RLS_ENFORCE: 'off',
        RLS_REQUIRE_ENFORCE: 'true',
      })
    ).toThrow(/FAIL-CLOSED/);
    // Shadow remains blocked.
    expect(() =>
      assertRlsEnforcementForProduction({
        NODE_ENV: 'production',
        RLS_ENFORCE: 'shadow',
        RLS_REQUIRE_ENFORCE: 'true',
      })
    ).toThrow(/FAIL-CLOSED/);
  });

  it('RLS_REQUIRE_ENFORCE=true passes when RLS is on', () => {
    expect(
      assertRlsEnforcementForProduction({
        NODE_ENV: 'production',
        RLS_ENFORCE: 'on',
        RLS_REQUIRE_ENFORCE: 'true',
      })
    ).toBe('on');
  });
});

describe('buildRlsStartupOptions', () => {
  it('places active enforcement in the PostgreSQL startup packet', () => {
    expect(buildRlsStartupOptions({ NODE_ENV: 'production', RLS_ENFORCE: 'on' })).toBe(
      '-c app.rls_enforce=on',
    );
  });

  it('preserves existing PGOPTIONS while appending enforcement', () => {
    expect(
      buildRlsStartupOptions(
        { NODE_ENV: 'production', RLS_ENFORCE: 'on' },
        '-c statement_timeout=30000',
      ),
    ).toBe('-c statement_timeout=30000 -c app.rls_enforce=on');
  });

  it('does not add an inert setting outside production', () => {
    expect(buildRlsStartupOptions({ NODE_ENV: 'test' })).toBeUndefined();
  });

  it('fails before pool construction for an inert production mode', () => {
    expect(() =>
      buildRlsStartupOptions({ NODE_ENV: 'production', RLS_ENFORCE: 'shadow' }),
    ).toThrow(/FAIL-CLOSED/);
  });
});

describe('RLS catalog posture', () => {
  function posturePool(role: Record<string, unknown>, tables: Array<Record<string, unknown>>) {
    return { query: async (sql: string) => ({ rows: sql.includes('pg_roles') ? [role] : tables }) } as any;
  }

  it('accepts a non-bypass role when every tenant table is forced and governed', async () => {
    const { assertRlsCatalogPosture } = await import('../rlsEnforcement');
    const report = await assertRlsCatalogPosture(posturePool(
      { role: 'concept2cure_app', rolsuper: false, rolbypassrls: false },
      [{ table_name: 'projects', relrowsecurity: true, relforcerowsecurity: true, policy_count: 1 }],
    ));
    expect(report.failures).toEqual([]);
  });

  it('fails closed for superuser, BYPASSRLS, missing FORCE, or missing policy', async () => {
    const { assertRlsCatalogPosture } = await import('../rlsEnforcement');
    await expect(assertRlsCatalogPosture(posturePool(
      { role: 'postgres', rolsuper: true, rolbypassrls: true },
      [{ table_name: 'projects', relrowsecurity: true, relforcerowsecurity: false, policy_count: 0 }],
    ))).rejects.toThrow(/BYPASSRLS.*FORCE ROW LEVEL SECURITY.*no RLS policy/s);
  });

  it('fails closed when no tenant-keyed table is discovered', async () => {
    const { assertRlsCatalogPosture } = await import('../rlsEnforcement');
    await expect(assertRlsCatalogPosture(posturePool(
      { role: 'app', rolsuper: false, rolbypassrls: false }, [],
    ))).rejects.toThrow(/no tenant-keyed public tables/);
  });

  it('does NOT flag an allowlisted tenant table that is intentionally unpolicied', async () => {
    const { assessRlsCatalogPosture } = await import('../rlsEnforcement');
    const { RLS_ALLOWLIST } = await import('../rlsAllowlist');
    // Every allowlisted table, present with a tenant column but no RLS/policy —
    // exactly the state the install/deploy sweeps leave them in — must produce
    // zero failures, or a non-superuser production boot fails closed on tables
    // the rest of the system deliberately leaves unpoliced.
    const allowlistedRows = RLS_ALLOWLIST.map(name => ({
      table_name: name, relrowsecurity: false, relforcerowsecurity: false, policy_count: 0,
    }));
    const report = await assessRlsCatalogPosture(posturePool(
      { role: 'app_service', rolsuper: false, rolbypassrls: false },
      [
        ...allowlistedRows,
        { table_name: 'projects', relrowsecurity: true, relforcerowsecurity: true, policy_count: 1 },
      ],
    ));
    expect(report.failures).toEqual([]);
  });

  it('still flags a NON-allowlisted tenant table that is unpolicied', async () => {
    const { assessRlsCatalogPosture } = await import('../rlsEnforcement');
    const report = await assessRlsCatalogPosture(posturePool(
      { role: 'app_service', rolsuper: false, rolbypassrls: false },
      [{ table_name: 'not_allowlisted_tbl', relrowsecurity: false, relforcerowsecurity: false, policy_count: 0 }],
    ));
    expect(report.failures.some(f => f.startsWith('not_allowlisted_tbl:'))).toBe(true);
  });
});
