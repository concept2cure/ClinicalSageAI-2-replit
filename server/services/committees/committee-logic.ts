/**
 * Research committee deterministic logic (Capability C2C-16)
 *
 * Pure, DB-free, LLM-free: committee composition validation, meeting quorum, the
 * vote tally, and the determination resolved from votes. This is the governance
 * core — a determination is always the deterministic output of these functions.
 *
 * Grounded in:
 *  - IACUC: PHS Policy IV.C.2 / AWA 9 CFR 2.31(c)(d) — a convened quorum is a
 *    majority of the voting members; approval requires the vote of a majority of
 *    the quorum present. Committee must include a veterinarian.
 *  - IRB: 45 CFR 46.107-46.108 — membership must include at least one nonscientist
 *    and at least one member not affiliated with the institution; quorum is a
 *    majority of members (with a nonscientist present); approval requires the vote
 *    of a majority of the members present.
 *
 * @module server/services/committees/committee-logic
 */

export const PHS_POLICY = 'PHS Policy IV.C.2 / AWA 9 CFR 2.31 — IACUC quorum & majority vote';
export const COMMON_RULE_107 = '45 CFR 46.107 — IRB membership (nonscientist + non-affiliated member)';
export const COMMON_RULE_108 = '45 CFR 46.108 — IRB quorum (majority present, incl. a nonscientist) & majority-vote approval';

export type CommitteeType = 'iacuc' | 'irb' | 'ibc';
export type CommitteeVote = 'approve' | 'approve_with_modifications' | 'disapprove' | 'abstain' | 'recuse';
export type AgendaOutcome = 'approved' | 'approved_with_modifications' | 'disapproved' | 'tabled';

// ─── Composition validation ──────────────────────────────────────────────────

export interface CommitteeMemberView {
  votingMember: boolean;
  scientist: boolean;
  affiliated: boolean;
  role: string;
  status: string;
}

export interface CompositionFinding { severity: 'critical' | 'warning'; message: string; basis: string }
export interface CompositionResult {
  votingMembers: number;
  compliant: boolean;
  findings: CompositionFinding[];
}

/**
 * Validate standing-committee composition against the regulatory minimums.
 * IACUC (PHS Policy / AWA): ≥1 veterinarian, ≥1 nonaffiliated member, ≥5 members.
 * IRB (45 CFR 46.107): ≥5 members, ≥1 nonscientist, ≥1 non-affiliated member.
 * Pure — `critical` findings mean the committee is not lawfully constituted.
 */
export function evaluateComposition(committeeType: CommitteeType, members: CommitteeMemberView[]): CompositionResult {
  const active = members.filter((m) => m.status === 'active');
  const voting = active.filter((m) => m.votingMember);
  const findings: CompositionFinding[] = [];

  if (active.length < 5) {
    findings.push({ severity: 'critical', message: `Committee has ${active.length} active members; at least 5 are required.`, basis: committeeType === 'iacuc' ? PHS_POLICY : COMMON_RULE_107 });
  }
  const hasNonAffiliated = active.some((m) => !m.affiliated);
  if (!hasNonAffiliated) {
    findings.push({ severity: 'critical', message: 'No non-affiliated (community) member on the committee.', basis: committeeType === 'iacuc' ? 'AWA 9 CFR 2.31(b)(3)(ii)' : COMMON_RULE_107 });
  }
  if (committeeType === 'irb') {
    if (!active.some((m) => !m.scientist)) {
      findings.push({ severity: 'critical', message: 'No nonscientist member on the IRB.', basis: COMMON_RULE_107 });
    }
  }
  if (committeeType === 'iacuc') {
    if (!active.some((m) => m.role === 'veterinarian')) {
      findings.push({ severity: 'critical', message: 'No attending veterinarian on the IACUC.', basis: 'PHS Policy IV.A.3.b.1 — IACUC must include a veterinarian' });
    }
  }
  if (!active.some((m) => m.role === 'chair')) {
    findings.push({ severity: 'warning', message: 'No chair designated for the committee.', basis: committeeType === 'iacuc' ? PHS_POLICY : COMMON_RULE_107 });
  }

  return { votingMembers: voting.length, compliant: !findings.some((f) => f.severity === 'critical'), findings };
}

// ─── Quorum ──────────────────────────────────────────────────────────────────

export interface QuorumInput {
  committeeType: CommitteeType;
  /** Total active voting members on the standing committee. */
  votingMembersTotal: number;
  /** Voting members recorded present at convene. */
  votingPresent: number;
  /** Is at least one nonscientist present? (IRB requirement, 45 CFR 46.108(b)). */
  nonscientistPresent: boolean;
  /** Is the attending veterinarian present? (IACUC best practice). */
  veterinarianPresent?: boolean;
}

