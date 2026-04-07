/**
 * ProjectTaskBoard — Kanban-style task management for regulatory projects.
 *
 * Columns: To Do | In Progress | Review | Done | Blocked
 * Wired to useProjectTasks hook for real CRUD operations.
 * Supports milestone generation, priority badges, and due-date indicators.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Circle,
  Loader2,
  ArrowUpRight,
  Flag,
  Calendar,
  ChevronRight,
  X,
  Zap,
  ListChecks,
} from 'lucide-react';
import { useProjectTasks, type ProjectTask, type TaskSummary } from '../../hooks/useProjectTasks';
import { DataStateWrapper } from '@/components/ui/statesV2';

// ── Types ────────────────────────────────────────────────────────────────────

type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done' | 'blocked';

interface ProjectTaskBoardProps {
  projectId: string | number;
  projectType?: string;
  compact?: boolean;
}

// ── Column config ────────────────────────────────────────────────────────────

const COLUMNS: { key: TaskStatus; label: string; icon: React.ElementType; color: string; bg: string; dot: string }[] = [
  { key: 'todo',        label: 'To Do',       icon: Circle,         color: 'text-stone-600', bg: 'bg-stone-50',  dot: 'bg-stone-400' },
  { key: 'in-progress', label: 'In Progress', icon: Loader2,        color: 'text-blue-600',  bg: 'bg-blue-50',   dot: 'bg-stone-600' },
  { key: 'review',      label: 'Review',      icon: ArrowUpRight,   color: 'text-amber-600', bg: 'bg-amber-50',  dot: 'bg-amber-500' },
  { key: 'done',        label: 'Done',        icon: CheckCircle2,   color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  { key: 'blocked',     label: 'Blocked',     icon: AlertTriangle,  color: 'text-red-600',   bg: 'bg-red-50',    dot: 'bg-red-500' },
];

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: 'Urgent', color: 'text-red-700', bg: 'bg-red-100' },
  high:   { label: 'High',   color: 'text-orange-700', bg: 'bg-orange-100' },
  medium: { label: 'Medium', color: 'text-stone-600', bg: 'bg-stone-100' },
  low:    { label: 'Low',    color: 'text-stone-400', bg: 'bg-stone-50' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── New Task Form ────────────────────────────────────────────────────────────

function NewTaskForm({
  onSubmit,
  onCancel,
  isCreating,
}: {
  onSubmit: (data: { name: string; priority: string; dueDate?: string }) => void;
  onCancel: () => void;
  isCreating: boolean;
}) {
  const [name, setName] = useState('');
  const [priority, setPriority] = useState('medium');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), priority });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm space-y-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Task name..."
        autoFocus
        className="w-full rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400/40"
      />
      <div className="flex items-center gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-400/40"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-xs text-stone-500 hover:bg-stone-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isCreating || !name.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-stone-900 px-3 py-1 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {isCreating && <Loader2 className="h-3 w-3 animate-spin" />}
          Add
        </button>
      </div>
    </form>
  );
}

// ── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onStatusChange,
}: {
  task: ProjectTask;
  onStatusChange: (taskId: number, newStatus: TaskStatus) => void;
}) {
  const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const overdue = task.status !== 'done' && isOverdue(task.dueDate);

  const nextStatus: Record<TaskStatus, TaskStatus> = {
    'todo': 'in-progress',
    'in-progress': 'review',
    'review': 'done',
    'done': 'done',
    'blocked': 'todo',
  };

  return (
    <div
      className={cn(
        'group rounded-lg border bg-white p-3 transition-all hover:shadow-sm cursor-default',
        overdue ? 'border-red-200' : 'border-stone-200',
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onStatusChange(task.id, nextStatus[task.status as TaskStatus] || 'in-progress')}
          className={cn(
            'mt-0.5 flex-shrink-0 rounded-full p-0.5 transition-colors',
            task.status === 'done' ? 'text-emerald-500' : 'text-stone-300 hover:text-stone-500',
          )}
          title={task.status === 'done' ? 'Completed' : 'Advance status'}
        >
          {task.status === 'done' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn(
            'text-sm font-medium leading-snug',
            task.status === 'done' ? 'text-stone-400 line-through' : 'text-stone-900',
          )}>
            {task.name}
          </p>
          {task.description && (
            <p className="mt-0.5 text-xs text-stone-500 line-clamp-2">{task.description}</p>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {/* Priority badge */}
        <span className={cn(
          'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium',
          priorityCfg.bg, priorityCfg.color,
        )}>
          <Flag className="h-2.5 w-2.5" />
          {priorityCfg.label}
        </span>

        {/* Module type */}
        {task.moduleType && (
          <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-stone-700">
            {task.moduleType}
          </span>
        )}

        {/* Due date */}
        {task.dueDate && (
          <span className={cn(
            'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium',
            overdue ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-500',
          )}>
            <Calendar className="h-2.5 w-2.5" />
            {formatDate(task.dueDate)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Summary Bar ──────────────────────────────────────────────────────────────

function TaskSummaryBar({ summary }: { summary: TaskSummary | null }) {
  if (!summary || summary.total === 0) return null;

  const healthColor = summary.healthScore >= 80 ? 'text-emerald-600' : summary.healthScore >= 50 ? 'text-amber-600' : 'text-red-600';
  const healthBg = summary.healthScore >= 80 ? 'bg-emerald-50' : summary.healthScore >= 50 ? 'bg-amber-50' : 'bg-red-50';

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', healthBg, healthColor)}>
        <Zap className="h-3 w-3" />
        Health: {summary.healthScore}%
      </div>
      <div className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
        <ListChecks className="h-3 w-3" />
        {summary.completed}/{summary.total} complete
      </div>
      {summary.overdue > 0 && (
        <div className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
          <AlertTriangle className="h-3 w-3" />
          {summary.overdue} overdue
        </div>
      )}
      <div className="flex-1">
        <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${summary.completionRate}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ProjectTaskBoard({ projectId, projectType, compact }: ProjectTaskBoardProps) {
  const {
    tasks,
    isLoadingTasks,
    summary,
    createTask,
    updateTask,
    isCreating,
    generateMilestones,
    isGenerating,
  } = useProjectTasks(projectId);

  const [showNewTask, setShowNewTask] = useState(false);
  const [milestonesGenerated, setMilestonesGenerated] = useState(false);

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const groups: Record<TaskStatus, ProjectTask[]> = {
      'todo': [],
      'in-progress': [],
      'review': [],
      'done': [],
      'blocked': [],
    };
    for (const task of tasks) {
      const status = (task.status as TaskStatus) || 'todo';
      if (groups[status]) {
        groups[status].push(task);
      } else {
        groups['todo'].push(task);
      }
    }
    return groups;
  }, [tasks]);

  const handleCreateTask = useCallback(async (data: { name: string; priority: string }) => {
    await createTask({ name: data.name, priority: data.priority as ProjectTask['priority'], status: 'todo' });
    setShowNewTask(false);
  }, [createTask]);

  const handleStatusChange = useCallback(async (taskId: number, newStatus: TaskStatus) => {
    await updateTask({ taskId, updates: { status: newStatus } });
  }, [updateTask]);

  const handleGenerateMilestones = useCallback(async () => {
    const submissionType = projectType?.toUpperCase() || 'IND';
    await generateMilestones({ submissionType });
    setMilestonesGenerated(true);
  }, [generateMilestones, projectType]);

  // Compact mode: show summary + quick list (for embedding in dashboard)
  if (compact) {
    const visibleTasks = tasks.filter(t => t.status !== 'done').slice(0, 5);
    return (
      <div className="space-y-3">
        <TaskSummaryBar summary={summary} />
        {visibleTasks.length === 0 && tasks.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <ListChecks className="mb-2 h-8 w-8 text-stone-300" />
            <p className="text-sm text-stone-500">No tasks yet</p>
            <button
              type="button"
              onClick={handleGenerateMilestones}
              disabled={isGenerating}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
              Generate {projectType || 'IND'} Milestones
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {visibleTasks.map(task => {
              const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
              const overdue = isOverdue(task.dueDate);
              const colCfg = COLUMNS.find(c => c.key === task.status);
              return (
                <li key={task.id} className="flex items-center gap-2 py-2">
                  <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', colCfg?.dot || 'bg-stone-400')} />
                  <span className="flex-1 min-w-0 truncate text-sm text-stone-900">{task.name}</span>
                  {overdue && <Clock className="h-3 w-3 text-red-500 flex-shrink-0" />}
                  <span className={cn('text-[10px] font-medium rounded px-1.5 py-0.5', priorityCfg.bg, priorityCfg.color)}>
                    {priorityCfg.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  // Full board view
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-4">
        <TaskSummaryBar summary={summary} />
        <div className="flex items-center gap-2 flex-shrink-0">
          {tasks.length === 0 && !milestonesGenerated && (
            <button
              type="button"
              onClick={handleGenerateMilestones}
              disabled={isGenerating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
              Generate Milestones
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowNewTask(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
          >
            <Plus className="h-3 w-3" />
            New Task
          </button>
        </div>
      </div>

      {/* New task form */}
      {showNewTask && (
        <div className="mb-4 max-w-md">
          <NewTaskForm
            onSubmit={handleCreateTask}
            onCancel={() => setShowNewTask(false)}
            isCreating={isCreating}
          />
        </div>
      )}

      {/* Kanban columns */}
      <DataStateWrapper
        data={tasks}
        isLoading={isLoadingTasks}
        error={null}
        emptyDescription="No tasks yet — generate milestones or create a task to get started"
      >
        {() => (
          <div className="grid grid-cols-5 gap-4 min-h-0 flex-1">
            {COLUMNS.map(col => {
              const colTasks = tasksByStatus[col.key] || [];
              const Icon = col.icon;
              return (
                <div
                  key={col.key}
                  className={cn(
                    'flex flex-col rounded-xl border border-stone-200 overflow-hidden',
                    col.bg,
                  )}
                >
                  {/* Column header */}
                  <div className="flex items-center gap-2 border-b border-stone-200 px-3 py-2.5">
                    <Icon className={cn('h-3.5 w-3.5', col.color)} />
                    <span className={cn('text-xs font-semibold uppercase tracking-wider', col.color)}>
                      {col.label}
                    </span>
                    <span className={cn(
                      'ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold',
                      col.bg, col.color,
                    )}>
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Task cards */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {colTasks.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                    {colTasks.length === 0 && (
                      <p className="py-4 text-center text-xs text-stone-400">
                        No tasks
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DataStateWrapper>
    </div>
  );
}

export default ProjectTaskBoard;
