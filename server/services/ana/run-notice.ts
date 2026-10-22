/**
 * The in-app notice a detached AnA turn sends when nobody is watching it
 * (AnA detach DT3, docs/design/ANA_DETACH_2026-10-08.md §5.5, D-5: in-app
 * only, read in TaskTray).
 *
 * Sent only for a turn that has DETACHED and is UNWATCHED (shared/ana/run-detach.ts
 * isWatchedNow), and only when:
 *   - it starts waiting on an approval: severity `warning`, "AnA is waiting for
 *     your approval";
 *   - it ends: "AnA finished your request", or "AnA stopped: {stop line}", with
 *     "{n} step(s) were not authorised and did not run." when n ≥ 1.
 * A person's own Stop sends nothing: they know.
 *
 * One createNotification to the asker, category `ana_turn` (a canonical
 * category, so it can be muted), naming the conversation as its record —
 * resource `chat_thread` and the thread id — with `actionUrl` the
 * conversation's address as a label hint. TaskTray opens it through the one
 * notification door every notice uses (NotificationOpenButton →
 * GET /api/mdx/notifications/:id/target), which checks the conversation is
 * the recipient's own. The body names the conversation
 * (noticeConversationName: its title, or when it started — never the
 * question's words) and nothing else: no parameter, no tool name. It expires
 * after ANA_TURN_NOTICE_TTL_MS (DT3 review, DP-84).
 * Every word is fixed copy from shared tables (stop-lines.ts, run-detach.ts);
 * no model writes one.
 *
 * Fire-and-forget: a notice that could not be written is logged, and the turn
 * is unaffected.
 *
 * @module server/services/ana/run-notice
 */

import {
  ANA_TURN_NOTICE,
  ANA_TURN_NOTICE_RESOURCE,
  ANA_TURN_NOTICE_TTL_MS,
  ANA_TURN_NOTIFICATION_CATEGORY,
  noticeConversationName,
} from '@shared/ana/run-detach';
import { notAuthorisedLine, stopLineText } from '@shared/ana/stop-lines';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('ana-run-notice');

export type RunNoticeKind = { kind: 'approval' } | { kind: 'ended'; stoppedReason: string | null; notAuthorised: number };

export interface RunNoticeContent {
  severity: 'info' | 'warning';
  title: string;
  body: string;
  actionUrl: string | null;
}

/** The conversation's address in the product (client routing.ts locationForConversation). */
export function conversationActionUrl(threadId: string | null): string | null {
  return threadId ? `/concept2cure/conversation-thread/${encodeURIComponent(threadId)}` : null;
}

/**
 * What the notice says, or null when nothing is to be sent (a person's own
 * Stop). Pure: the one place the words are put together.
 */
export function runNoticeContent(
  notice: RunNoticeKind,
  conversation: { threadId: string | null; threadTitle: string | null; startedAtMs: number },
): RunNoticeContent | null {
  const name = noticeConversationName(conversation);
  const actionUrl = conversationActionUrl(conversation.threadId);
  if (notice.kind === 'approval') {
    return { severity: 'warning', title: ANA_TURN_NOTICE.approval, body: name, actionUrl };
  }
  const reason = notice.stoppedReason;
  if (reason === 'cancelled') return null;
  const line = reason && reason !== 'no_more_tools' ? stopLineText(reason) : null;
  // "Stopped: nobody was watching…" → "AnA stopped: nobody was watching…".
  const title = line
    ? `AnA ${line.charAt(0).toLowerCase()}${line.slice(1).replace(/\.$/, '')}`
    : ANA_TURN_NOTICE.finished;
  const held = notAuthorisedLine(notice.notAuthorised);
  return { severity: line ? 'warning' : 'info', title, body: held ? `${name} · ${held}` : name, actionUrl };
}

/** Send it to the asker. Never throws. */
export async function sendRunNotice(input: {
  organizationId: number;
  userId: number;
  threadId: string | null;
  startedAtMs: number;
  notice: RunNoticeKind;
  /** The conversation's title, read in the caller's tenant scope. */
  readThreadTitle: (threadId: string) => Promise<string | null>;
}): Promise<void> {
  try {
    const threadTitle = input.threadId ? await input.readThreadTitle(input.threadId).catch(() => null) : null;
    const content = runNoticeContent(input.notice, {
      threadId: input.threadId,
      threadTitle,
      startedAtMs: input.startedAtMs,
    });
    if (!content) return;
    const { createNotification } = await import('../notifications/notification-service.js');
    await createNotification({
      organizationId: input.organizationId,
      recipientUserId: input.userId,
      category: ANA_TURN_NOTIFICATION_CATEGORY,
      severity: content.severity,
      title: content.title,
      body: content.body,
      ...(input.threadId ? { resourceType: ANA_TURN_NOTICE_RESOURCE, resourceId: input.threadId } : {}),
      actionUrl: content.actionUrl,
      // It points at a turn; it does not keep it (DT3 review, DP-84).
      expiresAt: new Date(Date.now() + ANA_TURN_NOTICE_TTL_MS),
    });
  } catch (err: any) {
    log.error(`[ana-run-notice] notice not written: ${err?.message}`);
  }
}
