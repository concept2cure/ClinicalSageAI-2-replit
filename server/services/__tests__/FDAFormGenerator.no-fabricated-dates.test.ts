/**
 * Regression guard (21 CFR Part 11): the SMART-forms generator must never
 * fabricate dates from the render clock or ship stale branding. Pins the fix in
 * "fix(fda-forms): stop fabricating dates + correct stale branding".
 */
import { describe, it, expect } from 'vitest';
import FDAFormGenerator from '../FDAFormGenerator';

describe('FDAFormGenerator — no fabricated dates or stale branding', () => {
  it('does not auto-stamp FDA_2891 signature_date from the system clock', async () => {
    const gen = new FDAFormGenerator();
    const out = await gen.generateSmartForm('FDA_2891', {});
    // signature_date has no source value and MUST stay blank, not become today.
    expect(out.formData.signature_date).toBe('');
    // Completeness must not be inflated by a fabricated required date
    // (FDA_2891 has 3 required fields, 0 filled from empty project data).
    expect(out.completeness).toBe(0);
  });

  it('uses current branding and embeds no wall-clock string in the generated HTML', async () => {
    const gen = new FDAFormGenerator();
    const out = await gen.generateSmartForm('FDA_2891', {});
    expect(out.htmlContent).toContain('Concept2Cure Regulatory Platform');
    expect(out.htmlContent).not.toContain('CERV2');
    // The fabricated "Submission Date"/"Form Generated" wall-clock lines are gone.
    expect(out.htmlContent).not.toMatch(/Submission Date:/);
    expect(out.htmlContent).not.toMatch(/Form Generated:/);
  });
});
