/**
 * ProjectKnowledgePanel
 *
 * Claude.ai-style project knowledge sidebar panel per .claude/skills/project-design.md §4.
 * The "regulatory brain" dashboard combining:
 * - Context window usage bar
 * - Regulatory strategy (editable)
 * - Custom instructions (editable)
 * - Intelligence memory atoms (grouped by category)
 * - Project files with upload
 * - RIM signals summary
 * - Generated artifacts
 *
 * @module concept2cure/components/workspace/ProjectKnowledgePanel
 */

import React, { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useProjectKnowledge } from '../../hooks/useProjectKnowledge';
import { useProjectIntelligence, useIntelligenceDashboard, useEnrichIntelligence } from '../../hooks/useIntelligence';
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
  FolderOpen,
  File,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  AlertCircle,
  Lightbulb,
  AlertTriangle,
  HelpCircle,
  Bookmark,
  Zap,
  TrendingUp,
  ShieldCheck,
  Target,
  Activity,
  Plus,
} from 'lucide-react';
import { EmptyState } from '@/design-system/patterns/EmptyState';

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
    case 'pdf':
      return FileText;
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
    <div className="border-b border-zinc-100 last:border-0">
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
          <span className="text-[11px] text-zinc-400 tabular-nums">{count}</span>
        )}
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT USAGE BAR — per spec §4: green 0-60%, amber 61-85%, red 86-100%
// ─────────────────────────────────────────────────────────────────────────────

