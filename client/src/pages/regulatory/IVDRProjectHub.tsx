/**
 * IVDR Project Hub — EU IVDR 2017/746 Integrated Project View
 *
 * This is the production IVDR entry point inside the Client Portal / Global Project Manager.
 * It wraps the existing IVDR sub-modules with:
 *  - Feature flag + license gating (ENABLE_IVDR_MODULE + module subscription)
 *  - Project-level readiness score computed from workplan tasks
 *  - Evidence checklist summary
 *  - Audit trail per IVDR project
 *  - Stage-gate status progress bar
 *
 * @module pages/regulatory/IVDRProjectHub
 * @version 1.0.0
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  ChevronLeft,
  FlaskConical,
  BarChart3,
  GitBranch,
  Microscope,
  ClipboardCheck,
  FileCheck,
  Lock,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Package,
  Link2,
} from 'lucide-react';
import {
  IVDRAnnexVIIIClassifier,
  AnalyticalValidationTracker,
  ClinicalEvidenceTracker,
  CDxWorkflow,
  EvidenceBinderTable,
  PackBuilderPanel,
} from '@/concept2cure/components/regulatory';
import { useModules } from '@/concept2cure/hooks/useModules';
import { useActiveProject } from '@/concept2cure/contexts/ZenWorkspaceContext';
import { isFeatureEnabled } from '@/flags/featureFlags';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface IVDRWorkplanStage {
  key: string;
  label: string;
  shortLabel: string;
  order: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  taskCount: number;
  completedTasks: number;
}

interface IVDRAuditEvent {
  id: number;
  action: string;
  entity: string;
  timestamp: string;
  user: string;
  details?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// IVDR WORKPLAN STAGES (7 stage gates per user specification)
// ─────────────────────────────────────────────────────────────────────────────

const IVDR_STAGES: IVDRWorkplanStage[] = [
  {
    key: 'classification',
    label: 'Annex VIII Classification',
    shortLabel: 'Class',
    order: 1,
    status: 'not_started',
    taskCount: 1,
    completedTasks: 0,
  },
  {
    key: 'pep',
    label: 'Performance Evaluation Plan',
    shortLabel: 'PEP',
    order: 2,
    status: 'not_started',
    taskCount: 1,
    completedTasks: 0,
  },
  {
    key: 'analytical',
    label: 'Analytical Performance Studies',
    shortLabel: 'Analytical',
    order: 3,
    status: 'not_started',
    taskCount: 1,
    completedTasks: 0,
  },
  {
    key: 'clinical',
    label: 'Clinical Evidence Compilation',
    shortLabel: 'Clinical',
    order: 4,
    status: 'not_started',
    taskCount: 1,
    completedTasks: 0,
  },
  {
    key: 'cdx',
    label: 'CDx Companion Diagnostic',
    shortLabel: 'CDx',
    order: 5,
    status: 'not_started',
    taskCount: 1,
    completedTasks: 0,
  },
  {
    key: 'techdoc',
    label: 'Technical Documentation',
    shortLabel: 'TechDoc',
    order: 6,
    status: 'not_started',
    taskCount: 1,
    completedTasks: 0,
  },
  {
    key: 'nb_readiness',
    label: 'Notified Body Readiness',
    shortLabel: 'NB',
    order: 7,
    status: 'not_started',
    taskCount: 1,
    completedTasks: 0,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: compute status from task data
// ─────────────────────────────────────────────────────────────────────────────

function stageStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'in_progress':
      return <Clock className="h-4 w-4 text-blue-600" />;
    case 'blocked':
      return <AlertTriangle className="h-4 w-4 text-red-600" />;
    default:
      return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
  }
}

function stageStatusColor(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'in_progress':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'blocked':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-gray-100 text-gray-500 border-gray-200';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function IVDRProjectHub() {
  const [activeTab, setActiveTab] = useState('overview');
  const { isIvdrEnabled, isLoading: modulesLoading } = useModules();
  const featureFlagEnabled = isFeatureEnabled('ENABLE_IVDR_MODULE');
  const activeProject = useActiveProject();

  // Fetch IVDR project tasks from submission center (if project exists)
  const { data: projectData } = useQuery({
    queryKey: ['ivdr-project-tasks'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/submission-center/projects');
      if (!res.ok) return { tasks: [], stages: IVDR_STAGES };
      const json = await res.json();
      // Find an IVDR project
      const ivdrProject = json.data?.find((p: any) => p.submission_type === 'IVDR');
      if (!ivdrProject) return { project: null, tasks: [], stages: IVDR_STAGES };

      // Fetch tasks for this project
      const tasksRes = await apiRequest('GET', `/api/submission-center/projects/${ivdrProject.id}/tasks`);
      const tasksJson = tasksRes.ok ? await tasksRes.json() : { data: [] };
      const tasks = tasksJson.data || [];

      // Map tasks to stages
      const stageMap: Record<string, { total: number; completed: number; status: string }> = {};
      for (const task of tasks) {
        const cat = task.category || 'other';
        if (!stageMap[cat]) stageMap[cat] = { total: 0, completed: 0, status: 'not_started' };
        stageMap[cat].total++;
        if (task.status === 'completed') stageMap[cat].completed++;
        if (task.status === 'in-progress') stageMap[cat].status = 'in_progress';
      }

      const enrichedStages = IVDR_STAGES.map(s => {
        const data = stageMap[s.key] || {};
        return {
          ...s,
          taskCount: data.total || s.taskCount,
          completedTasks: data.completed || 0,
          status:
            data.total && data.completed === data.total
              ? ('completed' as const)
              : data.status === 'in_progress'
                ? ('in_progress' as const)
                : s.status,
        };
      });

      return { project: ivdrProject, tasks, stages: enrichedStages };
    },
    staleTime: 30_000,
  });

  // Fetch IVDR audit events
  const { data: auditData } = useQuery({
    queryKey: ['ivdr-audit-events'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/ivdr/audit-events?limit=20');
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    },
    staleTime: 30_000,
  });

  const stages = projectData?.stages || IVDR_STAGES;
  const auditEvents: IVDRAuditEvent[] = auditData || [];

  // Derive project ID from submission center query or active workspace project — never hardcoded
  const ivdrProjectId: string | undefined =
    projectData?.project?.id?.toString() || activeProject?.id || undefined;

  // Compute readiness score
  const readinessScore = useMemo(() => {
    const total = stages.reduce((sum: number, s: IVDRWorkplanStage) => sum + s.taskCount, 0);
    const done = stages.reduce((sum: number, s: IVDRWorkplanStage) => sum + s.completedTasks, 0);
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [stages]);

  // ── Feature flag + license gate ──────────────────────────────────────────
  if (!featureFlagEnabled) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Alert variant="destructive">
          <Lock className="h-4 w-4" />
          <AlertDescription>
            The EU IVDR module is not enabled for this environment. Contact your administrator to
            enable the <code>ENABLE_IVDR_MODULE</code> feature flag.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!modulesLoading && !isIvdrEnabled) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Your organization does not have the IVDR module enabled. Please contact your account
            manager to add the EU IVDR module to your subscription.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Return to Hub */}
          <button
            onClick={() => {
              window.location.href = '/concept2cure';
            }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mr-2 border-r pr-3"
          >
            <ChevronLeft className="w-4 h-4" />
            Hub
          </button>
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Microscope className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">EU IVDR Market Access</h1>
            <p className="text-sm text-muted-foreground">
              In Vitro Diagnostic Regulation 2017/746 — Classification, Evidence & Technical
              Documentation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-medium">
            EU IVDR 2017/746
          </Badge>
          {projectData?.project && (
            <Badge variant="secondary" className="text-xs">
              Project #{projectData.project.id}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Readiness Score + Stage Progress ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Readiness Card */}
        <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-indigo-700">Overall Readiness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-indigo-700">{readinessScore}%</div>
            <Progress value={readinessScore} className="mt-2 h-2" />
            <p className="text-xs text-indigo-600 mt-1">
              {stages.filter((s: IVDRWorkplanStage) => s.status === 'completed').length} of{' '}
              {stages.length} stages complete
            </p>
          </CardContent>
        </Card>

        {/* Stage summary cards */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">IVDR Stage Gates</CardTitle>
            <CardDescription className="text-xs">
              7-stage workplan from Classification through Notified Body Readiness
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1">
              {stages.map((stage: IVDRWorkplanStage, i: number) => (
                <React.Fragment key={stage.key}>
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium ${stageStatusColor(stage.status)}`}
                  >
                    {stageStatusIcon(stage.status)}
                    <span className="hidden sm:inline">{stage.shortLabel}</span>
                  </div>
                  {i < stages.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabbed Content ────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-8 w-full max-w-4xl">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="classifier" className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Classification
          </TabsTrigger>
          <TabsTrigger value="analytical" className="flex items-center gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" />
            Analytical
          </TabsTrigger>
          <TabsTrigger value="clinical" className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Clinical
          </TabsTrigger>
          <TabsTrigger value="cdx" className="flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />
            CDx
          </TabsTrigger>
          <TabsTrigger value="binder" className="flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Binder
          </TabsTrigger>
          <TabsTrigger value="packs" className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Packs
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-1.5">
            <FileCheck className="h-3.5 w-3.5" />
            Audit Trail
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ──────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Evidence Checklist */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evidence Checklist</CardTitle>
                <CardDescription>Required deliverables per IVDR Annexes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {stages.map((stage: IVDRWorkplanStage) => (
                  <div key={stage.key} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {stageStatusIcon(stage.status)}
                      <span
                        className={
                          stage.status === 'completed' ? 'line-through text-muted-foreground' : ''
                        }
                      >
                        {stage.label}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {stage.completedTasks}/{stage.taskCount}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
                <CardDescription>Common IVDR workflows</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setActiveTab('classifier')}
                >
                  <Shield className="h-4 w-4 mr-2 text-blue-600" />
                  Run Annex VIII Classification
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setActiveTab('analytical')}
                >
                  <FlaskConical className="h-4 w-4 mr-2 text-purple-600" />
                  Record Validation Parameters
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setActiveTab('clinical')}
                >
                  <BarChart3 className="h-4 w-4 mr-2 text-green-600" />
                  Add Clinical Evidence
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setActiveTab('cdx')}
                >
                  <GitBranch className="h-4 w-4 mr-2 text-orange-600" />
                  Start CDx Workflow
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Sub-module tabs ───────────────────────────────────────────── */}
        <TabsContent value="classifier">
          <IVDRAnnexVIIIClassifier />
        </TabsContent>
        <TabsContent value="analytical">
          <AnalyticalValidationTracker />
        </TabsContent>
        <TabsContent value="clinical">
          <ClinicalEvidenceTracker />
        </TabsContent>
        <TabsContent value="cdx">
          <CDxWorkflow />
        </TabsContent>

        {/* ── Evidence Binder Tab ───────────────────────────────────────── */}
        <TabsContent value="binder" className="mt-4">
          {ivdrProjectId ? (
            <EvidenceBinderTable projectId={ivdrProjectId} />
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Select or create an IVDR project to manage evidence binder.
            </p>
          )}
        </TabsContent>

        {/* ── Pack Builder Tab ──────────────────────────────────────────── */}
        <TabsContent value="packs" className="mt-4">
          {ivdrProjectId ? (
            <PackBuilderPanel projectId={ivdrProjectId} />
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Select or create an IVDR project to build packs.
            </p>
          )}
        </TabsContent>

        {/* ── Audit Trail Tab ───────────────────────────────────────────── */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">IVDR Audit Trail</CardTitle>
              <CardDescription>
                Append-only audit events for this IVDR project (server-generated timestamps)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No audit events recorded yet. Events are created when classifications,
                  validations, or evidence are added or modified.
                </p>
              ) : (
                <div className="space-y-2">
                  {auditEvents.map((evt: IVDRAuditEvent) => (
                    <div
                      key={evt.id}
                      className="flex items-start gap-3 text-sm border-b border-gray-100 pb-2 last:border-0"
                    >
                      <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <FileCheck className="h-3 w-3 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{evt.action}</div>
                        <div className="text-xs text-muted-foreground">
                          {evt.entity} • {evt.user} • {new Date(evt.timestamp).toLocaleString()}
                        </div>
                        {evt.details && (
                          <div className="text-xs text-gray-500 mt-0.5 truncate">{evt.details}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
