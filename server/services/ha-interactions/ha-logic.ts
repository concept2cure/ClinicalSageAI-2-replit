/**
 * HA Interaction & Commitment — deterministic logic (Capability C2C-03)
 *
 * Pure, DB-free, LLM-free: commitment status derivation from dates, portfolio
 * urgency bucketing, and the meeting-readiness gate. These are the floors the
 * service and any AI narration sit on top of.
 *
 * @module server/services/ha-interactions/ha-logic
 */

import { createHash } from 'node:crypto';
import type {
  CommitmentStatus,
  HaInteractionStatus,
  HaInteractionType,
} from '../../../shared/schema/ha-interactions';

/** ISO date (YYYY-MM-DD) → epoch days, or null. Pure, timezone-free. */
function toDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

export interface CommitmentView {
  status: CommitmentStatus;
  dueDate?: string | null;
  fulfilledDate?: string | null;
}

/**
 * Derive the effective status for display/sorting. A commitment that is not
 * terminal (fulfilled/waived/released) and is past due reads as `overdue`,
 * regardless of the stored working status. Terminal states are preserved.
 * Pure — `today` is injected for testability.
 */
export function deriveCommitmentStatus(c: CommitmentView, today: string): CommitmentStatus {
  if (c.status === 'fulfilled' || c.status === 'waived' || c.status === 'released') return c.status;
  const due = toDays(c.dueDate);
  const now = toDays(today);
  if (due != null && now != null && due < now) return 'overdue';
  return c.status;
}

export type UrgencyBucket = 'overdue' | 'due_30' | 'due_90' | 'later' | 'undated' | 'closed';

/** Bucket a commitment by urgency for the portfolio view. Pure. */
export function commitmentUrgency(c: CommitmentView, today: string): UrgencyBucket {
  const eff = deriveCommitmentStatus(c, today);
  if (eff === 'fulfilled' || eff === 'waived' || eff === 'released') return 'closed';
  if (eff === 'overdue') return 'overdue';
  const due = toDays(c.dueDate);
  const now = toDays(today);
  if (due == null || now == null) return 'undated';
  const days = due - now;
  if (days <= 30) return 'due_30';
  if (days <= 90) return 'due_90';
  return 'later';
}

export interface PortfolioSummary {
  total: number;
  overdue: number;
  due_30: number;
  due_90: number;
  later: number;
  undated: number;
  closed: number;
}

/** Summarize a commitment portfolio by urgency. Pure. */
export function summarizeCommitmentPortfolio(commitments: CommitmentView[], today: string): PortfolioSummary {
  const s: PortfolioSummary = { total: commitments.length, overdue: 0, due_30: 0, due_90: 0, later: 0, undated: 0, closed: 0 };
  for (const c of commitments) s[commitmentUrgency(c, today)] += 1;
  return s;
}

// ─── Fulfilment: what met a commitment (P-40, 2026-10-19) ───────────────────

/**
 * The commitment types whose fulfilment is a Part 11 signed act. Recording a
 * postmarketing requirement or commitment, or a REMS, as fulfilled takes it off
 * the overdue register and out of the annual status report (21 CFR
 * 314.81(b)(2)(vii), 601.70; FD&C 505(o)(3), 505-1): an attestation, signed,
 * that names what met it. The database holds the same list
 * (migrations/20261019_commitment_fulfilment_evidence.sql,
 * regulatory_commitments_signed_fulfilment_guard), pinned equal by
 * tests/db/commitment-fulfilment-database.dbtest.ts.
 */
export const SIGNED_FULFILMENT_TYPES = ['pmr', 'pmc', 'rems'] as const;

export interface FulfilmentRule {
  /** Recorded only by an electronic signature (the one ceremony). */
  signatureRequired: boolean;
  /** Names the sequence the agency received, the Vault version, or both. */
  evidenceRequired: boolean;
  /** Names its date: the signer is shown the date the signature binds. */
  dateRequired: boolean;
}

const SIGNED_RULE: FulfilmentRule = Object.freeze({ signatureRequired: true, evidenceRequired: true, dateRequired: true });
const UNSIGNED_RULE: FulfilmentRule = Object.freeze({ signatureRequired: false, evidenceRequired: false, dateRequired: false });

/**
 * What fulfilling a commitment of this type takes. A meeting commitment or
 * other is a governed write with a reason, and what met it may be named. Any
 * other value, which the column's CHECK does not admit today, is held to the
 * signed rule: a new type is never fulfilled more loosely by default.
 */
