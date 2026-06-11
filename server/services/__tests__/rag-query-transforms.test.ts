import { describe, it, expect, vi } from 'vitest';
import type { AIRequest, AIResponse } from '../aiProviderRouter';
import { generateStepBackQuery, generateSubQuestions } from '../rag-query-transforms';

function aiResponse(content: string): AIResponse {
  return {
    content,
    provider: 'anthropic',
    model: 'test',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 11, estimatedCost: 0 },
    latencyMs: 1,
    requestId: 'r',
    cached: false,
  };
}

describe('generateStepBackQuery', () => {
  it('returns the broader question and routes a reasoning request', async () => {
    const route = vi.fn(async (_req: AIRequest) =>
      aiResponse('What are the general requirements for clinical trial informed consent?')
    );
    const { stepBackQuery, tokensUsed } = await generateStepBackQuery(
      route,
      'Does protocol X-12 need re-consent after amendment 3?'
    );
    expect(stepBackQuery).toBe('What are the general requirements for clinical trial informed consent?');
    expect(tokensUsed).toBe(11);
    expect(route.mock.calls[0][0].taskType).toBe('reasoning');
  });

  it('strips wrapping quotes and a "Step-back question:" echo prefix', async () => {
    const route = vi.fn(async () =>
      aiResponse('Step-back question: "What governs pediatric dosing?"')
    );
    const { stepBackQuery } = await generateStepBackQuery(route, 'specific q');
    expect(stepBackQuery).toBe('What governs pediatric dosing?');
  });

  it('returns null when the model just echoes the original (case-insensitive)', async () => {
    const route = vi.fn(async () => aiResponse('  WHAT IS GCP?  '));
    const { stepBackQuery } = await generateStepBackQuery(route, 'What is GCP?');
    expect(stepBackQuery).toBeNull();
  });

  it('returns null on an empty model response', async () => {
    const route = vi.fn(async () => aiResponse('   '));
    const { stepBackQuery, tokensUsed } = await generateStepBackQuery(route, 'q');
    expect(stepBackQuery).toBeNull();
    expect(tokensUsed).toBe(11);
  });
});

describe('generateSubQuestions', () => {
  it('parses a JSON array of sub-questions and caps the fan-out', async () => {
    const route = vi.fn(async (_req: AIRequest) =>
      aiResponse('["What is A?", "What is B?", "What is C?", "What is D?", "What is E?"]')
    );
    const { subQuestions, tokensUsed } = await generateSubQuestions(
      route,
      'How do A, B, C, D and E compare?',
      4
    );
    expect(subQuestions).toEqual(['What is A?', 'What is B?', 'What is C?', 'What is D?']); // capped at 4
    expect(tokensUsed).toBe(11);
    expect(route.mock.calls[0][0].taskType).toBe('structured_output');
  });

  it('accepts an object-wrapped array and drops blank entries', async () => {
    const route = vi.fn(async () => aiResponse('{"questions": ["What is A?", "  ", "What is B?"]}'));
    const { subQuestions } = await generateSubQuestions(route, 'q');
    expect(subQuestions).toEqual(['What is A?', 'What is B?']);
  });

  it('returns an empty array for an atomic question ([])', async () => {
    const route = vi.fn(async () => aiResponse('[]'));
    const { subQuestions } = await generateSubQuestions(route, 'What is the capital?');
    expect(subQuestions).toEqual([]);
  });

  it('treats a single echo of the original as no decomposition', async () => {
    const route = vi.fn(async () => aiResponse('["What is GCP?"]'));
    const { subQuestions } = await generateSubQuestions(route, 'What is GCP?');
    expect(subQuestions).toEqual([]);
  });

  it('returns an empty array on unparseable output', async () => {
    const route = vi.fn(async () => aiResponse('not json'));
    const { subQuestions } = await generateSubQuestions(route, 'q');
    expect(subQuestions).toEqual([]);
  });
});
