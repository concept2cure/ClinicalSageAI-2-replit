/**
 * NotificationCenter — Bell icon + dropdown for concept2cure notifications.
 * Fetches from Phase 13 notification APIs.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  X,
  AlertTriangle,
  MessageSquare,
  Clock,
  CheckCircle2,
  ListTodo,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface Notification {
  notificationId: string;
  notificationType: string;
  title: string;
  body: string;
  severity: string;
  status: string;
  actionUrl?: string;
  actorName?: string;
  dueAt?: string;
  createdAt: string;
  readAt?: string;
  dismissedAt?: string;
  escalationLevel?: number;
}

interface NotificationCenterProps {
  projectId?: string;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function getNotifIcon(type: string) {
  switch (type) {
    case 'assignment':
      return <ListTodo className="w-3 h-3 text-blue-500" />;
    case 'due_soon':
      return <Clock className="w-3 h-3 text-amber-500" />;
    case 'overdue':
      return <AlertTriangle className="w-3 h-3 text-red-500" />;
    case 'approval_needed':
      return <CheckCircle2 className="w-3 h-3 text-violet-500" />;
    case 'changes_requested':
      return <AlertTriangle className="w-3 h-3 text-amber-600" />;
    case 'thread_reply':
      return <MessageSquare className="w-3 h-3 text-blue-500" />;
    case 'thread_resolved':
    case 'task_resolved':
      return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
    case 'escalation':
      return <AlertTriangle className="w-3 h-3 text-red-600" />;
    default:
      return <Bell className="w-3 h-3 text-zinc-400" />;
  }
}

export function NotificationCenter({ projectId }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'unread' | 'all'>('unread');
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const status = tab === 'unread' ? 'unread' : undefined;
      const params = new URLSearchParams({ limit: '50' });
      if (status) params.set('status', status);
      if (projectId) params.set('projectId', projectId);
      const res = await fetch(`/api/concept2cure/notifications/my?${params}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.data?.notifications || []);
        setUnreadCount(data.data?.unreadCount ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [tab, projectId]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Poll unread count every 30s
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/concept2cure/notifications/my?limit=1&status=unread', {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.data?.unreadCount ?? 0);
        }
      } catch {
        // silent
      }
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markRead = async (notifId: string) => {
    try {
      await fetch(`/api/concept2cure/notifications/${notifId}/read`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      setNotifications(prev =>
        prev.map(n =>
          n.notificationId === notifId
            ? { ...n, status: 'read', readAt: new Date().toISOString() }
            : n
        )
      );
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {
      // silent
    }
  };

  const dismiss = async (notifId: string) => {
    try {
      await fetch(`/api/concept2cure/notifications/${notifId}/dismiss`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      setNotifications(prev => prev.filter(n => n.notificationId !== notifId));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {
      // silent
    }
  };

  const markAllRead = async () => {
    try {
      await fetch('/api/concept2cure/notifications/mark-all-read', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      setNotifications(prev =>
        prev.map(n => ({ ...n, status: 'read', readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch {
      // silent
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'p-1 rounded relative',
          open ? 'text-blue-600 bg-blue-50' : 'text-zinc-400 hover:text-blue-600 hover:bg-blue-50'
        )}
        title="Notifications"
      >
        <Bell className="w-3 h-3" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[12px] h-3 px-0.5 bg-red-500 text-white text-[7px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-zinc-200 rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 bg-zinc-50/50">
            <span className="text-[11px] font-semibold text-zinc-700">Notifications</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[8px] text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                  title="Mark all read"
                >
                  <CheckCheck className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-zinc-100">
            {(['unread', 'all'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 py-1 text-[9px] font-medium capitalize',
                  tab === t
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-zinc-400 hover:text-zinc-600'
                )}
              >
                {t === 'unread' ? `Unread (${unreadCount})` : 'All'}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="text-[10px] text-zinc-400 text-center py-6">
                {tab === 'unread' ? 'No unread notifications' : 'No notifications'}
              </p>
            ) : (
              notifications.map(n => (
                <div
                  key={n.notificationId}
                  className={cn(
                    'flex items-start gap-2 px-3 py-2 border-b border-zinc-50 hover:bg-zinc-50 transition-colors group',
                    n.status === 'unread' && 'bg-blue-50/30'
                  )}
                >
                  <div className="mt-0.5 shrink-0">{getNotifIcon(n.notificationType)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium text-zinc-800 truncate">{n.title}</p>
                    <p className="text-[9px] text-zinc-500 line-clamp-2">{n.body}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[8px] text-zinc-400">{formatTimeAgo(n.createdAt)}</span>
                      {n.severity === 'critical' && (
                        <span className="text-[7px] bg-red-100 text-red-700 px-1 rounded font-medium">
                          CRITICAL
                        </span>
                      )}
                      {n.severity === 'warning' && (
                        <span className="text-[7px] bg-amber-100 text-amber-700 px-1 rounded font-medium">
                          WARNING
                        </span>
                      )}
                      {(n.escalationLevel ?? 0) > 0 && (
                        <span className="text-[7px] bg-red-100 text-red-700 px-1 rounded font-medium">
                          L{n.escalationLevel}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {n.status === 'unread' && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          markRead(n.notificationId);
                        }}
                        className="p-0.5 text-zinc-400 hover:text-blue-600 rounded"
                        title="Mark read"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        dismiss(n.notificationId);
                      }}
                      className="p-0.5 text-zinc-400 hover:text-red-500 rounded"
                      title="Dismiss"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationCenter;
