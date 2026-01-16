import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { Bot, BookOpen, Database, Download, MessageSquare, Save } from 'lucide-react';

import SmartTag from '../editor/extensions/SmartTag';
import { ReviewPanel } from '../authoring/ReviewPanel';
import { DataRoomPanel } from '../authoring/DataRoomPanel';
import { ReferencePanel } from '../authoring/ReferencePanel';
import { PublicationModal } from '../authoring/PublicationModal';

const AnchorIdExtension = Extension.create({
  name: 'anchorIdExtension',

  addGlobalAttributes() {
    return [
      {
        types: ['heading', 'paragraph'],
        attributes: {
          dataId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-id'),
            renderHTML: (attributes) =>
              attributes.dataId
                ? {
                    'data-id': attributes.dataId,
                  }
                : {},
          },
        },
      },
    ];
  },
});

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

  // Escape minimal entities for safe HTML.
  const escaped = trimmed
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

  return `<p>${escaped}</p>`;
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
    value: getString(payload.value, 2000),
    sourceId: getString(payload.sourceId, 120),
    dataset: getString(payload.dataset, 200),
    variable: getString(payload.variable, 120),
    dataVersion: getString(payload.dataVersion, 40),
    status: getString(payload.status, 40),
    label: getString(payload.label, 200),
  };
}

