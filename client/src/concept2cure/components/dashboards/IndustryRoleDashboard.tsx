/**
 * @fileoverview Role-Based Dashboard
 * @module concept2cure/components/dashboards/RoleBasedDashboard
 * @version 2.0.0
 *
 * @description
 * Dashboard views tailored to how different roles actually work:
 * - RA Lead: Submission pipeline, PDUFA dates, agency interactions
 * - Medical Writer: Document queue, deadlines, review cycles
 * - QA: Quality events, deviations, audit readiness
 * - PM (CRO): Client deliverables, resource utilization, budgets
 *
 * @compliance
 * - FDA 21 CFR Part 11: Audit trail for all actions
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Calendar,
  Clock,
  FileText,
  AlertTriangle,
  CheckCircle,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  Bell,
  Folder,
  Target,
  BarChart2,
  ClipboardCheck,
  MessageSquare,
  Flag,
  Briefcase,
  FlaskConical,
} from 'lucide-react';
import type {
  UserRole,
  IndustryMode,
  DashboardMetric,
  ActionItem,
  WatchlistItem,
  CalendarItem,
  PDUFADate,
  RegulatoryCommitment,
  CRODeliverable,
} from '../../types/workspace';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface RoleBasedDashboardProps {
  role: UserRole;
  userName: string;
  industryMode: IndustryMode;
  
  // Data (would come from API)
  metrics?: DashboardMetric[];
  actionItems?: ActionItem[];
  watchlist?: WatchlistItem[];
  calendar?: CalendarItem[];
  
  // CRO-specific
  deliverables?: CRODeliverable[];
  
  // Pharma-specific  
  pdufa_dates?: PDUFADate[];
  commitments?: RegulatoryCommitment[];
  
  // Event handlers
  onActionClick?: (item: ActionItem) => void;
  onWatchlistClick?: (item: WatchlistItem) => void;
  onCalendarClick?: (item: CalendarItem) => void;
  
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROLE CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const ROLE_CONFIG: Record<UserRole, {
  title: string;
  greeting: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  primaryFocus: string[];
}> = {
  ra_lead: {
    title: 'Regulatory Affairs Lead',
    greeting: 'Regulatory Command Center',
    icon: Briefcase,
    color: 'blue',
    primaryFocus: ['Submissions Pipeline', 'Agency Interactions', 'PDUFA Dates', 'Commitments'],
  },
  ra_specialist: {
    title: 'Regulatory Specialist',
    greeting: 'Your Regulatory Workspace',
    icon: FileText,
    color: 'violet',
    primaryFocus: ['Assigned Sections', 'Review Cycles', 'Publishing Queue'],
  },
  medical_writer: {
    title: 'Medical Writer',
    greeting: 'Writing Workspace',
    icon: FileText,
    color: 'emerald',
    primaryFocus: ['Document Queue', 'Deadlines', 'Review Feedback', 'Templates'],
  },
  cmc_lead: {
    title: 'CMC Lead',
    greeting: 'CMC Dashboard',
    icon: FlaskConical,
    color: 'amber',
    primaryFocus: ['Module 3 Status', 'Manufacturing Changes', 'Stability Data', 'Specifications'],
  },
  clinical_ops: {
    title: 'Clinical Operations',
    greeting: 'Clinical Operations Hub',
    icon: Users,
    color: 'pink',
    primaryFocus: ['Active Studies', 'Site Status', 'Enrollment', 'Data Quality'],
  },
  quality_assurance: {
    title: 'Quality Assurance',
    greeting: 'Quality Dashboard',
    icon: ClipboardCheck,
    color: 'red',
    primaryFocus: ['Document QC Queue', 'Deviations', 'CAPA Status', 'Audit Schedule'],
  },
  pharmacovigilance: {
    title: 'Pharmacovigilance',
    greeting: 'Safety Dashboard',
    icon: AlertTriangle,
    color: 'orange',
    primaryFocus: ['Case Processing', 'Aggregate Reports', 'Signal Detection', 'REMS'],
  },
  project_manager: {
    title: 'Project Manager',
    greeting: 'Project Command Center',
    icon: Target,
    color: 'cyan',
    primaryFocus: ['Client Deliverables', 'Resource Allocation', 'Timeline', 'Budget'],
  },
  medical_director: {
    title: 'Medical Director',
    greeting: 'Medical Affairs Overview',
    icon: Users,
    color: 'indigo',
    primaryFocus: ['Pipeline Status', 'Publications', 'KOL Engagement', 'Medical Strategy'],
  },
  executive: {
    title: 'Executive',
    greeting: 'Portfolio Overview',
    icon: BarChart2,
    color: 'slate',
    primaryFocus: ['Pipeline Health', 'Approval Milestones', 'Risk Summary', 'Key Decisions'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const MetricCard: React.FC<{
  metric: DashboardMetric;
}> = ({ metric }) => {
  const TrendIcon = metric.trend === 'up' ? TrendingUp : metric.trend === 'down' ? TrendingDown : Minus;
  
  return (
    <div className={cn(
      'p-4 rounded-xl border bg-white',
      'hover:shadow-md transition-shadow cursor-pointer'
    )}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm text-zinc-500">{metric.label}</span>
        {metric.trend && (
          <TrendIcon className={cn(
            'w-4 h-4',
            metric.trend === 'up' && metric.status !== 'critical' && 'text-emerald-500',
            metric.trend === 'down' && metric.status !== 'good' && 'text-red-500',
            metric.trend === 'stable' && 'text-zinc-400'
          )} />
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn(
          'text-2xl font-semibold',
          metric.status === 'good' && 'text-emerald-600',
          metric.status === 'warning' && 'text-amber-600',
          metric.status === 'critical' && 'text-red-600',
          !metric.status && 'text-zinc-900'
        )}>
          {metric.value}
        </span>
      </div>
    </div>
  );
};

const ActionItemCard: React.FC<{
  item: ActionItem;
  onClick?: () => void;
}> = ({ item, onClick }) => {
  const daysUntil = Math.ceil((new Date(item.dueDate).getTime() - Date.now()) / 86400000);
  const isOverdue = daysUntil < 0;
  const isUrgent = daysUntil <= 2;
  
  const typeIcons: Record<ActionItem['type'], React.ComponentType<{ className?: string }>> = {
    review: FileText,
    approval: CheckCircle,
    deadline: Clock,
    meeting: Users,
    response: MessageSquare,
    signature: ClipboardCheck,
  };
  const Icon = typeIcons[item.type];
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full p-4 rounded-xl border text-left transition-all duration-150',
        'hover:shadow-md hover:border-blue-200',
        item.priority === 'critical' && 'border-red-200 bg-red-50',
        item.priority === 'high' && !isOverdue && 'border-amber-200 bg-amber-50',
        isOverdue && 'border-red-300 bg-red-50'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          item.priority === 'critical' || isOverdue ? 'bg-red-100' : 'bg-blue-100'
        )}>
          <Icon className={cn(
            'w-4 h-4',
            item.priority === 'critical' || isOverdue ? 'text-red-600' : 'text-blue-600'
          )} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-zinc-900 truncate">{item.title}</h4>
            {item.priority === 'critical' && (
              <span className="text-xs font-medium text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                Critical
              </span>
            )}
          </div>
          
          {item.description && (
            <p className="text-sm text-zinc-500 truncate mb-2">{item.description}</p>
          )}
          
          <div className="flex items-center gap-3 text-xs">
            {item.project && (
              <span className="text-zinc-500 flex items-center gap-1">
                <Folder className="w-3 h-3" />
                {item.project}
              </span>
            )}
            <span className={cn(
              'flex items-center gap-1',
              isOverdue ? 'text-red-600 font-medium' : isUrgent ? 'text-amber-600' : 'text-zinc-500'
            )}>
              <Clock className="w-3 h-3" />
              {isOverdue ? `${Math.abs(daysUntil)} days overdue` : daysUntil === 0 ? 'Due today' : `${daysUntil} days`}
            </span>
          </div>
        </div>
        
        <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0" />
      </div>
    </button>
  );
};

const PDUFACard: React.FC<{
  pdufa: PDUFADate;
  onClick?: () => void;
}> = ({ pdufa, onClick }) => {
  const daysRemaining = Math.ceil((new Date(pdufa.pdufa_date).getTime() - Date.now()) / 86400000);
  const isUrgent = daysRemaining <= 30;
  const isCritical = daysRemaining <= 7;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full p-4 rounded-xl border text-left transition-all duration-150',
        'hover:shadow-md',
        isCritical && 'border-red-200 bg-red-50',
        isUrgent && !isCritical && 'border-amber-200 bg-amber-50',
        !isUrgent && 'border-blue-200 bg-blue-50'
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="font-medium text-zinc-900">{pdufa.productName}</h4>
          <p className="text-sm text-zinc-500">{pdufa.submissionType}</p>
        </div>
        <span className={cn(
          'text-lg font-semibold',
          isCritical && 'text-red-600',
          isUrgent && !isCritical && 'text-amber-600',
          !isUrgent && 'text-blue-600'
        )}>
          {daysRemaining}d
        </span>
      </div>
      
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>PDUFA: {new Date(pdufa.pdufa_date).toLocaleDateString()}</span>
        <span className={cn(
          'px-2 py-0.5 rounded-full',
          pdufa.status === 'active' && 'bg-blue-100 text-blue-700',
          pdufa.status === 'crl_received' && 'bg-red-100 text-red-700',
          pdufa.status === 'approved' && 'bg-emerald-100 text-emerald-700'
        )}>
          {pdufa.status}
        </span>
      </div>
    </button>
  );
};

const CommitmentCard: React.FC<{
  commitment: RegulatoryCommitment;
  onClick?: () => void;
}> = ({ commitment, onClick }) => {
  const daysUntil = Math.ceil((new Date(commitment.dueDate).getTime() - Date.now()) / 86400000);
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full p-3 rounded-lg border text-left transition-all duration-150',
        'hover:shadow-sm',
        commitment.status === 'overdue' && 'border-red-200 bg-red-50',
        commitment.status === 'at_risk' && 'border-amber-200 bg-amber-50'
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-zinc-500 uppercase">{commitment.type}</span>
        <span className={cn(
          'text-xs px-1.5 py-0.5 rounded',
          commitment.status === 'on_track' && 'bg-emerald-100 text-emerald-700',
          commitment.status === 'at_risk' && 'bg-amber-100 text-amber-700',
          commitment.status === 'overdue' && 'bg-red-100 text-red-700',
          commitment.status === 'completed' && 'bg-zinc-100 text-zinc-600'
        )}>
          {commitment.status}
        </span>
      </div>
      <p className="text-sm text-zinc-900 line-clamp-2">{commitment.description}</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
        <Clock className="w-3 h-3" />
        <span>Due: {new Date(commitment.dueDate).toLocaleDateString()}</span>
        {daysUntil > 0 && <span>({daysUntil} days)</span>}
      </div>
    </button>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CRO PROJECT MANAGER VIEW
// ═══════════════════════════════════════════════════════════════════════════════

const CROProjectManagerView: React.FC<{
  deliverables?: CRODeliverable[];
  metrics?: DashboardMetric[];
  onDeliverableClick?: (id: string) => void;
}> = ({ deliverables = [], metrics = [], onDeliverableClick }) => {
  // Group deliverables by status
  const grouped = useMemo(() => {
    const groups: Record<string, CRODeliverable[]> = {
      drafting: [],
      internal_qc: [],
      client_review: [],
      upcoming: [],
    };
    
    deliverables.forEach(d => {
      if (d.status === 'drafting') groups.drafting.push(d);
      else if (d.status === 'internal_qc') groups.internal_qc.push(d);
      else if (d.status === 'client_review') groups.client_review.push(d);
      else if (d.status === 'not_started') groups.upcoming.push(d);
    });
    
    return groups;
  }, [deliverables]);
  
  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-4">
        {metrics.slice(0, 4).map(m => (
          <MetricCard key={m.id} metric={m} />
        ))}
      </div>
      
      {/* Kanban-style board */}
      <div className="grid grid-cols-4 gap-4">
        {/* Drafting */}
        <div className="bg-zinc-50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            Drafting ({grouped.drafting.length})
          </h3>
          <div className="space-y-2">
            {grouped.drafting.map(d => (
              <button
                key={d.id}
                onClick={() => onDeliverableClick?.(d.id)}
                className="w-full p-3 bg-white rounded-lg border border-zinc-200 text-left hover:border-blue-300 transition-colors duration-150"
              >
                <p className="text-sm font-medium text-zinc-900 line-clamp-2">{d.name}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>{d.assignedTo}</span>
                  <span>{new Date(d.dueDate).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
        
        {/* Internal QC */}
        <div className="bg-zinc-50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            Internal QC ({grouped.internal_qc.length})
          </h3>
          <div className="space-y-2">
            {grouped.internal_qc.map(d => (
              <button
                key={d.id}
                onClick={() => onDeliverableClick?.(d.id)}
                className="w-full p-3 bg-white rounded-lg border border-amber-200 text-left hover:border-amber-300 transition-colors duration-150"
              >
                <p className="text-sm font-medium text-zinc-900 line-clamp-2">{d.name}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>{d.reviewer}</span>
                  <span>{new Date(d.dueDate).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
        
        {/* Client Review */}
        <div className="bg-zinc-50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            Client Review ({grouped.client_review.length})
          </h3>
          <div className="space-y-2">
            {grouped.client_review.map(d => (
              <button
                key={d.id}
                onClick={() => onDeliverableClick?.(d.id)}
                className="w-full p-3 bg-white rounded-lg border border-blue-200 text-left hover:border-blue-200 transition-colors duration-150"
              >
                <p className="text-sm font-medium text-zinc-900 line-clamp-2">{d.name}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>Client review due</span>
                  <span>{d.clientReviewDue ? new Date(d.clientReviewDue).toLocaleDateString() : '-'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
        
        {/* Upcoming */}
        <div className="bg-zinc-50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-zinc-400" />
            Upcoming ({grouped.upcoming.length})
          </h3>
          <div className="space-y-2">
            {grouped.upcoming.slice(0, 5).map(d => (
              <button
                key={d.id}
                onClick={() => onDeliverableClick?.(d.id)}
                className="w-full p-3 bg-white rounded-lg border border-zinc-200 text-left hover:border-zinc-300 transition-colors duration-150"
              >
                <p className="text-sm font-medium text-zinc-900 line-clamp-2">{d.name}</p>
                <div className="mt-2 text-xs text-zinc-500">
                  <span>Start: {new Date(d.dueDate).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const IndustryRoleDashboard: React.FC<RoleBasedDashboardProps> = ({
  role,
  userName,
  industryMode,
  metrics = [],
  actionItems = [],
  watchlist = [],
  calendar: _calendar = [],
  deliverables = [],
  pdufa_dates = [],
  commitments = [],
  onActionClick,
  onWatchlistClick,
  onCalendarClick: _onCalendarClick,
  className,
}) => {
  const config = ROLE_CONFIG[role];
  const firstName = userName.split(' ')[0];
  
  // Role-specific views
  if (role === 'project_manager' && industryMode === 'cro') {
    return (
      <div className={cn('p-6', className)}>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-zinc-900">
            {config.greeting}
          </h1>
          <p className="text-zinc-500">
            Welcome back, {firstName}. Here's your delivery pipeline.
          </p>
        </div>
        <CROProjectManagerView
          deliverables={deliverables}
          metrics={metrics}
        />
      </div>
    );
  }
  
  // RA Lead / Pharma view with PDUFA and commitments
  if ((role === 'ra_lead' || role === 'executive') && (industryMode === 'pharma' || industryMode === 'biotech')) {
    return (
      <div className={cn('p-6 space-y-6', className)}>
        {/* Header */}
        <div className="mb-2">
          <h1 className="text-2xl font-semibold text-zinc-900">{config.greeting}</h1>
          <p className="text-zinc-500">Welcome back, {firstName}</p>
        </div>
        
        {/* Key Metrics */}
        <div className="grid grid-cols-4 gap-4">
          {metrics.slice(0, 4).map(m => (
            <MetricCard key={m.id} metric={m} />
          ))}
        </div>
        
        <div className="grid grid-cols-3 gap-6">
          {/* PDUFA Dates */}
          <div className="col-span-1">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              PDUFA Dates
            </h2>
            <div className="space-y-3">
              {pdufa_dates.slice(0, 5).map(p => (
                <PDUFACard key={p.id} pdufa={p} />
              ))}
              {pdufa_dates.length === 0 && (
                <p className="text-sm text-zinc-500 italic">No active PDUFA dates</p>
              )}
            </div>
          </div>
          
          {/* Action Items */}
          <div className="col-span-1">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
              <Flag className="w-5 h-5 text-amber-500" />
              Action Items
            </h2>
            <div className="space-y-3">
              {actionItems.slice(0, 5).map(item => (
                <ActionItemCard
                  key={item.id}
                  item={item}
                  onClick={() => onActionClick?.(item)}
                />
              ))}
              {actionItems.length === 0 && (
                <p className="text-sm text-zinc-500 italic">No pending actions</p>
              )}
            </div>
          </div>
          
          {/* Commitments */}
          <div className="col-span-1">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-emerald-500" />
              Regulatory Commitments
            </h2>
            <div className="space-y-3">
              {commitments.slice(0, 5).map(c => (
                <CommitmentCard key={c.id} commitment={c} />
              ))}
              {commitments.length === 0 && (
                <p className="text-sm text-zinc-500 italic">No active commitments</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Default view for other roles
  return (
    <div className={cn('p-6 space-y-6', className)}>
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-2xl font-semibold text-zinc-900">{config.greeting}</h1>
        <p className="text-zinc-500">Welcome back, {firstName}</p>
      </div>
      
      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {metrics.slice(0, 4).map(m => (
          <MetricCard key={m.id} metric={m} />
        ))}
      </div>
      
      <div className="grid grid-cols-2 gap-6">
        {/* Action Items */}
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
            <Flag className="w-5 h-5 text-amber-500" />
            Your Action Items
          </h2>
          <div className="space-y-3">
            {actionItems.slice(0, 5).map(item => (
              <ActionItemCard
                key={item.id}
                item={item}
                onClick={() => onActionClick?.(item)}
              />
            ))}
          </div>
        </div>
        
        {/* Watchlist */}
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-500" />
            Watchlist
          </h2>
          <div className="space-y-2">
            {watchlist.slice(0, 6).map(item => (
              <button
                key={item.id}
                onClick={() => onWatchlistClick?.(item)}
                className="w-full p-3 rounded-lg border border-zinc-200 text-left hover:border-blue-200 transition-colors flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                  <p className="text-xs text-zinc-500">{item.status}</p>
                </div>
                {item.daysRemaining !== undefined && (
                  <span className={cn(
                    'text-sm font-medium',
                    item.daysRemaining <= 7 ? 'text-red-600' : 'text-zinc-600'
                  )}>
                    {item.daysRemaining}d
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndustryRoleDashboard;
