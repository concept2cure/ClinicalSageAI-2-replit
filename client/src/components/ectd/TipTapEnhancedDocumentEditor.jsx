import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import { TextSelection } from '@tiptap/pm/state';
import {
  BadgePlus,
  Bold,
  BookOpen,
  Bot,
  CheckCircle2,
  Database,
  Download,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  RefreshCw,
  Redo2,
  Save,
  ShieldCheck,
  Sparkles,
  Undo2,
} from 'lucide-react';

import SmartTag from '@/editor/extensions/SmartTag';
import { evidenceFabric } from '@/api/evidenceFabric';
import { DataRoomPanel } from '../authoring/DataRoomPanel';
import { AIPanel } from '../authoring/AIPanel';
import { ReferencePanel } from '../authoring/ReferencePanel';
import { PublicationModal } from '../authoring/PublicationModal';
import RegulatoryCopilot from '../authoring/RegulatoryCopilot';

function sanitizeEvidenceSegment(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'unknown';
  // Evidence Fabric allows [a-zA-Z0-9_.:-]; we keep it conservative for dot-path segments.
  return s.replaceAll(/[^a-zA-Z0-9_]/g, '_').slice(0, 80) || 'unknown';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSmartTagsFromHtml(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(typeof html === 'string' ? html : '', 'text/html');
    const nodes = Array.from(doc.querySelectorAll('smart-tag'));
    return nodes.map((el) => {
      const id = el.getAttribute('data-id') || '';
      const value = el.getAttribute('data-value') || '---';
      const rawValue = el.getAttribute('data-raw-value');
      const sourceId = el.getAttribute('data-source-id');
      const dataset = el.getAttribute('data-dataset');
      const variable = el.getAttribute('data-variable');
      const dataVersion = el.getAttribute('data-version') || 'v1.0';
      const lastVerified = el.getAttribute('data-verified');
      const status = el.getAttribute('data-status') || 'draft';
      const label = el.getAttribute('data-label') || 'Data Point';

      const idSegment = sanitizeEvidenceSegment(id || `${sourceId || 'src'}_${dataset || 'ds'}_${variable || 'var'}`);

      return {
        id,
        idSegment,
        value,
        rawValue,
        sourceId,
        dataset,
        variable,
        dataVersion,
        lastVerified,
        status,
        label,
      };
    });
  } catch {
    return [];
  }
}

