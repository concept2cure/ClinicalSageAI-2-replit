/**
 * Cover-letter context from master data + submission. Pure (no DB).
 */

import { describe, it, expect } from 'vitest';
import {
  assembleCoverLetterContext,
  lifecycleStageToSubmissionType,
} from '../cover-letter-context';
import type { Sponsor } from '@shared/schema/ind-master-data';
import type { Submission } from '@shared/schema/submissions';

const sponsor = {
  name: 'Acme Therapeutics',
  addressLine1: '1 Main St',
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

const submission = { productName: 'C2C-001', lifecycleStage: 'original' } as unknown as Submission;

describe('lifecycleStageToSubmissionType', () => {
  it('maps lifecycle stages to cover-letter submission types', () => {
    expect(lifecycleStageToSubmissionType('original')).toBe('original');
    expect(lifecycleStageToSubmissionType('planning')).toBe('original');
    expect(lifecycleStageToSubmissionType('amendment')).toBe('information_amendment');
    expect(lifecycleStageToSubmissionType('annual')).toBe('annual_report');
    expect(lifecycleStageToSubmissionType('response')).toBe('response_to_information_request');
    expect(lifecycleStageToSubmissionType(undefined)).toBe('original');
  });
});

describe('assembleCoverLetterContext', () => {
  it('maps sponsor + submission into a cover-letter input', () => {
    const input = assembleCoverLetterContext({ sponsor, submission });
    expect(input.sponsorName).toBe('Acme Therapeutics');
    expect(input.sponsorAddress).toBe('1 Main St, Boston, MA, 02110, USA');
    expect(input.drugName).toBe('C2C-001');
    expect(input.submissionType).toBe('original');
    expect(input.signatoryName).toBe('John Doe');
    expect(input.contactEmail).toBe('jane@acme.example');
  });

  it('lets overrides win (IND number, indication, division not stored on the records)', () => {
    const input = assembleCoverLetterContext({
      sponsor,
      submission,
      overrides: { indNumber: '123456', indication: 'NSCLC', fdaDivision: 'Division of Oncology 1' },
    });
    expect(input.indNumber).toBe('123456');
    expect(input.indication).toBe('NSCLC');
    expect(input.fdaDivision).toBe('Division of Oncology 1');
  });

  it('produces a usable input even with no records (empty required fields)', () => {
    const input = assembleCoverLetterContext({});
    expect(input.sponsorName).toBe('');
    expect(input.drugName).toBe('');
    expect(input.submissionType).toBe('original');
  });
});
