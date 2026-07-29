/**
 * Master data → FDA form context mapping. Pure (no DB): verifies registry
 * records map onto the form builders' input shapes and that overrides win.
 */

import { describe, it, expect } from 'vitest';
import {
  sponsorToInfo,
  agentToInfo,
  investigatorToInfo,
  assembleFormMetadata,
} from '../form-context-assembler';
import type { Sponsor, RegulatoryAgent, Investigator } from '@shared/schema/ind-master-data';

const sponsor = {
  name: 'Acme Therapeutics',
  addressLine1: '1 Main St',
  addressLine2: 'Suite 200',
  city: 'Boston',
  stateProvince: 'MA',
  postalCode: '02110',
  country: 'USA',
  contactName: 'Dr. Jane Roe',
  contactPhone: '+1-617-555-0100',
  contactEmail: 'jane@acme.example',
  signatoryName: 'John Doe',
  signatoryTitle: 'VP Regulatory',
} as unknown as Sponsor;

const agent = {
  name: 'US Agent LLC',
  addressLine1: '500 K St',
  city: 'Washington',
  stateProvince: 'DC',
  postalCode: '20001',
  country: 'USA',
  contactPhone: '+1-202-555-0199',
} as unknown as RegulatoryAgent;

const investigator = {
  firstName: 'Pat',
  lastName: 'Smith',
  credentials: 'MD',
  siteName: 'Boston Clinical Site',
  siteAddress: '9 Hospital Way, Boston, MA',
  irbName: 'Central IRB',
  irbAddress: '2 Ethics Rd, Boston, MA',
  cvDocumentRef: 'cv-ref-1',
  subInvestigators: [{ name: 'Alex Lee', credentials: 'PharmD' }, { name: 'Sam Park' }],
} as unknown as Investigator;

describe('sponsorToInfo', () => {
  it('maps fields and composes a one-line address + signatory → authorized rep', () => {
    const info = sponsorToInfo(sponsor);
    expect(info.name).toBe('Acme Therapeutics');
    expect(info.address).toBe('1 Main St, Suite 200, Boston, MA, 02110, USA');
    expect(info.contactEmail).toBe('jane@acme.example');
    expect(info.authorizedRepName).toBe('John Doe');
    expect(info.authorizedRepTitle).toBe('VP Regulatory');
  });
});

describe('agentToInfo', () => {
  it('maps the US agent name/address/phone', () => {
    const info = agentToInfo(agent);
    expect(info.name).toBe('US Agent LLC');
    expect(info.address).toBe('500 K St, Washington, DC, 20001, USA');
    expect(info.phone).toBe('+1-202-555-0199');
  });
});

describe('investigatorToInfo', () => {
  it('builds the full name with credentials and joins sub-investigators', () => {
    const info = investigatorToInfo(investigator);
    expect(info.name).toBe('Pat Smith, MD');
    expect(info.facilityNameAddress).toBe('Boston Clinical Site, 9 Hospital Way, Boston, MA');
    expect(info.irbNameAddress).toBe('Central IRB, 2 Ethics Rd, Boston, MA');
    expect(info.subInvestigators).toEqual(['Alex Lee, PharmD', 'Sam Park']);
  });
});

describe('assembleFormMetadata', () => {
  it('assembles metadata from records and lets overrides win', () => {
    const meta = assembleFormMetadata({
      sponsor,
      agent,
      investigators: [investigator],
      overrides: { drugName: 'C2C-001', indication: 'NSCLC', studyPhase: 'Phase 1', sponsorName: 'Override Co' },
    });
    expect(meta.sponsor?.name).toBe('Acme Therapeutics');
    expect(meta.agent?.name).toBe('US Agent LLC');
    expect(meta.investigators).toHaveLength(1);
    expect(meta.drugName).toBe('C2C-001');
    // Override wins over the derived sponsorName.
    expect(meta.sponsorName).toBe('Override Co');
  });

  it('omits empty collections when no records are supplied', () => {
    const meta = assembleFormMetadata({});
    expect(meta.sponsor).toBeUndefined();
    expect(meta.agent).toBeUndefined();
    expect(meta.investigators).toBeUndefined();
  });
});
