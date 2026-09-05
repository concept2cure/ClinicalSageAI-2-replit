/**
 * Section codes sort in the order a dossier is assembled in.
 *
 * The comparator this replaces — `localeCompare(a, b, { numeric: true })`,
 * written inline at six sites — handles the numbers correctly and Module 3
 * exactly backwards. Its output for the CTD quality module is A, P, R, S:
 * appendices first, drug product ahead of drug substance. ICH M4Q orders those
 * parts S, P, A, R, and this repo's own CTD_SECTIONS list is declared in that
 * order. For an assembled dossier the order is the deliverable.
 */
import { describe, it, expect } from 'vitest';
import {
  compareSectionCode,
  sortBySectionCode,
  sectionInsertIndex,
  duplicateSectionCodes,
  sectionStructureIssues,
} from '../section-code';

const sorted = (codes: string[]) => [...codes].sort(compareSectionCode);

describe('numeric outline levels', () => {
  it('orders 10 after 9 rather than after 1', () => {
    expect(sorted(['5.10', '5.1', '5.6', '5.9'])).toEqual(['5.1', '5.6', '5.9', '5.10']);
    expect(sorted(['2.7.10', '2.7.3'])).toEqual(['2.7.3', '2.7.10']);
  });

  it('puts a parent before its children', () => {
    expect(sorted(['5.1.1', '5.1', '5.1.2'])).toEqual(['5.1', '5.1.1', '5.1.2']);
  });

  it('sorts the same regardless of creation order — the W1-2 complaint', () => {
    // "Creating 5.6 then 5.1 leaves 5.6 above 5.1 permanently."
    expect(sorted(['5.6', '5.1'])).toEqual(['5.1', '5.6']);
    expect(sorted(['5.1', '5.6'])).toEqual(['5.1', '5.6']);
  });
});

describe('the named parts of CTD Module 3.2', () => {
  it('orders drug substance before drug product, per ICH M4Q', () => {
    expect(sorted(['3.2.P', '3.2.S'])).toEqual(['3.2.S', '3.2.P']);
  });

  it('orders all four parts S, P, A, R', () => {
    expect(sorted(['3.2.R', '3.2.A', '3.2.P', '3.2.S'])).toEqual([
      '3.2.S',
      '3.2.P',
      '3.2.A',
      '3.2.R',
    ]);
  });

  it('is not what alphabetical collation produces — the defect, stated', () => {
    const alphabetical = ['3.2.R', '3.2.A', '3.2.P', '3.2.S'].sort((a, b) =>
      a.localeCompare(b, 'en', { numeric: true }),
    );
    expect(alphabetical).toEqual(['3.2.A', '3.2.P', '3.2.R', '3.2.S']);
    expect(sorted(['3.2.R', '3.2.A', '3.2.P', '3.2.S'])).not.toEqual(alphabetical);
  });

  it('keeps the sub-parts of drug substance in numeric order under it', () => {
    expect(sorted(['3.2.S.4.2', '3.2.S.3.2', '3.2.S.4.1', '3.2.P.1'])).toEqual([
      '3.2.S.3.2',
      '3.2.S.4.1',
      '3.2.S.4.2',
      '3.2.P.1',
    ]);
  });

  it('keeps a numeric level ahead of a named part at the same depth', () => {
    expect(sorted(['3.2.S', '3.2.1'])).toEqual(['3.2.1', '3.2.S']);
  });

  it('orders an unrecognised letter predictably, behind every known part', () => {
    // Deterministic beats arbitrary: an odd code must not displace drug substance.
    expect(sorted(['3.2.Z', '3.2.S', '3.2.R'])).toEqual(['3.2.S', '3.2.R', '3.2.Z']);
  });

  it('is case-insensitive', () => {
    expect(sorted(['3.2.p', '3.2.s'])).toEqual(['3.2.s', '3.2.p']);
  });
});

