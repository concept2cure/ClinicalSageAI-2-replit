/**
 * The §11.50 printed name must belong to a signer this org can attribute.
 *
 * WHAT WAS WRONG
 * `persistGovernedActionSignature` resolved the printed name with a bare
 * primary-key read — `SELECT name, email, title FROM users WHERE id = $1` — and
 * no tenant predicate. It was safe as CALLED: both callers pass the
 * authenticated actor's own id. It was safe by convention, not construction:
 * nothing stopped a future caller passing any user id, and the function would
 * have printed that person's name onto a signature in another tenant's filing.
 *
 * §11.50 requires the printed name OF THE SIGNER. A name resolved across a
 * tenant boundary is a misattributed signature in a document an agency reads,
 * and no later check would catch it — the manifest hash would bind the wrong
 * name faithfully.
 *
 * WHY NOT default_organization_id
 * That is the obvious scope and the wrong one. It names a PREFERENCE, not a
 * membership, so a signer legitimately acting outside their default org would
 * fail to resolve and a valid signature would be REFUSED — trading a rare
 * misattribution for a routine outage on a governed action. organization_users
 * is the authorization relation, and the one server/auth.ts selects a session's
 * tenant from.
 */
import { describe, it, expect, vi } from 'vitest';

import { persistGovernedActionSignature } from '../signature-persistence';

/** A client that records the statements it is asked to run. */
function clientReturning(signerRows: Array<Record<string, unknown>>) {
  const seen: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    seen.push({ sql, params });
    if (/FROM users/i.test(sql)) return { rows: signerRows, rowCount: signerRows.length };
    return { rows: [{ id: 1, signed_at: new Date() }], rowCount: 1 };
  });
  return { client: { query } as never, seen };
}

const params = {
  orgId: 7,
  userId: 42,
  target: 'financial-disclosure:1',
  reason: 'Certified as accurate and complete',
  payload: { meaning: 'Certified' },
  actionId: 'act-1',
  auditId: 'aud-1',
  sha256Chain: 'a'.repeat(64),
  authenticationMethod: 'password',
  secondFactorVerified: false,
  /* Required: the persisted §11.50 signing time. Omitting it made the success
     path throw on `params.occurredAt.toISOString()` — an incomplete fixture,
     not a defect in the code under test. */
  occurredAt: new Date('2026-08-22T00:00:00.000Z'),
  binding: { digest: null, basis: 'audit-chain', note: 'test' },
} as never;

describe('the signer lookup is scoped by org membership', () => {
  it('constrains the lookup on organization_users, bound to the signing org', async () => {
    const { client, seen } = clientReturning([{ name: 'R Patel', email: 'r@x.test', title: 'RA Lead' }]);
    await persistGovernedActionSignature(client, params);

    const lookup = seen.find((q) => /FROM users/i.test(q.sql));
    expect(lookup, 'the signer lookup ran').toBeTruthy();
    expect(lookup!.sql).toMatch(/organization_users/);
    // The org must be BOUND, not interpolated, and must be the signing org.
    expect(lookup!.params).toContain(7);
    expect(lookup!.params).toContain(42);
  });

  it('does not scope on default_organization_id', async () => {
    // Scoping there would refuse a signer acting outside their default org —
    // a valid signature turned into an outage.
    const { client, seen } = clientReturning([{ name: 'R Patel', email: 'r@x.test', title: null }]);
    await persistGovernedActionSignature(client, params);

    const lookup = seen.find((q) => /FROM users/i.test(q.sql))!;
    expect(lookup.sql).not.toMatch(/default_organization_id/);
  });

  it('refuses to sign when the signer is not a member of the signing org', async () => {
    // The join returns nothing: this org cannot attribute this signature, so
    // nothing is written. Failing closed is the only safe direction — a
    // signature attributed to the wrong person is worse than no signature.
    const { client } = clientReturning([]);
    await expect(persistGovernedActionSignature(client, params)).rejects.toThrow(/not a member of org/i);
  });

  it('says nothing about whether the user exists elsewhere', async () => {
    // Non-membership and non-existence share one refusal on purpose:
    // distinguishing them would disclose that a user id exists in another
    // tenant.
    const { client } = clientReturning([]);
    await expect(persistGovernedActionSignature(client, params)).rejects.not.toThrow(/not found/i);
  });
});
