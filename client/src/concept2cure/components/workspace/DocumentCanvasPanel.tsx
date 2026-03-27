/**
 * DocumentCanvasPanel — Claude.ai-style right-side document canvas.
 *
 * Shows a rendered document preview alongside the AnA conversation.
 * Matches the Claude artifact panel pattern: title bar + preview + actions.
 *
 * Features:
 * - Document title with format badge (PDF, DOCX, XML)
 * - Download button
 * - Rendered content preview
 * - "Edit" button to open full EditorPanel
 * - Close button to dismiss canvas
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import {
  X,
  Download,
  PenLine,
  FileText,
  Maximize2,
  Minimize2,
} from 'lucide-react';

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
  content?: string;
  type?: string;
  status?: string;
  ctdSection?: string;
  version?: number;
  format?: string;
}

export const DocumentCanvasPanel: React.FC<DocumentCanvasPanelProps> = ({
  artifactId,
  projectId,
  onClose,
  onEdit,
  isFullscreen,
  onToggleFullscreen,
}) => {
  // Fetch artifact data
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

  if (isLoading) {
    return (
      <div className="flex flex-col h-full border-l border-zinc-200 bg-white">
        <div className="h-12 px-4 flex items-center border-b border-zinc-100">
          <div className="h-4 w-48 bg-zinc-100 rounded animate-pulse" />
        </div>
        <div className="flex-1 p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-4 bg-zinc-50 rounded animate-pulse" style={{ width: `${90 - i * 10}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="flex flex-col h-full border-l border-zinc-200 bg-white items-center justify-center">
        <FileText className="w-8 h-8 text-zinc-300 mb-2" />
        <p className="text-sm text-zinc-400">Artifact not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-l border-zinc-200 bg-white">
      {/* Title bar — matches Claude artifact panel */}
      <div className="flex-shrink-0 h-12 px-4 flex items-center justify-between border-b border-zinc-100">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-zinc-800 truncate">
            {artifact.title}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium flex-shrink-0">
            {formatBadge}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(artifactId)}
            aria-label="Edit document"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-600 hover:text-zinc-800 hover:bg-zinc-50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          >
            <PenLine className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            aria-label="Download"
            className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          >
            <Download className="w-4 h-4" />
          </button>
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close canvas"
            className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Document preview — rendered content with line numbers like the screenshot */}
      <div className="flex-1 overflow-y-auto bg-zinc-50">
        <div className="max-w-none mx-auto">
          {/* Page-like container */}
          <div className="bg-white mx-4 my-4 shadow-sm border border-zinc-200 rounded-sm min-h-[600px]">
            <div className="flex">
              {/* Line numbers gutter */}
              <div className="w-10 flex-shrink-0 pt-8 pr-2 text-right select-none border-r border-zinc-100">
                {Array.from({ length: 30 }, (_, i) => (
                  <div key={i} className="text-[11px] text-zinc-300 leading-6 tabular-nums">
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Content area */}
              <div className="flex-1 p-8 text-sm text-zinc-800 leading-6">
                {artifact.content ? (
                  <div
                    className="prose prose-sm prose-zinc max-w-none"
                    dangerouslySetInnerHTML={{ __html: artifact.content }}
                  />
                ) : (
                  <div className="text-center py-12 text-zinc-400">
                    <FileText className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm">Document content will appear here</p>
                    <p className="text-xs mt-1">Generate content with AnA or open in the editor</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentCanvasPanel;
