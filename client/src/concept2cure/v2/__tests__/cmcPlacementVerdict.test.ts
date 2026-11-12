/**
 * What the CMC board says after "Place into the submission".
 *
 * 2026-11-12 (CMC walked in the running app): a successful placement showed nothing (the control was remounted and
 * lost its verdict), and a repeat said "21 sections placed into the submission (21 updated in place)". Since the
 * same day the server answers `unchanged: true` for a section whose leaf already files exactly this text, and writes
 * nothing for it; the words must say that, and not call an untouched section "placed".
 */
import { describe, expect, it } from 'vitest';
import { placementWords, rememberPlacement, recallPlacement, forgetPlacement } from '../surfaces/CmcPlaceIntoSubmission';

const row = (sectionKey: string, extra: { updatedInPlace?: boolean; unchanged?: boolean } = {}) =>
  ({ sectionKey, leafSectionCode: `m${sectionKey}`, leafId: 1, title: sectionKey, ...extra });

describe('placementWords', () => {
  it('a first placement: every section placed', () => {
    expect(placementWords({ placements: [row('3.2.S.1'), row('3.2.P.1')], skipped: [] })).toEqual({
      title: '2 sections placed into the submission', detail: 'm3.2.S.1, m3.2.P.1',
    });
  });

  it('a repeat with nothing changed: already placed, nothing written', () => {
    const words = placementWords({ placements: [row('3.2.S.1', { unchanged: true }), row('3.2.P.1', { unchanged: true })], skipped: [] });
    expect(words.title).toBe('Already placed. Nothing was written.');
    expect(words.detail).toBe('Both sections in this sequence are unchanged.');
  });

  it('a repeat after a change: the changed section is filed again, the rest are unchanged', () => {
    const words = placementWords({
      placements: [row('3.2.P.8', { updatedInPlace: true }), row('3.2.S.1', { unchanged: true }), row('3.2.S.7', { unchanged: true })], skipped: [],
    });
    expect(words.title).toBe('1 section filed again; 2 unchanged');
    expect(words.detail).toBe('Filed again: m3.2.P.8');
  });

  it('new sections beside unchanged ones, and what was skipped', () => {
    const words = placementWords({
      placements: [row('3.2.A.1'), row('3.2.S.1', { unchanged: true })], skipped: [{ sectionKey: '3.2.P.2', reason: 'no compiled narrative' }],
    });
    expect(words.title).toBe('1 section placed; 1 unchanged');
    expect(words.detail).toBe('Placed: m3.2.A.1 · skipped: §3.2.P.2 (no compiled narrative)');
  });
});

describe('the last placement of a project stays on screen across a remount', () => {
  it('is shown again with nothing chosen or the same sequence chosen, hidden for another sequence, and forgotten on request', () => {
    const verdict = { ok: true as const, outcome: { placements: [row('3.2.S.1', { unchanged: true })], skipped: [] } };
    const shown = rememberPlacement('p1', { id: 16, sequenceNumber: '0001' }, verdict);
    expect(recallPlacement('p1', null)).toBe(shown);
    expect(recallPlacement('p1', 16)).toBe(shown);
    expect(recallPlacement('p1', 17)).toBeNull();
    expect(recallPlacement('p2', null)).toBeNull();
    forgetPlacement('p1');
    expect(recallPlacement('p1', 16)).toBeNull();
  });

  it('names the sequence it was made into, since nothing may be chosen when it is shown again', () => {
    expect(placementWords({ placements: [row('3.2.S.1', { unchanged: true })], skipped: [] }, '0001').detail).toBe('The section in sequence 0001 is unchanged.');
    expect(placementWords({ placements: [row('3.2.S.1')], skipped: [] }, '0001')).toEqual({ title: '1 section placed into the submission', detail: 'm3.2.S.1 · sequence 0001' });
    expect(placementWords({ placements: [row('3.2.P.8', { updatedInPlace: true }), row('3.2.S.1', { unchanged: true })], skipped: [] }, '0001').title)
      .toBe('1 section filed again; 1 unchanged, in sequence 0001');
  });
});
