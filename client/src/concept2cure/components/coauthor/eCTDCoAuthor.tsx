/**
 * @fileoverview eCTD Co-Author - The Heavy Lifter
 * @module concept2cure/components/coauthor/eCTDCoAuthor
 * @version 1.0.0
 *
 * @description
 * THE CORE DOCUMENT AUTHORING EXPERIENCE
 *
 * THE SHERPA METAPHOR:
 * "The Porter who carries the heavy pack so the climber can focus on the ascent."
 *
 * THE CHALLENGE:
 * Writing a 200-page Clinical Overview is exhausting "grunt work."
 * It weighs down your high-priced scientists.
 *
 * HOW LUMEN ACTS AS SHERPA:
 * - Carrying the Load: You don't write from scratch. Click "Draft" and Lumen
 *   carries the burden of the first draft, citing every claim using "Smart Tags"
 *   (the ropes that connect you to the data).
 * - Safety Lines: If you try to write a claim that isn't supported by data,
 *   the "Co-Pilot" pulls the rope tight (Redline Alert), preventing you from
 *   falling off the path.
 *
 * THE BENEFIT: Your experts save their energy for strategy, not typing.
 *
 * ZERO STATE MESSAGE (Cortex Companion Sidebar):
 * "Your Sherpa is ready. I'll help you draft, verify every claim,
 * and ensure you reach the summit safely. What would you like to create?"
 */

