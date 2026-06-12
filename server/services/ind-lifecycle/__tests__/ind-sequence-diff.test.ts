/**
 * eCTD sequence diff (amendment review) — deterministic add/replace/delete/
 * unchanged classification by checksum. No DB.
 */

import { describe, it, expect } from 'vitest';
import { diffSequences } from '../ind-sequence-diff';

const prior = {
  sequenceNumber: '0000',
  leaves: [
    { sectionCode: 'm1.2', title: 'Cover letter', checksum: 'aaa' },
    { sectionCode: 'm5.3.5', title: 'Protocol', checksum: 'bbb' },
    { sectionCode: 'm1.1', title: 'Form 1571', checksum: 'ccc' },
  ],
};

describe('diffSequences', () => {
  it('classifies added / replaced / unchanged / deleted', () => {
    const current = {
      sequenceNumber: '0001',
      leaves: [
        { sectionCode: 'm1.2', title: 'Cover letter v2', checksum: 'zzz' }, // changed → replaced
        { sectionCode: 'm5.3.5', title: 'Protocol', checksum: 'bbb' }, // same → unchanged
        { sectionCode: 'm3.2.s.1', title: 'Drug substance', checksum: 'ddd' }, // new → added
        // m1.1 dropped → deleted
      ],
    };
    const d = diffSequences(prior, current);
    expect(d.summary).toEqual({ added: 1, replaced: 1, unchanged: 1, deleted: 1, total: 4 });
    const byCode = Object.fromEntries(d.entries.map((e) => [e.sectionCode, e.change]));
    expect(byCode['m1.2']).toBe('replaced');
    expect(byCode['m5.3.5']).toBe('unchanged');
    expect(byCode['m3.2.s.1']).toBe('added');
    expect(byCode['m1.1']).toBe('deleted');
  });

  it('matches leaves regardless of the leading "m"', () => {
    const current = { sequenceNumber: '0001', leaves: [{ sectionCode: '1.2', title: 'Cover', checksum: 'aaa' }] };
    const d = diffSequences(prior, current);
    expect(d.entries.find((e) => e.sectionCode === '1.2')!.change).toBe('unchanged');
  });

  it('treats a missing checksum on either side as replaced (cannot confirm identical)', () => {
    const p = { sequenceNumber: '0000', leaves: [{ sectionCode: 'm1.2', title: 'Cover', checksum: null }] };
    const c = { sequenceNumber: '0001', leaves: [{ sectionCode: 'm1.2', title: 'Cover', checksum: 'aaa' }] };
    expect(diffSequences(p, c).entries[0].change).toBe('replaced');
  });

  it('returns entries sorted by section code', () => {
    const d = diffSequences(prior, prior);
    const codes = d.entries.map((e) => e.sectionCode);
    expect([...codes].sort()).toEqual(codes);
  });

  it('an identical sequence is all unchanged', () => {
    const d = diffSequences(prior, { ...prior, sequenceNumber: '0001' });
    expect(d.summary).toEqual({ added: 0, replaced: 0, unchanged: 3, deleted: 0, total: 3 });
  });
});
