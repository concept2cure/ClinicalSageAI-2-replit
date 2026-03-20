/**
 * Program Workbench V3
 *
 * A comprehensive workspace for managing regulatory programs.
 * Timeline-focused, milestone-driven, team-collaborative.
 *
 * @version 3.0.0
 * @author Concept2Cure Engineering
 */

import React, { useState, useCallback, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Calendar,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileText,
  Users,
  MessageSquare,
  Link2,
  Target,
  Flag,
  Folder,
  Settings,
  ArrowRight,
  Edit3,
  Trash2,
  Archive,
  Copy,
  ExternalLink,
  Sparkles,
  Zap,
  TrendingUp,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type MilestoneStatus = 'completed' | 'in_progress' | 'upcoming' | 'at_risk' | 'blocked';
type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

interface Milestone {
  id: string;
  name: string;
  status: MilestoneStatus;
  targetDate: Date;
  completedDate?: Date;
  progress: number;
  owner: string;
  dependencies?: string[];
  tasks: Task[];
}

interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  assignee: string;
  dueDate?: Date;
  priority: TaskPriority;
  comments: number;
  attachments: number;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  initials: string;
  status: 'active' | 'away' | 'offline';
}

interface Program {
  id: string;
  name: string;
  phase: string;
  indication: string;
  sponsor: string;
  status: 'on_track' | 'at_risk' | 'delayed';
  startDate: Date;
  targetDate: Date;
  progress: number;
  milestones: Milestone[];
  team: TeamMember[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_PROGRAM: Program = {
  id: '1',
  name: 'C2C-201 Phase 2b',
  phase: 'Phase 2b Clinical Trial',
  indication: 'Advanced Melanoma',
  sponsor: 'Concept2Cure Therapeutics',
  status: 'on_track',
  startDate: new Date('2025-06-01'),
  targetDate: new Date('2027-03-01'),
  progress: 42,
  team: [
    { id: '1', name: 'Dr. Sarah Chen', role: 'Program Lead', initials: 'SC', status: 'active' },
    { id: '2', name: 'Michael Park', role: 'CMC Lead', initials: 'MP', status: 'active' },
    { id: '3', name: 'Emma Rodriguez', role: 'Clinical Operations', initials: 'ER', status: 'away' },
    { id: '4', name: 'James Wilson', role: 'Regulatory Affairs', initials: 'JW', status: 'active' },
    { id: '5', name: 'Lisa Thompson', role: 'Medical Writer', initials: 'LT', status: 'offline' },
  ],
  milestones: [
    {
      id: '1',
      name: 'IND Submission',
      status: 'completed',
      targetDate: new Date('2025-08-15'),
      completedDate: new Date('2025-08-10'),
      progress: 100,
      owner: 'James Wilson',
      tasks: [],
    },
    {
      id: '2',
      name: 'First Patient Enrolled',
      status: 'completed',
      targetDate: new Date('2025-10-01'),
      completedDate: new Date('2025-09-28'),
      progress: 100,
      owner: 'Emma Rodriguez',
      tasks: [],
    },
    {
      id: '3',
      name: 'Interim Analysis',
      status: 'in_progress',
      targetDate: new Date('2026-02-15'),
      progress: 65,
      owner: 'Dr. Sarah Chen',
      tasks: [
        { id: 't1', title: 'Complete data lock', status: 'done', assignee: 'Emma Rodriguez', priority: 'high', comments: 3, attachments: 2 },
        { id: 't2', title: 'Statistical analysis', status: 'in_progress', assignee: 'Dr. Sarah Chen', priority: 'critical', dueDate: new Date('2026-01-30'), comments: 5, attachments: 4 },
        { id: 't3', title: 'Prepare interim report', status: 'todo', assignee: 'Lisa Thompson', priority: 'high', dueDate: new Date('2026-02-10'), comments: 1, attachments: 0 },
      ],
    },
    {
      id: '4',
      name: 'CMC Amendments',
      status: 'at_risk',
      targetDate: new Date('2026-03-01'),
      progress: 35,
      owner: 'Michael Park',
      dependencies: ['3'],
      tasks: [
        { id: 't4', title: 'Update stability data', status: 'in_progress', assignee: 'Michael Park', priority: 'critical', dueDate: new Date('2026-02-15'), comments: 8, attachments: 12 },
        { id: 't5', title: 'Manufacturing batch records', status: 'review', assignee: 'Michael Park', priority: 'high', comments: 2, attachments: 6 },
        { id: 't6', title: 'Analytical method validation', status: 'todo', assignee: 'Michael Park', priority: 'medium', dueDate: new Date('2026-02-20'), comments: 0, attachments: 0 },
      ],
    },
    {
      id: '5',
      name: 'Final Study Report',
      status: 'upcoming',
      targetDate: new Date('2026-12-01'),
      progress: 0,
      owner: 'Dr. Sarah Chen',
      dependencies: ['3', '4'],
      tasks: [],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS BADGE
// ═══════════════════════════════════════════════════════════════════════════════

interface StatusBadgeProps {
  status: MilestoneStatus | Task['status'];
  size?: 'sm' | 'md';
}

const StatusBadge: React.FC<StatusBadgeProps> = memo(({ status, size = 'md' }) => {
  const config: Record<string, { label: string; className: string; icon: React.ComponentType<any> }> = {
    completed: { label: 'Completed', className: 'bg-success-100 text-success-700', icon: CheckCircle2 },
    done: { label: 'Done', className: 'bg-success-100 text-success-700', icon: CheckCircle2 },
    in_progress: { label: 'In Progress', className: 'bg-primary-100 text-primary-700', icon: Clock },
    upcoming: { label: 'Upcoming', className: 'bg-neutral-100 text-neutral-600', icon: Clock },
    at_risk: { label: 'At Risk', className: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
    blocked: { label: 'Blocked', className: 'bg-error-100 text-error-700', icon: AlertCircle },
    todo: { label: 'To Do', className: 'bg-neutral-100 text-neutral-600', icon: Target },
    review: { label: 'Review', className: 'bg-purple-100 text-purple-700', icon: FileText },
  };

  const { label, className, icon: Icon } = config[status] || config.upcoming;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        className
      )}
    >
      <Icon className={cn(size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
      {label}
    </span>
  );
});

StatusBadge.displayName = 'StatusBadge';

// ═══════════════════════════════════════════════════════════════════════════════
// PRIORITY BADGE
// ═══════════════════════════════════════════════════════════════════════════════

interface PriorityBadgeProps {
  priority: TaskPriority;
}

const PriorityBadge: React.FC<PriorityBadgeProps> = memo(({ priority }) => {
  const config: Record<TaskPriority, { label: string; className: string }> = {
    critical: { label: 'Critical', className: 'text-error-600' },
    high: { label: 'High', className: 'text-amber-600' },
    medium: { label: 'Medium', className: 'text-info-600' },
    low: { label: 'Low', className: 'text-neutral-500' },
  };

  const { className } = config[priority];

  return <Flag className={cn('w-3.5 h-3.5', className)} />;
});

PriorityBadge.displayName = 'PriorityBadge';

// ═══════════════════════════════════════════════════════════════════════════════
// AVATAR
// ═══════════════════════════════════════════════════════════════════════════════

interface AvatarProps {
  name: string;
  initials: string;
  status?: 'active' | 'away' | 'offline';
  size?: 'sm' | 'md' | 'lg';
}

const Avatar: React.FC<AvatarProps> = memo(({ name, initials, status, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
  };

  const statusClasses = {
    active: 'bg-success-500',
    away: 'bg-amber-500',
    offline: 'bg-neutral-400',
  };

  // Generate a consistent color based on name
  const colorIndex = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 6;
  const colors = [
    'bg-primary-100 text-primary-700',
    'bg-purple-100 text-purple-700',
    'bg-amber-100 text-amber-700',
    'bg-success-100 text-success-700',
    'bg-info-100 text-info-700',
    'bg-pink-100 text-pink-700',
  ];

  return (
    <div className="relative inline-block" title={name}>
      <div
        className={cn(
          'flex items-center justify-center rounded-full font-semibold',
          sizeClasses[size],
          colors[colorIndex]
        )}
      >
        {initials}
      </div>
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-white',
            size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5',
            statusClasses[status]
          )}
        />
      )}
    </div>
  );
});

Avatar.displayName = 'Avatar';

// ═══════════════════════════════════════════════════════════════════════════════
// TASK ROW
// ═══════════════════════════════════════════════════════════════════════════════

interface TaskRowProps {
  task: Task;
}

const TaskRow: React.FC<TaskRowProps> = memo(({ task }) => {
  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return { text: `${Math.abs(days)}d overdue`, urgent: true };
    if (days === 0) return { text: 'Today', urgent: true };
    if (days === 1) return { text: 'Tomorrow', urgent: days <= 2 };
    if (days <= 7) return { text: `${days}d left`, urgent: false };
    return { text: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date), urgent: false };
  };

