/**
 * The cross-node rules that `cross-node-rules-can-fire.test.ts` listed as "not
 * asked yet", made live — each shown firing on the answer it exists for and
 * silent on the answer that clears it (S4, 2026-11-02).
 *
 * Every rule here was silent before this work, and for a reason the old gate
 * only half stated: its written reason named the unasked MITIGATION, while in
 * 14 of the 21 pairs the TRIGGER was asked by no flow it applied to either. A
 * rule dead on both sides cannot be revived by asking one of them, so each was
 * re-read against the interview it serves — pointed at the field that flow
 * really asks where it is the same regulatory fact, or given a governed
 * question where no field carries it.
 *
 * The designs were each reviewed adversarially before implementation; the
 * reviews corrected several overstated citations and two gates that would have
 * fired for programmes the rule does not apply to.
 */
import { describe, expect, it } from 'vitest';

import type { DetectedIssue, FlowCategory, FlowEngineContext, FlowState } from '../types.js';
import { runCrossNodeAnalysis, runIssueChecks } from '../issue-detector.js';
import { getFlowDefinition } from '../flows/index.js';
import { advanceFlow, evaluatePredicate } from '../engine.js';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null };
const definitionOf = (category: FlowCategory) => getFlowDefinition(category, CTX)!;

/** Answers given, with each answered field's node completed; `alsoReached` is passed and left blank. */
function stateWith(
  category: FlowCategory,
  answers: Record<string, unknown>,
  alsoReached: string[] = [],
  issues: DetectedIssue[] = [],
): FlowState {
  const completed = new Set(alsoReached);
  for (const node of definitionOf(category).nodes) {
    if (node.fields.some(f => f.id in answers)) completed.add(node.id);
  }
  return {
    flowId: `${category}-under-test`,
    flowCategory: category,
    currentNodeId: 'x',
    answers: { any_node: answers },
    completedNodes: [...completed],
    issues,
    startedAt: '2026-11-02T00:00:00.000Z',
    complete: false,
    sectionProgress: {},
  };
}

const fired = (
  category: FlowCategory,
  answers: Record<string, unknown>,
  alsoReached: string[] = [],
  issues: DetectedIssue[] = [],
): DetectedIssue[] => runCrossNodeAnalysis(stateWith(category, answers, alsoReached, issues), definitionOf(category));

const ids = (issues: DetectedIssue[]) => issues.map(i => i.checkId);

/* ── Human factors: a Class III device without validation testing ────────── */
describe('xn_high_risk_device_no_human_factors', () => {
  const HF = 'xn_high_risk_device_no_human_factors';

  it.each([
    ['a stated no', false],
    ['a no through the tool surface', 'n'],
    ['a refusal the node check cannot read', 'not_applicable'],
  ])('fires in the 510(k) for a Class III device on %s', (_why, answer) => {
    expect(ids(fired('device_510k', { device_class: 'class_iii', summative_testing_completed: answer }))).toContain(HF);
  });

  it('fires where the human factors node was reached and left blank', () => {
    expect(ids(fired('device_510k', { device_class: 'class_iii' }, ['usability_human_factors']))).toContain(HF);
  });

  it('is silent when validation testing is completed, and for a Class II device', () => {
    expect(ids(fired('device_510k', { device_class: 'class_iii', summative_testing_completed: true }))).not.toContain(HF);
    expect(ids(fired('device_510k', { device_class: 'class_ii', summative_testing_completed: false }))).not.toContain(HF);
  });

  it('reads a 520(l) transitional device in the PMA flow as Class III', () => {
    /* 'class_ii_pma' contains no 'iii': the old substring test missed it. */
    expect(ids(fired('device_pma', { device_class: 'class_ii_pma', summative_testing: false }))).toContain(HF);
    expect(ids(fired('device_pma', { device_class: 'class_iii', summative_testing: 'no' }))).toContain(HF);
  });

  it('defers to the node check that already reported the same answer — one fact, one finding', () => {
    const nodeCheck = (checkId: string): DetectedIssue =>
      ({ checkId, severity: 'warning', title: 't', message: 'm', questionId: 'q' }) as DetectedIssue;
    expect(
      ids(fired('device_pma', { device_class: 'class_iii', summative_testing: false }, [], [nodeCheck('no_summative_testing_check')])),
    ).not.toContain(HF);
    expect(
      ids(
        fired('device_510k', { device_class: 'class_iii', summative_testing_completed: false }, [], [
          nodeCheck('no_usability_patient_use_check'),
        ]),
      ),
    ).not.toContain(HF);
  });

  it('cites the guidance by its title and does not say it requires anything', () => {
    const issue = fired('device_510k', { device_class: 'class_iii', summative_testing_completed: false }).find(i => i.checkId === HF)!;
    expect(issue.reference).toMatch(/Applying Human Factors and Usability Engineering to Medical Devices \(February 2016\)/);
    expect(issue.message).not.toMatch(/requires/);
  });
});

