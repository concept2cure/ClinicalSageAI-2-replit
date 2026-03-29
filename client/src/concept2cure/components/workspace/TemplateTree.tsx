/**
 * TemplateTree — IND Pyramid template tree layered on CTD hierarchy.
 *
 * Shows template groups organized by CTD section. Each template can spawn
 * a new document pre-wired to the correct CTD section and template key.
 * Parent → subsection → micro-template hierarchy.
 *
 * Separate from DossierTree — this is the authoring launchpad,
 * not the submission structure.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown, Layers, Plus, Sparkles, Star, Wand2 } from 'lucide-react';
import { IND_TEMPLATES, type TemplateNode } from '../../models/ctdHierarchy';

// ── Types ────────────────────────────────────────────────────────────────────

/** Submission type determines which templates are highlighted as recommended. */
type SubmissionType = 'IND' | 'NDA' | 'BLA' | '510K' | 'PMA' | 'ANDA' | 'EUA' | string;

interface TemplateTreeProps {
  onCreateFromTemplate: (templateKey: string, ctdSection: string, label: string) => void;
  onOpenTransformCanvas?: (ctdSection: string, templateKey: string) => void;
  /** Submission type (e.g. 'IND', 'NDA', '510K') to surface recommended templates. */
  submissionType?: SubmissionType;
  className?: string;
}

// ── Recommended templates per submission type ───────────────────────────────

const RECOMMENDED_TEMPLATES: Record<string, string[]> = {
  IND: [
    'tpl-form-1571',         // Form FDA 1571
    'tpl-cover-initial',     // Initial IND Cover Letter
    'tpl-m2-2.5',            // Clinical Overview
    'tpl-m2-2.4',            // Nonclinical Overview
    'tpl-pre-ind-meeting',   // Pre-IND Meeting Package
  ],
  NDA: [
    'tpl-form-356h',         // Form FDA 356h
    'tpl-m2-2.5',            // Clinical Overview
    'tpl-m2-2.7',            // Clinical Summary
    'tpl-benefit-risk',      // Benefit-Risk Assessment
    'tpl-pre-nda-meeting',   // Pre-NDA Meeting Package
  ],
  BLA: [
    'tpl-form-356h',         // Form FDA 356h
    'tpl-m2-2.5',            // Clinical Overview
    'tpl-m2-2.7',            // Clinical Summary
    'tpl-m3-3.2.S',          // Drug Substance
    'tpl-benefit-risk',      // Benefit-Risk Assessment
  ],
  '510K': [
    'tpl-m1-cover',          // Cover Letters
    'tpl-m2-2.3',            // Quality Overall Summary
    'tpl-m2-2.5',            // Clinical Overview
    'tpl-dp-desc',           // Drug Product Description
  ],
  PMA: [
    'tpl-m2-2.5',            // Clinical Overview
    'tpl-m2-2.7',            // Clinical Summary
    'tpl-m5-csr',            // Clinical Study Reports
    'tpl-m3-3.2.P',          // Drug Product
    'tpl-benefit-risk',      // Benefit-Risk Assessment
  ],
  ANDA: [
    'tpl-form-356h',         // Form FDA 356h
    'tpl-m2-2.3',            // Quality Overall Summary
    'tpl-m3-3.2.S',          // Drug Substance
    'tpl-m3-3.2.P',          // Drug Product
    'tpl-m5-5.2',            // Tabular Listing of Clinical Studies
  ],
};

// ── Template node row ────────────────────────────────────────────────────────

interface TemplateNodeRowProps {
  node: TemplateNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (key: string) => void;
  onCreateFromTemplate: (templateKey: string, ctdSection: string, label: string) => void;
  onOpenTransformCanvas?: (ctdSection: string, templateKey: string) => void;
}

