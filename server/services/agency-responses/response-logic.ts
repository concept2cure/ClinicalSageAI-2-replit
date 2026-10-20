/**
 * Agency responses — what an answer to an agency letter is, whether it is
 * approved, who may approve it, and the package it ships in. Pure: no
 * database, no clock, no model.
 *
 * ── The record ───────────────────────────────────────────────────────────────
 * An inbox letter (concept2cure_agency_communications) carries the questions
 * the agency asked, one agency_communication_questions row each, and our
 * response to each. Every text a response has had is kept in
 * agency_question_response_revisions. A response is approved by a Part 11
 * signature on `agency-question:<id>` (21 CFR 11.50, 11.70, 11.200). The
 * signature binds `agencyResponseDigest` — the letter, the question as the
 * agency worded it and the exact response text — and nothing else: no
 * revision, status or time, so the digest changes only when what the signer
 * approved changes. The text a signature approved is read back from the
 * revision whose digest it binds.
 *
 * ── Approval is read, never stored ───────────────────────────────────────────
 * A response is approved when a live signature (not superseded) on its
 * question binds the digest of the response as it stands now. Edit one
 * character after signing and the digest moves: the earlier signature still
 * exists, still says what it approved, and no longer approves this text. The
 * state is `changed-after-approval` until someone signs again. There is no
 * approval column that could say otherwise.
 *
 * ── Who may approve ──────────────────────────────────────────────────────────
 * Nobody who wrote any of the text being approved: every writer of a revision
 * after the last revision a live signature approved (all writers, if none was
 * ever approved). Barring only the last saver let the real author approve
 * their own answer once a colleague changed a comma (review of 0308ee25).
 *
 * ── Why this is here and not in the route ────────────────────────────────────
 * The content binder (part11/governed-target-binders.ts) computes the digest a
 * signature binds; the read path and the revision writer compute it again. Two
 * hand-copied recipes drifted once on this platform (signature-persistence.ts,
 * manifestSignatureHash), so there is one recipe and all of them import it.
 *
 * RULE 2: every state, count and verdict here is computed from the record.
 *
 * @module server/services/agency-responses/response-logic
 */

import { createHash } from 'node:crypto';
import { utcDay } from '../../../shared/utils/utc-day';

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

/** One text a response has had (agency_question_response_revisions). */
export interface ResponseRevision {
  revision: number;
  responseText: string;
  digest: string;
  writtenBy: number;
  writtenByName: string | null;
  writtenAt: string;
  reason: string;
}

export type ResponseState = 'unanswered' | 'drafted' | 'changed-after-approval' | 'approved' | 'withdrawn';

export interface QuestionRecord extends AgencyResponseContent {
  id: number;
  responseRevision: number;
  responseUpdatedBy: number | null;
  /** Withdrawn with a reason: recorded in error, not asked by the agency, so it needs no answer. */
  withdrawn?: boolean;
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
  const current = sorted.find((s) => s.boundDigest === digest) ?? null;
  if (q.withdrawn) return { state: 'withdrawn', digest, approval: null, supersededApproval: null };
  if (q.responseText.trim() === '') {
    return { state: 'unanswered', digest, approval: null, supersededApproval: null };
  }
  if (current) return { state: 'approved', digest, approval: current, supersededApproval: null };
  const earlier = sorted[0] ?? null;
  return earlier
    ? { state: 'changed-after-approval', digest, approval: null, supersededApproval: earlier }
    : { state: 'drafted', digest, approval: null, supersededApproval: null };
}

/**
 * Everyone who wrote any of the text a signature would now approve: the
 * writers of every revision after the last one a live signature approved (all
 * writers when none was), and whoever the question row says wrote the current
 * text (a response saved before revision history existed has no revision rows).
 */
export function authorsSinceLastApproval(
  q: Pick<QuestionRecord, 'responseUpdatedBy'>,
  revisions: readonly Pick<ResponseRevision, 'revision' | 'digest' | 'writtenBy'>[],
  signatures: readonly Pick<ResponseSignature, 'boundDigest'>[],
): number[] {
  const approved = new Set(signatures.map((s) => s.boundDigest));
  const lastApproved = revisions.reduce((max, r) => (approved.has(r.digest) && r.revision > max ? r.revision : max), 0);
  const authors = new Set(revisions.filter((r) => r.revision > lastApproved).map((r) => r.writtenBy));
  if (q.responseUpdatedBy != null) authors.add(q.responseUpdatedBy);
  return [...authors].sort((a, b) => a - b);
}

/**
 * Why `userId` may not sign this response now, or null when nothing in the
 * record stands in the way. Signing authority, the password and the second
 * factor are the ceremony's to check; this is the record's part.
 */
