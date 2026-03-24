import React from 'react';
import { FolderOpen, FileText, ShieldCheck, Send, ChevronRight } from 'lucide-react';

interface ProjectHomeDashboardProps {
  project: {
    id: number;
    name: string;
    type: string;
    description?: string | null;
    sponsor?: string | null;
    product?: string | null;
    region?: string | null;
  };
  onNavigate: (mode: string, sectionCode?: string) => void;
}

const WORKFLOW_STEPS = [
  {
    id: 'dossier',
    label: 'Dossier Map',
    description: 'CTD structure, section status, and completeness',
    icon: FolderOpen,
    color: 'text-blue-600 bg-blue-50',
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'Author, edit, and manage regulatory documents',
    icon: FileText,
    color: 'text-emerald-600 bg-emerald-50',
  },
  {
    id: 'review',
    label: 'Review',
    description: 'Quality gates, approvals, and compliance checks',
    icon: ShieldCheck,
    color: 'text-amber-600 bg-amber-50',
  },
  {
    id: 'submissions',
    label: 'Submissions',
    description: 'Readiness assessment and export',
    icon: Send,
    color: 'text-violet-600 bg-violet-50',
  },
];

export const ProjectHomeDashboard: React.FC<ProjectHomeDashboardProps> = ({
  project,
  onNavigate,
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-zinc-50/50">
      <div className="max-w-4xl mx-auto w-full px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-zinc-900">{project.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-200 text-zinc-700 font-medium">
              {project.type}
            </span>
            {project.region && <span className="text-xs text-zinc-500">{project.region}</span>}
            {project.sponsor && (
              <span className="text-xs text-zinc-500">Sponsor: {project.sponsor}</span>
            )}
          </div>
          {project.description && (
            <p className="text-sm text-zinc-500 mt-2">{project.description}</p>
          )}
        </div>

        {/* Workflow steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {WORKFLOW_STEPS.map(step => {
            const Icon = step.icon;
            return (
              <button
                key={step.id}
                onClick={() => onNavigate(step.id)}
                className="flex items-start gap-4 p-5 rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm transition-all text-left group"
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${step.color}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900">{step.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{step.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ProjectHomeDashboard;
