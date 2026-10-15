/**
 * What a model wrote inside a piece of work: a tool call's own generations
 * (2026-10-04, AnA reasoning).
 *
 * AnA's answer check (services/ana/answer-grounding.ts) credits a figure, an
 * identifier or a quote when it appears in a source of the turn. A tool whose
 * handler asks a model to write part of its result (batch drafting, a drafting
 * council, a plan narration) returns that model's words as if they were data,
 * so an invented number the inner model wrote, repeated by AnA, would read as
 * found. A list of "model-written" tools would only be a claim about them, and
 * drift with every new tool. The gateway knows at run time: the stream opens a
 * capture around each tool handler, `gateway.route()` notes every generation
 * that succeeds inside it, and the check does not credit what was noted.
 *
 * AsyncLocalStorage, like the run scope (run-scope.ts) and the sub-agent
 * refusal scope (model-call-scope.ts), and with their capture hazard: work a
 * tool hands to a pool whose callback runs in another context is not noted,
 * and a long-lived resource first started inside a capture keeps noting into
 * it. Nothing a tool reaches does either today.
 *
 * ── What it does not cover ───────────────────────────────────────────────────
 * Generations through `route()`, which every generation entry point goes
 * through. Model egress outside it (scripts/ci/gateway-bypass-baseline.json)
 * is not noted: a reranker reorders and writes nothing; the LiteLLM branch is
 * off unless a deploy sets it, and refuses to boot in production without an
 * acknowledgement.
 *
 * @module server/services/ai-gateway/generation-capture
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** The generations noted in one capture. */
export interface GenerationCapture {
  /** Generations that succeeded inside the capture. */
  calls: number;
  /** What each wrote: its text, then any tool calls it chose, as JSON. */
  texts: string[];
  /**
   * More was written than the capture keeps. The caller cannot then tell
   * what the model wrote from what it did not, and must not credit the
   * result at all.
   */
  overflow: boolean;
  /** Characters kept. */
  chars: number;
  /** The capture this one was opened inside: it is noted there too. */
  parent?: GenerationCapture;
}

/** What one capture keeps, at most. A tool result the model would read is far smaller. */
export const GENERATION_CAPTURE_MAX_CHARS = 400_000;

const store = new AsyncLocalStorage<GenerationCapture>();

export function newGenerationCapture(): GenerationCapture {
  return { calls: 0, texts: [], overflow: false, chars: 0 };
}

/** Run `fn` noting into `capture` every generation it makes, directly or later. */
export function runCapturingGenerations<T>(capture: GenerationCapture, fn: () => T): T {
  const outer = store.getStore();
  if (outer && outer !== capture) capture.parent = outer;
  return store.run(capture, fn);
}

/** The text a generation produced: its content, then the tool calls it chose. */
function writtenBy(response: { content?: unknown; toolUses?: unknown }): string {
  const parts: string[] = [];
  if (typeof response.content === 'string' && response.content) parts.push(response.content);
  if (Array.isArray(response.toolUses) && response.toolUses.length > 0) {
    parts.push(JSON.stringify(response.toolUses.map((t) => (t as { input?: unknown })?.input ?? null)));
  }
  return parts.join('\n');
}

/** A generation succeeded here. Noted into the capture in force and every capture around it. */
export function noteGeneration(response: { content?: unknown; toolUses?: unknown }): void {
  const text = writtenBy(response);
  for (let c = store.getStore(); c; c = c.parent) {
    c.calls++;
    if (!text) continue;
    if (c.chars + text.length > GENERATION_CAPTURE_MAX_CHARS) {
      c.overflow = true;
      continue;
    }
    c.texts.push(text);
    c.chars += text.length;
  }
}
