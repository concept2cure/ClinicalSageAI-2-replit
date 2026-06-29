/**
 * Protocol Templates metrics (C2C-20a) — in-memory counters for /api/metrics.
 * @module server/services/protocol-templates-metrics
 */

interface State { created: number; cloned: number; savedFromDoc: number }
const state: State = { created: 0, cloned: 0, savedFromDoc: 0 };

export function recordProtocolTemplateCreated(): void { state.created += 1; }
export function recordProtocolTemplateCloned(): void { state.cloned += 1; }
export function recordProtocolTemplateSaved(): void { state.savedFromDoc += 1; }

export function renderProtocolTemplatesMetrics(): string[] {
  return [
    '# HELP protocol_templates_created_total Protocol templates created',
    '# TYPE protocol_templates_created_total counter',
    `protocol_templates_created_total ${state.created}`,
    '# HELP protocol_templates_cloned_total Documents created by cloning a template',
    '# TYPE protocol_templates_cloned_total counter',
    `protocol_templates_cloned_total ${state.cloned}`,
    '# HELP protocol_templates_saved_from_document_total Templates saved from an existing document',
    '# TYPE protocol_templates_saved_from_document_total counter',
    `protocol_templates_saved_from_document_total ${state.savedFromDoc}`,
  ];
}

export function snapshotProtocolTemplatesMetrics(): State { return JSON.parse(JSON.stringify(state)); }
export function resetProtocolTemplatesMetrics(): void { state.created = 0; state.cloned = 0; state.savedFromDoc = 0; }
