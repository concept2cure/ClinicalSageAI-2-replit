/**
 * The section check's summary says what ran and what did not (2026-11-12, F1).
 * It listed six checks after "No flags" whatever ran, and never showed the
 * checks the server skipped.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { noFlagsSentence, notRunSentence } from '../sectionCheckSentences';

const CONSENT = 'Not run on an informed consent form, which is short plain language with no tables. It is checked against the 21 CFR 50.25 elements instead.';
const skipped = [
  { id: 'content_length', reason: CONSENT },
  { id: 'module_keywords', reason: 'No heuristic keyword profile is defined for document module "".' },
  { id: 'data_presence', reason: CONSENT },
  { id: 'structure', reason: CONSENT },
];

describe('the section check summary', () => {
  it('names the six checks only when every one ran (unchanged)', () => {
    expect(noFlagsSentence(6, [])).toBe('No flags. The section passed all 6 mechanical checks (length, module keywords, CTD elements where defined, tables, placeholders, structure) — this is not a review.');
  });

  it('with checks skipped, claims only the ones that ran', () => {
    expect(noFlagsSentence(1, skipped)).toBe('No flags from the 1 mechanical check that ran — this is not a review.');
    expect(noFlagsSentence(1, skipped)).not.toMatch(/length|tables|structure/);
    expect(noFlagsSentence(0, skipped)).toBe('No mechanical check ran on this section.');
  });

  it('says which did not run and why, each reason once', () => {
    const s = notRunSentence(skipped)!;
    expect(s.startsWith('Not run: length, module keywords, tables, structure. ')).toBe(true);
    expect(s.split(CONSENT)).toHaveLength(2);
    expect(notRunSentence([])).toBeNull();
    expect(notRunSentence(undefined)).toBeNull();
  });

  it('the Check panel uses both', () => {
    const src = readFileSync(join(__dirname, '..', 'DocumentWorkbench.tsx'), 'utf8');
    expect(src).toContain('{noFlagsSentence(check.checks_run, check.checks_skipped)}');
    expect(src).toContain('data-testid="section-check-not-run"');
    expect(src).not.toContain('(length, module keywords, CTD elements where defined, tables,');
  });
});
