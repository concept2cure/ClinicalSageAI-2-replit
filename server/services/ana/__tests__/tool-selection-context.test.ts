/**
 * What the selector reads from a turn's context, and what a conversation
 * carries into it (TP-RL-3, AnA reasoning round 6, 2026-10-05).
 *
 * Two doors (send-message's tool_context, the voice socket's context) hand
 * the selector a client's raw object. An object field reached the selector's
 * join as "[object Object]" and a `hints` that was not a list threw. Each
 * field is now read only as the string it is declared to be.
 */
import { describe, it, expect } from 'vitest';

import { getAllEnabledTools } from '../AnaToolDefinitions';
import { withoutHiddenAppTools } from '../ana-launch-scope';
import { selectToolsForTurn, type ToolSelectionContext } from '../tool-selection';
import { carriedToolsFrom, type ToolTraceEntry } from '../tool-trace';

const LAUNCH = withoutHiddenAppTools(getAllEnabledTools() as Array<{ name: string; description?: string }>);
const names = (tools: Array<{ name?: string }>) => tools.map((t) => t.name);
const Q = 'what has to go in section 12.2 adverse events of the clinical study report';
/** A client's raw context, as the latent doors pass it. */
const raw = (v: Record<string, unknown>) => v as unknown as ToolSelectionContext;

describe("the selector reads a context field only as the string it is declared to be", () => {
  it('an object never adds the word "object"', () => {
    const plain = names(selectToolsForTurn(LAUNCH, Q, {}));
    expect(names(selectToolsForTurn(LAUNCH, Q, { context: raw({ documentType: { section: '2.7.3' } }) }))).toEqual(plain);
    expect(names(selectToolsForTurn(LAUNCH, Q, { context: raw({ surface: { sectionTitle: 'Safety' }, projectType: 42 }) }))).toEqual(plain);
  });

  it('hints that are not a list do not throw, and a list keeps only its strings', () => {
    expect(() => selectToolsForTurn(LAUNCH, Q, { context: raw({ hints: {} }) })).not.toThrow();
    const strings = names(selectToolsForTurn(LAUNCH, 'hello', { context: { hints: ['stability'] } }));
    expect(names(selectToolsForTurn(LAUNCH, 'hello', { context: raw({ hints: ['stability', 7, { a: 'b' }] }) }))).toEqual(strings);
  });
});

describe('what a conversation carries into the next turn', () => {
  const step = (tool: string, status: ToolTraceEntry['status']): ToolTraceEntry => ({ tool, label: tool, status, resultSummary: '' });

  it('the tools that succeeded, most recent first, each once', () => {
    expect(
      carriedToolsFrom([
        step('get_document_section_requirements', 'success'),
        step('draft_authoring_document', 'error'),
        step('plan_submission_from_database_lock', 'success'),
        step('search_literature', 'cancelled'),
        step('lookup_missing', 'not_found'),
        step('', 'success'),
        step('get_cmc_requirements', 'success'),
        step('plan_submission_from_database_lock', 'success'),
      ]),
    ).toEqual(['plan_submission_from_database_lock', 'get_cmc_requirements', 'get_document_section_requirements']);
  });

  it('never a step a person declined (recorded as an error), and nothing from no steps', () => {
    expect(carriedToolsFrom([step('draft_authoring_document', 'error')])).toEqual([]);
    expect(carriedToolsFrom([])).toEqual([]);
  });
});
