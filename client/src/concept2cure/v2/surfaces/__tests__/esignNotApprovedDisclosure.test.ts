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
  it('names one section, and what to do about it', () => {
    const note = notApprovedNote(['2.5']);
    expect(note).toMatch(/section 2\.5/);
    expect(note).toMatch(/not the text you signed/);
    expect(note).toMatch(/save to re-file/);
  });

  it('names every section when there are several', () => {
    const note = notApprovedNote(['2.5', '3.2.S', '2.7.3']);
    for (const k of ['2.5', '3.2.S', '2.7.3']) expect(note, k).toContain(k);
    expect(note).toMatch(/sections/);
  });
});