  const dueInfo = task.dueDate ? formatDate(task.dueDate) : null;

  return (
    <motion.div
      className="flex items-center gap-3 py-2 px-3 -mx-3 rounded-lg hover:bg-neutral-50 transition-colors group cursor-pointer"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Checkbox */}
      <button
        className={cn(
          'w-4 h-4 rounded border-2 flex-shrink-0 transition-colors',
          task.status === 'done'
            ? 'bg-success-500 border-success-500 text-white'
            : 'border-neutral-300 hover:border-primary-400'
        )}
      >
        {task.status === 'done' && <CheckCircle2 className="w-3 h-3" />}
      </button>

      {/* Title */}
      <span
        className={cn(
          'flex-1 text-sm truncate',
          task.status === 'done' ? 'text-neutral-400 line-through' : 'text-neutral-700'
        )}
      >
        {task.title}
      </span>

      {/* Priority */}
      <PriorityBadge priority={task.priority} />

      {/* Due date */}
      {dueInfo && (
        <span
          className={cn(
            'text-xs',
            dueInfo.urgent ? 'text-error-600 font-medium' : 'text-neutral-400'
          )}
        >
          {dueInfo.text}
        </span>
      )}

      {/* Metadata */}
      <div className="flex items-center gap-2 text-neutral-400">
        {task.comments > 0 && (
          <span className="flex items-center gap-1 text-xs">
            <MessageSquare className="w-3.5 h-3.5" />
            {task.comments}
          </span>
        )}
        {task.attachments > 0 && (
          <span className="flex items-center gap-1 text-xs">
            <Link2 className="w-3.5 h-3.5" />
            {task.attachments}
          </span>
        )}
      </div>

