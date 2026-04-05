/**
 * @fileoverview Morning Briefing - The Empathy Layer
 * @module concept2cure/components/dashboard/MorningBriefing
 * @version 1.0.0
 *
 * @description
 * The "Day Zero" greeting modal that:
 * - Makes the user feel welcome (not just "logged in")
 * - Provides critical overnight intelligence
 * - Sets the day's priorities
 * - Creates emotional connection with the platform
 *
 * THE SHERPA METAPHOR:
 * "Good morning, climber. Here is what happened on the mountain while you slept.
 * The weather has changed. Let me brief you before we continue the ascent."
 *
 * DESIGN PHILOSOPHY:
 * "Login is not a transaction. It's a greeting.
 * The platform should feel like a trusted advisor who was watching
 * the regulatory landscape while you rested."
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Sun,
  Moon,
  X,
  ArrowRight,
  Bell,
  Zap,
  AlertTriangle,
  TrendingUp,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Shield,
  Activity,
  ExternalLink,
} from 'lucide-react';
import { EnterpriseButton, Overline, Caption } from '../ui/enterprise';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type AlertPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type AlertSource = 
  | 'FDA_ENFORCEMENT'
  | 'FDA_GUIDANCE'
  | 'COMPETITOR'
  | 'PROJECT'
  | 'DEADLINE'
  | 'REVIEW'
  | 'SYSTEM';

export interface BriefingAlert {
  id: string;
  source: AlertSource;
  priority: AlertPriority;
  title: string;
  message: string;
  timestamp?: string;
  actionLabel?: string;
  actionUrl?: string;
  onClick?: () => void;
}

export interface TodaysPriority {
  id: string;
  title: string;
  project?: string;
  deadline?: string;
  urgency: 'now' | 'today' | 'this_week';
}

export interface MorningBriefingProps {
  userName?: string;
  alerts: BriefingAlert[];
  priorities?: TodaysPriority[];
  statsSnapshot?: {
    projectsActive: number;
    deadlinesThisWeek: number;
    pendingReviews: number;
    riskItems: number;
  };
  onClose: () => void;
  onAlertClick?: (alert: BriefingAlert) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const getGreeting = (): { greeting: string; icon: React.ReactNode } => {
  const hour = new Date().getHours();
  if (hour < 12) return { greeting: 'Good Morning', icon: <Sun className="text-stone-400" size={24} /> };
  if (hour < 18) return { greeting: 'Good Afternoon', icon: <Sun className="text-stone-400" size={24} /> };
  return { greeting: 'Good Evening', icon: <Moon className="text-stone-300" size={24} /> };
};

const SOURCE_CONFIG: Record<AlertSource, {
  label: string;
  color: string;
  icon: React.ReactNode;
}> = {
  FDA_ENFORCEMENT: { label: 'FDA ENFORCEMENT', color: 'text-stone-700 bg-stone-100', icon: <Shield className="w-3 h-3" /> },
  FDA_GUIDANCE: { label: 'FDA GUIDANCE', color: 'text-stone-600 bg-stone-100', icon: <FileText className="w-3 h-3" /> },
  COMPETITOR: { label: 'COMPETITOR INTEL', color: 'text-stone-600 bg-stone-100', icon: <Activity className="w-3 h-3" /> },
  PROJECT: { label: 'PROJECT UPDATE', color: 'text-stone-700 bg-stone-100', icon: <TrendingUp className="w-3 h-3" /> },
  DEADLINE: { label: 'DEADLINE', color: 'text-stone-600 bg-stone-100', icon: <Calendar className="w-3 h-3" /> },
  REVIEW: { label: 'REVIEW REQUIRED', color: 'text-stone-600 bg-stone-100', icon: <CheckCircle className="w-3 h-3" /> },
  SYSTEM: { label: 'SYSTEM', color: 'text-stone-600 bg-stone-50', icon: <Bell className="w-3 h-3" /> },
};

const PRIORITY_CONFIG: Record<AlertPriority, {
  indicator: string;
  border: string;
  icon?: React.ReactNode;
}> = {
  CRITICAL: { indicator: 'bg-stone-1000', border: 'border-l-stone-1000', icon: <AlertTriangle className="w-3 h-3 text-stone-1000" /> },
  HIGH: { indicator: 'bg-stone-1000', border: 'border-l-stone-1000', icon: <Zap className="w-3 h-3 text-stone-1000" /> },
  MEDIUM: { indicator: 'bg-stone-1000', border: 'border-l-stone-1000' },
  LOW: { indicator: 'bg-stone-600', border: 'border-l-stone-1000' },
  INFO: { indicator: 'bg-stone-400', border: 'border-l-slate-400' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const AlertCard: React.FC<{
  alert: BriefingAlert;
  onClick?: () => void;
}> = ({ alert, onClick }) => {
  const source = SOURCE_CONFIG[alert.source];
  const priority = PRIORITY_CONFIG[alert.priority];
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex gap-4 p-4 rounded-xl bg-white border border-stone-200 shadow-sm',
        'hover:shadow-sm hover:border-stone-300 transition-all cursor-pointer group text-left',
        'border-l-4',
        priority.border
      )}
    >
      {/* Priority Indicator */}
      <div className={cn('w-1 h-full rounded-full self-stretch', priority.indicator)} />
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex justify-between items-center mb-1">
          <span className={cn(
            'text-xs font-semibold uppercase flex items-center gap-1 px-2 py-0.5 rounded',
            source.color
          )}>
            {source.icon}
            {source.label}
          </span>
          {alert.timestamp && (
            <span className="text-xs text-stone-400 font-mono">{alert.timestamp}</span>
          )}
        </div>
        
        {/* Title */}
        <div className="flex items-start gap-2 mb-1">
          {priority.icon}
          <h4 className="text-sm font-semibold text-stone-900 leading-snug group-hover:text-stone-700 transition-colors duration-150">
            {alert.title}
          </h4>
        </div>
        
        {/* Message */}
        <p className="text-xs text-stone-600 line-clamp-2">{alert.message}</p>
        
        {/* Action */}
        {alert.actionLabel && (
          <div className="mt-2 flex items-center gap-1 text-xs font-medium text-stone-600 group-hover:text-stone-700">
            {alert.actionLabel}
            <ExternalLink className="w-3 h-3" />
          </div>
        )}
      </div>
      
      {/* Arrow */}
      <div className="flex items-center text-stone-400 group-hover:text-stone-1000 transition-transform group-hover:translate-x-1">
        <ArrowRight size={18} />
      </div>
    </button>
  );
};

