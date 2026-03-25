import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';

vi.mock('../../server/db', () => ({
  pool: null,
}));

vi.mock('../../server/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/middleware/tenantContext', () => ({
  tenantContextMiddleware: (req: any, _res: any, next: any) => {
    req.tenantContext = req.tenantContext || { organizationId: req.headers['x-tenant-id'] || 'default' };
    next();
  },
  requireOrganizationContext: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));

import router from '../../server/routes/enterprise-integrations';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/integrations', router);
  return app;
}

async function request(
  method: 'GET' | 'POST',
  path: string,
  body?: any,
  headers: Record<string, string> = {}
) {
  const app = buildApp();
  const http = await import('http');

  return new Promise<{ status: number; body: any }>((resolve) => {
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
          headers: {
            ...(body ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            } : {}),
            ...headers,
          },
        },
        (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => { data += chunk; });
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

describe('Enterprise Integrations Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects connect requests that miss provider-required fields', async () => {
    const res = await request('POST', '/api/integrations/jira/connect', {
      authType: 'api_key',
      config: { apiToken: 'secret' },
    }, { 'x-tenant-id': 'org-1' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.missingFields).toContain('baseUrl');
    expect(res.body.missingFields).toContain('email');
  });

  it('stores and lists integrations with masked secret fields', async () => {
    const connect = await request('POST', '/api/integrations/slack/connect', {
      authType: 'api_key',
      config: { botToken: 'xoxb-123456-secret' },
    }, { 'x-tenant-id': 'org-2' });

    expect(connect.status).toBe(200);
    expect(connect.body.success).toBe(true);

    const list = await request('GET', '/api/integrations', undefined, { 'x-tenant-id': 'org-2' });
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(1);

    const slack = list.body.data.find((i: any) => i.id === 'slack');
    expect(slack).toBeTruthy();
    expect(slack.config.botToken).toContain('*');
    expect(slack.config.botToken).not.toContain('xoxb-123456-secret');
  });

  it('isolates integration records by tenant', async () => {
    await request('POST', '/api/integrations/docusign/connect', {
      authType: 'oauth',
      config: { accountId: 'acc-1', clientId: 'cid-1' },
    }, { 'x-tenant-id': 'tenant-a' });

    const tenantA = await request('GET', '/api/integrations', undefined, { 'x-tenant-id': 'tenant-a' });
    const tenantB = await request('GET', '/api/integrations', undefined, { 'x-tenant-id': 'tenant-b' });

    expect(tenantA.status).toBe(200);
    expect(tenantB.status).toBe(200);
    expect(tenantA.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(tenantB.body.meta.total).toBe(0);
  });

  it('returns provider catalog with required fields', async () => {
    const res = await request('GET', '/api/integrations/catalog', undefined, { 'x-tenant-id': 'catalog-org' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    const jira = res.body.data.find((p: any) => p.id === 'jira');
    expect(jira).toBeTruthy();
    expect(jira.requiredFields).toContain('baseUrl');
    expect(jira.requiredFields).toContain('apiToken');
  });

  it('returns tenant KPI summary metrics', async () => {
    await request('POST', '/api/integrations/slack/connect', {
      authType: 'api_key',
      config: { botToken: 'xoxb-metrics' },
    }, { 'x-tenant-id': 'metrics-org' });

    await request('POST', '/api/integrations/slack/sync', {}, { 'x-tenant-id': 'metrics-org' });

    const metrics = await request('GET', '/api/integrations/metrics/summary?hours=24', undefined, {
      'x-tenant-id': 'metrics-org',
    });

    expect(metrics.status).toBe(200);
    expect(metrics.body.success).toBe(true);
    expect(metrics.body.data.connectorsConfigured).toBeGreaterThanOrEqual(1);
    expect(metrics.body.data.sync.totalRuns).toBeGreaterThanOrEqual(1);
    expect(metrics.body.data.sync).toHaveProperty('successRate');
  });

  it('stores encrypted credential references and never returns plaintext secrets', async () => {
    const save = await request('POST', '/api/integrations/jira/credentials', {
      secrets: {
        apiToken: 'jira-secret-token',
        email: 'user@example.com',
      },
    }, { 'x-tenant-id': 'cred-org' });

    expect(save.status).toBe(200);
    expect(save.body.success).toBe(true);
    expect(save.body.data.credentialRef).toMatch(/^cred_jira_/);
    expect(save.body.data.storedKeys).toContain('apiToken');

    const list = await request('GET', '/api/integrations/jira/credentials', undefined, {
      'x-tenant-id': 'cred-org',
    });

    expect(list.status).toBe(200);
    expect(list.body.success).toBe(true);
    expect(list.body.data.credentials.length).toBeGreaterThan(0);
    expect(JSON.stringify(list.body)).not.toContain('jira-secret-token');
    expect(list.body.data.credentials[0]).toHaveProperty('credentialRef');
    expect(list.body.data.credentials[0]).toHaveProperty('keyVersion');
  });

  it('replays response for idempotent sync requests', async () => {
    await request('POST', '/api/integrations/slack/connect', {
      authType: 'api_key',
      config: { botToken: 'xoxb-token' },
    }, { 'x-tenant-id': 'idempo-org' });

    const first = await request('POST', '/api/integrations/slack/sync', {}, {
      'x-tenant-id': 'idempo-org',
      'x-idempotency-key': 'sync-123',
    });

    const second = await request('POST', '/api/integrations/slack/sync', {}, {
      'x-tenant-id': 'idempo-org',
      'x-idempotency-key': 'sync-123',
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.syncStarted).toBe(second.body.data.syncStarted);
    expect(first.body.receipt.executionId).toBeTruthy();
    expect(second.body.receipt.idempotentReplay).toBe(true);
  });

  it('records and returns sync run history', async () => {
    await request('POST', '/api/integrations/sharepoint/connect', {
      authType: 'oauth',
      config: { tenantDomain: 'contoso', clientId: 'sp-client' },
    }, { 'x-tenant-id': 'sync-org' });

    await request('POST', '/api/integrations/sharepoint/sync', {}, { 'x-tenant-id': 'sync-org' });

    const runs = await request('GET', '/api/integrations/sharepoint/sync/runs?limit=5', undefined, {
      'x-tenant-id': 'sync-org',
    });

    expect(runs.status).toBe(200);
    expect(runs.body.success).toBe(true);
    expect(Array.isArray(runs.body.data.runs)).toBe(true);
    expect(runs.body.data.runs.length).toBeGreaterThan(0);
    expect(runs.body.data.runs[0]).toHaveProperty('status');
  });

  it('returns per-integration health details', async () => {
    await request('POST', '/api/integrations/slack/connect', {
      authType: 'api_key',
      config: { botToken: 'xoxb-health-token' },
    }, { 'x-tenant-id': 'health-org' });

    const health = await request('GET', '/api/integrations/slack/health', undefined, {
      'x-tenant-id': 'health-org',
    });

    expect(health.status).toBe(200);
    expect(health.body.success).toBe(true);
    expect(health.body.data.integrationId).toBe('slack');
    expect(health.body.data).toHaveProperty('syncFreshness');
  });

  it('runs provider probes and returns last probe result', async () => {
    await request('POST', '/api/integrations/jira/connect', {
      authType: 'api_key',
      config: { baseUrl: 'https://jira.example.com', email: 'qa@example.com', apiToken: 'token' },
    }, { 'x-tenant-id': 'probe-org' });

    const run = await request('POST', '/api/integrations/jira/probe', {}, {
      'x-tenant-id': 'probe-org',
    });

    expect(run.status).toBe(200);
    expect(run.body.success).toBe(true);
    expect(run.body.data.status).toMatch(/healthy|degraded|unhealthy/);
    expect(Array.isArray(run.body.data.checks)).toBe(true);

    const last = await request('GET', '/api/integrations/jira/probe/last', undefined, {
      'x-tenant-id': 'probe-org',
    });

    expect(last.status).toBe(200);
    expect(last.body.success).toBe(true);
    expect(last.body.data.integrationId).toBe('jira');
    expect(last.body.data).toHaveProperty('timestamp');
  });

  it('queues async sync jobs and reports job status', async () => {
    await request('POST', '/api/integrations/slack/connect', {
      authType: 'api_key',
      config: { botToken: 'xoxb-async-token' },
    }, { 'x-tenant-id': 'async-org' });

    const enqueue = await request('POST', '/api/integrations/slack/sync/async', {}, {
      'x-tenant-id': 'async-org',
    });

    expect(enqueue.status).toBe(202);
    expect(enqueue.body.success).toBe(true);
    expect(enqueue.body.data.jobId).toBeTruthy();

    await new Promise(resolve => setTimeout(resolve, 60));

    const status = await request('GET', `/api/integrations/sync/jobs/${enqueue.body.data.jobId}`, undefined, {
      'x-tenant-id': 'async-org',
    });

    expect(status.status).toBe(200);
    expect(status.body.success).toBe(true);
    expect(status.body.data.status).toMatch(/running|completed|failed/);
  });
});
