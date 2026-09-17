/**
 * Tests — stopping a run abandons the tool in flight, and still accounts for it.
 *
 * ── The gap ───────────────────────────────────────────────────────────────────
 * Every control was read at one place: the agentic loop's round-boundary
 * checkpoint. A stop pressed during a forty-second document search did nothing
 * until that search finished. The UI was honest about it — "Paused after this
 * step" — but honest is not the same as useful.
 *
 * `abortRace` is what makes the ROUND stop waiting. It cannot stop the handler:
 * a promise already in flight has no cancel, so a handler that ignores its
 * signal keeps running and settles into a void. That limit is why the cancelled
 * result says the step was STOPPED rather than that it was undone — some will
 * have finished their work, and the honest record is that we stopped waiting
 * for the answer.
 *
 * ── The accounting rule ───────────────────────────────────────────────────────
 * `runAgenticToolLoop` requires one ToolResultEntry per ToolCall, and the
 * grounding corpus is built from those entries — it is supposed to contain
 * exactly what the model saw. Dropping a cancelled step makes it a step that
 * silently never happened, which is the "error rendered as an empty result"
 * the working agreement forbids. The executor that returned `[]` on abort is
 * the shape this guards against.
 */

import { describe, it, expect } from 'vitest';
import {
  abortRace,
  ToolRunCancelled,
  CANCELLED_TOOL_RESULT,
} from '../agentic-loop.js';

/** A handler that never settles on its own — only the race can end it. */
function neverSettles(): Promise<string> {
  return new Promise<string>(() => {});
}

describe('abortRace', () => {
  it('rejects as soon as the run is cancelled', async () => {
    const controller = new AbortController();
    const raced = Promise.race([neverSettles(), abortRace(controller.signal)]);
    controller.abort();
    await expect(raced).rejects.toBeInstanceOf(ToolRunCancelled);
  });

  it('rejects immediately when the run was already cancelled', async () => {
    // A step that had not started when the stop arrived must not be dispatched
    // at all.
    const controller = new AbortController();
    controller.abort();
    await expect(
      Promise.race([neverSettles(), abortRace(controller.signal)]),
    ).rejects.toBeInstanceOf(ToolRunCancelled);
  });

  it('lets a handler that finishes first win', async () => {
    const controller = new AbortController();
    const result = await Promise.race([
      Promise.resolve('the answer'),
      abortRace(controller.signal),
    ]);
    expect(result).toBe('the answer');
  });

  it('never settles without a signal, so an uncontrolled run is unchanged', async () => {
    const sentinel = Symbol('still running');
    const outcome = await Promise.race([
      abortRace(undefined),
      new Promise(resolve => setTimeout(() => resolve(sentinel), 10)),
    ]);
    expect(outcome).toBe(sentinel);
  });

  it('does not reject on a signal that never fires', async () => {
    const controller = new AbortController();
    const sentinel = Symbol('still running');
    const outcome = await Promise.race([
      abortRace(controller.signal),
      new Promise(resolve => setTimeout(() => resolve(sentinel), 10)),
    ]);
    expect(outcome).toBe(sentinel);
  });
});

describe('the cancelled result', () => {
  it('names the tool and says the person stopped it', () => {
    const body = CANCELLED_TOOL_RESULT('search_document');
    expect(body.cancelled).toBe(true);
    expect(body.tool).toBe('search_document');
    expect(body.note).toContain('stopped this run');
  });

  it('tells the model not to read it as the tool having no answer', () => {
    // An empty or missing result for a step the model asked for reads as a
    // tool with nothing to say, and the model draws a conclusion from that.
    expect(CANCELLED_TOOL_RESULT('lookup_fda_guidance').note).toContain(
      'Do not treat this as the tool having no answer',
    );
  });

  it('does not claim the work was undone', () => {
    // A handler that ignores its signal keeps running. Claiming the step was
    // reversed would be a statement we cannot support.
    const note = CANCELLED_TOOL_RESULT('save_document_to_vault').note;
    expect(note).not.toMatch(/undone|reverted|rolled back/i);
    expect(note).toContain('Nothing it would have produced was used');
  });
});

describe('a cancelled round still accounts for every call', () => {
  it('produces one result per call, never an empty round', async () => {
    // The loop's contract, and the grounding corpus's: the entries are
    // supposed to be exactly what the model saw. This mirrors what the stream
    // route's executeTools does per call.
    const controller = new AbortController();
    const calls = ['search_document', 'lookup_fda_guidance', 'list_open_tasks'];
    controller.abort();

    const entries = await Promise.all(
      calls.map(async name => {
        try {
          return await Promise.race([neverSettles(), abortRace(controller.signal)]);
        } catch (err) {
          if (err instanceof ToolRunCancelled) return JSON.stringify(CANCELLED_TOOL_RESULT(name));
          throw err;
        }
      }),
    );

    expect(entries).toHaveLength(calls.length);
    for (const [i, entry] of entries.entries()) {
      expect(entry, `call ${i} produced nothing`).toBeTruthy();
      expect(JSON.parse(entry as string).cancelled).toBe(true);
    }
  });
});
