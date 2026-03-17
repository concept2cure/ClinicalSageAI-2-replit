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
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════

const PROGRAMS = [
  { id: 1, name: 'ARX-514 (Oncology)', type: 'IND' as const, status: 'Active', readiness: 82, lastActivity: '2 hours ago' },
  { id: 2, name: 'NVD-201 (Cardiology)', type: 'NDA' as const, status: 'Under Review', readiness: 94, lastActivity: '1 day ago' },
  { id: 3, name: 'CLR-330 (Diagnostics)', type: '510(k)' as const, status: 'Drafting', readiness: 56, lastActivity: '3 hours ago' },
  { id: 4, name: 'BTX-710 (Neurology)', type: 'IND' as const, status: 'Pre-Submission', readiness: 71, lastActivity: '5 hours ago' },
];

const RISK_SIGNALS = [
  { id: 1, severity: 'critical' as const, message: 'CMC Section 3.2.S missing stability data — ARX-514', program: 'ARX-514' },
  { id: 2, severity: 'high' as const, message: 'FDA Type B meeting response overdue by 4 days — NVD-201', program: 'NVD-201' },
  { id: 3, severity: 'high' as const, message: 'Predicate device comparison incomplete — CLR-330', program: 'CLR-330' },
];

const SUBMISSIONS = [
  { id: 1, name: 'ARX-514 IND Original', type: 'IND', agency: 'FDA', status: 'In Progress', readiness: 82, due: '2026-04-15', sections: 12, completed: 9, missing: ['3.2.S.7 Stability', '2.4 Nonclinical Overview', '1.3.1 Cover Letter'], blockers: ['Stability data pending from CRO'] },
  { id: 2, name: 'NVD-201 NDA Module 3', type: 'NDA', agency: 'FDA', status: 'Review', readiness: 94, due: '2026-05-01', sections: 8, completed: 8, missing: [], blockers: ['QA sign-off pending'] },
  { id: 3, name: 'CLR-330 510(k) Substantial Equivalence', type: '510(k)', agency: 'FDA', status: 'Drafting', readiness: 56, due: '2026-06-30', sections: 10, completed: 5, missing: ['Performance Testing', 'Biocompatibility Report', 'Software Documentation', 'Labeling', 'Sterilization Validation'], blockers: ['Predicate comparison not finalized', 'Bench testing in progress'] },
];

const TASKS = [
  { id: 1, title: 'Draft CMC stability protocol', assignee: 'Dr. Patel', column: 'todo' as const, priority: 'high' as const },
  { id: 2, title: 'Update predicate comparison table', assignee: 'M. Chen', column: 'todo' as const, priority: 'critical' as const },
  { id: 3, title: 'Review Module 2.5 summary', assignee: 'S. Williams', column: 'in_progress' as const, priority: 'high' as const },
  { id: 4, title: 'Compile nonclinical references', assignee: 'Dr. Patel', column: 'in_progress' as const, priority: 'medium' as const },
  { id: 5, title: 'Format eCTD Module 1 cover letter', assignee: 'J. Rivera', column: 'review' as const, priority: 'medium' as const },
  { id: 6, title: 'Validate bioanalytical methods section', assignee: 'A. Kumar', column: 'review' as const, priority: 'high' as const },
  { id: 7, title: 'Publish Module 3.2.P Drug Product', assignee: 'S. Williams', column: 'done' as const, priority: 'medium' as const },
  { id: 8, title: 'Finalize QOS for NVD-201', assignee: 'Dr. Patel', column: 'done' as const, priority: 'high' as const },
];

const DOCUMENTS = [
  { id: 1, name: 'ARX-514 Investigators Brochure', type: 'IB', version: '3.1', status: 'Approved', modified: '2026-03-14', owner: 'Dr. Patel' },
  { id: 2, name: 'NVD-201 Clinical Study Report', type: 'CSR', version: '2.0', status: 'Under Review', modified: '2026-03-16', owner: 'S. Williams' },
  { id: 3, name: 'CLR-330 510(k) Summary', type: '510(k)', version: '1.2', status: 'Draft', modified: '2026-03-15', owner: 'M. Chen' },
  { id: 4, name: 'BTX-710 Nonclinical Overview', type: 'Module 2.4', version: '1.0', status: 'Draft', modified: '2026-03-12', owner: 'A. Kumar' },
  { id: 5, name: 'ARX-514 CMC Stability Report', type: 'Module 3.2.S', version: '1.1', status: 'Pending Data', modified: '2026-03-10', owner: 'J. Rivera' },
  { id: 6, name: 'NVD-201 Risk-Benefit Analysis', type: 'Module 2.5', version: '4.0', status: 'Approved', modified: '2026-03-13', owner: 'Dr. Patel' },
];

