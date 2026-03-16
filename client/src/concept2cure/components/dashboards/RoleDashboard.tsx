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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

const generateMockTasks = (role: UserRole): DashboardTask[] => {
  const roleConfig = ROLE_CONFIGS[role];
  const baseTasks: DashboardTask[] = [
    {
      id: '1',
      title: 'Complete predicate comparison table',
      project: 'CardioFlow 510(k)',
      submissionType: '510K',
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      priority: 'high',
      status: 'in_progress',
    },
    {
      id: '2',
      title: 'Review IND Module 2.5 clinical summary',
      project: 'NeuroCure IND',
      submissionType: 'IND',
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      priority: 'medium',
      status: 'pending',
    },
    {
      id: '3',
      title: 'Prepare pre-submission meeting questions',
      project: 'DiagnostiX DE NOVO',
      submissionType: 'DE_NOVO',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      priority: 'critical',
      status: 'pending',
    },
  ];

  // Filter by relevant submissions for this role
  return baseTasks.filter(t => roleConfig.relevantSubmissions.includes(t.submissionType));
};

const generateMockMetrics = (role: UserRole): DashboardMetric[] => {
  const metricsMap: Record<UserRole, DashboardMetric[]> = {
    ra_lead: [
      { id: 'm1', label: 'Active Submissions', value: 7, change: 2, trend: 'up' },
      { id: 'm2', label: 'Pending FDA Actions', value: 3, change: -1, trend: 'down' },
      { id: 'm3', label: 'Days to Next Deadline', value: 14, target: 30 },
      { id: 'm4', label: 'Approval Rate YTD', value: 92, target: 90, trend: 'up' },
    ],
    ra_associate: [
      { id: 'm1', label: 'Documents in Queue', value: 12, change: 3, trend: 'up' },
      { id: 'm2', label: 'Completed This Week', value: 8, change: 2, trend: 'up' },
      { id: 'm3', label: 'Avg Review Cycles', value: 2.3, target: 2.0, trend: 'stable' },
      { id: 'm4', label: 'Template Compliance', value: 96, target: 95 },
    ],
    qa_manager: [
      { id: 'm1', label: 'Open CAPAs', value: 4, change: -2, trend: 'down' },
      { id: 'm2', label: 'Overdue Findings', value: 1, target: 0, trend: 'stable' },
      { id: 'm3', label: 'SOP Currency', value: 94, target: 100, trend: 'up' },
      { id: 'm4', label: 'Audit Ready Score', value: 87, target: 90 },
    ],
    clinical_lead: [
      { id: 'm1', label: 'Active Studies', value: 3, change: 1, trend: 'up' },
      { id: 'm2', label: 'Enrollment Rate', value: 78, target: 80, trend: 'up' },
      { id: 'm3', label: 'Sites Activated', value: 24, target: 30 },
      { id: 'm4', label: 'Protocol Amendments', value: 2, change: 0, trend: 'stable' },
    ],
    clinical_ops: [
      { id: 'm1', label: 'Sites in Startup', value: 8, change: 2, trend: 'up' },
      { id: 'm2', label: 'Open Queries', value: 156, target: 100, trend: 'down' },
      { id: 'm3', label: 'Monitoring Visits', value: 12, change: 4, trend: 'up' },
      { id: 'm4', label: 'Query Resolution (days)', value: 4.2, target: 5.0 },
    ],
    cmc_lead: [
      { id: 'm1', label: 'Batches in Release', value: 5, change: 1, trend: 'up' },
      { id: 'm2', label: 'Stability Studies', value: 8, change: 0, trend: 'stable' },
      { id: 'm3', label: 'Method Validations', value: 3, change: 1, trend: 'up' },
      { id: 'm4', label: 'OOS Investigations', value: 1, target: 0 },
    ],
    medical_writer: [
      { id: 'm1', label: 'Documents in Progress', value: 6, change: 2, trend: 'up' },
      { id: 'm2', label: 'Pages Written (MTD)', value: 342, change: 87, trend: 'up' },
      { id: 'm3', label: 'Review Turnaround (days)', value: 3.1, target: 3.0 },
      { id: 'm4', label: 'QC Pass Rate', value: 94, target: 95 },
    ],
    biostatistician: [
      { id: 'm1', label: 'SAPs in Development', value: 2, change: 0, trend: 'stable' },
      { id: 'm2', label: 'Datasets Locked', value: 1, change: 1, trend: 'up' },
      { id: 'm3', label: 'TLFs Programmed', value: 156, target: 200 },
      { id: 'm4', label: 'Analysis Queries', value: 23, change: -8, trend: 'down' },
    ],
    project_manager: [
      { id: 'm1', label: 'Milestones On Track', value: 85, target: 90, trend: 'stable' },
      { id: 'm2', label: 'Resource Utilization', value: 92, target: 85 },
      { id: 'm3', label: 'Budget Variance', value: -3, target: 0, trend: 'down' },
      { id: 'm4', label: 'Open Risk Items', value: 7, change: 2, trend: 'up' },
    ],
    safety_officer: [
      { id: 'm1', label: 'SAEs Pending Review', value: 4, change: 2, trend: 'up' },
      { id: 'm2', label: 'DSUR Due (days)', value: 45, target: 60 },
      { id: 'm3', label: 'Signal Reviews', value: 2, change: 1, trend: 'up' },
      { id: 'm4', label: 'Expedited Reports (30d)', value: 6, change: 0, trend: 'stable' },
    ],
    executive: [
      { id: 'm1', label: 'Portfolio Programs', value: 12, change: 1, trend: 'up' },
      { id: 'm2', label: 'Key Milestones (Q)', value: 4, target: 5 },
      { id: 'm3', label: 'Budget Adherence', value: 97, target: 100 },
      { id: 'm4', label: 'Pipeline Value ($M)', value: 2400, change: 350, trend: 'up' },
    ],
    engineering: [
      { id: 'm1', label: 'Design Controls Open', value: 23, change: -5, trend: 'down' },
      { id: 'm2', label: 'V&V Protocols', value: 8, change: 2, trend: 'up' },
      { id: 'm3', label: 'DHF Completion', value: 76, target: 100 },
      { id: 'm4', label: 'ECOs Pending', value: 5, change: 1, trend: 'up' },
    ],
  };
  return metricsMap[role] || [];
};