      {/* Status */}
      <StatusBadge status={task.status} size="sm" />
    </motion.div>
  );
});

TaskRow.displayName = 'TaskRow';

// ═══════════════════════════════════════════════════════════════════════════════
// MILESTONE CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface MilestoneCardProps {
  milestone: Milestone;
  index: number;
}

const MilestoneCard: React.FC<MilestoneCardProps> = memo(({ milestone, index }) => {
  const [expanded, setExpanded] = useState(milestone.status === 'in_progress');

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);

  const daysUntil = Math.ceil((milestone.targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <motion.div
      className="bg-white rounded-xl border border-neutral-200 overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-neutral-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
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
                milestone.status === 'completed' ? '#647746' :
                milestone.status === 'at_risk' ? '#d97706' :
                milestone.status === 'blocked' ? '#dc2626' :
                '#5585b3'
              }
              strokeWidth="4"
              strokeDasharray={`${(milestone.progress / 100) * 125.6} 125.6`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-neutral-700">
            {milestone.progress}%
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-neutral-900 truncate">{milestone.name}</h3>
            <StatusBadge status={milestone.status} size="sm" />
          </div>
          <p className="text-sm text-neutral-500 mt-0.5">
            {milestone.owner} • Target: {formatDate(milestone.targetDate)}
            {milestone.status !== 'completed' && daysUntil > 0 && (
              <span className={cn('ml-2', daysUntil <= 14 ? 'text-amber-600' : '')}>
                ({daysUntil}d left)
              </span>
            )}
          </p>
        </div>

        {/* Task count */}
        {milestone.tasks.length > 0 && (
          <div className="flex items-center gap-2 text-neutral-400">
            <span className="text-sm">{milestone.tasks.filter(t => t.status === 'done').length}/{milestone.tasks.length}</span>
            <ChevronDown
              className={cn('w-5 h-5 transition-transform', expanded && 'rotate-180')}
            />
          </div>
        )}
      </div>

      {/* Tasks */}
      <AnimatePresence>
        {expanded && milestone.tasks.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-neutral-100"
          >
            <div className="p-4 space-y-1">
              {milestone.tasks.map(task => (
                <TaskRow key={task.id} task={task} />
              ))}
              <button className="flex items-center gap-2 w-full py-2 text-sm text-neutral-400 hover:text-primary-600 transition-colors">
                <Plus className="w-4 h-4" />
                Add task
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

MilestoneCard.displayName = 'MilestoneCard';

// ═══════════════════════════════════════════════════════════════════════════════
// TEAM PANEL
// ═══════════════════════════════════════════════════════════════════════════════

interface TeamPanelProps {
  team: TeamMember[];
}

const TeamPanel: React.FC<TeamPanelProps> = memo(({ team }) => (
  <div className="bg-white rounded-xl border border-neutral-200 p-4">
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-semibold text-neutral-900">Team</h3>
      <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">
        Manage
      </button>
    </div>
    <div className="space-y-3">
      {team.map((member, index) => (
        <motion.div
          key={member.id}
          className="flex items-center gap-3"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <Avatar name={member.name} initials={member.initials} status={member.status} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">{member.name}</p>
            <p className="text-xs text-neutral-500 truncate">{member.role}</p>
          </div>
        </motion.div>
      ))}
    </div>
    <button className="flex items-center gap-2 w-full mt-4 py-2 text-sm text-neutral-500 hover:text-primary-600 transition-colors">
      <Plus className="w-4 h-4" />
      Add team member
    </button>
  </div>
));

TeamPanel.displayName = 'TeamPanel';

// ═══════════════════════════════════════════════════════════════════════════════
// TIMELINE VISUALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

interface TimelineVisualizationProps {
  milestones: Milestone[];
  startDate: Date;
  endDate: Date;
}

const TimelineVisualization: React.FC<TimelineVisualizationProps> = memo(({ milestones, startDate, endDate }) => {
  const totalDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  const today = new Date();
  const todayPosition = ((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100;

  const getPosition = (date: Date) => {
    const days = (date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    return (days / totalDays) * 100;
  };

  const statusColors: Record<MilestoneStatus, string> = {
    completed: '#647746',
    in_progress: '#5585b3',
    upcoming: '#b0aea5',
    at_risk: '#d97706',
    blocked: '#dc2626',
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-neutral-900">Timeline</h3>
        <div className="flex items-center gap-4 text-xs text-neutral-400">
          <span>{new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(startDate)}</span>
          <ArrowRight className="w-3 h-3" />
          <span>{new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(endDate)}</span>
        </div>
      </div>

      {/* Timeline bar */}
      <div className="relative h-12 bg-neutral-100 rounded-lg overflow-hidden">
        {/* Today marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary-500 z-10"
          style={{ left: `${Math.min(Math.max(todayPosition, 0), 100)}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-primary-500 text-white text-[10px] font-medium whitespace-nowrap">
            Today
          </div>
        </div>

        {/* Milestones */}
        {milestones.map((milestone, index) => {
          const position = getPosition(milestone.targetDate);
          return (
            <motion.div
              key={milestone.id}
              className="absolute top-1/2 -translate-y-1/2 cursor-pointer group"
              style={{ left: `${Math.min(Math.max(position, 2), 98)}%` }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: index * 0.1 }}
            >
              <div
                className="w-4 h-4 rounded-full border-2 border-white shadow-sm transition-transform group-hover:scale-125"
                style={{ backgroundColor: statusColors[milestone.status] }}
              />
              <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="px-2 py-1 bg-neutral-900 text-white text-xs rounded whitespace-nowrap">
                  {milestone.name}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs">
        {Object.entries(statusColors).slice(0, 4).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-neutral-500 capitalize">{status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

TimelineVisualization.displayName = 'TimelineVisualization';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ProgramWorkbenchV3: React.FC<{ className?: string }> = ({ className }) => {
  const program = MOCK_PROGRAM;

  const statusConfig = {
    on_track: { label: 'On Track', className: 'bg-success-100 text-success-700' },
    at_risk: { label: 'At Risk', className: 'bg-amber-100 text-amber-700' },
    delayed: { label: 'Delayed', className: 'bg-error-100 text-error-700' },
  };

  const totalTasks = program.milestones.reduce((sum, m) => sum + m.tasks.length, 0);
  const completedTasks = program.milestones.reduce(
    (sum, m) => sum + m.tasks.filter(t => t.status === 'done').length,
    0
  );

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary-100">
            <Folder className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">{program.name}</h1>
              <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', statusConfig[program.status].className)}>
                {statusConfig[program.status].label}
              </span>
            </div>
            <p className="text-neutral-500 mt-0.5">
              {program.phase} • {program.indication}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
            <Settings className="w-5 h-5" />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors">
            <Plus className="w-4 h-4" />
            Add Milestone
          </button>
        </div>
      </div>

      {/* Progress Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          className="bg-white rounded-xl border border-neutral-200 p-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-sm text-neutral-500">Overall Progress</p>
          <div className="flex items-end gap-2 mt-1">
            <span className="text-3xl font-bold text-neutral-900">{program.progress}%</span>
            <span className="text-success-600 text-sm font-medium mb-1 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              +5%
            </span>
          </div>
          <div className="h-2 bg-neutral-100 rounded-full mt-3 overflow-hidden">
            <motion.div
              className="h-full bg-primary-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${program.progress}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </motion.div>

        <motion.div
          className="bg-white rounded-xl border border-neutral-200 p-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <p className="text-sm text-neutral-500">Tasks Completed</p>
          <div className="flex items-end gap-2 mt-1">
            <span className="text-3xl font-bold text-neutral-900">{completedTasks}</span>
            <span className="text-neutral-400 text-lg mb-1">/ {totalTasks}</span>
          </div>
          <div className="h-2 bg-neutral-100 rounded-full mt-3 overflow-hidden">
            <motion.div
              className="h-full bg-success-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: totalTasks > 0 ? `${(completedTasks / totalTasks) * 100}%` : '0%' }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
            />
          </div>
        </motion.div>

        <motion.div
          className="bg-white rounded-xl border border-neutral-200 p-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <p className="text-sm text-neutral-500">Days to Target</p>
          <div className="flex items-end gap-2 mt-1">
            <span className="text-3xl font-bold text-neutral-900">
              {Math.ceil((program.targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))}
            </span>
            <span className="text-neutral-400 text-sm mb-1">days</span>
          </div>
          <p className="text-xs text-neutral-400 mt-2">
            Target: {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(program.targetDate)}
          </p>
        </motion.div>
      </div>

      {/* Timeline */}
      <TimelineVisualization
        milestones={program.milestones}
        startDate={program.startDate}
        endDate={program.targetDate}
      />

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Milestones - 3 columns */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-neutral-900">Milestones</h2>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-neutral-100 transition-colors">
                <Filter className="w-4 h-4" />
                Filter
              </button>
            </div>
          </div>
          <div className="space-y-4">
            {program.milestones.map((milestone, index) => (
              <MilestoneCard key={milestone.id} milestone={milestone} index={index} />
            ))}
          </div>
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-4">
          <TeamPanel team={program.team} />

          {/* AI Assistance */}
          <div className="bg-gradient-to-br from-primary-50 to-accent-50 rounded-xl border border-primary-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-primary-600" />
              <h3 className="font-semibold text-primary-900">AI Insights</h3>
            </div>
            <p className="text-sm text-primary-700 mb-3">
              Based on current progress, CMC Amendments milestone may need attention to stay on track.
            </p>
            <button className="flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors">
              <Zap className="w-4 h-4" />
              Get recommendations
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProgramWorkbenchV3;
