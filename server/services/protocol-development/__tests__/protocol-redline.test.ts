/**
 * Tests for the section-level protocol redline. The redline is the tracked-changes
 * comparison an amendment package carries (EU CTR substantial modification, 21 CFR
 * 312.30, IRB amendment): every change kind is detected by section_key, a modified
 * section's ops rebuild BOTH texts exactly and are minimal, a status change alone is
 * not a modification, null reads as '', the line cap is disclosed (never a silent
 * truncation), removed sections sit at their earlier position, and the output is
 * byte-identical across calls. Fixtures are built inline in the exact shape
 * `snapshotVersionTx` writes: { version, sections: [{ section_key, title, content,
 * status, order_index }] }.
 */

import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_REDLINE_BASIS,
  REDLINE_EDIT_BUDGET,
  REDLINE_LINE_CAP,
  ProtocolRedlineError,
  redlineVersions,
  splitContentLines,
  type ProtocolRedline,
  type ProtocolSnapshot,
  type ProtocolSnapshotSection,
  type RedlineOp,
  type RedlineSection,
} from '../protocol-redline';

function sec(key: string, title: string, content: string | null, order: number, status = 'draft'): ProtocolSnapshotSection {
  return { section_key: key, title, content, status, order_index: order };
}

function snap(version: string, sections: ProtocolSnapshotSection[]): ProtocolSnapshot {
  return { version, sections };
}

/** The test's own reconstruction — independent of the engine. */
function rebuild(diff: RedlineOp[], side: 'before' | 'after'): string {
  const skip = side === 'before' ? 'insert' : 'delete';
  return diff.filter((o) => o.op !== skip).map((o) => o.text).join('\n');
}

/** Lines carried by ops of one kind: each op's text is its lines joined by '\n'. */
function opLines(diff: RedlineOp[], op: RedlineOp['op']): number {
  return diff.filter((o) => o.op === op).reduce((n, o) => n + o.text.split('\n').length, 0);
}

/** Oracle: length of a longest common subsequence (small inputs only). */
function lcsLength(a: string[], b: string[]): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(row[j], row[j - 1]);
      diag = up;
    }
  }
  return row[b.length];
}

function only(redline: ProtocolRedline, key: string): RedlineSection {
  const found = redline.sections.filter((s) => s.sectionKey === key);
  expect(found, `exactly one section "${key}"`).toHaveLength(1);
  return found[0];
}

function pair(beforeText: string | null, afterText: string | null): RedlineSection {
  return only(redlineVersions(snap('1.0', [sec('s', 'S', beforeText, 0)]), snap('1.1', [sec('s', 'S', afterText, 0)])), 's');
}

function pairTitled(titleBefore: string, titleAfter: string, a: string, b: string): RedlineSection {
  return only(redlineVersions(snap('1.0', [sec('s', titleBefore, a, 0)]), snap('1.1', [sec('s', titleAfter, b, 0)])), 's');
}

function lines(prefix: string, n: number, interleaveBlank = false): string {
  return Array.from({ length: n }, (_, i) => (interleaveBlank ? `${prefix}${i}\n` : `${prefix}${i}`)).join('\n');
}