// ─────────────────────────────────────────────────────────────────────────────
// METRIC CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  metric: DashboardMetric;
  colorClass: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ metric, colorClass }) => {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium">{metric.label}</p>
            <p className={cn('text-2xl font-bold mt-1', `text-${colorClass}-700`)}>
              {typeof metric.value === 'number' && metric.value % 1 !== 0
                ? metric.value.toFixed(1)
                : metric.value}
              {metric.label.includes('%') || metric.label.includes('Rate') || metric.label.includes('Compliance') || metric.label.includes('Score')
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
                metric.trend === 'stable' && 'bg-gray-100 text-gray-700'
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
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Target: {metric.target}</span>
              <span>{Math.round((metric.value / metric.target) * 100)}%</span>
            </div>
            <Progress
              value={(metric.value / metric.target) * 100}
              className="h-1.5"
            />
          </div>
        )}
      </CardContent>
    </Card>
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
    low: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  const statusColors = {
    pending: 'bg-gray-50 border-gray-200',
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
      {tasks.map((task) => (
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
                <span className="text-sm font-medium text-gray-900 truncate">
                  {task.title}
                </span>
                <Badge variant="outline" className={cn('text-[10px] shrink-0', priorityColors[task.priority])}>
                  {task.priority}
                </Badge>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {task.project} · {task.submissionType}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span
                className={cn(
                  'text-xs font-medium',
                  task.dueDate.getTime() < Date.now() && 'text-red-600',
                  task.dueDate.getTime() > Date.now() && task.dueDate.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 && 'text-amber-600'
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
  onAskLumen: (question: string) => void;
}

const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({ role, onAskLumen }) => {
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
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-600" />
          Ask Lumen Cortex
        </CardTitle>
        <CardDescription className="text-xs">
          AI-powered assistance for {roleConfig.shortTitle} workflows
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {suggestions[role]?.slice(0, 3).map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => onAskLumen(suggestion)}
              className="w-full text-left p-2 text-xs text-gray-600 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface RoleDashboardProps {
  initialRole?: UserRole;
  onRoleChange?: (role: UserRole) => void;
  onNavigateToTask?: (taskId: string) => void;
  onAskLumen?: (question: string) => void;
  className?: string;
}

export const RoleDashboard: React.FC<RoleDashboardProps> = ({
  initialRole = 'ra_lead',
  onRoleChange,
  onNavigateToTask,
  onAskLumen,
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
    () => `demo-${currentRole}-workflow-run`,
    [currentRole]
  );
  const activeWorkflowSteps = useMemo(
    () => [
      {
        id: 'step-compile-section',
        name: 'Compile submission section',
        description: 'Draft and finalize required section content for review.',
        status: 'IN_PROGRESS' as const,
        stepType: 'TASK' as const,
        order: 1,
        phaseName: 'Authoring',
        assigneeRole: roleConfig.shortTitle,
        slaDueAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
        isRequired: true,
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
      {
        id: 'step-review-approval',
        name: 'Regulatory review',
        description: 'Regulatory review and approval of compiled section.',
        status: 'READY' as const,
        stepType: 'APPROVAL' as const,
        order: 2,
        phaseName: 'Review',
        assigneeRole: 'QA Manager',
        slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isRequired: true,
      },
    ],
    [roleConfig.shortTitle]
  );
  const nextActions = useMemo(
    () => [
      {
        id: 'action-compile-section',
        name: 'Finalize compliance section',
        description: 'Complete the compliance summary and attach evidence.',
        stepType: 'TASK' as const,
        status: 'READY' as const,
        workflowName: 'Regulatory Submission Prep',
        workflowId: 'workflow-reg-prep-01',
        workflowRunId: activeWorkflowRunId,
        slaDueAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
        assigneeRole: roleConfig.shortTitle,
        order: 1,
        priority: 'HIGH' as const,
      },
      {
        id: 'action-review-section',
        name: 'Review draft evidence pack',
        description: 'Approve the evidence package for submission.',
        stepType: 'APPROVAL' as const,
        status: 'AWAITING_APPROVAL' as const,
        workflowName: 'Regulatory Submission Prep',
        workflowId: 'workflow-reg-prep-01',
        workflowRunId: activeWorkflowRunId,
        slaDueAt: new Date(Date.now() + 20 * 60 * 60 * 1000),
        assigneeRole: 'QA Manager',
        order: 2,
        priority: 'MEDIUM' as const,
      },
    ],
    [activeWorkflowRunId, roleConfig.shortTitle]
  );

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
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', `bg-${roleConfig.color}-100`)}>
            <RoleIcon className={cn('h-5 w-5', `text-${roleConfig.color}-600`)} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{roleConfig.title}</h1>
            <p className="text-xs text-gray-500">{roleConfig.description}</p>
          </div>
        </div>
        <Select value={currentRole} onValueChange={(v) => handleRoleChange(v as UserRole)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {Object.values(ROLE_CONFIGS).map((config) => (
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
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Key Metrics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {metrics.map((metric) => (
                <MetricCard key={metric.id} metric={metric} colorClass={roleConfig.color} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Tasks */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    My Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
            </div>

            {/* AI Assistant */}
            <div>
              <AIAssistantPanel
                role={currentRole}
                onAskLumen={onAskLumen || (() => {})}
              />
            </div>
          </div>

          {/* Workflow Snapshot */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Active Workflow Steps
              </CardTitle>
              <CardDescription className="text-xs">
                Proof-backed execution trail for the current workflow run
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeWorkflowSteps.map((step) => (
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
            </CardContent>
          </Card>

          {/* Next Actions */}
          <div>
            <NextActionsPanel actions={nextActions} maxItems={3} />
          </div>

          {/* Relevant Submissions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe2 className="h-4 w-4" />
                Relevant Submission Types
              </CardTitle>
              <CardDescription className="text-xs">
                Submission types most relevant to your role
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {roleConfig.relevantSubmissions.map((type) => (
                  <Badge key={type} variant="outline" className="text-xs">
                    {type.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
};

export default RoleDashboard;
