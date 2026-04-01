import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/export_logger', () => ({
  logExportAction: vi.fn(async () => undefined),
  getExportLogs: vi.fn(async () => []),
}));

import registerNotificationRoutes from '../../server/routes/notification_routes';

describe('notification routes production governance guards', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('returns 503 for comparison notification in production when protocol metadata is unavailable', async () => {
    process.env.NODE_ENV = 'production';

    const app = express();
    app.use(express.json());
    registerNotificationRoutes(app);

    const res = await request(app)
      .post('/api/notify/send-comparison-notification')
      .send({
        user_id: 'u-1',
        user_email: 'user@example.com',
        protocol_id: 'p-1',
        version: 'v1',
      });

    expect(res.status).toBe(503);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: false,
        message: 'Protocol metadata service unavailable in this environment',
      }),
    );
  });
});
