/**
 * @fileoverview Morning Briefing Panel
 * @module concept2cure/components/canvas/MorningBriefingPanel
 * @version 1.0.0
 *
 * @description
 * Full morning briefing panel with overnight alerts, priorities, and intelligence.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  TrendingUp,
  Target,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useMorningBriefing, useRealTimeAlerts } from '../../hooks/useRegulatoryIntelligence';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface MorningBriefingPanelProps {
  userId: string;
  onAlertClick?: (alertId: string) => void;
  onPriorityClick?: (priorityId: string) => void;
  onClose?: () => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERT CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface AlertCardProps {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  source: string;
  title: string;
  message: string;
  timestamp: string;
  actionLabel?: string;
  onAction?: () => void;
}

const AlertCard: React.FC<AlertCardProps> = ({
  priority,
  source,
  title,
  message,
  timestamp,
  actionLabel,
  onAction,
}) => {
  const priorityConfig = {
    CRITICAL: {
      bg: 'bg-red-50 border-red-200',
      icon: 'bg-red-100 text-red-600',
      badge: 'bg-red-600 text-white',
    },
    HIGH: {
      bg: 'bg-amber-50 border-amber-200',
      icon: 'bg-amber-100 text-amber-600',
      badge: 'bg-amber-600 text-white',
    },
    MEDIUM: {
      bg: 'bg-amber-50 border-amber-200',
      icon: 'bg-amber-100 text-amber-600',
      badge: 'bg-amber-600 text-white',
    },
    LOW: {
      bg: 'bg-blue-50 border-blue-200',
      icon: 'bg-blue-100 text-blue-600',
      badge: 'bg-stone-800 text-white',
    },
    INFO: {
      bg: 'bg-stone-50 border-stone-200',
      icon: 'bg-stone-100 text-stone-600',
      badge: 'bg-stone-600 text-white',
    },
  };

  const config = priorityConfig[priority];

  return (
    <div className={cn("rounded-xl border p-4", config.bg)}>
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", config.icon)}>
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded", config.badge)}>
              {priority}
            </span>
            <span className="text-xs text-stone-500">{source}</span>
          </div>
          <h4 className="font-medium text-stone-900 text-sm mb-1">{title}</h4>
          <p className="text-xs text-stone-600 line-clamp-2">{message}</p>
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-stone-400">{timestamp}</span>
            {actionLabel && (
              <button
                onClick={onAction}
                className="text-xs font-medium text-blue-600 hover:text-stone-700 flex items-center gap-1"
              >
                {actionLabel}
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PRIORITY ITEM
// ═══════════════════════════════════════════════════════════════════════════════

interface PriorityItemProps {
  title: string;
  project?: string;
  deadline?: string;
  urgency: 'now' | 'today' | 'this_week';
  onClick?: () => void;
}

const PriorityItem: React.FC<PriorityItemProps> = ({
  title,
  project,
  deadline,
  urgency,
  onClick,
}) => {
  const urgencyConfig = {
    now: { label: 'Now', color: 'bg-red-500' },
    today: { label: 'Today', color: 'bg-amber-500' },
    this_week: { label: 'This Week', color: 'bg-stone-600' },
  };

  const config = urgencyConfig[urgency];

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-stone-200 hover:border-stone-300 hover:shadow-sm transition-all text-left group"
    >
      <div className={cn("w-2 h-2 rounded-full flex-shrink-0", config.color)} />
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-stone-900 text-sm truncate">{title}</h4>
        <div className="flex items-center gap-2 text-xs text-stone-500">
          {project && <span>{project}</span>}
          {deadline && (
            <>
              <span>•</span>
              <span>{deadline}</span>
            </>
          )}
        </div>
      </div>
      <div className={cn(
        "px-2 py-0.5 rounded text-xs font-semibold text-white",
        config.color
      )}>
        {config.label}
      </div>
    </button>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// STAT WIDGET
// ═══════════════════════════════════════════════════════════════════════════════

interface StatWidgetProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  change?: { value: number; direction: 'up' | 'down' };
  color: 'emerald' | 'amber' | 'blue' | 'red' | 'purple';
}

const StatWidget: React.FC<StatWidgetProps> = ({
  icon: Icon,
  label,
  value,
  change,
  color,
}) => {
  const colorConfig = {
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-stone-100 text-stone-600',
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-3", colorConfig[color])}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-base font-semibold text-stone-900">{value}</div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-stone-500">{label}</span>
        {change && (
          <span className={cn(
            "text-xs font-medium",
            change.direction === 'up' ? 'text-emerald-600' : 'text-red-600'
          )}>
            {change.direction === 'up' ? '↑' : '↓'} {change.value}%
          </span>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const MorningBriefingPanel: React.FC<MorningBriefingPanelProps> = ({
  userId,
  onAlertClick,
  onPriorityClick,
  onClose,
  className,
}) => {
  // Fetch briefing data
  const { data: briefing, isLoading, error } = useMorningBriefing(userId);
  const { alerts: realTimeAlerts, connectionStatus } = useRealTimeAlerts(userId);

  // Combine static and real-time alerts
  const allAlerts = useMemo(() => {
    const staticAlerts = briefing?.alerts || [];
    return [...realTimeAlerts, ...staticAlerts].slice(0, 10);
  }, [briefing?.alerts, realTimeAlerts]);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-64", className)}>
        <div className="animate-pulse text-stone-400">Loading briefing...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex items-center justify-center h-64 text-red-500", className)}>
        Failed to load briefing
      </div>
    );
  }

  const stats = briefing?.stats;
  const priorities = briefing?.priorities || [];

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-medium text-stone-900">Morning Briefing</h2>
          <p className="text-sm text-stone-500">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "w-2 h-2 rounded-full",
            connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-red-500'
          )} />
          <span className="text-xs text-stone-500">
            {connectionStatus === 'connected' ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatWidget
            icon={AlertTriangle}
            label="Active Alerts"
            value={stats.criticalAlerts}
            color={stats.criticalAlerts > 0 ? 'red' : 'emerald'}
          />
          <StatWidget
            icon={FileText}
            label="New Guidances"
            value={stats.newGuidances}
            color="blue"
          />
          <StatWidget
            icon={Bell}
            label="Recalls"
            value={stats.activeRecalls}
            color="amber"
          />
          <StatWidget
            icon={TrendingUp}
            label="Competitor Events"
            value={stats.competitorEvents}
            color="purple"
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
        {/* Left: Alerts */}
        <div className="flex flex-col min-h-0">
          <h3 className="font-semibold text-stone-900 mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-stone-400" />
            Overnight Alerts
          </h3>
          <div className="flex-1 space-y-3 overflow-y-auto pr-2">
            {allAlerts.length > 0 ? (
              allAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  priority={alert.priority}
                  source={alert.source.replace('_', ' ')}
                  title={alert.title}
                  message={alert.message}
                  timestamp={new Date(alert.timestamp).toLocaleTimeString()}
                  actionLabel={alert.actionLabel}
                  onAction={() => onAlertClick?.(alert.id)}
                />
              ))
            ) : (
              <div className="text-center py-8 text-stone-500">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
                <p className="font-medium">All Clear</p>
                <p className="text-sm">No overnight alerts</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Priorities */}
        <div className="flex flex-col min-h-0">
          <h3 className="font-semibold text-stone-900 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-stone-400" />
            Today's Priorities
          </h3>
          <div className="flex-1 space-y-2 overflow-y-auto pr-2">
            {priorities.length > 0 ? (
              priorities.map((priority) => (
                <PriorityItem
                  key={priority.id}
                  title={priority.title}
                  project={priority.project}
                  deadline={priority.deadline}
                  urgency={priority.urgency}
                  onClick={() => onPriorityClick?.(priority.id)}
                />
              ))
            ) : (
              <div className="text-center py-8 text-stone-500">
                <Sparkles className="w-10 h-10 mx-auto mb-2 text-amber-500" />
                <p className="font-medium">You're Ahead</p>
                <p className="text-sm">No urgent priorities</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MorningBriefingPanel;
