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

import router from '../../server/routes/ana-ri';

async function request(method: 'GET' | 'POST', path: string, body?: any) {
  const app = express();
  app.use(express.json());
  app.use('/api/ana-ri', router);

  const http = await import('http');
  return new Promise<{ status: number; body: any }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as any).port;
      const payload = body ? JSON.stringify(body) : '';
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: body
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
      }, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
        });
      });
      if (body) req.write(payload);
      req.end();
    });
  });
}

describe('AnA RI resilience', () => {
  it('returns degraded mode response when gateway is unavailable', async () => {
    const res = await request('POST', '/api/ana-ri/chat', { message: 'Help with IND strategy' });
    expect(res.status).toBe(200);
    expect(res.body.degraded).toBe(true);
    expect(res.body.provider).toBe('degraded-fallback');
    expect(res.body.response).toContain('Degraded Mode');
  });
});
