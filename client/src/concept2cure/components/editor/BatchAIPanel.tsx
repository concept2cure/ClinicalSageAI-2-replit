/**
 * BatchAIPanel — Batch AI Operations panel for the regulatory document editor.
 *
 * Allows users to apply AI actions (Rewrite, Expand, Summarize, Regulatory Tone,
 * Add References) across multiple document sections simultaneously. Sections are
 * parsed from H1/H2/H3 headings in the editor content.
 *
 * Features:
 * - Sequential processing with live progress bar
 * - Per-section diff preview before applying
 * - Apply All / Apply Selected / Cancel mid-operation
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  Sparkles,
  Play,
  Pause,
  Check,
  X,
  ChevronDown,
  Loader2,
  RotateCcw,
  Layers,
  Zap,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BatchAIPanelProps {
  content: string;
  submissionType?: string;
  onApply: (newContent: string) => void;
  onClose: () => void;
}

type AIAction = 'rewrite' | 'expand' | 'summarize' | 'regulatory-tone' | 'add-references';

type SectionStatus = 'pending' | 'processing' | 'done' | 'error';

interface ParsedSection {
  id: string;
  heading: string;
  level: number; // 1 | 2 | 3
  text: string;
  startIndex: number;
  endIndex: number;
}

interface SectionResult {
  sectionId: string;
  status: SectionStatus;
  original: string;
  result: string | null;
  error: string | null;
  originalWordCount: number;
  resultWordCount: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AI_ACTIONS: { value: AIAction; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'rewrite', label: 'Rewrite', description: 'Rewrite for clarity and flow', icon: <RotateCcw className="w-4 h-4" /> },
  { value: 'expand', label: 'Expand', description: 'Add depth and detail', icon: <Layers className="w-4 h-4" /> },
  { value: 'summarize', label: 'Summarize', description: 'Condense to key points', icon: <Zap className="w-4 h-4" /> },
  { value: 'regulatory-tone', label: 'Regulatory Tone', description: 'Align with FDA/EMA language', icon: <Sparkles className="w-4 h-4" /> },
  { value: 'add-references', label: 'Add References', description: 'Insert supporting citations', icon: <AlertCircle className="w-4 h-4" /> },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Parse sections from HTML content by finding h1/h2/h3 tags.
 * Each section runs from its heading to the next heading of equal or higher level, or end-of-content.
 */
function parseSections(html: string): ParsedSection[] {
  const headingRegex = /<h([123])[^>]*>(.*?)<\/h\1>/gi;
  const matches: { level: number; heading: string; index: number; length: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = headingRegex.exec(html)) !== null) {
    matches.push({
      level: parseInt(m[1], 10),
      heading: m[2].replace(/<[^>]*>/g, '').trim(), // strip nested tags
      index: m.index,
      length: m[0].length,
    });
  }

  return matches.map((match, i) => {
    const startIndex = match.index;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index : html.length;
    const text = html.slice(startIndex, endIndex);
    return {
      id: `section-${i}`,
      heading: match.heading || `(Untitled Section ${i + 1})`,
      level: match.level,
      text,
      startIndex,
      endIndex,
    };
  });
}

/**
 * Rebuild the full document content by replacing section ranges with their AI results.
 */
