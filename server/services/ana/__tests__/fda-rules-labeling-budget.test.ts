/**
 * list_fda_technical_rules('labeling') prints every 21 CFR 201.57 format rule
 * in full — rule, consequence, source, URL and platform note — and must fit
 * RESULT_BUDGET with room for the next rule (follow-up F11, D2 2026-10-05,
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
 * g-labeling-rules-budget-and-fonts-facts.md). At 4886 of 5000 characters the
 * next rule added to PLR_FORMAT_RULES would have pushed the result past the
 * budget; the headroom is set at 4500.
 *
 * Trimming must not cost a fact: every rule keeps its paragraph, the verbatim
 * text the section guard requires, and its eCFR source.
 */
import { describe, expect, it } from 'vitest';
import { RESULT_BUDGET, fdaTechnicalRules } from '../regulatory-knowledge-tools';
import { PLR_FORMAT_RULES } from '../../ind/ctd/fda-technical-rules';

const LABELING_HEADROOM = 4500;

describe('list_fda_technical_rules labeling area leaves headroom under RESULT_BUDGET', () => {
  const out = fdaTechnicalRules({ area: 'labeling' });

  it('renders the labeling area in at most 4500 of the 5000-character budget', () => {
    expect(RESULT_BUDGET).toBe(5000);
    expect(out.length).toBeLessThanOrEqual(LABELING_HEADROOM);
  });

  it('still prints every PLR rule with its paragraph, eCFR source and platform note', () => {
    const rules = JSON.parse(out).rules as Array<Record<string, string>>;
    expect(rules.map((r) => r.id)).toEqual(PLR_FORMAT_RULES.map((r) => r.id));
    for (const r of rules) {
      expect(r.source, r.id).toMatch(/^21 CFR 201\.57\(/);
      expect(r.url, r.id).toMatch(/^https:\/\/www\.ecfr\.gov\//);
      expect(r.if_missed.length, r.id).toBeGreaterThan(0);
      expect(r.platform_note.length, r.id).toBeGreaterThan(0);
    }
  });

  it('keeps each verbatim statement inside the rule that requires it', () => {
    for (const r of PLR_FORMAT_RULES) {
      if (r.verbatim) expect(r.rule, r.id).toContain(r.verbatim);
    }
  });

  it('keeps the limits the rules exist to state', () => {
    const byId = Object.fromEntries(PLR_FORMAT_RULES.map((r) => [r.id, r.rule]));
    expect(byId['plr-hl-boxed-warning']).toMatch(/20 lines/);
    expect(byId['plr-hl-rmc-one-year']).toMatch(/at least 1 year/);
    expect(byId['plr-type-size']).toMatch(/8-point/);
    expect(byId['plr-type-size']).toMatch(/6-point/);
    expect(byId['plr-hl-length']).toMatch(/one-half of an 8½ by 11 inch page/);
  });
});
