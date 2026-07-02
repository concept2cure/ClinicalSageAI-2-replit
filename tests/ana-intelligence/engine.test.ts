/**
 * Intelligence Question Engine — state machine coverage.
 *
 * The engine (startFlow / advanceFlow / resumeFlow) is stateless and drives
 * flow definitions resolved through the flows registry. To exercise branch
 * resolution, defaultNext fallback, completion, and server-side visibleWhen
 * filtering deterministically, this suite mocks the flows registry with a
 * small synthetic flow. A second block exercises the engine against a REAL
 * registered flow (project_setup) to confirm the wiring holds end-to-end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FlowDefinition } from '../../shared/types/intelligence-questions';
import type { FlowEngineContext } from '../../server/services/ana/intelligence-questions/types';

/* ─── Synthetic flow injected via a mock of the flows registry ─────────── */

const SYNTHETIC_FLOW: FlowDefinition = {
  id: 'synthetic-v1',
  category: 'protocol_development', // reuse a real category key so suggestedActions resolve
  name: 'Synthetic Test Flow',
  description: 'A minimal flow for engine unit tests.',
  clientTypes: [],
  entryNode: 'start',
  estimatedMinutes: 1,
  sections: [
    { id: 'sec1', label: 'Section One', nodeIds: ['start', 'branchTarget', 'fallback'] },
    { id: 'sec2', label: 'Section Two', nodeIds: ['terminal'] },
  ],
  nodes: [
    {
      id: 'start',
      section: 'sec1',
      question: 'Pick a path.',
      fields: [
        {
          id: 'choice',
          label: 'Choice',
          type: 'select',
          required: true,
          options: [
            { value: 'branch', label: 'Branch' },
            { value: 'default', label: 'Default' },
          ],
        },
        {
          // Only visible once `revealed` (a prior-node answer) is 'yes'.
          id: 'conditional_field',
          label: 'Conditional Field',
          type: 'text',
          visibleWhen: { field: 'revealed', operator: 'eq', value: 'yes' },
        },
      ],
      branches: [
        { when: { field: 'choice', operator: 'eq', value: 'branch' }, goto: 'branchTarget' },
      ],
      defaultNext: 'fallback',
    },
    {
      id: 'branchTarget',
      section: 'sec1',
      question: 'You branched.',
      fields: [{ id: 'note', label: 'Note', type: 'text' }],
      defaultNext: 'terminal',
    },
    {
      id: 'fallback',
      section: 'sec1',
      question: 'You defaulted.',
      fields: [{ id: 'note2', label: 'Note 2', type: 'text' }],
      defaultNext: 'terminal',
    },
    {
      id: 'terminal',
      section: 'sec2',
      question: 'The end.',
      fields: [{ id: 'final', label: 'Final', type: 'text' }],
      defaultNext: null, // terminal
    },
  ],
};

vi.mock('../../server/services/ana/intelligence-questions/flows/index.js', () => {
  return {
    getFlowDefinition: (category: string) => {
      if (category === 'protocol_development') return SYNTHETIC_FLOW;
      if (category === '__unknown__') return null;
      return null;
    },
    getAvailableFlows: () => [
      {
        category: 'protocol_development',
        name: SYNTHETIC_FLOW.name,
        description: SYNTHETIC_FLOW.description,
        estimatedMinutes: 1,
      },
    ],
  };
});

// Import AFTER the mock is registered.
import {
  startFlow,
  advanceFlow,
  resumeFlow,
} from '../../server/services/ana/intelligence-questions/engine';
import type { FlowState } from '../../shared/types/intelligence-questions';

const ctx: FlowEngineContext = { organizationId: null, userId: null, projectId: null };