export default function TipTapEnhancedDocumentEditor({
  document,
  onChange,
  onSave,
  onBack,
  backLabel = 'Back',
  BackIcon,
  focusRequest,
  tenantId,
}) {
  const [activeTab, setActiveTab] = useState('data');
  const [focusedTag, setFocusedTag] = useState(null);
  const [publicationOpen, setPublicationOpen] = useState(false);

  const initialContent = useMemo(() => {
    if (typeof document?.html === 'string' && document.html.trim()) return ensureHtmlContent(document.html);
    if (typeof document?.content === 'string' && document.content.trim()) return ensureHtmlContent(document.content);

    return [
      '<p><strong>Protocol 101 - Clinical Study Report</strong></p>',
      '<h2 data-id="sec-2.1">2.1 Efficacy</h2>',
      '<p>The primary endpoint analysis demonstrates efficacy. Hazard Ratio (PFS): ',
      '<span data-smarttag="true" id="tag-hr-pfs" variable="HR_PFS" value="0.48" status="draft" label="HR (PFS)"></span>',
      '.</p>',
      '<h3 data-id="tbl-14.2">Table 14.2.1 Primary Endpoint</h3>',
      '<p>See Table 14.2.1 for the full endpoint breakdown and confidence intervals.</p>',
    ].join('');
  }, [document]);

  const editor = useEditor({
    extensions: [StarterKit, AnchorIdExtension, SmartTag],
    content: initialContent,
    onUpdate: ({ editor }) => {
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
          const next = {
            id: foundTag.attrs?.id ?? null,
            sourceId: foundTag.attrs?.sourceId ?? null,
            version: foundTag.attrs?.dataVersion ?? null,
            value: foundTag.attrs?.value ?? null,
            variable: foundTag.attrs?.variable ?? null,
            label: foundTag.attrs?.label ?? null,
          };

          setFocusedTag((prev) => {
            if (!prev) return next;
            if (prev.sourceId === next.sourceId && prev.version === next.version && prev.value === next.value) return prev;
            return next;
          });

          setActiveTab((prev) => (prev === 'data' ? prev : 'data'));
          return;
        }

        // If selection leaves a tag, clear focus signal.
        setFocusedTag((prev) => (prev === null ? prev : null));
      } catch {
        // ignore selection edge cases
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
        event.preventDefault();
        event.stopPropagation?.();
        return true;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(initialContent, false);
  }, [editor, initialContent]);

  const handleSyncArtifact = useCallback(
    (latestArtifact) => {
      if (!focusedTag || !editor) return;

      const latestVersion = latestArtifact?.dataVersion ?? null;

      const latestItem = latestArtifact?.items?.find((item) => {
        if (!item) return false;
        if (focusedTag.variable && item.variable === focusedTag.variable) return true;
        if (focusedTag.label && item.label === focusedTag.label) return true;
        return false;
      });

      if (!latestItem || latestItem.value == null) return;

      const targetId = focusedTag.id;
      const targetSource = focusedTag.sourceId;

      let pos = null;
      let priorAttrs = null;

      editor.state.doc.descendants((node, position) => {
        if (pos !== null) return false;
        if (node.type?.name !== 'smartTag') return true;

        const matchesId = targetId && node.attrs?.id === targetId;
        const matchesSource = !targetId && targetSource && node.attrs?.sourceId === targetSource;

        if (matchesId || matchesSource) {
          pos = position;
          priorAttrs = node.attrs;
          return false;
        }
        return true;
      });

      if (pos === null) return;

      editor.commands.command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, {
          ...(priorAttrs ?? {}),
          value: latestItem.value,
          dataVersion: latestVersion ?? (priorAttrs?.dataVersion ?? null),
          status: 'verified',
        });
        return true;
      });

      setFocusedTag((prev) =>
        prev
          ? {
              ...prev,
              value: latestItem.value,
              version: latestVersion ?? prev.version,
            }
          : prev
      );
    },
    [editor, focusedTag]
  );

  const handleSave = useCallback(() => {
    const html = editor?.getHTML?.() ?? initialContent;
    onSave?.({
      ...(document ?? {}),
      content: html,
      html,
      lastEdited: new Date().toISOString(),
    });
  }, [document, editor, initialContent, onSave]);

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
        });
        changed = true;
        return true;
      });

      if (changed && dispatch) dispatch(tr);
      return changed;
    });
  }, [editor]);

  // --- REVIEW ENGINE CALLBACKS ---
  const handleFocusNode = useCallback(
    (nodeId) => {
      if (!editor) return;

      editor.commands.focus();

      // If the target is a SmartTag, move the editor selection onto it.
      // This makes the focus actionable (keyboard, contextual UI), not just scrolled.
      try {
        let smartTagPos = null;
        editor.state.doc.descendants((node, pos) => {
          if (node?.type?.name === 'smartTag' && node?.attrs?.id && String(node.attrs.id) === String(nodeId)) {
            smartTagPos = pos;
            return false;
          }
          return true;
        });

        if (typeof smartTagPos === 'number') {
          if (typeof editor.commands.setNodeSelection === 'function') {
            editor.commands.setNodeSelection(smartTagPos);
          } else if (typeof editor.commands.setTextSelection === 'function') {
            editor.commands.setTextSelection(smartTagPos);
          }
        }
      } catch {
        // ignore
      }

      // Avoid shadowing the `document` prop.
      const element = globalThis.document?.querySelector?.(`[data-id="${nodeId}"]`);
      if (element && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Micro-highlight so the user can instantly see the target.
        try {
          element.classList.remove('cs-focus-pulse');
          // Force reflow so the animation reliably restarts.
          void element.offsetWidth;
          element.classList.add('cs-focus-pulse');
          globalThis.setTimeout?.(() => {
            try {
              element.classList.remove('cs-focus-pulse');
            } catch {
              // ignore
            }
          }, 1600);
        } catch {
          // ignore (best-effort UI effect)
        }
      }
    },
    [editor]
  );

  const handleApplyFix = useCallback(
    (payload) => {
      if (!editor) return;

      const smartTagId = payload?.smartTagId ? String(payload.smartTagId) : null;
      const updates = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'smartTag') return;

        if (smartTagId) {
          if (node.attrs?.id && String(node.attrs.id) === smartTagId) {
            updates.push({ pos, attrs: { ...node.attrs, value: payload.value, status: 'verified' } });
          }
          return;
        }

        if (node.attrs.variable === 'HR_PFS') {
          updates.push({ pos, attrs: { ...node.attrs, value: payload.value, status: 'verified' } });
        }
      });

      if (updates.length) {
        const tr = editor.state.tr;
        updates.forEach((u) => tr.setNodeMarkup(u.pos, null, u.attrs));
        editor.view.dispatch(tr);
      }
    },
    [editor]
  );

  useEffect(() => {
    if (!focusRequest) return;
    const anchorId = focusRequest.anchorId;
    if (!anchorId) return;

    setActiveTab('review');
    // Let the tab render before scrolling
    requestAnimationFrame(() => {
      handleFocusNode(anchorId);
    });
  }, [focusRequest, handleFocusNode]);

  return (
    <div className="flex h-full w-full bg-gray-50 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 bg-white shadow-sm m-2 rounded-lg border border-gray-200">
        <div className="border-b p-2 bg-gray-50 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-mono text-gray-400">STATUS: DRAFT (TIPTAP)</div>
            <div className="text-sm font-semibold text-gray-900 truncate">{document?.title || 'Untitled Document'}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-white"
            >
              <Save size={14} /> Save
            </button>
            <button
              type="button"
              onClick={() => setPublicationOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-white"
            >
              <Download size={14} /> Export
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
          </div>
        </div>
        <div className="flex-1 overflow-y-auto cursor-text" onClick={() => editor?.commands?.focus()}>
          <EditorContent editor={editor} />
        </div>
      </div>

      <PublicationModal
        isOpen={publicationOpen}
        onClose={() => setPublicationOpen(false)}
        editor={editor}
        onBatchResolve={handleBatchResolve}
      />

      <div className="w-[320px] bg-white border-l border-gray-200 flex flex-col shrink-0">
        <div className="flex border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`flex-1 p-3 text-xs font-medium flex justify-center ${
              activeTab === 'ai' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
            }`}
            aria-label="AI"
          >
            <Bot size={16} />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('data')}
            className={`flex-1 p-3 text-xs font-medium flex justify-center ${
              activeTab === 'data' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
            }`}
            aria-label="Data"
          >
            <Database size={16} />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('refs')}
            className={`flex-1 p-3 text-xs font-medium flex justify-center ${
              activeTab === 'refs' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
            }`}
            aria-label="References"
          >
            <BookOpen size={16} />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('review')}
            className={`flex-1 p-3 flex justify-center ${
              activeTab === 'review' ? 'text-orange-600 border-b-2 border-orange-600' : 'text-gray-500'
            }`}
            aria-label="Review"
          >
            <MessageSquare size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden relative">
          {activeTab === 'ai' && (
            <div className="p-4 text-center text-gray-400 text-sm mt-10">AI Assistant Ready</div>
          )}
          {activeTab === 'data' && (
            <div className="h-full w-full">
              <DataRoomPanel activeTag={focusedTag} onSyncArtifact={handleSyncArtifact} />
            </div>
          )}
          {activeTab === 'refs' && (
            <div className="h-full w-full overflow-hidden">
              <ReferencePanel />
            </div>
          )}
          {activeTab === 'review' && (
            <div className="h-full w-full">
              <ReviewPanel
                onFocusNode={handleFocusNode}
                onApplyFix={handleApplyFix}
                docId={document?.id}
                tenantId={tenantId}
                focusThreadId={focusRequest?.threadId}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
