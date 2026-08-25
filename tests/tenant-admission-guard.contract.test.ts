/**
 * Security contract: a deployment cannot become multi-tenant while Postgres RLS
 * is not filtering rows.
 *
 * server/db/rlsEnforcement.ts settles the isolation posture at BOOT and
 * deliberately permits an explicit `RLS_ENFORCE=off`/`shadow` for staged
 * rollouts. That is defensible with ONE tenant — there is no second organization
 * for a missing row filter to leak to. It stops being defensible the moment a
 * second organization exists, and nothing noticed, because that happens long
 * after boot.
 *
 * The pilot go/no-go gate states the rule ("RLS_ENFORCE=on is REQUIRED before a
 * second organization is created — this gate turns HARD the moment one is"), but
 * a gate is a script a human runs before opening a pilot, not a control in the
 * running system. Six code paths can insert an organization; none consulted the
 * posture. These tests pin the predicate that now does.
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limiting system access to authorized
 *             individuals, across tenant boundaries.
 */

import { describe, it, expect } from 'vitest';
import { assertTenantIsolationBeforeNewOrg } from '../server/db/rlsEnforcement';

/** A deployed environment with RLS not filtering — the risky configuration. */
const deployedRlsOff = (mode = 'off') => ({ NODE_ENV: 'production', RLS_ENFORCE: mode });

describe('tenant admission — the founding organization is always allowed', () => {
  it.each([
    ['production, RLS off', deployedRlsOff()],
    ['production, RLS shadow', deployedRlsOff('shadow')],
    ['staging, RLS unset', { NODE_ENV: 'staging' }],
  ])('permits the first organization in %s', (_label, env) => {
    // A fresh deployment must be able to onboard its founding tenant without
    // operators having flipped RLS first — with one tenant there is nothing to
    // isolate from, and blocking it would make the product un-installable.
    expect(() => assertTenantIsolationBeforeNewOrg(0, env as NodeJS.ProcessEnv)).not.toThrow();
  });
});

describe('tenant admission — the SECOND organization requires enforcement', () => {
  it.each([
    ['off', 'off'],
    ['shadow', 'shadow'],
    ['unset', ''],
    ['a typo', 'enabled'],
  ])('refuses when RLS_ENFORCE is %s', (_label, mode) => {
    expect(() =>
      assertTenantIsolationBeforeNewOrg(1, { NODE_ENV: 'production', RLS_ENFORCE: mode } as NodeJS.ProcessEnv),
    ).toThrow(/refusing to create organization #2/i);
  });

  it('allows it once RLS_ENFORCE=on', () => {
    expect(() =>
      assertTenantIsolationBeforeNewOrg(1, { NODE_ENV: 'production', RLS_ENFORCE: 'on' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('keeps refusing at higher tenant counts, naming the right number', () => {
    expect(() => assertTenantIsolationBeforeNewOrg(11, deployedRlsOff() as NodeJS.ProcessEnv)).toThrow(
      /organization #12/,
    );
  });

  it('names the remedy, so the error is actionable without reading the source', () => {
    expect(() => assertTenantIsolationBeforeNewOrg(1, deployedRlsOff() as NodeJS.ProcessEnv)).toThrow(
      /Set RLS_ENFORCE=on/,
    );
  });
});

describe('tenant admission — enforcement scope follows the repo fail-closed idiom', () => {
  it.each([
    ['development', 'development'],
    ['test', 'test'],
  ])('no-ops in local %s so dev needs zero configuration', (_label, nodeEnv) => {
    expect(() =>
      assertTenantIsolationBeforeNewOrg(5, { NODE_ENV: nodeEnv, RLS_ENFORCE: 'off' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it.each([
    ['unset', undefined],
    ['blank', ''],
    ['staging', 'staging'],
    ['preview', 'preview'],
    ['Production (capitalised)', 'Production'],
  ])('enforces when NODE_ENV is %s — anything not explicitly local counts', (_label, nodeEnv) => {
    // The mirror of submission-gateways/bundle-namespace.ts#bundleTrustEnforced:
    // an environment that forgot to declare itself is treated as deployed, never
    // as somebody's laptop.
    const env = { RLS_ENFORCE: 'off' } as NodeJS.ProcessEnv;
    if (nodeEnv !== undefined) (env as Record<string, string>).NODE_ENV = nodeEnv;
    expect(() => assertTenantIsolationBeforeNewOrg(1, env)).toThrow(/FAIL-CLOSED/);
  });
});
