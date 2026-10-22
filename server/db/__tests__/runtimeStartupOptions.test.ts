/**
 * The runtime pool opens every connection with JIT off, beside RLS enforcement
 * (MR-02, 2026-10-22). The searches built from the data-eligibility fragments
 * spent 20–30 s JIT-compiling a ~92 KB statement against a 30 s timeout;
 * tests/db/atom-search.dbtest.ts and retrieval-floor.dbtest.ts timed out on it.
 */
import { describe, expect, it } from 'vitest';
import { buildRuntimeStartupOptions, RUNTIME_PLANNER_OPTIONS } from '../runtimeStartupOptions';

describe('buildRuntimeStartupOptions', () => {
  it('turns JIT off and keeps RLS enforcement when it is on', () => {
    expect(buildRuntimeStartupOptions({ RLS_ENFORCE: 'on', NODE_ENV: 'test' } as NodeJS.ProcessEnv))
      .toBe('-c app.rls_enforce=on -c jit=off');
  });

  it('turns JIT off when RLS enforcement is not set, and keeps PGOPTIONS first', () => {
    expect(buildRuntimeStartupOptions({ NODE_ENV: 'test' } as NodeJS.ProcessEnv, '-c statement_timeout=5000'))
      .toBe('-c statement_timeout=5000 -c jit=off');
    expect(RUNTIME_PLANNER_OPTIONS).toBe('-c jit=off');
  });
});
