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
import { runCrossNodeAnalysis } from '../issue-detector.js';
import { getFlowDefinition } from '../flows/index.js';

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
