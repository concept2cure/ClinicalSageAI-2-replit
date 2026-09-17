/**
 * Run control — registry state machine + agentic-loop checkpoint integration.
 *
 * Guards the pause/interject/cancel primitives the streaming route relies on:
 * the registry's transitions and interjection queue, and that the loop honors a
 * checkpoint 'abort' (cancel) while a checkpoint side-effect (interjection) can
 * steer subsequent rounds.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { runControlRegistry, MAX_INTERJECTION_CHARS } from '../run-control-registry.js';
import {
  runAgenticToolLoop,
  type ToolCall,
  type ModelTurn,
} from '../agentic-loop.js';

describe('runControlRegistry', () => {
  beforeEach(() => runControlRegistry._resetForTest());

  it('registers a run as running and reports status', () => {
    runControlRegistry.register('run_1');
    expect(runControlRegistry.getStatus('run_1')).toBe('running');
    expect(runControlRegistry.has('run_1')).toBe(true);
    expect(runControlRegistry.getStatus('missing')).toBeNull();
  });

  it('pauses and resumes', () => {
    runControlRegistry.register('run_1');
    expect(runControlRegistry.requestPause('run_1')).toBe(true);
    expect(runControlRegistry.getStatus('run_1')).toBe('paused');
    expect(runControlRegistry.requestResume('run_1')).toBe(true);
    expect(runControlRegistry.getStatus('run_1')).toBe('running');
  });

  // ── The cancel signal: what makes a stop land mid-round ─────────────────
  //
  // Registry status alone is read at the round boundary, so a stop pressed
  // during a 40-second tool call did nothing until that call finished. The
  // signal is what the gateway and the tool dispatcher can be told to watch.

  it('hands out a cancel signal that is not yet aborted', () => {
    runControlRegistry.register('run_1');
    const signal = runControlRegistry.cancelSignal('run_1');
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
  });

  it('aborts the signal the moment cancel is requested', () => {
    runControlRegistry.register('run_1');
    const signal = runControlRegistry.cancelSignal('run_1')!;
    runControlRegistry.requestCancel('run_1');
    expect(signal.aborted).toBe(true);
  });

  it('a pause does NOT abort the signal', () => {
    // Deliberate: killing an in-flight tool to pause throws the work away and
    // then has to redo it. Pause holds at the boundary; stop is what cuts.
    runControlRegistry.register('run_1');
    const signal = runControlRegistry.cancelSignal('run_1')!;
    runControlRegistry.requestPause('run_1');
    expect(signal.aborted).toBe(false);
    runControlRegistry.requestResume('run_1');
    expect(signal.aborted).toBe(false);
  });

  it('a steer does NOT abort the signal', () => {
    runControlRegistry.register('run_1');
    const signal = runControlRegistry.cancelSignal('run_1')!;
    runControlRegistry.requestInterject('run_1', 'narrow to Class III');
    expect(signal.aborted).toBe(false);
  });

  it('gives each run its own signal', () => {
    // One shared controller would make any stop cancel every concurrent turn
    // in the process.
    runControlRegistry.register('run_1');
    runControlRegistry.register('run_2');
    const a = runControlRegistry.cancelSignal('run_1')!;
    const b = runControlRegistry.cancelSignal('run_2')!;
    runControlRegistry.requestCancel('run_1');
    expect(a.aborted).toBe(true);
    expect(b.aborted, 'cancelling one run stopped another').toBe(false);
  });

  it('has no signal for a run it does not know', () => {
    expect(runControlRegistry.cancelSignal('missing')).toBeNull();
  });

  it('cancel is terminal — pause/resume/interject are refused afterward', () => {
    runControlRegistry.register('run_1');
    expect(runControlRegistry.requestCancel('run_1')).toBe(true);
    expect(runControlRegistry.isCancelled('run_1')).toBe(true);
    expect(runControlRegistry.requestPause('run_1')).toBe(false);
    expect(runControlRegistry.requestResume('run_1')).toBe(false);
    expect(runControlRegistry.requestInterject('run_1', 'steer')).toBe(false);
  });

  it('queues and drains interjections, and resumes a paused run', () => {
    runControlRegistry.register('run_1');
    runControlRegistry.requestPause('run_1');
    expect(runControlRegistry.requestInterject('run_1', '  focus on safety  ')).toBe(true);
    // Interjecting resumes the paused run so the loop consumes the steer.
    expect(runControlRegistry.getStatus('run_1')).toBe('running');
    expect(runControlRegistry.snapshot('run_1')).toEqual({
      status: 'running',
      pendingInterjections: 1,
    });
    expect(runControlRegistry.consumeInterjections('run_1')).toEqual(['focus on safety']);
    expect(runControlRegistry.consumeInterjections('run_1')).toEqual([]);
  });

  it('rejects empty interjections and caps long ones', () => {
    runControlRegistry.register('run_1');
    expect(runControlRegistry.requestInterject('run_1', '   ')).toBe(false);
    const long = 'x'.repeat(MAX_INTERJECTION_CHARS + 500);
    expect(runControlRegistry.requestInterject('run_1', long)).toBe(true);
    expect(runControlRegistry.consumeInterjections('run_1')[0].length).toBe(
      MAX_INTERJECTION_CHARS,
    );
  });

  it('unknown runs return false / null across the API', () => {
    expect(runControlRegistry.requestPause('nope')).toBe(false);
    expect(runControlRegistry.requestCancel('nope')).toBe(false);
    expect(runControlRegistry.snapshot('nope')).toBeNull();
    expect(runControlRegistry.consumeInterjections('nope')).toEqual([]);
  });
});

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
