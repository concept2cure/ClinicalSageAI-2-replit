/**
 * ProjectSidebar — Claude.ai-style project knowledge sidebar
 *
 * Matches Claude.ai's project view exactly:
 * - Memory section (project memory / AI learning)
 * - Instructions section (clickable → opens edit modal)
 * - Files section (+ button, capacity bar, file thumbnails)
 *
 * Stacked vertically, not tabs. Clean, minimal, warm white.
 */

import React, { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useProjectKnowledge } from '../../hooks/useProjectKnowledge';
import {
  Brain,
  PenLine,
  Plus,
  FileText,
  Upload,
  Loader2,
  X,
  Lock,
  ChevronRight,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectSidebarProps {
  projectId: string | null;
  projectType?: string;
  className?: string;
}

// ─── Instructions Modal ──────────────────────────────────────────────────────

const InstructionsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  value: string;
  projectName?: string;
  onSave: (instructions: string) => Promise<void>;
}> = ({ isOpen, onClose, value, projectName, onSave }) => {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-lg font-semibold text-zinc-900">Set project instructions</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Provide AnA with relevant instructions and information for chats within{' '}
            <span className="font-medium text-zinc-700">{projectName || 'this project'}</span>.
            This will work alongside user preferences and the selected style in a chat.
          </p>
        </div>
        <div className="flex-1 px-6 min-h-0">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="w-full h-64 p-4 border border-zinc-200 rounded-xl text-sm text-zinc-900 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-300 bg-zinc-50"
            placeholder="e.g., This project is for a 510(k) submission for a Class II medical device. Focus on FDA guidance documents and use formal regulatory language..."
          />
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save instructions'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Component ───────────────────────────────────────────────────────────────

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  projectId,
  projectType,
  className,
}) => {
  const {
    knowledge,
    isLoading,
    isUploading,
    uploadDocument,
    removeDocument,
    updateCustomInstructions,
  } = useProjectKnowledge(projectId);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docs = knowledge?.documents ?? [];
  const instructions = knowledge?.customInstructions || '';
  const totalBytes = docs.reduce((sum, d: any) => sum + (d.size || 0), 0);
  const capacityPercent = Math.min(100, Math.round((totalBytes / (50 * 1024 * 1024)) * 100)); // 50MB cap

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      await uploadDocument(file);
    }
    e.target.value = '';
    setUploadMenuOpen(false);
  }, [uploadDocument]);

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full overflow-y-auto', className)} style={{ scrollbarWidth: 'thin' }}>
      {/* ── Project Context ── */}
      <div className="px-4 py-4 border-b border-zinc-200">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-zinc-900">Project Context</h3>
          <span className="flex items-center gap-1 text-xs text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded-full">
            <Lock className="w-3 h-3" />
            Your team
          </span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          AnA learns your project context after a few interactions — submission history, regulatory preferences, and key decisions.
        </p>
      </div>

      {/* ── Instructions ── */}
      <div className="px-4 py-4 border-b border-zinc-200">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-zinc-900">Instructions</h3>
          <button
            onClick={() => setInstructionsOpen(true)}
            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors duration-150"
            title="Edit instructions"
          >
            <PenLine className="w-3.5 h-3.5" />
          </button>
        </div>
        {instructions ? (
          <p
            className="text-xs text-zinc-500 leading-relaxed line-clamp-3 cursor-pointer hover:text-zinc-700"
            onClick={() => setInstructionsOpen(true)}
          >
            {instructions}
          </p>
        ) : (
          <p
            className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-600"
            onClick={() => setInstructionsOpen(true)}
          >
            Click to add project instructions...
          </p>
        )}
      </div>

      {/* ── Files ── */}
      <div className="px-4 py-4 flex-1">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-zinc-900">Files</h3>
          <div className="relative">
            <button
              onClick={() => setUploadMenuOpen(!uploadMenuOpen)}
              className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors duration-150"
              title="Add files"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Upload dropdown menu */}
            {uploadMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUploadMenuOpen(false)} />
                <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-zinc-200 py-1 w-48">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors duration-150"
                  >
                    <Upload className="w-4 h-4 text-zinc-400" />
                    Upload from device
                  </button>
                  <button
                    onClick={() => { setUploadMenuOpen(false); setInstructionsOpen(true); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors duration-150"
                  >
                    <PenLine className="w-4 h-4 text-zinc-400" />
                    Add text content
                  </button>
                </div>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.md"
            multiple
            onChange={handleFileChange}
          />
        </div>

        {/* Capacity bar */}
        <div className="mb-3">
          <div className="w-full h-1 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-150"
              style={{ width: `${Math.max(capacityPercent, 1)}%` }}
            />
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            {capacityPercent}% of project capacity used
          </p>
        </div>

        {/* File thumbnails grid */}
        {isUploading && (
          <div className="flex items-center gap-2 py-2 text-xs text-zinc-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            Uploading...
          </div>
        )}

        {docs.length === 0 && !isUploading ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-8 border-2 border-dashed border-zinc-200 rounded-xl text-center hover:border-zinc-300 hover:bg-zinc-50 transition-colors duration-150"
          >
            <Upload className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
            <p className="text-xs text-zinc-400">Drop files here or click to upload</p>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {docs.map((doc: any) => (
              <div
                key={doc.id || doc.name}
                className="group relative border border-zinc-200 rounded-lg overflow-hidden hover:border-zinc-300 transition-colors duration-150"
              >
                {/* Thumbnail placeholder */}
                <div className="aspect-[4/5] bg-zinc-50 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-zinc-400" />
                </div>
                {/* File type badge */}
                <div className="absolute bottom-1 left-1">
                  <span className="text-xs font-semibold text-white bg-red-500 px-1.5 py-0.5 rounded uppercase">
                    {(doc.type || doc.name?.split('.').pop() || 'file').toUpperCase()}
                  </span>
                </div>
                {/* Remove button on hover */}
                <button
                  onClick={() => removeDocument(doc.id || doc.name)}
                  className="absolute top-1 right-1 p-0.5 bg-white/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                  title="Remove"
                >
                  <X className="w-3 h-3 text-zinc-500 hover:text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instructions modal */}
      <InstructionsModal
        isOpen={instructionsOpen}
        onClose={() => setInstructionsOpen(false)}
        value={instructions}
        onSave={updateCustomInstructions}
      />
    </div>
  );
};

export default ProjectSidebar;
