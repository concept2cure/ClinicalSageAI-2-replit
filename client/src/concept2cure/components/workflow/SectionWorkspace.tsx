/**
 * SectionWorkspace — The center-of-gravity surface for section-level authoring.
 *
 * Renders the active CTD section with editor, issues, evidence, versions tabs.
 * Passes real AuthoringContextPack to AnA via the parent shell.
 *
 * @module concept2cure/components/workflow/SectionWorkspace
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  FileText,
  AlertTriangle,
  BookOpen,
  History,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Lock,
  ChevronRight,
} from 'lucide-react';
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

// ─── Status badge helpers ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  'not-started': { label: 'Not Started', color: 'bg-zinc-100 text-zinc-600', icon: <Clock className="w-3 h-3" /> },
  drafting: { label: 'Drafting', color: 'bg-blue-100 text-blue-700', icon: <FileText className="w-3 h-3" /> },
  'in-review': { label: 'In Review', color: 'bg-amber-100 text-amber-700', icon: <AlertTriangle className="w-3 h-3" /> },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  blocked: { label: 'Blocked', color: 'bg-red-100 text-red-700', icon: <XCircle className="w-3 h-3" /> },
  locked: { label: 'Locked', color: 'bg-purple-100 text-purple-700', icon: <Lock className="w-3 h-3" /> },
};

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
      const token = sessionStorage.getItem('trialsage_access_token') || localStorage.getItem('trialsage_access_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/concept2cure/projects/${projectId}/contradictions?sectionCode=${section.code}`, { headers });
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

  const statusConfig = STATUS_CONFIG[section.status] || STATUS_CONFIG['not-started'];

  // Readiness bar
  const readinessScore = readiness?.score;
  const isBlocked = readiness?.blocked || issues.some(i => i.severity === 'critical');

  const tabs: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'editor', label: 'Editor', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'issues', label: 'Issues', icon: <AlertTriangle className="w-3.5 h-3.5" />, count: issues.length },
    { id: 'evidence', label: 'Evidence', icon: <BookOpen className="w-3.5 h-3.5" />, count: evidence.length },
    { id: 'versions', label: 'Versions', icon: <History className="w-3.5 h-3.5" />, count: versions.length },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* ── Section Header ────────────────────────────────────────────── */}
      <div className="border-b border-zinc-100 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-400 hover:text-zinc-700"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-400">{section.code}</span>
              <ChevronRight className="w-3 h-3 text-zinc-300" />
              <h2 className="text-sm font-semibold text-zinc-900 truncate">{section.title}</h2>
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', statusConfig.color)}>
                {statusConfig.icon}
                {statusConfig.label}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-zinc-400">{section.module}</span>
              {projectName && (
                <>
                  <span className="text-zinc-300">·</span>
                  <span className="text-[11px] text-zinc-400">{projectName}</span>
                </>
              )}
              {readinessScore != null && (
                <>
                  <span className="text-zinc-300">·</span>
                  <span className={cn('text-[11px] font-medium', readinessScore >= 70 ? 'text-emerald-600' : readinessScore >= 40 ? 'text-amber-600' : 'text-red-600')}>
                    Readiness: {readinessScore}%
                  </span>
                </>
              )}
              {isBlocked && (
                <>
                  <span className="text-zinc-300">·</span>
                  <span className="text-[11px] font-medium text-red-600">Promotion Blocked</span>
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {onSave && section.status !== 'locked' && section.status !== 'approved' && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
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
          </div>
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-100 bg-zinc-50/50 px-6">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
                activeTab === tab.id
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-400 hover:text-zinc-600'
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className={cn(
                  'ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                  activeTab === tab.id ? 'bg-zinc-200 text-zinc-700' : 'bg-zinc-100 text-zinc-500'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────── */}
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
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading issues from contradiction engine...
              </div>
            )}
            {!isLoadingIssues && issues.length === 0 && (
              <div className="text-center py-8 text-zinc-400 text-sm">
                No issues detected for this section.
              </div>
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
            {/* Readiness blockers section */}
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
              <div className="text-center py-8 text-zinc-400 text-sm">
                No evidence linked to this section yet.
              </div>
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
              <div className="text-center py-8 text-zinc-400 text-sm">
                No version history available.
              </div>
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
