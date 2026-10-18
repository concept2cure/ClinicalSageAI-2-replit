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
import { advanceFlow } from '../engine.js';
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
  'xn_oncology_no_biomarker_strategy/protocol_development':
    'asks none of: biomarker_strategy, companion_diagnostic, biomarker_enrichment',
  'xn_oncology_no_biomarker_strategy/ind_submission':
    'asks none of: biomarker_strategy, companion_diagnostic, biomarker_enrichment',
  'xn_oncology_no_biomarker_strategy/nda_submission':
    'asks none of: biomarker_strategy, companion_diagnostic, biomarker_enrichment',
  'xn_orphan_without_natural_history/protocol_development':
    'asks none of: natural_history, disease_natural_history',
  'xn_orphan_without_natural_history/ind_submission':
    'asks none of: natural_history, disease_natural_history',
  'xn_orphan_without_natural_history/nda_submission':
    'asks none of: natural_history, disease_natural_history',
  'xn_orphan_without_natural_history/bla_submission':
    'asks none of: natural_history, disease_natural_history',
  'xn_global_trial_no_ethnic_bridging/protocol_development':
    'asks none of: ethnic_bridging, ethnicity_factors',
  'xn_global_trial_no_ethnic_bridging/ind_submission':
    'asks none of: ethnic_bridging, ethnicity_factors',
  'xn_phase3_no_interim/protocol_development':
    'asks none of: interim_analysis, planned_interim',
  'xn_high_risk_device_no_human_factors/device_510k':
    'asks none of: human_factors_study, hfe_study',
  'xn_high_risk_device_no_human_factors/device_pma':
    'asks none of: human_factors_study, hfe_study',
  'xn_iso_14971_no_post_production/risk_management':
    'asks none of: risk_management_process, rm_standard',
  'xn_iso_14971_no_post_production/device_510k':
    'asks none of: risk_management_process, rm_standard',
  'xn_iso_14971_no_post_production/device_pma':
    'asks none of: risk_management_process, rm_standard',
  'xn_stability_insufficient_for_shelf_life/stability_study':
    'asks none of: long_term_data_months, stability_data_months',
  'xn_stability_insufficient_for_shelf_life/nda_submission':
    'asks none of: long_term_data_months, stability_data_months',
  'xn_stability_insufficient_for_shelf_life/bla_submission':
    'asks none of: long_term_data_months, stability_data_months',
  'xn_biologic_no_immunogenicity/bla_submission':
    'asks none of: product_type, molecule_type',
  'xn_accelerated_approval_no_confirmatory/nda_submission':
    'asks none of: regulatory_pathway, approval_pathway, accelerated_approval_basis',
  'xn_rems_without_etasu/labeling':
    'asks none of: etasu, rems_elements',
};

/**
 * A reason that can be CHECKED, not merely measured.
 *
 * The reason used to be free prose held to a 40-character minimum, and two of
 * the seven stored reasons were factually false — one named a field asked only
 * in a flow the rule does not apply to, the other named two NODE ids as though
 * they were fields (2026-10-13 audit, F6, F7, F22). A length threshold cannot
 * tell true prose from forty characters of anything.
 *
 * So the form is fixed: `asks none of: a, b, c`, and this verifies that the
 * flow really asks none of them. A reason that becomes false fails here.
 */
function reasonHolds(reason: string, asked: Set<string>): boolean {
  const match = /^asks none of: (.+)$/.exec(reason.trim());
  if (!match) return false;
  const ids = match[1].split(',').map(id => id.trim()).filter(Boolean);
  if (ids.length === 0) return false;
  return ids.every(id => !asked.has(id));
}

/** A rule's declared ids, as the runtime reads them: alternatives. */
interface Declared {
  id: string;
  appliesTo?: string[];
  triggeredBy?: string[];
  mitigatedBy?: string[];
}

/**
 * Why this rule cannot fire in this flow, or nothing. Split out of the
 * assertion so the gate itself stays under the complexity limit — the shape
 * the repo asks for when a check grows branches.
 */
