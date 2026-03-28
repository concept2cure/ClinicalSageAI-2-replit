/**
 * EditorPanel — Bridge component connecting UnifiedDocumentEditor to live APIs.
 *
 * Wires:
 * - Save → PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId
 * - Load → GET /api/concept2cure/projects/:projectId/artifacts
 * - AI Edit → POST /api/concept2cure/ai/edit-section
 * - DOCX Export → POST /api/concept2cure/documents/generate (via chat tool) + download
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import UnifiedDocumentEditor from './UnifiedDocumentEditor';
import { cn } from '@/lib/utils';
import {
  FileText,
  Plus,
  Loader2,
  Download,
  Sparkles,
  ChevronDown,
  Check,
  AlertCircle,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Brain,
  GitCompare,
  ClipboardList,
  Lock,
  Unlock,
  MapPin,
  PenTool,
  Filter,
  Database,
  Users,
  MessageSquare,
  Eye,
  Link2,
  Layers,
  Keyboard,
  Scale,
} from 'lucide-react';
import { useClaimCheck, usePrecedentSearch, type ClaimCheckResult, type PrecedentRecord, type SearchParams } from '../../hooks/usePrecedentEngine';
import { RegulatoryIntelligencePanel } from '../intelligence/RegulatoryIntelligencePanel';
import { useGenerateDocx, downloadBlob } from '../../hooks/useDocumentFactory';
import DocumentProvenancePanel from '../provenance/DocumentProvenancePanel';
import DocumentVersionCompare from '../provenance/DocumentVersionCompare';
import DocumentAuditReport from '../provenance/DocumentAuditReport';
import DataRoomPanel from './DataRoomPanel';
import InconsistencyPanel from './InconsistencyPanel';
import { DocumentHealth } from './DocumentHealth';
import { VersionTimeline } from './VersionTimeline';
import { BatchAIPanel } from './BatchAIPanel';
import { DocumentDiff } from './DocumentDiff';
import { CrossReferencePanel } from './CrossReferencePanel';
import { KeyboardShortcutsOverlay } from './KeyboardShortcuts';
import { ExportDialog } from './ExportDialog';
import type { ExportOptions } from './ExportDialog';
import { CommentThreadPanel } from './CommentThread';
import { ReviewModePanel } from './ReviewMode';
import { DocumentStatusTimeline } from './DocumentStatusTimeline';
import type { CommentThread } from './extensions/CommentMark';
import { useComments } from '../../hooks/useComments';
import { recordDocumentAccess } from '../../hooks/useRecentDocuments';
import TemplateGeneratorPanel from './TemplateGeneratorPanel';
import SourceCitationsPanel from './SourceCitationsPanel';
import { ReviewerAssignment } from './ReviewerAssignment';
import { CollaborationPresence, CollaborationCursors } from './CollaborationPresence';
import { DocumentWatermark } from './DocumentWatermark';
import { useCollaboration } from '../../hooks/useCollaboration';
import { SignatureWorkflow, SignatureList } from './SignatureWorkflow';
import { SubmissionReadinessValidator } from '../submission/SubmissionReadinessValidator';
import { ComplianceScannerPanel } from './ComplianceScannerPanel';
import { AnAMemory } from '../intelligence/AnAMemory';
import ArtifactProofPanel from './ArtifactProofPanel';
import EditorGAReadinessPanel from './EditorGAReadinessPanel';
import { buildCapabilityModels, buildRemediationQueue } from './gaReadinessModel';
import { getCurrentUser } from '../../utils/getCurrentUser';
import { useDocumentModeOptional, type DocumentMode } from '../../contexts/DocumentModeContext';
import {
  InspectorRibbon,
  InspectorDrawer,
  type InspectorRibbonGroup,
} from '@/components/ui/workspace-primitives';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { LoadingState } from '@/components/ui/statesV2';

// ── Types ────────────────────────────────────────────────────────────────────
interface Artifact {
  id: string;
  title: string;
  content: string;
  type: string;
  category: string;
  version: number;
  versions?: { version: number; content: string; createdAt: string }[];
  status?: string;
  ctdSection?: string;
  createdAt: string;
  updatedAt: string;
}

interface SignatureInfo {
  signatureId: string;
  signatureType: string;
  signerName: string;
  signerEmail: string;
  signerRole: string;
  signedAt: string;
  signatureHash: string;
  status: string;
}

interface EditorPanelProps {
  projectId?: string;
  projectName?: string;
  submissionType?: string;
  /** When provided, auto-create an artifact with this content and open it */
  initialContent?: string;
  initialTitle?: string;
  initialCtdSection?: string;
  /** Called when the pending initial content has been consumed */
  onInitialContentConsumed?: () => void;
  /** When provided, open this existing artifact directly (no creation) */
  openArtifactId?: string;
  /** Called when the openArtifactId has been consumed */
  onOpenArtifactConsumed?: () => void;
  /** Called when the active document content/title changes (for outline tracking) */
  onContentChange?: (content: string, title: string) => void;
  /** When set, auto-open this inspector panel */
  initialInspector?: 'compare' | 'provenance' | 'audit' | null;
  /** Called when user clicks project name in breadcrumb */
  onNavigateToProject?: () => void;
}

type AIAction = 'rewrite' | 'expand' | 'summarize' | 'regulatory-tone' | 'add-references';

const AI_ACTIONS: { id: AIAction; label: string; description: string }[] = [
  { id: 'rewrite', label: 'Rewrite', description: 'Improve clarity and precision' },
  { id: 'expand', label: 'Expand', description: 'Add detail and evidence' },
  { id: 'summarize', label: 'Summarize', description: 'Create executive summary' },
  { id: 'regulatory-tone', label: 'Regulatory Tone', description: 'Formal FDA/EMA language' },
  { id: 'add-references', label: 'Add References', description: 'Insert reference placeholders' },
];

// ── Precedent Search Inspector ───────────────────────────────────────────────

const PRECEDENT_SEVERITY: Record<string, string> = {
  approved: 'text-emerald-600 bg-emerald-50',
  cleared: 'text-emerald-600 bg-emerald-50',
  denied: 'text-red-600 bg-red-50',
  withdrawn: 'text-amber-600 bg-amber-50',
};