describe('redlineVersions — each change kind, matched by section_key', () => {
  const before = snap('1.0', [
    sec('synopsis', 'Synopsis', 'Adults aged 18-65.\nSingle centre.', 0),
    sec('eligibility', 'Eligibility', 'Inclusion: HbA1c >= 7%.', 1),
    sec('objectives', 'Objectives', 'Primary: HbA1c change.', 2),
    sec('stats', 'Statistics', 'ANCOVA.', 3),
    sec('safety', 'Safety', 'SAEs reported in 24h.', 4),
    sec('appendix', 'Appendix', 'Old appendix.', 5),
  ]);
  const after = snap('1.1', [
    sec('synopsis', 'Synopsis', 'Adults aged 18-70.\nSingle centre.', 0),
    sec('eligibility', 'Eligibility', 'Inclusion: HbA1c >= 7%.', 1),
    sec('stats', 'Statistics', 'ANCOVA.', 2),
    sec('objectives', 'Objectives', 'Primary: HbA1c change.', 3),
    sec('safety', 'Safety Reporting', 'SAEs reported in 24h.', 4),
    sec('dct', 'Decentralised elements', 'Home nursing visits.', 5),
  ]);
  const red = redlineVersions(before, after);

  it('an edited section is modified, with a diff and exact counts', () => {
    const s = only(red, 'synopsis');
    expect(s.change).toBe('modified');
    expect(s.diff).toEqual([
      { op: 'delete', text: 'Adults aged 18-65.' },
      { op: 'insert', text: 'Adults aged 18-70.' },
      { op: 'equal', text: 'Single centre.' },
    ]);
    expect(s.counts).toEqual({ inserted: 1, deleted: 1 });
  });

  it('identical content, title and position is unchanged, with zero counts and no diff', () => {
    const s = only(red, 'eligibility');
    expect(s).toMatchObject({ change: 'unchanged', moved: false, counts: { inserted: 0, deleted: 0 } });
    expect(s.diff).toBeUndefined();
  });

  it('a section only in the later version is added, every line inserted', () => {
    const s = only(red, 'dct');
    expect(s).toMatchObject({ change: 'added', statusAfter: 'draft', diff: [{ op: 'insert', text: 'Home nursing visits.' }], counts: { inserted: 1, deleted: 0 } });
    expect(s.statusBefore).toBeUndefined();
  });

  it('a section only in the earlier version is removed, every line deleted', () => {
    const s = only(red, 'appendix');
    expect(s).toMatchObject({ change: 'removed', title: 'Appendix', statusBefore: 'draft', diff: [{ op: 'delete', text: 'Old appendix.' }], counts: { inserted: 0, deleted: 1 } });
  });

  it('same content, new title is retitled and carries the old title', () => {
    expect(only(red, 'safety')).toMatchObject({ change: 'retitled', title: 'Safety Reporting', titleBefore: 'Safety' });
  });

  it('swapping two sections reports exactly one of them reordered (the fewest moves)', () => {
    const moved = [only(red, 'stats'), only(red, 'objectives')].filter((s) => s.change === 'reordered');
    expect(moved).toHaveLength(1);
    expect(moved[0].moved).toBe(true);
    expect(red.summary).toMatchObject({ modified: 1, added: 1, removed: 1, reordered: 1, retitled: 1, unchanged: 2, moved: 1 });
  });

  it('carries the version labels and the regulatory basis', () => {
    expect(red.from).toBe('1.0');
    expect(red.to).toBe('1.1');
    expect(red.basis).toBe(PROTOCOL_REDLINE_BASIS);
    expect(PROTOCOL_REDLINE_BASIS).toMatch(/EU CTR 536\/2014/);
    expect(PROTOCOL_REDLINE_BASIS).toMatch(/21 CFR 312\.30/);
    expect(PROTOCOL_REDLINE_BASIS).toMatch(/ICH E6\(R3\)/);
  });
});

