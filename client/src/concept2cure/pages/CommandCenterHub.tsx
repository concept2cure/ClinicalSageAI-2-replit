/**
 * Command Center Hub — Unified Regulatory Operations Workspace
 *
 * Wraps Mission Control + Submission Ops + additional operational
 * capabilities into one coherent hub with 7 sub-views:
 *   Dashboard, Submissions, Workflows, Document Vault,
 *   Negotiations, Team, Analytics
 */
import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useDeliverable } from '@/concept2cure/hooks/useDeliverable';
import { useProjects } from '@/concept2cure/hooks/useProjects';
import { useProjectTasks } from '@/concept2cure/hooks/useProjectTasks';
import { useQuery } from '@tanstack/react-query';
import { GenerateButton, ExportButton, RunButton } from '@/concept2cure/components/ui/ActionButton';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileText,
  FolderOpen,
  Handshake,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Package,
  Plus,
  Search,
  Settings,
  Target,
  TrendingUp,
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type TabKey = 'dashboard' | 'submissions' | 'workflows' | 'vault' | 'negotiations' | 'team' | 'analytics';

interface Tab { key: TabKey; label: string; icon: React.ElementType }

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const TABS: Tab[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'submissions', label: 'Submissions', icon: Package },
  { key: 'workflows', label: 'Workflows', icon: ListChecks },
  { key: 'vault', label: 'Document Vault', icon: FolderOpen },
  { key: 'negotiations', label: 'Negotiations', icon: Handshake },
  { key: 'team', label: 'Team', icon: Users },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
];

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

const SEVERITY_STYLES = {
  critical: 'text-red-600 bg-red-50',
  high: 'text-orange-600 bg-orange-50',
  medium: 'text-amber-600 bg-amber-50',
  low: 'text-zinc-500 bg-zinc-50',
};

const STATUS_DOT: Record<string, string> = {
  'Active': 'bg-emerald-500',
  'Under Review': 'bg-blue-500',
  'Drafting': 'bg-amber-500',
  'Pre-Submission': 'bg-zinc-400',
  'In Progress': 'bg-blue-500',
  'Review': 'bg-amber-500',
  'Approved': 'bg-emerald-500',
  'Draft': 'bg-zinc-400',
  'Pending Data': 'bg-orange-500',
  'Completed': 'bg-emerald-500',
  'Scheduled': 'bg-blue-500',
  'Available': 'bg-emerald-500',
  'Busy': 'bg-amber-500',
  'In Meeting': 'bg-orange-500',
};

const COLUMNS = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
] as const;

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function Pill({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full', className)}>
      {text}
    </span>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-zinc-100 rounded-lg p-4', className)}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-3">{children}</p>;
}

// ═══════════════════════════════════════════════════════════════════
// DATA HOOK — Fetches real data from APIs
// ═══════════════════════════════════════════════════════════════════

function useCommandCenterData() {
  const { projects, isLoading: isLoadingProjects } = useProjects();

  // Fetch artifact summary
  const { data: artifactSummary } = useQuery({
    queryKey: ['/api/concept2cure/projects/all/artifacts-summary'],
  });

  // Fetch all artifacts across projects
  const { data: artifactsData } = useQuery({
    queryKey: ['/api/concept2cure/artifacts'],
  });

  // Fetch audit logs for activity feed
  const { data: auditData } = useQuery({
    queryKey: ['/api/concept2cure/audit-logs', { limit: 20 }],
    queryFn: () => fetch('/api/concept2cure/audit-logs?limit=20').then(r => r.json()),
  });

  // Fetch pending reviews
  const { data: reviewsData } = useQuery({
    queryKey: ['/api/concept2cure/reviews/pending'],
  });

  // Transform projects into programs format
  const programs = (projects || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    type: p.submissionType || 'IND',
    status: p.status === 'active' ? 'Active' : p.status === 'completed' ? 'Completed' : 'Drafting',
    readiness: p.completionPercentage || 0,
    lastActivity: p.updatedAt ? formatTimeAgo(p.updatedAt) : 'No activity',
  }));

  // Transform artifacts into documents format
  const documents = ((artifactsData as any)?.data || []).slice(0, 10).map((a: any) => ({
    id: a.artifactId || a.id,
    name: a.title,
    type: a.type || 'Document',
    version: String(a.version || '1.0'),
    status: a.status === 'approved' ? 'Approved' : a.status === 'review' ? 'Under Review' : a.status === 'locked' ? 'Approved' : 'Draft',
    modified: a.updatedAt ? new Date(a.updatedAt).toLocaleDateString() : '',
    owner: a.createdByName || 'System',
  }));

  // Derive risk signals from pending reviews
  const riskSignals = ((reviewsData as any)?.data?.assignments || []).slice(0, 5).map((r: any, i: number) => ({
    id: i + 1,
    severity: r.status === 'pending' ? 'high' as const : 'medium' as const,
    message: `Review pending: ${r.artifactTitle || 'Untitled'} (v${r.artifactVersion || 1})`,
    program: '',
  }));

  // Get summary metrics
  const summary = (artifactSummary as any)?.data || { total: 0, draft: 0, review: 0, approved: 0 };

  // Activity feed from audit logs
  const activities = ((auditData as any)?.data?.logs || []).slice(0, 6).map((l: any) => ({
    time: l.timestamp ? formatTimeAgo(l.timestamp) : '',
    user: l.userName || 'System',
    action: `${l.action || 'updated'} ${l.entityType || 'item'}`,
  }));

  const isLoading = isLoadingProjects;

  return { programs, documents, riskSignals, summary, activities, isLoading };
}

