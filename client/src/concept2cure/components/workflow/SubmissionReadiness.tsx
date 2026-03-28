import React, { useMemo } from 'react';
import { Send, PenLine, Check } from 'lucide-react';
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
      issues.push('Continue drafting to complete this section');
    } else if (sec.status === 'internal_review' || sec.status === 'qa_review') {
      status = 'needs-work';
      issues.push('Awaiting reviewer approval — check with assigned reviewer');
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
  const { data: sections, isLoading: sectionsLoading, error } = useQuery<Array<{ code: string; title: string; status: string }>>({
    queryKey: queryKeys.ind.projectSections(projectId || 'none'),
    queryFn: () => apiRequest(`/api/project-sections?projectId=${projectId}`),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // For IND projects: fetch IND section status for complete Module 1-5 readiness
  const upperType = (projectType || '').toUpperCase();
  const isIND = upperType === 'IND' || upperType === 'NDA' || upperType === 'BLA';
  const { data: indStatus } = useQuery<{ sections: Array<{ code: string; title: string; status: string }> }>({
    queryKey: ['concept2cure', 'ind', 'status', projectId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/ind/status/${projectId}`);
      if (!res.ok) return { sections: [] };
      const json = await res.json();
      return json.data || { sections: [] };
    },
    enabled: !!projectId && isIND,
    staleTime: 30_000,
  });

  const isLoading = sectionsLoading;

  const readinessItems = useMemo(() => {
    // IND projects: use IND registry for complete section list
    if (isIND && indStatus?.sections && indStatus.sections.length > 0) {
      return sectionsToReadiness(indStatus.sections);
    }
    if (!sections || sections.length === 0) return [];
    return sectionsToReadiness(sections);
  }, [sections, indStatus, isIND]);

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
                const isReady = item.status === 'ready';
                return (
                  <div
                    key={item.section}
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
                    <div className="flex items-center gap-2 shrink-0">
                      {isReady ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <button
                          onClick={() => onSectionClick(item.section)}
                          className="text-xs font-medium text-violet-600 hover:text-violet-800 flex items-center gap-1"
                          data-testid={`fix-now-${item.section}`}
                        >
                          <PenLine className="w-3 h-3" />
                          Fix Now
                        </button>
                      )}
                      <WorkspaceStatusBadge status={item.status} />
                    </div>
                  </div>
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
