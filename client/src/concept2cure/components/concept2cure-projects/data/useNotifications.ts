/**
 * useNotifications — fetches and manages user notifications.
 *
 * GET  /api/concept2cure/notifications/my
 * POST /api/concept2cure/notifications/:id/read
 * POST /api/concept2cure/notifications/mark-all-read
 */
import { useCallback, useEffect, useState } from 'react';
import { getAuthHeaders } from '@/utils/authToken';
import type { Notification } from '../types';

interface ApiNotification {
  id: number | string;
  type?: string;
  status?: string;
  title?: string;
  body?: string;
  priority?: string;
  entityType?: string;
  entityId?: string;
  projectId?: number | string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

function relTime(iso: string | undefined): string {
  if (!iso) return 'recently';
  const d = Date.now() - new Date(iso).getTime();
  if (!isFinite(d) || d < 0) return 'just now';
  const m = Math.floor(d / 60_000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function typeToKind(type: string | undefined): Notification['kind'] {
  if (!type) return 'lifecycle';
  const t = type.toLowerCase();
  if (t.includes('agency') || t.includes('fda') || t.includes('ema')) return 'agency';
  if (t.includes('predicate')) return 'predicate';
  if (t.includes('supplier') || t.includes('vendor')) return 'supplier';
  if (t.includes('review') || t.includes('sign') || t.includes('approval')) return 'review';
  return 'lifecycle';
}

function typeToIcon(type: string | undefined): string {
  const kind = typeToKind(type);
  if (kind === 'agency') return 'globe';
  if (kind === 'predicate') return 'search';
  if (kind === 'supplier') return 'clip';
  if (kind === 'review') return 'shieldCheck';
  return 'bell';
}

function adaptNotification(n: ApiNotification): Notification {
  const projectId = n.projectId != null ? `proj_${n.projectId}` : '';
  return {
    id: String(n.id),
    when: relTime(n.createdAt),
    unread: n.status === 'unread',
    kind: typeToKind(n.type),
    icon: typeToIcon(n.type),
    title: n.title || 'Notification',
    sub: n.body || '',
    project: projectId,
  };
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    ...init,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAllRead: () => Promise<void>;
  refetch: () => void;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<{
      notifications?: ApiNotification[];
      unreadCount?: number;
      data?: { notifications?: ApiNotification[]; unreadCount?: number };
    }>('/api/concept2cure/notifications/my?limit=50')
      .then(res => {
        if (cancelled) return;
        const raw = res.notifications ?? (res as any)?.data?.notifications ?? [];
        setNotifications(raw.map(adaptNotification));
        setUnreadCount(res.unreadCount ?? (res as any)?.data?.unreadCount ?? 0);
      })
      .catch(() => { if (!cancelled) setNotifications([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tick]);

  const markAllRead = useCallback(async () => {
    setNotifications(ns => ns.map(n => ({ ...n, unread: false })));
    setUnreadCount(0);
    try {
      await apiFetch('/api/concept2cure/notifications/mark-all-read', { method: 'POST' });
    } catch { /* optimistic update already applied */ }
  }, []);

  return { notifications, unreadCount, loading, markAllRead, refetch };
}
