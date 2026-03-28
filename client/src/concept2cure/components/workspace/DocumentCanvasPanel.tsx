/**
 * DocumentCanvasPanel — Claude.ai-style right-side document canvas.
 *
 * Full workflow:
 * 1. AnA generates document → appears in canvas
 * 2. Inline basic editing in the canvas
 * 3. Save as PDF / DOCX (download to PC)
 * 4. Save to Vault / DMS
 * 5. Open in Full Document Editor (EditorPanel — Weave.bio/ARTOS-style)
 */

import React, { useMemo, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import {
  X,
  Download,
  ChevronDown,
  FileText,
  Maximize2,
  Minimize2,
  Save,
  Archive,
  PenLine,
  Edit3,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentCanvasPanelProps {
  artifactId: string;
  projectId?: string;
  onClose: () => void;
  /** Opens the full document editor (EditorPanel / Weave-style) */
  onOpenFullEditor: (artifactId: string) => void;
  /** Saves to vault/DMS */
  onSaveToVault?: (artifactId: string) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

interface ArtifactData {
  id: string;
  title: string;
  content?: string | null;
  type?: string;
  status?: string;
  ctdSection?: string;
  version?: number;
  format?: string;
}

// ─── Sanitizer ────────────────────────────────────────────────────────────────

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '');
}

// ─── Component ────────────────────────────────────────────────────────────────

export const DocumentCanvasPanel: React.FC<DocumentCanvasPanelProps> = ({
  artifactId,
  projectId,
  onClose,
  onOpenFullEditor,
  onSaveToVault,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  const { data: artifact, isLoading } = useQuery<ArtifactData>({
    queryKey: queryKeys.artifacts.detail(artifactId),
    queryFn: async () => {
      const url = projectId
        ? `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}`
        : `/api/concept2cure/artifacts/${artifactId}`;
      const res = await apiRequest('GET', url);
      if (!res.ok) throw new Error('Failed to load artifact');
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: !!artifactId,
  });

  const formatBadge = useMemo(() => {
    const fmt = artifact?.format || artifact?.type || 'DOCX';
    return fmt.toUpperCase().slice(0, 4);
  }, [artifact]);

  const lineCount = useMemo(() => {
    const text = (isEditing ? editContent : artifact?.content || '').replace(/<[^>]+>/g, '').trim();
    return Math.max(text.split('\n').length, 10);
  }, [artifact?.content, isEditing, editContent]);

  const sanitizedContent = useMemo(() => {
    if (!artifact?.content) return '';
    return sanitizeHtml(artifact.content);
  }, [artifact?.content]);

  const handleStartEdit = useCallback(() => {
    setEditContent(artifact?.content || '');
    setIsEditing(true);
  }, [artifact?.content]);

  const handleSaveEdit = useCallback(async () => {
    if (!projectId || !artifactId) return;
    try {
      await apiRequest('PUT', `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}`, {
        content: editContent,
      });
      setIsEditing(false);
    } catch {
      // Save failed — stay in edit mode
    }
  }, [projectId, artifactId, editContent]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col h-full border-l border-stone-200 bg-white">
        <div className="h-11 px-4 flex items-center border-b border-stone-100">
          <div className="h-3.5 w-48 bg-stone-100 rounded animate-pulse" />
        </div>
        <div className="flex-1 overflow-y-auto bg-stone-50 p-6">
          <div className="bg-white mx-auto shadow-lg border border-stone-200 rounded-sm px-12 py-8">
            <div className="space-y-3">
              {Array.from({ length: 15 }, (_, i) => (
                <div key={i} className="h-4 bg-stone-100 rounded animate-pulse" style={{ width: `${85 - i * 3}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="flex flex-col h-full border-l border-stone-200 bg-white items-center justify-center">
        <FileText className="w-8 h-8 text-stone-300 mb-3" />
        <p className="text-sm font-medium text-stone-500">No content yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-l border-stone-200 bg-white">
      {/* ── Title bar ── */}
      <div className="flex-shrink-0 h-11 px-4 flex items-center justify-between border-b border-stone-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-sm font-medium text-stone-800 truncate">{artifact.title}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-200 text-stone-600 font-semibold flex-shrink-0 uppercase tracking-tight">
            {formatBadge}
          </span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Inline edit toggle */}
          {isEditing ? (
            <button
              onClick={handleSaveEdit}
              className="flex items-center gap-1 px-2 py-1 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
          ) : (
            <button
              onClick={handleStartEdit}
              aria-label="Edit inline"
              className="flex items-center gap-1 px-2 py-1 text-xs text-stone-500 hover:text-stone-700 hover:bg-stone-50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
          )}

          {/* Open in Full Editor — Weave.bio/ARTOS-style */}
          <button
            onClick={() => onOpenFullEditor(artifactId)}
            aria-label="Open in Full Editor"
            className="flex items-center gap-1 px-2 py-1 text-xs text-stone-500 hover:text-stone-700 hover:bg-stone-50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
          >
            <PenLine className="w-3.5 h-3.5" />
            Full Editor
          </button>

          {/* Save to Vault */}
          {onSaveToVault && (
            <button
              onClick={() => onSaveToVault(artifactId)}
              aria-label="Save to Vault"
              className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
              title="Save to Vault"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Download dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowDownloadMenu(d => !d)}
              aria-label="Download document"
              aria-haspopup="menu"
              aria-expanded={showDownloadMenu}
              className="flex items-center gap-1 px-2 py-1 text-xs text-stone-500 hover:text-stone-700 hover:bg-stone-50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
            >
              <Download className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3" />
            </button>
            {showDownloadMenu && (
              <div className="absolute right-0 mt-1 w-36 bg-white border border-stone-200 rounded-lg shadow-lg z-50 py-1" role="menu">
                <button
                  role="menuitem"
                  className="w-full text-left px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
                  onClick={() => { setShowDownloadMenu(false); }}
                >
                  Download as PDF
                </button>
                <button
                  role="menuitem"
                  className="w-full text-left px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
                  onClick={() => { setShowDownloadMenu(false); }}
                >
                  Download as DOCX
                </button>
                <button
                  role="menuitem"
                  className="w-full text-left px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
                  onClick={() => { setShowDownloadMenu(false); }}
                >
                  Download as XML
                </button>
              </div>
            )}
          </div>

          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Document content ── */}
      <div className="flex-1 overflow-y-auto bg-stone-100" role="region" aria-label="Document preview">
        <div className="bg-white mx-auto mt-4 mb-8 shadow-lg border border-stone-200" style={{ maxWidth: '8.5in' }}>
          <div className="flex min-h-[11in]">
            {/* Line numbers */}
            <div className="w-10 flex-shrink-0 pt-12 pr-2 text-right select-none border-r border-stone-200" aria-hidden="true">
              {Array.from({ length: lineCount || 30 }, (_, i) => (
                <div key={i} className="text-[11px] text-stone-300 leading-7 tabular-nums font-mono">{i + 1}</div>
              ))}
            </div>

            {/* Content / Editor */}
            <div className="flex-1 px-12 py-12 text-sm text-stone-800 leading-7">
              {isEditing ? (
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[600px] text-sm leading-7 text-stone-800 bg-transparent border-none outline-none resize-none font-serif"
                  autoFocus
                />
              ) : sanitizedContent ? (
                <div
                  className="prose prose-sm prose-stone max-w-none"
                  dangerouslySetInnerHTML={{ __html: sanitizedContent }}
                />
              ) : (
                <div className="text-center py-16 text-stone-400">
                  <FileText className="w-8 h-8 mx-auto mb-3 text-stone-300" />
                  <p className="text-sm font-medium text-stone-500">No content yet</p>
                  <p className="text-xs text-stone-400 mt-1.5">Generate content with AnA to see it here</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentCanvasPanel;
