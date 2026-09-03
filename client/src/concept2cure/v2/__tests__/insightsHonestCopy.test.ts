/**
 * The Reporting surface printed two things it had no right to print, both
 * confirmed live against a provisioned database on 2026-09-03:
 *
 *   1. "1 is 25% ready" / "How ready is 1 to file?" — a program with no `code`
 *      was named `String(projectId)`, putting a raw primary key into prose.
 *   2. "Your NDA is in agency review" — a static preset string asserting the
 *      reader's filing state, rendered to an organisation whose own home
 *      surface correctly reported no programs at all.
 *
 * Both are the same failure: a governed surface stating as fact something it
 * never read. These tests fail on either coming back.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { programName } from '../surfaces/Insights';

const SOURCE = readFileSync(
  resolve(__dirname, '../surfaces/Insights.tsx'),
  'utf8',
);

describe('programName — a database id is never a program name', () => {
  it('uses the code when one is recorded', () => {
    expect(programName({ code: 'IND-2026-001', label: 'Demo Program' }))
      .toBe('IND-2026-001');
  });

  it('falls back to the label the user gave the program, not its id', () => {
    expect(programName({ code: null, label: 'First-in-human IND' }))
      .toBe('First-in-human IND');
  });

  it('never returns a bare number', () => {
    for (const p of [
      { code: null, label: null },
      { code: null, label: '' },
      { code: '', label: '   ' },
      { code: '  ', label: undefined },
    ]) {
      const name = programName(p);
      expect(name).not.toMatch(/^\d+$/);
      expect(name.trim()).not.toBe('');
    }
  });

  it('trims rather than emitting whitespace as a name', () => {
    expect(programName({ code: '  NDA-9  ', label: 'x' })).toBe('NDA-9');
  });
});

describe('preset copy states what the pack is, never what the filing is doing', () => {
  /* Only the preset table is scanned — the comment block above it deliberately
     quotes the removed sentences so the fix stays explainable, and prose
     elsewhere may legitimately describe live, sourced facts. */
  const presetTable = SOURCE.slice(
    SOURCE.indexOf('const RO_PRESETS'),
    SOURCE.indexOf('const RO_PRESETS') > -1
      ? SOURCE.indexOf('};', SOURCE.indexOf('const RO_PRESETS'))
      : undefined,
  );

  it('has a preset table to check', () => {
    expect(presetTable.length).toBeGreaterThan(200);
  });

  it.each([
    [/\bYour\s+(NDA|BLA|MAA|IND|510\(k\)|submission|dossier)\b/i, 'claims the reader owns a specific filing'],
    [/\bis in agency review\b/i, 'claims a review status'],
    [/\bis mid-assembly\b/i, 'claims an assembly status'],
  ])('no preset %s (%s)', (pattern, _why) => {
    expect(presetTable).not.toMatch(pattern);
  });
});
