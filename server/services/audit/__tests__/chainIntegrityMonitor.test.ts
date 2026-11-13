/**
 * Audit chain integrity monitor — the walk it reports from.
 *
 * The monitor reads the audit_events chain through the one walk
 * (../audit-event-chain.ts): each row's previous_hash is compared with the
 * prior row's record_hash, per org, and each row's record_hash is re-computed.
 * These tests lock the monitor's view of that walk: what is a break, what is
 * not, and that organisations are independent.
 *
 * The rows are hashed as the trigger hashes them (_audit-event-chain-fixtures):
 * with made-up hashes, as this file used before the walk re-computed, every row
 * would read as altered and none of these cases would be about what it says.
 */

import { describe, it, expect } from 'vitest';
import { findBrokenChainLinks, summarizeChainLinkage } from '../chainIntegrityMonitor';
import { chainRows } from './_audit-event-chain-fixtures';

describe('findBrokenChainLinks', () => {
  it('returns nothing for an intact single-org chain', () => {
    const rows = chainRows([
      { id: 1, org: 1, seq: 1 },
      { id: 2, org: 1, seq: 2 },
      { id: 3, org: 1, seq: 3 },
    ]);
    expect(findBrokenChainLinks(rows)).toEqual([]);
  });

  it('flags a row whose previous_hash does not match the prior record_hash', () => {
    const rows = chainRows([
      { id: 1, org: 1, seq: 1 },
      { id: 2, org: 1, seq: 2 },
      { id: 3, org: 1, seq: 3, prev: 'TAMPERED' }, // should be row 2's hash
    ]);
    const broken = findBrokenChainLinks(rows);
    expect(broken).toEqual([{ id: 3, sequenceNumber: 3, orgId: 1, kind: 'pointer' }]);
  });

  /* The monitor compared pointers only, so this passed as healthy while the
     audit trail's banner, re-computing over the same rows, called it broken. */
  it('flags a row whose covered fields no longer match its stored hash', () => {
    const rows = chainRows([
      { id: 1, org: 1, seq: 1 },
      { id: 2, org: 1, seq: 2 },
      { id: 3, org: 1, seq: 3 },
    ]);
    rows[1].reason = 'back-dated after the fact';
    expect(findBrokenChainLinks(rows)).toEqual([{ id: 2, sequenceNumber: 2, orgId: 1, kind: 'content' }]);
  });

  it('validates each org chain independently (no cross-tenant break)', () => {
    // Interleaved orgs; each org self-consistent. Input is ordered by
    // (org, seq) as the query guarantees.
    const rows = chainRows([
      { id: 1, org: 1, seq: 1 },
      { id: 2, org: 1, seq: 2 },
      { id: 3, org: 2, seq: 1 },
      { id: 4, org: 2, seq: 2 },
    ]);
    expect(findBrokenChainLinks(rows)).toEqual([]);
  });

  it('does not let one org\'s hash satisfy another org\'s link', () => {
    const [a1] = chainRows([{ id: 1, org: 1, seq: 1 }]);
    const rows = [
      a1,
      ...chainRows([
        { id: 2, org: 2, seq: 1, prev: a1.record_hash }, // org 2's first row pointing at org 1's hash...
        { id: 3, org: 2, seq: 2, prev: a1.record_hash }, // ...and a real break: should be row 2's hash, not org 1's
      ]),
    ];
    const broken = findBrokenChainLinks(rows);
    expect(broken).toEqual([{ id: 3, sequenceNumber: 2, orgId: 2, kind: 'pointer' }]);
  });

  /* This case used to read: 'treats a null previous_hash as "no claim" (genesis
     or unset writer)', and asserted nothing more than no break. No writer
     leaves it unset: the trigger stores the hash of the row it follows, for
     every row. So a null after a hashed row is the edit that hides a removal
     from a pointer check. It is still not a BREAK — nothing was compared — but
     it is counted, and the scan is no longer healthy over it. */
  it('counts a null previous_hash after a hashed row as unlinked: not a break, not healthy', () => {
    const rows = chainRows([
      { id: 1, org: 1, seq: 1 }, // genesis: null is right here
      { id: 2, org: 1, seq: 2, prev: null }, // names no predecessor although one was hashed
      { id: 3, org: 1, seq: 3 },
    ]);
    expect(findBrokenChainLinks(rows)).toEqual([]);
    const summary = summarizeChainLinkage(rows);
    expect(summary.unlinkedEntries).toBe(1);
    expect(summary.verifiedEntries).toBe(3);
  });

  it('reports every break, not just the first', () => {
    const rows = chainRows([
      { id: 1, org: 1, seq: 1 },
      { id: 2, org: 1, seq: 2, prev: 'WRONG' },
      { id: 3, org: 1, seq: 3, prev: 'WRONG2' },
    ]);
    const broken = findBrokenChainLinks(rows);
    expect(broken.map(b => b.id)).toEqual([2, 3]);
  });

  it('returns [] for an empty chain', () => {
    expect(findBrokenChainLinks([])).toEqual([]);
  });
});

describe('summarizeChainLinkage', () => {
  it('counts unhashed rows and does not compare the pointer of the row after one', () => {
    const rows = chainRows([
      { id: 1, org: 1, seq: 1, hash: null }, // written before the trigger
      { id: 2, org: 1, seq: 2 },
      { id: 3, org: 1, seq: 3 },
    ]);
    const s = summarizeChainLinkage(rows);
    expect(s).toMatchObject({ hashedEntries: 2, unhashedEntries: 1, verifiedEntries: 2, unlinkedEntries: 0 });
    expect(s.broken).toEqual([]);
  });

  it('does not count a row that failed re-computation as verified', () => {
    const rows = chainRows([
      { id: 1, org: 1, seq: 1 },
      { id: 2, org: 1, seq: 2 },
    ]);
    rows[1].user_name = 'Someone Else';
    const s = summarizeChainLinkage(rows);
    expect(s.hashedEntries).toBe(2);
    expect(s.verifiedEntries).toBe(1);
  });
});
