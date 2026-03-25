/**
 * Claude Migration Smoke Tests
 *
 * Validates:
 * 1. Anthropic client singleton exists and exports correctly
 * 2. Unified AI client routes through Claude by default
 * 3. AI Gateway has Claude models configured as primary
 * 4. OpenAI client no longer throws on missing key
 * 5. Server AI completion route exists
 * 6. Client services don't import OpenAI directly (no browser API key exposure)
 * 7. Core services migrated from direct OpenAI to unified AI client
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('Claude Migration - Anthropic Client', () => {
  it('anthropic-client.ts exists and exports getAnthropicClient', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/services/anthropic-client.ts'),
      'utf-8'
    );
    expect(content).toContain('export function getAnthropicClient');
    expect(content).toContain("import Anthropic from '@anthropic-ai/sdk'");
    expect(content).toContain('ANTHROPIC_API_KEY');
  });

  it('anthropic-client.ts exports CLAUDE_MODELS constants', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/services/anthropic-client.ts'),
      'utf-8'
    );
    expect(content).toContain('export const CLAUDE_MODELS');
    expect(content).toContain('claude-opus-4');
    expect(content).toContain('claude-sonnet-4');
    expect(content).toContain('claude-haiku-4');
  });
});

describe('Claude Migration - OpenAI Client Graceful Degradation', () => {
  it('openai-client.ts no longer throws on missing OPENAI_API_KEY', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/services/openai-client.ts'),
      'utf-8'
    );
    // Should NOT have the old throw pattern
    expect(content).not.toContain("throw new Error('OPENAI_API_KEY environment variable is required')");
    // Should have graceful degradation with proxy or warning
    expect(content).toContain('console.warn');
    expect(content).toContain('Proxy');
  });

  it('openai-client.ts documents migration to unified-ai-client', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/services/openai-client.ts'),
      'utf-8'
    );
    expect(content).toContain('unified-ai-client');
    expect(content).toContain('Claude');
  });
});

describe('Claude Migration - AI Gateway Claude-First', () => {
  it('gateway.ts has Claude models in model registry', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/services/ai-gateway/gateway.ts'),
      'utf-8'
    );
    expect(content).toContain("id: 'claude-opus-4'");
    expect(content).toContain("id: 'claude-sonnet-4'");
    expect(content).toContain("id: 'claude-haiku-4'");
  });

  it('gateway.ts routes all task types to Claude first', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/services/ai-gateway/gateway.ts'),
      'utf-8'
    );
    // Check that anthropic is first in task preferences
    expect(content).toContain("chat: ['anthropic'");
    expect(content).toContain("document_analysis: ['anthropic'");
    expect(content).toContain("regulatory_review: ['anthropic'");
    expect(content).toContain("general: ['anthropic'");
  });

  it('unified-ai-client.ts exists and exports ai singleton', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/lib/unified-ai-client.ts'),
      'utf-8'
    );
    expect(content).toContain('export const ai');
    expect(content).toContain('class UnifiedAIClient');
    expect(content).toContain('async complete(');
    expect(content).toContain('async chat(');
    expect(content).toContain('async structured<');
  });
});

describe('Claude Migration - Server AI Completion Route', () => {
  it('ai-completion.ts route exists and handles POST', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/routes/ai-completion.ts'),
      'utf-8'
    );
    expect(content).toContain("router.post('/ai/completion'");
    expect(content).toContain("import { ai } from '../lib/unified-ai-client'");
  });

  it('server/index.ts mounts AI completion routes', () => {
    const content = fs.readFileSync(path.join(ROOT, 'server/index.ts'), 'utf-8');
    expect(content).toContain("import('./routes/ai-completion')");
  });

  it('lumen regulatory analysis/guidance endpoints use AI Gateway (not static templates)', () => {
    const content = fs.readFileSync(path.join(ROOT, 'server/index.ts'), 'utf-8');
    expect(content).toContain("app.post('/api/lumen/regulatory-analysis'");
    expect(content).toContain("app.post('/api/lumen/ich-e6r3-guidance'");
    expect(content).toContain("callerModule: 'lumen/regulatory-analysis'");
    expect(content).toContain("callerModule: 'lumen/ich-e6r3-guidance'");
    expect(content).not.toContain('projected_delay_days: 30');
    expect(content).not.toContain('processing_time_ms: 1250');
  });
});

describe('Claude Migration - AnA FT Gateway + Lifecycle Controls', () => {
  it('lumen-cortex-ft.ts routes inference through centralized AI gateway', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/routes/lumen-cortex-ft.ts'),
      'utf-8'
    );
    expect(content).toContain("import { getGateway } from '../services/ai-gateway/index.js'");
    expect(content).toContain('gateway.route({');
    expect(content).toContain("taskType: 'regulatory_review'");
    expect(content).not.toContain("https://api.openai.com/v1/chat/completions");
  });

  it('lumen-cortex-ft.ts exposes promote + rollback lifecycle endpoints', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/routes/lumen-cortex-ft.ts'),
      'utf-8'
    );
    expect(content).toContain("router.post('/models/:modelId/promote'");
    expect(content).toContain("router.post('/models/:modelId/rollback'");
    expect(content).toContain("router.get('/models/:modelId/deployment-history'");
    expect(content).toContain("router.post('/models/:modelId/quantize'");
    expect(content).toContain("router.get('/models/:modelId/variants'");
    expect(content).toContain("router.get('/models/:modelId/quantization-benchmarks'");
    expect(content).toContain("deploymentStage?: 'staged' | 'canary' | 'live' | 'rollback'");
    expect(content).toContain('promoteModel(');
    expect(content).toContain('rollbackModel(');
    expect(content).toContain('getDeploymentHistory(');
    expect(content).toContain('createQuantizedVariant(');
  });
});

describe('Claude Migration - Client Services No Longer Expose API Keys', () => {
  it('openaiService.js does not import from openai package', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'client/src/services/openaiService.js'),
      'utf-8'
    );
    expect(content).not.toContain("import OpenAI from 'openai'");
    expect(content).not.toContain('dangerouslyAllowBrowser');
    expect(content).not.toContain('OPENAI_API_KEY');
    // Should route through server API
    expect(content).toContain('/api/ai/completion');
  });
});

describe('Claude Migration - Core Service Migrations', () => {
  const migratedServices = [
    'server/src/services/ai/regulatory.js',
    'server/src/services/ai/qualityCoach.js',
    'server/src/services/ai/secDraft.js',
    'server/src/services/ai/quality.js',
  ];

  it.each(migratedServices)('%s uses unified AI client, not direct OpenAI', (filePath) => {
    const content = fs.readFileSync(path.join(ROOT, filePath), 'utf-8');
    expect(content).not.toContain("import OpenAI from 'openai'");
    expect(content).not.toContain("new OpenAI(");
    expect(content).toContain('unified-ai-client');
  });

  it('playbook.ts uses unified AI client', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/src/services/reg/playbook.ts'),
      'utf-8'
    );
    expect(content).not.toContain("import OpenAI from 'openai'");
    expect(content).toContain('unified-ai-client');
  });

  it('obligations.router.ts uses unified AI client', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/src/routes/obligations.router.ts'),
      'utf-8'
    );
    expect(content).not.toContain("import OpenAI from 'openai'");
    expect(content).toContain('unified-ai-client');
  });

  it('realTimeValidationService.ts uses unified AI client', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/services/realTimeValidationService.ts'),
      'utf-8'
    );
    expect(content).not.toContain("import OpenAI from 'openai'");
    expect(content).not.toContain('private openai: OpenAI');
    expect(content).toContain('unified-ai-client');
  });

  it('openai-service.ts does not crash on missing OPENAI_API_KEY', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/openai-service.ts'),
      'utf-8'
    );
    // Should conditionally create client
    expect(content).toContain('process.env.OPENAI_API_KEY');
    expect(content).toContain('? new OpenAI');
    expect(content).toContain(': null');
    // analyzeText should route through gateway, not OpenAI directly
    expect(content).toContain('getGateway');
  });
});

describe('Claude Migration - Package Dependencies', () => {
  it('package.json has @anthropic-ai/sdk installed', () => {
    const content = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8');
    expect(content).toContain('@anthropic-ai/sdk');
  });
});
