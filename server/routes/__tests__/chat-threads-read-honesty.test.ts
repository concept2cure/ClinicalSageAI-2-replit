/**
 * GET /api/chat/threads and /api/chat/threads/:threadId/messages — read honesty.
 *
 * Both handlers used to answer 200 with an empty list on ANY caught failure
 * ({ threads: [] } / { messages: [] }). That is the SAME response the routes
 * give when the org genuinely has no conversations, so a broken query, a lost
 * connection, or an unprovisioned store rendered as "you have no history" — a
 * false-empty that reads to a user as data loss and to monitoring as a healthy
 * 200. These tests pin the corrected behaviour: an unprovisioned store answers
 * 503, any other failure answers 500, and neither ever carries a list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

const getThreadMessages = vi.fn();
vi.mock('../../services/chat-thread-helpers.js', () => ({
  getThreadMessages: (...a: unknown[]) => getThreadMessages(...a),
}));

import { listThreads, listThreadMessages } from '../chat/threads';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { tenantId: unknown }).tenantId = org;
    next();
  });
  app.get('/api/chat/threads', listThreads);
  app.get('/api/chat/threads/:threadId/messages', listThreadMessages);
  return app;
}

beforeEach(() => {
  query.mockReset();
  getThreadMessages.mockReset();
});

describe('GET /api/chat/threads', () => {
  it('returns the org rows on a healthy read', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 't1', title: 'Stability question' }] });
    const res = await request(appWith(7)).get('/api/chat/threads');
    expect(res.status).toBe(200);
    expect(res.body.threads).toHaveLength(1);
  });

  it('503s when the thread store is not provisioned — never a 200 empty list', async () => {
    query.mockRejectedValueOnce(
      Object.assign(new Error('relation "chat_threads" does not exist'), { code: '42P01' }),
    );
    const res = await request(appWith(7)).get('/api/chat/threads');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('THREAD_STORE_UNPROVISIONED');
    expect(res.body.threads).toBeUndefined();
  });

  it('500s on any other read failure — never a 200 empty list', async () => {
    query.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(appWith(7)).get('/api/chat/threads');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('THREAD_LIST_ERROR');
    expect(res.body.threads).toBeUndefined();
  });

  it('500s when the PROJECT-scoped ai_threads read fails (previously swallowed)', async () => {
    query.mockRejectedValueOnce(new Error('ai_threads join blew up'));
    const res = await request(appWith(7)).get('/api/chat/threads?project_id=42');
    expect(res.status).toBe(500);
    expect(res.body.threads).toBeUndefined();
  });
});

describe('GET /api/chat/threads/:threadId/messages', () => {
  it('500s when the transcript read fails — an unreadable thread is not an empty one', async () => {
    // Ownership check passes, then the message load fails.
    query.mockResolvedValueOnce({ rows: [{ id: 't1' }] });
    getThreadMessages.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(appWith(7)).get('/api/chat/threads/t1/messages');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('THREAD_MESSAGES_ERROR');
    expect(res.body.messages).toBeUndefined();
  });

  it('503s when the message store is not provisioned', async () => {
    query.mockRejectedValueOnce(
      Object.assign(new Error('relation "ai_threads" does not exist'), { code: '42P01' }),
    );
    const res = await request(appWith(7)).get('/api/chat/threads/t1/messages');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('THREAD_STORE_UNPROVISIONED');
    expect(res.body.messages).toBeUndefined();
  });
});
