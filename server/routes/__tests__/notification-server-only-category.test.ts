/**
 * 'ana_turn' is written by the platform only (AnA detach DT3 review, DP-84).
 *
 * The category joined the shared vocabulary for the notice a detached AnA
 * turn sends its person (server/services/ana/run-notice.ts). That vocabulary
 * is also what POST /api/mdx/notifications — which any member may call, with
 * any recipient — and AnA's fire_notification tool accept, so a member, or a
 * prompt-injected model, could put a forged "AnA finished your request" into a
 * colleague's inbox. Neither may mint it now. A person may still mute it
 * (PUT /notification-subscriptions/ana_turn): that is a preference, not a
 * notice.
 */
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ created: [] as Array<Record<string, unknown>> }));

vi.mock('../../services/notifications/notification-service.js', () => ({
  createNotification: vi.fn(async (input: Record<string, unknown>) => {
    io.created.push(input);
    return io.created.length;
  }),
  listNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  archive: vi.fn(),
  unreadCount: vi.fn(),
}));
vi.mock('../../services/notifications/notification-service', () => ({
  createNotification: vi.fn(async (input: Record<string, unknown>) => {
    io.created.push(input);
    return io.created.length;
  }),
  listNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  archive: vi.fn(),
  unreadCount: vi.fn(),
}));
vi.mock('../../db/requestDb', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requestPgClient: vi.fn(() => ({ query: vi.fn(async () => ({ rows: [{ category: 'ana_turn', in_app_enabled: false }], rowCount: 1 })) })),
}));

import { CREATABLE_NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORIES } from '@shared/constants/notifications';

let app: express.Express;
beforeAll(async () => {
  const { default: router } = await import('../mdx-notifications');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 5, organizationId: 9 };
    next();
  });
  app.use('/api/mdx', router);
});
beforeEach(() => {
  io.created = [];
});

const notice = (category: string) => ({ category, severity: 'info', title: 'AnA finished your request', recipientUserId: 6 });

describe('POST /api/mdx/notifications', () => {
  it("refuses 'ana_turn': the platform alone writes it", async () => {
    const res = await request(app).post('/api/mdx/notifications').send(notice('ana_turn'));
    expect(res.status).toBe(422);
    expect(io.created).toEqual([]);
  });

  it('still creates any other category', async () => {
    const res = await request(app).post('/api/mdx/notifications').send(notice('system'));
    expect(res.status).toBe(201);
    expect(io.created).toHaveLength(1);
  });
});

describe("a person may still mute 'ana_turn'", () => {
  it('PUT /notification-subscriptions/ana_turn passes the category check', async () => {
    const res = await request(app).put('/api/mdx/notification-subscriptions/ana_turn').send({ inAppEnabled: false });
    expect(res.status).not.toBe(422);
  });
});

describe("AnA's fire_notification", () => {
  it("is not offered 'ana_turn', and refuses it by name", async () => {
    const { FIRE_NOTIFICATION: fire } = await import('../../services/ana/notifications-study-memory-tool-defs.js');
    const offered = (fire.input_schema as any).properties.category.enum as string[];
    expect(offered).not.toContain('ana_turn');
    expect(offered).toEqual([...CREATABLE_NOTIFICATION_CATEGORIES]);
    expect(NOTIFICATION_CATEGORIES).toContain('ana_turn');

    const { getToolHandler } = await import('../../services/ana/AnaToolExecutor.js');
    const out = JSON.parse(await getToolHandler('fire_notification')!(
      { category: 'ana_turn', severity: 'info', title: 'AnA finished your request', recipient_user_id: 6 },
      { organizationId: 9, userId: 5 } as never,
    ));
    expect(out.error).toBeTruthy();
    expect(io.created).toEqual([]);
  });
});
