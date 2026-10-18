/**
 * The 510(k) interview asks what the device is compared to, before asking for
 * that device's name (founder's directive, 2026-10-12).
 *
 * `predicate_info` opens with three REQUIRED text boxes — the predicate's
 * name, its 510(k) number and its manufacturer — and the interview never asked
 * whether there is a predicate at all. A programme with none had to invent
 * one to get past the question, and the record would then carry a predicate
 * that does not exist, in a submission that is not a 510(k).
 *
 * These tests drive the real flow.
 */
import { describe, expect, it } from 'vitest';

import { predicateOptions } from '@shared/regulatory/predicate-positions';
import type { FlowEngineContext, FlowState } from '../types.js';
import { advanceFlow } from '../engine.js';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null, clientType: 'medtech' };

const at = (currentNodeId: string, answers: Record<string, Record<string, unknown>> = {}): FlowState => ({
  flowId: 'device-510k-v1',
  flowCategory: 'device_510k',
  currentNodeId,
  answers,
  completedNodes: [],
  issues: [],
  startedAt: '2026-10-12T00:00:00.000Z',
  complete: false,
  sectionProgress: {},
});

/** The strategy question as a person is drawn it. */
const drawn = () => {
  const result = advanceFlow(
    at('device_materials'),
    'device_materials',
    {
      patient_contacting_materials: 'Nitinol strut, PTFE graft, silicone coating on the distal tip.',
      latex_free: 'yes',
    },
    CTX,
  );
  expect(result.event?.node.id, 'the strategy question follows the device description').toBe('predicate_strategy');
  return result.event!.node;
};

const answerStrategy = (strategy: string) => advanceFlow(at('predicate_strategy'), 'predicate_strategy', { predicate_strategy: strategy }, CTX);

describe('the question', () => {
  it('is asked before the predicate’s name, number and manufacturer', () => {
    const node = drawn();
    expect(node.fields.map(f => f.id)).toEqual(['predicate_strategy']);
    expect(answerStrategy('single_predicate').event?.node.id).toBe('predicate_info');
  });

  it('offers the governed positions, each with its consequence and authority', () => {
    const field = drawn().fields[0];
    expect(field.options?.map(o => o.value)).toEqual(predicateOptions().map(o => o.value));
    for (const option of field.options!) {
      expect(option.commits, option.value).toBeTruthy();
      expect(option.authority, option.value).toBeTruthy();
    }
    expect(field.allowOther, 'a comparison the list does not hold is still answerable').toBeDefined();
  });
});

describe('a split predicate', () => {
  it('is recorded as the refusal it will draw, at critical', () => {
    const result = answerStrategy('split_predicate');
    const issues = result.event?.newIssues ?? [];
    const noted = issues.find(i => i.checkId === 'split_predicate_not_permitted')!;
    expect(noted, 'FDA does not accept a split predicate, and the record must say so').toBeDefined();
    expect(noted.severity).toBe('critical');
    expect(noted.message).toMatch(/not a permissible basis/);
    expect(noted.reference).toMatch(/Evaluating Substantial Equivalence/);
  });
});

describe('a programme with no predicate', () => {
  it('is told plainly that this is not a 510(k), and what the route is', () => {
    for (const strategy of ['no_predicate', 'nse_received']) {
      const issues = answerStrategy(strategy).event?.newIssues ?? [];
      const noted = issues.find(i => i.checkId === 'no_predicate_is_not_a_510k')!;
      expect(noted, strategy).toBeDefined();
      expect(noted.severity).toBe('critical');
      expect(noted.message).toMatch(/De Novo request/);
      expect(noted.reference).toMatch(/513\(f\)\(2\)\(A\)/);
    }
  });

  it('is not asked for the predicate it has just said does not exist', () => {
    const drawnNext = answerStrategy('no_predicate').event!.node;
    expect(drawnNext.id).toBe('predicate_info');
    const asked = drawnNext.fields.map(f => f.id);
    for (const field of ['predicate_device_name', 'predicate_510k_number', 'predicate_manufacturer', 'same_intended_use']) {
      expect(asked, field).not.toContain(field);
    }
  });

  it('is still asked for it when a predicate IS claimed', () => {
    const asked = answerStrategy('single_predicate').event!.node.fields.map(f => f.id);
    expect(asked).toContain('predicate_device_name');
    expect(asked).toContain('predicate_510k_number');
  });

  it('can get past the question without inventing one', () => {
    /* The three required boxes were the reason a programme with no predicate
       had to put something in them. */
    const result = advanceFlow(
      at('predicate_info', { predicate_strategy: { predicate_strategy: 'no_predicate' } }),
      'predicate_info',
      {},
      CTX,
    );
    const errors = (result.event?.newIssues ?? []).filter(i => i.checkId.startsWith('validation_'));
    expect(errors, 'a predicate that does not exist was demanded').toEqual([]);
    expect(result.event?.node.id).toBe('se_comparison');
  });
});
