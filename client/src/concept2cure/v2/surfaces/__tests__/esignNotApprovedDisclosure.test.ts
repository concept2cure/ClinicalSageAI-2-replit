/**
 * An approver is told which sections their signature did not cover.
 *
 * THE DEFECT THIS PREVENTS (P-29, D-29-C). `approveBoundFilingSections` moves a
 * bound filing section to `approved` only when its filed text is exactly the
 * text signed, and reports every key it could not move in
 * `filingApproval.notApproved`. `POST /api/authoring/docs/:docId/e-sign` sends
 * that on.
 *
 * The client typed the response as `{ documentHash, signedAt }` and dropped the
 * rest, then said "Document signed (approver) — approved and frozen"
 * unconditionally. So an approver whose signature left sections unapproved in
 * the filing saw an unqualified confirmation and was never told. A correct gate
 * nobody is shown is a finding in its own right — and this is the gate that
 * makes P-29.1 true, so the person carrying the §11.10(e) responsibility was
 * the one person not told.
 *
 * Both halves are asserted: the transport (the field survives the response) and
 * the sentence (what is, and is not, said).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  extractApiError: (e: unknown) => e,
  redactInternals: (s: string) => s,
  serverMessage: (j: unknown) => (j as { message?: string } | null)?.message ?? null,
}));

import { postAuthoringSignature, signedToast, notApprovedNote } from '../AuthoringFilingBar';

// 'approval' is the dialog's meaning key; AUTHORING_MEANING maps it to APPROVER.
const SIGN_INPUT = { meaning: 'approval', reason: 'Approving for filing.', password: 'pw' } as never;

function reply(body: unknown, status = 200) {
  return { status, json: async () => body } as unknown as Response;
}

describe('the e-signature transport keeps what the server reported', () => {
  beforeEach(() => apiRequest.mockReset());

  it('carries the sections the approval did not cover', async () => {
    apiRequest.mockResolvedValue(reply({
      documentHash: 'abc123', signedAt: '2026-10-18T20:00:00Z',
      filingApproval: { approved: ['2.6'], notApproved: ['2.5', '3.2.S'] },
    }));
    const out = await postAuthoringSignature('doc-1', SIGN_INPUT);
    expect(out.notApproved).toEqual(['2.5', '3.2.S']);
  });

  it('reports none when the approval covered every bound section', async () => {
    apiRequest.mockResolvedValue(reply({
      documentHash: 'abc123', filingApproval: { approved: ['2.5'], notApproved: [] },
    }));
    expect((await postAuthoringSignature('doc-1', SIGN_INPUT)).notApproved).toEqual([]);
  });

  it('reports none, not undefined, when the server sends no filing approval at all', async () => {
    // An AUTHOR or REVIEWER signature approves no section, so the server sends
    // null. The caller must not have to guard for it.
    apiRequest.mockResolvedValue(reply({ documentHash: 'abc123', filingApproval: null }));
    expect((await postAuthoringSignature('doc-1', SIGN_INPUT)).notApproved).toEqual([]);
  });

  it('drops an empty key rather than naming a blank section', async () => {
    apiRequest.mockResolvedValue(reply({ filingApproval: { notApproved: ['2.5', ''] } }));
    expect((await postAuthoringSignature('doc-1', SIGN_INPUT)).notApproved).toEqual(['2.5']);
  });
});

describe('the confirmation does not claim an approval it did not make', () => {
  it('says "approved and frozen" only when every bound section was covered', () => {
    const covered = signedToast({ meaning: 'APPROVER', hash: 'deadbeefcafe00', notApproved: [] });
    expect(covered).toMatch(/approved and frozen/);
    expect(covered).not.toMatch(/not approved/);
  });

  it('qualifies it, with a count, when sections were left unapproved', () => {
    const partial = signedToast({ meaning: 'APPROVER', notApproved: ['2.5', '3.2.S'] });
    expect(partial).toMatch(/2 filing section\(s\) were not approved/);
  });

  it('says nothing about approval for an author or reviewer signature', () => {
    for (const meaning of ['AUTHOR', 'REVIEWER']) {
      const t = signedToast({ meaning, notApproved: [] });
      expect(t, meaning).not.toMatch(/approved and frozen/);
      expect(t, meaning).toMatch(new RegExp(`\\(${meaning.toLowerCase()}\\)`));
    }
  });
});

describe('the persistent note names the sections, not a count', () => {
  it('names one section', () => {
    expect(notApprovedNote(['2.5'])).toMatch(/section 2\.5/);
  });

  it('names every section when there are several', () => {
    const note = notApprovedNote(['2.5', '3.2.S', '2.7.3']);
    for (const k of ['2.5', '3.2.S', '2.7.3']) expect(note, k).toContain(k);
    expect(note).toMatch(/sections/);
  });
});

describe('the persistent note says what is true after the seal, and names no remedy that cannot be taken', () => {
  /* Corrected 2026-11-12. The note used to read "its filed text is not the
     text you signed … Open it in the editor and save to re-file, then approve
     again." Both halves were wrong by the time anyone could read them:
       - it is shown AFTER the approval, which froze the document — nothing in
         it can be saved or re-filed, so the remedy could not be performed;
       - a filed copy that differs from the signed text is refused BEFORE the
         signature (P-29.2, FILING_DIVERGED), so "not the text you signed" is
         not how a section comes to be left behind.
     And when the filing is locked or submitted the server already says so in
     `filingApproval.reason`, which the transport dropped. */
  it('does not tell the approver to save, re-file or approve again', () => {
    const note = notApprovedNote(['2.5']);
    expect(note).not.toMatch(/save to re-file/i);
    expect(note).not.toMatch(/open (it|them) in the editor/i);
    expect(note).not.toMatch(/approve again/i);
    expect(note).not.toMatch(/not the text you signed/i);
  });

  it('says the document is now approved and frozen, and what that means for the section', () => {
    const note = notApprovedNote(['2.5']);
    expect(note).toMatch(/approved and frozen/);
    expect(note).toMatch(/nothing in it can be saved or re-filed/);
    // The consequence the approver needs before dispatch, said plainly.
    expect(note).toMatch(/not count as finalized/);
  });

  it("carries the server's own reason when it gave one", () => {
    const reason = 'The filing this document is written for has been submitted, so none of its sections was approved.';
    expect(notApprovedNote(['2.5'], reason)).toContain(reason);
    // And says nothing extra when there is none, or when it is only spaces.
    expect(notApprovedNote(['2.5'], null)).not.toMatch(/undefined|null/);
    expect(notApprovedNote(['2.5'], '   ')).toBe(notApprovedNote(['2.5']));
  });
});

describe('the transport keeps the reason the server gave', () => {
  beforeEach(() => apiRequest.mockReset());

  it('carries filingApproval.reason through', async () => {
    const reason = 'The filing this document is written for has been submitted, so none of its sections was approved.';
    apiRequest.mockResolvedValue(reply({ documentHash: 'abc123', filingApproval: { approved: [], notApproved: ['2.5'], reason } }));
    const out = await postAuthoringSignature('doc-1', SIGN_INPUT);
    expect(out.notApproved).toEqual(['2.5']);
    expect(out.filingReason).toBe(reason);
  });

  it('is null, not undefined, when the server gave none, or gave only spaces', async () => {
    apiRequest.mockResolvedValue(reply({ documentHash: 'abc123', filingApproval: { approved: ['2.5'], notApproved: [] } }));
    expect((await postAuthoringSignature('doc-1', SIGN_INPUT)).filingReason).toBeNull();
    apiRequest.mockResolvedValue(reply({ documentHash: 'abc123', filingApproval: { approved: [], notApproved: ['2.5'], reason: '   ' } }));
    expect((await postAuthoringSignature('doc-1', SIGN_INPUT)).filingReason).toBeNull();
  });
});
