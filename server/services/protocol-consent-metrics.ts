/**
 * Informed Consent Form metrics (Capability C2C-18d) — in-memory counters surfaced
 * via the central /api/metrics endpoint.
 *
 * @module server/services/protocol-consent-metrics
 */

import { createMetricsModule } from './shared/metrics-factory';

const m = createMetricsModule({
  formsCreated:    { kind: 'scalar', metric: 'consent_forms_created_total',    help: 'Informed-consent forms created' },
  elementsUpdated: { kind: 'scalar', metric: 'consent_elements_updated_total', help: 'Consent form elements updated' },
  formsApproved:   { kind: 'scalar', metric: 'consent_forms_approved_total',   help: 'Informed-consent forms approved' },
} as const);

export function recordConsentFormCreated(): void { m.inc('formsCreated'); }
export function recordConsentElementUpdated(): void { m.inc('elementsUpdated'); }
export function recordConsentFormApproved(): void { m.inc('formsApproved'); }

export function renderConsentMetrics(): string[] { return m.render(); }
export function snapshotConsentMetrics() { return m.snapshot(); }
export function resetConsentMetrics(): void { m.reset(); }
