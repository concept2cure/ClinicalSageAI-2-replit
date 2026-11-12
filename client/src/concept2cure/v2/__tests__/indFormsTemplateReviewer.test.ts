/**
 * GA-D7-12 (2026-11-10): the FDA 1572, 3454 and 356h template manifests named a
 * person's own e-mail address as their reviewer, and the forms panel showed it
 * to everyone who opened Forms and letters.
 *
 * A manifest names a role, never a personal address; and the reviewer stays
 * non-empty, because the fill service trusts an AcroForm asset only when a
 * reviewer is recorded (ind-form-fill-service.ts, registryCoverage.ts).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { reviewerLine } from '../surfaces/IndFormsPanel';

const DIR = path.resolve(__dirname, '../../../../../templates/forms/acroforms');
const FORMS = ['FDA_1572', 'FDA_3454', 'FDA_356H'];
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

describe('FDA template manifests name a reviewer role, not a person\'s e-mail', () => {
  it.each(FORMS)('%s: no e-mail address anywhere in the manifest', (form) => {
    const text = readFileSync(path.join(DIR, `${form}.pdf.manifest.json`), 'utf8');
    expect(text).not.toMatch(EMAIL);
  });

  it.each(FORMS)('%s: the reviewer is still recorded, so the asset stays trusted', (form) => {
    const m = JSON.parse(readFileSync(path.join(DIR, `${form}.pdf.manifest.json`), 'utf8'));
    expect(typeof m.reviewedBy).toBe('string');
    expect(m.reviewedBy.trim()).not.toBe('');
    expect(m.assetTrusted).toBe(true);
    expect(m.reviewedAt).toBeTruthy();
  });
});

describe('the forms panel\'s reviewer line', () => {
  it('a reviewer recorded as a role reads as that role', () => {
    expect(reviewerLine('the product owner (regulatory forms review)'))
      .toBe('Asset reviewed by the product owner (regulatory forms review).');
  });

  it('an address is never shown, and no reviewer reads as none', () => {
    expect(reviewerLine('someone@example.com')).toBe('Asset reviewed by a named reviewer on record.');
    expect(reviewerLine(null)).toBe('This asset has no named reviewer yet.');
    expect(reviewerLine('  ')).toBe('This asset has no named reviewer yet.');
  });
});
