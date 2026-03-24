/**
 * SectionWorkspace — The center-of-gravity surface for section-level authoring.
 *
 * Renders the active CTD section with editor, issues, evidence, versions tabs.
 * Passes real AuthoringContextPack to AnA via the parent shell.
 *
 * @module concept2cure/components/workflow/SectionWorkspace
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import {
  FileText,
  AlertTriangle,
  BookOpen,
  History,
  XCircle,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/statesV2';
import {
  WorkspaceHeaderRich,
  WorkspaceTabBar,
  WorkspaceStatusBadge,
  SecondaryInfoItem,
  WORKFLOW_STATUS_CONFIG,
  type WorkspaceTab,
} from '@/components/ui/workspace-primitives';
import type {
  AuthoringContextPack,
  ReadinessSnapshot,
  ContradictionEntry,
} from '../../../../../shared/types/authoring-context';
import { hasSectionContext } from '../../../../../shared/types/authoring-context';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SectionMeta {
  code: string;
  title: string;
  status: 'not-started' | 'drafting' | 'in-review' | 'approved' | 'blocked' | 'locked';
  module: string;
  parentTitle?: string;
  assignee?: string;
  lastEditedBy?: string;
  lastEditedAt?: string;
  wordCount?: number;
  version?: number;
}

export interface SectionIssue {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  source?: string;
}

export interface SectionEvidence {
  id: string;
  title: string;
  source: string;
  type: string;
}

export interface VersionEntry {
  version: number;
  author: string;
  timestamp: string;
  summary: string;
  status: string;
}

interface SectionWorkspaceProps {
  section: SectionMeta;
  content?: string;
  issues?: SectionIssue[];
  evidence?: SectionEvidence[];
  versions?: VersionEntry[];
  onBack: () => void;
  onSave?: (content: string) => void;
  onSubmitForReview?: () => void;
  onApprove?: () => void;
  projectId?: string | number;
  projectName?: string;
  /** Real readiness data from backend — replaces mock when provided */
  readiness?: ReadinessSnapshot;
  /** Real contradiction data from backend — replaces mock when provided */
  contradictions?: ContradictionEntry[];
  /** Callback to update parent's authoring context when section state changes */
  onContextChange?: (ctx: Partial<AuthoringContextPack>) => void;
}

type TabId = 'editor' | 'issues' | 'evidence' | 'versions';

// ─── Component ───────────────────────────────────────────────────────────────

