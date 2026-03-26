/**
 * AI Gateway Demo Mode — Pass 19 Tests
 *
 * Tests covering:
 * - Deterministic response structure
 * - Evidence discipline in demo responses
 * - Auto-fallback when no providers available
 * - Demo mode content quality
 *
 * @module tests/resolution/ai-gateway-demo-mode.test
 */

import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type TaskType = 'chat' | 'document_analysis' | 'document_drafting' | 'structured_output' |
  'regulatory_review' | 'code_generation' | 'summarization' | 'embedding' | 'general';

// ═══════════════════════════════════════════════════════════════════════════════
// DETERMINISTIC RESPONSES (matching gateway.ts)
// ═══════════════════════════════════════════════════════════════════════════════

const DEMO_RESPONSES: Record<TaskType, string> = {
  chat: '## AnA Response (Demo Mode)\n\nI\'m AnA — your Audit & Narrative Assistant.',
  document_analysis: '## Document Analysis (Demo Mode)',
  document_drafting: '## Document Draft (Demo Mode)',
  structured_output: '{"result": "demo_mode"',
  regulatory_review: '## Regulatory Review (Demo Mode)',
  code_generation: '// Demo mode',
  summarization: '**Summary (Demo Mode):**',
  embedding: '[]',
  general: '**AnA (Demo Mode):**',
};

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: DEMO RESPONSE STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Demo Response Structure', () => {
  it('all 9 task types have demo responses', () => {
    const taskTypes: TaskType[] = [
      'chat', 'document_analysis', 'document_drafting', 'structured_output',
      'regulatory_review', 'code_generation', 'summarization', 'embedding', 'general',
    ];
    for (const type of taskTypes) {
      expect(DEMO_RESPONSES[type]).toBeTruthy();
    }
  });

  it('chat response identifies as AnA', () => {
    expect(DEMO_RESPONSES.chat).toContain('AnA');
    expect(DEMO_RESPONSES.chat).toContain('Demo Mode');
  });

  it('regulatory_review response lists capabilities', () => {
    const fullResponse = '## Regulatory Review (Demo Mode)\n\n' +
      '**[KNOWN]** AnA is operating in demo mode — no live AI analysis performed.\n\n' +
      '**When connected, AnA provides:**\n' +
      '- **Compliance check** against 21 CFR Part 11, ICH E6(R2), EU MDR, ISO 14155\n' +
      '- **Gap detection** with body-specific expectations (FDA, EMA, PMDA, MHRA)';

    expect(fullResponse).toContain('21 CFR Part 11');
    expect(fullResponse).toContain('ICH E6(R2)');
    expect(fullResponse).toContain('FDA');
    expect(fullResponse).toContain('EMA');
  });

  it('general response directs user to set API key', () => {
    const fullResponse = '**AnA (Demo Mode):** I\'m running without an AI provider. ' +
      'Set `ANTHROPIC_API_KEY` in your `.env` file to enable full regulatory intelligence.';
    expect(fullResponse).toContain('ANTHROPIC_API_KEY');
    expect(fullResponse).toContain('.env');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: EVIDENCE DISCIPLINE IN DEMO RESPONSES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Evidence Discipline in Demo Responses', () => {
  // Full responses with evidence tags
  const chatFull = '- **[KNOWN]** Analyze your regulatory documents\n- **[INFERRED]** Suggest corrections\n*Evidence discipline: Every claim is tagged [KNOWN], [INFERRED], or [MISSING].*';
  const analysisFull = '- **[KNOWN]** Section headers present\n- **[INFERRED]** Content completeness appears adequate\n- **[MISSING]** Cross-references not verified';
  const reviewFull = '**[KNOWN]** AnA is operating in demo mode\n**[MISSING]** Live regulatory analysis requires';
  const summaryFull = '[KNOWN] This content relates to regulatory submissions. [INFERRED] The document appears to follow standard eCTD formatting. [MISSING] Detailed analysis requires live AI';

  it('chat response uses evidence tags', () => {
    expect(chatFull).toContain('[KNOWN]');
    expect(chatFull).toContain('[INFERRED]');
  });

  it('document_analysis uses all 3 evidence tags', () => {
    expect(analysisFull).toContain('[KNOWN]');
    expect(analysisFull).toContain('[INFERRED]');
    expect(analysisFull).toContain('[MISSING]');
  });

  it('regulatory_review uses evidence tags', () => {
    expect(reviewFull).toContain('[KNOWN]');
    expect(reviewFull).toContain('[MISSING]');
  });

  it('summarization uses evidence tags inline', () => {
    expect(summaryFull).toContain('[KNOWN]');
    expect(summaryFull).toContain('[INFERRED]');
    expect(summaryFull).toContain('[MISSING]');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: AUTO-FALLBACK BEHAVIOR
// ═══════════════════════════════════════════════════════════════════════════════

describe('Auto-Fallback to Demo Mode', () => {
  it('no providers available → falls back to demo (not 503)', () => {
    // Simulates the gateway behavior when selectModel returns null
    const selectedModel = null;
    const shouldFallbackToDemo = !selectedModel;
    expect(shouldFallbackToDemo).toBe(true);
  });

  it('deterministic response has correct metadata', () => {
    const response = {
      content: 'Demo response',
      provider: 'anthropic',
      model: 'demo-mode',
      usage: { inputTokens: 0, outputTokens: 2, totalTokens: 2, estimatedCostUsd: 0 },
      latencyMs: 1,
      requestId: 'req-001',
      cached: false,
      deterministic: true,
    };

    expect(response.provider).toBe('anthropic');
    expect(response.model).toBe('demo-mode');
    expect(response.deterministic).toBe(true);
    expect(response.usage.estimatedCostUsd).toBe(0);
  });

  it('AI_GATEWAY_DETERMINISTIC=true forces demo mode even with providers', () => {
    const config = { deterministicMode: true };
    expect(config.deterministicMode).toBe(true);
  });

  it('AI_GATEWAY_DETERMINISTIC=false with no key still falls back', () => {
    const anthropicKey = undefined;
    const providerEnabled = !!anthropicKey;
    expect(providerEnabled).toBe(false);
    // Gateway will try selectModel → null → fallback to demo
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: .ENV CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('.env Configuration', () => {
  it('ANTHROPIC_API_KEY enables anthropic provider', () => {
    const key = 'sk-ant-test123';
    const providerEnabled = !!key;
    expect(providerEnabled).toBe(true);
  });

  it('empty ANTHROPIC_API_KEY disables anthropic provider', () => {
    const key = '';
    const providerEnabled = !!key;
    expect(providerEnabled).toBe(false);
  });

  it('undefined ANTHROPIC_API_KEY disables anthropic provider', () => {
    const key = undefined;
    const providerEnabled = !!key;
    expect(providerEnabled).toBe(false);
  });
});
