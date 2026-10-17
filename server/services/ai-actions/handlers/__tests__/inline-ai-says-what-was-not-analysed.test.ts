/**
 * Inline AI never asks a model for a figure nobody computed (2026-10-15,
 * finding 8, at its consumer).
 *
 * What the code used to do:
 *  - summarize_selection on content of 50 characters or fewer ran no analysis
 *    but kept the prompt "Summarize ... using the structured analysis results.
 *    Your summary MUST include: 1. Defensibility score and risk level" — with
 *    no results given, the model had to invent the score;
 *  - with an analysis, the constrained prompt said "Consistency score: 100/100"
 *    for a note in which nothing was compared, and the result carried
 *    `evaluationPassed: true`, the engine's self-check of its own report.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sent = vi.hoisted(() => ({ calls: [] as Array<{ messages: Array<{ role: string; content: string }> }> }));

vi.mock('../../../ai-gateway/gateway.js', () => ({
  getGateway: () => ({
    route: async (req: { messages: Array<{ role: string; content: string }> }) => {
      sent.calls.push(req);
      return {
        content:
          'Assessment: the defensibility score was not assessed. Recommendation: you should add evidence; ' +
          'severity: high priority. The note references section 1 and 2 claims; 50% of the items need action. ' +
          'Next step: address the gaps and revise the cover note before it is sent to the agency for review.',
      };
    },
  }),
}));

import { createInlineAIHandler } from '../inline-ai';

const CTX = { user: { userId: 3, userName: 'u', organizationId: 7 }, db: null, actionId: 'act-1' };
const request = (content: string) => ({
  actionType: 'summarize_selection' as const,
  targetType: 'document' as const,
  targetId: null,
  projectId: 12,
  payload: { content },
});
const systemPrompt = () => sent.calls[sent.calls.length - 1].messages.find(m => m.role === 'system')!.content;

beforeEach(() => {
  sent.calls = [];
});

describe('summarize_selection', () => {
  it('with no analysis, does not ask the model for a defensibility score', async () => {
    await createInlineAIHandler('summarize_selection').execute(request('Short note.') as never, CTX as never);
    expect(systemPrompt()).not.toMatch(/Defensibility score and risk level/);
    expect(systemPrompt()).toMatch(/No deterministic analysis was run/);
  });

  it('with an analysis that compared nothing, says so and reports no self-check', async () => {
    const note =
      'Please find enclosed the amended protocol for your records.\n\n' +
      'We look forward to your feedback on the revised dosing schedule.';
    const out = await createInlineAIHandler('summarize_selection').execute(request(note) as never, CTX as never);
    expect(systemPrompt()).not.toContain('Consistency score: 100/100');
    expect(systemPrompt()).toContain('Consistency score: not assessed');
    const signals = (out.result as { intelligenceSignals: Record<string, unknown> }).intelligenceSignals;
    expect(signals.consistencyScore).toBeNull();
    expect(signals).not.toHaveProperty('evaluationPassed');
  });
});
