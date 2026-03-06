/**
 * EditorPanel — Bridge component connecting UnifiedDocumentEditor to live APIs.
 *
 * Wires:
 * - Save → PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId
 * - Load → GET /api/concept2cure/projects/:projectId/artifacts
 * - AI Edit → POST /api/concept2cure/ai/edit-section
 * - DOCX Export → POST /api/concept2cure/documents/generate (via chat tool) + download
 */

import React, { useState, useCallback, useEffect } from 'react';
import UnifiedDocumentEditor from './UnifiedDocumentEditor';
import {
  FileText,
  Plus,
  Loader2,
  Download,
  Sparkles,
  ChevronDown,
  Check,
  AlertCircle,
} from 'lucide-react';

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
  createdAt: string;
  updatedAt: string;
}

interface EditorPanelProps {
  projectId?: string;
  submissionType?: string;
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
const EditorPanel: React.FC<EditorPanelProps> = ({ projectId, submissionType }) => {
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

  // ── Save to artifacts API ────────────────────────────────────────────────
  const handleSave = useCallback(
    async (content: string, _metadata: Record<string, unknown>) => {
      if (!projectId || !activeArtifact) return;
      setSaving(true);
      setSaveStatus('idle');
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
    const htmlContent = aiResult.startsWith('<')
      ? aiResult
      : aiResult
          .split('\n\n')
          .map(p => `<p>${p}</p>`)
          .join('');
    setActiveArtifact({ ...activeArtifact, content: htmlContent });
    setAiResult(null);
  }, [aiResult, activeArtifact]);

  // ── DOCX Export ──────────────────────────────────────────────────────────
  const handleExportDocx = useCallback(async () => {
    if (!activeArtifact) return;
    try {
      // Use the download endpoint for generated docs
      const filename = `${activeArtifact.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;
      window.open(`/api/concept2cure/documents/download/${encodeURIComponent(filename)}`, '_blank');
    } catch {
      // silent
    }
  }, [activeArtifact]);

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
    return (
      <div className="flex flex-col h-full bg-white">
        {/* Header */}
        <div className="flex items-center justify-between h-12 px-4 border-b border-zinc-100 bg-zinc-50/50">
          <h3 className="text-sm font-semibold text-zinc-700">Project Documents</h3>
        </div>

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
          ) : artifacts.length === 0 ? (
            <div className="text-center py-8 text-zinc-400 text-sm">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No documents yet. Create one above.
            </div>
          ) : (
            <div className="space-y-1">
              {artifacts.map(a => (
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
                    <span className="text-[10px] text-zinc-400 ml-2 shrink-0">v{a.version}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {a.type} &middot; {new Date(a.updatedAt || a.createdAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Editor view ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top bar with AI tools */}
      <div className="flex items-center justify-between h-10 px-3 border-b border-zinc-100 bg-zinc-50/50 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setActiveArtifact(null);
              setShowArtifactList(true);
              setAiResult(null);
            }}
            className="text-xs text-zinc-500 hover:text-zinc-700"
          >
            &larr; Documents
          </button>
          <span className="text-zinc-300">/</span>
          <span className="text-xs font-medium text-zinc-700 truncate max-w-[200px]">
            {activeArtifact?.title}
          </span>
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-600">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-[10px] text-red-500">
              <AlertCircle className="w-3 h-3" /> Error
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* AI actions dropdown */}
          <div className="relative">
            <button
              onClick={() => setAiMenuOpen(!aiMenuOpen)}
              disabled={aiLoading}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-violet-50 text-violet-700 rounded-md hover:bg-violet-100 disabled:opacity-50"
            >
              {aiLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              AI Edit
              <ChevronDown className="w-3 h-3" />
            </button>
            {aiMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-zinc-200 rounded-lg shadow-lg z-50 py-1">
                {AI_ACTIONS.map(a => (
                  <button
                    key={a.id}
                    onClick={() => handleAIEdit(a.id)}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-50 transition-colors"
                  >
                    <div className="text-xs font-medium text-zinc-700">{a.label}</div>
                    <div className="text-[10px] text-zinc-400">{a.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export DOCX */}
          <button
            onClick={handleExportDocx}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-zinc-100 text-zinc-600 rounded-md hover:bg-zinc-200"
          >
            <Download className="w-3.5 h-3.5" />
            DOCX
          </button>
        </div>
      </div>

      {/* AI result banner */}
      {aiResult && (
        <div className="border-b border-amber-200 bg-amber-50/80 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-amber-800 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> AI Suggestion
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
          <div className="text-xs text-amber-900 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {aiResult}
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <UnifiedDocumentEditor
          key={activeArtifact?.id}
          documentId={activeArtifact?.id}
          initialContent={activeArtifact?.content || ''}
          documentTitle={activeArtifact?.title}
          documentType={activeArtifact?.type}
          submissionType={submissionType}
          showCompliance
          showTraceability
          onSave={handleSave}
        />
      </div>
    </div>
  );
};

export default EditorPanel;
