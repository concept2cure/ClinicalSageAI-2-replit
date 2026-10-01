/**
 * The text half of version compare (plan critique 15): a deterministic line
 * diff that collapses unchanged runs, says when it was capped, and refuses to
 * show a misleading alignment of two texts that differ too much.
 * The route, family and tenancy cases are in tests/db/vault-version-compare.dbtest.ts.
 */
import { describe, it, expect } from 'vitest';
import { compareText, COMPARE_CONTEXT, COMPARE_LINE_CAP, COMPARE_OUTPUT_CAP } from '../vault-version-compare';

const L = { from: 'v1.0', to: 'v2.0' };
const lines = (n: number, tag = 'line') => Array.from({ length: n }, (_, i) => `${tag} ${i + 1}`);

describe('compareText', () => {
  it('keeps a few unchanged lines either side of a change and counts the rest', () => {
    const before = lines(50);
    const after = before.map((l, i) => (i === 24 ? 'line 25, revised' : l));
    const out = compareText(before.join('\n'), after.join('\n'), L);
    if (!out.available) throw new Error('expected a comparison');
    expect(out.counts).toEqual({ added: 1, removed: 1, unchanged: 49 });
    expect(out.hunks).toEqual([
      { kind: 'skipped', count: 24 - COMPARE_CONTEXT },
      { kind: 'same', lines: ['line 22', 'line 23', 'line 24'] },
      { kind: 'removed', lines: ['line 25'] },
      { kind: 'added', lines: ['line 25, revised'] },
      { kind: 'same', lines: ['line 26', 'line 27', 'line 28'] },
      { kind: 'skipped', count: 25 - COMPARE_CONTEXT },
    ]);
    expect(out.truncated).toBe(false);
  });

  it('identical text is identical, with nothing but a collapsed run', () => {
    const out = compareText('a\nb\nc', 'a\r\nb\r\nc', L);
    expect(out).toMatchObject({ available: true, identical: true, counts: { added: 0, removed: 0, unchanged: 3 } });
  });

  it('says which version has no text, rather than comparing an empty one', () => {
    expect(compareText('', 'text', L)).toEqual({
      available: false,
      reason: 'No text was read from v1.0, so the text cannot be compared. The recorded details and SHA-256 are still compared.',
    });
    expect(compareText(null, '  ', L)).toMatchObject({ available: false, reason: expect.stringContaining('v1.0 or v2.0') });
  });

  it('two texts too different to align are reported as such, not as a diff', () => {
    const out = compareText(lines(6000, 'old').join('\n'), lines(6000, 'new').join('\n'), L);
    expect(out).toMatchObject({ available: false, reason: expect.stringMatching(/differ too much to align line by line \(6000 and 6000 lines\)/) });
  });

  it('a capped read or a capped output is marked truncated', () => {
    const long = lines(COMPARE_LINE_CAP + 10);
    const capped = compareText(long.join('\n'), long.join('\n'), L);
    expect(capped).toMatchObject({ available: true, truncated: true });
    // 400 one-line edits ten lines apart: inside the edit budget, but each
    // shows with its context, so the output passes its cap.
    const before = lines(4000);
    const after = before.map((l, i) => (i % 10 === 5 ? `${l}, revised` : l));
    const spread = compareText(before.join('\n'), after.join('\n'), L);
    if (!spread.available) throw new Error('expected a comparison');
    expect(spread.truncated).toBe(true);
    expect(spread.hunks.filter((h) => h.kind !== 'skipped').reduce((n, h) => n + ('lines' in h ? h.lines.length : 0), 0)).toBe(COMPARE_OUTPUT_CAP);
    // The counts are the whole comparison's, not the shown part's.
    expect(spread.counts).toEqual({ added: 400, removed: 400, unchanged: 3600 });
  });
});
