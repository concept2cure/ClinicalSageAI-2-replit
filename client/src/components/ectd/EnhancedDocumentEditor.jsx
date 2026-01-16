import React, { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { Bot, BookOpen, CheckCircle2, Database, Sparkles } from 'lucide-react';
import { evidenceFabric } from '@/api/evidenceFabric';

import { DataRoomPanel } from '../authoring/DataRoomPanel';
import { AIPanel } from '../authoring/AIPanel';
import { ReferencePanel } from '../authoring/ReferencePanel';

// Step 3 (TipTap engine) is feature-flagged so Step 2 can be validated in isolation.
// Enable by setting: VITE_ENABLE_TIPTAP_EDITOR=true
const tiptapEnabled =
  typeof import.meta !== 'undefined' &&
  import.meta?.env &&
  String(import.meta.env.VITE_ENABLE_TIPTAP_EDITOR).toLowerCase() === 'true';

const TipTapEnhancedDocumentEditor = React.lazy(() => import('./TipTapEnhancedDocumentEditor'));

class TipTapEditorErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Best-effort: avoid breaking the whole co-author surface.
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function RightRail({ activeTab, setActiveTab, activeSourceId, activeDataVersion, aiContext, setAiContext }) {
  const handleDraftWithAI = useCallback(
    (nextContext) => {
      if (!nextContext) return;
      setAiContext?.(nextContext);
      setActiveTab('ai');
    },
    [setActiveTab, setAiContext]
  );

  return (
    <div className="w-[320px] bg-white border-l border-gray-200 flex flex-col shrink-0">
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab('ai')}
          className={`flex-1 p-2 text-[10px] font-medium flex flex-col items-center justify-center gap-1 ${
            activeTab === 'ai' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
          }`}
          aria-label="AI"
        >
          <Bot size={16} />
          <span>AI</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('data')}
          className={`flex-1 p-2 text-[10px] font-medium flex flex-col items-center justify-center gap-1 ${
            activeTab === 'data' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
          }`}
          aria-label="Data"
        >
          <Database size={16} />
          <span>Data</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('refs')}
          className={`flex-1 p-2 text-[10px] font-medium flex flex-col items-center justify-center gap-1 ${
            activeTab === 'refs' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
          }`}
          aria-label="References"
        >
          <BookOpen size={16} />
          <span>Refs</span>
        </button>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'ai' && (
          <div className="h-full w-full overflow-hidden">
            <AIPanel initialContext={aiContext} onClearContext={() => setAiContext?.(null)} />
          </div>
        )}
        {activeTab === 'data' && (
          <div className="h-full w-full">
            <DataRoomPanel
              activeSourceId={activeSourceId}
              activeDataVersion={activeDataVersion}
              onDraftWithAI={handleDraftWithAI}
            />
          </div>
        )}
        {activeTab === 'refs' && (
          <div className="h-full w-full overflow-hidden">
            <ReferencePanel />
          </div>
        )}
      </div>
    </div>
  );
}

function detectSmartTagPresence(content) {
  if (!content) return false;
  const s = String(content);
  return s.includes('<smart-tag') || s.includes('⟦');
}

