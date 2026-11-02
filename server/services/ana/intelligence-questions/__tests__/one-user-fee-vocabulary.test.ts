/**
 * The application user fee is asked as positions, read one way, and a claimed
 * orphan exemption is judged against the designation (S4, 2026-11-02).
 *
 * Both the NDA and the BLA asked a yes/no "PDUFA user fee paid". An
 * orphan-designated application is exempt (FD&C Act §736(a)(1)(F)), so its
 * honest answer was "no", and the NDA node and the war game both called it a
 * critical refuse-to-file. And the BLA asked a 351(k) biosimilar about PDUFA,
 * whose fees it does not pay. This holds:
 *   - both questions offer the same positions, and the person's own words;
 *   - the goal-date gate and the reader agree on every value ever offered;
 *   - the node's critical fires on "not yet paid", not on an exemption;
 *   - the interview pushes back on an exemption the designation or the
 *     pathway does not support, and the war game says the same.
 */
import { describe, expect, it } from 'vitest';

import { OTHER_POSITION } from '../../../../../shared/types/intelligence-questions.js';
import { evaluatePredicate } from '../../../../../shared/ana/question-predicate.js';
import type { DetectedIssue, FlowCategory, FlowEngineContext, FlowState } from '../types.js';
import { getFlowDefinition } from '../flows/index.js';
import { runCrossNodeAnalysis, runIssueChecks } from '../issue-detector.js';
import { FEE_SETTLED_READINGS, USER_FEE_POSITIONS, userFeeReadingOf } from '../flows/nda-submission-user-fee.js';
import { runWarGame } from '../war-game/engine.js';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null };
const FLOWS = ['nda_submission', 'bla_submission'] as const;
const def = (c: FlowCategory) => getFlowDefinition(c, CTX)!;
const nodeAsking = (c: FlowCategory, id: string) => def(c).nodes.find(n => n.fields.some(f => f.id === id))!;
const field = (c: FlowCategory, id: string) => nodeAsking(c, id).fields.find(f => f.id === id)!;

describe('the fee question', () => {
  it.each(FLOWS)('%s offers the positions, each with commits and authority, and the person’s own words', c => {
    const f = field(c, 'user_fee_paid');
    expect(f.type).toBe('select');
    expect(f.options?.map(o => o.value)).toEqual(USER_FEE_POSITIONS.map(o => o.value));
    expect(f.options?.every(o => o.commits && o.authority)).toBe(true);
    expect(f.allowOther?.prompt).toBeTruthy();
  });

  it('the BLA does not ask a biosimilar about PDUFA alone', () => {
    expect(field('bla_submission', 'user_fee_paid').label).toMatch(/BsUFA/);
  });
});

const VALUES: unknown[] = [
  ...USER_FEE_POSITIONS.map(o => o.value), OTHER_POSITION,
  true, false, 'yes', 'no', 'Yes', ' y ', 'TRUE', 'false', '1', '0', '', undefined, null, 'paid ', 'waived',
];

describe('the goal-date gate and the reader', () => {
  it.each(VALUES.map(v => [JSON.stringify(v) ?? 'undefined', v]))('agree on %s', (_l, value) => {
    const settled = FEE_SETTLED_READINGS.has(userFeeReadingOf(value)!);
    for (const c of FLOWS) {
      expect(evaluatePredicate(field(c, 'pdufa_goal_date').visibleWhen!, { user_fee_paid: value }), c).toBe(settled);
    }
  });

  it('reads a saved yes as paid and a saved no as not paid, which is what was asked', () => {
    expect(userFeeReadingOf(true)).toBe('paid');
    expect(userFeeReadingOf('yes')).toBe('paid');
    expect(userFeeReadingOf(false)).toBe('not_paid');
    expect(userFeeReadingOf('no')).toBe('not_paid');
  });
});

describe('the node’s own critical', () => {
  it.each(FLOWS)('%s: fires on "not yet paid", and not on an exemption, a waiver or a payment', c => {
    const node = nodeAsking(c, 'user_fee_paid');
    const critical = (v: string) => runIssueChecks(node, { user_fee_paid: v }).filter(i => i.severity === 'critical');
    expect(critical('not_paid')).toHaveLength(1);
    for (const v of ['orphan_exempt', 'waiver_granted', 'paid']) expect(critical(v), v).toHaveLength(0);
  });
});

