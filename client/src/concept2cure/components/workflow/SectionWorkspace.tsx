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
import { FileText, AlertTriangle, BookOpen, History, XCircle, PenLine, FilePlus, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  /** Opens the full document editor for the existing artifact */
  onOpenInEditor?: () => void;
  /** Creates a new draft document for this section and opens the editor */
  onCreateDraft?: () => void;
}

type TabId = 'editor' | 'issues' | 'evidence' | 'versions';

// ─── Component ───────────────────────────────────────────────────────────────

export const SectionWorkspace: React.FC<SectionWorkspaceProps> = ({
  section,
  issues: propIssues,
  evidence: propEvidence,
  versions: propVersions,
  onBack,
  onSubmitForReview,
  projectId,
  projectName,
  readiness,
  contradictions,
  onContextChange,
  onOpenInEditor,
  onCreateDraft,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('editor'); // 'editor' tab now shows section overview, not a textarea
  const [fetchedIssues, setFetchedIssues] = useState<SectionIssue[] | null>(null);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);

  // Build issues from real contradiction data when available, fallback to props
  const issues: SectionIssue[] = useMemo(() => {
    if (contradictions && contradictions.length > 0) {
      return contradictions.map(c => ({
        id: c.id,
        type: c.type,
        severity:
          c.severity === 'critical' ? 'critical' : c.severity === 'major' ? 'warning' : 'info',
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
        moduleCode: section.module?.match(/Module (\d)/)?.[1]
          ? `m${section.module.match(/Module (\d)/)?.[1]}`
          : undefined,
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
      const res = await apiRequest(
        'POST',
        '/api/governed-intelligence/contradictions/search',
        {
          projectId,
          sectionCode: section.code,
          page: 1,
          pageSize: 50,
        }
      );
      if (res.ok) {
        const data = await res.json();
        const findings = data?.data?.items ?? data?.items ?? data?.findings ?? [];
        if (Array.isArray(findings)) {
          setFetchedIssues(
            findings.map((f: any) => ({
              id: f.id || `f-${Math.random().toString(36).slice(2)}`,
              type: f.type || f.contradictionType || 'finding',
              severity:
                f.authorityState === 'blocks_promotion'
                  ? 'critical'
                  : f.severity === 'major'
                    ? 'warning'
                    : 'info',
              description: f.explanation || f.description || f.summary || 'Finding detected',
              source: f.sourceClassification || 'contradiction-engine',
            }))
          );
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

  const statusConfig =
    WORKFLOW_STATUS_CONFIG[section.status] || WORKFLOW_STATUS_CONFIG['not-started'];
  const readinessScore = readiness?.score;
  const isBlocked = readiness?.blocked || issues.some(i => i.severity === 'critical');

  const tabs: WorkspaceTab[] = [
    { id: 'editor', label: 'Overview', icon: <FileText className="w-3.5 h-3.5" /> },
    {
      id: 'issues',
      label: 'Issues',
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      count: issues.length,
    },
    {
      id: 'evidence',
      label: 'Evidence',
      icon: <BookOpen className="w-3.5 h-3.5" />,
      count: evidence.length,
    },
    {
      id: 'versions',
      label: 'Versions',
      icon: <History className="w-3.5 h-3.5" />,
      count: versions.length,
    },
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
            <span className="text-[11px] text-stone-400">{section.module}</span>
            {projectName && <SecondaryInfoItem>{projectName}</SecondaryInfoItem>}
            {readinessScore != null && (
              <SecondaryInfoItem
                className={cn(
                  'font-medium',
                  readinessScore >= 70
                    ? 'text-emerald-600'
                    : readinessScore >= 40
                      ? 'text-amber-600'
                      : 'text-red-600'
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
            {onOpenInEditor && (
              <Button onClick={onOpenInEditor} variant="default" size="sm" className="gap-1.5">
                <PenLine className="h-3.5 w-3.5" />
                Open in Editor
              </Button>
            )}
            {!onOpenInEditor && onCreateDraft && section.status === 'not-started' && (
              <Button onClick={onCreateDraft} variant="default" size="sm" className="gap-1.5">
                <FilePlus className="h-3.5 w-3.5" />
                Create Draft
              </Button>
            )}
            {onSubmitForReview && section.status === 'drafting' && !isBlocked && (
              <Button onClick={onSubmitForReview} variant="default" size="sm">
                Submit for Review
              </Button>
            )}
          </>
        }
        testId="section-workspace-header"
      />

      {/* ── Tab bar (canonical) ─────────────────────────────────────────── */}
      <WorkspaceTabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={id => setActiveTab(id as TabId)}
        testId="section-workspace-tabs"
      />

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto min-h-0">
        {activeTab === 'editor' && (
          <div className="p-4 space-y-4">
            {/* Section cockpit — status, readiness, and primary action */}
            {onOpenInEditor ? (
              /* Document exists — route to full editor */
              <div className="rounded-xl border border-stone-200 bg-white p-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 shrink-0">
                    <PenLine className="h-5 w-5 text-stone-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-stone-900 mb-0.5">
                      Document linked to this section
                    </h3>
                    <p className="text-xs text-stone-500 mb-3">
                      Rich text editing, compliance scanning, comments, and version history available in the full editor.
                    </p>
                    <Button onClick={onOpenInEditor} variant="default" size="sm" className="gap-1.5">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open in Full Editor
                    </Button>
                  </div>
                </div>
              </div>
            ) : section.status === 'not-started' && onCreateDraft ? (
              /* No document — clean creation decision */
              <div className="rounded-xl border border-dashed border-stone-200 bg-white/80 p-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-50">
                  <FilePlus className="h-5 w-5 text-stone-400" />
                </div>
                <h3 className="text-sm font-semibold text-stone-900 mb-1">
                  Start Section {section.code}
                </h3>
                <p className="text-xs text-stone-500 mb-4 max-w-sm mx-auto">
                  Create a document to begin drafting. AnA can help with content, or start from a template.
                </p>
                <Button onClick={onCreateDraft} variant="default" size="sm" className="gap-1.5">
                  <FilePlus className="h-3.5 w-3.5" />
                  Create Document
                </Button>
              </div>
            ) : (
              /* Section exists but no explicit editor link — guide user */
              <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-4 text-center">
                <p className="text-xs text-stone-500">
                  Use the Issues, Evidence, and Versions tabs to review this section.
                  {section.status !== 'locked' && section.status !== 'approved' && (
                    <> Ask AnA to &quot;draft section {section.code}&quot; to generate content.</>
                  )}
                </p>
              </div>
            )}

            {/* Quick readiness summary — always visible in the cockpit */}
            {(readinessScore != null || isBlocked || issues.length > 0) && (
              <div className="rounded-lg border border-stone-200 bg-white p-4">
                <h4 className="text-xs font-semibold text-stone-600 mb-2">Section Status</h4>
                <div className="flex items-center gap-4 text-xs">
                  {readinessScore != null && (
                    <span className={cn(
                      'font-semibold',
                      readinessScore >= 70 ? 'text-emerald-600' : readinessScore >= 40 ? 'text-amber-600' : 'text-red-600'
                    )}>
                      Readiness: {readinessScore}%
                    </span>
                  )}
                  {issues.length > 0 && (
                    <span className="text-stone-500">
                      {issues.filter(i => i.severity === 'critical').length} critical · {issues.length} total issues
                    </span>
                  )}
                  {isBlocked && (
                    <span className="font-semibold text-red-600">Promotion blocked</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'issues' && (
          <div className="p-4 space-y-3">
            {isLoadingIssues && (
              <div className="flex items-center gap-2 text-xs text-stone-400 py-4">
                <Spinner size="sm" />
                Loading issues from contradiction engine...
              </div>
            )}
            {!isLoadingIssues && issues.length === 0 && (
              <EmptyState
                title="Looking good"
                description="No compliance issues or contradictions found. Issues will appear here automatically as you draft."
                testId="section-issues-empty"
              />
            )}
            {issues.map(issue => (
              <div
                key={issue.id}
                className={cn(
                  'border rounded-lg p-3',
                  issue.severity === 'critical'
                    ? 'border-red-200 bg-red-50'
                    : issue.severity === 'warning'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-stone-200 bg-stone-50'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={cn(
                      'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                      issue.severity === 'critical'
                        ? 'bg-red-200 text-red-800'
                        : issue.severity === 'warning'
                          ? 'bg-amber-200 text-amber-800'
                          : 'bg-stone-200 text-stone-700'
                    )}
                  >
                    {issue.severity}
                  </span>
                  <span className="text-[10px] text-stone-400 font-mono">{issue.type}</span>
                  {issue.source && (
                    <span className="text-[10px] text-stone-400 ml-auto">via {issue.source}</span>
                  )}
                </div>
                <p className="text-xs text-stone-700">{issue.description}</p>
              </div>
            ))}
            {readiness?.blockers && readiness.blockers.length > 0 && (
              <div className="mt-4 pt-4 border-t border-stone-200">
                <h4 className="text-xs font-semibold text-stone-600 mb-2">Readiness Blockers</h4>
                {readiness.blockers.map((b, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5">
                    <XCircle
                      className={cn(
                        'w-3.5 h-3.5 mt-0.5 flex-shrink-0',
                        b.severity === 'critical' ? 'text-red-500' : 'text-amber-500'
                      )}
                    />
                    <div>
                      <span className="text-xs text-stone-700">{b.message}</span>
                      {b.source && (
                        <span className="text-[10px] text-stone-400 ml-1">({b.source})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'evidence' && (
          <div className="p-4 space-y-3">
            {evidence.length === 0 && (
              <EmptyState
                title="No evidence linked yet"
                description="Link source documents, clinical data, or references to support this section. Evidence can be attached from the editor's Data Room panel."
                testId="section-evidence-empty"
              />
            )}
            {evidence.map(ev => (
              <div
                key={ev.id}
                className="border border-stone-200 rounded-lg p-3 hover:border-stone-300 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-stone-400" />
                  <span className="text-xs font-medium text-stone-800">{ev.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded font-mono">
                    {ev.type}
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 mt-1 ml-5">{ev.source}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'versions' && (
          <div className="p-4 space-y-3">
            {versions.length === 0 && (
              <EmptyState
                title="No versions yet"
                description="Version history will build automatically as you save drafts and advance through review stages."
                testId="section-versions-empty"
              />
            )}
            {versions.map(v => (
              <div
                key={v.version}
                className="border border-stone-200 rounded-lg p-3 hover:border-stone-300 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-stone-400" />
                  <span className="text-xs font-semibold text-stone-800">v{v.version}</span>
                  <span className="text-[10px] text-stone-400">{v.author}</span>
                  <span className="text-[10px] text-stone-400 ml-auto">{v.timestamp}</span>
                </div>
                <p className="text-[11px] text-stone-600 mt-1 ml-5">{v.summary}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SectionWorkspace;
