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
import type { AuditEventChainRow } from '../audit-event-chain';
import { chainRows, soundChain } from './_audit-event-chain-fixtures';

/** A pool that answers the one query the snapshot makes. The cast is to pg's
 *  full QueryArrayResult, of which the snapshot reads only `rows`. */
const poolOf = (rows: AuditEventChainRow[]) =>
  ({ query: async () => ({ rows }) }) as unknown as Pick<Pool, 'query'>;

describe('snapshotChainIntegrity', () => {
  /* Controls assert only what the change leaves alone, so they pass against the
     snapshot as it was and as it is. */
  it('control: a chain as the trigger writes it is intact', async () => {
    const s = await snapshotChainIntegrity(poolOf(soundChain(1, 3)), 1);
    expect(s.status).toBe('intact');
    expect(s.hashedEntries).toBe(3);
    expect(s.brokenLinks).toBe(0);
  });

  it('counts the rows whose hash re-computed, which is what an intact verdict now rests on', async () => {
    const s = await snapshotChainIntegrity(poolOf(soundChain(1, 3)), 1);
    expect(s.verifiedEntries).toBe(3);
  });

  /* HS-1008-7, the half that was left open on 2026-10-12. This snapshot compared
     stored pointers and re-computed nothing, so a row whose fields were altered
     with its hashes left alone read INTACT — in the signed export's manifest and
     in the compliance report's attestation — while the audit trail's banner,
     over the same rows, read broken. */
  it('reports a row altered with its stored hashes left alone as broken, by content', async () => {
    const rows = soundChain(1, 3);
    rows[1].reason = 'back-dated after the fact';
    const s = await snapshotChainIntegrity(poolOf(rows), 1);
    expect(s.status, 'an altered row passed because only pointers were compared').toBe('broken');
    expect(s).toMatchObject({ brokenLinks: 1, contentBreaks: 1, pointerBreaks: 0, hashedEntries: 3, verifiedEntries: 2 });
  });

  /* Row 3 is hashed, its predecessor is hashed, and it names no predecessor. */
  it('does not report intact over a row whose previous_hash is null after a hashed predecessor', async () => {
    const rows = chainRows([{ id: 1, org: 1, seq: 1 }, { id: 2, org: 1, seq: 2 }, { id: 3, org: 1, seq: 3, prev: null }]);
    const s = await snapshotChainIntegrity(poolOf(rows), 1);
    expect(s.status, 'an unplaceable row was reported as a verified link').toBe('unverified');
    expect(s.unlinkedEntries).toBe(1);
    expect(s.reason).toMatch(/no previous_hash although their predecessor was hashed/);
  });

  /* Unplaceable is not tampered: `broken` asserts a mismatch that was found,
     and none was. */
  it('calls it unverified rather than broken, because no mismatch was found', async () => {
    const rows = chainRows([{ id: 1, org: 1, seq: 1 }, { id: 2, org: 1, seq: 2, prev: null }]);
    const s = await snapshotChainIntegrity(poolOf(rows), 1);
    expect(s.status).toBe('unverified');
    expect(s.brokenLinks).toBe(0);
  });

  /* A real mismatch still outranks it: a positive finding of tampering is not
     softened into "could not tell". */
  it('still reports a genuine mismatch as broken', async () => {
    const rows = chainRows([{ id: 1, org: 1, seq: 1 }, { id: 2, org: 1, seq: 2, prev: 'WRONG' }, { id: 3, org: 1, seq: 3, prev: null }]);
    const s = await snapshotChainIntegrity(poolOf(rows), 1);
    expect(s.status).toBe('broken');
    expect(s.brokenLinks).toBe(1);
  });

  it('says a wrong pointer is a pointer break, not altered content', async () => {
    const rows = chainRows([{ id: 1, org: 1, seq: 1 }, { id: 2, org: 1, seq: 2, prev: 'WRONG' }]);
    const s = await snapshotChainIntegrity(poolOf(rows), 1);
    expect(s).toMatchObject({ pointerBreaks: 1, contentBreaks: 0 });
  });

  /* The first row of an organisation's chain legitimately has no predecessor,
     and must not be counted unlinked. */
  it('does not count the chain\'s own genesis row as unlinked', async () => {
    const s = await snapshotChainIntegrity(poolOf(soundChain(1, 1)), 1);
    expect(s.status).toBe('intact');
    expect(s.brokenLinks).toBe(0);
  });

  /* An unhashed row cannot be a link at all, and that verdict already existed;
     it must still take precedence over the unlinked one so the reason names the
     bigger gap. */
  it('still reports unhashed rows as the reason when there are any', async () => {
    const rows = chainRows([{ id: 1, org: 1, seq: 1 }, { id: 2, org: 1, seq: 2, hash: null }, { id: 3, org: 1, seq: 3 }]);
    const s = await snapshotChainIntegrity(poolOf(rows), 1);
    expect(s.status).toBe('unverified');
    expect(s.unhashedEntries).toBe(1);
    expect(s.reason).toMatch(/carry no record_hash/);
  });

  it('nothing to verify is not verified', async () => {
    const s = await snapshotChainIntegrity(poolOf([]), 1);
    expect(s.status).toBe('unverified');
    expect(s.reason).toMatch(/no chain to verify/);
  });

  /* A snapshot that could not run is never a verdict. */
  it('unavailable when the query throws', async () => {
    const failing = { query: async () => { throw new Error('relation "audit_events" does not exist'); } } as unknown as Pick<Pool, 'query'>;
    const s = await snapshotChainIntegrity(failing, 1);
    expect(s.status).toBe('unavailable');
    expect(s.verifiedEntries).toBeUndefined();
  });
});
