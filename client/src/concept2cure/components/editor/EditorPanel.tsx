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
} from 'lucide-react';
import { useClaimCheck, type ClaimCheckResult } from '../../hooks/usePrecedentEngine';
import { RegulatoryIntelligencePanel } from '../intelligence/RegulatoryIntelligencePanel';
import { useGenerateDocx, downloadBlob } from '../../hooks/useDocumentFactory';
import DocumentProvenancePanel from '../provenance/DocumentProvenancePanel';
import DocumentVersionCompare from '../provenance/DocumentVersionCompare';
import DocumentAuditReport from '../provenance/DocumentAuditReport';

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
  submissionType?: string;
  /** When provided, auto-create an artifact with this content and open it */
  initialContent?: string;
  initialTitle?: string;
  initialCtdSection?: string;
  /** Called when the pending initial content has been consumed */
  onInitialContentConsumed?: () => void;
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
  submissionType,
  initialContent,
  initialTitle,
  initialCtdSection,
  onInitialContentConsumed,
}) => {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [loading, setLoading] = useState(false);
  const [, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [showArtifactList, setShowArtifactList] = useState(true);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [lockRejection, setLockRejection] = useState<string | null>(null);

  // ── Claim checker (Precedent Engine) ─────────────────────────────────────
  const [claimResult, setClaimResult] = useState<ClaimCheckResult | null>(null);
  const [claimStatus, setClaimStatus] = useState<
    'idle' | 'checking' | 'supported' | 'needs-evidence'
  >('idle');
  const claimCheckMutation = useClaimCheck();
  const claimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Single secondary inspector panel (only one open at a time) ────────
  type InspectorPanel = 'intelligence' | 'provenance' | 'compare' | 'audit';
  const [activeInspector, setActiveInspector] = useState<InspectorPanel | null>(null);
  const toggleInspector = useCallback((panel: InspectorPanel) => {
    setActiveInspector(prev => (prev === panel ? null : panel));
  }, []);

  // ── Sign/Approve state ────────────────────────────────────────────────
  const [signing, setSigning] = useState(false);
  const [signResult, setSignResult] = useState<{ success: boolean; message: string } | null>(null);

  // ── Status change state ───────────────────────────────────────────────
  const [changingStatus, setChangingStatus] = useState(false);

  // ── CTD Section assignment state ──────────────────────────────────────
  const [showCtdInput, setShowCtdInput] = useState(false);
  const [ctdSectionInput, setCtdSectionInput] = useState('');

  // ── Audit export state ────────────────────────────────────────────────
  const [exportingAudit, setExportingAudit] = useState(false);

  // ── Document trust indicators (P3/P4) ─────────────────────────────────
  const [signatures, setSignatures] = useState<SignatureInfo[]>([]);
  const [provenanceCount, setProvenanceCount] = useState(0);
  const [integrityVerified, setIntegrityVerified] = useState<boolean | null>(null);

  // ── Artifact list filters (P5) ────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCtd, setFilterCtd] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // ── Overflow menu (editor toolbar) ────────────────────────────────────
  const [overflowOpen, setOverflowOpen] = useState(false);

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

  // ── Fetch trust indicators when artifact selected ─────────────────────────
  useEffect(() => {
    if (!projectId || !activeArtifact) {
      setSignatures([]);
      setProvenanceCount(0);
      setIntegrityVerified(null);
      return;
    }
    const headers = getAuthHeaders();
    // Fetch signatures
    fetch(`/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/signatures`, {
      headers,
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) setSignatures(d.data ?? d ?? []);
      })
      .catch(() => setSignatures([]));
    // Fetch provenance count
    fetch(`/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/provenance`, {
      headers,
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) {
          const prov = d.data ?? d;
          const events = prov?.reviewHistory?.length ?? prov?.events?.length ?? 0;
          setProvenanceCount(events);
        }
      })
      .catch(() => setProvenanceCount(0));
    // Fetch integrity verification
    fetch(
      `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/verify-integrity`,
      {
        headers,
      }
    )
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) setIntegrityVerified((d.data ?? d)?.verified ?? null);
      })
      .catch(() => setIntegrityVerified(null));
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

  // ── Save to artifacts API ────────────────────────────────────────────────
  const handleSave = useCallback(
    async (content: string, _metadata: Record<string, unknown>) => {
      if (!projectId || !activeArtifact) return;
      // Block saves on locked documents client-side
      if (activeArtifact?.status === 'locked') {
        setLockRejection('Document is locked — edits are not permitted. Unlock to continue.');
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
          // Refresh list
          loadArtifacts();
          setTimeout(() => setSaveStatus('idle'), 3000);
        } else if (res.status === 423) {
          const err = await res.json().catch(() => ({ message: 'Document is locked' }));
          setLockRejection(err.message || 'Document is locked — save rejected (HTTP 423)');
          setSaveStatus('error');
          setTimeout(() => setLockRejection(null), 6000);
        } else {
          setSaveStatus('error');
        }
      } catch {
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
    },
    [projectId, activeArtifact, loadArtifacts]
  );

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
      }
    } catch {
      // silent
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
          }
        }
      } catch {
        // silent
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
    } catch {
      // Fallback: try download endpoint for pre-generated docs
      const filename = `${activeArtifact.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;
      window.open(`/api/concept2cure/documents/download/${encodeURIComponent(filename)}`, '_blank');
    } finally {
      setDocxExporting(false);
    }
  }, [activeArtifact, submissionType, generateDocxMutation]);

  // ── Sign & Approve ───────────────────────────────────────────────────
  const handleSignApprove = useCallback(async () => {
    if (!projectId || !activeArtifact) return;
    setSigning(true);
    setSignResult(null);
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

  // ── Status change ────────────────────────────────────────────────────
  const handleStatusChange = useCallback(
    async (newStatus: string) => {
      if (!projectId || !activeArtifact) return;
      setChangingStatus(true);
      try {
        const res = await fetch(
          `/api/concept2cure/projects/${projectId}/artifacts/${activeArtifact.id}/status`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ status: newStatus }),
          }
        );
        if (res.ok) {
          const payload = await res.json();
          const updated = payload.data;
          setActiveArtifact(prev => (prev ? { ...prev, ...updated } : prev));
          loadArtifacts();
        }
      } catch {
        // silent
      } finally {
        setChangingStatus(false);
      }
    },
    [projectId, activeArtifact, loadArtifacts]
  );

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
        setCtdSectionInput('');
      }
    } catch {
      // silent
    }
  }, [projectId, activeArtifact, ctdSectionInput, loadArtifacts]);

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
      }
    } catch {
      // silent
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
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Select a project to open the document editor</p>
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
        <div className="flex items-center justify-between h-12 px-4 border-b border-zinc-100 bg-zinc-50/50">
          <h3 className="text-sm font-semibold text-zinc-700">Project Documents</h3>
          {artifacts.length > 0 && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors',
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
            className="flex items-center gap-2 px-4 py-2 border-b border-zinc-100 bg-zinc-50/20 flex-wrap"
            data-testid="artifact-filters"
          >
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-2 py-1 text-xs border border-zinc-200 rounded-md bg-white focus:ring-1 focus:ring-blue-400"
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
              className="px-2 py-1 text-xs border border-zinc-200 rounded-md bg-white focus:ring-1 focus:ring-blue-400"
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
              className="px-2 py-1 text-xs border border-zinc-200 rounded-md bg-white focus:ring-1 focus:ring-blue-400"
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
            <span className="text-[10px] text-zinc-400 ml-auto">
              {filtered.length} of {artifacts.length}
            </span>
          </div>
        )}

        {/* New doc input */}
        <div className="p-3 border-b border-zinc-100">
          <div className="flex gap-2">
            <input
              type="text"
              value={newDocTitle}
              onChange={e => setNewDocTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateNew()}
              placeholder="New document title..."
              className="flex-1 px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            <button
              onClick={handleCreateNew}
              disabled={creatingNew || !newDocTitle.trim()}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {creatingNew ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Create
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-zinc-400 text-sm">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              {artifacts.length === 0
                ? 'No documents yet. Create one above.'
                : 'No documents match filters.'}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map(a => (
                <button
                  key={a.id}
                  onClick={() => {
                    setActiveArtifact(a);
                    setShowArtifactList(false);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-200 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-700 truncate">{a.title}</span>
                    <div className="flex items-center gap-1.5 ml-2 shrink-0">
                      <span
                        className={`px-1 py-0.5 rounded text-[9px] font-medium ${
                          a.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-700'
                            : a.status === 'locked'
                              ? 'bg-red-100 text-red-700'
                              : a.status === 'review'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-zinc-100 text-zinc-500'
                        }`}
                      >
                        {a.status || 'draft'}
                      </span>
                      <span className="text-[10px] text-zinc-400">v{a.version}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-0.5">
                    <span>{a.type?.replace(/_/g, ' ')}</span>
                    {a.ctdSection && (
                      <>
                        <span>&middot;</span>
                        <span className="text-violet-500">CTD {a.ctdSection}</span>
                      </>
                    )}
                    <span>&middot;</span>
                    <span>{new Date(a.updatedAt || a.createdAt).toLocaleDateString()}</span>
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
      {/* ── Slim toolbar ─────────────────────────────────────────────────── */}
      <div className="flex items-center h-10 px-3 border-b border-zinc-100 bg-white shrink-0 gap-2">
        {/* Left: breadcrumb + status */}
        <button
          onClick={() => {
            setActiveArtifact(null);
            setShowArtifactList(true);
            setAiResult(null);
          }}
          className="text-xs text-zinc-400 hover:text-zinc-700 shrink-0"
        >
          &larr; Docs
        </button>
        <span className="text-zinc-200">/</span>
        <span className="text-xs font-medium text-zinc-800 truncate max-w-[200px]">
          {activeArtifact?.title}
        </span>
        {activeArtifact?.ctdSection && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium shrink-0">
            CTD {activeArtifact.ctdSection}
          </span>
        )}
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
            activeArtifact?.status === 'approved'
              ? 'bg-emerald-50 text-emerald-600'
              : activeArtifact?.status === 'locked'
                ? 'bg-red-50 text-red-600'
                : activeArtifact?.status === 'review'
                  ? 'bg-blue-50 text-blue-600'
                  : 'bg-zinc-100 text-zinc-500'
          )}
        >
          {activeArtifact?.status || 'draft'}
        </span>
        {saveStatus === 'saved' && (
          <span className="text-[10px] text-emerald-500 flex items-center gap-0.5">
            <Check className="w-3 h-3" />
            Saved
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: primary actions */}
        <div className="flex items-center gap-1">
          {/* Save */}
          <button
            onClick={() => activeArtifact && handleSave(activeArtifact.content, {})}
            className="px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50 rounded transition-colors"
          >
            Save
          </button>

          {/* Export DOCX */}
          <button
            onClick={handleExportDocx}
            disabled={docxExporting}
            className="px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50 rounded transition-colors disabled:opacity-50"
          >
            {docxExporting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Download className="w-3 h-3 inline mr-1" />
            )}
            DOCX
          </button>

          {/* Divider */}
          <span className="w-px h-4 bg-zinc-200" />

          {/* Inspector toggles — single active */}
          {(
            [
              { id: 'intelligence' as const, icon: Brain, label: 'Intelligence' },
              { id: 'provenance' as const, icon: ShieldCheck, label: 'Provenance' },
              { id: 'compare' as const, icon: GitCompare, label: 'Compare' },
              { id: 'audit' as const, icon: ClipboardList, label: 'Audit' },
            ] as const
          ).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              data-testid={`inspector-${id}`}
              onClick={() => toggleInspector(id)}
              className={cn(
                'px-2 py-1 text-[11px] rounded transition-colors flex items-center gap-1',
                activeInspector === id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700'
              )}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}

          {/* Divider */}
          <span className="w-px h-4 bg-zinc-200" />

          {/* Sign */}
          <button
            onClick={handleSignApprove}
            disabled={signing || !activeArtifact}
            className="px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {signing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <PenTool className="w-3 h-3" />
            )}
            Sign
          </button>

          {/* Status */}
          <button
            onClick={() => {
              const current = activeArtifact?.status || 'draft';
              const next =
                current === 'locked'
                  ? 'draft'
                  : current === 'approved'
                    ? 'locked'
                    : current === 'review'
                      ? 'approved'
                      : 'review';
              handleStatusChange(next);
            }}
            disabled={changingStatus || !activeArtifact}
            className="px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {activeArtifact?.status === 'locked' ? (
              <Unlock className="w-3 h-3" />
            ) : (
              <Lock className="w-3 h-3" />
            )}
            {activeArtifact?.status === 'locked'
              ? 'Unlock'
              : activeArtifact?.status === 'approved'
                ? 'Lock'
                : activeArtifact?.status === 'review'
                  ? 'Approve'
                  : 'Review'}
          </button>

          {/* Overflow menu */}
          <div className="relative">
            <button
              onClick={() => setOverflowOpen(!overflowOpen)}
              className="px-1.5 py-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {overflowOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-zinc-200 rounded-lg shadow-lg z-50 py-1">
                {/* RI Edit submenu */}
                {AI_ACTIONS.map(a => (
                  <button
                    key={a.id}
                    onClick={() => {
                      handleAIEdit(a.id);
                      setOverflowOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 text-xs text-zinc-700"
                  >
                    <Sparkles className="w-3 h-3 inline mr-1.5 text-violet-500" />
                    {a.label}
                  </button>
                ))}
                <div className="border-t border-zinc-100 my-1" />
                <button
                  onClick={() => {
                    handleClaimCheck();
                    setOverflowOpen(false);
                  }}
                  disabled={claimCheckMutation.isPending || !activeArtifact?.content}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 text-xs text-zinc-700 disabled:opacity-50"
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
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 text-xs text-zinc-700 disabled:opacity-50"
                >
                  <ClipboardList className="w-3 h-3 inline mr-1.5 text-zinc-400" />
                  Export Audit
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Contextual banners (only when relevant) ──────────────────────── */}
      {aiResult && (
        <div className="border-b border-amber-200 bg-amber-50/80 px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-amber-800 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> RI Suggestion
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={handleAcceptAI}
                className="px-2 py-0.5 text-[11px] bg-emerald-600 text-white rounded hover:bg-emerald-700"
              >
                Accept
              </button>
              <button
                onClick={() => setAiResult(null)}
                className="px-2 py-0.5 text-[11px] bg-zinc-200 text-zinc-600 rounded hover:bg-zinc-300"
              >
                Dismiss
              </button>
            </div>
          </div>
          <div className="text-xs text-amber-900 max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {aiResult}
          </div>
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
            <span className="text-[10px] opacity-70">({claimResult.warnings.length} warnings)</span>
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
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-100 bg-zinc-50/50">
          <MapPin className="w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            value={ctdSectionInput}
            onChange={e => setCtdSectionInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCtdSection()}
            placeholder="e.g. 3.2.S"
            className="w-28 px-2 py-1 text-xs border border-zinc-200 rounded bg-white focus:ring-1 focus:ring-blue-400"
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

      {/* ── Main canvas: Editor + optional single inspector drawer ──────── */}
      <div className="flex-1 min-h-0 overflow-hidden flex">
        {/* Editor — always fills available width */}
        <div
          className={cn('min-h-0 overflow-hidden relative', activeInspector ? 'flex-1' : 'w-full')}
        >
          {activeArtifact?.status === 'locked' && (
            <div className="absolute inset-0 z-10 bg-red-50/40 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
              <div className="bg-white/90 border border-red-200 rounded-lg px-6 py-4 shadow text-center pointer-events-auto">
                <Lock className="w-6 h-6 text-red-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-red-800">Document Locked</p>
                <p className="text-xs text-red-600 mt-1">Unlock to edit.</p>
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
            onSave={handleSave}
          />
        </div>

        {/* Single inspector drawer — only one at a time */}
        {activeInspector === 'intelligence' && (
          <div className="w-80 shrink-0 border-l border-zinc-100">
            <RegulatoryIntelligencePanel
              submissionType={submissionType}
              indication={activeArtifact?.title}
              deviceName={activeArtifact?.title}
              documentContent={activeArtifact?.content}
              onClose={() => setActiveInspector(null)}
            />
          </div>
        )}
        {activeInspector === 'provenance' && projectId && activeArtifact && (
          <div className="w-80 shrink-0 border-l border-zinc-100 h-full">
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
          <div className="w-[480px] shrink-0 border-l border-zinc-100 h-full">
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
          <div className="w-96 shrink-0 border-l border-zinc-100 h-full">
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
      </div>
    </div>
  );
};

export default EditorPanel;