function rebuildContent(
  originalContent: string,
  sections: ParsedSection[],
  results: Map<string, SectionResult>,
  selectedIds: Set<string>,
): string {
  // Process sections in reverse order so indices remain valid
  const sorted = [...sections]
    .filter((s) => selectedIds.has(s.id))
    .sort((a, b) => b.startIndex - a.startIndex);

  let output = originalContent;
  for (const section of sorted) {
    const result = results.get(section.id);
    if (result?.status === 'done' && result.result !== null) {
      output = output.slice(0, section.startIndex) + result.result + output.slice(section.endIndex);
    }
  }
  return output;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BatchAIPanel({ content, submissionType, onApply, onClose }: BatchAIPanelProps) {
  // State ------------------------------------------------------------------
  const [selectedAction, setSelectedAction] = useState<AIAction | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Map<string, SectionResult>>(new Map());
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const pauseRef = useRef(false);

  // Derived ----------------------------------------------------------------
  const sections = useMemo(() => parseSections(content), [content]);

  const completedCount = useMemo(
    () => [...results.values()].filter((r) => r.status === 'done' || r.status === 'error').length,
    [results],
  );

  const totalSelected = selectedSections.size;
  const progressPct = totalSelected > 0 ? Math.round((completedCount / totalSelected) * 100) : 0;

  const hasResults = results.size > 0;
  const allDone = hasResults && completedCount === totalSelected && !isRunning;

  // Handlers ---------------------------------------------------------------

  const toggleSection = useCallback((id: string) => {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedSections(new Set(sections.map((s) => s.id)));
  }, [sections]);

  const deselectAll = useCallback(() => {
    setSelectedSections(new Set());
  }, []);

  const resetResults = useCallback(() => {
    setResults(new Map());
    setIsRunning(false);
    setIsPaused(false);
    cancelRef.current = false;
    pauseRef.current = false;
    setExpandedSection(null);
  }, []);

  const processSections = useCallback(async () => {
    if (!selectedAction || selectedSections.size === 0) return;

    cancelRef.current = false;
    pauseRef.current = false;
    setIsRunning(true);
    setIsPaused(false);

    // Initialise results map for selected sections
    const initMap = new Map<string, SectionResult>();
    for (const section of sections) {
      if (!selectedSections.has(section.id)) continue;
      initMap.set(section.id, {
        sectionId: section.id,
        status: 'pending',
        original: section.text,
        result: null,
        error: null,
        originalWordCount: wordCount(section.text),
        resultWordCount: null,
      });
    }
    setResults(new Map(initMap));

    // Process sequentially
    for (const section of sections) {
      if (!selectedSections.has(section.id)) continue;
      if (cancelRef.current) break;

      // Wait while paused
      while (pauseRef.current && !cancelRef.current) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (cancelRef.current) break;

      // Mark processing
      setResults((prev) => {
        const next = new Map(prev);
        const entry = next.get(section.id);
        if (entry) next.set(section.id, { ...entry, status: 'processing' });
        return next;
      });

      try {
        const res = await fetch('/api/concept2cure/ai/edit-section', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            action: selectedAction,
            text: section.text,
            sectionTitle: section.heading,
            submissionType: submissionType ?? 'general',
          }),
        });

        if (!res.ok) {
          throw new Error(`Server responded with ${res.status}`);
        }

        const data = await res.json();
        const resultText: string = data.result ?? data.text ?? data.content ?? section.text;

        setResults((prev) => {
          const next = new Map(prev);
          next.set(section.id, {
            sectionId: section.id,
            status: 'done',
            original: section.text,
            result: resultText,
            error: null,
            originalWordCount: wordCount(section.text),
            resultWordCount: wordCount(resultText),
          });
          return next;
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setResults((prev) => {
          const next = new Map(prev);
          next.set(section.id, {
            sectionId: section.id,
            status: 'error',
            original: section.text,
            result: null,
            error: message,
            originalWordCount: wordCount(section.text),
            resultWordCount: null,
          });
          return next;
        });
      }
    }

    setIsRunning(false);
    setIsPaused(false);
  }, [selectedAction, selectedSections, sections, submissionType]);

  const handlePauseResume = useCallback(() => {
    if (isPaused) {
      pauseRef.current = false;
      setIsPaused(false);
    } else {
      pauseRef.current = true;
      setIsPaused(true);
    }
  }, [isPaused]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    pauseRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
  }, []);

  const handleApplyAll = useCallback(() => {
    const newContent = rebuildContent(content, sections, results, selectedSections);
    onApply(newContent);
  }, [content, sections, results, selectedSections, onApply]);

  const handleApplySelected = useCallback(
    (ids: Set<string>) => {
      const newContent = rebuildContent(content, sections, results, ids);
      onApply(newContent);
    },
    [content, sections, results, onApply],
  );

  // Render -----------------------------------------------------------------

  const actionInfo = AI_ACTIONS.find((a) => a.value === selectedAction);

  return (
    <div className="w-80 h-full flex flex-col bg-zinc-900 border-l border-zinc-700/60 text-zinc-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/60">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold tracking-tight">Batch AI Operations</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-700/60 transition-colors"
          aria-label="Close panel"
        >
          <X className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Action selector */}
        <div>
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5 block">
            AI Action
          </label>
          <div className="relative">
            <button
              onClick={() => setActionMenuOpen((v) => !v)}
              disabled={isRunning}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-colors',
                selectedAction
                  ? 'border-violet-500/50 bg-violet-500/10 text-violet-200'
                  : 'border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-zinc-500',
                isRunning && 'opacity-50 cursor-not-allowed',
              )}
            >
              <span className="flex items-center gap-2">
                {actionInfo?.icon}
                {actionInfo?.label ?? 'Select an action…'}
              </span>
              <ChevronDown className={cn('w-4 h-4 transition-transform', actionMenuOpen && 'rotate-180')} />
            </button>

            {actionMenuOpen && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-zinc-600 bg-zinc-800 shadow-xl py-1">
                {AI_ACTIONS.map((action) => (
                  <button
                    key={action.value}
                    onClick={() => {
                      setSelectedAction(action.value);
                      setActionMenuOpen(false);
                      resetResults();
                    }}
                    className={cn(
                      'w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-zinc-700/60 transition-colors',
                      selectedAction === action.value && 'bg-violet-500/10',
                    )}
                  >
                    <span className="mt-0.5 text-violet-400">{action.icon}</span>
                    <div>
                      <div className="text-sm font-medium text-zinc-100">{action.label}</div>
                      <div className="text-xs text-zinc-400">{action.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Section selector */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Sections ({sections.length})
            </label>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                disabled={isRunning}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-40"
              >
                All
              </button>
              <button
                onClick={deselectAll}
                disabled={isRunning}
                className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors disabled:opacity-40"
              >
                None
              </button>
            </div>
          </div>

          {sections.length === 0 && (
            <p className="text-xs text-zinc-500 italic">No headings found in the document.</p>
          )}

          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {sections.map((section) => {
              const result = results.get(section.id);
              const wc = wordCount(section.text);
              return (
                <button
                  key={section.id}
                  onClick={() => !isRunning && toggleSection(section.id)}
                  disabled={isRunning}
                  className={cn(
                    'w-full flex items-start gap-2 px-2.5 py-2 rounded-md text-left transition-colors',
                    selectedSections.has(section.id)
                      ? 'bg-blue-500/10 border border-blue-500/30'
                      : 'bg-zinc-800/50 border border-transparent hover:border-zinc-600',
                    isRunning && 'cursor-default',
                  )}
                >
                  {/* Checkbox */}
                  <div
                    className={cn(
                      'mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center',
                      selectedSections.has(section.id)
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-zinc-500',
                    )}
                  >
                    {selectedSections.has(section.id) && <Check className="w-3 h-3 text-white" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        'text-sm truncate',
                        section.level === 1 && 'font-semibold',
                        section.level === 2 && 'font-medium pl-2',
                        section.level === 3 && 'font-normal pl-4 text-zinc-300',
                      )}
                    >
                      {section.heading}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-zinc-500">{wc} words</span>
                      {result && <StatusBadge status={result.status} />}
                      {result?.status === 'done' && result.resultWordCount !== null && (
                        <WordCountDelta
                          original={result.originalWordCount}
                          updated={result.resultWordCount}
                        />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Progress bar */}
        {hasResults && (
          <div>
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span>
                {isRunning ? (isPaused ? 'Paused' : 'Processing…') : allDone ? 'Complete' : 'Stopped'}
              </span>
              <span>
                {completedCount}/{totalSelected} sections
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-700 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  allDone ? 'bg-emerald-500' : isPaused ? 'bg-amber-500' : 'bg-violet-500',
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Results preview */}
        {hasResults && (
          <div>
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5 block">
              Results
            </label>
            <div className="space-y-1.5">
              {sections
                .filter((s) => results.has(s.id))
                .map((section) => {
                  const result = results.get(section.id)!;
                  const isExpanded = expandedSection === section.id;
                  return (
                    <div
                      key={section.id}
                      className="rounded-md border border-zinc-700/60 bg-zinc-800/50 overflow-hidden"
                    >
                      <button
                        onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-zinc-700/30 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <StatusIcon status={result.status} />
                          <span className="text-sm truncate">{section.heading}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {result.status === 'done' && result.resultWordCount !== null && (
                            <WordCountDelta
                              original={result.originalWordCount}
                              updated={result.resultWordCount}
                            />
                          )}
                          <ChevronDown
                            className={cn(
                              'w-3.5 h-3.5 text-zinc-500 transition-transform',
                              isExpanded && 'rotate-180',
                            )}
                          />
                        </div>
                      </button>

                      {isExpanded && result.status === 'done' && result.result !== null && (
                        <div className="border-t border-zinc-700/60 px-3 py-2">
                          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                            <div>
                              <span className="text-zinc-500 block mb-0.5">Original</span>
                              <div className="bg-zinc-900 rounded p-2 max-h-32 overflow-y-auto text-zinc-400 leading-relaxed">
                                {stripHtml(result.original).slice(0, 500)}
                                {stripHtml(result.original).length > 500 && '…'}
                              </div>
                            </div>
                            <div>
                              <span className="text-zinc-500 block mb-0.5">Updated</span>
                              <div className="bg-violet-500/5 border border-violet-500/10 rounded p-2 max-h-32 overflow-y-auto text-zinc-200 leading-relaxed">
                                {stripHtml(result.result).slice(0, 500)}
                                {stripHtml(result.result).length > 500 && '…'}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              handleApplySelected(new Set([section.id]))
                            }
                            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                          >
                            Apply this section only
                          </button>
                        </div>
                      )}

                      {isExpanded && result.status === 'error' && (
                        <div className="border-t border-zinc-700/60 px-3 py-2">
                          <p className="text-xs text-red-400">{result.error}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-zinc-700/60 px-4 py-3 space-y-2">
        {!isRunning && !allDone && (
          <button
            onClick={processSections}
            disabled={!selectedAction || selectedSections.size === 0}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              selectedAction && selectedSections.size > 0
                ? 'bg-violet-600 hover:bg-violet-500 text-white'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed',
            )}
          >
            <Play className="w-4 h-4" />
            Run on {selectedSections.size} section{selectedSections.size !== 1 ? 's' : ''}
          </button>
        )}

        {isRunning && (
          <div className="flex gap-2">
            <button
              onClick={handlePauseResume}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 transition-colors"
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-red-600/20 text-red-300 hover:bg-red-600/30 transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </div>
        )}

        {allDone && (
          <div className="space-y-2">
            <button
              onClick={handleApplyAll}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              <Check className="w-4 h-4" />
              Apply All Changes
            </button>
            <button
              onClick={resetResults}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: SectionStatus }) {
  const map: Record<SectionStatus, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'text-zinc-500 bg-zinc-700/40' },
    processing: { label: 'Running', className: 'text-violet-300 bg-violet-500/20' },
    done: { label: 'Done', className: 'text-emerald-300 bg-emerald-500/20' },
    error: { label: 'Error', className: 'text-red-300 bg-red-500/20' },
  };
  const info = map[status];
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', info.className)}>
      {info.label}
    </span>
  );
}

function StatusIcon({ status }: { status: SectionStatus }) {
  switch (status) {
    case 'pending':
      return <div className="w-3.5 h-3.5 rounded-full border border-zinc-500" />;
    case 'processing':
      return <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />;
    case 'done':
      return <Check className="w-3.5 h-3.5 text-emerald-400" />;
    case 'error':
      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
  }
}

function WordCountDelta({ original, updated }: { original: number; updated: number }) {
  const delta = updated - original;
  if (delta === 0) return <span className="text-[10px] text-zinc-500">±0</span>;
  return (
    <span
      className={cn(
        'text-[10px] font-medium',
        delta > 0 ? 'text-emerald-400' : 'text-red-400',
      )}
    >
      {delta > 0 ? '+' : ''}
      {delta}
    </span>
  );
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default BatchAIPanel;
