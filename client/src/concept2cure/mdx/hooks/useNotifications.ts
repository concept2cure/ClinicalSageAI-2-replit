/**
 * useNotifications — wires the shell's notification bell to its backend.
 *
 * The TopBar shipped a bell button with no handler, while
 * `/api/mdx/notifications` served a full feed — list, unread count,
 * mark-read, mark-all-read — with no client consumer at all
 * (docs/MDX_SURFACE_COVERAGE_FINDING.md). A control that looks live and
 * does nothing is the same defect class as the fake signature this
 * branch removed: the difference is only that the bell lies by silence
 * rather than by claiming success. This hook makes it real.
 *
 * The unread badge is polled on a slow interval so a signal raised
 * elsewhere (an MDR clock crossing a threshold, an approval assigned)
 * appears without a reload. Mark-read is optimistic but reconciles
 * against the server response, so a failed write does not leave a
 * notification looking read when it is not — an unread compliance
 * signal silently marked read is exactly the wrong direction to fail.
 */

import { useCallback, useEffect, useState } from 'react';
import { useFetchJson } from './useFetchJson';
import { getAuthToken, getOrgId } from '@/utils/authToken';
import { toDataState, type DataState } from '../lib/dataState';

export interface NotificationItem {
  id: number;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string | null;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

interface Row { [k: string]: unknown }

function adapt(r: Row): NotificationItem {
  const sev = String(r.severity);
  return {
    id: Number(r.id),
    category: String(r.category ?? ''),
    severity: sev === 'warning' || sev === 'critical' ? sev : 'info',
    title: String(r.title ?? ''),
    body: typeof r.body === 'string' ? r.body : null,
    actionUrl: typeof r.action_url === 'string' ? r.action_url : null,
    readAt: typeof r.read_at === 'string' ? r.read_at : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : '',
  };
}

/** Slow poll — a badge, not a chat. 60s keeps it fresh without churn. */
const UNREAD_POLL_MS = 60_000;

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  const orgId = getOrgId();
  if (token) h.Authorization = `Bearer ${token}`;
  if (orgId) h['x-organization-id'] = orgId;
  return h;
}

export interface UseNotificationsResult {
  /** Full list, resolved only while the panel is open. */
  items: DataState<NotificationItem[]>;
  /** Unread badge count. 0 until the first poll resolves. */
  unread: number;
  /** True while the panel is open (list is fetched). */
  open: boolean;
  setOpen: (open: boolean) => void;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => void;
}

export function useNotifications(): UseNotificationsResult {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  /* The list is fetched only when the panel is open — passing null to
     useFetchJson disables the request entirely while closed. */
  const listUrl = open ? '/api/mdx/notifications' : null;
  const { data, loading, error, refresh } = useFetchJson<{ data?: Row[] }>(listUrl);
  const rows = data?.data ? data.data.map(adapt) : null;
  const items = toDataState(rows, loading, error);

  /* Poll the unread count independently of the panel, so the badge is
     live even when the list is closed. */
  const pollUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/mdx/notifications/unread-count', {
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const body = (await res.json()) as { data?: { unread?: number } };
      const n = body?.data?.unread;
      if (typeof n === 'number') setUnread(n);
    } catch {
      /* A failed badge poll is not worth surfacing — the next tick
         retries, and a stale count is better than an error banner on
         the shell chrome. */
    }
  }, []);

  useEffect(() => {
    void pollUnread();
    const t = setInterval(() => void pollUnread(), UNREAD_POLL_MS);
    return () => clearInterval(t);
  }, [pollUnread]);

  const markRead = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`/api/mdx/notifications/${id}/read`, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
        });
        if (!res.ok) return; // leave it unread; the server said no
        /* Reconcile from the server rather than assuming: re-poll the
           count and re-fetch the open list. */
        void pollUnread();
        refresh();
      } catch {
        /* Network failure — the row stays unread, which is the safe
           direction. */
      }
    },
    [pollUnread, refresh],
  );

  const markAllRead = useCallback(async () => {
    try {
      const res = await fetch('/api/mdx/notifications/read-all', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!res.ok) return;
      void pollUnread();
      refresh();
    } catch {
      /* stays unread */
    }
  }, [pollUnread, refresh]);

  return { items, unread, open, setOpen, markRead, markAllRead, refresh };
}
