/**
 * Concept2Cure - Version History Component
 *
 * Claude.ai parity: Artifact version timeline with diff view.
 * Tracks all edits to artifacts with ability to restore any version.
 *
 * @module concept2cure/components/artifacts/VersionHistory
 * @version 1.0.0
 */

import React, { useState, useMemo } from 'react';
import type { Artifact, ArtifactVersion } from '../../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  History,
  RotateCcw,
  Eye,
  GitCompare,
  Clock,
  User,
  Sparkles,
  Check,
  ChevronRight,
  Download,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface VersionHistoryProps {
  artifact: Artifact;
  versions: ArtifactVersion[];
  currentVersionId: string;
  onRestoreVersion: (versionId: string) => void;
  onCompareVersions?: (versionA: string, versionB: string) => void;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const formatDateTime = (date: Date): string => {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  return formatDateTime(date);
};

const getChangeIcon = (changeType: string) => {
  switch (changeType) {
    case 'ai':
      return Sparkles;
    case 'user':
      return User;
    default:
      return Clock;
  }
};

const getChangeLabel = (changeType: string): string => {
  switch (changeType) {
    case 'ai':
      return 'RI';
    case 'user':
      return 'Manual edit';
    case 'restore':
      return 'Restored';
    default:
      return 'Updated';
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VERSION ITEM
// ─────────────────────────────────────────────────────────────────────────────

interface VersionItemProps {
  version: ArtifactVersion;
  isCurrent: boolean;
  isFirst: boolean;
  isSelected: boolean;
  compareTarget?: ArtifactVersion | null;
  onSelect: () => void;
  onRestore: () => void;
  onCompare?: () => void;
}

const VersionItem: React.FC<VersionItemProps> = ({
  version,
  isCurrent,
  isFirst,
  isSelected,
  compareTarget,
  onSelect,
  onRestore,
  onCompare,
}) => {
  const ChangeIcon = getChangeIcon(version.changeType);

  return (
    <div className={cn('relative pl-6', !isFirst && 'pt-4')}>
      {/* Timeline connector */}
      {!isFirst && <div className="absolute left-[11px] top-0 h-4 w-0.5 bg-gray-200" />}

      {/* Timeline dot */}
      <div
        className={cn(
          'absolute left-0 w-6 h-6 rounded-full flex items-center justify-center',
          isCurrent
            ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-500 ring-offset-2'
            : 'bg-gray-100 text-gray-500',
          isSelected && 'ring-2 ring-amber-400 ring-offset-1'
        )}
      >
        {isCurrent ? <Check className="h-3.5 w-3.5" /> : <ChangeIcon className="h-3.5 w-3.5" />}
      </div>

      {/* Version content */}
      <div
        className={cn(
          'group ml-4 p-3 rounded-lg transition-colors cursor-pointer',
          isSelected ? 'bg-amber-50 ring-1 ring-amber-200' : 'hover:bg-gray-50'
        )}
        onClick={onSelect}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn('text-sm font-medium', isCurrent ? 'text-blue-700' : 'text-gray-900')}
              >
                Version {version.versionNumber}
              </span>
              {isCurrent && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700"
                >
                  Current
                </Badge>
              )}
              {version.changeType === 'ai' && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                  RI
                </Badge>
              )}
            </div>

            {version.changeSummary && (
              <p className="text-xs text-gray-600 mt-1">{version.changeSummary}</p>
            )}

            <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
              <span>{getChangeLabel(version.changeType)}</span>
              <span>·</span>
              <span>{formatRelativeTime(version.createdAt)}</span>
            </div>
          </div>

          {/* Actions */}
          <div
            className={cn(
              'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'
            )}
          >
            {!isCurrent && (
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onRestore();
                      }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Restore this version</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {onCompare && (
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onCompare();
                      }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-purple-600 hover:bg-purple-50"
                    >
                      <GitCompare className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Compare versions</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DIFF VIEW
// ─────────────────────────────────────────────────────────────────────────────

interface DiffViewProps {
  versionA: ArtifactVersion;
  versionB: ArtifactVersion;
}

const DiffView: React.FC<DiffViewProps> = ({ versionA, versionB }) => {
  // Simple line-by-line diff visualization
  // In production, use a proper diff library
  const linesA = versionA.content.split('\n');
  const linesB = versionB.content.split('\n');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-red-100 border border-red-300" />
          <span className="text-gray-600">Version {versionA.versionNumber} (older)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-100 border border-green-300" />
          <span className="text-gray-600">Version {versionB.versionNumber} (newer)</span>
        </div>
      </div>

      <ScrollArea className="h-[400px] border rounded-lg">
        <div className="font-mono text-xs p-4">
          {linesB.map((line, idx) => {
            const oldLine = linesA[idx];
            const isNew = oldLine === undefined;
            const isChanged = oldLine !== line && oldLine !== undefined;
            const isRemoved = idx >= linesB.length && linesA[idx];

            return (
              <div
                key={idx}
                className={cn(
                  'px-2 py-0.5',
                  isNew && 'bg-green-50 text-green-800',
                  isChanged && 'bg-amber-50 text-amber-800',
                  isRemoved && 'bg-red-50 text-red-800 line-through'
                )}
              >
                <span className="inline-block w-8 text-gray-400 select-none">{idx + 1}</span>
                {line || ' '}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  artifact,
  versions,
  currentVersionId,
  onRestoreVersion,
  onCompareVersions,
  className,
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null);
  const [showDiffView, setShowDiffView] = useState(false);

  // Sort versions newest first
  const sortedVersions = useMemo(() => {
    return [...versions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [versions]);

  const selectedVersion = selectedVersionId ? versions.find(v => v.id === selectedVersionId) : null;
  const compareTarget = compareTargetId ? versions.find(v => v.id === compareTargetId) : null;

  const handleRestore = () => {
    if (restoreTargetId) {
      onRestoreVersion(restoreTargetId);
      setShowRestoreDialog(false);
      setRestoreTargetId(null);
    }
  };

  const versionCount = versions.length;

  return (
    <>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <button
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors',
              'text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              className
            )}
          >
            <History className="h-4 w-4" />
            <span>
              {versionCount} version{versionCount !== 1 ? 's' : ''}
            </span>
          </button>
        </DialogTrigger>

        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-gray-600" />
              Version History
            </DialogTitle>
            <DialogDescription>
              View and restore previous versions of "{artifact.title}"
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            {/* Compare mode toggle */}
            {onCompareVersions && (
              <div className="flex items-center justify-between mb-4">
                <Button
                  variant={compareMode ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setCompareMode(!compareMode);
                    setSelectedVersionId(null);
                    setCompareTargetId(null);
                  }}
                >
                  <GitCompare className="h-4 w-4 mr-2" />
                  {compareMode ? 'Exit Compare' : 'Compare Versions'}
                </Button>

                {compareMode && selectedVersion && compareTarget && (
                  <Button size="sm" onClick={() => setShowDiffView(true)}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Diff
                  </Button>
                )}
              </div>
            )}

            {compareMode && (
              <div className="p-3 bg-purple-50 rounded-lg text-sm text-purple-700 mb-4">
                {!selectedVersionId
                  ? 'Select the first version to compare'
                  : !compareTargetId
                    ? 'Now select the second version'
                    : `Comparing v${selectedVersion?.versionNumber} → v${compareTarget?.versionNumber}`}
              </div>
            )}

            {/* Version timeline */}
            <ScrollArea className="h-[350px] pr-2">
              <div className="py-2">
                {sortedVersions.map((version, idx) => (
                  <VersionItem
                    key={version.id}
                    version={version}
                    isCurrent={version.id === currentVersionId}
                    isFirst={idx === 0}
                    isSelected={
                      compareMode &&
                      (version.id === selectedVersionId || version.id === compareTargetId)
                    }
                    onSelect={() => {
                      if (compareMode) {
                        if (!selectedVersionId) {
                          setSelectedVersionId(version.id);
                        } else if (!compareTargetId && version.id !== selectedVersionId) {
                          setCompareTargetId(version.id);
                        } else {
                          setSelectedVersionId(version.id);
                          setCompareTargetId(null);
                        }
                      } else {
                        setSelectedVersionId(selectedVersionId === version.id ? null : version.id);
                      }
                    }}
                    onRestore={() => {
                      setRestoreTargetId(version.id);
                      setShowRestoreDialog(true);
                    }}
                    onCompare={
                      onCompareVersions
                        ? () => {
                            if (selectedVersionId && selectedVersionId !== version.id) {
                              setCompareTargetId(version.id);
                              setShowDiffView(true);
                            } else {
                              setSelectedVersionId(version.id);
                              setCompareMode(true);
                            }
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            </ScrollArea>

            {/* Footer actions */}
            <div className="mt-4 flex items-center justify-between pt-4 border-t">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export All Versions
              </Button>
              <span className="text-xs text-gray-400">{versionCount} total versions</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore confirmation dialog */}
      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new version with the content from the selected version. The current
              version will be preserved in history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>Restore Version</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diff view dialog */}
      <Dialog open={showDiffView} onOpenChange={setShowDiffView}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-purple-600" />
              Compare Versions
            </DialogTitle>
          </DialogHeader>
          {selectedVersion && compareTarget && (
            <DiffView versionA={selectedVersion} versionB={compareTarget} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VersionHistory;
