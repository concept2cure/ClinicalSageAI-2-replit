/**
 * A failed read of a version's review route never fails the version list, and
 * never reads as "no reviewers" (RR1b of docs/design/REVIEW_ROUTING_2026-10-23.md,
 * §2.13; RR1a's README: "RR1a currently fails the whole version list on a
 * failed route read").
 *
 * The queryable is a script of the reads readVaultLifecycles makes: the
 * lifecycle records, the signatures they name, then the route rounds. The
 * route read is the one that fails.
 */
import { describe, expect, it, vi } from 'vitest';
import { readVaultLifecycles } from '../vault-lifecycle';

const RECORD = {
  canonical_id: 'c-1', stage: 'in_review', created_by: 4, vault_id: 'v-1', approval_signature: null,
  review_signature: { actor: '5', signatureRef: 'esig:9', signedAt: '2026-10-29T10:00:00.000Z', meaning: 'reviewed' },
};

function queryable(route: 'fails' | 'none') {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM canonical_documents')) return { rows: [RECORD] };
      if (sql.includes('FROM electronic_signatures')) return { rows: [{ id: 9, signer_name: 'Rae Reviewer', signature_meaning: 'REVIEWED' }] };
      if (sql.includes('FROM review_routes')) {
        if (route === 'fails') throw new Error('permission denied for table review_routes');
        return { rows: [] };
      }
      throw new Error(`unexpected read: ${sql}`);
    }),
  };
}

describe("a version's review route read on its own (RR1b)", () => {
  it('a failed route read keeps the stage and sign-offs, and marks the reviewers unread', async () => {
    const out = await readVaultLifecycles(queryable('fails'), 3, ['v-1']);
    const lc = out.get('v-1')!;
    expect(lc.stage).toBe('in_review');
    expect(lc.review).toMatchObject({ printedName: 'Rae Reviewer', meaning: 'REVIEWED' });
    expect(lc.round).toBeNull();
    expect(lc.roundUnread).toBe(true);
  });

  it('a version with no route reads as no route, not as unread', async () => {
    const lc = (await readVaultLifecycles(queryable('none'), 3, ['v-1'])).get('v-1')!;
    expect(lc.round).toBeNull();
    expect(lc.roundUnread).toBe(false);
  });
});