export function signRefusal(
  q: QuestionRecord,
  a: QuestionApproval,
  userId: number,
  authors: readonly number[] = q.responseUpdatedBy != null ? [q.responseUpdatedBy] : [],
): { code: string; message: string } | null {
  if (a.state === 'withdrawn') {
    return { code: 'QUESTION_WITHDRAWN', message: `${q.questionRef} was withdrawn, so it takes no approval.` };
  }
  if (a.state === 'unanswered') {
    return { code: 'NOTHING_TO_SIGN', message: `${q.questionRef} has no response yet, so there is nothing to approve.` };
  }
  if (a.state === 'approved') {
    return { code: 'ALREADY_APPROVED', message: `${q.questionRef} is already approved as it stands.` };
  }
  if (authors.includes(userId)) {
    return {
      code: 'SIGNER_WROTE_RESPONSE',
      message: `You wrote part of the response to ${q.questionRef} since it was last approved, so someone else must approve it.`,
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
  state: Exclude<ResponseState, 'approved' | 'withdrawn'>;
}

/** The questions that keep a letter from being answered, in the agency's order. Withdrawn ones are not among them. */
export function outstandingResponses(questions: ReadonlyArray<QuestionRecord & { approval: QuestionApproval }>): Outstanding[] {
  return [...questions]
    .sort(compareQuestionRefs)
    .filter((q) => q.approval.state !== 'approved' && q.approval.state !== 'withdrawn')
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
 * Whether a letter may be closed: the reason it may not, or null.
 *   - A letter that says a response is required closes only once at least one
 *     question is recorded and every recorded question is approved as it
 *     stands (withdrawn ones aside). "Nothing recorded" is not "answered".
 *   - A letter that requires no response, with no questions recorded, closes as
 *     before: an acknowledgement asks nothing. If questions were recorded on it
 *     anyway, they are answered before it closes.
 */
export function closeRefusal(
  questions: ReadonlyArray<QuestionRecord & { approval: QuestionApproval }>,
  responseRequired: boolean,
): string | null {
  const active = questions.filter((q) => q.approval.state !== 'withdrawn');
  if (active.length === 0) {
    return responseRequired
      ? 'This letter requires a response and no question is recorded on it. Record each question and approve each response ' +
          'before closing it. If the letter asks nothing, mark it as needing no response, with a reason.'
      : null;
  }
  const open = outstandingResponses(active);
  if (open.length === 0) return null;
  return (
    `${open.length} of ${active.length} responses to this letter are not approved: ` +
    `${describeOutstanding(open)}. A letter is closed once every response is signed.`
  );
}

// ── Overdue: one definition, a property of the letter (2026-10-19) ────────────
//
// CMC / Module 3 counted "information requests overdue" by its own rule over
// its own file (a question past its own due date whose status a person had not
// set to CLOSED), and the inbox card said "(-1d)" from the browser's clock (it
// now counts the same UTC days, shared/utils/utc-day.ts, and claims no verdict).
// An agency's clock runs on the letter, and a letter is answered when its
// responses are approved: the close rule above. So overdue is that rule's
// shadow, and nothing else may compute it.

/* The UTC calendar day of a stored date: one rule, shared with the inbox's day
   count (shared/utils/utc-day.ts), so the card and this verdict read the same day. */
export { utcDay };

export interface DueLetter {
  responseRequired: boolean;
  closureStatus: string;
  dueDate: string | null;
}

/**
 * Whether a letter is overdue on `today` (the server's UTC day): it requires a
 * response, is not closed, its due date's UTC day is before today, and it may
 * not be closed as its questions stand (closeRefusal: a response-required
 * letter with nothing recorded is not answered, and every recorded question
 * must be approved as it stands). Due today is not overdue. An approved answer
 * never makes a letter overdue; a letter whose questions are all approved is
 * not overdue while it waits to be closed.
 */
export function letterOverdue(
  letter: DueLetter,
  questions: ReadonlyArray<QuestionRecord & { approval: QuestionApproval }>,
  today: string,
): boolean {
  if (!letter.responseRequired || letter.closureStatus === 'closed') return false;
  const due = utcDay(letter.dueDate);
  if (due === null || due >= today) return false;
  return closeRefusal(questions, true) !== null;
}

/** A question is overdue when its letter is and it is not answered as it stands; approved and withdrawn ones never are. */
export function questionOverdue(letterIsOverdue: boolean, state: ResponseState): boolean {
  return letterIsOverdue && (state === 'unanswered' || state === 'drafted' || state === 'changed-after-approval');
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

/** The package as a structure, rendered to Markdown here and to DOCX by response-package-docx.ts. */
export interface ResponsePackageModel {
  title: string;
  header: string[];
  attestation: string;
  sections: Array<{
    questionRef: string;
    discipline: string | null;
    questionText: string;
    responseText: string;
    signature: string;
  }>;
  /** Commitments register entries for the letter: tracked separately, NOT covered by the signatures. */
  commitments: Array<{ questionRef: string; line: string }>;
}

export type PackageResult =
  | { ok: true; title: string; markdown: string; model: ResponsePackageModel; questionCount: number; signatureIds: number[] }
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

/**
 * A quoted block: each line of the text prefixed, blank lines kept. Everything
 * a person typed is quoted, so no line of it can stand outside the quote and
 * pass for one of the package's own lines (a signature line, a heading).
 */
function quoted(text: string): string {
  return text.split(/\r?\n/).map((l) => (l ? `> ${l}` : '>')).join('\n');
}

/** One line of person-typed text, with Markdown's line-level structure characters neutralised. */
function inline(text: string): string {
  return text.replace(/\r?\n+/g, ' ').replace(/([\\`*_[\]#>|])/g, '\\$1');
}

/**
 * The response package: every question still asked, in the agency's order,
 * each with the approved response and the signature that approved it. Refused
 * — never partial — unless every such response is approved as it stands.
 * Withdrawn questions are not in it. Commitments recorded against the letter
 * follow in their own section, said to be outside the signatures, because no
 * signature binds them. Nothing is drafted or filled in here.
 */
export function assembleResponsePackage(letter: PackageLetter, questions: readonly PackageQuestion[]): PackageResult {
  const asked = questions.filter((q) => q.approval.state !== 'withdrawn');
  if (asked.length === 0) {
    return {
      ok: false,
      code: 'NO_QUESTIONS',
      message: 'No questions are recorded on this letter, so there is no response package to assemble.',
      outstanding: [],
    };
  }
  const open = outstandingResponses(asked);
  if (open.length > 0) {
    return {
      ok: false,
      code: 'RESPONSES_NOT_APPROVED',
      message:
        `${open.length} of ${asked.length} responses are not approved, so the package was not assembled: ` +
        `${describeOutstanding(open)}.`,
      outstanding: open,
    };
  }

  const ordered = [...asked].sort(compareQuestionRefs);
  const received = day(letter.receivedDate);
  const due = day(letter.dueDate);
  const model: ResponsePackageModel = {
    title: `Response to ${letter.communicationType} (${letter.eventId})`,
    header: [
      `Letter: ${letter.eventId}`,
      ...(received ? [`Received: ${received}`] : []),
      ...(due ? [`Response due: ${due}`] : []),
      `Questions answered: ${ordered.length}`,
    ],
    attestation:
      'Each response below was approved by electronic signature (21 CFR Part 11). ' +
      'The signature binds the question and the exact response text shown.',
    sections: ordered.map((q) => {
      const sig = q.approval.approval!;
      return {
        questionRef: q.questionRef,
        discipline: q.discipline,
        questionText: q.questionText,
        responseText: q.responseText,
        signature:
          `Approved by ${sig.signerName} on ${sig.signedAt}` +
          (sig.meaning ? ` (${sig.meaning})` : '') +
          `. Signature ${sig.id}; response sha256 ${q.approval.digest}.`,
      };
    }),
    commitments: ordered.flatMap((q) =>
      q.commitments.map((c) => ({
        questionRef: q.questionRef,
        line: [
          `${COMMITMENT_WORDS[c.commitmentType] ?? 'Commitment'}: ${c.description}`,
          day(c.dueDate) ? `due ${day(c.dueDate)}` : null,
          c.regulatoryBasis ? `basis: ${c.regulatoryBasis}` : null,
        ].filter(Boolean).join('; '),
      })),
    ),
  };

  return {
    ok: true,
    title: model.title,
    markdown: renderPackageMarkdown(model),
    model,
    questionCount: ordered.length,
    signatureIds: ordered.map((q) => q.approval.approval!.id),
  };
}

/** The package as Markdown. Person-typed text is quoted or escaped; the package's own lines are not. */
export function renderPackageMarkdown(m: ResponsePackageModel): string {
  const header = [`# ${inline(m.title)}`, '', ...m.header.map(inline), '', m.attestation].join('\n');
  const sections = m.sections.map((s) =>
    [
      `## ${inline(s.questionRef)}${s.discipline ? ` (${inline(s.discipline)})` : ''}`,
      '',
      '**Question**',
      '',
      quoted(s.questionText),
      '',
      '**Response, as approved**',
      '',
      quoted(s.responseText),
      '',
      `_${inline(s.signature)}_`,
    ].join('\n'),
  );
  const parts = [header, ...sections];
  if (m.commitments.length > 0) {
    parts.push(
      [
        '## Commitments recorded against this letter',
        '',
        'From the commitments register. They are tracked separately and are not covered by the signatures above.',
        '',
        ...m.commitments.map((c) => `- ${inline(c.questionRef)}: ${inline(c.line)}`),
      ].join('\n'),
    );
  }
  return parts.join('\n\n---\n\n') + '\n';
}
