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
