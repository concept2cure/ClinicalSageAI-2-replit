import { describe, it, expect, vi } from 'vitest';
import express from 'express';

vi.mock('../../server/services/ai-gateway/index.js', () => ({
  getGateway: () => {
    throw new Error('no gateway');
  },
}));

vi.mock('../../server/services/ana-ri/index.js', () => ({
  orchestrate: () => ({
    systemPrompt: 'system',
    detectedIntent: { lens: 'strategy' },
    detectedSubmissionType: 'IND',
    appliedRole: 'ra_lead',
    suggestedActions: ['strategy_note'],
    orchestrationMeta: { mode: 'test' },
  }),
}));

vi.mock('../../server/services/ana-ri/deficiency-taxonomy.js', () => ({
  DEFICIENCY_TAXONOMY: [],
  getDeficienciesBySubmissionType: () => [],
  getCriticalDeficiencies: () => [],
  getDeficiencyCategories: () => [],
}));

vi.mock('../../server/services/ana-ri/document-actions.js', () => ({
  getAllActions: () => [],
  getActionsForLens: () => [],
}));

vi.mock('../../server/services/ana-ri/evaluation.js', () => ({
  evaluateResponse: () => ({ grade: 'B', overallScore: 75, maxOverallScore: 100 }),
  getFullRubric: () => [],
}));

vi.mock('../../server/services/ana-ri/role-adapter.js', () => ({
  inferRole: () => 'ra_lead',
}));

vi.mock('../../server/services/ana-ri/enforcement.js', () => ({
  logGeneration: vi.fn(),
  getGenerationLog: () => [],
  getGenerationStats: () => ({ total: 0 }),
  checkEvidenceDiscipline: () => ({ compliant: true, totalLabels: 0 }),
  validateResponseStructure: () => ({ valid: true, score: 5, maxScore: 5 }),
}));

vi.mock('../../server/services/chat-thread-helpers.js', () => ({
  getOrCreateThread: async () => 'thread_test',
  saveChatMessage: async () => undefined,
}));

vi.mock('../../server/services/kernel-decision-record.js', () => ({ logKernelDecision: vi.fn() }));
vi.mock('../../server/services/kernel-router.js', () => ({
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
vi.mock('../../server/services/kernel-adaptive-policy.js', () => ({
  getKernelPolicyHint: vi.fn(async () => null),
  recordKernelPolicyOutcome: vi.fn(),
}));
vi.mock('../../server/services/kernel-goal-planner.js', () => ({
  buildGoalPlan: vi.fn(() => ({ id: 'goal' })),
  replanGoalPlan: vi.fn((g: any) => g),
}));
vi.mock('../../server/services/kernel-plan-runtime.js', () => ({
  createGoalPlanRun: vi.fn(async () => 'run-1'),
  getGoalPlanRun: vi.fn(async () => null),
  advanceGoalPlanStep: vi.fn(async () => ({})),
  executeNextGoalPlanStep: vi.fn(async () => ({})),
  listGoalPlanEvents: vi.fn(async () => []),
}));
vi.mock('../../server/services/kernel-agent-protocol.js', () => ({
  recordProtocolEvent: vi.fn(async () => ({})),
  listProtocolEvents: vi.fn(async () => []),
  validateProtocolEvent: vi.fn(() => true),
}));
vi.mock('../../server/services/ana-kernel-orchestrator.js', () => ({
  buildKernelExecutionContext: vi.fn(async () => ({
    routingPlan: {
      taskType: 'chat',
      maxTokens: 100,
      temperature: 0.2,
      strategy: 'task_based',
      plannerVersion: 'test',
      orchestratorName: 'test',
      decisionRationale: 'test',
      constraints: {},
      riskTier: 'low',
    },
    selectedStrategy: 'task_based',
    goalPlan: { id: 'goal' },
  })),
  recordKernelSuccess: vi.fn(async () => {}),
}));
vi.mock('../../server/services/kernel-observability.js', () => ({
  computeQualityBand: vi.fn(() => 'moderate'),
  getKernelMetrics: vi.fn(async () => ({
    windowDays: 7,
    kdr: { total: 0, successRate: 0, avgLatencyMs: 0 },
    policy: { totalOutcomes: 0, avgQualityScore: 0, qualityBand: 'weak' },
    plans: { totalRuns: 0, completedRuns: 0, completionRate: 0 },
    protocol: { totalEvents: 0, decisions: 0 },
  })),
}));
vi.mock('../../server/services/kernel-beta-readiness.js', () => ({
  getKernelBetaReadiness: vi.fn(async () => ({ ready: true, tables: {}, missing: [] })),
}));
vi.mock('../../server/services/memory-context-assembler.js', () => ({
  buildMemoryContextForChat: vi.fn(async () => ({ memoryBlock: '' })),
}));
vi.mock('../../server/services/lumen-context-builder.js', () => ({
  getIntelligencePrefix: vi.fn(async () => ''),
  buildSectionSpecificPrompt: vi.fn(() => ''),
}));
vi.mock('../../server/services/intelligence/rim-interceptors.js', () => ({
  interceptChatResponse: vi.fn(),
}));
vi.mock('../../server/services/ana-ri/context-enrichment.js', () => ({
  enrichContextForChat: vi.fn(async () => ({ block: '', sources: [] })),
}));
vi.mock('../../server/services/ana-guidance-executor.js', () => ({
  processResponseActions: vi.fn(async () => ({ actions: [] })),
}));
vi.mock('../../server/services/ana-ri/command-executor.js', () => ({
  COMMAND_REGISTRY: [],
  processCommandsInResponse: vi.fn(async () => ({ executedCommands: [] })),
}));

import router from '../../server/routes/ana-ri';

async function request(method: 'GET' | 'POST', path: string, body?: any) {
  const app = express();
  app.use(express.json());
  app.use('/api/ana-ri', router);

  const http = await import('http');
  return new Promise<{ status: number; body: any }>(resolve => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as any).port;
      const payload = body ? JSON.stringify(body) : '';
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: body
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {},
        },
        (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => {
            data += chunk;
          });
          res.on('end', () => {
            server.close();
            resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
          });
        }
      );
      if (body) req.write(payload);
      req.end();
    });
  });
}

describe('AnA RI resilience', () => {
  it('returns degraded mode response when gateway is unavailable', async () => {
    const res = await request('POST', '/api/ana-ri/chat', { message: 'Help with IND strategy' });
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('GATEWAY_UNAVAILABLE');
  });
});
