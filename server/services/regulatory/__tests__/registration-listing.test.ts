/**
 * Registration / listing / Declaration of Conformity tests.
 */

import { describe, it, expect } from 'vitest';
import {
  assessFdaRegistration,
  assessEuRegistration,
  generateDeclarationOfConformity,
} from '../registration-listing';

describe('assessFdaRegistration', () => {
  it('compliant when all elements present (domestic)', () => {
    const r = assessFdaRegistration({
      ownerOperatorAccount: true,
      establishmentRegistered: true,
      annualFeePaid: true,
      deviceListed: true,
      premarketStatusEstablished: true,
      usAgentDesignated: false,
      isForeignEstablishment: false,
    });
    expect(r.compliant).toBe(true);
  });

  it('foreign establishment needs a US agent', () => {
    const r = assessFdaRegistration({
      ownerOperatorAccount: true,
      establishmentRegistered: true,
      annualFeePaid: true,
      deviceListed: true,
      premarketStatusEstablished: true,
      usAgentDesignated: false,
      isForeignEstablishment: true,
    });
    expect(r.compliant).toBe(false);
    expect(r.gaps.some(g => g.includes('U.S. Agent'))).toBe(true);
  });
});

describe('assessEuRegistration', () => {
  it('Class A requires no notified body', () => {
    const r = assessEuRegistration({
      srnAssigned: true,
      basicUdiDiAssigned: true,
      udiDiAssigned: true,
      authorisedRepresentativeDesignated: true,
      isNonEuManufacturer: false,
      deviceRegisteredInEudamed: true,
      riskClass: 'A',
      notifiedBodyCertificateInPlace: false,
    });
    expect(r.notifiedBodyRequired).toBe(false);
    expect(r.compliant).toBe(true);
  });

  it('Class C requires a notified-body certificate', () => {
    const r = assessEuRegistration({
      srnAssigned: true,
      basicUdiDiAssigned: true,
      udiDiAssigned: true,
      authorisedRepresentativeDesignated: true,
      isNonEuManufacturer: false,
      deviceRegisteredInEudamed: true,
      riskClass: 'C',
      notifiedBodyCertificateInPlace: false,
    });
    expect(r.notifiedBodyRequired).toBe(true);
    expect(r.compliant).toBe(false);
  });
});

describe('generateDeclarationOfConformity', () => {
  it('Class C DoC requires notified-body identification', () => {
    const r = generateDeclarationOfConformity({
      manufacturerName: 'Acme',
      manufacturerAddress: 'EU',
      productName: 'AcmeTest',
      basicUdiDi: 'BUDI123',
      riskClass: 'C',
      conformityRoute: 'Annex IX',
      standardsApplied: ['EN ISO 13485'],
    });
    expect(r.valid).toBe(false);
    expect(r.missing).toContain('notifiedBodyNumber');
  });

  it('valid Class A DoC needs no notified body', () => {
    const r = generateDeclarationOfConformity({
      manufacturerName: 'Acme',
      manufacturerAddress: 'EU',
      productName: 'AcmeTest',
      basicUdiDi: 'BUDI123',
      riskClass: 'A',
      conformityRoute: 'Annex III',
      standardsApplied: ['EN ISO 13485'],
    });
    expect(r.valid).toBe(true);
    expect(r.declaration).not.toBeNull();
  });
});