import React, { useState, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';
import { LIFECYCLE } from '../ui/enterprise';
import {
  FileText,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Link,
  Edit3,
  Eye,
  Save,
  ChevronRight,
  ChevronDown,
  Zap,
  Mountain,
  Flag,
  BookOpen,
  RotateCcw,
  Plus,
  Settings,
  Download,
  Shield,
  ShieldCheck,
  Lock,
  FileSignature,
  Target,
  Layers,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type DocumentModule = 'm1' | 'm2' | 'm3' | 'm4' | 'm5';

export type SectionStatus =
  | 'empty'
  | 'ai_drafting'
  | 'ai_draft'
  | 'editing'
  | 'in_review'
  | 'approved'
  | 'locked';

export type SmartTagType = 'data' | 'citation' | 'cross_ref' | 'guideline' | 'warning';

export interface SmartTag {
  id: string;
  type: SmartTagType;
  text: string;
  sourceId?: string;
  sourceName?: string;
  pageRef?: string;
  confidence?: number;
  isVerified: boolean;
  onClick?: () => void;
}

export interface RedlineAlert {
  id: string;
  sectionId: string;
  claimText: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  linkedSources?: string[];
}

export interface SectionSignature {
  id: string;
  signerId: string;
  signerName: string;
  meaning: 'authorship' | 'review' | 'approval' | 'verification';
  timestamp: string;
  signatureHash: string;
}

export interface DocumentSection {
  id: string;
  number: string;
  title: string;
  module: DocumentModule;
  status: SectionStatus;
  content?: string;
  smartTags: SmartTag[];
  wordCount: number;
  lastEdited?: string;
  editedBy?: string;
  children?: DocumentSection[];
  redlineAlerts?: RedlineAlert[];
  signatures?: SectionSignature[];
}

export interface eCTDDocument {
  id: string;
  name: string;
  submissionType: 'IND' | 'NDA' | 'BLA' | '510k' | 'PMA' | 'CER';
  project: string;
  version: string;
  status: 'draft' | 'review' | 'approved' | 'submitted';
  sections: DocumentSection[];
  overallProgress: number;
  unverifiedClaims: number;
  redlineAlerts: number;
}

interface eCTDCoAuthorProps {
  document: eCTDDocument;
  selectedSection?: DocumentSection;
  onSectionSelect?: (section: DocumentSection) => void;
  onDraftSection?: (section: DocumentSection) => void;
  onVerifyClaim?: (tag: SmartTag) => void;
  onResolveAlert?: (alert: RedlineAlert) => void;
  onOpenInEditor?: (section: DocumentSection) => void;
  onApproveSection?: (section: DocumentSection) => void;
  onSubmitForReview?: (section: DocumentSection) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const MODULE_CONFIG: Record<
  DocumentModule,
  {
    label: string;
    fullName: string;
    color: string;
    bgColor: string;
  }
> = {
  m1: { label: 'M1', fullName: 'Administrative', color: 'text-zinc-600', bgColor: 'bg-zinc-100' },
  m2: { label: 'M2', fullName: 'Summaries', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  m3: { label: 'M3', fullName: 'Quality (CMC)', color: 'text-green-600', bgColor: 'bg-green-100' },
  m4: { label: 'M4', fullName: 'Nonclinical', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  m5: { label: 'M5', fullName: 'Clinical', color: 'text-purple-600', bgColor: 'bg-purple-100' },
};

const STATUS_CONFIG: Record<
  SectionStatus,
  {
    label: string;
    color: string;
    bgColor: string;
    icon: React.ReactNode;
  }
> = {
  empty: {
    label: 'Empty',
    color: LIFECYCLE.not_started.text,
    bgColor: LIFECYCLE.not_started.bg,
    icon: <div className="w-3 h-3 rounded-full border border-dashed border-zinc-300" />,
  },
  ai_drafting: {
    label: 'RI Drafting...',
    color: LIFECYCLE.in_review.text,
    bgColor: LIFECYCLE.in_review.bg,
    icon: <Sparkles className="w-3 h-3 animate-pulse" />,
  },
  ai_draft: {
    label: 'RI Draft',
    color: LIFECYCLE.superseded.text,
    bgColor: LIFECYCLE.superseded.bg,
    icon: <Sparkles className="w-3 h-3" />,
  },
  editing: {
    label: 'Editing',
    color: LIFECYCLE.draft.text,
    bgColor: LIFECYCLE.draft.bg,
    icon: <Edit3 className="w-3 h-3" />,
  },
  in_review: {
    label: 'In Review',
    color: LIFECYCLE.in_review.text,
    bgColor: LIFECYCLE.in_review.bg,
    icon: <Eye className="w-3 h-3" />,
  },
  approved: {
    label: 'Approved',
    color: LIFECYCLE.approved.text,
    bgColor: LIFECYCLE.approved.bg,
    icon: <CheckCircle className="w-3 h-3" />,
  },
  locked: {
    label: 'Locked',
    color: LIFECYCLE.published.text,
    bgColor: LIFECYCLE.published.bg,
    icon: <Shield className="w-3 h-3" />,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ZERO STATE - THE SHERPA GREETING
// ═══════════════════════════════════════════════════════════════════════════════

const ZeroState: React.FC<{ onStartDrafting?: () => void }> = ({ onStartDrafting }) => (
  <div className="flex-1 flex items-center justify-center p-8">
    <div className="text-center max-w-md">
      <div className="w-12 h-12 mx-auto mb-5 rounded-lg bg-zinc-900 flex items-center justify-center shadow-sm">
        <Mountain className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-xl font-semibold text-zinc-900 mb-3">Your Sherpa is Ready</h2>
      <p className="text-zinc-600 mb-6 leading-relaxed">
        I'll help you draft your regulatory documents, verify every claim against your source data,
        and ensure you reach the summit of approval safely.
      </p>
      <p className="text-sm text-zinc-500 mb-6 italic">
        "You don't write from scratch. Click 'Draft' and I'll carry the burden of the first draft -
        citing every claim with Smart Tags that connect you to your data."
      </p>
      <button
        onClick={onStartDrafting}
        className="px-5 py-2.5 bg-zinc-900 text-white rounded-lg font-semibold hover:bg-zinc-800 shadow-sm transition-colors flex items-center gap-2 mx-auto"
      >
        <Sparkles className="w-4 h-4" />
        Start Drafting with RI
      </button>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// OUTLINE TREE
// ═══════════════════════════════════════════════════════════════════════════════

const OutlineTree: React.FC<{
  sections: DocumentSection[];
  selectedId?: string;
  onSelect: (section: DocumentSection) => void;
  depth?: number;
}> = ({ sections, selectedId, onSelect, depth = 0 }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-0.5">
      {sections.map(section => {
        const hasChildren = section.children && section.children.length > 0;
        const isExpanded = expanded[section.id] ?? true;
        const isSelected = section.id === selectedId;
        const statusConfig = STATUS_CONFIG[section.status];
        const moduleConfig = MODULE_CONFIG[section.module];

        return (
          <div key={section.id}>
            <button
              onClick={() => onSelect(section)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors duration-150',
                'hover:bg-zinc-100',
                isSelected && 'bg-blue-50 ring-1 ring-blue-200'
              )}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
            >
              {/* Expand/Collapse */}
              {hasChildren ? (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setExpanded(prev => ({ ...prev, [section.id]: !isExpanded }));
                  }}
                  className="p-1 hover:bg-zinc-200 rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-zinc-400" />
                  )}
                </button>
              ) : (
                <div className="w-4" />
              )}

              {/* Status Icon */}
              <div className={statusConfig.color}>{statusConfig.icon}</div>

              {/* Section Number & Title */}
              <div className="flex-1 min-w-0">
                <span className="text-xs font-mono text-zinc-400 mr-2">{section.number}</span>
                <span
                  className={cn(
                    'text-sm truncate',
                    isSelected ? 'font-medium text-blue-700' : 'text-zinc-700'
                  )}
                >
                  {section.title}
                </span>
              </div>

              {/* Alerts Badge */}
              {section.redlineAlerts && section.redlineAlerts.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded">
                  {section.redlineAlerts.length}
                </span>
              )}
            </button>

            {/* Children */}
            {hasChildren && isExpanded && (
              <OutlineTree
                sections={section.children!}
                selectedId={selectedId}
                onSelect={onSelect}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SMART TAG COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const SmartTagBadge: React.FC<{
  tag: SmartTag;
  onVerify?: () => void;
}> = ({ tag, onVerify }) => {
  const config: Record<SmartTagType, { color: string; icon: React.ReactNode }> = {
    data: {
      color: 'bg-green-100 text-green-700 border-green-200',
      icon: <Target className="w-3 h-3" />,
    },
    citation: {
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      icon: <BookOpen className="w-3 h-3" />,
    },
    cross_ref: {
      color: 'bg-purple-100 text-purple-700 border-purple-200',
      icon: <Link className="w-3 h-3" />,
    },
    guideline: {
      color: 'bg-amber-100 text-amber-700 border-amber-200',
      icon: <Shield className="w-3 h-3" />,
    },
    warning: {
      color: 'bg-red-100 text-red-700 border-red-200',
      icon: <AlertTriangle className="w-3 h-3" />,
    },
  };

  const c = config[tag.type];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border cursor-pointer transition-colors duration-150',
        'hover:shadow-sm',
        c.color,
        !tag.isVerified && 'border-dashed opacity-75'
      )}
      onClick={tag.onClick || onVerify}
      title={tag.isVerified ? `Verified: ${tag.sourceName}` : 'Click to verify claim'}
    >
      {c.icon}
      {tag.text}
      {tag.pageRef && <span className="text-xs opacity-75">p.{tag.pageRef}</span>}
      {!tag.isVerified && <AlertTriangle className="w-3 h-3 text-amber-500 ml-1" />}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// REDLINE ALERT PANEL
// ═══════════════════════════════════════════════════════════════════════════════

const RedlineAlertPanel: React.FC<{
  alerts: RedlineAlert[];
  onResolve?: (alert: RedlineAlert) => void;
}> = ({ alerts, onResolve }) => {
  if (alerts.length === 0) return null;

  return (
    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-red-600" />
        <h4 className="text-sm font-semibold text-red-800">Safety Line Alerts</h4>
        <span className="px-2 py-0.5 text-xs font-semibold bg-red-200 text-red-800 rounded-full">
          {alerts.length}
        </span>
      </div>
      <div className="space-y-3">
        {alerts.map(alert => (
          <div key={alert.id} className="bg-white rounded-lg p-3 border border-red-200">
            <div className="flex items-start justify-between mb-2">
              <span
                className={cn(
                  'px-2 py-0.5 text-xs font-semibold rounded uppercase',
                  alert.severity === 'critical' && 'bg-red-600 text-white',
                  alert.severity === 'warning' && 'bg-amber-500 text-white',
                  alert.severity === 'info' && 'bg-blue-500 text-white'
                )}
              >
                {alert.severity}
              </span>
              <button
                onClick={() => onResolve?.(alert)}
                className="text-xs text-blue-600 hover:underline"
              >
                Resolve
              </button>
            </div>
            <p className="text-sm text-red-800 font-medium mb-1">"{alert.claimText}"</p>
            <p className="text-xs text-red-600">{alert.message}</p>
            {alert.suggestion && (
              <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Suggestion: {alert.suggestion}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION EDITOR
// ═══════════════════════════════════════════════════════════════════════════════

const SectionEditor: React.FC<{
  section: DocumentSection;
  onDraft?: () => void;
  onVerifyClaim?: (tag: SmartTag) => void;
  onResolveAlert?: (alert: RedlineAlert) => void;
  onOpenInEditor?: () => void;
  onApprove?: () => void;
  onSubmitForReview?: () => void;
}> = ({ section, onDraft, onVerifyClaim, onResolveAlert, onOpenInEditor, onApprove, onSubmitForReview }) => {
  const statusConfig = STATUS_CONFIG[section.status];
  const moduleConfig = MODULE_CONFIG[section.module];

  return (
    <div className="flex-1 flex flex-col bg-white rounded-xl border border-zinc-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-200 bg-zinc-50">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                'px-2 py-0.5 text-xs font-semibold rounded',
                moduleConfig.bgColor,
                moduleConfig.color
              )}
            >
              {moduleConfig.label}
            </span>
            <span className="text-sm font-mono text-zinc-500">{section.number}</span>
          </div>
          <h2 className="text-lg font-semibold text-zinc-900">{section.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg',
              statusConfig.bgColor,
              statusConfig.color
            )}
          >
            {statusConfig.icon}
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-zinc-200 bg-zinc-50/50">
        <button
          onClick={onDraft}
          className="px-3 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {section.status === 'empty' ? 'Draft with RI' : 'Regenerate'}
        </button>
        {/* Open in full Document Editor */}
        {onOpenInEditor && (
          <button
            onClick={onOpenInEditor}
            className="px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2 ml-1"
            title="Open in Document Editor for rich editing, DOCX export, and compliance checking"
          >
            <FileText className="w-4 h-4" />
            Open in Editor
          </button>
        )}

        {/* Submit for Review (editing → in_review) */}
        {onSubmitForReview && ['editing', 'ai_draft'].includes(section.status) && (
          <button
            onClick={onSubmitForReview}
            className="px-3 py-1.5 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2 ml-1"
            title="Submit section for review"
          >
            <Eye className="w-4 h-4" />
            Submit for Review
          </button>
        )}

        {/* Approve with E-Signature (in_review → approved) */}
        {onApprove && section.status === 'in_review' && (
          <button
            onClick={onApprove}
            className="px-3 py-1.5 text-sm font-medium bg-green-700 text-white rounded-lg hover:bg-green-800 flex items-center gap-2 ml-1"
            title="Approve with 21 CFR Part 11 electronic signature"
          >
            <FileSignature className="w-4 h-4" />
            Approve &amp; Sign
          </button>
        )}

        {/* Locked indicator */}
        {section.status === 'locked' && (
          <span className="px-3 py-1.5 text-sm font-medium bg-zinc-200 text-zinc-600 rounded-lg flex items-center gap-2 ml-1">
            <Lock className="w-4 h-4" />
            Signed &amp; Locked
          </span>
        )}

        <div className="flex-1" />
      </div>

      {/* Redline Alerts */}
      {section.redlineAlerts && section.redlineAlerts.length > 0 && (
        <div className="p-4 border-b border-zinc-200">
          <RedlineAlertPanel alerts={section.redlineAlerts} onResolve={onResolveAlert} />
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        {section.status === 'empty' ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-zinc-100 flex items-center justify-center">
              <FileText className="w-8 h-8 text-zinc-400" />
            </div>
            <h3 className="text-lg font-medium text-zinc-600 mb-2">Section Not Yet Drafted</h3>
            <p className="text-sm text-zinc-500 mb-4 max-w-sm mx-auto">
              Click "Draft with RI" and your Sherpa will carry the burden of the first draft, citing
              every claim against your source documents.
            </p>
            <button
              onClick={onDraft}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Start Drafting
            </button>
            {onOpenInEditor && (
              <button
                onClick={onOpenInEditor}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium mt-2 flex items-center gap-2 mx-auto"
              >
                <FileText className="w-4 h-4" />
                Open in Document Editor
              </button>
            )}
          </div>
        ) : section.status === 'ai_drafting' ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-blue-100 flex items-center justify-center animate-pulse">
              <Sparkles className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-lg font-medium text-blue-700 mb-2">RI is Drafting...</h3>
            <p className="text-sm text-zinc-500">
              Analyzing source documents and generating content with Smart Tags
            </p>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none">
            {section.content ? (
              <div
                className="text-zinc-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(section.content) }}
              />
            ) : (
              <p className="text-zinc-400 italic">No content available</p>
            )}

            {/* Smart Tags Display */}
            {section.smartTags.length > 0 && (
              <div className="mt-6 pt-4 border-t border-zinc-200">
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Smart Tags ({section.smartTags.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {section.smartTags.map(tag => (
                    <SmartTagBadge key={tag.id} tag={tag} onVerify={() => onVerifyClaim?.(tag)} />
                  ))}
                </div>
              </div>
            )}

            {/* Electronic Signatures Display (21 CFR Part 11) */}
            {section.signatures && section.signatures.length > 0 && (
              <div className="mt-6 pt-4 border-t border-green-200">
                <h4 className="text-xs font-bold text-green-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Electronic Signatures ({section.signatures.length})
                  <span className="text-[10px] font-normal normal-case bg-green-100 text-green-600 px-1.5 py-0.5 rounded">
                    21 CFR Part 11
                  </span>
                </h4>
                <div className="space-y-2">
                  {section.signatures.map(sig => (
                    <div
                      key={sig.id}
                      className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="w-4 h-4 text-green-600" />
                        <div>
                          <span className="text-sm font-medium text-green-900">{sig.signerName}</span>
                          <span className="text-xs text-green-600 ml-2 capitalize">{sig.meaning}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-green-700">{new Date(sig.timestamp).toLocaleString()}</p>
                        <p className="text-[10px] font-mono text-green-500">{sig.signatureHash.slice(0, 16)}...</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-3 border-t border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
        <div className="flex items-center gap-4">
          <span>{section.wordCount.toLocaleString()} words</span>
          {section.lastEdited && <span>Last edited: {section.lastEdited}</span>}
          {section.editedBy && <span>by {section.editedBy}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <Target className="w-3 h-3" />
            {section.smartTags.filter(t => t.isVerified).length}/{section.smartTags.length} verified
          </span>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Standalone demo document (used by ECTDCoAuthorStandalone) ─────────────
export const DEMO_ECTD_DOCUMENT: eCTDDocument = {
  id: 'ectd-ind-001',
  name: 'Lemizumab IND Application',
  submissionType: 'IND',
  project: 'Lemizumab Phase 1/2 Program',
  version: '0.3 DRAFT',
  status: 'draft',
  overallProgress: 28,
  unverifiedClaims: 14,
  redlineAlerts: 3,
  sections: [
    {
      id: 'm1-cover',
      number: '1.1',
      title: 'Cover Letter',
      module: 'm1',
      status: 'approved',
      content:
        'Concept2Cure Therapeutics, Inc. hereby submits this Investigational New Drug application for lemizumab...',
      smartTags: [],
      wordCount: 420,
      lastEdited: '2026-02-20',
      editedBy: 'Sarah Chen',
    },
    {
      id: 'm1-1571',
      number: '1.2',
      title: 'Form FDA 1571',
      module: 'm1',
      status: 'approved',
      content:
        '<h2>1.2 Form FDA 1571</h2>\n<h3>Investigational New Drug Application (IND)</h3>\n<p><strong>Name of Sponsor:</strong> Concept2Cure Therapeutics, Inc.</p>\n<p><strong>Date of Submission:</strong> March 2026</p>\n<p><strong>Name of Investigational Drug:</strong> Lemizumab (anti-IL-17A humanized mAb)</p>\n<p><strong>IND Number:</strong> [To be assigned]</p>\n<p><strong>Indication:</strong> Moderate-to-severe plaque psoriasis in adults</p>\n<p><strong>Phase of Clinical Investigation:</strong> Phase 1/2</p>\n<p>This application contains the following: Initial IND submission with all required CTD modules including CMC (Module 3), Nonclinical (Module 4), and Clinical Protocol (Module 5).</p>',
      smartTags: [],
      wordCount: 85,
      lastEdited: '2026-02-19',
      editedBy: 'James Mitchell',
    },
    {
      id: 'm2-qual',
      number: '2.3',
      title: 'Quality Overall Summary',
      module: 'm2',
      status: 'ai_draft',
      content:
        'Lemizumab is a recombinant humanized monoclonal antibody (IgG4) directed against interleukin-17A (IL-17A). The drug substance is manufactured by Chinese hamster ovary (CHO) cell fermentation using a fed-batch process validated per ICH Q11 principles.',
      smartTags: [],
      wordCount: 2140,
      lastEdited: '2026-03-01',
      editedBy: 'RI',
    },
    {
      id: 'm2-nonclin',
      number: '2.4',
      title: 'Nonclinical Overview',
      module: 'm2',
      status: 'editing',
      content:
        '<h2>2.4 Nonclinical Overview</h2>\n<h3>2.4.1 Overview of Nonclinical Testing Strategy</h3>\n<p>The nonclinical program for lemizumab included pharmacology, pharmacokinetics, and toxicology studies conducted in compliance with GLP regulations (21 CFR Part 58). Species selection was based on IL-17A cross-reactivity — cynomolgus monkey was the primary pharmacologically relevant species.</p>\n<h3>2.4.2 Pharmacology</h3>\n<p>In vitro binding studies confirmed lemizumab binds human IL-17A with high affinity (KD = 45 pM). In the imiquimod-induced psoriasis mouse model, lemizumab analogue reduced epidermal thickness by 68% (p&lt;0.001) and suppressed IL-17A-driven keratinocyte proliferation markers.</p>\n<h3>2.4.3 Pharmacokinetics</h3>\n<p>Following IV administration in cynomolgus monkeys, lemizumab exhibited linear PK with t½ of 14.2 days, Vss of 72 mL/kg, and CL of 3.5 mL/day/kg. Subcutaneous bioavailability was 78%.</p>\n<h3>2.4.4 Toxicology</h3>\n<p>A 26-week repeat-dose toxicity study in cynomolgus monkeys (10, 30, 100 mg/kg/week SC) revealed no target organ toxicity. The NOAEL was 100 mg/kg/week, providing a safety margin of >20× the proposed clinical dose.</p>',
      smartTags: [],
      wordCount: 3820,
      lastEdited: '2026-02-28',
      editedBy: 'Dr. Marcus Rivera',
    },
    {
      id: 'm2-clin',
      number: '2.5',
      title: 'Clinical Overview',
      module: 'm2',
      status: 'ai_draft',
      content:
        '<h2>2.5 Clinical Overview</h2>\n<h3>2.5.1 Product Development Rationale</h3>\n<p>Lemizumab is being developed for the treatment of moderate-to-severe plaque psoriasis in adults who are candidates for systemic therapy. IL-17A is a key driver of psoriatic inflammation, and selective IL-17A inhibition has demonstrated transformative efficacy in this indication.</p>\n<h3>2.5.2 Overview of Biopharmaceutics</h3>\n<p>Lemizumab is administered by subcutaneous injection using a 150 mg/mL prefilled syringe formulation. Bioavailability studies demonstrate 78% absorption following SC administration.</p>\n<h3>2.5.4 Overview of Efficacy</h3>\n<p>The planned Phase 1/2 study (LMZ-001) will evaluate safety, PK, and preliminary efficacy of lemizumab in 60 patients with moderate-to-severe plaque psoriasis (PASI ≥12, BSA ≥10%).</p>\n<h3>2.5.5 Overview of Safety</h3>\n<p>Based on the nonclinical safety profile (NOAEL 100 mg/kg/week in cynomolgus monkeys, >20× safety margin), lemizumab is expected to have a favorable safety profile consistent with the IL-17A inhibitor class.</p>\n<h3>2.5.6 Benefits and Risks Conclusions</h3>\n<p>The benefit-risk assessment supports initiation of Phase 1/2 clinical investigation based on strong preclinical efficacy, favorable safety margins, and the significant unmet need for well-tolerated psoriasis therapies.</p>',
      smartTags: [],
      wordCount: 1840,
      lastEdited: '2026-03-05',
      editedBy: 'RI',
    },
    {
      id: 'm3-drug',
      number: '3.2.S',
      title: 'Drug Substance (CMC)',
      module: 'm3',
      status: 'in_review',
      content:
        '<h2>3.2.S Drug Substance</h2>\n<h3>3.2.S.1 General Information</h3>\n<p><strong>INN:</strong> Lemizumab. <strong>Description:</strong> Recombinant humanized monoclonal antibody (IgG4, kappa) directed against human interleukin-17A. Molecular weight: approximately 146 kDa. Produced in Chinese hamster ovary (CHO) cells.</p>\n<h3>3.2.S.2 Manufacture</h3>\n<p>Drug substance is manufactured at Concept2Cure Biologics (San Diego, CA) using a fed-batch CHO cell culture process. The manufacturing process includes cell expansion, production bioreactor (2000L), harvest/clarification, Protein A affinity chromatography, viral inactivation (low pH), ion exchange polishing, nanofiltration, and UF/DF.</p>\n<h3>3.2.S.3 Characterisation</h3>\n<p>Primary structure confirmed by peptide mapping and intact/reduced mass spectrometry. Higher order structure evaluated by CD spectroscopy and SEC-MALS. Binding affinity: KD = 45 pM by SPR (Biacore). Potency: IC50 = 0.15 nM in IL-17A-stimulated HaCaT cell assay.</p>\n<h3>3.2.S.4 Control of Drug Substance</h3>\n<p>Specifications include appearance, pH, protein concentration (UV A280), purity (SEC ≥98%, CE-SDS ≥95%), potency (relative potency 80-125%), endotoxin (≤0.5 EU/mg), bioburden, and residual CHO protein (≤100 ppm).</p>\n<h3>3.2.S.7 Stability</h3>\n<p>Stability studies initiated under ICH Q5C at 2-8°C (36 months), 25°C/60% RH (6 months accelerated). 12-month data at 2-8°C demonstrates compliance with all specifications. Proposed shelf life: 24 months at 2-8°C.</p>',
      smartTags: [],
      wordCount: 8900,
      lastEdited: '2026-02-25',
      editedBy: 'Dr. Chen',
    },
    {
      id: 'm3-product',
      number: '3.2.P',
      title: 'Drug Product',
      module: 'm3',
      status: 'editing',
      content:
        '<h2>3.2.P Drug Product</h2>\n<h3>3.2.P.1 Description and Composition</h3>\n<p>Lemizumab drug product is a sterile, preservative-free solution for subcutaneous injection. Each prefilled syringe contains 150 mg lemizumab in 1.0 mL (150 mg/mL). Excipients: L-histidine/L-histidine HCl (pH 6.0), sucrose (stabilizer), polysorbate 80 (surfactant), and Water for Injection.</p>\n<h3>3.2.P.2 Pharmaceutical Development</h3>\n<p>Formulation development focused on achieving high concentration (150 mg/mL) with acceptable viscosity (<15 cP) for SC delivery. Accelerated stability studies confirmed the selected formulation maintains monomer content >98% through 6 months at 25°C.</p>\n<h3>3.2.P.3 Manufacture</h3>\n<p>Drug product is manufactured at Concept2Cure Fill-Finish (San Diego, CA). Process: sterile filtration (0.2 μm) → aseptic filling into Type I borosilicate glass syringes → stoppering → visual inspection → labeling/packaging. Validated batch size: 10,000 units.</p>\n<h3>3.2.P.5 Control of Drug Product</h3>\n<p>Release specifications include appearance, pH (5.8-6.2), protein concentration (142.5-157.5 mg/mL), purity by SEC (≥97%), sub-visible particles (per USP <787>), sterility, bacterial endotoxins, and container closure integrity.</p>\n<h3>3.2.P.8 Stability</h3>\n<p>Stability studies conducted per ICH Q5C. Proposed shelf life: 24 months at 2-8°C protected from light.</p>',
      smartTags: [],
      wordCount: 2400,
      lastEdited: '2026-03-04',
      editedBy: 'Dr. Chen',
    },
    {
      id: 'm4-pharm',
      number: '4.2.1',
      title: 'Primary Pharmacology',
      module: 'm4',
      status: 'ai_draft',
      content:
        '<h2>4.2.1 Primary Pharmacodynamics</h2>\n<h3>In Vitro Studies</h3>\n<p>Lemizumab demonstrated potent and selective inhibition of IL-17A signaling in multiple cell-based assays. In IL-17A-stimulated human keratinocytes (HaCaT), lemizumab inhibited IL-6 and IL-8 production with IC50 values of 0.15 nM and 0.22 nM, respectively.</p>\n<p>Cross-reactivity: Lemizumab did not bind IL-17B, IL-17C, IL-17D, IL-17E, or IL-17F, confirming high selectivity for IL-17A.</p>\n<h3>In Vivo Studies</h3>\n<p><strong>Imiquimod (IMQ)-induced psoriasiform dermatitis model (mice):</strong> A surrogate anti-murine IL-17A antibody reduced clinical severity scores by 72% (p&lt;0.001), decreased epidermal thickness by 68%, and suppressed dermal infiltration of neutrophils (−85%) and Th17 cells (−62%) versus isotype control.</p>\n<p><strong>Xenograft model (SCID mice):</strong> Human psoriatic skin grafted onto SCID mice and treated with lemizumab (10 mg/kg SC, twice weekly) showed normalization of epidermal architecture and near-complete resolution of psoriasiform histology by day 28.</p>\n<h3>Secondary Pharmacodynamics</h3>\n<p>Safety pharmacology studies (hERG, respiratory, CNS) revealed no off-target effects at concentrations up to 1000× the anticipated Cmax.</p>',
      smartTags: [],
      wordCount: 5200,
      lastEdited: '2026-03-02',
      editedBy: 'RI',
    },
    {
      id: 'm4-tox',
      number: '4.2.3',
      title: 'Toxicology',
      module: 'm4',
      status: 'ai_draft',
      content:
        '<h2>4.2.3 Toxicology</h2>\n<h3>Single-Dose Toxicity</h3>\n<p>Single IV doses up to 300 mg/kg in cynomolgus monkeys were well-tolerated with no mortality or clinical signs of toxicity. No adverse pathological findings at the 14-day necropsy.</p>\n<h3>Repeat-Dose Toxicity</h3>\n<p>A 26-week GLP-compliant repeat-dose study in cynomolgus monkeys (10, 30, 100 mg/kg/week SC) was conducted. No test article-related adverse effects on body weight, food consumption, clinical pathology, or organ weights. Histopathology: no target organ toxicity. NOAEL: 100 mg/kg/week (approximately 20× the highest proposed clinical dose on an AUC basis).</p>\n<h3>Genotoxicity</h3>\n<p>As a monoclonal antibody, lemizumab is not expected to interact directly with DNA. No genotoxicity studies were conducted, consistent with ICH S6(R1) guidance.</p>\n<h3>Immunotoxicity</h3>\n<p>Anti-drug antibodies (ADA) were detected in 15% of animals at 26 weeks with no impact on PK or pharmacological activity. No immune complex-mediated pathology observed.</p>',
      smartTags: [],
      wordCount: 1850,
      lastEdited: '2026-03-03',
      editedBy: 'RI',
    },
    {
      id: 'm5-protocol',
      number: '5.3.5.1',
      title: 'Phase 1 Clinical Protocol',
      module: 'm5',
      status: 'editing',
      content:
        '<h2>5.3.5.1 Phase 1/2 Clinical Protocol — Study LMZ-001</h2>\n<h3>Synopsis</h3>\n<p><strong>Title:</strong> A Phase 1/2, Randomized, Double-Blind, Placebo-Controlled, Dose-Escalation and Expansion Study to Evaluate the Safety, Pharmacokinetics, and Preliminary Efficacy of Lemizumab in Adults with Moderate-to-Severe Plaque Psoriasis</p>\n<p><strong>Sponsor:</strong> Concept2Cure Therapeutics, Inc.</p>\n<p><strong>Study Population:</strong> Adults aged 18-65 with moderate-to-severe plaque psoriasis (PASI ≥12, BSA ≥10%, IGA ≥3), inadequate response or intolerance to at least one conventional systemic therapy.</p>\n<p><strong>Study Design:</strong> Dose escalation (Part A, N=24): 4 cohorts (30, 75, 150, 300 mg SC Q2W), 3:1 randomization. Dose expansion (Part B, N=36): selected dose(s), 2:1 randomization vs placebo.</p>\n<h3>Objectives</h3>\n<p><strong>Primary:</strong> Evaluate safety and tolerability of lemizumab (incidence of AEs, SAEs, and dose-limiting toxicities).</p>\n<p><strong>Secondary:</strong> Characterize PK profile (Cmax, AUC, t½, accumulation ratio). Assess preliminary efficacy (PASI 75 response at Week 12).</p>\n<h3>Endpoints</h3>\n<p><strong>Primary:</strong> Incidence and severity of treatment-emergent adverse events through Week 16.</p>\n<p><strong>Secondary:</strong> PASI 75 at Week 12, PASI 90 at Week 12, IGA 0/1 response at Week 12, PK parameters.</p>\n<h3>Statistical Considerations</h3>\n<p>Part A: Descriptive statistics only. Part B: PASI 75 response rate analyzed using Fisher exact test (2-sided α=0.10 for signal detection). Sample size provides 80% power to detect a 40% treatment difference.</p>',
      smartTags: [],
      wordCount: 12800,
      lastEdited: '2026-03-01',
      editedBy: 'Dr. Lisa Wang',
    },
  ],
};

export const eCTDCoAuthor: React.FC<eCTDCoAuthorProps> = ({
  document,
  selectedSection,
  onSectionSelect,
  onDraftSection,
  onVerifyClaim,
  onResolveAlert,
  onOpenInEditor,
  onApproveSection,
  onSubmitForReview,
  className,
}) => {
  const [activeSection, setActiveSection] = useState<DocumentSection | undefined>(selectedSection);

  const handleSectionSelect = (section: DocumentSection) => {
    setActiveSection(section);
    onSectionSelect?.(section);
  };

  return (
    <div className={cn('flex h-full bg-zinc-50', className)} data-testid="ectd-coauthor-content">
      {/* Left Panel: Document Outline */}
      <div
        className="w-80 flex-shrink-0 bg-white border-r border-zinc-200 flex flex-col"
        data-testid="ectd-coauthor-outline"
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-zinc-900">{document.name}</h2>
              <p className="text-xs text-zinc-500">
                {document.submissionType} • v{document.version}
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Progress</span>
              <span className="font-medium text-zinc-700">{document.overallProgress}%</span>
            </div>
            <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${document.overallProgress}%` }}
              />
            </div>
          </div>

          {/* Alerts Summary */}
          {(document.unverifiedClaims > 0 || document.redlineAlerts > 0) && (
            <div className="flex gap-2 mt-3">
              {document.unverifiedClaims > 0 && (
                <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  {document.unverifiedClaims} unverified
                </span>
              )}
              {document.redlineAlerts > 0 && (
                <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {document.redlineAlerts} alerts
                </span>
              )}
            </div>
          )}
        </div>

        {/* Outline */}
        <div className="flex-1 overflow-auto p-2">
          <OutlineTree
            sections={document.sections}
            selectedId={activeSection?.id}
            onSelect={handleSectionSelect}
          />
        </div>

        {/* Add Section */}
        <div className="p-3 border-t border-zinc-200">
          <button className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-150">
            <Plus className="w-4 h-4" />
            Add Section
          </button>
        </div>
      </div>

      {/* Right Panel: Editor */}
      <div className="flex-1 flex flex-col p-4">
        {activeSection ? (
          <SectionEditor
            section={activeSection}
            onDraft={() => onDraftSection?.(activeSection)}
            onVerifyClaim={onVerifyClaim}
            onResolveAlert={onResolveAlert}
            onOpenInEditor={onOpenInEditor ? () => onOpenInEditor(activeSection) : undefined}
            onApprove={onApproveSection ? () => onApproveSection(activeSection) : undefined}
            onSubmitForReview={onSubmitForReview ? () => onSubmitForReview(activeSection) : undefined}
          />
        ) : (
          <ZeroState
            onStartDrafting={() => {
              if (document.sections[0]) {
                handleSectionSelect(document.sections[0]);
              }
            }}
          />
        )}
      </div>
    </div>
  );
};

// Capitalized alias — esbuild/Vite treats lowercase JSX tags as native HTML elements
export const ECTDCoAuthor = eCTDCoAuthor;
export default eCTDCoAuthor;

// ── Auth helper ─────────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

// ── CTD Section draft templates (structured scaffolds per section) ───────────
const CTD_SECTION_SCAFFOLDS: Record<string, string> = {
  '2.5': `<h2>2.5 Clinical Overview</h2>
<h3>2.5.1 Product Development Rationale</h3>
<p>This section describes the rationale for developing the drug product, including the target indication, unmet medical need, and the pharmacological basis for the proposed therapy.</p>
<h3>2.5.2 Overview of Biopharmaceutics</h3>
<p>Summary of bioavailability, bioequivalence studies, and in vitro dissolution data demonstrating the biopharmaceutical properties of the formulation.</p>
<h3>2.5.3 Overview of Clinical Pharmacology</h3>
<p>Summary of pharmacokinetic and pharmacodynamic studies including dose-response relationships, special population PK, and drug-drug interaction studies.</p>
<h3>2.5.4 Overview of Efficacy</h3>
<p>Integrated summary of efficacy from pivotal and supportive clinical trials, including primary and secondary endpoint analyses.</p>
<h3>2.5.5 Overview of Safety</h3>
<p>Integrated safety analysis including adverse events, serious adverse events, deaths, laboratory findings, and vital signs across all clinical studies.</p>
<h3>2.5.6 Benefits and Risks Conclusions</h3>
<p>Overall benefit-risk assessment supported by clinical evidence and comparison to available therapeutic alternatives.</p>`,

  '2.7': `<h2>2.7 Clinical Summary</h2>
<h3>2.7.1 Summary of Biopharmaceutic Studies and Associated Analytical Methods</h3>
<p>Tabulated summary of bioavailability and bioequivalence studies with analytical methods used for drug concentration measurements.</p>
<h3>2.7.2 Summary of Clinical Pharmacology Studies</h3>
<p>Tabulated summary of PK, PD, and drug interaction studies with key parameters and conclusions.</p>
<h3>2.7.3 Summary of Clinical Efficacy</h3>
<p>Detailed summary of efficacy results from individual clinical studies with integrated analysis.</p>
<h3>2.7.4 Summary of Clinical Safety</h3>
<p>Comprehensive safety summary including exposure data, adverse events, and safety signals.</p>`,

  '3.2.S': `<h2>3.2.S Drug Substance</h2>
<h3>3.2.S.1 General Information</h3>
<p>Nomenclature, structure, and general properties of the drug substance including INN, chemical name, and molecular formula.</p>
<h3>3.2.S.2 Manufacture</h3>
<p>Description of the manufacturing process, process controls, and information on the manufacturer(s).</p>
<h3>3.2.S.3 Characterisation</h3>
<p>Elucidation of structure, physicochemical properties, and biological activity where applicable.</p>
<h3>3.2.S.4 Control of Drug Substance</h3>
<p>Specifications, analytical procedures, validation data, batch analyses, and justification of specifications.</p>
<h3>3.2.S.5 Reference Standards</h3>
<p>Information on primary and working reference standards used in testing.</p>
<h3>3.2.S.6 Container Closure System</h3>
<p>Description of the container closure system(s) and suitability for intended use.</p>
<h3>3.2.S.7 Stability</h3>
<p>Stability protocols, results, and proposed retest period with supporting data.</p>`,

  '3.2.P': `<h2>3.2.P Drug Product</h2>
<h3>3.2.P.1 Description and Composition</h3>
<p>Description of the dosage form and all components including active substance, excipients, and their functions.</p>
<h3>3.2.P.2 Pharmaceutical Development</h3>
<p>Development history including formulation development, overages, physicochemical/biological properties, and manufacturing process development.</p>
<h3>3.2.P.3 Manufacture</h3>
<p>Batch formula, manufacturing process description with process controls, and validation/evaluation data.</p>
<h3>3.2.P.4 Control of Excipients</h3>
<p>Specifications and analytical procedures for excipients, including those of biological origin.</p>
<h3>3.2.P.5 Control of Drug Product</h3>
<p>Specifications, analytical procedures, validation, batch analyses, and characterisation of impurities.</p>
<h3>3.2.P.6 Reference Standards</h3>
<p>Information on reference standards used for drug product testing.</p>
<h3>3.2.P.7 Container Closure System</h3>
<p>Description including materials, specifications, and suitability for intended use.</p>
<h3>3.2.P.8 Stability</h3>
<p>Stability protocols, results, post-approval commitments, and proposed shelf life.</p>`,

  '2.4': `<h2>2.4 Nonclinical Overview</h2>
<h3>2.4.1 Overview of Nonclinical Testing Strategy</h3>
<p>Discussion of the nonclinical pharmacology, pharmacokinetics, and toxicology program including GLP compliance.</p>
<h3>2.4.2 Pharmacology</h3>
<p>Summary of primary and secondary pharmacodynamic studies and safety pharmacology studies.</p>
<h3>2.4.3 Pharmacokinetics</h3>
<p>Summary of absorption, distribution, metabolism, and excretion data from nonclinical species.</p>
<h3>2.4.4 Toxicology</h3>
<p>Summary of single-dose, repeat-dose, genotoxicity, carcinogenicity, and reproductive toxicology studies.</p>`,

  '2.3': `<h2>2.3 Quality Overall Summary</h2>
<h3>2.3.S Drug Substance</h3>
<p>Summary of drug substance information including general information, manufacture, characterisation, control, reference standards, container closure, and stability.</p>
<h3>2.3.P Drug Product</h3>
<p>Summary of drug product information including description and composition, pharmaceutical development, manufacture, control, reference standards, container closure, and stability.</p>
<h3>2.3.A Appendices</h3>
<p>Summary of facilities, adventitious agents safety evaluation, and other relevant information.</p>`,
};

// ─── Standalone (zero-prop entry point using DEMO_ECTD_DOCUMENT) ────────────
export const ECTDCoAuthorStandalone: React.FC<{
  onOpenInEditor?: (section: DocumentSection) => void;
}> = ({ onOpenInEditor }) => {
  // Manage local copy of sections so drafting can update content
  const [docState, setDocState] = useState<eCTDDocument>(DEMO_ECTD_DOCUMENT);
  const [draftingSection, setDraftingSection] = useState<string | null>(null);
  const [signingSection, setSigningSection] = useState<DocumentSection | null>(null);

  // Submit for review: editing/ai_draft → in_review
  const handleSubmitForReview = useCallback((section: DocumentSection) => {
    setDocState(prev => ({
      ...prev,
      sections: updateSectionInTree(prev.sections, section.id, {
        status: 'in_review' as SectionStatus,
      }),
    }));
  }, []);

  // Approve with e-signature: in_review → approved (triggers signature gate)
  const handleApproveSection = useCallback((section: DocumentSection) => {
    setSigningSection(section);
  }, []);

  // Complete signature callback
  const handleSignatureComplete = useCallback((section: DocumentSection) => {
    const newSignature: SectionSignature = {
      id: `sig_${Date.now()}`,
      signerId: 'current-user',
      signerName: 'Current User',
      meaning: 'approval',
      timestamp: new Date().toISOString(),
      signatureHash: btoa(`${section.id}|approval|${Date.now()}`).slice(0, 24),
    };

    setDocState(prev => ({
      ...prev,
      sections: updateSectionInTree(prev.sections, section.id, {
        status: 'approved' as SectionStatus,
        signatures: [...(section.signatures || []), newSignature],
      }),
    }));
    setSigningSection(null);
  }, []);

  const handleDraftSection = useCallback(
    async (section: DocumentSection) => {
      setDraftingSection(section.id);

      // Update the section status to 'ai_drafting'
      setDocState(prev => ({
        ...prev,
        sections: updateSectionInTree(prev.sections, section.id, {
          status: 'ai_drafting' as SectionStatus,
        }),
      }));

      try {
        // Try the real API first
        const res = await fetch('/api/knowledge-base/generate-ind-section', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            sectionCode: section.number,
            sectionTitle: section.title,
            context: `CTD section for ${docState.submissionType} submission. Module: ${section.module}`,
          }),
        });

        let content: string;
        if (res.ok) {
          const data = await res.json();
          content = data.content || data.data?.content || '';
        } else {
          console.warn(`[eCTD] Draft API returned ${res.status}, using scaffold fallback`);
          content = CTD_SECTION_SCAFFOLDS[section.number] || generateDefaultScaffold(section);
        }

        // Persist as a governed artifact via save-docx-as-artifact endpoint
        if (content && content.trim().length > 0) {
          try {
            await fetch('/api/knowledge-base/save-docx-as-artifact', {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({
                projectId: docState.id?.replace(/^proj_/, '') || '0',
                title: `${section.number} — ${section.title}`,
                htmlContent: content,
                ctdSection: section.number,
                type: 'regulatory_document',
              }),
            });
          } catch (artifactErr) {
            console.warn('[eCTD] Artifact persistence failed (non-blocking):', artifactErr);
          }
        }

        // Update the section with real content
        setDocState(prev => ({
          ...prev,
          sections: updateSectionInTree(prev.sections, section.id, {
            status: 'editing' as SectionStatus,
            content,
            wordCount: content
              .replace(/<[^>]+>/g, ' ')
              .split(/\s+/)
              .filter(Boolean).length,
          }),
        }));
      } catch (err) {
        console.warn('[eCTD] Draft section failed, using scaffold fallback:', err);
        const content = CTD_SECTION_SCAFFOLDS[section.number] || generateDefaultScaffold(section);
        setDocState(prev => ({
          ...prev,
          sections: updateSectionInTree(prev.sections, section.id, {
            status: 'editing' as SectionStatus,
            content,
            wordCount: content
              .replace(/<[^>]+>/g, ' ')
              .split(/\s+/)
              .filter(Boolean).length,
          }),
        }));
      } finally {
        setDraftingSection(null);
      }
    },
    [docState.submissionType]
  );

  return (
    <>
      <ECTDCoAuthor
        document={docState}
        onOpenInEditor={onOpenInEditor}
        onDraftSection={handleDraftSection}
        onSubmitForReview={handleSubmitForReview}
        onApproveSection={handleApproveSection}
      />

      {/* 21 CFR Part 11 Electronic Signature Modal */}
      {signingSection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-green-700 to-green-800 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <ShieldCheck className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Electronic Signature Required</h2>
                  <p className="text-green-100 text-sm">21 CFR Part 11 Compliant</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                <h3 className="font-medium text-amber-900 mb-1 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Approval Declaration
                </h3>
                <p className="text-amber-800 text-sm">
                  I approve section <strong>{signingSection.number}: {signingSection.title}</strong> and
                  authorize it to proceed. My electronic signature has the same legal effect as a handwritten signature.
                </p>
              </div>
              <div className="p-3 bg-zinc-50 border rounded-lg text-sm mb-4">
                <div className="grid grid-cols-2 gap-2 text-zinc-600">
                  <div>Section: <strong>{signingSection.number}</strong></div>
                  <div>Words: <strong>{signingSection.wordCount.toLocaleString()}</strong></div>
                  <div>Module: <strong>{signingSection.module.toUpperCase()}</strong></div>
                  <div>Date: <strong>{new Date().toLocaleDateString()}</strong></div>
                </div>
              </div>
              <p className="text-xs text-zinc-500 mb-4">
                This action will create an immutable audit trail entry and lock the section from further editing.
                Signature is cryptographically bound to the document content hash.
              </p>
            </div>
            <div className="px-6 py-4 bg-zinc-50 border-t flex justify-between">
              <button
                onClick={() => setSigningSection(null)}
                className="px-4 py-2 text-zinc-700 hover:text-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSignatureComplete(signingSection)}
                className="px-6 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 flex items-center gap-2"
              >
                <FileSignature className="h-4 w-4" />
                Sign &amp; Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Helper: recursively update a section in the tree
function updateSectionInTree(
  sections: DocumentSection[],
  id: string,
  updates: Partial<DocumentSection>
): DocumentSection[] {
  return sections.map(s => {
    if (s.id === id) return { ...s, ...updates };
    if (s.children?.length) {
      return { ...s, children: updateSectionInTree(s.children, id, updates) };
    }
    return s;
  });
}

// Helper: generate a default scaffold for sections without a template
function generateDefaultScaffold(section: DocumentSection): string {
  return `<h2>${section.number} ${section.title}</h2>
<h3>Purpose</h3>
<p>This section provides the required information for ${section.title} as specified in the CTD/eCTD format guidelines.</p>
<h3>Scope</h3>
<p>The content herein covers all regulatory requirements applicable to this section per ICH M4 guidelines.</p>
<h3>Content</h3>
<p>[Draft content based on available source data. Review and refine as needed.]</p>
<h3>References</h3>
<p>[Cross-references to supporting data, study reports, and regulatory guidance documents.]</p>`;
}