function unreachableIn(rule: Declared, flow: string, askedBy: Map<string, Set<string>>): string[] {
  const triggers = rule.triggeredBy ?? [];
  const mitigations = rule.mitigatedBy ?? [];
  if (triggers.length === 0 && mitigations.length === 0) return [];
  const asked = askedBy.get(flow);
  if (!asked) return [];
  const triggerable = triggers.length === 0 || triggers.some(id => asked.has(id));
  const mitigable = mitigations.length === 0 || mitigations.some(id => asked.has(id));
  if (triggerable && mitigable) return [];
  const reason = NOT_ASKED_YET[`${rule.id}/${flow}`];
  if (reason && reasonHolds(reason, asked)) return [];
  const which = !triggerable
    ? `none of its triggers (${triggers.join(', ')})`
    : `none of its mitigations (${mitigations.join(', ')})`;
  return [`${rule.id} applies to ${flow}, which asks ${which}, and nothing explains it`];
}

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

  it('is reachable IN EACH FLOW IT APPLIES TO, or named there as not asked yet', async () => {
    /* ── Why the union was not enough ─────────────────────────────────────
     * This asked "is SOME trigger asked SOMEWHERE and SOME mitigation asked
     * SOMEWHERE" — a union over every registered flow, with `appliesTo`
     * never consulted. So a rule whose trigger lives only in flow A, whose
     * mitigation lives only in flow B, and which applies to neither, passed.
     * That is exactly how three dead rules stayed green, two of them severity
     * CRITICAL (2026-10-13 audit, F20). The reachability question is per
     * flow, because `appliesTo` is what decides where a rule runs. */
    const { crossNodeRuleFields } = await import('../issue-detector.js');
    const askedBy = new Map<string, Set<string>>();
    for (const listed of getAvailableFlows(CTX)) {
      askedBy.set(listed.category, fieldsAskedBy(definitionOf(listed.category)));
    }
    const unexplained = crossNodeRuleFields().flatMap(rule =>
      (rule.appliesTo ?? [...askedBy.keys()]).flatMap(flow => unreachableIn(rule, flow, askedBy)),
    );
    expect(unexplained, 'a rule that cannot fire in a flow it applies to, with no reason written').toEqual([]);
  });

  it('writes no reason for a pair that IS reachable, which nothing would check', async () => {
    /* The reason is consulted only where a rule cannot fire, so a false entry
       for a reachable pair sits unread — and a reader takes it for a known
       gap. Two of my own first entries were exactly that: `rems_without_etasu`
       declared unreachable in `bla_submission`, which asks both of its
       mitigating fields. A baseline nobody checks is where a claim goes to
       stop being true. */
    const { crossNodeRuleFields } = await import('../issue-detector.js');
    const rules = new Map(crossNodeRuleFields().map(r => [r.id, r]));
    const unneeded: string[] = [];
    for (const key of Object.keys(NOT_ASKED_YET)) {
      const [id, flow] = key.split('/');
      const rule = rules.get(id!);
      if (!rule || !flow) continue;
      const asked = fieldsAskedBy(definitionOf(flow as FlowCategory));
      const triggers = rule.triggeredBy ?? [];
      const mitigations = rule.mitigatedBy ?? [];
      const triggerable = triggers.length === 0 || triggers.some(f => asked.has(f));
      const mitigable = mitigations.length === 0 || mitigations.some(f => asked.has(f));
      if (triggerable && mitigable) unneeded.push(key);
    }
    expect(unneeded, 'a declared gap for a pair that can in fact fire').toEqual([]);
  });

  it('writes no reason for a rule-and-flow pair that does not exist', async () => {
    const { crossNodeRuleFields } = await import('../issue-detector.js');
    const pairs = new Set<string>();
    for (const rule of crossNodeRuleFields()) {
      for (const flow of rule.appliesTo ?? []) pairs.add(`${rule.id}/${flow}`);
    }
    const stale = Object.keys(NOT_ASKED_YET).filter(key => !pairs.has(key));
    expect(stale, 'a reason for a rule-and-flow pair that is gone').toEqual([]);
  });
});

