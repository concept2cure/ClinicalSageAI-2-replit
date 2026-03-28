import React, { useMemo } from 'react';
import { Send } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { DataStateWrapper } from '@/components/ui/statesV2';
import {
  WorkspaceHeader,
  WorkspaceCanvas,
  WorkspaceStatusStrip,
  WorkspaceStatusBadge,
  STATUS_ICON_MAP,
} from '@/components/ui/workspace-primitives';

interface SubmissionReadinessProps {
  projectId?: string | number;
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

/** Map project section statuses to readiness items */
function sectionsToReadiness(sections: Array<{ code: string; title: string; status: string }>): ReadinessItem[] {
  return sections.map(sec => {
    let status: ReadinessItem['status'] = 'not-started';
    const issues: string[] = [];

    if (sec.status === 'approved' || sec.status === 'locked' || sec.status === 'signed') {
      status = 'ready';
    } else if (sec.status === 'blocked') {
      status = 'blocked';
      issues.push('Section is blocked — resolve blockers before proceeding');
    } else if (sec.status === 'drafting' || sec.status === 'data_gathering' || sec.status === 'revision') {
      status = 'needs-work';
      issues.push(`Section is in ${sec.status.replace('_', ' ')} status`);
    } else if (sec.status === 'internal_review' || sec.status === 'qa_review') {
      status = 'needs-work';
      issues.push('Pending review approval');
    }

    return { section: sec.code, title: sec.title, status, issues: issues.length > 0 ? issues : undefined };
  });
}

export const SubmissionReadiness: React.FC<SubmissionReadinessProps> = ({
  projectId,
  projectName,
  projectType,
  onSectionClick,
  onBack,
  onExport,
}) => {
  const { data: sections, isLoading, error } = useQuery<Array<{ code: string; title: string; status: string }>>({
    queryKey: queryKeys.ind.projectSections(projectId || 'none'),
    queryFn: () => apiRequest(`/api/project-sections?projectId=${projectId}`),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const readinessItems = useMemo(() => {
    if (!sections || sections.length === 0) return [];
    return sectionsToReadiness(sections);
  }, [sections]);

  const readyCount = readinessItems.filter(i => i.status === 'ready').length;
  const totalCount = readinessItems.length;
  const readinessPercent = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-stone-50/50">
      <WorkspaceHeader
        title="Submission Readiness"
        titleIcon={<Send className="w-3.5 h-3.5 text-violet-500" />}
        onBack={onBack}
        typeBadge={projectType}
        testId="submission-readiness-header"
      />

      <DataStateWrapper
        data={readinessItems}
        isLoading={isLoading && !!projectId}
        error={error}
        emptyDescription="No sections initialized — initialize project sections first"
      >
        {(items) => (
          <WorkspaceCanvas>
            {/* Readiness score */}
            <WorkspaceStatusStrip
              progress={readinessPercent}
              summary={`${readyCount} of ${totalCount} sections ready`}
            >
              <div>
                <h2 className="text-lg font-semibold text-stone-900">
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
            <div className="rounded-xl border border-stone-200 bg-white overflow-hidden divide-y divide-stone-100">
              {items.map(item => {
                const statusInfo = STATUS_ICON_MAP[item.status] || STATUS_ICON_MAP['not-started'];
                const Icon = statusInfo.icon;
                return (
                  <button
                    key={item.section}
                    onClick={() => onSectionClick(item.section)}
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-stone-50 transition-colors text-left"
                  >
                    <Icon className={`w-4 h-4 mt-0.5 ${statusInfo.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-stone-400">{item.section}</span>
                        <span className="text-sm font-medium text-stone-900">{item.title}</span>
                      </div>
                      {item.issues && item.issues.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {item.issues.map((issue, i) => (
                            <p key={i} className="text-xs text-stone-500">
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
        )}
      </DataStateWrapper>
    </div>
  );
};

export default SubmissionReadiness;
