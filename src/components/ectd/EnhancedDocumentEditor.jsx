import React, { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { Bot, BookOpen, Database, Download } from 'lucide-react';

import { DataRoomPanel } from '../authoring/DataRoomPanel';
import { ReferencePanel } from '../authoring/ReferencePanel';
import VaultDocumentBrowser from './VaultDocumentBrowser';
import { eventBus } from '../ui/ToastSystem';

// Step 3 (TipTap engine) is feature-flagged so Step 2 can be validated in isolation.
// Enable by setting: VITE_ENABLE_TIPTAP_EDITOR=true
const tiptapEnabled =
  typeof import.meta !== 'undefined' &&
  import.meta?.env &&
  String(import.meta.env.VITE_ENABLE_TIPTAP_EDITOR).toLowerCase() === 'true';

const TipTapEnhancedDocumentEditor = React.lazy(() => import('./TipTapEnhancedDocumentEditor'));

function RightRail({ activeTab, setActiveTab, activeSourceId, activeDataVersion }) {
  return (
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
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'ai' && (
          <div className="p-4 text-center text-gray-400 text-sm mt-10">AI Assistant Ready</div>
        )}
        {activeTab === 'data' && (
          <div className="h-full w-full">
            <DataRoomPanel activeSourceId={activeSourceId} activeDataVersion={activeDataVersion} />
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

function LegacyTextareaEditor({ document, onChange, onSave, onBack, backLabel = 'Back', BackIcon }) {
  const initialContent = useMemo(() => {
    if (typeof document?.content === 'string') return document.content;
    if (typeof document?.html === 'string') return document.html;
    return '';
  }, [document]);

  const [content, setContent] = useState(initialContent);
  const [activeTab, setActiveTab] = useState('data');

  const textareaRef = useRef(null);

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
    onSave?.({
      ...(document ?? {}),
      content,
      lastEdited: new Date().toISOString(),
    });
  }, [content, document, onSave]);

  const downloadBlob = useCallback((blob, filename) => {
    const a = window.document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    window.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const safeFilename = useMemo(() => {
    const raw = String(document?.title || 'document').trim() || 'document';
    return raw.replace(/[^a-z0-9\-_. ]/gi, '_').slice(0, 120);
  }, [document?.title]);

  const handleExportDocx = useCallback(async () => {
    try {
      const docxMod = await import('docx');
      const { Document: DocxDocument, Packer, Paragraph } = docxMod;

      const lines = String(content || '').split(/\r?\n/);
      const docx = new DocxDocument({
        sections: [
          {
            children: lines.map((line) => new Paragraph({ text: line })),
          },
        ],
      });
      const blob = await Packer.toBlob(docx);
      downloadBlob(blob, `${safeFilename}.docx`);
      eventBus.emit({
        type: 'SHOW_TOAST',
        payload: {
          title: 'Exported DOCX',
          message: `${safeFilename}.docx downloaded.`,
        },
      });
    } catch (e) {
      eventBus.emit({
        type: 'SHOW_TOAST',
        payload: {
          title: 'DOCX export failed',
          message: String(e?.message || e),
          variant: 'danger',
        },
      });
    }
  }, [content, downloadBlob, safeFilename]);

  const handleExportPdf = useCallback(async () => {
    try {
      const html2pdfMod = await import('html2pdf.js');
      const html2pdf = html2pdfMod?.default || html2pdfMod;

      const container = window.document.createElement('div');
      container.style.padding = '24px';
      container.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      container.style.whiteSpace = 'pre-wrap';
      container.textContent = String(content || '');

      await html2pdf()
        .set({
          margin: 12,
          filename: `${safeFilename}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(container)
        .save();

      eventBus.emit({
        type: 'SHOW_TOAST',
        payload: {
          title: 'Exported PDF',
          message: `${safeFilename}.pdf downloaded.`,
        },
      });
    } catch (e) {
      eventBus.emit({
        type: 'SHOW_TOAST',
        payload: {
          title: 'PDF export failed',
          message: String(e?.message || e),
          variant: 'danger',
        },
      });
    }
  }, [content, safeFilename]);

  return (
    <div className="flex h-full w-full bg-white overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="shrink-0 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-mono text-gray-400">STATUS: DRAFT (LEGACY SAFE MODE)</div>
            <div className="font-semibold text-slate-900 truncate">{document?.title || 'Untitled Document'}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportDocx}
              className="px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1"
              title="Export to Word (.docx)"
            >
              <Download size={14} /> DOCX
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1"
              title="Export to PDF"
            >
              <Download size={14} /> PDF
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50"
            >
              Save
            </button>
            {typeof onBack === 'function' && (
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
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 p-4">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              onChange?.(e.target.value);
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="w-full h-full resize-none rounded-lg border border-slate-200 p-4 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Step 2 validation mode: drag values from the Data Room to insert a traceable token"
          />
        </div>
      </div>

      <RightRail activeTab={activeTab} setActiveTab={setActiveTab} activeSourceId={null} activeDataVersion={null} />
    </div>
  );
}

function EditorWorkspaceShell({ tenantId, onOpenDoc, children }) {
  return (
    <div className="flex h-full w-full bg-white overflow-hidden">
      <div className="w-[340px] border-r border-gray-200 bg-gray-50 shrink-0">
        <VaultDocumentBrowser tenantId={tenantId} onOpenDoc={onOpenDoc} compact />
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default function EnhancedDocumentEditor(props) {
  const { tenantId, onOpenDoc } = props;

  if (!tiptapEnabled) {
    return (
      <EditorWorkspaceShell tenantId={tenantId} onOpenDoc={onOpenDoc}>
        <LegacyTextareaEditor {...props} />
      </EditorWorkspaceShell>
    );
  }

  return (
    <EditorWorkspaceShell tenantId={tenantId} onOpenDoc={onOpenDoc}>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full w-full text-sm text-gray-500">
            Loading editor…
          </div>
        }
      >
        <TipTapEnhancedDocumentEditor {...props} />
      </Suspense>
    </EditorWorkspaceShell>
  );
}