describe('a negative answer that is an answer, not a refusal', () => {
  it('leaves a 510(k) that needs no clinical data alone', () => {
    /* "Clinical Data Required to Address Differences" — no, is the normal and
       usually correct 510(k) answer: performance and bench testing establish
       substantial equivalence. Treating it as a refusal fired a CRITICAL
       finding, and answering no ALSO skips the clinical-evidence node that
       holds the only other mitigating field — so nothing the sponsor could do
       would silence it (2026-10-13 audit, F11). */
    const node = definitionOf('device_510k').nodes.find(n =>
      n.fields.some(f => f.id === 'clinical_data_required'),
    )!.id;
    expect(
      firedFor('device_510k', { device_class: 'class_iii', clinical_data_required: false }, [node]),
      'an answered requirement question is an answer',
    ).not.toContain('xn_class_iii_device_no_clinical_data');
    /* Left empty, having been through the question, it is still a finding. */
    expect(firedFor('device_510k', { device_class: 'class_iii' }, [node])).toContain(
      'xn_class_iii_device_no_clinical_data',
    );
  });

  it('still treats "we ran no study" as the finding it is', () => {
    /* The PMA question is the other kind: `clinical_study_conducted: false`
       says no study was run, which IS the finding — unless they justify it. */
    expect(
      firedFor('device_pma', { device_class: 'class_iii', clinical_study_conducted: false }),
    ).toContain('xn_class_iii_device_no_clinical_data');
  });

  it('cites the route a 510(k) is being told about, not the PMA regulation alone', () => {
    const node = definitionOf('device_510k').nodes.find(n =>
      n.fields.some(f => f.id === 'clinical_data_required'),
    )!.id;
    const issue = runCrossNodeAnalysis(
      stateWith('device_510k', { device_class: 'class_iii' }, [node]),
      definitionOf('device_510k'),
    ).find(i => i.checkId === 'xn_class_iii_device_no_clinical_data')!;
    expect(issue.reference, 'the statute that decides the route').toMatch(/515\(b\)/);
    expect(issue.message).toMatch(/premarket approval route unless it is a preamendments type/);
  });
});

describe('a trigger a flow offers as a multi_select', () => {
  it('reads the paediatric population protocol_development actually asks about', () => {
    /* `includes_vulnerable_populations` is a multi_select offering
       'pediatric'. `strVal` returns '' for an array, so every multi_select
       trigger read as empty and a CRITICAL paediatric-safety finding could
       never fire anywhere (2026-10-13 audit, F2). */
    const dsmb = definitionOf('protocol_development').nodes.find(n =>
      n.fields.some(f => f.id === 'dsmb_required'),
    )!.id;
    expect(
      firedFor('protocol_development', { includes_vulnerable_populations: ['pediatric'] }, [dsmb]),
    ).toContain('xn_pediatric_without_safety_monitoring');
    /* And silent once they name the monitoring body. */
    expect(
      firedFor('protocol_development', {
        includes_vulnerable_populations: ['pediatric'],
        dsmb_required: true,
      }),
    ).not.toContain('xn_pediatric_without_safety_monitoring');
    /* 'none' among the populations is not a paediatric study. */
    expect(
      firedFor('protocol_development', { includes_vulnerable_populations: ['none'] }, [dsmb]),
    ).not.toContain('xn_pediatric_without_safety_monitoring');
  });

  it('reads the accelerated-approval basis the BLA interview asks for', () => {
    /* The rule read `regulatory_pathway`, which neither applicable flow asks;
       the BLA asks for the basis of the accelerated claim (F1). */
    const node = definitionOf('bla_submission').nodes.find(n =>
      n.fields.some(f => f.id === 'confirmatory_study_needed'),
    )!.id;
    expect(
      firedFor(
        'bla_submission',
        { accelerated_approval_basis: 'Overall response rate as a surrogate for survival.' },
        [node],
      ),
    ).toContain('xn_accelerated_approval_no_confirmatory');
    expect(
      firedFor('bla_submission', {
        accelerated_approval_basis: 'Overall response rate as a surrogate for survival.',
        confirmatory_study_protocol: 'A randomised confirmatory trial is planned, protocol CT-204.',
      }),
    ).not.toContain('xn_accelerated_approval_no_confirmatory');
  });
});

