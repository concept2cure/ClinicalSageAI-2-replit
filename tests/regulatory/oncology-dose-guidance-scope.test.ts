/** FDA final guidance landing page observed 2026-10-30; see the dated source manifest. */
import { describe, expect, it } from 'vitest';
import { getProfile, renderProfileForPrompt } from '../../server/services/ana/therapeutic-area-profiles';

const profile = getProfile('oncology')!;
const prompt = renderProfileForPrompt(profile, { activeCtdSection: '2.5', onlyApplicableRules: true });

describe('oncology drafting carries dose-guidance scope rather than a universal trial rule', () => {
  it('does not impose a two-dose randomized trial on every oncology IND', () => {
    expect(prompt).not.toContain('randomized dose-finding (≥2 doses) is now expected');
    expect(prompt).not.toContain('Randomized dose-finding now expected before pivotal');
  });

  it('distinguishes first-in-human starting-dose selection from later dosage optimization', () => {
    const rule = profile.contextRules.find(row => row.id === 'onc-project-optimus-dose-finding')!;
    expect(rule.instruction).toMatch(/first-in-human.*starting.?dose/i);
    expect(rule.instruction).toMatch(/phase.*product.*population/i);
  });

  it('preserves the final guidance identity and its explicit product/population exclusions', () => {
    expect(prompt).toContain('August 2024');
    for (const term of ['radiopharmaceutical', 'cellular and gene therapy', 'oncolytic', 'microbiota', 'cancer vaccine', 'pediatric']) {
      expect(prompt.toLowerCase()).toContain(term);
    }
    expect(prompt).toContain('https://www.fda.gov/regulatory-information/search-fda-guidance-documents/optimizing-dosage-human-prescription-drugs-and-biological-products-treatment-oncologic-diseases');
  });
});
