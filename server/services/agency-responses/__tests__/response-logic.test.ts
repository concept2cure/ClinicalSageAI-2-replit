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
  it('a letter with no recorded questions is outside the rule', () => {
    expect(closeRefusal([])).toBeNull();
  });

  it('refuses while any response is not approved, naming each in the agency order', () => {
    const msg = closeRefusal([pq('Q10', false), pq('Q2', true), pq('Q3', false, { responseText: '' })]);
    expect(msg).toBe(
      '2 of 3 responses to this letter are not approved: Q3 (no response), Q10 (not approved). ' +
        'A letter is closed once every response is signed.',
    );
  });

  it('allows the close once every response is approved', () => {
    expect(closeRefusal([pq('Q1', true), pq('Q2', true)])).toBeNull();
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
    expect(r.markdown).toContain('- Postmarketing commitment: Submit 24-month stability data; due 2027-06-30; basis: 21 CFR 314.81(b)(2)(vii)');
    expect(r.markdown).toContain('> Provide the dissolution method validation report.');
  });

  it('is deterministic: the same record gives the same bytes', () => {
    const qs = [pq('Q1', true), pq('Q2', true)];
    const a = assembleResponsePackage(letter, qs);
    const b = assembleResponsePackage(letter, [...qs].reverse());
    expect(a.ok && b.ok && a.markdown === b.markdown).toBe(true);
  });
});
