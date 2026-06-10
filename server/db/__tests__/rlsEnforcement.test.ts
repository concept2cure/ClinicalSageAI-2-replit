import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  installRlsEnforcement,
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

describe('assertRlsEnforcementForProduction', () => {
  it('is a no-op (returns mode) outside production', () => {
    expect(assertRlsEnforcementForProduction({ NODE_ENV: 'development' })).toBe('off');
    expect(assertRlsEnforcementForProduction({ NODE_ENV: 'test', RLS_ENFORCE: 'shadow' })).toBe(
      'shadow'
    );
  });

  it('returns "on" without warning when enforced in production', () => {
    expect(assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_ENFORCE: 'on' })).toBe(
      'on'
    );
  });

  it('warns but does not throw when RLS is off in production (default)', () => {
    expect(() =>
      assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_ENFORCE: 'off' })
    ).not.toThrow();
  });

  it('hard-fails in production when RLS_REQUIRE_ENFORCE=true and RLS is off', () => {
    expect(() =>
      assertRlsEnforcementForProduction({ NODE_ENV: 'production', RLS_REQUIRE_ENFORCE: 'true' })
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
