/**
 * EditorPanel — Bridge component connecting UnifiedDocumentEditor to live APIs.
 *
 * Wires:
 * - Save → PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId
 * - Load → GET /api/concept2cure/projects/:projectId/artifacts
 * - AI Edit → POST /api/concept2cure/ai/edit-section
 * - DOCX Export → POST /api/concept2cure/documents/generate (via chat tool) + download
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Zap,
  ArrowRight,
  Users,
  MessageSquare,
  Eye,
  Link2,
  Layers,
  Keyboard,
} from 'lucide-react';
import { useClaimCheck, type ClaimCheckResult } from '../../hooks/usePrecedentEngine';
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
import { ReviewerAssignment } from './ReviewerAssignment';
import { CollaborationPresence, CollaborationCursors } from './CollaborationPresence';
import { DocumentWatermark } from './DocumentWatermark';
import { useCollaboration } from '../../hooks/useCollaboration';
import { SignatureWorkflow, SignatureList } from './SignatureWorkflow';
import { SubmissionReadinessValidator } from '../submission/SubmissionReadinessValidator';
import { ComplianceScannerPanel } from './ComplianceScannerPanel';
import { AnAMemory } from '../intelligence/AnAMemory';
import ArtifactProofPanel from './ArtifactProofPanel';
import { getCurrentUser } from '../../utils/getCurrentUser';
import {
  useDocumentModeOptional,
  type DocumentMode,
  MODE_CAPABILITIES,
} from '../../contexts/DocumentModeContext';

// ── Auth helper (same pattern as useProjects) ────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}


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
  // ── Document mode context (stage-aware) ──────────────────────────────
  const modeCtx = useDocumentModeOptional();
  const modeCaps = modeCtx ? MODE_CAPABILITIES[modeCtx.mode] : null;

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

  // ── Claim checker (Precedent Engine) ─────────────────────────────────────
  const [claimResult, setClaimResult] = useState<ClaimCheckResult | null>(null);
  const [claimStatus, setClaimStatus] = useState<
    'idle' | 'checking' | 'supported' | 'needs-evidence'
  >('idle');
  const claimCheckMutation = useClaimCheck();
  const claimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Single secondary inspector panel (only one open at a time) ────────
  type InspectorPanel = 'intelligence' | 'provenance' | 'compare' | 'audit' | 'dataroom' | 'inconsistency' | 'health' | 'versions' | 'batch-ai' | 'crossref' | 'comments' | 'review' | 'reviewers' | 'submission-readiness' | 'compliance-scanner' | 'ana-memory' | 'proof';
  const [activeInspector, setActiveInspector] = useState<InspectorPanel | null>(null);
  const toggleInspector = useCallback((panel: InspectorPanel) => {
    setActiveInspector(prev => (prev === panel ? null : panel));
  }, []);

  // Auto-open inspector when initialInspector is set from parent
  useEffect(() => {
    if (initialInspector) setActiveInspector(initialInspector);
  }, [initialInspector]);

  // ── Sign/Approve state ────────────────────────────────────────────────
  const [signing, setSigning] = useState(false);
  const [signResult, setSignResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);

  // ── Status change state ───────────────────────────────────────────────
  const [changingStatus, setChangingStatus] = useState(false);

  // ── Toast notification queue ──────────────────────────────────────────
  type ToastItem = { id: number; message: string; type: 'success' | 'error' | 'info'; onUndo?: () => void };
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
  // Review mode is only available when mode capabilities allow it
  const reviewModeAvailable = modeCaps?.showReviewToggle ?? true;
  const [trackedChanges, setTrackedChanges] = useState<Array<{
    id: string;
    type: 'addition' | 'deletion' | 'modification';
    originalText: string;
    newText: string;
    author: string;
    timestamp: string;
    accepted?: boolean;
    rejected?: boolean;
  }>>([]);
  const reviewSnapshotRef = useRef<string>('');

  // ── New comment dialog state ───────────────────────────────────────
  const [pendingCommentText, setPendingCommentText] = useState('');
  const [showNewCommentDialog, setShowNewCommentDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [pendingCommentHighlight, setPendingCommentHighlight] = useState('');
  const pendingCommentClientIdRef = useRef<string>('');
  const [cancelCommentId, setCancelCommentId] = useState<string | null>(null);

  // ── Sync artifact status into DocumentModeContext ───────────────────
  React.useEffect(() => {
    if (modeCtx && activeArtifact?.status) {
      modeCtx.setArtifactStatus(activeArtifact.status);
    } else if (modeCtx && !activeArtifact) {
      modeCtx.setArtifactStatus(null);
    }
  }, [activeArtifact?.status, activeArtifact?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
            ns => !oldSentences.includes(ns) && (
              ns.slice(0, 30) === sentence.slice(0, 30) ||
              ns.slice(-30) === sentence.slice(-30)
            )
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
        if (!oldSentences.includes(sentence) && !modifiedNewTexts.includes(sentence.slice(0, 200))) {
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
      const res = await fetch(`/api/concept2cure/projects/${projectId}/artifacts`, {
        headers: getAuthHeaders(),
      });
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
    const headers = getAuthHeaders();

    const handleError = () => {
      if (!cancelled) setTrustLoadFailed(true);
    };

    // Fetch signatures
    fetch(`/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/signatures`, {
      headers,
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(d => { if (!cancelled) setSignatures(d.data ?? d ?? []); })
      .catch(() => { if (!cancelled) { setSignatures([]); handleError(); } });
    // Fetch provenance count
    fetch(`/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/provenance`, {
      headers,
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(d => {
        if (!cancelled && d) {
          const prov = d.data ?? d;
          const events = prov?.reviewHistory?.length ?? prov?.events?.length ?? 0;
          setProvenanceCount(events);
        }
      })
      .catch(() => { if (!cancelled) { setProvenanceCount(0); handleError(); } });
    // Fetch integrity verification
    fetch(
      `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/verify-integrity`,
      { headers },
    )
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(d => { if (!cancelled && d) setIntegrityVerified((d.data ?? d)?.verified ?? null); })
      .catch(() => { if (!cancelled) { setIntegrityVerified(null); handleError(); } });

    return () => { cancelled = true; };
  }, [projectId, activeArtifact?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-create artifact from initial content (eCTD handoff) ──────────────
  const initialContentConsumedRef = useRef(false);
  useEffect(() => {
    if (!projectId || !initialContent || !initialTitle || initialContentConsumedRef.current) return;
    initialContentConsumedRef.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/concept2cure/projects/${projectId}/artifacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            title: initialTitle,
            content: initialContent,
            type: 'regulatory_document',
            category: 'document',
            ctdSection: initialCtdSection || undefined,
          }),
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
      if (modeCaps && !modeCaps.canSave) return;
      if (!projectId || !activeArtifact) return;
      // Capability-gated save — canonical DocumentMode decides save availability
      if (modeCaps && !modeCaps.canSave) {
        setLockRejection('Editing is not available in the current mode. Switch to edit mode to save.');
        setTimeout(() => setLockRejection(null), 5000);
        return;
      }
      setSaving(true);
      setSaveStatus('idle');
      setLockRejection(null);
      try {
        const res = await fetch(
          `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ content, title: activeArtifact.title }),
          }
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
    [activeArtifact, handleSave],
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
      const res = await fetch(`/api/concept2cure/projects/${projectId}/artifacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          title: newDocTitle.trim(),
          content: '<p>Begin editing your document here...</p>',
          type: 'regulatory_document',
          category: 'document',
        }),
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
      if (modeCaps && !modeCaps.showAIActions) return;
      if (!activeArtifact) return;
      setAiLoading(true);
      setAiMenuOpen(false);
      setAiResult(null);
      pushToast(`Generating ${action.replace(/-/g, ' ')}…`, 'info');
      try {
        const res = await fetch('/api/concept2cure/ai/edit-section', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            action,
            text: activeArtifact.content,
            sectionTitle: activeArtifact.title,
            submissionType: submissionType || undefined,
          }),
        });
        if (res.ok) {
          const payload = await res.json();
          const result = payload.data?.result ?? payload.result;
          if (result) {
            setAiResult(result);
            pushToast('AI suggestion ready — review below', 'success');
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
    [activeArtifact, submissionType]
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
      const res = await fetch('/api/concept2cure/artifacts/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ title: activeArtifact.title, content: activeArtifact.content }),
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
      const res = await fetch('/api/concept2cure/artifacts/export-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ title: activeArtifact.title, content: activeArtifact.content }),
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

  // ── Sign & Approve ───────────────────────────────────────────────────
  const handleSignApprove = useCallback(async () => {
    if (!projectId || !activeArtifact) return;
    setSigning(true);
    setSignResult(null);
    pushToast('Signing document…', 'info');
    try {
      const res = await fetch(
        `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/signatures`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            signaturePurpose: 'Document review and approval',
            signatureMeaning: 'I have reviewed this document and approve its content',
            authenticationMethod: 'password',
            secondFactorVerified: false,
            version: activeArtifact.version,
          }),
        }
      );
      if (res.ok) {
        setSignResult({ success: true, message: 'Signature recorded successfully' });
        // Also update status to approved
        await fetch(
          `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/status`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ status: 'approved' }),
          }
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
    async (newStatus: string, reason?: string) => {
      if (!projectId || !activeArtifact) return;
      setChangingStatus(true);
      try {
        const body: Record<string, string> = { status: newStatus };
        if (reason) body.reason = reason;
        const res = await fetch(
          `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/status`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(body),
          }
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

  const handleStatusChange = useCallback(
    async (newStatus: string, reason?: string) => {
      if (!activeArtifact) return;

      // Quality gate: run checks when advancing to review or approved.
      // NOTE: Raw status read is intentional domain state inspection for workflow
      // transition direction — this is NOT a behavioral gate, it determines
      // whether quality checks should fire before the status mutation.
      const isAdvancing = (newStatus === 'review' || newStatus === 'approved') &&
        (activeArtifact.status === 'draft' || activeArtifact.status === 'review');

      if (isAdvancing && activeArtifact.content) {
        const content = activeArtifact.content.replace(/<[^>]*>/g, '');
        const warnings: string[] = [];

        // Check document length
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        if (wordCount < 50) warnings.push(`Document is very short (${wordCount} words) — consider expanding before review.`);

        // Check for placeholder text
        if (/\[.*?\]|TODO|TBD|FIXME|lorem ipsum/i.test(content)) {
          warnings.push('Document may contain placeholder text (e.g., [brackets], TODO, TBD).');
        }

        // Check CTD section assignment
        if (!activeArtifact.ctdSection) {
          warnings.push('No CTD section assigned — reviewers won\'t know the dossier placement.');
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

  // ── Canonical lock/unlock toggle ──────────────────────────────────────
  // Single action path: editable → lock (via approved→locked transition)
  // or locked → unlock (via locked→draft transition with unlock reason overlay).
  // The toolbar lock button in UnifiedDocumentEditor dispatches here.
  const handleLockToggle = useCallback(() => {
    if (!activeArtifact) return;
    const current = activeArtifact.status || 'draft';
    if (current === 'locked') {
      // Unlock: show the existing unlock overlay (which requires a reason)
      // The overlay is already rendered conditionally on readonly + locked state.
      // We just need to ensure the overlay is visible — it's gated by mode.
      // If user is somehow in edit mode with a locked doc, force the unlock dialog:
      pushToast('Use the unlock overlay to provide a reason for unlocking.', 'info');
    } else if (current === 'approved') {
      // Approved → Locked: direct transition
      handleStatusChange('locked');
    } else {
      // draft/review → cannot lock directly, must go through workflow
      pushToast('Document must be approved before it can be locked.', 'info');
    }
  }, [activeArtifact, handleStatusChange, pushToast]);

  // ── CTD Section assignment ───────────────────────────────────────────
  const handleCtdSection = useCallback(async () => {
    if (!projectId || !activeArtifact || !ctdSectionInput.trim()) return;
    try {
      const res = await fetch(
        `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/ctd-section`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ ctdSection: ctdSectionInput.trim() }),
        }
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
      const res = await fetch(
        `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/audit-report/export`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        }
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
      <div className="flex items-center justify-center h-full text-zinc-400">
        <div className="text-center max-w-[320px]">
          <FileText className="w-10 h-10 mx-auto mb-3 text-zinc-300" />
          <p className="text-sm font-medium text-zinc-600 mb-1">No project selected</p>
          <p className="text-xs text-zinc-500 leading-relaxed mb-4">
            Select a project to access its regulatory documents, version history,
            and audit trail.
          </p>
          {onNavigateToProject && (
            <button
              onClick={onNavigateToProject}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
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
          <p className="text-sm font-semibold text-zinc-700 mb-2">
            Saved document was created, but the editor could not load that artifact automatically.
          </p>
          <p className="text-xs text-zinc-400 mb-6">
            The artifact may still be processing or the ID could not be matched.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setOpenArtifactNotFound(false);
                loadArtifacts();
              }}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none shadow-sm"
            >
              Refresh documents
            </button>
            <button
              onClick={() => {
                setOpenArtifactNotFound(false);
                setShowArtifactList(true);
              }}
              className="px-4 py-2 text-sm font-medium border border-zinc-200 text-zinc-700 rounded-lg hover:bg-zinc-50 hover:border-zinc-300 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
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
        <div className="flex items-center justify-between h-14 px-5 border-b border-zinc-200/80 bg-zinc-50">
          <div className="flex items-baseline gap-2">
            <h3 className="text-base font-semibold text-zinc-900 tracking-tight">Documents</h3>
            {artifacts.length > 0 && (
              <span className="text-xs text-zinc-400 font-medium tabular-nums">
                {artifacts.length}
              </span>
            )}
          </div>
          {artifacts.length > 0 && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors duration-150',
                showFilters ? 'bg-blue-100 text-blue-700' : 'text-zinc-500 hover:bg-zinc-100'
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
            className="flex items-center gap-2 px-4 py-2 border-b border-zinc-200 bg-zinc-50/20 flex-wrap"
            data-testid="artifact-filters"
          >
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-2 py-1 text-xs border border-zinc-200 rounded-md bg-white focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 outline-none"
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
              className="px-2 py-1 text-xs border border-zinc-200 rounded-md bg-white focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 outline-none"
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
              className="px-2 py-1 text-xs border border-zinc-200 rounded-md bg-white focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 outline-none"
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
                className="text-xs text-zinc-400 hover:text-zinc-600"
              >
                Clear
              </button>
            )}
            <span className="text-xs text-zinc-400 ml-auto">
              {filtered.length} of {artifacts.length}
            </span>
          </div>
        )}

        {/* New doc creation — enhanced with quick templates */}
        <div className="p-3 border-b border-zinc-200 space-y-2.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={newDocTitle}
              onChange={e => setNewDocTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateNew()}
              placeholder="New document title..."
              className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
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
                className="text-xs px-2.5 py-1 rounded-md border border-zinc-200 text-zinc-500 hover:border-blue-200 hover:text-blue-600 hover:bg-blue-50 transition-colors duration-150"
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
                <div key={i} className="animate-pulse rounded-lg border border-zinc-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-3.5 bg-zinc-200 rounded w-3/5" />
                    <div className="h-4 bg-zinc-200 rounded-full w-16" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 bg-zinc-100 rounded w-12" />
                    <div className="h-2.5 bg-zinc-100 rounded w-16" />
                    <div className="h-2.5 bg-zinc-100 rounded w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 text-zinc-400" />
              </div>
              <p className="text-sm font-medium text-zinc-600 mb-1">
                {artifacts.length === 0
                  ? 'Start your submission dossier'
                  : 'No documents match your filters'}
              </p>
              <p className="text-xs text-zinc-500 max-w-[260px] leading-relaxed">
                {artifacts.length === 0
                  ? 'Create your first regulatory document above, or use Intelligence to generate one from precedent data.'
                  : `${artifacts.length} document${artifacts.length !== 1 ? 's' : ''} hidden by filters.`}
              </p>
              {artifacts.length > 0 && (
                <button
                  onClick={() => { setFilterStatus('all'); setFilterType('all'); setFilterCtd('all'); }}
                  className="mt-3 px-3 py-1.5 text-xs font-medium text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
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
                  className="w-full text-left px-4 py-3 rounded-lg border border-transparent hover:border-zinc-200 hover:bg-zinc-50/80 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all group relative"
                >
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-zinc-900 leading-snug line-clamp-2">
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
                                : 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200'
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
                    <span className="text-xs text-zinc-400">{a.type?.replace(/_/g, ' ')}</span>
                    <span className="text-zinc-400">&middot;</span>
                    <span className="text-xs text-zinc-400 tabular-nums">v{a.version}</span>
                    <span className="text-zinc-400">&middot;</span>
                    <span className="text-xs text-zinc-400 tabular-nums">
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
      <div className="flex items-center h-12 px-4 border-b border-zinc-200 bg-white shrink-0 gap-2.5">
        {/* Left: breadcrumb navigation */}
        <nav className="flex items-center gap-1 text-xs min-w-0" aria-label="Breadcrumb">
          {projectName && onNavigateToProject && (
            <>
              <button
                onClick={onNavigateToProject}
                className="text-zinc-400 hover:text-zinc-700 shrink-0 px-1.5 py-0.5 rounded hover:bg-zinc-100 transition-colors truncate max-w-[120px]"
                title={projectName}
              >
                {projectName}
              </button>
              <ChevronDown className="w-3 h-3 text-zinc-300 shrink-0 -rotate-90" />
            </>
          )}
          <button
            onClick={() => {
              setActiveArtifact(null);
              setShowArtifactList(true);
              setAiResult(null);
            }}
            className="text-zinc-500 hover:text-zinc-900 shrink-0 px-1.5 py-0.5 rounded hover:bg-zinc-100 transition-colors duration-150"
          >
            Documents
          </button>
          <ChevronDown className="w-3 h-3 text-zinc-300 shrink-0 -rotate-90" />
          <span className="text-sm font-semibold text-zinc-900 truncate max-w-[280px]">
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
          onChangeStatus={(newStatus) => handleStatusChange(newStatus)}
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

        {/* Trust indicators strip — clickable pills */}
        {activeArtifact && (
          <div className="flex items-center gap-1.5 ml-3">
            <button
              onClick={() => toggleInspector('compare')}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-600 font-medium tabular-nums hover:bg-zinc-200 transition-colors cursor-pointer"
              title="Open version compare — click to see all versions"
            >
              <GitCompare className="w-3 h-3" />
              v{activeArtifact.version}
            </button>
            {signatures.length > 0 && (
              <button
                onClick={() => toggleInspector('audit')}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold ring-1 ring-emerald-200/60 tabular-nums hover:bg-emerald-100 transition-colors cursor-pointer"
                title="View signatures in audit trail"
              >
                <PenTool className="w-3 h-3" />
                {signatures.length} sig{signatures.length !== 1 ? 's' : ''}
              </button>
            )}
            {provenanceCount > 0 && (
              <button
                onClick={() => toggleInspector('provenance')}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-200/60 tabular-nums hover:bg-blue-100 transition-colors cursor-pointer"
                title="Open provenance timeline"
              >
                <ShieldCheck className="w-3 h-3" />
                {provenanceCount} event{provenanceCount !== 1 ? 's' : ''}
              </button>
            )}
            {integrityVerified !== null && (
              <button
                onClick={() => toggleInspector('audit')}
                className={cn(
                  'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-semibold ring-1 cursor-pointer transition-colors duration-150',
                  integrityVerified
                    ? 'bg-emerald-50 text-emerald-600 ring-emerald-200/60 hover:bg-emerald-100'
                    : 'bg-red-50 text-red-600 ring-red-200/60 hover:bg-red-100'
                )}
                title={integrityVerified ? 'Integrity verified — view audit' : 'Integrity modified — view audit'}
              >
                {integrityVerified ? (
                  <><CheckCircle className="w-3 h-3" /> Verified</>
                ) : (
                  <><AlertTriangle className="w-3 h-3" /> Modified</>
                )}
              </button>
            )}
            {trustLoadFailed && (
              <span
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-amber-50 text-amber-600 font-medium ring-1 ring-amber-200/60"
                title="Some trust indicators failed to load — data may be incomplete"
              >
                <AlertTriangle className="w-3 h-3" /> Partial
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Keyboard shortcuts */}
        <button
          onClick={() => setShowShortcuts(true)}
          className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors duration-150"
          title="Keyboard shortcuts (Ctrl+Shift+/)"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        <span className="w-px h-5 bg-zinc-200 mx-0.5" />

        {/* Overflow: Save, Export, Sign, Review, CTD, Audit export */}
        <div className="relative">
            <button
              onClick={() => setOverflowOpen(!overflowOpen)}
              aria-label="More actions"
              aria-expanded={overflowOpen}
              className="px-2 py-1.5 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors duration-150"
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
                className="absolute right-0 top-full mt-1 w-48 bg-white border border-zinc-200 rounded-lg shadow-lg z-50 py-1"
              >
                {/* Save */}
                <button
                  role="menuitem"
                  onClick={() => {
                    activeArtifact && handleSave(activeArtifact.content, {});
                    setOverflowOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 text-xs text-zinc-700 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                >
                  <Check className="w-3 h-3 text-zinc-400" />
                  Save
                </button>
                {/* Export */}
                <button
                  role="menuitem"
                  onClick={() => { setShowExportDialog(true); setOverflowOpen(false); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 text-xs text-zinc-700 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                >
                  <Download className="w-3 h-3 text-zinc-400" />
                  Export…
                </button>
                <button
                  role="menuitem"
                  onClick={() => { handleExportMarkdown(); setOverflowOpen(false); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 text-xs text-zinc-700 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                >
                  <Download className="w-3 h-3 text-zinc-400" />
                  Markdown (.md)
                </button>
                <div className="border-t border-zinc-200 my-1" />
                {/* Sign — opens Part 11 compliant dialog */}
                <button
                  role="menuitem"
                  onClick={() => {
                    setShowSignatureDialog(true);
                    setOverflowOpen(false);
                  }}
                  disabled={!activeArtifact}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 text-xs text-zinc-700 disabled:opacity-60 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                >
                  <PenTool className="w-3 h-3 text-zinc-400" />
                  Sign & Approve (Part 11)
                </button>
                {/* Edit escalation button — shown when mode capabilities indicate view mode */}
                {modeCaps?.showEditButton && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      const result = modeCtx?.requestEdit();
                      if (!result?.allowed && result?.reason) {
                        pushToast(result.reason, 'info');
                      }
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 text-xs text-zinc-700 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                  >
                    <PenTool className="w-3 h-3 text-blue-500" />
                    Edit
                  </button>
                )}
                {/* Status change — gated by capability layer, not raw status */}
                {modeCaps?.canToggleLock && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      // NOTE: Raw status read here is intentional domain state inspection
                      // to determine the correct next transition target.
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
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 text-xs text-zinc-700 disabled:opacity-60 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                  >
                    <Lock className="w-3 h-3 text-zinc-400" />
                    {/* Display label uses raw status — intentional display-only read */}
                    {activeArtifact?.status === 'approved'
                      ? 'Lock'
                      : activeArtifact?.status === 'review'
                        ? 'Approve'
                        : 'Submit for Review'}
                  </button>
                )}
                <div className="border-t border-zinc-200 my-1" />
                <button
                  onClick={() => {
                    handleClaimCheck();
                    setOverflowOpen(false);
                  }}
                  disabled={claimCheckMutation.isPending || !activeArtifact?.content}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 text-xs text-zinc-700 disabled:opacity-60"
                >
                  <ShieldCheck className="w-3 h-3 inline mr-1.5 text-amber-500" />
                  Check Claims
                </button>
                <button
                  onClick={() => {
                    setShowCtdInput(!showCtdInput);
                    setOverflowOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 text-xs text-zinc-700"
                >
                  <MapPin className="w-3 h-3 inline mr-1.5 text-zinc-400" />
                  Set CTD Section
                </button>
                <button
                  onClick={() => {
                    handleExportAudit();
                    setOverflowOpen(false);
                  }}
                  disabled={exportingAudit}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 text-xs text-zinc-700 disabled:opacity-60"
                >
                  <ClipboardList className="w-3 h-3 inline mr-1.5 text-zinc-400" />
                  Export Audit
                </button>
              </div>
            )}
          </div>
      </div>

      {/* ── Ribbon toolbar — categorized inspector panels with group labels ── */}
      <div className="flex items-stretch px-3 border-b border-zinc-100 bg-zinc-50/40 shrink-0 overflow-x-auto">
        {/* AI & Intelligence */}
        <div className="flex flex-col items-center pr-3 mr-3 border-r border-zinc-200 py-1">
          <div className="flex items-center gap-0.5">
            <button data-testid="ribbon-intelligence" onClick={() => toggleInspector('intelligence')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'intelligence' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><Brain className="w-3.5 h-3.5" />Intelligence</button>
            <button data-testid="ribbon-batch-ai" onClick={() => toggleInspector('batch-ai')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'batch-ai' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><Layers className="w-3.5 h-3.5" />Batch AI</button>
            <button data-testid="ribbon-health" onClick={() => toggleInspector('health')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'health' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><ShieldCheck className="w-3.5 h-3.5" />Health</button>
            <button data-testid="ribbon-compliance" onClick={() => toggleInspector('compliance-scanner')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'compliance-scanner' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><AlertTriangle className="w-3.5 h-3.5" />Compliance</button>
            <button data-testid="ribbon-memory" onClick={() => toggleInspector('ana-memory')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'ana-memory' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><Brain className="w-3.5 h-3.5" />Memory</button>
          </div>
          <span className="text-[9px] font-medium uppercase tracking-widest text-zinc-400 mt-0.5">AI</span>
        </div>

        {/* Review & Collaboration */}
        <div className="flex flex-col items-center pr-3 mr-3 border-r border-zinc-200 py-1">
          <div className="flex items-center gap-0.5">
            <button data-testid="ribbon-comments" onClick={() => toggleInspector('comments')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap relative', activeInspector === 'comments' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><MessageSquare className="w-3.5 h-3.5" />Comments{comments.filter(c => !c.resolved).length > 0 && (<span className={cn('ml-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-semibold', activeInspector === 'comments' ? 'bg-white text-blue-600' : 'bg-amber-500 text-white')}>{comments.filter(c => !c.resolved).length}</span>)}</button>
            {reviewModeAvailable && <button data-testid="ribbon-review" onClick={() => toggleInspector('review')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', isReviewMode ? 'bg-amber-500 text-white font-medium shadow-sm' : activeInspector === 'review' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><Eye className="w-3.5 h-3.5" />Review{isReviewMode && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}</button>}
            <button data-testid="ribbon-reviewers" onClick={() => toggleInspector('reviewers')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'reviewers' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><Users className="w-3.5 h-3.5" />Reviewers</button>
            <button data-testid="ribbon-versions" onClick={() => toggleInspector('versions')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'versions' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><GitCompare className="w-3.5 h-3.5" />History</button>
            <button data-testid="ribbon-compare" onClick={() => toggleInspector('compare')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'compare' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><GitCompare className="w-3.5 h-3.5" />Compare</button>
          </div>
          <span className="text-[9px] font-medium uppercase tracking-widest text-zinc-400 mt-0.5">Review</span>
        </div>

        {/* Compliance & References */}
        <div className="flex flex-col items-center pr-3 mr-3 border-r border-zinc-200 py-1">
          <div className="flex items-center gap-0.5">
            <button data-testid="ribbon-crossref" onClick={() => toggleInspector('crossref')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'crossref' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><Link2 className="w-3.5 h-3.5" />Cross-Refs</button>
            <button data-testid="ribbon-inconsistency" onClick={() => toggleInspector('inconsistency')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'inconsistency' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><Zap className="w-3.5 h-3.5" />Issues</button>
            <button data-testid="ribbon-dataroom" onClick={() => toggleInspector('dataroom')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'dataroom' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><Database className="w-3.5 h-3.5" />Data Room</button>
          </div>
          <span className="text-[9px] font-medium uppercase tracking-widest text-zinc-400 mt-0.5">Compliance</span>
        </div>

        {/* Audit & Provenance */}
        <div className="flex flex-col items-center py-1">
          <div className="flex items-center gap-0.5">
            <button data-testid="ribbon-provenance" onClick={() => toggleInspector('provenance')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'provenance' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><ShieldCheck className="w-3.5 h-3.5" />Provenance</button>
            <button data-testid="ribbon-audit" onClick={() => toggleInspector('audit')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'audit' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><ClipboardList className="w-3.5 h-3.5" />Audit Trail</button>
            <button data-testid="ribbon-submission" onClick={() => toggleInspector('submission-readiness')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'submission-readiness' ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><Shield className="w-3.5 h-3.5" />Submission</button>
            <button data-testid="ribbon-proof" onClick={() => toggleInspector('proof')} className={cn('px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap', activeInspector === 'proof' ? 'bg-emerald-600 text-white font-medium shadow-sm' : 'text-zinc-600 hover:bg-white hover:shadow-sm')}><Shield className="w-3.5 h-3.5" />Proof</button>
          </div>
          <span className="text-[9px] font-medium uppercase tracking-widest text-zinc-400 mt-0.5">Audit</span>
        </div>
      </div>

      {/* ── AI Suggestion Diff Panel ──────────────────────────────────────── */}
      {aiResult && (
        <div className="border-b border-blue-200 bg-zinc-50">
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
                className="px-3 py-1.5 text-xs font-medium text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors duration-150"
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
              <div className="px-4 py-3 text-sm text-zinc-700 overflow-y-auto max-h-48 zen-scroll leading-relaxed">
                {activeArtifact?.content
                  ? activeArtifact.content
                      .replace(/<[^>]+>/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim()
                      .slice(0, 800)
                  : 'No content yet'}
                {(activeArtifact?.content?.length ?? 0) > 800 && (
                  <span className="text-zinc-400"> ...</span>
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
              <div className="px-4 py-3 text-sm text-zinc-700 overflow-y-auto max-h-48 zen-scroll leading-relaxed">
                {aiResult.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800)}
                {aiResult.length > 800 && <span className="text-zinc-400"> ...</span>}
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
            className="ml-auto text-zinc-400 hover:text-zinc-600"
          >
            <XCircle className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* CTD section inline input (from overflow) */}
      {showCtdInput && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-200 bg-zinc-50/50">
          <MapPin className="w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            value={ctdSectionInput}
            onChange={e => setCtdSectionInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCtdSection()}
            placeholder="e.g. 3.2.S"
            className="w-28 px-2 py-1 text-xs border border-zinc-200 rounded bg-white focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 outline-none"
          />
          <button
            onClick={handleCtdSection}
            className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
          >
            Save
          </button>
          <button
            onClick={() => setShowCtdInput(false)}
            className="text-xs text-zinc-400 hover:text-zinc-600"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Document Lifecycle Pipeline ──────────────────────────────── */}
      {activeArtifact && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-200 bg-zinc-50/30">
          {(['draft', 'review', 'approved', 'locked'] as const).map((stage, idx, arr) => {
            const currentStatus = activeArtifact.status || 'draft';
            const stageOrder = { draft: 0, review: 1, approved: 2, locked: 3 };
            const currentOrder = stageOrder[currentStatus as keyof typeof stageOrder] ?? 0;
            const stageIdx = stageOrder[stage];
            const isCompleted = stageIdx < currentOrder;
            const isCurrent = stage === currentStatus;
            const stageLabels: Record<string, string> = {
              draft: 'Draft',
              review: 'In Review',
              approved: 'Approved',
              locked: 'Published',
            };
            const stageDescriptions: Record<string, string> = {
              draft: 'Document is being authored',
              review: 'Submitted for peer/regulatory review',
              approved: 'Content approved by reviewer',
              locked: 'Locked for submission — read only',
            };
            const stageColors: Record<string, string> = {
              draft: 'bg-zinc-100 text-zinc-700 border-zinc-200',
              review: 'bg-amber-50 text-amber-700 border-amber-200',
              approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
              locked: 'bg-blue-50 text-blue-700 border-blue-200',
            };
            return (
              <React.Fragment key={stage}>
                <button
                  onClick={() => {
                    if (stage !== currentStatus && !changingStatus) {
                      if (stage === 'locked' || stage === 'approved') {
                        if (confirm(`${stageLabels[stage]}: ${stageDescriptions[stage]}. Proceed?`)) {
                          handleStatusChange(stage);
                        }
                      } else {
                        handleStatusChange(stage);
                      }
                    }
                  }}
                  disabled={changingStatus}
                  title={stageDescriptions[stage]}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                    isCurrent
                      ? `${stageColors[stage]} shadow-sm`
                      : isCompleted
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : 'bg-white text-zinc-400 border-zinc-200 hover:bg-zinc-50 hover:text-zinc-600'
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : isCurrent ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-current animate-pulse" />
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full border-2 border-current" />
                  )}
                  {stageLabels[stage]}
                </button>
                {idx < arr.length - 1 && (
                  <div className={cn(
                    'w-6 h-px',
                    isCompleted ? 'bg-emerald-300' : 'bg-zinc-200'
                  )} />
                )}
              </React.Fragment>
            );
          })}
          {/* Edit escalation button — visible in view mode */}
          {modeCaps?.showEditButton && (
            <button
              onClick={() => {
                const result = modeCtx?.requestEdit();
                if (!result?.allowed && result?.reason) {
                  pushToast(result.reason, 'info');
                }
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              <PenTool className="w-3 h-3" />
              Edit
            </button>
          )}
          {/* Claim status + last updated */}
          <div className="flex items-center gap-3 ml-auto text-xs text-zinc-400">
            {claimStatus === 'checking' && (
              <span className="text-blue-500 flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-md">
                <Loader2 className="w-3 h-3 animate-spin" /> Checking claims
              </span>
            )}
            {claimStatus === 'supported' && (
              <span className="text-emerald-600 font-medium flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-md">
                <CheckCircle className="w-3 h-3" /> Claims supported
              </span>
            )}
            {claimStatus === 'needs-evidence' && (
              <span className="text-amber-600 font-medium flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-md">
                <AlertTriangle className="w-3 h-3" /> Needs evidence
              </span>
            )}
            <span className="tabular-nums text-zinc-500">
              {new Date(activeArtifact.updatedAt || activeArtifact.createdAt).toLocaleString(
                undefined,
                { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
              )}
            </span>
          </div>
        </div>
      )}

      {/* ── Main canvas: Editor + optional single inspector drawer ──────── */}
      <div className="flex-1 min-h-0 overflow-hidden flex">
        {/* Editor — always fills available width */}
        <div
          className={cn('min-h-0 overflow-hidden relative', activeInspector ? 'flex-1' : 'w-full')}
        >
          {/* Locked overlay — gated by canonical mode, not raw status */}
          {modeCaps && !modeCaps.editable && modeCtx?.mode === 'readonly' && activeArtifact?.status === 'locked' && (
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
          <CollaborationCursors
            cursors={collaboration.cursors}
            currentUserId={currentUser.id}
          />
          {/* Guided empty state for new/blank documents — only in editable modes */}
          {activeArtifact && (!activeArtifact.content || activeArtifact.content.replace(/<[^>]*>/g, '').trim().length < 10) && modeCaps?.editable !== false && (
            <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-center pt-20 pointer-events-none">
              <div className="pointer-events-auto bg-white/95 backdrop-blur-sm border border-zinc-200 rounded-xl shadow-lg p-5 max-w-md w-full mx-4">
                <div className="text-center mb-4">
                  <PenTool className="w-6 h-6 text-violet-500 mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-zinc-900">Get started with your document</h3>
                  <p className="text-xs text-zinc-500 mt-1">Choose a quick action or just start typing below</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleAIEdit('expand')}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-violet-100 transition-colors text-left"
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    AI Generate Draft
                  </button>
                  <button
                    onClick={() => {
                      const template = `<h1>${activeArtifact.title || 'Document Title'}</h1><h2>1. Introduction</h2><p></p><h2>2. Background</h2><p></p><h2>3. Methods</h2><p></p><h2>4. Results</h2><p></p><h2>5. Discussion</h2><p></p><h2>6. Conclusions</h2><p></p>`;
                      setActiveArtifact({ ...activeArtifact, content: template });
                      setIsDirty(true);
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors text-left"
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    Standard Outline
                  </button>
                  <button
                    onClick={() => toggleInspector('intelligence')}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors text-left"
                  >
                    <Brain className="w-3.5 h-3.5 shrink-0" />
                    Ask AnA RI
                  </button>
                  <button
                    onClick={() => toggleInspector('health')}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors text-left"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    Check Health
                  </button>
                </div>
                <p className="text-[10px] text-zinc-400 text-center mt-3">
                  Tip: Type <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-zinc-500">/</kbd> for slash commands
                </p>
              </div>
            </div>
          )}
          <UnifiedDocumentEditor
            key={activeArtifact?.id}
            documentId={activeArtifact?.id}
            initialContent={activeArtifact?.content || ''}
            documentTitle={activeArtifact?.title}
            documentType={activeArtifact?.type}
            submissionType={submissionType}
            showCompliance={false}
            showTraceability={false}
            embedded
            isReadOnly={modeCaps ? !modeCaps.editable : false}
            documentMode={modeCtx?.mode}
            onSave={handleSave}
            onLockToggle={handleLockToggle}
            onAIAction={(action, selectedText) => {
              if (action === 'link-source') {
                pushToast('Select text first, then use Link to Source in the bubble menu', 'info');
                return;
              }
              handleAIEdit(action as 'rewrite' | 'expand' | 'summarize' | 'regulatory-tone' | 'add-references');
            }}
            onAddComment={handleAddCommentFromEditor}
            cancelCommentId={cancelCommentId}
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

        {/* Single inspector drawer — only one at a time */}
        {activeInspector === 'intelligence' && (
          <div className="w-80 shrink-0 border-l border-zinc-200">
            <RegulatoryIntelligencePanel
              submissionType={submissionType}
              indication={activeArtifact?.title}
              deviceName={activeArtifact?.title}
              documentContent={activeArtifact?.content}
              onClose={() => setActiveInspector(null)}
              onCreateDocument={async (content: string, title: string, ctdSection?: string) => {
                if (!projectId) return;
                try {
                  const res = await fetch(`/api/concept2cure/projects/${projectId}/artifacts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify({
                      title,
                      content,
                      type: 'regulatory_document',
                      category: 'document',
                      ctdSection: ctdSection || undefined,
                    }),
                  });
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
          </div>
        )}
        {activeInspector === 'provenance' && projectId && activeArtifact && (
          <div className="w-80 shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
            <DocumentProvenancePanel
              projectId={projectId}
              artifactId={activeArtifact.id}
              onClose={() => setActiveInspector(null)}
              onOpenCompare={openCompare}
              onOpenAudit={openAudit}
            />
          </div>
        )}
        {activeInspector === 'compare' && projectId && activeArtifact && (
          <div className="w-80 max-w-[35vw] shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
            <DocumentVersionCompare
              projectId={projectId}
              artifactId={activeArtifact.id}
              onClose={() => setActiveInspector(null)}
              onOpenAudit={openAudit}
              onOpenProvenance={openProvenance}
              onRollbackComplete={loadArtifacts}
            />
          </div>
        )}
        {activeInspector === 'audit' && projectId && activeArtifact && (
          <div className="w-80 shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
            <DocumentAuditReport
              projectId={projectId}
              artifactId={activeArtifact.id}
              onClose={() => setActiveInspector(null)}
              onOpenProvenance={openProvenance}
              onOpenCompare={openCompare}
              onExportAsArtifact={handleExportAudit}
              exportingAudit={exportingAudit}
            />
          </div>
        )}
        {activeInspector === 'proof' && projectId && activeArtifact && (
          <div className="w-80 shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
            <ArtifactProofPanel projectId={projectId} artifact={activeArtifact} />
          </div>
        )}
        {/* Sprint 2A: Data Room Panel */}
        {activeInspector === 'dataroom' && projectId && (
          <div className="w-80 shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
            <DataRoomPanel
              projectId={projectId}
              onSourceSelect={(source) => {
                pushToast(`Viewing source: ${source.title}`, 'info');
              }}
              onUpload={() => {
                pushToast('Upload source files from the Project sidebar', 'info');
              }}
            />
          </div>
        )}
        {/* Sprint 2C: Inconsistency Intelligence Panel */}
        {activeInspector === 'inconsistency' && projectId && activeArtifact && (
          <div className="w-80 shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
            <InconsistencyPanel
              projectId={projectId}
              activeArtifactId={activeArtifact.id}
              activeArtifactTitle={activeArtifact.title}
              activeContent={activeArtifact.content}
              onNavigateToArtifact={(artifactId) => {
                const target = artifacts.find(a => a.id === artifactId);
                if (target) {
                  setActiveArtifact(target);
                  pushToast(`Navigated to: ${target.title}`, 'info');
                }
              }}
            />
          </div>
        )}
        {/* Document Health Panel */}
        {activeInspector === 'health' && activeArtifact && (
          <div className="w-80 shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
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
                handleAIEdit(action as 'rewrite' | 'expand' | 'summarize' | 'regulatory-tone' | 'add-references');
              }}
            />
          </div>
        )}
        {/* Version History Timeline */}
        {activeInspector === 'versions' && activeArtifact && (
          <div className="w-80 shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
            <VersionTimeline
              versions={(activeArtifact.versions || []).map((v, i) => ({
                id: `v-${v.version || i}`,
                version: v.version || i + 1,
                content: v.content || '',
                createdAt: v.createdAt || activeArtifact.createdAt,
              }))}
              currentContent={activeArtifact.content || ''}
              currentVersion={activeArtifact.version || 1}
              onRestore={(version) => {
                setActiveArtifact(prev => prev ? { ...prev, content: version.content } : null);
                pushToast(`Restored to version ${version.version}`, 'success');
              }}
              onClose={() => setActiveInspector(null)}
            />
          </div>
        )}
        {/* Batch AI Operations Panel */}
        {activeInspector === 'batch-ai' && activeArtifact && (
          <div className="w-96 shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
            <BatchAIPanel
              content={activeArtifact.content || ''}
              submissionType={submissionType}
              onApply={(newContent) => {
                setActiveArtifact(prev => prev ? { ...prev, content: newContent } : null);
                pushToast('Batch AI changes applied', 'success');
              }}
              onClose={() => setActiveInspector(null)}
            />
          </div>
        )}
        {/* Cross-Reference Manager */}
        {activeInspector === 'crossref' && activeArtifact && (
          <div className="w-80 shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
            <CrossReferencePanel
              content={activeArtifact.content || ''}
              projectId={projectId}
              artifacts={artifacts.map(a => ({
                id: a.id,
                title: a.title,
                ctdSection: a.ctdSection,
                content: a.content,
              }))}
              onInsertReference={(refText) => {
                pushToast(`Reference inserted: ${refText}`, 'success');
              }}
              onNavigateToSection={(sectionId) => {
                const target = artifacts.find(a => a.id === sectionId);
                if (target) {
                  setActiveArtifact(target);
                  pushToast(`Navigated to: ${target.title}`, 'info');
                }
              }}
              onClose={() => setActiveInspector(null)}
            />
          </div>
        )}
        {/* Threaded Comments Panel */}
        {activeInspector === 'comments' && activeArtifact && (
          <div className="w-80 shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
            <CommentThreadPanel
              comments={comments}
              currentUserId={getCurrentUser().id}
              onResolve={(commentId) => {
                setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved: true } : c));
                updateCommentOnServer(commentId, { status: 'resolved' });
                pushToast('Comment resolved', 'success');
              }}
              onReopen={(commentId) => {
                setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved: false } : c));
                updateCommentOnServer(commentId, { status: 'open' });
              }}
              onReply={(commentId, text) => {
                const user = getCurrentUser();
                setComments(prev => prev.map(c => c.id === commentId ? {
                  ...c,
                  replies: [...c.replies, {
                    id: `reply-${Date.now()}`,
                    text,
                    authorId: user.id,
                    authorName: user.name,
                    createdAt: new Date().toISOString(),
                  }],
                } : c));
                addReplyOnServer(commentId, text);
              }}
              onDelete={(commentId) => {
                setComments(prev => prev.filter(c => c.id !== commentId));
                deleteCommentOnServer(commentId);
                pushToast('Comment deleted', 'success');
              }}
              onNavigateToComment={(commentId) => {
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
          </div>
        )}
        {/* Reviewer Assignment Panel */}
        {activeInspector === 'reviewers' && activeArtifact && (
          <div className="w-80 shrink-0 border-l border-zinc-200 h-full transition-all duration-150 overflow-y-auto">
            <ReviewerAssignment
              documentId={activeArtifact.id}
              documentTitle={activeArtifact.title}
              currentStatus={activeArtifact.status}
              reviewers={[]}
              teamMembers={[]}
              onSubmitForReview={async () => {
                await handleStatusChange('review');
                pushToast('Document submitted for review', 'success');
              }}
              onClose={() => setActiveInspector(null)}
            />
          </div>
        )}
        {/* Review Mode Panel */}
        {activeInspector === 'review' && activeArtifact && (
          <div className="w-80 shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
            <ReviewModePanel
              isReviewMode={isReviewMode}
              onToggleReviewMode={handleToggleReviewMode}
              changes={trackedChanges}
              onAcceptChange={(changeId) => {
                setTrackedChanges(prev => prev.map(c => c.id === changeId ? { ...c, accepted: true } : c));
              }}
              onRejectChange={(changeId) => {
                setTrackedChanges(prev => prev.map(c => c.id === changeId ? { ...c, rejected: true } : c));
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
          </div>
        )}
        {/* Submission Readiness Validator Panel */}
        {activeInspector === 'submission-readiness' && projectId && (
          <div className="w-96 shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
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
              onNavigateToArtifact={(artifactId) => {
                const target = artifacts.find(a => a.id === artifactId);
                if (target) {
                  setActiveArtifact(target);
                  setActiveInspector(null);
                }
              }}
              onClose={() => setActiveInspector(null)}
            />
          </div>
        )}
        {/* Compliance Scanner Panel */}
        {activeInspector === 'compliance-scanner' && (
          <div className="w-96 shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
            <ComplianceScannerPanel
              issues={[]}
              isScanning={false}
              lastScanTime={Date.now()}
              onNavigateToIssue={() => {}}
              onFixIssue={() => {}}
              onRescan={() => {}}
              onClose={() => setActiveInspector(null)}
            />
          </div>
        )}
        {/* AnA Memory Panel */}
        {activeInspector === 'ana-memory' && projectId && (
          <div className="w-96 shrink-0 border-l border-zinc-200 h-full transition-all duration-150">
            <AnAMemory
              projectId={projectId}
              projectName={projectName}
              onClose={() => setActiveInspector(null)}
            />
          </div>
        )}
      </div>

      {/* ── Export Dialog ── */}
      {activeArtifact && (
        <ExportDialog
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          documentTitle={activeArtifact.title}
          documentContent={activeArtifact.content || ''}
          ctdSection={activeArtifact.ctdSection}
          onExport={async (format) => {
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
              <h3 className="text-sm font-semibold text-zinc-900">Quality Check — Review Before Proceeding</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              The following issues were detected. You can proceed anyway or go back to fix them.
            </p>
            <ul className="space-y-2 mb-4">
              {qualityGateDialog.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {w}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setQualityGateDialog({ show: false, targetStatus: '', warnings: [] })}
                className="px-3 py-1.5 text-xs font-medium text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition-colors duration-150"
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
              <h3 className="text-sm font-semibold text-zinc-900">Add Comment</h3>
            </div>
            {pendingCommentHighlight && (
              <div className="border-l-2 border-blue-300 pl-2 py-1 bg-blue-50 rounded-r text-xs text-zinc-500 italic mb-3 truncate">
                &ldquo;{pendingCommentHighlight.slice(0, 100)}{pendingCommentHighlight.length > 100 ? '…' : ''}&rdquo;
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
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none resize-none"
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px] text-zinc-400">Ctrl+Enter to submit</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancelComment}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 rounded-md hover:bg-zinc-100"
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
                t.type === 'info' && 'bg-zinc-700 text-white'
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
          onSignatureComplete={(sig) => {
            setSignatures(prev => [...prev, {
              signatureId: sig.id,
              signatureType: sig.meaning,
              signerName: sig.signerName,
              signerEmail: '',
              signerRole: sig.signerTitle,
              signedAt: sig.signedAt,
              signatureHash: sig.signatureHash,
              status: 'valid',
            }]);
            pushToast('Electronic signature applied successfully', 'success');
            loadArtifacts();
          }}
        />
      )}
    </div>
  );
};

export default EditorPanel;
