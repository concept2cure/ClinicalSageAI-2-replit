/**
 * A programme that is not filing in the United States can say so, in the one
 * question that compelled it to state an FDA class (2026-10-12 review).
 *
 * ── The asymmetry ───────────────────────────────────────────────────────────
 * `device_classification` asks two classes. The EU field has carried
 * 'Not applicable / No EU filing planned' since it was written, and the engine
 * reads that value as the absence of a filing rather than as a class — it is
 * what the notified-body question is gated on. The US field, which is
 * REQUIRED, offered Class I, Class II, Class III and 'Not Yet Classified' and
 * nothing else.
 *
 * So a European device programme had to assert an FDA class it had never
 * determined, or claim not to know one. Those are different statements and
 * neither was true of it, and whichever it picked went onto the record as the
 * programme's own answer.
 *
 * The repair is the EU field's own wording on the US field, the same reading
 * in the fact reader, and a cross-node check for the case the two answers
 * contradict each other: FDA named AND no US filing planned.
 */
import { describe, expect, it } from 'vitest';

import type { FlowEngineContext, FlowState } from '../types.js';
import { advanceFlow } from '../engine.js';
import { getFlowDefinition } from '../flows/index.js';
import { programmeFactsFrom } from '../programme-facts.js';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null, clientType: 'medtech' };

const stateWith = (targets: Record<string, unknown>): FlowState => ({
  flowId: 'project-setup-v1',
  flowCategory: 'project_setup',
  currentNodeId: 'device_classification',
  answers: { regulatory_targets: { product_type: 'medical_device', ...targets } },
  completedNodes: [],
  issues: [],
  startedAt: '2026-10-12T00:00:00.000Z',
  complete: false,
  sectionProgress: {},
});

/** The classification question as it is drawn, straight from the definition. */
const classField = (id: string) => {
  const node = getFlowDefinition('project_setup', CTX)!.nodes.find(n => n.id === 'device_classification')!;
  return node.fields.find(f => f.id === id)!;
};

describe('the two classification questions', () => {
  it('both offer the answer a programme filing in one region only has to give', () => {
    /* The consistency the directive asks for: the same question about two
       regulators, with the same positions available. */
    for (const id of ['device_class', 'eu_mdr_class']) {
      const labels = (classField(id).options ?? []).map(o => o.label);
      expect(labels.some(l => /Not applicable \/ No \w+ filing planned/.test(l)), id).toBe(true);
    }
  });

  it('is required of everyone, which is only honest now that everyone has an answer', () => {
    expect(classField('device_class').required, 'a class the record needs').toBe(true);
    expect((classField('device_class').options ?? []).map(o => o.value)).toContain('no_us_filing');
  });

  it('reads no US filing as the absence of a class, not as a class', () => {
    expect(programmeFactsFrom({ device_class: 'no_us_filing' })).toEqual({});
    /* And distinctly from not knowing, which is the other non-answer: both
       state no class, and the record keeps which was said. */
    expect(programmeFactsFrom({ device_class: 'not_classified' })).toEqual({});
  });
});

describe('a European programme answering it', () => {
  const answer = (targets: Record<string, unknown>, deviceClass: string) =>
    advanceFlow(stateWith(targets), 'device_classification', { device_class: deviceClass, eu_mdr_class: 'class_iib' }, CTX);

  it('passes the required field without asserting an FDA class', () => {
    const result = answer({ primary_regulatory_agency: 'EU' }, 'no_us_filing');
    /* A refused answer comes back as the SAME question with a
       `validation_<field>` issue on the event, so moving on is what passing
       looks like. */
    const refusals = (result.event?.newIssues ?? []).filter(i => i.checkId.startsWith('validation_'));
    expect(refusals.map(i => i.message), 'the answer was accepted').toEqual([]);
    expect(result.event?.node.id, 'and goes on to the next question').toBe('medtech_regulatory');
  });

  it('is refused where the field is left blank, so the gate above is not vacuous', () => {
    /* The required field still has to be answered: it is the value that is
       new, not the requirement. */
    const result = advanceFlow(
      stateWith({ primary_regulatory_agency: 'EU' }),
      'device_classification',
      { eu_mdr_class: 'class_iib' },
      CTX,
    );
    expect((result.event?.newIssues ?? []).map(i => i.checkId)).toContain('validation_device_class');
    expect(result.event?.node.id, 'and the same question comes back').toBe('device_classification');
  });

  it('is not told it has contradicted itself, because it has not', () => {
    const issues = answer({ primary_regulatory_agency: 'EU' }, 'no_us_filing').state.issues;
    expect(issues.map(i => i.checkId)).not.toContain('xn_no_us_filing_while_naming_fda');
  });

  it('still has FDA’s routes marked by the regulator rule, not by this answer', () => {
    /* The marking comes from the agencies the programme named. Saying "no US
       filing" must not become a second, quieter way of deciding which routes
       exist — the catalogue lists and the rules mark. */
    const field = answer({ primary_regulatory_agency: 'EU' }, 'no_us_filing')
      .event!.node.fields.find(f => f.id === 'device_submission_pathway')!;
    expect((field.options ?? []).map(o => o.value), 'the EU list, as before').toContain('EU_MDR_CLASS_IIB');
    expect((field.options ?? []).map(o => o.value)).not.toContain('US_510K');
  });
});

describe('the contradiction between the two answers', () => {
  const issuesFor = (targets: Record<string, unknown>) =>
    advanceFlow(
      stateWith(targets),
      'device_classification',
      { device_class: 'no_us_filing', eu_mdr_class: 'class_iib' },
      CTX,
    ).state.issues.map(i => i.checkId);

  it('is reported when FDA is the primary agency', () => {
    expect(issuesFor({ primary_regulatory_agency: 'US' })).toContain('xn_no_us_filing_while_naming_fda');
  });

  it('is reported when FDA is among the additional agencies', () => {
    /* The fact reader takes both fields, so this needed no second rule — and a
       rule that has only been reasoned about has not been seen to fire. */
    expect(
      issuesFor({ primary_regulatory_agency: 'EU', additional_agencies: ['US'] }),
    ).toContain('xn_no_us_filing_while_naming_fda');
  });

  it('says which two answers it is about, and what to do with either', () => {
    const issue = advanceFlow(
      stateWith({ primary_regulatory_agency: 'US' }),
      'device_classification',
      { device_class: 'no_us_filing', eu_mdr_class: 'class_iib' },
      CTX,
    ).state.issues.find(i => i.checkId === 'xn_no_us_filing_while_naming_fda')!;
    expect(issue.severity).toBe('warning');
    expect(issue.message, 'the US is in scope and has a class').toMatch(/the device has a class/);
    expect(issue.message, 'or FDA comes off the list').toMatch(/come off the list/);
    expect(issue.reference).toMatch(/21 CFR 860/);
    expect(issue.triggerValues, 'the record says what it judged').toMatchObject({ device_class: 'no_us_filing' });
  });

  it('is silent where a class WAS stated, however the programme is configured', () => {
    const issues = advanceFlow(
      stateWith({ primary_regulatory_agency: 'US' }),
      'device_classification',
      { device_class: 'class_ii', eu_mdr_class: 'class_iib' },
      CTX,
    ).state.issues.map(i => i.checkId);
    expect(issues).not.toContain('xn_no_us_filing_while_naming_fda');
  });
});
