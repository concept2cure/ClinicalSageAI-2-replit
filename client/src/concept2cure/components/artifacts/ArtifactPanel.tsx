/**
 * Concept2Cure - Artifact Panel
 *
 * Claude.ai-style artifact viewer panel (right side of split screen).
 * Renders documents, interactive tools, and visualizations.
 */

import React, { useState } from 'react';
import type { Artifact, ArtifactType } from '../../types';
import { useProject } from '../../context/ProjectContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  X,
  Download,
  Share2,
  Copy,
  History,
  Edit2,
  MoreHorizontal,
  FileText,
  BarChart3,
  Table2,
  Workflow,
  Network,
  ChevronRight,
  ExternalLink,
  Check,
  Maximize2,
  Minimize2,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// ARTIFACT TYPE ICONS & LABELS
// ─────────────────────────────────────────────────────────────────────────────

const artifactTypeConfig: Record<
  ArtifactType,
  { icon: React.ElementType; label: string; color: string }
> = {
  cover_letter: { icon: FileText, label: 'Cover Letter', color: 'text-blue-600' },
  device_description: { icon: FileText, label: 'Device Description', color: 'text-blue-600' },
  ifu_statement: { icon: FileText, label: 'IFU Statement', color: 'text-blue-600' },
  clinical_summary: { icon: FileText, label: 'Clinical Summary', color: 'text-blue-600' },
  se_summary: { icon: FileText, label: 'SE Summary', color: 'text-blue-600' },
  performance_summary: { icon: FileText, label: 'Performance Summary', color: 'text-blue-600' },
  labeling: { icon: FileText, label: 'Labeling', color: 'text-blue-600' },
  user_manual: { icon: FileText, label: 'User Manual', color: 'text-blue-600' },
  biocompatibility_summary: {
    icon: FileText,
    label: 'Biocompatibility Summary',
    color: 'text-blue-600',
  },
  software_documentation: {
    icon: FileText,
    label: 'Software Documentation',
    color: 'text-blue-600',
  },
  pyramid_gantt: { icon: BarChart3, label: 'Pyramid Gantt', color: 'text-purple-600' },
  risk_heatmap: { icon: BarChart3, label: 'Risk Heatmap', color: 'text-red-600' },
  traceability_matrix: { icon: Table2, label: 'Traceability Matrix', color: 'text-green-600' },
  protocol_designer: { icon: Workflow, label: 'Protocol Designer', color: 'text-orange-600' },
  ifu_checker: { icon: Workflow, label: 'IFU Checker', color: 'text-cyan-600' },
  predicate_search: { icon: Workflow, label: 'Predicate Search', color: 'text-indigo-600' },
  timeline_planner: { icon: Workflow, label: 'Timeline Planner', color: 'text-pink-600' },
  knowledge_graph: { icon: Network, label: 'Knowledge Graph', color: 'text-violet-600' },
  compliance_dashboard: {
    icon: BarChart3,
    label: 'Compliance Dashboard',
    color: 'text-emerald-600',
  },
  submission_progress: { icon: BarChart3, label: 'Submission Progress', color: 'text-sky-600' },
  document: { icon: FileText, label: 'Document', color: 'text-gray-600' },
  code: { icon: FileText, label: 'Code', color: 'text-gray-600' },
  table: { icon: Table2, label: 'Table', color: 'text-gray-600' },
  chart: { icon: BarChart3, label: 'Chart', color: 'text-gray-600' },
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT ARTIFACT RENDERER
// ─────────────────────────────────────────────────────────────────────────────

interface DocumentArtifactProps {
  content: string;
  isEditing: boolean;
  onContentChange: (content: string) => void;
}

const DocumentArtifact: React.FC<DocumentArtifactProps> = ({
  content,
  isEditing,
  onContentChange,
}) => {
  if (isEditing) {
    return (
      <textarea
        value={content}
        onChange={e => onContentChange(e.target.value)}
        className="w-full h-full p-6 font-mono text-sm bg-white border-0 focus:outline-none resize-none"
      />
    );
  }

  return (
    <div className="p-6 prose prose-sm max-w-none">
      <pre className="whitespace-pre-wrap font-sans text-gray-700 leading-relaxed">{content}</pre>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE ARTIFACT RENDERER (Risk Heatmap, etc.)
// ─────────────────────────────────────────────────────────────────────────────

interface InteractiveArtifactProps {
  type: ArtifactType;
  content: object;
}

const InteractiveArtifact: React.FC<InteractiveArtifactProps> = ({ type, content }) => {
  if (type === 'risk_heatmap') {
    const data = content as {
      risks: Array<{ id: string; category: string; severity: number; label: string }>;
    };

    return (
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Risk Analysis</h3>
        <div className="space-y-3">
          {data.risks?.map(risk => (
            <div key={risk.id} className="flex items-center gap-4 p-3 bg-white rounded-lg border">
              <div
                className={cn(
                  'w-3 h-3 rounded-full',
                  risk.severity > 0.7
                    ? 'bg-red-500'
                    : risk.severity > 0.4
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                )}
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900">{risk.label}</div>
                <div className="text-xs text-gray-500">{risk.category}</div>
              </div>
              <div className="text-sm font-medium">{Math.round(risk.severity * 100)}%</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default interactive view
  return (
    <div className="p-6">
      <pre className="text-xs bg-gray-100 p-4 rounded overflow-auto">
        {JSON.stringify(content, null, 2)}
      </pre>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// VERSION HISTORY SHEET
// ─────────────────────────────────────────────────────────────────────────────

interface VersionHistoryProps {
  artifact: Artifact;
  onSelectVersion: (version: number) => void;
}

const VersionHistory: React.FC<VersionHistoryProps> = ({ artifact, onSelectVersion }) => {
  return (
    <div className="space-y-3">
      {artifact.versions
        .slice()
        .reverse()
        .map(version => (
          <button
            key={version.version}
            onClick={() => onSelectVersion(version.version)}
            className={cn(
              'w-full p-3 text-left rounded-lg border transition-colors',
              version.version === artifact.version
                ? 'border-blue-300 bg-blue-50'
                : 'border-gray-200 hover:bg-gray-50'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">Version {version.version}</span>
              {version.version === artifact.version && (
                <Badge variant="secondary" className="text-xs">
                  Current
                </Badge>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {new Date(version.createdAt).toLocaleString()}
            </div>
            {version.changelog && (
              <div className="text-sm text-gray-600 mt-2">{version.changelog}</div>
            )}
          </button>
        ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ARTIFACT PANEL
// ─────────────────────────────────────────────────────────────────────────────

interface ArtifactPanelProps {
  artifact: Artifact | null;
}

export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ artifact }) => {
  const { setActiveArtifact, updateArtifact, publishArtifact, remixArtifact, activeProject } =
    useProject();

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!artifact) {
    return (
      <div className="flex items-center justify-center h-full text-center p-8">
        <div className="text-gray-500">
          <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p className="text-sm">No artifact selected</p>
          <p className="text-xs mt-1">Artifacts will appear here when RI creates them</p>
        </div>
      </div>
    );
  }

  const config = artifactTypeConfig[artifact.type] || artifactTypeConfig.document;
  const Icon = config.icon;
  const isDocument = artifact.category === 'document';

  const handleClose = () => {
    if (isEditing) {
      // Save changes before closing
      updateArtifact(artifact.id, { content: editContent });
      setIsEditing(false);
    }
    setActiveArtifact(null);
  };

  const handleStartEdit = () => {
    setEditContent(typeof artifact.content === 'string' ? artifact.content : '');
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    updateArtifact(artifact.id, { content: editContent });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent('');
  };

  const handleCopy = async () => {
    const content =
      typeof artifact.content === 'string'
        ? artifact.content
        : JSON.stringify(artifact.content, null, 2);
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content =
      typeof artifact.content === 'string'
        ? artifact.content
        : JSON.stringify(artifact.content, null, 2);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePublish = async () => {
    const link = await publishArtifact(artifact.id, false);
    await navigator.clipboard.writeText(link);
    // Show toast notification here
  };

  const handleRemix = async () => {
    if (activeProject) {
      await remixArtifact(artifact.id, activeProject.id);
    }
  };

  const handleSelectVersion = (version: number) => {
    const selectedVersion = artifact.versions.find(v => v.version === version);
    if (selectedVersion) {
      updateArtifact(artifact.id, {
        content: selectedVersion.content,
        version: selectedVersion.version,
      });
    }
    setShowVersionHistory(false);
  };

  return (
    <div className={cn('flex flex-col h-full', isFullscreen && 'fixed inset-0 z-50 bg-white')}>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Title */}
          <div className="flex items-center gap-3 min-w-0">
            <Icon className={cn('h-5 w-5 flex-shrink-0', config.color)} />
            <div className="min-w-0">
              <h2 className="font-medium text-gray-900 truncate">{artifact.title}</h2>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{config.label}</span>
                <span>•</span>
                <span>v{artifact.version}</span>
                {artifact.published && (
                  <>
                    <span>•</span>
                    <Badge variant="secondary" className="text-[10px]">
                      Published
                    </Badge>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <TooltipProvider>
              {/* Copy */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleCopy}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy</TooltipContent>
              </Tooltip>

              {/* Download */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleDownload}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Download</TooltipContent>
              </Tooltip>

              {/* Fullscreen */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* More actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {isDocument && (
                  <DropdownMenuItem onClick={isEditing ? handleSaveEdit : handleStartEdit}>
                    <Edit2 className="mr-2 h-4 w-4" />
                    {isEditing ? 'Save changes' : 'Edit'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShowVersionHistory(true)}>
                  <History className="mr-2 h-4 w-4" />
                  Version history
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handlePublish}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Publish
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleRemix}>
                  <Copy className="mr-2 h-4 w-4" />
                  Remix
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Close */}
            <button
              onClick={handleClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Edit mode toolbar */}
        {isEditing && (
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={handleSaveEdit}>
              <Check className="h-3 w-3 mr-1" />
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancelEdit}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {isDocument ? (
          <DocumentArtifact
            content={isEditing ? editContent : (artifact.content as string)}
            isEditing={isEditing}
            onContentChange={setEditContent}
          />
        ) : (
          <InteractiveArtifact type={artifact.type} content={artifact.content as object} />
        )}
      </ScrollArea>

      {/* Version History Sheet */}
      <Sheet open={showVersionHistory} onOpenChange={setShowVersionHistory}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Version History</SheetTitle>
            <SheetDescription>
              View and restore previous versions of this artifact.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <VersionHistory artifact={artifact} onSelectVersion={handleSelectVersion} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ArtifactPanel;
