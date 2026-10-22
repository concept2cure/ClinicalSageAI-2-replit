/**
 * An unreadable stored leaf manifest is an error naming its sequence, never
 * "no prior leaves".
 *
 * What it used to do (until 2026-10-15): manifestToPriorLeaves returned [] for
 * a manifest that was not a list and skipped malformed entries, so a prior
 * sequence whose manifest could not be read contributed nothing to the filed
 * state, and leaves the agency already holds were re-filed with lifecycle
 * 'new' — failing open on a filing path.
 */
import { describe, it, expect } from 'vitest';
import { manifestToPriorLeaves } from '../sequence-manifest';

describe('manifestToPriorLeaves refuses what it cannot read', () => {
  it.each([
    ['not a list', { leaves: [] }],
    ['a string', 'not-json'],
    ['null', null],
  ])('%s: throws, naming sequence 0001', (_label, manifest) => {
    expect(() => manifestToPriorLeaves(manifest, '0001'), 'an unreadable manifest read as "no prior leaves"').toThrow(/sequence 0001/);
  });

  it.each([
    ['a non-object entry', [42]],
    ['an entry with no md5', [{ ctdSection: '2.5', fileName: 'o.pdf' }]],
    ['an entry with no section', [{ md5: 'x', fileName: 'o.pdf' }]],
    ['an entry with no file name or href', [{ ctdSection: '2.5', md5: 'x' }]],
  ])('%s: throws, naming the sequence and the entry', (_label, manifest) => {
    expect(() => manifestToPriorLeaves(manifest, '0003')).toThrow(/sequence 0003.*entry 0/);
  });

  it('a well-formed manifest still reads', () => {
    expect(manifestToPriorLeaves([{ ctdSection: '2.5', href: 'm2/25/o.pdf', md5: 'a' }], '0000')).toEqual([
      { ctdSection: '2.5', fileName: 'o.pdf', md5: 'a', href: 'm2/25/o.pdf' },
    ]);
  });
});
