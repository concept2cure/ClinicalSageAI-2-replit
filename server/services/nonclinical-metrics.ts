/**
 * Nonclinical + SEND metrics (Capability C2C-04) — in-memory counters surfaced
 * via the central /api/metrics endpoint. Mirrors the other domain metrics modules.
 *
 * @module server/services/nonclinical-metrics
 */

interface NonclinicalMetricsState {
  studiesCreated: Record<string, number>; // by study type
  sendValidations: Record<string, number>; // by validation status
}

const state: NonclinicalMetricsState = { studiesCreated: {}, sendValidations: {} };

export function recordNonclinicalStudyCreated(studyType: string): void {
  state.studiesCreated[studyType] = (state.studiesCreated[studyType] ?? 0) + 1;
}
export function recordSendValidation(status: string): void {
  state.sendValidations[status] = (state.sendValidations[status] ?? 0) + 1;
}

export function renderNonclinicalMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP nonclinical_studies_created_total Nonclinical studies created, by study type');
  lines.push('# TYPE nonclinical_studies_created_total counter');
  for (const [t, n] of Object.entries(state.studiesCreated)) lines.push(`nonclinical_studies_created_total{study_type="${t}"} ${n}`);
  lines.push('# HELP nonclinical_send_validations_total SEND dataset validations recorded, by status');
  lines.push('# TYPE nonclinical_send_validations_total counter');
  for (const [s, n] of Object.entries(state.sendValidations)) lines.push(`nonclinical_send_validations_total{status="${s}"} ${n}`);
  return lines;
}

export function snapshotNonclinicalMetrics(): NonclinicalMetricsState {
  return JSON.parse(JSON.stringify(state));
}
export function resetNonclinicalMetrics(): void {
  state.studiesCreated = {};
  state.sendValidations = {};
}