const MEETINGS = [
  { id: 1, date: '2026-02-10', agency: 'FDA', type: 'Pre-IND', status: 'Completed', program: 'ARX-514', agenda: ['Proposed clinical trial design', 'CMC development plan', 'Nonclinical package sufficiency'], commitments: [{ text: 'Submit revised protocol synopsis', due: '2026-03-15', done: true }, { text: 'Provide additional tox study rationale', due: '2026-04-01', done: false }], actionItems: 3, completedActions: 2 },
  { id: 2, date: '2026-03-05', agency: 'FDA', type: 'Type B', status: 'Completed', program: 'NVD-201', agenda: ['Bioequivalence study design', 'Labeling considerations', 'REMS discussion'], commitments: [{ text: 'Provide updated dissolution data', due: '2026-03-20', done: false }, { text: 'Submit revised labeling draft', due: '2026-04-10', done: false }], actionItems: 4, completedActions: 1 },
  { id: 3, date: '2026-04-20', agency: 'FDA', type: 'Type C', status: 'Scheduled', program: 'CLR-330', agenda: ['Predicate device selection rationale', 'Performance testing approach', 'Clinical data requirements'], commitments: [], actionItems: 0, completedActions: 0 },
];

const TEAM_MEMBERS = [
  { id: 1, name: 'Dr. Anita Patel', role: 'Regulatory Lead', tasks: 6, availability: 'Available', active: true },
  { id: 2, name: 'Sophia Williams', role: 'Clinical Writer', tasks: 4, availability: 'Busy', active: true },
  { id: 3, name: 'Michael Chen', role: 'Quality Specialist', tasks: 3, availability: 'Available', active: true },
  { id: 4, name: 'Juan Rivera', role: 'CMC Specialist', tasks: 5, availability: 'In Meeting', active: false },
  { id: 5, name: 'Arjun Kumar', role: 'Nonclinical Reviewer', tasks: 2, availability: 'Available', active: true },
];

const ANALYTICS_DATA = {
  cycleTime: [
    { phase: 'Drafting', avg: 14 },
    { phase: 'Internal Review', avg: 7 },
    { phase: 'QA Review', avg: 5 },
    { phase: 'Finalization', avg: 3 },
    { phase: 'eCTD Publishing', avg: 2 },
  ],
  quality: [
    { period: 'Q3 2025', deficiencyRate: 12 },
    { period: 'Q4 2025', deficiencyRate: 8 },
    { period: 'Q1 2026', deficiencyRate: 5 },
  ],
  portfolio: { totalPrograms: 4, onTrack: 2, atRisk: 1, delayed: 1, avgReadiness: 76 },
};

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
// SUB-VIEWS
// ═══════════════════════════════════════════════════════════════════

