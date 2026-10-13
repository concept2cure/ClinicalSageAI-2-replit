/**
 * A cross-node rule may not assert the absence of something AnA never asked
 * (2026-10-13).
 *
 * ── What the sweep found ────────────────────────────────────────────────────
 * Every rule in the cross-node detector has the shape "the programme says X,
 * and the mitigating fact is blank". `isBlank(undefined)` is TRUE, so a rule
 * whose mitigating field NO FLOW ASKS fired on the trigger alone. Thirty-five
 * field ids read there are asked by no flow, across eleven of the twelve rules.
 * So a sponsor was told:
 *
 *   - their oncology programme has no biomarker strategy,
 *   - their accelerated-approval application has no confirmatory trial plan,
 *   - their orphan programme has no natural-history data,
 *   - their multi-regional trial has no ethnic-bridging consideration,
 *   - their biologic has no immunogenicity assessment — severity CRITICAL,
 *   - their Class III device has no clinical evidence — severity CRITICAL,
 *
 * because AnA does not ask any of those questions. The review had caught this
 * shape once already: "that check landed on a sponsor who had been made to
 * invent the data."
 *
 * ── What these tests hold ───────────────────────────────────────────────────
 * Every rule declares the fields it triggers on and the fields whose absence it
 * asserts, and the engine answers `unasked` where the flow asks none of them —
 * in which case the rule stays silent. These tests hold that, and keep the
 * WRITTEN list of the questions AnA does not yet ask, so the gap is visible to
 * us rather than asserted at a sponsor.
 */
import { describe, expect, it } from 'vitest';

import type { DetectedIssue, FlowCategory, FlowEngineContext, FlowState } from '../types.js';
import { fieldsAskedBy, runCrossNodeAnalysis } from '../issue-detector.js';
import { getAvailableFlows, getFlowDefinition } from '../flows/index.js';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null };

const definitionOf = (category: FlowCategory) => getFlowDefinition(category, CTX)!;

/**
 * The interview as it stands: the answers given, and the nodes the person has
 * been THROUGH. A node that asks a mitigating question and has not been
 * completed means the question has not been put yet, which is not a decline —
 * so the nodes holding the answered fields are completed automatically, and
 * `alsoReached` names a node the person passed through and left blank.
 */
const stateWith = (
  category: FlowCategory,
  answers: Record<string, unknown>,
  alsoReached: string[] = [],
): FlowState => {
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
    issues: [],
    startedAt: '2026-10-13T00:00:00.000Z',
    complete: false,
    sectionProgress: {},
  };
};

const firedFor = (
  category: FlowCategory,
  answers: Record<string, unknown>,
  alsoReached: string[] = [],
): string[] =>
  runCrossNodeAnalysis(stateWith(category, answers, alsoReached), definitionOf(category)).map(
    (i: DetectedIssue) => i.checkId,
  );

/**
 * The mitigating questions AnA does not ask yet, with the rule that would have
 * asserted their absence. Each is a question worth adding; until then the rule
 * is silent rather than wrong. This list may only SHRINK — a new entry means a
 * new rule was written against a question nobody asks.
 */
const NOT_ASKED_YET: Readonly<Record<string, string>> = {
  xn_oncology_no_biomarker_strategy:
    'No flow asks for a biomarker strategy or a biomarker-enrichment plan. `companion_diagnostic` is asked, and where it is the rule works.',
  xn_orphan_without_natural_history:
    'No flow asks whether natural-history data exists for the disease.',
  xn_global_trial_no_ethnic_bridging:
    'No flow asks about ethnic factors or a bridging strategy for a multi-regional trial (ICH E5/E17).',
  xn_high_risk_device_no_human_factors:
    'No flow asks whether human-factors validation was done (IEC 62366-1).',
  xn_phase3_no_interim:
    'No flow asks about a planned interim analysis, nor the enrolment the rule needs \u2014 so it was already silent, arithmetically.',
  xn_stability_insufficient_for_shelf_life:
    'The rule needs BOTH the proposed shelf life and the months of long-term data; the shelf life is asked and the data-months is asked nowhere, so the arithmetic has no answer and the rule stays silent. Asking it is the fix, and it is a real ICH Q1E check worth having.',
  xn_iso_14971_no_post_production:
    'The risk-management interview asks about post-market surveillance, so the mitigation IS asked there; `risk_management_process` is what no flow asks, and that is the trigger.',
};

