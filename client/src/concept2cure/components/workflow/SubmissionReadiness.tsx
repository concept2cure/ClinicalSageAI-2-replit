import React from 'react';
import { ChevronLeft, CheckCircle, AlertTriangle, Clock, Send, FileText } from 'lucide-react';

interface SubmissionReadinessProps {
  projectName?: string;
  projectType?: string;
  onSectionClick: (sectionCode: string) => void;
  onBack: () => void;
  onExport: () => void;
}

interface ReadinessItem {
  section: string;
  title: string;
  status: 'ready' | 'needs-work' | 'blocked' | 'not-started';
  issues?: string[];
}

const READINESS_ITEMS: ReadinessItem[] = [
  { section: '1.1', title: 'Administrative Forms', status: 'ready' },
  { section: '1.2', title: 'Cover Letter', status: 'ready' },
  {
    section: '2.5',
    title: 'Clinical Overview',
    status: 'needs-work',
    issues: ['Missing efficacy summary'],
  },
  { section: '3.2.S', title: 'Drug Substance', status: 'ready' },
  {
    section: '3.2.P',
    title: 'Drug Product',
    status: 'needs-work',
    issues: ['Stability data incomplete'],
  },
  {
    section: '5.3',
    title: 'Clinical Study Reports',
    status: 'blocked',
    issues: ['CSR not finalized'],
  },
];

const STATUS_CONFIG = {
  ready: { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50', label: 'Ready' },
  'needs-work': {
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-50',
    label: 'Needs Work',
  },
  blocked: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50', label: 'Blocked' },
  'not-started': { icon: Clock, color: 'text-zinc-400', bg: 'bg-zinc-50', label: 'Not Started' },
};

export const SubmissionReadiness: React.FC<SubmissionReadinessProps> = ({
  projectName,
  projectType,
  onSectionClick,
  onBack,
  onExport,
}) => {
  const readyCount = READINESS_ITEMS.filter(i => i.status === 'ready').length;
  const totalCount = READINESS_ITEMS.length;
  const readinessPercent = Math.round((readyCount / totalCount) * 100);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-zinc-50/50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-11 border-b border-zinc-200 bg-white shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <span className="text-zinc-300">/</span>
        <Send className="w-3.5 h-3.5 text-violet-500" />
        <span className="text-sm font-semibold text-zinc-900">Submission Readiness</span>
        {projectType && (
          <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 font-medium ml-2">
            {projectType}
          </span>
        )}
      </div>

      <div className="max-w-3xl mx-auto w-full px-6 py-6 space-y-6">
        {/* Readiness score */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                {projectName || 'Submission'} — Readiness
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {readyCount} of {totalCount} sections ready
              </p>
            </div>
            <button
              onClick={onExport}
              disabled={readinessPercent < 100}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
              Export Package
            </button>
          </div>
          <div className="w-full bg-zinc-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${readinessPercent >= 80 ? 'bg-emerald-500' : readinessPercent >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
              style={{ width: `${readinessPercent}%` }}
            />
          </div>
        </div>

        {/* Section checklist */}
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden divide-y divide-zinc-100">
          {READINESS_ITEMS.map(item => {
            const config = STATUS_CONFIG[item.status];
            const Icon = config.icon;
            return (
              <button
                key={item.section}
                onClick={() => onSectionClick(item.section)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors text-left"
              >
                <Icon className={`w-4 h-4 mt-0.5 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-zinc-400">{item.section}</span>
                    <span className="text-sm font-medium text-zinc-900">{item.title}</span>
                  </div>
                  {item.issues && item.issues.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {item.issues.map((issue, i) => (
                        <p key={i} className="text-xs text-zinc-500">
                          • {issue}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-medium ${config.bg} ${config.color}`}
                >
                  {config.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SubmissionReadiness;
