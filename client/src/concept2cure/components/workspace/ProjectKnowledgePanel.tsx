/**
 * ProjectKnowledgePanel
 *
 * Claude.ai-style project knowledge sidebar. Clean 3-section layout:
 * 1. Custom instructions (editable)
 * 2. Files (upload + capacity + list)
 * 3. Activity (minimal intelligence summary, collapsed by default)
 */

import React, { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useProjectKnowledge } from '../../hooks/useProjectKnowledge';
import { useProjectIntelligence } from '../../hooks/useIntelligence';
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
  PenLine,
  FolderOpen,
  File,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  Save,
  Plus,
  Activity,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────���───────────────���────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  switch (type) {
    case 'pdf':
    case 'docx':
    case 'doc':
      return FileText;
    case 'xlsx':
    case 'xls':
    case 'csv':
      return FileSpreadsheet;
    case 'txt':
    case 'md':
      return FileCode;
    case 'png':
    case 'jpg':
    case 'jpeg':
      return ImageIcon;
    default:
      return File;
  }
}

// ────────────────────────────���─────────────────────────────��──────────────────
// MAIN COMPONENT
// ──────────────────────���───────────────────────────���──────────────────────────

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
    addTextContent,
    removeDocument,
    updateCustomInstructions,
    isUploading,
    uploadProgress,
  } = useProjectKnowledge(projectId);

  const { activeProject } = useProject();
  const { data: intelligence } = useProjectIntelligence(
    projectId ? Number(projectId) : 0
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState('');
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [isAddingText, setIsAddingText] = useState(false);
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');

  const docs = knowledge?.documents ?? [];
  const totalBytes = docs.reduce((sum: number, d: any) => sum + (d.size || 0), 0);
  const capacityMB = 50;
  const capacityPercent = Math.min(100, Math.round((totalBytes / (capacityMB * 1024 * 1024)) * 100));

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files || !projectId) return;
    for (let i = 0; i < files.length; i++) {
      await uploadDocument(files[i]);
    }
  }, [projectId, uploadDocument]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        await uploadDocument(files[i]);
      }
      e.target.value = '';
    },
    [uploadDocument]
  );

  const startEditInstructions = () => {
    setInstructionsDraft(knowledge?.customInstructions || '');
    setEditingInstructions(true);
  };

  const saveInstructions = async () => {
    setSavingInstructions(true);
    await updateCustomInstructions(instructionsDraft);
    setSavingInstructions(false);
    setEditingInstructions(false);
  };

  if (!projectId) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-center px-4', className)}>
        <FolderOpen className="w-8 h-8 text-stone-200 mb-3" />
        <p className="text-xs text-stone-500">Select a project to view its knowledge base</p>
      </div>
    );
  }

  // Intelligence activity stats
  const insightCount = Array.isArray(intelligence?.learnedInsights) ? intelligence.learnedInsights.length : 0;
  const riskCount = Array.isArray(intelligence?.riskFactors) ? intelligence.riskFactors.length : 0;
  const questionCount = Array.isArray(intelligence?.openQuestions) ? intelligence.openQuestions.length : 0;
  const hasActivity = insightCount > 0 || riskCount > 0 || questionCount > 0 || intelligence?.targetIndication;

  return (
    <div className={cn('flex flex-col h-full bg-white', className)}>
      {/* ── Panel header ── */}
      <div className="px-5 py-4 border-b border-stone-100 flex-shrink-0">
        <h3 className="text-[13px] font-semibold text-stone-800">Project knowledge</h3>
        <p className="text-[11px] text-stone-400 mt-0.5 leading-relaxed">
          Instructions and files that AnA uses in every conversation.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 p-2.5 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>

        {/* ── 1. Custom Instructions ── */}
        <div className="px-5 py-4 border-b border-stone-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-stone-700">Custom instructions</span>
            {!editingInstructions && (
              <button
                onClick={startEditInstructions}
                className="p-1 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded transition-colors"
                title="Edit instructions"
              >
                <PenLine className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {editingInstructions ? (
            <div className="space-y-2.5">
              <Textarea
                value={instructionsDraft}
                onChange={(e) => setInstructionsDraft(e.target.value)}
                placeholder="Tell AnA how to behave for this project. E.g., 'Always reference predicate device K123456. Use consistent IFU language.'"
                className="text-[13px] min-h-[100px] border-stone-200 bg-stone-50 rounded-lg resize-y focus:ring-stone-300 focus:border-stone-300"
                autoFocus
              />
              <div className="flex items-center gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingInstructions(false)}
                  className="text-xs h-7 text-stone-600"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={saveInstructions}
                  disabled={savingInstructions}
                  className="text-xs h-7 bg-stone-900 text-white hover:bg-stone-800"
                >
                  {savingInstructions ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={startEditInstructions}
              className="w-full text-left p-3 rounded-lg border border-stone-200 hover:border-stone-300 hover:bg-stone-50/50 transition-colors"
            >
              {knowledge?.customInstructions ? (
                <p className="text-[13px] text-stone-600 whitespace-pre-wrap line-clamp-4 leading-relaxed">
                  {knowledge.customInstructions}
                </p>
              ) : (
                <p className="text-[13px] text-stone-400">
                  Add instructions for AnA on this project...
                </p>
              )}
            </button>
          )}
        </div>

        {/* ── 2. Files ── */}
        <div className="px-5 py-4 border-b border-stone-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-stone-700">
              Files {docs.length > 0 && <span className="text-stone-400">({docs.length})</span>}
            </span>
            <button
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className="p-1 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded transition-colors"
              title="Upload files"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Capacity bar */}
          <div className="mb-3">
            <div className="w-full h-1 bg-stone-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  capacityPercent > 85 ? 'bg-red-500' : capacityPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                )}
                style={{ width: `${Math.max(capacityPercent, 1)}%` }}
              />
            </div>
            <p className="text-[11px] text-stone-400 mt-1">
              {formatBytes(totalBytes)} of {capacityMB}MB used
            </p>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-3 py-4 rounded-lg border-2 border-dashed text-xs cursor-pointer transition-all duration-150 mb-3',
              isDragging
                ? 'border-stone-400 bg-stone-50 text-stone-600'
                : isUploading
                  ? 'border-stone-200 bg-stone-50 text-stone-400 cursor-wait'
                  : 'border-stone-200 text-stone-500 hover:border-stone-300 hover:bg-stone-50'
            )}
          >
            {isUploading ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading... {uploadProgress}%</>
            ) : isDragging ? (
              <><Upload className="w-4 h-4" /> Drop files here</>
            ) : (
              <><Upload className="w-3.5 h-3.5" /> Drop files or click to upload</>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
            onChange={handleFileChange}
          />

          {/* Add text content */}
          {isAddingText ? (
            <div className="space-y-2 mb-3 p-3 rounded-lg border border-stone-200 bg-stone-50">
              <input
                type="text"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                placeholder="Title"
                className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg bg-white focus:ring-2 focus:ring-stone-300 outline-none"
              />
              <Textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste or type content..."
                className="text-xs min-h-[80px] border-stone-200 resize-y"
              />
              <div className="flex items-center gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setIsAddingText(false)} className="text-xs h-7">Cancel</Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    await addTextContent(textTitle || 'Text content', textContent);
                    setTextTitle('');
                    setTextContent('');
                    setIsAddingText(false);
                  }}
                  disabled={!textContent.trim()}
                  className="text-xs h-7 bg-stone-900 text-white hover:bg-stone-800"
                >
                  Add
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingText(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-stone-500 hover:bg-stone-50 transition-colors mb-3"
            >
              <FileText className="w-3.5 h-3.5" />
              Add text content
            </button>
          )}

          {/* File list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 text-stone-400 animate-spin" />
            </div>
          ) : docs.length === 0 ? (
            <p className="text-[11px] text-stone-400 text-center py-3 leading-relaxed">
              Upload clinical study reports, predicate comparisons, or performance data.
              AnA will reference them in every conversation.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {docs.map((doc: any) => {
                const Icon = getFileIcon(doc.type);
                return (
                  <li
                    key={doc.id}
                    className="group flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-stone-50 transition-colors"
                  >
                    <Icon className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                    <span className="flex-1 text-[13px] text-stone-700 truncate min-w-0" title={doc.name}>
                      {doc.name}
                    </span>
                    <span className="text-[11px] text-stone-400 flex-shrink-0 tabular-nums">
                      {formatBytes(doc.size)}
                    </span>
                    <button
                      onClick={() => {
                        if (window.confirm(`Remove "${doc.name}" from project knowledge?`)) {
                          removeDocument(doc.id);
                        }
                      }}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-stone-400 hover:text-red-500 hover:bg-red-50 transition-all"
                      title="Remove file"
                      aria-label={`Remove ${doc.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── 3. Activity (collapsible, minimal) ─�� */}
        {hasActivity && (
          <div className="px-5 py-4">
            <button
              onClick={() => setActivityOpen(o => !o)}
              className="w-full flex items-center gap-2 text-left"
            >
              {activityOpen ? (
                <ChevronDown className="w-3 h-3 text-stone-400" />
              ) : (
                <ChevronRight className="w-3 h-3 text-stone-400" />
              )}
              <Activity className="w-3.5 h-3.5 text-stone-400" />
              <span className="text-xs font-medium text-stone-700 flex-1">Activity</span>
              <span className="text-[11px] text-stone-400 tabular-nums">
                {insightCount + riskCount + questionCount}
              </span>
            </button>

            {activityOpen && (
              <div className="mt-3 space-y-2 pl-5">
                {intelligence?.targetIndication && (
                  <p className="text-[12px] text-stone-500 leading-relaxed">
                    <span className="font-medium text-stone-600">Target: </span>
                    {intelligence.targetIndication}
                  </p>
                )}
                {insightCount > 0 && (
                  <p className="text-[12px] text-stone-500">
                    {insightCount} learned insight{insightCount !== 1 ? 's' : ''}
                  </p>
                )}
                {riskCount > 0 && (
                  <p className="text-[12px] text-amber-600">
                    {riskCount} risk factor{riskCount !== 1 ? 's' : ''} identified
                  </p>
                )}
                {questionCount > 0 && (
                  <p className="text-[12px] text-stone-500">
                    {questionCount} open question{questionCount !== 1 ? 's' : ''}
                  </p>
                )}
                <p className="text-[11px] text-stone-400 pt-1">
                  AnA learns as you work — insights accumulate over time.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectKnowledgePanel;
