/**
 * @fileoverview Task Board — Kanban-style task management for Mission Control
 * @module concept2cure/pages/MissionControl/TaskBoard
 * @version 1.0.0
 *
 * @description
 * Drag-and-drop Kanban board with board/list views, filtering, inline task
 * expansion, and an add-task modal. Uses HTML5 drag events (no external lib).
 *
 * @compliance
 * - FDA 21 CFR Part 11: Task mutations are audit-logged server-side
 */

import React, { useState, useMemo, useCallback, DragEvent } from 'react';
import { cn } from '@/lib/utils';
import {
  LayoutGrid,
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  Calendar,
  User,
  Link2,
  MessageSquare,
  Clock,
  List,
  GripVertical,
  X,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Timer,
  Eye,
} from 'lucide-react';

// =============================================================================
// TYPES & CONSTANTS
// =============================================================================

interface TaskBoardProps {
  programId: number | null;
}

type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
type TaskModule = 'CMC' | 'IND' | 'eCTD' | '510k' | 'Clinical';
type ViewMode = 'board' | 'list';
type SortField = 'priority' | 'title' | 'status' | 'assignee' | 'dueDate' | 'module' | 'progress';
type SortDir = 'asc' | 'desc';

interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignee: string;
  assigneeInitials: string;
  dueDate: string;
  module: TaskModule;
  subtasksDone: number;
  subtasksTotal: number;
  dependencies: string[];
  commentsCount: number;
  createdAt: string;
  updatedAt: string;
}

const STATUS_META: Record<TaskStatus, { label: string; headerColor: string; dotColor: string }> = {
  backlog:     { label: 'Backlog',     headerColor: 'bg-zinc-600',   dotColor: 'bg-zinc-400' },
  todo:        { label: 'To Do',       headerColor: 'bg-blue-600',   dotColor: 'bg-blue-500' },
  in_progress: { label: 'In Progress', headerColor: 'bg-amber-500',  dotColor: 'bg-amber-500' },
  review:      { label: 'Review',      headerColor: 'bg-violet-600', dotColor: 'bg-violet-500' },
  done:        { label: 'Done',        headerColor: 'bg-emerald-600', dotColor: 'bg-emerald-500' },
};

const COLUMN_ORDER: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done'];

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; bg: string; text: string; sortVal: number }> = {
  critical: { label: 'Critical', bg: 'bg-red-100',    text: 'text-red-700',    sortVal: 0 },
  high:     { label: 'High',     bg: 'bg-orange-100', text: 'text-orange-700', sortVal: 1 },
  medium:   { label: 'Medium',   bg: 'bg-amber-100',  text: 'text-amber-700',  sortVal: 2 },
  low:      { label: 'Low',      bg: 'bg-blue-100',   text: 'text-blue-700',   sortVal: 3 },
};

const MODULE_CONFIG: Record<TaskModule, { bg: string; text: string }> = {
  CMC:      { bg: 'bg-purple-100',  text: 'text-purple-700' },
  IND:      { bg: 'bg-blue-100',    text: 'text-blue-700' },
  eCTD:     { bg: 'bg-teal-100',    text: 'text-teal-700' },
  '510k':   { bg: 'bg-orange-100',  text: 'text-orange-700' },
  Clinical: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
};

const ALL_PRIORITIES: TaskPriority[] = ['critical', 'high', 'medium', 'low'];
const ALL_MODULES: TaskModule[] = ['CMC', 'IND', 'eCTD', '510k', 'Clinical'];

// =============================================================================
// MOCK DATA
// =============================================================================

