import React from 'react';
import { ChevronLeft, FileText, Plus, Sparkles } from 'lucide-react';

interface SectionWorkspaceProps {
  section: {
    code: string;
    title: string;
    status: string;
    module: string;
  };
  projectName?: string;
  projectId?: string | null;
  onBack: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-700',
  'in-review': 'bg-amber-100 text-amber-700',
  drafting: 'bg-blue-100 text-blue-700',
  'not-started': 'bg-zinc-100 text-zinc-500',
  blocked: 'bg-red-100 text-red-700',
  locked: 'bg-zinc-100 text-zinc-400',
};

export const SectionWorkspace: React.FC<SectionWorkspaceProps> = ({
  section,
  projectName,
  onBack,
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-11 border-b border-zinc-200 bg-white shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Dossier</span>
        </button>
        <span className="text-zinc-300">/</span>
        <span className="text-xs font-mono text-zinc-400">{section.code}</span>
        <span className="text-sm font-semibold text-zinc-900">{section.title}</span>
        <span
          className={`text-xs px-2 py-0.5 rounded-md font-medium capitalize ${STATUS_COLORS[section.status] || STATUS_COLORS['not-started']}`}
        >
          {section.status.replace('-', ' ')}
        </span>
      </div>

      {/* Section workspace content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 flex items-center justify-center">
            <FileText className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-900 mb-2">
            {section.code} — {section.title}
          </h2>
          <p className="text-sm text-zinc-500 mb-1">{section.module}</p>
          {projectName && <p className="text-xs text-zinc-400 mb-6">{projectName}</p>}
          <div className="flex items-center justify-center gap-3">
            <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
              <Plus className="w-4 h-4" />
              Create Document
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors">
              <Sparkles className="w-4 h-4" />
              Draft with AI
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SectionWorkspace;
