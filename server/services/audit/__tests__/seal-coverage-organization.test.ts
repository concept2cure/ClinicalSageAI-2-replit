/**
 * verifyAuditEventsChainSeals, given one organisation, reads only that
 * organisation's chained audit_events rows (P-72 slice 1b;
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/). The integrity sweep
 * checks each organisation's seals on a connection in that organisation's own
 * scope and counts them per organisation, so a report for one organisation
 * that counted another's rows would be the cross-tenant total the sweep no
 * longer reads. The fake connection applies the statement's own predicate, as
 * PostgreSQL would: it filters by organisation only when the SQL asks it to.
 */
import { describe, expect, it } from 'vitest';
import { verifyAuditEventsChainSeals } from '../seal-coverage';

/** Two chained, unsealed rows of organisation 7 and one of organisation 8. */
const ROWS = [
  { organization_id: 7, record_hash: 'a1', previous_hash: null, sequence_number: 1, hmac_seal: null },
  { organization_id: 7, record_hash: 'a2', previous_hash: 'a1', sequence_number: 2, hmac_seal: null },
  { organization_id: 8, record_hash: 'b1', previous_hash: null, sequence_number: 1, hmac_seal: null },
];

function fakeClient() {
  const sent: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    async query(sql: string, params: unknown[] = []) {
      sent.push({ sql, params });
      const filters = /organization_id = \$1::int/.test(sql) && params[0] != null;
      return { rows: filters ? ROWS.filter((r) => r.organization_id === params[0]) : ROWS };
    },
  };
  return { client: client as never, sent };
}

describe('the audit_events seal check, per organisation', () => {
  it("named, it reads and counts that organisation's chained rows only", async () => {
    const { client, sent } = fakeClient();
    const report = await verifyAuditEventsChainSeals(client, { organizationId: 7 });
    expect(sent.map((s) => s.params)).toEqual([[7]]);
    expect(report).toMatchObject({ valid: true, verified: 0, unsealed: 2 });
  });

  it('control: unnamed, it reads every organisation as before', async () => {
    const { client, sent } = fakeClient();
    const report = await verifyAuditEventsChainSeals(client);
    expect(sent).toHaveLength(1);
    expect(report).toMatchObject({ valid: true, verified: 0, unsealed: 3 });
  });
});
