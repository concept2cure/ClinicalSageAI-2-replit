/**
 * @fileoverview PMA (Pre-Market Approval) Workspace
 * @module concept2cure/components/pma/PMAWorkspace
 * @version 1.0.0
 *
 * @description
 * Dedicated workspace for Class III medical device PMA submissions.
 * Provides structured workflow covering all 10 phases from program planning
 * through post-submission readiness, aligned with FDA PMA guidance.
 *
 * Key sections:
 * - Device Description & Design History
 * - Preclinical / Bench Testing
 * - Clinical Investigation (IDE)
 * - Manufacturing & Quality System
 * - Labeling & IFU
 * - PMA Module Compilation (1-7)
 * - SSED (Summary of Safety & Effectiveness Data)
 *
 * @compliance FDA 21 CFR 814, ISO 14971, IEC 62304
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Shield,
  ShieldCheck,
  Cpu,
  FlaskConical,
  Stethoscope,
  Factory,
  Tag,
  Layers,
  CheckSquare,
  Send,
  Clock,
  ChevronRight,
  ChevronDown,
  FileText,
  AlertTriangle,
  CheckCircle,
  Circle,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface PMATask {
  id: string;
  name: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  estimatedHours: number;
  role?: string;
  critical?: boolean;
  description?: string;
  completedAt?: string;
  completedBy?: string;
}

export interface PMAPhase {
  id: string;
  name: string;
  order: number;
  tasks: PMATask[];
  icon: React.ReactNode;
}

interface PMAWorkspaceProps {
  projectId: string;
  projectName?: string;
  embedded?: boolean;
  onBackToProject?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_ICONS: Record<string, React.ReactNode> = {
  phase1: <Shield className="w-4 h-4" />,
  phase2: <Cpu className="w-4 h-4" />,
  phase3: <FlaskConical className="w-4 h-4" />,
  phase4: <Stethoscope className="w-4 h-4" />,
  phase5: <Factory className="w-4 h-4" />,
  phase6: <Tag className="w-4 h-4" />,
  phase7: <Layers className="w-4 h-4" />,
  phase8: <CheckSquare className="w-4 h-4" />,
  phase9: <Send className="w-4 h-4" />,
  phase10: <Clock className="w-4 h-4" />,
};

function buildDefaultPhases(): PMAPhase[] {
  const phases: Array<{ id: string; name: string; order: number; tasks: Array<{ id: string; name: string; estimatedHours: number; role?: string; critical?: boolean; description?: string }> }> = [
    {
      id: 'phase1', name: 'Program Planning', order: 1,
      tasks: [
        { id: 'strategy', name: 'Define PMA strategy', estimatedHours: 8, role: 'RA Lead', critical: true, description: 'Establish overall PMA submission strategy and timeline' },
        { id: 'classification', name: 'Confirm Class III classification', estimatedHours: 6, role: 'RA Lead', description: 'Verify device classification and applicable product codes' },
        { id: 'pre_sub', name: 'Plan pre-submission meeting', estimatedHours: 6, role: 'Project Manager', description: 'Prepare Q-Sub for FDA pre-submission meeting' },
        { id: 'clinical_plan', name: 'Define clinical evidence plan', estimatedHours: 10, role: 'Clinical Lead', critical: true },
        { id: 'risk_plan', name: 'Risk management plan (ISO 14971)', estimatedHours: 8, role: 'QA Manager', critical: true },
        { id: 'timeline', name: 'Create master timeline', estimatedHours: 6, role: 'Project Manager' },
      ],
    },
    {
      id: 'phase2', name: 'Device Description & Design', order: 2,
      tasks: [
        { id: 'device_description', name: 'Draft device description', estimatedHours: 10, role: 'Medical Writer', critical: true },
        { id: 'design_history', name: 'Compile design history file (DHF)', estimatedHours: 12, role: 'Engineering' },
        { id: 'intended_use', name: 'Finalize intended use / indications', estimatedHours: 4, role: 'RA Lead' },
        { id: 'materials', name: 'Document materials & components', estimatedHours: 8, role: 'Engineering' },
        { id: 'specs', name: 'Finalize device specifications', estimatedHours: 6, role: 'Engineering' },
        { id: 'risk_analysis', name: 'Complete ISO 14971 risk analysis', estimatedHours: 10, role: 'QA Manager', critical: true },
        { id: 'software', name: 'Software documentation (IEC 62304)', estimatedHours: 8, role: 'Software Engineering' },
      ],
    },
    {
      id: 'phase3', name: 'Preclinical Testing', order: 3,
      tasks: [
        { id: 'bench', name: 'Bench testing summary', estimatedHours: 12, role: 'Engineering', critical: true },
        { id: 'biocompat', name: 'Biocompatibility testing (ISO 10993)', estimatedHours: 10, role: 'QA' },
        { id: 'sterilization', name: 'Sterilization validation', estimatedHours: 8, role: 'Quality' },
        { id: 'shelf_life', name: 'Shelf-life / aging validation', estimatedHours: 6, role: 'Quality' },
        { id: 'emc', name: 'EMI/EMC testing (IEC 60601)', estimatedHours: 6, role: 'Engineering' },
        { id: 'sw_validation', name: 'Software verification & validation', estimatedHours: 8, role: 'Software Engineering' },
        { id: 'animal', name: 'Animal studies (if required)', estimatedHours: 10, role: 'Preclinical' },
      ],
    },
    {
      id: 'phase4', name: 'Clinical Investigation', order: 4,
      tasks: [
        { id: 'protocol', name: 'Clinical protocol finalization', estimatedHours: 10, role: 'Clinical Lead', critical: true },
        { id: 'ide', name: 'IDE submission (if required)', estimatedHours: 8, role: 'RA Lead', description: 'Investigational Device Exemption submission' },
        { id: 'sites', name: 'Site selection & activation', estimatedHours: 12, role: 'Clinical Ops' },
        { id: 'enrollment', name: 'Patient enrollment', estimatedHours: 10, role: 'Clinical Ops' },
        { id: 'monitoring', name: 'Clinical monitoring', estimatedHours: 10, role: 'Clinical Ops' },
        { id: 'analysis', name: 'Clinical data analysis', estimatedHours: 12, role: 'Biostatistician', critical: true },
        { id: 'csr', name: 'Clinical study report', estimatedHours: 8, role: 'Medical Writer', critical: true },
      ],
    },
    {
      id: 'phase5', name: 'Manufacturing & Quality', order: 5,
      tasks: [
        { id: 'process', name: 'Manufacturing process description', estimatedHours: 8, role: 'CMC Lead' },
        { id: 'controls', name: 'Process controls & IPC', estimatedHours: 8, role: 'Quality' },
        { id: 'suppliers', name: 'Supplier controls', estimatedHours: 6, role: 'Quality' },
        { id: 'validation', name: 'Process validation', estimatedHours: 10, role: 'Quality', critical: true },
        { id: 'batch', name: 'Batch record summaries', estimatedHours: 6, role: 'Quality' },
        { id: 'qms', name: 'Quality Management System summary', estimatedHours: 8, role: 'QA Manager' },
        { id: 'inspection', name: 'Pre-approval inspection readiness', estimatedHours: 8, role: 'QA Manager', critical: true },
      ],
    },
    {
      id: 'phase6', name: 'Labeling & IFU', order: 6,
      tasks: [
        { id: 'labeling', name: 'Draft labeling', estimatedHours: 8, role: 'Medical Writer' },
        { id: 'ifu', name: 'Instructions for Use (IFU)', estimatedHours: 8, role: 'Medical Writer', critical: true },
        { id: 'warnings', name: 'Warnings & precautions', estimatedHours: 6, role: 'RA Lead' },
        { id: 'training', name: 'Clinician training materials', estimatedHours: 6, role: 'Clinical Ops' },
        { id: 'claims', name: 'Labeling claims review', estimatedHours: 4, role: 'QA Manager' },
      ],
    },
    {
      id: 'phase7', name: 'SSED & Module Assembly', order: 7,
      tasks: [
        { id: 'ssed', name: 'Summary of Safety & Effectiveness Data', estimatedHours: 12, role: 'Medical Writer', critical: true },
        { id: 'mod1', name: 'Assemble administrative module', estimatedHours: 6, role: 'Regulatory Ops' },
        { id: 'mod2', name: 'Assemble summaries', estimatedHours: 6, role: 'Regulatory Ops' },
        { id: 'mod3', name: 'Assemble non-clinical data', estimatedHours: 8, role: 'Regulatory Ops' },
        { id: 'mod4', name: 'Assemble clinical data', estimatedHours: 8, role: 'Regulatory Ops' },
        { id: 'mod5', name: 'Assemble manufacturing data', estimatedHours: 8, role: 'Regulatory Ops' },
      ],
    },
    {
      id: 'phase8', name: 'QA Review & Signatures', order: 8,
      tasks: [
        { id: 'qa_review', name: 'Full PMA QA review', estimatedHours: 12, role: 'QA Manager', critical: true },
        { id: 'traceability', name: 'Traceability matrix review', estimatedHours: 8, role: 'QA Manager' },
        { id: 'compliance', name: 'Compliance verification', estimatedHours: 8, role: 'QA Manager' },
        { id: 'signatures', name: 'Collect electronic signatures', estimatedHours: 6, role: 'RA Lead' },
        { id: 'exec_approval', name: 'Executive approval', estimatedHours: 4, role: 'Executive', critical: true },
      ],
    },
    {
      id: 'phase9', name: 'Submission', order: 9,
      tasks: [
        { id: 'ectd', name: 'Publish PMA eCTD package', estimatedHours: 6, role: 'Regulatory Ops', critical: true },
        { id: 'tech_val', name: 'Technical validation', estimatedHours: 6, role: 'Regulatory Ops' },
        { id: 'submit', name: 'Submit to FDA via ESG', estimatedHours: 4, role: 'Regulatory Ops', critical: true },
        { id: 'receipt', name: 'Confirm filing receipt', estimatedHours: 2, role: 'Regulatory Ops' },
        { id: 'archive', name: 'Archive submission package', estimatedHours: 4, role: 'Regulatory Ops' },
      ],
    },
    {
      id: 'phase10', name: 'Post-Submission', order: 10,
      tasks: [
        { id: 'inspection', name: 'FDA inspection readiness', estimatedHours: 8, role: 'QA Manager', critical: true },
        { id: 'response', name: 'FDA response plan (AI, MR letters)', estimatedHours: 6, role: 'RA Lead' },
        { id: 'pms', name: 'Post-market surveillance plan', estimatedHours: 6, role: 'RA Lead' },
        { id: 'complaints', name: 'Complaint handling process', estimatedHours: 4, role: 'Quality' },
        { id: 'mdr', name: 'MDR reporting readiness', estimatedHours: 4, role: 'Quality' },
      ],
    },
  ];

  return phases.map(p => ({
    ...p,
    icon: PHASE_ICONS[p.id] || <Circle className="w-4 h-4" />,
    tasks: p.tasks.map(t => ({
      ...t,
      status: 'not_started' as const,
    })),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  not_started: { label: 'Not Started', color: 'text-stone-400', bg: 'bg-stone-100', icon: <Circle className="w-3.5 h-3.5" /> },
  in_progress: { label: 'In Progress', color: 'text-blue-600', bg: 'bg-blue-100', icon: <Clock className="w-3.5 h-3.5 animate-pulse" /> },
  completed: { label: 'Completed', color: 'text-green-600', bg: 'bg-green-100', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  blocked: { label: 'Blocked', color: 'text-red-600', bg: 'bg-red-100', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

function getPhaseProgress(phase: PMAPhase): number {
  if (phase.tasks.length === 0) return 0;
  const completed = phase.tasks.filter(t => t.status === 'completed').length;
  return Math.round((completed / phase.tasks.length) * 100);
}

function getPhaseStatus(phase: PMAPhase): 'not_started' | 'in_progress' | 'completed' {
  const progress = getPhaseProgress(phase);
  if (progress === 100) return 'completed';
  if (progress > 0) return 'in_progress';
  return 'not_started';
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const PMAWorkspace: React.FC<PMAWorkspaceProps> = ({
  projectId,
  projectName,
  embedded = false,
  onBackToProject,
}) => {
  const [phases, setPhases] = useState<PMAPhase[]>(buildDefaultPhases);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>('phase1');
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({ phase1: true });

  const selectedPhase = phases.find(p => p.id === selectedPhaseId);

  const overallProgress = useMemo(() => {
    const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0);
    const completedTasks = phases.reduce((sum, p) => sum + p.tasks.filter(t => t.status === 'completed').length, 0);
    return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  }, [phases]);

  const totalHours = useMemo(() => {
    return phases.reduce((sum, p) => sum + p.tasks.reduce((s, t) => s + t.estimatedHours, 0), 0);
  }, [phases]);

  const toggleTaskStatus = (phaseId: string, taskId: string) => {
    setPhases(prev =>
      prev.map(p => {
        if (p.id !== phaseId) return p;
        return {
          ...p,
          tasks: p.tasks.map(t => {
            if (t.id !== taskId) return t;
            const nextStatus = t.status === 'not_started' ? 'in_progress' :
                               t.status === 'in_progress' ? 'completed' :
                               t.status === 'completed' ? 'not_started' : 'not_started';
            return {
              ...t,
              status: nextStatus,
              completedAt: nextStatus === 'completed' ? new Date().toISOString() : undefined,
            };
          }),
        };
      })
    );
  };

  const togglePhaseExpand = (phaseId: string) => {
    setExpandedPhases(prev => ({ ...prev, [phaseId]: !prev[phaseId] }));
  };

  return (
    <div className={cn('flex h-full bg-stone-50', embedded && 'rounded-none')}>
      {/* Left Sidebar — Phase Navigator */}
      <div className="w-80 flex-shrink-0 bg-white border-r border-stone-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-stone-200">
          {onBackToProject && (
            <button
              onClick={onBackToProject}
              className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 mb-3"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to Project
            </button>
          )}
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-red-600 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-stone-800 text-sm">PMA Submission</h2>
              <p className="text-xs text-stone-500">{projectName || 'Class III Device'}</p>
            </div>
          </div>

          {/* Overall Progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-stone-500">Overall Progress</span>
              <span className="font-medium text-stone-700">{overallProgress}%</span>
            </div>
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-all duration-300"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-stone-400">{totalHours} estimated hours across 10 phases</p>
          </div>
        </div>

        {/* Phase List */}
        <div className="flex-1 overflow-auto p-2">
          {phases.map(phase => {
            const progress = getPhaseProgress(phase);
            const phaseStatus = getPhaseStatus(phase);
            const isSelected = phase.id === selectedPhaseId;
            const isExpanded = expandedPhases[phase.id] ?? false;

            return (
              <div key={phase.id} className="mb-1">
                <button
                  onClick={() => {
                    setSelectedPhaseId(phase.id);
                    togglePhaseExpand(phase.id);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
                    'hover:bg-stone-100',
                    isSelected && 'bg-red-50 ring-1 ring-red-200'
                  )}
                >
                  <div className={cn(
                    'p-1 rounded',
                    phaseStatus === 'completed' ? 'text-green-600' :
                    phaseStatus === 'in_progress' ? 'text-blue-600' : 'text-stone-400'
                  )}>
                    {phase.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-stone-400">P{phase.order}</span>
                      <span className={cn(
                        'text-xs truncate',
                        isSelected ? 'font-medium text-red-700' : 'text-stone-700'
                      )}>
                        {phase.name}
                      </span>
                    </div>
                    <div className="h-1 bg-stone-100 rounded-full mt-1 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          phaseStatus === 'completed' ? 'bg-green-500' : 'bg-stone-600'
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <span className="text-[10px] text-stone-400">{progress}%</span>

                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-stone-400" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-stone-400" />
                  )}
                </button>

                {/* Expanded task list in sidebar */}
                {isExpanded && (
                  <div className="ml-8 mt-1 space-y-0.5">
                    {phase.tasks.map(task => {
                      const config = STATUS_CONFIG[task.status];
                      return (
                        <div
                          key={task.id}
                          className="flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-stone-50"
                        >
                          <span className={config.color}>{config.icon}</span>
                          <span className={cn(
                            'truncate',
                            task.status === 'completed' ? 'text-stone-400 line-through' : 'text-stone-600'
                          )}>
                            {task.name}
                          </span>
                          {task.critical && (
                            <span className="px-1 py-0.5 text-[8px] font-bold bg-red-100 text-red-600 rounded">
                              CRITICAL
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Panel — Phase Detail */}
      <div className="flex-1 flex flex-col p-4 overflow-auto">
        {selectedPhase ? (
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            {/* Phase Header */}
            <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-stone-50">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'p-2 rounded-lg',
                  getPhaseStatus(selectedPhase) === 'completed' ? 'bg-green-100 text-green-700' :
                  getPhaseStatus(selectedPhase) === 'in_progress' ? 'bg-blue-100 text-stone-700' :
                  'bg-stone-100 text-stone-500'
                )}>
                  {selectedPhase.icon}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-stone-800">
                    Phase {selectedPhase.order}: {selectedPhase.name}
                  </h2>
                  <p className="text-xs text-stone-500">
                    {selectedPhase.tasks.filter(t => t.status === 'completed').length} of{' '}
                    {selectedPhase.tasks.length} tasks completed
                  </p>
                </div>
              </div>
              <span className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg',
                STATUS_CONFIG[getPhaseStatus(selectedPhase)].bg,
                STATUS_CONFIG[getPhaseStatus(selectedPhase)].color,
              )}>
                {getPhaseProgress(selectedPhase)}% Complete
              </span>
            </div>

            {/* Task List */}
            <div className="divide-y divide-stone-100">
              {selectedPhase.tasks.map(task => {
                const config = STATUS_CONFIG[task.status];
                return (
                  <div
                    key={task.id}
                    className={cn(
                      'flex items-center gap-4 p-4 hover:bg-stone-50 transition-colors cursor-pointer',
                      task.status === 'completed' && 'bg-green-50/30'
                    )}
                    onClick={() => toggleTaskStatus(selectedPhase.id, task.id)}
                  >
                    <button className={cn('p-1 rounded', config.color)}>
                      {config.icon}
                    </button>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'text-sm font-medium',
                          task.status === 'completed' ? 'text-stone-400 line-through' : 'text-stone-800'
                        )}>
                          {task.name}
                        </span>
                        {task.critical && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded">
                            CRITICAL PATH
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-xs text-stone-500 mt-0.5">{task.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-stone-400">
                        {task.role && <span>{task.role}</span>}
                        <span>{task.estimatedHours}h estimated</span>
                        {task.completedAt && (
                          <span className="text-green-600">
                            Completed {new Date(task.completedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className={cn(
                      'px-2 py-1 text-[10px] font-medium rounded',
                      config.bg, config.color
                    )}>
                      {config.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Phase Footer */}
            <div className="p-4 bg-stone-50 border-t border-stone-200">
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>
                  {selectedPhase.tasks.reduce((s, t) => s + t.estimatedHours, 0)} hours total •{' '}
                  {selectedPhase.tasks.filter(t => t.critical).length} critical path items
                </span>
                <span className="flex items-center gap-1 text-stone-400">
                  <Sparkles className="w-3 h-3" />
                  Click tasks to advance status
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <ShieldCheck className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-500">Select a phase to view tasks</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PMAWorkspace;
