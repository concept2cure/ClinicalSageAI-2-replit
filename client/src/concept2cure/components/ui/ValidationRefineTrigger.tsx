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

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: '#fef2f2', text: '#dc2626', border: '#fca5a5' },
  major: { bg: '#fff7ed', text: '#ea580c', border: '#fdba74' },
  minor: { bg: '#fefce8', text: '#ca8a04', border: '#fde047' },
  info: { bg: '#f0f9ff', text: '#0284c7', border: '#7dd3fc' },
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
      <div className={className} style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
        No validation findings.
      </div>
    );
  }

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const majorCount = findings.filter(f => f.severity === 'major').length;

  return (
    <div className={className} style={{ fontSize: '13px' }}>
      {/* Header with summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: '#1e293b' }}>
            {findings.length} Finding{findings.length !== 1 ? 's' : ''}
          </span>
          {criticalCount > 0 && (
            <span style={{ padding: '1px 6px', borderRadius: '10px', fontSize: '11px', background: '#fef2f2', color: '#dc2626' }}>
              {criticalCount} critical
            </span>
          )}
          {majorCount > 0 && (
            <span style={{ padding: '1px 6px', borderRadius: '10px', fontSize: '11px', background: '#fff7ed', color: '#ea580c' }}>
              {majorCount} major
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={selectAll}
            style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}
          >
            Select All
          </button>
          <button
            type="button"
            onClick={selectedFindings.size > 0 ? handleRefineSelected : handleRefineAll}
            disabled={inlineAI.isLoading}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              border: 'none',
              borderRadius: '4px',
              background: inlineAI.isLoading ? '#94a3b8' : '#3b82f6',
              color: '#fff',
              cursor: inlineAI.isLoading ? 'wait' : 'pointer',
            }}
          >
            {inlineAI.isLoading ? 'Refining...' : selectedFindings.size > 0 ? `Refine ${selectedFindings.size} Selected` : 'Refine All'}
          </button>
        </div>
      </div>

      {/* Findings list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {visibleFindings.map((finding, index) => {
          const colors = SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.info;
          const isSelected = selectedFindings.has(index);
          const explanation = explanations.get(index);

          return (
            <div
              key={index}
              style={{
                padding: '8px 10px',
                border: `1px solid ${isSelected ? '#3b82f6' : colors.border}`,
                borderRadius: '6px',
                background: isSelected ? '#eff6ff' : colors.bg,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleFinding(index)}
                  style={{ marginTop: '2px', cursor: 'pointer' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ padding: '0 5px', borderRadius: '3px', fontSize: '10px', fontWeight: 600, background: colors.border, color: colors.text, textTransform: 'uppercase' }}>
                      {finding.severity}
                    </span>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>{finding.issueType}</span>
                    {finding.affectedSection && (
                      <span style={{ fontSize: '10px', color: '#64748b' }}>• {finding.affectedSection}</span>
                    )}
                  </div>
                  <div style={{ color: '#334155', marginBottom: '2px' }}>{finding.message}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    Recommendation: {finding.recommendation}
                  </div>

                  {/* Explanation (if fetched) */}
                  {explanation && (
                    <div style={{ marginTop: '6px', padding: '6px 8px', background: '#f8fafc', borderRadius: '4px', fontSize: '12px', color: '#475569', lineHeight: '1.4' }}>
                      {explanation}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleExplain(index)}
                  disabled={inlineAI.isLoading}
                  title="Explain this finding"
                  style={{ padding: '2px 6px', border: '1px solid #e2e8f0', borderRadius: '3px', background: '#fff', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap' }}
                >
                  💡 Explain
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
          style={{ marginTop: '8px', padding: '6px 12px', width: '100%', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#f8fafc', cursor: 'pointer', fontSize: '12px', color: '#64748b' }}
        >
          Show {findings.length - maxVisible} more findings
        </button>
      )}

      {/* Result panel */}
      {inlineAI.result && (
        <div style={{ marginTop: '12px', padding: '12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px' }}>
          <div style={{ fontWeight: 600, color: '#166534', marginBottom: '6px', fontSize: '12px' }}>Refined Content</div>
          <div style={{ fontSize: '13px', lineHeight: '1.5', color: '#334155', whiteSpace: 'pre-wrap', maxHeight: '200px', overflow: 'auto' }}>
            {inlineAI.result.content}
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(inlineAI.result?.content || '')}
              style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid #86efac', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => onRefined?.(inlineAI.result!)}
              style={{ padding: '4px 10px', fontSize: '11px', border: 'none', borderRadius: '4px', background: '#16a34a', color: '#fff', cursor: 'pointer' }}
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
