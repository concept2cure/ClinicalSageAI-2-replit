/**
 * GET /api/claude/models — model/effort picker projection contract.
 *
 * Verifies the rewritten endpoint:
 *  - projects getGateway().getModels(), filtered to enabled models only
 *  - derives label + recommendedEffort per option
 *  - includes effortLevels + defaultEffort for the picker
 *  - PRESERVES the legacy `frameworks` array and the `{ success, data }` envelope
 *
 * @module tests/routes/ana-models-endpoint.test
 */
import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'test-secret-padded-to-32-chars-or-more-okay!!';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

import express from 'express';
import request from 'supertest';
import type { ModelConfig } from '../../server/services/ai-gateway/types';

vi.mock('../../server/services/auditService', () => ({
  default: { logAction: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../server/services/ana/AnaDocumentDraftingService', () => ({
  getAnaDraftingService: () => ({ draftDocument: vi.fn() }),
}));

const REGISTRY: ModelConfig[] = [
  {
    id: 'claude-opus-4',
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    contextWindow: 200000,
    qualityScore: 99,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    capabilities: ['chat', 'general'],
    enabled: true,
  },
  {
    id: 'claude-haiku-4',
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    contextWindow: 200000,
    qualityScore: 85,
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.004,
    capabilities: ['chat', 'general'],
    enabled: true,
  },
  {
    id: 'disabled-model',
    provider: 'openai',
    model: 'disabled-wire',
    contextWindow: 128000,
    qualityScore: 70,
    costPer1kInput: 0.001,
    costPer1kOutput: 0.002,
    capabilities: ['chat'],
    enabled: false, // must NOT appear in the projection
  },
];

vi.mock('../../server/services/ai-gateway/gateway', () => ({
  getGateway: () => ({ getModels: () => REGISTRY }),
}));

import anaIntelligenceRouter from '../../server/routes/ana-intelligence';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/claude', anaIntelligenceRouter);
  return app;
}

describe('GET /api/claude/models', () => {
  it('returns only enabled models with derived label + recommendedEffort', async () => {
    const res = await request(makeApp()).get('/api/claude/models');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const models = res.body.data.models as Array<Record<string, unknown>>;
    const ids = models.map((m) => m.id);
    expect(ids).toContain('claude-opus-4');
    expect(ids).toContain('claude-haiku-4');
    expect(ids).not.toContain('disabled-model'); // enabled-filtered

    const opus = models.find((m) => m.id === 'claude-opus-4')!;
    expect(opus.label).toBe('Claude Opus 4');
    expect(opus.recommendedEffort).toBe('thorough');

    const haiku = models.find((m) => m.id === 'claude-haiku-4')!;
    expect(haiku.recommendedEffort).toBe('fast');
  });

  it('includes effortLevels + defaultEffort', async () => {
    const res = await request(makeApp()).get('/api/claude/models');
    expect(res.body.data.effortLevels).toEqual(['fast', 'balanced', 'thorough']);
    expect(res.body.data.defaultEffort).toBe('balanced');
  });

  it('preserves the frameworks array and the {success,data} envelope', async () => {
    const res = await request(makeApp()).get('/api/claude/models');
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data.frameworks).toEqual([
      'fda_510k',
      'fda_pma',
      'eu_mdr',
      'ich_clinical',
      'cer_clinical_evaluation',
      'general_regulatory',
    ]);
  });
});
