/**
 * Smoke tests for the submission-center AnA tools.
 *
 * Verify wiring without a DB:
 *   1. Each tool is registered (getToolHandler returns a function) and present in ALL_ANA_TOOLS.
 *   2. The three pure compute tools (lifecycle / STF / cross-references) actually compute.
 *   3. The two ingestion tools refuse to run without ToolContext (org + user) and validate inputs.
 *
 * The persistence path of the ingestion tools is exercised by integration tests
 * against a seeded DB fixture.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler, type ToolContext } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const SUBMISSION_TOOLS = [
  'compute_lifecycle_operations',
  'convert_to_rps_v4',
  'generate_stf',
  'check_ectd_cross_references',
  'classify_submission_document',
  'extract_submission_document',
  'validate_ectd_package',
  'run_shadow_review',
  'plan_submission',
  'explain_validation_findings',
  'cross_region_gap_analysis',
  'dispatch_qc_check',
  'trace_provenance',
  'check_consistency',
  'assess_pathway_readiness',
  'build_pathway_manifest',
  'list_validation_rules',
  'get_market_submission_spec',
  'get_document_template',
  'validate_market_formatting',
  'get_submission_requirements',
  'assess_pathway_eligibility',
  'classify_post_submission_change',
  'assess_device_evidence_structure',
  'classify_device',
  'get_device_reviewer_checklist',
  'get_biocompatibility_endpoints',
  'build_device_blueprint',
  'assess_stored_cer',
  'build_global_device_strategy',
  'get_regulatory_timeline',
  'validate_udi',
  'get_electrical_standards',
  'get_sterilization_requirements',
  'assess_combination_product',
  'get_device_labeling',
  'assess_qms',
  'list_regulatory_capabilities',
  'assess_dispatch_readiness',
  'place_into_sequence',
];

describe('submission-center AnA tools — registration', () => {
  it('registers a handler for every submission-center tool', () => {
    for (const name of SUBMISSION_TOOLS) {
      expect(typeof getToolHandler(name)).toBe('function');
    }
  });

  it('exposes every submission-center tool in ALL_ANA_TOOLS with a valid schema', () => {
    for (const name of SUBMISSION_TOOLS) {
      const tool = ALL_ANA_TOOLS.find(t => t.name === name);
      expect(tool, `${name} missing from ALL_ANA_TOOLS`).toBeTruthy();
      expect(tool!.input_schema.type).toBe('object');
      expect(typeof tool!.description).toBe('string');
    }
  });
});

describe('compute_lifecycle_operations (pure)', () => {
  it('diffs prior vs desired and assigns operations', async () => {
    const handler = getToolHandler('compute_lifecycle_operations')!;
    const out = JSON.parse(
      await handler({
        prior_leaves: [{ ctd_section: '2.5', file_name: 'overview.pdf', md5: 'a' }],
        desired_leaves: [
          { ctd_section: '2.5', file_name: 'overview.pdf', md5: 'b' }, // replace
          { ctd_section: '3.2.P.1', file_name: 'comp.pdf', md5: 'c' }, // new
        ],
      })
    );
    expect(out.ok).toBe(true);
    expect(out.summary).toMatchObject({ new: 1, replace: 1 });
  });

  it('forwards prior href + prior_sequence_prefix so a replace emits modified-file', async () => {
    const handler = getToolHandler('compute_lifecycle_operations')!;
    const out = JSON.parse(
      await handler({
        prior_sequence_prefix: '../0000/',
        prior_leaves: [
          { ctd_section: '3.2.S.1', file_name: 'general.pdf', md5: 'a', href: 'm3/32-body-data/32s-drug-sub/general.pdf' },
        ],
        desired_leaves: [{ ctd_section: '3.2.S.1', file_name: 'general.pdf', md5: 'b' }],
      })
    );
    expect(out.ok).toBe(true);
    const replaced = out.leaves.find((l: any) => l.operation === 'replace');
    expect(replaced.modifiedFile).toBe('../0000/m3/32-body-data/32s-drug-sub/general.pdf');
  });

  it('refuses to auto-load a prior sequence without tenant context (org from ToolContext only)', async () => {
    const handler = getToolHandler('compute_lifecycle_operations')!;
    // application_number + prior_sequence_number (and no explicit prior_leaves)
    // triggers the tenant-scoped auto-load path, which must not run org-less.
    const out = JSON.parse(
      await handler({
        application_number: 'IND-123',
        prior_sequence_number: '0000',
        desired_leaves: [{ ctd_section: '3.2.S.1', file_name: 'general.pdf', md5: 'b' }],
      }),
    );
    expect(out.error).toMatch(/tenant context/i);
  });

  it('does NOT engage auto-load when explicit prior_leaves are supplied (org not required)', async () => {
    const handler = getToolHandler('compute_lifecycle_operations')!;
    const out = JSON.parse(
      await handler({
        application_number: 'IND-123',
        prior_sequence_number: '0000',
        prior_leaves: [{ ctd_section: '2.5', file_name: 'o.pdf', md5: 'a' }],
        desired_leaves: [{ ctd_section: '2.5', file_name: 'o.pdf', md5: 'b' }],
      }),
    );
    expect(out.ok).toBe(true);
    expect(out.autoLoadedPrior).toBe(0);
    expect(out.summary).toMatchObject({ replace: 1 });
  });
});

describe('convert_to_rps_v4 (pure)', () => {
  const baseArgs = (over: Record<string, unknown> = {}) => ({
    application: { number: '123456', type_code: 'us_application_type_1', center: 'cder' },
    submission: { type_code: 'us_submission_type_1' },
    submission_unit: { id: 'su-1', unit_type_code: 'us_submission_unit_type_1', title: 'Seq', sequence_number: '0002' },
    leaves: [
      { ctd_section: '1.2', file_name: 'cover.pdf', title: 'Cover', operation: 'replace' },
      { ctd_section: '3.2.S.1', file_name: 'general.pdf', title: 'General', operation: 'new' },
    ],
    ...over,
  });

  it('maps v3 operations to RPS and emits one document + CoU per leaf', async () => {
    const handler = getToolHandler('convert_to_rps_v4')!;
    const out = JSON.parse(await handler(baseArgs()));
    expect(out.ok).toBe(true);
    expect(out.summary).toMatchObject({ documents: 2, contextsOfUse: 2, lifecycle: 1 });
    const revise = out.message.contextsOfUse.find((c: any) => c.operation === 'revise');
    expect(revise).toBeTruthy();
    expect(out.message.contextsOfUse.find((c: any) => c.operation === 'create')).toBeTruthy();
  });

  it('points relatedContextOfUse at the prior sequence for a lifecycle op', async () => {
    const handler = getToolHandler('convert_to_rps_v4')!;
    const out = JSON.parse(await handler(baseArgs({ prior_sequence_number: '0001' })));
    const revise = out.message.contextsOfUse.find((c: any) => c.operation === 'revise');
    expect(typeof revise.relatedContextOfUseId).toBe('string');
    expect(revise.relatedContextOfUseId.length).toBeGreaterThan(0);
  });

  it('returns serialized RPS message XML when include_xml is set', async () => {
    const handler = getToolHandler('convert_to_rps_v4')!;
    const out = JSON.parse(await handler(baseArgs({ include_xml: true })));
    expect(out.xml).toContain('<PORP_IN000001UV');
    expect(out.xml).toContain('<sequenceNumber value="0002"/>');
  });
});

describe('generate_stf (pure)', () => {
  it('produces one stf.xml per study', async () => {
    const handler = getToolHandler('generate_stf')!;
    const out = JSON.parse(
      await handler({
        leaves: [
          { study_id: 'S-1', file_tag: 'study-report-body', ctd_section: '5.3.5.1', href: 'm5/s1/body.pdf', title: 'Body', operation: 'new' },
        ],
      })
    );
    expect(out.ok).toBe(true);
    expect(out.summary.studies).toBe(1);
    expect(out.files[0].xml).toContain('<study-id>S-1</study-id>');
  });

  it('returns a structured error when a tagged leaf is missing its file-tag', async () => {
    const handler = getToolHandler('generate_stf')!;
    const out = JSON.parse(
      await handler({ leaves: [{ study_id: 'S-1', file_tag: '', ctd_section: '5.3.5.1', href: 'h', title: 't', operation: 'new' }] })
    );
    expect(out.error).toMatch(/file-tag/);
  });
});

describe('check_ectd_cross_references (pure)', () => {
  it('resolves present references and flags missing targets', async () => {
    const handler = getToolHandler('check_ectd_cross_references')!;
    const out = JSON.parse(
      await handler({
        leaves: [
          { ctd_section: '2.5', file_name: 'overview.pdf', operation: 'new' },
          { ctd_section: '2.7', file_name: 'summary.pdf', operation: 'new' },
        ],
        references: [
          { source: '2.5', target: '2.7' }, // resolves
          { source: '2.5', target: '9.9' }, // broken
        ],
      })
    );
    expect(out.resolved).toHaveLength(1);
    expect(out.broken).toHaveLength(1);
    expect(out.ok).toBe(false);
  });
});

describe('validate_ectd_package (pure)', () => {
  it('returns a verdict, score, and findings for a leaf set', async () => {
    const handler = getToolHandler('validate_ectd_package')!;
    const out = JSON.parse(
      await handler({
        submission_type: 'IND',
        leaves: [
          { section_code: 'm1.1', title: 'Cover', checksum: 'd41d8cd98f00b204e9800998ecf8427e', operation: 'new', file_path: 'm1/us/cover.pdf' },
        ],
      })
    );
    expect(out.ok).toBe(true);
    expect(typeof out.score).toBe('number');
    expect(Array.isArray(out.findings)).toBe(true);
    expect(typeof out.valid).toBe('boolean');
  });
});

describe('submission AI tasks — tenant + input guards', () => {
  it('plan_submission refuses without org/user context', async () => {
    const handler = getToolHandler('plan_submission')!;
    const out = JSON.parse(await handler({ application_type: 'ind', client_type: 'biotech', regions: ['fda'] }, {} as ToolContext));
    expect(out.error).toMatch(/tenant context/);
  });
  it('plan_submission validates required inputs', async () => {
    const handler = getToolHandler('plan_submission')!;
    const out = JSON.parse(await handler({ client_type: 'biotech', regions: ['fda'] }, { organizationId: 1, userId: 2 } as ToolContext));
    expect(out.error).toMatch(/application_type/);
  });
  it('explain_validation_findings refuses without org/user context', async () => {
    const handler = getToolHandler('explain_validation_findings')!;
    const out = JSON.parse(await handler({ region: 'fda', findings: [{ severity: 'error', message: 'x' }] }, {} as ToolContext));
    expect(out.error).toMatch(/tenant context/);
  });
  it('cross_region_gap_analysis validates required inputs', async () => {
    const handler = getToolHandler('cross_region_gap_analysis')!;
    const out = JSON.parse(await handler({ source_region: 'fda' }, { organizationId: 1, userId: 2 } as ToolContext));
    expect(out.error).toMatch(/target_regions|application_type/);
  });
  it('dispatch_qc_check refuses without org/user context', async () => {
    const handler = getToolHandler('dispatch_qc_check')!;
    const out = JSON.parse(await handler({ region: 'fda', validation_errors: 0, unresolved_shadow_criticals: 0, leaves: [] }, {} as ToolContext));
    expect(out.error).toMatch(/tenant context/);
  });
  it('trace_provenance refuses without org/user context', async () => {
    const handler = getToolHandler('trace_provenance')!;
    const out = JSON.parse(await handler({ submission_id: 1, target_section_code: '2.7' }, {} as ToolContext));
    expect(out.error).toMatch(/tenant context/);
  });
  it('place_into_sequence refuses without org/user context (upsertLeaf is tenant-scoped)', async () => {
    const handler = getToolHandler('place_into_sequence')!;
    const out = JSON.parse(
      await handler({ sequence_id: 1, section_code: '2.7.3', title: 'Summary' }, {} as ToolContext),
    );
    expect(out.error).toMatch(/tenant context/);
  });
  it('place_into_sequence validates required inputs before touching the core', async () => {
    const handler = getToolHandler('place_into_sequence')!;
    const noSeq = JSON.parse(
      await handler({ section_code: '2.7.3', title: 'Summary' }, { organizationId: 1, userId: 2 } as ToolContext),
    );
    expect(noSeq.error).toMatch(/sequence_id/);
    const noSection = JSON.parse(
      await handler({ sequence_id: 1, title: 'Summary' }, { organizationId: 1, userId: 2 } as ToolContext),
    );
    expect(noSection.error).toMatch(/section_code/);
    const noTitle = JSON.parse(
      await handler({ sequence_id: 1, section_code: '2.7.3' }, { organizationId: 1, userId: 2 } as ToolContext),
    );
    expect(noTitle.error).toMatch(/title/);
  });
  it('check_consistency validates required inputs', async () => {
    const handler = getToolHandler('check_consistency')!;
    const out = JSON.parse(await handler({ submission_id: 1 }, { organizationId: 1, userId: 2 } as ToolContext));
    expect(out.error).toMatch(/dimension|left|right/);
  });

  it('assess_pathway_readiness refuses without org/user context', async () => {
    const handler = getToolHandler('assess_pathway_readiness')!;
    const out = JSON.parse(await handler({ sequence_id: 1, pathway: 'ctis' }, {} as ToolContext));
    expect(out.error).toMatch(/tenant context/);
  });
  it('assess_pathway_readiness validates the pathway enum', async () => {
    const handler = getToolHandler('assess_pathway_readiness')!;
    const out = JSON.parse(await handler({ sequence_id: 1, pathway: 'bogus' }, { organizationId: 1, userId: 2 } as ToolContext));
    expect(out.error).toMatch(/pathway must be one of/);
  });

  it('build_pathway_manifest refuses without org/user context', async () => {
    const handler = getToolHandler('build_pathway_manifest')!;
    const out = JSON.parse(await handler({ sequence_id: 1, pathway: 'mdr' }, {} as ToolContext));
    expect(out.error).toMatch(/tenant context/);
  });
  it('build_pathway_manifest validates the pathway enum', async () => {
    const handler = getToolHandler('build_pathway_manifest')!;
    const out = JSON.parse(await handler({ sequence_id: 1, pathway: 'bogus' }, { organizationId: 1, userId: 2 } as ToolContext));
    expect(out.error).toMatch(/pathway must be one of/);
  });

  it('list_validation_rules returns the corpus without tenant context', async () => {
    const handler = getToolHandler('list_validation_rules')!;
    const out = JSON.parse(await handler({}, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(Array.isArray(out.rules)).toBe(true);
    expect(out.rules.length).toBeGreaterThan(0);
    expect(out.summary.total).toBe(out.rules.length);
  });
  it('list_validation_rules validates the region enum', async () => {
    const handler = getToolHandler('list_validation_rules')!;
    const out = JSON.parse(await handler({ region: 'zz' }, {} as ToolContext));
    expect(out.error).toMatch(/region must be one of/);
  });

  it('get_market_submission_spec returns a single spec by id', async () => {
    const handler = getToolHandler('get_market_submission_spec')!;
    const out = JSON.parse(await handler({ spec_id: 'us-ectd' }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.spec.market).toBe('us');
    expect(out.spec.governance.eSignature.basis).toMatch(/Part 11/);
  });
  it('get_market_submission_spec filters by market without tenant context', async () => {
    const handler = getToolHandler('get_market_submission_spec')!;
    const out = JSON.parse(await handler({ market: 'eu' }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.specs.length).toBeGreaterThanOrEqual(4);
    expect(out.specs.every((s: { market: string }) => s.market === 'eu')).toBe(true);
  });
  it('get_market_submission_spec validates the family enum', async () => {
    const handler = getToolHandler('get_market_submission_spec')!;
    const out = JSON.parse(await handler({ family: 'bogus' }, {} as ToolContext));
    expect(out.error).toMatch(/family must be one of/);
  });

  it('get_document_template returns a document spine by id', async () => {
    const handler = getToolHandler('get_document_template')!;
    const out = JSON.parse(await handler({ template_id: 'clinical_overview' }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.template.ctdSection).toBe('2.5');
    expect(out.template.sections.length).toBeGreaterThan(0);
  });
  it('get_document_template lists a family without tenant context', async () => {
    const handler = getToolHandler('get_document_template')!;
    const out = JSON.parse(await handler({ family: 'estar' }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.templates.some((t: { id: string }) => t.id === 'k510_summary')).toBe(true);
  });

  it('validate_market_formatting enforces a spec and flags a bad name', async () => {
    const handler = getToolHandler('validate_market_formatting')!;
    const out = JSON.parse(await handler({ spec_id: 'us-ectd', leaves: [{ file_name: 'Bad Name.PDF' }] }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.findings.some((f: { rule: string }) => f.rule === 'FILE_NAMING')).toBe(true);
  });
  it('validate_market_formatting errors on an unknown spec', async () => {
    const handler = getToolHandler('validate_market_formatting')!;
    const out = JSON.parse(await handler({ spec_id: 'nope', leaves: [] }, {} as ToolContext));
    expect(out.error).toMatch(/No market spec/);
  });

  it('get_submission_requirements returns and assesses a type', async () => {
    const handler = getToolHandler('get_submission_requirements')!;
    const out = JSON.parse(await handler({ submission_type: 'nda', present_template_ids: ['quality_overall_summary'] }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.assessment.ready).toBe(false);
    expect(out.assessment.missingForms).toContain('FDA 356h');
  });
  it('assess_pathway_eligibility checks all-criteria-met', async () => {
    const handler = getToolHandler('assess_pathway_eligibility')!;
    const out = JSON.parse(await handler({ designation: 'fda_breakthrough', answers: { serious: true, preliminary_substantial: true } }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.assessment.eligible).toBe(true);
  });
  it('assess_pathway_eligibility errors on an unknown designation', async () => {
    const handler = getToolHandler('assess_pathway_eligibility')!;
    const out = JSON.parse(await handler({ designation: 'nope' }, {} as ToolContext));
    expect(out.error).toMatch(/No designation/);
  });

  it('classify_post_submission_change recommends a category from flags', async () => {
    const handler = getToolHandler('classify_post_submission_change')!;
    const out = JSON.parse(await handler({ market: 'us', flags: { major_impact: true } }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.categoryId).toBe('fda_pas');
    expect(out.sequenceType).toBe('variation');
  });
  it('classify_post_submission_change lists the catalog without flags', async () => {
    const handler = getToolHandler('classify_post_submission_change')!;
    const out = JSON.parse(await handler({ market: 'eu' }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.categories.some((c: { id: string }) => c.id === 'eu_type_ii')).toBe(true);
  });

  it('assess_device_evidence_structure gap-checks a CER', async () => {
    const handler = getToolHandler('assess_device_evidence_structure')!;
    const out = JSON.parse(await handler({ document: 'cer', present_section_ids: ['summary', 'scope'] }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.assessment.ready).toBe(false);
    expect(out.assessment.missingRequiredSections).toContain('analysis');
  });
  it('classify_device applies the MDR rules', async () => {
    const handler = getToolHandler('classify_device')!;
    const out = JSON.parse(await handler({ framework: 'mdr', facts: { implantable: true, contactsCnsOrCentralCirculation: true } }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.class).toBe('III');
  });
  it('get_device_reviewer_checklist returns the 510(k) reviewer questions', async () => {
    const handler = getToolHandler('get_device_reviewer_checklist')!;
    const out = JSON.parse(await handler({ submission_type: '510k' }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.questions.length).toBeGreaterThan(0);
    expect(out.counts.total).toBe(out.questions.length);
  });
  it('classify_device validates the framework', async () => {
    const handler = getToolHandler('classify_device')!;
    const out = JSON.parse(await handler({ framework: 'nope', facts: {} }, {} as ToolContext));
    expect(out.error).toMatch(/framework must be one of/);
  });

  it('get_biocompatibility_endpoints returns endpoints for a permanent implant', async () => {
    const handler = getToolHandler('get_biocompatibility_endpoints')!;
    const out = JSON.parse(await handler({ nature: 'implant_tissue_bone', duration: 'long_term' }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.endpoints.map((e: { id: string }) => e.id)).toEqual(expect.arrayContaining(['implantation', 'carcinogenicity']));
  });
  it('assess_device_evidence_structure now handles rmf', async () => {
    const handler = getToolHandler('assess_device_evidence_structure')!;
    const out = JSON.parse(await handler({ document: 'rmf', present_section_ids: ['plan'] }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.assessment.ready).toBe(false);
    expect(out.assessment.missingRequiredSections).toContain('control');
  });
  it('build_device_blueprint assembles the reverse-workflow view', async () => {
    const handler = getToolHandler('build_device_blueprint')!;
    const out = JSON.parse(await handler({
      submission_type: '510k',
      classification: { framework: 'fda', facts: { fdaClass: 'II', predicateAvailable: true } },
      software: { applicable: true, canContributeToNonSeriousInjury: true },
    }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.classification.pathway).toBe('510k');
    expect(out.evidenceModules.some((m: { id: string; applicable: boolean }) => m.id === 'software' && m.applicable)).toBe(true);
    expect(out.reviewer.questionCount).toBeGreaterThan(0);
  });
  it('build_device_blueprint validates the submission type', async () => {
    const handler = getToolHandler('build_device_blueprint')!;
    const out = JSON.parse(await handler({ submission_type: 'nope' }, {} as ToolContext));
    expect(out.error).toMatch(/submission_type must be one of/);
  });
  it('assess_stored_cer refuses without tenant context', async () => {
    const handler = getToolHandler('assess_stored_cer')!;
    const out = JSON.parse(await handler({ report_id: 'CER-1' }, {} as ToolContext));
    expect(out.error).toMatch(/tenant context/);
  });
  it('assess_stored_cer requires a report_id', async () => {
    const handler = getToolHandler('assess_stored_cer')!;
    const out = JSON.parse(await handler({}, { organizationId: 1, userId: 2 } as ToolContext));
    expect(out.error).toMatch(/report_id is required/);
  });

  it('build_global_device_strategy maps device evidence across regions', async () => {
    const handler = getToolHandler('build_global_device_strategy')!;
    const out = JSON.parse(await handler({ kind: 'device' }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.regions.some((r: { region: string }) => r.region === 'eu_mdr')).toBe(true);
    expect(out.sharedAcrossAll).toContain('risk_management');
  });
  it('build_global_device_strategy validates the kind', async () => {
    const handler = getToolHandler('build_global_device_strategy')!;
    const out = JSON.parse(await handler({ kind: 'nope' }, {} as ToolContext));
    expect(out.error).toMatch(/kind must be one of/);
  });
  it('get_regulatory_timeline returns the 510(k) RTA + decision goal', async () => {
    const handler = getToolHandler('get_regulatory_timeline')!;
    const out = JSON.parse(await handler({ pathway: '510k' }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.targetDecisionDays).toBe(90);
    expect(out.milestones.some((m: { id: string }) => m.id === 'rta')).toBe(true);
  });
  it('build_device_blueprint now includes a readiness scorecard', async () => {
    const handler = getToolHandler('build_device_blueprint')!;
    const out = JSON.parse(await handler({ submission_type: '510k', classification: { framework: 'fda', facts: { fdaClass: 'II', predicateAvailable: true } } }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(typeof out.scorecard?.score).toBe('number');
    expect(out.scorecard?.level).toBeTruthy();
  });

  it('validate_udi computes the GS1 check digit', async () => {
    const handler = getToolHandler('validate_udi')!;
    const ok = JSON.parse(await handler({ udi: '(01)00012345678905(10)LOT1' }, {} as ToolContext));
    expect(ok.ok).toBe(true);
    expect(ok.udiDiOk).toBe(true);
    const bad = JSON.parse(await handler({ udi: '(01)00012345678900' }, {} as ToolContext));
    expect(bad.udiDiOk).toBe(false);
  });
  it('get_electrical_standards adds collaterals from facts', async () => {
    const handler = getToolHandler('get_electrical_standards')!;
    const out = JSON.parse(await handler({ electricallyPowered: true, hasAlarms: true }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.standards.some((s: { code: string }) => s.code === 'IEC 60601-1-8')).toBe(true);
  });
  it('get_sterilization_requirements resolves the method standard', async () => {
    const handler = getToolHandler('get_sterilization_requirements')!;
    const out = JSON.parse(await handler({ sterile: true, method: 'eo' }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.method?.standard).toBe('ISO 11135');
  });
  it('list_regulatory_capabilities enumerates the layer', async () => {
    const handler = getToolHandler('list_regulatory_capabilities')!;
    const out = JSON.parse(await handler({}, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.total).toBeGreaterThan(0);
    expect(out.capabilities.some((c: { id: string }) => c.id === 'device_blueprint')).toBe(true);
  });
  it('assess_combination_product maps PMOA to the lead center', async () => {
    const handler = getToolHandler('assess_combination_product')!;
    const out = JSON.parse(await handler({ components: ['drug', 'device'], primary_mode_of_action: 'device' }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.isCombination).toBe(true);
    expect(out.fdaLeadCenter).toBe('CDRH');
  });
  it('assess_combination_product validates components', async () => {
    const handler = getToolHandler('assess_combination_product')!;
    const out = JSON.parse(await handler({ components: ['nope'] }, {} as ToolContext));
    expect(out.error).toMatch(/components must be/);
  });
  it('assess_qms returns the clause structure and gap-checks', async () => {
    const handler = getToolHandler('assess_qms')!;
    const structure = JSON.parse(await handler({}, {} as ToolContext));
    expect(structure.ok).toBe(true);
    expect(structure.clauses.some((c: { id: string }) => c.id === 'capa')).toBe(true);
    const assessed = JSON.parse(await handler({ present_clause_ids: ['qms_general'] }, {} as ToolContext));
    expect(assessed.assessment.ready).toBe(false);
    expect(assessed.assessment.missingRequiredClauses).toContain('design_controls');
  });
  it('get_device_labeling adds sterile elements for a sterile device', async () => {
    const handler = getToolHandler('get_device_labeling')!;
    const out = JSON.parse(await handler({ sterile: true }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.mdrLabel.some((e: { id: string }) => e.id === 'sterile_state')).toBe(true);
    expect(out.symbols.some((s: { id: string }) => s.id === 'sterile')).toBe(true);
  });
});

describe('ingestion tools — tenant + input guards', () => {
  it('classify_submission_document refuses without org/user context', async () => {
    const handler = getToolHandler('classify_submission_document')!;
    const out = JSON.parse(await handler({ document_id: 1 }, {} as ToolContext));
    expect(out.error).toMatch(/tenant context/);
  });

  it('classify_submission_document requires a numeric document_id', async () => {
    const handler = getToolHandler('classify_submission_document')!;
    const out = JSON.parse(await handler({}, { organizationId: 1, userId: 2 } as ToolContext));
    expect(out.error).toMatch(/document_id/);
  });

  it('extract_submission_document refuses without org/user context', async () => {
    const handler = getToolHandler('extract_submission_document')!;
    const out = JSON.parse(await handler({ document_id: 1, section_code: '2.7', submission_id: 1 }, {} as ToolContext));
    expect(out.error).toMatch(/tenant context/);
  });

  it('extract_submission_document validates required inputs', async () => {
    const handler = getToolHandler('extract_submission_document')!;
    const out = JSON.parse(await handler({ document_id: 1 }, { organizationId: 1, userId: 2 } as ToolContext));
    expect(out.error).toMatch(/section_code|submission_id/);
  });
});
