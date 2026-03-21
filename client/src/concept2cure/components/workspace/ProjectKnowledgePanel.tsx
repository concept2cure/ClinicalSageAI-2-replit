/**
 * ProjectKnowledgePanel
 *
 * Claude.ai-style project knowledge sidebar panel.
 * Combines: file uploads, project memory (custom instructions),
 * context window usage, and artifact tree into one unified view.
 *
 * This is the "project brain" — everything AnA RI knows about
 * the active project comes through here.
 *
 * @module concept2cure/components/workspace/ProjectKnowledgePanel
 */

import React, { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useProjectKnowledge } from '../../hooks/useProjectKnowledge';
import { useProject } from '../../context/ProjectContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  FileText,
  Upload,
  Loader2,
  X,
  ChevronDown,
  ChevronRight,
  Brain,
  HardDrive,
  Settings2,
  Save,
  Check,
  FolderOpen,
  File,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  AlertCircle,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  switch (type) {
    case 'pdf': return FileText;
    case 'docx': case 'doc': return FileText;
    case 'xlsx': case 'xls': case 'csv': return FileSpreadsheet;
    case 'txt': case 'md': return FileCode;
    case 'png': case 'jpg': case 'jpeg': return ImageIcon;
    default: return File;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COLLAPSIBLE SECTION
// ─────────────────────────────────────────────────────────────────────────────

const Section: React.FC<{
  title: string;
  icon: React.ElementType;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, icon: Icon, count, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-200 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-zinc-50 transition-colors duration-150"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-zinc-400" />
        ) : (
          <ChevronRight className="w-3 h-3 text-zinc-400" />
        )}
        <Icon className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-xs font-medium text-zinc-700 flex-1">{title}</span>
        {count !== undefined && (
          <span className="text-xs text-zinc-400 tabular-nums">{count}</span>
        )}
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT USAGE BAR
// ─────────────────────────────────────────────────────────────────────────────

