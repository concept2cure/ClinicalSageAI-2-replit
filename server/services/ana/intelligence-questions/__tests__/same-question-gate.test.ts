/**
 * A field gated on an answer in its own question (2026-10-12 review).
 *
 * `buildQuestionEvent` filtered every `visibleWhen` over the answers given
 * BEFORE the question — which is all it can know — and dropped the rest. For a
 * field gated on an earlier question that is right. For a field gated on an
 * answer in its OWN question it is not: the person has not given that answer
 * yet, so the field was dropped at draw time while `validateAnswers` (which
 * evaluates over the submitted answers too) went on demanding it.
 *
 * The consequences were live:
 *   - `project_setup.additional_agencies`, gated on a yes/no in its own node,
 *     was never drawn at all — so `facts.regions` could only ever hold the one
 *     primary region, and a multi-country programme could not say so;
 *   - `project_setup.predicate_device`, gated on the route chosen in the same
 *     node (a node this directive's own work created), was never drawn either,
 *     so a person choosing a 510(k) was never asked for the predicate;
 *   - two `cmc_specification` fields were required AND gated on their own
 *     node's answers: hidden when drawn, demanded when submitted. Unanswerable.
 *
 * Such a field is now SENT with its predicate and decided by the card, with
 * the evaluator moved to `shared/ana/question-predicate.ts` so the two cannot
 * drift. These tests hold the engine's half.
 */
import { describe, expect, it } from 'vitest';

import { evaluatePredicate, predicateFieldIds } from '@shared/ana/question-predicate';
import type { FlowCategory, FlowEngineContext, FlowState, QuestionField } from '../types.js';
import { advanceFlow } from '../engine.js';
import { getAvailableFlows, getFlowDefinition } from '../flows/index.js';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null, clientType: 'medtech' };

const at = (
  flowCategory: FlowCategory,
  currentNodeId: string,
  answers: Record<string, Record<string, unknown>> = {},
): FlowState => ({
  flowId: `${flowCategory}-under-test`,
  flowCategory,
  currentNodeId,
  answers,
  completedNodes: [],
  issues: [],
  startedAt: '2026-10-12T00:00:00.000Z',
  complete: false,
  sectionProgress: {},
});

describe('the engine', () => {
  it('sends a field gated on its own question, with the gate intact', () => {
    const node = advanceFlow(
      at('project_setup', 'regulatory_targets', { product_details: { product_type: 'small_molecule' } }),
      'regulatory_targets',
      { primary_regulatory_agency: 'US' },
      { ...CTX, clientType: 'pharma' },
    );
    /* The node drawn next is the route question; the one we care about is the
       one just left, redrawn here to read its fields. */
    const targets = advanceFlow(
      { ...at('project_setup', 'regulatory_targets'), currentNodeId: 'regulatory_targets' },
      'regulatory_targets',
      {},
      { ...CTX, clientType: 'pharma' },
    ).event!.node;
    const additional = targets.fields.find(f => f.id === 'additional_agencies')!;
    expect(additional, 'never drawn at all before this').toBeDefined();
    expect(additional.visibleWhen).toEqual({ field: 'multi_country_submission', operator: 'eq', value: true });
    expect(node.event?.node.id).toBe('submission_route');
  });

  it('still decides a gate an earlier question answered', () => {
    const drawn = advanceFlow(
      at('project_setup', 'device_classification', {
        regulatory_targets: { primary_regulatory_agency: 'US', product_type: 'medical_device' },
      }),
      'device_classification',
      { device_class: 'class_ii', eu_mdr_class: 'na' },
      CTX,
    ).event!.node;
    expect(drawn.fields.find(f => f.id === 'notified_body'), 'the EU class said no EU filing').toBeUndefined();
  });

  it('leaves no required field unanswerable anywhere', () => {
    /* The shape that was a deadlock: required, and gated on a field in its own
       node. Every one of them is now drawn, so the validator's demand can be
       met. This walks every flow rather than the two that had it. */
    const ctx: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null };
    const undrawable: string[] = [];
    for (const listed of getAvailableFlows(ctx)) {
      const definition = getFlowDefinition(listed.category, ctx);
      for (const node of definition?.nodes ?? []) {
        const own = new Set(node.fields.map(f => f.id));
        for (const field of node.fields) {
          if (!field.required || !field.visibleWhen) continue;
          /* ANY leaf of a composite gate: the draw cannot settle it either
             way, so the field must still be sent. */
          if (!predicateFieldIds(field.visibleWhen).some(id => own.has(id))) continue;
          const drawn = advanceFlow(
            at(listed.category, node.id),
            node.id,
            {},
            ctx,
          ).event?.node.fields.some((f: QuestionField) => f.id === field.id);
          if (!drawn) undrawable.push(`${listed.category}.${node.id}.${field.id}`);
        }
      }
    }
    expect(undrawable, 'a required field the draw hides and the validator demands').toEqual([]);
  });
});

describe('the evaluator the card and the engine share', () => {
  it('is one function, with the yes/no coercion a card needs', () => {
    /* A yes_no answer reaches the card as 'yes'/'no' and a predicate names
       true/false; the card must coerce exactly as the server does, or a gated
       field would appear on one side and not the other. */
    expect(evaluatePredicate({ field: 'x', operator: 'eq', value: true }, { x: 'yes' })).toBe(true);
    expect(evaluatePredicate({ field: 'x', operator: 'eq', value: true }, { x: 'no' })).toBe(false);
    expect(evaluatePredicate({ field: 'x', operator: 'neq', value: 'na' }, {}), 'absent is not "na"').toBe(true);
    expect(evaluatePredicate({ field: 'x', operator: 'in', value: ['a', 'b'] }, { x: 'b' })).toBe(true);
    expect(evaluatePredicate({ field: 'x', operator: 'gt', value: 5 }, { x: '7' }), 'a tool sends strings').toBe(true);
  });
});
