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
    /* The ownership check resolves which STORE holds the thread and reads a
       `store` column (resolveThreadStore's UNION over chat_threads/ai_threads).
       This mock used to answer `{ id: 't1' }` — a shape from before that
       resolution existed — so `rows[0].store` was undefined, the handler
       answered 404 "Thread not found", and the transcript read this test exists
       to fail was never reached. A read failure reported as "no such thread" is
       the same fabrication as one reported as an empty transcript: an
       infrastructure error stated as a fact about the user's data. */
    query.mockResolvedValueOnce({ rows: [{ store: 'chat' }] });
    getThreadMessages.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(appWith(7)).get('/api/chat/threads/t1/messages');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('THREAD_MESSAGES_ERROR');
    expect(res.body.messages).toBeUndefined();
    // The 500 must come from the TRANSCRIPT read, not from an earlier step
    // failing for its own reasons — which is exactly how this test went blind.
    expect(getThreadMessages).toHaveBeenCalledWith('t1');
  });

  it('404s only when the thread genuinely resolves to no store', async () => {
    // The negative twin of the case above: with the resolution returning no
    // row, 404 is the honest answer — and it carries no `messages` list, so a
    // caller cannot read it as "this thread is empty".
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(appWith(7)).get('/api/chat/threads/t1/messages');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('THREAD_NOT_FOUND');
    expect(res.body.messages).toBeUndefined();
    expect(getThreadMessages).not.toHaveBeenCalled();
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
