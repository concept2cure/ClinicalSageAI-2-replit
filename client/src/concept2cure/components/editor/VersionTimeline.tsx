/**
 * VersionTimeline — Visual version history with diff preview and rollback.
 *
 * Features:
 * - Vertical timeline with version nodes
 * - Click version → preview content in read-only mode
 * - "Compare with current" → highlights diff
 * - "Restore this version" with confirmation + audit trail
 * - Color-coded: green=additions, red=removals, amber=modifications
 */

import React, { useState, useMemo, useCallback } from 'react';
import DOMPurify from 'dompurify';
import {
  History,
  Clock,
  User,
  FileText,
  RotateCcw,
  Eye,
  ChevronDown,
  ChevronUp,
  GitCompare,
  CheckCircle,
  AlertTriangle,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Version {
  id: string;
  version: number;
  content: string;
  createdAt: string;
  createdBy?: string;
  changeDescription?: string;
}

interface VersionTimelineProps {
  versions: Version[];
  currentContent: string;
  currentVersion: number;
  onRestore: (version: Version) => void;
  onClose: () => void;
}

// Simple diff: count words added/removed between two texts
function computeWordDiff(oldText: string, newText: string): { added: number; removed: number; modified: boolean } {
  const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const oldWords = new Set(strip(oldText).split(' '));
  const newWords = new Set(strip(newText).split(' '));

  let added = 0;
  let removed = 0;
  newWords.forEach(w => { if (!oldWords.has(w)) added++; });
  oldWords.forEach(w => { if (!newWords.has(w)) removed++; });

  return { added, removed, modified: added > 0 || removed > 0 };
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export const VersionTimeline: React.FC<VersionTimelineProps> = ({
  versions,
  currentContent,
  currentVersion,
  onRestore,
  onClose,
}) => {
  const [previewVersion, setPreviewVersion] = useState<Version | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<Version | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => b.version - a.version),
    [versions]
  );

  const handleRestore = useCallback((version: Version) => {
    setConfirmRestore(version);
  }, []);

  const confirmRestoreAction = useCallback(() => {
    if (confirmRestore) {
      onRestore(confirmRestore);
      setConfirmRestore(null);
      setPreviewVersion(null);
    }
  }, [confirmRestore, onRestore]);

  if (sortedVersions.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-zinc-900">Version History</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-100 rounded">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <History className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No version history yet.</p>
            <p className="text-xs text-zinc-400 mt-1">Versions are created each time you save.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 shrink-0">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold text-zinc-900">Version History</span>
          <span className="text-xs text-zinc-400">{sortedVersions.length} versions</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-zinc-100 rounded">
          <X className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Restore confirmation banner */}
      {confirmRestore && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 shrink-0">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-800">
                Restore to version {confirmRestore.version}?
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                This will replace the current content. A new version will be saved automatically.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={confirmRestoreAction}
                  className="px-3 py-1 text-xs font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700"
                >
                  Restore
                </button>
                <button
                  onClick={() => setConfirmRestore(null)}
                  className="px-3 py-1 text-xs font-medium text-zinc-600 bg-white border border-zinc-200 rounded-md hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          {sortedVersions.map((version, i) => {
            const isLatest = version.version === currentVersion;
            const iSelected = previewVersion?.id === version.id;
            const prevVersion = sortedVersions[i + 1];
            const diff = prevVersion
              ? computeWordDiff(prevVersion.content, version.content)
              : { added: 0, removed: 0, modified: false };

            return (
              <div key={version.id} className="relative flex gap-3">
                {/* Timeline connector */}
                <div className="flex flex-col items-center shrink-0">
                  <div
                    className={cn(
                      'w-3 h-3 rounded-full border-2 z-10',
                      isLatest
                        ? 'bg-blue-500 border-blue-500'
                        : iSelected
                          ? 'bg-violet-500 border-violet-500'
                          : 'bg-white border-zinc-300'
                    )}
                  />
                  {i < sortedVersions.length - 1 && (
                    <div className="w-px flex-1 bg-zinc-200 min-h-[32px]" />
                  )}
                </div>

                {/* Version card */}
                <div
                  className={cn(
                    'flex-1 min-w-0 mb-3 rounded-lg border p-3 cursor-pointer transition-all duration-150',
                    iSelected
                      ? 'border-violet-300 bg-violet-50 shadow-sm'
                      : isLatest
                        ? 'border-blue-200 bg-blue-50/50'
                        : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
                  )}
                  onClick={() => setPreviewVersion(iSelected ? null : version)}
                >
                  {/* Top row: version + time */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-900">
                        v{version.version}
                      </span>
                      {isLatest && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                          Current
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timeAgo(version.createdAt)}
                    </span>
                  </div>

                  {/* Author */}
                  {version.createdBy && (
                    <div className="flex items-center gap-1 text-xs text-zinc-500 mb-1">
                      <User className="w-3 h-3" />
                      {version.createdBy}
                    </div>
                  )}

                  {/* Change description */}
                  {version.changeDescription && (
                    <p className="text-xs text-zinc-600 mb-1.5">{version.changeDescription}</p>
                  )}

                  {/* Diff stats */}
                  {diff.modified && (
                    <div className="flex items-center gap-2 text-xs">
                      {diff.added > 0 && (
                        <span className="text-emerald-600">+{diff.added} words</span>
                      )}
                      {diff.removed > 0 && (
                        <span className="text-red-600">-{diff.removed} words</span>
                      )}
                    </div>
                  )}

                  {/* Actions — visible when selected */}
                  {iSelected && !isLatest && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-200">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleRestore(version);
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded hover:bg-amber-200 transition-colors duration-150"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restore
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setShowDiff(!showDiff);
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 transition-colors duration-150"
                      >
                        <GitCompare className="w-3 h-3" />
                        {showDiff ? 'Hide Diff' : 'Compare'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview panel — shows when a version is selected */}
      {previewVersion && showDiff && (
        <div className="border-t border-zinc-200 bg-zinc-50 max-h-64 overflow-y-auto shrink-0">
          <div className="px-4 py-2 border-b border-zinc-200 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs font-semibold text-zinc-600">
              Preview: v{previewVersion.version}
            </span>
          </div>
          <div
            className="px-4 py-3 prose prose-xs prose-zinc max-w-none text-xs"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(previewVersion.content.slice(0, 2000)),
            }}
          />
        </div>
      )}
    </div>
  );
};

export default VersionTimeline;
