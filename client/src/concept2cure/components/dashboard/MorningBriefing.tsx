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
  if (hour < 12) return { greeting: 'Good Morning', icon: <Sun className="text-yellow-400" size={40} /> };
  if (hour < 18) return { greeting: 'Good Afternoon', icon: <Sun className="text-orange-400" size={40} /> };
  return { greeting: 'Good Evening', icon: <Moon className="text-indigo-300" size={40} /> };
};

const SOURCE_CONFIG: Record<AlertSource, {
  label: string;
  color: string;
  icon: React.ReactNode;
}> = {
  FDA_ENFORCEMENT: { label: 'FDA ENFORCEMENT', color: 'text-red-600 bg-red-50', icon: <Shield className="w-3 h-3" /> },
  FDA_GUIDANCE: { label: 'FDA GUIDANCE', color: 'text-blue-600 bg-blue-50', icon: <FileText className="w-3 h-3" /> },
  COMPETITOR: { label: 'COMPETITOR INTEL', color: 'text-purple-600 bg-purple-50', icon: <Activity className="w-3 h-3" /> },
  PROJECT: { label: 'PROJECT UPDATE', color: 'text-green-600 bg-green-50', icon: <TrendingUp className="w-3 h-3" /> },
  DEADLINE: { label: 'DEADLINE', color: 'text-orange-600 bg-orange-50', icon: <Calendar className="w-3 h-3" /> },
  REVIEW: { label: 'REVIEW REQUIRED', color: 'text-amber-600 bg-amber-50', icon: <CheckCircle className="w-3 h-3" /> },
  SYSTEM: { label: 'SYSTEM', color: 'text-slate-600 bg-slate-50', icon: <Bell className="w-3 h-3" /> },
};

const PRIORITY_CONFIG: Record<AlertPriority, {
  indicator: string;
  border: string;
  icon?: React.ReactNode;
}> = {
  CRITICAL: { indicator: 'bg-red-500', border: 'border-l-red-500', icon: <AlertTriangle className="w-3 h-3 text-red-500" /> },
  HIGH: { indicator: 'bg-orange-500', border: 'border-l-orange-500', icon: <Zap className="w-3 h-3 text-orange-500" /> },
  MEDIUM: { indicator: 'bg-amber-500', border: 'border-l-amber-500' },
  LOW: { indicator: 'bg-blue-500', border: 'border-l-blue-500' },
  INFO: { indicator: 'bg-slate-400', border: 'border-l-slate-400' },
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
        'w-full flex gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm',
        'hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group text-left',
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
            'text-[10px] font-bold uppercase flex items-center gap-1 px-2 py-0.5 rounded',
            source.color
          )}>
            {source.icon}
            {source.label}
          </span>
          {alert.timestamp && (
            <span className="text-[10px] text-slate-400 font-mono">{alert.timestamp}</span>
          )}
        </div>
        
        {/* Title */}
        <div className="flex items-start gap-2 mb-1">
          {priority.icon}
          <h4 className="text-sm font-semibold text-slate-800 leading-snug group-hover:text-blue-700 transition-colors">
            {alert.title}
          </h4>
        </div>
        
        {/* Message */}
        <p className="text-xs text-slate-600 line-clamp-2">{alert.message}</p>
        
        {/* Action */}
        {alert.actionLabel && (
          <div className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-600 group-hover:text-blue-700">
            {alert.actionLabel}
            <ExternalLink className="w-3 h-3" />
          </div>
        )}
      </div>
      
      {/* Arrow */}
      <div className="flex items-center text-slate-300 group-hover:text-blue-500 transition-transform group-hover:translate-x-1">
        <ArrowRight size={18} />
      </div>
    </button>
  );
};