const ContextUsageBar: React.FC<{
  used: number;
  max: number;
  percent: number;
}> = ({ used, max, percent }) => {
  const color =
    percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-amber-500' : 'bg-blue-500';

  return (
    <div className="px-4 py-2">
      <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
        <span>Context window</span>
        <span className="tabular-nums">
          {(used / 1000).toFixed(0)}K / {(max / 1000).toFixed(0)}K tokens
        </span>
      </div>
      <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectKnowledgePanelProps {
  projectId: string | null;
  className?: string;
}

export const ProjectKnowledgePanel: React.FC<ProjectKnowledgePanelProps> = ({
  projectId,
  className,
}) => {
  const {
    knowledge,
    isLoading,
    error,
    uploadDocument,
    removeDocument,
    updateCustomInstructions,
    contextTokens,
    maxContextTokens,
    contextUsagePercent,
    isUploading,
    uploadProgress,
  } = useProjectKnowledge(projectId);

  const { activeProject, projectArtifacts } = useProject();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom instructions editing
  const [isEditingInstructions, setIsEditingInstructions] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const docs = knowledge?.documents ?? [];
  const artifacts = projectArtifacts ?? [];

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      // Support multi-file upload
      for (let i = 0; i < files.length; i++) {
        await uploadDocument(files[i]);
      }
      e.target.value = '';
    },
    [uploadDocument]
  );

  const handleStartEditing = () => {
    setInstructionsDraft(knowledge?.customInstructions || '');
    setIsEditingInstructions(true);
  };

  const handleSaveInstructions = async () => {
    setIsSaving(true);
    await updateCustomInstructions(instructionsDraft);
    setIsSaving(false);
    setIsEditingInstructions(false);
  };

  if (!projectId) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-center px-4', className)}>
        <FolderOpen className="w-8 h-8 text-zinc-200 mb-3" />
        <p className="text-xs text-zinc-500">Select a project to view its knowledge base</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-white', className)}>
      {/* Project header */}
      <div className="px-4 py-3 border-b border-zinc-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-violet-500" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-zinc-900 truncate">
              {activeProject?.name || 'Project Knowledge'}
            </div>
            <div className="text-xs text-zinc-400">
              {activeProject?.type || 'Submission'} &middot; {docs.length} files &middot; {artifacts.length} artifacts
            </div>
          </div>
        </div>
      </div>

      {/* Context usage */}
      <ContextUsageBar
        used={contextTokens}
        max={maxContextTokens}
        percent={contextUsagePercent}
      />

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Error banner */}
        {error && (
          <div className="mx-4 mb-2 p-2 rounded-md bg-red-50 border border-red-100 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
            <span className="text-xs text-red-700">{error}</span>
          </div>
        )}

        {/* ── Files Section ── */}
        <Section title="Project Files" icon={HardDrive} count={docs.length}>
          <div className="px-4">
            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!projectId || isUploading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-zinc-200 text-xs text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-40 transition-colors mb-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Uploading... {uploadProgress}%
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Upload files (PDF, DOCX, TXT, CSV, XLSX)
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
              onChange={handleFileChange}
            />

            {/* File list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
              </div>
            ) : docs.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-4">
                Upload source documents to give AnA RI project context — just like Claude.ai projects.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {docs.map((doc) => {
                  const Icon = getFileIcon(doc.type);
                  return (
                    <li
                      key={doc.id}
                      className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-50 transition-colors duration-150"
                    >
                      <Icon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                      <span className="flex-1 text-xs text-zinc-700 truncate min-w-0" title={doc.name}>
                        {doc.name}
                      </span>
                      <span className="text-xs text-zinc-400 flex-shrink-0 tabular-nums">
                        {formatBytes(doc.size)}
                      </span>
                      {doc.tokenCount && (
                        <span className="text-xs text-zinc-400 flex-shrink-0 tabular-nums">
                          {(doc.tokenCount / 1000).toFixed(0)}K
                        </span>
                      )}
                      <button
                        onClick={() => removeDocument(doc.id)}
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150"
                        title="Remove file"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Section>

        {/* ── Custom Instructions Section ── */}
        <Section title="Project Instructions" icon={Settings2} defaultOpen={true}>
          <div className="px-4">
            {isEditingInstructions ? (
              <div className="space-y-2">
                <Textarea
                  value={instructionsDraft}
                  onChange={(e) => setInstructionsDraft(e.target.value)}
                  placeholder="Tell AnA RI how to behave for this project. E.g., 'Always reference predicate device K123456. Use consistent IFU language. Flag any Class III considerations.'"
                  className="text-xs min-h-[120px] border-zinc-200 resize-y"
                />
                <div className="flex items-center gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingInstructions(false)}
                    className="text-xs h-7"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveInstructions}
                    disabled={isSaving}
                    className="text-xs h-7 bg-zinc-900 text-white hover:bg-zinc-800"
                  >
                    {isSaving ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : (
                      <Save className="w-3 h-3 mr-1" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleStartEditing}
                className="w-full text-left p-3 rounded-md border border-zinc-200 hover:border-zinc-200 hover:bg-zinc-50 transition-colors duration-150"
              >
                {knowledge?.customInstructions ? (
                  <p className="text-xs text-zinc-700 whitespace-pre-wrap line-clamp-4">
                    {knowledge.customInstructions}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-400 italic">
                    Add custom instructions for AnA RI on this project...
                  </p>
                )}
                <p className="text-xs text-zinc-400 mt-1">Click to edit</p>
              </button>
            )}
          </div>
        </Section>

        {/* ── Generated Artifacts Section ── */}
        <Section title="Generated Artifacts" icon={FileText} count={artifacts.length} defaultOpen={artifacts.length > 0}>
          <div className="px-4">
            {artifacts.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-4">
                Documents you create or generate will appear here with full version history.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {artifacts.slice(0, 20).map((artifact) => (
                  <li
                    key={artifact.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-50 transition-colors duration-150"
                  >
                    <FileText className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                    <span className="flex-1 text-xs text-zinc-700 truncate min-w-0" title={artifact.title}>
                      {artifact.title}
                    </span>
                    <span className="text-xs text-zinc-400 flex-shrink-0">
                      v{artifact.version}
                    </span>
                  </li>
                ))}
                {artifacts.length > 20 && (
                  <li className="text-xs text-zinc-400 px-2 py-1">
                    +{artifacts.length - 20} more artifacts
                  </li>
                )}
              </ul>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
};

export default ProjectKnowledgePanel;
