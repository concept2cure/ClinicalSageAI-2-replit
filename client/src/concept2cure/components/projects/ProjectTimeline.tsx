/**
 * @fileoverview Project Timeline Component
 * @module concept2cure/components/projects/ProjectTimeline
 * @version 1.0.0
 *
 * @description
 * Visual submission progress tracker showing workflow phases and completion.
 * Shows user where they are in the submission journey.
 *
 * @author Concept2Cure UI Team
 * @compliance
 * - FDA 21 CFR Part 11: Timeline events tracked in audit trail
 */

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Check,
  Circle,
  Clock,
  AlertCircle,
  Lock,
  ChevronRight,
  CalendarClock,
  User,
  FileText,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type PhaseStatus = 'completed' | 'current' | 'upcoming' | 'blocked' | 'skipped';

export interface TimelinePhase {
  id: string;
  name: string;
  description?: string;
  status: PhaseStatus;
  progress: number; // 0-100
  startDate?: string;
  completedDate?: string;
  dueDate?: string;
  assignee?: string;
  documents?: Array<{
    id: string;
    name: string;
    status: 'draft' | 'review' | 'approved';
  }>;
  blockedReason?: string;
}

export interface ProjectTimelineProps {
  projectName: string;
  projectType: string;
  phases: TimelinePhase[];
  currentPhaseId?: string;
  estimatedCompletionDays?: number;
  targetDate?: string;
  onPhaseClick?: (phaseId: string) => void;
  onDocumentClick?: (docId: string) => void;
  variant?: 'full' | 'compact' | 'mini';
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT PHASES BY PROJECT TYPE
// ═══════════════════════════════════════════════════════════════════════════════

export const DEFAULT_PHASES: Record<string, TimelinePhase[]> = {
  '510K': [
    { id: 'setup', name: 'Project Setup', status: 'upcoming', progress: 0 },
    { id: 'device-desc', name: 'Device Description', status: 'upcoming', progress: 0 },
    { id: 'predicate', name: 'Predicate Comparison', status: 'upcoming', progress: 0 },
    { id: 'cer', name: 'Clinical Evaluation', status: 'upcoming', progress: 0 },
    { id: 'testing', name: 'Performance Testing', status: 'upcoming', progress: 0 },
    { id: 'biocompat', name: 'Biocompatibility', status: 'upcoming', progress: 0 },
    { id: 'labeling', name: 'Labeling', status: 'upcoming', progress: 0 },
    { id: 'presub', name: 'Pre-Submission Meeting', status: 'upcoming', progress: 0 },
    { id: 'final', name: 'Final Submission', status: 'upcoming', progress: 0 },
  ],
  IND: [
    { id: 'setup', name: 'Project Setup', status: 'upcoming', progress: 0 },
    { id: 'cmc', name: 'CMC Information', status: 'upcoming', progress: 0 },
    { id: 'nonclinical', name: 'Nonclinical Studies', status: 'upcoming', progress: 0 },
    { id: 'clinical', name: 'Clinical Protocol', status: 'upcoming', progress: 0 },
    { id: 'investigator', name: 'Investigator Brochure', status: 'upcoming', progress: 0 },
    { id: 'forms', name: 'FDA Forms', status: 'upcoming', progress: 0 },
    { id: 'review', name: 'Internal Review', status: 'upcoming', progress: 0 },
    { id: 'submission', name: 'IND Submission', status: 'upcoming', progress: 0 },
  ],
  NDA: [
    { id: 'setup', name: 'Project Setup', status: 'upcoming', progress: 0 },
    { id: 'module1', name: 'Module 1: Admin', status: 'upcoming', progress: 0 },
    { id: 'module2', name: 'Module 2: Summaries', status: 'upcoming', progress: 0 },
    { id: 'module3', name: 'Module 3: Quality', status: 'upcoming', progress: 0 },
    { id: 'module4', name: 'Module 4: Nonclinical', status: 'upcoming', progress: 0 },
    { id: 'module5', name: 'Module 5: Clinical', status: 'upcoming', progress: 0 },
    { id: 'review', name: 'QC Review', status: 'upcoming', progress: 0 },
    { id: 'submission', name: 'NDA Submission', status: 'upcoming', progress: 0 },
  ],
  CER: [
    { id: 'setup', name: 'Project Setup', status: 'upcoming', progress: 0 },
    { id: 'scope', name: 'Scope & Device Description', status: 'upcoming', progress: 0 },
    { id: 'literature', name: 'Literature Search', status: 'upcoming', progress: 0 },
    { id: 'clinical', name: 'Clinical Data Analysis', status: 'upcoming', progress: 0 },
    { id: 'benefit-risk', name: 'Benefit-Risk Assessment', status: 'upcoming', progress: 0 },
    { id: 'conclusions', name: 'Conclusions', status: 'upcoming', progress: 0 },
    { id: 'review', name: 'Expert Review', status: 'upcoming', progress: 0 },
    { id: 'approval', name: 'Final Approval', status: 'upcoming', progress: 0 },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const getStatusIcon = (status: PhaseStatus, progress: number) => {
  switch (status) {
    case 'completed':
      return <Check className="w-4 h-4 text-white" />;
    case 'current':
      return <Circle className="w-4 h-4 text-white" strokeWidth={3} />;
    case 'blocked':
      return <Lock className="w-4 h-4 text-white" />;
    case 'skipped':
      return <ChevronRight className="w-4 h-4 text-zinc-400" />;
    default:
      return <Circle className="w-4 h-4 text-zinc-400" strokeWidth={2} />;
  }
};

const getStatusColors = (status: PhaseStatus) => {
  switch (status) {
    case 'completed':
      return {
        bg: 'bg-emerald-500',
        border: 'border-emerald-500',
        text: 'text-emerald-700',
        line: 'bg-emerald-500',
      };
    case 'current':
      return {
        bg: 'bg-blue-500',
        border: 'border-blue-500',
        text: 'text-blue-700',
        line: 'bg-blue-200',
      };
    case 'blocked':
      return {
        bg: 'bg-red-500',
        border: 'border-red-500',
        text: 'text-red-700',
        line: 'bg-red-200',
      };
    case 'skipped':
      return {
        bg: 'bg-zinc-200',
        border: 'border-zinc-300',
        text: 'text-zinc-500',
        line: 'bg-zinc-200',
      };
    default:
      return {
        bg: 'bg-white',
        border: 'border-zinc-300',
        text: 'text-zinc-500',
        line: 'bg-zinc-200',
      };
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MINI TIMELINE (for sidebar/cards)
// ═══════════════════════════════════════════════════════════════════════════════

const MiniTimeline: React.FC<{
  phases: TimelinePhase[];
  currentPhaseId?: string;
}> = ({ phases, currentPhaseId }) => {
  const completedCount = phases.filter(p => p.status === 'completed').length;
  const progress = Math.round((completedCount / phases.length) * 100);
  
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs font-medium text-zinc-600">{progress}%</span>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPACT TIMELINE (for panels)
// ═══════════════════════════════════════════════════════════════════════════════

const CompactTimeline: React.FC<{
  phases: TimelinePhase[];
  currentPhaseId?: string;
  onPhaseClick?: (id: string) => void;
}> = ({ phases, currentPhaseId, onPhaseClick }) => {
  return (
    <div className="flex items-center gap-1">
      {phases.map((phase, index) => {
        const colors = getStatusColors(phase.status);
        const isCurrent = phase.id === currentPhaseId || phase.status === 'current';
        
        return (
          <React.Fragment key={phase.id}>
            <button
              onClick={() => onPhaseClick?.(phase.id)}
              className={cn(
                'relative group',
                onPhaseClick && 'cursor-pointer'
              )}
              title={`${phase.name}: ${phase.progress}%`}
            >
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center transition-all',
                  colors.bg,
                  colors.border,
                  'border-2',
                  isCurrent && 'ring-2 ring-blue-200 ring-offset-1',
                  onPhaseClick && 'hover:scale-110'
                )}
              >
                {getStatusIcon(phase.status, phase.progress)}
              </div>
              
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                {phase.name}
              </div>
            </button>
            
            {/* Connector line */}
            {index < phases.length - 1 && (
              <div className={cn('w-4 h-0.5', colors.line)} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// FULL TIMELINE (main view)
// ═══════════════════════════════════════════════════════════════════════════════

const FullTimeline: React.FC<{
  projectName: string;
  projectType: string;
  phases: TimelinePhase[];
  currentPhaseId?: string;
  estimatedCompletionDays?: number;
  targetDate?: string;
  onPhaseClick?: (id: string) => void;
  onDocumentClick?: (docId: string) => void;
}> = ({
  projectName,
  projectType,
  phases,
  currentPhaseId,
  estimatedCompletionDays,
  targetDate,
  onPhaseClick,
  onDocumentClick,
}) => {
  const completedCount = phases.filter(p => p.status === 'completed').length;
  const overallProgress = Math.round((completedCount / phases.length) * 100);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900">{projectType} Submission Timeline</h3>
          <p className="text-sm text-zinc-500">{projectName}</p>
        </div>
        
        <div className="text-right">
          <div className="flex items-center gap-2 text-sm">
            <CalendarClock className="w-4 h-4 text-zinc-500" />
            {estimatedCompletionDays && (
              <span className="font-medium text-zinc-700">
                {estimatedCompletionDays} days to target
              </span>
            )}
          </div>
          {targetDate && (
            <p className="text-xs text-zinc-500 mt-1">
              Target: {new Date(targetDate).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      
      {/* Overall Progress */}
      <div className="p-4 bg-zinc-50 rounded-xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-zinc-700">Overall Progress</span>
          <span className="text-sm font-bold text-zinc-900">{overallProgress}%</span>
        </div>
        <div className="h-3 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-500 rounded-full"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>
      
      {/* Phase List */}
      <div className="relative">
        {phases.map((phase, index) => {
          const colors = getStatusColors(phase.status);
          const isCurrent = phase.id === currentPhaseId || phase.status === 'current';
          
          return (
            <div key={phase.id} className="relative">
              {/* Connector line */}
              {index < phases.length - 1 && (
                <div
                  className={cn(
                    'absolute left-4 top-8 w-0.5 h-full -ml-px',
                    phase.status === 'completed' ? 'bg-emerald-500' : 'bg-zinc-200'
                  )}
                />
              )}
              
              <button
                onClick={() => onPhaseClick?.(phase.id)}
                className={cn(
                  'w-full flex items-start gap-4 p-4 rounded-xl transition-all',
                  'text-left',
                  isCurrent && 'bg-blue-50 border border-blue-200',
                  !isCurrent && 'hover:bg-zinc-50',
                  onPhaseClick && 'cursor-pointer'
                )}
              >
                {/* Status indicator */}
                <div
                  className={cn(
                    'relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    colors.bg,
                    colors.border,
                    'border-2'
                  )}
                >
                  {getStatusIcon(phase.status, phase.progress)}
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className={cn(
                      'font-medium',
                      phase.status === 'completed' ? 'text-zinc-600' : 'text-zinc-900'
                    )}>
                      {phase.name}
                    </h4>
                    {isCurrent && (
                      <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                        In Progress
                      </span>
                    )}
                    {phase.status === 'blocked' && (
                      <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                        Blocked
                      </span>
                    )}
                  </div>
                  
                  {phase.description && (
                    <p className="text-sm text-zinc-500 mt-0.5">{phase.description}</p>
                  )}
                  
                  {/* Progress bar for current phase */}
                  {isCurrent && phase.progress > 0 && phase.progress < 100 && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                        <span>Progress</span>
                        <span>{phase.progress}%</span>
                      </div>
                      <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${phase.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Blocked reason */}
                  {phase.status === 'blocked' && phase.blockedReason && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
                      <AlertCircle className="w-4 h-4" />
                      {phase.blockedReason}
                    </div>
                  )}
                  
                  {/* Documents */}
                  {phase.documents && phase.documents.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {phase.documents.map(doc => (
                        <button
                          key={doc.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDocumentClick?.(doc.id);
                          }}
                          className={cn(
                            'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs',
                            'border transition-colors',
                            doc.status === 'approved' && 'bg-emerald-50 border-emerald-200 text-emerald-700',
                            doc.status === 'review' && 'bg-amber-50 border-amber-200 text-amber-700',
                            doc.status === 'draft' && 'bg-zinc-50 border-zinc-200 text-zinc-700',
                            'hover:opacity-80'
                          )}
                        >
                          <FileText className="w-3 h-3" />
                          {doc.name}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {/* Meta info */}
                  <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
                    {phase.assignee && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {phase.assignee}
                      </span>
                    )}
                    {phase.completedDate && (
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-500" />
                        Completed {new Date(phase.completedDate).toLocaleDateString()}
                      </span>
                    )}
                    {phase.dueDate && phase.status !== 'completed' && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Due {new Date(phase.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Chevron */}
                <ChevronRight className="w-5 h-5 text-zinc-400 flex-shrink-0" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const ProjectTimeline: React.FC<ProjectTimelineProps> = ({
  projectName,
  projectType,
  phases,
  currentPhaseId,
  estimatedCompletionDays,
  targetDate,
  onPhaseClick,
  onDocumentClick,
  variant = 'full',
  className,
}) => {
  return (
    <div className={className}>
      {variant === 'mini' && (
        <MiniTimeline phases={phases} currentPhaseId={currentPhaseId} />
      )}
      {variant === 'compact' && (
        <CompactTimeline
          phases={phases}
          currentPhaseId={currentPhaseId}
          onPhaseClick={onPhaseClick}
        />
      )}
      {variant === 'full' && (
        <FullTimeline
          projectName={projectName}
          projectType={projectType}
          phases={phases}
          currentPhaseId={currentPhaseId}
          estimatedCompletionDays={estimatedCompletionDays}
          targetDate={targetDate}
          onPhaseClick={onPhaseClick}
          onDocumentClick={onDocumentClick}
        />
      )}
    </div>
  );
};

export default ProjectTimeline;
