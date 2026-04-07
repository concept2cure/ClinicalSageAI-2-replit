/**
 * DocumentDiff — Side-by-Side Document Diff Component
 *
 * Compares two versions of regulatory documents with:
 * - Synchronized scrolling
 * - Word-level diff highlighting (additions, deletions, modifications)
 * - Change navigation (next/previous)
 * - Per-block Accept / Reject controls for selective merging
 * - Statistics bar summarizing changes
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GitCompare,
  ChevronUp,
  ChevronDown,
  Check,
  X,
  Plus,
  Minus,
  ArrowRight,
  Eye,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentDiffProps {
  leftContent: string;
  rightContent: string;
  leftLabel?: string;
  rightLabel?: string;
  onAcceptChange?: (changeIndex: number) => void;
  onRejectChange?: (changeIndex: number) => void;
  onClose?: () => void;
}

interface DiffSegment {
  type: 'equal' | 'add' | 'remove';
  text: string;
}

interface DiffBlock {
  index: number;
  type: 'addition' | 'deletion' | 'modification';
  leftSegments: DiffSegment[];
  rightSegments: DiffSegment[];
}

// ---------------------------------------------------------------------------
// Word-level diff algorithm (LCS-based)
// ---------------------------------------------------------------------------

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function splitIntoWords(text: string): string[] {
  // Split on word boundaries while preserving whitespace tokens so we can
  // reconstruct the original text faithfully.
  return text.split(/(\s+)/).filter((w) => w.length > 0);
}

/**
 * Compute the Longest Common Subsequence table for two word arrays.
 */
function buildLcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/**
 * Back-track through the LCS table to produce a list of diff segments.
 */
