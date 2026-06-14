/**
 * Letter of Authorization / Right of Reference — model assembly, gap detection,
 * eCTD m1.4.1 placement, and PDF rendering.
 */

import { describe, it, expect } from 'vitest';
import {
  assembleLetterOfAuthorization,
  buildLoaLeafIntent,
  type LetterOfAuthorizationInput,
} from '../ind-loa-service';
import { renderLetterOfAuthorizationPdf } from '../ind-document-renderer';

function input(over: Partial<LetterOfAuthorizationInput> = {}): LetterOfAuthorizationInput {
  return {
    referencedFileType: 'DMF',
    referencedFileNumber: '012345',
    holderName: 'Excipient Co.',
    holderAddress: '1 Industry Way, NJ',
    authorizedPartyName: 'Acme Therapeutics',
    subjectName: 'C2C-001 drug substance',
    signatoryName: 'Dana Holder',
    signatoryTitle: 'VP Regulatory',
    signatureDate: '2026-06-14',
    ...over,
  };
}

describe('assembleLetterOfAuthorization', () => {
  it('assembles the LOA sections with the reference + authorization', () => {
    const model = assembleLetterOfAuthorization(input());
    expect(model.documentType).toBe('LETTER_OF_AUTHORIZATION');
    expect(model.gaps).toEqual([]);
    const byKey = Object.fromEntries(model.sections.map((s) => [s.key, s.body]));
    expect(byKey.reference).toContain('DMF 012345');
    expect(byKey.authorization).toContain('Acme Therapeutics');
    expect(byKey.authorization).toContain('Excipient Co.');
  });

  it('defaults the scope to "in its entirety" and honors explicit sections', () => {
    expect(assembleLetterOfAuthorization(input()).sections.find((s) => s.key === 'scope')?.body).toContain('in its entirety');
    const scoped = assembleLetterOfAuthorization(input({ authorizedSections: ['3.2.S Drug Substance'] }));
    expect(scoped.sections.find((s) => s.key === 'scope')?.body).toContain('3.2.S Drug Substance');
  });

  it('reports gaps for missing required particulars', () => {
    const model = assembleLetterOfAuthorization(input({ holderName: '', signatoryName: '  ' }));
    expect(model.gaps).toContain('file holder name');
    expect(model.gaps).toContain('signatory name');
  });

  it('includes the supporting IND number when supplied', () => {
    const model = assembleLetterOfAuthorization(input({ supportingIndNumber: '123456' }));
    expect(model.sections.find((s) => s.key === 'reference')?.body).toContain('IND 123456');
  });
});

describe('buildLoaLeafIntent', () => {
  it('places the LOA at eCTD m1.4.1', () => {
    const intent = buildLoaLeafIntent(assembleLetterOfAuthorization(input()));
    expect(intent.sectionCode).toBe('m1.4.1');
    expect(intent.documentType).toBe('letter_of_authorization');
    expect(intent.title).toContain('DMF 012345');
  });
});

describe('renderLetterOfAuthorizationPdf', () => {
  it('renders valid, deterministic PDF bytes', async () => {
    const model = assembleLetterOfAuthorization(input());
    const a = await renderLetterOfAuthorizationPdf(model);
    const b = await renderLetterOfAuthorizationPdf(model);
    expect(a.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(a.equals(b)).toBe(true);
  });
});
