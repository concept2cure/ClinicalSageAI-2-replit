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

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
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
  Search,
  BookOpen,
  MessageSquare,
  RotateCcw,
  Plus,
  Settings,
  Download,
  Shield,
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
  m1: { label: 'M1', fullName: 'Administrative', color: 'text-slate-600', bgColor: 'bg-slate-100' },
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
    color: 'text-slate-400',
    bgColor: 'bg-slate-50',
    icon: <div className="w-3 h-3 rounded-full border-2 border-dashed border-slate-300" />,
  },
  ai_drafting: {
    label: 'RI Drafting...',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    icon: <Sparkles className="w-3 h-3 animate-pulse" />,
  },
  ai_draft: {
    label: 'RI Draft',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    icon: <Sparkles className="w-3 h-3" />,
  },
  editing: {
    label: 'Editing',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    icon: <Edit3 className="w-3 h-3" />,
  },
  in_review: {
    label: 'In Review',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    icon: <Eye className="w-3 h-3" />,
  },
  approved: {
    label: 'Approved',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    icon: <CheckCircle className="w-3 h-3" />,
  },
  locked: {
    label: 'Locked',
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
    icon: <Shield className="w-3 h-3" />,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ZERO STATE - THE SHERPA GREETING
// ═══════════════════════════════════════════════════════════════════════════════

const ZeroState: React.FC<{ onStartDrafting?: () => void }> = ({ onStartDrafting }) => (
  <div className="flex-1 flex items-center justify-center p-8">
    <div className="text-center max-w-md">
      <div className="w-16 h-16 mx-auto mb-6 rounded-xl bg-slate-900 flex items-center justify-center shadow-sm">
        <Mountain className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900 mb-3">Your Sherpa is Ready</h2>
      <p className="text-slate-600 mb-6 leading-relaxed">
        I'll help you draft your regulatory documents, verify every claim against your source data,
        and ensure you reach the summit of approval safely.
      </p>
      <p className="text-sm text-slate-500 mb-6 italic">
        "You don't write from scratch. Click 'Draft' and I'll carry the burden of the first draft -
        citing every claim with Smart Tags that connect you to your data."
      </p>
      <button
        onClick={onStartDrafting}
        className="px-5 py-2.5 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 shadow-sm transition-colors flex items-center gap-2 mx-auto"
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
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors',
                'hover:bg-slate-100',
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
                  className="p-0.5 hover:bg-slate-200 rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                  )}
                </button>
              ) : (
                <div className="w-4" />
              )}

              {/* Status Icon */}
              <div className={statusConfig.color}>{statusConfig.icon}</div>

              {/* Section Number & Title */}
              <div className="flex-1 min-w-0">
                <span className="text-xs font-mono text-slate-400 mr-2">{section.number}</span>
                <span
                  className={cn(
                    'text-sm truncate',
                    isSelected ? 'font-medium text-blue-700' : 'text-slate-700'
                  )}
                >
                  {section.title}
                </span>
              </div>

              {/* Alerts Badge */}
              {section.redlineAlerts && section.redlineAlerts.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded">
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
        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border cursor-pointer transition-colors',
        'hover:shadow-sm',
        c.color,
        !tag.isVerified && 'border-dashed opacity-75'
      )}
      onClick={tag.onClick || onVerify}
      title={tag.isVerified ? `Verified: ${tag.sourceName}` : 'Click to verify claim'}
    >
      {c.icon}
      {tag.text}
      {tag.pageRef && <span className="text-[10px] opacity-75">p.{tag.pageRef}</span>}
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
        <h4 className="text-sm font-bold text-red-800">Safety Line Alerts</h4>
        <span className="px-2 py-0.5 text-xs font-bold bg-red-200 text-red-800 rounded-full">
          {alerts.length}
        </span>
      </div>
      <div className="space-y-3">
        {alerts.map(alert => (
          <div key={alert.id} className="bg-white rounded-lg p-3 border border-red-200">
            <div className="flex items-start justify-between mb-2">
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-bold rounded uppercase',
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
}> = ({ section, onDraft, onVerifyClaim, onResolveAlert, onOpenInEditor }) => {
  const statusConfig = STATUS_CONFIG[section.status];
  const moduleConfig = MODULE_CONFIG[section.module];

  return (
    <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                'px-2 py-0.5 text-xs font-bold rounded',
                moduleConfig.bgColor,
                moduleConfig.color
              )}
            >
              {moduleConfig.label}
            </span>
            <span className="text-sm font-mono text-slate-500">{section.number}</span>
          </div>
          <h2 className="text-lg font-semibold text-slate-800">{section.title}</h2>
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
      <div className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50/50">
        <button
          onClick={onDraft}
          className="px-3 py-1.5 text-sm font-medium bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {section.status === 'empty' ? 'Draft with RI' : 'Regenerate'}
        </button>
        <button className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg" title="Edit">
          <Edit3 className="w-4 h-4" />
        </button>
        <button className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg" title="Preview">
          <Eye className="w-4 h-4" />
        </button>
        <button className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg" title="Save">
          <Save className="w-4 h-4" />
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

        <div className="flex-1" />
        <button className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg" title="Find sources">
          <Search className="w-4 h-4" />
        </button>
        <button className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg" title="Comments">
          <MessageSquare className="w-4 h-4" />
        </button>
      </div>

      {/* Redline Alerts */}
      {section.redlineAlerts && section.redlineAlerts.length > 0 && (
        <div className="p-4 border-b border-slate-200">
          <RedlineAlertPanel alerts={section.redlineAlerts} onResolve={onResolveAlert} />
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        {section.status === 'empty' ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-600 mb-2">Section Not Yet Drafted</h3>
            <p className="text-sm text-slate-500 mb-4 max-w-sm mx-auto">
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
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
              <Sparkles className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-lg font-medium text-blue-700 mb-2">RI is Drafting...</h3>
            <p className="text-sm text-slate-500">
              Analyzing source documents and generating content with Smart Tags
            </p>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none">
            {section.content ? (
              <div
                className="text-slate-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: section.content }}
              />
            ) : (
              <p className="text-slate-400 italic">No content available</p>
            )}

            {/* Smart Tags Display */}
            {section.smartTags.length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-200">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Smart Tags ({section.smartTags.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {section.smartTags.map(tag => (
                    <SmartTagBadge key={tag.id} tag={tag} onVerify={() => onVerifyClaim?.(tag)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
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
      content: '',
      smartTags: [],
      wordCount: 0,
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
      content: '',
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
      status: 'empty',
      content: '',
      smartTags: [],
      wordCount: 0,
    },
    {
      id: 'm3-drug',
      number: '3.2.S',
      title: 'Drug Substance (CMC)',
      module: 'm3',
      status: 'in_review',
      content: '',
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
      status: 'empty',
      content: '',
      smartTags: [],
      wordCount: 0,
    },
    {
      id: 'm4-pharm',
      number: '4.2.1',
      title: 'Primary Pharmacology',
      module: 'm4',
      status: 'ai_draft',
      content: '',
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
      status: 'empty',
      content: '',
      smartTags: [],
      wordCount: 0,
    },
    {
      id: 'm5-protocol',
      number: '5.3.5.1',
      title: 'Phase 1 Clinical Protocol',
      module: 'm5',
      status: 'editing',
      content: '',
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
  className,
}) => {
  const [activeSection, setActiveSection] = useState<DocumentSection | undefined>(selectedSection);

  const handleSectionSelect = (section: DocumentSection) => {
    setActiveSection(section);
    onSectionSelect?.(section);
  };

  return (
    <div className={cn('flex h-full bg-slate-50', className)}>
      {/* Left Panel: Document Outline */}
      <div className="w-80 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">{document.name}</h2>
              <p className="text-xs text-slate-500">
                {document.submissionType} • v{document.version}
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Progress</span>
              <span className="font-medium text-slate-700">{document.overallProgress}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full"
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
        <div className="p-3 border-t border-slate-200">
          <button className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
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

export default eCTDCoAuthor;

// ─── Standalone (zero-prop entry point using DEMO_ECTD_DOCUMENT) ────────────
export const ECTDCoAuthorStandalone: React.FC<{
  onOpenInEditor?: (section: DocumentSection) => void;
}> = ({ onOpenInEditor }) => (
  <eCTDCoAuthor document={DEMO_ECTD_DOCUMENT} onOpenInEditor={onOpenInEditor} />
);
