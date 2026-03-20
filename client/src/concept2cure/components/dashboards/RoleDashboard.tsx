/**
 * Concept2Cure - Role-Based Dashboard System
 *
 * Intelligent workflow dashboards tailored to each role across the
 * regulatory lifecycle. Supports personas from small biotech to large pharma.
 *
 * Roles: RA Lead, RA Associate, QA Manager, Clinical Lead, CMC Lead,
 * Medical Writer, Project Manager, Biostatistician, Executive, etc.
 *
 * @module concept2cure/components/dashboards/RoleDashboard
 * @version 1.0.0
 */

import React, { useState, useMemo } from 'react';
import type { SubmissionType } from '../../types';
import { cn } from '@/lib/utils';
import { NextActionsPanel, StepCard } from '@/concept2cure/components/workflow';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Users,
  Target,
  GitBranch,
  Sparkles,
  BarChart3,
  Shield,
  Beaker,
  Pill,
  Microscope,
  ClipboardList,
  Building2,
  Globe2,
  Loader2,
} from 'lucide-react';
import { useOperationalData } from '../../hooks/useOperationalData';

// ─────────────────────────────────────────────────────────────────────────────
// ROLE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole =
  | 'ra_lead'
  | 'ra_associate'
  | 'qa_manager'
  | 'clinical_lead'
  | 'clinical_ops'
  | 'cmc_lead'
  | 'medical_writer'
  | 'biostatistician'
  | 'project_manager'
  | 'safety_officer'
  | 'executive'
  | 'engineering';

interface RoleConfig {
  id: UserRole;
  title: string;
  shortTitle: string;
  description: string;
  icon: React.ElementType;
  color: string;
  primaryMetrics: string[];
  keyWorkflows: string[];
  relevantSubmissions: SubmissionType[];
}

