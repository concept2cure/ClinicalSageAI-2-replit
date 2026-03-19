/**
 * Concept2Cure Enterprise Dashboard V3
 *
 * A beautiful, data-rich command center for regulatory intelligence.
 * Designed with clarity, calm, and confidence in mind.
 *
 * @version 3.0.0
 * @author Concept2Cure Engineering
 */

import React, { useState, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  FileText,
  Folder,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  ArrowUpRight,
  Target,
  Activity,
  BarChart3,
  Users,
  Sparkles,
  ChevronRight,
  MoreHorizontal,
  Bell,
  Filter,
  RefreshCw,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface MetricData {
  id: string;
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'stable';
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}

interface ProgramSummary {
  id: string;
  name: string;
  phase: string;
  indication: string;
  progress: number;
  status: 'on_track' | 'at_risk' | 'delayed';
  nextMilestone: string;
  nextMilestoneDate: Date;
  teamSize: number;
}

interface RecentActivity {
  id: string;
  type: 'document' | 'submission' | 'review' | 'approval';
  title: string;
  description: string;
  user: string;
  timestamp: Date;
  status?: 'success' | 'warning' | 'info';
}

interface UpcomingDeadline {
  id: string;
  title: string;
  program: string;
  date: Date;
  priority: 'critical' | 'high' | 'medium';
  type: 'submission' | 'review' | 'milestone';
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_METRICS: MetricData[] = [
  {
    id: '1',
    label: 'Active Programs',
    value: 12,
    change: 8,
    trend: 'up',
    icon: Folder,
    color: 'text-primary-600',
    bgColor: 'bg-primary-50',
  },
  {
    id: '2',
    label: 'Documents in Review',
    value: 47,
    change: -12,
    trend: 'down',
    icon: FileText,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  {
    id: '3',
    label: 'Pending Submissions',
    value: 5,
    change: 0,
    trend: 'stable',
    icon: Clock,
    color: 'text-info-600',
    bgColor: 'bg-info-50',
  },
  {
    id: '4',
    label: 'Approved This Month',
    value: 23,
    change: 35,
    trend: 'up',
    icon: CheckCircle2,
    color: 'text-success-600',
    bgColor: 'bg-success-50',
  },
];

const MOCK_PROGRAMS: ProgramSummary[] = [
  {
    id: '1',
    name: 'TSG-201 Phase 2',
    phase: 'Phase 2b',
    indication: 'Advanced Melanoma',
    progress: 72,
    status: 'on_track',
    nextMilestone: 'Interim Analysis',
    nextMilestoneDate: new Date('2026-02-15'),
    teamSize: 14,
  },
  {
    id: '2',
    name: 'TSG-305 IND',
    phase: 'IND Filing',
    indication: 'Non-Small Cell Lung Cancer',
    progress: 45,
    status: 'at_risk',
    nextMilestone: 'CMC Completion',
    nextMilestoneDate: new Date('2026-02-01'),
    teamSize: 8,
  },
  {
    id: '3',
    name: 'TSG-108 NDA',
    phase: 'NDA Submission',
    indication: 'Type 2 Diabetes',
    progress: 89,
    status: 'on_track',
    nextMilestone: 'FDA Submission',
    nextMilestoneDate: new Date('2026-03-01'),
    teamSize: 22,
  },
];

const MOCK_ACTIVITIES: RecentActivity[] = [
  {
    id: '1',
    type: 'approval',
    title: 'Protocol Amendment Approved',
    description: 'TSG-201 Protocol v3.2 has been approved',
    user: 'Dr. Sarah Chen',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    status: 'success',
  },
  {
    id: '2',
    type: 'submission',
    title: 'CMC Section Submitted',
    description: 'Module 3.2.P submitted for TSG-305',
    user: 'Michael Park',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
    status: 'info',
  },
  {
    id: '3',
    type: 'review',
    title: 'IB Review Requested',
    description: 'Investigator Brochure v8.0 pending review',
    user: 'Emma Rodriguez',
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
    status: 'warning',
  },
];

const MOCK_DEADLINES: UpcomingDeadline[] = [
  {
    id: '1',
    title: 'FDA Response Due',
    program: 'TSG-108',
    date: new Date('2026-01-30'),
    priority: 'critical',
    type: 'submission',
  },
  {
    id: '2',
    title: 'CMC Document Review',
    program: 'TSG-305',
    date: new Date('2026-02-05'),
    priority: 'high',
    type: 'review',
  },
  {
    id: '3',
    title: 'Interim Analysis',
    program: 'TSG-201',
    date: new Date('2026-02-15'),
    priority: 'medium',
    type: 'milestone',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// METRIC CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface MetricCardProps {
  metric: MetricData;
  index: number;
}

const MetricCard: React.FC<MetricCardProps> = memo(({ metric, index }) => {
  const Icon = metric.icon;
  const TrendIcon =
    metric.trend === 'up' ? TrendingUp : metric.trend === 'down' ? TrendingDown : null;

  return (
    <motion.div
      className="bg-white rounded-xl border border-neutral-200 p-5 hover:shadow-lg hover:border-neutral-300 transition-all duration-200 cursor-pointer group"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      whileHover={{ y: -2 }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-neutral-500">{metric.label}</p>
          <p className="text-3xl font-bold text-neutral-900 mt-1 tracking-tight">{metric.value}</p>
        </div>
        <div
          className={cn('flex items-center justify-center w-11 h-11 rounded-xl', metric.bgColor)}
        >
          <Icon className={cn('w-5 h-5', metric.color)} />
        </div>
      </div>

      {metric.change !== undefined && (
        <div
          className={cn(
            'flex items-center gap-1 mt-3 text-sm',
            metric.trend === 'up'
              ? 'text-success-600'
              : metric.trend === 'down'
                ? 'text-error-600'
                : 'text-neutral-500'
          )}
        >
          {TrendIcon && <TrendIcon className="w-4 h-4" />}
          <span className="font-medium">
            {metric.change > 0 ? '+' : ''}
            {metric.change}%
          </span>
          <span className="text-neutral-400">vs last month</span>
        </div>
      )}
    </motion.div>
  );
});

MetricCard.displayName = 'MetricCard';

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRAM ROW
// ═══════════════════════════════════════════════════════════════════════════════

interface ProgramRowProps {
  program: ProgramSummary;
  index: number;
}

const ProgramRow: React.FC<ProgramRowProps> = memo(({ program, index }) => {
  const statusConfig = {
    on_track: {
      label: 'On Track',
      color: 'bg-success-100 text-success-700',
      dot: 'bg-success-500',
    },
    at_risk: { label: 'At Risk', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
    delayed: { label: 'Delayed', color: 'bg-error-100 text-error-700', dot: 'bg-error-500' },
  };

  const status = statusConfig[program.status];

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  const daysUntil = Math.ceil(
    (program.nextMilestoneDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <motion.div
      className="flex items-center gap-4 p-4 rounded-xl hover:bg-neutral-50 transition-colors cursor-pointer group"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      {/* Progress ring */}
      <div className="relative w-12 h-12 flex-shrink-0">
        <svg className="w-12 h-12 transform -rotate-90">
          <circle cx="24" cy="24" r="20" fill="none" stroke="#f4f3ee" strokeWidth="4" />
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke={
              program.status === 'on_track'
                ? '#647746'
                : program.status === 'at_risk'
                  ? '#d97706'
                  : '#dc2626'
            }
            strokeWidth="4"
            strokeDasharray={`${(program.progress / 100) * 125.6} 125.6`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-neutral-700">
          {program.progress}%
        </span>
      </div>

      {/* Program info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-neutral-900 truncate group-hover:text-primary-600 transition-colors">
            {program.name}
          </h4>
          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', status.color)}>
            {status.label}
          </span>
        </div>
        <p className="text-sm text-neutral-500 truncate">
          {program.phase} • {program.indication}
        </p>
      </div>

      {/* Next milestone */}
      <div className="hidden sm:block text-right flex-shrink-0">
        <p className="text-sm font-medium text-neutral-700">{program.nextMilestone}</p>
        <p
          className={cn(
            'text-xs',
            daysUntil <= 7
              ? 'text-error-600 font-medium'
              : daysUntil <= 14
                ? 'text-amber-600'
                : 'text-neutral-400'
          )}
        >
          {formatDate(program.nextMilestoneDate)} • {daysUntil}d left
        </p>
      </div>

      {/* Team size */}
      <div className="hidden md:flex items-center gap-1.5 text-neutral-400 flex-shrink-0">
        <Users className="w-4 h-4" />
        <span className="text-sm">{program.teamSize}</span>
      </div>

      {/* Arrow */}
      <ChevronRight className="w-5 h-5 text-neutral-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all" />
    </motion.div>
  );
});

ProgramRow.displayName = 'ProgramRow';

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY ITEM
// ═══════════════════════════════════════════════════════════════════════════════

interface ActivityItemProps {
  activity: RecentActivity;
  index: number;
}

const ActivityItem: React.FC<ActivityItemProps> = memo(({ activity, index }) => {
  const iconConfig = {
    document: FileText,
    submission: ArrowUpRight,
    review: Clock,
    approval: CheckCircle2,
  };

  const statusConfig = {
    success: 'bg-success-100 text-success-600',
    warning: 'bg-amber-100 text-amber-600',
    info: 'bg-info-100 text-info-600',
  };

  const Icon = iconConfig[activity.type];

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  };

  return (
    <motion.div
      className="flex items-start gap-3 py-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <div
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0',
          activity.status ? statusConfig[activity.status] : 'bg-neutral-100 text-neutral-500'
        )}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-900">{activity.title}</p>
        <p className="text-sm text-neutral-500 truncate">{activity.description}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-neutral-400">
          <span>{activity.user}</span>
          <span>•</span>
          <span>{formatTime(activity.timestamp)}</span>
        </div>
      </div>
    </motion.div>
  );
});

ActivityItem.displayName = 'ActivityItem';

// ═══════════════════════════════════════════════════════════════════════════════
// DEADLINE ITEM
// ═══════════════════════════════════════════════════════════════════════════════

interface DeadlineItemProps {
  deadline: UpcomingDeadline;
  index: number;
}

const DeadlineItem: React.FC<DeadlineItemProps> = memo(({ deadline, index }) => {
  const priorityConfig = {
    critical: { color: 'bg-error-500', text: 'text-error-700' },
    high: { color: 'bg-amber-500', text: 'text-amber-700' },
    medium: { color: 'bg-info-500', text: 'text-info-700' },
  };

  const priority = priorityConfig[deadline.priority];

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days < 7) return `${days} days`;

    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  };

  const daysUntil = Math.ceil((deadline.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <motion.div
      className="flex items-center gap-3 py-3 cursor-pointer hover:bg-neutral-50 -mx-3 px-3 rounded-lg transition-colors"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <div className={cn('w-1 h-8 rounded-full', priority.color)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-900 truncate">{deadline.title}</p>
        <p className="text-xs text-neutral-500">{deadline.program}</p>
      </div>
      <div
        className={cn(
          'text-sm font-medium',
          daysUntil <= 3 ? 'text-error-600' : daysUntil <= 7 ? 'text-amber-600' : 'text-neutral-500'
        )}
      >
        {formatDate(deadline.date)}
      </div>
    </motion.div>
  );
});

DeadlineItem.displayName = 'DeadlineItem';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION HEADER
// ═══════════════════════════════════════════════════════════════════════════════

interface SectionHeaderProps {
  title: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: React.ComponentType<{ className?: string }>;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ title, action, icon: Icon }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2">
      {Icon && <Icon className="w-5 h-5 text-neutral-400" />}
      <h3 className="font-semibold text-neutral-900">{title}</h3>
    </div>
    {action && (
      <button
        onClick={action.onClick}
        className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
      >
        {action.label}
      </button>
    )}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const DashboardV3: React.FC<{ className?: string }> = ({ className }) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  // Get current time greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <motion.h1
            className="text-2xl font-bold text-neutral-900 tracking-tight"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {greeting}, Sarah
          </motion.h1>
          <motion.p
            className="text-neutral-500 mt-1"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Here's what's happening across your regulatory programs
          </motion.p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
              'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
              'transition-colors duration-150',
              refreshing && 'opacity-50 cursor-not-allowed'
            )}
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MOCK_METRICS.map((metric, index) => (
          <MetricCard key={metric.id} metric={metric} index={index} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Programs Section - Takes 2 columns */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-neutral-200 p-6">
            <SectionHeader
              title="Active Programs"
              icon={Target}
              action={{ label: 'View all', onClick: () => {} }}
            />
            <div className="divide-y divide-neutral-100">
              {MOCK_PROGRAMS.map((program, index) => (
                <ProgramRow key={program.id} program={program} index={index} />
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Activity & Deadlines */}
        <div className="space-y-6">
          {/* Upcoming Deadlines */}
          <div className="bg-white rounded-xl border border-neutral-200 p-6">
            <SectionHeader
              title="Upcoming Deadlines"
              icon={Calendar}
              action={{ label: 'View calendar', onClick: () => {} }}
            />
            <div className="divide-y divide-neutral-100">
              {MOCK_DEADLINES.map((deadline, index) => (
                <DeadlineItem key={deadline.id} deadline={deadline} index={index} />
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-neutral-200 p-6">
            <SectionHeader
              title="Recent Activity"
              icon={Activity}
              action={{ label: 'View all', onClick: () => {} }}
            />
            <div className="divide-y divide-neutral-100">
              {MOCK_ACTIVITIES.map((activity, index) => (
                <ActivityItem key={activity.id} activity={activity} index={index} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* AI Assistant Prompt */}
      <motion.div
        className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-600 to-accent-600 p-6 text-white"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2" />
        </div>

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/20 backdrop-blur">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Need help with your submissions?</h3>
              <p className="text-white/80 text-sm mt-0.5">
                Ask AnA to analyze documents, check compliance, or draft content
              </p>
            </div>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-primary-600 font-medium hover:bg-white/90 transition-colors">
            <Sparkles className="w-4 h-4" />
            <span>Open Assistant</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default DashboardV3;