// ═══════════════════════════════════════════════════════════════════
// SUB-VIEWS
// ═══════════════════════════════════════════════════════════════════

function DashboardView({ programs, riskSignals, summary, isLoading }: {
  programs: any[];
  riskSignals: any[];
  summary: { total: number; draft: number; review: number; approved: number };
  isLoading: boolean;
}) {
  const { generate, isGenerating } = useDeliverable();

  const totalPrograms = programs.length;
  const avgReadiness = totalPrograms > 0
    ? Math.round(programs.reduce((s, p) => s + (p.readiness || 0), 0) / totalPrograms)
    : 0;

  const metrics = [
    { label: 'Active Submissions', value: String(totalPrograms), icon: Package },
    { label: 'Overall Readiness', value: totalPrograms > 0 ? `${avgReadiness}%` : '—', icon: Target },
    { label: 'Open Reviews', value: String(riskSignals.length), icon: AlertTriangle },
    { label: 'Documents', value: String(summary.total), icon: FileText },
  ];

  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <SectionLabel>Mission Control Overview</SectionLabel>
        <div className="flex items-center gap-2">
          <ExportButton label="Export Executive Summary" produces="Executive Dashboard Report (PDF)" isLoading={isGenerating} onClick={() => generate({ endpoint: '/api/concept2cure/reports/executive-dashboard', method: 'POST', body: {}, filename: 'Executive_Dashboard.pdf', format: 'pdf', title: 'Executive Dashboard' })} />
          <GenerateButton label="Generate Risk Report" produces="Risk Escalation Report (PDF)" isLoading={isGenerating} onClick={() => generate({ endpoint: '/api/concept2cure/reports/risk-escalation', method: 'POST', body: {}, filename: 'Risk_Escalation_Report.pdf', format: 'pdf', title: 'Risk Escalation Report' })} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <div className="flex items-center gap-2 mb-1">
              <m.icon className="w-4 h-4 text-zinc-400" />
              <span className="text-xs text-zinc-400">{m.label}</span>
            </div>
            <p className="text-2xl font-semibold text-zinc-900">{isLoading ? '...' : m.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <SectionLabel>Active Programs</SectionLabel>
          {programs.length === 0 ? (
            <Card className="py-12 text-center">
              <Package className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No programs yet</p>
              <p className="text-xs text-zinc-400 mt-1">Create projects to see your active regulatory programs here.</p>
            </Card>
          ) : (
            <Card className="p-0 divide-y divide-zinc-50">
              {programs.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-2 h-2 rounded-full', STATUS_DOT[p.status] || 'bg-zinc-400')} />
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{p.name}</p>
                      <p className="text-xs text-zinc-400">{p.lastActivity}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Pill text={p.type} className="bg-zinc-50 text-zinc-600" />
                    <div className="w-24">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-zinc-400">Readiness</span>
                        <span className="text-xs font-medium text-zinc-900">{p.readiness}%</span>
                      </div>
                      <div className="h-1 bg-zinc-100 rounded-full">
                        <div className="h-1 bg-zinc-900 rounded-full" style={{ width: `${p.readiness}%` }} />
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-300" />
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div>
          <SectionLabel>Risk Signals</SectionLabel>
          {riskSignals.length === 0 ? (
            <Card className="py-12 text-center">
              <CheckCircle2 className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No risk signals</p>
              <p className="text-xs text-zinc-400 mt-1">Pending reviews and risks will appear here.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {riskSignals.map((r) => (
                <Card key={r.id} className="p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn('w-4 h-4 mt-0.5 shrink-0', r.severity === 'critical' ? 'text-red-500' : 'text-orange-500')} />
                    <div>
                      <p className="text-xs font-medium text-zinc-900 leading-snug">{r.message}</p>
                      <Pill text={r.severity} className={cn('mt-1', SEVERITY_STYLES[r.severity])} />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          <p className="text-[10px] text-zinc-300 mt-3">Powered by Mission Control + Submission Readiness Twin</p>
        </div>
      </div>
    </div>
  );
}

function SubmissionsView({ programs }: { programs: any[] }) {
  const { generate, isGenerating } = useDeliverable();
  const [selected, setSelected] = useState(0);

  // Map programs into a submissions-like shape
  const submissions = programs.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    agency: 'FDA',
    status: p.status,
    readiness: p.readiness,
    due: '',
    sections: 0,
    completed: 0,
    missing: [] as string[],
    blockers: [] as string[],
  }));

  const sub = submissions[selected] || null;

  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <SectionLabel>Submission Packages</SectionLabel>
        <div className="flex items-center gap-2">
          <GenerateButton label="Generate Submission Checklist" produces="Filing Checklist (DOCX)" isLoading={isGenerating} onClick={() => generate({ endpoint: '/api/concept2cure/reports/submission-checklist', method: 'POST', body: {}, filename: 'Submission_Checklist.docx', format: 'docx', title: 'Submission Checklist' })} />
          <GenerateButton label="Generate Gap Closure Plan" produces="Gap Closure Action Plan (DOCX)" isLoading={isGenerating} onClick={() => generate({ endpoint: '/api/concept2cure/reports/gap-closure', method: 'POST', body: {}, filename: 'Gap_Closure_Plan.docx', format: 'docx', title: 'Gap Closure Plan' })} />
          <RunButton label="Compile eCTD Package" produces="eCTD Submission Package (ZIP)" isLoading={isGenerating} onClick={() => generate({ endpoint: '/api/ectd/compile', method: 'POST', body: {}, filename: 'eCTD_Package.zip', format: 'zip', title: 'eCTD Package' })} />
        </div>
      </div>

      {submissions.length === 0 ? (
        <Card className="py-12 text-center">
          <Package className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No submissions yet</p>
          <p className="text-xs text-zinc-400 mt-1">Create projects to track your regulatory submissions here.</p>
        </Card>
      ) : (
        <>
          <Card className="p-0 divide-y divide-zinc-50">
            {submissions.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setSelected(i)}
                className={cn('w-full flex items-center justify-between px-4 py-3 text-left transition-colors', selected === i ? 'bg-zinc-50' : 'hover:bg-zinc-50/50')}
              >
                <div className="flex items-center gap-3">
                  <div className={cn('w-2 h-2 rounded-full', STATUS_DOT[s.status] || 'bg-zinc-400')} />
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{s.name}</p>
                    <p className="text-xs text-zinc-400">{s.agency}{s.due ? ` · Due ${s.due}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Pill text={s.type} className="bg-zinc-50 text-zinc-600" />
                  <Pill text={s.status} className={cn(STATUS_DOT[s.status] === 'bg-emerald-500' ? 'bg-emerald-50 text-emerald-700' : STATUS_DOT[s.status] === 'bg-blue-500' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700')} />
                  <span className="text-sm font-medium text-zinc-900 w-10 text-right">{s.readiness}%</span>
                </div>
              </button>
            ))}
          </Card>

          {sub && (
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <SectionLabel>Section Completion</SectionLabel>
                {sub.sections > 0 ? (
                  <>
                    <p className="text-2xl font-semibold text-zinc-900">{sub.completed} / {sub.sections}</p>
                    <div className="h-1.5 bg-zinc-100 rounded-full mt-2">
                      <div className="h-1.5 bg-zinc-900 rounded-full" style={{ width: `${(sub.completed / sub.sections) * 100}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-zinc-400">No sections defined yet</p>
                )}
              </Card>

              <Card>
                <SectionLabel>Missing Documents</SectionLabel>
                {sub.missing.length === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm">All complete</span>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {sub.missing.map((m, i) => (
                      <li key={i} className="text-xs text-zinc-600 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
                        {m}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <SectionLabel>Blockers</SectionLabel>
                {sub.blockers.length === 0 ? (
                  <p className="text-xs text-zinc-400">No blockers identified</p>
                ) : (
                  sub.blockers.map((b, i) => (
                    <div key={i} className="flex items-start gap-2 mb-2 last:mb-0">
                      <AlertTriangle className="w-3 h-3 text-orange-500 mt-0.5 shrink-0" />
                      <span className="text-xs text-zinc-600">{b}</span>
                    </div>
                  ))
                )}
              </Card>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-zinc-300">Powered by Submission Ops Command Center</p>
    </div>
  );
}

function WorkflowsView({ firstProjectId }: { firstProjectId: string | null }) {
  const { generate, isGenerating } = useDeliverable();
  const { tasks: rawTasks, isLoadingTasks } = useProjectTasks(firstProjectId);

  // Map task statuses to column keys
  const tasks = (rawTasks || []).map((t: any) => ({
    id: t.id,
    title: t.name || t.title,
    assignee: t.assigneeName || '',
    column: t.status === 'todo' ? 'todo' as const
      : t.status === 'in-progress' ? 'in_progress' as const
      : t.status === 'review' ? 'review' as const
      : t.status === 'done' ? 'done' as const
      : t.status === 'blocked' ? 'todo' as const
      : 'todo' as const,
    priority: (t.priority === 'urgent' ? 'critical' : t.priority || 'medium') as 'critical' | 'high' | 'medium' | 'low',
  }));

  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <div className="flex items-center justify-between">
        <SectionLabel>Task Board</SectionLabel>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ExportButton label="Export Status Report" produces="Workflow Status Report (PDF)" isLoading={isGenerating} onClick={() => generate({ endpoint: '/api/concept2cure/reports/workflow-status', method: 'POST', body: {}, filename: 'Workflow_Status_Report.pdf', format: 'pdf', title: 'Workflow Status Report' })} />
            <RunButton label="Run Automation Sweep" produces="Automated task execution" isLoading={isGenerating} onClick={() => generate({ endpoint: '/api/concept2cure/automation/sweep', method: 'POST', body: {}, filename: 'sweep.json', format: 'json', title: 'Automation Sweep', saveOnly: true })} />
          </div>
        </div>
      </div>

      {tasks.length === 0 && !isLoadingTasks ? (
        <Card className="py-12 text-center">
          <ListChecks className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No tasks yet</p>
          <p className="text-xs text-zinc-400 mt-1">Create projects and add tasks to see your workflow board here.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.column === col.key);
            return (
              <div key={col.key}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-zinc-600">{col.label}</span>
                  <span className="text-[10px] text-zinc-400 bg-zinc-50 px-1.5 py-0.5 rounded">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((t) => (
                    <Card key={t.id} className="p-3">
                      <p className="text-xs font-medium text-zinc-900 mb-2 leading-snug">{t.title}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-zinc-400">{t.assignee}</span>
                        <Pill text={t.priority} className={SEVERITY_STYLES[t.priority]} />
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-zinc-300">Powered by Workflow Engine + Task Management + Automation</p>
    </div>
  );
}

function VaultView({ documents }: { documents: any[] }) {
  const { generate, isGenerating } = useDeliverable();
  const [selected, setSelected] = useState<number | string | null>(null);

  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <div className="flex items-center justify-between">
        <SectionLabel>Document Vault</SectionLabel>
        <div className="flex items-center gap-2">
          <GenerateButton label="Generate Version Comparison" produces="Document Version Comparison (HTML)" isLoading={isGenerating} onClick={() => generate({ endpoint: '/api/concept2cure/reports/version-diff', method: 'POST', body: {}, filename: 'Version_Comparison.html', format: 'html', title: 'Version Comparison' })} />
          <GenerateButton label="Export Vault Manifest" produces="Vault Manifest with SHA-256 hashes (JSON)" isLoading={isGenerating} onClick={() => generate({ endpoint: '/api/concept2cure/vault/manifest', method: 'POST', body: { includeHashes: true }, filename: 'Vault_Manifest.json', format: 'json', title: 'Vault Manifest' })} />
          <button className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700">
            <Upload className="w-3 h-3" />
            Upload
          </button>
        </div>
      </div>

      {/* Vault stats strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Documents', value: documents.length, color: 'text-zinc-900' },
          { label: 'Approved', value: documents.filter(d => d.status === 'Approved').length, color: 'text-emerald-600' },
          { label: 'Under Review', value: documents.filter(d => d.status === 'Under Review').length, color: 'text-blue-600' },
          { label: 'Draft', value: documents.filter(d => d.status === 'Draft' || d.status === 'Pending Data').length, color: 'text-amber-600' },
        ].map(s => (
          <Card key={s.label} className="p-3 text-center">
            <div className={cn('text-lg font-semibold', s.color)}>{s.value}</div>
            <div className="text-[10px] text-zinc-400 uppercase tracking-wider">{s.label}</div>
          </Card>
        ))}
      </div>

      {documents.length === 0 ? (
        <Card className="py-12 text-center">
          <FolderOpen className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No documents yet</p>
          <p className="text-xs text-zinc-400 mt-1">Create projects and generate artifacts to populate the document vault.</p>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="grid grid-cols-[1fr_100px_60px_100px_100px_100px] gap-2 px-4 py-2 border-b border-zinc-50 text-[10px] text-zinc-400 uppercase tracking-wider font-medium">
            <span>Name</span><span>Type</span><span>Ver</span><span>Status</span><span>Modified</span><span>Owner</span>
          </div>
          {documents.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(selected === d.id ? null : d.id)}
              className={cn('w-full grid grid-cols-[1fr_100px_60px_100px_100px_100px] gap-2 px-4 py-2.5 text-left border-b border-zinc-50 last:border-0 transition-colors', selected === d.id ? 'bg-zinc-50' : 'hover:bg-zinc-50/50')}
            >
              <span className="text-xs font-medium text-zinc-900 flex items-center gap-2">
                <FileText className="w-3 h-3 text-zinc-400" />
                {d.name}
              </span>
              <span className="text-xs text-zinc-600">{d.type}</span>
              <span className="text-xs text-zinc-600">v{d.version}</span>
              <span className="text-xs">
                <Pill text={d.status} className={cn(
                  d.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' :
                  d.status === 'Under Review' ? 'bg-blue-50 text-blue-700' :
                  d.status === 'Pending Data' ? 'bg-orange-50 text-orange-700' :
                  'bg-zinc-50 text-zinc-600'
                )} />
              </span>
              <span className="text-xs text-zinc-400">{d.modified}</span>
              <span className="text-xs text-zinc-600">{d.owner}</span>
            </button>
          ))}
        </Card>
      )}

      {selected !== null && documents.length > 0 && (
        <Card>
          <SectionLabel>Version History — {documents.find((d) => d.id === selected)?.name}</SectionLabel>
          <div className="space-y-2">
            {[
              { ver: documents.find((d) => d.id === selected)?.version || '1.0', date: documents.find((d) => d.id === selected)?.modified || '', author: documents.find((d) => d.id === selected)?.owner || '', note: 'Latest revision' },
              { ver: '1.0', date: '', author: documents.find((d) => d.id === selected)?.owner || '', note: 'Initial draft' },
            ].map((v, i) => (
              <div key={i} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-zinc-900">v{v.ver}</span>
                  <span className="text-xs text-zinc-400">{v.date}</span>
                  <span className="text-xs text-zinc-600">{v.author}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{v.note}</span>
                  <button className="text-zinc-400 hover:text-zinc-600">
                    <Download className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <p className="text-[10px] text-zinc-300">21 CFR Part 11 Compliant · SHA-256 Content Hashing · Full Audit Trail</p>
    </div>
  );
}

function NegotiationsView() {
  const { generate, isGenerating } = useDeliverable();

  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <div className="flex items-center justify-between">
        <SectionLabel>FDA Meeting Timeline</SectionLabel>
        <div className="flex items-center gap-2">
          <GenerateButton label="Generate Meeting Package" produces="FDA Meeting Request + Briefing Document (DOCX)" isLoading={isGenerating} onClick={() => generate({ endpoint: '/api/concept2cure/reports/meeting-package', method: 'POST', body: {}, filename: 'FDA_Meeting_Package.docx', format: 'docx', title: 'FDA Meeting Package' })} />
          <ExportButton label="Export Commitments" produces="Commitment Tracker (XLSX)" isLoading={isGenerating} onClick={() => generate({ endpoint: '/api/concept2cure/reports/commitments-export', method: 'POST', body: {}, filename: 'FDA_Commitments_Tracker.xlsx', format: 'xlsx', title: 'FDA Commitments Tracker' })} />
        </div>
      </div>

      <Card className="py-12 text-center">
        <Handshake className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
        <p className="text-sm text-zinc-500">No FDA meetings recorded yet</p>
        <p className="text-xs text-zinc-400 mt-1">Use AnA to schedule and track agency interactions.</p>
      </Card>

      <p className="text-[10px] text-zinc-300">Powered by Regulatory Negotiation Logbook</p>
    </div>
  );
}

function TeamView({ activities }: { activities: { time: string; user: string; action: string }[] }) {
  const { generate, isGenerating } = useDeliverable();

  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <div className="flex items-center justify-between">
        <SectionLabel>Team Members</SectionLabel>
        <div className="flex items-center gap-2">
          <ExportButton label="Export Capacity Report" produces="Team Capacity Report (PDF)" isLoading={isGenerating} onClick={() => generate({ endpoint: '/api/concept2cure/reports/team-capacity', method: 'POST', body: {}, filename: 'Team_Capacity_Report.pdf', format: 'pdf', title: 'Team Capacity Report' })} />
          <ExportButton label="Export Activity Log" produces="Activity Log (CSV)" isLoading={isGenerating} onClick={() => generate({ endpoint: '/api/concept2cure/reports/activity-log', method: 'POST', body: {}, filename: 'Activity_Log.csv', format: 'csv', title: 'Activity Log' })} />
        </div>
      </div>

      <Card className="py-12 text-center">
        <Users className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
        <p className="text-sm text-zinc-500">Team members will appear here when collaboration features are configured</p>
        <p className="text-xs text-zinc-400 mt-1">Invite team members and assign roles to see capacity and availability.</p>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <div />
        <Card>
          <SectionLabel>Activity Feed</SectionLabel>
          {activities.length === 0 ? (
            <div className="text-center py-4">
              <Activity className="w-6 h-6 text-zinc-300 mx-auto mb-1" />
              <p className="text-xs text-zinc-400">No recent activity</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Activity className="w-3 h-3 text-zinc-300 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-zinc-600">
                      <span className="font-medium text-zinc-900">{a.user}</span> {a.action}
                    </p>
                    <p className="text-[10px] text-zinc-400">{a.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <p className="text-[10px] text-zinc-300">Powered by Collaboration Hub + Team Workspace</p>
    </div>
  );
}

function AnalyticsView({ programs, summary }: {
  programs: any[];
  summary: { total: number; draft: number; review: number; approved: number };
}) {
  const { generate, isGenerating } = useDeliverable();

  const totalPrograms = programs.length;
  const avgReadiness = totalPrograms > 0
    ? Math.round(programs.reduce((s, p) => s + (p.readiness || 0), 0) / totalPrograms)
    : 0;

  // Derive on-track / at-risk from readiness
  const onTrack = programs.filter(p => p.readiness >= 70).length;
  const atRisk = programs.filter(p => p.readiness >= 40 && p.readiness < 70).length;
  const delayed = programs.filter(p => p.readiness < 40).length;

  const portfolio = [
    { label: 'Total Programs', value: totalPrograms },
    { label: 'On Track', value: onTrack },
    { label: 'At Risk', value: atRisk },
    { label: 'Delayed', value: delayed },
    { label: 'Avg Readiness', value: totalPrograms > 0 ? `${avgReadiness}%` : '—' },
  ];

  const artifactBreakdown = [
    { label: 'Total Artifacts', value: summary.total },
    { label: 'Draft', value: summary.draft },
    { label: 'In Review', value: summary.review },
    { label: 'Approved', value: summary.approved },
  ];

  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <div className="flex items-center justify-between">
        <SectionLabel>Portfolio Overview</SectionLabel>
        <div className="flex items-center gap-2">
          <ExportButton label="Export Analytics Report" produces="Program Analytics Report (PDF)" isLoading={isGenerating} onClick={() => generate({ endpoint: '/api/concept2cure/reports/program-analytics', method: 'POST', body: {}, filename: 'Program_Analytics.pdf', format: 'pdf', title: 'Program Analytics' })} />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {portfolio.map((m) => (
          <Card key={m.label}>
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">{m.label}</p>
            <p className="text-xl font-semibold text-zinc-900">{m.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <SectionLabel>Artifact Breakdown</SectionLabel>
          {summary.total === 0 ? (
            <div className="text-center py-6">
              <BarChart3 className="w-6 h-6 text-zinc-300 mx-auto mb-1" />
              <p className="text-xs text-zinc-400">No artifacts yet. Create projects and artifacts to see analytics.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {artifactBreakdown.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600 w-32">{item.label}</span>
                  <div className="flex-1 h-2 bg-zinc-100 rounded-full">
                    <div className="h-2 bg-zinc-900 rounded-full" style={{ width: summary.total > 0 ? `${(item.value / summary.total) * 100}%` : '0%' }} />
                  </div>
                  <span className="text-xs font-medium text-zinc-900 w-10 text-right">{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionLabel>Program Readiness Distribution</SectionLabel>
          {programs.length === 0 ? (
            <div className="text-center py-6">
              <Target className="w-6 h-6 text-zinc-300 mx-auto mb-1" />
              <p className="text-xs text-zinc-400">Create projects to see readiness metrics here.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {programs.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600 w-32 truncate">{p.name}</span>
                  <div className="flex-1 h-2 bg-zinc-100 rounded-full">
                    <div className="h-2 bg-zinc-900 rounded-full" style={{ width: `${p.readiness}%` }} />
                  </div>
                  <span className="text-xs font-medium text-zinc-900 w-10 text-right">{p.readiness}%</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <p className="text-[10px] text-zinc-300">Powered by Program Analytics + Portfolio Analytics + Reports</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export function CommandCenterHub({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const { programs, documents, riskSignals, summary, activities, isLoading } = useCommandCenterData();

  // Get the first project ID for workflows tab
  const firstProjectId = programs.length > 0 ? String(programs[0].id) : null;

  const content = useMemo(() => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView programs={programs} riskSignals={riskSignals} summary={summary} isLoading={isLoading} />;
      case 'submissions': return <SubmissionsView programs={programs} />;
      case 'workflows': return <WorkflowsView firstProjectId={firstProjectId} />;
      case 'vault': return <VaultView documents={documents} />;
      case 'negotiations': return <NegotiationsView />;
      case 'team': return <TeamView activities={activities} />;
      case 'analytics': return <AnalyticsView programs={programs} summary={summary} />;
    }
  }, [activeTab, programs, documents, riskSignals, summary, activities, isLoading, firstProjectId]);

  return (
    <div className="fixed inset-0 z-50 bg-[#FAFAF9] flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-100 bg-white">
        <div className="flex items-center gap-3">
          <Target className="w-4 h-4 text-zinc-900" />
          <h1 className="text-sm font-semibold text-zinc-900">Command Center</h1>
          <span className="text-xs text-zinc-400">Regulatory Operations Hub</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-1.5 rounded hover:bg-zinc-50 text-zinc-400 hover:text-zinc-600 transition-colors">
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-zinc-50 text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-zinc-100 bg-white">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                isActive
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {content}
      </div>

      {/* ── CSS animation keyframe ── */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default CommandCenterHub;
