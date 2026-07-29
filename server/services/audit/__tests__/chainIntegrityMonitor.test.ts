/**
 * Audit chain integrity monitor — linkage check.
 *
 * The monitor verifies audit_events chain *linkage* (each row's previous_hash
 * matches the prior row's record_hash, per org). These tests lock that pure
 * logic, including the multi-tenant independence and null-previous_hash rules
 * that mirror the signed compliance export.
 */

import { describe, it, expect } from 'vitest';
import {
  findBrokenChainLinks,
  type AuditEventChainRow,
} from '../chainIntegrityMonitor';

const row = (
  id: number,
  org: number,
  seq: number,
  recordHash: string,
  previousHash: string | null,
): AuditEventChainRow => ({
  id,
  organization_id: org,
  sequence_number: seq,
  record_hash: recordHash,
  previous_hash: previousHash,
});

describe('findBrokenChainLinks', () => {
  it('returns nothing for an intact single-org chain', () => {
    const rows = [
      row(1, 1, 1, 'h1', null),
      row(2, 1, 2, 'h2', 'h1'),
      row(3, 1, 3, 'h3', 'h2'),
    ];
    expect(findBrokenChainLinks(rows)).toEqual([]);
  });

  it('flags a row whose previous_hash does not match the prior record_hash', () => {
    const rows = [
      row(1, 1, 1, 'h1', null),
      row(2, 1, 2, 'h2', 'h1'),
      row(3, 1, 3, 'h3', 'TAMPERED'), // should be h2
    ];
    const broken = findBrokenChainLinks(rows);
    expect(broken).toEqual([{ id: 3, sequenceNumber: 3, orgId: 1 }]);
  });

  it('validates each org chain independently (no cross-tenant break)', () => {
    // Interleaved orgs; each org self-consistent. Input is ordered by
    // (org, seq) as the query guarantees.
    const rows = [
      row(1, 1, 1, 'a1', null),
      row(2, 1, 2, 'a2', 'a1'),
      row(3, 2, 1, 'b1', null),
      row(4, 2, 2, 'b2', 'b1'),
    ];
    expect(findBrokenChainLinks(rows)).toEqual([]);
  });

  it('does not let one org\'s hash satisfy another org\'s link', () => {
    const rows = [
      row(1, 1, 1, 'a1', null),
      row(2, 2, 1, 'b1', 'a1'), // org 2 genesis pointing at org 1's hash...
      row(3, 2, 2, 'b2', 'a1'), // ...and a real break: should be b1, not a1
    ];
    const broken = findBrokenChainLinks(rows);
    expect(broken).toEqual([{ id: 3, sequenceNumber: 2, orgId: 2 }]);
  });

  it('treats a null previous_hash as "no claim" (genesis or unset writer)', () => {
    const rows = [
      row(1, 1, 1, 'h1', null), // genesis
      row(2, 1, 2, 'h2', null), // writer left it null — not a break
      row(3, 1, 3, 'h3', 'h2'),
    ];
    expect(findBrokenChainLinks(rows)).toEqual([]);
  });

  it('reports every break, not just the first', () => {
    const rows = [
      row(1, 1, 1, 'h1', null),
      row(2, 1, 2, 'h2', 'WRONG'),
      row(3, 1, 3, 'h3', 'WRONG2'),
    ];
    const broken = findBrokenChainLinks(rows);
    expect(broken.map(b => b.id)).toEqual([2, 3]);
  });

  it('returns [] for an empty chain', () => {
    expect(findBrokenChainLinks([])).toEqual([]);
  });
});