/* The cross-node rule over a state where every answered field's node is done. */
function fired(c: FlowCategory, answers: Record<string, unknown>): DetectedIssue | undefined {
  const done = def(c).nodes.filter(n => n.fields.some(f => f.id in answers)).map(n => n.id);
  const state: FlowState = {
    flowId: `${c}-under-test`, flowCategory: c, currentNodeId: 'x', answers: { n: answers },
    completedNodes: done, issues: [], startedAt: '2026-11-02T00:00:00.000Z', complete: false, sectionProgress: {},
  };
  return runCrossNodeAnalysis(state, def(c)).find(i => i.checkId === 'xn_fee_exemption_unsupported');
}

describe('the interview pushes back on an exemption that does not hold', () => {
  it.each(FLOWS)('%s: silent on a granted designation, a warning on one not granted, info when it is unstated', c => {
    const bla = c === 'bla_submission' ? { bla_pathway: '351a_novel' } : {};
    expect(fired(c, { ...bla, user_fee_paid: 'orphan_exempt', orphan_designation: 'granted' })).toBeUndefined();
    for (const od of ['applied', 'planned', 'refused', 'not_requested', 'not_applicable']) {
      expect(fired(c, { ...bla, user_fee_paid: 'orphan_exempt', orphan_designation: od })?.severity, od).toBe('warning');
    }
    expect(fired(c, { ...bla, user_fee_paid: 'orphan_exempt' })?.severity).toBe('info');
    expect(fired(c, { ...bla, user_fee_paid: 'orphan_exempt', orphan_designation: 'yes' })?.severity).toBe('info');
  });

  it('a 351(k) biosimilar is told BsUFA holds no orphan exemption, even with a grant', () => {
    const issue = fired('bla_submission', { bla_pathway: '351k_biosimilar', user_fee_paid: 'orphan_exempt', orphan_designation: 'granted' });
    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toMatch(/BsUFA, which holds no orphan exemption/);
  });

  it.each(FLOWS)('%s: silent on a payment, a waiver, or no claim at all', c => {
    for (const v of ['paid', 'waiver_granted', 'not_paid', true, false]) {
      expect(fired(c, { user_fee_paid: v, orphan_designation: 'not_requested' }), String(v)).toBeUndefined();
    }
  });
});

describe('the war game says the same', () => {
  const fee = (category: 'nda' | 'bla', flow: FlowCategory, answers: Record<string, unknown>) =>
    runWarGame(category, def(flow).id, { n: answers }).findings.find(f => /user_fee/.test(f.id));

  it('NDA: a supported exemption, a payment or a waiver is no finding', () => {
    for (const v of ['paid', 'waiver_granted', true]) expect(fee('nda', 'nda_submission', { user_fee_paid: v }), String(v)).toBeUndefined();
    expect(fee('nda', 'nda_submission', { user_fee_paid: 'orphan_exempt', orphan_designation: 'granted' })).toBeUndefined();
  });

  it('NDA: an exemption without a grant is critical; with an unconfirmed one, a warning', () => {
    const notGranted = fee('nda', 'nda_submission', { user_fee_paid: 'orphan_exempt', orphan_designation: 'applied' });
    expect(notGranted?.severity).toBe('critical');
    expect(notGranted?.requirement).toMatch(/attaches only to a granted designation/);
    expect(fee('nda', 'nda_submission', { user_fee_paid: 'orphan_exempt' })?.severity).toBe('warning');
  });

  it('NDA: not yet paid with a grant is still the info it was', () => {
    expect(fee('nda', 'nda_submission', { user_fee_paid: 'not_paid', orphan_designation: 'granted' })?.severity).toBe('info');
    expect(fee('nda', 'nda_submission', { user_fee_paid: 'not_paid', orphan_designation: 'not_requested' })?.severity).toBe('critical');
  });

  it('BLA: an exemption claimed on a 351(k) biosimilar is a warning; a supported 351(a) one is none', () => {
    expect(fee('bla', 'bla_submission', { bla_pathway: '351k_biosimilar', user_fee_paid: 'orphan_exempt', orphan_designation: 'granted' })?.severity).toBe('warning');
    expect(fee('bla', 'bla_submission', { bla_pathway: '351a_novel', user_fee_paid: 'orphan_exempt', orphan_designation: 'granted' })).toBeUndefined();
  });
});
