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

/**
 * Three catalog queries now, so the stub must route by which one is asked:
 * the role probe, the public tenant-table probe, and the owner-exemption
 * probe. Routing by `tenant_tables` rather than by call order, because a
 * stub that answers every query with the same rows silently fed the
 * tenant-table fixture to the owner-exemption check and invented findings.
 */
function posturePool(
  role: Record<string, unknown>,
  tables: Array<Record<string, unknown>>,
  ownerExempt: Array<Record<string, unknown>> = [],
) {
  return {
    query: async (sql: string) => {
      if (sql.includes('pg_roles')) return { rows: [role] };
      if (sql.includes('tenant_tables')) return { rows: tables };
      return { rows: ownerExempt };
    },
  } as any;
}

describe('RLS catalog posture', () => {
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
});

describe('RLS catalog posture', () => {
  /**
   * The owner exemption. Postgres exempts a table's OWNER from its own policies
   * unless FORCE ROW LEVEL SECURITY is set, so an RLS-enabled, policied,
   * non-FORCE table owned by the runtime role is readable across tenants and
   * its policy never runs.
   *
   * Nothing checked this. The tenant-table probe above reads `public` alone,
   * and the product's Part 11 core is outside it — vault.documents,
   * identity.users, signing.signatures, evidence.hash_ledger. Measured on the
   * reference database before the fix: 117 such tables across 16 schemas, every
   * one owned by the runtime role, and the assessment returned ZERO failures.
   * Demonstrated end to end there too — two organisations' rows in one policied
   * owner-owned non-FORCE table, a session with app.rls_enforce=on and
   * app.current_org_id=1, and the session read both.
   */
  it('fails closed when the runtime role owns an RLS-enabled table that is not FORCEd', async () => {
    const { assertRlsCatalogPosture } = await import('../rlsEnforcement');

    await expect(assertRlsCatalogPosture(posturePool(
      { role: 'c2c', rolsuper: false, rolbypassrls: false },
      // Everything the OLD assessment looked at is in good order...
      [{ table_name: 'projects', relrowsecurity: true, relforcerowsecurity: true, policy_count: 1 }],
      // ...and the Part 11 core is wide open.
      [
        { schema_name: 'vault', table_name: 'documents', owner: 'c2c', policy_count: 4 },
        { schema_name: 'identity', table_name: 'users', owner: 'c2c', policy_count: 2 },
        { schema_name: 'signing', table_name: 'signatures', owner: 'c2c', policy_count: 1 },
      ],
    ))).rejects.toThrow(/OWNS 3 RLS-enabled table\(s\) that are not FORCE ROW LEVEL SECURITY/);
  });

  it('names the remedy in the refusal, both halves of it', async () => {
    const { assessRlsCatalogPosture } = await import('../rlsEnforcement');

    const report = await assessRlsCatalogPosture(posturePool(
      { role: 'c2c', rolsuper: false, rolbypassrls: false },
      [{ table_name: 'projects', relrowsecurity: true, relforcerowsecurity: true, policy_count: 1 }],
      [{ schema_name: 'vault', table_name: 'documents', owner: 'c2c', policy_count: 4 }],
    ));

    // An operator reading a boot refusal needs the fix, not just the fault.
    expect(report.failures[0]).toMatch(/APP_SERVICE_DB_PASSWORD/);
    expect(report.failures[0]).toMatch(/APP_DATABASE_URL/);
    expect(report.failures[0]).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(report.failures[0]).toMatch(/vault\.documents/);
  });

  it('reports the exemption as ONE failure, however many tables are open', async () => {
    // 117 separate boot errors is a boot error nobody reads, and the remedy is
    // the same sentence for every table. The full list stays on the report.
    const { assessRlsCatalogPosture } = await import('../rlsEnforcement');

    const many = Array.from({ length: 30 }, (_, i) => ({
      schema_name: 'cortex', table_name: `t${i}`, owner: 'c2c', policy_count: 1,
    }));
    const report = await assessRlsCatalogPosture(posturePool(
      { role: 'c2c', rolsuper: false, rolbypassrls: false },
      [{ table_name: 'projects', relrowsecurity: true, relforcerowsecurity: true, policy_count: 1 }],
      many,
    ));

    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatch(/\+25 more/);
    expect(report.ownerExempt).toHaveLength(30);
  });

  it('PASSES in the production posture: the runtime role owns none of them', async () => {
    // The other direction, and the one that matters for not bricking a correct
    // deployment. Running as the non-owner app role, the catalog query matches
    // nothing, so the new check contributes no failure at all.
    const { assertRlsCatalogPosture } = await import('../rlsEnforcement');

    const report = await assertRlsCatalogPosture(posturePool(
      { role: 'app_service', rolsuper: false, rolbypassrls: false },
      [{ table_name: 'projects', relrowsecurity: true, relforcerowsecurity: true, policy_count: 1 }],
      [],
    ));

    expect(report.failures).toEqual([]);
    expect(report.ownerExempt).toEqual([]);
  });

  it('does not double-report an allowlisted public table through the new check', async () => {
    // The allowlist names tables deliberately left unpolicied. The tenant-table
    // loop already skips them; the owner-exemption check must skip them too, or
    // a deliberate exception becomes a boot refusal by a different route.
    const { assessRlsCatalogPosture } = await import('../rlsEnforcement');
    const { RLS_ALLOWLIST } = await import('../rlsAllowlist');
    const allowlisted = RLS_ALLOWLIST[0];

    const report = await assessRlsCatalogPosture(posturePool(
      { role: 'c2c', rolsuper: false, rolbypassrls: false },
      [{ table_name: 'projects', relrowsecurity: true, relforcerowsecurity: true, policy_count: 1 }],
      [{ schema_name: 'public', table_name: allowlisted, owner: 'c2c', policy_count: 1 }],
    ));

    expect(report.ownerExempt).toEqual([]);
    expect(report.failures).toEqual([]);
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
