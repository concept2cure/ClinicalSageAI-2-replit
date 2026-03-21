/**
 * @fileoverview Medical Writer Document Queue
 * @module concept2cure/components/writing/MedicalWriterQueue
 * @version 1.0.0
 *
 * @description
 * Specialized workspace for Medical Writers managing document production.
 * Reflects real medical writing workflows:
 * - Document queue with priorities and deadlines
 * - Review cycle tracking (Draft → MW Review → SME Review → QC → Final)
 * - Template library integration
 * - Source document linking
 * - Style guide compliance checking
 *
 * Document Types Medical Writers Handle:
 * - Clinical Study Reports (CSRs)
 * - Investigator Brochures (IBs)
 * - Summary Documents (CTD Modules 2.5, 2.7)
 * - Protocols & Protocol Amendments
 * - ICFs (Informed Consent Forms)
 * - Regulatory Responses
 *
 * @compliance
 * - ICH E3: Clinical Study Report guidelines
 * - ICH M4: CTD format compliance
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  User,
  Calendar,
  Filter,
  Search,
  BookOpen,
  FileCheck,
  MessageSquare,
  ChevronRight,
  Star,
  PenTool,
  Eye,
  Send,
  MoreHorizontal,
  Layout,
  List,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type DocumentType =
  | 'csr'              // Clinical Study Report
  | 'ib'               // Investigator Brochure
  | 'protocol'         // Protocol
  | 'protocol_amend'   // Protocol Amendment
  | 'icf'              // Informed Consent Form
  | 'ctd_2_5'          // Clinical Overview
  | 'ctd_2_7'          // Clinical Summary
  | 'response'         // Regulatory Response
  | 'briefing'         // Briefing Document
  | 'nonclinical_summary' // CTD 2.4
  | 'quality_summary'; // CTD 2.3

export type ReviewStage =
  | 'draft'            // Initial drafting
  | 'internal_review'  // Medical Writer review
  | 'sme_review'       // Subject Matter Expert review
  | 'qc'               // Quality Control
  | 'sponsor_review'   // Sponsor/Client review
  | 'final_qc'         // Final QC
  | 'approved'         // Ready for submission
  | 'published';       // In submission

export interface DocumentTask {
  id: string;
  title: string;
  documentType: DocumentType;
  productName: string;
  studyId?: string;
  
  // Progress
  stage: ReviewStage;
  progress: number;  // 0-100
  
  // Deadlines
  dueDate: string;
  submissionTarget?: string;
  
  // People
  assignedWriter: string;
  reviewer?: string;
  sponsor?: string;
  
  // Metrics
  wordCount?: number;
  targetWordCount?: number;
  pageCount?: number;
  sourceDocuments?: number;
  pendingComments?: number;
  
  // Status
  priority: 'low' | 'medium' | 'high' | 'critical';
  isOverdue?: boolean;
  isBlocked?: boolean;
  blockedReason?: string;
}

interface MedicalWriterQueueProps {
  tasks: DocumentTask[];
  currentUser: string;
  onTaskClick?: (task: DocumentTask) => void;
  onStartWriting?: (task: DocumentTask) => void;
  onReviewComplete?: (task: DocumentTask) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DOCUMENT_TYPE_CONFIG: Record<DocumentType, {
  label: string;
  shortLabel: string;
  color: string;
  avgDays: number;
}> = {
  csr: { label: 'Clinical Study Report', shortLabel: 'CSR', color: 'bg-blue-500', avgDays: 45 },
  ib: { label: 'Investigator Brochure', shortLabel: 'IB', color: 'bg-violet-500', avgDays: 21 },
  protocol: { label: 'Protocol', shortLabel: 'Protocol', color: 'bg-emerald-500', avgDays: 14 },
  protocol_amend: { label: 'Protocol Amendment', shortLabel: 'Amendment', color: 'bg-teal-500', avgDays: 7 },
  icf: { label: 'Informed Consent Form', shortLabel: 'ICF', color: 'bg-amber-500', avgDays: 10 },
  ctd_2_5: { label: 'Clinical Overview (2.5)', shortLabel: 'CTD 2.5', color: 'bg-red-500', avgDays: 30 },
  ctd_2_7: { label: 'Clinical Summary (2.7)', shortLabel: 'CTD 2.7', color: 'bg-pink-500', avgDays: 35 },
  response: { label: 'Regulatory Response', shortLabel: 'Response', color: 'bg-orange-500', avgDays: 14 },
  briefing: { label: 'Briefing Document', shortLabel: 'Briefing', color: 'bg-cyan-500', avgDays: 21 },
  nonclinical_summary: { label: 'Nonclinical Summary', shortLabel: 'CTD 2.4', color: 'bg-lime-500', avgDays: 21 },
  quality_summary: { label: 'Quality Summary', shortLabel: 'CTD 2.3', color: 'bg-indigo-500', avgDays: 14 },
};

const STAGE_CONFIG: Record<ReviewStage, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}> = {
  draft: { label: 'Drafting', icon: PenTool, color: 'text-zinc-600', bgColor: 'bg-zinc-100' },
  internal_review: { label: 'Internal Review', icon: Eye, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  sme_review: { label: 'SME Review', icon: User, color: 'text-violet-600', bgColor: 'bg-violet-100' },
  qc: { label: 'QC', icon: FileCheck, color: 'text-amber-600', bgColor: 'bg-amber-100' },
  sponsor_review: { label: 'Sponsor Review', icon: Send, color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
  final_qc: { label: 'Final QC', icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  approved: { label: 'Approved', icon: Star, color: 'text-green-600', bgColor: 'bg-green-100' },
  published: { label: 'Published', icon: BookOpen, color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
};

const REVIEW_PIPELINE: ReviewStage[] = [
  'draft', 'internal_review', 'sme_review', 'qc', 'sponsor_review', 'final_qc', 'approved', 'published'
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const getDaysUntilDue = (dueDate: string): number => {
  const due = new Date(dueDate);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const formatDueDate = (dueDate: string): string => {
  const days = getDaysUntilDue(dueDate);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 7) return `${days} days left`;
  return new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// ═══════════════════════════════════════════════════════════════════════════════
// TASK CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const TaskCard: React.FC<{
  task: DocumentTask;
  onClick?: () => void;
  onStartWriting?: () => void;
  view: 'card' | 'row';
}> = ({ task, onClick, onStartWriting, view }) => {
  const docConfig = DOCUMENT_TYPE_CONFIG[task.documentType];
  const stageConfig = STAGE_CONFIG[task.stage];
  const StageIcon = stageConfig.icon;
  const daysLeft = getDaysUntilDue(task.dueDate);
  const isUrgent = daysLeft <= 3;
  
  if (view === 'row') {
    return (
      <div
        onClick={onClick}
        className={cn(
          'flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md',
          task.isOverdue && 'border-red-300 bg-red-50',
          task.isBlocked && 'border-amber-300 bg-amber-50',
          !task.isOverdue && !task.isBlocked && 'border-zinc-200 hover:border-blue-300'
        )}
      >
        {/* Document Type Badge */}
        <span className={cn(
          'px-2 py-1 text-xs font-medium text-white rounded',
          docConfig.color
        )}>
          {docConfig.shortLabel}
        </span>
        
        {/* Title & Product */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 truncate">{task.title}</p>
          <p className="text-xs text-zinc-500">{task.productName} {task.studyId && `• ${task.studyId}`}</p>
        </div>
        
        {/* Stage */}
        <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-full', stageConfig.bgColor)}>
          <StageIcon className={cn('w-3.5 h-3.5', stageConfig.color)} />
          <span className={cn('text-xs font-medium', stageConfig.color)}>{stageConfig.label}</span>
        </div>
        
        {/* Progress */}
        <div className="w-24">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-zinc-500">{task.progress}%</span>
          </div>
          <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                task.progress >= 100 ? 'bg-green-500' : 'bg-blue-500'
              )}
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
        
        {/* Due Date */}
        <div className={cn(
          'text-xs font-medium',
          task.isOverdue && 'text-red-600',
          isUrgent && !task.isOverdue && 'text-amber-600',
          !isUrgent && !task.isOverdue && 'text-zinc-500'
        )}>
          {formatDueDate(task.dueDate)}
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-1">
          {task.pendingComments && task.pendingComments > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-amber-600">
              <MessageSquare className="w-3.5 h-3.5" />
              {task.pendingComments}
            </span>
          )}
          <button className="p-1 rounded hover:bg-zinc-100">
            <MoreHorizontal className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
      </div>
    );
  }
  
  // Card view
  return (
    <div
      onClick={onClick}
      className={cn(
        'p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md',
        task.isOverdue && 'border-red-300 bg-red-50',
        task.isBlocked && 'border-amber-300 bg-amber-50',
        !task.isOverdue && !task.isBlocked && 'border-zinc-200 hover:border-blue-300'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <span className={cn(
          'px-2 py-1 text-xs font-medium text-white rounded',
          docConfig.color
        )}>
          {docConfig.shortLabel}
        </span>
        {task.priority === 'critical' && (
          <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            Critical
          </span>
        )}
      </div>
      
      {/* Title */}
      <h4 className="text-sm font-medium text-zinc-900 mb-1 line-clamp-2">
        {task.title}
      </h4>
      <p className="text-xs text-zinc-500 mb-3">
        {task.productName} {task.studyId && `• ${task.studyId}`}
      </p>
      
      {/* Stage Badge */}
      <div className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-full mb-3',
        stageConfig.bgColor
      )}>
        <StageIcon className={cn('w-3.5 h-3.5', stageConfig.color)} />
        <span className={cn('text-xs font-medium', stageConfig.color)}>{stageConfig.label}</span>
      </div>
      
      {/* Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-zinc-500">Progress</span>
          <span className="font-medium">{task.progress}%</span>
        </div>
        <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              task.progress >= 100 ? 'bg-green-500' : 'bg-blue-500'
            )}
            style={{ width: `${task.progress}%` }}
          />
        </div>
      </div>
      
      {/* Metrics */}
      <div className="flex items-center gap-3 text-xs text-zinc-500 mb-3">
        {task.wordCount && (
          <span>{task.wordCount.toLocaleString()} words</span>
        )}
        {task.pageCount && (
          <span>{task.pageCount} pages</span>
        )}
        {task.pendingComments && task.pendingComments > 0 && (
          <span className="flex items-center gap-0.5 text-amber-600">
            <MessageSquare className="w-3 h-3" />
            {task.pendingComments}
          </span>
        )}
      </div>
      
      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-200">
        <div className="flex items-center gap-1.5">
          <Calendar className={cn(
            'w-3.5 h-3.5',
            task.isOverdue && 'text-red-500',
            isUrgent && !task.isOverdue && 'text-amber-500',
            !isUrgent && !task.isOverdue && 'text-zinc-400'
          )} />
          <span className={cn(
            'text-xs font-medium',
            task.isOverdue && 'text-red-600',
            isUrgent && !task.isOverdue && 'text-amber-600',
            !isUrgent && !task.isOverdue && 'text-zinc-600'
          )}>
            {formatDueDate(task.dueDate)}
          </span>
        </div>
        
        {onStartWriting && task.stage === 'draft' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartWriting();
            }}
            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors duration-150"
          >
            Start Writing
          </button>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE VIEW
