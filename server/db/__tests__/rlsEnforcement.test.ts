import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  installRlsEnforcement,
  isExplicitEnforcementDecision,
  readEnforcementMode,
  assertRlsEnforcementForProduction,
} from '../rlsEnforcement';

class FakePool extends EventEmitter {
  query = vi.fn(() => Promise.resolve({ rows: [], rowCount: 0 }));
}

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

  it('refuses to boot in production when RLS_ENFORCE is unset (no silent default)', () => {
    expect(() => assertRlsEnforcementForProduction({ NODE_ENV: 'production' })).toThrow(
      /REFUSING TO BOOT.*RLS_ENFORCE is not set/s
    );
    expect(() =>
      assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_ENFORCE: '' })
    ).toThrow(/REFUSING TO BOOT/);
  });

  it('refuses to boot in production on an unrecognized value (typo is not a decision)', () => {
    expect(() =>
      assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_ENFORCE: 'onn' })
    ).toThrow(/unrecognized value "onn"/);
  });

  it('boot-failure message names all accepted operator decisions', () => {
    try {
      assertRlsEnforcementForProduction({ NODE_ENV: 'production' });
      throw new Error('expected throw');
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toContain('RLS_ENFORCE=on');
      expect(msg).toContain('RLS_ENFORCE=shadow');
      expect(msg).toContain('RLS_ENFORCE=off');
    }
  });

  it('warns but does not throw when RLS is EXPLICITLY off in production', () => {
    expect(() =>
      assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_ENFORCE: 'off' })
    ).not.toThrow();
    expect(assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_ENFORCE: 'off' })).toBe(
      'off'
    );
  });

  it('warns but does not throw when RLS is EXPLICITLY shadow in production', () => {
    expect(
      assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_ENFORCE: 'shadow' })
    ).toBe('shadow');
  });

  it('hard-fails in production when RLS_REQUIRE_ENFORCE=true and RLS is not on', () => {
    // Unset keeps the FAIL-CLOSED message under the opt-in flag.
    expect(() =>
      assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_REQUIRE_ENFORCE: 'true' })
    ).toThrow(/FAIL-CLOSED/);
    // Explicit off is still "not on" → blocked under the opt-in flag.
    expect(() =>
      assertRlsEnforcementForProduction({
        NODE_ENV: 'production',
        RLS_ENFORCE: 'off',
        RLS_REQUIRE_ENFORCE: 'true',
      })
    ).toThrow(/FAIL-CLOSED/);
    // shadow is still "not on" → also blocked under the opt-in flag.
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

describe('installRlsEnforcement', () => {
  it('sets app.rls_enforce to "on" on connect when RLS_ENFORCE=on', async () => {
    process.env.RLS_ENFORCE = 'on';
    const pool = new FakePool();
    installRlsEnforcement(pool as unknown as any);

    const fakeClient = { query: vi.fn(() => Promise.resolve({ rows: [], rowCount: 0 })) };
    pool.emit('connect', fakeClient);

    // Defer to next tick so the listener's promise has a chance to invoke.
    await Promise.resolve();

    expect(fakeClient.query).toHaveBeenCalledWith(
      "SELECT set_config('app.rls_enforce', $1, false)",
      ['on']
    );
    delete process.env.RLS_ENFORCE;
  });

  it('sets app.rls_enforce to "" (no-op) when RLS_ENFORCE is unset', async () => {
    delete process.env.RLS_ENFORCE;
    const pool = new FakePool();
    installRlsEnforcement(pool as unknown as any);

    const fakeClient = { query: vi.fn(() => Promise.resolve({ rows: [], rowCount: 0 })) };
    pool.emit('connect', fakeClient);
    await Promise.resolve();

    expect(fakeClient.query).toHaveBeenCalledWith(
      "SELECT set_config('app.rls_enforce', $1, false)",
      ['']
    );
  });

  it('is idempotent — second install adds no second listener', () => {
    const pool = new FakePool();
    installRlsEnforcement(pool as unknown as any);
    installRlsEnforcement(pool as unknown as any);
    expect(pool.listenerCount('connect')).toBe(1);
  });
});