export interface QuorumResult {
  quorumRequired: number;
  quorumMet: boolean;
  issues: string[];
  basis: string;
}

/** Majority of voting members. Pure. */
export function quorumThreshold(votingMembersTotal: number): number {
  return Math.floor(Math.max(0, votingMembersTotal) / 2) + 1;
}

/**
 * Compute whether a convened meeting has quorum. Quorum is a majority of voting
 * members present; the IRB additionally requires a nonscientist present
 * (45 CFR 46.108(b)). Pure — the deterministic gate for opening voting.
 */
export function computeQuorum(input: QuorumInput): QuorumResult {
  const quorumRequired = quorumThreshold(input.votingMembersTotal);
  const issues: string[] = [];
  let met = input.votingPresent >= quorumRequired && input.votingMembersTotal > 0;

  if (input.votingPresent < quorumRequired) {
    issues.push(`Only ${input.votingPresent} voting member(s) present; quorum requires ${quorumRequired}.`);
  }
  if (input.committeeType === 'irb' && !input.nonscientistPresent) {
    issues.push('A nonscientist member must be present for IRB quorum (45 CFR 46.108(b)).');
    met = false;
  }
  if (input.committeeType === 'iacuc' && input.veterinarianPresent === false) {
    issues.push('Attending veterinarian is not present — recommended for IACUC review.');
  }

  return {
    quorumRequired,
    quorumMet: met,
    issues,
    basis: input.committeeType === 'iacuc' ? PHS_POLICY : COMMON_RULE_108,
  };
}

// ─── Vote tally + determination ──────────────────────────────────────────────

export interface VoteTally {
  approve: number;
  approveWithModifications: number;
  disapprove: number;
  abstain: number;
  recuse: number;
  /** Members present and not recused (the base for the majority test). */
  present: number;
  totalCast: number;
}

export function tallyVotes(votes: { vote: CommitteeVote }[]): VoteTally {
  const t: VoteTally = { approve: 0, approveWithModifications: 0, disapprove: 0, abstain: 0, recuse: 0, present: 0, totalCast: votes.length };
  for (const v of votes) {
    switch (v.vote) {
      case 'approve': t.approve += 1; break;
      case 'approve_with_modifications': t.approveWithModifications += 1; break;
      case 'disapprove': t.disapprove += 1; break;
      case 'abstain': t.abstain += 1; break;
      case 'recuse': t.recuse += 1; break;
    }
  }
  // Recused members are not counted as "present" for the majority base; abstentions are.
  t.present = t.totalCast - t.recuse;
  return t;
}

export interface DeterminationInput {
  committeeType: CommitteeType;
  quorumMet: boolean;
  tally: VoteTally;
}

export interface DeterminationResult {
  outcome: AgendaOutcome;
  rationale: string;
  basis: string;
  majorityNeeded: number;
}

/**
 * Resolve the committee determination from the poll. Without quorum the item is
 * tabled. With quorum, approval requires a majority of members present
 * (45 CFR 46.108(b) / AWA 9 CFR 2.31(d)(2)); when the approving majority is
 * predominantly conditional, the outcome is approved-with-modifications. A
 * disapproving majority disapproves; no majority tables the item. Pure.
 */
export function determineOutcome(input: DeterminationInput): DeterminationResult {
  const basis = input.committeeType === 'iacuc' ? PHS_POLICY : COMMON_RULE_108;
  const { tally } = input;
  const majorityNeeded = Math.floor(tally.present / 2) + 1;

  if (!input.quorumMet) {
    return { outcome: 'tabled', rationale: 'No quorum — the item cannot be determined and is tabled.', basis, majorityNeeded };
  }
  if (tally.present === 0) {
    return { outcome: 'tabled', rationale: 'No eligible votes were cast — item tabled.', basis, majorityNeeded };
  }
  const approving = tally.approve + tally.approveWithModifications;
  if (approving >= majorityNeeded) {
    const outcome: AgendaOutcome = tally.approveWithModifications > tally.approve ? 'approved_with_modifications' : 'approved';
    return {
      outcome,
      rationale: `Approving majority (${approving}/${tally.present} present; ${tally.approveWithModifications} with modifications). ${outcome === 'approved_with_modifications' ? 'Modifications required before final approval.' : 'Approved by majority vote.'}`,
      basis,
      majorityNeeded,
    };
  }
  if (tally.disapprove >= majorityNeeded) {
    return { outcome: 'disapproved', rationale: `Disapproving majority (${tally.disapprove}/${tally.present} present).`, basis, majorityNeeded };
  }
  return { outcome: 'tabled', rationale: `No majority reached (${approving} approve / ${tally.disapprove} disapprove of ${tally.present} present; ${majorityNeeded} needed) — tabled.`, basis, majorityNeeded };
}
