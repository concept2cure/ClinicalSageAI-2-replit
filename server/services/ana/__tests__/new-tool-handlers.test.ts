/**
 * Smoke tests for the 5 new AnA tool handlers wired in 88c1138:
 *   - lookup_regulatory_precedents
 *   - compare_submission_against_precedent
 *   - assess_claim_evidence_integrity
 *   - simulate_reviewer_challenges
 *   - predict_change_impact
 *
 * These verify the wiring without exercising the underlying services
 * (precedent-engine, submission-twin-service), so they run without a DB:
 *
 *   1. Each tool is registered (getToolHandler returns a function)
 *   2. Each tool returns a structured JSON error when required inputs are missing
 *   3. The submission-twin tools refuse to run without ToolContext.organizationId
 *
 * The actual service-call path is exercised by integration tests against
 * a seeded fixture (TODO).
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler, type ToolContext } from '../AnaToolExecutor.js';

const NEW_TOOLS = [
  'lookup_regulatory_precedents',
  'compare_submission_against_precedent',
  'assess_claim_evidence_integrity',
  'simulate_reviewer_challenges',
  'predict_change_impact',
  'fetch_template_and_fill',
  'assemble_ectd_module_from_artifacts',
  'draft_510k_substantial_equivalence',
  'draft_clinical_overview_m2_5',
  'draft_fda_ir_response',
] as const;

describe('AnA new tool handlers — registration', () => {
  for (const name of NEW_TOOLS) {
    it(`registers a handler for ${name}`, () => {
      const handler = getToolHandler(name);
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });
  }
});

describe('AnA new tool handlers — input validation (no DB needed)', () => {
  it('lookup_regulatory_precedents rejects missing submission_type', async () => {
    const handler = getToolHandler('lookup_regulatory_precedents')!;
    const result = JSON.parse(await handler({}, {}));
    expect(result.error).toMatch(/submission_type/);
  });

  it('compare_submission_against_precedent rejects missing precedent_id', async () => {
    const handler = getToolHandler('compare_submission_against_precedent')!;
    const result = JSON.parse(await handler({ submission_type: '510(k)' }, {}));
    expect(result.error).toMatch(/precedent_id/);
  });

  it('compare_submission_against_precedent rejects missing submission_type', async () => {
    const handler = getToolHandler('compare_submission_against_precedent')!;
    const result = JSON.parse(await handler({ precedent_id: 'p_123' }, {}));
    expect(result.error).toMatch(/submission_type/);
  });

  it('assess_claim_evidence_integrity rejects missing package_id', async () => {
    const handler = getToolHandler('assess_claim_evidence_integrity')!;
    const result = JSON.parse(await handler({}, { organizationId: 1 }));
    expect(result.error).toMatch(/package_id/);
  });

  it('simulate_reviewer_challenges rejects missing assessment_id', async () => {
    const handler = getToolHandler('simulate_reviewer_challenges')!;
    const result = JSON.parse(
      await handler({ package_id: 42 }, { organizationId: 1 })
    );
    expect(result.error).toMatch(/assessment_id/);
  });

  it('predict_change_impact rejects missing change_type', async () => {
    const handler = getToolHandler('predict_change_impact')!;
    const result = JSON.parse(
      await handler(
        {
          package_id: 42,
          changed_artifact_id: 7,
          change_description: 'added 12-month safety follow-up',
        },
        { organizationId: 1 }
      )
    );
    expect(result.error).toMatch(/change_type/);
  });

  it('fetch_template_and_fill rejects missing template_id', async () => {
    const handler = getToolHandler('fetch_template_and_fill')!;
    const result = JSON.parse(await handler({}, { organizationId: 1 }));
    expect(result.error).toMatch(/template_id/);
  });

  it('assemble_ectd_module_from_artifacts rejects missing module_number', async () => {
    const handler = getToolHandler('assemble_ectd_module_from_artifacts')!;
    const result = JSON.parse(
      await handler({ project_id: 1 }, { organizationId: 1 })
    );
    expect(result.error).toMatch(/module_number/);
  });

  it('draft_510k_substantial_equivalence rejects missing intended_use', async () => {
    const handler = getToolHandler('draft_510k_substantial_equivalence')!;
    const result = JSON.parse(
      await handler(
        { predicate_510k_number: 'K223456', device_name: 'Acme Monitor' },
        {}
      )
    );
    expect(result.error).toMatch(/intended_use/);
  });

  it('draft_clinical_overview_m2_5 rejects missing indication', async () => {
    const handler = getToolHandler('draft_clinical_overview_m2_5')!;
    const result = JSON.parse(await handler({ product_name: 'Compound X' }, {}));
    expect(result.error).toMatch(/indication/);
  });

  it('draft_fda_ir_response rejects empty / too-short ir_text', async () => {
    const handler = getToolHandler('draft_fda_ir_response')!;
    const result = JSON.parse(await handler({ ir_text: 'too short' }, {}));
    expect(result.error).toMatch(/ir_text/);
  });

  it('draft_510k_substantial_equivalence returns structure when inputs are complete (no AI, no DB)', async () => {
    const handler = getToolHandler('draft_510k_substantial_equivalence')!;
    const result = JSON.parse(
      await handler(
        {
          predicate_510k_number: 'K223456',
          device_name: 'Acme Pulse Monitor',
          intended_use: 'Continuous heart-rate monitoring in adult outpatient settings',
        },
        {}
      )
    );
    expect(result.structure?.sections).toHaveLength(6);
    expect(result.se_table_format?.columns).toEqual(
      expect.arrayContaining(['Subject Device', 'Predicate Device'])
    );
  });

  it('draft_clinical_overview_m2_5 returns ICH M4E(R2) outline (no DB needed)', async () => {
    const handler = getToolHandler('draft_clinical_overview_m2_5')!;
    const result = JSON.parse(
      await handler(
        { product_name: 'Compound X', indication: 'type 2 diabetes' },
        {}
      )
    );
    expect(result.structure?.ich_reference).toBe('ICH M4E(R2)');
    expect(result.structure?.sections).toHaveLength(6);
    const sectionNumbers = result.structure.sections.map((s: any) => s.number);
    expect(sectionNumbers).toEqual(['2.5.1', '2.5.2', '2.5.3', '2.5.4', '2.5.5', '2.5.6']);
  });

  it('draft_fda_ir_response extracts numbered questions from realistic IR text', async () => {
    const handler = getToolHandler('draft_fda_ir_response')!;
    const irText = `
Information Request from FDA, dated April 2026.

1. Please provide additional information regarding the validation of analytical method M-001.
2. Clarify the rationale for excluding 12 subjects from the per-protocol population in study C-201.
3.1. Provide the audit trail for protocol deviation #47.
3.2. Provide the source data for primary endpoint analysis in study C-301.
`;
    const result = JSON.parse(await handler({ ir_text: irText }, {}));
    expect(result.questions_extracted).toBeGreaterThanOrEqual(4);
    expect(result.questions[0].number).toBe('1');
    expect(result.response_scaffold?.per_question_format?.sections).toEqual(
      expect.arrayContaining(['FDA Question (verbatim)', 'Sponsor Response'])
    );
  });
});

describe('AnA new tool handlers — tenant context enforcement', () => {
  // Submission Twin tools must refuse to run without organizationId because
  // they hit org-scoped DB queries. The LLM cannot pass tenant identifiers
  // as inputs by design — they come from request-scoped ToolContext only.

  it('assess_claim_evidence_integrity refuses without organizationId', async () => {
    const handler = getToolHandler('assess_claim_evidence_integrity')!;
    const result = JSON.parse(await handler({ package_id: 42 }, {} as ToolContext));
    expect(result.error).toMatch(/organizationId/);
  });

  it('simulate_reviewer_challenges refuses without organizationId', async () => {
    const handler = getToolHandler('simulate_reviewer_challenges')!;
    const result = JSON.parse(
      await handler({ package_id: 42, assessment_id: 7 }, {} as ToolContext)
    );
    expect(result.error).toMatch(/organizationId/);
  });

  it('predict_change_impact refuses without organizationId', async () => {
    const handler = getToolHandler('predict_change_impact')!;
    const result = JSON.parse(
      await handler(
        {
          package_id: 42,
          changed_artifact_id: 7,
          change_description: 'data update',
          change_type: 'data_source',
        },
        {} as ToolContext
      )
    );
    expect(result.error).toMatch(/organizationId/);
  });

  it('fetch_template_and_fill refuses without organizationId', async () => {
    const handler = getToolHandler('fetch_template_and_fill')!;
    const result = JSON.parse(await handler({ template_id: 1 }, {} as ToolContext));
    expect(result.error).toMatch(/organizationId/);
  });

  it('assemble_ectd_module_from_artifacts refuses without organizationId', async () => {
    const handler = getToolHandler('assemble_ectd_module_from_artifacts')!;
    const result = JSON.parse(
      await handler({ project_id: 1, module_number: '3.2.S' }, {} as ToolContext)
    );
    expect(result.error).toMatch(/organizationId/);
  });

  // Precedent tools accept optional organizationId, so absence is not an
  // error — they fall back to a global-corpus search.
  it('lookup_regulatory_precedents accepts missing organizationId (global lookup)', async () => {
    const handler = getToolHandler('lookup_regulatory_precedents')!;
    // We can't fully exercise the search path without a DB, but we can
    // confirm the validation doesn't reject the call before the DB layer.
    // If the DB is unavailable the handler will return its own error
    // string; we only care that it didn't reject on context grounds.
    const raw = await handler({ submission_type: '510(k)' }, {});
    const result = JSON.parse(raw);
    // Either succeeds with a count, or fails with a *non-tenant-context* error.
    if (result.error) {
      expect(result.error).not.toMatch(/organizationId/);
    } else {
      expect(typeof result.count).toBe('number');
    }
  });
});

// ── Biostatistics tools (deterministic engine — no DB needed) ──────────────
describe('AnA biostatistics tools — registration + deterministic compute', () => {
  const BIOSTATS_TOOLS = [
    'compute_sample_size',
    'compare_statistical_scenarios',
    'assess_statistical_defensibility',
    'analyze_missing_data_impact',
    'generate_statistical_document',
  ] as const;

  for (const name of BIOSTATS_TOOLS) {
    it(`registers a handler for ${name}`, () => {
      const handler = getToolHandler(name);
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });
  }

  // A complete, valid binary-superiority design.
  const validDesign = {
    clientTrack: 'biotech_pharma',
    studyType: 'superiority',
    objectiveType: 'efficacy',
    endpointType: 'binary',
    controlRate: 0.3,
    treatmentRate: 0.45,
    alpha: 0.05,
    powerTarget: 0.9,
  };

  it('compute_sample_size returns an engine-computed N and power', async () => {
    const handler = getToolHandler('compute_sample_size')!;
    const result = JSON.parse(await handler(validDesign, {} as ToolContext));
    expect(result.status).toBe('computed');
    expect(result.engine).toBe('deterministic');
    expect(result.sampleSize.total).toBeGreaterThan(0);
    expect(result.power).toBeGreaterThan(0);
  });

  it('compute_sample_size reports needs_parameters when design is missing', async () => {
    const handler = getToolHandler('compute_sample_size')!;
    const result = JSON.parse(await handler({ clientTrack: 'biotech_pharma' }, {} as ToolContext));
    expect(result.status).toBe('needs_parameters');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('assess_statistical_defensibility returns a multi-dimension judgment', async () => {
    const handler = getToolHandler('assess_statistical_defensibility')!;
    const result = JSON.parse(await handler(validDesign, {} as ToolContext));
    expect(result.status).toBe('assessed');
    expect(result.judgment).toBeDefined();
    expect(Array.isArray(result.judgment.dimensions)).toBe(true);
  });

  it('analyze_missing_data_impact returns adjusted power for a missing-data plan', async () => {
    const handler = getToolHandler('analyze_missing_data_impact')!;
    const result = JSON.parse(
      await handler({ ...validDesign, missingDataMethod: 'MMRM', expectedMissingRate: 0.2 }, {} as ToolContext)
    );
    expect(result.status).toBe('computed');
    expect(result.missingDataImpact).toBeDefined();
    expect(typeof result.missingDataImpact.adjustedPower).toBe('number');
  });

  it('generate_statistical_document drafts a SAP section grounded in the engine', async () => {
    const handler = getToolHandler('generate_statistical_document')!;
    const result = JSON.parse(
      await handler({ ...validDesign, documentType: 'sap_section_draft' }, {} as ToolContext)
    );
    expect(result.status).toBe('generated');
    expect(result.documentType).toBe('sap_section_draft');
    expect(typeof result.content).toBe('string');
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('compare_statistical_scenarios returns both scenarios and a recommendation', async () => {
    const handler = getToolHandler('compare_statistical_scenarios')!;
    const result = JSON.parse(
      await handler(
        { scenarioA: { ...validDesign, powerTarget: 0.8 }, scenarioB: { ...validDesign, powerTarget: 0.9 } },
        {} as ToolContext
      )
    );
    expect(result.status).toBe('computed');
    expect(result.scenarioA.sampleSize).toBeGreaterThan(0);
    expect(result.scenarioB.sampleSize).toBeGreaterThan(0);
    expect(result.comparison).toBeDefined();
  });
});

// Every biostatistics document template generates engine-grounded content.
describe('generate_statistical_document — full template coverage', () => {
  const DOC_TYPES = [
    'full_statistical_analysis_plan', 'sap_section_draft', 'sample_size_rationale',
    'statistical_methods_section', 'interim_analysis_plan', 'dsmb_charter',
    'tlf_shell_plan', 'randomization_plan', 'statistical_risk_memo',
    'design_assumption_note', 'protocol_statistical_section', 'submission_statistical_note',
    'statistical_reviewer_response', 'scenario_comparison_brief',
  ] as const;

  const design = {
    clientTrack: 'biotech_pharma',
    studyType: 'superiority',
    objectiveType: 'efficacy',
    endpointType: 'continuous',
    effectSize: 0.4,
    alpha: 0.05,
    powerTarget: 0.9,
    interimAnalyses: 2,
    numberOfEndpoints: 2,
    missingDataMethod: 'MMRM',
    expectedMissingRate: 0.15,
    regulatoryBody: 'FDA',
  };

  for (const documentType of DOC_TYPES) {
    it(`generates ${documentType}`, async () => {
      const handler = getToolHandler('generate_statistical_document')!;
      const result = JSON.parse(await handler({ ...design, documentType }, {} as ToolContext));
      expect(result.status).toBe('generated');
      expect(result.documentType).toBe(documentType);
      expect(typeof result.content).toBe('string');
      expect(result.content.length).toBeGreaterThan(100);
    });
  }
});