function DashboardView() {
  const metrics = [
    { label: 'Active Submissions', value: '4', icon: Package },
    { label: 'Overall Readiness', value: '76%', icon: Target },
    { label: 'Open Blockers', value: '5', icon: AlertTriangle },
    { label: 'Days to Next Milestone', value: '29', icon: Calendar },
  ];

  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <div className="flex items-center gap-2 mb-1">
              <m.icon className="w-4 h-4 text-zinc-400" />
              <span className="text-xs text-zinc-400">{m.label}</span>
            </div>
            <p className="text-2xl font-semibold text-zinc-900">{m.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <SectionLabel>Active Programs</SectionLabel>
          <Card className="p-0 divide-y divide-zinc-50">
            {PROGRAMS.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={cn('w-2 h-2 rounded-full', STATUS_DOT[p.status])} />
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
        </div>

        <div>
          <SectionLabel>Risk Signals</SectionLabel>
          <div className="space-y-2">
            {RISK_SIGNALS.map((r) => (
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
          <p className="text-[10px] text-zinc-300 mt-3">Powered by Mission Control + Submission Readiness Twin</p>
        </div>
      </div>
    </div>
  );
}

function SubmissionsView() {
  const [selected, setSelected] = useState(0);
  const sub = SUBMISSIONS[selected];

  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <SectionLabel>Submission Packages</SectionLabel>
      <Card className="p-0 divide-y divide-zinc-50">
        {SUBMISSIONS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setSelected(i)}
            className={cn('w-full flex items-center justify-between px-4 py-3 text-left transition-colors', selected === i ? 'bg-zinc-50' : 'hover:bg-zinc-50/50')}
          >
            <div className="flex items-center gap-3">
              <div className={cn('w-2 h-2 rounded-full', STATUS_DOT[s.status])} />
              <div>
                <p className="text-sm font-medium text-zinc-900">{s.name}</p>
                <p className="text-xs text-zinc-400">{s.agency} · Due {s.due}</p>
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

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <SectionLabel>Section Completion</SectionLabel>
          <p className="text-2xl font-semibold text-zinc-900">{sub.completed} / {sub.sections}</p>
          <div className="h-1.5 bg-zinc-100 rounded-full mt-2">
            <div className="h-1.5 bg-zinc-900 rounded-full" style={{ width: `${(sub.completed / sub.sections) * 100}%` }} />
          </div>
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
          {sub.blockers.map((b, i) => (
            <div key={i} className="flex items-start gap-2 mb-2 last:mb-0">
              <AlertTriangle className="w-3 h-3 text-orange-500 mt-0.5 shrink-0" />
              <span className="text-xs text-zinc-600">{b}</span>
            </div>
          ))}
        </Card>
      </div>
      <p className="text-[10px] text-zinc-300">Powered by Submission Ops Command Center</p>
    </div>
  );
}

function WorkflowsView() {
  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <div className="flex items-center justify-between">
        <SectionLabel>Task Board</SectionLabel>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Zap className="w-3 h-3" />
          <span>Last automation sweep: 12 min ago · 3 actions taken</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {COLUMNS.map((col) => {
          const tasks = TASKS.filter((t) => t.column === col.key);
          return (
            <div key={col.key}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-600">{col.label}</span>
                <span className="text-[10px] text-zinc-400 bg-zinc-50 px-1.5 py-0.5 rounded">{tasks.length}</span>
              </div>
              <div className="space-y-2">
                {tasks.map((t) => (
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

      <Card>
        <SectionLabel>Active Workflows</SectionLabel>
        <div className="space-y-3">
          {[
            { name: 'ARX-514 IND Assembly', progress: 68, tasks: '9/13' },
            { name: 'NVD-201 NDA Module 3 Review', progress: 88, tasks: '7/8' },
            { name: 'CLR-330 510(k) Compilation', progress: 42, tasks: '5/12' },
          ].map((wf) => (
            <div key={wf.name} className="flex items-center gap-4">
              <span className="text-xs text-zinc-900 w-56 truncate">{wf.name}</span>
              <div className="flex-1 h-1.5 bg-zinc-100 rounded-full">
                <div className="h-1.5 bg-zinc-900 rounded-full" style={{ width: `${wf.progress}%` }} />
              </div>
              <span className="text-xs text-zinc-400 w-12 text-right">{wf.tasks}</span>
            </div>
          ))}
        </div>
      </Card>
      <p className="text-[10px] text-zinc-300">Powered by Workflow Engine + Task Management + Automation</p>
    </div>
  );
}

function VaultView() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <div className="flex items-center justify-between">
        <SectionLabel>Document Library</SectionLabel>
        <button className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700">
          <Upload className="w-3 h-3" />
          Upload
        </button>
      </div>

      <Card className="p-0">
        <div className="grid grid-cols-[1fr_100px_60px_100px_100px_100px] gap-2 px-4 py-2 border-b border-zinc-50 text-[10px] text-zinc-400 uppercase tracking-wider font-medium">
          <span>Name</span><span>Type</span><span>Ver</span><span>Status</span><span>Modified</span><span>Owner</span>
        </div>
        {DOCUMENTS.map((d) => (
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

      {selected !== null && (
        <Card>
          <SectionLabel>Version History — {DOCUMENTS.find((d) => d.id === selected)?.name}</SectionLabel>
          <div className="space-y-2">
            {[
              { ver: DOCUMENTS.find((d) => d.id === selected)?.version || '1.0', date: '2026-03-14', author: DOCUMENTS.find((d) => d.id === selected)?.owner || '', note: 'Latest revision' },
              { ver: '1.0', date: '2026-02-20', author: DOCUMENTS.find((d) => d.id === selected)?.owner || '', note: 'Initial draft' },
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
      <p className="text-[10px] text-zinc-300">Powered by Document Vault + Document Management</p>
    </div>
  );
}

function NegotiationsView() {
  const [selected, setSelected] = useState(0);
  const meeting = MEETINGS[selected];

  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <SectionLabel>FDA Meeting Timeline</SectionLabel>
      <Card className="p-0 divide-y divide-zinc-50">
        {MEETINGS.map((m, i) => (
          <button
            key={m.id}
            onClick={() => setSelected(i)}
            className={cn('w-full flex items-center justify-between px-4 py-3 text-left transition-colors', selected === i ? 'bg-zinc-50' : 'hover:bg-zinc-50/50')}
          >
            <div className="flex items-center gap-3">
              <div className={cn('w-2 h-2 rounded-full', STATUS_DOT[m.status])} />
              <div>
                <p className="text-sm font-medium text-zinc-900">{m.type} Meeting — {m.program}</p>
                <p className="text-xs text-zinc-400">{m.agency} · {m.date}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Pill text={m.status} className={m.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'} />
              <span className="text-xs text-zinc-400">{m.completedActions}/{m.actionItems} actions</span>
            </div>
          </button>
        ))}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <SectionLabel>Agenda</SectionLabel>
          <ul className="space-y-1.5">
            {meeting.agenda.map((a, i) => (
              <li key={i} className="text-xs text-zinc-600 flex items-start gap-2">
                <span className="text-zinc-300 mt-0.5">—</span>
                {a}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionLabel>Commitments to FDA</SectionLabel>
          {meeting.commitments.length === 0 ? (
            <p className="text-xs text-zinc-400">No commitments yet — meeting is scheduled</p>
          ) : (
            <div className="space-y-2">
              {meeting.commitments.map((c, i) => (
                <div key={i} className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    {c.done ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <Clock className="w-3 h-3 text-orange-500 mt-0.5 shrink-0" />
                    )}
                    <span className={cn('text-xs', c.done ? 'text-zinc-400 line-through' : 'text-zinc-900')}>{c.text}</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 shrink-0">Due {c.due}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <p className="text-[10px] text-zinc-300">Powered by Regulatory Negotiation Logbook</p>
    </div>
  );
}

function TeamView() {
  const activities = [
    { time: '10 min ago', user: 'Dr. Patel', action: 'approved Module 2.5 Risk-Benefit Analysis' },
    { time: '25 min ago', user: 'S. Williams', action: 'uploaded revised Clinical Study Report v2.0' },
    { time: '1 hour ago', user: 'M. Chen', action: 'commented on predicate comparison table' },
    { time: '2 hours ago', user: 'A. Kumar', action: 'started review of nonclinical overview' },
  ];

  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <SectionLabel>Team Members</SectionLabel>
      <Card className="p-0">
        <div className="grid grid-cols-[1fr_140px_80px_100px] gap-2 px-4 py-2 border-b border-zinc-50 text-[10px] text-zinc-400 uppercase tracking-wider font-medium">
          <span>Name</span><span>Role</span><span>Tasks</span><span>Availability</span>
        </div>
        {TEAM_MEMBERS.map((m) => (
          <div key={m.id} className="grid grid-cols-[1fr_140px_80px_100px] gap-2 px-4 py-2.5 border-b border-zinc-50 last:border-0">
            <div className="flex items-center gap-2">
              <div className={cn('w-2 h-2 rounded-full', m.active ? 'bg-emerald-500' : 'bg-zinc-300')} />
              <span className="text-xs font-medium text-zinc-900">{m.name}</span>
            </div>
            <span className="text-xs text-zinc-600">{m.role}</span>
            <span className="text-xs text-zinc-900">{m.tasks} assigned</span>
            <Pill text={m.availability} className={cn(
              m.availability === 'Available' ? 'bg-emerald-50 text-emerald-700' :
              m.availability === 'Busy' ? 'bg-amber-50 text-amber-700' :
              'bg-orange-50 text-orange-700'
            )} />
          </div>
        ))}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <SectionLabel>Reviewer Capacity</SectionLabel>
          <div className="space-y-2">
            {TEAM_MEMBERS.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <span className="text-xs text-zinc-600 w-28 truncate">{m.name.split(' ').slice(-1)[0]}</span>
                <div className="flex-1 h-1.5 bg-zinc-100 rounded-full">
                  <div
                    className={cn('h-1.5 rounded-full', m.tasks > 5 ? 'bg-red-400' : m.tasks > 3 ? 'bg-amber-400' : 'bg-emerald-400')}
                    style={{ width: `${Math.min(100, (m.tasks / 8) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-zinc-400 w-8">{m.tasks}/8</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionLabel>Activity Feed</SectionLabel>
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
        </Card>
      </div>
      <p className="text-[10px] text-zinc-300">Powered by Collaboration Hub + Team Workspace</p>
    </div>
  );
}

function AnalyticsView() {
  const { cycleTime, quality, portfolio } = ANALYTICS_DATA;

  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <SectionLabel>Portfolio Overview</SectionLabel>
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: 'Total Programs', value: portfolio.totalPrograms },
          { label: 'On Track', value: portfolio.onTrack },
          { label: 'At Risk', value: portfolio.atRisk },
          { label: 'Delayed', value: portfolio.delayed },
          { label: 'Avg Readiness', value: `${portfolio.avgReadiness}%` },
        ].map((m) => (
          <Card key={m.label}>
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">{m.label}</p>
            <p className="text-xl font-semibold text-zinc-900">{m.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <SectionLabel>Cycle Time — Average Days per Phase</SectionLabel>
          <div className="space-y-2.5">
            {cycleTime.map((c) => (
              <div key={c.phase} className="flex items-center gap-3">
                <span className="text-xs text-zinc-600 w-32">{c.phase}</span>
                <div className="flex-1 h-2 bg-zinc-100 rounded-full">
                  <div className="h-2 bg-zinc-900 rounded-full" style={{ width: `${(c.avg / 14) * 100}%` }} />
                </div>
                <span className="text-xs font-medium text-zinc-900 w-10 text-right">{c.avg}d</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zinc-400 mt-3">Total avg cycle: {cycleTime.reduce((s, c) => s + c.avg, 0)} days</p>
        </Card>

        <Card>
          <SectionLabel>Quality Trend — Deficiency Rate (%)</SectionLabel>
          <div className="space-y-3">
            {quality.map((q) => (
              <div key={q.period} className="flex items-center justify-between">
                <span className="text-xs text-zinc-600">{q.period}</span>
                <div className="flex items-center gap-2">
                  <div className="w-40 h-2 bg-zinc-100 rounded-full">
                    <div className="h-2 bg-zinc-900 rounded-full" style={{ width: `${(q.deficiencyRate / 15) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium text-zinc-900 w-8 text-right">{q.deficiencyRate}%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            <span className="text-[10px] text-emerald-600">58% improvement in deficiency rate over 3 quarters</span>
          </div>
        </Card>
      </div>

      <Card>
        <SectionLabel>Program Readiness Breakdown</SectionLabel>
        <div className="space-y-2">
          {PROGRAMS.map((p) => (
            <div key={p.id} className="flex items-center gap-4">
              <span className="text-xs text-zinc-900 w-48 truncate font-medium">{p.name}</span>
              <Pill text={p.type} className="bg-zinc-50 text-zinc-600 w-14 justify-center" />
              <div className="flex-1 h-1.5 bg-zinc-100 rounded-full">
                <div
                  className={cn('h-1.5 rounded-full', p.readiness >= 80 ? 'bg-emerald-500' : p.readiness >= 60 ? 'bg-amber-500' : 'bg-red-500')}
                  style={{ width: `${p.readiness}%` }}
                />
              </div>
              <span className="text-xs font-medium text-zinc-900 w-10 text-right">{p.readiness}%</span>
            </div>
          ))}
        </div>
      </Card>
      <p className="text-[10px] text-zinc-300">Powered by Program Analytics + Portfolio Analytics + Reports</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export function CommandCenterHub({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  const content = useMemo(() => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView />;
      case 'submissions': return <SubmissionsView />;
      case 'workflows': return <WorkflowsView />;
      case 'vault': return <VaultView />;
      case 'negotiations': return <NegotiationsView />;
      case 'team': return <TeamView />;
      case 'analytics': return <AnalyticsView />;
    }
  }, [activeTab]);

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
