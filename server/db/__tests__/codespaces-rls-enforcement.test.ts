import { describe, expect, it } from 'vitest';
import {
  assertRlsEnforcementForProduction,
  buildRlsStartupOptions,
} from '../rlsEnforcement';

describe('Codespaces regulated runtime enforces tenant RLS', () => {
  it.each([undefined, '', 'off', 'shadow', 'false', 'true', '1', 'enforce'])(
    'refuses RLS_ENFORCE=%s in the Codespace even with NODE_ENV=development',
    value => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'development',
        C2C_CODESPACE: '1',
      };
      if (value !== undefined) env.RLS_ENFORCE = value;
      expect(() => assertRlsEnforcementForProduction(env))
        .toThrow(/REFUSING TO BOOT.*Codespaces/);
    },
  );

  it('passes only the canonical on value and sets policy enforcement in the PG startup packet', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'development', C2C_CODESPACE: '1', RLS_ENFORCE: 'on',
    };
    expect(assertRlsEnforcementForProduction(env)).toBe('on');
    expect(buildRlsStartupOptions(env, '-c jit=off')).toContain('-c app.rls_enforce=on');
  });

  it('honors GitHub native CODESPACES=true even when the app marker is absent', () => {
    expect(() => assertRlsEnforcementForProduction({
      NODE_ENV: 'development', CODESPACES: 'true', RLS_ENFORCE: 'off',
    })).toThrow(/Codespaces/);
  });

  it('retains explicit local development and test shadow-mode compatibility', () => {
    expect(assertRlsEnforcementForProduction({
      NODE_ENV: 'test', RLS_ENFORCE: 'shadow',
    })).toBe('shadow');
    expect(assertRlsEnforcementForProduction({
      NODE_ENV: 'development',
    })).toBe('off');
  });

  it('does not weaken the independent production RLS gate', () => {
    expect(() => assertRlsEnforcementForProduction({
      NODE_ENV: 'production', RLS_ENFORCE: 'off',
    })).toThrow(/production/);
  });
});
