/**
 * A field's `visibleWhen` must be judged against the SAME answers when the
 * question is rendered and when the answer is validated.
 *
 * `buildQuestionEvent` hides a field by evaluating its predicate over every
 * answer collected so far (`flattenAnswers(state.answers)`). `advanceFlow`
 * then validated the submitted answers with `validateAnswers(node, answers)`
 * — no prior answers — so the validator judged the same predicate over the
 * current node's answers alone. The two disagree whenever the predicate
 * reads a field from an EARLIER node:
 *
 *   • `neq` / `not_in` over an absent value is TRUE, so a field the renderer
 *     hid (the prior answer matched) is one the validator treats as visible
 *     and required. The user sees a question with no fields, submits `{}`,
 *     and gets "X is required" for a field that is not on screen. Nothing can
 *     be answered and nothing can be skipped: the flow is deadlocked.
 *   • `eq` / `in` over an absent value is FALSE, so a field the renderer
 *     SHOWED (the prior answer matched) is one the validator skips — a
 *     required field on screen passes validation blank.
 *
 * Both fail on the pre-fix engine, with a minimal two-node flow.
 */
import { describe, it, expect, vi } from 'vitest';

import type { FlowDefinition } from '../types.js';

const DEADLOCK_FLOW: FlowDefinition = {
  id: 'visible-when-deadlock-v1',
  category: 'cmc_specification',
  name: 'visibleWhen deadlock reproduction',
  description: 'Two nodes; the second node is entirely gated on the first node’s answer.',
  clientTypes: [],
  entryNode: 'mode_node',
  sections: [{ id: 's', label: 'S', nodeIds: ['mode_node', 'detail_node'] }],
  nodes: [
    {
      id: 'mode_node',
      section: 'S',
      question: 'Which mode?',
      fields: [
        {
          id: 'mode',
          label: 'Mode',
          type: 'select',
          required: true,
          options: [
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
          ],
        },
      ],
      defaultNext: 'detail_node',
    },
    {
      id: 'detail_node',
      section: 'S',
      question: 'Details for the chosen mode.',
      fields: [
        {
          id: 'detail_unless_x',
          label: 'Detail unless X',
          type: 'text',
          required: true,
          visibleWhen: { field: 'mode', operator: 'neq', value: 'x' },
        },
        {
          id: 'detail_if_y',
          label: 'Detail if Y',
          type: 'text',
          required: true,
          visibleWhen: { field: 'mode', operator: 'eq', value: 'y' },
        },
      ],
      defaultNext: null,
    },
  ],
};

vi.mock('../flows/index.js', () => ({
  getFlowDefinition: () => DEADLOCK_FLOW,
  getAvailableFlows: () => [],
  resolveFlowCategory: () => 'cmc_specification',
}));

import { startFlow, advanceFlow } from '../engine.js';

const CTX = { organizationId: 1, userId: 1, projectId: null };

describe('visibleWhen over a prior node’s answer — render and validation agree', () => {
  it('a node whose every field is hidden can be passed with an empty answer (no deadlock)', () => {
    const started = startFlow('cmc_specification', CTX);
    const afterMode = advanceFlow(started.state, 'mode_node', { mode: 'x' }, CTX);

    // The renderer hid both fields: `neq x` is false and `eq y` is false.
    expect(afterMode.event?.node.id).toBe('detail_node');
    expect(afterMode.event?.node.fields).toEqual([]);

    // The only possible submission for a field-less question is `{}`.
    const result = advanceFlow(afterMode.state, 'detail_node', {}, CTX);
    const validationIssues = (result.event?.newIssues ?? []).filter(i => i.checkId.startsWith('validation_'));

    expect(
      validationIssues,
      `validator demanded fields the renderer hid: ${validationIssues.map(i => i.checkId).join(', ')}`,
    ).toEqual([]);
    expect(result.completeEvent).not.toBeNull();
    expect(result.state.complete).toBe(true);
  });

  it('a required field the renderer SHOWS because of a prior answer is still validated', () => {
    const started = startFlow('cmc_specification', CTX);
    const afterMode = advanceFlow(started.state, 'mode_node', { mode: 'y' }, CTX);

    // Both fields are on screen: `neq x` is true and `eq y` is true.
    expect(afterMode.event?.node.fields.map(f => f.id)).toEqual(['detail_unless_x', 'detail_if_y']);

    const result = advanceFlow(afterMode.state, 'detail_node', {}, CTX);
    const validationIds = (result.event?.newIssues ?? [])
      .filter(i => i.checkId.startsWith('validation_'))
      .map(i => i.checkId)
      .sort();

    expect(result.completeEvent).toBeNull();
    expect(validationIds).toEqual(['validation_detail_if_y', 'validation_detail_unless_x']);
  });
});
