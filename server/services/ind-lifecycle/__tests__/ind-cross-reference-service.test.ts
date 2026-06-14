/**
 * IND cross-reference management — m1.4.2 statement, m1.4.3 authorized persons,
 * and the cross-reference register (LOA-coverage QC).
 */

import { describe, it, expect } from 'vitest';
import {
  assembleRightOfReferenceStatement,
  buildRightOfReferenceLeafIntent,
  assembleAuthorizedPersonsList,
  buildAuthorizedPersonsLeafIntent,
  buildCrossReferenceRegister,
  type CrossReferenceEntry,
} from '../ind-cross-reference-service';
import {
  renderRightOfReferenceStatementPdf,
  renderAuthorizedPersonsListPdf,
} from '../ind-document-renderer';

describe('assembleRightOfReferenceStatement (m1.4.2)', () => {
  const base = {
    sponsorName: 'Acme Therapeutics',
    referencedFileType: 'DMF' as const,
    referencedFileNumber: '012345',
    subjectName: 'C2C-001 drug substance',
    indNumber: '123456',
    signatoryName: 'Dana Holder',
  };

  it('builds the statement with the reference + scope', () => {
    const model = assembleRightOfReferenceStatement(base);
    expect(model.documentType).toBe('STATEMENT_OF_RIGHT_OF_REFERENCE');
    expect(model.gaps).toEqual([]);
    const stmt = model.sections.find((s) => s.key === 'statement')?.body ?? '';
    expect(stmt).toContain('Acme Therapeutics');
    expect(stmt).toContain('DMF 012345');
    expect(stmt).toContain('IND 123456');
    expect(stmt).toContain('in its entirety');
  });

  it('reports gaps and places at m1.4.2', () => {
    const model = assembleRightOfReferenceStatement({ ...base, sponsorName: '' });
    expect(model.gaps).toContain('sponsor name');
    expect(buildRightOfReferenceLeafIntent(model).sectionCode).toBe('m1.4.2');
  });

  it('renders deterministic PDF bytes', async () => {
    const model = assembleRightOfReferenceStatement(base);
    const a = await renderRightOfReferenceStatementPdf(model);
    const b = await renderRightOfReferenceStatementPdf(model);
    expect(a.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(a.equals(b)).toBe(true);
  });
});

describe('assembleAuthorizedPersonsList (m1.4.3)', () => {
  it('lists the authorized persons', () => {
    const model = assembleAuthorizedPersonsList({
      sponsorName: 'Acme',
      persons: [{ name: 'Pat Smith', role: 'RA Director', organization: 'Acme' }, { name: 'Jordan Lee' }],
    });
    expect(model.gaps).toEqual([]);
    const body = model.sections[0].body;
    expect(body).toContain('Pat Smith');
    expect(body).toContain('RA Director');
    expect(body).toContain('Jordan Lee');
    expect(buildAuthorizedPersonsLeafIntent().sectionCode).toBe('m1.4.3');
  });

  it('reports a gap when no persons are supplied', () => {
    const model = assembleAuthorizedPersonsList({ sponsorName: 'Acme', persons: [] });
    expect(model.gaps).toContain('at least one authorized person');
  });

  it('renders deterministic PDF bytes', async () => {
    const model = assembleAuthorizedPersonsList({ sponsorName: 'Acme', persons: [{ name: 'Pat Smith' }] });
    const pdf = await renderAuthorizedPersonsListPdf(model);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

describe('buildCrossReferenceRegister', () => {
  const ref = (over: Partial<CrossReferenceEntry>): CrossReferenceEntry => ({
    referencedFileType: 'DMF',
    referencedFileNumber: '012345',
    subjectName: 'C2C-001 drug substance',
    loaOnFile: true,
    ...over,
  });

  it('ready when every reference has an LOA on file', () => {
    const reg = buildCrossReferenceRegister([ref({ referencedFileNumber: '111' }), ref({ referencedFileNumber: '222' })]);
    expect(reg.ready).toBe(true);
    expect(reg.counts).toEqual({ total: 2, withLoa: 2, missingLoa: 0 });
  });

  it('errors (not ready) on a reference without an LOA', () => {
    const reg = buildCrossReferenceRegister([ref({ referencedFileNumber: '111', loaOnFile: false })]);
    expect(reg.ready).toBe(false);
    expect(reg.counts.missingLoa).toBe(1);
    expect(reg.findings.some((f) => f.code === 'MISSING_LOA')).toBe(true);
  });

  it('warns on a duplicate reference', () => {
    const reg = buildCrossReferenceRegister([ref({ referencedFileNumber: '111' }), ref({ referencedFileNumber: '111' })]);
    expect(reg.findings.some((f) => f.code === 'DUPLICATE')).toBe(true);
    expect(reg.ready).toBe(true); // duplicate is a warning, not blocking
  });

  it('annotates entries with a file label + scope', () => {
    const reg = buildCrossReferenceRegister([ref({ referencedFileNumber: '012345', authorizedSections: ['3.2.S'] })]);
    expect(reg.entries[0].fileLabel).toBe('DMF 012345');
    expect(reg.entries[0].scope).toBe('3.2.S');
  });
});
