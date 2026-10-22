/**
 * endEverySessionOf — sign out everywhere — stops the person's live AnA runs
 * too, on every device (AnA detach DT3, design §2.9), and says what ended
 * them (the cause and who, ana_runs.stopped_detail). A SCIM deactivation or a
 * member's removal stops them in that organisation, keyed on it; one
 * session's sign-out stops that session's runs only (DT3 review).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ rowCount: 1, calls: [] as Array<{ text: string; params?: unknown[] }> }));
vi.mock('../../db.js', () => ({
  pool: {
    query: async (text: string, params?: unknown[]) => {
      db.calls.push({ text, params });
      return /UPDATE ana_runs/.test(text) ? { rows: [], rowCount: 0 } : { rows: [], rowCount: db.rowCount };
    },
  },
}));

import { endEverySessionOf, stopPersonsRuns } from '../account-standing';

const runStops = () => db.calls.filter(c => /UPDATE ana_runs/.test(c.text));

beforeEach(() => {
  db.calls = [];
  db.rowCount = 1;
});

describe('endEverySessionOf', () => {
  it("stops the account's live runs in every organisation, with session_ended", async () => {
    expect(await endEverySessionOf(7)).toBe(true);
    expect(runStops().map(c => c.params)).toEqual([
      [7, null, 'session_ended', JSON.stringify({ cause: 'sign_out_everywhere', byUserId: 7 })],
    ]);
    // A person's stop across organisations is keyed on the person, never on
    // an optional organisation predicate (ci:tenant-isolation, INF-39).
    expect(runStops()[0].text).toMatch(/WHERE user_id = \$1/);
    expect(runStops()[0].text).not.toMatch(/IS NULL OR organization_id/);
  });

  it('an account that was not there stops nothing', async () => {
    db.rowCount = 0;
    expect(await endEverySessionOf(7)).toBe(false);
    expect(runStops()).toEqual([]);
  });
});

describe('stopPersonsRuns', () => {
  it('in one organisation, for a deprovisioning there: keyed on that organisation', async () => {
    await stopPersonsRuns(7, { cause: 'deprovisioned', byUserId: null }, { organizationId: 3 });
    expect(runStops().map(c => c.params)).toEqual([
      [3, 7, null, 'session_ended', JSON.stringify({ cause: 'deprovisioned', byUserId: null })],
    ]);
    expect(runStops()[0].text).toMatch(/WHERE organization_id = \$1/);
  });

  it("one session's sign-out: that session's runs only", async () => {
    await stopPersonsRuns(7, { cause: 'sign_out', byUserId: 7 }, { sessionId: 'sid-desk' });
    expect(runStops().map(c => c.params)).toEqual([[7, 'sid-desk', 'session_ended', JSON.stringify({ cause: 'sign_out', byUserId: 7 })]]);
  });
});