export const SectionWorkspace: React.FC<SectionWorkspaceProps> = ({
  section,
  content: initialContent,
  issues: propIssues,
  evidence: propEvidence,
  versions: propVersions,
  onBack,
  onSave,
  onSubmitForReview,
  projectId,
  projectName,
  readiness,
  contradictions,
  onContextChange,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('editor');
  const [editorContent, setEditorContent] = useState(initialContent || '');
  const [isSaving, setIsSaving] = useState(false);
  const [fetchedIssues, setFetchedIssues] = useState<SectionIssue[] | null>(null);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);

  // Build issues from real contradiction data when available, fallback to props
  const issues: SectionIssue[] = useMemo(() => {
    if (contradictions && contradictions.length > 0) {
      return contradictions.map(c => ({
        id: c.id,
        type: c.type,
        severity: c.severity === 'critical' ? 'critical' : c.severity === 'major' ? 'warning' : 'info',
        description: c.explanation,
        source: 'contradiction-engine',
      }));
    }
    if (fetchedIssues) return fetchedIssues;
    return propIssues || [];
  }, [contradictions, fetchedIssues, propIssues]);

  const evidence = propEvidence || [];
  const versions = propVersions || [];

  // Notify parent of context on mount and section changes
  useEffect(() => {
    if (onContextChange) {
      onContextChange({
        sectionCode: section.code,
        sectionTitle: section.title,
        moduleCode: section.module?.match(/Module (\d)/)?.[1] ? `m${section.module.match(/Module (\d)/)?.[1]}` : undefined,
        workflowStage: 'section-workspace',
        artifactStatus: section.status,
      });
    }
  }, [section.code, section.title, section.module, section.status, onContextChange]);

  // Fetch real issues from contradiction engine when tab is selected
  const fetchRealIssues = useCallback(async () => {
    if (!projectId || fetchedIssues !== null) return;
    setIsLoadingIssues(true);
    try {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/contradictions?sectionCode=${section.code}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.findings)) {
          setFetchedIssues(data.findings.map((f: any) => ({
            id: f.id || `f-${Math.random().toString(36).slice(2)}`,
            type: f.type || f.contradictionType || 'finding',
            severity: f.authorityState === 'blocks_promotion' ? 'critical' : f.severity === 'major' ? 'warning' : 'info',
            description: f.explanation || f.description || f.summary || 'Finding detected',
            source: f.sourceClassification || 'contradiction-engine',
          })));
        }
      }
    } catch {
      // Non-blocking — keep prop issues
    } finally {
      setIsLoadingIssues(false);
    }
  }, [projectId, section.code, fetchedIssues]);

  useEffect(() => {
    if (activeTab === 'issues') {
      fetchRealIssues();
    }
  }, [activeTab, fetchRealIssues]);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(editorContent);
    } finally {
      setIsSaving(false);
    }
  }, [editorContent, onSave]);

  const statusConfig = WORKFLOW_STATUS_CONFIG[section.status] || WORKFLOW_STATUS_CONFIG['not-started'];
  const readinessScore = readiness?.score;
  const isBlocked = readiness?.blocked || issues.some(i => i.severity === 'critical');

  const tabs: WorkspaceTab[] = [
    { id: 'editor', label: 'Editor', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'issues', label: 'Issues', icon: <AlertTriangle className="w-3.5 h-3.5" />, count: issues.length },
    { id: 'evidence', label: 'Evidence', icon: <BookOpen className="w-3.5 h-3.5" />, count: evidence.length },
    { id: 'versions', label: 'Versions', icon: <History className="w-3.5 h-3.5" />, count: versions.length },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* ── Section Header (canonical) ──────────────────────────────────── */}
      <WorkspaceHeaderRich
        title={section.title}
        breadcrumb={section.code}
        onBack={onBack}
        status={statusConfig}
        secondaryInfo={
          <>
            <span className="text-[11px] text-zinc-400">{section.module}</span>
            {projectName && (
              <SecondaryInfoItem>{projectName}</SecondaryInfoItem>
            )}
            {readinessScore != null && (
              <SecondaryInfoItem
                className={cn(
                  'font-medium',
                  readinessScore >= 70 ? 'text-emerald-600' : readinessScore >= 40 ? 'text-amber-600' : 'text-red-600'
                )}
              >
                Readiness: {readinessScore}%
              </SecondaryInfoItem>
            )}
            {isBlocked && (
              <SecondaryInfoItem className="font-medium text-red-600">
                Promotion Blocked
              </SecondaryInfoItem>
            )}
          </>
        }
        actions={
          <>
            {onSave && section.status !== 'locked' && section.status !== 'approved' && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                {isSaving ? <Spinner size="sm" /> : 'Save'}
              </button>
            )}
            {onSubmitForReview && section.status === 'drafting' && !isBlocked && (
              <button
                onClick={onSubmitForReview}
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Submit for Review
              </button>
            )}
          </>
        }
        testId="section-workspace-header"
      />

      {/* ── Tab bar (canonical) ─────────────────────────────────────────── */}
      <WorkspaceTabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        testId="section-workspace-tabs"
      />

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto min-h-0">
        {activeTab === 'editor' && (
          <div className="p-6">
            <textarea
              value={editorContent}
              onChange={e => setEditorContent(e.target.value)}
              readOnly={section.status === 'locked' || section.status === 'approved'}
              placeholder={`Begin drafting ${section.title}...\n\nAnA can help — ask her to "draft section ${section.code}" or "explain what blocks promotion".`}
              className="w-full min-h-[400px] p-4 text-sm text-zinc-800 bg-white border border-zinc-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-zinc-300 font-serif leading-relaxed"
            />
          </div>
        )}

        {activeTab === 'issues' && (
          <div className="p-6 space-y-3">
            {isLoadingIssues && (
              <div className="flex items-center gap-2 text-xs text-zinc-400 py-4">
                <Spinner size="sm" />
                Loading issues from contradiction engine...
              </div>
            )}
            {!isLoadingIssues && issues.length === 0 && (
              <EmptyState
                title="No issues detected"
                description="No issues detected for this section."
                testId="section-issues-empty"
              />
            )}
            {issues.map(issue => (
              <div
                key={issue.id}
                className={cn(
                  'border rounded-lg p-3',
                  issue.severity === 'critical' ? 'border-red-200 bg-red-50' :
                  issue.severity === 'warning' ? 'border-amber-200 bg-amber-50' :
                  'border-zinc-200 bg-zinc-50'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                    issue.severity === 'critical' ? 'bg-red-200 text-red-800' :
                    issue.severity === 'warning' ? 'bg-amber-200 text-amber-800' :
                    'bg-zinc-200 text-zinc-700'
                  )}>
                    {issue.severity}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">{issue.type}</span>
                  {issue.source && (
                    <span className="text-[10px] text-zinc-400 ml-auto">via {issue.source}</span>
                  )}
                </div>
                <p className="text-xs text-zinc-700">{issue.description}</p>
              </div>
            ))}
            {readiness?.blockers && readiness.blockers.length > 0 && (
              <div className="mt-4 pt-4 border-t border-zinc-200">
                <h4 className="text-xs font-semibold text-zinc-600 mb-2">Readiness Blockers</h4>
                {readiness.blockers.map((b, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5">
                    <XCircle className={cn('w-3.5 h-3.5 mt-0.5 flex-shrink-0', b.severity === 'critical' ? 'text-red-500' : 'text-amber-500')} />
                    <div>
                      <span className="text-xs text-zinc-700">{b.message}</span>
                      {b.source && <span className="text-[10px] text-zinc-400 ml-1">({b.source})</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'evidence' && (
          <div className="p-6 space-y-3">
            {evidence.length === 0 && (
              <EmptyState
                title="No evidence linked"
                description="No evidence linked to this section yet."
                testId="section-evidence-empty"
              />
            )}
            {evidence.map(ev => (
              <div key={ev.id} className="border border-zinc-200 rounded-lg p-3 hover:border-zinc-300 transition-colors">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-xs font-medium text-zinc-800">{ev.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-zinc-100 text-zinc-500 rounded font-mono">{ev.type}</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1 ml-5">{ev.source}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'versions' && (
          <div className="p-6 space-y-3">
            {versions.length === 0 && (
              <EmptyState
                title="No version history"
                description="No version history available."
                testId="section-versions-empty"
              />
            )}
            {versions.map(v => (
              <div key={v.version} className="border border-zinc-200 rounded-lg p-3 hover:border-zinc-300 transition-colors">
                <div className="flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-xs font-semibold text-zinc-800">v{v.version}</span>
                  <span className="text-[10px] text-zinc-400">{v.author}</span>
                  <span className="text-[10px] text-zinc-400 ml-auto">{v.timestamp}</span>
                </div>
                <p className="text-[11px] text-zinc-600 mt-1 ml-5">{v.summary}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SectionWorkspace;
