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
    // Granular name/address (for the official 1572 db_loc_name/db_loc_address1 split).
    expect(info.facilityName).toBe('Boston Clinical Site');
    expect(info.facilityAddress).toBe('9 Hospital Way, Boston, MA');
    expect(info.irbName).toBe('Central IRB');
    expect(info.irbAddress).toBe('2 Ethics Rd, Boston, MA');
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

/* ── The program record → form metadata (WO-9 Click 2) ──────────────────────
   The forms panel used to have every value typed by hand. The program record
   (regulatory_programs + its organisation) is the source of record for the
   sponsor, the product, the indication and the agency number, so the forms
   read it. Pure mapping: what the record holds is passed through, what it does
   not hold is omitted — never an empty string that a builder would count as
   "present". */
import { programToFormMetadata } from '../form-context-assembler';

describe('programToFormMetadata — the program record is the source of the form facts', () => {
  const vorelinib = {
    sponsorName: 'Concept2Cure Therapeutics',
    productName: 'Vorelinib · BX-512',
    indication: 'KIT-mutant gastrointestinal stromal tumor · 4L+',
    applicationNumber: '000512',
    programType: 'IND',
  };

  it('maps an IND program: sponsor from the organisation, drug from product_name, IND number from application_number', () => {
    expect(programToFormMetadata(vorelinib)).toEqual({
      sponsorName: 'Concept2Cure Therapeutics',
      drugName: 'Vorelinib · BX-512',
      indication: 'KIT-mutant gastrointestinal stromal tumor · 4L+',
      indNumber: '000512',
    });
  });

  it('an NDA / BLA / ANDA program carries its number as the application number — never as an IND number', () => {
    const nda = programToFormMetadata({ ...vorelinib, applicationNumber: '212345', programType: 'NDA' });
    expect(nda.applicationNumber).toBe('212345');
    expect(nda.applicationType).toBe('NDA');
    expect(nda).not.toHaveProperty('indNumber');

    const bla = programToFormMetadata({ ...vorelinib, applicationNumber: '125001', programType: 'bla' });
    expect(bla.applicationType).toBe('BLA');
    expect(bla.applicationNumber).toBe('125001');
    expect(bla).not.toHaveProperty('indNumber');
  });

  it('a program type the forms have no box for (MAA, 510K, CER) contributes no number and no application type', () => {
    const maa = programToFormMetadata({ ...vorelinib, applicationNumber: 'EMEA/H/C/006', programType: 'MAA' });
    expect(maa).not.toHaveProperty('indNumber');
    expect(maa).not.toHaveProperty('applicationNumber');
    expect(maa).not.toHaveProperty('applicationType');
    expect(maa.drugName).toBe('Vorelinib · BX-512');
  });

  it('omits what the record does not hold — no empty strings that would read as present', () => {
    expect(programToFormMetadata({
      sponsorName: null, productName: '   ', indication: null, applicationNumber: null, programType: 'IND',
    })).toEqual({});
  });

  it('an unnumbered IND program yields no IND number — an original submission has none yet', () => {
    const meta = programToFormMetadata({ ...vorelinib, applicationNumber: null });
    expect(meta).not.toHaveProperty('indNumber');
    expect(meta.sponsorName).toBe('Concept2Cure Therapeutics');
  });

  it('layers under caller overrides through assembleFormMetadata — a typed serial number wins, a typed blank does not erase the record', () => {
    const merged = assembleFormMetadata({ overrides: { ...programToFormMetadata(vorelinib), serialNumber: '0000' } });
    expect(merged.serialNumber).toBe('0000');
    expect(merged.drugName).toBe('Vorelinib · BX-512');
  });
});