describe('every cross-node rule', () => {
  it('declares what triggers it and what its finding rests on', async () => {
    const { crossNodeRuleFields } = await import('../issue-detector.js');
    const CROSS_NODE_RULE_FIELDS = crossNodeRuleFields();
    const bare = CROSS_NODE_RULE_FIELDS.filter(r => !r.triggeredBy?.length);
    expect(bare.map(r => r.id), 'a rule that does not say what triggers it').toEqual([
      /* The only one that reads no answer: it counts the criticals already
         found, so it has no trigger field of its own. */
      'xn_cumulative_critical_overload',
    ]);
    expect(CROSS_NODE_RULE_FIELDS.length, 'a scan over no rules proves nothing').toBeGreaterThan(10);
  });

  it('is either reachable from a question some flow asks, or named as not asked yet', async () => {
    const { crossNodeRuleFields } = await import('../issue-detector.js');
    const CROSS_NODE_RULE_FIELDS = crossNodeRuleFields();
    const askedAnywhere = new Set<string>();
    for (const listed of getAvailableFlows(CTX)) {
      for (const id of fieldsAskedBy(definitionOf(listed.category))) askedAnywhere.add(id);
    }
    /* The declared ids are ALTERNATIVES, exactly as the runtime reads them: a
       rule is reachable when SOME trigger id is asked and, where it asserts an
       absence, SOME mitigating id is asked. A rule reading four ids of which
       one is asked is reachable; one whose whole group is unasked is not. */
    const unexplained: string[] = [];
    for (const rule of CROSS_NODE_RULE_FIELDS) {
      const triggers = rule.triggeredBy ?? [];
      const mitigations = rule.mitigatedBy ?? [];
      if (triggers.length === 0 && mitigations.length === 0) continue;
      const triggerable = triggers.length === 0 || triggers.some(id => askedAnywhere.has(id));
      const mitigable = mitigations.length === 0 || mitigations.some(id => askedAnywhere.has(id));
      if (triggerable && mitigable) continue;
      const reason = NOT_ASKED_YET[rule.id];
      if (reason && reason.trim().length > 40) continue;
      const which = !triggerable ? `no trigger of ${triggers.join(', ')}` : `no mitigation of ${mitigations.join(', ')}`;
      unexplained.push(`${rule.id}: ${which} is asked anywhere, and nothing explains it`);
    }
    expect(unexplained, 'a rule reading a question nobody asks, with no reason written').toEqual([]);
  });

  it('writes no reason for a rule that does not exist', async () => {
    const { crossNodeRuleFields } = await import('../issue-detector.js');
    const CROSS_NODE_RULE_FIELDS = crossNodeRuleFields();
    const ids = new Set(CROSS_NODE_RULE_FIELDS.map(r => r.id));
    const stale = Object.keys(NOT_ASKED_YET).filter(id => !ids.has(id));
    expect(stale, 'a reason for a rule that is gone').toEqual([]);
  });
});

describe('a question the person has not reached yet', () => {
  it('is not a question they declined', () => {
    /* The IND interview DOES ask whether an immunogenicity assessment is
       planned — three nodes after the product type. Telling a sponsor their
       biologic has no immunogenicity assessment the moment they say
       "biologic" is the same insult in a smaller form. */
    const asked = fieldsAskedBy(definitionOf('ind_submission'));
    expect(asked.has('immunogenicity_assessment_planned'), 'the question exists').toBe(true);
    expect(firedFor('ind_submission', { product_type: 'biologic' })).not.toContain(
      'xn_biologic_no_immunogenicity',
    );
    /* And once they have been through that question and left it empty, the
       finding is real. */
    const node = definitionOf('ind_submission').nodes.find(n =>
      n.fields.some(f => f.id === 'immunogenicity_assessment_planned'),
    )!.id;
    expect(firedFor('ind_submission', { product_type: 'biologic' }, [node])).toContain(
      'xn_biologic_no_immunogenicity',
    );
    /* And silent once they say it is planned. */
    expect(
      firedFor('ind_submission', { product_type: 'biologic', immunogenicity_assessment_planned: true }),
    ).not.toContain('xn_biologic_no_immunogenicity');
  });
});

