/**
 * Concept2Cure Client Portal V2 - Workflow Dashboard
 *
 * Workflow management for document reviews, approvals,
 * and regulatory submission preparation.
 *
 * @version 2.0.0
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  GitBranch,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  Users,
  FileText,
  Calendar,
  Filter,
  Plus,
  ChevronRight,
  MoreHorizontal,
  Play,
  Pause,
  XCircle,
  RotateCcw,
  Eye,
  MessageSquare,
  Link,
  History,
  ShieldCheck,
  Loader2,
  AlertTriangle as AlertTriangleIcon,
} from 'lucide-react';
import type { TaskSummary, Priority } from '../../core/portalTypes';
import { usePortal, usePermission } from '../../core/portalContext';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface WorkflowStep {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected' | 'skipped';
  assignee?: string;
  assigneeAvatar?: string;
  completedAt?: Date;
  dueDate?: Date;
  comments?: number;
}

interface Workflow {
  id: string;
  name: string;
  type: 'document_review' | 'approval' | 'submission_prep' | 'training' | 'change_control';
  status: 'active' | 'completed' | 'cancelled' | 'on_hold';
  priority: Priority;
  workflowRunId?: string;
  documentName?: string;
  documentId?: string;
  initiator: string;
  initiatorAvatar?: string;
  createdAt: Date;
  dueDate: Date;
  currentStep: number;
  steps: WorkflowStep[];
  progress: number;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  type: Workflow['type'];
  steps: string[];
  estimatedDuration: string;
  usageCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const WORKFLOW_STATUS_CONFIG = {
  active: { label: 'Active', color: 'bg-stone-100 text-stone-700', icon: Play },
  completed: { label: 'Completed', color: 'bg-stone-100 text-stone-800', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'bg-stone-100 text-stone-700', icon: XCircle },
  on_hold: { label: 'On Hold', color: 'bg-stone-100 text-stone-700', icon: Pause },
};

const STEP_STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-stone-100 text-stone-600' },
  in_progress: { label: 'In Progress', color: 'bg-stone-100 text-stone-700' },
  completed: { label: 'Completed', color: 'bg-stone-100 text-stone-800' },
  rejected: { label: 'Rejected', color: 'bg-stone-100 text-stone-800' },
  skipped: { label: 'Skipped', color: 'bg-stone-100 text-stone-500' },
};

const PRIORITY_CONFIG = {
  critical: { color: 'bg-stone-100 text-stone-800 border-stone-200' },
  high: { color: 'bg-stone-100 text-stone-700 border-stone-200' },
  medium: { color: 'bg-stone-100 text-stone-700 border-stone-200' },
  low: { color: 'bg-stone-100 text-stone-700 border-stone-200' },
};

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface WorkflowCardProps {
  workflow: Workflow;
  onView: (workflow: Workflow) => void;
}

const WorkflowCard: React.FC<WorkflowCardProps> = ({ workflow, onView }) => {
  const statusConfig = WORKFLOW_STATUS_CONFIG[workflow.status];
  const StatusIcon = statusConfig.icon;

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  };

  const getDaysUntilDue = (date: Date) => {
    const now = new Date();
    const due = new Date(date);
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const daysUntil = getDaysUntilDue(workflow.dueDate);
  const isOverdue = daysUntil < 0 && workflow.status === 'active';
  const isUrgent = daysUntil <= 3 && daysUntil >= 0 && workflow.status === 'active';

  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onView(workflow)}
    >
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{workflow.name}</span>
              <Badge className={`text-xs ${PRIORITY_CONFIG[workflow.priority].color}`}>
                {workflow.priority}
              </Badge>
            </div>
            {workflow.documentName && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span className="truncate max-w-48">{workflow.documentName}</span>
              </div>
            )}
          </div>
          <Badge className={`text-xs ${statusConfig.color}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {statusConfig.label}
          </Badge>
        </div>

        {/* Progress */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">
              Step {workflow.currentStep + 1} of {workflow.steps.length}
            </span>
            <span className="font-medium">{workflow.progress}%</span>
          </div>
          <Progress value={workflow.progress} className="h-2" />
        </div>

        {/* Steps preview */}
        <div className="flex items-center gap-1 mb-3">
          {workflow.steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  step.status === 'completed'
                    ? 'bg-stone-100 text-stone-800'
                    : step.status === 'in_progress'
                      ? 'bg-stone-100 text-stone-700'
                      : step.status === 'rejected'
                        ? 'bg-stone-100 text-stone-800'
                        : 'bg-stone-100 text-stone-500'
                }`}
                title={step.name}
              >
                {step.status === 'completed' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : step.status === 'rejected' ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  index + 1
                )}
              </div>
              {index < workflow.steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 ${
                    step.status === 'completed' ? 'bg-stone-300' : 'bg-stone-200'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-[11px]">
                {workflow.initiator
                  .split(' ')
                  .map(n => n[0])
                  .join('')}
              </AvatarFallback>
            </Avatar>
            <span>{workflow.initiator}</span>
          </div>
          <div className="flex items-center gap-3">
            {workflow.workflowRunId && (
              <a
                href={`/concept2cure/proofs/${workflow.workflowRunId}`}
                className="flex items-center gap-1 text-stone-600 hover:text-stone-700"
                onClick={(event) => event.stopPropagation()}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Proof
              </a>
            )}
            <div
              className={`flex items-center gap-1 ${
                isOverdue ? 'text-stone-700 font-medium' : isUrgent ? 'text-stone-600' : ''
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {isOverdue
                  ? `${Math.abs(daysUntil)}d overdue`
                  : isUrgent
                    ? `${daysUntil}d left`
                    : formatDate(workflow.dueDate)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW DETAIL PANEL COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface WorkflowDetailProps {
  workflow: Workflow;
  onClose: () => void;
  onAction: (action: string, workflow: Workflow, stepId?: string) => void;
}

const WorkflowDetail: React.FC<WorkflowDetailProps> = ({ workflow, onClose, onAction }) => {
  const canExecuteWorkflows = usePermission('workflows:execute');

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(new Date(date));
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="border-b">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle>{workflow.name}</CardTitle>
            <CardDescription>{workflow.documentName}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-4">
        {/* Status & Info */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Status</div>
            <Badge className={`${WORKFLOW_STATUS_CONFIG[workflow.status].color}`}>
              {WORKFLOW_STATUS_CONFIG[workflow.status].label}
            </Badge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Priority</div>
            <Badge className={`${PRIORITY_CONFIG[workflow.priority].color}`}>
              {workflow.priority}
            </Badge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Initiated</div>
            <div className="text-sm">{formatDate(workflow.createdAt)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Due</div>
            <div className="text-sm">{formatDate(workflow.dueDate)}</div>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium">Progress</span>
            <span>{workflow.progress}%</span>
          </div>
          <Progress value={workflow.progress} className="h-2" />
        </div>

        {/* Steps */}
        <div className="space-y-3">
          <div className="font-medium text-sm">Workflow Steps</div>
          {workflow.steps.map((step, index) => {
            const stepConfig = STEP_STATUS_CONFIG[step.status];
            const isCurrentStep = index === workflow.currentStep;

            return (
              <div
                key={step.id}
                className={`rounded-lg border p-3 ${
                  isCurrentStep ? 'border-stone-300 bg-stone-100' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${stepConfig.color}`}
                    >
                      {step.status === 'completed' ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : step.status === 'rejected' ? (
                        <XCircle className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span className="font-medium text-sm">{step.name}</span>
                  </div>
                  <Badge className={`text-xs ${stepConfig.color}`}>{stepConfig.label}</Badge>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    {step.assignee && (
                      <>
                        <Avatar className="h-4 w-4">
                          <AvatarFallback className="text-[11px]">
                            {step.assignee
                              .split(' ')
                              .map(n => n[0])
                              .join('')}
                          </AvatarFallback>
                        </Avatar>
                        <span>{step.assignee}</span>
                      </>
                    )}
                  </div>
                  {step.completedAt ? (
                    <span>Completed {formatDate(step.completedAt)}</span>
                  ) : step.dueDate ? (
                    <span>Due {formatDate(step.dueDate)}</span>
                  ) : null}
                </div>

                {/* Step Actions */}
                {isCurrentStep && canExecuteWorkflows && workflow.status === 'active' && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => onAction('approve', workflow, step.id)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onAction('reject', workflow, step.id)}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onAction('reassign', workflow, step.id)}
                    >
                      <Users className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>

      {/* Footer Actions */}
      <div className="p-4 border-t flex items-center gap-2">
        <Button variant="outline" size="sm" className="flex-1">
          <MessageSquare className="h-4 w-4 mr-1" />
          Comments
        </Button>
        <Button variant="outline" size="sm" className="flex-1">
          <History className="h-4 w-4 mr-1" />
          History
        </Button>
        {workflow.documentId && (
          <Button variant="outline" size="sm" className="flex-1">
            <Eye className="h-4 w-4 mr-1" />
            View Document
          </Button>
        )}
        {workflow.workflowRunId && (
          <a
            href={`/concept2cure/proofs/${workflow.workflowRunId}`}
            className="flex-1"
          >
            <Button variant="outline" size="sm" className="w-full">
              <ShieldCheck className="h-4 w-4 mr-1" />
              View Proof
            </Button>
          </a>
        )}
      </div>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW TEMPLATES COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface WorkflowTemplatesProps {
  templates: WorkflowTemplate[];
  onCreateWorkflow: (template: WorkflowTemplate) => void;
}

const WorkflowTemplates: React.FC<WorkflowTemplatesProps> = ({ templates, onCreateWorkflow }) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map(template => (
        <Card
          key={template.id}
          className="hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => onCreateWorkflow(template)}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="h-10 w-10 rounded-lg bg-stone-100 flex items-center justify-center">
                <GitBranch className="h-5 w-5 text-stone-600" />
              </div>
              <Badge variant="secondary" className="text-xs">
                {template.usageCount} uses
              </Badge>
            </div>
            <h3 className="font-semibold mb-1">{template.name}</h3>
            <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{template.steps.length} steps</span>
              <span>~{template.estimatedDuration}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WORKFLOW DASHBOARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const WorkflowDashboard: React.FC = () => {
  const { can } = usePortal();
  const canCreateWorkflows = can('workflows:create');

  // State
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'templates'>('active');
  const [statusFilter, setStatusFilter] = useState<Workflow['status'] | 'all'>('all');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);

  // Fetch projects from submission center to derive workflows
  const { data: projectsData, isLoading: projectsLoading, error: projectsError } = useQuery({
    queryKey: ['workflow-dashboard-projects'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/submission-center/projects');
      return res.json();
    },
  });

  // Fetch tasks to derive workflow steps
  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['workflow-dashboard-tasks'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/submission-center/tasks');
      return res.json();
    },
  });

  // Fetch workflow status from proof system
  const { data: workflowStatusData } = useQuery({
    queryKey: ['workflow-dashboard-status'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/workflow/status');
      return res.json();
    },
    retry: 1,
  });

  const isLoading = projectsLoading || tasksLoading;

  // Map API projects to Workflow shape
  const workflows: Workflow[] = useMemo(() => {
    const apiProjects = projectsData?.data || [];
    const apiTasks = tasksData?.data || [];

    return apiProjects.map((p: any, idx: number) => {
      // Get tasks for this project
      const projectTasks = apiTasks.filter((t: any) => t.project_id === p.id);
      const completedTasks = projectTasks.filter((t: any) => t.status === 'completed').length;
      const totalTasks = projectTasks.length || 1;
      const progress = Math.round((completedTasks / totalTasks) * 100);

      // Derive status from project stage
      const status: Workflow['status'] = p.stage === 'submission' || p.stage === 'response'
        ? 'completed'
        : p.stage === 'review' || p.stage === 'approval'
          ? 'active'
          : p.completion_percentage >= 100
            ? 'completed'
            : 'active';

      // Map priority
      const priority: Priority = (p.priority as Priority) || 'medium';

      // Create workflow steps from tasks, or generate defaults from stage
      const steps: WorkflowStep[] = projectTasks.length > 0
        ? projectTasks.map((t: any, tIdx: number) => ({
            id: `s${t.id || tIdx}`,
            name: t.title || `Step ${tIdx + 1}`,
            status: t.status === 'completed' ? 'completed' as const
              : t.status === 'in-progress' ? 'in_progress' as const
              : 'pending' as const,
            assignee: t.assigned_to || undefined,
            completedAt: t.status === 'completed' ? new Date(t.updated_at || Date.now()) : undefined,
            dueDate: t.due_date ? new Date(t.due_date) : undefined,
          }))
        : [
            { id: `s${idx}_1`, name: 'Planning', status: p.stage === 'planning' ? 'in_progress' as const : 'completed' as const },
            { id: `s${idx}_2`, name: 'Authoring', status: p.stage === 'authoring' ? 'in_progress' as const : p.stage === 'planning' ? 'pending' as const : 'completed' as const },
            { id: `s${idx}_3`, name: 'Review', status: p.stage === 'review' ? 'in_progress' as const : ['submission', 'response', 'approval'].includes(p.stage) ? 'completed' as const : 'pending' as const },
            { id: `s${idx}_4`, name: 'Approval', status: p.stage === 'approval' ? 'in_progress' as const : ['submission', 'response'].includes(p.stage) ? 'completed' as const : 'pending' as const },
          ];

      const currentStep = steps.findIndex(s => s.status === 'in_progress' || s.status === 'pending');

      return {
        id: String(p.id || idx + 1),
        name: p.name || 'Untitled Workflow',
        type: (p.submission_type === '510k' ? 'submission_prep' : 'document_review') as Workflow['type'],
        status,
        priority,
        documentName: `${p.submission_type || 'Document'} - ${p.name || 'Untitled'}`,
        documentId: String(p.id),
        initiator: p.created_by || 'System',
        createdAt: new Date(p.created_at || Date.now()),
        dueDate: new Date(p.target_date || Date.now() + 30 * 24 * 60 * 60 * 1000),
        currentStep: currentStep >= 0 ? currentStep : 0,
        steps,
        progress,
      } as Workflow;
    });
  }, [projectsData, tasksData]);

  // Static templates (these are UI configuration, not API data)
  const templates: WorkflowTemplate[] = [
    {
      id: 't1',
      name: 'Document Review',
      description: 'Standard document review with QC',
      type: 'document_review',
      steps: ['Draft Review', 'Technical Review', 'QC Review', 'Final Approval'],
      estimatedDuration: '5-7 days',
      usageCount: 45,
    },
    {
      id: 't2',
      name: 'Expedited Approval',
      description: 'Fast-track approval for urgent documents',
      type: 'approval',
      steps: ['Review', 'Approve'],
      estimatedDuration: '1-2 days',
      usageCount: 23,
    },
    {
      id: 't3',
      name: 'Submission Package Review',
      description: 'Full CTD module review workflow',
      type: 'submission_prep',
      steps: ['Completeness Check', 'Technical Review', 'Cross-Reference', 'QC', 'Sign-off'],
      estimatedDuration: '10-14 days',
      usageCount: 12,
    },
    {
      id: 't4',
      name: 'Change Control',
      description: 'Document change control process',
      type: 'change_control',
      steps: ['Impact Assessment', 'Review', 'Approval', 'Implementation'],
      estimatedDuration: '3-5 days',
      usageCount: 31,
    },
    {
      id: 't5',
      name: 'Training Assignment',
      description: 'GxP training completion workflow',
      type: 'training',
      steps: ['Assignment', 'Completion', 'Assessment', 'Certification'],
      estimatedDuration: '7-14 days',
      usageCount: 67,
    },
  ];

  // Filtered workflows
  const filteredWorkflows = useMemo(() => {
    let result = workflows;

    if (activeTab === 'active') {
      result = result.filter(w => w.status === 'active' || w.status === 'on_hold');
    } else if (activeTab === 'completed') {
      result = result.filter(w => w.status === 'completed' || w.status === 'cancelled');
    }

    if (statusFilter !== 'all') {
      result = result.filter(w => w.status === statusFilter);
    }

    return result;
  }, [workflows, activeTab, statusFilter]);

  // Stats
  const stats = {
    active: workflows.filter(w => w.status === 'active').length,
    onHold: workflows.filter(w => w.status === 'on_hold').length,
    completed: workflows.filter(w => w.status === 'completed').length,
    myPending: workflows.filter(w => w.status === 'active').length, // Would filter by current user
  };

  const handleWorkflowAction = (action: string, workflow: Workflow, stepId?: string) => {
    // TODO: Implement workflow action API call
    // API endpoint: POST /api/workflows/{workflow.id}/action { action, stepId }
    void action;
    void workflow;
    void stepId;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-stone-600" />
        <span className="ml-2 text-muted-foreground">Loading workflows...</span>
      </div>
    );
  }

  if (projectsError) {
    return (
      <div className="rounded-lg border border-stone-200 bg-stone-100 p-6 text-center">
        <AlertTriangleIcon className="h-8 w-8 text-stone-1000 mx-auto mb-2" />
        <p className="text-stone-800 font-medium">Failed to load workflow data</p>
        <p className="text-stone-700 text-sm mt-1">Please try refreshing the page.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-stone-600" />
            Workflow Dashboard
          </h1>
          <p className="text-muted-foreground">Manage reviews, approvals, and submissions</p>
        </div>
        {canCreateWorkflows && (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Workflow
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">{stats.active}</p>
              </div>
              <Play className="h-8 w-8 text-stone-1000 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">On Hold</p>
                <p className="text-2xl font-bold">{stats.onHold}</p>
              </div>
              <Pause className="h-8 w-8 text-stone-1000 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">My Pending Actions</p>
                <p className="text-2xl font-bold">{stats.myPending}</p>
              </div>
              <Clock className="h-8 w-8 text-stone-1000 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed This Month</p>
                <p className="text-2xl font-bold">{stats.completed}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-stone-1000 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* Workflow List */}
        <div className="flex-1 flex flex-col min-w-0">
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="active">Active ({stats.active + stats.onHold})</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="templates">Templates</TabsTrigger>
              </TabsList>
              {activeTab !== 'templates' && (
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter
                </Button>
              )}
            </div>

            <TabsContent value="active" className="flex-1 mt-0">
              <div className="grid gap-4 md:grid-cols-2">
                {filteredWorkflows.map(workflow => (
                  <WorkflowCard
                    key={workflow.id}
                    workflow={workflow}
                    onView={setSelectedWorkflow}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="completed" className="flex-1 mt-0">
              <div className="grid gap-4 md:grid-cols-2">
                {filteredWorkflows.map(workflow => (
                  <WorkflowCard
                    key={workflow.id}
                    workflow={workflow}
                    onView={setSelectedWorkflow}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="templates" className="flex-1 mt-0">
              <WorkflowTemplates
                templates={templates}
                onCreateWorkflow={template => {
                  // TODO: Implement workflow creation from template
                  // API endpoint: POST /api/workflows/from-template { templateId: template.id }
                  void template;
                }}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Detail Panel */}
        {selectedWorkflow && (
          <div className="w-96 flex-shrink-0">
            <WorkflowDetail
              workflow={selectedWorkflow}
              onClose={() => setSelectedWorkflow(null)}
              onAction={handleWorkflowAction}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowDashboard;
