/**
 * §11.50 signature manifestation renderer — pure, no DB, no mocks.
 */
import { describe, it, expect } from 'vitest';
import {
  renderSignatureManifestation,
  requiredManifestFields,
  formatSignedAtUtc,
  manifestMeaning,
  type SignatureManifestInput,
} from '../signature-manifestation';

const base: SignatureManifestInput = {
  signatureId: 'sig_abc123',
  signerName: 'Dr. Jane Roe',
  signerEmail: 'jane.roe@example.com',
  signerRole: 'VP Regulatory Affairs',
  signatureType: 'approval',
  signaturePurpose: 'Approve CSR for submission',
  signatureMeaning: 'approval',
  signedAt: '2026-06-17T05:21:09.000Z',
  authenticationMethod: 'password',
  secondFactorVerified: true,
  signatureHash: 'abcdef0123456789deadbeef',
  ipAddress: '10.0.0.5',
};

describe('formatSignedAtUtc', () => {
  it('formats ISO to stable UTC', () => {
    expect(formatSignedAtUtc('2026-06-17T05:21:09.000Z')).toBe('2026-06-17 05:21:09 UTC');
  });
  it('handles Date objects and invalid input', () => {
    expect(formatSignedAtUtc(new Date('2026-01-02T03:04:05Z'))).toBe('2026-01-02 03:04:05 UTC');
    expect(formatSignedAtUtc('not-a-date')).toBe('unknown');
  });
});

describe('manifestMeaning', () => {
  it('combines meaning and purpose', () => {
    expect(manifestMeaning(base)).toBe('approval — Approve CSR for submission');
  });
  it('falls back to type when meaning is absent', () => {
    expect(manifestMeaning({ ...base, signatureMeaning: null, signaturePurpose: null })).toBe('approval');
  });
});

describe('requiredManifestFields — the three §11.50 elements', () => {
  it('returns printed name, date/time, and meaning', () => {
    const f = requiredManifestFields(base);
    expect(f.printedName).toBe('Dr. Jane Roe');
    expect(f.dateTimeUtc).toBe('2026-06-17 05:21:09 UTC');
    expect(f.meaning).toContain('approval');
  });
});

describe('renderSignatureManifestation', () => {
  it('renders all three required elements plus controls', () => {
    const block = renderSignatureManifestation({ ...base, recordTitle: 'CSR — Study XYZ' });
    expect(block).toContain('21 CFR Part 11 §11.50');
    expect(block).toContain('Dr. Jane Roe, VP Regulatory Affairs, jane.roe@example.com');
    expect(block).toContain('2026-06-17 05:21:09 UTC');
    expect(block).toContain('approval — Approve CSR for submission');
    expect(block).toContain('MFA verified');
    expect(block).toContain('ID sig_abc123');
    expect(block).toContain('CSR — Study XYZ');
  });

  it('truncates the signature hash and omits MFA when not verified', () => {
    const block = renderSignatureManifestation({ ...base, secondFactorVerified: false });
    expect(block).toContain('hash abcdef0123456789…');
    expect(block).not.toContain('MFA verified');
  });

  it('omits optional lines cleanly when absent', () => {
    const block = renderSignatureManifestation({
      signatureId: 'sig_x',
      signerName: 'A. Signer',
      signatureType: 'review',
      signedAt: '2026-06-17T00:00:00Z',
    });
    expect(block).toContain('A. Signer');
    expect(block).toContain('Meaning:      review');
    expect(block).not.toContain('Record:');
    expect(block).not.toContain('Authentication:');
  });
});
