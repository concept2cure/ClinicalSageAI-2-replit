/**
 * A row that cannot be placed in the chain is not a verified link.
 *
 * HS-1008-7, honest-state review 2026-10-08. `snapshotChainIntegrity` compared
 * stored pointers with:
 *
 *   if (row.previous_hash !== prevHash && prevHash !== null && row.previous_hash !== null)
 *
 * The third clause meant a row whose `previous_hash` is NULL — although its
 * predecessor WAS hashed, so it is not the chain's genesis — fell through as a
 * verified link, and the snapshot reported `intact` over it. The compliance
 * report then attested "every one of N rows carries a hash linked to its
 * predecessor" over a chain in which one row was never placed.
 *
 * It is not evidence of tampering, so it is not a break. It is a link that
 * could not be checked, which this module already has a verdict for.
 */
import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { snapshotChainIntegrity } from '../signedAuditExport';

type Row = {
  id: number;
  organization_id: number;
  sequence_number: number;
  record_hash: string | null;
  previous_hash: string | null;
};

/** A pool that answers the one query the snapshot makes. The cast is to pg's
 *  full QueryArrayResult, of which the snapshot reads only `rows`. */
const poolOf = (rows: Row[]) =>
  ({ query: async () => ({ rows }) }) as unknown as Pick<Pool, 'query'>;

const row = (seq: number, record_hash: string | null, previous_hash: string | null): Row => ({
  id: seq, organization_id: 1, sequence_number: seq, record_hash, previous_hash,
});

describe('snapshotChainIntegrity', () => {
  it('control: a correctly linked chain is intact', async () => {
    const s = await snapshotChainIntegrity(
      poolOf([row(1, 'h1', null), row(2, 'h2', 'h1'), row(3, 'h3', 'h2')]),
      1,
    );
    expect(s.status).toBe('intact');
    expect(s.hashedEntries).toBe(3);
    expect(s.brokenLinks).toBe(0);
  });

  /* THE CASE THAT USED TO READ INTACT. Row 3 is hashed, its predecessor is
     hashed, and it claims no predecessor. */
  it('does not report intact over a row whose previous_hash is null after a hashed predecessor', async () => {
    const s = await snapshotChainIntegrity(
      poolOf([row(1, 'h1', null), row(2, 'h2', 'h1'), row(3, 'h3', null)]),
      1,
    );
    expect(s.status, 'an unplaceable row was reported as a verified link').toBe('unverified');
    expect(s.unlinkedEntries).toBe(1);
    expect(s.reason).toMatch(/no previous_hash although their predecessor was hashed/);
  });

  /* Unplaceable is not tampered: `broken` asserts a mismatch that was found,
     and none was. */
  it('calls it unverified rather than broken, because no mismatch was found', async () => {
    const s = await snapshotChainIntegrity(poolOf([row(1, 'h1', null), row(2, 'h2', null)]), 1);
    expect(s.status).toBe('unverified');
    expect(s.brokenLinks).toBe(0);
  });

  /* A real mismatch still outranks it: a positive finding of tampering is not
     softened into "could not tell". */
  it('still reports a genuine mismatch as broken', async () => {
    const s = await snapshotChainIntegrity(
      poolOf([row(1, 'h1', null), row(2, 'h2', 'WRONG'), row(3, 'h3', null)]),
      1,
    );
    expect(s.status).toBe('broken');
    expect(s.brokenLinks).toBe(1);
  });

  /* The first row of an organisation's chain legitimately has no predecessor,
     and must not be counted unlinked. */
  it('does not count the chain\'s own genesis row as unlinked', async () => {
    const s = await snapshotChainIntegrity(poolOf([row(1, 'h1', null)]), 1);
    expect(s.status).toBe('intact');
    expect(s.brokenLinks).toBe(0);
  });

  /* An unhashed row cannot be a link at all, and that verdict already existed;
     it must still take precedence over the new one so the reason names the
     bigger gap. */
  it('still reports unhashed rows as the reason when there are any', async () => {
    const s = await snapshotChainIntegrity(
      poolOf([row(1, 'h1', null), row(2, null, null), row(3, 'h3', null)]),
      1,
    );
    expect(s.status).toBe('unverified');
    expect(s.unhashedEntries).toBe(1);
    expect(s.reason).toMatch(/carry no record_hash/);
  });

  it('nothing to verify is not verified', async () => {
    const s = await snapshotChainIntegrity(poolOf([]), 1);
    expect(s.status).toBe('unverified');
    expect(s.reason).toMatch(/no chain to verify/);
  });
});
