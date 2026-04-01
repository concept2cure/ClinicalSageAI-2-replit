import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import telemetryRouter from '../../server/routes/beta-telemetry.routes';

const telemetryDir = path.resolve(process.cwd(), 'test-results', 'beta-telemetry');
const telemetryFile = path.join(telemetryDir, 'events.ndjson');

describe('beta telemetry routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/telemetry/beta-workspace', telemetryRouter);

  beforeEach(async () => {
    await fs.mkdir(telemetryDir, { recursive: true });
    await fs.writeFile(telemetryFile, '', 'utf8');
  });

  it('accepts valid route_entry event and persists to ndjson', async () => {
    const response = await request(app).post('/api/telemetry/beta-workspace/event').send({
      type: 'route_entry',
      route: '/concept2cure/project/p1/510k',
      activeTab: 'device-intake',
      projectId: 'p1',
      detail: { sparseState: false },
    });

    expect(response.status).toBe(202);

    const file = await fs.readFile(telemetryFile, 'utf8');
    expect(file).toContain('route_entry');
    expect(file).toContain('device-intake');
  });

  it('rejects invalid event payload', async () => {
    const response = await request(app).post('/api/telemetry/beta-workspace/event').send({
      type: 'not_a_real_event',
      route: '',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_event_payload');
  });

  it('filters events by type and projectId', async () => {
    await request(app).post('/api/telemetry/beta-workspace/event').send({
      type: 'route_entry',
      route: '/concept2cure/project/p1/510k',
      activeTab: 'device-intake',
      projectId: 'p1',
    });

    await request(app).post('/api/telemetry/beta-workspace/event').send({
      type: 'export_attempt',
      route: '/concept2cure/project/p2/510k',
      activeTab: 'submission',
      projectId: 'p2',
      detail: { format: 'submission_package' },
    });

    const response = await request(app)
      .get('/api/telemetry/beta-workspace/events')
      .query({ type: 'export_attempt', projectId: 'p2' });

    expect(response.status).toBe(200);
    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0].type).toBe('export_attempt');
    expect(String(response.body.events[0].projectId)).toBe('p2');
  });
});