describe('redlineVersions — secondary facts are never hidden by the precedence', () => {
  it('a status change alone is reported and is NOT a modification', () => {
    const red = redlineVersions(snap('1.0', [sec('a', 'A', 'Text.', 0, 'draft')]), snap('1.1', [sec('a', 'A', 'Text.', 0, 'complete')]));
    expect(only(red, 'a')).toMatchObject({ change: 'unchanged', statusBefore: 'draft', statusAfter: 'complete' });
    expect(red.summary).toMatchObject({ modified: 0, unchanged: 1, statusChanged: 1 });
  });

  it('edited AND retitled is modified with titleBefore', () => {
    expect(pairTitled('Old', 'New', 'x', 'y')).toMatchObject({ change: 'modified', title: 'New', titleBefore: 'Old' });
  });

  it('edited AND moved is modified with moved: true, counted in summary.moved not reordered', () => {
    const before = snap('1.0', [sec('a', 'A', 'one', 0), sec('b', 'B', 'two', 1), sec('c', 'C', 'three', 2)]);
    const after = snap('1.1', [sec('c', 'C', 'THREE', 0), sec('a', 'A', 'one', 1), sec('b', 'B', 'two', 2)]);
    const red = redlineVersions(before, after);
    expect(only(red, 'c')).toMatchObject({ change: 'modified', moved: true });
    expect(red.summary).toMatchObject({ modified: 1, reordered: 0, unchanged: 2, moved: 1 });
  });

  it('moving one section to the front flags only that section, not the ones it passed', () => {
    const before = snap('1.0', ['a', 'b', 'c', 'd'].map((k, i) => sec(k, k, k, i)));
    const after = snap('1.1', ['d', 'a', 'b', 'c'].map((k, i) => sec(k, k, k, i)));
    const red = redlineVersions(before, after);
    expect(red.sections.map((s) => [s.sectionKey, s.change])).toEqual([['d', 'reordered'], ['a', 'unchanged'], ['b', 'unchanged'], ['c', 'unchanged']]);
  });

  it('adding and removing neighbours does not make the survivors reordered', () => {
    const before = snap('1.0', [sec('x', 'X', 'x', 0), sec('a', 'A', 'a', 1), sec('b', 'B', 'b', 2)]);
    const after = snap('1.1', [sec('a', 'A', 'a', 0), sec('n', 'N', 'n', 1), sec('b', 'B', 'b', 2)]);
    expect(redlineVersions(before, after).summary).toMatchObject({ reordered: 0, moved: 0, unchanged: 2, added: 1, removed: 1 });
  });

  it('a move that rests only on order_index ties says so', () => {
    const before = snap('1.0', [sec('a', 'A', 'a', 0), sec('b', 'B', 'b', 0)]);
    const after = snap('1.1', [sec('b', 'B', 'b', 0), sec('a', 'A', 'a', 0)]);
    const movedSections = redlineVersions(before, after).sections.filter((s) => s.moved);
    expect(movedSections).toHaveLength(1);
    expect(movedSections[0].note).toMatch(/shares its order_index/);
    expect(movedSections[0].note).toMatch(/row order/);
  });
});

describe('redlineVersions — the diff rebuilds both texts exactly, and is minimal', () => {
  const pairs: Array<[string, string, string]> = [
    ['empty → non-empty', '', 'Line one\nLine two'],
    ['non-empty → empty', 'Line one\nLine two', ''],
    ['trailing newline removed', 'a\nb\n', 'a\nb'],
    ['trailing newline added', 'a\nb', 'a\nb\n'],
    ['duplicated lines', 'x\nx\nx', 'x\nx'],
    ['duplicated lines interleaved', 'x\ny\nx\ny', 'y\nx\ny\nx'],
    ['only blank lines', '\n\n', '\n'],
    ['CRLF → LF', 'a\r\nb', 'a\nb'],
    ['insert, delete and replace', 'one\ntwo\nthree', 'zero\none\nthree\nfour'],
    ['no line in common', 'A\nB\nC\nD', 'Q\nR\nS'],
    ['blank-line paragraphs', 'same\n\nsame', '\n\nsame\n'],
    ['edit between a common head and tail', 'intro\nold\noutro\n', 'intro\nnew\nnewer\noutro\n'],
    ['repeated line at both ends', 'x\ny\nx', 'x\nx\ny\nx'],
  ];

  for (const [label, beforeText, afterText] of pairs) {
    it(label, () => {
      const s = pair(beforeText, afterText);
      expect(s.change).toBe('modified');
      const diff = s.diff as RedlineOp[];
      expect(rebuild(diff, 'before')).toBe(beforeText);
      expect(rebuild(diff, 'after')).toBe(afterText);
      expect(s.counts).toEqual({ inserted: opLines(diff, 'insert'), deleted: opLines(diff, 'delete') });
      const a = splitContentLines(beforeText);
      const b = splitContentLines(afterText);
      const common = lcsLength(a, b);
      expect(s.counts).toEqual({ inserted: b.length - common, deleted: a.length - common });
    });
  }

  it('the line rule: null and "" are zero lines, a trailing newline is a final empty line', () => {
    expect(splitContentLines(null)).toEqual([]);
    expect(splitContentLines('')).toEqual([]);
    expect(splitContentLines('a\n')).toEqual(['a', '']);
  });
});