/* ── Immunogenicity: a biologic with no assessment ───────────────────────── */
describe('xn_biologic_no_immunogenicity', () => {
  const IG = 'xn_biologic_no_immunogenicity';
  const ADA_NODE = ['immunogenicity_assessment'];

  it('triggers in the BLA on product_class, which is what the BLA asks', () => {
    /* The BLA asks neither product_type nor molecule_type, so it never triggered. */
    expect(ids(fired('bla_submission', { bla_pathway: '351a_novel', product_class: 'monoclonal_antibody' }, ADA_NODE))).toContain(IG);
  });

  it('waits while the ADA node has not been reached', () => {
    expect(ids(fired('bla_submission', { bla_pathway: '351a_novel', product_class: 'monoclonal_antibody' }))).not.toContain(IG);
  });

  it('is cleared by the required ADA strategy alone, with no risk factors listed', () => {
    /* Risk factors are optional and offer no 'none'. Reading only them fired a
       CRITICAL at a sponsor who had answered the required ADA strategy. */
    expect(
      ids(fired('bla_submission', { bla_pathway: '351a_novel', product_class: 'monoclonal_antibody', ada_assay_strategy: 'tiered_approach' })),
    ).not.toContain(IG);
  });

  it.each(['adc', 'enzyme_replacement'])('reads %s as a biologic', productClass => {
    expect(ids(fired('bla_submission', { bla_pathway: '351a_novel', product_class: productClass }, ADA_NODE))).toContain(IG);
  });

  it.each(['vaccine', 'blood_product', '__other__'])('stays silent for %s', productClass => {
    expect(ids(fired('bla_submission', { bla_pathway: '351a_novel', product_class: productClass }, ADA_NODE))).not.toContain(IG);
  });

  it('reads the 351(k) comparative immunogenicity answer, and cites the statute when it is missing', () => {
    const comparison = 'ADA and NAb incidence were comparable to the reference product across the 52-week study.';
    expect(
      ids(fired('bla_submission', { bla_pathway: '351k_biosimilar', product_class: 'monoclonal_antibody', immunogenicity_comparison: comparison })),
    ).not.toContain(IG);
    const issue = fired('bla_submission', { bla_pathway: '351k_biosimilar', product_class: 'monoclonal_antibody' }, ['biosimilar_clinical']).find(
      i => i.checkId === IG,
    );
    expect(issue, 'a biosimilar with no immunogenicity comparison').toBeDefined();
    expect(issue!.reference).toMatch(/262\(k\)\(2\)\(A\)\(i\)\(I\)\(cc\)/);
  });

  it('does not cite the BLA regulation for an IND', () => {
    const node = definitionOf('ind_submission').nodes.find(n => n.fields.some(f => f.id === 'immunogenicity_assessment_planned'))!;
    const issue = fired('ind_submission', { product_type: 'biologic', is_biologic: true }, [node.id]).find(i => i.checkId === IG);
    expect(issue).toBeDefined();
    expect(issue!.reference).not.toContain('601.2');
  });

  it('reads a biosimilar IND as a biologic, and is cleared by a planned assessment', () => {
    const node = definitionOf('ind_submission').nodes.find(n => n.fields.some(f => f.id === 'immunogenicity_assessment_planned'))!;
    expect(ids(fired('ind_submission', { product_type: 'biosimilar', is_biologic: true }, [node.id]))).toContain(IG);
    expect(ids(fired('ind_submission', { product_type: 'biosimilar', is_biologic: true, immunogenicity_assessment_planned: true }))).not.toContain(IG);
  });
});

