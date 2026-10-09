/**
 * A model call a tool makes inside an AnA run is listed under that run (D6).
 *
 * Until 2026-09-26 only the stream's own two dispatches carried runId. A tool
 * handler's gateway calls (batch drafting, analysis) wrote run_id NULL, so
 * `WHERE run_id = X` returned the orchestration rounds and not the calls that
 * produced drafted content. The stream now opens a run scope around each tool
 * handler, and the ledger reads it when a request names no run itself.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const logSpies = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => logSpies,
  createContextLogger: () => logSpies,
  logger: logSpies,
  default: logSpies,
}));

import { AIGateway } from '../gateway';
import { runWithRunScope } from '../run-scope';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../providers/org-placement';
import type { GatewayRequest } from '../types';

function gatewayWithFakeDispatch(): AIGateway {
  const gateway = new AIGateway({
    deterministicMode: false,
    auditEnabled: true,
    providers: [{ name: 'anthropic', enabled: true, apiKey: 'x', defaultModel: 'x', models: [] }],
    policy: {
      maxTokensPerRequest: 16000,
      maxRequestsPerMinutePerOrg: 10_000,
      maxRequestsPerMinutePerUser: 10_000,
      blockedPatterns: [],
      contentFilters: true,
      piiDetection: true,
    },
  });
  vi.spyOn(gateway as any, 'dispatchProvider').mockImplementation(async (model: any) => ({
    content: 'ok',
    provider: model.provider,
    model: model.model,
    requestId: 'fake',
    latencyMs: 1,
    cached: false,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
  }));
  return gateway;
}

const call: GatewayRequest = {
  taskType: 'document_drafting',
  organizationId: 42,
  messages: [{ role: 'user', content: 'Draft section 2.5.4.' }],
};
const rows = (g: AIGateway): any[] => (g as any).auditLogger.getRecentEntries();

afterEach(() => {
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
});

describe('the run scope', () => {
  it('a call made inside a run scope is recorded under that run', async () => {
    setOrgPlacementResolver({ resolve: async () => null });
    const gateway = gatewayWithFakeDispatch();

    await runWithRunScope({ runId: 'run-9' }, () => gateway.route(call));

    expect(rows(gateway).find(r => r.success)?.runId).toBe('run-9');
  });

  it('a request that names its own run keeps it', async () => {
    setOrgPlacementResolver({ resolve: async () => null });
    const gateway = gatewayWithFakeDispatch();

    await runWithRunScope({ runId: 'run-9' }, () => gateway.route({ ...call, runId: 'run-own' }));

    expect(rows(gateway).find(r => r.success)?.runId).toBe('run-own');
  });

  it('outside any run, nothing is invented', async () => {
    setOrgPlacementResolver({ resolve: async () => null });
    const gateway = gatewayWithFakeDispatch();

    await gateway.route(call);

    expect(rows(gateway).find(r => r.success)?.runId).toBeUndefined();
  });

  it('the stream opens the run scope around every tool handler it runs', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../routes/ana-ri/stream.ts'), 'utf8');
    expect(src).toMatch(/runWithRunScope\(\{ runId \}, \(\) =>\s*handler\(toolUse\.input, \{/);
  });
});
