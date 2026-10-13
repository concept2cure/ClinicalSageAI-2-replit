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
import { getAvailableFlows, getFlowDefinition } from '../flows/index.js';

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

describe('a composite gate may not span the question it is in and an earlier one', () => {
  it('holds for every composite gate in every flow', () => {
    /* The engine sends a field whose gate names ANY field in its own node and
       lets the card decide it. The card's `answers` hold THIS node's inputs
       only — never a prior node's — so a MIXED gate is decided three ways: the
       engine sends it, the card evaluates the prior leaf against `undefined`
       and hides it, and the validator evaluates the same leaf against its real
       value and demands it. That is the unanswerable question
       `same-question-gate` was written to end, reopened for mixed gates
       (2026-10-13 audit, F16).
       No mixed gate exists today, and this is what keeps it that way. */
    let composites = 0;
    const mixed: string[] = [];
    for (const listed of getAvailableFlows(CTX)) {
      const definition = getFlowDefinition(listed.category, CTX);
      const order = new Map((definition?.nodes ?? []).map((n, i) => [n.id, i]));
      for (const node of definition?.nodes ?? []) {
        const own = new Set(node.fields.map(f => f.id));
        for (const field of node.fields) {
          if (!field.visibleWhen || !('anyOf' in field.visibleWhen || 'allOf' in field.visibleWhen)) continue;
          composites += 1;
          const leaves = predicateFieldIds(field.visibleWhen);
          const inOwn = leaves.filter(id => own.has(id));
          const earlier = leaves.filter(
            id => !own.has(id) && [...order.keys()].some(n => order.get(n)! < order.get(node.id)!),
          );
          if (inOwn.length > 0 && earlier.length > 0) {
            mixed.push(`${listed.category}.${node.id}.${field.id}: own=${inOwn.join(',')} earlier=${earlier.join(',')}`);
          }
        }
      }
    }
    expect(composites, 'a scan over no composite gates proves nothing').toBeGreaterThan(0);
    expect(mixed, 'a composite gate the card and the validator would decide differently').toEqual([]);
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

  it('holds BOTH keys to the AND the doc comment promises', () => {
    /* Two optional keys usually read as OR, and this reads as AND. That is a
       deliberate, non-obvious choice and it had no test: rewriting the branch
       to OR left four suites and sixty tests green (2026-10-13 audit, F18). */
    const both: QuestionPredicate = {
      anyOf: [{ field: 'a', operator: 'eq', value: 'x' }],
      allOf: [{ field: 'b', operator: 'eq', value: 'y' }],
    };
    expect(evaluatePredicate(both, { a: 'x', b: 'y' }), 'both arms hold').toBe(true);
    expect(evaluatePredicate(both, { a: 'x' }), 'the allOf arm fails').toBe(false);
    expect(evaluatePredicate(both, { b: 'y' }), 'the anyOf arm fails').toBe(false);
  });

  it('refuses a predicate carrying both a field and a group', () => {
    /* The compiler accepts `{field, operator, value, anyOf: […]}` — a union of
       an interface and an all-optional one defeats excess-property checking —
       and the runtime read it as a field predicate and discarded the group in
       silence, hiding its leaves from the engine's own-node test. Half a gate
       is worse than either half (F17). */
    const hybrid = {
      field: 'a',
      operator: 'eq',
      value: 'x',
      anyOf: [{ field: 'b', operator: 'eq', value: 'y' }],
    } as unknown as QuestionPredicate;
    expect(() => evaluatePredicate(hybrid, { a: 'x' })).toThrow(/both a field .* and a group/);
    expect(() => predicateFieldIds(hybrid)).toThrow(/both a field .* and a group/);
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
