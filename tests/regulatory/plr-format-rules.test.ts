/**
 * What AnA tells a labeling team about the PLR format, and what her section
 * guard checks, must match 21 CFR 201.57 (D2, 2026-10-04,
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04-depth/b1-plr-rules-elsa-facts.md):
 *   - assess_plr_structure said FPI may be 6-point "per 201.57(d)(8)"; (d)(6)
 *     sets 8 points, with 6 only on or within the dispensing package;
 *   - it cited the half-page Highlights limit as (d)(4), which is (d)(8), and
 *     omitted that the boxed warning is excluded from it;
 *   - it made Contents conditional on a one-page FPI; (b) has no condition;
 *   - it called "Initial U.S. Approval" a running header; (a)(3) places it on
 *     the line beneath the established name;
 *   - it marked Recent Major Changes required; (a)(5) lists a changed section
 *     for at least 1 year and then removes it;
 *   - the 20-line Highlights boxed-warning limit, (a)(4), appeared nowhere;
 *   - the US section guard passed a PI with no Highlights and no Contents.
 * And the Elsa note predates FDA's protocol-review use and Elsa 4.0.
 */
import { describe, it, expect } from 'vitest';
import { assessPLRStructure } from '../../server/services/labeling/labeling-intelligence-knowledge';
import { checkSectionGuard, requiredSectionHeaders } from '../../server/services/ana/labeling-authoring';
import { ELSA_NOTE, FDA_TECHNICAL_RULES, rulesByArea } from '../../server/services/ind/ctd/fda-technical-rules';
import { RESULT_BUDGET, fdaTechnicalRules } from '../../server/services/ana/regulatory-knowledge-tools';

const plr = assessPLRStructure({
  productType: 'prescription_drug',
  applicationType: 'NDA',
  therapeuticArea: 'oncology',
  hasBoxedWarning: true,
});

describe('assess_plr_structure formatting matches 21 CFR 201.57', () => {
  const fmt = JSON.stringify(plr.formattingRequirements);

  it('drops the wrong type size, paragraph citations and conditions', () => {
    expect(fmt).not.toMatch(/6-point type for Full Prescribing Information/);
    expect(fmt).not.toMatch(/201\.57\(d\)\(4\)/);
    expect(fmt).not.toMatch(/if FPI exceeds one page/);
    expect(fmt).not.toMatch(/[Rr]unning header/);
  });

  it('states the 20-line boxed-warning limit, (d)(6) type size and (d)(8) length', () => {
    expect(fmt).toMatch(/20 lines/);
    expect(fmt).toMatch(/201\.57\(d\)\(6\)/);
    expect(fmt).toMatch(/201\.57\(d\)\(8\)/);
  });

  it('Recent Major Changes is conditional, listed for at least 1 year', () => {
    const rmc = plr.highlightsStructure.find((s) => s.sectionNumber === 'H.2')!;
    expect(rmc.required).toBe(false);
    expect(rmc.contentGuidance).toMatch(/1 year/);
  });

  it('the Highlights boxed warning carries the 20-line limit', () => {
    const bw = plr.highlightsStructure.find((s) => s.sectionNumber === 'H.1')!;
    expect(bw.contentGuidance).toMatch(/20 lines/);
  });
});

describe('PLR format rules are regulator text', () => {
  it('lists the 201.57 format rules, each sourced to eCFR', () => {
    const rules = rulesByArea('labeling');
    expect(rules.length).toBeGreaterThanOrEqual(6);
    for (const r of rules) {
      expect(r.basis.confidence, r.id).toBe('regulator-text');
      expect(r.basis.url, r.id).toMatch(/^https:\/\/www\.ecfr\.gov\//);
    }
  });

  it('limits Recent Major Changes to the five sections (a)(5) names', () => {
    const rmc = rulesByArea('labeling').find((r) => r.id === 'plr-hl-rmc-one-year')!;
    expect(rmc.rule).toMatch(/Boxed Warning, Indications and Usage, Dosage and Administration, Contraindications, or Warnings and Precautions/);
  });

  it('puts the omitted-sections asterisk on the Contents heading, not on an omitted heading (b)', () => {
    const toc = rulesByArea('labeling').find((r) => r.id === 'plr-contents')!;
    expect(toc.rule).toMatch(/Contents"? heading is followed by an asterisk/);
    expect(toc.rule).not.toMatch(/the heading carries an asterisk/);
  });

  it('keeps the unfiltered brief and the labeling area within the result budget', () => {
    expect(fdaTechnicalRules({}).length).toBeLessThanOrEqual(RESULT_BUDGET);
    expect(fdaTechnicalRules({ area: 'labeling' }).length).toBeLessThanOrEqual(RESULT_BUDGET);
  });
});

describe('US section guard requires Highlights and Contents', () => {
  const us = requiredSectionHeaders('us');

  it('requires the Highlights heading, its verbatim statements and Contents', () => {
    expect(us).toContain('HIGHLIGHTS OF PRESCRIBING INFORMATION');
    expect(us).toContain('FULL PRESCRIBING INFORMATION: CONTENTS');
    expect(us.some((h) => h.startsWith('These highlights do not include all the information needed to use'))).toBe(true);
    expect(us.some((h) => h.startsWith('To report SUSPECTED ADVERSE REACTIONS'))).toBe(true);
    expect(us).toContain('Initial U.S. Approval');
  });

  it('fails a PI that has every FPI section but no Highlights or Contents', () => {
    const fpiOnly = us.filter((h) => /^\d+ /.test(h)).join('\n');
    const g = checkSectionGuard('us', fpiOnly);
    expect(g.complete).toBe(false);
    expect(g.missing).toContain('HIGHLIGHTS OF PRESCRIBING INFORMATION');
    expect(g.missing).toContain('FULL PRESCRIBING INFORMATION: CONTENTS');
  });
});

describe('the Elsa note is current', () => {
  it('records Elsa 4.0 and HALO from FDA’s May 2026 announcement', () => {
    expect(ELSA_NOTE.facts.some((f) => f.url === 'https://www.fda.gov/news-events/press-announcements/fda-expands-ai-capabilities-and-completes-data-platform-consolidation')).toBe(true);
    expect(ELSA_NOTE.facts.some((f) => /began integrating/i.test(f.text))).toBe(true);
  });

  it('records FDA’s use of Elsa for protocol reviews and inspection targets', () => {
    expect(ELSA_NOTE.facts.some((f) => /protocol review/i.test(f.text) && /inspection/i.test(f.text))).toBe(true);
  });

  it('rests the image-only PDF consequence on the specification, not a tool limit', () => {
    expect(FDA_TECHNICAL_RULES.find((r) => r.id === 'pdf-text')!.consequence).not.toMatch(/AI-assisted review tool/);
  });

  it('still says FDA has published no acceptance criteria for Elsa', () => {
    expect(ELSA_NOTE.guidance).toMatch(/no acceptance criteria for Elsa/);
  });
});
