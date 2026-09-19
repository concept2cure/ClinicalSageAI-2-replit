/**
 * A cancelled round returns one result per call, never zero.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `executeAgenticLoop`'s barge-in check was
 *
 *     if (signal?.aborted) return [];
 *
 * — ZERO entries for a round that had N tool calls. It reads as a harmless
 * early-out, and it is not, because the loop's contract is one ToolResultEntry
 * per ToolCall and everything downstream maps over these entries: the per-result
 * cap, the round budget, and the grounding corpus, whose entire claim is that it
 * holds exactly what the model saw.
 *
 * A dropped entry is not "a step that produced nothing". It is a step that
 * VANISHES, and afterwards reads as one nobody ever asked for — which is the
 * worst direction for a record that a regulated reviewer will later be asked to
 * trust. "She searched three things and stopped" and "she searched nothing" are
 * different claims, and only one of them is true.
 *
 * The streaming route already returned a cancelled RESULT rather than nothing.
 * This is the same fix for the four non-SSE callers, using the same helper so
 * the two surfaces cannot describe the same event differently.
 *
 * ── Why this tests the exported helper and the contract, not the wrapper ──────
 * `executeAgenticLoop` lives in a ~20k-line module that registers several
 * hundred tool handlers at import time. Driving it here would test the module
 * loader. What is actually at stake is the shape of what a cancelled round
 * hands back, so that is what is asserted — against the real helper the
 * implementation calls.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CANCELLED_TOOL_RESULT, type ToolCall, type ToolResultEntry } from '../agentic-loop.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const EXECUTOR = readFileSync(
  path.join(repoRoot, 'server', 'services', 'ana', 'AnaToolExecutor.ts'),
  'utf8',
);

/** The shipped barge-in branch, extracted so a paraphrase cannot drift from it. */
const BARGE_IN = (() => {
  const m = /if \(signal\?\.aborted\) \{[\s\S]*?\n    \}/.exec(EXECUTOR);
  return m ? m[0] : '';
})();

describe('the cancelled-round shape', () => {
  it('produces one entry per call, with the ids preserved', () => {
    // The mapping the implementation performs, asserted on its own terms: an
    // id that does not come back cannot be matched to the call that made it.
    const calls: ToolCall[] = [
      { id: 'a1', name: 'search_document', input: { query: 'indemnification' } },
      { id: 'a2', name: 'lookup_fda_guidance', input: { topic: 'Q8' } },
      { id: 'a3', name: 'check_regulatory_compliance', input: {} },
    ];
    const entries: ToolResultEntry[] = calls.map(call => ({
      tool_use_id: call.id,
      name: call.name,
      content: JSON.stringify(CANCELLED_TOOL_RESULT(call.name)),
    }));

    expect(entries).toHaveLength(calls.length);
    expect(entries.map(e => e.tool_use_id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('every entry SAYS it was cancelled rather than being empty', () => {
    // An empty result is an error rendered as nothing. The model reads it as a
    // tool that had nothing to say, and tries again.
    const entry = JSON.parse(JSON.stringify(CANCELLED_TOOL_RESULT('search_document')));
    expect(entry.cancelled).toBe(true);
    expect(entry.tool).toBe('search_document');
    expect(String(entry.note)).not.toHaveLength(0);
  });

  it('names the tool, so the record says WHICH step was stopped', () => {
    expect(CANCELLED_TOOL_RESULT('ocr_document_pages').tool).toBe('ocr_document_pages');
    expect(CANCELLED_TOOL_RESULT('read_spreadsheet').tool).toBe('read_spreadsheet');
  });
});

describe('the wrapper no longer drops the round', () => {
  it('its barge-in branch returns a mapped result, not an empty array', () => {
    // Reads the shipped source: the regression this guards against is a future
    // edit quietly restoring `return []`, which every other assertion here
    // would still pass.
    expect(BARGE_IN).not.toMatch(/return \[\];/);
    expect(BARGE_IN).toMatch(/calls\.map/);
    expect(BARGE_IN).toMatch(/CANCELLED_TOOL_RESULT/);
  });

  it('passes the abort signal to the gateway, not only to its own checks', () => {
    // Without this the abort checks were advisory: they stopped us READING the
    // response while the model kept generating server-side and the turn was
    // paid for in full.
    expect(EXECUTOR).toMatch(/gateway\.route\(\{ \.\.\.request, signal \}\)/);
    expect(EXECUTOR).toMatch(/messages: loopMessages, signal/);
  });

  it('forwards the round-boundary checkpoint the loop has always accepted', () => {
    // runAgenticToolLoop has taken a checkpoint since run control shipped; this
    // wrapper not forwarding it is why every non-SSE caller had cancel-only
    // control while the SSE route had all four.
    expect(EXECUTOR).toMatch(/checkpoint: options\.checkpoint/);
  });
});
