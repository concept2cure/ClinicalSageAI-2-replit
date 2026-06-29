/**
 * Protocol Export metrics (C2C-20c) — in-memory counters for /api/metrics.
 * @module server/services/protocol-export-metrics
 */

interface State { exports: number; ctgovDrafts: number }
const state: State = { exports: 0, ctgovDrafts: 0 };

export function recordProtocolExport(): void { state.exports += 1; }
export function recordCtGovDraft(): void { state.ctgovDrafts += 1; }

export function renderProtocolExportMetrics(): string[] {
  return [
    '# HELP protocol_exports_total Protocol document exports assembled',
    '# TYPE protocol_exports_total counter',
    `protocol_exports_total ${state.exports}`,
    '# HELP protocol_ctgov_drafts_total ClinicalTrials.gov registration drafts generated',
    '# TYPE protocol_ctgov_drafts_total counter',
    `protocol_ctgov_drafts_total ${state.ctgovDrafts}`,
  ];
}

export function snapshotProtocolExportMetrics(): State { return JSON.parse(JSON.stringify(state)); }
export function resetProtocolExportMetrics(): void { state.exports = 0; state.ctgovDrafts = 0; }
