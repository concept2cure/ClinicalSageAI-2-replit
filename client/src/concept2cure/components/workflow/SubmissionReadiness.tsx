import React from 'react';
import { Send } from 'lucide-react';
import {
  WorkspaceHeader,
  WorkspaceCanvas,
  WorkspaceStatusStrip,
  WorkspaceStatusBadge,
  STATUS_ICON_MAP,
  WORKFLOW_STATUS_CONFIG,
} from '@/components/ui/workspace-primitives';

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
      <WorkspaceHeader
        title="Submission Readiness"
        titleIcon={<Send className="w-3.5 h-3.5 text-violet-500" />}
        onBack={onBack}
        typeBadge={projectType}
        testId="submission-readiness-header"
      />

      <WorkspaceCanvas>
        {/* Readiness score */}
        <WorkspaceStatusStrip
          progress={readinessPercent}
          summary={`${readyCount} of ${totalCount} sections ready`}
        >
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              {projectName || 'Submission'} — Readiness
            </h2>
          </div>
          <button
            onClick={onExport}
            disabled={readinessPercent < 100}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
            Export Package
          </button>
        </WorkspaceStatusStrip>

        {/* Section checklist */}
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden divide-y divide-zinc-100">
          {READINESS_ITEMS.map(item => {
            const statusInfo = STATUS_ICON_MAP[item.status] || STATUS_ICON_MAP['not-started'];
            const Icon = statusInfo.icon;
            return (
              <button
                key={item.section}
                onClick={() => onSectionClick(item.section)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors text-left"
              >
                <Icon className={`w-4 h-4 mt-0.5 ${statusInfo.color}`} />
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
                <WorkspaceStatusBadge status={item.status} />
              </button>
            );
          })}
        </div>
      </WorkspaceCanvas>
    </div>
  );
};

export default SubmissionReadiness;
