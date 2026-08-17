/**
 * The revision ledger's verification — shown FAILING on every tamper class it
 * exists to catch, then passing on the honest history (the working agreement's
 * "verify by making the check fail").
 */
import { describe, expect, it } from 'vitest';
import {
  computeChainHash,
  sha256Hex,
  verifyLedger,
  type LedgerRow,
} from '../revision-ledger';

/** Build an honestly-chained history the way createRevision does. */
function chainRows(
  entries: Array<{ id: string; content: string; by: string; origin: string }>,
): LedgerRow[] {
  let head: string | null = null;
  return entries.map((e) => {
    const contentSha = sha256Hex(e.content);
    const chain = computeChainHash({
      prevChain: head,
      contentSha256: contentSha,
      createdBy: e.by,
      origin: e.origin,
    });
    const row: LedgerRow = {
      id: e.id,
      content: e.content,
      created_by: e.by,
      origin: e.origin,
      content_sha256: contentSha,
      prev_chain_sha256: head,
      chain_sha256: chain,
    };
    head = chain;
    return row;
  });
}

const HISTORY = () =>
  chainRows([
    { id: 'r1', content: 'Initial draft.', by: 'author@x.co', origin: 'genesis' },
    { id: 'r2', content: 'Initial draft, tightened.', by: 'author@x.co', origin: 'human-edit' },
    { id: 'r3', content: 'Final wording per SAP.', by: 'reviewer@x.co', origin: 'human-edit' },
  ]);

describe('revision ledger verification', () => {
  it('an honest history verifies intact', () => {
    const v = verifyLedger(HISTORY());
    expect(v.intact).toBe(true);
    expect(v.chainedCount).toBe(3);
    expect(v.preLedgerCount).toBe(0);
    expect(v.breaks).toEqual([]);
  });

  it('CATCHES content altered after the fact (the §11.10(e) tamper)', () => {
    const rows = HISTORY();
    // Someone edits revision 2's stored content in place — the exact rewrite
    // the append-only trigger refuses at the engine, recomputed here in case
    // the record arrived from anywhere the trigger did not govern.
    rows[1] = { ...rows[1], content: 'Initial draft, tightened, and one number changed.' };
    const v = verifyLedger(rows);
    expect(v.intact).toBe(false);
    expect(v.breaks).toContainEqual({ revisionId: 'r2', reason: 'content-hash-mismatch' });
  });

  it('CATCHES a deleted revision (the chain no longer links)', () => {
    const rows = HISTORY();
    rows.splice(1, 1); // r2 removed from history
    const v = verifyLedger(rows);
    expect(v.intact).toBe(false);
    expect(v.breaks).toContainEqual({ revisionId: 'r3', reason: 'link-mismatch' });
  });

  it('CATCHES a re-pointed link and a forged chain value', () => {
    const rows = HISTORY();
    rows[2] = { ...rows[2], prev_chain_sha256: sha256Hex('somewhere else') };
    const v = verifyLedger(rows);
    expect(v.intact).toBe(false);
    const reasons = v.breaks.map((b) => b.reason);
    expect(reasons).toContain('link-mismatch');
    expect(reasons).toContain('chain-hash-mismatch');
  });

  it('CATCHES attribution rewritten under an intact content hash', () => {
    const rows = HISTORY();
    // The author column is part of the chain input: renaming who wrote r3
    // invalidates its link even though the content is untouched.
    rows[2] = { ...rows[2], created_by: 'someone-else@x.co' };
    const v = verifyLedger(rows);
    expect(v.intact).toBe(false);
    expect(v.breaks).toContainEqual({ revisionId: 'r3', reason: 'chain-hash-mismatch' });
  });

  it('CATCHES a fork — two revisions extending the same head', () => {
    const rows = HISTORY();
    const forked = chainRows([
      { id: 'r1', content: 'Initial draft.', by: 'author@x.co', origin: 'genesis' },
      { id: 'r2b', content: 'A different second state.', by: 'author@x.co', origin: 'human-edit' },
    ])[1];
    // r2b claims the same prev as r2: inserted after r2, its link cannot match
    // the walk's head (which is r2's chain).
    const v = verifyLedger([rows[0], rows[1], forked]);
    expect(v.intact).toBe(false);
    expect(v.breaks).toContainEqual({ revisionId: 'r2b', reason: 'link-mismatch' });
  });

  it('reports pre-ledger rows honestly, and refuses unchained rows after adoption', () => {
    const preLedger: LedgerRow = {
      id: 'r0',
      content: 'Ancient state before the ledger existed.',
      created_by: 'author@x.co',
      origin: null,
      content_sha256: null,
      prev_chain_sha256: null,
      chain_sha256: null,
    };
    const clean = verifyLedger([preLedger, ...HISTORY()]);
    expect(clean.intact).toBe(true);
    expect(clean.preLedgerCount).toBe(1);
    expect(clean.chainedCount).toBe(3);

    // The same unchained row AFTER chained rows has no excuse.
    const late = verifyLedger([...HISTORY(), { ...preLedger, id: 'r9' }]);
    expect(late.intact).toBe(false);
    expect(late.breaks).toContainEqual({ revisionId: 'r9', reason: 'unchained-after-adoption' });
  });
});
