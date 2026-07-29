/**
 * Unit tests for buildSignatureManifest — the 21 CFR Part 11 §11.50 signature
 * manifestation (printed name + date/time + meaning). Pure function, no DB.
 */

import { describe, it, expect } from 'vitest';
import { buildSignatureManifest } from '../part11-compliance';

describe('buildSignatureManifest (§11.50)', () => {
  const base = {
    signerName: 'Jane Q. Reviewer',
    signerTitle: 'VP Regulatory Affairs',
    signerOrganization: 'Acme Bio',
    meaning: 'approval' as const,
    timestamp: '2026-06-10T14:30:00.000Z',
  };

  it('includes all three required §11.50 elements', () => {
    const m = buildSignatureManifest(base);
    expect(m.signerName).toBe('Jane Q. Reviewer');
    expect(m.signedAt).toBe('2026-06-10T14:30:00.000Z');
    expect(m.meaningLabel).toBe('Approved');
    // The pre-formatted block carries name, date/time, and meaning.
    expect(m.manifestText).toContain('Jane Q. Reviewer');
    expect(m.manifestText).toContain('Date/Time: 2026-06-10T14:30:00.000Z');
    expect(m.manifestText).toContain('Meaning: Approved');
  });

  it('uses the custom meaning text when meaning is "custom"', () => {
    const m = buildSignatureManifest({ ...base, meaning: 'custom', customMeaning: 'Witnessed under protocol X' });
    expect(m.meaningLabel).toBe('Witnessed under protocol X');
    expect(m.manifestText).toContain('Meaning: Witnessed under protocol X');
  });

  it('omits optional title/organization lines when absent', () => {
    const m = buildSignatureManifest({
      signerName: 'Sam Author',
      meaning: 'authorship',
      timestamp: '2026-06-10T00:00:00.000Z',
    });
    expect(m.manifestText).not.toContain('Title:');
    expect(m.manifestText).not.toContain('Organization:');
    expect(m.manifestText).toContain('Sam Author');
    expect(m.manifestText).toContain('Meaning: Authorship');
  });

  it('normalizes a Date instance to an ISO timestamp', () => {
    const m = buildSignatureManifest({ ...base, timestamp: new Date('2026-06-10T09:00:00Z') });
    expect(m.signedAt).toBe('2026-06-10T09:00:00.000Z');
  });

  it('falls back to the raw meaning string for an unknown meaning', () => {
    const m = buildSignatureManifest({ ...base, meaning: 'co_signature' });
    expect(m.meaningLabel).toBe('co_signature');
  });
});
