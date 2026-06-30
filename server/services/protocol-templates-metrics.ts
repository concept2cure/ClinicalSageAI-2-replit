/**
 * Protocol Templates metrics (C2C-20a) — in-memory counters for /api/metrics.
 * @module server/services/protocol-templates-metrics
 */

import { createMetricsModule } from './shared/metrics-factory';

const m = createMetricsModule({
  created:      { kind: 'scalar', metric: 'protocol_templates_created_total',             help: 'Protocol templates created' },
  cloned:       { kind: 'scalar', metric: 'protocol_templates_cloned_total',              help: 'Documents created by cloning a template' },
  savedFromDoc: { kind: 'scalar', metric: 'protocol_templates_saved_from_document_total', help: 'Templates saved from an existing document' },
} as const);

export function recordProtocolTemplateCreated(): void { m.inc('created'); }
export function recordProtocolTemplateCloned(): void { m.inc('cloned'); }
export function recordProtocolTemplateSaved(): void { m.inc('savedFromDoc'); }

export function renderProtocolTemplatesMetrics(): string[] { return m.render(); }
export function snapshotProtocolTemplatesMetrics() { return m.snapshot(); }
export function resetProtocolTemplatesMetrics(): void { m.reset(); }
