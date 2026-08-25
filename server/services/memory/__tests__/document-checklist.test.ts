import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_CHECKLIST,
  computeDocumentChecklist,
  type ChecklistDocument,
} from '../document-checklist';

describe('DOCUMENT_CHECKLIST template', () => {
  it('exposes the five onboarding categories in order', () => {
    expect(DOCUMENT_CHECKLIST.map(c => c.category)).toEqual([
      'Company Profile',
      'Regulatory History',
      'Pipeline & Products',
      'Operations & Quality',
      'Competitive Intelligence',
    ]);
  });

  it('every item carries a valid priority and a non-empty fileTypes list', () => {
    for (const cat of DOCUMENT_CHECKLIST) {
      for (const item of cat.items) {
        expect(['required', 'recommended', 'optional']).toContain(item.priority);
        expect(item.fileTypes.length).toBeGreaterThan(0);
        expect(item.uploaded).toBe(false);
      }
    }
  });
});

describe('computeDocumentChecklist', () => {
  it('returns all items unuploaded when no documents are ingested', () => {
    const result = computeDocumentChecklist([]);
    const anyUploaded = result.some(c => c.items.some(i => i.uploaded));
    expect(anyUploaded).toBe(false);
    // Shape must mirror the template exactly.
    expect(result.map(c => c.category)).toEqual(DOCUMENT_CHECKLIST.map(c => c.category));
  });

  it('does not mutate the DOCUMENT_CHECKLIST template', () => {
    computeDocumentChecklist([
      { fileName: 'Company Overview 2026.pdf', fileType: 'pdf' },
    ]);
    // Template items must still all read uploaded=false after computation.
    const templateUploaded = DOCUMENT_CHECKLIST.some(c => c.items.some(i => i.uploaded));
    expect(templateUploaded).toBe(false);
  });

  it('marks an item uploaded when file type matches and the name shares the first label word', () => {
    // 'Company Overview / About Us' -> first word 'company', fileTypes include 'pdf'
    const docs: ChecklistDocument[] = [
      { fileName: 'Company Deck.pdf', fileType: 'pdf' },
    ];
    const result = computeDocumentChecklist(docs);
    const companyProfile = result.find(c => c.category === 'Company Profile')!;
    const overview = companyProfile.items.find(i => i.label === 'Company Overview / About Us')!;
    expect(overview.uploaded).toBe(true);
  });

  it('marks an item uploaded when the exact filename is in the uploaded set even if the first label word is absent', () => {
    // uploadedNames branch: name matches an uploaded filename exactly, fileType allowed.
    const docs: ChecklistDocument[] = [
      { fileName: 'roadmap.pdf', fileType: 'pdf' },
    ];
    const result = computeDocumentChecklist(docs);
    // 'Warning Letters or CRLs' -> fileTypes ['pdf']; first word 'warning' not in 'roadmap.pdf'
    // but uploadedNames contains 'roadmap.pdf' which equals the doc name -> uploaded true.
    const regHistory = result.find(c => c.category === 'Regulatory History')!;
    const warning = regHistory.items.find(i => i.label === 'Warning Letters or CRLs')!;
    expect(warning.uploaded).toBe(true);
  });

  it('does not mark an item uploaded when the file type is not accepted', () => {
    // 'Warning Letters or CRLs' only accepts 'pdf'. A docx must not match.
    const docs: ChecklistDocument[] = [
      { fileName: 'warning response.docx', fileType: 'docx' },
    ];
    const result = computeDocumentChecklist(docs);
    const regHistory = result.find(c => c.category === 'Regulatory History')!;
    const warning = regHistory.items.find(i => i.label === 'Warning Letters or CRLs')!;
    expect(warning.uploaded).toBe(false);
  });

  it('treats a null/undefined fileType as no extension match', () => {
    const docs: ChecklistDocument[] = [
      { fileName: 'company overview.pdf', fileType: null },
    ];
    const result = computeDocumentChecklist(docs);
    const companyProfile = result.find(c => c.category === 'Company Profile')!;
    const overview = companyProfile.items.find(i => i.label === 'Company Overview / About Us')!;
    // ext resolves to '' which is not in fileTypes -> not uploaded.
    expect(overview.uploaded).toBe(false);
  });
});