/* ── ISO 14971 applied, with no post-production information system ───────── */
describe('xn_iso_14971_no_post_production', () => {
  const PP = 'xn_iso_14971_no_post_production';

  it('fires in the 510(k) when neither a surveillance plan nor complaint handling exists', () => {
    expect(
      ids(fired('device_510k', { iso_14971_applied: true, post_market_surveillance_plan: false, complaint_handling_process: false })),
    ).toContain(PP);
  });

  it('is cleared by either channel — complaint handling alone is a post-production system', () => {
    expect(
      ids(fired('device_510k', { iso_14971_applied: true, post_market_surveillance_plan: false, complaint_handling_process: true })),
    ).not.toContain(PP);
    expect(
      ids(fired('device_510k', { iso_14971_applied: true, post_market_surveillance_plan: true, complaint_handling_process: false })),
    ).not.toContain(PP);
  });

  it('is silent when ISO 14971 is not applied — that has its own critical node check', () => {
    expect(
      ids(fired('device_510k', { iso_14971_applied: false, post_market_surveillance_plan: false, complaint_handling_process: false })),
    ).not.toContain(PP);
  });

  it('waits while the surveillance node has not been reached', () => {
    expect(ids(fired('device_510k', { iso_14971_applied: true }))).not.toContain(PP);
  });

  it('reads the PMA flow\u2019s own ids, including tool-surface strings', () => {
    expect(
      ids(fired('device_pma', { iso_14971_applied: 'yes', post_market_plan_developed: 'no', complaint_handling_system: 'no' })),
    ).toContain(PP);
    expect(
      ids(fired('device_pma', { iso_14971_applied: true, post_market_plan_developed: false, complaint_handling_system: true })),
    ).not.toContain(PP);
  });

  it('no longer runs in the risk-management flow, whose own node check makes this finding', () => {
    expect(
      ids(fired('risk_management', { applicable_standards: ['iso_14971'], post_production_process_established: false })),
    ).not.toContain(PP);
  });
});

/* ── Accelerated approval with no confirmatory trial ─────────────────────── */
describe('xn_accelerated_approval_no_confirmatory', () => {
  const AA = 'xn_accelerated_approval_no_confirmatory';
  const nodeHolding = (category: FlowCategory, field: string) =>
    definitionOf(category).nodes.find(n => n.fields.some(f => f.id === field))!;

  it.each([false, 'no'])('fires in the NDA on the route the interview asks, with confirmatory %s', answer => {
    /* The NDA asks `accelerated_pathway`; the rule read `regulatory_pathway`, asked by neither flow. */
    expect(
      ids(fired('nda_submission', { accelerated_pathway: ['priority_review', 'accelerated_approval'], confirmatory_study_planned: answer })),
    ).toContain(AA);
  });

  it('fires where the post-marketing node was reached and left blank', () => {
    const pmc = nodeHolding('nda_submission', 'confirmatory_study_planned');
    expect(ids(fired('nda_submission', { accelerated_pathway: ['accelerated_approval'] }, [pmc.id]))).toContain(AA);
  });

  it.each([true, 'yes'])('is cleared by a planned confirmatory trial (%s)', answer => {
    expect(ids(fired('nda_submission', { accelerated_pathway: ['accelerated_approval'], confirmatory_study_planned: answer }))).not.toContain(AA);
  });

  it('is silent for a programme not on the accelerated route, and waits while the node is unreached', () => {
    expect(
      ids(fired('nda_submission', { accelerated_pathway: ['priority_review', 'breakthrough'], confirmatory_study_planned: false })),
    ).not.toContain(AA);
    expect(ids(fired('nda_submission', { accelerated_pathway: ['accelerated_approval'] }))).not.toContain(AA);
  });

  it('triggers in the BLA on its first-node pathway answer too', () => {
    expect(
      ids(fired('bla_submission', { accelerated_pathway: ['accelerated_approval'], surrogate_endpoint_used: false, confirmatory_study_needed: false })),
    ).toContain(AA);
    expect(ids(fired('bla_submission', { accelerated_pathway: ['fast_track'], confirmatory_study_needed: false }))).not.toContain(AA);
  });

  it('no longer raises a CRITICAL at a traditional-approval programme from the node checks it replaced', () => {
    /* The deleted node checks fired on a bare "no", whatever the pathway. */
    const confirmatoryCritical = (issues: DetectedIssue[]) =>
      issues.filter(i => i.severity === 'critical' && /confirmatory/i.test(`${i.checkId} ${i.title}`));
    expect(
      confirmatoryCritical(runIssueChecks(nodeHolding('nda_submission', 'confirmatory_study_planned'), { confirmatory_study_planned: false })),
    ).toEqual([]);
    expect(
      confirmatoryCritical(runIssueChecks(nodeHolding('bla_submission', 'confirmatory_study_needed'), { confirmatory_study_needed: false })),
    ).toEqual([]);
  });
});

