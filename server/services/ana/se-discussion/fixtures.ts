/**
 * E6 fixtures — well-typed SE matrices for exercising the SE-discussion builder,
 * orchestrator, and tests without a live predicate-intelligence pipeline.
 *
 * These satisfy the canonical `SEMatrixPayload` shape (shared/types/
 * predicate-intelligence.ts) exactly, so the generation + verification path is
 * fully exercisable in isolation. When the live SE matrix wiring lands, the
 * route join replaces these fixtures with the real payload — see the
 * `// INTEGRATION:` marker in se-discussion-author.ts.
 */

import type {
  SEMatrixPayload,
  SEMatrixComparisonRow,
} from '../../../../shared/types/predicate-intelligence';

function row(
  sort_order: number,
  category: string,
  characteristic: string,
  subjectValue: string,
  predicateValue: string,
  equivalence_status: SEMatrixComparisonRow['equivalence_status'],
  diff_severity: SEMatrixComparisonRow['diff_severity'],
  discussion_text = '',
): SEMatrixComparisonRow {
  return {
    sort_order,
    category,
    characteristic,
    subject_value: { value: subjectValue, evidence_ids: [], confidence: 0.9 },
    predicate_value: { value: predicateValue, evidence_ids: [], confidence: 0.9 },
    equivalence_status,
    diff_severity,
    discussion_text,
    requires_citation: equivalence_status !== 'EQUIVALENT',
    suggested_tests: [],
  };
}

/**
 * A clean matrix — every characteristic is EQUIVALENT or DISCUSSION_REQUIRED
 * (no unresolved rows), so the narrative is allowed to assert overall
 * substantial equivalence.
 */
export const CLEAN_SE_MATRIX: SEMatrixPayload = {
  template_id: 'se-matrix-v1',
  version: '1.0.0',
  device_name: 'AcuFlow Infusion Pump',
  predicate_k_number: 'K201234',
  predicate_device_name: 'MedStream Volumetric Pump',
  comparison_rows: [
    row(1, 'intended_use', 'Intended Use', 'Controlled IV fluid delivery', 'Controlled IV fluid delivery', 'EQUIVALENT', 'none'),
    row(2, 'energy_source', 'Energy Source', 'Rechargeable Li-ion + AC mains', 'Rechargeable Li-ion + AC mains', 'EQUIVALENT', 'none'),
    row(
      3,
      'software',
      'Software Level of Concern',
      'Basic documentation level',
      'Moderate documentation level',
      'DISCUSSION_REQUIRED',
      'medium',
      'Subject uses an updated firmware architecture; bench verification confirms equivalent dose accuracy.',
    ),
    row(4, 'material', 'Fluid Path Materials', 'Medical-grade silicone', 'Medical-grade silicone', 'EQUIVALENT', 'none'),
  ],
  defense_readiness_score: 0.82,
  evidence_linkage: false,
  regulatory_standard: '21 CFR 807.87',
  generation_timestamp: '2026-06-29T00:00:00.000Z',
};

/**
 * A matrix with an UNRESOLVED row (NOT_EQUIVALENT) — the narrative must refuse
 * to assert overall substantial equivalence and list the open characteristic.
 */
export const UNRESOLVED_SE_MATRIX: SEMatrixPayload = {
  ...CLEAN_SE_MATRIX,
  device_name: 'AcuFlow Infusion Pump',
  comparison_rows: [
    ...CLEAN_SE_MATRIX.comparison_rows.slice(0, 3),
    row(
      4,
      'energy_source',
      'Energy Source',
      'Pneumatic drive',
      'Rechargeable Li-ion + AC mains',
      'NOT_EQUIVALENT',
      'high',
      'Different energy source raises new questions of safety and effectiveness.',
    ),
  ],
};
