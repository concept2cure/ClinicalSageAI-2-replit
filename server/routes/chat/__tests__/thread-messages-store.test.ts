/**
 * Resuming a conversation reads the store the conversation lives in.
 *
 * Two thread stores are live: chat_threads/chat_messages (AnA RI — every thread
 * the rail, the thread surface and the project landing mint) and
 * ai_threads/ai_messages (submission chat, evidence-ask). The messages handler
 * verified against ai_threads and then read chat_messages, so every AnA thread
 * answered "Thread not found" and resumed empty. Found in a browser, since the
 * surface's own test mocks the fetch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { listThreadMessages, patchThread } from '../threads';

function res() {
  const r: any = { statusCode: 200, body: null };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: unknown) => { r.body = b; return r; };
  return r;
}

/** The resolver's UNION, answered for whichever store is said to own the id. */
function storeIs(store: 'chat' | 'ai' | null, rest: (sql: string) => unknown = () => ({ rows: [] })) {
  query.mockImplementation(async (sql: string) => {
    if (/FROM chat_threads .*UNION ALL/s.test(sql)) return { rows: store ? [{ store }] : [] };
    return rest(sql);
  });
}

beforeEach(() => { query.mockReset(); });

describe('GET /threads/:id/messages', () => {
  it('serves an AnA thread its own transcript from chat_messages', async () => {
    storeIs('chat', (sql) =>
      /FROM chat_messages/.test(sql)
        ? { rows: [{ role: 'user', content: 'Draft the Module 2.5 clinical overview' }, { role: 'assistant', content: 'Here is a first pass.' }] }
        : { rows: [] });
    const r = res();
    await listThreadMessages({ params: { threadId: 'ana-ri_1' }, query: {}, tenantId: 7 } as any, r);
    expect(r.statusCode).toBe(200);
    expect(r.body.messages.map((m: any) => m.role)).toEqual(['user', 'assistant']);
  });

  it('serves a submission-chat thread from ai_messages, not from the other store', async () => {
    storeIs('ai', (sql) =>
      /FROM ai_messages/.test(sql) ? { rows: [{ role: 'user', content: 'From the ai store' }] } : { rows: [] });
    const r = res();
    await listThreadMessages({ params: { threadId: 'ai_1' }, query: {}, tenantId: 7 } as any, r);
    expect(r.body.messages).toEqual([{ role: 'user', content: 'From the ai store' }]);
    expect(query.mock.calls.some(([sql]) => /FROM chat_messages/.test(String(sql)))).toBe(false);
  });

  it('resolves the store org-scoped, so another tenant\'s thread is not found', async () => {
    storeIs(null);
    const r = res();
    await listThreadMessages({ params: { threadId: 'ana-ri_1' }, query: {}, tenantId: 7 } as any, r);
    expect(r.statusCode).toBe(404);
    // A 404 must not carry an empty transcript: "cannot be read" is not "said nothing".
    expect(r.body).not.toHaveProperty('messages');
    const [, params] = query.mock.calls[0];
    expect(params).toEqual(['ana-ri_1', 7]);
  });

  it('needs an organization', async () => {
    const r = res();
    await listThreadMessages({ params: { threadId: 'ana-ri_1' }, query: {} } as any, r);
    expect(r.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('PATCH /thread/:id', () => {
  it('updates the store the thread lives in', async () => {
    storeIs('chat');
    const r = res();
    await patchThread({ params: { threadId: 'ana-ri_1' }, body: { title: 'Renamed' }, tenantId: 7 } as any, r);
    expect(r.body).toEqual({ ok: true, threadId: 'ana-ri_1', project_id: undefined });
    expect(query.mock.calls.some(([sql]) => /UPDATE chat_threads/.test(String(sql)))).toBe(true);
    expect(query.mock.calls.some(([sql]) => /UPDATE ai_threads/.test(String(sql)))).toBe(false);
  });

  it('refuses a program UUID at the integer project column rather than failing with a 500', async () => {
    storeIs('chat');
    const r = res();
    await patchThread({ params: { threadId: 'ana-ri_1' }, body: { project_id: '0f3c1a2b-1111-4222-8333-444455556666' }, tenantId: 7 } as any, r);
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe('THREAD_PROJECT_INVALID');
    expect(query.mock.calls.some(([sql]) => /UPDATE/.test(String(sql)))).toBe(false);
  });
});