/* ── A large confirmatory trial with no interim analysis ─────────────────── */
describe('xn_phase3_no_interim', () => {
  const IA = 'xn_phase3_no_interim';
  const large = { phase: 'phase_3', planned_enrollment: 400, design_type: 'parallel' };

  it.each(['none', 'not_defined'])('fires on %s', answer => {
    expect(ids(fired('protocol_development', { ...large, interim_analysis: answer }))).toContain(IA);
  });

  it('fires where the statistics node was reached and the question left blank', () => {
    expect(ids(fired('protocol_development', large, ['stats_approach']))).toContain(IA);
  });

  it.each(['efficacy_and_futility', 'efficacy_only', 'futility_only', 'safety_only', '__other__'])(
    'is cleared by a stated plan: %s',
    answer => {
      expect(ids(fired('protocol_development', { ...large, interim_analysis: answer }))).not.toContain(IA);
    },
  );

  it('waits while the statistics node is unreached', () => {
    expect(ids(fired('protocol_development', large))).not.toContain(IA);
  });

  it('is silent for a Phase 2 trial and for a trial of 200 or fewer', () => {
    expect(ids(fired('protocol_development', { ...large, phase: 'phase_2', interim_analysis: 'none' }))).not.toContain(IA);
    expect(ids(fired('protocol_development', { ...large, planned_enrollment: 150, interim_analysis: 'none' }))).not.toContain(IA);
  });

  it.each(['phase_2b_3', 'phase_3b_4'])('treats %s as confirmatory', phase => {
    expect(ids(fired('protocol_development', { ...large, phase, interim_analysis: 'none' }))).toContain(IA);
  });

  it('reads the adaptive branch\u2019s own interim question', () => {
    const adaptive = { ...large, design_type: 'adaptive' };
    expect(ids(fired('protocol_development', { ...adaptive, interim_analysis_planned: false }))).toContain(IA);
    expect(ids(fired('protocol_development', { ...adaptive, interim_analysis_planned: true }))).not.toContain(IA);
  });

  it('reads an enrolment given as a string', () => {
    expect(ids(fired('protocol_development', { ...large, planned_enrollment: '400', interim_analysis: 'none' }))).toContain(IA);
  });

  it('asks the question only where the rule can hold', () => {
    const field = definitionOf('protocol_development')
      .nodes.flatMap(n => n.fields)
      .find(f => f.id === 'interim_analysis')!;
    expect(field.visibleWhen, 'the question must be gated').toBeDefined();
    const shown = (answers: Record<string, unknown>) => evaluatePredicate(field.visibleWhen!, answers);
    expect(shown({ phase: 'phase_3', planned_enrollment: 201, design_type: 'parallel' })).toBe(true);
    expect(shown({ phase: 'phase_3', planned_enrollment: 200, design_type: 'parallel' }), 'N=200 is not large').toBe(false);
    expect(shown({ phase: 'phase_3', planned_enrollment: 400, design_type: 'adaptive' }), 'the adaptive branch asks its own').toBe(false);
    expect(shown({ phase: 'phase_2', planned_enrollment: 400, design_type: 'parallel' })).toBe(false);
  });
});

/* ── A REMS with no defined elements, answered in the labeling interview ─── */
describe('xn_rems_without_etasu, through the engine', () => {
  it('reports the finding when the labeling answer is given — same node, no later question', () => {
    /* rems_required and rems_elements share the entry node, so the finding has
       to arrive on this answer, not one question later. */
    const result = advanceFlow(
      {
        flowId: 'labeling-under-test',
        flowCategory: 'labeling',
        currentNodeId: 'product_regulatory_context',
        answers: {},
        completedNodes: [],
        issues: [],
        startedAt: '2026-11-02T00:00:00.000Z',
        complete: false,
        sectionProgress: {},
      },
      'product_regulatory_context',
      { product_name: 'Acme Tablets', product_type: 'rx_drug', submission_type: 'initial', rems_required: 'yes' },
      CTX,
    );
    const refused = (result.event?.newIssues ?? []).filter(i => i.checkId.startsWith('validation_'));
    expect(refused.map(i => i.message), 'the answers must be accepted for this to mean anything').toEqual([]);
    expect((result.event?.newIssues ?? []).map(i => i.checkId)).toContain('xn_rems_without_etasu');
  });
});
