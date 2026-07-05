/**
 * IVD/IVDR first-class completeness — the dedicated requirements branch added so
 * IVD is no longer folded into the device checklist. Verifies the IVDR technical
 * file surfaces its distinctive requirements (Performance Evaluation Report,
 * GSPR, analytical + clinical performance) and that the device branch is
 * unaffected (regression).
 */

import { describe, it, expect } from 'vitest';
import { ValidateCompletenessEngine } from '../validate-completeness-engine';

const engine = new ValidateCompletenessEngine();

describe('IVDR completeness branch', () => {
  it('surfaces IVD-specific requirements (Performance Evaluation Report, GSPR, performance)', async () => {
    const res = await engine.validate({ submissionType: 'IVDR', presentSections: [], targetAgency: 'EU' });
    const blob = JSON.stringify(res.checklist);
    expect(blob).toMatch(/Performance Evaluation Report/i);
    expect(blob).toMatch(/General Safety and Performance Requirements|GSPR/i);
    expect(blob).toMatch(/Analytical Performance/i);
    expect(blob).toMatch(/Clinical Performance/i);
  });

  it('is not ready when no IVDR sections are present', async () => {
    const res = await engine.validate({ submissionType: 'IVDR', presentSections: [], targetAgency: 'EU' });
    expect(res.summary.missingSections).toBeGreaterThan(0);
    expect(res.goNoGo.decision).not.toBe('go');
  });

  it('does not borrow the pharma CTD Module 3 drug-substance requirement', async () => {
    const res = await engine.validate({ submissionType: 'IVDR', presentSections: [], targetAgency: 'EU' });
    const blob = JSON.stringify(res.checklist);
    // The IVD branch must be distinct from the CTD/pharma set.
    expect(blob).not.toMatch(/Drug Substance/i);
  });
});

describe('device branch regression (unchanged by the IVD branch)', () => {
  it('510(k) still returns the substantial-equivalence device requirement', async () => {
    const res = await engine.validate({ submissionType: '510(k)', presentSections: [], targetAgency: 'FDA' });
    const blob = JSON.stringify(res.checklist);
    expect(blob).toMatch(/Substantial Equivalence|Device Description/i);
  });
});