function ensureHtmlContent(raw) {
  if (typeof raw !== 'string') {
    return '<p></p>';
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return '<p></p>';
  }

  // Heuristic: if it looks like HTML already, pass through.
  if (trimmed.includes('<') && trimmed.includes('>')) {
    return trimmed;
  }

  const escaped = trimmed
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

  // Preserve readability for templates authored as plain text.
  // - Blank lines create new paragraphs
  // - Single newlines become <br/> within a paragraph
  const blocks = escaped
    .split(/\n\s*\n+/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.replaceAll('\n', '<br/>')}</p>`);

  return blocks.length ? blocks.join('') : '<p></p>';
}

function sanitizeSmartTagPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.type !== 'smartTag') return null;

  const getString = (value, maxLen = 200) => {
    if (value == null) return null;
    if (typeof value === 'string') return value.slice(0, maxLen);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value).slice(0, maxLen);
    return null;
  };

  const id = getString(payload.id, 80) || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `tag_${Date.now()}`);

  return {
    id,
    value: getString(payload.value, 2000) ?? '---',
    rawValue: getString(payload.rawValue, 2000),
    sourceId: getString(payload.sourceId, 120),
    dataset: getString(payload.dataset, 200),
    variable: getString(payload.variable, 120),
    dataVersion: getString(payload.dataVersion, 40) ?? 'v1.0',
    lastVerified: getString(payload.lastVerified, 80),
    status: getString(payload.status, 40) ?? 'draft',
    label: getString(payload.label, 200) ?? 'Data Point',
  };
}

export default function TipTapEnhancedDocumentEditor({
  document,
  onChange,
  onSave,
  onBack,
  backLabel = 'Back',
  BackIcon,
  zenMode,
}) {
  const [activeTab, setActiveTab] = useState('data');
  const [aiContext, setAiContext] = useState(null);
  const [focusedSourceId, setFocusedSourceId] = useState(null);
  const [focusedDataVersion, setFocusedDataVersion] = useState(null);
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [showChecklist, setShowChecklist] = useState(!Boolean(zenMode));
  const [smartTagCount, setSmartTagCount] = useState(0);
  const [editorTick, setEditorTick] = useState(0);
  const [evidenceManifest, setEvidenceManifest] = useState(() => document?.metadata?.evidenceFabric?.manifest || null);
  const [evidenceStatus, setEvidenceStatus] = useState({ stale: false, staleReason: null, changedSources: [], newBindings: [], checkedAt: null, refreshedAt: null });
  const [evidenceChecking, setEvidenceChecking] = useState(false);
  const [evidenceRefreshing, setEvidenceRefreshing] = useState(false);
  const evidenceDebounceRef = useRef(null);
  const [insertPanelOpen, setInsertPanelOpen] = useState(false);
  const [insertKind, setInsertKind] = useState('data'); // 'data' | 'citation'
  const [insertDraft, setInsertDraft] = useState({
    value: '',
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
              documentId: document?.id ?? document?.documentId ?? null,
              documentTitle: document?.title ?? null,
              ...(details || {}),
            },
          }),
        });
      } catch {
        // audit is best-effort
      }
    },
    [document]
  );

  useEffect(() => {
    if (zenMode) setShowChecklist(false);
  }, [zenMode]);

  const initialContent = useMemo(() => {
    if (typeof document?.html === 'string' && document.html.trim()) return ensureHtmlContent(document.html);
    if (typeof document?.content === 'string' && document.content.trim()) return ensureHtmlContent(document.content);

    return '<p><strong>Protocol 101 - Clinical Study Report</strong></p><p>The primary endpoint analysis demonstrates efficacy...</p>';
  }, [document]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      SmartTag,
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
      Placeholder.configure({ placeholder: 'Start typing…' }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      setEditorTick((prev) => (prev + 1) % 1000000);
      try {
        let count = 0;
        editor.state.doc.descendants((node) => {
          if (node.type?.name === 'smartTag') count += 1;
          return true;
        });
        setSmartTagCount((prev) => (prev === count ? prev : count));
      } catch {
        // ignore
      }
      onChange?.(editor.getHTML());
    },
    // STEP 4: broadcast SmartTag focus -> right rail
    onSelectionUpdate: ({ editor }) => {
      try {
        const { from, to } = editor.state.selection;
        const docSize = editor.state.doc.content.size;
        const scanFrom = Math.max(0, from - 1);
        const scanTo = Math.min(docSize, to + 1);

        let foundTag = null;
        editor.state.doc.nodesBetween(scanFrom, scanTo, (node) => {
          if (node.type?.name === 'smartTag') {
            foundTag = node;
            return false;
          }
          return true;
        });

        if (foundTag) {
          const nextSourceId = foundTag.attrs?.sourceId ?? null;
          const nextDataVersion = foundTag.attrs?.dataVersion ?? null;

          setFocusedSourceId((prev) => (prev === nextSourceId ? prev : nextSourceId));
          setFocusedDataVersion((prev) => (prev === nextDataVersion ? prev : nextDataVersion));

          if (activeTab !== 'data') setActiveTab('data');
          return;
        }

        setFocusedSourceId((prev) => (prev === null ? prev : null));
        setFocusedDataVersion((prev) => (prev === null ? prev : null));
      } catch {
        // ignore
      }
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm sm:prose-base lg:prose-lg xl:prose-xl m-5 focus:outline-none min-h-[500px] outline-none',
        'data-testid': 'enhanced-tiptap-editor',
      },
      handleDrop: (view, event) => {
        const dataString = event.dataTransfer?.getData('application/x-clinical-data');
        if (!dataString) return false;

        let parsed;
        try {
          parsed = JSON.parse(dataString);
        } catch {
          return false;
        }

        const payload = sanitizeSmartTagPayload(parsed);
        if (!payload) return false;

        const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!coordinates) return false;

        const smartTagType = view.state.schema.nodes.smartTag;
        if (!smartTagType) return false;

        const node = smartTagType.create(payload);

        const tr = view.state.tr.insert(coordinates.pos, node);
        const nextPos = coordinates.pos + node.nodeSize;
        try {
          tr.setSelection(TextSelection.near(tr.doc.resolve(nextPos)));
        } catch {
          // ignore
        }

        view.dispatch(tr);
        view.focus();

        // Best-effort audit record (non-blocking)
        queueMicrotask(() =>
          fireAuditEvent('ectd.smarttag.insert', {
            via: 'drop',
            smartTag: payload,
          })
        );

        event.preventDefault();
        event.stopPropagation?.();
        return true;
      },
    },
  });

  const applyComplianceFix = useCallback(
    (original, replacement) => {
      if (!editor) return;
      const html = editor.getHTML();
      const regex = new RegExp(escapeRegExp(original), 'gi');
      const nextHtml = html.replace(regex, replacement);
      if (nextHtml !== html) {
        editor.commands.setContent(nextHtml, true);
      }
    },
    [editor]
  );

  const copilotContext = useMemo(() => {
    const text = editor?.getText?.() || '';
    return text.slice(0, 2000);
  }, [editorTick, editor]);

  const buildEvidenceContentForFabric = useCallback(
    (html) => {
      const tags = extractSmartTagsFromHtml(html);
      if (!tags.length) return { content: '', tagMap: new Map(), rootValue: {} };

      const rootValue = {};
      const tagMap = new Map();

      for (const t of tags) {
        const seg = t.idSegment;
        // Each smart tag becomes a stable dot-path under root source 'smarttags'
        // Example: {{smarttags.tag_123.value}}
        const key = `smarttags.${seg}.value`;
        tagMap.set(seg, t);

        rootValue[seg] = {
          value: t.value,
          rawValue: t.rawValue ?? null,
          sourceId: t.sourceId ?? null,
          dataset: t.dataset ?? null,
          variable: t.variable ?? null,
          dataVersion: t.dataVersion ?? null,
          lastVerified: t.lastVerified ?? null,
          status: t.status ?? null,
          label: t.label ?? null,
        };

        // We intentionally don't include the whole document HTML here.
        // We only need deterministic tag keys for manifest computation.
      }

      const content = tags.map((t) => `{{smarttags.${t.idSegment}.value}}`).join('\n');
      return { content, tagMap, rootValue };
    },
    []
  );

  const runEvidenceCheck = useCallback(async () => {
    if (!editor) return;
    if (!evidenceManifest) return;

    const html = editor.getHTML?.() ?? initialContent;
    const { content, rootValue } = buildEvidenceContentForFabric(html);
    if (!content) return;

    try {
      setEvidenceChecking(true);
      const organizationId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
      // Best-effort publish current chip values as evidence (so initial refresh isn't permanently stale)
      await evidenceFabric.upsertSource(String(organizationId), 'smarttags', rootValue, {
        module: 'ectd-coauthor',
        documentId: document?.id ?? document?.documentId ?? null,
      });
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
  }, [buildEvidenceContentForFabric, document, editor, evidenceManifest, evidenceStatus?.refreshedAt, initialContent]);

  useEffect(() => {
    if (!editor) return;
    if (!evidenceManifest) return;
    if (smartTagCount <= 0) return;

    if (evidenceDebounceRef.current) window.clearTimeout(evidenceDebounceRef.current);
    evidenceDebounceRef.current = window.setTimeout(() => {
      runEvidenceCheck();
    }, 900);

    return () => {
      if (evidenceDebounceRef.current) window.clearTimeout(evidenceDebounceRef.current);
    };
  }, [editorTick, editor, evidenceManifest, runEvidenceCheck, smartTagCount]);

  const refreshEvidence = useCallback(async () => {
    if (!editor) return;
    const html = editor.getHTML?.() ?? initialContent;
    const { content, tagMap, rootValue } = buildEvidenceContentForFabric(html);
    if (!content) {
      alert('No SmartTags found. Insert SmartTags from the Data Room first.');
      return;
    }

    try {
      setEvidenceRefreshing(true);
      const organizationId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';

      await evidenceFabric.upsertSource(String(organizationId), 'smarttags', rootValue, {
        module: 'ectd-coauthor',
        documentId: document?.id ?? document?.documentId ?? null,
      });

      const resp = await evidenceFabric.preview(String(organizationId), content, evidenceManifest || undefined);
      if (resp?.manifest) setEvidenceManifest(resp.manifest);

      const baseline = resp?.staleReason === 'NO_PREVIOUS_MANIFEST';
      const nextStale = baseline ? false : Boolean(resp?.stale);
      const nextReason = baseline ? 'FRESH' : (resp?.staleReason || null);
      setEvidenceStatus({
        stale: nextStale,
        staleReason: nextReason,
        changedSources: Array.isArray(resp?.changedSources) ? resp.changedSources : [],
        newBindings: Array.isArray(resp?.newBindings) ? resp.newBindings : [],
        checkedAt: new Date().toISOString(),
        refreshedAt: new Date().toISOString(),
      });

      // If evidence resolved to new values, update chip display values (no structural change)
      try {
        const resolved = Array.isArray(resp?.resolved) ? resp.resolved : [];
        const resolvedBySeg = new Map();
        for (const r of resolved) {
          if (!r?.ok || typeof r?.tagKey !== 'string') continue;
          // tagKey is like smarttags.<seg>.value
          const parts = r.tagKey.split('.');
          if (parts.length >= 3) {
            const seg = parts[1];
            resolvedBySeg.set(seg, r.value);
          }
        }

        if (resolvedBySeg.size > 0 && editor?.state?.doc) {
          const tr = editor.state.tr;
          editor.state.doc.descendants((node, pos) => {
            if (node.type?.name !== 'smartTag') return true;
            const attrs = node.attrs || {};
            const seg = sanitizeEvidenceSegment(attrs.id || `${attrs.sourceId || 'src'}_${attrs.dataset || 'ds'}_${attrs.variable || 'var'}`);
            if (!resolvedBySeg.has(seg)) return true;
            const nextValue = resolvedBySeg.get(seg);
            const nextString = typeof nextValue === 'string' ? nextValue : (nextValue == null ? '' : String(nextValue));
            if (typeof nextString === 'string' && nextString !== attrs.value) {
              tr.setNodeMarkup(pos, undefined, { ...attrs, value: nextString });
            }
            return true;
          });
          if (tr.steps.length > 0) editor.view.dispatch(tr);
        }

        // Persist manifest/status immediately
        onSave?.({
          ...(document ?? {}),
          content: editor.getHTML?.() ?? html,
          html: editor.getHTML?.() ?? html,
          lastEdited: new Date().toISOString(),
          metadata: {
            ...(document?.metadata || {}),
            evidenceFabric: {
              ...(document?.metadata?.evidenceFabric || {}),
              manifest: resp?.manifest || evidenceManifest || null,
              stale: nextStale,
              staleReason: nextReason,
              changedSources: Array.isArray(resp?.changedSources) ? resp.changedSources : [],
              newBindings: Array.isArray(resp?.newBindings) ? resp.newBindings : [],
              checkedAt: new Date().toISOString(),
              refreshedAt: new Date().toISOString(),
            },
          },
        });
      } catch {
        // ignore editor update/persist issues
      }
    } catch (e) {
      alert(e?.message || 'Evidence refresh failed');
    } finally {
      setEvidenceRefreshing(false);
    }
  }, [buildEvidenceContentForFabric, document, editor, evidenceManifest, initialContent, onSave]);

  const toolbarButtonClass = useCallback((active) => {
    return `inline-flex items-center gap-1 px-2 py-1 text-xs rounded border ${
      active
        ? 'border-blue-300 bg-blue-50 text-blue-700'
        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
    }`;
  }, []);

  const words = editor?.storage?.characterCount?.words?.() ?? 0;
  const characters = editor?.storage?.characterCount?.characters?.() ?? 0;
  const stickyClass = zenMode ? 'sticky top-0 z-30' : '';

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(initialContent, false);
  }, [editor, initialContent]);

  const handleSave = useCallback(() => {
    const html = editor?.getHTML?.() ?? initialContent;
    fireAuditEvent('ectd.document.save', {
      contentFormat: 'html',
      contentLength: typeof html === 'string' ? html.length : null,
    });
    onSave?.({
      ...(document ?? {}),
      content: html,
      html,
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
  }, [document, editor, evidenceManifest, evidenceStatus, fireAuditEvent, initialContent, onSave]);

  const handleInsertSampleSmartTag = useCallback(() => {
    if (!editor?.commands?.insertSmartTag) return;
    fireAuditEvent('ectd.smarttag.insert', {
      via: 'sample',
      smartTag: {
        value: '0.45',
        dataset: 'ADSL',
        variable: 'HR_PFS',
        sourceId: 'TLF-14.2.1',
        dataVersion: 'v1.0',
        status: 'draft',
        label: 'Hazard Ratio (PFS)',
      },
    });
    editor.commands.insertSmartTag({
      value: '0.45',
      dataset: 'ADSL',
      variable: 'HR_PFS',
      sourceId: 'TLF-14.2.1',
      dataVersion: 'v1.0',
      status: 'draft',
      label: 'Hazard Ratio (PFS)',
    });
  }, [editor, fireAuditEvent]);

  const handleOpenInsert = useCallback(
    (kind) => {
      setInsertKind(kind);
      setInsertPanelOpen(true);
      fireAuditEvent(kind === 'citation' ? 'ectd.citation.open' : 'ectd.smarttag.open', { via: 'toolbar' });
      if (kind === 'citation') {
        setActiveTab('refs');
        setInsertDraft({
          value: '[Smith 2025]',
          dataset: 'References',
          variable: 'Citation',
          sourceId: 'PMID:382910',
          dataVersion: 'OK',
          label: 'Efficacy of Novel Inhibitors in Phase 3 Trials',
        });
      } else {
        setActiveTab('data');
        setInsertDraft((prev) => ({
          value: prev.value || '0.45',
          dataset: prev.dataset || 'ADSL',
          variable: prev.variable || 'HR_PFS',
          sourceId: prev.sourceId || 'TLF-14.2.1',
          dataVersion: prev.dataVersion || 'v1.0',
          label: prev.label || 'Data Point',
        }));
      }
    },
    [fireAuditEvent]
  );

  const handleInsertFromPanel = useCallback(() => {
    if (!editor?.commands?.insertSmartTag) return;
    const payload = {
      value: String(insertDraft.value || '').trim() || '---',
      dataset: String(insertDraft.dataset || '').trim() || null,
      variable: String(insertDraft.variable || '').trim() || null,
      sourceId: String(insertDraft.sourceId || '').trim() || null,
      dataVersion: String(insertDraft.dataVersion || '').trim() || (insertKind === 'citation' ? 'OK' : 'v1.0'),
      status: insertKind === 'citation' ? 'verified' : 'draft',
      label: String(insertDraft.label || '').trim() || (insertKind === 'citation' ? 'Citation' : 'Data Point'),
    };

    fireAuditEvent(insertKind === 'citation' ? 'ectd.citation.insert' : 'ectd.smarttag.insert', {
      via: 'insert-panel',
      smartTag: payload,
    });

    editor.commands.insertSmartTag(payload);
    setInsertPanelOpen(false);
    editor.commands.focus();
  }, [editor, fireAuditEvent, insertDraft, insertKind]);

  const handleBatchResolve = useCallback(() => {
    if (!editor) return;

    editor.commands.command(({ tr, state, dispatch }) => {
      let changed = false;

      state.doc.descendants((node, pos) => {
        if (node.type?.name !== 'smartTag') return true;

        const status = node.attrs?.status;
        const dataVersion = node.attrs?.dataVersion;
        const hasVersionMismatch = Boolean(dataVersion && dataVersion !== 'Final (Nov 15)');
        const isWarning = status === 'draft' || hasVersionMismatch;

        if (!isWarning) return true;

        tr.setNodeMarkup(pos, undefined, {
          ...(node.attrs ?? {}),
          status: 'verified',
          dataVersion: 'Final (Nov 15)',
          lastVerified: new Date().toISOString(),
        });
        changed = true;
        return true;
      });

      if (changed && dispatch) dispatch(tr);
      return changed;
    });
  }, [editor]);

  return (
    <div className={`flex h-full w-full overflow-hidden ${zenMode ? 'bg-slate-100' : 'bg-gray-50'}`}>
      <div
        className={`flex-1 flex flex-col min-w-0 bg-white shadow-sm ${
          zenMode ? 'm-0 rounded-none border-0' : 'm-2 rounded-lg border border-gray-200'
        }`}
      >
        {showChecklist && (
          <div className="border-b border-blue-200 bg-blue-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-700" />
                  <div className="text-sm font-semibold text-slate-900">First document checklist</div>
                  <span className="text-[10px] font-mono text-slate-500">TIPTAP MODE</span>
                </div>
                <div className="mt-1 text-xs text-slate-700">
                  Insert a SmartTag, review provenance in the right rail, then export.
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`h-4 w-4 ${smartTagCount > 0 ? 'text-green-600' : 'text-slate-300'}`} />
                    <span className={smartTagCount > 0 ? 'text-slate-900' : 'text-slate-600'}>
                      SmartTags inserted: {smartTagCount}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    Tip: Click a SmartTag to auto-focus its source/version in Data.
                  </div>
                </div>
              </div>
              <div className="shrink-0 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('data')}
                  className="px-2.5 py-1.5 text-xs rounded border border-blue-200 bg-white hover:bg-blue-50"
                >
                  Open Data
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('refs')}
                  className="px-2.5 py-1.5 text-xs rounded border border-blue-200 bg-white hover:bg-blue-50"
                >
                  Open Refs
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ai')}
                  className="px-2.5 py-1.5 text-xs rounded border border-blue-200 bg-white hover:bg-blue-50"
                >
                  Open AI
                </button>
                <button
                  type="button"
                  onClick={handleInsertSampleSmartTag}
                  className="px-2.5 py-1.5 text-xs rounded border border-blue-200 bg-white hover:bg-blue-50"
                >
                  Insert sample SmartTag
                </button>
                <button
                  type="button"
                  onClick={() => setPublicationOpen(true)}
                  className="px-2.5 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => setShowChecklist(false)}
                  className="px-2.5 py-1.5 text-xs rounded border border-slate-200 bg-white hover:bg-slate-50"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
        <div className={`${stickyClass} border-b p-2 bg-white flex items-center gap-1 flex-wrap`}>
          <button
            type="button"
            className={toolbarButtonClass(Boolean(editor?.isActive?.('bold')))}
            onClick={() => editor?.chain?.().focus?.().toggleBold?.().run?.()}
            disabled={!editor?.can?.().chain?.().focus?.().toggleBold?.().run?.()}
            title="Bold"
          >
            <Bold size={14} />
            <span className="hidden sm:inline">Bold</span>
          </button>
          <button
            type="button"
            className={toolbarButtonClass(Boolean(editor?.isActive?.('italic')))}
            onClick={() => editor?.chain?.().focus?.().toggleItalic?.().run?.()}
            disabled={!editor?.can?.().chain?.().focus?.().toggleItalic?.().run?.()}
            title="Italic"
          >
            <Italic size={14} />
            <span className="hidden sm:inline">Italic</span>
          </button>
          <button
            type="button"
            className={toolbarButtonClass(Boolean(editor?.isActive?.('heading', { level: 1 })))}
            onClick={() => editor?.chain?.().focus?.().toggleHeading?.({ level: 1 })?.run?.()}
            title="Heading 1"
          >
            <Heading1 size={14} />
            <span className="hidden sm:inline">H1</span>
          </button>
          <button
            type="button"
            className={toolbarButtonClass(Boolean(editor?.isActive?.('heading', { level: 2 })))}
            onClick={() => editor?.chain?.().focus?.().toggleHeading?.({ level: 2 })?.run?.()}
            title="Heading 2"
          >
            <Heading2 size={14} />
            <span className="hidden sm:inline">H2</span>
          </button>
          <button
            type="button"
            className={toolbarButtonClass(Boolean(editor?.isActive?.('bulletList')))}
            onClick={() => editor?.chain?.().focus?.().toggleBulletList?.().run?.()}
            title="Bulleted list"
          >
            <List size={14} />
            <span className="hidden sm:inline">Bullets</span>
          </button>
          <button
            type="button"
            className={toolbarButtonClass(Boolean(editor?.isActive?.('orderedList')))}
            onClick={() => editor?.chain?.().focus?.().toggleOrderedList?.().run?.()}
            title="Numbered list"
          >
            <ListOrdered size={14} />
            <span className="hidden sm:inline">Numbered</span>
          </button>
          <button
            type="button"
            className={toolbarButtonClass(Boolean(editor?.isActive?.('blockquote')))}
            onClick={() => editor?.chain?.().focus?.().toggleBlockquote?.().run?.()}
            title="Blockquote"
          >
            <Quote size={14} />
            <span className="hidden sm:inline">Quote</span>
          </button>

          <button
            type="button"
            className={toolbarButtonClass(Boolean(editor?.isActive?.('highlight')))}
            onClick={() => editor?.chain?.().focus?.().toggleHighlight?.().run?.()}
            title="Highlight"
          >
            <Highlighter size={14} />
            <span className="hidden sm:inline">Highlight</span>
          </button>

          <button
            type="button"
            className={toolbarButtonClass(Boolean(editor?.isActive?.('taskList')))}
            onClick={() => editor?.chain?.().focus?.().toggleTaskList?.().run?.()}
            title="Task list"
          >
            <ListChecks size={14} />
            <span className="hidden sm:inline">Tasks</span>
          </button>

          <span className="mx-1 h-5 w-px bg-gray-200" />

          <button
            type="button"
            className={toolbarButtonClass(false)}
            onClick={() => editor?.chain?.().focus?.().undo?.().run?.()}
            disabled={!editor?.can?.().chain?.().focus?.().undo?.().run?.()}
            title="Undo"
          >
            <Undo2 size={14} />
            <span className="hidden sm:inline">Undo</span>
          </button>
          <button
            type="button"
            className={toolbarButtonClass(false)}
            onClick={() => editor?.chain?.().focus?.().redo?.().run?.()}
            disabled={!editor?.can?.().chain?.().focus?.().redo?.().run?.()}
            title="Redo"
          >
            <Redo2 size={14} />
            <span className="hidden sm:inline">Redo</span>
          </button>

          <div className="ml-auto text-[10px] text-gray-500 flex items-center gap-3">
            <span className="font-mono">WORDS: {words}</span>
            <span className="font-mono">CHARS: {characters}</span>
            <span className="font-mono">SMARTTAGS: {smartTagCount}</span>
          </div>
        </div>

        <div className={`${stickyClass} border-b p-2 bg-gray-50 flex items-center justify-between gap-2`}>
          <div className="min-w-0">
            <div className="text-[10px] font-mono text-gray-400">STATUS: DRAFT (TIPTAP)</div>
            <div className="text-sm font-semibold text-gray-900 truncate">{document?.title || 'Untitled Document'}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0 relative">
            {smartTagCount > 0 && (
              <div
                className={`mr-1 px-2 py-1 rounded border text-[11px] ${
                  evidenceManifest
                    ? (evidenceStatus?.stale ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800')
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
                title={evidenceStatus?.staleReason ? String(evidenceStatus.staleReason) : undefined}
              >
                <span className="font-semibold">Evidence</span>:{' '}
                {evidenceManifest ? (evidenceStatus?.stale ? 'STALE' : 'FRESH') : 'UNTRACKED'}
                {evidenceChecking ? <span className="ml-2 text-slate-500">checking…</span> : null}
              </div>
            )}

            {smartTagCount > 0 && (
              <button
                type="button"
                onClick={refreshEvidence}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border ${
                  evidenceStatus?.stale ? 'border-rose-300 bg-rose-600 text-white hover:bg-rose-700' : 'border-gray-300 hover:bg-white'
                } ${evidenceRefreshing ? 'opacity-70 cursor-not-allowed' : ''}`}
                disabled={evidenceRefreshing}
                title={evidenceManifest ? 'Refresh evidence and update manifest' : 'Initialize evidence tracking'}
              >
                <RefreshCw size={14} className={evidenceRefreshing ? 'animate-spin' : ''} />
                {evidenceManifest ? 'Refresh Evidence' : 'Track Evidence'}
              </button>
            )}

            <button
              type="button"
              onClick={() => handleOpenInsert('data')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-white"
              title="Insert a data SmartTag (traceable evidence token)"
            >
              <BadgePlus size={14} /> Insert SmartTag
            </button>
            <button
              type="button"
              onClick={() => handleOpenInsert('citation')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-white"
              title="Insert a citation token (traceable reference)"
            >
              <Quote size={14} /> Cite source
            </button>
            <button
              type="button"
              onClick={() => {
                fireAuditEvent('ectd.validate.open', { via: 'toolbar' });
                setPublicationOpen(true);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-white"
              title="Run a pre-submission validation scan for SmartTag integrity"
            >
              <ShieldCheck size={14} /> Validate
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-white"
            >
              <Save size={14} /> Save
            </button>
            <button
              type="button"
              onClick={() => {
                fireAuditEvent('ectd.export.open', { via: 'toolbar' });
                setPublicationOpen(true);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-white"
            >
              <Download size={14} /> Export package
            </button>
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-white"
            >
              {BackIcon ? (
                <span className="inline-flex items-center gap-1">
                  <BackIcon size={14} /> {backLabel}
                </span>
              ) : (
                backLabel
              )}
            </button>

            {insertPanelOpen && (
              <div className="absolute right-0 top-[40px] z-20 w-[360px] rounded-lg border border-gray-200 bg-white shadow-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {insertKind === 'citation' ? 'Insert Citation' : 'Insert SmartTag'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {insertKind === 'citation'
                        ? 'Creates a traceable reference token. You can also drag from Refs.'
                        : 'Creates a traceable data token. You can also drag from Data.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInsertPanelOpen(false)}
                    className="text-xs text-gray-500 hover:text-gray-800"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <label className="text-[10px] font-medium text-gray-500">Value</label>
                  <input
                    value={insertDraft.value}
                    onChange={(e) => setInsertDraft((p) => ({ ...p, value: e.target.value }))}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                    placeholder={insertKind === 'citation' ? '[Smith 2025]' : '0.45'}
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500">Dataset</label>
                      <input
                        value={insertDraft.dataset}
                        onChange={(e) => setInsertDraft((p) => ({ ...p, dataset: e.target.value }))}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                        placeholder={insertKind === 'citation' ? 'References' : 'ADSL'}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500">Variable</label>
                      <input
                        value={insertDraft.variable}
                        onChange={(e) => setInsertDraft((p) => ({ ...p, variable: e.target.value }))}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                        placeholder={insertKind === 'citation' ? 'Citation' : 'HR_PFS'}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500">Source ID</label>
                      <input
                        value={insertDraft.sourceId}
                        onChange={(e) => setInsertDraft((p) => ({ ...p, sourceId: e.target.value }))}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                        placeholder={insertKind === 'citation' ? 'PMID:…' : 'TLF-…'}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500">Version</label>
                      <input
                        value={insertDraft.dataVersion}
                        onChange={(e) => setInsertDraft((p) => ({ ...p, dataVersion: e.target.value }))}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                        placeholder={insertKind === 'citation' ? 'OK' : 'v1.0'}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-gray-500">Label</label>
                    <input
                      value={insertDraft.label}
                      onChange={(e) => setInsertDraft((p) => ({ ...p, label: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                      placeholder={insertKind === 'citation' ? 'Paper title…' : 'Data Point'}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab(insertKind === 'citation' ? 'refs' : 'data');
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      Open {insertKind === 'citation' ? 'Refs' : 'Data'} panel
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setInsertPanelOpen(false)}
                        className="px-2.5 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleInsertFromPanel}
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
        </div>
        <div className={`flex-1 overflow-y-auto cursor-text ${zenMode ? 'bg-slate-100' : ''}`} onClick={() => editor?.commands?.focus()}>
          {zenMode ? (
            <div className="max-w-[980px] mx-auto p-6">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200">
                <EditorContent editor={editor} />
              </div>
            </div>
          ) : (
            <EditorContent editor={editor} />
          )}
        </div>
      </div>

      <PublicationModal
        isOpen={publicationOpen}
        onClose={() => setPublicationOpen(false)}
        editor={editor}
        onBatchResolve={handleBatchResolve}
      />

      {!zenMode && (
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
              onClick={() => setActiveTab('copilot')}
              className={`flex-1 p-2 text-[10px] font-medium flex flex-col items-center justify-center gap-1 ${
                activeTab === 'copilot' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
              }`}
              aria-label="Regulatory Copilot"
            >
              <ShieldCheck size={16} />
              <span>Copilot</span>
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
              <AIPanel initialContext={aiContext} onClearContext={() => setAiContext(null)} />
            </div>
          )}
          {activeTab === 'copilot' && (
            <div className="h-full w-full overflow-hidden">
              <RegulatoryCopilot
                documentTitle={document?.title}
                section={document?.metadata?.section || document?.section}
                contextSnippet={copilotContext}
                onApplyFix={applyComplianceFix}
              />
            </div>
          )}
          {activeTab === 'data' && (
            <div className="h-full w-full">
              <DataRoomPanel
                activeSourceId={focusedSourceId}
                activeDataVersion={focusedDataVersion}
                onDraftWithAI={(ctx) => {
                  setAiContext(ctx);
                  setActiveTab('ai');
                }}
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
      )}
    </div>
  );
}
