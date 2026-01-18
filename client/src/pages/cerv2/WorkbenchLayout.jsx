import React from 'react';
import { Link } from 'wouter';
import { FileText, Link2, Download, Activity } from 'lucide-react';
import { useWorkbenchSummary } from '../../hooks/useCERv2Queries';

const NavItem = ({ href, label, icon: Icon, isActive, badge }) => (
  <Link href={href}>
    <a
      className={`relative flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
        isActive
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
          : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
      {badge && (
        <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
          isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
        }`}>
          {badge}
        </span>
      )}
    </a>
  </Link>
);

const WorkflowStep = ({ number, title, description, complete }) => (
  <div className="flex items-start gap-3">
    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
      complete ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
    }`}>
      {complete ? '✓' : number}
    </div>
    <div className="flex-1 min-w-0">
      <div className={`text-sm font-medium ${
        complete ? 'text-slate-900' : 'text-slate-600'
      }`}>
        {title}
      </div>
      <div className="text-xs text-slate-500 mt-0.5">{description}</div>
    </div>
  </div>
);

export default function WorkbenchLayout({ programId, view, header, children }) {
  const { data } = useWorkbenchSummary(programId, { enabled: Boolean(programId) });
  const summary = data?.data || { evidenceCount: 0, linksCount: 0, exportsCount: 0 };

  const hasEvidence = summary.evidenceCount > 0;
  const hasLinks = summary.linksCount > 0;
  const hasExports = summary.exportsCount > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/cerv2">
                <a className="text-sm font-semibold text-blue-600 hover:text-blue-700">← CERv2</a>
              </Link>
              <div className="h-4 w-px bg-slate-300"></div>
              <div>
                <div className="text-lg font-bold text-slate-900">{header}</div>
                <div className="text-xs text-slate-500">Program: {programId}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Left Sidebar */}
          <aside className="space-y-6">
            {/* Main Navigation */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Workbench
              </div>
              <div className="space-y-1">
                <NavItem
                  href={`/cerv2/workbench/${programId}/evidence`}
                  label="Evidence"
                  icon={FileText}
                  isActive={view === 'evidence'}
                  badge={summary.evidenceCount ? String(summary.evidenceCount) : null}
                />
                <NavItem
                  href={`/cerv2/workbench/${programId}/claims`}
                  label="Link Evidence"
                  icon={Link2}
                  isActive={view === 'claims' || view === 'standards' || view === 'outcomes'}
                  badge={summary.linksCount ? String(summary.linksCount) : null}
                />
                <NavItem
                  href={`/cerv2/workbench/${programId}/exports`}
                  label="Generate Exports"
                  icon={Download}
                  isActive={view === 'exports'}
                  badge={summary.exportsCount ? String(summary.exportsCount) : null}
                />
                <NavItem
                  href={`/cerv2/workbench/${programId}/audit`}
                  label="Audit Trail"
                  icon={Activity}
                  isActive={view === 'audit'}
                />
              </div>
            </div>

            {/* Workflow Guide */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                Workflow
              </div>
              <div className="space-y-4">
                <WorkflowStep
                  number={1}
                  title="Upload Evidence"
                  description="Add your study files and documents"
                  complete={hasEvidence}
                />
                <WorkflowStep
                  number={2}
                  title="Link Evidence"
                  description="Connect files to claims & standards"
                  complete={hasLinks}
                />
                <WorkflowStep
                  number={3}
                  title="Generate Export"
                  description="Create regulatory deliverable"
                  complete={hasExports}
                />
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
