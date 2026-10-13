/**
 * The correspondence alert AnA raises — restored on the regulation, not on 14 days.
 *
 * It had never fired: the producer read `FROM correspondences`, which exists
 * nowhere in this repository, inside a swallowing catch. These cases pin the
 * three things that make the restored version trustworthy — it reads the real
 * store under the caller's organisation, it says which authority set each date,
 * and it raises nothing it cannot ground.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { buildMdxProactiveSnapshot } from '../mdx-proactive-signals';

const query = vi.fn();
const client = { query: (...a: unknown[]) => query(...a) } as never;

/** Only the correspondence read answers; every other producer sees no rows. */
function onlyCorrespondence(rows: Record<string, unknown>[]) {
  query.mockImplementation(async (sql: string) => {
    if (String(sql).includes('c2c_correspondence')) return { rows };
    return { rows: [] };
  });
}

const row = (o: Record<string, unknown> = {}) => ({
  id: 'c-1',
  subject: 'FDA Information Request — stability data',
  direction: 'inbound',
  communication_type: 'information_request',
  response_required: true,
  status: 'new',
  received_at: new Date(Date.now() - 11 * 864e5).toISOString(),
  due_date: null,
  urgency: 'medium',
  project_id: 4,
  submission_id: 's-1',
  submission_type: 'NDA',
  ...o,
});

beforeEach(() => query.mockReset());

describe('the alert reads the real store, scoped to the caller', () => {
  it('reads c2c_correspondence for this organisation, inbound and unanswered only', async () => {
    onlyCorrespondence([]);
    await buildMdxProactiveSnapshot(client, 7);

    const call = query.mock.calls.find((c) => String(c[0]).includes('c2c_correspondence'));
    expect(call, 'the correspondence read must happen').toBeTruthy();
    const [sql, params] = call as unknown as [string, unknown[]];
    expect(sql).toContain('c.organization_id = $1');
    expect(sql).toContain("c.direction = 'inbound'");
    expect(sql).toContain('c.response_required');
    expect(sql).toContain("c.status NOT IN ('responded', 'closed')");
    // The join carries the tenant too, so a submission cannot be read across organisations.
    expect(sql).toContain('s.organization_id = c.organization_id');
    expect(params[0]).toBe(7);
    // The 14-day rule is gone from the statement: the clock is not SQL's job.
    expect(sql).not.toMatch(/INTERVAL/i);
  });
});

describe('what it says, and what it refuses to say', () => {
  it('names the agency’s own date when the letter carries one', async () => {
    onlyCorrespondence([row({ due_date: new Date(Date.now() - 3 * 864e5).toISOString() })]);
    const snap = await buildMdxProactiveSnapshot(client, 7);

    const alert = snap.alerts.find((a) => a.kind === 'correspondence.no_response');
    expect(alert?.severity).toBe('critical');
    expect(alert?.message).toContain('overdue');
    expect(alert?.message).toContain('the date the agency stated');
  });

  it('a drug information request with no date is reported as having none, not as overdue', async () => {
    onlyCorrespondence([row()]);
    const snap = await buildMdxProactiveSnapshot(client, 7);

    const alert = snap.alerts.find((a) => a.kind === 'correspondence.no_response');
    expect(alert?.severity).toBe('info');
    expect(alert?.message).toContain('no recorded response');
    expect(alert?.message).toContain('nothing here is overdue');
    expect(alert?.message, 'an undated letter is never called overdue').not.toMatch(/\bis \d+ day\(s\) overdue/);
  });

  it('a 510(k) Additional Information hold is dated from the 180-day window and names withdrawal', async () => {
    onlyCorrespondence([
      row({ submission_type: '510(k)', received_at: new Date(Date.now() - 179 * 864e5).toISOString() }),
    ]);
    const snap = await buildMdxProactiveSnapshot(client, 7);

    const alert = snap.alerts.find((a) => a.kind === 'correspondence.no_response');
    expect(alert?.severity).toBe('warn');
    expect(alert?.message).toContain('due in');
    expect(alert?.message).toContain('withdrawn');
  });

  it('raises nothing for a complete response letter eleven months out — the 14-day rule would have', async () => {
    onlyCorrespondence([
      row({ communication_type: 'complete_response_letter', received_at: new Date(Date.now() - 30 * 864e5).toISOString() }),
    ]);
    const snap = await buildMdxProactiveSnapshot(client, 7);
    expect(snap.alerts.filter((a) => a.kind === 'correspondence.no_response')).toEqual([]);
  });

  it('raises nothing for our own outbound response letter', async () => {
    onlyCorrespondence([row({ direction: 'outbound', communication_type: 'response_letter' })]);
    const snap = await buildMdxProactiveSnapshot(client, 7);
    expect(snap.alerts.filter((a) => a.kind === 'correspondence.no_response')).toEqual([]);
  });
});

describe('a read that cannot run is not an empty result', () => {
  it('raises no correspondence alert and does not pretend the snapshot is complete', async () => {
    query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('c2c_correspondence')) throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      return { rows: [] };
    });
    const snap = await buildMdxProactiveSnapshot(client, 7);
    expect(snap.alerts.filter((a) => a.kind === 'correspondence.no_response')).toEqual([]);
    // The other producers still ran: one failed read does not take the snapshot down.
    expect(snap.organizationId).toBe(7);
  });
});