// ═══════════════════════════════════════════════════════════════════════════════

const PipelineView: React.FC<{
  tasks: DocumentTask[];
  onTaskClick?: (task: DocumentTask) => void;
}> = ({ tasks, onTaskClick }) => {
  const tasksByStage = useMemo(() => {
    const groups: Record<ReviewStage, DocumentTask[]> = {} as Record<ReviewStage, DocumentTask[]>;
    REVIEW_PIPELINE.forEach(stage => groups[stage] = []);
    
    tasks.forEach(task => {
      groups[task.stage].push(task);
    });
    
    return groups;
  }, [tasks]);
  
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {REVIEW_PIPELINE.slice(0, 6).map(stage => {
        const config = STAGE_CONFIG[stage];
        const stageTasks = tasksByStage[stage];
        const Icon = config.icon;
        
        return (
          <div key={stage} className="flex-shrink-0 w-72">
            {/* Stage Header */}
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-t-lg',
              config.bgColor
            )}>
              <Icon className={cn('w-4 h-4', config.color)} />
              <span className={cn('text-sm font-medium', config.color)}>{config.label}</span>
              <span className={cn('ml-auto text-xs', config.color)}>{stageTasks.length}</span>
            </div>
            
            {/* Tasks */}
            <div className="bg-zinc-50 border border-t-0 border-zinc-200 rounded-b-lg p-2 min-h-[400px]">
              <div className="space-y-2">
                {stageTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    view="card"
                    onClick={() => onTaskClick?.(task)}
                  />
                ))}
                {stageTasks.length === 0 && (
                  <p className="text-xs text-zinc-400 text-center py-8">No documents</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const MedicalWriterQueue: React.FC<MedicalWriterQueueProps> = ({
  tasks,
  currentUser,
  onTaskClick,
  onStartWriting,
  onReviewComplete,
  className,
}) => {
  const [view, setView] = useState<'list' | 'pipeline'>('list');
  const [filterDocType, setFilterDocType] = useState<DocumentType | 'all'>('all');
  const [filterStage, setFilterStage] = useState<ReviewStage | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filterDocType !== 'all' && task.documentType !== filterDocType) return false;
      if (filterStage !== 'all' && task.stage !== filterStage) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return task.title.toLowerCase().includes(q) ||
          task.productName.toLowerCase().includes(q) ||
          (task.studyId && task.studyId.toLowerCase().includes(q));
      }
      return true;
    });
  }, [tasks, filterDocType, filterStage, searchQuery]);
  
  // My tasks
  const myTasks = useMemo(() => {
    return filteredTasks.filter(task => task.assignedWriter === currentUser);
  }, [filteredTasks, currentUser]);
  
  // Metrics
  const metrics = useMemo(() => {
    const overdue = tasks.filter(t => t.isOverdue).length;
    const inDraft = tasks.filter(t => t.stage === 'draft').length;
    const inReview = tasks.filter(t => ['internal_review', 'sme_review', 'qc', 'sponsor_review'].includes(t.stage)).length;
    const dueThisWeek = tasks.filter(t => getDaysUntilDue(t.dueDate) <= 7 && !t.isOverdue).length;
    
    return { overdue, inDraft, inReview, dueThisWeek };
  }, [tasks]);
  
  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-zinc-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-zinc-900">Document Queue</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('list')}
              className={cn(
                'p-2 rounded transition-colors',
                view === 'list' ? 'bg-blue-100 text-blue-600' : 'text-zinc-400 hover:bg-zinc-100'
              )}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('pipeline')}
              className={cn(
                'p-2 rounded transition-colors',
                view === 'pipeline' ? 'bg-blue-100 text-blue-600' : 'text-zinc-400 hover:bg-zinc-100'
              )}
            >
              <Layout className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Metrics */}
        <div className="flex items-center gap-4 mb-4">
          <div className="px-3 py-2 bg-zinc-100 rounded-lg">
            <p className="text-xs text-zinc-500">Total</p>
            <p className="text-lg font-semibold text-zinc-900">{tasks.length}</p>
          </div>
          {metrics.overdue > 0 && (
            <div className="px-3 py-2 bg-red-100 rounded-lg">
              <p className="text-xs text-red-600">Overdue</p>
              <p className="text-lg font-semibold text-red-700">{metrics.overdue}</p>
            </div>
          )}
          <div className="px-3 py-2 bg-amber-100 rounded-lg">
            <p className="text-xs text-amber-600">Due This Week</p>
            <p className="text-lg font-semibold text-amber-700">{metrics.dueThisWeek}</p>
          </div>
          <div className="px-3 py-2 bg-blue-100 rounded-lg">
            <p className="text-xs text-blue-600">In Review</p>
            <p className="text-lg font-semibold text-blue-700">{metrics.inReview}</p>
          </div>
        </div>
        
        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
            />
          </div>
          
          <select
            value={filterDocType}
            onChange={(e) => setFilterDocType(e.target.value as DocumentType | 'all')}
            className="px-3 py-2 text-sm border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
          >
            <option value="all">All Document Types</option>
            {Object.entries(DOCUMENT_TYPE_CONFIG).map(([type, config]) => (
              <option key={type} value={type}>{config.label}</option>
            ))}
          </select>
          
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value as ReviewStage | 'all')}
            className="px-3 py-2 text-sm border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
          >
            <option value="all">All Stages</option>
            {Object.entries(STAGE_CONFIG).map(([stage, config]) => (
              <option key={stage} value={stage}>{config.label}</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">
        {view === 'pipeline' ? (
          <PipelineView tasks={filteredTasks} onTaskClick={onTaskClick} />
        ) : (
          <div className="space-y-2">
            {filteredTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                view="row"
                onClick={() => onTaskClick?.(task)}
                onStartWriting={() => onStartWriting?.(task)}
              />
            ))}
            {filteredTasks.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
                <p className="text-zinc-500">No documents match your filters</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MedicalWriterQueue;