export function fulfilmentRule(commitmentType: string): FulfilmentRule {
  if (commitmentType === 'meeting_commitment' || commitmentType === 'other') return { ...UNSIGNED_RULE };
  return { ...SIGNED_RULE };
}

/** The type as a person names it in a sentence: "A PMR", "A REMS". */
function typeWords(commitmentType: string): string {
  const t = commitmentType.toUpperCase();
  return ['PMR', 'PMC', 'REMS'].includes(t) ? `A ${t}` : 'This commitment';
}

/** Why this fulfilment names too little to be recorded, or null. */
export function fulfilmentEvidenceRefusal(
  commitmentType: string,
  evidence: { sequenceId?: number | null; vaultDocumentId?: string | null },
): string | null {
  if (!fulfilmentRule(commitmentType).evidenceRequired) return null;
  if (evidence.sequenceId != null || (evidence.vaultDocumentId != null && evidence.vaultDocumentId !== '')) return null;
  return `${typeWords(commitmentType)} is met by a submission or a document. Name the dispatched sequence the agency received, the Vault document version, or both. Nothing was recorded.`;
}

/** Recipe tag inside the digested bytes, so a later recipe cannot collide with this one. */
export const COMMITMENT_FULFILMENT_DIGEST_RECIPE = 'commitment-fulfilment/v1' as const;

/** Exactly what a fulfilment signature binds (BINDING_BASIS.COMMITMENT_FULFILMENT_CONTENT). */
export interface CommitmentFulfilmentContent {
  commitmentId: number;
  commitmentType: string;
  description: string;
  regulatoryBasis: string | null;
  /** yyyy-mm-dd, as the register stores it. */
  dueDate: string | null;
  /** yyyy-mm-dd. */
  fulfilledDate: string | null;
  sequenceId: number | null;
  sequenceNumber: string | null;
  submissionId: number | null;
  vaultDocumentId: string | null;
  vaultSha256: string | null;
}

/**
 * sha256 over the commitment, its fulfilment date and what met it: the
 * sequence (its id, number and submission) and the Vault version (its id and
 * the sha256 of its bytes). A fixed-order array, so the bytes do not depend on
 * key order. No status, recorder or time: those are on the signature and the
 * ledger. The binder and the list read both compute it from one reader
 * (fulfilment-record.ts), so they cannot disagree about the input. A change to
 * this recipe needs a new recipe tag.
 */
