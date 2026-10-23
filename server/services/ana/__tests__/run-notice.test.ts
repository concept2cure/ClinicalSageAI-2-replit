/**
 * The notice a detached, unwatched AnA turn sends (AnA detach §5.5, D-5): its
 * words, from fixed tables only, naming the conversation and nothing else.
 */
import { describe, expect, it, vi } from 'vitest';

const created = vi.hoisted(() => ({ rows: [] as Array<Record<string, any>> }));
vi.mock('../../notifications/notification-service.js', () => ({
  createNotification: async (row: Record<string, any>) => {
    created.rows.push(row);
    return 1;
  },
}));

import { runNoticeContent, sendRunNotice } from '../run-notice.js';
import { ANA_TURN_NOTICE_TTL_MS } from '@shared/ana/run-detach';

const at = Date.parse('2026-10-08T14:02:00Z');
const titled = { threadId: 't-1', threadTitle: 'Stability reports for the NDA', startedAtMs: at, question: 'Find every stability report' };
const untitled = { ...titled, threadTitle: null, question: 'Find every stability report in the vault and tell me which ones lack the 24-month time point please' };

describe('runNoticeContent', () => {
  it('finished: the title, the conversation by its title, and the link', () => {
    expect(runNoticeContent({ kind: 'ended', stoppedReason: 'no_more_tools', notAuthorised: 0 }, titled)).toEqual({
      severity: 'info',
      title: 'AnA finished your request',
      body: 'Stability reports for the NDA',
      actionUrl: '/concept2cure/conversation-thread/t-1',
    });
  });

  // DT3 review (DP-84): the question's words are not copied into a second
  // store; a conversation with no title is named by when it started.
  it('a conversation with no title is named by its start (UTC), never by the question', () => {
    const c = runNoticeContent({ kind: 'ended', stoppedReason: 'no_more_tools', notAuthorised: 0 }, untitled)!;
    expect(c.body).toBe('Your conversation started at 14:02 UTC');
    expect(c.body).not.toContain('stability');
  });

  it('a stop says its line: "AnA stopped: …"', () => {
    const titles = ['unattended_limit', 'server_shutdown', 'session_ended', 'admin_cancelled', 'budget_exhausted', 'approval_timeout'].map(
      r => runNoticeContent({ kind: 'ended', stoppedReason: r, notAuthorised: 0 }, titled)!.title,
    );
    expect(titles).toEqual([
      'AnA stopped: nobody was watching for 15 minutes',
      'AnA stopped: the server restarted for an update',
      'AnA stopped: the sign-in or access that started this turn ended',
      'AnA stopped by an administrator',
      'AnA stopped at the time limit',
      'AnA stopped: an approval was not answered',
    ]);
  });

  it('"1 step was not authorised and did not run." when a step was held back', () => {
    const c = runNoticeContent({ kind: 'ended', stoppedReason: 'approval_timeout', notAuthorised: 1 }, titled)!;
    expect(c.body).toBe('Stability reports for the NDA · 1 step was not authorised and did not run.');
    expect(runNoticeContent({ kind: 'ended', stoppedReason: null, notAuthorised: 2 }, titled)!.body).toMatch(/2 steps were not authorised/);
  });

  it("the person's own Stop sends nothing", () => {
    expect(runNoticeContent({ kind: 'ended', stoppedReason: 'cancelled', notAuthorised: 0 }, titled)).toBeNull();
  });

  it('an approval: a warning, with the conversation and no parameters or ids', () => {
    expect(runNoticeContent({ kind: 'approval' }, titled)).toEqual({
      severity: 'warning',
      title: 'AnA is waiting for your approval',
      body: 'Stability reports for the NDA',
      actionUrl: '/concept2cure/conversation-thread/t-1',
    });
  });
});

describe('sendRunNotice (DT3 review, DP-84)', () => {
  it('the notice expires, like the turn it points at, and carries no question text', async () => {
    created.rows = [];
    const before = Date.now();
    await sendRunNotice({
      organizationId: 7, userId: 3, threadId: 't-1', startedAtMs: at,
      notice: { kind: 'ended', stoppedReason: 'no_more_tools', notAuthorised: 0 },
      readThreadTitle: async () => null,
    });
    expect(created.rows).toHaveLength(1);
    const expiresAt = created.rows[0].expiresAt as Date;
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + ANA_TURN_NOTICE_TTL_MS);
    expect(ANA_TURN_NOTICE_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(JSON.stringify(created.rows[0])).not.toContain('stability');
  });
});
