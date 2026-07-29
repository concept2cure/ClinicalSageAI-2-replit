/**
 * Research committee deterministic logic (C2C-16) — composition, quorum, vote
 * tally, and determination. Pure, no DB/LLM. Grounded in PHS Policy / AWA 9 CFR
 * 2.31 (IACUC) and 45 CFR 46.107-46.108 (IRB).
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateComposition,
  quorumThreshold,
  computeQuorum,
  tallyVotes,
  determineOutcome,
  type CommitteeMemberView,
  type CommitteeVote,
} from '../committee-logic';

function member(over: Partial<CommitteeMemberView> = {}): CommitteeMemberView {
  return { votingMember: true, scientist: true, affiliated: true, role: 'member', status: 'active', ...over };
}

describe('evaluateComposition', () => {
  it('passes a lawfully constituted IRB (≥5, nonscientist, non-affiliated, chair)', () => {
    const members = [
      member({ role: 'chair' }),
      member(),
      member({ scientist: false }),
      member({ affiliated: false, scientist: false }),
      member(),
    ];
    const r = evaluateComposition('irb', members);
    expect(r.compliant).toBe(true);
    expect(r.votingMembers).toBe(5);
  });

  it('flags an IRB with no nonscientist as not lawfully constituted', () => {
    const members = [member({ role: 'chair' }), member(), member(), member({ affiliated: false }), member()];
    const r = evaluateComposition('irb', members);
    expect(r.compliant).toBe(false);
    expect(r.findings.some((f) => /nonscientist/i.test(f.message) && f.severity === 'critical')).toBe(true);
  });

  it('flags an IACUC with no veterinarian', () => {
    const members = [member({ role: 'chair' }), member(), member(), member({ affiliated: false }), member()];
    const r = evaluateComposition('iacuc', members);
    expect(r.compliant).toBe(false);
    expect(r.findings.some((f) => /veterinarian/i.test(f.message))).toBe(true);
  });
});

describe('quorum', () => {
  it('threshold is a majority of voting members', () => {
    expect(quorumThreshold(5)).toBe(3);
    expect(quorumThreshold(6)).toBe(4);
    expect(quorumThreshold(1)).toBe(1);
  });

  it('IRB quorum requires a nonscientist present even with numeric majority', () => {
    const r = computeQuorum({ committeeType: 'irb', votingMembersTotal: 5, votingPresent: 4, nonscientistPresent: false });
    expect(r.quorumMet).toBe(false);
    expect(r.issues.some((i) => /nonscientist/i.test(i))).toBe(true);
  });

  it('IRB quorum met with majority + nonscientist present', () => {
    const r = computeQuorum({ committeeType: 'irb', votingMembersTotal: 5, votingPresent: 3, nonscientistPresent: true });
    expect(r.quorumMet).toBe(true);
    expect(r.quorumRequired).toBe(3);
  });

  it('fails quorum below the majority threshold', () => {
    const r = computeQuorum({ committeeType: 'iacuc', votingMembersTotal: 7, votingPresent: 3, nonscientistPresent: true });
    expect(r.quorumMet).toBe(false);
  });
});

describe('tallyVotes', () => {
  it('counts each vote type and excludes recusals from present', () => {
    const votes: { vote: CommitteeVote }[] = [
      { vote: 'approve' }, { vote: 'approve' }, { vote: 'approve_with_modifications' },
      { vote: 'disapprove' }, { vote: 'abstain' }, { vote: 'recuse' },
    ];
    const t = tallyVotes(votes);
    expect(t.approve).toBe(2);
    expect(t.approveWithModifications).toBe(1);
    expect(t.disapprove).toBe(1);
    expect(t.abstain).toBe(1);
    expect(t.recuse).toBe(1);
    expect(t.totalCast).toBe(6);
    expect(t.present).toBe(5); // recuse excluded
  });
});

describe('determineOutcome', () => {
  it('tables when there is no quorum', () => {
    const t = tallyVotes([{ vote: 'approve' }, { vote: 'approve' }, { vote: 'approve' }]);
    const r = determineOutcome({ committeeType: 'irb', quorumMet: false, tally: t });
    expect(r.outcome).toBe('tabled');
  });

  it('approves on an approving majority of those present', () => {
    const t = tallyVotes([{ vote: 'approve' }, { vote: 'approve' }, { vote: 'approve' }, { vote: 'disapprove' }, { vote: 'abstain' }]);
    const r = determineOutcome({ committeeType: 'irb', quorumMet: true, tally: t });
    expect(r.outcome).toBe('approved');
    expect(r.basis).toMatch(/45 CFR 46\.108/);
  });

  it('returns approved_with_modifications when conditional approvals dominate the approving bloc', () => {
    const t = tallyVotes([{ vote: 'approve_with_modifications' }, { vote: 'approve_with_modifications' }, { vote: 'approve_with_modifications' }, { vote: 'approve' }, { vote: 'disapprove' }]);
    const r = determineOutcome({ committeeType: 'irb', quorumMet: true, tally: t });
    expect(r.outcome).toBe('approved_with_modifications');
  });

  it('disapproves on a disapproving majority', () => {
    const t = tallyVotes([{ vote: 'disapprove' }, { vote: 'disapprove' }, { vote: 'disapprove' }, { vote: 'approve' }, { vote: 'abstain' }]);
    const r = determineOutcome({ committeeType: 'iacuc', quorumMet: true, tally: t });
    expect(r.outcome).toBe('disapproved');
  });

  it('tables when no majority is reached', () => {
    const t = tallyVotes([{ vote: 'approve' }, { vote: 'approve' }, { vote: 'disapprove' }, { vote: 'disapprove' }, { vote: 'abstain' }]);
    const r = determineOutcome({ committeeType: 'irb', quorumMet: true, tally: t });
    expect(r.outcome).toBe('tabled');
  });
});
