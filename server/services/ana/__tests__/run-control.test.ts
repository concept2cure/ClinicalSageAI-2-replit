/**
 * The agentic loop honours a checkpoint.
 *
 * This file used to also test `run-control-registry.ts`'s in-memory state
 * machine. That registry is gone: control is now a row, so its rules are tested
 * where they live — the pure transitions in `run-status.test.ts`, and the
 * writes, the ownership rules and the atomic steer drain against a real
 * PostgreSQL in `run-control.pglite.integration.test.ts`.
 *
 * What stays here is the part that never depended on where control was stored:
 * the loop honours a checkpoint 'abort', a checkpoint side-effect can steer the
 * rounds that follow, and a loop given no checkpoint behaves exactly as before.
 * The loop core is pure orchestration and was not touched by the move to a
 * durable record — these three cases are the assertion that it was not.
 */
import { describe, it, expect } from 'vitest';
import {
  runAgenticToolLoop,
  type ToolCall,
  type ModelTurn,
} from '../agentic-loop.js';

function tool(name: string, input: Record<string, unknown> = {}): ToolCall {
  return { id: `${name}-${Math.random()}`, name, input };
}

describe('runAgenticToolLoop — checkpoint control', () => {
  it('aborts cleanly when the checkpoint returns abort (cancel)', async () => {
    let rounds = 0;
    const result = await runAgenticToolLoop(
      { text: 'start', toolCalls: [tool('search')] },
      {
        executeTools: async () => {
          rounds += 1;
          return [{ tool_use_id: 't', name: 'search', content: 'ok' }];
        },
        callModel: async (): Promise<ModelTurn> => ({ text: 'again', toolCalls: [tool('search')] }),
        // Cancel before the 2nd round runs.
        checkpoint: async (upcoming) => (upcoming >= 2 ? 'abort' : 'continue'),
      },
      { maxRounds: 5 },
    );
    expect(result.stoppedReason).toBe('cancelled');
    expect(result.rounds).toBe(1);
    expect(rounds).toBe(1); // the 2nd round's tools never ran
  });

  it('a checkpoint side-effect can steer subsequent rounds (interjection)', async () => {
    const steers: string[] = [];
    await runAgenticToolLoop(
      { text: 'start', toolCalls: [tool('search')] },
      {
        executeTools: async () => [{ tool_use_id: 't', name: 'search', content: 'ok' }],
        callModel: async (_r, _p, r): Promise<ModelTurn> => {
          // Stop after 2 rounds.
          return r >= 2 ? { text: 'done', toolCalls: [] } : { text: 'more', toolCalls: [tool('search')] };
        },
        checkpoint: async (upcoming) => {
          if (upcoming === 2) steers.push('injected'); // side-effect steer
          return 'continue';
        },
      },
      { maxRounds: 5 },
    );
    expect(steers).toEqual(['injected']);
  });

  it('runs uninterrupted when no checkpoint is provided (behavior unchanged)', async () => {
    const result = await runAgenticToolLoop(
      { text: 'start', toolCalls: [tool('a')] },
      {
        executeTools: async () => [{ tool_use_id: 't', name: 'a', content: 'ok' }],
        callModel: async (): Promise<ModelTurn> => ({ text: 'done', toolCalls: [] }),
      },
      { maxRounds: 3 },
    );
    expect(result.stoppedReason).toBe('no_more_tools');
    expect(result.rounds).toBe(1);
  });
});