function OnboardingChecklist({
  visible,
  onDismiss,
  smartTagInserted,
  onOpenData,
  onOpenRefs,
  onOpenAI,
  onSave,
  modeLabel,
}) {
  if (!visible) return null;

  return (
    <div className="shrink-0 border-b border-slate-200 bg-blue-50">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-700" />
            <div className="font-semibold text-slate-900">First document checklist</div>
            {modeLabel ? (
              <span className="text-[10px] font-mono text-slate-500">{modeLabel}</span>
            ) : null}
          </div>
          <div className="text-sm text-slate-700 mt-1">
            Do these once and the workflow will “click”.
          </div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`h-4 w-4 ${smartTagInserted ? 'text-green-600' : 'text-slate-300'}`} />
              <span className={smartTagInserted ? 'text-slate-900' : 'text-slate-600'}>
                Insert a SmartTag / data token (drag from Data)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-slate-300" />
              <span className="text-slate-600">Save the document</span>
            </div>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenData}
            className="px-2.5 py-1.5 text-xs rounded border border-blue-200 bg-white hover:bg-blue-50"
          >
            Open Data
          </button>
          <button
            type="button"
            onClick={onOpenRefs}
            className="px-2.5 py-1.5 text-xs rounded border border-blue-200 bg-white hover:bg-blue-50"
          >
            Open Refs
          </button>
          <button
            type="button"
            onClick={onOpenAI}
            className="px-2.5 py-1.5 text-xs rounded border border-blue-200 bg-white hover:bg-blue-50"
          >
            Open AI
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-2.5 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-2.5 py-1.5 text-xs rounded border border-slate-200 bg-white hover:bg-slate-50"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function LegacyTextareaEditor({ document, onChange, onSave, onBack, backLabel = 'Back', BackIcon, zenMode }) {
  const initialContent = useMemo(() => {
    if (typeof document?.content === 'string') return document.content;
    if (typeof document?.html === 'string') return document.html;
    return '';
  }, [document]);

  const [content, setContent] = useState(initialContent);
  const [activeTab, setActiveTab] = useState('data');
  const [aiContext, setAiContext] = useState(null);
  const [showChecklist, setShowChecklist] = useState(true);

  // Evidence Fabric ({{...}}) manifest + stale tracking
  const [evidenceManifest, setEvidenceManifest] = useState(() => document?.metadata?.evidenceFabric?.manifest || null);
  const [evidenceStatus, setEvidenceStatus] = useState({ stale: false, staleReason: null, changedSources: [], newBindings: [], checkedAt: null, refreshedAt: null });
  const [evidenceChecking, setEvidenceChecking] = useState(false);
  const [evidenceRefreshing, setEvidenceRefreshing] = useState(false);
  const evidenceDebounceRef = useRef(null);

  const textareaRef = useRef(null);
  const [insertPanelOpen, setInsertPanelOpen] = useState(false);
  const [insertKind, setInsertKind] = useState('data'); // 'data' | 'citation'
  const [insertDraft, setInsertDraft] = useState({
    value: '0.45',
    dataset: 'ADSL',
    variable: 'HR_PFS',
    sourceId: 'TLF-14.2.1',
    dataVersion: 'v1.0',
    label: 'Hazard Ratio (PFS)',
  });

  const fireAuditEvent = useCallback(
    async (action, details) => {
      try {
        const organizationId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
        await fetch('/api/audit/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-organization-id': organizationId,
          },
          body: JSON.stringify({
            action,
            organizationId: Number(organizationId),
            userId: localStorage.getItem('userId') || 'unknown',
            userName: localStorage.getItem('userName') || 'Unknown User',
            details: {
              module: 'ectd-coauthor',
              editorMode: 'legacy-safe',
              documentId: document?.id ?? document?.documentId ?? null,
              documentTitle: document?.title ?? null,
              ...(details || {}),
            },
          }),
        });
      } catch {
        // best-effort
      }
    },
    [document]
  );

  const insertAtCursor = useCallback(
    (text) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        const next = content + text;
        setContent(next);
        onChange?.(next);
        return;
      }

      const start = textarea.selectionStart ?? content.length;
      const end = textarea.selectionEnd ?? content.length;
      const next = content.slice(0, start) + text + content.slice(end);

      setContent(next);
      onChange?.(next);

      requestAnimationFrame(() => {
        try {
          textarea.focus();
          const cursor = start + text.length;
          textarea.setSelectionRange(cursor, cursor);
        } catch {
          // ignore
        }
      });
    },
    [content, onChange]
  );

  const handleDrop = useCallback(
    (e) => {
      const dt = e.dataTransfer;
      if (!dt) return;

      const raw = dt.getData('application/x-clinical-data');
      if (!raw) return;

      e.preventDefault();
      e.stopPropagation();

      try {
        const payload = JSON.parse(raw);
        if (!payload || payload.type !== 'smartTag') return;

        const parts = [
          payload.label ? `${payload.label}: ${payload.value ?? ''}` : payload.value ?? '',
          payload.sourceId ? `source=${payload.sourceId}` : null,
          payload.dataset ? `pop=${payload.dataset}` : null,
          payload.variable ? `var=${payload.variable}` : null,
          payload.dataVersion ? `ver=${payload.dataVersion}` : null,
          payload.status ? `status=${payload.status}` : null,
        ].filter(Boolean);

        insertAtCursor(`⟦${parts.join(' | ')}⟧`);
      } catch {
        // malformed payload: do nothing
      }
    },
    [insertAtCursor]
  );

  const handleDragOver = useCallback((e) => {
    if (e.dataTransfer?.types?.includes('application/x-clinical-data')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleSave = useCallback(() => {
    fireAuditEvent('ectd.document.save', {
      contentFormat: 'text',
      contentLength: typeof content === 'string' ? content.length : null,
    });
    onSave?.({
      ...(document ?? {}),
      content,
      lastEdited: new Date().toISOString(),
      metadata: {
        ...(document?.metadata || {}),
        evidenceFabric: {
          ...(document?.metadata?.evidenceFabric || {}),
          manifest: evidenceManifest || document?.metadata?.evidenceFabric?.manifest || null,
          stale: Boolean(evidenceStatus?.stale),
          staleReason: evidenceStatus?.staleReason || null,
          changedSources: Array.isArray(evidenceStatus?.changedSources) ? evidenceStatus.changedSources : [],
          newBindings: Array.isArray(evidenceStatus?.newBindings) ? evidenceStatus.newBindings : [],
          checkedAt: evidenceStatus?.checkedAt || null,
          refreshedAt: evidenceStatus?.refreshedAt || null,
        },
      },
    });
  }, [content, document, fireAuditEvent, onSave]);

  // Auto-check staleness when content contains Evidence Fabric tags and we have a previous manifest
  const hasEvidenceTags = useMemo(() => typeof content === 'string' && content.includes('{{') && content.includes('}}'), [content]);

  const runEvidenceCheck = useCallback(async () => {
    if (!hasEvidenceTags) return;
    if (!evidenceManifest) return;

    try {
      setEvidenceChecking(true);
      const organizationId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
      const resp = await evidenceFabric.status(String(organizationId), content, evidenceManifest);
      setEvidenceStatus({
        stale: Boolean(resp?.stale),
        staleReason: resp?.staleReason || null,
        changedSources: Array.isArray(resp?.changedSources) ? resp.changedSources : [],
        newBindings: Array.isArray(resp?.newBindings) ? resp.newBindings : [],
        checkedAt: new Date().toISOString(),
        refreshedAt: evidenceStatus?.refreshedAt || null,
      });
    } catch {
      // fail soft
    } finally {
      setEvidenceChecking(false);
    }
  }, [content, evidenceManifest, evidenceStatus?.refreshedAt, hasEvidenceTags]);

  useEffect(() => {
    if (!hasEvidenceTags) return;
    if (!evidenceManifest) return;
    if (evidenceDebounceRef.current) window.clearTimeout(evidenceDebounceRef.current);
    evidenceDebounceRef.current = window.setTimeout(() => {
      runEvidenceCheck();
    }, 800);
    return () => {
      if (evidenceDebounceRef.current) window.clearTimeout(evidenceDebounceRef.current);
    };
  }, [hasEvidenceTags, evidenceManifest, runEvidenceCheck]);

  const refreshEvidence = useCallback(async () => {
    if (!hasEvidenceTags) {
      alert('No Evidence Fabric tags found. Insert tags like {{safety_analysis.primary_endpoint.p_value}} first.');
      return;
    }

    try {
      setEvidenceRefreshing(true);
      const organizationId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
      const resp = await evidenceFabric.preview(String(organizationId), content, evidenceManifest || undefined);

      if (resp?.manifest) setEvidenceManifest(resp.manifest);
      setEvidenceStatus({
        stale: Boolean(resp?.stale),
        staleReason: resp?.staleReason || null,
        changedSources: Array.isArray(resp?.changedSources) ? resp.changedSources : [],
        newBindings: Array.isArray(resp?.newBindings) ? resp.newBindings : [],
        checkedAt: new Date().toISOString(),
        refreshedAt: new Date().toISOString(),
      });

      // Persist manifest immediately (so parent can save even if user doesn't click Save again)
      onSave?.({
        ...(document ?? {}),
        content,
        lastEdited: new Date().toISOString(),
        metadata: {
          ...(document?.metadata || {}),
          evidenceFabric: {
            ...(document?.metadata?.evidenceFabric || {}),
            manifest: resp?.manifest || evidenceManifest || null,
            stale: Boolean(resp?.stale),
            staleReason: resp?.staleReason || null,
            changedSources: Array.isArray(resp?.changedSources) ? resp.changedSources : [],
            newBindings: Array.isArray(resp?.newBindings) ? resp.newBindings : [],
            checkedAt: new Date().toISOString(),
            refreshedAt: new Date().toISOString(),
          },
        },
      });
    } catch (e) {
      alert(e?.message || 'Evidence refresh failed');
    } finally {
      setEvidenceRefreshing(false);
    }
  }, [content, document, evidenceManifest, hasEvidenceTags, onSave]);

  const handleInsertTokenFromPanel = useCallback(() => {
    const payload = {
      type: 'smartTag',
      id: (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `tag_${Date.now()}`),
      value: String(insertDraft.value || '').trim() || '---',
      dataset: String(insertDraft.dataset || '').trim() || null,
      variable: String(insertDraft.variable || '').trim() || null,
      sourceId: String(insertDraft.sourceId || '').trim() || null,
      dataVersion: String(insertDraft.dataVersion || '').trim() || (insertKind === 'citation' ? 'OK' : 'v1.0'),
      status: insertKind === 'citation' ? 'verified' : 'draft',
      label: String(insertDraft.label || '').trim() || (insertKind === 'citation' ? 'Citation' : 'Data Point'),
    };

    fireAuditEvent(insertKind === 'citation' ? 'ectd.citation.insert' : 'ectd.smarttag.insert', {
      via: 'legacy-insert-panel',
      smartTag: payload,
    });

    insertAtCursor(`⟦${[payload.label ? `${payload.label}: ${payload.value}` : payload.value, payload.sourceId ? `source=${payload.sourceId}` : null, payload.dataset ? `pop=${payload.dataset}` : null, payload.variable ? `var=${payload.variable}` : null, payload.dataVersion ? `ver=${payload.dataVersion}` : null, payload.status ? `status=${payload.status}` : null].filter(Boolean).join(' | ')}⟧`);
    setInsertPanelOpen(false);
  }, [fireAuditEvent, insertAtCursor, insertDraft, insertKind]);

  const smartTagInserted = useMemo(() => detectSmartTagPresence(content), [content]);

  return (
    <div className={`flex h-full w-full overflow-hidden ${zenMode ? 'bg-slate-100' : 'bg-white'}`}>
      <div className={`flex-1 min-w-0 flex flex-col ${zenMode ? 'bg-white shadow-sm' : ''}`}>
        <OnboardingChecklist
          visible={showChecklist}
          onDismiss={() => setShowChecklist(false)}
          smartTagInserted={smartTagInserted}
          onOpenData={() => setActiveTab('data')}
          onOpenRefs={() => setActiveTab('refs')}
          onOpenAI={() => setActiveTab('ai')}
          onSave={handleSave}
          modeLabel="LEGACY SAFE MODE"
        />
        <div className="shrink-0 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-mono text-gray-400">STATUS: DRAFT (LEGACY SAFE MODE)</div>
            <div className="font-semibold text-slate-900 truncate">{document?.title || 'Untitled Document'}</div>
          </div>
          <div className="flex items-center gap-2">
            {hasEvidenceTags && (
              <div className={`mr-2 px-2 py-1 rounded border text-[11px] ${evidenceStatus?.stale ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                <span className="font-semibold">Evidence</span>: {evidenceStatus?.stale ? 'STALE' : 'FRESH'}
                {evidenceChecking ? <span className="ml-2 text-slate-500">checking…</span> : null}
              </div>
            )}

            {hasEvidenceTags && (
              <button
                type="button"
                onClick={refreshEvidence}
                className={`px-3 py-1.5 text-xs rounded border ${evidenceStatus?.stale ? 'border-rose-300 bg-rose-600 text-white hover:bg-rose-700' : 'border-slate-300 hover:bg-slate-50'} ${evidenceRefreshing ? 'opacity-70 cursor-not-allowed' : ''}`}
                disabled={evidenceRefreshing}
                title={evidenceStatus?.staleReason ? String(evidenceStatus.staleReason) : 'Refresh evidence and update manifest'}
              >
                Refresh Evidence
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setInsertKind('data');
                  setInsertPanelOpen(true);
                  setActiveTab('data');
                }}
                className="px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50"
              >
                Insert SmartTag
              </button>

              <button
                type="button"
                onClick={() => {
                  setInsertKind('citation');
                  setInsertDraft({
                    value: '[Smith 2025]',
                    dataset: 'References',
                    variable: 'Citation',
                    sourceId: 'PMID:382910',
                    dataVersion: 'OK',
                    label: 'Efficacy of Novel Inhibitors in Phase 3 Trials',
                  });
                  setInsertPanelOpen(true);
                  setActiveTab('refs');
                }}
                className="px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50"
              >
                Cite source
              </button>
                    const [showChecklist, setShowChecklist] = useState(!Boolean(zenMode));
              <button
                type="button"
                onClick={() => {
                  // Full validation/export is TipTap-only; guide the user.
                  setActiveTab('data');
                  fireAuditEvent('ectd.validate.blocked', { reason: 'legacy-mode' });
                  alert('Validation & export package requires TipTap mode. Set VITE_ENABLE_TIPTAP_EDITOR=true to enable the regulatory-grade audit scan.');
                }}
                className="px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50"
              >
                Validate
              </button>

              <button
                type="button"
                onClick={() => {
                  fireAuditEvent('ectd.export.blocked', { reason: 'legacy-mode' });
                  alert('Export package requires TipTap mode. Set VITE_ENABLE_TIPTAP_EDITOR=true to enable Pre-Submission Audit + package generation.');
                }}
                className="px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50"
              >
                Export package
              </button>

              {insertPanelOpen && (
                <div className="absolute right-0 top-[40px] z-20 w-[360px] rounded-lg border border-slate-200 bg-white shadow-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {insertKind === 'citation' ? 'Insert Citation' : 'Insert SmartTag'}
                      </div>
                      <div className="text-xs text-slate-500">
                        This inserts a traceable token into the document. In TipTap mode it becomes a protected SmartTag chip.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInsertPanelOpen(false)}
                      className="text-xs text-slate-500 hover:text-slate-800"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2">
                    <label className="text-[10px] font-medium text-slate-500">Value</label>
                    <input
                      value={insertDraft.value}
                      onChange={(e) => setInsertDraft((p) => ({ ...p, value: e.target.value }))}
                      className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                      placeholder={insertKind === 'citation' ? '[Smith 2025]' : '0.45'}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500">Dataset</label>
                        <input
                          value={insertDraft.dataset}
                          onChange={(e) => setInsertDraft((p) => ({ ...p, dataset: e.target.value }))}
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                          placeholder={insertKind === 'citation' ? 'References' : 'ADSL'}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500">Variable</label>
                        <input
                          value={insertDraft.variable}
                          onChange={(e) => setInsertDraft((p) => ({ ...p, variable: e.target.value }))}
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                          placeholder={insertKind === 'citation' ? 'Citation' : 'HR_PFS'}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500">Source ID</label>
                        <input
                          value={insertDraft.sourceId}
                          onChange={(e) => setInsertDraft((p) => ({ ...p, sourceId: e.target.value }))}
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                          placeholder={insertKind === 'citation' ? 'PMID:…' : 'TLF-…'}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500">Version</label>
                        <input
                          value={insertDraft.dataVersion}
                          onChange={(e) => setInsertDraft((p) => ({ ...p, dataVersion: e.target.value }))}
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                          placeholder={insertKind === 'citation' ? 'OK' : 'v1.0'}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-medium text-slate-500">Label</label>
                      <input
                        value={insertDraft.label}
                        onChange={(e) => setInsertDraft((p) => ({ ...p, label: e.target.value }))}
                        className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                        placeholder={insertKind === 'citation' ? 'Paper title…' : 'Data Point'}
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab(insertKind === 'citation' ? 'refs' : 'data')}
                        className="text-xs text-blue-600 hover:text-blue-700"
                      >
                        Open {insertKind === 'citation' ? 'Refs' : 'Data'} panel
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setInsertPanelOpen(false)}
                          className="px-2.5 py-1.5 text-xs rounded border border-slate-200 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleInsertTokenFromPanel}
                          className="px-2.5 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Insert
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50"
            >
              {BackIcon ? (
                <span className="inline-flex items-center gap-1">
                  <BackIcon size={14} /> {backLabel}
                </span>
              ) : (
                backLabel
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className={zenMode ? 'max-w-[980px] mx-auto p-6' : 'p-4'}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                onChange?.(e.target.value);
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`w-full ${zenMode ? 'min-h-[calc(100vh-220px)]' : 'h-full'} resize-none rounded-lg border border-slate-200 p-4 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
              placeholder="Safe mode: drag values from the Data Room to insert a traceable token"
            />
          </div>
        </div>
      </div>

      {!zenMode && (
        <RightRail
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeSourceId={null}
          activeDataVersion={null}
          aiContext={aiContext}
          setAiContext={setAiContext}
        />
      )}
    </div>
  );
}

export default function EnhancedDocumentEditor(props) {
  const forceTipTap = Boolean(props?.forceTipTap);
  const shouldUseTipTap = forceTipTap || tiptapEnabled;

  if (!shouldUseTipTap) {
    return <LegacyTextareaEditor {...props} />;
  }

  return (
    <TipTapEditorErrorBoundary fallback={<LegacyTextareaEditor {...props} />}> 
      <Suspense
        fallback={<div className="flex items-center justify-center h-full w-full text-sm text-gray-500">Loading editor…</div>}
      >
        <TipTapEnhancedDocumentEditor {...props} />
      </Suspense>
    </TipTapEditorErrorBoundary>
  );
}

/*
  The remainder of this file was a large legacy editor implementation.
  It was left here (commented out) because it was syntactically corrupted and
  blocked Vite from starting. If you need it back, restore from .history.

  --- legacy content below ---

          severity: s.priority === 'High' ? 'warning' : 'info',
          message: s.title + ': ' + s.description,
          details: s
        }));
        
        // Add gaps if any
        if (data.regulatory_gaps) {
          data.regulatory_gaps.forEach((gap, i) => {
            issues.push({
              id: `gap-${i}`,
              severity: 'warning',
              message: `Gap: ${gap.description} (${gap.regulatory_reference})`,
              details: gap
            });
          });
        }
        
        setComplianceIssues(issues);
      } else {
        // Fallback if API fails or returns no suggestions
        setComplianceIssues([{ id: 0, severity: 'info', message: 'Analysis complete. No critical issues found.' }]);
      }
    } catch (error) {
      console.error('Compliance check failed:', error);
      setComplianceIssues([{ id: 0, severity: 'warning', message: 'Could not complete analysis. Please try again.' }]);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleSendMessage = async (msg) => {
    const newMessages = [...aiMessages, { role: 'user', content: msg }];
    setAiMessages(newMessages);
    setIsAiProcessing(true);
    
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          context: content.substring(0, 5000) // Send first 5000 chars as context
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setAiMessages([...newMessages, { 
            role: 'assistant', 
            content: data.message,
            facts: data.usedFacts 
        }]);
      } else {
        setAiMessages([...newMessages, { role: 'assistant', content: "I'm having trouble connecting to the server. Please try again." }]);
      }
    } catch (error) {
      console.error('Chat failed:', error);
      setAiMessages([...newMessages, { role: 'assistant', content: "Network error. Please check your connection." }]);
    } finally {
      setIsAiProcessing(false);
    }
  };


  // Define initial content first - ensure it's always a string and handle corrupted content
  const getValidContent = content => {
    console.log('🔍 getValidContent called with:', typeof content, content);

    // Check for the literal string "[object Object]" which indicates corruption
    if (
      typeof content === 'string' &&
      (content.trim() === '[object Object]' || content.includes('[object Object]'))
    ) {
      console.warn('🚨 Found literal "[object Object]" string - replacing with default content');
      return `<h1>${document?.title || 'New Regulatory Document'}</h1>
<h2>Document Recovery</h2>
<p>This document content was corrupted (showed "[object Object]") and has been reset. Please add your content below.</p>

<h2>Key Sections</h2>
<ul>
  const [content, setContent] = useState(initialContent);
  const [activeTab, setActiveTab] = useState('data');
  const [aiContext, setAiContext] = useState(null);
  const [showChecklist, setShowChecklist] = useState(true);
  const [insertPanelOpen, setInsertPanelOpen] = useState(false);
  const [insertKind, setInsertKind] = useState('data'); // 'data' | 'citation'
  const [insertDraft, setInsertDraft] = useState({
    value: '0.45',
    dataset: 'ADSL',
    variable: 'HR_PFS',
    sourceId: 'TLF-14.2.1',
    dataVersion: 'v1.0',
    label: 'Hazard Ratio (PFS)',
  });
  <li><strong>Study Objectives</strong></li>
  <li><strong>Methodology</strong></li>
  <li><strong>Results and Analysis</strong></li>
  <li><strong>Conclusions</strong></li>
</ul>

<hr>

<p><em>Use the advanced formatting toolbar above to style your document professionally. Track changes are enabled for collaborative editing.</em></p>`;
    }

    if (typeof content === 'string' && content.trim() !== '') {
      return content;
    }
    if (typeof content === 'object' && content !== null) {
      // If content is an object, try to extract meaningful text or return default
      if (content.content && typeof content.content === 'string') return String(content.content);
      if (content.text && typeof content.text === 'string') return String(content.text);
      if (content.body && typeof content.body === 'string') return String(content.body);
      if (content.html && typeof content.html === 'string') return String(content.html);

      // If it's a corrupted object, log it and return default content
      console.warn(
        '🚨 Corrupted document content detected - using default template. Object:',
        content
      );
      return `<h1>${document?.title || 'New Regulatory Document'}</h1>
<h2>Document Recovery</h2>
<p>This document had corrupted content that has been reset. Content type was: ${typeof content}. Please add your content below.</p>

<h2>Key Sections</h2>
<ul>
  <li><strong>Executive Summary</strong></li>
  <li><strong>Study Objectives</strong></li>
  <li><strong>Methodology</strong></li>
  <li><strong>Results and Analysis</strong></li>
  <li><strong>Conclusions</strong></li>
</ul>

<hr>

<p><em>Use the advanced formatting toolbar above to style your document professionally. Track changes are enabled for collaborative editing.</em></p>`;
    }
    // Fallback for any other type
    const fallbackContent = `<h1>${document?.title || 'New Regulatory Document'}</h1>
<h2>Overview</h2>
<p>Begin writing your regulatory document here. This professional editor provides AI-powered assistance for creating compliant pharmaceutical documentation with track changes, version history, and real-time collaboration.</p>

<h2>Key Sections</h2>
<ul>
  <li><strong>Executive Summary</strong></li>
  <li><strong>Study Objectives</strong></li>
  <li><strong>Methodology</strong></li>
  <li><strong>Results and Analysis</strong></li>
  <li><strong>Conclusions</strong></li>
</ul>

<hr>

<p><em>Use the advanced formatting toolbar above to style your document professionally. Track changes are enabled for collaborative editing.</em></p>`;

    console.log('🔧 Using fallback content for type:', typeof content, 'value:', content);
    return fallbackContent;
  };

  const initialContent = getValidContent(document?.content);

  const [content, setContent] = useState(() => initialContent);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [indBuilderMode, setIndBuilderMode] = useState(false);
  const [trackChanges, setTrackChanges] = useState(true);
  const [changes, setChanges] = useState([]);
  const [lastSavedContent, setLastSavedContent] = useState(() => initialContent);
  const changeTimeoutRef = useRef(null);
  const [complianceMetrics, setComplianceMetrics] = useState({
    fda: 85,
    ich: 90,
    quality: 88,
  });

  // Intelligent Document Context Hints State
  const [contextHints, setContextHints] = useState([]);

  const handleExportWord = () => {
    // Create a basic HTML structure for the Word document
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export HTML to Word Document with JavaScript</title></head><body>";
    const footer = "</body></html>";
    const sourceHTML = header + content + footer;
    
    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = `${document?.title || 'document'}.doc`;
    fileDownload.click();
    document.body.removeChild(fileDownload);
  };

  const handleSaveLocal = () => {
    const blob = new Blob([content], { type: "text/html;charset=utf-8" });
    saveAs(blob, `${document?.title || 'document'}.html`);
  };

  const handleSaveCloud = () => {
    // Simulate cloud save
    onSave(content);
    alert("Document saved to ClinicalSage Cloud successfully.");
  };
  const [showContextPanel, setShowContextPanel] = useState(true);
  const [showSmartRefs, setShowSmartRefs] = useState(false);
  const [hintCategories, setHintCategories] = useState({
    structure: true,
    compliance: true,
    content: true,
    style: true,
  });

  // Initialize versions with localStorage persistence
  const [versions, setVersions] = useState(() => {
    // Load saved versions from localStorage
    const savedVersions = localStorage.getItem(`document-versions-${document?.id || 'default'}`);
    if (savedVersions) {
      const parsedVersions = JSON.parse(savedVersions);
      console.log('🔄 Loaded saved versions from localStorage:', parsedVersions.length);
      return parsedVersions.map(v => ({
        ...v,
        timestamp: new Date(v.timestamp),
      }));
    }

    console.log('🆕 No saved versions found - creating defaults');
    // Default versions if none saved
    return [
      {
        id: 'current',
        timestamp: new Date(),
        author: 'You',
        changes: 'Current working version - no changes',
        content: initialContent,
        preview: initialContent.substring(0, 100) + '...',
        isCurrent: true,
      },
      {
        id: 1,
        timestamp: new Date(Date.now() - 3600000),
        author: 'Dr. Smith',
        changes: 'Added methodology section',
        content: `# Document with Methodology

This version includes the methodology section added by Dr. Smith.

## Methodology
The study will follow standard regulatory guidelines with enhanced monitoring.

### Study Design
- Randomized controlled trial
- Double-blind protocol
- Multi-center approach

*Updated by Dr. Smith at ${new Date(Date.now() - 3600000).toLocaleString()}*`,
      },
      {
        id: 2,
        timestamp: new Date(Date.now() - 7200000),
        author: 'Regulatory Team',
        changes: 'Updated compliance requirements',
        content: `# Compliance Updated Document

This version includes updated compliance requirements from the regulatory team.

## Compliance Requirements
- FDA 21 CFR Part 312
- ICH GCP guidelines
- Local regulatory standards

### Quality Assurance
All procedures must follow validated protocols.

*Updated by Regulatory Team at ${new Date(Date.now() - 7200000).toLocaleString()}*`,
      },
    ];
  });
  const [originalContent, setOriginalContent] = useState(() => initialContent);

  // Simple approach: Store the user's actual working content in a ref so it persists
  const userWorkingContentRef = useRef(initialContent);

  // Update content when document changes (critical for document switching)
  useEffect(() => {
    const newContent = getValidContent(document?.content);
    const currentDocId = document?.id;
    
    // Only update if this is a different document (by ID)
    if (currentDocId && newContent && newContent !== userWorkingContentRef.current) {
      setContent(newContent);
      setLastSavedContent(newContent);
      setOriginalContent(newContent);
      userWorkingContentRef.current = newContent;
    }
  }, [document?.id]); // Only re-run when document ID changes

  // Track which version is currently being viewed for visual selection
  const [selectedVersionId, setSelectedVersionId] = useState('current');

  // Flag to prevent content updates during version restoration
  const isRestoringVersion = useRef(false);

  // Simple diff algorithm to identify additions and deletions
  const generateDiff = (oldText, newText) => {
    // Simple word-level diff for basic change tracking
    const oldWords = oldText.split(/(\s+)/);
    const newWords = newText.split(/(\s+)/);

    const changes = [];
    let oldIndex = 0;
    let newIndex = 0;

    while (oldIndex < oldWords.length || newIndex < newWords.length) {
      if (oldIndex >= oldWords.length) {
        // Additions at the end
        changes.push({
          type: 'addition',
          text: newWords.slice(newIndex).join(''),
          position: newIndex,
        });
        break;
      } else if (newIndex >= newWords.length) {
        // Deletions at the end
        changes.push({
          type: 'deletion',
          text: oldWords.slice(oldIndex).join(''),
          position: oldIndex,
        });
        break;
      } else if (oldWords[oldIndex] === newWords[newIndex]) {
        // No change
        oldIndex++;
        newIndex++;
      } else {
        // Find next common word
        let found = false;
        for (let i = newIndex + 1; i < newWords.length; i++) {
          if (oldWords[oldIndex] === newWords[i]) {
            // Addition found
            changes.push({
              type: 'addition',
              text: newWords.slice(newIndex, i).join(''),
              position: newIndex,
            });
            newIndex = i;
            found = true;
            break;
          }
        }
        if (!found) {
          for (let i = oldIndex + 1; i < oldWords.length; i++) {
            if (oldWords[i] === newWords[newIndex]) {
              // Deletion found
              changes.push({
                type: 'deletion',
                text: oldWords.slice(oldIndex, i).join(''),
                position: oldIndex,
              });
              oldIndex = i;
              found = true;
              break;
            }
          }
        }
        if (!found) {
          // Replacement
          changes.push({
            type: 'deletion',
            text: oldWords[oldIndex],
            position: oldIndex,
          });
          changes.push({
            type: 'addition',
            text: newWords[newIndex],
            position: newIndex,
          });
          oldIndex++;
          newIndex++;
        }
      }
    }

    return changes;
  };

  // Apply visual markup to content for track changes
  const applyTrackChangesMarkup = content => {
    if (!trackChanges || changes.length === 0) return content;

    let markedContent = content;

    // Apply markup for each change
    changes.forEach(change => {
      const diff = generateDiff(change.oldContent, change.newContent);

      diff.forEach(d => {
        if (d.type === 'addition') {
          // Mark additions with green background and underline
          markedContent = markedContent.replace(
            d.text,
            `<span class="track-addition" style="background-color: #d4edda; color: #155724; text-decoration: underline; padding: 1px 2px; border-radius: 2px;">${d.text}</span>`
          );
        } else if (d.type === 'deletion') {
          // Mark deletions with red background and strikethrough
          const deletionMarkup = `<span class="track-deletion" style="background-color: #f8d7da; color: #721c24; text-decoration: line-through; padding: 1px 2px; border-radius: 2px;">${d.text}</span>`;
          // Find appropriate insertion point in new content
          markedContent += deletionMarkup;
        }
      });
    });

    return markedContent;
  };

  // Debounced track content changes for revision tracking
  const trackContentChange = newContent => {
    if (!trackChanges || !lastSavedContent || lastSavedContent === newContent) return;

    // Clear existing timeout
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className={zenMode ? 'max-w-[980px] mx-auto p-6' : 'p-4'}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                onChange?.(e.target.value);
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`w-full ${zenMode ? 'min-h-[calc(100vh-220px)]' : 'h-full'} resize-none rounded-lg border border-slate-200 p-4 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
              placeholder="Safe mode: drag values from the Data Room to insert a traceable token"
            />
          </div>
        </div>
        summary = `${additionCount} addition${additionCount !== 1 ? 's' : ''}`;

      {!zenMode && (
        <RightRail
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeSourceId={null}
          activeDataVersion={null}
          aiContext={aiContext}
          setAiContext={setAiContext}
        />
      )}
        type: 'edit',
        oldContent: lastSavedContent,
        newContent: newContent,
        summary: summary,
        diff: diff,
      };

      setChanges(prev => [change, ...prev.slice(0, 49)]); // Keep last 50 changes
      setLastSavedContent(newContent);
    }, 1500); // Track changes after 1.5 seconds of no typing
  };

  // Update working content only when user types (not when restoring versions)
  const handleContentChange = newContent => {
    // Skip if we're currently restoring a version
    if (isRestoringVersion.current) {
      console.log('🚫 Skipping content update - version restoration in progress');
      return;
    }

    // Ensure content is always a string
    const stringContent = String(newContent || '');

    console.log('📝 handleContentChange called with content length:', stringContent.length);
    console.log('📝 Content preview:', stringContent.substring(0, 100));

    // Track changes if enabled (debounced)
    if (trackChanges) {
      trackContentChange(stringContent);
    }

    setContent(stringContent);
    userWorkingContentRef.current = stringContent;

    // Update current version ONLY when user is actively editing
    setVersions(prev =>
      prev.map(version =>
        version.isCurrent
          ? {
              ...version,
              content: stringContent,
              timestamp: new Date(),
              changes:
                stringContent.trim() !== originalContent.trim()
                  ? 'Current working version - unsaved changes'
                  : 'Current working version - no changes',
              preview: stringContent.substring(0, 100) + '...',
            }
          : version
      )
    );

    if (document && onChange) {
      onChange({ ...document, content: stringContent });
    }

    generateContextHints(stringContent);
    console.log('✓ Content updated - working ref length:', userWorkingContentRef.current.length);
    console.log(
      '✓ Working ref has formatting:',
      userWorkingContentRef.current.includes('**') ||
        userWorkingContentRef.current.includes('*') ||
        userWorkingContentRef.current.includes('<')
    );
  };

  // Save versions to localStorage whenever versions change
  useEffect(() => {
    if (versions.length > 0) {
      localStorage.setItem(
        `document-versions-${document?.id || 'default'}`,
        JSON.stringify(versions)
      );
      console.log('💾 Saved versions to localStorage:', versions.length, 'versions');
    }
  }, [versions, document?.id]);

  // Initialize context hints on component mount
  useEffect(() => {
    generateContextHints(content);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
    };
  }, []);

  // Clear changes when track changes is turned off
  useEffect(() => {
    if (!trackChanges) {
      setChanges([]);
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
    }
  }, [trackChanges]);

  // Remove this useEffect since we're now using controlled value
  // Content sync handled by React controlled component

  const handleEditorChange = (content, editor) => {
    setContent(content);
    if (onChange) onChange(content);
  };

  const handleAIAssist = () => {
    setShowAIPanel(!showAIPanel);
    if (!showAIPanel && complianceIssues.length === 0) {
      // Optional: Auto-run compliance check on open?
      // runComplianceCheck();
    }
  };

  const createVersion = () => {
    const currentContent = userWorkingContentRef.current || content;

    console.log('🔄 CREATE VERSION DEBUG:', {
      workingRefLength: userWorkingContentRef.current?.length || 0,
      contentStateLength: content.length,
      currentContentLength: currentContent.length,
      workingRefHasFormatting:
        userWorkingContentRef.current?.includes('**') ||
        userWorkingContentRef.current?.includes('*') ||
        false,
      contentStateHasFormatting: content.includes('**') || content.includes('*'),
      currentContentHasFormatting: currentContent.includes('**') || currentContent.includes('*'),
      savingContent: currentContent.substring(0, 100),
    });

    // Calculate proper version number: count non-current versions and add 1
    const historicalVersions = versions.filter(v => !v.isCurrent);
    const newVersionId = historicalVersions.length + 1;

    const newVersion = {
      id: newVersionId,
      timestamp: new Date(),
      author: 'You',
      changes: `Manual save - ${new Date().toLocaleTimeString()}`,
      content: currentContent, // Save the current working content with formatting
    };
    const updatedVersions = [newVersion, ...versions];
    setVersions(updatedVersions);

    // Save to localStorage immediately
    localStorage.setItem(
      `document-versions-${document?.id || 'default'}`,
      JSON.stringify(updatedVersions)
    );

    setOriginalContent(currentContent); // Update original content reference after manual save
    console.log(
      '✓ Version saved with current content and persisted to localStorage:',
      newVersion.id
    );
    console.log('✓ Saved version content preview:', newVersion.content.substring(0, 200));
  };

  // TinyMCE configuration with advanced features
  const editorConfig = {
    height: 600,
    menubar: true,
    plugins: [
      'advlist',
      'autolink',
      'lists',
      'link',
      'image',
      'charmap',
      'preview',
      'anchor',
      'searchreplace',
      'visualblocks',
      'code',
      'fullscreen',
      'insertdatetime',
      'media',
      'table',
      'help',
      'wordcount',
      'checklist',
      'formatpainter',
      'pagebreak',
      'nonbreaking',
      'template',
      'textcolor',
      'colorpicker',
      'textpattern',
      'imagetools',
      'toc',
      'mentions',
    ],
    toolbar: [
      'undo redo | formatselect | bold italic underline strikethrough | forecolor backcolor | removeformat',
      'alignleft aligncenter alignright alignjustify | outdent indent | numlist bullist checklist | link image media table | insertdatetime charmap pagebreak',
      'searchreplace | visualblocks code preview fullscreen help | wordcount',
    ].join(' | '),
    content_style: `
      body { 
        font-family: 'Times New Roman', Times, serif; 
        font-size: 12pt; 
        line-height: 1.6; 
        max-width: 8.5in; 
        margin: 0 auto; 
        padding: 1in;
        background: white;
      }
      .track-changes { background: #fff3cd; border-left: 3px solid #ffc107; padding: 2px 4px; }
    `,
    skin: 'oxide',
    content_css: 'default',
    formats: {
      track_insert: { inline: 'span', classes: 'track-changes track-insert' },
      track_delete: { inline: 'span', classes: 'track-changes track-delete' },
    },
    setup: editor => {
      // Add custom track changes functionality
      editor.ui.registry.addButton('trackchanges', {
        text: 'Track Changes',
        icon: 'edit-block',
        onAction: () => {
          editor.execCommand('mceToggleFormat', false, 'track_insert');
        },
      });

      // Add AI assistance button
      editor.ui.registry.addButton('aiassist', {
        text: 'AI Assist',
        icon: 'help',
        onAction: () => handleAIAssist(),
      });

      // Add version control button
      editor.ui.registry.addButton('saveversion', {
        text: 'Save Version',
        icon: 'save',
        onAction: () => createVersion(),
      });
    },
  };

  const handleSave = () => {
    const currentContent = userWorkingContentRef.current || content;
    const now = new Date().toISOString();

    console.log('💾 SAVE DEBUG:', {
      workingRefLength: userWorkingContentRef.current?.length || 0,
      contentStateLength: content.length,
      textareaLength: textAreaRef.current?.value.length || 0,
      workingRefHasFormatting:
        userWorkingContentRef.current?.includes('**') ||
        userWorkingContentRef.current?.includes('*') ||
        false,
      contentStateHasFormatting: content.includes('**') || content.includes('*'),
      textareaHasFormatting:
        textAreaRef.current?.value.includes('**') ||
        textAreaRef.current?.value.includes('*') ||
        false,
      savingContent: currentContent.substring(0, 100),
      timestamp: now,
    });

    // Update document with new timestamp if onChange is provided
    if (document && onChange) {
      const updatedDocument = {
        ...document,
        content: currentContent,
        lastEdited: now,
        lastModified: now,
        status: 'Draft',
      };

      console.log('📄 Updating document with new timestamp:', now);
      onChange(updatedDocument);
    }

    const savedVersion = {
      id: Date.now(),
      content: currentContent,
      timestamp: new Date(),
      author: 'You',
      changes: 'Document saved',
    };

    // Add new saved version and update current to show no changes
    const updatedVersions = [
      {
        ...versions.find(v => v.isCurrent),
        changes: 'Current working version - no changes',
      },
      savedVersion,
      ...versions.filter(v => !v.isCurrent),
    ];

    setVersions(updatedVersions);

    // Save to localStorage immediately
    localStorage.setItem(
      `document-versions-${document?.id || 'default'}`,
      JSON.stringify(updatedVersions)
    );

    setOriginalContent(currentContent); // Update reference point

    // Call external onSave with updated document including timestamp
    if (onSave) {
      onSave({
        ...document,
        content: currentContent,
        lastEdited: now,
        lastModified: now,
      });
    }

    console.log('✓ Document saved with all formatting preserved and timestamp updated');
    console.log('Saved content preview:', currentContent.substring(0, 200));
  };

  const handleBackToCoAuthor = () => {
    // Ensure current content is saved to document before going back
    const now = new Date().toISOString();
    if (document && content && onChange) {
      const updatedDocument = {
        ...document,
        content,
        lastEdited: now,
        lastModified: now,
        status: 'Draft',
      };
      onChange(updatedDocument);
      console.log('✓ Document content saved with timestamp before navigation:', now);
    }

    if (onBack) {
      onBack();
    } else {
      window.location.href = '/cmc-blueprint';
    }
  };

  const handleDownload = () => {
    // Use setTimeout to ensure we're in browser context
    setTimeout(() => {
      try {
        const currentContent = userWorkingContentRef.current || content;
        const documentTitle = document?.title || 'Regulatory Document';
        const fileName = `${documentTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`;

        // Convert markdown-style formatting to HTML for Word compatibility
        const convertToWordHTML = text => {
          return (
            text
              // Convert headings
              .replace(/^# (.*$)/gm, '<h1>$1</h1>')
              .replace(/^## (.*$)/gm, '<h2>$1</h2>')
              .replace(/^### (.*$)/gm, '<h3>$1</h3>')
              // Convert bold
              .replace(/\*\*(.*?)\*\* /g, '<strong>$1</strong>')
              // Convert italic
              .replace(/\*(.*?)\* /g, '<em>$1</em>')
              // Convert underline
              .replace(/<u>(.*?)<\/u>/g, '<u>$1</u>')
              // Convert bullet points
              .replace(/^• (.*$)/gm, '<li>$1</li>')
              // Convert numbered lists
              .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
              // Convert line breaks
              .replace(/\n/g, '<br>')
              // Wrap list items in proper ul tags
              .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
              // Clean up multiple ul tags
              .replace(/<\/ul>\s*<ul>/g, '')
          );
        };

        const formattedHTML = convertToWordHTML(currentContent);

        // Create proper Word-compatible RTF document
        const rtfDocument = `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}
\\f0\\fs24 
${currentContent
  .replace(/\n/g, '\\par ')
  .replace(/\*\*(.*?)\*\* /g, '{\\b $1}')
  .replace(/\*(.*?)\* /g, '{\\i $1}')
  .replace(/<u>(.*?)<\/u>/g, '{\\ul $1}')
  .replace(/^# (.*)/gm, '{\\fs32\\b $1}\\par')
  .replace(/^## (.*)/gm, '{\\fs28\\b $1}\\par')
  .replace(/^### (.*)/gm, '{\\fs24\\b $1}\\par')
  .replace(/^• (.*)/gm, '{\\pntext\\f1\\bullet\\tab}$1\\par')}
}`;

        // Create blob with RTF MIME type (opens in Word)
        const blob = new Blob([rtfDocument], {
          type: 'application/rtf',
        });

        // Update filename to .rtf
        const rtfFileName = fileName.replace('.docx', '.rtf');

        // Create download link
        const a = window.document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = rtfFileName;
        a.style.display = 'none';

        // Trigger download
        window.document.body.appendChild(a);
        a.click();
        window.document.body.removeChild(a);

        // Clean up
        window.URL.revokeObjectURL(a.href);

        console.log(`✓ Document downloaded as ${rtfFileName} with formatting preserved`);
      } catch (error) {
        console.error('Download failed:', error);
        // Fallback to HTML download
        try {
          const currentContent = userWorkingContentRef.current || content;
          const documentTitle = document?.title || 'Regulatory Document';
          const fileName = `${documentTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;

          const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
              <title>${documentTitle}</title>
              <style>
                body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; margin: 1in; }
                h1, h2, h3 { font-weight: bold; }
              </style>
            </head>
            <body>
              ${currentContent.replace(/\n/g, '<br>')}
            </body>
            </html>
          `;

          const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
          const a = window.document.createElement('a');
          a.href = window.URL.createObjectURL(blob);
          a.download = fileName;
          a.style.display = 'none';

          window.document.body.appendChild(a);
          a.click();
          window.document.body.removeChild(a);
          window.URL.revokeObjectURL(a.href);

          alert(
            'Downloaded as HTML file (Word format not supported). You can open this in Word or any browser.'
          );
        } catch (fallbackError) {
          alert('Download failed. Please manually select and copy the text from the editor.');
        }
      }
    }, 0);
  };

  // Intelligent Document Context Hints Generation
  const generateContextHints = documentContent => {
    const hints = [];
    const content = documentContent.toLowerCase();

    // Structure hints
    if (hintCategories.structure) {
      if (!content.includes('executive summary') && !content.includes('overview')) {
        hints.push({
          id: 'missing-summary',
          category: 'structure',
          priority: 'high',
          icon: 'FileText',
          title: 'Missing Executive Summary',
          description:
            'Consider adding an executive summary at the beginning of your document for better regulatory compliance.',
          action: 'Add Executive Summary',
          position: 'beginning',
        });
      }

      if (!content.includes('methodology') && !content.includes('method')) {
        hints.push({
          id: 'missing-methodology',
          category: 'structure',
          priority: 'medium',
          icon: 'Target',
          title: 'Methodology Section Recommended',
          description: 'Regulatory documents typically require a detailed methodology section.',
          action: 'Add Methodology',
          position: 'middle',
        });
      }

      if (!content.includes('conclusion') && !content.includes('summary')) {
        hints.push({
          id: 'missing-conclusion',
          category: 'structure',
          priority: 'medium',
          icon: 'CheckCircle',
          title: 'Conclusion Section Missing',
          description: 'End your document with clear conclusions or summary of findings.',
          action: 'Add Conclusion',
          position: 'end',
        });
      }
    }

    // Compliance hints
    if (hintCategories.compliance) {
      if (!content.includes('fda') && !content.includes('ich') && !content.includes('gmp')) {
        hints.push({
          id: 'regulatory-references',
          category: 'compliance',
          priority: 'high',
          icon: 'AlertCircle',
          title: 'Regulatory References Needed',
          description:
            'Include references to relevant regulatory guidelines (FDA, ICH, GMP) to strengthen compliance.',
          action: 'Add Regulatory References',
          position: 'throughout',
        });
      }

      if (!content.includes('risk') && !content.includes('safety')) {
        hints.push({
          id: 'risk-assessment',
          category: 'compliance',
          priority: 'medium',
          icon: 'AlertCircle',
          title: 'Risk Assessment Recommended',
          description: 'Consider including risk assessment and safety considerations.',
          action: 'Add Risk Assessment',
          position: 'middle',
        });
      }
    }

    // Content hints
    if (hintCategories.content) {
      const wordCount = documentContent.split(' ').length;
      if (wordCount < 200) {
        hints.push({
          id: 'content-length',
          category: 'content',
          priority: 'low',
          icon: 'BookOpen',
          title: 'Document Length',
          description: `Current word count: ${wordCount}. Regulatory documents typically require more detailed content.`,
          action: 'Expand Content',
          position: 'throughout',
        });
      }

      if (!content.includes('table') && !content.includes('figure') && !content.includes('chart')) {
        hints.push({
          id: 'visual-elements',
          category: 'content',
          priority: 'low',
          icon: 'TrendingUp',
          title: 'Visual Elements',
          description: 'Consider adding tables, figures, or charts to support your content.',
          action: 'Add Visual Elements',
          position: 'throughout',
        });
      }
    }

    // Style hints
    if (hintCategories.style) {
      const sections = (content.match(/#{1,6}/g) || []).length;
      if (sections < 3) {
        hints.push({
          id: 'document-structure',
          category: 'style',
          priority: 'low',
          icon: 'FileText',
          title: 'Document Structure',
          description: 'Use more headings to improve document organization and readability.',
          action: 'Add Section Headings',
          position: 'throughout',
        });
      }
    }

    setContextHints(hints);
    console.log('✓ Generated context hints:', hints.length);
  };

  const applyContextHint = hint => {
    let insertText = '';

    switch (hint.id) {
      case 'missing-summary':
        insertText = `# Executive Summary\n\nProvide a brief overview of the document's purpose, key findings, and regulatory implications.\n\n`;
        break;
      case 'missing-methodology':
        insertText = `\n## Methodology\n\n### Study Design\nDescribe the study design and approach.\n\n### Procedures\nDetail the procedures and protocols followed.\n\n### Analysis Methods\nExplain the analytical methods used.\n\n`;
        break;
      case 'missing-conclusion':
        insertText = `\n## Conclusions\n\n### Key Findings\n- Summary of main results\n- Regulatory implications\n- Recommendations for next steps\n\n### Overall Assessment\nProvide an overall assessment of the findings in regulatory context.\n\n`;
        break;
      case 'regulatory-references':
        insertText = `\n## Regulatory References\n\n- FDA Guidance for Industry\n- ICH Guidelines (specify relevant guidelines)\n- GMP Requirements\n- 21 CFR Part [relevant section]\n\n`;
        break;
      case 'risk-assessment':
        insertText = `\n## Risk Assessment\n\n### Identified Risks\n- Risk 1: Description and mitigation\n- Risk 2: Description and mitigation\n\n### Safety Considerations\nDescribe safety monitoring and risk management strategies.\n\n`;
        break;
      default:
        insertText = `\n<!-- ${hint.title} -->\n[Add ${hint.title.toLowerCase()} content here]\n\n`;
    }

    if (hint.position === 'beginning') {
      setContent(insertText + content);
    } else if (hint.position === 'end') {
      setContent(content + insertText);
    } else {
      // Insert in middle or throughout
      const midPoint = Math.floor(content.length / 2);
      const newContent = content.slice(0, midPoint) + insertText + content.slice(midPoint);
      setContent(newContent);
    }

    // Mark hint as applied by filtering it out
    setContextHints(prev => prev.filter(h => h.id !== hint.id));
    console.log('✓ Applied context hint:', hint.title);
  };

  const restoreVersion = version => {
    try {
      console.log('🔄 Restoring version:', {
        id: version.id,
        isCurrent: version.isCurrent,
        contentLength: version.content?.length,
        changes: version.changes,
      });

      // Set restoration flag to prevent content handler from firing
      isRestoringVersion.current = true;

      // Update visual selection indicator
      setSelectedVersionId(version.isCurrent ? 'current' : version.id);

      let versionContent;

      if (version.isCurrent) {
        // For current version, always use the ref content (preserved working content)
        versionContent = userWorkingContentRef.current || content;
        console.log('📝 Restoring current working content:', {
          refLength: userWorkingContentRef.current?.length || 0,
          stateLength: content.length,
          usingRef: !!userWorkingContentRef.current,
          preview: (userWorkingContentRef.current || content).substring(0, 50) + '...',
        });
      } else {
        // For historical versions, use their stored content
        versionContent =
          version.content ||
          `# Restored Version ${version.id}

This is version ${version.id} content restored at ${new Date().toLocaleString()}.

Changes: ${version.changes}
Author: ${version.author}
Original timestamp: ${version.timestamp}

This version has been successfully restored to the editor.`;
        console.log('📝 Loading historical version content');
      }

      console.log('📄 Version content prepared:', {
        versionId: version.id,
        isCurrent: version.isCurrent,
        contentLength: versionContent.length,
        preview: versionContent.substring(0, 100) + '...',
        versionHasContent: !!version.content,
        versionContentLength: version.content?.length || 0,
        currentStateContentLength: content.length,
      });

      // Update content state - this will make the textarea display the selected version
      setContent(versionContent);

      // Force React to re-render textarea with new key and content
      setForceUpdate(prev => prev + 1);

      // Clear restoration flag after content is set
      setTimeout(() => {
        isRestoringVersion.current = false;
        console.log('🔓 Version restoration complete - content changes re-enabled');
      }, 100);

      // No special handling needed

      // Only update document object if we're restoring the current version
      if (version.isCurrent && document && onChange) {
        const updatedDocument = {
          ...document,
          content: versionContent,
          lastEdited: new Date().toISOString(),
          status: 'Draft',
        };
        onChange(updatedDocument);
        console.log('📄 Document object updated with current content:', {
          contentLength: versionContent.length,
          hasFormatting:
            versionContent.includes('**') ||
            versionContent.includes('*') ||
            versionContent.includes('<'),
        });
      }

      // If viewing historical version, don't update the current version's stored content
      // The current version should maintain its own content until user makes changes
      if (!version.isCurrent) {
        console.log('📖 Viewing historical version - current version content preserved');
      }

      // Focus the textarea after React re-renders
      setTimeout(() => {
        if (textAreaRef.current) {
          textAreaRef.current.focus();
          textAreaRef.current.setSelectionRange(0, 0);
          console.log('✅ Textarea focused with version content:', {
            versionId: version.id,
            isCurrent: version.isCurrent,
            actualContentLength: textAreaRef.current.value.length,
            expectedContentLength: versionContent.length,
            contentMatches: textAreaRef.current.value.length === versionContent.length,
            actualPreview: textAreaRef.current.value.substring(0, 50) + '...',
          });
        }
      }, 100);

      // Generate context hints for the displayed version
      generateContextHints(versionContent);

      console.log(`✅ Version ${version.id} restoration complete`);
    } catch (error) {
      console.error('❌ Version restore failed:', error);
    }
  };

  // Functional text formatting using textarea cursor insertion
  const applyFormat = format => {
    try {
      const textArea = textAreaRef.current;
      if (!textArea) return;

      const start = textArea.selectionStart;
      const end = textArea.selectionEnd;
      const selectedText = textArea.value.substring(start, end);

      let formattedText = '';
      const timestamp = new Date().toLocaleTimeString();

      switch (format) {
        case 'bold':
          formattedText = selectedText ? `**${selectedText}**` : `**Bold Text (${timestamp})**`;
          break;
        case 'italic':
          formattedText = selectedText ? `*${selectedText}*` : `*Italic Text (${timestamp})*`;
          break;
        case 'underline':
          formattedText = selectedText
            ? `<u>${selectedText}</u>`
            : `<u>Underlined Text (${timestamp})</u>`;
          break;
        default:
          return;
      }

      // Insert the formatted text at cursor position
      const newContent = content.substring(0, start) + formattedText + content.substring(end);

      console.log('🎨 About to call handleContentChange for formatting:', format);
      console.log('🎨 New content with formatting:', newContent.substring(0, 150));

      // Use handleContentChange to properly update all references and versions
      handleContentChange(newContent);

      // Move cursor to end of inserted text
      setTimeout(() => {
        const newCursorPos = start + formattedText.length;
        textArea.setSelectionRange(newCursorPos, newCursorPos);
        textArea.focus();
      }, 0);

      console.log(
        `✓ ${format.toUpperCase()} formatting applied - new content length:`,
        newContent.length
      );
      console.log('Working ref content after format:', userWorkingContentRef.current.length);
    } catch (error) {
      console.error('Format application failed:', error);
    }
  };

  const applyAlignment = alignment => {
    try {
      // Apply alignment via CSS style to content wrapper
      const alignmentStyle = `text-align: ${alignment};`;
      const wrappedContent = `<div style="${alignmentStyle}">${content}</div>`;

      // Use handleContentChange to properly update all references and versions
      handleContentChange(wrappedContent);

      console.log('Alignment applied:', alignment);
    } catch (error) {
      console.error('Alignment application failed:', error);
    }
  };

  const insertList = listType => {
    try {
      const textArea = textAreaRef.current;
      if (!textArea) return;

      const start = textArea.selectionStart;
      const end = textArea.selectionEnd;

      const listText =
        listType === 'ul'
          ? '\n• New bullet point\n• Another bullet point\n'
          : '\n1. First numbered item\n2. Second numbered item\n';

      const newContent = content.substring(0, start) + listText + content.substring(end);

      // Use handleContentChange to properly update all references and versions
      handleContentChange(newContent);

      // Move cursor to end of inserted text
      setTimeout(() => {
        const newCursorPos = start + listText.length;
        textArea.setSelectionRange(newCursorPos, newCursorPos);
        textArea.focus();
      }, 0);

      console.log(`✓ ${listType.toUpperCase()} list inserted successfully`);
    } catch (error) {
      console.error('List insertion failed:', error);
    }
  };

  const renderPreviewContent = () => {
    const text = trackChanges && changes.length > 0 ? applyTrackChangesMarkup(content) : content;
    
    // Split by chart placeholders: [Chart: Title]
    const parts = String(text).split(/(\[Chart: .*?\])/g);
    
    return parts.map((part, index) => {
      if (part.match(/^\[Chart: (.*?)\]$/)) {
        const title = part.match(/^\[Chart: (.*?)\]$/)[1];
        // Generate deterministic mock data based on title length
        const data = [
          { name: 'Group A', value: 400 + title.length * 10 },
          { name: 'Group B', value: 300 + title.length * 5 },
          { name: 'Group C', value: 300 + title.length * 8 },
          { name: 'Group D', value: 200 + title.length * 2 },
        ];
        
        return (
          <div key={index} className="my-8 p-6 bg-white rounded-xl border border-slate-100 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700 mb-4 text-center uppercase tracking-wide">{title}</h4>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <Tooltip 
                    cursor={{fill: '#f1f5f9'}}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      }
      
      // Regular text rendering
      return (
        <div
          key={index}
          className="prose prose-slate max-w-none prose-headings:font-serif prose-headings:font-semibold prose-p:text-slate-600 prose-a:text-blue-600"
          dangerouslySetInnerHTML={{
            __html: part
              .replace(/\*\*(.*?)\*\* /g, '<strong>$1</strong>')
              .replace(/\*(.*?)\* /g, '<em>$1</em>')
              .replace(/^## (.*$)/gm, '<h2>$1</h2>')
              .replace(/^### (.*$)/gm, '<h3>$1</h3>')
              .replace(/^# (.*$)/gm, '<h1>$1</h1>')
              .replace(/\[Ref-(.*?)\]/g, '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 cursor-pointer hover:bg-blue-100 transition-colors"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>Ref-$1</span>')
              .replace(/\n/g, '<br>'),
          }}
        />
      );
    });
  };

  return (
    // START: IND BUILDER ENHANCEMENT - PHASE 1 - OPTIMIZED EDITOR LAYOUT (DO NOT REMOVE OR MODIFY THIS LINE)
    <div
      className="flex flex-col h-screen bg-gray-50 overflow-hidden"
    >
      {/* Enhanced Header with Compliance Metrics * /}
      <div
        className="bg-white border-b border-slate-100 shadow-sm z-10"
      >
        <div className="px-6 py-3">
          <div className="flex justify-between items-center">
            {/* Left Header Section - Navigation & Title * /}
            <div className="flex items-center space-x-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToCoAuthor}
                className="text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div className="border-l border-slate-200 pl-6">
                <h1 className="text-lg font-semibold text-slate-900 tracking-tight">
                  Professional IND Document Editor
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <p className="text-xs text-slate-500 font-medium">
                    AI-Powered Regulatory Authoring
                  </p>
                </div>
              </div>
            </div>

            {/* Right Header Section - Controls, Compliance Metrics & Actions * /}
            <div className="flex items-center space-x-3">
              <div className="flex items-center bg-slate-50 rounded-lg p-1 border border-slate-100 mr-4">
                 <Badge variant="secondary" className="bg-white shadow-sm text-slate-700 border border-slate-100">
                    FDA {complianceMetrics?.fda || '98'}%
                 </Badge>
                 <div className="w-px h-4 bg-slate-200 mx-2"></div>
                 <Badge variant="secondary" className="bg-transparent text-slate-500 hover:bg-white hover:shadow-sm transition-all">
                    ICH {complianceMetrics?.ich || '95'}%
                 </Badge>
              </div>

              <Button
                onClick={() => setIndBuilderMode(!indBuilderMode)}
                variant="ghost"
                size="sm"
                className={indBuilderMode ? 'text-green-600 bg-green-50' : 'text-slate-600'}
              >
                <Target className="h-4 w-4 mr-2" />
                IND Builder
              </Button>

              <div className="flex items-center space-x-2 border-l border-slate-200 pl-4">
                <Button
                  onClick={handleSave}
                  size="sm"
                  className="bg-slate-900 hover:bg-slate-800 text-white shadow-sm"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  size="sm"
                  className="border-slate-200 hover:bg-slate-50 text-slate-700"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button 
                  onClick={handleAIAssist} 
                  disabled={isAnalyzing} 
                  size="sm"
                  className="bg-gradient-to-r from-purple-600 to-blue-600 text-white border-0 shadow-sm hover:shadow-md transition-all"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {isAnalyzing ? 'Thinking...' : 'AI Co-Pilot'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Document Controls * /}
      <div className="bg-white border-b border-slate-100 px-6 py-2 shadow-sm z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={createVersion}
                className="flex items-center space-x-2 text-slate-600 hover:bg-slate-50"
              >
                <GitBranch className="h-4 w-4" />
                <span>Save Version</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowContextPanel(!showContextPanel)}
                className={`flex items-center space-x-2 ${showContextPanel ? 'bg-yellow-50 text-yellow-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Lightbulb className="h-4 w-4" />
                <span>Hints ({contextHints.length})</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSmartRefs(!showSmartRefs)}
                className={`flex items-center space-x-2 ${showSmartRefs ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Link className="h-4 w-4" />
                <span>Smart Refs</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDataPanel(!showDataPanel)}
                className={`flex items-center space-x-2 ${showDataPanel ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Database className="h-4 w-4" />
                <span>Data</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAssetsPanel(!showAssetsPanel)}
                className={`flex items-center space-x-2 ${showAssetsPanel ? 'bg-pink-50 text-pink-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Image className="h-4 w-4" />
                <span>Assets</span>
              </Button>
            </div>

            <div className="h-4 w-px bg-slate-200"></div>

            <div className="flex items-center space-x-1 text-sm text-slate-500">
              <History className="h-3 w-3" />
              <span>{versions.length} versions</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTrackChanges(!trackChanges)}
              className={`flex items-center space-x-1 ${trackChanges ? 'bg-green-50 text-green-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <CheckCircle className="h-3 w-3" />
              <span>Track Changes: {trackChanges ? 'ON' : 'OFF'}</span>
              {trackChanges && changes.length > 0 && (
                <Badge variant="secondary" className="ml-1 bg-green-100 text-green-700 border-0">
                  {changes.length}
                </Badge>
              )}
            </Button>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100">
              <Users className="h-3 w-3 mr-1" />
              Collaborative
            </Badge>
          </div>
        </div>
      </div>

      {/* Professional Editor Area * /}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Formatting Toolbar * /}
          <div className="bg-white border-b border-slate-100 px-4 py-2 flex items-center justify-between shadow-sm z-10">
             <div className="flex items-center gap-1">
                <div className="flex items-center bg-slate-50 rounded-md p-1 border border-slate-100">
                  <button onClick={() => applyFormat('bold')} className="p-1.5 hover:bg-white hover:shadow-sm rounded text-slate-600 transition-all" title="Bold"><Bold className="h-4 w-4" /></button>
                  <button onClick={() => applyFormat('italic')} className="p-1.5 hover:bg-white hover:shadow-sm rounded text-slate-600 transition-all" title="Italic"><Italic className="h-4 w-4" /></button>
                  <button onClick={() => applyFormat('underline')} className="p-1.5 hover:bg-white hover:shadow-sm rounded text-slate-600 transition-all" title="Underline"><Type className="h-4 w-4" /></button>
                </div>
                
                <div className="w-px h-6 bg-slate-200 mx-2"></div>
                
                <div className="flex items-center bg-slate-50 rounded-md p-1 border border-slate-100">
                  <button onClick={() => insertList('ul')} className="p-1.5 hover:bg-white hover:shadow-sm rounded text-slate-600 transition-all" title="Bullet List"><List className="h-4 w-4" /></button>
                  <button onClick={() => insertList('ol')} className="p-1.5 hover:bg-white hover:shadow-sm rounded text-slate-600 transition-all" title="Numbered List"><ListOrdered className="h-4 w-4" /></button>
                </div>

                <div className="w-px h-6 bg-slate-200 mx-2"></div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 gap-1 text-slate-600 hover:bg-slate-50">
                      <Plus className="h-4 w-4" /> Insert
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onClick={() => handleContentChange(content + '\n\n| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n')}>
                      <Table className="h-4 w-4 mr-2 text-slate-500" /> Table
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleContentChange(content + '\n\n[Chart: Clinical Data Summary]\n')}>
                      <BarChart3 className="h-4 w-4 mr-2 text-blue-500" /> Chart
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleContentChange(content + ' [Ref-1] ')}>
                      <Link className="h-4 w-4 mr-2 text-slate-500" /> Reference
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
             </div>

             <div className="flex items-center gap-2">
                <div className="flex bg-slate-100 rounded-lg p-1">
                   <button 
                      onClick={() => setViewMode('edit')}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'edit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                   >
                      Editor
                   </button>
                   <button 
                      onClick={() => setViewMode('split')}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'split' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                   >
                      Split
                   </button>
                   <button 
                      onClick={() => setViewMode('preview')}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                   >
                      Preview
                   </button>
                </div>
             </div>
          </div>

          {/* Main Content Area * /}
          <div className="flex-1 overflow-hidden bg-gray-50 p-6">
            <div className="flex h-full gap-6 max-w-[1600px] mx-auto">
              {/* Editor Pane * /}
              {(viewMode === 'edit' || viewMode === 'split') && (
                <div className={`flex flex-col h-full ${viewMode === 'split' ? 'w-1/2' : 'w-full max-w-4xl mx-auto'}`}>
                  {viewMode === 'split' && <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 pl-1">Markdown Source</div>}
                  <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <textarea
                      key={`textarea-${forceUpdate}`}
                      ref={textAreaRef}
                      onScroll={() => handleScroll('editor')}
                      onDragOver={(e) => {
                        handleEditorDragOver(e);
                        e.preventDefault(); // Allow clinical data drops
                      }}
                      onDrop={(e) => {
                        handleEditorDrop(e);
                        handleClinicalDataDrop(e); // Handle SmartTag drops
                      }}
                      value={content}
                      onChange={e => handleContentChange(e.target.value)}
                      className="w-full h-full border-0 resize-none focus:outline-none p-8 font-mono text-sm leading-relaxed text-slate-800"
                      placeholder="Start typing your regulatory document..."
                      spellCheck="false"
                    />
                  </div>
                </div>
              )}

              {/* Preview Pane * /}
              {(viewMode === 'preview' || viewMode === 'split') && (
                <div className={`flex flex-col h-full ${viewMode === 'split' ? 'w-1/2' : 'w-full max-w-4xl mx-auto'}`}>
                  {viewMode === 'split' && <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 pl-1">Live Preview</div>}
                  <div 
                    ref={previewRef}
                    onScroll={() => handleScroll('preview')}
                    className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-y-auto p-12"
                  >
                    {renderPreviewContent()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>


          {/* Context Hints & Version History Sidebar * /}
          <div className="w-80 border-l border-slate-200 bg-slate-50 p-4 flex flex-col">
            {showAIPanel ? (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-900 flex items-center">
                    <Bot className="h-5 w-5 mr-2 text-purple-600" />
                    AI Co-Pilot
                  </h3>
                  <Button size="sm" variant="ghost" onClick={() => setShowAIPanel(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* AI Modes * /}
                <div className="flex space-x-1 mb-4 bg-slate-200 p-1 rounded-lg">
                  <button
                    onClick={() => setAiMode('chat')}
                    className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
                      aiMode === 'chat' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => runComplianceCheck()}
                    className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
                      aiMode === 'compliance' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Compliance
                  </button>
                </div>

                {/* AI Content Area * /}
                <div className="flex-1 overflow-y-auto mb-4 space-y-3">
                  {aiMode === 'chat' && (
                    <div className="space-y-3">
                      {aiMessages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] p-3 rounded-lg text-sm ${
                            msg.role === 'user' 
                              ? 'bg-blue-600 text-white rounded-br-none' 
                              : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
                          }`}>
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                            {msg.role === 'assistant' && (
                                <div className="mt-2 flex justify-end">
                                    <Button 
                                        size="sm" 
                                        variant="ghost" 
                                        className="h-6 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                        onClick={() => insertAtCursor(msg.content)}
                                    >
                                        <Plus className="h-3 w-3 mr-1" /> Insert
                                    </Button>
                                </div>
                            )}
                            {msg.facts && msg.facts.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center">
                                        <Database className="h-3 w-3 mr-1" /> Data Lineage (Source Verified)
                                    </p>
                                    <div className="space-y-1">
                                        {msg.facts.map((fact, i) => (
                                            <div key={i} className="text-xs bg-slate-50 p-1.5 rounded border border-slate-100 flex justify-between">
                                                <span className="font-medium text-slate-700">{fact.key}</span>
                                                <span className="text-slate-500 ml-2" title={`Source: ${fact.source}`}>
                                                    {fact.value}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {isAiProcessing && (
                        <div className="flex justify-start">
                          <div className="bg-white border border-slate-200 p-3 rounded-lg rounded-bl-none shadow-sm">
                            <div className="flex space-x-1">
                              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {aiMode === 'compliance' && (
                    <div className="space-y-3">
                      {isAiProcessing ? (
                        <div className="text-center py-8">
                          <ShieldCheck className="h-8 w-8 text-purple-500 mx-auto mb-2 animate-pulse" />
                          <p className="text-sm text-slate-600">Scanning document against FDA guidelines...</p>
                        </div>
                      ) : complianceIssues.length === 0 ? (
                        <div className="text-center py-8">
                          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                          <p className="font-medium text-slate-900">No Issues Found</p>
                          <p className="text-xs text-slate-500 mt-1">Content appears to align with basic formatting rules.</p>
                        </div>
                      ) : (
                        complianceIssues.map(issue => (
                          <div key={issue.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                            <div className="flex items-start">
                              {issue.severity === 'warning' ? (
                                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 mr-2 flex-shrink-0" />
                              ) : (
                                <Lightbulb className="h-4 w-4 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
                              )}
                              <div>
                                <p className="text-sm font-medium text-slate-800">{issue.message}</p>
                                <div className="mt-2 flex space-x-2">
                                  <Button size="sm" variant="outline" className="h-6 text-xs">Fix</Button>
                                  <Button size="sm" variant="ghost" className="h-6 text-xs">Ignore</Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Chat Input * /}
                {aiMode === 'chat' && (
                  <div className="mt-auto">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Ask about this section..."
                        className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            handleSendMessage(e.currentTarget.value);
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                      <button className="absolute right-2 top-2 text-blue-600 hover:text-blue-700">
                        <MessageSquare className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : showDataPanel ? (
              <div className="flex flex-col h-full">
                {/* HIERARCHICAL DATA BROWSER * /}
                <DataRoomPanel />
                
                {/* LEGACY UPLOAD SECTION (Collapsed) * /}
                <div className="border-t border-slate-200 mt-auto">
                <div className="flex items-center justify-between p-3 bg-slate-50">
                  <h3 className="text-xs font-semibold text-slate-600 flex items-center">
                    <UploadCloud className="h-3 w-3 mr-2" />
                    Upload Additional Sources
                  </h3>
                  <Button size="sm" variant="ghost" onClick={() => setShowDataPanel(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-4">
                  <div
                    className={`rounded-2xl border-2 border-dashed p-4 transition-all cursor-pointer ${
                      isDraggingFile ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-blue-200 bg-white hover:bg-blue-50'
                    } ${isUploadingSource ? 'opacity-90' : ''}`}
                    onDragOver={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!isDraggingFile) {
                        setIsDraggingFile(true);
                      }
                    }}
                    onDragEnter={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!isDraggingFile) {
                        setIsDraggingFile(true);
                      }
                    }}
                    onDragLeave={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (isDraggingFile) {
                        setIsDraggingFile(false);
                      }
                    }}
                    onDrop={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      setIsDraggingFile(false);
                      if (isUploadingSource) {
                        return;
                      }
                      const droppedFile = event.dataTransfer?.files?.[0];
                      if (droppedFile) {
                        handleSourceFileUpload(droppedFile);
                      }
                    }}
                    onClick={() => {
                      if (!isUploadingSource) {
                        fileInputRef.current?.click();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (!isUploadingSource) {
                          fileInputRef.current?.click();
                        }
                      }
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={event => {
                          if (isUploadingSource) {
                            event.target.value = '';
                            return;
                          }
                        const file = event.target.files?.[0];
                          if (file) {
                          handleSourceFileUpload(file);
                        }
                      }}
                    />
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-slate-800">
                          Drop Source Reports (Preclinical, CMC, or Clinical)...
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          We will identify key metrics, dosing data, and safety signals.
                        </p>
                      </div>
                      <div className="text-blue-500">
                        {isUploadingSource ? (
                          <Loader2 className="h-8 w-8 animate-spin" />
                        ) : (
                          <UploadCloud className="h-8 w-8" />
                        )}
                      </div>
                    </div>
                    {isUploadingSource && (
                      <div className="mt-4">
                        <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                          <div className="h-full w-3/4 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400 animate-pulse rounded-full"></div>
                        </div>
                        <p className="text-xs text-blue-600 mt-2 font-medium">
                          Scanning for Regulatory Metrics...
                        </p>
                      </div>
                    )}
                    {uploadStatusMessage && !isUploadingSource && !uploadError && (
                      <p className="text-xs text-green-600 mt-3 font-medium">
                        {uploadStatusMessage}
                      </p>
                    )}
                  </div>

                  {uploadError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                      {uploadError}
                    </div>
                  )}

                  <div className="space-y-3">
                    {isLoadingSourceData ? (
                      <div className="flex flex-col items-center justify-center py-10 text-sm text-slate-500">
                        <Loader2 className="h-5 w-5 animate-spin text-indigo-500 mb-3" />
                        <span>Loading extracted metrics...</span>
                      </div>
                    ) : sourceDataError ? (
                      <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                        {sourceDataError}
                      </div>
                    ) : sourceDataPoints.length === 0 ? (
                      <div className="bg-slate-50 border border-slate-200 text-slate-600 text-sm px-3 py-4 rounded-lg">
                        No structured findings yet. Upload a PDF to populate this panel.
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-slate-500 uppercase tracking-wider">
                          Extracted Metrics ({sourceDataPoints.length})
                        </p>
                        <div className="grid grid-cols-1 gap-3">
                          {sourceDataPoints.map(point => (
                            <div
                              key={point.id}
                              className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-indigo-300 transition-colors cursor-pointer"
                              onClick={() => insertDataPointIntoEditor(point)}
                              draggable
                              onDragStart={event => handleDataPointDragStart(event, point)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <Badge variant="secondary" className="text-[11px] uppercase tracking-wide bg-indigo-50 text-indigo-700 border-0">
                                    {(point.label || 'Data Point').replace(/_/g, ' ')}
                                  </Badge>
                                  <p className="text-lg font-semibold text-slate-900 mt-2 break-words">
                                    {point.value || '—'}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-0"
                                  onClick={event => {
                                    event.stopPropagation();
                                    insertDataPointIntoEditor(point);
                                  }}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Click to Insert
                                </Button>
                              </div>
                              {point.content && (
                                <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                                  {point.content}
                                </p>
                              )}
                              {point.documentTitle || point.documentFileName ? (
                                <p className="text-[11px] text-slate-400 mt-2">
                                  Source: {point.documentTitle || point.documentFileName}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : showAssetsPanel ? (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-900 flex items-center">
                    <Table className="h-5 w-5 mr-2 text-pink-600" />
                    Tables, Figures & Listings
                  </h3>
                  <Button size="sm" variant="ghost" onClick={() => setShowAssetsPanel(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {isLoadingAssets ? (
                  <div className="flex flex-col items-center justify-center py-10 text-sm text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin text-pink-500 mb-3" />
                    <span>Loading TFLs from vault...</span>
                  </div>
                ) : assetLibrary.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 text-slate-600 text-sm px-3 py-4 rounded-lg">
                    No tables, figures, or listings found. Upload CSRs or statistical reports to populate this library.
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                      {assetLibrary.length} Assets Available
                    </p>
                    {assetLibrary.map(asset => (
                      <div key={asset.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-pink-300 transition-all cursor-pointer group" 
                        onClick={() => insertAsset(asset)}
                        draggable
                        onDragStart={e => {
                          e.dataTransfer.setData('text/plain', asset.content);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {asset.type === 'Table' && <Table className="h-4 w-4 text-pink-600" />}
                            {asset.type === 'Figure' && <BarChart3 className="h-4 w-4 text-purple-600" />}
                            {asset.type === 'Listing' && <FileText className="h-4 w-4 text-blue-600" />}
                            <Badge variant="outline" className="text-xs bg-slate-50">{asset.type}</Badge>
                          </div>
                          <Button 
                            size="sm" 
                            className="h-7 bg-pink-50 text-pink-600 hover:bg-pink-100 border-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              insertAsset(asset);
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Insert
                          </Button>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 group-hover:text-pink-700 mb-1">{asset.title}</p>
                        <p className="text-xs text-slate-500 line-clamp-2 mb-2">{asset.content.substring(0, 80)}...</p>
                        {asset.source && (
                          <p className="text-[11px] text-slate-400 flex items-center">
                            <FileText className="h-3 w-3 mr-1" />
                            Source: {asset.source}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
            <div className="space-y-4">
              {/* Context Hints Panel * /}
              {showContextPanel && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-900 flex items-center">
                      <Lightbulb className="h-4 w-4 mr-2 text-yellow-500" />
                      Context Hints
                    </h3>
                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => setShowContextPanel(false)}>
                        ×
                      </Button>
                    </div>
                  </div>

                  {/* Hint Categories Filter * /}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {Object.entries(hintCategories).map(([category, enabled]) => (
                      <button
                        key={category}
                        onClick={() =>
                          setHintCategories(prev => ({
                            ...prev,
                            [category]: !prev[category],
                          }))
                        }
                        className={`px-2 py-1 text-xs rounded ${
                          enabled
                            ? 'bg-blue-100 text-blue-700 border border-blue-300'
                            : 'bg-gray-100 text-gray-500 border border-gray-300'
                        }`}
                      >
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Context Hints List * /}
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {contextHints.length === 0 ? (
                      <div className="text-center py-4 text-slate-500">
                        <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                        <p className="text-sm">All suggestions implemented!</p>
                        <p className="text-xs">Your document looks well-structured.</p>
                      </div>
                    ) : (
                      contextHints.map(hint => (
                        <div
                          key={hint.id}
                          className={`p-3 rounded-lg border-l-4 ${
                            hint.priority === 'high'
                              ? 'bg-red-50 border-red-400'
                              : hint.priority === 'medium'
                                ? 'bg-yellow-50 border-yellow-400'
                                : 'bg-blue-50 border-blue-400'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center mb-1">
                                {hint.icon === 'FileText' && <FileText className="h-3 w-3 mr-1" />}
                                {hint.icon === 'Target' && <Target className="h-3 w-3 mr-1" />}
                                {hint.icon === 'CheckCircle' && (
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                )}
                                {hint.icon === 'AlertCircle' && (
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                )}
                                {hint.icon === 'BookOpen' && <BookOpen className="h-3 w-3 mr-1" />}
                                {hint.icon === 'TrendingUp' && (
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                )}
                                <h4 className="text-sm font-medium text-slate-800">{hint.title}</h4>
                                <Badge
                                  variant="outline"
                                  className={`ml-2 text-xs ${
                                    hint.priority === 'high'
                                      ? 'border-red-400 text-red-700'
                                      : hint.priority === 'medium'
                                        ? 'border-yellow-400 text-yellow-700'
                                        : 'border-blue-400 text-blue-700'
                                  }`}
                                >
                                  {hint.priority}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-600 mb-2">{hint.description}</p>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => applyContextHint(hint)}
                                className="text-xs h-6"
                              >
                                {hint.action}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Smart Refs Panel - Real Cross-References * /}
              {showSmartRefs && (
                <div className="mb-6 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                    <h3 className="font-semibold text-slate-900 flex items-center">
                      <Link className="h-5 w-5 mr-2 text-blue-500" />
                      Smart References
                    </h3>
                    <Button size="sm" variant="ghost" onClick={() => setShowSmartRefs(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {isLoadingRefs ? (
                    <div className="flex flex-col items-center justify-center py-8 text-sm text-slate-500">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-500 mb-2" />
                      <span>Finding relevant documents...</span>
                    </div>
                  ) : smartRefs.length === 0 ? (
                    <div className="bg-slate-50 border border-slate-200 text-slate-600 text-sm px-3 py-4 rounded-lg">
                      No related documents found. Upload more documents to enable smart cross-referencing.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      <p className="text-xs text-slate-500 mb-3">Found {smartRefs.length} relevant documents in your vault:</p>
                      {smartRefs.map(ref => (
                        <div key={ref.id} className="p-3 rounded-lg border-l-4 bg-gradient-to-r from-blue-50 to-white border-blue-400 hover:border-blue-600 transition-colors cursor-pointer group">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="secondary" className="text-[10px] uppercase bg-blue-100 text-blue-700 border-0">
                                  {ref.module}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] bg-slate-50">
                                  {ref.type}
                                </Badge>
                              </div>
                              <h4 className="text-sm font-medium text-slate-800 group-hover:text-blue-700">{ref.title}</h4>
                              <p className="text-xs text-slate-500 mt-1">
                                Relevance: {ref.relevance > 5 ? 'High' : ref.relevance > 2 ? 'Medium' : 'Low'}
                              </p>
                            </div>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-xs h-7 bg-white hover:bg-blue-50 border-blue-200"
                              onClick={() => {
                                const refText = `See ${ref.module}: ${ref.title}`;
                                insertAtCursor(refText);
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Insert Ref
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 flex items-center">
                  <History className="h-4 w-4 mr-2" />
                  Version History
                </h3>
                <Button size="sm" variant="outline" onClick={handleSave}>
                  <GitBranch className="h-4 w-4 mr-1" />
                  Save
                </Button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {versions.map(version => (
                  <div
                    key={version.id}
                    className={`p-3 rounded border cursor-pointer transition-colors ${
                      (version.isCurrent && selectedVersionId === 'current') ||
                      (!version.isCurrent && selectedVersionId === version.id)
                        ? 'bg-blue-50 border-blue-300 hover:border-blue-400'
                        : 'bg-white border-slate-200 hover:border-blue-300'
                    }`}
                    onClick={() => restoreVersion(version)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-900 flex items-center gap-2">
                        {version.isCurrent ? (
                          <>
                            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-semibold">
                              CURRENT
                            </span>
                            Working Version
                          </>
                        ) : (
                          `Version ${version.id}`
                        )}
                      </span>
                      <span className="text-xs text-slate-500">
                        {version.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mb-1">{version.author}</p>
                    <p className="text-xs text-slate-500">{version.changes}</p>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-200">
                <h4 className="font-medium text-slate-900 mb-2 flex items-center">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  AI Insights
                </h4>
                <div className="space-y-2">
                  <div className="p-2 bg-blue-50 rounded text-xs">
                    <p className="font-medium text-blue-900">
                      Compliance Score: {complianceMetrics.fda}%
                    </p>
                    <p className="text-blue-700">Document follows FDA guidelines</p>
                  </div>
                  <div className="p-2 bg-green-50 rounded text-xs">
                    <p className="font-medium text-green-900">Track Changes: Active</p>
                    <p className="text-green-700">All edits are being tracked</p>
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Comments Sidebar * /}
          {showComments && (
            <CommentSidebar 
              comments={comments}
              onAddComment={(c) => setComments([...comments, c])}
              onResolveComment={(id) => setComments(comments.map(c => c.id === id ? {...c, resolved: true} : c))}
            />
          )}

          {/* Track Changes Review Panel * /}
          {trackChanges && changes.length > 0 && (
            <div className="w-80 border-l border-slate-200 bg-white">
              <div className="p-4 border-b border-slate-200">
                <h3 className="font-semibold text-slate-900 flex items-center">
                  <History className="h-4 w-4 mr-2" />
                  Track Changes ({changes.length})
                </h3>
                <p className="text-xs text-slate-600 mt-1">Review and manage document revisions</p>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {changes.map((change, index) => (
                  <div key={change.id} className="p-3 border-b border-slate-100 hover:bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-700">{change.author}</span>
                      <span className="text-xs text-slate-500">
                        {change.timestamp.toLocaleTimeString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 mb-2">{change.summary}</p>

                    {/* Show detailed diff preview * /}
                    {change.diff && change.diff.length > 0 && (
                      <div className="text-xs mb-2 p-2 bg-slate-50 rounded border">
                        {change.diff.map((d, i) => (
                          <span key={i}>
                            {d.type === 'addition' && (
                              <span className="bg-green-100 text-green-800 px-1 rounded">
                                +{d.text}
                              </span>
                            )}
                            {d.type === 'deletion' && (
                              <span className="bg-red-100 text-red-800 px-1 rounded line-through">
                                -{d.text}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center space-x-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs text-green-700 hover:bg-green-50"
                        onClick={() => {
                          // Accept change - remove from changes list
                          setChanges(prev => prev.filter(c => c.id !== change.id));
                        }}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Accept
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs text-red-700 hover:bg-red-50"
                        onClick={() => {
                          // Reject change - revert content and remove from list
                          setContent(change.oldContent);
                          userWorkingContentRef.current = change.oldContent;
                          setLastSavedContent(change.oldContent);
                          setChanges(prev => prev.filter(c => c.id !== change.id));
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {changes.length > 0 && (
                <div className="p-3 border-t border-slate-200 bg-slate-50">
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-green-700 hover:bg-green-50"
                      onClick={() => {
                        // Accept all changes
                        setChanges([]);
                      }}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Accept All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-red-700 hover:bg-red-50"
                      onClick={() => {
                        // Reject all changes - revert to original
                        setContent(originalContent);
                        userWorkingContentRef.current = originalContent;
                        setLastSavedContent(originalContent);
                        setChanges([]);
                      }}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Reject All
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

  );
}

export default EnhancedDocumentEditor;

*/
