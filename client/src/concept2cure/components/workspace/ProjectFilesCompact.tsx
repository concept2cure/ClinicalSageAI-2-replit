/**
 * ProjectFilesCompact
 *
 * Lightweight read-only file list for the workspace right panel.
 * Shows uploaded documents with name / size / status and a quick
 * Upload button. "Open full manager" switches to the full Knowledge view.
 */

import React, { useRef } from 'react';
import { FileText, Upload, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjectKnowledge } from '../../hooks/useProjectKnowledge';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectFilesCompactProps {
  projectId: string | null;
  /** Called when the user clicks "Open full manager →" */
  onOpenFullManager?: () => void;
}

export const ProjectFilesCompact: React.FC<ProjectFilesCompactProps> = ({
  projectId,
  onOpenFullManager,
}) => {
  const { knowledge, isLoading, isUploading, uploadDocument, removeDocument } =
    useProjectKnowledge(projectId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docs = knowledge?.documents ?? [];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadDocument(file);
    // Reset so the same file can be re-uploaded if needed
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 flex-shrink-0">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
          Files
          {docs.length > 0 && <span className="ml-1.5 text-zinc-300">({docs.length})</span>}
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!projectId || isUploading}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-40 transition-colors"
        >
          {isUploading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Upload className="w-3 h-3" />
          )}
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
          onChange={handleFileChange}
        />
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto zen-scroll">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-4 h-4 text-zinc-300 animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center mb-2">
              <FileText className="w-4 h-4 text-zinc-400" />
            </div>
            <p className="text-xs text-zinc-500">No files yet</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!projectId || isUploading}
              className="mt-2 text-[11px] text-blue-600 hover:underline disabled:opacity-40"
            >
              Upload your first file
            </button>
          </div>
        ) : (
          <ul className="p-2 space-y-0.5">
            {docs.map(doc => (
              <li
                key={doc.id}
                className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-50 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                <span className="flex-1 text-xs text-zinc-700 truncate min-w-0" title={doc.name}>
                  {doc.name}
                </span>
                <span className="text-[10px] text-zinc-400 flex-shrink-0 tabular-nums">
                  {formatBytes(doc.size)}
                </span>
                <button
                  onClick={() => removeDocument(doc.id)}
                  className={cn(
                    'flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity',
                    'p-0.5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50'
                  )}
                  title="Remove file"
                >
                  <X className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer: open full manager */}
      {onOpenFullManager && docs.length > 0 && (
        <div className="flex-shrink-0 border-t border-zinc-100 px-3 py-1.5">
          <button
            onClick={onOpenFullManager}
            className="text-[11px] text-zinc-500 hover:text-zinc-700 hover:underline transition-colors"
          >
            Open full manager →
          </button>
        </div>
      )}
    </div>
  );
};