const PriorityItem: React.FC<{ priority: TodaysPriority }> = ({ priority }) => (
  <div className={cn(
    'flex items-center gap-3 p-3 rounded-lg',
    priority.urgency === 'now' && 'bg-stone-100 border border-stone-100',
    priority.urgency === 'today' && 'bg-stone-100 border border-stone-100',
    priority.urgency === 'this_week' && 'bg-stone-50 border border-stone-200'
  )}>
    <div className={cn(
      'w-2 h-2 rounded-full flex-shrink-0',
      priority.urgency === 'now' && 'bg-stone-1000 animate-pulse',
      priority.urgency === 'today' && 'bg-stone-1000',
      priority.urgency === 'this_week' && 'bg-stone-400'
    )} />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-stone-900 truncate">{priority.title}</p>
      {priority.project && (
        <p className="text-xs text-stone-500">{priority.project}</p>
      )}
    </div>
    {priority.deadline && (
      <span className={cn(
        'text-xs font-mono font-semibold',
        priority.urgency === 'now' && 'text-stone-700',
        priority.urgency === 'today' && 'text-stone-600',
        priority.urgency === 'this_week' && 'text-stone-500'
      )}>
        {priority.deadline}
      </span>
    )}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const MorningBriefing: React.FC<MorningBriefingProps> = ({
  userName,
  alerts,
  priorities = [],
  statsSnapshot,
  onClose,
  onAlertClick,
  className,
}) => {
  const { greeting, icon } = useMemo(() => getGreeting(), []);
  const criticalAlerts = alerts.filter(a => a.priority === 'CRITICAL' || a.priority === 'HIGH');
  const otherAlerts = alerts.filter(a => a.priority !== 'CRITICAL' && a.priority !== 'HIGH');
  
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  
  return (
    <div className={cn(
      'fixed inset-0 z-[200] flex items-center justify-center p-4',
      'bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200',
      className
    )}>
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-sm overflow-hidden border border-stone-200 transform transition-all scale-100 max-h-[90vh] flex flex-col">
        {/* ═══════ HEADER ═══════ */}
        <div className="h-44 bg-stone-900 relative p-8 flex flex-col justify-end flex-shrink-0">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors bg-black/10 hover:bg-black/20 p-2 rounded-full"
          >
            <X size={20} />
          </button>
          
          {/* Greeting */}
          <div className="mb-3">{icon}</div>
          <h2 className="text-base font-semibold text-white tracking-tight">
            {greeting}{userName ? `, ${userName}` : ''}.
          </h2>
          <p className="text-stone-100 text-sm font-medium opacity-90">
            Here is your Regulatory Intelligence Briefing for {dateStr}.
          </p>
        </div>
        
        {/* ═══════ STATS SNAPSHOT ═══════ */}
        {statsSnapshot && (
          <div className="grid grid-cols-4 gap-3 p-4 bg-stone-50 border-b border-stone-200 flex-shrink-0">
            <div className="text-center p-2">
              <p className="text-base font-semibold text-stone-900">{statsSnapshot.projectsActive}</p>
              <Caption as="p" className="uppercase tracking-wide">Active Projects</Caption>
            </div>
            <div className="text-center p-2">
              <p className={cn(
                'text-base font-semibold',
                statsSnapshot.deadlinesThisWeek > 2 ? 'text-stone-600' : 'text-stone-900'
              )}>
                {statsSnapshot.deadlinesThisWeek}
              </p>
              <Caption as="p" className="uppercase tracking-wide">Deadlines This Week</Caption>
            </div>
            <div className="text-center p-2">
              <p className={cn(
                'text-base font-semibold',
                statsSnapshot.pendingReviews > 0 ? 'text-stone-600' : 'text-stone-900'
              )}>
                {statsSnapshot.pendingReviews}
              </p>
              <Caption as="p" className="uppercase tracking-wide">Pending Reviews</Caption>
            </div>
            <div className="text-center p-2">
              <p className={cn(
                'text-base font-semibold',
                statsSnapshot.riskItems > 0 ? 'text-stone-700' : 'text-stone-900'
              )}>
                {statsSnapshot.riskItems}
              </p>
              <Caption as="p" className="uppercase tracking-wide">Risk Items</Caption>
            </div>
          </div>
        )}
        
        {/* ═══════ BODY (Scrollable) ═══════ */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Critical Updates */}
            {criticalAlerts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-stone-1000" />
                  <Overline>Critical Updates</Overline>
                  <span className="px-2 py-0.5 text-xs font-semibold bg-stone-100 text-stone-800 rounded-full">
                    {criticalAlerts.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {criticalAlerts.map(alert => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onClick={() => {
                        onAlertClick?.(alert);
                        alert.onClick?.();
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* Today's Priorities */}
            {priorities.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-stone-1000" />
                  <Overline>Today's Priorities</Overline>
                </div>
                <div className="space-y-2">
                  {priorities.slice(0, 5).map(priority => (
                    <PriorityItem key={priority.id} priority={priority} />
                  ))}
                </div>
              </div>
            )}
            
            {/* Other Updates */}
            {otherAlerts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Bell className="w-4 h-4 text-stone-500" />
                  <Overline>Other Updates</Overline>
                </div>
                <div className="space-y-3">
                  {otherAlerts.slice(0, 5).map(alert => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onClick={() => {
                        onAlertClick?.(alert);
                        alert.onClick?.();
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* Empty State */}
            {alerts.length === 0 && priorities.length === 0 && (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-stone-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-stone-900">All Clear</h3>
                <p className="text-sm text-stone-500">No critical updates while you were away.</p>
              </div>
            )}
          </div>
        </div>
        
        {/* ═══════ FOOTER ═══════ */}
        <div className="p-4 bg-white border-t border-stone-200 flex justify-center flex-shrink-0">
          <EnterpriseButton variant="primary" size="lg" onClick={onClose} className="bg-stone-900 hover:bg-stone-800 px-6">
            Enter Workspace
          </EnterpriseButton>
        </div>
      </div>
    </div>
  );
};

export default MorningBriefing;