describe('the engine, not a hand-built state', () => {
  /**
   * Everything above drives `runCrossNodeAnalysis` directly, with a state this
   * file composes. That left the ENGINE's own ordering untested, and it was
   * wrong: the analysis ran five lines before `completedNodes` was extended,
   * so a rule whose trigger and mitigation live in the SAME node read
   * `pending` at the moment the answer arrived.
   *
   * `rems_evaluation` is the LAST node of `bla_submission` (`defaultNext:
   * null`) and holds both `rems_required` and `rems_elements`. So there was no
   * later question for the finding to arrive at, and a sponsor who said a REMS
   * was required and named no elements was told nothing at all — a regression
   * the `pending` state introduced (2026-10-13 audit, F3).
   */
  it('reports a same-node finding when the answer is given, not one question later', () => {
    const definition = getFlowDefinition('bla_submission', CTX)!;
    const node = definition.nodes.find(n => n.fields.some(f => f.id === 'rems_elements'))!;
    expect(node.defaultNext, 'the node is terminal, so there is no later question').toBeNull();

    const answers: Record<string, unknown> = {
      rems_required: 'yes',
      /* `rems_elements` left empty: shown, nothing picked. That is the finding. */
      /* The field requires at least 100 characters, and a test that fails
         validation would prove nothing about the finding. */
      risk_benefit_summary:
        'The benefit outweighs the identified risks under the proposed controls, which are described in the risk ' +
        'management plan and summarised in the integrated benefit-risk assessment.',
      final_submission_date: '2027-06-01',
      form_fda_356h: true,
      environmental_assessment: 'categorical_exclusion',
    };
    const result = advanceFlow(
      {
        flowId: 'bla-under-test',
        flowCategory: 'bla_submission',
        currentNodeId: node.id,
        answers: {},
        completedNodes: [],
        issues: [],
        startedAt: '2026-10-13T00:00:00.000Z',
        complete: false,
        sectionProgress: {},
      },
      node.id,
      answers,
      CTX,
    );
    const refused = (result.event?.newIssues ?? []).filter(i => i.checkId.startsWith('validation_'));
    expect(refused.map(i => i.message), 'the answers must be accepted for this to mean anything').toEqual([]);
    const reported = [
      ...(result.event?.newIssues ?? []),
      ...(result.completeEvent ? result.state.issues : []),
    ].map(i => i.checkId);
    expect(reported, 'the REMS finding, at the question that produced it').toContain('xn_rems_without_etasu');
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
       finding is real. `is_biologic: true` is there because that is the
       question's own gate — see the next case. */
    const node = definitionOf('ind_submission').nodes.find(n =>
      n.fields.some(f => f.id === 'immunogenicity_assessment_planned'),
    )!.id;
    expect(
      firedFor('ind_submission', { product_type: 'biologic', is_biologic: true }, [node]),
    ).toContain('xn_biologic_no_immunogenicity');
    /* And silent once they say it is planned. */
    expect(
      firedFor('ind_submission', {
        product_type: 'biologic',
        is_biologic: true,
        immunogenicity_assessment_planned: true,
      }),
    ).not.toContain('xn_biologic_no_immunogenicity');
  });

  it('is not a question they declined when its own gate hid it either', () => {
    /* `immunogenicity_assessment_planned` is gated on `is_biologic`, asked in
       an earlier node. A programme whose product type matches the trigger
       ('monoclonal_antibody' contains 'antibod') but which answered
       `is_biologic: false` — inconsistent, and nothing refuses it — never saw
       the question. Completing its node made the field read BLANK, and a
       CRITICAL finding asserted the absence of something never drawn
       (2026-10-13 audit, F10). A completed node is not enough; the field's own
       gate must have held. */
    const node = definitionOf('ind_submission').nodes.find(n =>
      n.fields.some(f => f.id === 'immunogenicity_assessment_planned'),
    )!.id;
    const hidden = { product_type: 'monoclonal_antibody', is_biologic: false };
    expect(firedFor('ind_submission', hidden, [node])).not.toContain('xn_biologic_no_immunogenicity');
    /* The same programme that DID see the question, and left it empty. */
    expect(
      firedFor('ind_submission', { product_type: 'monoclonal_antibody', is_biologic: true }, [node]),
    ).toContain('xn_biologic_no_immunogenicity');
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
