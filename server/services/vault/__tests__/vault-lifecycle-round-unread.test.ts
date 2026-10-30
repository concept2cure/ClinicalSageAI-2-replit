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

/* RR2 records (2026-10-29): a routed version's sign-off lines come from its
   round; a version with no route, or one whose route could not be read, keeps
   today's one stored line, and so does a sign-off carried from Authoring. */
describe("a version's sign-off lines (RR2 records, §2.12)", () => {
  it('no route, or an unread one: no round lines, and the stored review line stands', async () => {
    for (const route of ['none', 'fails'] as const) {
      const lc = (await readVaultLifecycles(queryable(route), 3, ['v-1'])).get('v-1')!;
      expect(lc.reviewSignOffs, route).toBeNull();
      expect(lc.approvalSignOffs, route).toBeNull();
      expect(lc.review, route).toMatchObject({ printedName: 'Rae Reviewer', signatureRef: 'esig:9' });
    }
  });

  it('only a sign-off made on the round reads its lines from the round', async () => {
    const { roundSignOffs } = await import('../vault-lifecycle');
    const sig = (id: number, name: string, at: string) => ({ id, printedName: name, meaning: 'REVIEWED', signedAt: at });
    const member = (userId: number, role: 'reviewer' | 'approver', signature: ReturnType<typeof sig> | null) =>
      ({ taskId: `t${userId}`, userId, role, step: 1, printedName: null, outcome: signature ? 'signed' : 'pending', stepOpen: true, dueDate: null, signature, actId: null }) as const;
    const round = {
      route: {} as never, reviewComplete: true, approvalComplete: false, history: [],
      members: [member(6, 'reviewer', sig(12, 'Ria Reviewer', '2026-10-29T11:00:00.000Z')), member(5, 'reviewer', sig(9, 'Rae Reviewer', '2026-10-29T10:00:00.000Z')), member(7, 'approver', null)],
    };
    const stored = (ref: string) => ({ actor: '6', signatureRef: ref, signedAt: '2026-10-29T11:00:00.000Z' });
    expect(roundSignOffs(round as never, 'reviewer', stored('esig:12'))?.map((s) => [s.printedName, s.signatureRef, s.signerId])).toEqual([
      ['Rae Reviewer', 'esig:9', 5], ['Ria Reviewer', 'esig:12', 6],
    ]);
    expect(roundSignOffs(round as never, 'reviewer', stored('esig:99'))).toBeNull(); // made on another round
    expect(roundSignOffs(round as never, 'reviewer', stored('authoring-sig:6f1c2b1e-0a4d-4c7e-9f3a-111111111111'))).toBeNull(); // carried
    expect(roundSignOffs(round as never, 'approver', null)).toBeNull(); // not approved
    expect(roundSignOffs(null, 'reviewer', stored('esig:12'))).toBeNull();
  });
});
