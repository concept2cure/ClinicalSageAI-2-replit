/**
 * Post-flow suggested actions must not be dead affordances.
 *
 * The cer_report completion used to suggest actionTypes generate_cer /
 * generate_lit_search, which no handler anywhere implemented — a suggestion
 * the model could only fail to act on. That was one category of sixteen; the
 * other fifteen carried the same defect (generate_csr, assemble_ectd,
 * generate_cmc_module3, launch_dashboard, …: 30 actionTypes, none wired).
 *
 * Every suggested action of EVERY flow is now resolved against the live
 * handler registry, by calling the engine's own `buildSuggestedActions` over
 * each registered flow definition — no flow has to be driven to completion to
 * check what it will suggest at the end. The cer_report drive-through is kept
 * as the end-to-end sample so the wiring from completion event to suggestion
 * is exercised too.
 */
import { describe, it, expect } from 'vitest';

import { startFlow, advanceFlow, buildSuggestedActions } from '../intelligence-questions/engine.js';
import { getFlowDefinition } from '../intelligence-questions/flows/index.js';
import type { FlowCategory } from '../intelligence-questions/types.js';
import { getToolHandler } from '../AnaToolExecutor';

const CTX = {
  organizationId: 1,
  userId: 1,
  projectId: null,
  clientType: 'medtech' as const,
};

/** Every category the shared FlowCategory union names. */
const ALL_CATEGORIES: FlowCategory[] = [
  'protocol_development',
  'csr_report',
  'ind_submission',
  'nda_submission',
  'bla_submission',
  'sop_development',
  'device_510k',
  'device_pma',
  'cer_report',
  'briefing_book',
  'safety_narrative',
  'labeling',
  'risk_management',
  'cmc_specification',
  'stability_study',
  'project_setup',
];

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

describe('every flow’s suggested actions resolve to registered tool handlers', () => {
  // clientType null: the registry applies no client-type filter, so every
  // category resolves regardless of which client types it is written for.
  const lookupCtx = { organizationId: 1, userId: 1, projectId: null, clientType: null };

  it.each(ALL_CATEGORIES)('%s', (category) => {
    const definition = getFlowDefinition(category, lookupCtx);
    expect(definition, `no flow definition registered for ${category}`).toBeTruthy();

    const actions = buildSuggestedActions(definition!);
    expect(actions.length, `${category} suggests nothing`).toBeGreaterThan(0);

    const dead = actions
      .map(a => a.actionType)
      .filter(t => typeof getToolHandler(t) !== 'function');
    expect(dead, `${category} suggests actionTypes with no registered handler: ${dead.join(', ')}`).toEqual([]);
  });

  it('the CMC interview’s first suggestion is the register commit (commit_intelligence_flow)', () => {
    const definition = getFlowDefinition('cmc_specification', lookupCtx)!;
    const types = buildSuggestedActions(definition).map(a => a.actionType);
    expect(types[0]).toBe('commit_intelligence_flow');
    expect(typeof getToolHandler('commit_intelligence_flow')).toBe('function');
  });

  it('every flow still offers the War Game', () => {
    for (const category of ALL_CATEGORIES) {
      const definition = getFlowDefinition(category, lookupCtx)!;
      expect(buildSuggestedActions(definition).map(a => a.actionType)).toContain('start_war_game');
    }
  });
});