describe('redlineVersions — null content reads as ""', () => {
  it('null → "" and "" → null are unchanged', () => {
    expect(pair(null, '').change).toBe('unchanged');
    expect(pair('', null).change).toBe('unchanged');
    expect(pair(null, null).change).toBe('unchanged');
  });

  it('null → text is modified with every line inserted; text → null every line deleted', () => {
    expect(pair(null, 'x\ny')).toMatchObject({ change: 'modified', diff: [{ op: 'insert', text: 'x\ny' }], counts: { inserted: 2, deleted: 0 } });
    expect(pair('x', null)).toMatchObject({ change: 'modified', diff: [{ op: 'delete', text: 'x' }], counts: { inserted: 0, deleted: 1 } });
  });

  it('a section added with no content is added with an empty diff and zero counts', () => {
    const red = redlineVersions(snap('1.0', []), snap('1.1', [sec('n', 'New', null, 0)]));
    expect(only(red, 'n')).toMatchObject({ change: 'added', diff: [], counts: { inserted: 0, deleted: 0 } });
  });
});

describe('redlineVersions — summary is consistent with the sections', () => {
  const before = snap('2.0', [sec('a', 'A', 'one\ntwo', 0), sec('b', 'B', 'gone\ngone too', 1), sec('c', 'C', 'c', 2), sec('d', 'D', 'd', 3)]);
  const after = snap('2.1', [sec('a', 'A', 'one\n2\nthree', 0), sec('d', 'D', 'd', 1), sec('c', 'C2', 'c', 2), sec('e', 'E', 'new\nnew', 3)]);
  const red = redlineVersions(before, after);

  it('every key of either version appears exactly once', () => {
    const keys = red.sections.map((s) => s.sectionKey).sort();
    expect(keys).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('kind counts add up to the sections, and line totals are the sums of the counts', () => {
    const { summary } = red;
    expect(summary.modified + summary.added + summary.removed + summary.reordered + summary.retitled + summary.unchanged).toBe(red.sections.length);
    for (const kind of ['modified', 'added', 'removed', 'reordered', 'retitled', 'unchanged'] as const) {
      expect(summary[kind], kind).toBe(red.sections.filter((s) => s.change === kind).length);
    }
    expect(summary.linesInserted).toBe(red.sections.reduce((n, s) => n + (s.counts?.inserted ?? 0), 0));
    expect(summary.linesDeleted).toBe(red.sections.reduce((n, s) => n + (s.counts?.deleted ?? 0), 0));
    expect(summary).toMatchObject({ linesInserted: 4, linesDeleted: 3, sectionsWithoutCounts: [] });
  });
});

describe('redlineVersions — output order', () => {
  it('follows the later version; a removed section follows its nearest surviving predecessor', () => {
    const before = snap('1.0', [sec('a', 'A', 'a', 0), sec('x', 'X', 'x', 1), sec('b', 'B', 'b', 2), sec('y', 'Y', 'y', 3), sec('z', 'Z', 'z', 4)]);
    const after = snap('1.1', [sec('b', 'B', 'b', 0), sec('a', 'A', 'a', 1), sec('c', 'C', 'c', 2)]);
    expect(redlineVersions(before, after).sections.map((s) => s.sectionKey)).toEqual(['b', 'y', 'z', 'a', 'x', 'c']);
  });

  it('a removed section with no surviving predecessor goes first', () => {
    const before = snap('1.0', [sec('r1', 'R1', 'r', 0), sec('r2', 'R2', 'r', 1), sec('a', 'A', 'a', 2)]);
    const after = snap('1.1', [sec('n', 'N', 'n', 0), sec('a', 'A', 'a', 1)]);
    expect(redlineVersions(before, after).sections.map((s) => [s.sectionKey, s.change])).toEqual([
      ['r1', 'removed'], ['r2', 'removed'], ['n', 'added'], ['a', 'unchanged'],
    ]);
  });

  it('order comes from order_index, not the order rows are listed in', () => {
    const before = snap('1.0', [sec('b', 'B', 'b', 1), sec('a', 'A', 'a', 0)]);
    const after = snap('1.1', [sec('a', 'A', 'a', 0), sec('b', 'B', 'b', 1)]);
    const red = redlineVersions(before, after);
    expect(red.sections.map((s) => s.sectionKey)).toEqual(['a', 'b']);
    expect(red.summary).toMatchObject({ unchanged: 2, reordered: 0, moved: 0 });
  });
});

describe('redlineVersions — line cap and edit budget: disclosed, never truncated', () => {
  const big = lines('line ', REDLINE_LINE_CAP + 1);

  it('above the cap: modified, no diff, exact counts when cheap, and a note', () => {
    const edited = big.replace('line 2500\n', 'line 2500 amended\n');
    const s = pair(big, edited);
    expect(s.change).toBe('modified');
    expect(s.diff).toBeUndefined();
    expect(s.counts).toEqual({ inserted: 1, deleted: 1 });
    expect(s.note).toMatch(new RegExp(`${REDLINE_LINE_CAP}-line cap`));
    expect(s.note).toMatch(/nothing was truncated/);
  });

  it('exactly at the cap the diff is produced and rebuilds both texts', () => {
    const atCap = lines('line ', REDLINE_LINE_CAP);
    const edited = `${atCap.replace('line 10\n', '')}\nappended`;
    const s = pair(atCap, edited);
    expect(s.note).toBeUndefined();
    expect(rebuild(s.diff as RedlineOp[], 'before')).toBe(atCap);
    expect(rebuild(s.diff as RedlineOp[], 'after')).toBe(edited);
    expect(s.counts).toEqual({ inserted: 1, deleted: 1 });
  });

  it('an added or removed section above the cap keeps exact counts, drops the diff, says why', () => {
    const red = redlineVersions(snap('1.0', [sec('old', 'Old', big, 0)]), snap('1.1', [sec('new', 'New', big, 0)]));
    expect(only(red, 'new')).toMatchObject({ change: 'added', counts: { inserted: REDLINE_LINE_CAP + 1, deleted: 0 } });
    expect(only(red, 'old')).toMatchObject({ change: 'removed', counts: { inserted: 0, deleted: REDLINE_LINE_CAP + 1 } });
    for (const s of red.sections) {
      expect(s.diff).toBeUndefined();
      expect(s.note).toMatch(/cap/);
    }
  });

  it('above the cap with no cheap exact count: counts omitted, summary totals null (never a partial sum)', () => {
    const s = pair(lines('p', 2600, true), lines('q', 2600, true));
    expect(s).toMatchObject({ change: 'modified' });
    expect(s.counts).toBeUndefined();
    expect(s.note).toMatch(/omitted rather than estimated/);
    const red = redlineVersions(
      snap('1.0', [sec('s', 'S', lines('p', 2600, true), 0), sec('t', 'T', 'a', 1)]),
      snap('1.1', [sec('s', 'S', lines('q', 2600, true), 0), sec('t', 'T', 'b', 1)]),
    );
    expect(red.summary).toMatchObject({ linesInserted: null, linesDeleted: null, sectionsWithoutCounts: ['s'] });
  });

  // n rewritten paragraphs separated by shared blank lines: a minimal diff of 2n edits.
  const past = REDLINE_EDIT_BUDGET / 2 + 50;
  const within = REDLINE_EDIT_BUDGET / 2 - 50;

  it(`under the cap but past ${REDLINE_EDIT_BUDGET} edits: no diff, no counts, a note`, () => {
    const a = lines('p', past, true);
    expect(splitContentLines(a).length).toBeLessThanOrEqual(REDLINE_LINE_CAP);
    const s = pair(a, lines('q', past, true));
    expect(s.change).toBe('modified');
    expect(s.diff).toBeUndefined();
    expect(s.counts).toBeUndefined();
    expect(s.note).toMatch(new RegExp(`more than ${REDLINE_EDIT_BUDGET} line edits`));
    expect(s.note).not.toMatch(/cap/);
  });

  it('a large rewrite within the budget is still diffed exactly', () => {
    const a = lines('p', within, true);
    const b = lines('q', within, true);
    const s = pair(a, b);
    expect(rebuild(s.diff as RedlineOp[], 'before')).toBe(a);
    expect(rebuild(s.diff as RedlineOp[], 'after')).toBe(b);
    expect(s.counts).toEqual({ inserted: within, deleted: within });
  });
});

describe('redlineVersions — determinism and purity', () => {
  function deepFreeze<T>(o: T): T {
    if (o && typeof o === 'object') {
      Object.values(o as Record<string, unknown>).forEach(deepFreeze);
      Object.freeze(o);
    }
    return o;
  }

  it('the same inputs give byte-identical output, and inputs are not mutated', () => {
    const make = () => [
      snap('1.0', [sec('b', 'B', 'one\ntwo', 1), sec('a', 'A', 'x', 0), sec('r', 'R', 'gone', 2)]),
      snap('1.1', [sec('a', 'A', 'x', 1), sec('b', 'B2', 'one\n2', 0), sec('n', 'N', null, 2)]),
    ] as const;
    const [b1, a1] = make();
    const first = redlineVersions(deepFreeze(b1), deepFreeze(a1));
    const [b2, a2] = make();
    const second = redlineVersions(b2, a2);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(b2).toEqual(make()[0]);
    expect(a2).toEqual(make()[1]);
  });
});

describe('redlineVersions — a snapshot that cannot be compared fails closed', () => {
  it('a section_key recorded twice is refused, not guessed at', () => {
    const bad = snap('1.0', [sec('a', 'A', 'one', 0), sec('a', 'A again', 'two', 1)]);
    expect(() => redlineVersions(bad, snap('1.1', []))).toThrow(ProtocolRedlineError);
    try {
      redlineVersions(bad, snap('1.1', []));
    } catch (err) {
      expect(err).toMatchObject({ code: 'INVALID_STATE' });
      expect((err as ProtocolRedlineError).message).toMatch(/version 1\.0 records section_key "a" 2 times/);
    }
  });

  it('malformed rows in either version are all listed', () => {
    const before = { version: '1.0', sections: [{ title: 'No key', content: 'x', status: 'draft', order_index: 0 }] } as unknown as ProtocolSnapshot;
    const after = { version: '1.1', sections: [{ section_key: 'a', title: 'A', content: 42, status: 'draft', order_index: 'first' }] } as unknown as ProtocolSnapshot;
    try {
      redlineVersions(before, after);
      expect.unreachable('a malformed snapshot must throw');
    } catch (err) {
      const problems = (err as ProtocolRedlineError).problems;
      expect(problems).toEqual([
        'version 1.0 section row 1 has no section_key',
        'version 1.1 section "a" has content that is neither text nor null',
        'version 1.1 section "a" has no numeric order_index',
      ]);
    }
  });

  it('a snapshot with no sections list is refused rather than read as empty', () => {
    const noSections = { version: '1.0' } as unknown as ProtocolSnapshot;
    expect(() => redlineVersions(noSections, snap('1.1', []))).toThrow(/has no sections list/);
  });
});
