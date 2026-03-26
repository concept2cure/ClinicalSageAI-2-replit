import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import * as http from 'node:http';

function mockCommonDeps(options: { dbAvailable: boolean; providers: string[]; commandImportFails?: boolean; deterministicMode?: boolean; providerHealthy?: boolean; dbQueryFails?: boolean; providerHealthReport?: Array<{ provider: string; healthy: boolean }> }) {
  vi.doMock('../../server/db.ts', () => ({
    getPool: options.dbAvailable
      ? () => ({
          query: options.dbQueryFails
            ? vi.fn(async () => {
                throw new Error('Database ping failed');
              })
            : vi.fn(async () => ({ rows: [{ '?column?': 1 }] })),
          connect: vi.fn(),
        })
      : () => {
          throw new Error('Database connection not available');
        },
  }));

  vi.doMock('../../server/services/ai-gateway/index.js', () => ({
    getGateway: () => ({
      getEnabledProviders: () => options.providers,
      getProviderHealth: () =>
        options.providerHealthReport ?? [{ provider: 'anthropic', healthy: options.providerHealthy ?? true }],
      isDeterministicMode: () => options.deterministicMode ?? false,
      route: vi.fn(async ({ onStream }: { onStream?: (chunk: string, metadata?: { type?: string }) => void }) => {
        onStream?.('deterministic reply', { type: 'text' });
        return {
          content: 'deterministic reply',
          model: 'deterministic',
          provider: 'deterministic',
          usage: {},
          latencyMs: 1,
        };
      }),
    }),
  }));

  vi.doMock('../../server/services/ana-ri/index.js', () => ({
    orchestrate: vi.fn(() => ({
      detectedIntent: { lens: 'auto', confidence: 0.5 },
      detectedSubmissionType: null,
      appliedRole: 'general',
      activeWorkstream: null,
      workstreamHandoff: null,
      suggestedActions: [],
      orchestrationMeta: {},
      systemPrompt: 'test',
    })),
  }));

  vi.doMock('../../server/services/ana-ri/deficiency-taxonomy.js', () => ({
    DEFICIENCY_TAXONOMY: [],
    getDeficienciesBySubmissionType: vi.fn(() => []),
    getCriticalDeficiencies: vi.fn(() => []),
    getDeficiencyCategories: vi.fn(() => []),
  }));

  vi.doMock('../../server/services/ana-ri/document-actions.js', () => ({
    getAllActions: vi.fn(() => []),
    getActionsForLens: vi.fn(() => []),
  }));

  vi.doMock('../../server/services/ana-ri/evaluation.js', () => ({
    evaluateResponse: vi.fn(() => ({ grade: 'A', overallScore: 10, maxOverallScore: 10 })),
    getFullRubric: vi.fn(() => []),
  }));

  vi.doMock('../../server/services/ana-ri/role-adapter.js', () => ({
    inferRole: vi.fn(() => 'general'),
  }));

  vi.doMock('../../server/services/ana-ri/enforcement.js', () => ({
    logGeneration: vi.fn(),
    getGenerationLog: vi.fn(() => []),
    getGenerationStats: vi.fn(() => ({ total: 0 })),
    checkEvidenceDiscipline: vi.fn(() => ({ compliant: true, totalLabels: 0 })),
    validateResponseStructure: vi.fn(() => ({ valid: true, score: 5, maxScore: 5 })),
  }));

  vi.doMock('../../server/services/chat-thread-helpers.js', () => ({
    getOrCreateThread: vi.fn(async () => 'thread-1'),
    getThreadMessages: vi.fn(async () => []),
    saveChatMessage: vi.fn(async () => {}),
  }));

  vi.doMock('../../server/services/kernel-decision-record.js', () => ({ logKernelDecision: vi.fn() }));
  vi.doMock('../../server/services/kernel-router.js', () => ({
    planKernelExecution: vi.fn(() => ({
      taskType: 'chat',
      maxTokens: 100,
      temperature: 0.2,
      strategy: 'task_based',
      plannerVersion: 'test',
      orchestratorName: 'test',
      decisionRationale: 'test',
      constraints: {},
      riskTier: 'low',
    })),
  }));
  vi.doMock('../../server/services/kernel-adaptive-policy.js', () => ({
    getKernelPolicyHint: vi.fn(async () => null),
    recordKernelPolicyOutcome: vi.fn(),
  }));
  vi.doMock('../../server/services/kernel-goal-planner.js', () => ({
    buildGoalPlan: vi.fn(() => ({ id: 'goal' })),
    replanGoalPlan: vi.fn((g: any) => g),
  }));
  vi.doMock('../../server/services/memory-context-assembler.js', () => ({
    buildMemoryContextForChat: vi.fn(async () => ({ memoryBlock: '' })),
  }));
  vi.doMock('../../server/services/lumen-context-builder.js', () => ({
    getIntelligencePrefix: vi.fn(async () => ''),
    buildSectionSpecificPrompt: vi.fn(() => ''),
  }));
  vi.doMock('../../server/services/intelligence/rim-interceptors.js', () => ({ interceptChatResponse: vi.fn() }));
  vi.doMock('../../server/services/ana-ri/context-enrichment.js', () => ({
    enrichContextForChat: vi.fn(async () => ({ block: '', sources: [] })),
  }));
  vi.doMock('../../server/services/ana-guidance-executor.js', () => ({
    processResponseActions: vi.fn(async () => ({ actions: [] })),
  }));

  if (options.commandImportFails) {
    vi.doMock('../../server/services/ana-ri/command-executor.js', () => {
      throw new Error('command executor unavailable');
    });
  } else {
    vi.doMock('../../server/services/ana-ri/command-executor.js', () => ({
      COMMAND_REGISTRY: [{ name: 'create_project' }],
      processCommandsInResponse: vi.fn(async () => ({ executedCommands: [] })),
    }));
  }
}

