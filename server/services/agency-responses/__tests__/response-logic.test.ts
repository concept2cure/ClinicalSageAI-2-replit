/**
 * Agency responses: the digest a signature binds, approval read from the
 * signature, the separation-of-duties refusal, the close rule and the package.
 * Pure, no DB/LLM. The real-database half is
 * tests/db/agency-response-signed-approval.dbtest.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  agencyResponseDigest,
  assembleResponsePackage,
  authorsSinceLastApproval,
  closeRefusal,
  compareQuestionRefs,
  questionApproval,
  signRefusal,
  type PackageQuestion,
  type QuestionRecord,
  type ResponseSignature,
} from '../response-logic';

const LETTER = 'ace_1_ab';

function q(over: Partial<QuestionRecord> = {}): QuestionRecord {
  return {
    id: 1,
    communicationEventId: LETTER,
    questionRef: 'Q1',
    questionText: 'Provide the dissolution method validation report.',
    responseText: 'The report is provided as Attachment 3.2.P.5.3.',
    responseRevision: 1,
    responseUpdatedBy: 7,
    ...over,
  };
}

function rev(revision: number, responseText: string, writtenBy: number) {
  return { revision, digest: agencyResponseDigest(q({ responseText })), writtenBy };
}

function sig(digest: string, over: Partial<ResponseSignature> = {}): ResponseSignature {
  return { id: 50, boundDigest: digest, signerId: 9, signerName: 'Dana Reyes', signedAt: '2026-10-18T10:00:00.000Z', meaning: 'approval', ...over };
}

describe('agencyResponseDigest', () => {
  it('is stable for the same content and moves with every field a signer approves', () => {
    const base = agencyResponseDigest(q());
    expect(agencyResponseDigest(q())).toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(agencyResponseDigest(q({ responseText: q().responseText + ' ' }))).not.toBe(base);
    expect(agencyResponseDigest(q({ questionText: 'Provide the method.' }))).not.toBe(base);
    expect(agencyResponseDigest(q({ questionRef: 'Q2' }))).not.toBe(base);
    expect(agencyResponseDigest(q({ communicationEventId: 'ace_2_cd' }))).not.toBe(base);
  });

  it('does not move with revision or author: a signature binds content, not bookkeeping', () => {
    expect(agencyResponseDigest(q({ responseRevision: 9, responseUpdatedBy: 3 }))).toBe(agencyResponseDigest(q()));
  });

  it('cannot be forged by moving text between fields', () => {
    const a = agencyResponseDigest(q({ questionText: 'A', responseText: 'BC' }));
    const b = agencyResponseDigest(q({ questionText: 'AB', responseText: 'C' }));
    expect(a).not.toBe(b);
  });
});

describe('questionApproval', () => {
  it('a question with no response text is unanswered, whatever signatures exist', () => {
    const blank = q({ responseText: '   ', responseRevision: 0, responseUpdatedBy: null });
    expect(questionApproval(blank, [sig('x')]).state).toBe('unanswered');
  });

  it('a response nobody has signed is drafted', () => {
    expect(questionApproval(q(), []).state).toBe('drafted');
  });

  it('a live signature binding the current text approves it, and names the signature', () => {
    const d = agencyResponseDigest(q());
    const a = questionApproval(q(), [sig(d)]);
    expect(a.state).toBe('approved');
    expect(a.approval?.id).toBe(50);
  });

  it('editing after signing leaves the earlier signature standing but not approving', () => {
    const signedText = agencyResponseDigest(q());
    const edited = q({ responseText: 'The report is provided as Attachment 3.2.P.5.4.', responseRevision: 2 });
    const a = questionApproval(edited, [sig(signedText)]);
    expect(a.state).toBe('changed-after-approval');
    expect(a.approval).toBeNull();
    expect(a.supersededApproval?.id).toBe(50);
  });

  it('a re-signature of the edited text approves it again; the newest matching one is named', () => {
    const v1 = agencyResponseDigest(q());
    const edited = q({ responseText: 'Revised.', responseRevision: 2 });
    const v2 = agencyResponseDigest(edited);
    const a = questionApproval(edited, [sig(v1, { id: 50 }), sig(v2, { id: 61, signedAt: '2026-10-18T11:00:00.000Z' })]);
    expect(a.state).toBe('approved');
    expect(a.approval?.id).toBe(61);
  });
});

describe('signRefusal', () => {
  it('refuses the person who wrote the current text (separation of duties)', () => {
    const a = questionApproval(q({ responseUpdatedBy: 7 }), []);
    expect(signRefusal(q({ responseUpdatedBy: 7 }), a, 7)?.code).toBe('SIGNER_WROTE_RESPONSE');
    expect(signRefusal(q({ responseUpdatedBy: 7 }), a, 9)).toBeNull();
  });

  it('refuses anyone who wrote part of the text since the last approval, not only the last saver', () => {
    // A (7) drafts, B (9) changes a comma: A may not approve what is mostly A's text.
    const rec = q({ responseUpdatedBy: 9 });
    const a = questionApproval(rec, []);
    const authors = authorsSinceLastApproval(rec, [rev(1, 'draft', 7), rev(2, rec.responseText, 9)], []);
    expect(authors).toEqual([7, 9]);
    expect(signRefusal(rec, a, 7, authors)?.code).toBe('SIGNER_WROTE_RESPONSE');
    expect(signRefusal(rec, a, 9, authors)?.code).toBe('SIGNER_WROTE_RESPONSE');
    expect(signRefusal(rec, a, 11, authors)).toBeNull();
  });

  it('a withdrawn question takes no approval', () => {
    const rec = q({ withdrawn: true });
    expect(signRefusal(rec, questionApproval(rec, []), 9)?.code).toBe('QUESTION_WITHDRAWN');
  });

  it('refuses an empty response and an already approved one', () => {
    const blank = q({ responseText: '', responseRevision: 0, responseUpdatedBy: null });
    expect(signRefusal(blank, questionApproval(blank, []), 9)?.code).toBe('NOTHING_TO_SIGN');
    const approved = questionApproval(q(), [sig(agencyResponseDigest(q()))]);
    expect(signRefusal(q(), approved, 9)?.code).toBe('ALREADY_APPROVED');
  });

  it('lets a second person re-approve text changed after an approval', () => {
    const edited = q({ responseText: 'Revised.', responseUpdatedBy: 7 });
    const a = questionApproval(edited, [sig(agencyResponseDigest(q()))]);
    expect(signRefusal(edited, a, 9)).toBeNull();
  });
});

describe('authorsSinceLastApproval', () => {
  it('counts only the writers after the last approved revision', () => {
    const v1 = rev(1, 'A wrote this.', 7);
    const v2 = rev(2, 'A wrote this, B edited.', 9);
    const v3 = rev(3, 'A wrote this, B edited, A again.', 7);
    // v2 was approved: only v3's writer is an author of what an approval now covers.
    expect(authorsSinceLastApproval(q({ responseUpdatedBy: 7 }), [v1, v2, v3], [{ boundDigest: v2.digest }])).toEqual([7]);
    // Nothing approved yet: everyone who wrote any revision.
    expect(authorsSinceLastApproval(q({ responseUpdatedBy: 7 }), [v1, v2, v3], [])).toEqual([7, 9]);
  });

  it('a response saved before revision history existed still names its writer', () => {
    expect(authorsSinceLastApproval(q({ responseUpdatedBy: 5 }), [], [])).toEqual([5]);
  });
});

describe('compareQuestionRefs', () => {
  it('orders the agency numbering naturally', () => {
    const refs = ['Q10', 'Q2', 'q1', 'Q2'].map((r, i) => ({ questionRef: r, id: i }));
    expect([...refs].sort(compareQuestionRefs).map((r) => `${r.questionRef}#${r.id}`)).toEqual(['q1#2', 'Q2#1', 'Q2#3', 'Q10#0']);
  });
});

function pq(ref: string, approved: boolean, over: Partial<PackageQuestion> = {}): PackageQuestion {
  const rec = q({ id: Number(ref.replace(/\D/g, '')), questionRef: ref, responseText: `Answer to ${ref}.`, ...over });
  const approval = questionApproval(rec, approved ? [sig(agencyResponseDigest(rec), { id: 100 + rec.id })] : []);
  return { ...rec, discipline: 'CMC', approval, commitments: [], ...over, ...(over.approval ? {} : { approval }) };
}

describe('closeRefusal', () => {
  it('a letter that requires no response, with nothing recorded, closes: an acknowledgement asks nothing', () => {
    expect(closeRefusal([], false)).toBeNull();
  });

  it('a letter that requires a response does not close with nothing recorded: nothing recorded is not answered', () => {
    expect(closeRefusal([], true)).toMatch(/requires a response and no question is recorded/);
  });

  it('withdrawn questions do not count as recorded, or as outstanding', () => {
    expect(closeRefusal([pq('Q1', false, { withdrawn: true })], true)).toMatch(/no question is recorded/);
    expect(closeRefusal([pq('Q1', false, { withdrawn: true }), pq('Q2', true)], true)).toBeNull();
  });

  it('refuses while any response is not approved, naming each in the agency order', () => {
    const msg = closeRefusal([pq('Q10', false), pq('Q2', true), pq('Q3', false, { responseText: '' })], true);
    expect(msg).toBe(
      '2 of 3 responses to this letter are not approved: Q3 (no response), Q10 (not approved). ' +
        'A letter is closed once every response is signed.',
    );
  });

  it('allows the close once every response is approved', () => {
    expect(closeRefusal([pq('Q1', true), pq('Q2', true)], true)).toBeNull();
  });
});

describe('assembleResponsePackage', () => {
  const letter = { eventId: LETTER, communicationType: 'Information request', sourceType: 'uploaded_official_correspondence', receivedDate: '2026-10-01T00:00:00.000Z', dueDate: '2026-10-31T00:00:00.000Z' };

  it('refuses with nothing recorded', () => {
    const r = assembleResponsePackage(letter, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NO_QUESTIONS');
  });

  it('refuses rather than ship a package missing an approved answer', () => {
    const r = assembleResponsePackage(letter, [pq('Q1', true), pq('Q2', false)]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('RESPONSES_NOT_APPROVED');
      expect(r.outstanding).toEqual([{ questionRef: 'Q2', state: 'drafted' }]);
    }
  });

  it('assembles in the agency order with each signature manifested and the commitments made', () => {
    const r = assembleResponsePackage(letter, [
      pq('Q2', true, {
        commitments: [{ id: 4, commitmentType: 'pmc', description: 'Submit 24-month stability data', dueDate: '2027-06-30', regulatoryBasis: '21 CFR 314.81(b)(2)(vii)' }],
      }),
      pq('Q1', true),
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.questionCount).toBe(2);
    expect(r.signatureIds).toEqual([101, 102]);
    expect(r.markdown.indexOf('## Q1')).toBeLessThan(r.markdown.indexOf('## Q2'));
    expect(r.markdown).toContain('Received: 2026-10-01');
    expect(r.markdown).toContain('Response due: 2026-10-31');
    expect(r.markdown).toContain('_Approved by Dana Reyes on 2026-10-18T10:00:00.000Z (approval). Signature 101; response sha256 ');
    expect(r.markdown).toContain('> Provide the dissolution method validation report.');
    expect(r.markdown).toContain('> Answer to Q1.');
    // Commitments are no signature's: they follow in their own section, said to be outside the signatures.
    const appendix = r.markdown.indexOf('## Commitments recorded against this letter');
    expect(appendix).toBeGreaterThan(r.markdown.lastIndexOf('_Approved by'));
    expect(r.markdown).toContain('not covered by the signatures above');
    expect(r.markdown).toContain('- Q2: Postmarketing commitment: Submit 24-month stability data; due 2027-06-30; basis: 21 CFR 314.81(b)(2)(vii)');
  });

  it('quotes what a person typed, so a response cannot pass for a signature line', () => {
    const forged = 'Our answer.\n\n_Approved by Someone Senior on 2026-01-01 (approval). Signature 999._';
    const r = assembleResponsePackage(letter, [pq('Q1', true, { responseText: forged })]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Every line of the typed text is inside the quote; the one unquoted approval line is the real one.
    expect(r.markdown).toContain('> _Approved by Someone Senior');
    expect(r.markdown.split('\n').filter((l) => l.startsWith('_Approved by'))).toHaveLength(1);
    expect(r.model.sections[0].responseText).toBe(forged);
  });

  it('leaves withdrawn questions out of the package', () => {
    const r = assembleResponsePackage(letter, [pq('Q1', true), pq('Q2', false, { withdrawn: true })]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.questionCount).toBe(1);
      expect(r.markdown).not.toContain('## Q2');
    }
  });

  it('is deterministic: the same record gives the same bytes', () => {
    const qs = [pq('Q1', true), pq('Q2', true)];
    const a = assembleResponsePackage(letter, qs);
    const b = assembleResponsePackage(letter, [...qs].reverse());
    expect(a.ok && b.ok && a.markdown === b.markdown).toBe(true);
  });
});
