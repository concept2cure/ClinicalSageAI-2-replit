/**
 * Protocol Development metrics (Capability C2C-17) — in-memory counters surfaced
 * via the central /api/metrics endpoint.
 *
 * @module server/services/protocol-development-metrics
 */

import { createMetricsModule } from './shared/metrics-factory';

const m = createMetricsModule({
  documentsCreated:    { kind: 'labeled', metric: 'protocol_documents_created_total',    help: 'Protocol documents created, by kind', labelKey: 'kind' },
  sectionsUpdated:     { kind: 'scalar',  metric: 'protocol_sections_updated_total',     help: 'Protocol section edits' },
  objectivesAdded:     { kind: 'scalar',  metric: 'protocol_objectives_added_total',     help: 'Protocol objectives added' },
  eligibilityAdded:    { kind: 'scalar',  metric: 'protocol_eligibility_added_total',    help: 'Protocol eligibility criteria added' },
  visitsAdded:         { kind: 'scalar',  metric: 'protocol_visits_added_total',         help: 'Protocol schedule-of-assessment visits added' },
  versionsSnapshotted: { kind: 'scalar',  metric: 'protocol_versions_snapshotted_total', help: 'Protocol version snapshots taken' },
  finalized:           { kind: 'scalar',  metric: 'protocol_documents_finalized_total',  help: 'Protocol documents finalized' },
} as const);

export function recordProtocolDocCreated(kind: string): void { m.incLabeled('documentsCreated', kind); }
export function recordProtocolSectionUpdated(): void { m.inc('sectionsUpdated'); }
export function recordProtocolObjectiveAdded(): void { m.inc('objectivesAdded'); }
export function recordProtocolEligibilityAdded(): void { m.inc('eligibilityAdded'); }
export function recordProtocolVisitAdded(): void { m.inc('visitsAdded'); }
export function recordProtocolVersionSnapshot(): void { m.inc('versionsSnapshotted'); }
export function recordProtocolFinalized(): void { m.inc('finalized'); }

export function renderProtocolDevMetrics(): string[] { return m.render(); }
export function snapshotProtocolDevMetrics() { return m.snapshot(); }
export function resetProtocolDevMetrics(): void { m.reset(); }
