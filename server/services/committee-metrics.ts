/**
 * Research committee metrics (Capability C2C-16) — in-memory counters surfaced
 * via the central /api/metrics endpoint. Mirrors the other domain metrics modules.
 *
 * @module server/services/committee-metrics
 */

interface CommitteeMetricsState {
  membersAdded: Record<string, number>; // by committee type
  meetingsConvened: Record<string, number>; // by committee type
  quorumOutcomes: Record<string, number>; // 'met' | 'not_met'
  votesCast: Record<string, number>; // by vote
  determinations: Record<string, number>; // by outcome
}

const state: CommitteeMetricsState = { membersAdded: {}, meetingsConvened: {}, quorumOutcomes: {}, votesCast: {}, determinations: {} };

export function recordCommitteeMemberAdded(committeeType: string): void {
  state.membersAdded[committeeType] = (state.membersAdded[committeeType] ?? 0) + 1;
}
export function recordCommitteeMeetingConvened(committeeType: string, quorumMet: boolean): void {
  state.meetingsConvened[committeeType] = (state.meetingsConvened[committeeType] ?? 0) + 1;
  const key = quorumMet ? 'met' : 'not_met';
  state.quorumOutcomes[key] = (state.quorumOutcomes[key] ?? 0) + 1;
}
export function recordCommitteeVote(vote: string): void {
  state.votesCast[vote] = (state.votesCast[vote] ?? 0) + 1;
}
export function recordCommitteeDetermination(outcome: string): void {
  state.determinations[outcome] = (state.determinations[outcome] ?? 0) + 1;
}

export function renderCommitteeMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP committee_members_added_total Committee members added, by committee type');
  lines.push('# TYPE committee_members_added_total counter');
  for (const [t, n] of Object.entries(state.membersAdded)) lines.push(`committee_members_added_total{committee="${t}"} ${n}`);
  lines.push('# HELP committee_meetings_convened_total Committee meetings convened, by committee type');
  lines.push('# TYPE committee_meetings_convened_total counter');
  for (const [t, n] of Object.entries(state.meetingsConvened)) lines.push(`committee_meetings_convened_total{committee="${t}"} ${n}`);
  lines.push('# HELP committee_quorum_total Convened meetings by quorum outcome');
  lines.push('# TYPE committee_quorum_total counter');
  for (const [k, n] of Object.entries(state.quorumOutcomes)) lines.push(`committee_quorum_total{quorum="${k}"} ${n}`);
  lines.push('# HELP committee_votes_total Committee votes cast, by vote');
  lines.push('# TYPE committee_votes_total counter');
  for (const [v, n] of Object.entries(state.votesCast)) lines.push(`committee_votes_total{vote="${v}"} ${n}`);
  lines.push('# HELP committee_determinations_total Finalized committee determinations, by outcome');
  lines.push('# TYPE committee_determinations_total counter');
  for (const [o, n] of Object.entries(state.determinations)) lines.push(`committee_determinations_total{outcome="${o}"} ${n}`);
  return lines;
}

export function snapshotCommitteeMetrics(): CommitteeMetricsState {
  return JSON.parse(JSON.stringify(state));
}
export function resetCommitteeMetrics(): void {
  state.membersAdded = {};
  state.meetingsConvened = {};
  state.quorumOutcomes = {};
  state.votesCast = {};
  state.determinations = {};
}
