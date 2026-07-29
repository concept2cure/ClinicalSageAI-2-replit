/**
 * NIH Other Support metrics (Capability C2C-24A) — in-memory counters surfaced via
 * the central /api/metrics endpoint.
 *
 * @module server/services/other-support-metrics
 */

interface OtherSupportMetricsState {
  documentsCreated: number;
  entriesUpserted: number;
  documentsCertified: number;
}

const state: OtherSupportMetricsState = { documentsCreated: 0, entriesUpserted: 0, documentsCertified: 0 };

export function recordOtherSupportCreated(): void { state.documentsCreated += 1; }
export function recordOtherSupportEntryUpserted(): void { state.entriesUpserted += 1; }
export function recordOtherSupportCertified(): void { state.documentsCertified += 1; }

export function renderOtherSupportMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP other_support_documents_created_total NIH Other Support documents created');
  lines.push('# TYPE other_support_documents_created_total counter');
  lines.push(`other_support_documents_created_total ${state.documentsCreated}`);
  lines.push('# HELP other_support_entries_upserted_total Other Support entries added or updated');
  lines.push('# TYPE other_support_entries_upserted_total counter');
  lines.push(`other_support_entries_upserted_total ${state.entriesUpserted}`);
  lines.push('# HELP other_support_documents_certified_total NIH Other Support documents certified');
  lines.push('# TYPE other_support_documents_certified_total counter');
  lines.push(`other_support_documents_certified_total ${state.documentsCertified}`);
  return lines;
}

export function snapshotOtherSupportMetrics(): OtherSupportMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetOtherSupportMetrics(): void {
  state.documentsCreated = 0;
  state.entriesUpserted = 0;
  state.documentsCertified = 0;
}
