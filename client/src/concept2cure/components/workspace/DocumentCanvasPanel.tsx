/**
 * DocumentCanvasPanel — Claude.ai-style right-side document canvas.
 *
 * Matches the Claude artifact panel pattern exactly:
 * - Title bar: document name + format badge + Download dropdown + close
 * - Content: rendered page with line number gutter on paper-like surface
 * - Clean, no clutter — just the document
 * - Edit opens the full editor (implicit, not a visible button)
 */

import React, { useMemo, useCallback } from 'react';
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
  Settings,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentCanvasPanelProps {
  artifactId: string;
  projectId?: string;
  onClose: () => void;
  onEdit: (artifactId: string) => void;
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

// ─── Sanitizer (prevent XSS from server content) ─────────────────────────────

function sanitizeHtml(html: string): string {
  // Strip script tags, event handlers, and dangerous attributes
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
  onEdit,
  isFullscreen,
  onToggleFullscreen,
}) => {
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

  // Count actual content lines for the gutter
  const lineCount = useMemo(() => {
    if (!artifact?.content) return 0;
    const text = artifact.content.replace(/<[^>]+>/g, '').trim();
    return Math.max(text.split('\n').length, 10);
  }, [artifact?.content]);

  const sanitizedContent = useMemo(() => {
    if (!artifact?.content) return '';
    return sanitizeHtml(artifact.content);
  }, [artifact?.content]);

  const handleDoubleClick = useCallback(() => {
    onEdit(artifactId);
  }, [onEdit, artifactId]);

  // ── Loading state ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col h-full border-l border-zinc-200 bg-white">
        <div className="h-11 px-4 flex items-center border-b border-zinc-100">
          <div className="h-3.5 w-48 bg-zinc-100 rounded animate-pulse" />
        </div>
        <div className="flex-1 overflow-y-auto bg-zinc-50 p-6">
          <div className="bg-white mx-auto shadow-lg border border-zinc-200 rounded-sm px-12 py-8">
            <div className="space-y-3">
              {Array.from({ length: 15 }, (_, i) => (
                <div key={i} className="h-4 bg-zinc-100 rounded animate-pulse" style={{ width: `${85 - i * 3}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!artifact) {
    return (
      <div className="flex flex-col h-full border-l border-zinc-200 bg-white items-center justify-center">
        <FileText className="w-8 h-8 text-zinc-300 mb-3" />
        <p className="text-sm font-medium text-zinc-500">No content yet</p>
        <p className="text-xs text-zinc-400 mt-1.5 max-w-xs text-center">
          Generate content in AnA or paste existing document content
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-l border-zinc-200 bg-white">
      {/* ── Title bar — Claude artifact panel style ── */}
      <div className="flex-shrink-0 h-11 px-4 flex items-center justify-between border-b border-zinc-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-sm font-medium text-zinc-800 truncate">
            {artifact.title}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-200 text-zinc-600 font-semibold flex-shrink-0 uppercase tracking-tight">
            {formatBadge}
          </span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Download with label */}
          <button
            aria-label="Download document"
            className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          >
            Download
            <ChevronDown className="w-3 h-3" />
          </button>
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Document preview — paper-like page with line numbers ── */}
      <div
        className="flex-1 overflow-y-auto bg-zinc-100"
        role="region"
        aria-label="Document preview"
        onDoubleClick={handleDoubleClick}
        title="Double-click to edit"
      >
        {/* Page container — looks like a printed page */}
        <div className="bg-white mx-auto mt-4 mb-8 shadow-lg border border-zinc-200" style={{ maxWidth: '8.5in' }}>
          <div className="flex min-h-[11in]">
            {/* Line number gutter */}
            <div className="w-10 flex-shrink-0 pt-12 pr-2 text-right select-none border-r border-zinc-200" aria-hidden="true">
              {Array.from({ length: lineCount || 30 }, (_, i) => (
                <div key={i} className="text-[11px] text-zinc-300 leading-7 tabular-nums font-mono">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 px-12 py-12 text-sm text-zinc-800 leading-7">
              {sanitizedContent ? (
                <div
                  className="prose prose-sm prose-zinc max-w-none"
                  dangerouslySetInnerHTML={{ __html: sanitizedContent }}
                />
              ) : (
                <div className="text-center py-16 text-zinc-400">
                  <FileText className="w-8 h-8 mx-auto mb-3 text-zinc-300" />
                  <p className="text-sm font-medium text-zinc-500">No content yet</p>
                  <p className="text-xs text-zinc-400 mt-1.5">Double-click to open the editor</p>
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