const ContextUsageBar: React.FC<{
  used: number;
  max: number;
  percent: number;
}> = ({ used, max, percent }) => {
  const color =
    percent > 85
      ? 'bg-red-500'
      : percent > 60
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  return (
    <div className="px-4 py-2.5 border-b border-zinc-100">
      <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1.5">
        <span className="font-medium">Context Usage</span>
        <span className="tabular-nums">
          ~{(used / 1000).toFixed(0)}K / {(max / 1000).toFixed(0)}K tokens
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', color)}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// EDITABLE TEXT BLOCK — for strategy + instructions
// ─────────────────────────────────────────────────────────────────────────────

const EditableTextBlock: React.FC<{
  value: string;
  placeholder: string;
  emptyText: string;
  onSave: (val: string) => Promise<void>;
}> = ({ value, placeholder, emptyText, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(value || '');
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="px-4 space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="text-xs min-h-[80px] border-zinc-200 resize-y"
          autoFocus
        />
        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
            className="text-xs h-7"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={saving}
            className="text-xs h-7 bg-zinc-900 text-white hover:bg-zinc-800"
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <Save className="w-3 h-3 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4">
      <button
        onClick={startEdit}
        className="w-full text-left p-2.5 rounded-md border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors duration-150"
      >
        {value ? (
          <p className="text-xs text-zinc-700 whitespace-pre-wrap line-clamp-3 leading-relaxed">
            {value}
          </p>
        ) : (
          <p className="text-xs text-zinc-400 italic">{emptyText}</p>
        )}
        <p className="text-[10px] text-zinc-400 mt-1">Click to edit</p>
      </button>
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
    addTextContent,
    removeDocument,
    updateCustomInstructions,
    contextTokens,
    maxContextTokens,
    contextUsagePercent,
    isUploading,
    uploadProgress,
  } = useProjectKnowledge(projectId);

  const { activeProject, projectArtifacts } = useProject();
  const { data: intelligence } = useProjectIntelligence(
    projectId ? Number(projectId) : 0
  );
  const { data: dashboard } = useIntelligenceDashboard(projectId);
  const enrichIntelligence = useEnrichIntelligence(projectId ? Number(projectId) : null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

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

  // Add text content state
  const [isAddingText, setIsAddingText] = useState(false);
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');

  const docs = knowledge?.documents ?? [];
  const artifacts = projectArtifacts ?? [];

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

  if (!projectId) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center py-12 text-center px-4',
          className
        )}
      >
        <FolderOpen className="w-8 h-8 text-zinc-200 mb-3" />
        <p className="text-xs text-zinc-500">
          Select a project to view its knowledge base
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-white', className)}>
      {/* Project header */}
      <div className="px-4 py-3 border-b border-zinc-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-violet-500" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-zinc-900 truncate">
              Project Knowledge
            </div>
            <div className="text-[11px] text-zinc-400">
              {activeProject?.submissionType || activeProject?.type || 'Submission'}{' '}
              &middot; {docs.length} files &middot; {artifacts.length} artifacts
            </div>
          </div>
        </div>
      </div>

      {/* Context usage bar */}
      <ContextUsageBar
        used={contextTokens}
        max={maxContextTokens}
        percent={contextUsagePercent}
      />

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Error banner */}
        {error && (
          <div className="mx-4 mb-2 mt-2 p-2 rounded-md bg-red-50 border border-red-100 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
            <span className="text-xs text-red-700">{error}</span>
          </div>
        )}

        {/* ── Regulatory Strategy Section (per spec §4) ── */}
        <Section title="Regulatory Strategy" icon={Target} defaultOpen={true}>
          <EditableTextBlock
            value={intelligence?.regulatoryStrategy || ''}
            placeholder="Describe the regulatory strategy for this project..."
            emptyText="Not set — AnA will build this as you work"
            onSave={async (val) => {
              await enrichIntelligence.mutateAsync({ regulatoryStrategy: val });
            }}
          />
        </Section>

        {/* ── Custom Instructions Section ── */}
        <Section title="Custom Instructions" icon={Settings2} defaultOpen={true}>
          <EditableTextBlock
            value={knowledge?.customInstructions || ''}
            placeholder="Tell AnA how to behave for this project. E.g., 'Always reference predicate device K123456. Use consistent IFU language.'"
            emptyText="Add custom instructions for AnA on this project..."
            onSave={async (val) => {
              await updateCustomInstructions(val);
            }}
          />
          {knowledge?.customInstructions && (
            <div className="px-4 mt-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <Activity className="w-2.5 h-2.5" />
                Active — injected into every conversation
              </span>
            </div>
          )}
        </Section>

        {/* ── Intelligence Memory Section (per spec §4 — grouped atoms) ── */}
        {intelligence && (
          <Section title="Intelligence Memory" icon={Brain} defaultOpen={true}>
            <div className="px-4 space-y-2.5">
              {/* Clinical targets */}
              {(intelligence.targetIndication || intelligence.targetPopulation) && (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-600">
                    <Bookmark className="w-3 h-3" />
                    Clinical Targets
                  </div>
                  {intelligence.targetIndication && (
                    <p className="text-[11px] text-zinc-500 leading-relaxed pl-4">
                      {intelligence.targetIndication}
                    </p>
                  )}
                  {intelligence.targetPopulation && (
                    <p className="text-[11px] text-zinc-500 leading-relaxed pl-4">
                      {intelligence.targetPopulation}
                    </p>
                  )}
                </div>
              )}

              {/* Learned insights */}
              {Array.isArray(intelligence.learnedInsights) &&
                intelligence.learnedInsights.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-600">
                      <Lightbulb className="w-3 h-3" />
                      Learned Insights ({intelligence.learnedInsights.length})
                    </div>
                    <ul className="space-y-0.5 pl-4">
                      {intelligence.learnedInsights
                        .slice(0, 5)
                        .map((insight: any, i: number) => (
                          <li
                            key={i}
                            className="text-[11px] text-zinc-500 leading-relaxed"
                          >
                            {typeof insight === 'string'
                              ? `• ${insight}`
                              : `• ${insight.insight || insight.content || JSON.stringify(insight)}`}
                          </li>
                        ))}
                      {intelligence.learnedInsights.length > 5 && (
                        <li className="text-[11px] text-zinc-400">
                          +{intelligence.learnedInsights.length - 5} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}

              {/* Risk factors */}
              {Array.isArray(intelligence.riskFactors) &&
                intelligence.riskFactors.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600">
                      <AlertTriangle className="w-3 h-3" />
                      Risk Factors ({intelligence.riskFactors.length})
                    </div>
                    <ul className="space-y-0.5 pl-4">
                      {intelligence.riskFactors
                        .slice(0, 3)
                        .map((risk: any, i: number) => (
                          <li key={i} className="text-[11px] text-zinc-500">
                            • {risk.risk || risk.description || JSON.stringify(risk)}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

              {/* Open questions */}
              {Array.isArray(intelligence.openQuestions) &&
                intelligence.openQuestions.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600">
                      <HelpCircle className="w-3 h-3" />
                      Open Questions ({intelligence.openQuestions.length})
                    </div>
                    <ul className="space-y-0.5 pl-4">
                      {intelligence.openQuestions
                        .slice(0, 3)
                        .map((q: any, i: number) => (
                          <li key={i} className="text-[11px] text-zinc-500">
                            • {q.question || JSON.stringify(q)}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

              {/* Stats footer */}
              {intelligence.documentStats && (
                <div className="text-[10px] text-zinc-400 pt-1.5 border-t border-zinc-100">
                  {intelligence.documentStats.totalIngested || 0} docs ingested
                  &middot; {intelligence.memoryEntryCount || 0} knowledge atoms
                </div>
              )}

              {/* Empty state */}
              {!intelligence.regulatoryStrategy &&
                !intelligence.targetIndication &&
                (!Array.isArray(intelligence.learnedInsights) ||
                  intelligence.learnedInsights.length === 0) && (
                  <p className="text-[11px] text-zinc-400 text-center py-2">
                    AnA will learn about this project as you upload documents and
                    have conversations.
                  </p>
                )}
            </div>
          </Section>
        )}

        {/* ── Project Files Section ── */}
        <Section title="Documents" icon={HardDrive} count={docs.length}>
          <div className="px-4">
            {/* Drop zone + upload button */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed text-xs cursor-pointer transition-all duration-150 mb-2',
                isDragging
                  ? 'border-violet-400 bg-violet-50 text-violet-600'
                  : isUploading
                    ? 'border-zinc-200 bg-zinc-50 text-zinc-400 cursor-wait'
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'
              )}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Uploading... {uploadProgress}%
                </>
              ) : isDragging ? (
                <>
                  <Upload className="w-4 h-4" />
                  Drop files here
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Drop files or click to upload
                </>
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

            {/* Add text content (Claude.ai parity) */}
            {isAddingText ? (
              <div className="space-y-2 mb-2 p-2 rounded-md border border-zinc-200 bg-zinc-50">
                <input
                  type="text"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="Title (e.g., Predicate device notes)"
                  className="w-full px-2 py-1 text-xs border border-zinc-200 rounded-md bg-white focus:ring-2 focus:ring-zinc-900 outline-none"
                />
                <Textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Paste or type content here..."
                  className="text-xs min-h-[80px] border-zinc-200 resize-y"
                />
                <div className="flex items-center gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsAddingText(false)}
                    className="text-xs h-7"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await addTextContent(
                        textTitle || 'Text content',
                        textContent
                      );
                      setTextTitle('');
                      setTextContent('');
                      setIsAddingText(false);
                    }}
                    disabled={!textContent.trim()}
                    className="text-xs h-7 bg-zinc-900 text-white hover:bg-zinc-800"
                  >
                    <Save className="w-3 h-3 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingText(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs text-zinc-500 hover:bg-zinc-50 transition-colors mb-2"
              >
                <FileText className="w-3.5 h-3.5" />
                Add text content
              </button>
            )}

            {/* File list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
              </div>
            ) : docs.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No documents added yet"
                description="Add your clinical study reports, predicate comparisons, or performance data. AnA will index them and reference them in every conversation."
                action={{
                  label: '+ Add content',
                  onClick: () => fileInputRef.current?.click(),
                  icon: Plus,
                }}
                size="sm"
                variant="minimal"
              />
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
                      <span
                        className="flex-1 text-xs text-zinc-700 truncate min-w-0"
                        title={doc.name}
                      >
                        {doc.name}
                      </span>
                      <span className="text-[11px] text-zinc-400 flex-shrink-0 tabular-nums">
                        {formatBytes(doc.size)}
                      </span>
                      {doc.tokenCount && (
                        <span className="text-[11px] text-zinc-400 flex-shrink-0 tabular-nums">
                          {(doc.tokenCount / 1000).toFixed(0)}K
                        </span>
                      )}
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove "${doc.name}" from project knowledge?`
                            )
                          ) {
                            removeDocument(doc.id);
                          }
                        }}
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150"
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
        </Section>

        {/* ── RIM Signals + Readiness Section (per spec §4) ── */}
        {dashboard && (
          <Section title="RIM Signals" icon={Zap} defaultOpen={true}>
            <div className="px-4 space-y-2.5">
              {/* Readiness score */}
              {dashboard.readiness && (
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-50">
                  <div className="flex-shrink-0">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold',
                        (dashboard.readiness.overallScore ?? 0) >= 80
                          ? 'bg-emerald-100 text-emerald-700'
                          : (dashboard.readiness.overallScore ?? 0) >= 50
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                      )}
                    >
                      {dashboard.readiness.overallScore ?? '—'}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-zinc-700">
                      Readiness Score
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {(dashboard.readiness.overallScore ?? 0) >= 80
                        ? 'On track for submission'
                        : (dashboard.readiness.overallScore ?? 0) >= 50
                          ? 'Gaps to address'
                          : 'Significant work remaining'}
                    </div>
                  </div>
                  <TrendingUp className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                </div>
              )}

              {/* Cross-module signals */}
              {dashboard.crossModule && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-600">
                    <ShieldCheck className="w-3 h-3" />
                    Cross-Module Signals
                  </div>
                  {dashboard.crossModule.bySeverity && (
                    <div className="flex items-center gap-3 text-[11px]">
                      {dashboard.crossModule.bySeverity.critical > 0 && (
                        <span className="flex items-center gap-1 text-red-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          {dashboard.crossModule.bySeverity.critical} critical
                        </span>
                      )}
                      {dashboard.crossModule.bySeverity.high > 0 && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          {dashboard.crossModule.bySeverity.high} high
                        </span>
                      )}
                      {dashboard.crossModule.bySeverity.medium +
                        dashboard.crossModule.bySeverity.low >
                        0 && (
                        <span className="flex items-center gap-1 text-zinc-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                          {dashboard.crossModule.bySeverity.medium +
                            dashboard.crossModule.bySeverity.low}{' '}
                          other
                        </span>
                      )}
                    </div>
                  )}
                  <div className="text-[10px] text-zinc-400">
                    {dashboard.crossModule.documentsCovered || 0} documents analyzed
                    &middot; {dashboard.crossModule.totalInsights || 0} insights
                  </div>
                </div>
              )}

              {/* Recommendations + actions count */}
              {dashboard.recommendations && (
                <div className="text-[10px] text-zinc-500 pt-1.5 border-t border-zinc-100">
                  {dashboard.recommendations.totalRecommendations || 0}{' '}
                  recommendations &middot;{' '}
                  {dashboard.nextActions?.totalActions || 0} next actions
                </div>
              )}

              {/* Empty state */}
              {!dashboard.readiness && !dashboard.crossModule && (
                <p className="text-[11px] text-zinc-400 text-center py-2">
                  Intelligence signals will accumulate as you work on this project.
                </p>
              )}
            </div>
          </Section>
        )}

        {/* ── Generated Artifacts Section ── */}
        <Section
          title="Generated Artifacts"
          icon={FileText}
          count={artifacts.length}
          defaultOpen={artifacts.length > 0}
        >
          <div className="px-4">
            {artifacts.length === 0 ? (
              <p className="text-[11px] text-zinc-400 text-center py-4">
                Documents you create or generate will appear here with full version
                history.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {artifacts.slice(0, 20).map((artifact) => (
                  <li
                    key={artifact.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-50 transition-colors duration-150"
                  >
                    <FileText className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                    <span
                      className="flex-1 text-xs text-zinc-700 truncate min-w-0"
                      title={artifact.title}
                    >
                      {artifact.title}
                    </span>
                    <span className="text-[11px] text-zinc-400 flex-shrink-0">
                      v{artifact.version}
                    </span>
                  </li>
                ))}
                {artifacts.length > 20 && (
                  <li className="text-[11px] text-zinc-400 px-2 py-1">
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
