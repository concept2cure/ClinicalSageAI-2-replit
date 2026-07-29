/**
 * Protocol Development metrics (Capability C2C-17) — in-memory counters surfaced
 * via the central /api/metrics endpoint.
 *
 * @module server/services/protocol-development-metrics
 */

interface ProtocolDevMetricsState {
  documentsCreated: Record<string, number>; // by kind
  sectionsUpdated: number;
  objectivesAdded: number;
  eligibilityAdded: number;
  visitsAdded: number;
  versionsSnapshotted: number;
  finalized: number;
}

const state: ProtocolDevMetricsState = { documentsCreated: {}, sectionsUpdated: 0, objectivesAdded: 0, eligibilityAdded: 0, visitsAdded: 0, versionsSnapshotted: 0, finalized: 0 };

export function recordProtocolDocCreated(kind: string): void { state.documentsCreated[kind] = (state.documentsCreated[kind] ?? 0) + 1; }
export function recordProtocolSectionUpdated(): void { state.sectionsUpdated += 1; }
export function recordProtocolObjectiveAdded(): void { state.objectivesAdded += 1; }
export function recordProtocolEligibilityAdded(): void { state.eligibilityAdded += 1; }
export function recordProtocolVisitAdded(): void { state.visitsAdded += 1; }
export function recordProtocolVersionSnapshot(): void { state.versionsSnapshotted += 1; }
export function recordProtocolFinalized(): void { state.finalized += 1; }

export function renderProtocolDevMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP protocol_documents_created_total Protocol documents created, by kind');
  lines.push('# TYPE protocol_documents_created_total counter');
  for (const [k, n] of Object.entries(state.documentsCreated)) lines.push(`protocol_documents_created_total{kind="${k}"} ${n}`);
  lines.push('# HELP protocol_sections_updated_total Protocol section edits');
  lines.push('# TYPE protocol_sections_updated_total counter');
  lines.push(`protocol_sections_updated_total ${state.sectionsUpdated}`);
  lines.push('# HELP protocol_objectives_added_total Protocol objectives added');
  lines.push('# TYPE protocol_objectives_added_total counter');
  lines.push(`protocol_objectives_added_total ${state.objectivesAdded}`);
  lines.push('# HELP protocol_eligibility_added_total Protocol eligibility criteria added');
  lines.push('# TYPE protocol_eligibility_added_total counter');
  lines.push(`protocol_eligibility_added_total ${state.eligibilityAdded}`);
  lines.push('# HELP protocol_visits_added_total Protocol schedule-of-assessment visits added');
  lines.push('# TYPE protocol_visits_added_total counter');
  lines.push(`protocol_visits_added_total ${state.visitsAdded}`);
  lines.push('# HELP protocol_versions_snapshotted_total Protocol version snapshots taken');
  lines.push('# TYPE protocol_versions_snapshotted_total counter');
  lines.push(`protocol_versions_snapshotted_total ${state.versionsSnapshotted}`);
  lines.push('# HELP protocol_documents_finalized_total Protocol documents finalized');
  lines.push('# TYPE protocol_documents_finalized_total counter');
  lines.push(`protocol_documents_finalized_total ${state.finalized}`);
  return lines;
}

export function snapshotProtocolDevMetrics(): ProtocolDevMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetProtocolDevMetrics(): void {
  state.documentsCreated = {};
  state.sectionsUpdated = 0;
  state.objectivesAdded = 0;
  state.eligibilityAdded = 0;
  state.visitsAdded = 0;
  state.versionsSnapshotted = 0;
  state.finalized = 0;
}