async function callRoute(router: express.Router, path: string): Promise<{ status: number; body: any }> {
  return new Promise(resolve => {
    const app = express();
    app.use(express.json());
    app.use('/api/ana-ri', router);

    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as any).port;
      const req = http.request(
        { hostname: '127.0.0.1', port, path, method: 'GET' },
        (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => {
            data += chunk;
          });
          res.on('end', () => {
            server.close();
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          });
        }
      );
      req.end();
    });
  });
}

async function callSseRoute(
  router: express.Router,
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: string }> {
  return new Promise(resolve => {
    const app = express();
    app.use(express.json());
    app.use('/api/ana-ri', router);

    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as any).port;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => {
            data += chunk;
          });
          res.on('end', () => {
            server.close();
            resolve({ status: res.statusCode, body: data });
          });
        },
      );
      req.write(JSON.stringify(body));
      req.end();
    });
  });
}

describe('AnA RI health/commands endpoints', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns healthy when DB and gateway are available', async () => {
    mockCommonDeps({ dbAvailable: true, providers: ['anthropic'] });
    const mod = await import('../../server/routes/ana-ri');
    const res = await callRoute(mod.default, '/api/ana-ri/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.checks.database).toBe(true);
    expect(res.body.data.checks.gateway).toBe(true);
    expect(res.body.data.checks.providersHealthy).toBe(true);
    expect(typeof res.body.data.timestamp).toBe('string');
  });

  it('returns degraded when DB and gateway are unavailable', async () => {
    mockCommonDeps({ dbAvailable: false, providers: [], providerHealthy: false });
    const mod = await import('../../server/routes/ana-ri');
    const res = await callRoute(mod.default, '/api/ana-ri/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.checks.database).toBe(false);
    expect(res.body.data.checks.gateway).toBe(false);
    expect(res.body.data.checks.providersHealthy).toBe(false);
  });

  it('returns degraded when DB ping fails even if pool exists', async () => {
    mockCommonDeps({ dbAvailable: true, dbQueryFails: true, providers: ['anthropic'] });
    const mod = await import('../../server/routes/ana-ri');
    const res = await callRoute(mod.default, '/api/ana-ri/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.checks.database).toBe(false);
    expect(res.body.data.checks.gateway).toBe(true);
    expect(res.body.data.checks.providersHealthy).toBe(true);
  });

  it('does not degrade when provider health API returns empty list but providers are enabled', async () => {
    mockCommonDeps({
      dbAvailable: true,
      providers: ['anthropic'],
      providerHealthReport: [],
    });
    const mod = await import('../../server/routes/ana-ri');
    const res = await callRoute(mod.default, '/api/ana-ri/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.checks.gateway).toBe(true);
    expect(res.body.data.checks.providersHealthy).toBe(true);
  });



  it('reports healthy in deterministic mode even without providers', async () => {
    mockCommonDeps({ dbAvailable: true, providers: [], deterministicMode: true, providerHealthy: false });
    const mod = await import('../../server/routes/ana-ri');
    const res = await callRoute(mod.default, '/api/ana-ri/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.deterministicMode).toBe(true);
    expect(res.body.data.checks.gateway).toBe(true);
    expect(res.body.data.checks.providersHealthy).toBe(true);
  });

  it('returns 503 from /commands when command executor import fails', async () => {
    mockCommonDeps({ dbAvailable: true, providers: ['anthropic'], commandImportFails: true });
    const mod = await import('../../server/routes/ana-ri');
    const res = await callRoute(mod.default, '/api/ana-ri/commands');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('COMMANDS_UNAVAILABLE');
  });

  it('allows /stream in deterministic mode even without enabled providers', async () => {
    mockCommonDeps({ dbAvailable: true, providers: [], deterministicMode: true });
    const mod = await import('../../server/routes/ana-ri');
    const res = await callSseRoute(mod.default, '/api/ana-ri/stream', { message: 'Hello AnA' });

    expect(res.status).toBe(200);
    expect(res.body).toContain('"type":"done"');
  });
});