const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  ra_lead: {
    id: 'ra_lead',
    title: 'Regulatory Affairs Lead',
    shortTitle: 'RA Lead',
    description: 'Strategic regulatory oversight and submission management',
    icon: Shield,
    color: 'blue',
    primaryMetrics: ['submissions_in_progress', 'pending_reviews', 'upcoming_deadlines'],
    keyWorkflows: ['submission_planning', 'agency_meetings', 'global_strategy'],
    relevantSubmissions: ['510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'],
  },
  ra_associate: {
    id: 'ra_associate',
    title: 'Regulatory Affairs Associate',
    shortTitle: 'RA Associate',
    description: 'Document preparation and submission assembly',
    icon: FileText,
    color: 'indigo',
    primaryMetrics: ['documents_pending', 'review_cycles', 'task_completion'],
    keyWorkflows: ['document_prep', 'ectd_assembly', 'correspondence'],
    relevantSubmissions: ['510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO'],
  },
  qa_manager: {
    id: 'qa_manager',
    title: 'Quality Assurance Manager',
    shortTitle: 'QA Manager',
    description: 'Compliance oversight and quality systems management',
    icon: CheckCircle2,
    color: 'green',
    primaryMetrics: ['open_capas', 'audit_findings', 'sop_compliance'],
    keyWorkflows: ['audit_management', 'capa_tracking', 'sop_control'],
    relevantSubmissions: ['510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO'],
  },
  clinical_lead: {
    id: 'clinical_lead',
    title: 'Clinical Development Lead',
    shortTitle: 'Clinical Lead',
    description: 'Clinical strategy and study oversight',
    icon: Beaker,
    color: 'purple',
    primaryMetrics: ['active_studies', 'enrollment_rate', 'safety_signals'],
    keyWorkflows: ['protocol_design', 'study_startup', 'data_review'],
    relevantSubmissions: ['IND', 'NDA', 'BLA', 'PMA', 'MAA'],
  },
  clinical_ops: {
    id: 'clinical_ops',
    title: 'Clinical Operations Manager',
    shortTitle: 'Clinical Ops',
    description: 'Trial execution and site management',
    icon: Users,
    color: 'violet',
    primaryMetrics: ['site_activation', 'query_resolution', 'monitoring_visits'],
    keyWorkflows: ['site_selection', 'monitoring', 'vendor_management'],
    relevantSubmissions: ['IND', 'NDA', 'BLA', 'PMA'],
  },
  cmc_lead: {
    id: 'cmc_lead',
    title: 'CMC Lead',
    shortTitle: 'CMC Lead',
    description: 'Chemistry, Manufacturing, and Controls oversight',
    icon: Pill,
    color: 'orange',
    primaryMetrics: ['batch_releases', 'stability_studies', 'method_validations'],
    keyWorkflows: ['drug_substance', 'drug_product', 'analytical_methods'],
    relevantSubmissions: ['IND', 'NDA', 'BLA', 'MAA'],
  },
  medical_writer: {
    id: 'medical_writer',
    title: 'Medical Writer',
    shortTitle: 'Med Writer',
    description: 'Regulatory document authoring and review',
    icon: FileText,
    color: 'cyan',
    primaryMetrics: ['documents_in_progress', 'review_turnaround', 'template_compliance'],
    keyWorkflows: ['csr_writing', 'summary_documents', 'labeling'],
    relevantSubmissions: ['510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO'],
  },
  biostatistician: {
    id: 'biostatistician',
    title: 'Biostatistician',
    shortTitle: 'Biostats',
    description: 'Statistical analysis and study design',
    icon: BarChart3,
    color: 'teal',
    primaryMetrics: ['analyses_complete', 'sap_status', 'dataset_locks'],
    keyWorkflows: ['sap_development', 'interim_analysis', 'final_analysis'],
    relevantSubmissions: ['IND', 'NDA', 'BLA', 'PMA', 'MAA'],
  },
  project_manager: {
    id: 'project_manager',
    title: 'Project Manager',
    shortTitle: 'PM',
    description: 'Timeline management and cross-functional coordination',
    icon: Target,
    color: 'amber',
    primaryMetrics: ['milestone_adherence', 'resource_utilization', 'risk_items'],
    keyWorkflows: ['timeline_management', 'resource_planning', 'risk_mitigation'],
    relevantSubmissions: ['510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO'],
  },
  safety_officer: {
    id: 'safety_officer',
    title: 'Safety/PV Officer',
    shortTitle: 'Safety',
    description: 'Pharmacovigilance and safety reporting',
    icon: AlertTriangle,
    color: 'red',
    primaryMetrics: ['serious_aes', 'aggregate_reports', 'signal_reviews'],
    keyWorkflows: ['case_processing', 'aggregate_reporting', 'signal_detection'],
    relevantSubmissions: ['IND', 'NDA', 'BLA', 'MAA'],
  },
  executive: {
    id: 'executive',
    title: 'Executive / VP',
    shortTitle: 'Executive',
    description: 'Strategic oversight and portfolio management',
    icon: Building2,
    color: 'slate',
    primaryMetrics: ['portfolio_status', 'budget_variance', 'key_milestones'],
    keyWorkflows: ['portfolio_review', 'governance', 'investor_updates'],
    relevantSubmissions: ['510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO'],
  },
  engineering: {
    id: 'engineering',
    title: 'Engineering Lead',
    shortTitle: 'Engineering',
    description: 'Device design and verification/validation',
    icon: Microscope,
    color: 'emerald',
    primaryMetrics: ['design_controls', 'vv_completion', 'dhf_status'],
    keyWorkflows: ['design_history', 'verification', 'validation'],
    relevantSubmissions: ['510K', 'PMA', 'DE_NOVO'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA GENERATORS (would connect to real backend)
// ─────────────────────────────────────────────────────────────────────────────

interface DashboardTask {
  id: string;
  title: string;
  project: string;
  submissionType: SubmissionType;
  dueDate: Date;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'review' | 'blocked';
  assignee?: string;
}

interface DashboardMetric {
  id: string;
  label: string;
  value: number;
  change?: number;
  trend?: 'up' | 'down' | 'stable';
  target?: number;
}

// Mock generators removed — RoleDashboard now uses useOperationalData() for all real data

// ─────────────────────────────────────────────────────────────────────────────
// METRIC CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  metric: DashboardMetric;
  colorClass: string;
}

// Static Tailwind color maps to prevent CSS purge issues
const COLOR_BG_100: Record<string, string> = {
  blue: 'bg-blue-100', indigo: 'bg-indigo-100', green: 'bg-green-100', purple: 'bg-purple-100',
  violet: 'bg-violet-100', amber: 'bg-amber-100', teal: 'bg-teal-100', cyan: 'bg-cyan-100',
  rose: 'bg-rose-100', slate: 'bg-zinc-100', sky: 'bg-sky-100', orange: 'bg-orange-100',
};
const COLOR_TEXT_600: Record<string, string> = {
  blue: 'text-blue-600', indigo: 'text-indigo-600', green: 'text-green-600', purple: 'text-purple-600',
  violet: 'text-violet-600', amber: 'text-amber-600', teal: 'text-teal-600', cyan: 'text-cyan-600',
  rose: 'text-rose-600', slate: 'text-zinc-600', sky: 'text-sky-600', orange: 'text-orange-600',
};
const COLOR_TEXT_700: Record<string, string> = {
  blue: 'text-blue-700', indigo: 'text-indigo-700', green: 'text-green-700', purple: 'text-purple-700',
  violet: 'text-violet-700', amber: 'text-amber-700', teal: 'text-teal-700', cyan: 'text-cyan-700',
  rose: 'text-rose-700', slate: 'text-zinc-700', sky: 'text-sky-700', orange: 'text-orange-700',
};

const MetricCard: React.FC<MetricCardProps> = ({ metric, colorClass }) => {
  return (
    <div className="border border-zinc-200 rounded-md">
      <div className="p-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-zinc-500 font-medium">{metric.label}</p>
            <p className={cn('text-2xl font-bold mt-1', COLOR_TEXT_700[colorClass] || 'text-zinc-700')}>
              {typeof metric.value === 'number' && metric.value % 1 !== 0
                ? metric.value.toFixed(1)
                : metric.value}
              {metric.label.includes('%') ||
              metric.label.includes('Rate') ||
              metric.label.includes('Compliance') ||
              metric.label.includes('Score')
                ? '%'
                : ''}
            </p>
          </div>
          {metric.trend && (
            <div
              className={cn(
                'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
                metric.trend === 'up' && 'bg-green-100 text-green-700',
                metric.trend === 'down' && 'bg-red-100 text-red-700',
                metric.trend === 'stable' && 'bg-zinc-100 text-zinc-700'
              )}
            >
              <TrendingUp
                className={cn(
                  'h-3 w-3',
                  metric.trend === 'down' && 'rotate-180',
                  metric.trend === 'stable' && 'rotate-90'
                )}
              />
              {metric.change !== undefined && Math.abs(metric.change)}
            </div>
          )}
        </div>
        {metric.target && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
              <span>Target: {metric.target}</span>
              <span>{Math.round((metric.value / metric.target) * 100)}%</span>
            </div>
            <Progress value={(metric.value / metric.target) * 100} className="h-1.5" />
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TASK LIST COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface TaskListProps {
  tasks: DashboardTask[];
  onTaskClick?: (taskId: string) => void;
}

const TaskList: React.FC<TaskListProps> = ({ tasks, onTaskClick }) => {
  const priorityColors = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  };

  const statusColors = {
    pending: 'bg-zinc-50 border-zinc-200',
    in_progress: 'bg-blue-50 border-blue-200',
    review: 'bg-purple-50 border-purple-200',
    blocked: 'bg-red-50 border-red-200',
  };

  const formatDueDate = (date: Date) => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return `${days}d remaining`;
  };

  return (
    <div className="space-y-2">
      {tasks.map(task => (
        <div
          key={task.id}
          onClick={() => onTaskClick?.(task.id)}
          className={cn(
            'p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
            statusColors[task.status]
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-900 truncate">{task.title}</span>
                <Badge
                  variant="outline"
                  className={cn('text-[11px] shrink-0', priorityColors[task.priority])}
                >
                  {task.priority}
                </Badge>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {task.project} · {task.submissionType}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span
                className={cn(
                  'text-xs font-medium',
                  task.dueDate.getTime() < Date.now() && 'text-red-600',
                  task.dueDate.getTime() > Date.now() &&
                    task.dueDate.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 &&
                    'text-amber-600'
                )}
              >
                {formatDueDate(task.dueDate)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AI ASSISTANT PANEL
// ─────────────────────────────────────────────────────────────────────────────

interface AIAssistantPanelProps {
  role: UserRole;
  onAskAnA: (question: string) => void;
}

const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({ role, onAskAnA }) => {
  const roleConfig = ROLE_CONFIGS[role];

  const suggestions: Record<UserRole, string[]> = {
    ra_lead: [
      'What are the key differences between our device and the predicate?',
      'Generate a regulatory strategy memo for the CardioFlow program',
      'Summarize recent FDA guidance updates for Class II devices',
    ],
    ra_associate: [
      'Help me format this section for eCTD submission',
      'Review my 510(k) summary for completeness',
      'Generate a cover letter for this submission',
    ],
    qa_manager: [
      'Draft a CAPA investigation plan for the manufacturing deviation',
      'What are the EU MDR requirements for technical documentation?',
      'Help me prepare for the upcoming FDA inspection',
    ],
    clinical_lead: [
      'Optimize our Phase 2 study design for this indication',
      'What sample size do we need for 80% power?',
      'Compare our protocol to similar approved studies',
    ],
    clinical_ops: [
      'Generate a site initiation checklist',
      'Draft an investigator communication about the protocol amendment',
      'Summarize enrollment trends across all sites',
    ],
    cmc_lead: [
      'Help me write the drug substance stability protocol',
      'What are the ICH Q3D requirements for elemental impurities?',
      'Review my analytical method validation report',
    ],
    medical_writer: [
      'Generate an outline for the Clinical Overview',
      'Help me write the benefit-risk section',
      'Review this CSR section for consistency',
    ],
    biostatistician: [
      'Help me develop the statistical analysis plan',
      'What multiplicity adjustment should we use?',
      'Generate shell tables for the primary endpoints',
    ],
    project_manager: [
      'Create a timeline for the NDA submission',
      'What are the critical path items for this program?',
      'Generate a status report for the governance meeting',
    ],
    safety_officer: [
      'Summarize the safety profile from the completed studies',
      'Help me write the DSUR safety narrative',
      'Identify any safety signals from the latest data cut',
    ],
    executive: [
      'Give me a portfolio overview with key risks',
      'What is the competitive landscape for our lead program?',
      'Summarize the regulatory pathway options',
    ],
    engineering: [
      'Help me write the design verification protocol',
      'What are the essential performance requirements?',
      'Review the risk analysis for completeness',
    ],
  };

  return (
    <div className="border border-blue-200 rounded-md bg-gradient-to-br from-blue-50 to-white">
      <div className="px-4 py-3 pb-2">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-600" />
          AnA Co-pilot
        </h3>
        <p className="text-xs text-zinc-500">
          AI-powered assistance for {roleConfig.shortTitle} workflows
        </p>
      </div>
      <div className="px-4 pb-4">
        <div className="space-y-2">
          {suggestions[role]?.slice(0, 3).map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => onAskAnA(suggestion)}
              className="w-full text-left p-2 text-xs text-zinc-600 bg-white rounded-lg border border-zinc-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface RoleDashboardProps {
  initialRole?: UserRole;
  onRoleChange?: (role: UserRole) => void;
  onNavigateToTask?: (taskId: string) => void;
  onAskAnA?: (question: string) => void;
  className?: string;
}

export const RoleDashboard: React.FC<RoleDashboardProps> = ({
  initialRole = 'ra_lead',
  onRoleChange,
  onNavigateToTask,
  onAskAnA,
  className,
}) => {
  const [currentRole, setCurrentRole] = useState<UserRole>(initialRole);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  const roleConfig = ROLE_CONFIGS[currentRole];

  // Real operational data from backend
  const { data: operationalData, isLoading: isLoadingOps } = useOperationalData();

  // Use real data when available, fall back to empty arrays
  const tasks = useMemo(() => {
    if (operationalData?.tasks?.length) {
      return operationalData.tasks.map(t => ({
        id: t.id,
        title: t.title,
        project: t.moduleType || 'General',
        submissionType: '510K' as SubmissionType,
        dueDate: t.dueDate ? new Date(t.dueDate) : new Date(),
        priority: t.priority as 'critical' | 'high' | 'medium' | 'low',
        status: (t.status === 'in-progress' ? 'in_progress' : t.status) as 'pending' | 'in_progress' | 'review' | 'blocked',
        assignee: t.assigneeName || undefined,
      }));
    }
    // Fall back to empty state
    return [];
  }, [operationalData]);

  const metrics = useMemo(() => {
    if (operationalData?.metrics?.length) {
      return operationalData.metrics.map((m, i) => ({
        id: `metric-${i}`,
        label: m.label,
        value: m.value,
        change: m.change,
        trend: undefined as 'up' | 'down' | 'stable' | undefined,
        target: undefined as number | undefined,
      }));
    }
    return [];
  }, [operationalData]);
  const activeWorkflowRunId = useMemo(
    () => `workflow-${currentRole}`,
    [currentRole]
  );

  // Derive workflow steps from real operational tasks
  const activeWorkflowSteps = useMemo(() => {
    const statusMap = (s: string) => {
      if (s === 'completed') return 'COMPLETED' as const;
      if (s === 'in-progress' || s === 'review') return 'IN_PROGRESS' as const;
      if (s === 'blocked') return 'BLOCKED' as const;
      return 'PENDING' as const;
    };
    if (tasks.length > 0) {
      return tasks.slice(0, 5).map((t, i) => ({
        id: `step-${t.id}`,
        name: t.title,
        description: '',
        status: statusMap(t.status),
        stepType: (t.status === 'review' ? 'APPROVAL' : 'TASK') as 'TASK' | 'APPROVAL',
        order: i + 1,
        phaseName: t.project || 'General',
        assigneeRole: t.assignee || roleConfig.shortTitle,
        slaDueAt: t.dueDate ? new Date(t.dueDate) : undefined,
        isRequired: t.priority === 'high' || t.priority === 'critical',
      }));
    }
    return [];
  }, [tasks, roleConfig.shortTitle]);

  // Derive next actions from real operational tasks (incomplete, sorted by priority)
  const nextActions = useMemo(() => {
    const incomplete = tasks
      .filter(t => t.status !== 'completed' && t.status !== 'cancelled')
      .slice(0, 3);
    return incomplete.map((t, i) => ({
      id: `action-${t.id}`,
      name: t.title,
      description: t.description || '',
      stepType: (t.status === 'review' ? 'APPROVAL' : 'TASK') as 'TASK' | 'APPROVAL',
      status: (t.status === 'in-progress' ? 'IN_PROGRESS' : t.status === 'blocked' ? 'BLOCKED' : 'READY') as 'READY' | 'IN_PROGRESS' | 'BLOCKED' | 'AWAITING_APPROVAL',
      workflowName: t.project || 'Tasks',
      workflowId: `workflow-${currentRole}`,
      workflowRunId: activeWorkflowRunId,
      slaDueAt: t.dueDate ? new Date(t.dueDate) : undefined,
      assigneeRole: t.assignee || roleConfig.shortTitle,
      order: i + 1,
      priority: (t.priority === 'critical' ? 'HIGH' : t.priority?.toUpperCase() || 'MEDIUM') as 'HIGH' | 'MEDIUM' | 'LOW',
    }));
  }, [tasks, currentRole, activeWorkflowRunId, roleConfig.shortTitle]);

  const handleRoleChange = (role: UserRole) => {
    setCurrentRole(role);
    onRoleChange?.(role);
  };

  const RoleIcon = roleConfig.icon;

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', COLOR_BG_100[roleConfig.color] || 'bg-zinc-100')}>
            <RoleIcon className={cn('h-5 w-5', COLOR_TEXT_600[roleConfig.color] || 'text-zinc-600')} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">{roleConfig.title}</h1>
            <p className="text-xs text-zinc-500">{roleConfig.description}</p>
          </div>
        </div>
        <Select value={currentRole} onValueChange={v => handleRoleChange(v as UserRole)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {Object.values(ROLE_CONFIGS).map(config => (
              <SelectItem key={config.id} value={config.id}>
                <div className="flex items-center gap-2">
                  <config.icon className="h-4 w-4" />
                  {config.shortTitle}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Metrics Grid */}
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 mb-3">Key Metrics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {metrics.map(metric => (
                <MetricCard key={metric.id} metric={metric} colorClass={roleConfig.color} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Tasks */}
            <div className="lg:col-span-2">
              <div className="border border-zinc-200 rounded-md">
                <div className="px-4 py-3 pb-2 border-b border-zinc-200">
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    My Tasks
                  </h3>
                </div>
                <div className="px-4 py-3">
                  {isLoadingOps && (
                    <div className="flex items-center gap-2 p-4 text-sm text-zinc-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading operational data...
                    </div>
                  )}
                  {!isLoadingOps && tasks.length > 0 && (
                    <TaskList tasks={tasks} onTaskClick={onNavigateToTask} />
                  )}
                  {!isLoadingOps && tasks.length === 0 && (
                    <div className="text-center py-8 text-zinc-500">
                      <ClipboardList className="w-8 h-8 mx-auto mb-2 text-zinc-300" />
                      <p className="text-sm font-medium">No active tasks</p>
                      <p className="text-xs mt-1">Tasks will appear here as they are created in the system</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RI Assistant */}
            <div>
              <AIAssistantPanel
                role={currentRole}
                onAskAnA={onAskAnA || (() => {})}
              />
            </div>
          </div>

          {/* Workflow Snapshot */}
          <div className="border border-zinc-200 rounded-md">
            <div className="px-4 py-3 pb-2 border-b border-zinc-200">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Active Workflow Steps
              </h3>
              <p className="text-xs text-zinc-500">
                Proof-backed execution trail for the current workflow run
              </p>
            </div>
            <div className="px-4 py-3 space-y-3">
              {activeWorkflowSteps.map(step => (
                <StepCard
                  key={step.id}
                  step={step}
                  workflowRunId={activeWorkflowRunId}
                  isExpanded={expandedStepId === step.id}
                  onToggleExpand={() =>
                    setExpandedStepId(prev => (prev === step.id ? null : step.id))
                  }
                />
              ))}
            </div>
          </div>

          {/* Next Actions */}
          <div>
            <NextActionsPanel actions={nextActions} maxItems={3} />
          </div>

          {/* Relevant Submissions */}
          <div className="border border-zinc-200 rounded-md">
            <div className="px-4 py-3 pb-2 border-b border-zinc-200">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Globe2 className="h-4 w-4" />
                Relevant Submission Types
              </h3>
              <p className="text-xs text-zinc-500">
                Submission types most relevant to your role
              </p>
            </div>
            <div className="px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {roleConfig.relevantSubmissions.map(type => (
                  <Badge key={type} variant="outline" className="text-xs">
                    {type.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default RoleDashboard;