const PriorityItem: React.FC<{ priority: TodaysPriority }> = ({ priority }) => (
  <div className={cn(
    'flex items-center gap-3 p-3 rounded-lg',
    priority.urgency === 'now' && 'bg-red-50 border border-red-100',
    priority.urgency === 'today' && 'bg-amber-50 border border-amber-100',
    priority.urgency === 'this_week' && 'bg-slate-50 border border-slate-100'
  )}>
    <div className={cn(
      'w-2 h-2 rounded-full flex-shrink-0',
      priority.urgency === 'now' && 'bg-red-500 animate-pulse',
      priority.urgency === 'today' && 'bg-amber-500',
      priority.urgency === 'this_week' && 'bg-slate-400'
    )} />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-slate-800 truncate">{priority.title}</p>
      {priority.project && (
        <p className="text-xs text-slate-500">{priority.project}</p>
      )}
    </div>
    {priority.deadline && (
      <span className={cn(
        'text-[10px] font-mono font-bold',
        priority.urgency === 'now' && 'text-red-600',
        priority.urgency === 'today' && 'text-amber-600',
        priority.urgency === 'this_week' && 'text-slate-500'
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
      'bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-500',
      className
    )}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 transform transition-all scale-100 max-h-[90vh] flex flex-col">
        {/* ═══════ HEADER ═══════ */}
        <div className="h-44 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 relative p-8 flex flex-col justify-end flex-shrink-0">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors bg-black/10 hover:bg-black/20 p-2 rounded-full"
          >
            <X size={20} />
          </button>
          
          {/* Greeting */}
          <div className="drop-shadow-lg mb-3">{icon}</div>
          <h2 className="text-3xl font-black text-white tracking-tight">
            {greeting}{userName ? `, ${userName}` : ''}.
          </h2>
          <p className="text-blue-100 text-sm font-medium opacity-90">
            Here is your Regulatory Intelligence Briefing for {dateStr}.
          </p>
        </div>
        
        {/* ═══════ STATS SNAPSHOT ═══════ */}
        {statsSnapshot && (
          <div className="grid grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200 flex-shrink-0">
            <div className="text-center p-2">
              <p className="text-2xl font-bold text-slate-900">{statsSnapshot.projectsActive}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Active Projects</p>
            </div>
            <div className="text-center p-2">
              <p className={cn(
                'text-2xl font-bold',
                statsSnapshot.deadlinesThisWeek > 2 ? 'text-amber-600' : 'text-slate-900'
              )}>
                {statsSnapshot.deadlinesThisWeek}
              </p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Deadlines This Week</p>
            </div>
            <div className="text-center p-2">
              <p className={cn(
                'text-2xl font-bold',
                statsSnapshot.pendingReviews > 0 ? 'text-blue-600' : 'text-slate-900'
              )}>
                {statsSnapshot.pendingReviews}
              </p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Pending Reviews</p>
            </div>
            <div className="text-center p-2">
              <p className={cn(
                'text-2xl font-bold',
                statsSnapshot.riskItems > 0 ? 'text-red-600' : 'text-slate-900'
              )}>
                {statsSnapshot.riskItems}
              </p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Risk Items</p>
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
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Critical Updates
                  </h3>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded-full">
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
                  <Clock className="w-4 h-4 text-blue-500" />
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Today's Priorities
                  </h3>
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
                  <Bell className="w-4 h-4 text-slate-500" />
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Other Updates
                  </h3>
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
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-slate-800">All Clear</h3>
                <p className="text-sm text-slate-500">No critical updates while you were away.</p>
              </div>
            )}
          </div>
        </div>
        
        {/* ═══════ FOOTER ═══════ */}
        <div className="p-4 bg-white border-t border-slate-100 flex justify-center flex-shrink-0">
          <button
            onClick={onClose}
            className={cn(
              'px-6 py-2.5 rounded-xl font-semibold transition-all',
              'bg-gradient-to-r from-blue-600 to-indigo-600 text-white',
              'hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl'
            )}
          >
            Enter Workspace
          </button>
        </div>
      </div>
    </div>
  );
};

export default MorningBriefing;
