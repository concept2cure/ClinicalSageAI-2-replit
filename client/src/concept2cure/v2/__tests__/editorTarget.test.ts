// @vitest-environment jsdom
/**
 * The editor deep-link channel (window.C2C_EDITOR_TARGET).
 *
 * What must hold, and why:
 *   • set → peek round-trips a normalized target; consume reads AND clears —
 *     the channel is one-shot, so a target can describe exactly one click.
 *   • Stale-context safety: an entry older than the TTL (or stamped in the
 *     future) is refused. A navigation that never completed must not ambush a
 *     visit to the editor hours later — the same hazard `convoEpoch` guards on
 *     the C2C_CONVO channel.
 *   • Garbage on the window never throws and never becomes a claim: peek
 *     vouches for the shape or returns null.
 *   • Section matching FAILS CLOSED: a null/empty authored code never matches
 *     a code (the findSectionForNode rule — a wrong section under the right
 *     name is worse than a miss), and code match outranks label match.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  EDITOR_TARGET_TTL_MS,
  clearEditorTarget,
  consumeEditorTarget,
  describeEditorTarget,
  matchEditorTargetSection,
  peekEditorTarget,
  setEditorTarget,
} from '../editorTarget';

afterEach(() => clearEditorTarget());

describe('set / peek / consume / clear', () => {
  it('round-trips a target, normalizing code to a trimmed string', () => {
    setEditorTarget({
      docType: 'k510',
      code: 11,
      label: '  Substantial Equivalence Discussion ',
      programId: 'prog-1',
      programTitle: 'BX-204 CGM',
    });
    const t = peekEditorTarget();
    expect(t).not.toBeNull();
    expect(t!.docType).toBe('k510');
    expect(t!.sectionCode).toBe('11');
    expect(t!.sectionLabel).toBe('Substantial Equivalence Discussion');
    expect(t!.programId).toBe('prog-1');
    expect(t!.programTitle).toBe('BX-204 CGM');
    expect(typeof t!.setAt).toBe('number');
  });

  it('peek does not clear; consume does', () => {
    setEditorTarget({ docType: 'cer', code: 'A3', label: 'Clinical data' });
    expect(peekEditorTarget()).not.toBeNull();
    expect(peekEditorTarget()).not.toBeNull(); // still there — peek is pure
    expect(consumeEditorTarget()).not.toBeNull();
    expect(peekEditorTarget()).toBeNull(); // one-shot: consumed
    expect(window.C2C_EDITOR_TARGET).toBeUndefined();
  });

  it('clear removes a pending target', () => {
    setEditorTarget({ docType: 'pma', label: 'Nonclinical studies' });
    clearEditorTarget();
    expect(peekEditorTarget()).toBeNull();
  });

  it('empty/whitespace section fields normalize to null rather than empty claims', () => {
    setEditorTarget({ docType: 'ivdr', code: '   ', label: '' });
    const t = peekEditorTarget();
    expect(t).not.toBeNull();
    expect(t!.sectionCode).toBeNull();
    expect(t!.sectionLabel).toBeNull();
  });
});

describe('stale-context safety', () => {
  it('refuses a target older than the TTL, honours one inside it', () => {
    setEditorTarget({ docType: 'k510', code: 11 });
    const setAt = window.C2C_EDITOR_TARGET!.setAt;
    expect(peekEditorTarget(setAt + EDITOR_TARGET_TTL_MS - 1)).not.toBeNull();
    expect(peekEditorTarget(setAt + EDITOR_TARGET_TTL_MS + 1)).toBeNull();
  });

  it('refuses a target stamped in the future (an untrustworthy clock)', () => {
    setEditorTarget({ docType: 'k510', code: 11 });
    const setAt = window.C2C_EDITOR_TARGET!.setAt;
    expect(peekEditorTarget(setAt - EDITOR_TARGET_TTL_MS - 1)).toBeNull();
  });

  it('consume clears even a stale or malformed entry — nothing lingers', () => {
    setEditorTarget({ docType: 'k510', code: 11 });
    const setAt = window.C2C_EDITOR_TARGET!.setAt;
    expect(consumeEditorTarget(setAt + EDITOR_TARGET_TTL_MS + 1)).toBeNull();
    expect(window.C2C_EDITOR_TARGET).toBeUndefined();
  });
});

describe('hostile / malformed window values', () => {
  it.each([
    ['a string', 'k510'],
    ['a number', 42],
    ['an empty object', {}],
    ['an unknown docType', { docType: 'bla', setAt: Date.now() }],
    ['a missing setAt', { docType: 'k510' }],
    ['a non-numeric setAt', { docType: 'k510', setAt: 'now' }],
  ])('%s on the window is refused without throwing', (_name, value) => {
    (window as unknown as { C2C_EDITOR_TARGET?: unknown }).C2C_EDITOR_TARGET = value;
    expect(peekEditorTarget()).toBeNull();
    expect(consumeEditorTarget()).toBeNull();
  });
});

describe('matchEditorTargetSection', () => {
  const sections = [
    { id: 'S0', code: null, title: 'Untitled preamble', },
    { id: 'S1', code: '3.2.S.1', title: 'General Information' },
    { id: 'S2', code: '011', title: 'Substantial Equivalence Discussion' },
    { id: 'S3', code: 'A3', title: 'Clinical Data — Literature' },
  ] as const;

  it('matches by exact code, case-insensitively', () => {
    const m = matchEditorTargetSection(sections, { sectionCode: 'a3', sectionLabel: null });
    expect(m?.id).toBe('S3');
  });

  it('matches numerically when formats differ (11 vs 011)', () => {
    const m = matchEditorTargetSection(sections, { sectionCode: '11', sectionLabel: null });
    expect(m?.id).toBe('S2');
  });

  it('falls back to a normalized label match', () => {
    const m = matchEditorTargetSection(sections, {
      sectionCode: '99',
      sectionLabel: 'clinical data:  literature',
    });
    expect(m?.id).toBe('S3');
  });

  it('prefers the code match over a label match', () => {
    const m = matchEditorTargetSection(sections, {
      sectionCode: '3.2.S.1',
      sectionLabel: 'Substantial Equivalence Discussion',
    });
    expect(m?.id).toBe('S1');
  });

  it('a null authored code never matches — fail closed', () => {
    // 'null' the string, NaN-ish inputs, empty targets: none may land on S0.
    expect(matchEditorTargetSection(sections, { sectionCode: 'null', sectionLabel: null })).toBeNull();
    expect(matchEditorTargetSection(sections, { sectionCode: null, sectionLabel: null })).toBeNull();
    expect(matchEditorTargetSection(sections, { sectionCode: '', sectionLabel: '' })).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(
      matchEditorTargetSection(sections, { sectionCode: 'ZZ', sectionLabel: 'No Such Section' }),
    ).toBeNull();
  });
});

describe('describeEditorTarget', () => {
  it('names what it can and claims nothing it cannot', () => {
    expect(describeEditorTarget({ sectionCode: '11', sectionLabel: 'SE Discussion' })).toBe(
      '“SE Discussion” (section 11)',
    );
    expect(describeEditorTarget({ sectionCode: null, sectionLabel: 'SE Discussion' })).toBe(
      '“SE Discussion”',
    );
    expect(describeEditorTarget({ sectionCode: '11', sectionLabel: null })).toBe('section 11');
    expect(describeEditorTarget({ sectionCode: null, sectionLabel: null })).toBe(
      'the requested section',
    );
  });
});
