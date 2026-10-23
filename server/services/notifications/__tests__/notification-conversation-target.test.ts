/**
 * A detached AnA turn's notice opens its conversation through the one
 * notification door every notice uses (AnA detach DT3, design §5.5): the
 * server resolves GET /api/mdx/notifications/:id/target to a verified record
 * target. Before DT3 the resolver had no conversation case, so the notice's
 * conversation could be opened only by a second, client-side door in TaskTray
 * that nothing on the server checked.
 *
 * The client here is a script of the two reads the resolver makes — the
 * recipient's notice, then the thread — so what is asserted is the decision:
 * the recipient's own conversation in their organisation opens; a colleague's,
 * one in no row of this organisation, and a malformed id do not.
 */
import { describe, expect, it } from 'vitest';
import { NotificationTargetRefusal, resolveNotificationRecordTarget } from '../notification-record-target';
import { isNotificationRecordTarget } from '../../../../shared/types/notification-navigation';
import { NOTIFICATION_CATEGORIES } from '../../../../shared/constants/notifications';
import { ANA_TURN_NOTIFICATION_CATEGORY } from '../../../../shared/ana/run-detach';

function client(thread: Record<string, unknown> | null, resource: Record<string, unknown> = { resource_type: 'chat_thread', resource_id: 'ana-ri_1760_abc' }) {
  const seen: Array<{ sql: string; params: unknown[] }> = [];
  return {
    seen,
    query: async (sql: string, params: unknown[] = []) => {
      seen.push({ sql, params });
      if (/FROM mdx_notifications/.test(sql)) {
        return { rows: [{ action_url: '/concept2cure/conversation-thread/ana-ri_1760_abc', current_org_role: 'member', ...resource }] };
      }
      if (/FROM chat_threads/.test(sql)) return { rows: thread ? [thread] : [] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

const ask = (c: ReturnType<typeof client>) =>
  resolveNotificationRecordTarget({ client: c, organizationId: 7, userId: 42, email: null, notificationId: 11 });

describe('a conversation notice resolves through the canonical notification target', () => {
  it("the recipient's own conversation opens as a verified conversation target", async () => {
    const c = client({ user_id: 42, program_id: null });
    const target = await ask(c);
    expect(target).toEqual({ surface: 'conversation-thread', label: 'Open conversation', params: { threadId: 'ana-ri_1760_abc' }, programId: null });
    expect(isNotificationRecordTarget(target)).toBe(true);
    const thread = c.seen.find(q => /FROM chat_threads/.test(q.sql))!;
    expect(thread.params, 'the thread is read in the recipient organisation').toEqual(['ana-ri_1760_abc', 7]);
  });

  it("a colleague's conversation is unavailable (404), and so is one with no row in this organisation", async () => {
    await expect(ask(client({ user_id: 43, program_id: null }))).rejects.toMatchObject({ status: 404 });
    await expect(ask(client(null))).rejects.toBeInstanceOf(NotificationTargetRefusal);
    await expect(ask(client(null))).rejects.toMatchObject({ status: 404 });
  });

  it('a malformed conversation id is not a record this version can open (422)', async () => {
    await expect(ask(client({ user_id: 42 }, { resource_type: 'chat_thread', resource_id: '../evil' }))).rejects.toMatchObject({ status: 422 });
  });

  it('the shared contract admits the conversation surface with its one parameter, and nothing else', () => {
    expect(isNotificationRecordTarget({ surface: 'conversation-thread', label: 'Open conversation', params: { threadId: 'th_9' }, programId: null })).toBe(true);
    expect(isNotificationRecordTarget({ surface: 'conversation-thread', label: 'Open conversation', params: { threadId: 'th_9', redirect: '/x' }, programId: null })).toBe(false);
    expect(isNotificationRecordTarget({ surface: 'conversation-thread', label: 'Open conversation', params: { threadId: '' }, programId: null })).toBe(false);
  });

  it("the notice's category is a canonical one, so it can be muted and validated", () => {
    expect(NOTIFICATION_CATEGORIES).toContain(ANA_TURN_NOTIFICATION_CATEGORY);
  });
});