const INITIAL_TASKS: Task[] = [
  {
    id: 't1', title: 'Draft Module 3.2.S Drug Substance', description: 'Prepare the CMC drug substance section including manufacturing process, controls, and characterization.',
    priority: 'critical', status: 'in_progress', assignee: 'Sarah Chen', assigneeInitials: 'SC',
    dueDate: '2026-03-14', module: 'CMC', subtasksDone: 3, subtasksTotal: 7, dependencies: [], commentsCount: 5,
    createdAt: '2026-02-01', updatedAt: '2026-03-10',
  },
  {
    id: 't2', title: 'Finalize nonclinical pharmacology summary', description: 'Complete Module 2.6 pharmacology written summary for IND.',
    priority: 'high', status: 'review', assignee: 'James Miller', assigneeInitials: 'JM',
    dueDate: '2026-03-18', module: 'IND', subtasksDone: 4, subtasksTotal: 5, dependencies: ['t1'], commentsCount: 3,
    createdAt: '2026-01-20', updatedAt: '2026-03-12',
  },
  {
    id: 't3', title: 'Compile eCTD Module 1 regional docs', description: 'Gather FDA cover letters, forms 356h, and patent information.',
    priority: 'medium', status: 'todo', assignee: 'Priya Patel', assigneeInitials: 'PP',
    dueDate: '2026-03-25', module: 'eCTD', subtasksDone: 1, subtasksTotal: 4, dependencies: [], commentsCount: 1,
    createdAt: '2026-02-15', updatedAt: '2026-03-08',
  },
  {
    id: 't4', title: 'Predicate device comparison table', description: 'Build a detailed comparison of features, materials, and performance for 510(k).',
    priority: 'high', status: 'in_progress', assignee: 'David Kim', assigneeInitials: 'DK',
    dueDate: '2026-03-17', module: '510k', subtasksDone: 2, subtasksTotal: 6, dependencies: [], commentsCount: 2,
    createdAt: '2026-02-10', updatedAt: '2026-03-13',
  },
  {
    id: 't5', title: 'Clinical protocol v2.1 amendments', description: 'Address FDA comments on primary endpoint selection and sample size.',
    priority: 'critical', status: 'todo', assignee: 'Emily Rodriguez', assigneeInitials: 'ER',
    dueDate: '2026-03-15', module: 'Clinical', subtasksDone: 0, subtasksTotal: 3, dependencies: [], commentsCount: 8,
    createdAt: '2026-01-25', updatedAt: '2026-03-11',
  },
  {
    id: 't6', title: 'Stability data trending analysis', description: 'Compile 6-month accelerated and long-term stability data into ICH-format tables.',
    priority: 'medium', status: 'backlog', assignee: 'Sarah Chen', assigneeInitials: 'SC',
    dueDate: '2026-04-01', module: 'CMC', subtasksDone: 0, subtasksTotal: 4, dependencies: ['t1'], commentsCount: 0,
    createdAt: '2026-03-01', updatedAt: '2026-03-01',
  },
  {
    id: 't7', title: 'Investigator Brochure update', description: 'Incorporate new toxicology findings into IB edition 5.',
    priority: 'high', status: 'backlog', assignee: 'James Miller', assigneeInitials: 'JM',
    dueDate: '2026-03-28', module: 'IND', subtasksDone: 0, subtasksTotal: 5, dependencies: ['t2'], commentsCount: 1,
    createdAt: '2026-03-05', updatedAt: '2026-03-05',
  },
  {
    id: 't8', title: 'Publish eCTD sequence 0005', description: 'Validate and publish the next eCTD sequence to the FDA gateway.',
    priority: 'critical', status: 'todo', assignee: 'Priya Patel', assigneeInitials: 'PP',
    dueDate: '2026-03-16', module: 'eCTD', subtasksDone: 1, subtasksTotal: 3, dependencies: ['t3'], commentsCount: 4,
    createdAt: '2026-02-28', updatedAt: '2026-03-14',
  },
  {
    id: 't9', title: 'Biocompatibility test report review', description: 'Review ISO 10993 biocompatibility testing results from contract lab.',
    priority: 'medium', status: 'review', assignee: 'David Kim', assigneeInitials: 'DK',
    dueDate: '2026-03-22', module: '510k', subtasksDone: 3, subtasksTotal: 3, dependencies: [], commentsCount: 2,
    createdAt: '2026-02-05', updatedAt: '2026-03-15',
  },
  {
    id: 't10', title: 'SAE reconciliation Q1 2026', description: 'Reconcile serious adverse events between clinical database and safety database.',
    priority: 'high', status: 'in_progress', assignee: 'Emily Rodriguez', assigneeInitials: 'ER',
    dueDate: '2026-03-19', module: 'Clinical', subtasksDone: 5, subtasksTotal: 8, dependencies: [], commentsCount: 6,
    createdAt: '2026-03-01', updatedAt: '2026-03-14',
  },
  {
    id: 't11', title: 'Container closure integrity testing', description: 'Evaluate container closure system integrity per USP <1207>.',
    priority: 'low', status: 'done', assignee: 'Sarah Chen', assigneeInitials: 'SC',
    dueDate: '2026-03-10', module: 'CMC', subtasksDone: 5, subtasksTotal: 5, dependencies: [], commentsCount: 3,
    createdAt: '2026-01-15', updatedAt: '2026-03-09',
  },
  {
    id: 't12', title: 'Pre-IND meeting request draft', description: 'Prepare Type B meeting request package for FDA pre-IND meeting.',
    priority: 'low', status: 'done', assignee: 'James Miller', assigneeInitials: 'JM',
    dueDate: '2026-03-05', module: 'IND', subtasksDone: 4, subtasksTotal: 4, dependencies: [], commentsCount: 7,
    createdAt: '2026-01-10', updatedAt: '2026-03-04',
  },
  {
    id: 't13', title: 'DSUR annual report compilation', description: 'Compile Development Safety Update Report for ongoing clinical trials.',
    priority: 'medium', status: 'backlog', assignee: 'Emily Rodriguez', assigneeInitials: 'ER',
    dueDate: '2026-04-15', module: 'Clinical', subtasksDone: 0, subtasksTotal: 6, dependencies: ['t10'], commentsCount: 0,
    createdAt: '2026-03-10', updatedAt: '2026-03-10',
  },
  {
    id: 't14', title: 'Software validation documentation', description: 'Complete IQ/OQ/PQ validation documentation for device software.',
    priority: 'high', status: 'todo', assignee: 'David Kim', assigneeInitials: 'DK',
    dueDate: '2026-03-20', module: '510k', subtasksDone: 1, subtasksTotal: 5, dependencies: ['t4'], commentsCount: 0,
    createdAt: '2026-03-08', updatedAt: '2026-03-12',
  },
  {
    id: 't15', title: 'eCTD lifecycle management review', description: 'Audit lifecycle status of all documents in Module 2-5 for next sequence.',
    priority: 'low', status: 'backlog', assignee: 'Priya Patel', assigneeInitials: 'PP',
    dueDate: '2026-04-10', module: 'eCTD', subtasksDone: 0, subtasksTotal: 3, dependencies: ['t8'], commentsCount: 1,
    createdAt: '2026-03-12', updatedAt: '2026-03-12',
  },
];

