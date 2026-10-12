/**
 * A question two answers decide, and the notified body that was asked of the
 * wrong programmes (2026-10-12 review, deferred there with its reason).
 *
 * ── What one predicate could not say ────────────────────────────────────────
 * `notified_body` was gated on `eu_mdr_class neq 'na'`. A DIAGNOSTICS
 * programme is not asked its MDR class at all — it is classified under the
 * IVDR, which is the next question — so the answer was absent, `neq 'na'` read
 * TRUE, and the question was asked of every diagnostics programme with nothing
 * behind it. Meanwhile the programme that HAD stated an IVDR class, and whose
 * Class B, C or D route IS a notified body's assessment, was never asked on
 * that basis.
 *
 * The gate the question actually has is: an MDR class other than "no EU filing
 * planned", OR an IVDR class. One field and one operator cannot express it, so
 * the predicate language gained `anyOf` / `allOf` — in the ONE evaluator the
 * engine, the validator and the card all use, so a composite gate is decided
 * the same way in all three.
 */
import { describe, expect, it } from 'vitest';

import { evaluatePredicate, predicateFieldIds } from '@shared/ana/question-predicate';
import type { QuestionPredicate } from '@shared/types/intelligence-questions';
import type { FlowEngineContext, FlowState } from '../types.js';
import { advanceFlow } from '../engine.js';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null, clientType: 'medtech' };

const state = (productType: string): FlowState => ({
  flowId: 'project-setup-v1',
  flowCategory: 'project_setup',
  currentNodeId: 'device_classification',
  answers: { regulatory_targets: { product_type: productType, primary_regulatory_agency: 'EU' } },
  completedNodes: [],
  issues: [],
  startedAt: '2026-10-12T00:00:00.000Z',
  complete: false,
  sectionProgress: {},
});

/** Whether the notified-body question is drawn after these classification answers. */
const asksNotifiedBody = (productType: string, answers: Record<string, unknown>): boolean => {
  const result = advanceFlow(state(productType), 'device_classification', answers, CTX);
  const refused = (result.event?.newIssues ?? []).filter(i => i.checkId.startsWith('validation_'));
  expect(refused.map(i => i.message), 'the answers must be accepted for this to mean anything').toEqual([]);
  expect(result.event?.node.id, 'and the next question must be the one that holds it').toBe('medtech_regulatory');
  return result.event!.node.fields.some(f => f.id === 'notified_body');
};

describe('the notified-body question', () => {
  it('is asked of a device programme that stated an MDR class', () => {
    expect(asksNotifiedBody('medical_device', { device_class: 'class_ii', eu_mdr_class: 'class_iib' })).toBe(true);
  });

  it('is NOT asked where no EU filing is planned', () => {
    expect(asksNotifiedBody('medical_device', { device_class: 'class_ii', eu_mdr_class: 'na' })).toBe(false);
  });

  it('is NOT asked where neither class was stated', () => {
    /* The defect: `neq 'na'` over an absent answer read TRUE. */
    expect(asksNotifiedBody('medical_device', { device_class: 'class_ii' })).toBe(false);
  });

  it('IS asked of a diagnostics programme that stated an IVDR class', () => {
    /* Its Class B, C and D routes are a notified body's assessment, and it was
       never asked on that basis before. */
    expect(asksNotifiedBody('diagnostic', { device_class: 'class_ii', ivdr_class: 'C' })).toBe(true);
  });

  it('is NOT asked of a diagnostics programme that stated no IVDR class', () => {
    /* The same programmes that WERE all asked, for no reason. */
    expect(asksNotifiedBody('diagnostic', { device_class: 'class_ii' })).toBe(false);
  });

  it('says which classes a notified body actually assesses, and for which it is the aspect alone', () => {
    const result = advanceFlow(
      state('medical_device'),
      'device_classification',
      { device_class: 'class_ii', eu_mdr_class: 'class_i' },
      CTX,
    );
    const field = result.event!.node.fields.find(f => f.id === 'notified_body')!;
    expect(field.helpText).toMatch(/Class IIa, IIb and III/);
    expect(field.helpText, 'and the IVDR side').toMatch(/Class B, C and D/);
    expect(field.helpText, 'Class I: the aspect alone').toMatch(/sterile, has a measuring function/);
    expect(field.helpText).toMatch(/Art 52\(7\)/);
  });
});

describe('the predicate language the gate needed', () => {
  const values = { a: 'x', b: '', c: ['one'] };

  it('anyOf holds when one of them holds', () => {
    expect(evaluatePredicate({ anyOf: [{ field: 'a', operator: 'eq', value: 'no' }, { field: 'a', operator: 'eq', value: 'x' }] }, values)).toBe(true);
    expect(evaluatePredicate({ anyOf: [{ field: 'a', operator: 'eq', value: 'no' }] }, values)).toBe(false);
  });

  it('allOf holds only when every one does', () => {
    const both: QuestionPredicate = {
      allOf: [
        { field: 'a', operator: 'exists', value: true },
        { field: 'a', operator: 'neq', value: 'na' },
      ],
    };
    expect(evaluatePredicate(both, values)).toBe(true);
    expect(evaluatePredicate(both, { a: 'na' })).toBe(false);
    expect(evaluatePredicate(both, {}), 'absent, which is the case that was wrong').toBe(false);
  });

  it('nests, because the gate that needed it does', () => {
    const gate: QuestionPredicate = {
      anyOf: [
        { allOf: [{ field: 'a', operator: 'exists', value: true }, { field: 'a', operator: 'neq', value: 'na' }] },
        { field: 'c', operator: 'exists', value: true },
      ],
    };
    expect(evaluatePredicate(gate, { a: 'na' }), 'the first arm fails').toBe(false);
    expect(evaluatePredicate(gate, { a: 'na', c: ['one'] }), 'the second carries it').toBe(true);
  });

  it('is NOT satisfied by a group nobody wrote', () => {
    /* `every` over an empty list is true, so an empty allOf would have opened
       every gate written that way. */
    expect(evaluatePredicate({}, values)).toBe(false);
    expect(evaluatePredicate({ anyOf: [] }, values)).toBe(false);
    expect(evaluatePredicate({ allOf: [] }, values)).toBe(false);
  });

  it('names every field it reads, so the engine can tell an own-node gate', () => {
    expect(predicateFieldIds({ field: 'a', operator: 'exists', value: true })).toEqual(['a']);
    expect(
      predicateFieldIds({
        anyOf: [{ allOf: [{ field: 'a', operator: 'exists', value: true }] }, { field: 'c', operator: 'exists', value: true }],
      }),
    ).toEqual(['a', 'c']);
  });
});
