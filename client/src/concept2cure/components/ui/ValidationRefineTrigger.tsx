/**
 * ValidationRefineTrigger — Connect validation findings to AI refinement
 *
 * Phase 2 primitive. Renders actionable validation findings with
 * one-click AI refinement. Bridges validation → refinement workflow.
 *
 * Usage:
 *   <ValidationRefineTrigger
 *     findings={validationReport.findings}
 *     documentContent={originalContent}
 *     projectId={1}
 *     onRefined={(result) => updateDocument(result.content)}
 *   />
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useInlineAI, type InlineAIResult } from '../../hooks/useInlineAI';
import type { ValidationFinding, AIActionModuleType } from '../../hooks/useAIAction';

export interface ValidationRefineTriggerProps {
  /** Validation findings to display and act on. */
  findings: ValidationFinding[];
  /** Original document content to refine. */
  documentContent: string;
  /** Project scope. */
  projectId: number;
  /** Module context. */
  module?: AIActionModuleType;
  /** Document type for context. */
  documentType?: string;
  /** Target document ID. */
  targetId?: string | number;
  /** Called when refinement completes. */
  onRefined?: (result: InlineAIResult) => void;
  /** Called when a finding is explained. */
  onExplained?: (findingIndex: number, explanation: string) => void;
  /** Max findings to show initially. */
  maxVisible?: number;
  /** Additional CSS class. */
  className?: string;
}

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-300', badge: 'bg-red-200 text-red-700' },
  major: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-300', badge: 'bg-amber-200 text-amber-700' },
  minor: { bg: 'bg-yellow-50', text: 'text-yellow-600', border: 'border-yellow-300', badge: 'bg-yellow-200 text-yellow-700' },
  info: { bg: 'bg-stone-50', text: 'text-stone-600', border: 'border-stone-300', badge: 'bg-stone-200 text-stone-700' },
};