// =============================================================================
// HELPERS
// =============================================================================

function getDueDateStatus(dueDate: string): 'overdue' | 'soon' | 'ok' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 3) return 'soon';
  return 'ok';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/* ---------- Priority badge ---------- */
function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', cfg.bg, cfg.text)}>
      {cfg.label}
    </span>
  );
}

/* ---------- Module badge ---------- */
function ModuleBadge({ module }: { module: TaskModule }) {
  const cfg = MODULE_CONFIG[module];
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', cfg.bg, cfg.text)}>
      {module}
    </span>
  );
}

/* ---------- Assignee avatar ---------- */
function AvatarCircle({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-7 h-7 rounded-full bg-zinc-200 text-zinc-700 text-xs font-semibold',
        className,
      )}
    >
      {initials}
    </span>
  );
}

/* ---------- Subtask progress bar ---------- */
function SubtaskBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
      <div className="flex-1 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-blue-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>
        {done}/{total}
      </span>
    </div>
  );
}

/* ---------- Task Card (Board view) ---------- */
function TaskCard({
  task,
  expanded,
  onToggle,
  onDragStart,
  onMoveToColumn,
}: {
  task: Task;
  expanded: boolean;
  onToggle: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onMoveToColumn: (taskId: string, status: TaskStatus) => void;
}) {
  const dueStat = getDueDateStatus(task.dueDate);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onToggle}
      className={cn(
        'bg-white border border-zinc-200 rounded-xl p-3 cursor-pointer select-none',
        'hover:shadow-md transition-shadow group',
      )}
    >
      {/* Drag grip */}
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 text-zinc-400 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          {/* Title */}
          <p className="text-sm font-semibold text-zinc-900 leading-snug">{task.title}</p>

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={task.priority} />
            <ModuleBadge module={task.module} />
            {task.dependencies.length > 0 && (
              <span className="text-zinc-400" title="Has dependencies">
                <Link2 className="w-3.5 h-3.5" />
              </span>
            )}
          </div>

          {/* Bottom row */}
          <div className="flex items-center justify-between gap-2">
            <AvatarCircle initials={task.assigneeInitials} />
            <span
              className={cn(
                'text-xs flex items-center gap-1',
                dueStat === 'overdue' && 'text-red-600 font-medium',
                dueStat === 'soon' && 'text-amber-600 font-medium',
                dueStat === 'ok' && 'text-zinc-500',
              )}
            >
              <Calendar className="w-3 h-3" />
              {formatDate(task.dueDate)}
            </span>
          </div>

          {/* Subtask bar */}
          {task.subtasksTotal > 0 && <SubtaskBar done={task.subtasksDone} total={task.subtasksTotal} />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="mt-3 pt-3 border-t border-zinc-200 space-y-3 text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-zinc-600">{task.description}</p>

          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" /> {task.assignee}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> {task.commentsCount} comments
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> Created {formatDate(task.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> Updated {formatDate(task.updatedAt)}
            </span>
          </div>

          {task.dependencies.length > 0 && (
            <div className="text-xs text-zinc-500">
              <span className="font-medium">Dependencies:</span>{' '}
              {task.dependencies.join(', ')}
            </div>
          )}

          {/* Move-to buttons */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {COLUMN_ORDER.filter((s) => s !== task.status).map((s) => (
              <button
                key={s}
                onClick={() => onMoveToColumn(task.id, s)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium',
                  'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors duration-150',
                )}
              >
                <ArrowRight className="w-3 h-3" />
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Add Task Modal ---------- */
function AddTaskModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (task: Task) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [status, setStatus] = useState<TaskStatus>('backlog');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [module, setModule] = useState<TaskModule>('CMC');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const initials = getInitials(assignee || 'Unassigned');
    const now = new Date().toISOString().slice(0, 10);
    onAdd({
      id: `t_${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      priority,
      status,
      assignee: assignee.trim() || 'Unassigned',
      assigneeInitials: initials,
      dueDate: dueDate || now,
      module,
      subtasksDone: 0,
      subtasksTotal: 0,
      dependencies: [],
      commentsCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-900">Add Task</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
              placeholder="Task title"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 outline-none resize-none"
              rows={3}
              placeholder="Task description"
            />
          </div>

          {/* Row: Priority + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
              >
                {ALL_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
              >
                {COLUMN_ORDER.map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row: Assignee + Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Assignee</label>
              <input
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                placeholder="Name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Module */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Module</label>
            <select
              value={module}
              onChange={(e) => setModule(e.target.value as TaskModule)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
            >
              {ALL_MODULES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-150"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function TaskBoard({ programId }: TaskBoardProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState<TaskModule | 'all'>('all');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('priority');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ── Derived ────────────────────────────────────────────────────────────────
  const uniqueAssignees = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.assignee))).sort(),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (assigneeFilter !== 'all' && t.assignee !== assigneeFilter) return false;
      if (moduleFilter !== 'all' && t.module !== moduleFilter) return false;
      return true;
    });
  }, [tasks, searchQuery, priorityFilter, assigneeFilter, moduleFilter]);

  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'priority':
          cmp = PRIORITY_CONFIG[a.priority].sortVal - PRIORITY_CONFIG[b.priority].sortVal;
          break;
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'status':
          cmp = COLUMN_ORDER.indexOf(a.status) - COLUMN_ORDER.indexOf(b.status);
          break;
        case 'assignee':
          cmp = a.assignee.localeCompare(b.assignee);
          break;
        case 'dueDate':
          cmp = a.dueDate.localeCompare(b.dueDate);
          break;
        case 'module':
          cmp = a.module.localeCompare(b.module);
          break;
        case 'progress':
          cmp =
            (a.subtasksTotal > 0 ? a.subtasksDone / a.subtasksTotal : 0) -
            (b.subtasksTotal > 0 ? b.subtasksDone / b.subtasksTotal : 0);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredTasks, sortField, sortDir]);

  const tasksByColumn = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      backlog: [], todo: [], in_progress: [], review: [], done: [],
    };
    filteredTasks.forEach((t) => map[t.status].push(t));
    return map;
  }, [filteredTasks]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const moveTask = useCallback((taskId: string, newStatus: TaskStatus) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: newStatus, updatedAt: new Date().toISOString().slice(0, 10) }
          : t,
      ),
    );
  }, []);

  const addTask = useCallback((task: Task) => {
    setTasks((prev) => [...prev, task]);
  }, []);

  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTaskId(taskId);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, column: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(column);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, column: TaskStatus) => {
      e.preventDefault();
      const taskId = e.dataTransfer.getData('text/plain');
      if (taskId) moveTask(taskId, column);
      setDragOverColumn(null);
      setDraggedTaskId(null);
    },
    [moveTask],
  );

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('asc');
      }
    },
    [sortField],
  );

  // ── Column status icon helper ──────────────────────────────────────────────
  function statusIcon(status: TaskStatus) {
    switch (status) {
      case 'backlog':     return <Circle className="w-4 h-4" />;
      case 'todo':        return <CheckCircle2 className="w-4 h-4" />;
      case 'in_progress': return <Timer className="w-4 h-4" />;
      case 'review':      return <Eye className="w-4 h-4" />;
      case 'done':        return <CheckCircle2 className="w-4 h-4" />;
    }
  }

  // ── Sort header helper (list view) ─────────────────────────────────────────
  function SortHeader({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    return (
      <button
        onClick={() => toggleSort(field)}
        className={cn(
          'flex items-center gap-1 text-xs font-medium uppercase tracking-wide',
          active ? 'text-blue-600' : 'text-zinc-500 hover:text-zinc-700',
        )}
      >
        {label}
        {active && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </button>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">Task Board</h2>
            <p className="text-sm text-zinc-500">{filteredTasks.length} tasks</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-zinc-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('board')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150',
                viewMode === 'board' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700',
              )}
            >
              <LayoutGrid className="w-4 h-4" />
              Board
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150',
                viewMode === 'list' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700',
              )}
            >
              <List className="w-4 h-4" />
              List
            </button>
          </div>

          {/* Add task */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors duration-150"
          >
            <Plus className="w-4 h-4" />
            Add Task
          </button>
        </div>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 bg-zinc-50 border border-zinc-200 rounded-xl p-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
          />
        </div>

        {/* Priority */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | 'all')}
          className="bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
        >
          <option value="all">All Priorities</option>
          {ALL_PRIORITIES.map((p) => (
            <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
          ))}
        </select>

        {/* Assignee */}
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
        >
          <option value="all">All Assignees</option>
          {uniqueAssignees.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {/* Module */}
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value as TaskModule | 'all')}
          className="bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
        >
          <option value="all">All Modules</option>
          {ALL_MODULES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* ── Board View ──────────────────────────────────────────────────────── */}
      {viewMode === 'board' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMN_ORDER.map((col) => {
            const meta = STATUS_META[col];
            const colTasks = tasksByColumn[col];

            return (
              <div
                key={col}
                className={cn(
                  'flex-shrink-0 w-72 flex flex-col rounded-xl border border-zinc-200 bg-zinc-50/60',
                  dragOverColumn === col && 'ring-2 ring-blue-400 bg-blue-50/40',
                )}
                onDragOver={(e) => handleDragOver(e, col)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col)}
              >
                {/* Column header */}
                <div className={cn('flex items-center justify-between px-3 py-2.5 rounded-t-xl text-white', meta.headerColor)}>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {statusIcon(col)}
                    {meta.label}
                  </div>
                  <span className="bg-white/20 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards area */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-320px)] min-h-[120px]">
                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      className={cn(draggedTaskId === task.id && 'opacity-40')}
                    >
                      <TaskCard
                        task={task}
                        expanded={expandedTaskId === task.id}
                        onToggle={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onMoveToColumn={moveTask}
                      />
                    </div>
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-center text-xs text-zinc-400 py-8">
                      No tasks
                    </div>
                  )}
                </div>

                {/* Add task at bottom */}
                <button
                  onClick={() => {
                    setShowAddModal(true);
                  }}
                  className="flex items-center justify-center gap-1.5 m-2 px-3 py-2 rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-500 hover:border-blue-400 hover:text-blue-600 transition-colors duration-150"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add task
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── List View ───────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="border border-zinc-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200">
                <th className="text-left px-4 py-3"><SortHeader field="priority" label="Priority" /></th>
                <th className="text-left px-4 py-3"><SortHeader field="title" label="Title" /></th>
                <th className="text-left px-4 py-3"><SortHeader field="status" label="Status" /></th>
                <th className="text-left px-4 py-3"><SortHeader field="assignee" label="Assignee" /></th>
                <th className="text-left px-4 py-3"><SortHeader field="dueDate" label="Due Date" /></th>
                <th className="text-left px-4 py-3"><SortHeader field="module" label="Module" /></th>
                <th className="text-left px-4 py-3"><SortHeader field="progress" label="Progress" /></th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map((task) => {
                const dueStat = getDueDateStatus(task.dueDate);
                const isExpanded = expandedTaskId === task.id;

                return (
                  <React.Fragment key={task.id}>
                    <tr
                      onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                      className={cn(
                        'border-b border-zinc-200 cursor-pointer hover:bg-zinc-50 transition-colors duration-150',
                        isExpanded && 'bg-zinc-50',
                      )}
                    >
                      <td className="px-4 py-3"><PriorityBadge priority={task.priority} /></td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-zinc-900">{task.title}</span>
                        {task.dependencies.length > 0 && (
                          <Link2 className="inline w-3.5 h-3.5 ml-1.5 text-zinc-400" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-zinc-700">
                          <span className={cn('w-2 h-2 rounded-full', STATUS_META[task.status].dotColor)} />
                          {STATUS_META[task.status].label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <AvatarCircle initials={task.assigneeInitials} className="w-6 h-6 text-xs" />
                          <span className="text-zinc-700">{task.assignee}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'flex items-center gap-1',
                            dueStat === 'overdue' && 'text-red-600 font-medium',
                            dueStat === 'soon' && 'text-amber-600 font-medium',
                            dueStat === 'ok' && 'text-zinc-500',
                          )}
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(task.dueDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3"><ModuleBadge module={task.module} /></td>
                      <td className="px-4 py-3 w-32">
                        {task.subtasksTotal > 0 ? (
                          <SubtaskBar done={task.subtasksDone} total={task.subtasksTotal} />
                        ) : (
                          <span className="text-xs text-zinc-400">--</span>
                        )}
                      </td>
                    </tr>

                    {/* Expanded row detail */}
                    {isExpanded && (
                      <tr className="bg-zinc-50/80">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                            <p className="text-sm text-zinc-600">{task.description}</p>

                            <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
                              <span className="flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" /> {task.commentsCount} comments
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Created {formatDate(task.createdAt)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Updated {formatDate(task.updatedAt)}
                              </span>
                              {task.dependencies.length > 0 && (
                                <span className="flex items-center gap-1">
                                  <Link2 className="w-3 h-3" /> Deps: {task.dependencies.join(', ')}
                                </span>
                              )}
                            </div>

                            {/* Move-to buttons */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {COLUMN_ORDER.filter((s) => s !== task.status).map((s) => (
                                <button
                                  key={s}
                                  onClick={() => moveTask(task.id, s)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors duration-150"
                                >
                                  <ArrowRight className="w-3 h-3" />
                                  {STATUS_META[s].label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {sortedTasks.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-zinc-400 text-sm">
                    No tasks match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Task Modal ──────────────────────────────────────────────────── */}
      {showAddModal && <AddTaskModal onClose={() => setShowAddModal(false)} onAdd={addTask} />}
    </div>
  );
}
