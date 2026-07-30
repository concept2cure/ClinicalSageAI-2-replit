import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The beta-ops telemetry surface was redesigned during the route rename
// (beta-ops-telemetry.ts -> beta-telemetry.routes.ts): the old
// GET /beta-telemetry endpoint (env-flag gated, admin-only reset) was replaced
// by an unauthenticated beta-feedback intake surface mounted at
// /api/telemetry/beta-workspace (see server/betaRouteManifest.ts):
//
//   POST /event  — zod-validated telemetry event, 202 on accept, 400 on bad payload
//   POST /issue  — zod-validated beta issue report, 202 on accept, 400 on bad payload
//   GET  /events — in-memory event feed, filterable by ?type= and ?projectId=
//
// Persistence is fail-open NDJSON appends under test-results/beta-telemetry/
// with a 50MB cap. fs is mocked here so tests never touch disk.

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  appendFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  ...fsMocks,
  default: fsMocks,
}));

import betaTelemetryRouter from '../../server/routes/beta-telemetry.routes';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  // The router requires a resolved tenant context (organization_context_required
  // 403 otherwise — see server/routes/beta-telemetry.routes.ts). In production
  // mountBetaSafeRoutes runs the auth/tenant middleware ahead of this router;
  // here we stand in a fixed org so the event/issue/feed logic is exercised.
  app.use((req, _res, next) => {
    (req as express.Request & { tenantContext?: { organizationId: number } }).tenantContext = {
      organizationId: 1,
    };
    next();
  });
  // Mirrors mountBetaSafeRoutes in server/betaRouteManifest.ts.
  app.use('/api/telemetry/beta-workspace', betaTelemetryRouter);
  return app;
};

const validEvent = {
  type: 'route_entry',
  route: '/client-portal/510k',
  activeTab: 'predicates',
  projectId: 'proj-1',
  detail: { source: 'test' },
};

const validIssue = {
  summary: 'Export button renders disabled on the predicates tab',
  severity: 'high',
  route: '/client-portal/510k',
  projectId: 'proj-2',
};

describe('beta workspace telemetry routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMocks.mkdir.mockResolvedValue(undefined);
    fsMocks.appendFile.mockResolvedValue(undefined);
    // Default: log file does not exist yet.
    fsMocks.stat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  describe('POST /event', () => {
    it('accepts a valid event with 202 and persists it with a server timestamp', async () => {
      const res = await request(buildApp())
        .post('/api/telemetry/beta-workspace/event')
        .send(validEvent);

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ ok: true });

      expect(fsMocks.appendFile).toHaveBeenCalledTimes(1);
      const [logPath, line] = fsMocks.appendFile.mock.calls[0];
      expect(String(logPath)).toContain('beta-telemetry');
      const persisted = JSON.parse(String(line));
      expect(persisted.type).toBe('route_entry');
      expect(persisted.route).toBe('/client-portal/510k');
      expect(typeof persisted.createdAt).toBe('string');
    });

    it('rejects an unknown event type with 400 and does not persist', async () => {
      const res = await request(buildApp())
        .post('/api/telemetry/beta-workspace/event')
        .send({ ...validEvent, type: 'not_a_real_type' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ ok: false, error: 'invalid_event_payload' });
      expect(fsMocks.appendFile).not.toHaveBeenCalled();
    });

    it('rejects an event missing the required route with 400', async () => {
      const { route: _route, ...withoutRoute } = validEvent;
      const res = await request(buildApp())
        .post('/api/telemetry/beta-workspace/event')
        .send(withoutRoute);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ ok: false, error: 'invalid_event_payload' });
      expect(fsMocks.appendFile).not.toHaveBeenCalled();
    });

    it('fails open (still 202) when persistence throws', async () => {
      fsMocks.appendFile.mockRejectedValue(new Error('disk full'));

      const res = await request(buildApp())
        .post('/api/telemetry/beta-workspace/event')
        .send(validEvent);

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ ok: true });
    });

    it('stops appending to the log once the 50MB cap is reached but still accepts events', async () => {
      fsMocks.stat.mockResolvedValue({ size: 50 * 1024 * 1024 });

      const res = await request(buildApp())
        .post('/api/telemetry/beta-workspace/event')
        .send(validEvent);

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ ok: true });
      expect(fsMocks.appendFile).not.toHaveBeenCalled();
    });
  });

  describe('POST /issue', () => {
    it('accepts a valid issue with 202 and persists it tagged type=issue', async () => {
      const res = await request(buildApp())
        .post('/api/telemetry/beta-workspace/issue')
        .send(validIssue);

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ ok: true });

      expect(fsMocks.appendFile).toHaveBeenCalledTimes(1);
      const persisted = JSON.parse(String(fsMocks.appendFile.mock.calls[0][1]));
      expect(persisted.type).toBe('issue');
      expect(persisted.severity).toBe('high');
      expect(typeof persisted.createdAt).toBe('string');
    });

    it('defaults severity to medium when omitted', async () => {
      const { severity: _severity, ...withoutSeverity } = validIssue;
      const res = await request(buildApp())
        .post('/api/telemetry/beta-workspace/issue')
        .send(withoutSeverity);

      expect(res.status).toBe(202);
      const persisted = JSON.parse(String(fsMocks.appendFile.mock.calls[0][1]));
      expect(persisted.severity).toBe('medium');
    });

    it('rejects a too-short summary with 400 and does not persist', async () => {
      const res = await request(buildApp())
        .post('/api/telemetry/beta-workspace/issue')
        .send({ ...validIssue, summary: 'bad' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ ok: false, error: 'invalid_issue_payload' });
      expect(fsMocks.appendFile).not.toHaveBeenCalled();
    });

    it('rejects an invalid severity with 400', async () => {
      const res = await request(buildApp())
        .post('/api/telemetry/beta-workspace/issue')
        .send({ ...validIssue, severity: 'catastrophic' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ ok: false, error: 'invalid_issue_payload' });
    });
  });

  describe('GET /events', () => {
    // The router keeps events in module-level memory shared across tests in
    // this file, so feed assertions use unique projectIds and filters.
    it('returns accepted events, filterable by projectId', async () => {
      const app = buildApp();
      const projectId = `proj-get-${Date.now()}`;

      await request(app)
        .post('/api/telemetry/beta-workspace/event')
        .send({ ...validEvent, projectId });
      await request(app)
        .post('/api/telemetry/beta-workspace/event')
        .send({ ...validEvent, type: 'export_attempt', projectId });

      const res = await request(app)
        .get('/api/telemetry/beta-workspace/events')
        .query({ projectId });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(res.body.events).toHaveLength(2);
      expect(res.body.events.map((e: { type: string }) => e.type)).toEqual([
        'route_entry',
        'export_attempt',
      ]);
    });

    it('filters by type, including issues reported via POST /issue', async () => {
      const app = buildApp();
      const projectId = `proj-type-${Date.now()}`;

      await request(app)
        .post('/api/telemetry/beta-workspace/event')
        .send({ ...validEvent, projectId });
      await request(app)
        .post('/api/telemetry/beta-workspace/issue')
        .send({ ...validIssue, projectId });

      const res = await request(app)
        .get('/api/telemetry/beta-workspace/events')
        .query({ projectId, type: 'issue' });

      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(1);
      expect(res.body.events[0].type).toBe('issue');
      expect(res.body.events[0].summary).toBe(validIssue.summary);
    });

    it('returns an empty list for a projectId with no events', async () => {
      const res = await request(buildApp())
        .get('/api/telemetry/beta-workspace/events')
        .query({ projectId: 'proj-never-used' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ events: [] });
    });
  });
});
