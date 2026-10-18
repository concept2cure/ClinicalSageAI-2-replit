/**
 * HA Interaction & Commitment — deterministic logic (Capability C2C-03)
 *
 * Pure, DB-free, LLM-free: commitment status derivation from dates, portfolio
 * urgency bucketing, and the meeting-readiness gate. These are the floors the
 * service and any AI narration sit on top of.
 *
 * @module server/services/ha-interactions/ha-logic
 */

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