function TemplateNodeRow({
  node,
  depth,
  expanded,
  toggleExpand,
  onCreateFromTemplate,
  onOpenTransformCanvas,
}: TemplateNodeRowProps) {
  const isExpanded = expanded.has(node.templateKey);
  const hasChildren = node.children.length > 0;
  const isParent = depth === 0;

  return (
    <>
      <div
        className={cn(
          'w-full flex items-center gap-1 py-[4px] pr-2 text-left transition-colors group',
          'text-stone-600 hover:bg-stone-50'
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        data-testid={`template-node-${node.templateKey}`}
      >
        {/* Chevron or spacer */}
        {hasChildren ? (
          <button
            onClick={() => toggleExpand(node.templateKey)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? `Collapse ${node.label}` : `Expand ${node.label}`}
            className="shrink-0 p-0.5 rounded focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
          >
            {' '}
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-stone-400" />
            ) : (
              <ChevronRight className="w-3 h-3 text-stone-400" />
            )}
          </button>
        ) : (
          <span className="w-3 h-3 shrink-0" />
        )}

        {/* Icon */}
        {isParent ? (
          <Layers className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        ) : (
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        )}

        {/* CTD section badge */}
        <span className="text-xs text-stone-400 font-mono shrink-0 min-w-[28px]">
          {node.ctdSection}
        </span>

        {/* Label */}
        <span className="text-sm truncate flex-1 leading-snug">{node.label}</span>

        {/* Template type badge */}
        {node.templateType && node.templateType !== 'starter' && (
          <span
            className={cn(
              'text-xs px-1 rounded shrink-0 font-medium',
              node.templateType === 'subsection'
                ? 'bg-blue-50 text-blue-600'
                : 'bg-amber-50 text-amber-600'
            )}
          >
            {node.templateType}
          </span>
        )}

        {/* Create button */}
        <button
          onClick={() => onCreateFromTemplate(node.templateKey, node.ctdSection, node.label)}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0 p-1 rounded hover:bg-violet-100 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
          title={`Create "${node.label}" from template`}
          aria-label={`Create ${node.label} from template`}
        >
          <Plus className="w-3 h-3 text-violet-600" />
        </button>
        {/* Transform Canvas button */}
        {onOpenTransformCanvas && (
          <button
            onClick={() => onOpenTransformCanvas(node.ctdSection, node.templateKey)}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0 p-1 rounded hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
            title={`Open Transform Canvas for "${node.label}"`}
            aria-label={`Open Transform Canvas for ${node.label}`}
          >
            <Wand2 className="w-3 h-3 text-amber-600" />
          </button>
        )}
      </div>

      {/* Children */}
      {isExpanded &&
        node.children.map(child => (
          <TemplateNodeRow
            key={child.templateKey}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            toggleExpand={toggleExpand}
            onCreateFromTemplate={onCreateFromTemplate}
            onOpenTransformCanvas={onOpenTransformCanvas}
          />
        ))}
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Recursively collect template nodes whose templateKey is in the target set. */
function collectNodes(nodes: TemplateNode[], keys: Set<string>): TemplateNode[] {
  const result: TemplateNode[] = [];
  for (const node of nodes) {
    if (keys.has(node.templateKey)) {
      result.push(node);
    }
    if (node.children.length > 0) {
      result.push(...collectNodes(node.children, keys));
    }
  }
  return result;
}

// ── Main component ───────────────────────────────────────────────────────────

export const TemplateTree: React.FC<TemplateTreeProps> = ({
  onCreateFromTemplate,
  onOpenTransformCanvas,
  submissionType,
  className,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleExpand = useCallback((key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /** Resolved recommended nodes for the current submission type. */
  const recommendedNodes = useMemo(() => {
    if (!submissionType) return [];
    const keys = RECOMMENDED_TEMPLATES[submissionType.toUpperCase()];
    if (!keys || keys.length === 0) return [];
    const keySet = new Set(keys);
    // Collect and preserve the order from the mapping
    const collected = collectNodes(IND_TEMPLATES, keySet);
    const byKey = new Map(collected.map(n => [n.templateKey, n]));
    return keys.map(k => byKey.get(k)).filter((n): n is TemplateNode => !!n);
  }, [submissionType]);

  return (
    <div className={cn('flex flex-col h-full', className)} data-testid="template-tree">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-stone-200 bg-stone-50/60 shrink-0">
        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
          Templates
        </span>
        <span className="text-xs text-stone-400 tabular-nums">
          {IND_TEMPLATES.length} groups
        </span>
      </div>

      {/* Tip */}
      <div className="px-3 py-2 border-b border-stone-200 bg-violet-50/40">
        <p className="text-xs text-violet-600 leading-relaxed">
          Templates are pre-structured documents wired to CTD sections. Click + to create a new
          document from any template.
        </p>
      </div>

      {/* Recommended section */}
      {recommendedNodes.length > 0 && (
        <div
          className="border-b border-stone-200 bg-stone-50 py-1"
          data-testid="template-tree-recommended"
          role="region"
          aria-label={`Recommended templates for ${submissionType}`}
        >
          <div className="flex items-center gap-1.5 px-3 py-1">
            <Star className="w-3 h-3 text-amber-500" />
            <span className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">
              Best for {submissionType}
            </span>
          </div>
          {recommendedNodes.map(node => (
            <div
              key={`rec-${node.templateKey}`}
              className={cn(
                'w-full flex items-center gap-1 py-[4px] pr-2 text-left transition-colors group',
                'text-stone-600 hover:bg-stone-100/70'
              )}
              style={{ paddingLeft: '12px' }}
              data-testid={`recommended-template-${node.templateKey}`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs text-stone-400 font-mono shrink-0 min-w-[28px]">
                {node.ctdSection}
              </span>
              <span className="text-sm truncate flex-1 leading-snug">{node.label}</span>
              <span className="text-[10px] text-stone-400 font-medium shrink-0">
                Recommended
              </span>
              <button
                onClick={() => onCreateFromTemplate(node.templateKey, node.ctdSection, node.label)}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0 p-1 rounded hover:bg-violet-100 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
                title={`Create "${node.label}" from template`}
                aria-label={`Create ${node.label} from template`}
              >
                <Plus className="w-3 h-3 text-violet-600" />
              </button>
              {onOpenTransformCanvas && (
                <button
                  onClick={() => onOpenTransformCanvas(node.ctdSection, node.templateKey)}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0 p-1 rounded hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
                  title={`Open Transform Canvas for "${node.label}"`}
                  aria-label={`Open Transform Canvas for ${node.label}`}
                >
                  <Wand2 className="w-3 h-3 text-amber-600" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tree body — full template list unchanged */}
      <div className="flex-1 overflow-y-auto py-1 zen-scroll" data-testid="template-tree-body">
        {IND_TEMPLATES.map(tpl => (
          <TemplateNodeRow
            key={tpl.templateKey}
            node={tpl}
            depth={0}
            expanded={expanded}
            toggleExpand={toggleExpand}
            onCreateFromTemplate={onCreateFromTemplate}
            onOpenTransformCanvas={onOpenTransformCanvas}
          />
        ))}
      </div>
    </div>
  );
};

export default TemplateTree;
