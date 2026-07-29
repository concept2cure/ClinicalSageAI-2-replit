/**
 * Informed Consent Form metrics (Capability C2C-18d) — in-memory counters surfaced
 * via the central /api/metrics endpoint.
 *
 * @module server/services/protocol-consent-metrics
 */

interface ConsentMetricsState {
  formsCreated: number;
  elementsUpdated: number;
  formsApproved: number;
}

const state: ConsentMetricsState = { formsCreated: 0, elementsUpdated: 0, formsApproved: 0 };

export function recordConsentFormCreated(): void { state.formsCreated += 1; }
export function recordConsentElementUpdated(): void { state.elementsUpdated += 1; }
export function recordConsentFormApproved(): void { state.formsApproved += 1; }

export function renderConsentMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP consent_forms_created_total Informed-consent forms created');
  lines.push('# TYPE consent_forms_created_total counter');
  lines.push(`consent_forms_created_total ${state.formsCreated}`);
  lines.push('# HELP consent_elements_updated_total Consent form elements updated');
  lines.push('# TYPE consent_elements_updated_total counter');
  lines.push(`consent_elements_updated_total ${state.elementsUpdated}`);
  lines.push('# HELP consent_forms_approved_total Informed-consent forms approved');
  lines.push('# TYPE consent_forms_approved_total counter');
  lines.push(`consent_forms_approved_total ${state.formsApproved}`);
  return lines;
}

export function snapshotConsentMetrics(): ConsentMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetConsentMetrics(): void {
  state.formsCreated = 0;
  state.elementsUpdated = 0;
  state.formsApproved = 0;
}
