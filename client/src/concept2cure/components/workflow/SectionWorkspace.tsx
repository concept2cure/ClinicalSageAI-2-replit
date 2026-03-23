/**
 * @fileoverview Section Workspace — document-centric authoring environment
 *
 * When a user opens a section, this workspace becomes the center of gravity.
 * Layout:
 *   - Main editor in center
 *   - Section context/header at top
 *   - Persistent AnA panel on the right
 *   - Evidence / precedent / assumptions drawer
 *   - Inline issues, contradictions, and readiness blockers
 *   - History/version visibility
 *
 * Tabs: Draft | Support | Issues | History
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  PenLine,
  FileText,
  AlertTriangle,
  History,
  BookOpen,
  CheckCircle2,
  Clock,
  CircleDot,
  ShieldCheck,
  Lock,
  ChevronRight,
  MessageSquare,
  X,
  Sparkles,
  Send,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SectionStatus = 'not-started' | 'drafting' | 'in-review' | 'approved' | 'blocked' | 'locked';

export interface SectionMeta {
  code: string;
  title: string;
  status: SectionStatus;
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
  type: 'contradiction' | 'missing-content' | 'missing-evidence' | 'missing-approval' | 'style' | 'compliance';
  description: string;
  severity: 'critical' | 'warning' | 'info';
  resolved?: boolean;
  lineRef?: string;
}

export interface SectionEvidence {
  id: string;
  title: string;
  source: string;
  type: 'clinical-trial' | 'literature' | 'precedent' | 'internal';
  linkedAt?: string;
}

export interface VersionEntry {
  version: number;
  author: string;
  timestamp: string;
  summary: string;
  status: SectionStatus;
}

export interface SectionWorkspaceProps {
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
}

// ─── Status config ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SectionStatus, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  'not-started': { label: 'Not Started', color: 'text-zinc-400', bg: 'bg-zinc-100', icon: CircleDot },
  'drafting': { label: 'Drafting', color: 'text-blue-600', bg: 'bg-blue-50', icon: PenLine },
  'in-review': { label: 'In Review', color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock },
  'approved': { label: 'Approved', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 },
  'blocked': { label: 'Blocked', color: 'text-red-600', bg: 'bg-red-50', icon: AlertTriangle },
  'locked': { label: 'Locked', color: 'text-violet-600', bg: 'bg-violet-50', icon: Lock },
};

type WorkspaceTab = 'draft' | 'support' | 'issues' | 'history';

// ─── Default data ───────────────────────────────────────────────────────────

const DEFAULT_ISSUES: SectionIssue[] = [
  { id: 'i1', type: 'missing-evidence', description: 'Primary efficacy endpoint data not yet cited. Section requires reference to pivotal Phase III results.', severity: 'critical' },
  { id: 'i2', type: 'contradiction', description: 'Safety profile statement in paragraph 3 contradicts data presented in Section 2.7.4.', severity: 'warning' },
  { id: 'i3', type: 'compliance', description: 'ICH M4E guideline requires integrated summary of efficacy including all relevant studies.', severity: 'info' },
];

const DEFAULT_EVIDENCE: SectionEvidence[] = [
  { id: 'e1', title: 'KEYNOTE-024: Phase III Study Results', source: 'ClinicalTrials.gov NCT02142738', type: 'clinical-trial' },
  { id: 'e2', title: 'FDA Guidance for Industry: ICH M4E(R2)', source: 'FDA.gov', type: 'precedent' },
  { id: 'e3', title: 'Comparative Clinical Overview — Similar IND Approval (2024)', source: 'Internal Precedent DB', type: 'internal' },
];

const DEFAULT_VERSIONS: VersionEntry[] = [
  { version: 3, author: 'Dr. Sarah Chen', timestamp: '2026-03-22 14:30', summary: 'Added primary endpoint data from Phase III results', status: 'drafting' },
  { version: 2, author: 'James Williams', timestamp: '2026-03-20 09:15', summary: 'Revised safety narrative per reviewer feedback', status: 'drafting' },
  { version: 1, author: 'Dr. Sarah Chen', timestamp: '2026-03-18 16:45', summary: 'Initial draft created from template', status: 'drafting' },
];

const DEFAULT_CONTENT = `## Clinical Overview

### 2.5.1 Product Development Rationale

[Drug Name] is being developed for the treatment of [indication]. The development program was designed to establish the safety and efficacy profile consistent with ICH M4E guidelines.

### 2.5.2 Overview of Clinical Pharmacology

The clinical pharmacology program included studies evaluating the pharmacokinetics, pharmacodynamics, and exposure-response relationships of [Drug Name].

### 2.5.3 Overview of Efficacy

The efficacy of [Drug Name] was evaluated in [X] clinical studies including [Y] pivotal trials. The primary efficacy endpoint was [endpoint description].

> **AnA Note:** Primary endpoint results from the Phase III pivotal study should be inserted here. Currently missing — this is a submission blocker.

### 2.5.4 Overview of Safety

The safety database includes [N] patients exposed to [Drug Name] across all clinical studies. The most common adverse events were [list].

### 2.5.5 Benefits and Risks Conclusions

Based on the totality of evidence, the benefit-risk profile of [Drug Name] supports its use in [indication].`;

// ─── Component ──────────────────────────────────────────────────────────────

export const SectionWorkspace: React.FC<SectionWorkspaceProps> = ({
  section,
  content = DEFAULT_CONTENT,
  issues = DEFAULT_ISSUES,
  evidence = DEFAULT_EVIDENCE,
  versions = DEFAULT_VERSIONS,
  onBack,
  onSave,
  onSubmitForReview,
  onApprove,
  projectName,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('draft');
  const [anaOpen, setAnaOpen] = useState(true);
  const [editorContent, setEditorContent] = useState(content);
  const cfg = STATUS_CONFIG[section.status];
  const StatusIcon = cfg.icon;

  const unresolvedIssues = issues.filter(i => !i.resolved);
  const criticalIssues = unresolvedIssues.filter(i => i.severity === 'critical');

  const tabs: { key: WorkspaceTab; label: string; badge?: number }[] = [
    { key: 'draft', label: 'Draft' },
    { key: 'support', label: 'Support', badge: evidence.length },
    { key: 'issues', label: 'Issues', badge: unresolvedIssues.length },
    { key: 'history', label: 'History', badge: versions.length },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* ── Section Header ────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-zinc-200 bg-zinc-50/50">
        <div className="px-6 py-3">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs text-zinc-400 mb-1">
            <button onClick={onBack} className="hover:text-zinc-600 transition-colors flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" />
              {projectName || 'Project'}
            </button>
            <ChevronRight className="w-3 h-3" />
            <span>Dossier</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-zinc-600">{section.module}</span>
          </div>

          {/* Section title + status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-zinc-500">{section.code}</span>
              <h1 className="text-lg font-semibold text-zinc-900">{section.title}</h1>
              <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium', cfg.bg, cfg.color)}>
                <StatusIcon className="w-3 h-3" />
                {cfg.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {section.status === 'drafting' && onSubmitForReview && (
                <button
                  onClick={onSubmitForReview}
                  disabled={criticalIssues.length > 0}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    criticalIssues.length > 0
                      ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  )}
                  title={criticalIssues.length > 0 ? `${criticalIssues.length} critical issue(s) must be resolved first` : 'Submit for review'}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Submit for Review
                </button>
              )}
              {section.status === 'in-review' && onApprove && (
                <button
                  onClick={onApprove}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Approve
                </button>
              )}
            </div>
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-4 mt-1 text-xs text-zinc-400">
            {section.assignee && <span>Assignee: {section.assignee}</span>}
            {section.lastEditedBy && <span>Last edit: {section.lastEditedBy}</span>}
            {section.lastEditedAt && <span>{section.lastEditedAt}</span>}
            {section.wordCount !== undefined && <span>{section.wordCount.toLocaleString()} words</span>}
            {section.version !== undefined && <span>v{section.version}</span>}
          </div>

          {/* Governance gate warning */}
          {criticalIssues.length > 0 && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-xs text-red-700">
                {criticalIssues.length} critical issue{criticalIssues.length > 1 ? 's' : ''} must be resolved before this section can advance.
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="px-6 flex items-center gap-0 border-t border-zinc-100">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors',
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              )}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={cn(
                  'text-[10px] px-1.5 py-0 rounded-full font-medium',
                  activeTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-zinc-100 text-zinc-500'
                )}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content area + AnA panel ────────────────────── */}
      <div className="flex-1 flex min-h-0">

        {/* Center: tab content */}
        <div className="flex-1 overflow-y-auto zen-scroll">
          {/* Draft tab */}
          {activeTab === 'draft' && (
            <div className="max-w-3xl mx-auto px-8 py-6">
              <div
                className="prose prose-sm prose-zinc max-w-none min-h-[400px] focus:outline-none"
                contentEditable
                suppressContentEditableWarning
                onBlur={e => {
                  const text = e.currentTarget.innerText;
                  setEditorContent(text);
                  onSave?.(text);
                }}
                dangerouslySetInnerHTML={{ __html: editorContent.replace(/\n/g, '<br/>') }}
              />
            </div>
          )}

          {/* Support tab — evidence, precedent, assumptions */}
          {activeTab === 'support' && (
            <div className="max-w-3xl mx-auto px-8 py-6">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Supporting Evidence & References</h2>
              <div className="space-y-2">
                {evidence.map(ev => (
                  <div key={ev.id} className="flex items-start gap-3 p-3 rounded-lg border border-zinc-200 bg-white hover:border-zinc-300 transition-colors">
                    <FileText className={cn(
                      'w-4 h-4 mt-0.5 flex-shrink-0',
                      ev.type === 'clinical-trial' ? 'text-blue-500' :
                      ev.type === 'precedent' ? 'text-violet-500' :
                      ev.type === 'literature' ? 'text-emerald-500' :
                      'text-zinc-400'
                    )} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-zinc-800 block">{ev.title}</span>
                      <span className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
                        {ev.source}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-medium flex-shrink-0">
                      {ev.type.replace('-', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Issues tab */}
          {activeTab === 'issues' && (
            <div className="max-w-3xl mx-auto px-8 py-6">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">
                Issues & Contradictions
                {unresolvedIssues.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-zinc-400">{unresolvedIssues.length} unresolved</span>
                )}
              </h2>
              <div className="space-y-2">
                {issues.map(issue => (
                  <div
                    key={issue.id}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                      issue.resolved ? 'border-zinc-100 bg-zinc-50 opacity-60' : 'border-zinc-200 bg-white'
                    )}
                  >
                    <AlertTriangle className={cn(
                      'w-4 h-4 mt-0.5 flex-shrink-0',
                      issue.severity === 'critical' ? 'text-red-500' :
                      issue.severity === 'warning' ? 'text-amber-500' :
                      'text-blue-500'
                    )} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-zinc-800 block">{issue.description}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                          issue.severity === 'critical' ? 'bg-red-50 text-red-600' :
                          issue.severity === 'warning' ? 'bg-amber-50 text-amber-600' :
                          'bg-blue-50 text-blue-600'
                        )}>
                          {issue.severity}
                        </span>
                        <span className="text-[10px] text-zinc-400">{issue.type.replace(/-/g, ' ')}</span>
                        {issue.resolved && (
                          <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                            <CheckCircle2 className="w-2.5 h-2.5" /> resolved
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* History tab */}
          {activeTab === 'history' && (
            <div className="max-w-3xl mx-auto px-8 py-6">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Version History</h2>
              <div className="space-y-0">
                {versions.map((v, i) => (
                  <div key={v.version} className="flex items-start gap-4 pb-4">
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center flex-shrink-0 pt-1">
                      <div className={cn('w-2.5 h-2.5 rounded-full', i === 0 ? 'bg-blue-500' : 'bg-zinc-300')} />
                      {i < versions.length - 1 && <div className="w-px h-full bg-zinc-200 mt-1" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-800">v{v.version}</span>
                        <span className="text-xs text-zinc-400">{v.author}</span>
                        <span className="text-xs text-zinc-300">{v.timestamp}</span>
                      </div>
                      <p className="text-sm text-zinc-600 mt-0.5">{v.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Contextual AnA Panel (Right) ──────────────────── */}
        {anaOpen ? (
          <div className="w-80 flex-shrink-0 border-l border-zinc-200 flex flex-col bg-zinc-50/50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-zinc-700">AnA Assistant</span>
              </div>
              <button
                onClick={() => setAnaOpen(false)}
                className="p-1 rounded hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Contextual suggestions */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-2">
                Suggested Actions
              </div>

              <button className="w-full text-left p-3 rounded-lg border border-zinc-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2 mb-1">
                  <PenLine className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-medium text-zinc-800">Draft missing content</span>
                </div>
                <p className="text-[11px] text-zinc-500 pl-5.5">Generate initial draft for empty subsections based on similar approved IND submissions.</p>
              </button>

              <button className="w-full text-left p-3 rounded-lg border border-zinc-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-3.5 h-3.5 text-violet-500" />
                  <span className="text-xs font-medium text-zinc-800">Find supporting evidence</span>
                </div>
                <p className="text-[11px] text-zinc-500 pl-5.5">Search PubMed and ClinicalTrials.gov for evidence supporting claims in this section.</p>
              </button>

              <button className="w-full text-left p-3 rounded-lg border border-zinc-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-zinc-800">Check contradictions</span>
                </div>
                <p className="text-[11px] text-zinc-500 pl-5.5">Scan for inconsistencies between this section and other dossier sections.</p>
              </button>

              <button className="w-full text-left p-3 rounded-lg border border-zinc-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs font-medium text-zinc-800">Readiness check</span>
                </div>
                <p className="text-[11px] text-zinc-500 pl-5.5">Evaluate this section against ICH M4 guidelines and FDA requirements.</p>
              </button>
            </div>

            {/* Chat input */}
            <div className="flex-shrink-0 border-t border-zinc-100 p-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Ask about this section..."
                  className="flex-1 text-sm px-3 py-2 rounded-lg border border-zinc-200 bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none placeholder:text-zinc-400"
                />
                <button className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAnaOpen(true)}
            className="flex-shrink-0 w-10 flex flex-col items-center justify-center gap-1 bg-zinc-50 hover:bg-zinc-100 border-l border-zinc-200 transition-colors"
            title="Open AnA Assistant"
          >
            <MessageSquare className="w-4 h-4 text-zinc-500" />
            <span className="text-[10px] text-zinc-400" style={{ writingMode: 'vertical-rl' }}>Assistant</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default SectionWorkspace;