export function ValidationRefineTrigger({
  findings,
  documentContent,
  projectId,
  module,
  documentType,
  targetId,
  onRefined,
  onExplained,
  maxVisible = 10,
  className = '',
}: ValidationRefineTriggerProps) {
  const [selectedFindings, setSelectedFindings] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [explanations, setExplanations] = useState<Map<number, string>>(new Map());

  const inlineAI = useInlineAI({
    projectId,
    module,
    documentType,
    targetType: 'document',
    targetId,
    sourceSurface: 'validation_surface',
  });

  const visibleFindings = showAll ? findings : findings.slice(0, maxVisible);

  const toggleFinding = useCallback((index: number) => {
    setSelectedFindings(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedFindings(new Set(findings.map((_, i) => i)));
  }, [findings]);

  const handleRefineSelected = useCallback(async () => {
    const selected = Array.from(selectedFindings).map(i => findings[i]).filter(Boolean);
    if (selected.length === 0) return;

    const result = await inlineAI.refineWithFindings(documentContent, selected);
    if (result) {
      onRefined?.(result);
    }
  }, [selectedFindings, findings, documentContent, inlineAI, onRefined]);

  const handleRefineAll = useCallback(async () => {
    const result = await inlineAI.refineWithFindings(documentContent, findings);
    if (result) {
      onRefined?.(result);
    }
  }, [findings, documentContent, inlineAI, onRefined]);

  const handleExplain = useCallback(async (index: number) => {
    const finding = findings[index];
    if (!finding) return;

    const result = await inlineAI.explain(
      `Validation finding: [${finding.severity}] ${finding.message}\n\nRecommendation: ${finding.recommendation}\n\nAffected section: ${finding.affectedSection || 'N/A'}`
    );

    if (result) {
      setExplanations(prev => new Map(prev).set(index, result.content));
      onExplained?.(index, result.content);
    }
  }, [findings, inlineAI, onExplained]);

  if (findings.length === 0) {
    return (
      <div className={cn("p-4 text-center text-stone-500 text-[13px]", className)}>
        No validation findings.
      </div>
    );
  }

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const majorCount = findings.filter(f => f.severity === 'major').length;

  return (
    <div className={cn("text-[13px]", className)}>
      {/* Header with summary */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex gap-2 items-center">
          <span className="font-semibold text-stone-900">
            {findings.length} Finding{findings.length !== 1 ? 's' : ''}
          </span>
          {criticalCount > 0 && (
            <span className="px-1.5 rounded-full text-[11px] bg-red-50 text-red-600">
              {criticalCount} critical
            </span>
          )}
          {majorCount > 0 && (
            <span className="px-1.5 rounded-full text-[11px] bg-amber-50 text-amber-600">
              {majorCount} major
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={selectAll}
            className="px-2.5 py-1 text-[11px] border border-stone-200 rounded bg-white hover:bg-stone-50 cursor-pointer transition-colors"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={selectedFindings.size > 0 ? handleRefineSelected : handleRefineAll}
            disabled={inlineAI.isLoading}
            className={cn(
              "px-2.5 py-1 text-[11px] border-none rounded text-white transition-colors",
              inlineAI.isLoading
                ? "bg-stone-400 cursor-wait"
                : "bg-stone-800 hover:bg-stone-900 cursor-pointer"
            )}
          >
            {inlineAI.isLoading ? 'Refining...' : selectedFindings.size > 0 ? `Refine ${selectedFindings.size} Selected` : 'Refine All'}
          </button>
        </div>
      </div>

      {/* Findings list */}
      <div className="flex flex-col gap-1.5">
        {visibleFindings.map((finding, index) => {
          const config = SEVERITY_CONFIG[finding.severity] || SEVERITY_CONFIG.info;
          const isSelected = selectedFindings.has(index);
          const explanation = explanations.get(index);

          return (
            <div
              key={index}
              className={cn(
                "p-2 px-2.5 border rounded-md transition-all duration-150",
                isSelected
                  ? "border-stone-400 bg-stone-50"
                  : cn(config.border, config.bg)
              )}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleFinding(index)}
                  className="mt-0.5 cursor-pointer accent-stone-700"
                />
                <div className="flex-1">
                  <div className="flex gap-1.5 items-center mb-0.5">
                    <span className={cn("px-1.5 rounded text-[10px] font-semibold uppercase", config.badge)}>
                      {finding.severity}
                    </span>
                    <span className="text-[10px] text-stone-400">{finding.issueType}</span>
                    {finding.affectedSection && (
                      <span className="text-[10px] text-stone-500">&bull; {finding.affectedSection}</span>
                    )}
                  </div>
                  <div className="text-stone-700 mb-0.5">{finding.message}</div>
                  <div className="text-[11px] text-stone-500">
                    Recommendation: {finding.recommendation}
                  </div>

                  {explanation && (
                    <div className="mt-1.5 p-1.5 px-2 bg-stone-50 rounded text-[12px] text-stone-600 leading-snug">
                      {explanation}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleExplain(index)}
                  disabled={inlineAI.isLoading}
                  title="Explain this finding"
                  className="px-1.5 py-0.5 border border-stone-200 rounded bg-white hover:bg-stone-50 cursor-pointer text-[11px] whitespace-nowrap transition-colors"
                >
                  Explain
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more */}
      {findings.length > maxVisible && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 px-3 py-1.5 w-full border border-stone-200 rounded bg-stone-50 hover:bg-stone-100 cursor-pointer text-[12px] text-stone-500 transition-colors"
        >
          Show {findings.length - maxVisible} more findings
        </button>
      )}

      {/* Result panel */}
      {inlineAI.result && (
        <div className="mt-3 p-3 bg-emerald-50 border border-emerald-300 rounded-md">
          <div className="font-semibold text-emerald-800 mb-1.5 text-[12px]">Refined Content</div>
          <div className="text-[13px] leading-relaxed text-stone-700 whitespace-pre-wrap max-h-[200px] overflow-auto">
            {inlineAI.result.content}
          </div>
          <div className="flex gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(inlineAI.result?.content || '')}
              className="px-2.5 py-1 text-[11px] border border-emerald-300 rounded bg-white hover:bg-emerald-50 cursor-pointer transition-colors"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => onRefined?.(inlineAI.result!)}
              className="px-2.5 py-1 text-[11px] border-none rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors"
            >
              Apply Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ValidationRefineTrigger;
