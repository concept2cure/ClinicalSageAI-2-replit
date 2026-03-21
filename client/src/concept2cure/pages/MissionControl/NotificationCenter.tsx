/**
 * @fileoverview Notification Center — Centralized notification hub for Mission Control
 * @module concept2cure/pages/MissionControl/NotificationCenter
 *
 * Unified notification stream with filtering, preferences, and action-required
 * triage. Groups by date, supports mark-read, dismiss, and navigation to source.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  X,
  Settings,
  Eye,
  AlertTriangle,
  FileText,
  MessageSquare,
  Clock,
  Shield,
  ArrowRight,
  RefreshCw,
  AtSign,
  ChevronRight,
  Mail,
  MailX,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Trash2,
  Inbox,
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type NotificationType =
  | 'review_assigned'
  | 'approval_requested'
  | 'risk_alert'
  | 'artifact_updated'
  | 'comment_mention'
  | 'deadline_warning'
  | 'stale_dependency'
  | 'authority_response';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  source: string;
  sourceId?: number;
  timestamp: Date;
  read: boolean;
  actionRequired: boolean;
  mentionsUser: boolean;
}

type TabKey = 'all' | 'unread' | 'action_required' | 'mentions';

interface NotificationPreferences {
  enabledTypes: Record<NotificationType, boolean>;
  emailDigest: 'none' | 'daily' | 'weekly';
  doNotDisturb: boolean;
  channels: { inApp: boolean; email: boolean };
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const TYPE_CONFIG: Record<
  NotificationType,
  { icon: typeof Bell; color: string; bgColor: string; label: string }
> = {
  review_assigned: {
    icon: Eye,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Review Assigned',
  },
  approval_requested: {
    icon: CheckCheck,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    label: 'Approval Requested',
  },
  risk_alert: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    label: 'Risk Alert',
  },
  artifact_updated: {
    icon: FileText,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    label: 'Artifact Updated',
  },
  comment_mention: {
    icon: AtSign,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    label: 'Mention',
  },
  deadline_warning: {
    icon: Clock,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    label: 'Deadline Warning',
  },
  stale_dependency: {
    icon: RefreshCw,
    color: 'text-zinc-600',
    bgColor: 'bg-zinc-100',
    label: 'Stale Dependency',
  },
  authority_response: {
    icon: Shield,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Authority Response',
  },
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'action_required', label: 'Action Required' },
  { key: 'mentions', label: 'Mentions' },
];

/* -------------------------------------------------------------------------- */
/*  Mock Data                                                                 */
/* -------------------------------------------------------------------------- */

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    type: 'review_assigned',
    title: 'Module 3.2.S Drug Substance review assigned to you',
    description:
      'Dr. Patel has assigned you as primary reviewer for the updated Module 3.2.S Drug Substance specification. Target completion: 3 business days.',
    source: 'Review Command Center',
    sourceId: 101,
    timestamp: hoursAgo(1),
    read: false,
    actionRequired: true,
    mentionsUser: false,
  },
  {
    id: 'n2',
    type: 'risk_alert',
    title: 'Critical risk escalated: GMP compliance gap',
    description:
      'A critical manufacturing risk has been flagged for Program Atlas. The GMP compliance gap at Site B requires immediate mitigation review.',
    source: 'Risk Cockpit',
    sourceId: 42,
    timestamp: hoursAgo(2),
    read: false,
    actionRequired: true,
    mentionsUser: false,
  },
  {
    id: 'n3',
    type: 'comment_mention',
    title: '@you mentioned in CMC discussion thread',
    description:
      'Sarah Chen: "@you Could you confirm the stability data cutoff for the 36-month time point? We need this for Section 3.2.P.8."',
    source: 'Artifact Graph',
    sourceId: 205,
    timestamp: hoursAgo(3),
    read: false,
    actionRequired: false,
    mentionsUser: true,
  },
  {
    id: 'n4',
    type: 'approval_requested',
    title: 'Approval requested: Nonclinical Overview v2.1',
    description:
      'James Rivera submitted the Nonclinical Overview (Module 2.4) for your final sign-off. All reviewer comments have been addressed.',
    source: 'Dossier View',
    sourceId: 78,
    timestamp: hoursAgo(5),
    read: false,
    actionRequired: true,
    mentionsUser: false,
  },
  {
    id: 'n5',
    type: 'deadline_warning',
    title: 'IND submission deadline in 5 days',
    description:
      'Program Atlas IND filing target is March 21, 2026. Two artifacts (Module 2.5, Module 2.7) remain in draft status.',
    source: 'Route Planner',
    sourceId: 10,
    timestamp: hoursAgo(8),
    read: true,
    actionRequired: true,
    mentionsUser: false,
  },
  {
    id: 'n6',
    type: 'artifact_updated',
    title: 'Clinical Summary updated to v3.0',
    description:
      'Module 2.7 Clinical Summary has been updated with revised efficacy tables and safety narrative per FDA feedback.',
    source: 'Artifact Graph',
    sourceId: 310,
    timestamp: hoursAgo(12),
    read: true,
    actionRequired: false,
    mentionsUser: false,
  },
  {
    id: 'n7',
    type: 'authority_response',
    title: 'FDA pre-IND meeting minutes received',
    description:
      'Official meeting minutes from the Type B pre-IND meeting (Feb 28, 2026) have been uploaded. Key feedback items require team triage.',
    source: 'Rules Manager',
    sourceId: 55,
    timestamp: daysAgo(1),
    read: true,
    actionRequired: false,
    mentionsUser: false,
  },
  {
    id: 'n8',
    type: 'stale_dependency',
    title: 'Stale reference: Genotoxicity study report',
    description:
      'Module 2.6.6 references a genotoxicity study report (v1.2) that has been superseded by v2.0. Update the cross-reference.',
    source: 'Artifact Graph',
    sourceId: 188,
    timestamp: daysAgo(1),
    read: false,
    actionRequired: true,
    mentionsUser: false,
  },
  {
    id: 'n9',
    type: 'comment_mention',
    title: '@you tagged in regulatory strategy thread',
    description:
      'Mark Thompson: "@you FYI the EMA scientific advice feedback diverges from FDA on the primary endpoint. We should align before Module 2.5 finalization."',
    source: 'Review Command Center',
    sourceId: 112,
    timestamp: daysAgo(1),
    read: true,
    actionRequired: false,
    mentionsUser: true,
  },
  {
    id: 'n10',
    type: 'review_assigned',
    title: 'Peer review requested: Pharmacology Written Summary',
    description:
      'You have been added as a secondary reviewer for Module 2.6.2. The primary reviewer (Dr. Lee) has already approved with minor comments.',
    source: 'Review Command Center',
    sourceId: 134,
    timestamp: daysAgo(2),
    read: true,
    actionRequired: false,
    mentionsUser: false,
  },
  {
    id: 'n11',
    type: 'approval_requested',
    title: 'QP sign-off needed: Batch analysis certificates',
    description:
      'Three batch analysis certificates for drug product lots DP-001 through DP-003 require Qualified Person sign-off before Module 3.2.P.5 can be finalized.',
    source: 'Dossier View',
    sourceId: 91,
    timestamp: daysAgo(3),
    read: true,
    actionRequired: false,
    mentionsUser: false,
  },
  {
    id: 'n12',
    type: 'deadline_warning',
    title: 'Quarterly safety report due in 10 days',
    description:
      'The DSUR periodic safety update for Program Atlas is due March 26, 2026. Data lock is scheduled for March 20.',
    source: 'Route Planner',
    sourceId: 15,
    timestamp: daysAgo(4),
    read: true,
    actionRequired: false,
    mentionsUser: false,
  },
];

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabledTypes: {
    review_assigned: true,
    approval_requested: true,
    risk_alert: true,
    artifact_updated: true,
    comment_mention: true,
    deadline_warning: true,
    stale_dependency: true,
    authority_response: true,
  },
  emailDigest: 'daily',
  doNotDisturb: false,
  channels: { inApp: true, email: true },
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function relativeTime(date: Date): string {
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Yesterday';
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dateGroup(date: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (itemDate.getTime() >= today.getTime()) return 'Today';
  if (itemDate.getTime() >= yesterday.getTime()) return 'Yesterday';
  return 'Earlier';
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export const NotificationCenter: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);

  /* ------ Derived data ------ */

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const todayCount = useMemo(
    () => notifications.filter((n) => dateGroup(n.timestamp) === 'Today').length,
    [notifications],
  );

  const actionRequiredCount = useMemo(
    () => notifications.filter((n) => n.actionRequired && !n.read).length,
    [notifications],
  );

  const categoryBreakdown = useMemo(() => {
    const counts: Partial<Record<NotificationType, number>> = {};
    notifications.forEach((n) => {
      counts[n.type] = (counts[n.type] || 0) + 1;
    });
    return counts;
  }, [notifications]);

  const filtered = useMemo(() => {
    let list = [...notifications];
    switch (activeTab) {
      case 'unread':
        list = list.filter((n) => !n.read);
        break;
      case 'action_required':
        list = list.filter((n) => n.actionRequired);
        break;
      case 'mentions':
        list = list.filter((n) => n.mentionsUser);
        break;
    }
    list.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return list;
  }, [notifications, activeTab]);

  const grouped = useMemo(() => {
    const groups: { label: string; items: Notification[] }[] = [];
    const map = new Map<string, Notification[]>();
    for (const n of filtered) {
      const g = dateGroup(n.timestamp);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(n);
    }
    for (const label of ['Today', 'Yesterday', 'Earlier']) {
      const items = map.get(label);
      if (items && items.length > 0) groups.push({ label, items });
    }
    return groups;
  }, [filtered]);

  /* ------ Actions ------ */

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const toggleType = useCallback((type: NotificationType) => {
    setPreferences((prev) => ({
      ...prev,
      enabledTypes: {
        ...prev.enabledTypes,
        [type]: !prev.enabledTypes[type],
      },
    }));
  }, []);

  /* ------ Render ------ */

  return (
    <div className="flex-1 flex flex-col bg-[#FAFAF9] overflow-hidden">
      {/* Header */}
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className="w-5 h-5 text-blue-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold px-1">
                {unreadCount}
              </span>
            )}
          </div>
          <h1 className="text-base font-semibold text-zinc-900">Notification Center</h1>
          <span className="text-xs text-zinc-500">{notifications.length} total</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark All Read
          </button>
          <button
            onClick={() => setShowPreferences(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors duration-150"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Stats Strip */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-zinc-200 p-4">
              <p className="text-xs text-zinc-500 mb-1">Unread</p>
              <p className="text-2xl font-semibold text-blue-600">{unreadCount}</p>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 p-4">
              <p className="text-xs text-zinc-500 mb-1">Today</p>
              <p className="text-2xl font-semibold text-zinc-900">{todayCount}</p>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 p-4">
              <p className="text-xs text-zinc-500 mb-1">Action Required</p>
              <p className="text-2xl font-semibold text-orange-600">{actionRequiredCount}</p>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 p-4">
              <p className="text-xs text-zinc-500 mb-1">Categories</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(categoryBreakdown).map(([type, count]) => {
                  const cfg = TYPE_CONFIG[type as NotificationType];
                  return (
                    <span
                      key={type}
                      className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', cfg.bgColor, cfg.color)}
                    >
                      {count}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-white rounded-xl border border-zinc-200 p-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              let badge: number | null = null;
              if (tab.key === 'unread') badge = unreadCount;
              if (tab.key === 'action_required') badge = actionRequiredCount;
              if (tab.key === 'mentions')
                badge = notifications.filter((n) => n.mentionsUser).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors flex-1 justify-center',
                    isActive
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-600 hover:bg-zinc-50',
                  )}
                >
                  {tab.label}
                  {badge !== null && badge > 0 && (
                    <span
                      className={cn(
                        'min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-xs font-semibold px-1',
                        isActive ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-600',
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Notification List */}
          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-16 text-center">
              <Bell className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
              <p className="text-sm font-medium text-zinc-700 mb-1">You're all caught up!</p>
              <p className="text-xs text-zinc-400">
                No notifications match the current filter. Check back later.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.label}>
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                    {group.label}
                  </h3>
                  <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100">
                    {group.items.map((notification) => {
                      const cfg = TYPE_CONFIG[notification.type];
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={notification.id}
                          className={cn(
                            'p-4 transition-colors hover:bg-zinc-50/50 group',
                            !notification.read && 'border-l-[3px] border-l-blue-500',
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                                cfg.bgColor,
                              )}
                            >
                              <Icon className={cn('w-4 h-4', cfg.color)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <p
                                      className={cn(
                                        'text-sm text-zinc-900 truncate',
                                        !notification.read && 'font-semibold',
                                      )}
                                    >
                                      {notification.title}
                                    </p>
                                    {notification.actionRequired && (
                                      <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                                        Action Required
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-zinc-500 line-clamp-2 mb-1.5">
                                    {notification.description}
                                  </p>
                                  <div className="flex items-center gap-3">
                                    <span
                                      className={cn(
                                        'text-xs px-1.5 py-0.5 rounded-full font-medium',
                                        cfg.bgColor,
                                        cfg.color,
                                      )}
                                    >
                                      {cfg.label}
                                    </span>
                                    <span className="text-xs text-zinc-400 flex items-center gap-1">
                                      <ChevronRight className="w-2.5 h-2.5" />
                                      {notification.source}
                                    </span>
                                    <span className="text-xs text-zinc-400">
                                      {relativeTime(notification.timestamp)}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                  {!notification.read && (
                                    <button
                                      onClick={() => markRead(notification.id)}
                                      title="Mark as read"
                                      className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 transition-colors duration-150"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    title="Go to source"
                                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors duration-150"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => dismiss(notification.id)}
                                    title="Dismiss"
                                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors duration-150"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preferences Panel (slide-out) */}
      {showPreferences && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex justify-end"
          onClick={() => setShowPreferences(false)}
        >
          <div
            className="w-full max-w-md bg-white h-full shadow-xl overflow-y-auto animate-in slide-in-from-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-zinc-500" />
                <h2 className="text-sm font-semibold text-zinc-900">Notification Preferences</h2>
              </div>
              <button
                onClick={() => setShowPreferences(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors duration-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-8">
              {/* Do Not Disturb */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Do Not Disturb
                </h3>
                <div className="bg-white rounded-xl border border-zinc-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <BellOff className="w-4 h-4 text-zinc-500" />
                      <div>
                        <p className="text-sm font-medium text-zinc-900">Pause notifications</p>
                        <p className="text-xs text-zinc-500">Silence all in-app alerts</p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setPreferences((p) => ({ ...p, doNotDisturb: !p.doNotDisturb }))
                      }
                      className="flex-shrink-0"
                    >
                      {preferences.doNotDisturb ? (
                        <ToggleRight className="w-8 h-8 text-blue-600" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-zinc-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Channel Preferences */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Channels
                </h3>
                <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Inbox className="w-4 h-4 text-zinc-500" />
                      <div>
                        <p className="text-sm font-medium text-zinc-900">In-App</p>
                        <p className="text-xs text-zinc-500">Show in notification center</p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setPreferences((p) => ({
                          ...p,
                          channels: { ...p.channels, inApp: !p.channels.inApp },
                        }))
                      }
                      className="flex-shrink-0"
                    >
                      {preferences.channels.inApp ? (
                        <ToggleRight className="w-8 h-8 text-blue-600" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-zinc-400" />
                      )}
                    </button>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-zinc-500" />
                      <div>
                        <p className="text-sm font-medium text-zinc-900">Email</p>
                        <p className="text-xs text-zinc-500">Send to your inbox</p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setPreferences((p) => ({
                          ...p,
                          channels: { ...p.channels, email: !p.channels.email },
                        }))
                      }
                      className="flex-shrink-0"
                    >
                      {preferences.channels.email ? (
                        <ToggleRight className="w-8 h-8 text-blue-600" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-zinc-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Email Digest */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Email Digest Frequency
                </h3>
                <div className="bg-white rounded-xl border border-zinc-200 p-1 flex gap-1">
                  {(['none', 'daily', 'weekly'] as const).map((freq) => (
                    <button
                      key={freq}
                      onClick={() => setPreferences((p) => ({ ...p, emailDigest: freq }))}
                      className={cn(
                        'flex-1 px-3 py-2 text-xs font-medium rounded-lg capitalize transition-colors duration-150',
                        preferences.emailDigest === freq
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-600 hover:bg-zinc-50',
                      )}
                    >
                      {freq === 'none' ? (
                        <span className="flex items-center justify-center gap-1">
                          <MailX className="w-3 h-3" />
                          None
                        </span>
                      ) : (
                        freq
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notification Types */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Notification Types
                </h3>
                <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100">
                  {(Object.keys(TYPE_CONFIG) as NotificationType[]).map((type) => {
                    const cfg = TYPE_CONFIG[type];
                    const Icon = cfg.icon;
                    const enabled = preferences.enabledTypes[type];
                    return (
                      <div key={type} className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'w-7 h-7 rounded-lg flex items-center justify-center',
                              cfg.bgColor,
                            )}
                          >
                            <Icon className={cn('w-3.5 h-3.5', cfg.color)} />
                          </div>
                          <span className="text-sm text-zinc-700">{cfg.label}</span>
                        </div>
                        <button onClick={() => toggleType(type)} className="flex-shrink-0">
                          {enabled ? (
                            <ToggleRight className="w-8 h-8 text-blue-600" />
                          ) : (
                            <ToggleLeft className="w-8 h-8 text-zinc-400" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