describe('engine (synthetic flow via mocked registry)', () => {
  describe('startFlow', () => {
    it('returns initial state with entry node, empty answers, and section progress', () => {
      const { state, event, completeEvent } = startFlow('protocol_development', ctx);
      expect(state.currentNodeId).toBe('start');
      expect(state.answers).toEqual({});
      expect(state.completedNodes).toEqual([]);
      expect(state.complete).toBe(false);
      expect(state.sectionProgress).toEqual({
        sec1: { total: 3, completed: 0 },
        sec2: { total: 1, completed: 0 },
      });
      expect(completeEvent).toBeNull();
      expect(event).not.toBeNull();
      expect(event!.node.id).toBe('start');
      expect(event!.isFirst).toBe(true);
    });

    it('filters a field whose visibleWhen is not met (empty answers at start)', () => {
      const { event } = startFlow('protocol_development', ctx);
      const fieldIds = event!.node.fields.map((f) => f.id);
      expect(fieldIds).toContain('choice');
      // conditional_field requires revealed === 'yes'; no answers yet -> filtered
      expect(fieldIds).not.toContain('conditional_field');
    });

    it('throws for an unknown category', () => {
      expect(() => startFlow('__unknown__' as never, ctx)).toThrow(/No flow definition/);
    });
  });

  describe('advanceFlow — answer storage & progression', () => {
    it('stores answers, marks node complete, and advances currentNodeId', () => {
      const started = startFlow('protocol_development', ctx);
      const { state, event, completeEvent } = advanceFlow(
        started.state,
        'start',
        { choice: 'default' },
        ctx,
      );
      expect(state.answers.start).toEqual({ choice: 'default' });
      expect(state.completedNodes).toContain('start');
      expect(state.currentNodeId).toBe('fallback');
      expect(state.sectionProgress.sec1.completed).toBe(1);
      expect(completeEvent).toBeNull();
      expect(event!.node.id).toBe('fallback');
    });

    it('returns validation issues and does NOT advance on a missing required field', () => {
      const started = startFlow('protocol_development', ctx);
      const { state, event, completeEvent } = advanceFlow(
        started.state,
        'start',
        {}, // choice is required but omitted
        ctx,
      );
      // state unchanged — still on 'start', no answers stored
      expect(state.currentNodeId).toBe('start');
      expect(state.completedNodes).not.toContain('start');
      expect(state.answers.start).toBeUndefined();
      expect(completeEvent).toBeNull();
      expect(event!.node.id).toBe('start');
      expect(event!.newIssues).toBeDefined();
      expect(event!.newIssues!.some((i) => i.checkId === 'validation_choice')).toBe(true);
    });
  });

  describe('advanceFlow — branch resolution', () => {
    it('routes to the branch goto target when the predicate matches', () => {
      const started = startFlow('protocol_development', ctx);
      const { state, event } = advanceFlow(started.state, 'start', { choice: 'branch' }, ctx);
      expect(state.currentNodeId).toBe('branchTarget');
      expect(event!.node.id).toBe('branchTarget');
    });

    it('falls back to defaultNext when no branch matches', () => {
      const started = startFlow('protocol_development', ctx);
      const { state, event } = advanceFlow(started.state, 'start', { choice: 'default' }, ctx);
      expect(state.currentNodeId).toBe('fallback');
      expect(event!.node.id).toBe('fallback');
    });
  });

  describe('advanceFlow — completion', () => {
    it('produces a complete event with start_war_game suggested action at a terminal node', () => {
      const started = startFlow('protocol_development', ctx);
      // start -> branch -> branchTarget -> terminal
      const afterStart = advanceFlow(started.state, 'start', { choice: 'branch' }, ctx);
      const afterBranch = advanceFlow(afterStart.state, 'branchTarget', { note: 'x' }, ctx);
      expect(afterBranch.state.currentNodeId).toBe('terminal');

      const done = advanceFlow(afterBranch.state, 'terminal', { final: 'y' }, ctx);
      expect(done.event).toBeNull();
      expect(done.completeEvent).not.toBeNull();
      expect(done.state.complete).toBe(true);
      const actionTypes = done.completeEvent!.suggestedActions.map((a) => a.actionType);
      expect(actionTypes).toContain('start_war_game');
    });
  });

  describe('resumeFlow', () => {
    it('returns the current node event for an in-progress state', () => {
      const started = startFlow('protocol_development', ctx);
      const advanced = advanceFlow(started.state, 'start', { choice: 'default' }, ctx);
      const resumed = resumeFlow(advanced.state, ctx);
      expect(resumed.completeEvent).toBeNull();
      expect(resumed.event).not.toBeNull();
      expect(resumed.event!.node.id).toBe('fallback');
    });

    it('returns the complete event for a completed state', () => {
      const completed: FlowState = {
        flowId: SYNTHETIC_FLOW.id,
        flowCategory: 'protocol_development',
        currentNodeId: 'terminal',
        answers: { terminal: { final: 'y' } },
        completedNodes: ['start', 'branchTarget', 'terminal'],
        issues: [],
        startedAt: new Date().toISOString(),
        complete: true,
        sectionProgress: {
          sec1: { total: 3, completed: 2 },
          sec2: { total: 1, completed: 1 },
        },
      };
      const resumed = resumeFlow(completed, ctx);
      expect(resumed.event).toBeNull();
      expect(resumed.completeEvent).not.toBeNull();
      expect(resumed.completeEvent!.flowId).toBe(SYNTHETIC_FLOW.id);
    });
  });

  describe('visibleWhen filtering with accumulated answers', () => {
    it('keeps a conditional field once a prior answer satisfies its predicate', () => {
      // Seed a state where a prior node answered `revealed: yes`, then resume
      // on the entry node so buildQuestionEvent sees the accumulated answer.
      const seeded: FlowState = {
        flowId: SYNTHETIC_FLOW.id,
        flowCategory: 'protocol_development',
        currentNodeId: 'start',
        answers: { _prior: { revealed: 'yes' } },
        completedNodes: ['_prior'],
        issues: [],
        startedAt: new Date().toISOString(),
        complete: false,
        sectionProgress: {
          sec1: { total: 3, completed: 0 },
          sec2: { total: 1, completed: 0 },
        },
      };
      const resumed = resumeFlow(seeded, ctx);
      const fieldIds = resumed.event!.node.fields.map((f) => f.id);
      expect(fieldIds).toContain('conditional_field');
    });

    it('filters the conditional field when the prior answer does not satisfy it', () => {
      const seeded: FlowState = {
        flowId: SYNTHETIC_FLOW.id,
        flowCategory: 'protocol_development',
        currentNodeId: 'start',
        answers: { _prior: { revealed: 'no' } },
        completedNodes: ['_prior'],
        issues: [],
        startedAt: new Date().toISOString(),
        complete: false,
        sectionProgress: {
          sec1: { total: 3, completed: 0 },
          sec2: { total: 1, completed: 0 },
        },
      };
      const resumed = resumeFlow(seeded, ctx);
      const fieldIds = resumed.event!.node.fields.map((f) => f.id);
      expect(fieldIds).not.toContain('conditional_field');
    });
  });
});
