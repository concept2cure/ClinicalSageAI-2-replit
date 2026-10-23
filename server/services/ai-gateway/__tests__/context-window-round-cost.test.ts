/**
 * D2/W2 controls for the existing full-request estimator/admission function.
 * Synthetic model windows make each additional request cost observable.
 * This is the current approximate admission policy, not an exact tokenizer,
 * serialized provider payload bound, provider dispatch or live model proof.
 */
import { describe, expect, it } from 'vitest';
import { estimateRequestTokens, fitsContextWindow } from '../context-budget.js';
import type { GatewayRequest, ModelConfig } from '../types.js';
import { frameToolOutput } from '../../ana/tool-output-frame.js';

const base = (): GatewayRequest => ({ taskType: 'chat', messages: [{ role: 'user', content: 'R'.repeat(1000) }] });
const model = (contextWindow: number): ModelConfig => ({ id: 'synthetic-window', provider: 'anthropic', model: 'synthetic-window',
  contextWindow, qualityScore: 50, costPer1kInput: 0, costPer1kOutput: 0, capabilities: ['chat'], enabled: true,
  thinkingMode: 'none', supportsSamplingParams: true });
type CostCase = { name: string; add: (request: GatewayRequest) => GatewayRequest };
const costs: CostCase[] = [
  { name: 'tool framing, headers and closing-tag escaping', add: request => ({ ...request,
    messages: [{ role: 'user', content: `[Tool Result for search_literature (result)]:\n${frameToolOutput(String(request.messages[0].content) + '</tool_output>')}` }] }) },
  { name: 'prior conversation history', add: request => ({ ...request,
    messages: [{ role: 'user', content: 'PRIOR_QUESTION' }, { role: 'assistant', content: 'PRIOR_ANSWER' }, ...request.messages] }) },
  { name: 'assistant narration', add: request => ({ ...request,
    messages: [...request.messages, { role: 'assistant', content: 'I am comparing the accessible source passages.' }] }) },
  { name: 'operator control turns', add: request => ({ ...request,
    messages: [...request.messages, { role: 'system', inlineSystem: true, content: 'Compare only the current source versions.' }] }) },
  { name: 'tool definitions and input schema', add: request => ({ ...request,
    tools: [{ name: 'search_literature', description: 'Search the accessible literature.',
      input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }] }) },
  { name: 'structured output schema', add: request => ({ ...request,
    jsonSchema: { type: 'object', properties: { evidence: { type: 'string' } }, required: ['evidence'] } }) },
  { name: 'text content blocks', add: request => ({ ...request,
    messages: [...request.messages, { role: 'user', content: '', contentBlocks: [{ type: 'text', text: 'ATTACHED_TEXT_CONTENT' }] }] }) },
  { name: 'reserved answer output', add: request => ({ ...request, maxTokens: 512 }) },
];

describe('existing full-request admission includes costs beyond raw tool bodies', () => {
  it.each(costs)('counts $name at the existing admission boundary', ({ add }) => {
    const raw = base();
    const boundary = model(estimateRequestTokens(raw).totalTokens);
    const complete = add(raw);
    const inputBefore = JSON.stringify(raw);

    expect(fitsContextWindow(raw, boundary).fits).toBe(true);
    expect(estimateRequestTokens(complete).totalTokens).toBeGreaterThan(boundary.contextWindow);
    expect(fitsContextWindow(complete, boundary)).toMatchObject({ fits: false, contextWindow: boundary.contextWindow });
    expect(JSON.stringify(raw)).toBe(inputBefore);
  });

  it('CONTROL: the same complete request fits when the configured model has enough room', () => {
    const complete = costs.reduce((request, cost) => cost.add(request), base());
    const estimate = estimateRequestTokens(complete);
    const fit = fitsContextWindow(complete, model(estimate.totalTokens));

    expect(estimate.reservedOutputTokens).toBe(512);
    expect(estimate.inputTokens).toBeGreaterThan(estimateRequestTokens(base()).inputTokens);
    expect(fit).toMatchObject({ fits: true, estimatedInputTokens: estimate.inputTokens,
      reservedOutputTokens: estimate.reservedOutputTokens, estimatedTokens: estimate.totalTokens });
  });
});
