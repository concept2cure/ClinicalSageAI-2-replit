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

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown, Layers, Plus, Sparkles, Wand2 } from 'lucide-react';
import { IND_TEMPLATES, type TemplateNode } from '../../models/ctdHierarchy';

// ── Types ────────────────────────────────────────────────────────────────────

interface TemplateTreeProps {
  onCreateFromTemplate: (templateKey: string, ctdSection: string, label: string) => void;
  onOpenTransformCanvas?: (ctdSection: string, templateKey: string) => void;
  className?: string;
}

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
          'text-zinc-600 hover:bg-zinc-50'
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
            className="shrink-0 p-0.5 rounded focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          >
            {' '}
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            ) : (
              <ChevronRight className="w-3 h-3 text-zinc-400" />
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
        <span className="text-[11px] text-zinc-400 font-mono shrink-0 min-w-[28px]">
          {node.ctdSection}
        </span>

        {/* Label */}
        <span className="text-[12px] truncate flex-1 leading-snug">{node.label}</span>

        {/* Template type badge */}
        {node.templateType && node.templateType !== 'starter' && (
          <span
            className={cn(
              'text-[11px] px-1 rounded shrink-0 font-medium',
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
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0 p-1 rounded hover:bg-violet-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          title={`Create "${node.label}" from template`}
          aria-label={`Create ${node.label} from template`}
        >
          <Plus className="w-3 h-3 text-violet-600" />
        </button>
        {/* Transform Canvas button */}
        {onOpenTransformCanvas && (
          <button
            onClick={() => onOpenTransformCanvas(node.ctdSection, node.templateKey)}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0 p-1 rounded hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
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

// ── Main component ───────────────────────────────────────────────────────────

export const TemplateTree: React.FC<TemplateTreeProps> = ({
  onCreateFromTemplate,
  onOpenTransformCanvas,
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

  return (
    <div className={cn('flex flex-col h-full', className)} data-testid="template-tree">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-zinc-200 bg-zinc-50/60 shrink-0">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          Templates
        </span>
        <span className="text-[11px] text-zinc-400 tabular-nums">
          {IND_TEMPLATES.length} groups
        </span>
      </div>

      {/* Tip */}
      <div className="px-3 py-2 border-b border-zinc-200 bg-violet-50/40">
        <p className="text-[11px] text-violet-600 leading-relaxed">
          Templates are pre-structured documents wired to CTD sections. Click + to create a new
          document from any template.
        </p>
      </div>

      {/* Tree body */}
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
