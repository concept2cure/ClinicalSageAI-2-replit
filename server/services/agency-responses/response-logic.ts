/**
 * Agency responses — what an answer to an agency letter is, whether it is
 * approved, and the package it ships in. Pure: no database, no clock, no model.
 *
 * ── The record ───────────────────────────────────────────────────────────────
 * An inbox letter (concept2cure_agency_communications) carries the questions
 * the agency asked, one agency_communication_questions row each, and our
 * response to each. A response is approved by a Part 11 signature on
 * `agency-question:<id>` (21 CFR 11.50, 11.70, 11.200). The signature binds
 * `agencyResponseDigest` — the letter, the question as the agency worded it and
 * the exact response text — and nothing else: no revision, status or time, so
 * the digest changes only when what the signer approved changes.
 *
 * ── Approval is read, never stored ───────────────────────────────────────────
 * A response is approved when a live signature (not superseded) on its
 * question binds the digest of the response as it stands now. Edit one
 * character after signing and the digest moves: the earlier signature still
 * exists, still says what it approved, and no longer approves this text. The
 * state is `changed-after-approval` until someone signs again. There is no
 * approval column that could say otherwise.
 *
 * ── Why this is here and not in the route ────────────────────────────────────
 * The content binder (part11/governed-target-binders.ts) computes the digest a
 * signature binds; the read path computes it again to decide approval. Two
 * hand-copied recipes drifted once on this platform (signature-persistence.ts,
 * manifestSignatureHash), so there is one recipe and both import it.
 *
 * RULE 2: every state, count and verdict here is computed from the record.
 *
 * @module server/services/agency-responses/response-logic
 */

import { createHash } from 'node:crypto';

/** Recipe tag inside the digested bytes, so a later recipe cannot collide with this one. */
export const AGENCY_RESPONSE_DIGEST_RECIPE = 'agency-response/v1' as const;

export interface AgencyResponseContent {
  communicationEventId: string;
  questionRef: string;
  questionText: string;
  responseText: string;
}

/**
 * sha256 over exactly what a signer approves: which letter, which question,
 * the question's words and the response's words. A fixed-order array, so the
 * bytes cannot depend on key order.
 */
