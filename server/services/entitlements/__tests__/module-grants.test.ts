/**
 * The canonical module-grant writer.
 *
 * ── The defect this pins against ─────────────────────────────────────────────
 *
 * `expiresAt` is a REQUIRED parameter, and the reason is a specific silent
 * no-op. If the writer carried an existing expiry forward when a caller did not
 * mention one, then turning a module back on for an organization whose trial
 * had lapsed would write `enabled = true` onto a row still holding a past date.
 * The grant would be instantly expired, resolution would fall through to tier
 * as if nothing had been written, and the operator would be told the change
 * succeeded. Nothing about the screen would show that it had not.
 *
 * The mirror defect is a `null` default, which would quietly convert a live
 * trial into a perpetual grant — a commercial giveaway by omission.
 *
 * So the tests below assert on the SQL parameters, not just the return value:
 * what matters is that the statement always states an expiry, in both
 * directions, and that a revocation never carries a dangling end date.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock('../../../db', () => ({ query: dbQuery }));

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { writeModuleGrant } from '../module-grants';

const ROW = {
  organization_id: 1,
  module_id: 'pv-cockpit',
  enabled: true,
  expires_at: null,
  updated_at: '2026-08-24T00:00:00.000Z',
};

/** The parameter array the statement was actually called with. */
const params = () => dbQuery.mock.calls[0][1] as unknown[];

beforeEach(() => {
  dbQuery.mockReset();
  dbQuery.mockResolvedValue({ rows: [ROW] });
});

describe('writeModuleGrant', () => {
  it('writes a perpetual grant when the caller says perpetual', async () => {
    await writeModuleGrant({
      organizationId: 1,
      moduleId: 'pv-cockpit',
      enabled: true,
      actorEmail: 'owner@example.test',
      expiresAt: null,
    });
    expect(params()).toEqual([1, 'pv-cockpit', true, 'owner@example.test', null]);
  });

  it('writes the instant when the caller opens a trial', async () => {
    const until = '2026-09-23T00:00:00.000Z';
    await writeModuleGrant({
      organizationId: 1,
      moduleId: 'pv-cockpit',
      enabled: true,
      actorEmail: 'owner@example.test',
      expiresAt: until,
    });
    expect(params()[4]).toBe(until);
  });

  it('a REVOCATION never carries an end date, whatever the caller passed', async () => {
    // A revocation does not lapse. Leaving a date on an "off" row would mean a
    // revocation with an expiry — a different feature nobody has asked for, and
    // one that would read as "this comes back on by itself".
    await writeModuleGrant({
      organizationId: 1,
      moduleId: 'pv-cockpit',
      enabled: false,
      actorEmail: 'owner@example.test',
      expiresAt: '2026-09-23T00:00:00.000Z',
    });
    expect(params()[2]).toBe(false);
    expect(params()[4]).toBeNull();
  });

  it('assigns expires_at from the statement, never from the existing row', async () => {
    await writeModuleGrant({
      organizationId: 1,
      moduleId: 'pv-cockpit',
      enabled: true,
      actorEmail: null,
      expiresAt: null,
    });
    const sql = String(dbQuery.mock.calls[0][0]);
    // The whole point: on conflict the column takes the NEW value, including
    // NULL. `module_subscriptions.expires_at` on the right-hand side would be
    // the carry-forward that produces the instantly-expired grant.
    expect(sql).toMatch(/expires_at = EXCLUDED\.expires_at/);
    expect(sql).not.toMatch(/expires_at = module_subscriptions\.expires_at/);
  });

  it('returns the row as written, so a caller reports what is stored', async () => {
    const out = await writeModuleGrant({
      organizationId: 1,
      moduleId: 'pv-cockpit',
      enabled: true,
      actorEmail: null,
      expiresAt: null,
    });
    expect(out).toEqual(ROW);
  });
});

describe('there is exactly one place this row is written', () => {
  it('no other server module upserts module_subscriptions', () => {
    /* The header claims this is the one canonical writer. That claim was FALSE
       when the module was first extracted — three other inline upserts existed
       (the customer-facing toggle, billing's tier provisioning, and the
       master-admin toggle), none of which touched `expires_at`, so each one
       could write `enabled = true` onto a row still holding a lapsed trial's
       past date and report success for a grant that resolved to nothing.

       A comment asserting a property nothing checks is a comment that goes
       stale the first time somebody adds a fourth copy. This checks it. */
    const files = execSync("git ls-files 'server/**/*.ts'", {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
      .split('\n')
      .filter(Boolean)
      .filter((f) => !/__tests__|\.test\.ts$/.test(f));

    const writers = files.filter((f) =>
      /INSERT\s+INTO\s+module_subscriptions/i.test(readFileSync(f, 'utf8')),
    );

    expect(writers).toEqual(['server/services/entitlements/module-grants.ts']);
  });
});
