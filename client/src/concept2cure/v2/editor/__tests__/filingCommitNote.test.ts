// @vitest-environment jsdom
/**
 * What a section save says about the filing, after "Section saved." (DocumentWorkbench.tsx filingCommitNote).
 * A Quality controlled document is never part of a filing, so its save says nothing about one: it used to read
 * "saved in the editor but not in the filing" on every save of an SOP (2026-11-12).
 */
import { describe, expect, it } from 'vitest';
import { filingCommitNote } from '../DocumentWorkbench';

describe('the save confirmation and the filing', () => {
  it('says nothing about a filing for a Quality controlled document', () => {
    expect(filingCommitNote({ committed: false, outsideFiling: 'controlled-document',
      reason: 'This is a controlled document in the Quality register. It is approved and released there, and is not part of a filing.' })).toBe('');
  });

  it('still says when a filing document was saved but did not reach its filing, with the reason', () => {
    expect(filingCommitNote({ committed: false, reason: 'This document is not bound to a filing, so there is no governed section to update.' }))
      .toBe(' The text is saved in the editor but not in the filing: This document is not bound to a filing, so there is no governed section to update.');
    expect(filingCommitNote({ committed: false })).toBe(' The text is saved in the editor but not in the filing: the server gave no reason.');
  });

  it('says when the text reached the filing, and nothing when the server reported nothing', () => {
    expect(filingCommitNote({ committed: true })).toBe(' The text was committed to the filing.');
    expect(filingCommitNote({ committed: true, partOf: '2.5' })).toContain('as part of its section 2.5');
    expect(filingCommitNote(undefined)).toBe('');
  });
});
