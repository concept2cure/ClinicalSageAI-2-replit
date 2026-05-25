/**
 * Document Workspace - The Unified Intelligent Document Experience
 * 
 * Phase 5: Redesigned with SHERPA metaphor
 * 
 * This is the ONE place users go to work on regulatory documents.
 * - Auto-detects claims as you type
 * - Suggests sources from ALL connected modules
 * - Prevents compliance errors before they happen
 * - Guides you to the next best action
 * - Pulls data from predicates, CMC, clinical trials automatically
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { useCspNonce } from '@/hooks/useCspNonce';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import {
  FileText,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowRight,
  Link2,
  BookOpen,
  Database,
  RefreshCw,
  Save,
  Clock,
  Target,
  Lightbulb,
  Zap,
  Shield,
  Activity,
  ExternalLink,
  X,
  Command,
  Users,
} from 'lucide-react';
import type {
  IntelligentDocument,
  SmartClaim,
  SourceSuggestion,
  ComplianceGuard,
  SherpaGuidance,
  DocumentBlocker,
  DataBridgeConnection,
  DocumentWorkspaceState,
  ClaimType,
  DataModule,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentWorkspaceProps {
  // Document to edit (null for new document)
  document?: IntelligentDocument | null;
  
  // Submission context - what workflow is this part of?
  submissionType?: 'IND' | '510K' | 'NDA' | 'BLA' | 'PMA' | 'CER' | 'MAA' | 'DE_NOVO';
  projectId?: string;
  
  // Pre-loaded data from other modules
  predicateDevices?: any[];
  literatureData?: any[];
  cmcData?: any[];
  clinicalData?: any[];
  
  // Callbacks
  onSave?: (document: IntelligentDocument) => Promise<void>;
  onExport?: (format: 'word' | 'pdf') => Promise<void>;
  onRequestReview?: () => Promise<void>;
  
  // Feature flags
  enableAutoSave?: boolean;
  enableAIAssist?: boolean;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance Status Badge
// ─────────────────────────────────────────────────────────────────────────────

const ComplianceStatusBadge: React.FC<{ 
  status: 'ready' | 'needs-attention' | 'blocked';
  score: number;
}> = ({ status, score }) => {
  const config = {
    ready: { 
      icon: CheckCircle, 
      label: 'Ready', 
      color: 'bg-green-100 text-green-700 border-green-200'
    },
    'needs-attention': { 
      icon: AlertTriangle, 
      label: 'Needs Attention', 
      color: 'bg-amber-100 text-amber-700 border-amber-200'
    },
    blocked: { 
      icon: XCircle, 
      label: 'Blocked', 
      color: 'bg-red-100 text-red-700 border-red-200'
    },
  };
  
  const { icon: Icon, label, color } = config[status];
  
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${color}`}>
      <Icon className="w-4 h-4" />
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm opacity-75">({score}%)</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Source Suggestion Card - Clean, actionable
// ─────────────────────────────────────────────────────────────────────────────

const SourceSuggestionCard: React.FC<{
  source: SourceSuggestion;
  onLink: () => void;
  onPreview: () => void;
}> = ({ source, onLink, onPreview }) => {
  const getSourceIcon = (type: SourceSuggestion['sourceType']) => {
    switch (type) {
      case 'clinical_study': return <Activity className="w-4 h-4 text-purple-500" />;
      case 'predicate_device': return <Target className="w-4 h-4 text-blue-500" />;
      case 'literature': return <BookOpen className="w-4 h-4 text-green-500" />;
      case 'test_report': return <FileText className="w-4 h-4 text-orange-500" />;
      case 'regulatory_document': return <Shield className="w-4 h-4 text-blue-500" />;
      default: return <Database className="w-4 h-4 text-stone-500" />;
    }
  };
  
  const getModuleLabel = (module: DataModule) => {
    const labels: Record<DataModule, string> = {
      predicate_finder: 'From Predicate Search',
      literature_search: 'From Literature',
      cmc_data: 'From CMC',
      clinical_trials: 'From Clinical',
      vault: 'From Vault',
      maude: 'From MAUDE',
      faers: 'From FAERS',
      intelligence_feeds: 'From Intel Feeds',
    };
    return labels[module] || module;
  };
  
  return (
    <div className="p-3 bg-white rounded-lg border border-stone-200 hover:border-blue-300 transition-colors duration-150">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-stone-100 rounded-lg">
          {getSourceIcon(source.sourceType)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-stone-900 truncate">
              {source.title}
            </h4>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-stone-700 rounded-full text-xs">
              {source.relevanceScore}% match
            </span>
          </div>
          <p className="text-xs text-stone-500 mb-2">
            {getModuleLabel(source.dataModule)}
          </p>
          <p className="text-sm text-stone-600 line-clamp-2 italic">
            "{source.keyExcerpt}"
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-stone-200">
        <button
          onClick={onLink}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 text-white rounded-md text-sm font-medium hover:bg-stone-900 transition-colors duration-150"
          data-testid={`button-link-source-${source.id}`}
        >
          <Link2 className="w-3.5 h-3.5" />
          Link to Claim
        </button>
        <button
          onClick={onPreview}
          className="flex items-center gap-1.5 px-3 py-1.5 text-stone-600 hover:bg-stone-100 rounded-md text-sm transition-colors duration-150"
          data-testid={`button-preview-source-${source.id}`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Preview
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Command Center Panel - simplified action hub
// ─────────────────────────────────────────────────────────────────────────────

const CommandCenterPanel: React.FC<{
  documentTitle: string;
  complianceScore: number;
  complianceStatus: 'ready' | 'needs-attention' | 'blocked';
  totalClaims: number;
  unsupportedClaims: number;
  availableSources: number;
  connectedModules: number;
  guidance: SherpaGuidance[];
  blockers: DocumentBlocker[];
  onOpenSources: () => void;
  onOpenCompliance: () => void;
  onOpenBridges: () => void;
  onOpenSherpa: () => void;
  onRequestReview?: () => void;
  onExport?: (format: 'word' | 'pdf') => void;
}> = ({
  documentTitle,
  complianceScore,
  complianceStatus,
  totalClaims,
  unsupportedClaims,
  availableSources,
  connectedModules,
  guidance,
  blockers,
  onOpenSources,
  onOpenCompliance,
  onOpenBridges,
  onOpenSherpa,
  onRequestReview,
  onExport,
}) => {
  const statusMap = {
    ready: {
      label: 'Submission Ready',
      color: 'text-green-600',
      bg: 'bg-green-50',
      icon: CheckCircle,
    },
    'needs-attention': {
      label: 'Needs Attention',
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      icon: AlertTriangle,
    },
    blocked: {
      label: 'Blocked',
      color: 'text-red-600',
      bg: 'bg-red-50',
      icon: XCircle,
    },
  } as const;

  const StatusIcon = statusMap[complianceStatus].icon;

  const handleGuidanceAction = (item: SherpaGuidance) => {
    switch (item.actionType) {
      case 'add-sources':
      case 'review-claims':
        onOpenSources();
        return;
      case 'update-from-module':
        onOpenBridges();
        return;
      case 'request-review':
      case 'submit-for-approval':
        onRequestReview?.();
        return;
      case 'export-document':
        onExport?.('pdf');
        return;
      default:
        onOpenSherpa();
    }
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border border-stone-200/70 p-4 shadow-sm ${statusMap[complianceStatus].bg}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-500">Command Center</p>
            <h3 className="text-lg font-semibold text-stone-900 line-clamp-1">
              {documentTitle}
            </h3>
          </div>
          <div className={`flex items-center gap-2 ${statusMap[complianceStatus].color}`}>
            <StatusIcon className="w-5 h-5" />
            <span className="text-sm font-medium">{statusMap[complianceStatus].label}</span>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>Compliance Score</span>
            <span>{complianceScore}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-white/70">
            <div className="h-2 rounded-full bg-stone-600" style={{ width: `${complianceScore}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onOpenSources}
          className="p-3 rounded-xl border border-stone-200 bg-white hover:border-blue-300 transition-colors text-left shadow-sm hover:shadow"
          data-testid="button-command-link-sources"
        >
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-stone-900">Link Sources</span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {unsupportedClaims} claims need evidence
          </p>
        </button>
        <button
          onClick={onOpenCompliance}
          className="p-3 rounded-xl border border-stone-200 bg-white hover:border-amber-300 transition-colors text-left shadow-sm hover:shadow"
          data-testid="button-command-resolve-issues"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-stone-900">Resolve Issues</span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {availableSources > 0 ? 'Auto-fix ready' : 'Manual review'}
          </p>
        </button>
        <button
          onClick={onOpenBridges}
          className="p-3 rounded-xl border border-stone-200 bg-white hover:border-blue-300 transition-colors text-left shadow-sm hover:shadow"
          data-testid="button-command-sync-data"
        >
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-stone-900">Sync Data</span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {connectedModules} modules connected
          </p>
        </button>
        <div className="p-3 rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span className="text-sm font-medium text-stone-900">Claims</span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {totalClaims} detected in document
          </p>
        </div>
      </div>

      {(blockers.length > 0 || guidance.length > 0) && (
        <div className="rounded-xl border border-stone-200/70 bg-white p-4 space-y-3 shadow-sm">
          {blockers.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-500">Blockers</p>
              <div className="mt-2 space-y-2">
                {blockers.slice(0, 2).map(blocker => (
                  <div key={blocker.id} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-stone-900">{blocker.title}</p>
                      <p className="text-xs text-stone-500">{blocker.resolution}</p>
                    </div>
                    <button
                      onClick={onOpenCompliance}
                      className="text-xs font-medium text-red-600 hover:underline"
                      data-testid={`button-resolve-blocker-${blocker.id}`}
                    >
                      Resolve
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {guidance.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-500">Next Best Actions</p>
              <div className="mt-2 space-y-2">
                {guidance.slice(0, 3).map(item => (
                  <div key={item.id} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-stone-900">{item.title}</p>
                      <p className="text-xs text-stone-500">{item.estimatedTime}</p>
                    </div>
                    <button
                      onClick={() => handleGuidanceAction(item)}
                      className="text-xs font-medium text-blue-600 hover:underline"
                      data-testid={`button-guidance-action-${item.id}`}
                    >
                      Do
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {onRequestReview && complianceScore >= 90 && (
          <button
            onClick={onRequestReview}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm hover:shadow"
            data-testid="button-request-review"
          >
            <Users className="w-4 h-4" />
            Request Review & Approval
          </button>
        )}
        {onExport && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onExport('word')}
              className="px-3 py-2 text-sm font-medium border border-stone-200 rounded-lg hover:bg-stone-50"
              data-testid="button-export-word"
            >
              Export Word
            </button>
            <button
              onClick={() => onExport('pdf')}
              className="px-3 py-2 text-sm font-medium border border-stone-200 rounded-lg hover:bg-stone-50"
              data-testid="button-export-pdf"
            >
              Export PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Compliance Guard Card - Clear action required
// ─────────────────────────────────────────────────────────────────────────────

const ComplianceGuardCard: React.FC<{
  guard: ComplianceGuard;
  onAction: () => void;
  onDismiss?: () => void;
}> = ({ guard, onAction, onDismiss }) => {
  const severityConfig = {
    error: { 
      icon: XCircle, 
      color: 'border-red-200 bg-red-50',
      iconColor: 'text-red-500'
    },
    warning: { 
      icon: AlertTriangle, 
      color: 'border-amber-200 bg-amber-50',
      iconColor: 'text-amber-500'
    },
    suggestion: { 
      icon: Lightbulb, 
      color: 'border-blue-200 bg-blue-50',
      iconColor: 'text-blue-500'
    },
  };
  
  const { icon: Icon, color, iconColor } = severityConfig[guard.severity];
  
  return (
    <div className={`p-3 rounded-lg border ${color}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-stone-900">
            {guard.title}
          </h4>
          <p className="text-sm text-stone-600 mt-1">
            {guard.description}
          </p>
          {guard.affectedText && (
            <p className="text-xs text-stone-500 mt-2 p-2 bg-white/50 rounded italic">
              "{guard.affectedText}"
            </p>
          )}
        </div>
        {onDismiss && guard.severity === 'suggestion' && (
          <button
            onClick={onDismiss}
            className="p-1 text-stone-400 hover:text-stone-600"
            data-testid={`button-dismiss-guard-${guard.id}`}
            aria-label="Dismiss suggestion"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={onAction}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
            ${guard.severity === 'error' 
              ? 'bg-red-600 text-white hover:bg-red-700' 
              : guard.severity === 'warning'
              ? 'bg-amber-600 text-white hover:bg-amber-700'
              : 'bg-stone-800 text-white hover:bg-stone-900'
            }`}
          data-testid={`button-guard-action-${guard.id}`}
        >
          {guard.action.autoFixAvailable ? (
            <>
              <Zap className="w-3.5 h-3.5" />
              Auto-Fix
            </>
          ) : (
            <>
              <ArrowRight className="w-3.5 h-3.5" />
              {guard.action.label}
            </>
          )}
        </button>
        {guard.regulatoryRef && (
          <span className="text-xs text-stone-500">
            Ref: {guard.regulatoryRef}
          </span>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sherpa Guidance Card - The next best action
// ─────────────────────────────────────────────────────────────────────────────

const SherpaGuidanceCard: React.FC<{
  guidance: SherpaGuidance;
  isNextBest?: boolean;
  onAction: () => void;
}> = ({ guidance, isNextBest, onAction }) => {
  const priorityConfig = {
    high: { color: 'border-stone-600', badge: 'bg-stone-600 text-white' },
    medium: { color: 'border-stone-300', badge: 'bg-stone-500 text-white' },
    low: { color: 'border-stone-200', badge: 'bg-stone-400 text-white' },
  };
  
  const { color, badge } = priorityConfig[guidance.priority];
  
  return (
    <div className={`p-4 rounded-lg border ${color} ${isNextBest ? 'bg-blue-50' : 'bg-white'}`}>
      {isNextBest && (
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
            Recommended Next Step
          </span>
        </div>
      )}
      
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-full ${badge}`}>
          <Target className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-stone-900">
            {guidance.title}
          </h4>
          <p className="text-sm text-stone-600 mt-1">
            {guidance.description}
          </p>
          <div className="flex items-center gap-4 mt-3 text-xs text-stone-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {guidance.estimatedTime}
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" />
              {guidance.expectedOutcome}
            </span>
          </div>
        </div>
      </div>
      
      <button
        onClick={onAction}
        className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-stone-800 text-white rounded-lg font-medium hover:bg-stone-900 transition-colors duration-150"
        data-testid={`button-sherpa-action-${guidance.id}`}
      >
        <ArrowRight className="w-4 h-4" />
        Start This Step
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Data Bridge Card - Connection to other modules
// ─────────────────────────────────────────────────────────────────────────────

const DataBridgeCard: React.FC<{
  bridge: DataBridgeConnection;
  onSync: () => void;
  onView: () => void;
}> = ({ bridge, onSync, onView }) => {
  const statusConfig = {
    connected: { icon: CheckCircle, color: 'text-green-500', label: 'Connected' },
    available: { icon: Database, color: 'text-blue-500', label: 'Available' },
    'needs-update': { icon: RefreshCw, color: 'text-amber-500', label: 'Needs Update' },
    missing: { icon: XCircle, color: 'text-stone-400', label: 'No Data' },
  };
  
  const { icon: Icon, color, label } = statusConfig[bridge.status];
  
  const moduleLabels: Record<DataModule, string> = {
    predicate_finder: 'Predicate Devices',
    literature_search: 'Literature Search',
    cmc_data: 'CMC Data',
    clinical_trials: 'Clinical Trials',
    vault: 'Document Vault',
    maude: 'MAUDE Database',
    faers: 'FAERS Database',
    intelligence_feeds: 'Intel Feeds',
  };
  
  return (
    <div className="p-3 bg-white rounded-lg border border-stone-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-stone-400" />
          <span className="font-medium text-stone-700">
            {moduleLabels[bridge.sourceModule]}
          </span>
        </div>
        <div className={`flex items-center gap-1 ${color}`}>
          <Icon className="w-4 h-4" />
          <span className="text-xs">{label}</span>
        </div>
      </div>
      
      <p className="text-sm text-stone-600 mb-2">
        {bridge.preview}
      </p>
      
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span>{bridge.itemCount} items available</span>
        <div className="flex items-center gap-2">
          {bridge.status === 'needs-update' && (
            <button
              onClick={onSync}
              className="flex items-center gap-1 text-amber-600 hover:text-amber-700"
              data-testid={`button-bridge-sync-${bridge.id}`}
            >
              <RefreshCw className="w-3 h-3" />
              Sync
            </button>
          )}
          <button
            onClick={onView}
            className="flex items-center gap-1 text-blue-600 hover:text-stone-700"
            data-testid={`button-bridge-view-${bridge.id}`}
          >
            <ExternalLink className="w-3 h-3" />
            View
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Document Workspace Component
// ─────────────────────────────────────────────────────────────────────────────

export const DocumentWorkspace: React.FC<DocumentWorkspaceProps> = ({
  document: initialDocument,
  submissionType,
  projectId: _projectId,
  predicateDevices = [],
  literatureData = [],
  cmcData = [],
  clinicalData = [],
  onSave,
  onExport,
  onRequestReview,
  enableAutoSave = true,
  enableAIAssist = true,
  className = '',
}) => {
  // ─────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────

  const [state, setState] = useState<DocumentWorkspaceState>({
    document: initialDocument || null,
    detectedClaims: [],
    availableSources: [],
    complianceGuards: [],
    sherpaGuidance: [],
    blockers: [],
    dataBridges: [],
    selectedClaim: null,
    isPanelOpen: true,
    activePanel: 'command',
    isSaving: false,
    hasUnsavedChanges: false,
    lastSavedAt: null,
  });

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claimDetectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Editor Setup
  // ─────────────────────────────────────────────────────────────────────────

  const cspNonce = useCspNonce();
  const editor = useEditor({
    injectNonce: cspNonce || undefined,
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({
        placeholder: 'Start writing your regulatory document...',
      }),
      CharacterCount,
    ],
    content: initialDocument?.content || '',
    onUpdate: ({ editor }) => {
      setState(prev => ({ ...prev, hasUnsavedChanges: true }));
      
      // Debounced claim detection
      if (claimDetectionTimerRef.current) {
        clearTimeout(claimDetectionTimerRef.current);
      }
      claimDetectionTimerRef.current = setTimeout(() => {
        detectClaims(editor.getText());
      }, 1000);
      
      // Auto-save
      if (enableAutoSave) {
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }
        autoSaveTimerRef.current = setTimeout(() => {
          handleSave();
        }, 3000);
      }
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Initialize data bridges from props
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const bridges: DataBridgeConnection[] = [];
    
    if (predicateDevices.length > 0) {
      bridges.push({
        id: 'bridge-predicates',
        sourceModule: 'predicate_finder',
        targetDocumentId: initialDocument?.id || '',
        dataType: 'predicate_devices',
        dataLabel: 'Predicate Devices',
        status: 'connected',
        // keep lastSyncedAt stable across renders where possible
        lastSyncedAt: new Date(),
        preview: `${predicateDevices.length} predicate device(s) available for citation`,
        itemCount: predicateDevices.length,
      });
    }
    
    if (literatureData.length > 0) {
      bridges.push({
        id: 'bridge-literature',
        sourceModule: 'literature_search',
        targetDocumentId: initialDocument?.id || '',
        dataType: 'literature_citations',
        dataLabel: 'Literature Citations',
        status: 'connected',
        lastSyncedAt: new Date(),
        preview: `${literatureData.length} literature source(s) available`,
        itemCount: literatureData.length,
      });
    }
    
    if (cmcData.length > 0) {
      bridges.push({
        id: 'bridge-cmc',
        sourceModule: 'cmc_data',
        targetDocumentId: initialDocument?.id || '',
        dataType: 'manufacturing_specs',
        dataLabel: 'Manufacturing Data',
        status: 'connected',
        lastSyncedAt: new Date(),
        preview: `${cmcData.length} CMC data point(s) available`,
        itemCount: cmcData.length,
      });
    }
    
    // Generate initial sources from all data
    const sources = generateSourceSuggestions(predicateDevices, literatureData, cmcData, clinicalData);

    // Avoid unnecessary state updates which can cause render loops in tests by
    // performing a shallow/deep comparison and only updating when values differ.
    setState(prev => {
      try {
        const prevBridges = JSON.stringify(prev.dataBridges || []);
        const prevSources = JSON.stringify(prev.availableSources || []);
        const nextBridges = JSON.stringify(bridges || []);
        const nextSources = JSON.stringify(sources || []);

        if (prevBridges === nextBridges && prevSources === nextSources) {
          return prev; // no change
        }
      } catch (e) {
        // Fallback - if stringify fails, proceed with update
      }

      return {
        ...prev,
        dataBridges: bridges,
        availableSources: sources,
      };
    });
  }, [predicateDevices, literatureData, cmcData, clinicalData, initialDocument?.id]);

  // ─────────────────────────────────────────────────────────────────────────
  // Generate source suggestions from all connected modules
  // ─────────────────────────────────────────────────────────────────────────

  const generateSourceSuggestions = (
    predicates: any[],
    literature: any[],
    cmc: any[],
    clinical: any[]
  ): SourceSuggestion[] => {
    const sources: SourceSuggestion[] = [];
    
    // Convert predicate devices to sources
    predicates.forEach((device, i) => {
      sources.push({
        id: `pred-${device.id || i}`,
        title: device.device_name || device.deviceName || `Predicate Device ${i + 1}`,
        sourceType: 'predicate_device',
        citation: `FDA 510(k) ${device.k_number || device.kNumber || 'K000000'} - ${device.device_name || device.deviceName}`,
        relevanceScore: device.similarity_score || 85,
        keyExcerpt: device.statement_or_summary || device.intendedUse || 'Predicate device for substantial equivalence comparison',
        pageReference: device.k_number || device.kNumber,
        dataModule: 'predicate_finder',
        isLinked: false,
      });
    });
    
    // Convert literature to sources
    literature.forEach((paper, i) => {
      sources.push({
        id: `lit-${paper.id || i}`,
        title: paper.title || `Literature Source ${i + 1}`,
        sourceType: 'literature',
        citation: paper.citation || `${paper.authors?.[0] || 'Author'} et al. (${paper.year || new Date().getFullYear()})`,
        relevanceScore: paper.relevanceScore || paper.score || 75,
        keyExcerpt: paper.abstract?.slice(0, 200) || paper.excerpt || 'Supporting literature for clinical claims',
        pageReference: paper.doi || paper.pmid,
        dataModule: 'literature_search',
        isLinked: false,
      });
    });

    // Convert CMC data to sources
    cmc.forEach((item, i) => {
      sources.push({
        id: `cmc-${item.id || i}`,
        title: item.title || item.material || item.specName || `CMC Data ${i + 1}`,
        sourceType: 'manufacturing_record',
        citation: item.citation || item.batchId || item.specId || `CMC Record ${i + 1}`,
        relevanceScore: item.relevanceScore || item.score || 80,
        keyExcerpt: item.summary || item.description || 'Manufacturing data supporting process controls',
        pageReference: item.reference || item.batchId || item.specId,
        dataModule: 'cmc_data',
        isLinked: false,
      });
    });

    // Convert clinical data to sources
    clinical.forEach((study, i) => {
      sources.push({
        id: `clin-${study.id || i}`,
        title: study.title || study.studyName || `Clinical Study ${i + 1}`,
        sourceType: 'clinical_study',
        citation: study.citation || study.nctId || study.studyId || `Clinical Study ${i + 1}`,
        relevanceScore: study.relevanceScore || study.score || 82,
        keyExcerpt: study.summary || study.primaryOutcome || 'Clinical evidence supporting efficacy/safety claims',
        pageReference: study.nctId || study.studyId,
        dataModule: 'clinical_trials',
        isLinked: false,
      });
    });
    
    // Sort by relevance
    return sources.sort((a, b) => b.relevanceScore - a.relevanceScore);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // AI Claim Detection (simulated - would be real AI in production)
  // ─────────────────────────────────────────────────────────────────────────

  const detectClaims = useCallback((text: string) => {
    if (!enableAIAssist) return;
    
    // Patterns that indicate claims needing sources
    const claimPatterns = [
      { pattern: /\b(demonstrated?|showed?|proven?|established?)\s+\w+/gi, type: 'efficacy' as ClaimType },
      { pattern: /\b(\d+\.?\d*)\s*%\s*(efficacy|accuracy|sensitivity|specificity)/gi, type: 'statistical' as ClaimType },
      { pattern: /\b(no|zero|minimal)\s+(adverse|side)\s+effects?/gi, type: 'safety' as ClaimType },
      { pattern: /\b(FDA\s*cleared?|510\(k\)|predicate)/gi, type: 'regulatory' as ClaimType },
      { pattern: /\b(clinical\s+trial|study|investigation)\s+\w+/gi, type: 'clinical' as ClaimType },
      { pattern: /\bp\s*[<>=]\s*0\.\d+/gi, type: 'statistical' as ClaimType },
      { pattern: /\b(superior|better|improved|enhanced)\s+(to|than|compared)/gi, type: 'comparison' as ClaimType },
    ];
    
    const detectedClaims: SmartClaim[] = [];
    const hasSources = state.availableSources.length > 0;
    
    claimPatterns.forEach(({ pattern, type }) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // Check if this claim overlaps with existing ones
        const from = match.index;
        const to = match.index + match[0].length;
        const overlaps = detectedClaims.some(
          c => (from >= c.position.from && from <= c.position.to) ||
               (to >= c.position.from && to <= c.position.to)
        );
        
        if (!overlaps) {
          detectedClaims.push({
            id: `claim-${from}-${to}`,
            text: match[0],
            position: { from, to },
            claimType: type,
            detectionConfidence: 75 + Math.random() * 20, // 75-95%
            sourceStatus: hasSources ? 'needs-source' : 'unsupported',
            linkedSources: [],
          });
        }
      }
    });
    
    // Generate compliance guards based on claims
    const guards: ComplianceGuard[] = detectedClaims
      .filter(c => c.sourceStatus === 'needs-source')
      .slice(0, 5) // Limit to top 5
      .map(claim => ({
        id: `guard-${claim.id}`,
        type: 'unsupported_claim',
        severity: 'warning' as const,
        title: 'Claim needs supporting evidence',
        description: `The ${claim.claimType} claim requires a source reference for regulatory compliance.`,
        action: {
          type: 'link-source' as const,
          label: 'Add Source',
          autoFixAvailable: state.availableSources.length > 0,
        },
        position: claim.position,
        affectedText: claim.text,
        regulatoryRef: submissionType === '510K' ? '21 CFR 807.87' : submissionType === 'IND' ? '21 CFR 312.23' : undefined,
      }));
    
    // Generate blockers based on missing dependencies
    const blockers: DocumentBlocker[] = [];
    if ((submissionType === '510K' || submissionType === 'DE_NOVO') && predicateDevices.length === 0) {
      blockers.push({
        id: 'blocker-predicate',
        title: 'Predicate device not connected',
        description: '510(k) submissions require a predicate device for substantial equivalence.',
        blocker: 'Predicate data missing',
        resolution: 'Connect predicate data source',
        severity: 'critical',
      });
    }

    if (['IND', 'NDA', 'BLA', 'MAA', 'CER', 'PMA'].includes(submissionType || '') && clinicalData.length === 0) {
      blockers.push({
        id: 'blocker-clinical',
        title: 'Clinical evidence not connected',
        description: 'Clinical data is required to support efficacy and safety claims.',
        blocker: 'Clinical data missing',
        resolution: 'Connect clinical trials data',
        severity: 'major',
      });
    }

    if (['IND', 'NDA', 'BLA', 'MAA'].includes(submissionType || '') && cmcData.length === 0) {
      blockers.push({
        id: 'blocker-cmc',
        title: 'CMC data not connected',
        description: 'Manufacturing data is required for quality and controls sections.',
        blocker: 'CMC data missing',
        resolution: 'Connect CMC data module',
        severity: 'major',
      });
    }

    if (literatureData.length === 0) {
      blockers.push({
        id: 'blocker-literature',
        title: 'Literature evidence not connected',
        description: 'Literature citations strengthen scientific and regulatory justification.',
        blocker: 'Literature data missing',
        resolution: 'Connect literature search',
        severity: 'minor',
      });
    }

    // Generate sherpa guidance
    const guidance: SherpaGuidance[] = [];
    const unsupportedCount = detectedClaims.filter(c => c.sourceStatus !== 'supported').length;
    
    if (unsupportedCount > 0) {
      guidance.push({
        id: 'guide-sources',
        priority: 'high',
        title: `Link sources to ${unsupportedCount} claim${unsupportedCount > 1 ? 's' : ''}`,
        description: 'Several claims in your document need supporting evidence. Click on highlighted claims to see source suggestions.',
        expectedOutcome: 'All claims will be traceable to source documents',
        actionType: 'add-sources',
        estimatedTime: `${unsupportedCount * 2} min`,
        rationale: 'Regulatory submissions require all claims to be traceable to source data.',
      });
    }
    
    if (state.dataBridges.some(b => b.status === 'available')) {
      guidance.push({
        id: 'guide-import',
        priority: 'medium',
        title: 'Import data from connected modules',
        description: 'You have data available from other modules that could be used as sources.',
        expectedOutcome: 'More source options for your claims',
        actionType: 'update-from-module',
        estimatedTime: '1 min',
        rationale: 'Cross-module data integration ensures consistency.',
      });
    }
    
    // Calculate compliance score
    const totalClaims = detectedClaims.length || 1;
    const supportedClaims = detectedClaims.filter(c => c.sourceStatus === 'supported').length;
    const complianceScore = Math.round((supportedClaims / totalClaims) * 100);
    
    const status = blockers.some(b => b.severity === 'critical')
      ? 'blocked'
      : complianceScore >= 90
        ? 'ready'
        : complianceScore >= 70
          ? 'needs-attention'
          : 'blocked';

    setState(prev => ({
      ...prev,
      detectedClaims,
      complianceGuards: guards,
      sherpaGuidance: guidance,
      blockers,
      document: prev.document ? {
        ...prev.document,
        complianceScore,
        complianceStatus: status,
      } : prev.document,
    }));
  }, [enableAIAssist, submissionType, predicateDevices.length, clinicalData.length, cmcData.length, literatureData.length, state.dataBridges, state.availableSources.length]);

  // ─────────────────────────────────────────────────────────────────────────
  // Save Handler
  // ─────────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!editor || state.isSaving) return;
    
    setState(prev => ({ ...prev, isSaving: true }));
    
    try {
      const content = editor.getHTML();
      const doc: IntelligentDocument = {
        ...state.document!,
        id: state.document?.id || `doc-${Date.now()}`,
        content,
        lastEditedAt: new Date(),
        lastEditedBy: 'current-user', // Would come from auth
      };
      
      if (onSave) {
        await onSave(doc);
      }
      
      setState(prev => ({
        ...prev,
        document: doc,
        isSaving: false,
        hasUnsavedChanges: false,
        lastSavedAt: new Date(),
      }));
    } catch (error) {
      console.error('Save failed:', error);
      setState(prev => ({ ...prev, isSaving: false }));
    }
  }, [editor, state.document, state.isSaving, onSave]);

  // ─────────────────────────────────────────────────────────────────────────
  // Link Source to Claim
  // ─────────────────────────────────────────────────────────────────────────

  const handleLinkSource = useCallback((claim: SmartClaim, source: SourceSuggestion) => {
    setState(prev => ({
      ...prev,
      detectedClaims: prev.detectedClaims.map(c =>
        c.id === claim.id
          ? { ...c, sourceStatus: 'supported', linkedSources: [...c.linkedSources, source] }
          : c
      ),
      availableSources: prev.availableSources.map(s =>
        s.id === source.id ? { ...s, isLinked: true } : s
      ),
    }));
    
    // Remove corresponding compliance guard
    setState(prev => ({
      ...prev,
      complianceGuards: prev.complianceGuards.filter(g => g.affectedText !== claim.text),
    }));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const complianceScore = state.document?.complianceScore || 0;
  const complianceStatus = state.document?.complianceStatus || 'needs-attention';

  return (
    <div className={`flex h-full bg-stone-50 ${className}`}>
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Main Editor Area */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white/90 backdrop-blur border-b border-stone-200">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" />
              <h1 className="text-lg font-semibold text-stone-900">
                {state.document?.title || 'New Document'}
              </h1>
            </div>
            {submissionType && (
              <span className="px-2 py-1 bg-blue-100 text-stone-700 text-xs font-medium rounded">
                {submissionType}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <ComplianceStatusBadge status={complianceStatus} score={complianceScore} />
            
            <div className="flex items-center gap-2">
              {state.hasUnsavedChanges ? (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Unsaved changes
                </span>
              ) : state.lastSavedAt ? (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Saved
                </span>
              ) : null}
              
              <button
                onClick={handleSave}
                disabled={state.isSaving || !state.hasUnsavedChanges}
                className="flex items-center gap-2 px-4 py-2 bg-stone-800 text-white rounded-lg font-medium hover:bg-stone-900 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150"
                data-testid="button-save-document"
              >
                {state.isSaving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </button>
            </div>
          </div>
        </div>
        
        {/* Editor */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border border-stone-200/80 min-h-[640px]">
            <EditorContent 
              editor={editor} 
              className="prose prose-slate max-w-none p-8 outline-none"
            />
          </div>
        </div>
        
        {/* Claims Summary Bar */}
        {state.detectedClaims.length > 0 && (
          <div className="px-6 py-3 bg-white/90 backdrop-blur border-t border-stone-200">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-stone-600">
                <Sparkles className="w-4 h-4 inline mr-1.5 text-blue-500" />
                {state.detectedClaims.length} claims detected
              </span>
              <span className="flex items-center gap-1.5 text-green-600">
                <CheckCircle className="w-4 h-4" />
                {state.detectedClaims.filter(c => c.sourceStatus === 'supported').length} supported
              </span>
              <span className="flex items-center gap-1.5 text-amber-600">
                <AlertTriangle className="w-4 h-4" />
                {state.detectedClaims.filter(c => c.sourceStatus === 'needs-source').length} need sources
              </span>
              <button
                onClick={() => setState(prev => ({ ...prev, activePanel: 'sources' }))}
                className="ml-auto text-xs font-medium text-blue-600 hover:underline"
                data-testid="button-review-sources"
              >
                Review sources →
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Right Panel - Intelligence Sidebar */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {state.isPanelOpen && (
        <div className="w-[26rem] flex flex-col bg-white border-l border-stone-200">
          {/* Panel Header */}
          <div className="px-4 py-3 border-b border-stone-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-stone-500">Intelligence Panel</p>
                <h2 className="text-sm font-semibold text-stone-900">Step 5 Command + Evidence</h2>
              </div>
              <button
                onClick={() => setState(prev => ({ ...prev, isPanelOpen: false }))}
                className="text-xs text-stone-500 hover:text-stone-700"
                data-testid="button-hide-panel"
              >
                Hide
              </button>
            </div>
          </div>
          {/* Panel Tabs */}
          <div className="flex border-b border-stone-200 bg-stone-50/70">
            {[
              { id: 'command', icon: Command, label: 'Command', count: 0 },
              { id: 'sherpa', icon: Sparkles, label: 'Guide', count: state.sherpaGuidance.length },
              { id: 'sources', icon: Link2, label: 'Sources', count: state.availableSources.filter(s => !s.isLinked).length },
              { id: 'compliance', icon: ShieldCheck, label: 'Issues', count: state.complianceGuards.length },
              { id: 'bridges', icon: Database, label: 'Data', count: state.dataBridges.length },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setState(prev => ({ ...prev, activePanel: tab.id as any }))}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors relative
                  ${state.activePanel === tab.id
                    ? 'text-stone-700 bg-white'
                    : 'text-stone-500 hover:text-stone-700'
                  }`}
                data-testid={`button-panel-tab-${tab.id}`}
                aria-current={state.activePanel === tab.id ? 'page' : undefined}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden xl:inline">{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs
                    ${state.activePanel === tab.id
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {state.activePanel === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-stone-600" />
                )}
              </button>
            ))}
          </div>
          
          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Command Center Panel */}
            {state.activePanel === 'command' && (
              <CommandCenterPanel
                documentTitle={state.document?.title || 'New Document'}
                complianceScore={complianceScore}
                complianceStatus={complianceStatus}
                totalClaims={state.detectedClaims.length}
                unsupportedClaims={state.detectedClaims.filter(c => c.sourceStatus !== 'supported').length}
                availableSources={state.availableSources.filter(s => !s.isLinked).length}
                connectedModules={state.dataBridges.length}
                guidance={state.sherpaGuidance}
                blockers={state.blockers}
                onOpenSources={() => setState(prev => ({ ...prev, activePanel: 'sources' }))}
                onOpenCompliance={() => setState(prev => ({ ...prev, activePanel: 'compliance' }))}
                onOpenBridges={() => setState(prev => ({ ...prev, activePanel: 'bridges' }))}
                onOpenSherpa={() => setState(prev => ({ ...prev, activePanel: 'sherpa' }))}
                onRequestReview={onRequestReview}
                onExport={onExport}
              />
            )}

            {/* Sherpa Guidance Panel */}
            {state.activePanel === 'sherpa' && (
              <div className="space-y-4">
                {state.sherpaGuidance.length === 0 ? (
                  <div className="text-center py-8 text-stone-500">
                    <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">You're on track! No immediate actions needed.</p>
                  </div>
                ) : (
                  <>
                    {state.sherpaGuidance.map((guidance, i) => (
                      <SherpaGuidanceCard
                        key={guidance.id}
                        guidance={guidance}
                        isNextBest={i === 0}
                        onAction={() => {
                          // Navigate or take action based on guidance type
                          if (guidance.actionType === 'add-sources') {
                            setState(prev => ({ ...prev, activePanel: 'sources' }));
                          }
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
            
            {/* Sources Panel */}
            {state.activePanel === 'sources' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-stone-700">
                    Available Sources
                  </h3>
                  <span className="text-xs text-stone-500">
                    From {state.dataBridges.filter(b => b.status === 'connected').length} modules
                  </span>
                </div>
                
                {state.availableSources.filter(s => !s.isLinked).length === 0 ? (
                  <div className="text-center py-8 text-stone-500">
                    <Link2 className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">All sources have been linked!</p>
                  </div>
                ) : (
                  state.availableSources
                    .filter(s => !s.isLinked)
                    .slice(0, 10)
                    .map(source => (
                      <SourceSuggestionCard
                        key={source.id}
                        source={source}
                        onLink={() => {
                          // Link to selected claim or first unsupported claim
                          const targetClaim = state.selectedClaim || 
                            state.detectedClaims.find(c => c.sourceStatus !== 'supported');
                          if (targetClaim) {
                            handleLinkSource(targetClaim, source);
                          }
                        }}
                        onPreview={() => {
                          // Would open a preview modal
                          console.log('Preview source:', source);
                        }}
                      />
                    ))
                )}
              </div>
            )}
            
            {/* Compliance Panel */}
            {state.activePanel === 'compliance' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-stone-700">
                    Compliance Issues
                  </h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full
                    ${state.complianceGuards.length === 0
                      ? 'bg-green-100 text-green-600'
                      : 'bg-amber-100 text-amber-600'
                    }`}
                  >
                    {state.complianceGuards.length === 0 ? 'All Clear' : `${state.complianceGuards.length} issues`}
                  </span>
                </div>
                
                {state.complianceGuards.length === 0 ? (
                  <div className="text-center py-8 text-stone-500">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-3 text-green-500" />
                    <p className="text-sm">No compliance issues found!</p>
                    <p className="text-xs mt-1 text-green-600">Document is ready for review</p>
                  </div>
                ) : (
                  state.complianceGuards.map(guard => (
                    <ComplianceGuardCard
                      key={guard.id}
                      guard={guard}
                      onAction={() => {
                        if (guard.action.type === 'link-source') {
                          setState(prev => ({ ...prev, activePanel: 'sources' }));
                        }
                      }}
                    />
                  ))
                )}
              </div>
            )}
            
            {/* Data Bridges Panel */}
            {state.activePanel === 'bridges' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-stone-700">
                    Connected Data Sources
                  </h3>
                </div>
                
                {state.dataBridges.length === 0 ? (
                  <div className="text-center py-8 text-stone-500">
                    <Database className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No data connections yet</p>
                    <p className="text-xs mt-1">Complete other workflow steps to unlock data</p>
                  </div>
                ) : (
                  state.dataBridges.map(bridge => (
                    <DataBridgeCard
                      key={bridge.id}
                      bridge={bridge}
                      onSync={() => {
                        // Would re-sync data from the module
                        console.log('Sync bridge:', bridge);
                      }}
                      onView={() => {
                        // Would navigate to the source module
                        console.log('View bridge:', bridge);
                      }}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentWorkspace;
