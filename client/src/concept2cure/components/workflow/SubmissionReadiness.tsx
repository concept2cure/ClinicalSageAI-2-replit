import React, { useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Send, PenLine, Check, RefreshCw, FileText, AlertTriangle, Clock, FilePlus, ArrowRight } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { DataStateWrapper, SkeletonTable } from '@/components/ui/statesV2';
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
  onSectionClick: (sectionCode: string, sectionTitle?: string) => void;
  onBack: () => void;
  onExport: () => void;
}

interface ReadinessItem {
  section: string;
  title: string;
  status: 'ready' | 'needs-work' | 'blocked' | 'not-started';
  issues?: string[];
  /** The raw backend status for richer remediation guidance */
  rawStatus: string;
  /** Specific remediation action label for the Fix Now button */
  fixAction: string;
  /** Whether an artifact exists for this section */
  hasArtifact: boolean;
}

/** Map project section statuses to readiness items with rich remediation guidance */
function sectionsToReadiness(
  sections: Array<{ code: string; title: string; status: string }>,
  artifacts?: Array<{ ctdSection?: string; status?: string }>
): ReadinessItem[] {
  const artifactBySection = new Map<string, { status?: string }>();
  if (artifacts) {
    for (const a of artifacts) {
      if (a.ctdSection) artifactBySection.set(a.ctdSection, a);
    }
  }

  return sections.map(sec => {
    let status: ReadinessItem['status'] = 'not-started';
    const issues: string[] = [];
    let fixAction = 'Fix Now';
    const artifact = artifactBySection.get(sec.code);
    const hasArtifact = !!artifact;

    if (sec.status === 'approved' || sec.status === 'locked' || sec.status === 'signed') {
      status = 'ready';
      fixAction = 'View';
    } else if (sec.status === 'blocked') {
      status = 'blocked';
      issues.push('Section is blocked — resolve dependencies before this section can proceed');
      if (!hasArtifact) {
        issues.push('No artifact created yet — create the document first');
        fixAction = 'Create';
      } else {
        fixAction = 'Unblock';
      }
    } else if (sec.status === 'drafting') {
      status = 'needs-work';
      issues.push('Document is still in draft — complete the content and advance to review');
      fixAction = 'Continue Draft';
    } else if (sec.status === 'data_gathering') {
      status = 'needs-work';
      issues.push('Awaiting data — gather required evidence and source documents');
      fixAction = 'Add Data';
    } else if (sec.status === 'revision') {
      status = 'needs-work';
      issues.push('Section returned for revision — address reviewer feedback and resubmit');
      fixAction = 'Revise';
    } else if (sec.status === 'internal_review') {
      status = 'needs-work';
      issues.push('In internal review — waiting for reviewer approval');
      fixAction = 'Check Review';
    } else if (sec.status === 'qa_review') {
      status = 'needs-work';
      issues.push('In QA review — waiting for quality team sign-off');
      fixAction = 'Check QA';
    } else {
      // not-started
      if (!hasArtifact) {
        issues.push('No document exists for this section — create it to get started');
        fixAction = 'Create';
      } else {
        issues.push('Section not started — open the document and begin drafting');
        fixAction = 'Start';
      }
    }

    return {
      section: sec.code,
      title: sec.title,
      status,
      issues: issues.length > 0 ? issues : undefined,
      rawStatus: sec.status,
      fixAction,
      hasArtifact,
    };
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
  const queryClient = useQueryClient();
  type ProjectSectionRow = {
    section_code: string;
    title: string;
    status: string;
  };

  const { data: sections, isLoading: sectionsLoading, error, isFetching: sectionsFetching, refetch } = useQuery<Array<{ code: string; title: string; status: string }>>({
    queryKey: queryKeys.ind.projectSections(projectId || 'none'),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/project-sections?project_id=${projectId}`);
      const payload = await res.json();
      const rows: ProjectSectionRow[] = Array.isArray(payload?.sections)
        ? payload.sections
        : Array.isArray(payload)
          ? payload
          : [];
      return rows.map(row => ({
        code: row.section_code,
        title: row.title,
        status: row.status,
      }));
    },
    enabled: !!projectId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  // Fetch artifacts for this project to know which sections have documents
  const { data: projectArtifacts } = useQuery<Array<{ id: string; ctdSection?: string; status?: string }>>({
    queryKey: queryKeys.submission.projectArtifacts(projectId || 'none'),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts`);
      const json = await res.json();
      return json?.data || json || [];
    },
    enabled: !!projectId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  // For IND projects: fetch IND section status for complete Module 1-5 readiness
  const upperType = (projectType || '').toUpperCase();
  const isIND = upperType === 'IND' || upperType === 'NDA' || upperType === 'BLA';
  const isDevice = upperType === '510K' || upperType === 'PMA' || upperType === 'DE_NOVO' || upperType === 'CER';
  const { data: indStatus } = useQuery<{ sections: Array<{ code: string; title: string; status: string }> }>({
    queryKey: queryKeys.ind.status(projectId || 'none'),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/ind-generation/status/${projectId}`);
      const json = await res.json();
      return json.data || { sections: [] };
    },
    enabled: !!projectId && isIND,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  // For device projects: fetch device section readiness
  const { data: deviceStatus } = useQuery<{ sections: Array<{ code: string; title: string; status: string }> }>({
    queryKey: queryKeys.device.status(upperType, projectId || 'none'),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/ind-generation/device-status/${upperType}/${projectId}`);
      const json = await res.json();
      return json.data || { sections: [] };
    },
    enabled: !!projectId && isDevice,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const isLoading = sectionsLoading;
  const isRefreshing = sectionsFetching && !sectionsLoading;

  const readinessItems = useMemo(() => {
    const arts = projectArtifacts || [];
    // Device projects: use device registry
    if (isDevice && deviceStatus?.sections && deviceStatus.sections.length > 0) {
      return sectionsToReadiness(deviceStatus.sections, arts);
    }
    // IND projects: use IND registry for complete section list
    if (isIND && indStatus?.sections && indStatus.sections.length > 0) {
      return sectionsToReadiness(indStatus.sections, arts);
    }
    if (!sections || sections.length === 0) return [];
    return sectionsToReadiness(sections, arts);
  }, [sections, indStatus, deviceStatus, isIND, isDevice, projectArtifacts]);

  const readyCount = readinessItems.filter(i => i.status === 'ready').length;
  const totalCount = readinessItems.length;
  const needsWorkCount = readinessItems.filter(i => i.status === 'needs-work').length;
  const blockedCount = readinessItems.filter(i => i.status === 'blocked').length;
  const notStartedCount = readinessItems.filter(i => i.status === 'not-started').length;
  const readinessPercent = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;

  /** Refresh all readiness data */
  const handleRefresh = useCallback(() => {
    if (!projectId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.ind.projectSections(projectId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.submission.projectArtifacts(projectId) });
    if (isIND) queryClient.invalidateQueries({ queryKey: queryKeys.ind.status(projectId) });
    if (isDevice) queryClient.invalidateQueries({ queryKey: queryKeys.device.status(upperType, projectId) });
  }, [queryClient, projectId, isIND, isDevice, upperType]);

  /** Handle Fix Now — navigate to section and schedule a refresh for when user returns */
  const handleFixNow = useCallback((sectionCode: string, sectionTitle: string) => {
    onSectionClick(sectionCode, sectionTitle);
    // When user returns (window focus), queries will auto-refetch due to refetchOnWindowFocus
  }, [onSectionClick]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-stone-50/50">
      <WorkspaceHeader
        title="Submission Readiness"
        titleIcon={<Send className="w-3.5 h-3.5 text-stone-900" />}
        onBack={onBack}
        typeBadge={projectType}
        testId="submission-readiness-header"
      />

      <DataStateWrapper
        data={readinessItems}
        isLoading={isLoading && !!projectId}
        error={error}
        retry={refetch}
        emptyTitle="No submission sections"
        emptyDescription="No sections found yet. Start by creating documents for your CTD sections, then return here to track submission readiness."
        loadingComponent={<SkeletonTable rows={6} columns={3} />}
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
                {/* Status breakdown */}
                <div className="flex items-center gap-3 mt-1">
                  {readyCount > 0 && (
                    <span className="text-[11px] text-stone-700 font-medium">{readyCount} ready</span>
                  )}
                  {needsWorkCount > 0 && (
                    <span className="text-[11px] text-stone-600 font-medium">{needsWorkCount} in progress</span>
                  )}
                  {blockedCount > 0 && (
                    <span className="text-[11px] text-stone-700 font-medium">{blockedCount} blocked</span>
                  )}
                  {notStartedCount > 0 && (
                    <span className="text-[11px] text-stone-400 font-medium">{notStartedCount} not started</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Refresh button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  title="Refresh readiness status"
                  aria-label={isRefreshing ? 'Refreshing readiness status' : 'Refresh readiness status'}
                  className="inline-flex items-center gap-1.5 h-auto text-stone-600 text-sm font-medium hover:bg-stone-100 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </Button>
                {readinessPercent >= 100 && (
                  <span className="text-xs text-stone-700 font-medium">✓ All sections ready</span>
                )}
                <Button
                  variant="default"
                  size="sm"
                  onClick={onExport}
                  disabled={readinessPercent < 100}
                  title={readinessPercent < 100
                    ? `Complete all required sections before exporting (${totalCount - readyCount} remaining)`
                    : 'Export eCTD submission package (XML + documents)'}
                  aria-label="Export submission package"
                  data-testid="export-package-btn"
                  className="inline-flex items-center gap-2 h-auto bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="w-3.5 h-3.5" />
                  Export Package
                </Button>
              </div>
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
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-stone-50 transition-colors text-left group"
                  >
                    <Icon className={`w-4 h-4 mt-0.5 ${statusInfo.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-stone-400">{item.section}</span>
                        <span className="text-sm font-medium text-stone-900">{item.title}</span>
                        {!item.hasArtifact && item.status !== 'ready' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 font-medium">
                            No document
                          </span>
                        )}
                      </div>
                      {item.issues && item.issues.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {item.issues.map((issue, i) => (
                            <p key={i} className="text-xs text-stone-500 flex items-start gap-1">
                              {item.status === 'blocked' ? (
                                <AlertTriangle className="w-3 h-3 mt-0.5 text-stone-400 shrink-0" />
                              ) : item.status === 'needs-work' ? (
                                <Clock className="w-3 h-3 mt-0.5 text-stone-400 shrink-0" />
                              ) : (
                                <FileText className="w-3 h-3 mt-0.5 text-stone-300 shrink-0" />
                              )}
                              {issue}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isReady ? (
                        <span className="flex items-center gap-1 text-xs text-stone-700">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleFixNow(item.section, item.title)}
                          className="inline-flex items-center gap-1 h-auto text-xs text-white bg-stone-800 hover:bg-stone-900 transition-colors shadow-sm"
                          data-testid={`fix-now-${item.section}`}
                        >
                          {!item.hasArtifact ? (
                            <FilePlus className="w-3 h-3" />
                          ) : (
                            <PenLine className="w-3 h-3" />
                          )}
                          {item.fixAction}
                          <ArrowRight className="w-3 h-3 opacity-60" />
                        </Button>
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