function computeWordDiff(oldText: string, newText: string): DiffSegment[] {
  const a = splitIntoWords(stripHtmlTags(oldText));
  const b = splitIntoWords(stripHtmlTags(newText));
  const dp = buildLcsTable(a, b);

  const segments: DiffSegment[] = [];
  let i = a.length;
  let j = b.length;

  // We build the result in reverse then flip.
  const stack: DiffSegment[] = [];

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      stack.push({ type: 'equal', text: a[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      stack.push({ type: 'remove', text: a[i - 1] });
      i--;
    } else {
      stack.push({ type: 'add', text: b[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    stack.push({ type: 'remove', text: a[i - 1] });
    i--;
  }
  while (j > 0) {
    stack.push({ type: 'add', text: b[j - 1] });
    j--;
  }

  // Reverse to get the correct order.
  stack.reverse();

  // Merge consecutive segments of the same type for cleaner output.
  for (const seg of stack) {
    if (segments.length > 0 && segments[segments.length - 1].type === seg.type) {
      segments[segments.length - 1].text += seg.text;
    } else {
      segments.push({ ...seg });
    }
  }

  return segments;
}

/**
 * Convert a flat list of diff segments into structured DiffBlocks that pair
 * removed/added regions together (modifications) and isolate pure
 * additions / deletions.
 */
function buildDiffBlocks(segments: DiffSegment[]): {
  blocks: DiffBlock[];
  stats: { additions: number; deletions: number; modifications: number };
} {
  const blocks: DiffBlock[] = [];
  let idx = 0;
  let additions = 0;
  let deletions = 0;
  let modifications = 0;

  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];

    if (seg.type === 'equal') {
      // Equal blocks don't count as changes but we still include them so the
      // panels render matching content.
      blocks.push({
        index: -1, // non-change
        type: 'modification', // unused for equal
        leftSegments: [seg],
        rightSegments: [seg],
      });
      i++;
      continue;
    }

    // Gather consecutive non-equal segments.
    const removed: DiffSegment[] = [];
    const added: DiffSegment[] = [];

    while (i < segments.length && segments[i].type !== 'equal') {
      if (segments[i].type === 'remove') {
        removed.push(segments[i]);
      } else {
        added.push(segments[i]);
      }
      i++;
    }

    const changeIndex = idx++;
    if (removed.length > 0 && added.length > 0) {
      modifications++;
      blocks.push({
        index: changeIndex,
        type: 'modification',
        leftSegments: removed,
        rightSegments: added,
      });
    } else if (added.length > 0) {
      additions++;
      blocks.push({
        index: changeIndex,
        type: 'addition',
        leftSegments: [],
        rightSegments: added,
      });
    } else {
      deletions++;
      blocks.push({
        index: changeIndex,
        type: 'deletion',
        leftSegments: removed,
        rightSegments: [],
      });
    }
  }

  return { blocks, stats: { additions, deletions, modifications } };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SegmentSpan({ segment }: { segment: DiffSegment }) {
  return (
    <span
      className={cn(
        'whitespace-pre-wrap',
        segment.type === 'add' && 'bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200',
        segment.type === 'remove' && 'bg-red-100 text-red-900 line-through dark:bg-red-900/30 dark:text-red-200',
      )}
    >
      {segment.text}
    </span>
  );
}

function ChangeToolbar({
  changeIndex,
  blockType,
  onAccept,
  onReject,
}: {
  changeIndex: number;
  blockType: DiffBlock['type'];
  onAccept?: (idx: number) => void;
  onReject?: (idx: number) => void;
}) {
  return (
    <div className="absolute -top-3 right-2 z-10 flex items-center gap-1 rounded border border-slate-200 bg-white px-1 py-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity dark:border-slate-700 dark:bg-slate-800">
      <span className="text-[10px] font-medium text-slate-500 mr-1 capitalize">
        {blockType}
      </span>
      {onAccept && (
        <button
          type="button"
          onClick={() => onAccept(changeIndex)}
          className="rounded p-0.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30"
          title="Accept change"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      )}
      {onReject && (
        <button
          type="button"
          onClick={() => onReject(changeIndex)}
          className="rounded p-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
          title="Reject change"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DocumentDiff({
  leftContent,
  rightContent,
  leftLabel = 'Version A',
  rightLabel = 'Version B',
  onAcceptChange,
  onRejectChange,
  onClose,
}: DocumentDiffProps) {
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);

  const [activeChangeIdx, setActiveChangeIdx] = useState<number>(0);

  // Compute diff ---------------------------------------------------------
  const { blocks, stats } = useMemo(() => {
    const segments = computeWordDiff(leftContent, rightContent);
    return buildDiffBlocks(segments);
  }, [leftContent, rightContent]);

  // Only change-blocks (those with an index >= 0) are navigable.
  const changeBlocks = useMemo(() => blocks.filter((b) => b.index >= 0), [blocks]);

  // Refs for scrolling to a specific change block.
  const changeRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Synchronized scrolling -----------------------------------------------
  const handleScroll = useCallback(
    (source: 'left' | 'right') => {
      if (isSyncingScroll.current) return;
      isSyncingScroll.current = true;

      const from = source === 'left' ? leftPanelRef.current : rightPanelRef.current;
      const to = source === 'left' ? rightPanelRef.current : leftPanelRef.current;

      if (from && to) {
        to.scrollTop = from.scrollTop;
        to.scrollLeft = from.scrollLeft;
      }

      requestAnimationFrame(() => {
        isSyncingScroll.current = false;
      });
    },
    [],
  );

  // Navigation -----------------------------------------------------------
  const navigateChange = useCallback(
    (direction: 'next' | 'prev') => {
      if (changeBlocks.length === 0) return;
      setActiveChangeIdx((prev) => {
        let next: number;
        if (direction === 'next') {
          next = prev + 1 >= changeBlocks.length ? 0 : prev + 1;
        } else {
          next = prev - 1 < 0 ? changeBlocks.length - 1 : prev - 1;
        }
        return next;
      });
    },
    [changeBlocks.length],
  );

  // Scroll into view when active change changes.
  useEffect(() => {
    if (changeBlocks.length === 0) return;
    const block = changeBlocks[activeChangeIdx];
    if (!block) return;
    const el = changeRefs.current.get(block.index);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeChangeIdx, changeBlocks]);

  // Keyboard shortcuts ---------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault();
        navigateChange('next');
      } else if (e.key === 'ArrowUp' && e.altKey) {
        e.preventDefault();
        navigateChange('prev');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigateChange]);

  // Render helpers -------------------------------------------------------
  const bgForType = (type: DiffBlock['type'], isActive: boolean) =>
    cn(
      'relative group rounded px-2 py-1 my-0.5 transition-colors duration-150',
      type === 'addition' && 'bg-green-50 dark:bg-green-900/20',
      type === 'deletion' && 'bg-red-50 dark:bg-red-900/20',
      type === 'modification' && 'bg-amber-50 dark:bg-amber-900/20',
      isActive && 'ring-2 ring-blue-400',
    );

  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full border border-slate-200 rounded-lg overflow-hidden bg-white dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <GitCompare className="h-4 w-4" />
          <span>Document Comparison</span>
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-normal text-slate-500 dark:text-slate-400">
            {leftLabel} vs {rightLabel}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Navigation */}
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => navigateChange('prev')}
              className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700"
              title="Previous change (Alt+Up)"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <span>
              {changeBlocks.length > 0 ? activeChangeIdx + 1 : 0}/{changeBlocks.length}
            </span>
            <button
              type="button"
              onClick={() => navigateChange('next')}
              className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700"
              title="Next change (Alt+Down)"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
              title="Close diff view"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-50/60 px-4 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800/60">
        <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
          <Plus className="h-3 w-3" />
          {stats.additions} addition{stats.additions !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1 text-red-700 dark:text-red-400">
          <Minus className="h-3 w-3" />
          {stats.deletions} deletion{stats.deletions !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
          <Eye className="h-3 w-3" />
          {stats.modifications} modification{stats.modifications !== 1 ? 's' : ''}
        </span>
        <span className="ml-auto flex items-center gap-1 text-slate-400">
          <Copy className="h-3 w-3" />
          {changeBlocks.length} total change{changeBlocks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Diff panels */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <div className="flex flex-1 flex-col border-r border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-red-50/40 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-red-900/10 dark:text-slate-300">
            <Minus className="h-3 w-3 text-red-500" />
            {leftLabel}
          </div>
          <div
            ref={leftPanelRef}
            onScroll={() => handleScroll('left')}
            className="flex-1 overflow-auto p-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
          >
            {blocks.map((block, i) => {
              const isChange = block.index >= 0;
              const isActive =
                isChange &&
                changeBlocks[activeChangeIdx]?.index === block.index;

              if (!isChange) {
                // Equal content
                return (
                  <span key={`eq-l-${i}`} className="whitespace-pre-wrap">
                    {block.leftSegments.map((s, si) => (
                      <SegmentSpan key={si} segment={s} />
                    ))}
                  </span>
                );
              }

              if (block.type === 'addition') {
                // Addition — nothing on the left, show placeholder.
                return (
                  <div
                    key={`blk-l-${block.index}`}
                    ref={(el) => {
                      if (el) changeRefs.current.set(block.index, el);
                    }}
                    className={cn(
                      'relative my-0.5 rounded border border-dashed border-green-300 bg-green-50/30 px-2 py-1 text-xs text-green-400 italic dark:border-green-800 dark:bg-green-900/10',
                      isActive && 'ring-2 ring-blue-400',
                    )}
                  >
                    (added in {rightLabel})
                  </div>
                );
              }

              return (
                <div
                  key={`blk-l-${block.index}`}
                  ref={(el) => {
                    if (el) changeRefs.current.set(block.index, el);
                  }}
                  className={bgForType(block.type, isActive)}
                >
                  <ChangeToolbar
                    changeIndex={block.index}
                    blockType={block.type}
                    onAccept={onAcceptChange}
                    onReject={onRejectChange}
                  />
                  {block.leftSegments.map((s, si) => (
                    <SegmentSpan key={si} segment={s} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-green-50/40 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-green-900/10 dark:text-slate-300">
            <Plus className="h-3 w-3 text-green-500" />
            {rightLabel}
          </div>
          <div
            ref={rightPanelRef}
            onScroll={() => handleScroll('right')}
            className="flex-1 overflow-auto p-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
          >
            {blocks.map((block, i) => {
              const isChange = block.index >= 0;
              const isActive =
                isChange &&
                changeBlocks[activeChangeIdx]?.index === block.index;

              if (!isChange) {
                return (
                  <span key={`eq-r-${i}`} className="whitespace-pre-wrap">
                    {block.rightSegments.map((s, si) => (
                      <SegmentSpan key={si} segment={s} />
                    ))}
                  </span>
                );
              }

              if (block.type === 'deletion') {
                return (
                  <div
                    key={`blk-r-${block.index}`}
                    className={cn(
                      'relative my-0.5 rounded border border-dashed border-red-300 bg-red-50/30 px-2 py-1 text-xs text-red-400 italic dark:border-red-800 dark:bg-red-900/10',
                      isActive && 'ring-2 ring-blue-400',
                    )}
                  >
                    (removed from {leftLabel})
                  </div>
                );
              }

              return (
                <div
                  key={`blk-r-${block.index}`}
                  className={bgForType(block.type, isActive)}
                >
                  <ChangeToolbar
                    changeIndex={block.index}
                    blockType={block.type}
                    onAccept={onAcceptChange}
                    onReject={onRejectChange}
                  />
                  {block.rightSegments.map((s, si) => (
                    <SegmentSpan key={si} segment={s} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentDiff;
