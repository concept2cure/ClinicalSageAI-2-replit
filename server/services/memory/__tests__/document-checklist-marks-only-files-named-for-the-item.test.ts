/**
 * The onboarding checklist marks an item uploaded only for a file NAMED like
 * that item, and names the file it matched.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * computeDocumentChecklist marked an item uploaded when
 *   item.fileTypes.includes(ext) && (name.includes(firstLabelWord) || uploadedNames.has(name))
 * and `uploadedNames` was built from the same documents, so the second test was
 * always true: the check reduced to "this file type is one the item accepts".
 * One unrelated "holiday-party-photo-notes.pdf" marked all 16 items uploaded —
 * "Prior Submissions Log: uploaded" for a client who sent a party photo note.
 * Nothing said which file an item was matched to, so the claim could not be
 * checked.
 */
import { describe, it, expect } from 'vitest';
import { computeDocumentChecklist, type ChecklistDocument } from '../document-checklist';

const item = (docs: ChecklistDocument[], label: string) =>
  computeDocumentChecklist(docs).flatMap(c => c.items).find(i => i.label === label)!;
const uploadedLabels = (docs: ChecklistDocument[]) =>
  computeDocumentChecklist(docs).flatMap(c => c.items).filter(i => i.uploaded).map(i => i.label);

describe('computeDocumentChecklist', () => {
  it('one unrelated PDF marks no item uploaded', () => {
    const marked = uploadedLabels([{ fileName: 'holiday-party-photo-notes.pdf', fileType: 'pdf' }]);
    expect(marked, 'an unrelated file was reported as checklist documents').toEqual([]);
  });

  it('one shared word with a label is not a match', () => {
    expect(uploadedLabels([
      { fileName: 'regulatory-correspondence.pdf', fileType: 'pdf' },
      { fileName: 'fda-form-1571.pdf', fileType: 'pdf' },
      { fileName: 'company-holiday-schedule.pdf', fileType: 'pdf' },
    ])).toEqual([]);
  });

  it('a file named for the item marks it, and the item names that file', () => {
    const docs: ChecklistDocument[] = [{ fileName: 'Acme Prior Submissions Log 2026.xlsx', fileType: 'xlsx' }];
    expect(item(docs, 'Prior Submissions Log')).toMatchObject({
      uploaded: true,
      matchedFiles: ['Acme Prior Submissions Log 2026.xlsx'],
    });
    expect(uploadedLabels(docs)).toEqual(['Prior Submissions Log']);
  });

  it('matches singular or plural label words and any one of a label’s alternatives', () => {
    expect(item([{ fileName: 'Type_B_meeting_minute_2025-03.pdf', fileType: 'pdf' }], 'FDA Meeting Minutes').uploaded).toBe(true);
    expect(item([{ fileName: 'Series-A Pitch Deck.pdf', fileType: 'pdf' }], 'Corporate Presentation / Pitch Deck').uploaded).toBe(true);
  });

  it('still requires a file type the item accepts', () => {
    expect(item([{ fileName: 'Warning Letter response.docx', fileType: 'docx' }], 'Warning Letters or CRLs').uploaded).toBe(false);
  });

  it('an item no file matched has no matched files', () => {
    expect(item([], 'Pipeline Overview')).toMatchObject({ uploaded: false, matchedFiles: [] });
  });
});