const PrecedentSearchInspector: React.FC<{
  submissionType: string;
  onInsertCitation: (text: string) => void;
  onClose: () => void;
}> = ({ submissionType, onInsertCitation, onClose }) => {
  const [query, setQuery] = React.useState('');
  const [searchParams, setSearchParams] = React.useState<SearchParams | null>(null);

  const { data: results, isLoading, isFetching } = usePrecedentSearch(searchParams);

  const handleSearch = () => {
    if (!query.trim() && !submissionType) return;
    setSearchParams({
      submissionType: submissionType || 'NDA',
      query: query.trim() || undefined,
      limit: 8,
    });
  };

  return (
    <div className="h-full flex flex-col" data-testid="precedent-inspector">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-stone-100">
        <div className="flex items-center gap-2">
          <Scale className="w-3.5 h-3.5 text-stone-500" />
          <span className="text-[13px] font-semibold text-stone-700">Precedent Search</span>
        </div>
        <button
          onClick={onClose}
          className="text-stone-400 hover:text-stone-600 transition-colors p-1"
          aria-label="Close precedent panel"
        >
          <XCircle className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-stone-50">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search precedents..."
            className="flex-1 text-[12px] px-2.5 py-1.5 rounded-md border border-stone-200 bg-white focus:border-stone-400 focus:outline-none transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="px-2.5 py-1.5 text-[11px] font-medium bg-stone-800 text-white rounded-md hover:bg-stone-700 disabled:opacity-50 transition-colors"
          >
            {isFetching ? '...' : 'Search'}
          </button>
        </div>
        {submissionType && (
          <span className="text-[10px] text-stone-400 mt-1 block">
            Searching {submissionType} precedents
          </span>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!searchParams && !results && (
          <div className="px-3 py-6 text-center">
            <Scale className="w-5 h-5 text-stone-300 mx-auto mb-2" />
            <p className="text-[12px] text-stone-400">Search regulatory precedents to strengthen your submission</p>
            <p className="text-[10px] text-stone-400 mt-1">Results from FDA clearances, approvals, and advisory committees</p>
          </div>
        )}

        {isLoading && (
          <div className="px-3 py-3 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse space-y-1.5 py-2">
                <div className="h-3 bg-stone-100 rounded w-3/4" />
                <div className="h-2.5 bg-stone-50 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {results && results.length === 0 && !isLoading && (
          <div className="px-3 py-6 text-center">
            <p className="text-[12px] text-stone-500">No precedents found</p>
            <p className="text-[10px] text-stone-400 mt-1">Try broader search terms</p>
          </div>
        )}

        {results && results.length > 0 && (
          <div className="divide-y divide-stone-50">
            {results.map(rec => {
              const outcome = (rec.decisionOutcome || '').toLowerCase();
              const outcomeStyle = PRECEDENT_SEVERITY[outcome] || 'text-stone-500 bg-stone-50';
              return (
                <div key={rec.id} className="px-3 py-2.5 hover:bg-stone-50/50 transition-colors group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-stone-700 font-medium truncate">
                        {rec.deviceName || rec.indication || rec.clearanceNumber || 'Precedent'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {rec.clearanceNumber && (
                          <span className="text-[10px] text-stone-400 font-mono">{rec.clearanceNumber}</span>
                        )}
                        {rec.applicant && (
                          <span className="text-[10px] text-stone-400 truncate">{rec.applicant}</span>
                        )}
                        {rec.decisionDate && (
                          <span className="text-[10px] text-stone-400 tabular-nums">
                            {new Date(rec.decisionDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                    {rec.decisionOutcome && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${outcomeStyle}`}>
                        {rec.decisionOutcome}
                      </span>
                    )}
                  </div>
                  {rec.strategySummary && (
                    <p className="text-[11px] text-stone-500 mt-1 line-clamp-2 leading-relaxed">{rec.strategySummary}</p>
                  )}
                  {rec.similarityScore != null && rec.similarityScore > 0 && (
                    <div className="mt-1 flex items-center gap-1">
                      <div className="h-0.5 bg-stone-100 rounded-full flex-1 max-w-[60px]">
                        <div
                          className="h-full bg-stone-500 rounded-full"
                          style={{ width: `${Math.min(rec.similarityScore * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-stone-400 tabular-nums">{Math.round(rec.similarityScore * 100)}% match</span>
                    </div>
                  )}
                  {/* Insert citation button — appears on hover */}
                  <button
                    onClick={() => {
                      const parts = [rec.deviceName || rec.indication, rec.clearanceNumber, rec.applicant, rec.decisionOutcome].filter(Boolean);
                      onInsertCitation(parts.join(' — '));
                    }}
                    className="mt-1.5 text-[10px] text-blue-500 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    Insert as citation
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Component ────────────────────────────────────────────────────────────────
const EditorPanel: React.FC<EditorPanelProps> = ({
  projectId,
  projectName,
  submissionType,
  initialContent,
  initialTitle,
  initialCtdSection,
  onInitialContentConsumed,
  openArtifactId,
  onOpenArtifactConsumed,
  onContentChange,
  initialInspector,
  onNavigateToProject,
}) => {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Real-time collaboration ────────────────────────────────────────────
  const currentUser = getCurrentUser();
  const collaboration = useCollaboration(activeArtifact?.id || null);
  const [, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [showArtifactList, setShowArtifactList] = useState(true);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [lockRejection, setLockRejection] = useState<string | null>(null);
  const [unlockReason, setUnlockReason] = useState('');
  const [openArtifactNotFound, setOpenArtifactNotFound] = useState(false);
  const [showTemplateGenerator, setShowTemplateGenerator] = useState(false);

  // ── Reviewer data (fetched from API) ──────────────────────────────────────
  const [reviewers, setReviewers] = useState<Array<{ id: string; name: string; email: string; role?: string; status: string; assignedAt: string; completedAt?: string; comment?: string }>>([]);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string; email: string; role?: string }>>([]);

  // Fetch reviewers when active artifact changes
  useEffect(() => {
    if (!projectId || !activeArtifact?.id) {
      setReviewers([]);
      return;
    }
    (async () => {
      try {
        const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/reviewers`);
        if (res.ok) {
          const json = await res.json();
          const data = json?.data ?? [];
          setReviewers(data.map((r: any) => ({
            id: String(r.id || r.assignmentId),
            name: r.name || r.reviewerName || 'Unknown',
            email: r.email || '',
            role: r.role,
            status: r.decision || r.status || 'pending',
            assignedAt: r.assignedAt || r.createdAt || new Date().toISOString(),
            completedAt: r.completedAt,
            comment: r.comment || r.notes,
          })));
        }
      } catch { /* non-blocking */ }
    })();
  }, [projectId, activeArtifact?.id]);

  // ── Claim checker (Precedent Engine) ─────────────────────────────────────
  const [claimResult, setClaimResult] = useState<ClaimCheckResult | null>(null);
  const [claimStatus, setClaimStatus] = useState<
    'idle' | 'checking' | 'supported' | 'needs-evidence'
  >('idle');
  const claimCheckMutation = useClaimCheck();
  const claimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Single secondary inspector panel (only one open at a time) ────────
  type InspectorPanel =
    | 'intelligence'
    | 'provenance'
    | 'compare'
    | 'audit'
    | 'dataroom'
    | 'inconsistency'
    | 'health'
    | 'versions'
    | 'batch-ai'
    | 'crossref'
    | 'comments'
    | 'review'
    | 'reviewers'
    | 'submission-readiness'
    | 'compliance-scanner'
    | 'ana-memory'
    | 'proof'
    | 'ga-readiness';
  const [activeInspector, setActiveInspector] = useState<InspectorPanel | null>(null);
  const [complianceIssues, setComplianceIssues] = useState<Array<{ id: string; severity: string; message: string; suggestion?: string; category: string; from: number; to: number }>>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState(Date.now());
  const toggleInspector = useCallback((panel: InspectorPanel) => {
    setActiveInspector(prev => (prev === panel ? null : panel));
  }, []);

  // Auto-open inspector when initialInspector is set from parent
  useEffect(() => {
    if (initialInspector) setActiveInspector(initialInspector);
  }, [initialInspector]);

  // ── Contextual panel suggestions based on document lifecycle stage ────
  const suggestedPanels = useMemo<Set<string>>(() => {
    const status = (activeArtifact?.status ?? 'draft').toLowerCase();
    if (status === 'review' || status === 'in_review' || status === 'in-review') {
      return new Set(['comments', 'review', 'reviewers']);
    }
    if (status.includes('approv') || status === 'approved') {
      return new Set(['compliance-scanner', 'crossref', 'proof']);
    }
    if (status === 'locked' || status === 'published' || status === 'final') {
      return new Set(['audit', 'submission-readiness', 'ga-readiness']);
    }
    // Default: draft stage
    return new Set(['intelligence', 'precedent', 'dataroom', 'batch-ai']);
  }, [activeArtifact?.status]);

  // ── Sign/Approve state ────────────────────────────────────────────────
  const [signing, setSigning] = useState(false);
  const [signResult, setSignResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);

  // ── Status change state ───────────────────────────────────────────────
  const [changingStatus, setChangingStatus] = useState(false);

  // ── Toast notification queue ──────────────────────────────────────────
  type ToastItem = {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
    onUndo?: () => void;
  };
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);
  const pushToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success', onUndo?: () => void) => {
      const id = ++toastIdRef.current;
      setToasts(prev => [...prev.slice(-2), { id, message, type, onUndo }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), onUndo ? 8000 : 5000);
    },
    []
  );

  // ── Reviewer CRUD handlers (after pushToast is defined) ──────────────
  const handleAddReviewer = useCallback(async (memberId: string) => {
    if (!projectId || !activeArtifact?.id) return;
    try {
      const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/reviewers`, {
        reviewerIds: [Number(memberId)],
      });
      if (res.ok) {
        const refreshRes = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/reviewers`);
        if (refreshRes.ok) {
          const json = await refreshRes.json();
          const data = json?.data ?? [];
          setReviewers(data.map((r: any) => ({
            id: String(r.id || r.assignmentId),
            name: r.name || r.reviewerName || 'Unknown',
            email: r.email || '',
            role: r.role,
            status: r.decision || r.status || 'pending',
            assignedAt: r.assignedAt || r.createdAt || new Date().toISOString(),
            completedAt: r.completedAt,
            comment: r.comment || r.notes,
          })));
        }
        pushToast('Reviewer assigned', 'success');
      } else {
        pushToast('Failed to assign reviewer', 'error');
      }
    } catch {
      pushToast('Failed to assign reviewer', 'error');
    }
  }, [projectId, activeArtifact?.id, pushToast]);

  const handleRemoveReviewer = useCallback(async (assignmentId: string) => {
    if (!projectId || !activeArtifact?.id) return;
    try {
      const res = await apiRequest('DELETE', `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/reviewers/${assignmentId}`);
      if (res.ok) {
        setReviewers(prev => prev.filter(r => r.id !== assignmentId));
        pushToast('Reviewer removed', 'success');
      } else {
        pushToast('Failed to remove reviewer', 'error');
      }
    } catch {
      pushToast('Failed to remove reviewer', 'error');
    }
  }, [projectId, activeArtifact?.id, pushToast]);

  // ── CTD Section assignment state ──────────────────────────────────────
  const [showCtdInput, setShowCtdInput] = useState(false);
  const [ctdSectionInput, setCtdSectionInput] = useState('');

  // ── Audit export state ────────────────────────────────────────────────
  const [exportingAudit, setExportingAudit] = useState(false);

  // ── Document trust indicators (P3/P4) ─────────────────────────────────
  const [signatures, setSignatures] = useState<SignatureInfo[]>([]);
  const [provenanceCount, setProvenanceCount] = useState(0);
  const [integrityVerified, setIntegrityVerified] = useState<boolean | null>(null);
  const [trustLoadFailed, setTrustLoadFailed] = useState(false);

  // ── Auto-save (debounced 5s after last edit) ──────────────────────────
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const lastSavedContentRef = useRef<string>('');
  const modeCtx = useDocumentModeOptional();
  const modeCaps = modeCtx?.capabilities;
  const currentDocumentMode: DocumentMode | undefined = modeCtx?.mode;

  // ── Artifact list filters (P5) ────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCtd, setFilterCtd] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // ── Overflow menu (editor toolbar) ────────────────────────────────────
  const [overflowOpen, setOverflowOpen] = useState(false);

  // ── Keyboard shortcuts overlay ──────────────────────────────────────
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ── Comments state (persisted via API) ──────────────────────────────
  const {
    comments,
    setComments,
    loadComments: loadCommentsFromServer,
    createComment: createCommentOnServer,
    updateComment: updateCommentOnServer,
    deleteComment: deleteCommentOnServer,
    addReply: addReplyOnServer,
  } = useComments();

  // ── Review mode state ───────────────────────────────────────────────
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [trackedChanges, setTrackedChanges] = useState<
    Array<{
      id: string;
      type: 'addition' | 'deletion' | 'modification';
      originalText: string;
      newText: string;
      author: string;
      timestamp: string;
      accepted?: boolean;
      rejected?: boolean;
    }>
  >([]);
  const reviewSnapshotRef = useRef<string>('');

  // ── New comment dialog state ───────────────────────────────────────
  const [pendingCommentText, setPendingCommentText] = useState('');
  const [showNewCommentDialog, setShowNewCommentDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [pendingCommentHighlight, setPendingCommentHighlight] = useState('');
  const pendingCommentClientIdRef = useRef<string>('');
  const [cancelCommentId, setCancelCommentId] = useState<string | null>(null);

  const gaChecks = useMemo(
    () =>
      buildReadinessChecks({
        projectId,
        hasActiveArtifact: !!activeArtifact?.id,
        artifactCount: artifacts.length,
        collaborationConnected: collaboration.isConnected,
        signatureCount: signatures.length,
        provenanceCount,
        unresolvedCommentCount: comments.filter(c => !c.resolved).length,
        trustLoadFailed,
      }),
    [
      projectId,
      activeArtifact?.id,
      artifacts.length,
      collaboration.isConnected,
      signatures.length,
      provenanceCount,
      comments,
      trustLoadFailed,
    ]
  );

  const gaWorkflowModels = useMemo(
    () => [
      {
        name: 'Author → Review → Approve → Lock',
        owner: 'Regulatory author + QA reviewer',
        objective: 'Produce a controlled submission-ready artifact with traceable approvals.',
        path: ['Draft', 'Peer review', 'Approval', 'Locked'],
      },
      {
        name: 'AI-assisted drafting loop',
        owner: 'Medical writer',
        objective: 'Accelerate drafting while preserving human-in-the-loop control.',
        path: ['Prompt/selection', 'AI suggestion', 'Diff review', 'Apply + autosave'],
      },
      {
        name: 'Evidence and compliance loop',
        owner: 'Regulatory operations',
        objective: 'Validate claims against references and submission requirements.',
        path: ['Cross-ref', 'Claim check', 'Compliance scan', 'Submission readiness'],
      },
    ],
    []
  );

  const competitiveCapabilities = useMemo(
    () =>
      buildCapabilityModels({
        projectId,
        hasActiveArtifact: !!activeArtifact,
        artifactCount: artifacts.length,
        collaborationConnected: collaboration.isConnected,
        signatureCount: signatures.length,
        provenanceCount,
        unresolvedCommentCount: comments.filter(c => !c.resolved).length,
        trustLoadFailed,
      }),
    [
      projectId,
      activeArtifact,
      artifacts.length,
      collaboration.isConnected,
      signatures.length,
      provenanceCount,
      comments,
      trustLoadFailed,
    ]
  );

  const gaRemediationQueue = useMemo(
    () => buildRemediationQueue(gaChecks, competitiveCapabilities),
    [gaChecks, competitiveCapabilities]
  );
  const gaReadinessScore = useMemo(() => {
    const readyCount = gaChecks.filter(check => check.status === 'ready').length;
    return gaChecks.length ? Math.round((readyCount / gaChecks.length) * 100) : 0;
  }, [gaChecks]);
  const gaBlockingCount = useMemo(
    () => gaChecks.filter(check => check.status === 'missing').length,
    [gaChecks]
  );
  const nextRemediation = gaRemediationQueue[0];
  const humanJourneySteps = useMemo(
    () =>
      [
        {
          id: 'draft',
          label: 'Draft with AnA',
          done:
            !!activeArtifact?.content &&
            activeArtifact.content.replace(/<[^>]+>/g, '').trim().length > 40,
          target: 'intelligence',
        },
        {
          id: 'evidence',
          label: 'Link evidence',
          done: provenanceCount > 0,
          target: 'dataroom',
        },
        {
          id: 'review',
          label: 'Resolve review',
          done: comments.filter(c => !c.resolved).length === 0,
          target: 'comments',
        },
        {
          id: 'sign',
          label: 'Sign & approve',
          done: signatures.length > 0 || activeArtifact?.status === 'approved',
          target: 'audit',
        },
        {
          id: 'submit',
          label: 'Submission ready',
          done:
            gaBlockingCount === 0 &&
            (activeArtifact?.status === 'approved' || activeArtifact?.status === 'locked'),
          target: 'submission-readiness',
        },
      ] as const,
    [activeArtifact, provenanceCount, comments, signatures.length, gaBlockingCount]
  );
  const nextJourneyStep =
    humanJourneySteps.find(step => !step.done) || humanJourneySteps[humanJourneySteps.length - 1];
  const completedJourneySteps = humanJourneySteps.filter(step => step.done).length;
  const journeyProgress = Math.round((completedJourneySteps / humanJourneySteps.length) * 100);
  const openInspectorById = useCallback(
    (id: string) => {
      const validInspectors: InspectorPanel[] = [
        'intelligence',
        'provenance',
        'compare',
        'audit',
        'dataroom',
        'inconsistency',
        'health',
        'versions',
        'batch-ai',
        'crossref',
        'comments',
        'review',
        'reviewers',
        'submission-readiness',
        'compliance-scanner',
        'ana-memory',
        'proof',
        'ga-readiness',
      ];
      if (validInspectors.includes(id as InspectorPanel)) toggleInspector(id as InspectorPanel);
    },
    [toggleInspector]
  );
  useEffect(() => {
    if (modeCtx && activeArtifact?.status) {
      modeCtx.setArtifactStatus(activeArtifact.status);
    } else if (modeCtx && !activeArtifact) {
      modeCtx.setArtifactStatus(null);
    }
  }, [modeCtx, activeArtifact?.status, activeArtifact?.id]);

  // GA readiness auto-popup removed — progressive disclosure: user opens it via ribbon when ready

  // ── Review mode: snapshot content when entering review mode ─────────
  const handleToggleReviewMode = useCallback(() => {
    setIsReviewMode(prev => {
      if (!prev && activeArtifact?.content) {
        // Entering review mode — snapshot current content
        reviewSnapshotRef.current = activeArtifact.content;
      }
      return !prev;
    });
  }, [activeArtifact]);

  // ── Review mode: compute tracked changes on content edits ──────────
  const computeTrackedChanges = useCallback(
    (newHtml: string) => {
      if (!isReviewMode || !reviewSnapshotRef.current) return;
      // Strip HTML for comparison
      const strip = (h: string) =>
        h
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      const oldText = strip(reviewSnapshotRef.current);
      const newText = strip(newHtml);
      if (oldText === newText) return;

      // Compute simple sentence-level diff
      const oldSentences = oldText.split(/(?<=[.!?])\s+/).filter(Boolean);
      const newSentences = newText.split(/(?<=[.!?])\s+/).filter(Boolean);
      const changes: typeof trackedChanges = [];
      const now = new Date().toISOString();

      // Find removed sentences (deletions)
      for (const sentence of oldSentences) {
        if (!newSentences.includes(sentence)) {
          // Check if it was modified (find a close match)
          const modified = newSentences.find(
            ns =>
              !oldSentences.includes(ns) &&
              (ns.slice(0, 30) === sentence.slice(0, 30) || ns.slice(-30) === sentence.slice(-30))
          );
          if (modified) {
            changes.push({
              id: `tc-${Date.now()}-${changes.length}`,
              type: 'modification',
              originalText: sentence.slice(0, 200),
              newText: modified.slice(0, 200),
              author: 'You',
              timestamp: now,
            });
          } else {
            changes.push({
              id: `tc-${Date.now()}-${changes.length}`,
              type: 'deletion',
              originalText: sentence.slice(0, 200),
              newText: '',
              author: 'You',
              timestamp: now,
            });
          }
        }
      }

      // Find added sentences
      const modifiedNewTexts = changes.filter(c => c.type === 'modification').map(c => c.newText);
      for (const sentence of newSentences) {
        if (
          !oldSentences.includes(sentence) &&
          !modifiedNewTexts.includes(sentence.slice(0, 200))
        ) {
          changes.push({
            id: `tc-${Date.now()}-${changes.length}`,
            type: 'addition',
            originalText: '',
            newText: sentence.slice(0, 200),
            author: 'You',
            timestamp: now,
          });
        }
      }

      if (changes.length > 0) {
        setTrackedChanges(changes);
      }
    },
    [isReviewMode]
  );

  // ── Comment creation: show dialog to enter comment text ─────────────
  const handleAddCommentFromEditor = useCallback(
    (commentId: string, highlightedText: string, range: { from: number; to: number }) => {
      const user = getCurrentUser();
      pendingCommentClientIdRef.current = commentId;
      setPendingCommentHighlight(highlightedText);
      setShowNewCommentDialog(true);
      // Pre-populate a pending comment entry (optimistic — will be reconciled with server ID)
      setComments(prev => [
        ...prev,
        {
          id: commentId,
          text: '',
          authorId: user.id,
          authorName: user.name,
          createdAt: new Date().toISOString(),
          resolved: false,
          highlightedText,
          replies: [],
        },
      ]);
    },
    []
  );

  const handleSubmitComment = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      const clientId = pendingCommentClientIdRef.current;

      // Update local state immediately (optimistic)
      setComments(prev => {
        const copy = [...prev];
        const pending = copy.find(c => c.id === clientId && !c.text);
        if (pending) {
          Object.assign(pending, { text: text.trim() });
          return [...copy];
        }
        // Fallback: update last empty entry
        const last = copy[copy.length - 1];
        if (last && !last.text) {
          copy[copy.length - 1] = { ...last, text: text.trim() };
        }
        return copy;
      });
      setShowNewCommentDialog(false);
      setPendingCommentText('');
      pushToast('Comment added', 'success');

      // Persist to server — createCommentOnServer will reconcile the ID
      if (activeArtifact?.id) {
        const docId = Number(activeArtifact.id);
        if (Number.isFinite(docId)) {
          await createCommentOnServer(docId, clientId, {
            content: text.trim(),
            highlightedText: pendingCommentHighlight || undefined,
          });
        }
      }
      setPendingCommentHighlight('');
      pendingCommentClientIdRef.current = '';
    },
    [pushToast, activeArtifact, pendingCommentHighlight, createCommentOnServer]
  );

  /** Cancel comment: remove from state and tell the editor to remove the mark */
  const handleCancelComment = useCallback(() => {
    const clientId = pendingCommentClientIdRef.current;
    setShowNewCommentDialog(false);
    setPendingCommentText('');
    setPendingCommentHighlight('');
    setComments(prev => prev.filter(c => c.text !== ''));
    // Trigger CommentMark removal in UnifiedDocumentEditor
    if (clientId) {
      setCancelCommentId(clientId);
      // Reset after a tick so the effect fires even if the same ID is cancelled twice
      setTimeout(() => setCancelCommentId(null), 50);
    }
    pendingCommentClientIdRef.current = '';
  }, []);

  const handleClaimCheck = useCallback(() => {
    if (!activeArtifact?.content) return;
    // Strip HTML and extract first substantive sentence as the claim
    const text = activeArtifact.content
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || text.length < 20) return;
    // Use first 500 chars as the claim to check
    const claim = text.slice(0, 500);
    setClaimStatus('checking');
    claimCheckMutation.mutate(
      { claim, submissionType: submissionType || '510(k)' },
      {
        onSuccess: data => {
          setClaimResult(data);
          setClaimStatus(data.supported ? 'supported' : 'needs-evidence');
        },
        onError: () => setClaimStatus('idle'),
      }
    );
  }, [activeArtifact, submissionType, claimCheckMutation]);

  // ── Debounced live claim monitoring ──────────────────────────────────────
  const lastContentRef = useRef<string>('');
  useEffect(() => {
    if (!activeArtifact?.content) return;
    const text = activeArtifact.content
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Only trigger if content substantially changed (>30 chars difference)
    if (Math.abs(text.length - lastContentRef.current.length) < 30) return;
    lastContentRef.current = text;
    if (text.length < 50) return;
    if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
    claimTimerRef.current = setTimeout(() => {
      handleClaimCheck();
    }, 3000);
    return () => {
      if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
    };
  }, [activeArtifact?.content, handleClaimCheck]);

  // ── Load artifacts ───────────────────────────────────────────────────────
  const loadArtifacts = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts`);
      const payload = await res.json();
      if (res.ok && payload.success !== false) {
        const list = payload.data ?? payload;
        setArtifacts(Array.isArray(list) ? list : []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  // ── Load comments from DB when artifact changes ──────────────────────────
  useEffect(() => {
    if (activeArtifact?.id) {
      const docId = Number(activeArtifact.id);
      if (Number.isFinite(docId)) {
        loadCommentsFromServer(docId);
      }
    }
  }, [activeArtifact?.id, loadCommentsFromServer]);

  // ── Fetch trust indicators when artifact selected ─────────────────────────
  useEffect(() => {
    if (!projectId || !activeArtifact) {
      setSignatures([]);
      setProvenanceCount(0);
      setIntegrityVerified(null);
      setTrustLoadFailed(false);
      return;
    }
    let cancelled = false;
    setTrustLoadFailed(false);

    const handleError = () => {
      if (!cancelled) setTrustLoadFailed(true);
    };

    // Fetch signatures
    apiRequest(
      'GET',
      `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/signatures`
    )
      .then(r => r.json())
      .then(d => {
        if (!cancelled) setSignatures(d.data ?? d ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setSignatures([]);
          handleError();
        }
      });
    // Fetch provenance count
    apiRequest(
      'GET',
      `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/provenance`
    )
      .then(r => r.json())
      .then(d => {
        if (!cancelled && d) {
          const prov = d.data ?? d;
          const events = prov?.reviewHistory?.length ?? prov?.events?.length ?? 0;
          setProvenanceCount(events);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProvenanceCount(0);
          handleError();
        }
      });
    // Fetch integrity verification
    apiRequest(
      'GET',
      `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/verify-integrity`
    )
      .then(r => r.json())
      .then(d => {
        if (!cancelled && d) setIntegrityVerified((d.data ?? d)?.verified ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setIntegrityVerified(null);
          handleError();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, activeArtifact?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-create artifact from initial content (eCTD handoff) ──────────────
  const initialContentConsumedRef = useRef(false);
  useEffect(() => {
    if (!projectId || !initialContent || !initialTitle || initialContentConsumedRef.current) return;
    initialContentConsumedRef.current = true;
    (async () => {
      try {
        const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
          title: initialTitle,
          content: initialContent,
          type: 'regulatory_document',
          category: 'document',
          ctdSection: initialCtdSection || undefined,
        });
        if (res.ok) {
          const payload = await res.json();
          const created = payload.data ?? payload;
          setActiveArtifact(created);
          setShowArtifactList(false);
          loadArtifacts();
        }
      } catch (err) {
        console.warn('[EditorPanel] Auto-create artifact from initial content failed:', err);
      } finally {
        onInitialContentConsumed?.();
      }
    })();
  }, [
    projectId,
    initialContent,
    initialTitle,
    initialCtdSection,
    onInitialContentConsumed,
    loadArtifacts,
  ]);

  // ── Open a specific artifact by ID (CMC handoff — no creation) ───────────
  const openArtifactConsumedRef = useRef(false);
  const openArtifactRetryRef = useRef(false);
  useEffect(() => {
    if (!openArtifactId || openArtifactConsumedRef.current) return;
    // Wait for artifacts to be loaded
    if (loading) return;
    const target = artifacts.find(a => a.id === openArtifactId);
    if (target) {
      // Success: artifact found — activate it, THEN consume
      openArtifactConsumedRef.current = true;
      setOpenArtifactNotFound(false);
      setActiveArtifact(target);
      setShowArtifactList(false);
      onOpenArtifactConsumed?.();
    } else if (!openArtifactRetryRef.current) {
      // First miss — artifacts may be stale. Refresh once.
      openArtifactRetryRef.current = true;
      loadArtifacts();
    } else {
      // Second miss after refresh — artifact genuinely not found
      openArtifactConsumedRef.current = true;
      setOpenArtifactNotFound(true);
      onOpenArtifactConsumed?.();
    }
  }, [openArtifactId, artifacts, loading, loadArtifacts, onOpenArtifactConsumed]);

  // Reset refs when openArtifactId changes to a new value
  useEffect(() => {
    if (openArtifactId) {
      openArtifactConsumedRef.current = false;
      openArtifactRetryRef.current = false;
      setOpenArtifactNotFound(false);
    }
  }, [openArtifactId]);

  // ── Notify parent of active doc content changes (for outline) ────────────
  useEffect(() => {
    if (onContentChange && activeArtifact) {
      onContentChange(activeArtifact.content || '', activeArtifact.title || '');
    }
  }, [activeArtifact?.content, activeArtifact?.title, onContentChange]);

  // ── Save to artifacts API ────────────────────────────────────────────────
  const handleSave = useCallback(
    async (content: string, _metadata: Record<string, unknown>) => {
      if (!projectId || !activeArtifact) return;
      // Capability-gated save — canonical DocumentMode decides save availability
      if (modeCaps && !modeCaps.canSave) {
        setLockRejection(
          'Editing is not available in the current mode. Switch to edit mode to save.'
        );
        setTimeout(() => setLockRejection(null), 5000);
        return;
      }
      setSaving(true);
      setSaveStatus('idle');
      setLockRejection(null);
      try {
        const res = await apiRequest(
          'PUT',
          `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}`,
          { content, title: activeArtifact.title }
        );
        if (res.ok) {
          const payload = await res.json();
          const updated = payload.data ?? payload;
          setActiveArtifact(updated);
          setSaveStatus('saved');
          setIsDirty(false);
          lastSavedContentRef.current = content;
          pushToast(`Saved at ${new Date().toLocaleTimeString()}`, 'success');
          loadArtifacts();
          setTimeout(() => setSaveStatus('idle'), 3000);
        } else if (res.status === 423) {
          const err = await res.json().catch(() => ({ message: 'Document is locked' }));
          setLockRejection(err.message || 'Document is locked — save rejected (HTTP 423)');
          setSaveStatus('error');
          pushToast('Save blocked — document is locked', 'error');
          setTimeout(() => setLockRejection(null), 6000);
        } else {
          setSaveStatus('error');
          pushToast('Save failed — please try again', 'error');
        }
      } catch {
        setSaveStatus('error');
        pushToast('Save failed — network error', 'error');
      } finally {
        setSaving(false);
      }
    },
    [projectId, activeArtifact, loadArtifacts]
  );

  // ── Global keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl/Cmd+S — save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeArtifact) handleSave(activeArtifact.content, {});
      }
      // Ctrl+Shift+/ or Ctrl+? — show keyboard shortcuts
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '/' || e.key === '?')) {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
      // Escape — close menus
      if (e.key === 'Escape') {
        setOverflowOpen(false);
        setAiMenuOpen(false);
        setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeArtifact, handleSave]);

  // ── Auto-save: reset dirty state when switching documents ─────────────
  useEffect(() => {
    setIsDirty(false);
    lastSavedContentRef.current = activeArtifact?.content || '';
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, [activeArtifact?.id]);

  // ── Auto-save: debounced save 5s after last edit ──────────────────────
  const triggerAutoSave = useCallback(
    (html: string) => {
      if (!activeArtifact) return;
      // Capability-gated auto-save — suppressed when mode disallows saving
      if (modeCaps && !modeCaps.canSave) return;
      if (html === lastSavedContentRef.current) return;

      setIsDirty(true);

      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        handleSave(html, {});
        autoSaveTimerRef.current = null;
      }, 5000);
    },
    [activeArtifact, handleSave]
  );

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // Warn user before closing with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Create new document ──────────────────────────────────────────────────
  const handleCreateNew = useCallback(async () => {
    if (!projectId || !newDocTitle.trim()) return;
    setCreatingNew(true);
    try {
      const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
        title: newDocTitle.trim(),
        content: '<p>Begin editing your document here...</p>',
        type: 'regulatory_document',
        category: 'document',
      });
      if (res.ok) {
        const payload = await res.json();
        const created = payload.data ?? payload;
        setActiveArtifact(created);
        setNewDocTitle('');
        setShowArtifactList(false);
        loadArtifacts();
        pushToast(`Created "${created.title || newDocTitle.trim()}"`, 'success');
      } else {
        pushToast('Could not create document', 'error');
      }
    } catch {
      pushToast('Network error — document not created', 'error');
    } finally {
      setCreatingNew(false);
    }
  }, [projectId, newDocTitle, loadArtifacts]);

  // ── AI Edit ──────────────────────────────────────────────────────────────
  const handleAIEdit = useCallback(
    async (action: AIAction) => {
      if (!activeArtifact) return;
      setAiLoading(true);
      setAiMenuOpen(false);
      setAiResult(null);
      pushToast(`Generating ${action.replace(/-/g, ' ')}…`, 'info');
      try {
        const res = await apiRequest('POST', '/api/concept2cure/ai/edit-section', {
          action,
          text: activeArtifact.content,
          sectionTitle: activeArtifact.title,
          submissionType: submissionType || undefined,
          projectId: projectId || undefined,
          artifactId: activeArtifact.id || undefined,
          ctdSection: ctdSection || activeArtifact.ctdSection || undefined,
        });
        if (res.ok) {
          const payload = await res.json();
          const result = payload.data?.result ?? payload.result;
          const provenance = payload.data?.provenance ?? payload.provenance;
          if (result) {
            setAiResult(result);
            const srcCount = provenance?.sourcesRetrieved || 0;
            const claimCount = provenance?.claims?.length || 0;
            const msg = srcCount > 0
              ? `AI suggestion ready — ${srcCount} source${srcCount !== 1 ? 's' : ''} cited, ${claimCount} claim${claimCount !== 1 ? 's' : ''} traced`
              : 'AI suggestion ready — review below';
            pushToast(msg, 'success');
          } else {
            pushToast('AI returned empty result', 'error');
          }
        } else {
          pushToast('AI edit failed — try again', 'error');
        }
      } catch {
        pushToast('AI service unavailable', 'error');
      } finally {
        setAiLoading(false);
      }
    },
    [activeArtifact, submissionType, projectId, ctdSection]
  );

  // ── Accept AI result ─────────────────────────────────────────────────────
  const handleAcceptAI = useCallback(() => {
    if (!aiResult || !activeArtifact) return;
    // Wrap plain text result in HTML paragraphs if not already HTML
    const htmlContent = aiResult?.startsWith('<')
      ? aiResult
      : aiResult
          .split('\n\n')
          .map(p => `<p>${p}</p>`)
          .join('');
    setActiveArtifact({ ...activeArtifact, content: htmlContent });
    setAiResult(null);
  }, [aiResult, activeArtifact]);

  // ── DOCX Export (real generation via knowledge-base → shadow service) ───
  const generateDocxMutation = useGenerateDocx();
  const [docxExporting, setDocxExporting] = useState(false);

  const handleExportDocx = useCallback(async () => {
    if (!activeArtifact) return;
    setDocxExporting(true);
    pushToast('Exporting DOCX…', 'info');
    try {
      const blob = await generateDocxMutation.mutateAsync({
        title: activeArtifact.title,
        content: activeArtifact.content,
        submissionType,
        sections: [
          {
            title: activeArtifact.title,
            content: activeArtifact.content,
            sectionCode: activeArtifact.type,
          },
        ],
      });
      const filename = `${activeArtifact.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;
      downloadBlob(blob, filename);
      pushToast(`Downloaded ${filename}`, 'success');
    } catch {
      const filename = `${activeArtifact.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;
      window.open(`/api/concept2cure/documents/download/${encodeURIComponent(filename)}`, '_blank');
      pushToast('Exported via fallback download', 'info');
    } finally {
      setDocxExporting(false);
    }
  }, [activeArtifact, submissionType, generateDocxMutation, pushToast]);

  // ── PDF Export ─────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    if (!activeArtifact) return;
    pushToast('Exporting PDF…', 'info');
    try {
      const res = await apiRequest('POST', '/api/concept2cure/artifacts/export-pdf', {
        title: activeArtifact.title,
        content: activeArtifact.content,
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const filename = `${activeArtifact.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      downloadBlob(blob, filename);
      pushToast(`Downloaded ${filename}`, 'success');
    } catch {
      pushToast('PDF export failed', 'error');
    }
  }, [activeArtifact, pushToast]);

  // ── PPTX Export ────────────────────────────────────────────────────────
  const handleExportPptx = useCallback(async () => {
    if (!activeArtifact) return;
    pushToast('Exporting PowerPoint…', 'info');
    try {
      const res = await apiRequest('POST', '/api/concept2cure/artifacts/export-pptx', {
        title: activeArtifact.title,
        content: activeArtifact.content,
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const filename = `${activeArtifact.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.pptx`;
      downloadBlob(blob, filename);
      pushToast(`Downloaded ${filename}`, 'success');
    } catch {
      pushToast('PowerPoint export failed', 'error');
    }
  }, [activeArtifact, pushToast]);

  // ── Markdown Export ──────────────────────────────────────────────────
  const handleExportMarkdown = useCallback(() => {
    if (!activeArtifact) return;
    pushToast('Exporting Markdown…', 'info');
    // Convert HTML to Markdown
    const html = activeArtifact.content || '';
    let md = html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
      .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i>(.*?)<\/i>/gi, '*$1*')
      .replace(/<s>(.*?)<\/s>/gi, '~~$1~~')
      .replace(/<del>(.*?)<\/del>/gi, '~~$1~~')
      .replace(/<code>(.*?)<\/code>/gi, '`$1`')
      .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, '> $1\n\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<ul[^>]*>|<\/ul>/gi, '\n')
      .replace(/<ol[^>]*>|<\/ol>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gis, '$1\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Add title header
    md = `# ${activeArtifact.title}\n\n${md}`;

    const blob = new Blob([md], { type: 'text/markdown' });
    const filename = `${activeArtifact.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
    downloadBlob(blob, filename);
    pushToast(`Downloaded ${filename}`, 'success');
  }, [activeArtifact, pushToast]);

  // ── Launch Checklist Export ─────────────────────────────────────────
  const handleExportLaunchChecklist = useCallback(() => {
    if (!activeArtifact) return;
    const lines = [
      `# Launch Checklist — ${activeArtifact.title}`,
      '',
      `Generated: ${new Date().toISOString()}`,
      `Readiness score: ${gaReadinessScore}%`,
      `Blocking gaps: ${gaBlockingCount}`,
      '',
      '## Human Workflow',
      ...humanJourneySteps.map(step => `- [${step.done ? 'x' : ' '}] ${step.label}`),
      '',
      '## Readiness Checks',
      ...gaChecks.map(
        check =>
          `- **${check.label}** — ${check.status.toUpperCase()}\n  - ${check.detail}${check.inspectorTarget ? `\n  - Workflow: ${check.inspectorTarget}` : ''}`
      ),
      '',
      '## Competitive Capability Snapshot',
      ...competitiveCapabilities.map(
        cap =>
          `- **${cap.capability}**\n  - Concept2Cure: ${cap.c2c}\n  - Weave Bio baseline: ${cap.weaveBio}\n  - Artos baseline: ${cap.artos}${cap.gapSummary ? `\n  - Gap: ${cap.gapSummary}` : ''}`
      ),
      '',
      '## Remediation Queue',
      ...(gaRemediationQueue.length
        ? gaRemediationQueue.map(
            item =>
              `- [${item.severity === 'high' ? 'HIGH' : 'MED'}] ${item.title}\n  - ${item.detail}\n  - Workflow: ${item.inspectorTarget}`
          )
        : ['- No remediation items.']),
      '',
    ];
    const md = lines.join('\n');
    const filename = `${activeArtifact.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_launch_checklist.md`;
    downloadBlob(new Blob([md], { type: 'text/markdown' }), filename);
    pushToast(`Downloaded ${filename}`, 'success');
  }, [
    activeArtifact,
    gaReadinessScore,
    gaBlockingCount,
    humanJourneySteps,
    gaChecks,
    competitiveCapabilities,
    gaRemediationQueue,
    pushToast,
  ]);

  // ── Sign & Approve ───────────────────────────────────────────────────
  const handleSignApprove = useCallback(async () => {
    if (!projectId || !activeArtifact) return;
    setSigning(true);
    setSignResult(null);
    pushToast('Signing document…', 'info');
    try {
      const res = await apiRequest(
        'POST',
        `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/signatures`,
        {
          signaturePurpose: 'Document review and approval',
          signatureMeaning: 'I have reviewed this document and approve its content',
          authenticationMethod: 'password',
          secondFactorVerified: false,
          version: activeArtifact.version,
        }
      );
      if (res.ok) {
        setSignResult({ success: true, message: 'Signature recorded successfully' });
        // Also update status to approved
        await apiRequest(
          'PUT',
          `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/status`,
          { status: 'approved' }
        );
        loadArtifacts();
      } else {
        const err = await res.json();
        setSignResult({ success: false, message: err.message || 'Signature failed' });
      }
    } catch {
      setSignResult({ success: false, message: 'Network error' });
    } finally {
      setSigning(false);
      setTimeout(() => setSignResult(null), 4000);
    }
  }, [projectId, activeArtifact, loadArtifacts]);

  // ── Quality gate confirmation dialog state ──────────────────────────
  const [qualityGateDialog, setQualityGateDialog] = useState<{
    show: boolean;
    targetStatus: string;
    warnings: string[];
  }>({ show: false, targetStatus: '', warnings: [] });

  // ── Status change (with optional quality gate) ─────────────────────
  const executeStatusChange = useCallback(
    async (
      newStatus: string,
      reason?: string,
      attestation?: { meaning: string; attestationText: string }
    ) => {
      if (!projectId || !activeArtifact) return;
      setChangingStatus(true);
      try {
        const body: Record<string, unknown> = { status: newStatus };
        if (reason) body.reason = reason;
        if (attestation) body.attestation = attestation;
        const res = await apiRequest(
          'PUT',
          `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/status`,
          body
        );
        if (res.ok) {
          const payload = await res.json();
          const updated = payload.data;
          const previousStatus = activeArtifact.status || 'draft';
          setActiveArtifact(prev => (prev ? { ...prev, ...updated } : prev));
          loadArtifacts();
          pushToast(`Status → ${newStatus}`, 'success', () => {
            // Undo: revert to previous status
            executeStatusChange(previousStatus);
          });
        } else {
          const err = await res.json().catch(() => ({ message: 'Status change failed' }));
          pushToast(err.message || 'Status change failed', 'error');
        }
      } catch {
        pushToast('Status change failed — network error', 'error');
      } finally {
        setChangingStatus(false);
      }
    },
    [projectId, activeArtifact, loadArtifacts]
  );

  // ── Lock toggle — canonical server mutation ───────────────────────
  const handleToggleLock = useCallback(() => {
    if (!activeArtifact) return;
    const status = activeArtifact.status || 'draft';
    if (status === 'locked') {
      // Unlock: locked → draft (regression, needs reason)
      executeStatusChange('draft', 'Unlocked via editor toolbar');
    } else if (status === 'approved') {
      // Lock: approved → locked (needs attestation)
      executeStatusChange('locked', undefined, {
        meaning: 'Released',
        attestationText: 'Document locked via editor toolbar by authorized user',
      });
    } else {
      pushToast(`Cannot lock — document must be approved first (current: ${status})`, 'error');
    }
  }, [activeArtifact, executeStatusChange, pushToast]);

  const handleStatusChange = useCallback(
    async (newStatus: string, reason?: string) => {
      if (!activeArtifact) return;

      // Quality gate: run checks when advancing to review or approved
      const isAdvancing =
        (newStatus === 'review' || newStatus === 'approved') &&
        (activeArtifact.status === 'draft' || activeArtifact.status === 'review');

      if (isAdvancing && activeArtifact.content) {
        const content = activeArtifact.content.replace(/<[^>]*>/g, '');
        const warnings: string[] = [];

        // Check document length
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        if (wordCount < 50)
          warnings.push(
            `Document is very short (${wordCount} words) — consider expanding before review.`
          );

        // Check for placeholder text
        if (/\[.*?\]|TODO|TBD|FIXME|lorem ipsum/i.test(content)) {
          warnings.push('Document may contain placeholder text (e.g., [brackets], TODO, TBD).');
        }

        // Check CTD section assignment
        if (!activeArtifact.ctdSection) {
          warnings.push("No CTD section assigned — reviewers won't know the dossier placement.");
        }

        // Check for headings (structure)
        if (!/<h[1-6]/i.test(activeArtifact.content)) {
          warnings.push('No headings found — document lacks structure for regulatory review.');
        }

        if (warnings.length > 0) {
          setQualityGateDialog({ show: true, targetStatus: newStatus, warnings });
          return; // Don't proceed until user confirms
        }
      }

      await executeStatusChange(newStatus, reason);
    },
    [activeArtifact, executeStatusChange]
  );

  // ── CTD Section assignment ───────────────────────────────────────────
  const handleCtdSection = useCallback(async () => {
    if (!projectId || !activeArtifact || !ctdSectionInput.trim()) return;
    try {
      const res = await apiRequest(
        'PUT',
        `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/ctd-section`,
        { ctdSection: ctdSectionInput.trim() }
      );
      if (res.ok) {
        loadArtifacts();
        setShowCtdInput(false);
        pushToast(`CTD section set to ${ctdSectionInput.trim()}`, 'success');
        setCtdSectionInput('');
      } else {
        pushToast('CTD section update failed', 'error');
      }
    } catch {
      pushToast('CTD section update failed', 'error');
    }
  }, [projectId, activeArtifact, ctdSectionInput, loadArtifacts, pushToast]);

  // ── Audit Report Export ──────────────────────────────────────────────
  const handleExportAudit = useCallback(async () => {
    if (!projectId || !activeArtifact) return;
    setExportingAudit(true);
    try {
      const res = await apiRequest(
        'POST',
        `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/audit-report/export`
      );
      if (res.ok) {
        loadArtifacts();
        pushToast('Audit report exported', 'success');
      } else {
        pushToast('Audit export failed', 'error');
      }
    } catch {
      pushToast('Audit export failed', 'error');
    } finally {
      setExportingAudit(false);
    }
  }, [projectId, activeArtifact, loadArtifacts]);

  // ── Cross-panel navigation callbacks ─────────────────────────────────
  const openCompare = useCallback(() => setActiveInspector('compare'), []);
  const openProvenance = useCallback(() => setActiveInspector('provenance'), []);
  const openAudit = useCallback(() => setActiveInspector('audit'), []);

  // ── No project selected ─────────────────────────────────────────────────
  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full text-stone-400">
        <div className="text-center max-w-[320px]">
          <FileText className="w-10 h-10 mx-auto mb-3 text-stone-300" />
          <p className="text-sm font-medium text-stone-600 mb-1">No project selected</p>
          <p className="text-xs text-stone-500 leading-relaxed mb-4">
            Select a project to access its regulatory documents, version history, and audit trail.
          </p>
          {onNavigateToProject && (
            <button
              onClick={onNavigateToProject}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none"
            >
              Go to Projects
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Artifact not found after openArtifactId handoff ─────────────────────
  if (openArtifactNotFound && !activeArtifact) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-center max-w-md px-6">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
          <p className="text-sm font-semibold text-stone-700 mb-2">
            Saved document was created, but the editor could not load that artifact automatically.
          </p>
          <p className="text-xs text-stone-400 mb-6">
            The artifact may still be processing or the ID could not be matched.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setOpenArtifactNotFound(false);
                loadArtifacts();
              }}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none shadow-sm"
            >
              Refresh documents
            </button>
            <button
              onClick={() => {
                setOpenArtifactNotFound(false);
                setShowArtifactList(true);
              }}
              className="px-4 py-2 text-sm font-medium border border-stone-200 text-stone-700 rounded-lg hover:bg-stone-50 hover:border-stone-300 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none"
            >
              Open artifact list
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Artifact list view ──────────────────────────────────────────────────
  if (showArtifactList && !activeArtifact) {
    // Compute unique filter options from artifact data
    const statusOptions = ['all', ...new Set(artifacts.map(a => a.status || 'draft'))];
    const typeOptions = ['all', ...new Set(artifacts.map(a => a.type))];
    const ctdOptions = [
      'all',
      ...new Set(artifacts.filter(a => a.ctdSection).map(a => a.ctdSection!)),
    ];

    // Apply filters
    const filtered = artifacts.filter(a => {
      if (filterStatus !== 'all' && (a.status || 'draft') !== filterStatus) return false;
      if (filterType !== 'all' && a.type !== filterType) return false;
      if (filterCtd !== 'all' && a.ctdSection !== filterCtd) return false;
      return true;
    });

    return (
      <div className="flex flex-col h-full bg-white">
        {/* Header */}
        <div className="flex items-center justify-between h-14 px-5 border-b border-stone-200/80 bg-stone-50">
          <div className="flex items-baseline gap-2">
            <h3 className="text-base font-semibold text-stone-900 tracking-tight">Documents</h3>
            {artifacts.length > 0 && (
              <span className="text-xs text-stone-400 font-medium tabular-nums">
                {artifacts.length}
              </span>
            )}
          </div>
          {artifacts.length > 0 && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors duration-150',
                showFilters ? 'bg-blue-100 text-blue-700' : 'text-stone-500 hover:bg-stone-100'
              )}
            >
              <Filter className="w-3 h-3" />
              Filters
              {(filterStatus !== 'all' || filterType !== 'all' || filterCtd !== 'all') && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </button>
          )}
        </div>

        {/* Filter controls (P5) */}
        {showFilters && artifacts.length > 0 && (
          <div
            className="flex items-center gap-2 px-4 py-2 border-b border-stone-200 bg-stone-50/20 flex-wrap"
            data-testid="artifact-filters"
          >
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-2 py-1 text-xs border border-stone-200 rounded-md bg-white focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 outline-none"
            >
              {statusOptions.map(s => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All Status' : s}
                </option>
              ))}
            </select>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="px-2 py-1 text-xs border border-stone-200 rounded-md bg-white focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 outline-none"
            >
              {typeOptions.map(t => (
                <option key={t} value={t}>
                  {t === 'all' ? 'All Types' : t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <select
              value={filterCtd}
              onChange={e => setFilterCtd(e.target.value)}
              className="px-2 py-1 text-xs border border-stone-200 rounded-md bg-white focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 outline-none"
            >
              {ctdOptions.map(c => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All CTD Sections' : `CTD ${c}`}
                </option>
              ))}
            </select>
            {(filterStatus !== 'all' || filterType !== 'all' || filterCtd !== 'all') && (
              <button
                onClick={() => {
                  setFilterStatus('all');
                  setFilterType('all');
                  setFilterCtd('all');
                }}
                className="text-xs text-stone-400 hover:text-stone-600"
              >
                Clear
              </button>
            )}
            <span className="text-xs text-stone-400 ml-auto">
              {filtered.length} of {artifacts.length}
            </span>
          </div>
        )}

        {/* New doc creation — enhanced with quick templates */}
        <div className="p-3 border-b border-stone-200 space-y-2.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={newDocTitle}
              onChange={e => setNewDocTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateNew()}
              placeholder="New document title..."
              className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-400 outline-none"
            />
            <button
              onClick={handleCreateNew}
              disabled={creatingNew || !newDocTitle.trim()}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5 shadow-sm"
            >
              {creatingNew ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Create
            </button>
          </div>
          {/* Quick-start templates */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'Clinical Study Report', prefix: 'CSR' },
              { label: 'Regulatory Narrative', prefix: 'RN' },
              { label: 'Module 2.5 Overview', prefix: 'M2.5' },
              { label: 'Device Description', prefix: 'DD' },
              { label: 'Risk Analysis', prefix: 'RA' },
            ].map(tpl => (
              <button
                key={tpl.prefix}
                onClick={() => setNewDocTitle(tpl.label)}
                className="text-xs px-2.5 py-1 rounded-md border border-stone-200 text-stone-500 hover:border-blue-200 hover:text-blue-600 hover:bg-blue-50 transition-colors duration-150"
              >
                {tpl.prefix}: {tpl.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="space-y-2 px-4 py-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg border border-stone-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-3.5 bg-stone-200 rounded w-3/5" />
                    <div className="h-4 bg-stone-200 rounded-full w-16" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 bg-stone-100 rounded w-12" />
                    <div className="h-2.5 bg-stone-100 rounded w-16" />
                    <div className="h-2.5 bg-stone-100 rounded w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 text-stone-400" />
              </div>
              <p className="text-sm font-medium text-stone-600 mb-1">
                {artifacts.length === 0
                  ? 'Start your submission dossier'
                  : 'No documents match your filters'}
              </p>
              <p className="text-xs text-stone-500 max-w-[260px] leading-relaxed">
                {artifacts.length === 0
                  ? 'Create your first regulatory document above, or use Intelligence to generate one from precedent data.'
                  : `${artifacts.length} document${artifacts.length !== 1 ? 's' : ''} hidden by filters.`}
              </p>
              {artifacts.length > 0 && (
                <button
                  onClick={() => {
                    setFilterStatus('all');
                    setFilterType('all');
                    setFilterCtd('all');
                  }}
                  className="mt-3 px-3 py-1.5 text-xs font-medium text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-stone-400 outline-none"
                >
                  Clear all filters
                </button>
              )}
              {artifacts.length === 0 && (
                <button
                  onClick={() => {
                    setNewDocTitle('Untitled Document');
                  }}
                  className="mt-4 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3" />
                  Create First Document
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-0.5" data-testid="artifact-list">
              {filtered.map(a => (
                <button
                  key={a.id}
                  data-testid="artifact-row"
                  onClick={() => {
                    setActiveArtifact(a);
                    setShowArtifactList(false);
                    recordDocumentAccess({
                      id: String(a.id),
                      title: a.title,
                      projectId: String(projectId),
                      ctdSection: a.ctdSection,
                      status: a.status,
                    });
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg border border-transparent hover:border-stone-200 hover:bg-stone-50/80 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all group relative"
                >
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-stone-900 leading-snug line-clamp-2">
                      {a.title}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide',
                          a.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : a.status === 'locked'
                              ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                              : a.status === 'review'
                                ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                                : 'bg-stone-100 text-stone-500 ring-1 ring-stone-200'
                        )}
                      >
                        {a.status === 'approved' && <CheckCircle className="w-2.5 h-2.5" />}
                        {a.status === 'locked' && <Lock className="w-2.5 h-2.5" />}
                        {a.status || 'draft'}
                      </span>
                    </div>
                  </div>
                  {/* Metadata row */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {a.ctdSection && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 text-xs font-semibold ring-1 ring-violet-200/60 tracking-wide">
                        CTD {a.ctdSection}
                      </span>
                    )}
                    <span className="text-xs text-stone-400">{a.type?.replace(/_/g, ' ')}</span>
                    <span className="text-stone-400">&middot;</span>
                    <span className="text-xs text-stone-400 tabular-nums">v{a.version}</span>
                    <span className="text-stone-400">&middot;</span>
                    <span className="text-xs text-stone-400 tabular-nums">
                      {new Date(a.updatedAt || a.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Editor view — Document Focus ─────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Document toolbar ───────────────────────────────────────────── */}
      <div className="flex items-center h-12 px-4 border-b border-stone-200 bg-white shrink-0 gap-2.5">
        {/* Left: breadcrumb navigation */}
        <nav className="flex items-center gap-1 text-xs min-w-0" aria-label="Breadcrumb">
          {projectName && onNavigateToProject && (
            <>
              <button
                onClick={onNavigateToProject}
                className="text-stone-400 hover:text-stone-700 shrink-0 px-1.5 py-0.5 rounded hover:bg-stone-100 transition-colors truncate max-w-[120px]"
                title={projectName}
              >
                {projectName}
              </button>
              <ChevronDown className="w-3 h-3 text-stone-300 shrink-0 -rotate-90" />
            </>
          )}
          <button
            onClick={() => {
              setActiveArtifact(null);
              setShowArtifactList(true);
              setAiResult(null);
            }}
            className="text-stone-500 hover:text-stone-900 shrink-0 px-1.5 py-0.5 rounded hover:bg-stone-100 transition-colors duration-150"
          >
            Documents
          </button>
          <ChevronDown className="w-3 h-3 text-stone-300 shrink-0 -rotate-90" />
          <span className="text-sm font-semibold text-stone-900 truncate max-w-[280px]">
            {activeArtifact?.title}
          </span>
        </nav>
        {activeArtifact?.ctdSection && (
          <button
            onClick={() => setShowCtdInput(prev => !prev)}
            className="text-xs px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 font-semibold shrink-0 ring-1 ring-violet-200/60 hover:bg-violet-100 transition-colors cursor-pointer"
            title="Edit CTD section placement"
          >
            CTD {activeArtifact.ctdSection}
          </button>
        )}
        <DocumentStatusTimeline
          currentStatus={activeArtifact?.status || 'draft'}
          documentTitle={activeArtifact?.title}
          onChangeStatus={newStatus => handleStatusChange(newStatus)}
          compact
        />
        {saveStatus === 'saved' && !isDirty && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium shrink-0 animate-in fade-in duration-200">
            <Check className="w-3.5 h-3.5" />
            Saved
          </span>
        )}
        {isDirty && saveStatus !== 'error' && (
          <span className="flex items-center gap-1 text-xs text-amber-600 font-medium shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Unsaved
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="flex items-center gap-1 text-xs text-red-600 font-medium shrink-0">
            <AlertCircle className="w-3.5 h-3.5" />
            Error
          </span>
        )}
        {/* Live collaboration presence */}
        {activeArtifact && (
          <CollaborationPresence
            isConnected={collaboration.isConnected}
            collaborators={collaboration.collaborators}
            typingUsers={collaboration.typingUsers}
            currentUserId={currentUser.id}
          />
        )}

        {/* Minimal document metadata — version only, details in inspector */}
        {activeArtifact && (
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={() => toggleInspector('versions')}
              className="text-[11px] text-stone-400 hover:text-stone-600 tabular-nums transition-colors"
              title="View version history"
            >
              v{activeArtifact.version}
            </button>
            {integrityVerified === false && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Content modified since last verification" />
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Keyboard shortcuts */}
        <button
          onClick={() => setShowShortcuts(true)}
          className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors duration-150"
          title="Keyboard shortcuts (Ctrl+Shift+/)"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        <span className="w-px h-5 bg-stone-200 mx-0.5" />

        {/* Overflow: Save, Export, Sign, Review, CTD, Audit export */}
        <div className="relative">
          <button
            onClick={() => setOverflowOpen(!overflowOpen)}
            aria-label="More actions"
            aria-expanded={overflowOpen}
            className="px-2 py-1.5 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none transition-colors duration-150"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          {overflowOpen && (
            <div
              role="menu"
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setOverflowOpen(false);
                }
              }}
              className="absolute right-0 top-full mt-1 w-48 bg-white border border-stone-200 rounded-lg shadow-lg z-50 py-1"
            >
              {/* Save */}
              <button
                role="menuitem"
                onClick={() => {
                  activeArtifact && handleSave(activeArtifact.content, {});
                  setOverflowOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-stone-50 text-xs text-stone-700 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
              >
                <Check className="w-3 h-3 text-stone-400" />
                Save
              </button>
              {/* Export */}
              <button
                role="menuitem"
                onClick={() => {
                  setShowExportDialog(true);
                  setOverflowOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-stone-50 text-xs text-stone-700 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
              >
                <Download className="w-3 h-3 text-stone-400" />
                Export…
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  handleExportMarkdown();
                  setOverflowOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-stone-50 text-xs text-stone-700 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
              >
                <Download className="w-3 h-3 text-stone-400" />
                Markdown (.md)
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  handleExportLaunchChecklist();
                  setOverflowOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-stone-50 text-xs text-stone-700 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
              >
                <ClipboardList className="w-3 h-3 text-stone-400" />
                Launch Checklist (.md)
              </button>
              <div className="border-t border-stone-200 my-1" />
              {/* Sign — opens Part 11 compliant dialog */}
              <button
                role="menuitem"
                onClick={() => {
                  setShowSignatureDialog(true);
                  setOverflowOpen(false);
                }}
                disabled={!activeArtifact}
                className="w-full text-left px-3 py-1.5 hover:bg-stone-50 text-xs text-stone-700 disabled:opacity-60 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
              >
                <PenTool className="w-3 h-3 text-stone-400" />
                Sign & Approve (Part 11)
              </button>
              {/* Status change — forward transitions only; regressions use lock overlay / GovernedDocumentPanel */}
              {activeArtifact?.status !== 'locked' && (
                <button
                  role="menuitem"
                  onClick={() => {
                    const current = activeArtifact?.status || 'draft';
                    const next =
                      current === 'approved'
                        ? 'locked'
                        : current === 'review'
                          ? 'approved'
                          : 'review';
                    handleStatusChange(next);
                    setOverflowOpen(false);
                  }}
                  disabled={changingStatus || !activeArtifact}
                  className="w-full text-left px-3 py-1.5 hover:bg-stone-50 text-xs text-stone-700 disabled:opacity-60 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
                >
                  <Lock className="w-3 h-3 text-stone-400" />
                  {activeArtifact?.status === 'approved'
                    ? 'Lock'
                    : activeArtifact?.status === 'review'
                      ? 'Approve'
                      : 'Submit for Review'}
                </button>
              )}
              <div className="border-t border-stone-200 my-1" />
              <button
                onClick={() => {
                  handleClaimCheck();
                  setOverflowOpen(false);
                }}
                disabled={claimCheckMutation.isPending || !activeArtifact?.content}
                className="w-full text-left px-3 py-1.5 hover:bg-stone-50 text-xs text-stone-700 disabled:opacity-60"
              >
                <ShieldCheck className="w-3 h-3 inline mr-1.5 text-amber-500" />
                Check Claims
              </button>
              <button
                onClick={() => {
                  setShowCtdInput(!showCtdInput);
                  setOverflowOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-stone-50 text-xs text-stone-700"
              >
                <MapPin className="w-3 h-3 inline mr-1.5 text-stone-400" />
                Set CTD Section
              </button>
              <button
                onClick={() => {
                  handleExportAudit();
                  setOverflowOpen(false);
                }}
                disabled={exportingAudit}
                className="w-full text-left px-3 py-1.5 hover:bg-stone-50 text-xs text-stone-700 disabled:opacity-60"
              >
                <ClipboardList className="w-3 h-3 inline mr-1.5 text-stone-400" />
                Export Audit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Journey guidance removed — accessible via /checklist in conversation */}

      {/* ── Ribbon toolbar — canonical InspectorRibbon ── */}
      <InspectorRibbon
        groups={
          [
            {
              label: 'Draft',
              items: [
                { id: 'intelligence', label: 'AI Assist', icon: <Brain className="w-3.5 h-3.5" />, suggested: suggestedPanels.has('intelligence') },
                { id: 'templates', label: 'Templates', icon: <FileText className="w-3.5 h-3.5" />, suggested: suggestedPanels.has('templates') },
                { id: 'precedent', label: 'Precedents', icon: <Scale className="w-3.5 h-3.5" />, suggested: suggestedPanels.has('precedent') },
                { id: 'dataroom', label: 'Sources', icon: <Database className="w-3.5 h-3.5" />, suggested: suggestedPanels.has('dataroom') },
              ],
            },
            {
              label: 'Review',
              items: [
                {
                  id: 'comments',
                  label: 'Comments',
                  icon: <MessageSquare className="w-3.5 h-3.5" />,
                  badge: comments.filter(c => !c.resolved).length || undefined,
                  suggested: suggestedPanels.has('comments'),
                },
                {
                  id: 'review',
                  label: 'Review',
                  icon: <Eye className="w-3.5 h-3.5" />,
                  activeColor: isReviewMode
                    ? 'bg-amber-500 text-white font-medium shadow-sm'
                    : undefined,
                  pulse: isReviewMode,
                  suggested: suggestedPanels.has('review'),
                },
                { id: 'reviewers', label: 'Reviewers', icon: <Users className="w-3.5 h-3.5" />, suggested: suggestedPanels.has('reviewers') },
                { id: 'versions', label: 'History', icon: <GitCompare className="w-3.5 h-3.5" /> },
              ],
            },
            {
              label: 'Verify',
              items: [
                {
                  id: 'compliance-scanner',
                  label: 'Compliance',
                  icon: <AlertTriangle className="w-3.5 h-3.5" />,
                  suggested: suggestedPanels.has('compliance-scanner'),
                },
                { id: 'crossref', label: 'Cross-Refs', icon: <Link2 className="w-3.5 h-3.5" />, suggested: suggestedPanels.has('crossref') },
                {
                  id: 'provenance',
                  label: 'Provenance',
                  icon: <ShieldCheck className="w-3.5 h-3.5" />,
                  suggested: suggestedPanels.has('provenance'),
                },
                {
                  id: 'audit',
                  label: 'Audit',
                  icon: <ClipboardList className="w-3.5 h-3.5" />,
                  suggested: suggestedPanels.has('audit'),
                },
              ],
            },
          ] satisfies InspectorRibbonGroup[]
        }
        activeInspector={activeInspector}
        onToggle={toggleInspector}
      />

      {/* ── AI Suggestion Diff Panel ──────────────────────────────────────── */}
      {aiResult && (
        <div className="border-b border-blue-200 bg-stone-50">
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-violet-100">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-violet-100 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-violet-600" />
              </div>
              <span className="text-sm font-semibold text-violet-900">AI Suggestion</span>
              <span className="text-xs text-violet-500 ml-1">Review changes before applying</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAiResult(null)}
                className="px-3 py-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors duration-150"
              >
                Dismiss
              </button>
              <button
                onClick={handleAcceptAI}
                className="px-4 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Apply Changes
              </button>
            </div>
          </div>
          {/* Diff content */}
          <div className="flex gap-0 max-h-64 overflow-hidden">
            {/* Current content */}
            <div className="flex-1 border-r border-violet-100 overflow-hidden">
              <div className="px-3 py-1.5 bg-red-50/60 border-b border-red-100">
                <span className="text-xs font-medium text-red-700 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-400" /> Current
                </span>
              </div>
              <div className="px-4 py-3 text-sm text-stone-700 overflow-y-auto max-h-48 zen-scroll leading-relaxed">
                {activeArtifact?.content
                  ? activeArtifact.content
                      .replace(/<[^>]+>/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim()
                      .slice(0, 800)
                  : 'No content yet'}
                {(activeArtifact?.content?.length ?? 0) > 800 && (
                  <span className="text-stone-400"> ...</span>
                )}
              </div>
            </div>
            {/* Suggested content */}
            <div className="flex-1 overflow-hidden">
              <div className="px-3 py-1.5 bg-emerald-50/60 border-b border-emerald-100">
                <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> Suggested
                </span>
              </div>
              <div className="px-4 py-3 text-sm text-stone-700 overflow-y-auto max-h-48 zen-scroll leading-relaxed">
                {aiResult
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .slice(0, 800)}
                {aiResult.length > 800 && <span className="text-stone-400"> ...</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Loading Indicator ──────────────────────────────────────────── */}
      {aiLoading && (
        <div className="border-b border-blue-200 bg-violet-50/60 px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse [animation-delay:150ms]" />
            <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse [animation-delay:300ms]" />
          </div>
          <span className="text-sm text-violet-700 font-medium">Generating AI suggestion...</span>
          <button
            onClick={() => setAiLoading(false)}
            className="ml-auto text-xs text-violet-500 hover:text-violet-700"
          >
            Cancel
          </button>
        </div>
      )}

      {signResult && (
        <div
          className={`border-b px-3 py-1.5 text-xs flex items-center gap-2 ${signResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}
        >
          {signResult.success ? (
            <CheckCircle className="w-3.5 h-3.5" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5" />
          )}
          {signResult.message}
        </div>
      )}

      {lockRejection && (
        <div className="border-b border-red-300 bg-red-50 px-3 py-1.5 text-xs flex items-center gap-2 text-red-800">
          <Lock className="w-3.5 h-3.5 text-red-600 shrink-0" />
          <span className="font-semibold">{lockRejection}</span>
          <button
            onClick={() => setLockRejection(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <XCircle className="w-3 h-3" />
          </button>
        </div>
      )}

      {claimResult && (
        <div
          className={`border-b px-3 py-1.5 text-xs flex items-center gap-2 ${claimResult.supported ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}
        >
          {claimResult.supported ? (
            <CheckCircle className="w-3.5 h-3.5" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5" />
          )}
          Claim Check — {claimResult.supported ? 'Supported by Precedents' : 'Needs Evidence'}
          {claimResult.warnings?.length > 0 && (
            <span className="text-xs opacity-70">({claimResult.warnings.length} warnings)</span>
          )}
          <button
            onClick={() => setClaimResult(null)}
            className="ml-auto text-stone-400 hover:text-stone-600"
          >
            <XCircle className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* CTD section inline input (from overflow) */}
      {showCtdInput && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-stone-200 bg-stone-50/50">
          <MapPin className="w-3.5 h-3.5 text-stone-400" />
          <input
            type="text"
            value={ctdSectionInput}
            onChange={e => setCtdSectionInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCtdSection()}
            placeholder="e.g. 3.2.S"
            className="w-28 px-2 py-1 text-xs border border-stone-200 rounded bg-white focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 outline-none"
          />
          <button
            onClick={handleCtdSection}
            className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
          >
            Save
          </button>
          <button
            onClick={() => setShowCtdInput(false)}
            className="text-xs text-stone-400 hover:text-stone-600"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Lifecycle pipeline removed — status visible in toolbar badge, transitions via /workflow */}

      {/* ── Main canvas: Editor + optional single inspector drawer ──────── */}
      <div className="flex-1 min-h-0 overflow-hidden flex">
        {/* Editor — always fills available width */}
        <div
          className={cn('min-h-0 overflow-hidden relative', activeInspector ? 'flex-1' : 'w-full')}
        >
          {/* Locked overlay — gated by canonical mode, not raw status */}
          {modeCaps &&
            !modeCaps.editable &&
            modeCtx?.mode === 'readonly' &&
            activeArtifact?.status === 'locked' && (
              <div className="absolute inset-0 z-10 bg-red-50/40 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                <div className="bg-white/90 border border-red-200 rounded-lg px-6 py-4 shadow text-center pointer-events-auto max-w-xs">
                  <Lock className="w-6 h-6 text-red-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-red-800">Document Locked</p>
                  <p className="text-xs text-red-600 mt-1 mb-3">
                    This document is locked and read-only. Provide a reason to unlock.
                  </p>
                  <input
                    type="text"
                    value={unlockReason}
                    onChange={e => setUnlockReason(e.target.value)}
                    placeholder="Reason for unlocking (min 5 chars)"
                    className="w-full px-2 py-1.5 text-xs border border-red-200 rounded-lg mb-2 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 outline-none"
                  />
                  <button
                    onClick={() => {
                      handleStatusChange('draft', unlockReason.trim());
                      setUnlockReason('');
                    }}
                    disabled={changingStatus || unlockReason.trim().length < 5}
                    className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center gap-1.5 mx-auto"
                  >
                    {changingStatus ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Unlock className="w-3 h-3" />
                    )}
                    Unlock to Edit
                  </button>
                </div>
              </div>
            )}
          {/* Document watermark overlay (DRAFT, UNDER REVIEW, etc.) */}
          <DocumentWatermark
            status={activeArtifact?.status || 'draft'}
            enabled={activeArtifact?.status !== 'approved'}
          />
          {/* Live collaboration cursors */}
          <CollaborationCursors cursors={collaboration.cursors} currentUserId={currentUser.id} />
          {/* Guided empty state for new/blank documents */}
          {activeArtifact &&
            (!activeArtifact.content ||
              activeArtifact.content.replace(/<[^>]*>/g, '').trim().length < 10) &&
            activeArtifact.status !== 'locked' && (() => {
              // Context-aware outline templates based on submission type and CTD section
              const uType = (submissionType || '').toUpperCase();
              const section = activeArtifact.ctdSection || ctdSection || '';
              const docTitle = activeArtifact.title || 'Document Title';

              const getOutlineTemplate = (): string => {
                // CTD Module 2 sections
                if (section.startsWith('2.4') || section.startsWith('2.5') || uType === 'IND' || uType === 'NDA' || uType === 'BLA') {
                  return `<h1>${docTitle}</h1><h2>1. Overview</h2><p></p><h2>2. Pharmacology</h2><p></p><h2>3. Pharmacokinetics</h2><p></p><h2>4. Toxicology</h2><p></p><h2>5. Clinical Efficacy</h2><p></p><h2>6. Clinical Safety</h2><p></p><h2>7. Benefit-Risk Assessment</h2><p></p><h2>8. References</h2><p></p>`;
                }
                // Device submissions
                if (uType === '510K' || uType === 'PMA' || uType === 'DE_NOVO') {
                  return `<h1>${docTitle}</h1><h2>1. Device Description</h2><p></p><h2>2. Intended Use / Indications for Use</h2><p></p><h2>3. Predicate Device Comparison</h2><p></p><h2>4. Substantial Equivalence Discussion</h2><p></p><h2>5. Performance Testing</h2><p></p><h2>6. Biocompatibility</h2><p></p><h2>7. Sterilization & Shelf Life</h2><p></p><h2>8. Labeling</h2><p></p>`;
                }
                // CSR
                if (section.includes('csr') || docTitle.toLowerCase().includes('clinical study report')) {
                  return `<h1>${docTitle}</h1><h2>1. Synopsis</h2><p></p><h2>2. Study Design</h2><p></p><h2>3. Study Objectives</h2><p></p><h2>4. Investigational Plan</h2><p></p><h2>5. Study Participants</h2><p></p><h2>6. Efficacy Evaluation</h2><p></p><h2>7. Safety Evaluation</h2><p></p><h2>8. Discussion & Conclusions</h2><p></p>`;
                }
                // Default
                return `<h1>${docTitle}</h1><h2>1. Introduction</h2><p></p><h2>2. Background</h2><p></p><h2>3. Methods</h2><p></p><h2>4. Results</h2><p></p><h2>5. Discussion</h2><p></p><h2>6. Conclusions</h2><p></p><h2>7. References</h2><p></p>`;
              };

              const outlineLabel = uType === '510K' || uType === 'PMA' || uType === 'DE_NOVO'
                ? 'Device Outline'
                : section.startsWith('2.') || uType === 'IND' || uType === 'NDA' || uType === 'BLA'
                  ? 'CTD Outline'
                  : 'Standard Outline';

              return (
                <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-center pt-20 pointer-events-none">
                  <div className="pointer-events-auto bg-white/95 backdrop-blur-sm border border-stone-200 rounded-xl shadow-lg p-5 max-w-md w-full mx-4">
                    <div className="text-center mb-4">
                      <PenTool className="w-6 h-6 text-stone-400 mx-auto mb-2" />
                      <h3 className="text-sm font-semibold text-stone-900">
                        {docTitle}
                      </h3>
                      <p className="text-xs text-stone-500 mt-1">
                        {section
                          ? `CTD ${section} — choose how to begin`
                          : 'Choose a starting point or just begin typing'}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleAIEdit('expand')}
                        className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-stone-700 bg-stone-50 border border-stone-200 rounded-lg hover:bg-stone-100 hover:border-stone-300 transition-colors text-left"
                      >
                        <Sparkles className="w-3.5 h-3.5 shrink-0 text-stone-500" />
                        AI Generate Draft
                      </button>
                      <button
                        onClick={() => {
                          setActiveArtifact({ ...activeArtifact, content: getOutlineTemplate() });
                          setIsDirty(true);
                        }}
                        className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-stone-700 bg-stone-50 border border-stone-200 rounded-lg hover:bg-stone-100 hover:border-stone-300 transition-colors text-left"
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0 text-stone-500" />
                        {outlineLabel}
                      </button>
                      <button
                        onClick={() => toggleInspector('templates')}
                        className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-stone-700 bg-stone-50 border border-stone-200 rounded-lg hover:bg-stone-100 hover:border-stone-300 transition-colors text-left"
                      >
                        <Layers className="w-3.5 h-3.5 shrink-0 text-stone-500" />
                        From Template
                      </button>
                      <button
                        onClick={() => toggleInspector('dataroom')}
                        className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-stone-700 bg-stone-50 border border-stone-200 rounded-lg hover:bg-stone-100 hover:border-stone-300 transition-colors text-left"
                      >
                        <Database className="w-3.5 h-3.5 shrink-0 text-stone-500" />
                        Browse Sources
                      </button>
                    </div>
                    <p className="text-[10px] text-stone-400 text-center mt-3">
                      Type <kbd className="px-1 py-0.5 bg-stone-100 rounded text-stone-500">/</kbd>{' '}
                      anywhere for AI commands
                    </p>
                  </div>
                </div>
              );
            })()}
          <UnifiedDocumentEditor
            key={activeArtifact?.id}
            documentId={activeArtifact?.id}
            initialContent={activeArtifact?.content || ''}
            documentTitle={activeArtifact?.title}
            documentType={activeArtifact?.type}
            submissionType={submissionType}
            showCompliance={true}
            showTraceability={false}
            complianceIssues={complianceIssues}
            onComplianceIssuesFound={(issues: any[]) => {
              setComplianceIssues(issues);
              setIsScanning(false);
              setLastScanTime(Date.now());
            }}
            embedded
            isReadOnly={modeCaps ? !modeCaps.editable : activeArtifact?.status === 'locked'}
            documentMode={currentDocumentMode}
            onToggleLock={handleToggleLock}
            onSave={handleSave}
            onAIAction={(action, selectedText) => {
              if (action === 'link-source') {
                pushToast('Select text first, then use Link to Source in the bubble menu', 'info');
                return;
              }
              handleAIEdit(
                action as 'rewrite' | 'expand' | 'summarize' | 'regulatory-tone' | 'add-references'
              );
            }}
            onAddComment={handleAddCommentFromEditor}
            cancelCommentId={cancelCommentId}
            onSelectionUpdate={(editor) => {
              if (!editor || !collaboration.emitCursorMove) return;
              const { from } = editor.state.selection;
              const coords = editor.view.coordsAtPos(from);
              if (coords) {
                const editorRect = editor.view.dom.getBoundingClientRect();
                collaboration.emitCursorMove({
                  x: coords.left - editorRect.left,
                  y: coords.top - editorRect.top,
                });
              }
            }}
            onLiveContentChange={html => {
              onContentChange?.(html, activeArtifact?.title || '');
              triggerAutoSave(html);
              computeTrackedChanges(html);
              // Broadcast collaboration typing
              collaboration.emitTypingStart();
              collaboration.setPresence('editing');
            }}
          />
        </div>

        {/* Single inspector drawer — only one at a time (canonical InspectorDrawer) */}
        <InspectorDrawer visible={activeInspector === 'intelligence'}>
          <RegulatoryIntelligencePanel
            submissionType={submissionType}
            indication={activeArtifact?.title}
            deviceName={activeArtifact?.title}
            documentContent={activeArtifact?.content}
            onClose={() => setActiveInspector(null)}
            onCreateDocument={async (content: string, title: string, ctdSection?: string) => {
              if (!projectId) return;
              try {
                const res = await apiRequest(
                  'POST',
                  `/api/concept2cure/projects/${projectId}/artifacts`,
                  {
                    title,
                    content,
                    type: 'regulatory_document',
                    category: 'document',
                    ctdSection: ctdSection || undefined,
                  }
                );
                if (res.ok) {
                  const payload = await res.json();
                  const created = payload.data ?? payload;
                  setActiveArtifact(created);
                  setShowArtifactList(false);
                  setActiveInspector(null);
                  loadArtifacts();
                  pushToast(`Created "${title}" from Intelligence`, 'success');
                } else {
                  pushToast('Document creation failed', 'error');
                }
              } catch {
                pushToast('Network error — document not created', 'error');
              }
            }}
          />
        </InspectorDrawer>
        <InspectorDrawer
          visible={activeInspector === 'provenance' && !!projectId && !!activeArtifact}
        >
          <DocumentProvenancePanel
            projectId={projectId!}
            artifactId={activeArtifact?.id}
            onClose={() => setActiveInspector(null)}
            onOpenCompare={openCompare}
            onOpenAudit={openAudit}
          />
        </InspectorDrawer>
        <InspectorDrawer
          visible={activeInspector === 'compare' && !!projectId && !!activeArtifact}
          width="w-80 max-w-[35vw]"
        >
          <DocumentVersionCompare
            projectId={projectId}
            artifactId={activeArtifact.id}
            onClose={() => setActiveInspector(null)}
            onOpenAudit={openAudit}
            onOpenProvenance={openProvenance}
            onRollbackComplete={loadArtifacts}
          />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'audit' && !!projectId && !!activeArtifact}>
          <DocumentAuditReport
            projectId={projectId!}
            artifactId={activeArtifact?.id}
            onClose={() => setActiveInspector(null)}
            onOpenProvenance={openProvenance}
            onOpenCompare={openCompare}
            onExportAsArtifact={handleExportAudit}
            exportingAudit={exportingAudit}
          />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'proof' && !!projectId && !!activeArtifact}>
          <ArtifactProofPanel projectId={projectId!} artifact={activeArtifact!} />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'dataroom' && !!projectId}>
          <DataRoomPanel
            projectId={projectId!}
            onSourceSelect={source => {
              pushToast(`Viewing source: ${source.title}`, 'info');
            }}
            onSourceDrag={source => {
              // Persist citation link when source is dragged into editor
              if (activeArtifact?.id) {
                apiRequest('POST', `/api/documents/${activeArtifact.id}/sources`, {
                  sentenceIndex: 0,
                  sentenceText: `[Cited from Data Room: ${source.title}]`,
                  sourceType: 'internal_data',
                  sourceId: source.id || `dr-${Date.now()}`,
                  sourceTitle: source.title,
                  confidence: 0.9,
                }).catch(() => {
                  // Non-blocking — citation persistence is best-effort
                });
              }
              pushToast(`Citing: ${source.title}`, 'info');
            }}
            onUpload={() => {
              pushToast('Upload source files from the Project sidebar', 'info');
            }}
          />
        </InspectorDrawer>
        <InspectorDrawer
          visible={activeInspector === 'inconsistency' && !!projectId && !!activeArtifact}
        >
          <InconsistencyPanel
            projectId={projectId}
            activeArtifactId={activeArtifact.id}
            activeArtifactTitle={activeArtifact.title}
            activeContent={activeArtifact.content}
            onNavigateToArtifact={artifactId => {
              const target = artifacts.find(a => a.id === artifactId);
              if (target) {
                setActiveArtifact(target);
                pushToast(`Navigated to: ${target.title}`, 'info');
              }
            }}
          />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'health' && !!activeArtifact}>
          <DocumentHealth
            content={activeArtifact.content || ''}
            documentType={activeArtifact.type}
            submissionType={submissionType}
            ctdSection={activeArtifact.ctdSection}
            onFixIssue={async (dimId, idx) => {
              if (!activeArtifact) return;
              const fixActions: Record<string, string> = {
                language: 'regulatory-tone',
                readability: 'rewrite',
                completeness: 'expand',
                citations: 'add-references',
                formatting: 'rewrite',
              };
              const action = fixActions[dimId] || 'rewrite';
              pushToast(`Applying AI fix for ${dimId} issue #${idx + 1}…`, 'info');
              handleAIEdit(
                action as 'rewrite' | 'expand' | 'summarize' | 'regulatory-tone' | 'add-references'
              );
            }}
          />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'versions' && !!activeArtifact}>
          <VersionTimeline
            versions={(activeArtifact.versions || []).map((v, i) => ({
              id: `v-${v.version || i}`,
              version: v.version || i + 1,
              content: v.content || '',
              createdAt: v.createdAt || activeArtifact.createdAt,
            }))}
            currentContent={activeArtifact.content || ''}
            currentVersion={activeArtifact.version || 1}
            onRestore={version => {
              setActiveArtifact(prev => (prev ? { ...prev, content: version.content } : null));
              pushToast(`Restored to version ${version.version}`, 'success');
            }}
            onClose={() => setActiveInspector(null)}
          />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'sources'}>
          <SourceCitationsPanel
            artifactId={activeArtifact?.id}
            onClose={() => setActiveInspector(null)}
          />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'templates'} width="w-96">
          <TemplateGeneratorPanel
            projectId={projectId}
            artifactId={activeArtifact?.id}
            onGenerated={(content, templateName) => {
              // Wrap in HTML if not already
              const htmlContent = content.startsWith('<')
                ? content
                : content.split('\n\n').map(p => `<p>${p}</p>`).join('\n');
              if (activeArtifact) {
                setActiveArtifact(prev => (prev ? { ...prev, content: htmlContent } : null));
              } else {
                setNewDocTitle(templateName);
              }
              pushToast(`Template content generated: ${templateName}`, 'success');
              setActiveInspector(null);
            }}
            onClose={() => setActiveInspector(null)}
          />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'precedent'} width="w-96">
          <PrecedentSearchInspector
            submissionType={submissionType || ''}
            onInsertCitation={(text) => {
              /* Insert precedent citation at cursor */
              if (activeArtifact) {
                const citation = `<p class="precedent-citation" style="border-left:2px solid #e5e7eb;padding-left:8px;color:#6b7280;font-size:13px">${text}</p>`;
                setActiveArtifact(prev => prev ? { ...prev, content: (prev.content || '') + citation } : null);
                pushToast('Precedent citation inserted', 'success');
              }
            }}
            onClose={() => setActiveInspector(null)}
          />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'batch-ai' && !!activeArtifact} width="w-96">
          <BatchAIPanel
            content={activeArtifact.content || ''}
            submissionType={submissionType}
            onApply={newContent => {
              setActiveArtifact(prev => (prev ? { ...prev, content: newContent } : null));
              pushToast('Batch AI changes applied', 'success');
            }}
            onClose={() => setActiveInspector(null)}
          />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'crossref' && !!activeArtifact}>
          <CrossReferencePanel
            content={activeArtifact.content || ''}
            projectId={projectId}
            artifacts={artifacts.map(a => ({
              id: a.id,
              title: a.title,
              ctdSection: a.ctdSection,
              content: a.content,
            }))}
            onInsertReference={refText => {
              pushToast(`Reference inserted: ${refText}`, 'success');
            }}
            onNavigateToSection={sectionId => {
              const target = artifacts.find(a => a.id === sectionId);
              if (target) {
                setActiveArtifact(target);
                pushToast(`Navigated to: ${target.title}`, 'info');
              }
            }}
            onClose={() => setActiveInspector(null)}
          />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'comments' && !!activeArtifact}>
          <CommentThreadPanel
            comments={comments}
            currentUserId={getCurrentUser().id}
            onResolve={commentId => {
              setComments(prev =>
                prev.map(c => (c.id === commentId ? { ...c, resolved: true } : c))
              );
              updateCommentOnServer(commentId, { status: 'resolved' });
              pushToast('Comment resolved', 'success');
            }}
            onReopen={commentId => {
              setComments(prev =>
                prev.map(c => (c.id === commentId ? { ...c, resolved: false } : c))
              );
              updateCommentOnServer(commentId, { status: 'open' });
            }}
            onReply={(commentId, text) => {
              const user = getCurrentUser();
              setComments(prev =>
                prev.map(c =>
                  c.id === commentId
                    ? {
                        ...c,
                        replies: [
                          ...c.replies,
                          {
                            id: `reply-${Date.now()}`,
                            text,
                            authorId: user.id,
                            authorName: user.name,
                            createdAt: new Date().toISOString(),
                          },
                        ],
                      }
                    : c
                )
              );
              addReplyOnServer(commentId, text);
            }}
            onDelete={commentId => {
              setComments(prev => prev.filter(c => c.id !== commentId));
              deleteCommentOnServer(commentId);
              pushToast('Comment deleted', 'success');
            }}
            onNavigateToComment={commentId => {
              // Find the comment mark in the editor DOM and scroll to it
              const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
              if (commentEl) {
                commentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Flash highlight
                commentEl.classList.add('ring-2', 'ring-blue-400', 'ring-offset-1');
                setTimeout(() => {
                  commentEl.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-1');
                }, 2000);
              } else {
                pushToast('Comment location not found in document', 'info');
              }
            }}
            onClose={() => setActiveInspector(null)}
          />
        </InspectorDrawer>
        <InspectorDrawer
          visible={activeInspector === 'reviewers' && !!activeArtifact}
          className="overflow-y-auto"
        >
          <ReviewerAssignment
            documentId={activeArtifact.id}
            documentTitle={activeArtifact.title}
            currentStatus={activeArtifact.status}
            reviewers={reviewers}
            teamMembers={teamMembers}
            onAddReviewer={handleAddReviewer}
            onRemoveReviewer={handleRemoveReviewer}
            onSubmitForReview={async () => {
              await handleStatusChange('review');
              pushToast('Document submitted for review', 'success');
            }}
            onClose={() => setActiveInspector(null)}
          />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'review' && !!activeArtifact}>
          <ReviewModePanel
            isReviewMode={isReviewMode}
            onToggleReviewMode={handleToggleReviewMode}
            changes={trackedChanges}
            onAcceptChange={changeId => {
              setTrackedChanges(prev =>
                prev.map(c => (c.id === changeId ? { ...c, accepted: true } : c))
              );
            }}
            onRejectChange={changeId => {
              setTrackedChanges(prev =>
                prev.map(c => (c.id === changeId ? { ...c, rejected: true } : c))
              );
            }}
            onAcceptAll={() => {
              setTrackedChanges(prev => prev.map(c => ({ ...c, accepted: true })));
              pushToast('All changes accepted', 'success');
            }}
            onRejectAll={() => {
              setTrackedChanges(prev => prev.map(c => ({ ...c, rejected: true })));
              pushToast('All changes rejected', 'info');
            }}
            onCompleteReview={async (status, reviewComments) => {
              // Map review outcome to artifact status
              const newStatus = status === 'approved' ? 'approved' : 'review';
              await handleStatusChange(newStatus, reviewComments);
              setIsReviewMode(false);
              pushToast(
                status === 'approved'
                  ? 'Review approved — document status updated'
                  : 'Changes requested — returned to review',
                'success'
              );
            }}
            onClose={() => setActiveInspector(null)}
          />
        </InspectorDrawer>
        <InspectorDrawer
          visible={activeInspector === 'submission-readiness' && !!projectId}
          width="w-96"
        >
          <SubmissionReadinessValidator
            projectId={projectId}
            submissionType={submissionType}
            artifacts={artifacts.map(a => ({
              id: a.id,
              title: a.title,
              status: a.status,
              ctdSection: a.ctdSection,
              content: a.content,
              type: a.type,
            }))}
            onNavigateToArtifact={artifactId => {
              const target = artifacts.find(a => a.id === artifactId);
              if (target) {
                setActiveArtifact(target);
                setActiveInspector(null);
              }
            }}
            onClose={() => setActiveInspector(null)}
          />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'compliance-scanner'} width="w-96">
          <ComplianceScannerPanel
            issues={complianceIssues}
            isScanning={isScanning}
            lastScanTime={lastScanTime}
            onNavigateToIssue={(issueId) => {
              const issue = complianceIssues.find(i => i.id === issueId);
              if (issue) {
                // Scroll to issue location in editor
                console.log(`[Compliance] Navigate to issue at position ${issue.from}-${issue.to}`);
              }
            }}
            onFixIssue={(issueId, suggestion) => {
              // Apply suggested fix
              setComplianceIssues(prev => prev.filter(i => i.id !== issueId));
            }}
            onRescan={() => {
              setIsScanning(true);
              setLastScanTime(Date.now());
              // Trigger re-scan by reading from editor storage after a delay
              setTimeout(() => setIsScanning(false), 1500);
            }}
            onClose={() => setActiveInspector(null)}
          />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'ana-memory' && !!projectId} width="w-96">
          <AnAMemory
            projectId={projectId!}
            projectName={projectName}
            onClose={() => setActiveInspector(null)}
          />
        </InspectorDrawer>
        <InspectorDrawer visible={activeInspector === 'ga-readiness'} width="w-96">
          <EditorGAReadinessPanel
            checks={gaChecks}
            models={gaWorkflowModels}
            capabilities={competitiveCapabilities}
            remediationQueue={gaRemediationQueue}
            onOpenInspector={id => toggleInspector(id as InspectorPanel)}
          />
        </InspectorDrawer>
      </div>

      {/* ── Export Dialog ── */}
      {activeArtifact && (
        <ExportDialog
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          documentTitle={activeArtifact.title}
          documentContent={activeArtifact.content || ''}
          ctdSection={activeArtifact.ctdSection}
          onExport={async format => {
            switch (format) {
              case 'docx':
                await handleExportDocx();
                break;
              case 'pdf':
                await handleExportPdf();
                break;
              case 'pptx':
                await handleExportPptx();
                break;
              case 'markdown':
                await handleExportMarkdown();
                break;
            }
          }}
        />
      )}

      {/* ── Quality Gate Dialog ── */}
      {qualityGateDialog.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="text-sm font-semibold text-stone-900">
                Quality Check — Review Before Proceeding
              </h3>
            </div>
            <p className="text-xs text-stone-500 mb-3">
              The following issues were detected. You can proceed anyway or go back to fix them.
            </p>
            <ul className="space-y-2 mb-4">
              {qualityGateDialog.warnings.map((w, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {w}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() =>
                  setQualityGateDialog({ show: false, targetStatus: '', warnings: [] })
                }
                className="px-3 py-1.5 text-xs font-medium text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors duration-150"
              >
                Go Back & Fix
              </button>
              <button
                onClick={() => {
                  const target = qualityGateDialog.targetStatus;
                  setQualityGateDialog({ show: false, targetStatus: '', warnings: [] });
                  executeStatusChange(target);
                }}
                className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors duration-150"
              >
                Proceed Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Comment Dialog ── */}
      {showNewCommentDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-stone-900">Add Comment</h3>
            </div>
            {pendingCommentHighlight && (
              <div className="border-l-2 border-blue-300 pl-2 py-1 bg-blue-50 rounded-r text-xs text-stone-500 italic mb-3 truncate">
                &ldquo;{pendingCommentHighlight.slice(0, 100)}
                {pendingCommentHighlight.length > 100 ? '…' : ''}&rdquo;
              </div>
            )}
            <textarea
              autoFocus
              value={pendingCommentText}
              onChange={e => setPendingCommentText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmitComment(pendingCommentText);
                }
                if (e.key === 'Escape') {
                  handleCancelComment();
                }
              }}
              placeholder="Type your comment…"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-400 outline-none resize-none"
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px] text-stone-400">Ctrl+Enter to submit</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancelComment}
                  className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700 rounded-md hover:bg-stone-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSubmitComment(pendingCommentText)}
                  disabled={!pendingCommentText.trim()}
                  className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Add Comment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Review Mode Active Banner ── */}
      {isReviewMode && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 flex items-center gap-2 text-xs text-amber-800">
          <Eye className="w-3.5 h-3.5 text-amber-600" />
          <span className="font-medium">Review Mode Active</span>
          <span className="text-amber-600">— All changes are being tracked as suggestions</span>
          {trackedChanges.filter(c => !c.accepted && !c.rejected).length > 0 && (
            <span className="ml-auto bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full text-[10px] font-semibold">
              {trackedChanges.filter(c => !c.accepted && !c.rejected).length} pending
            </span>
          )}
        </div>
      )}

      {/* ── Keyboard Shortcuts Overlay ── */}
      <KeyboardShortcutsOverlay isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* ── Toast notifications ── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-xs font-medium animate-in slide-in-from-bottom-2 fade-in duration-200',
                t.type === 'success' && 'bg-emerald-600 text-white',
                t.type === 'error' && 'bg-red-600 text-white',
                t.type === 'info' && 'bg-stone-700 text-white'
              )}
            >
              {t.type === 'success' && <CheckCircle className="w-3.5 h-3.5 shrink-0" />}
              {t.type === 'error' && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              {t.type === 'info' && <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />}
              {t.message}
              {t.onUndo && (
                <button
                  onClick={() => {
                    t.onUndo?.();
                    setToasts(prev => prev.filter(x => x.id !== t.id));
                  }}
                  className="ml-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-white/20 rounded hover:bg-white/30 transition-colors duration-150"
                >
                  Undo
                </button>
              )}
              <button
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                className="ml-1 opacity-60 hover:opacity-100"
              >
                <XCircle className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Part 11 Electronic Signature Dialog */}
      {activeArtifact && (
        <SignatureWorkflow
          open={showSignatureDialog}
          onClose={() => setShowSignatureDialog(false)}
          documentId={activeArtifact.id}
          documentTitle={activeArtifact.title}
          documentVersion={activeArtifact.version}
          documentContent={activeArtifact.content || ''}
          documentStatus={activeArtifact.status}
          onSignatureComplete={sig => {
            setSignatures(prev => [
              ...prev,
              {
                signatureId: sig.id,
                signatureType: sig.meaning,
                signerName: sig.signerName,
                signerEmail: '',
                signerRole: sig.signerTitle,
                signedAt: sig.signedAt,
                signatureHash: sig.signatureHash,
                status: 'valid',
              },
            ]);
            pushToast('Electronic signature applied successfully', 'success');
            loadArtifacts();
          }}
        />
      )}
    </div>
  );
};

export default EditorPanel;