export function commitmentFulfilmentDigest(c: CommitmentFulfilmentContent): string {
  const bytes = JSON.stringify([
    COMMITMENT_FULFILMENT_DIGEST_RECIPE,
    c.commitmentId,
    c.commitmentType,
    c.description,
    c.regulatoryBasis,
    c.dueDate,
    c.fulfilledDate,
    c.sequenceId,
    c.sequenceNumber,
    c.submissionId,
    c.vaultDocumentId,
    c.vaultSha256,
  ]);
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

/**
 * How a commitment's fulfilment reads, decided here so the screen narrates a
 * verdict and never derives one:
 *   not-fulfilled        open, in progress, waived or released;
 *   legacy               fulfilled before fulfilments were recorded (no recorder);
 *   recorded             a meeting commitment or other, recorded with a reason;
 *   signed               a live signature binds the record as it stands;
 *   signature-mismatch   a live signature binds something else;
 *   signature-withdrawn  its signature was revoked, voided or superseded;
 *   signature-missing    recorded, of a signed type, with no signature at all.
 */
export type FulfilmentRecordState =
  | 'not-fulfilled'
  | 'legacy'
  | 'recorded'
  | 'signed'
  | 'signature-mismatch'
  | 'signature-withdrawn'
  | 'signature-missing';

export function fulfilmentRecordState(input: {
  status: string;
  signatureRequired: boolean;
  /** fulfilment_recorded_at is set. */
  recorded: boolean;
  liveSignature: { bindsRecord: boolean } | null;
  withdrawnSignature: boolean;
}): FulfilmentRecordState {
  if (input.status !== 'fulfilled') return 'not-fulfilled';
  if (!input.recorded) return 'legacy';
  if (!input.signatureRequired) return 'recorded';
  if (input.liveSignature) return input.liveSignature.bindsRecord ? 'signed' : 'signature-mismatch';
  return input.withdrawnSignature ? 'signature-withdrawn' : 'signature-missing';
}

export interface MeetingReadinessInput {
  interactionType: HaInteractionType;
  status: HaInteractionStatus;
  hasBriefingBook: boolean;
  questionCount: number;
  scheduledDate?: string | null;
}

export interface ReadinessFinding {
  severity: 'critical' | 'major' | 'minor';
  message: string;
  basis: string;
}

export interface MeetingReadiness {
  /** null when there is no scheduled or held meeting to assess; `note` says why. */
  ready: boolean | null;
  findings: ReadinessFinding[];
  note?: string;
}

/**
 * Readiness gate for a formal FDA meeting: by the time a meeting is `scheduled`
 * or `held`, a briefing package and a specific question list are expected
 * (FDA Formal Meetings guidance / PDUFA; the briefing book is due ~30 days
 * before the meeting). Pure — returns cited findings + a ready flag.
 *
 * Until 2026-10-15 a planned, requested, closed or cancelled interaction was
 * `ready: true` with nothing assessed, and a meeting with no question list (a
 * major finding) was still ready; AnA then said "Interaction N is
 * meeting-ready." Now: not assessed (null, with the reason) until the meeting
 * is scheduled, and not ready while a critical or major gap is open.
 */
export function evaluateMeetingReadiness(m: MeetingReadinessInput): MeetingReadiness {
  if (m.status === 'planned' || m.status === 'requested') {
    return { ready: null, findings: [], note: `Readiness is assessed once the meeting is scheduled; this one is ${m.status}.` };
  }
  if (m.status === 'closed' || m.status === 'cancelled') {
    return { ready: null, findings: [], note: `The interaction is ${m.status}; there is no meeting to be ready for.` };
  }
  // scheduled, held or minutes_received: the package is expected by now.
  const findings: ReadinessFinding[] = [];
  if (!m.hasBriefingBook) {
    findings.push({
      severity: 'critical',
      message: 'No briefing book is attached; the briefing package is due ~30 days before a formal meeting.',
      basis: 'FDA Formal Meetings guidance (PDUFA); briefing document timing',
    });
  }
  if (m.questionCount === 0) {
    findings.push({
      severity: 'major',
      message: 'No questions are recorded; a formal meeting should carry a specific, prioritized question list.',
      basis: 'FDA Formal Meetings guidance',
    });
  }
  if ((m.status === 'scheduled') && !m.scheduledDate) {
    findings.push({ severity: 'minor', message: 'Meeting is scheduled but no date is set.', basis: 'meeting logistics' });
  }
  const ready = !findings.some((f) => f.severity === 'critical' || f.severity === 'major');
  return { ready, findings };
}

// ─── Meeting-package assembly (orchestration) ────────────────────────────────

export interface MeetingQuestionView { questionNumber?: number | null; questionText: string; agreementReached?: boolean | null }

export interface MeetingPackage {
  /** null when there is no scheduled or held meeting to assess; `readinessNote` says why. */
  ready: boolean | null;
  readinessNote?: string;
  findings: ReadinessFinding[];
  questionCount: number;
  openQuestions: MeetingQuestionView[];
  outstandingCommitments: number;
  overdueCommitments: number;
  actions: string[];
}

/**
 * Assemble a pre-meeting package for a health-authority interaction: the readiness
 * verdict (briefing book + question list present by the time it's scheduled/held),
 * the open questions (no agreement yet), and the commitments that originated from
 * this interaction with their effective status. Produces a single prioritized
 * "before the meeting" action list. Pure — the service loads the reads.
 */
export function assembleMeetingPackage(
  readiness: MeetingReadinessInput,
  questions: MeetingQuestionView[],
  commitments: CommitmentView[],
  today: string,
): MeetingPackage {
  const { ready, findings, note } = evaluateMeetingReadiness(readiness);
  const openQuestions = questions.filter((q) => q.agreementReached !== true);
  const outstanding = commitments.filter((c) => deriveCommitmentStatus(c, today) !== 'fulfilled' && deriveCommitmentStatus(c, today) !== 'waived' && deriveCommitmentStatus(c, today) !== 'released');
  const overdue = commitments.filter((c) => deriveCommitmentStatus(c, today) === 'overdue').length;

  const actions: string[] = [];
  for (const f of findings) actions.push(`[${f.severity}] ${f.message}`);
  const expectsPrep = readiness.status === 'scheduled' || readiness.status === 'held';
  if (expectsPrep && openQuestions.length > 0) actions.push(`Resolve or finalize ${openQuestions.length} open question(s) before the meeting.`);
  if (overdue > 0) actions.push(`${overdue} commitment(s) from this interaction are overdue — address before the next engagement.`);

  return { ready, readinessNote: note, findings, questionCount: questions.length, openQuestions, outstandingCommitments: outstanding.length, overdueCommitments: overdue, actions };
}