describe('the findings that were asserted at a sponsor who was never asked', () => {
  it('no longer fire on the trigger alone', () => {
    /* Each of these was an answer a real interview takes, and each used to
       produce the finding by itself. */
    expect(firedFor('nda_submission', { regulatory_pathway: 'accelerated approval' })).not.toContain(
      'xn_accelerated_approval_no_confirmatory',
    );
    expect(firedFor('ind_submission', { therapeutic_area: 'oncology' })).not.toContain(
      'xn_oncology_no_biomarker_strategy',
    );
    expect(firedFor('ind_submission', { expedited_designations: 'orphan drug' })).not.toContain(
      'xn_orphan_without_natural_history',
    );
    expect(firedFor('ind_submission', { product_type: 'biologic' })).not.toContain(
      'xn_biologic_no_immunogenicity',
    );
    expect(firedFor('device_pma', { device_class: 'class_iii' })).not.toContain(
      'xn_class_iii_device_no_clinical_data',
    );
    expect(firedFor('device_510k', { device_class: 'class_iii' })).not.toContain(
      'xn_high_risk_device_no_human_factors',
    );
  });

  it('still fire where the sponsor REFUSED the thing, which is an answer', () => {
    /* 'no' is not an absence: a sponsor who says there is no clinical evidence
       for a Class III device has told AnA something, and the finding stands. */
    /* The PMA interview's own question. 'no' is a sponsor saying they ran no
       clinical study, which is exactly the finding — and the justification
       field beside it is the answer that silences it. */
    expect(
      firedFor('device_pma', { device_class: 'class_iii', clinical_study_conducted: false }),
    ).toContain('xn_class_iii_device_no_clinical_data');
    expect(
      firedFor('device_pma', {
        device_class: 'class_iii',
        clinical_study_conducted: false,
        clinical_no_study_justification: 'Equivalence to the predicate rests on bench and animal data.',
      }),
      'and it is silent once they justify it',
    ).not.toContain('xn_class_iii_device_no_clinical_data');
  });

  it('still fire where the mitigating question IS asked and left blank', () => {
    /* `rems_elements` IS asked, so a labeling programme that says a REMS is
       required and leaves the elements empty is a real absence — and the rule
       must still work. This is the case that proves the repair narrowed the
       rules rather than disabling them. */
    const asked = fieldsAskedBy(definitionOf('nda_submission'));
    expect(asked.has('rems_required'), 'the trigger is asked there').toBe(true);
    expect(asked.has('rems_elements'), 'and so is the mitigation').toBe(true);
    const remsNode = definitionOf('nda_submission').nodes.find(n =>
      n.fields.some(f => f.id === 'rems_elements'),
    )!.id;
    expect(firedFor('nda_submission', { rems_required: 'yes' }, [remsNode])).toContain(
      'xn_rems_without_etasu',
    );
    expect(
      firedFor('nda_submission', { rems_required: 'yes', rems_elements: 'Prescriber certification' }),
      'and it is silent once they say what the elements are',
    ).not.toContain('xn_rems_without_etasu');
    /* And the same programme answered through `labeling`, which asks the
       trigger and NOT the elements, is told nothing — the asymmetry this
       repair is about. */
    expect(fieldsAskedBy(definitionOf('labeling')).has('rems_elements')).toBe(false);
    expect(firedFor('labeling', { rems_required: 'yes' })).not.toContain('xn_rems_without_etasu');
  });
});