describe('sortBySectionCode', () => {
  it('sorts objects without mutating the input', () => {
    const input = [{ code: '3.2.P' }, { code: '3.2.S' }];
    const out = sortBySectionCode(input, (s) => s.code);
    expect(out.map((s) => s.code)).toEqual(['3.2.S', '3.2.P']);
    expect(input.map((s) => s.code)).toEqual(['3.2.P', '3.2.S']);
  });
});

describe('sectionInsertIndex', () => {
  it('places a new code at its position in an ordered list', () => {
    expect(sectionInsertIndex(['5.1', '5.6'], '5.3')).toBe(1);
    expect(sectionInsertIndex(['5.1', '5.6'], '5.9')).toBe(2);
    expect(sectionInsertIndex(['5.1', '5.6'], '4.1')).toBe(0);
    expect(sectionInsertIndex([], '5.1')).toBe(0);
  });

  it('converges on full code order when sections are created out of order', () => {
    // The whole W1-2 acceptance criterion, one insert at a time.
    const order: string[] = [];
    for (const code of ['5.6', '5.1', '5.10', '5.3']) {
      order.splice(sectionInsertIndex(order, code), 0, code);
    }
    expect(order).toEqual(['5.1', '5.3', '5.6', '5.10']);
  });

  it('reads a manual order rather than imposing code order over it', () => {
    // Someone deliberately put 5.6 first. Inserting 5.3 must not silently
    // re-sort their document; it lands ahead of the first code that follows it.
    const manual = ['5.6', '5.1'];
    const at = sectionInsertIndex(manual, '5.3');
    manual.splice(at, 0, '5.3');
    expect(manual).toEqual(['5.3', '5.6', '5.1']);
  });
});

describe('duplicateSectionCodes', () => {
  it('finds a code filed twice', () => {
    // Two sections under one code means the assembled dossier has two 3.2.S and
    // a reviewer cannot tell which is meant.
    expect(duplicateSectionCodes(['3.2.S', '3.2.P', '3.2.S'])).toEqual(['3.2.S']);
  });

  it('ignores case and surrounding space, and reports nothing when clean', () => {
    expect(duplicateSectionCodes(['3.2.S', ' 3.2.s '])).toEqual(['3.2.S']);
    expect(duplicateSectionCodes(['1.1', '1.2'])).toEqual([]);
  });
});

describe('sectionStructureIssues', () => {
  it('reports a document whose stored order disagrees with its codes', () => {
    const r = sectionStructureIssues(['5.6', '5.1', '5.10']);
    expect(r.outOfOrder).toBe(true);
    expect(r.suggestedOrder).toEqual(['5.1', '5.6', '5.10']);
  });

  it('reports nothing for a document already in order', () => {
    const r = sectionStructureIssues(['3.2.S', '3.2.P', '3.2.A']);
    expect(r.outOfOrder).toBe(false);
    expect(r.duplicateCodes).toEqual([]);
  });

  it('reports a code filed twice', () => {
    expect(sectionStructureIssues(['3.2.S', '3.2.P', '3.2.S']).duplicateCodes).toEqual(['3.2.S']);
  });

  it('does NOT report a skipped number as a gap', () => {
    /* CTD codes are not contiguous — 1.1, 1.2, 1.5 is a legitimate dossier, and
       flagging the absent 1.3/1.4 would bury the real problems in noise. */
    const r = sectionStructureIssues(['1.1', '1.2', '1.5']);
    expect(r.outOfOrder).toBe(false);
    expect(r.duplicateCodes).toEqual([]);
  });

  it('reads the order it is given, not a sorted copy of it', () => {
    // Passing pre-sorted codes would make outOfOrder unable to be true.
    expect(sectionStructureIssues(['5.1', '5.6']).outOfOrder).toBe(false);
    expect(sectionStructureIssues(['5.6', '5.1']).outOfOrder).toBe(true);
  });
});
