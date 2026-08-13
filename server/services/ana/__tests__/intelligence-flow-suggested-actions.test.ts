/**
 * Post-flow suggested actions must not be dead affordances.
 *
 * The cer_report completion used to suggest actionTypes generate_cer /
 * generate_lit_search, which no handler anywhere implemented — a suggestion
 * the model could only fail to act on. The suggested actions relayed to the
 * model now name REAL registered AnA tools (generate_document handles
 * document_type 'cer'; search_literature + record_literature run and persist
 * the systematic search), which this test pins by resolving each suggested
 * actionType against the live handler registry.
 */
import { describe, it, expect } from 'vitest';

import { startFlow, advanceFlow } from '../intelligence-questions/engine.js';
import { getToolHandler } from '../AnaToolExecutor';

const CTX = {
  organizationId: 1,
  userId: 1,
  projectId: null,
  clientType: 'medtech' as const,
};

/** Synthesize a validation-passing answer for one field. */
function answerFor(field: any): unknown {
  switch (field.type) {
    case 'select':
    case 'radio':
      return field.options?.[0]?.value ?? 'option';
    case 'multi_select':
      return [field.options?.[0]?.value ?? 'option'];
    case 'yes_no':
      return 'yes';
    case 'checkbox':
      return true;
    case 'number':
      return field.validation?.min ?? 1;
    case 'date':
      return '2026-01-01';
    case 'country_select':
    case 'agency_select':
      return field.options?.[0]?.value ?? 'EU';
    default: {
      const minLength = field.validation?.minLength ?? 0;
      const base = `Test answer for ${field.label}`;
      return base.padEnd(minLength, '.');
    }
  }
}

/** Drive the cer_report flow to completion, answering every question. */
function completeCerFlow() {
  const started = startFlow('cer_report', CTX);
  let state = started.state;
  let event: any = started.event;
  for (let i = 0; i < 100; i++) {
    const answers = Object.fromEntries(
      (event.node.fields ?? []).map((f: any) => [f.id, answerFor(f)]),
    );
    const result = advanceFlow(state, event.node.id, answers, CTX);
    if (result.completeEvent) return result.completeEvent;
    if (result.event?.node?.id === event.node.id) {
      throw new Error(
        `Flow stalled on node "${event.node.id}" — validation rejected the synthesized ` +
          `answers: ${JSON.stringify(result.event?.newIssues ?? [])}`,
      );
    }
    state = result.state;
    event = result.event;
  }
  throw new Error('cer_report flow did not complete within 100 steps');
}

describe('cer_report post-flow suggested actions', () => {
  const completion = completeCerFlow();

  it('completes and suggests actions', () => {
    expect(completion).toBeTruthy();
    expect(completion.suggestedActions.length).toBeGreaterThan(0);
  });

  it('names only actionTypes that resolve to registered tool handlers', () => {
    const dead = completion.suggestedActions
      .map((a: { actionType: string }) => a.actionType)
      .filter((t: string) => typeof getToolHandler(t) !== 'function');
    expect(dead, `suggested actionTypes without a registered handler: ${dead.join(', ')}`).toEqual(
      [],
    );
  });

  it('no longer advertises the dead generate_cer / generate_lit_search labels', () => {
    const types = completion.suggestedActions.map((a: { actionType: string }) => a.actionType);
    expect(types).not.toContain('generate_cer');
    expect(types).not.toContain('generate_lit_search');
  });
});