export function agencyResponseDigest(c: AgencyResponseContent): string {
  const bytes = JSON.stringify([
    AGENCY_RESPONSE_DIGEST_RECIPE,
    c.communicationEventId,
    c.questionRef,
    c.questionText,
    c.responseText,
  ]);
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

/** A live signature on one question, as electronic_signatures records it. */
export interface ResponseSignature {
  id: number;
  boundDigest: string;
  signerId: number;
  signerName: string;
  signedAt: string;
  meaning: string | null;
}

export type ResponseState = 'unanswered' | 'drafted' | 'changed-after-approval' | 'approved';

export interface QuestionRecord extends AgencyResponseContent {
  id: number;
  responseRevision: number;
  responseUpdatedBy: number | null;
}

export interface QuestionApproval {
  state: ResponseState;
  /** The digest of the response as it stands. */
  digest: string;
  /** The signature approving the current text; null unless state is 'approved'. */
  approval: ResponseSignature | null;
  /** The newest signature on an earlier text; set only for 'changed-after-approval'. */
  supersededApproval: ResponseSignature | null;
}

function newestFirst(a: ResponseSignature, b: ResponseSignature): number {
  if (a.signedAt !== b.signedAt) return a.signedAt < b.signedAt ? 1 : -1;
  return b.id - a.id;
}

/**
 * Where one question stands, from its record and the live signatures on it.
 * `signatures` must already be limited to this question's target and to rows
 * that are not superseded; this decides nothing about revocation.
 */
export function questionApproval(q: QuestionRecord, signatures: readonly ResponseSignature[]): QuestionApproval {
  const digest = agencyResponseDigest(q);
  const sorted = [...signatures].sort(newestFirst);
  if (q.responseText.trim() === '') {
    return { state: 'unanswered', digest, approval: null, supersededApproval: null };
  }
  const current = sorted.find((s) => s.boundDigest === digest) ?? null;
  if (current) return { state: 'approved', digest, approval: current, supersededApproval: null };
  const earlier = sorted[0] ?? null;
  return earlier
    ? { state: 'changed-after-approval', digest, approval: null, supersededApproval: earlier }
    : { state: 'drafted', digest, approval: null, supersededApproval: null };
}

/**
 * Why `userId` may not sign this response now, or null when nothing in the
 * record stands in the way. Signing authority, the password and the second
 * factor are the ceremony's to check; this is the record's part.
 */
export function signRefusal(q: QuestionRecord, a: QuestionApproval, userId: number): { code: string; message: string } | null {
  if (a.state === 'unanswered') {
    return { code: 'NOTHING_TO_SIGN', message: `${q.questionRef} has no response yet, so there is nothing to approve.` };
  }
  if (a.state === 'approved') {
    return { code: 'ALREADY_APPROVED', message: `${q.questionRef} is already approved as it stands.` };
  }
  if (q.responseUpdatedBy === userId) {
    return {
      code: 'SIGNER_WROTE_RESPONSE',
      message: `You wrote the current response to ${q.questionRef}, so someone else must approve it.`,
    };
  }
  return null;
}

/** Natural order of the agency's numbering: Q2 before Q10, then by record id. */
export function compareQuestionRefs(a: { questionRef: string; id: number }, b: { questionRef: string; id: number }): number {
  const c = a.questionRef.localeCompare(b.questionRef, 'en', { numeric: true, sensitivity: 'base' });
  return c !== 0 ? c : a.id - b.id;
}

export interface Outstanding {
  questionRef: string;
  state: Exclude<ResponseState, 'approved'>;
}

/** The questions that keep a letter from being answered, in the agency's order. */
export function outstandingResponses(questions: ReadonlyArray<QuestionRecord & { approval: QuestionApproval }>): Outstanding[] {
  return [...questions]
    .sort(compareQuestionRefs)
    .filter((q) => q.approval.state !== 'approved')
    .map((q) => ({ questionRef: q.questionRef, state: q.approval.state as Outstanding['state'] }));
}

const STATE_WORDS: Record<Outstanding['state'], string> = {
  unanswered: 'no response',
  drafted: 'not approved',
  'changed-after-approval': 'changed after approval',
};

/** "Q2 (no response), Q5 (changed after approval)". */
export function describeOutstanding(list: readonly Outstanding[]): string {
  return list.map((o) => `${o.questionRef} (${STATE_WORDS[o.state]})`).join(', ');
}

/**
 * Whether a letter may be closed. A letter with recorded questions closes only
 * when every response is approved as it stands; one with none recorded is
 * outside this rule (it may be an acknowledgement that asks nothing).
 */
export function closeRefusal(
  questions: ReadonlyArray<QuestionRecord & { approval: QuestionApproval }>,
): string | null {
  const open = outstandingResponses(questions);
  if (open.length === 0) return null;
  return (
    `${open.length} of ${questions.length} responses to this letter are not approved: ` +
    `${describeOutstanding(open)}. A letter is closed once every response is signed.`
  );
}

// ── The response package ────────────────────────────────────────────────────

export interface PackageLetter {
  eventId: string;
  communicationType: string;
  sourceType: string;
  receivedDate: string | null;
  dueDate: string | null;
}

export interface PackageCommitment {
  id: number;
  commitmentType: string;
  description: string;
  dueDate: string | null;
  regulatoryBasis: string | null;
}

export interface PackageQuestion extends QuestionRecord {
  discipline: string | null;
  approval: QuestionApproval;
  commitments: readonly PackageCommitment[];
}

export type PackageResult =
  | { ok: true; title: string; markdown: string; questionCount: number; signatureIds: number[] }
  | { ok: false; code: 'NO_QUESTIONS' | 'RESPONSES_NOT_APPROVED'; message: string; outstanding: Outstanding[] };

const COMMITMENT_WORDS: Record<string, string> = {
  pmr: 'Postmarketing requirement',
  pmc: 'Postmarketing commitment',
  rems: 'REMS',
  meeting_commitment: 'Commitment',
  other: 'Commitment',
};

function day(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : null;
}

/** A quoted block: each line of the text prefixed, blank lines kept. */
function quoted(text: string): string {
  return text.split(/\r?\n/).map((l) => (l ? `> ${l}` : '>')).join('\n');
}

/**
 * The response package: every question in the agency's order, each with the
 * approved response and the signature that approved it, and the commitments
 * made in it. Refused — never partial — unless every response is approved as
 * it stands. Nothing is drafted or filled in here.
 */
export function assembleResponsePackage(letter: PackageLetter, questions: readonly PackageQuestion[]): PackageResult {
  if (questions.length === 0) {
    return {
      ok: false,
      code: 'NO_QUESTIONS',
      message: 'No questions are recorded on this letter, so there is no response package to assemble.',
      outstanding: [],
    };
  }
  const open = outstandingResponses(questions);
  if (open.length > 0) {
    return {
      ok: false,
      code: 'RESPONSES_NOT_APPROVED',
      message:
        `${open.length} of ${questions.length} responses are not approved, so the package was not assembled: ` +
        `${describeOutstanding(open)}.`,
      outstanding: open,
    };
  }

  const ordered = [...questions].sort(compareQuestionRefs);
  const received = day(letter.receivedDate);
  const due = day(letter.dueDate);
  const header = [
    `# Response to ${letter.communicationType}`,
    '',
    `Letter: ${letter.eventId}`,
    ...(received ? [`Received: ${received}`] : []),
    ...(due ? [`Response due: ${due}`] : []),
    `Questions answered: ${ordered.length}`,
    '',
    'Each response below was approved by electronic signature (21 CFR Part 11). ' +
      'The signature binds the question and the exact response text shown.',
  ].join('\n');

  const sections = ordered.map((q) => {
    const sig = q.approval.approval!;
    const parts = [
      `## ${q.questionRef}${q.discipline ? ` (${q.discipline})` : ''}`,
      '',
      '**Question**',
      '',
      quoted(q.questionText),
      '',
      '**Response**',
      '',
      q.responseText,
      '',
      `_Approved by ${sig.signerName} on ${sig.signedAt}` +
        (sig.meaning ? ` (${sig.meaning})` : '') +
        `. Signature ${sig.id}; response sha256 ${q.approval.digest}._`,
    ];
    if (q.commitments.length > 0) {
      parts.push('', '**Commitments made in this response**', '');
      for (const c of q.commitments) {
        const bits = [
          `${COMMITMENT_WORDS[c.commitmentType] ?? 'Commitment'}: ${c.description}`,
          day(c.dueDate) ? `due ${day(c.dueDate)}` : null,
          c.regulatoryBasis ? `basis: ${c.regulatoryBasis}` : null,
        ].filter(Boolean);
        parts.push(`- ${bits.join('; ')}`);
      }
    }
    return parts.join('\n');
  });

  return {
    ok: true,
    title: `Response to ${letter.communicationType} (${letter.eventId})`,
    markdown: [header, ...sections].join('\n\n---\n\n') + '\n',
    questionCount: ordered.length,
    signatureIds: ordered.map((q) => q.approval.approval!.id),
  };
}
