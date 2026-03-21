/**
 * DocumentOutlineTree — Per-document structure navigator with template alignment.
 *
 * Two subviews:
 *   1. Document Outline — real headings from the document content
 *   2. Template Structure — expected subsections from the template
 *
 * Each outline node shows alignment signals: Template, CTD, or Unmapped.
 * Clicking a heading scrolls the document. Missing template sections are
 * shown so authors know what's needed.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Heading1,
  Heading2,
  Heading3,
  Table2,
  Link2,
  MessageSquare,
  BookOpen,
  ChevronRight,
  FileSearch,
  CheckCircle2,
  Circle,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { getTemplateStructure, findTemplateByKey } from '../../models/ctdHierarchy';

// ── Types ────────────────────────────────────────────────────────────────────

export type OutlineNodeType = 'h1' | 'h2' | 'h3' | 'table' | 'evidence' | 'citation' | 'comment';

export type AlignmentSignal = 'template' | 'ctd' | 'unmapped';

export interface OutlineNode {
  id: string;
  type: OutlineNodeType;
  label: string;
  depth: number;
  children: OutlineNode[];
  alignment?: AlignmentSignal;
}

type SubviewMode = 'outline' | 'structure';

interface DocumentOutlineTreeProps {
  /** Document content (HTML) to parse headings from */
  content?: string;
  /** Pre-parsed outline nodes (override content parsing) */
  nodes?: OutlineNode[];
  /** Document title */
  title?: string;
  /** Template key of the source template (if template-backed) */
  templateKey?: string;
  /** CTD section of the active document */
  ctdSection?: string;
  /** Scroll/navigate to a specific heading or block */
  onNavigate?: (nodeId: string) => void;
  /** Create a missing subsection from template */
  onCreateSubsection?: (subsectionKey: string, label: string) => void;
  className?: string;
}

// ── Parse headings from HTML content ─────────────────────────────────────────

function parseOutlineFromHtml(html: string): OutlineNode[] {
  const nodes: OutlineNode[] = [];
  const regex =
    /<(h[1-3])[^>]*(?:id="([^"]*)")?[^>]*>(.*?)<\/\1>|<table[^>]*(?:id="([^"]*)")?[^>]*>|<!--\s*evidence:\s*(.*?)\s*-->|<!--\s*citation:\s*(.*?)\s*-->/gi;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(html)) !== null) {
    if (match[1]) {
      const tag = match[1].toLowerCase() as 'h1' | 'h2' | 'h3';
      const id = match[2] || `outline-${idx}`;
      const text = match[3].replace(/<[^>]*>/g, '').trim();
      if (text) {
        nodes.push({
          id,
          type: tag,
          label: text,
          depth: tag === 'h1' ? 0 : tag === 'h2' ? 1 : 2,
          children: [],
        });
      }
    } else if (match[4] !== undefined || match[0].startsWith('<table')) {
      const id = match[4] || `table-${idx}`;
      nodes.push({
        id,
        type: 'table',
        label: `Table ${nodes.filter(n => n.type === 'table').length + 1}`,
        depth: 1,
        children: [],
      });
    } else if (match[5]) {
      nodes.push({
        id: `evidence-${idx}`,
        type: 'evidence',
        label: match[5].trim(),
        depth: 1,
        children: [],
      });
    } else if (match[6]) {
      nodes.push({
        id: `citation-${idx}`,
        type: 'citation',
        label: match[6].trim(),
        depth: 2,
        children: [],
      });
    }
    idx++;
  }

  return nodes;
}

// ── Compute alignment signals ────────────────────────────────────────────────

function computeAlignment(
  nodes: OutlineNode[],
  templateKey?: string,
  ctdSection?: string
): OutlineNode[] {
  if (!templateKey && !ctdSection) return nodes;

  // Get expected structure from template
  const templateStructure = templateKey ? getTemplateStructure(templateKey) : null;
  const templateLabels = templateStructure
    ? new Set(templateStructure.map(s => s.label.toLowerCase()))
    : new Set<string>();

  // CTD section keywords for matching
  const ctdKeywords = ctdSection
    ? new Set(
        ctdSection
          .split('.')
          .filter(Boolean)
          .map(p => p.toLowerCase())
      )
    : new Set<string>();

  return nodes.map(node => {
    const labelLower = node.label.toLowerCase();

    // Check template alignment (fuzzy match)
    let aligned: AlignmentSignal = 'unmapped';
    if (templateLabels.size > 0) {
      for (const tl of templateLabels) {
        if (labelLower.includes(tl) || tl.includes(labelLower) || fuzzyMatch(labelLower, tl)) {
          aligned = 'template';
          break;
        }
      }
    }

    // Check CTD alignment
    if (aligned === 'unmapped' && ctdKeywords.size > 0) {
      for (const kw of ctdKeywords) {
        if (labelLower.includes(kw)) {
          aligned = 'ctd';
          break;
        }
      }
    }

    return { ...node, alignment: aligned };
  });
}

function fuzzyMatch(a: string, b: string): boolean {
  // Simple token overlap — 60%+ token match = fuzzy hit
  const tokensA = a.split(/\s+/).filter(t => t.length > 2);
  const tokensB = b.split(/\s+/).filter(t => t.length > 2);
  if (tokensA.length === 0 || tokensB.length === 0) return false;
  const setB = new Set(tokensB);
  const hits = tokensA.filter(t => setB.has(t)).length;
  return hits / Math.max(tokensA.length, tokensB.length) >= 0.5;
}

// ── Node icon ────────────────────────────────────────────────────────────────

function OutlineIcon({ type }: { type: OutlineNodeType }) {
  switch (type) {
    case 'h1':
      return <Heading1 className="w-3.5 h-3.5 text-zinc-600 shrink-0" />;
    case 'h2':
      return <Heading2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />;
    case 'h3':
      return <Heading3 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
    case 'table':
      return <Table2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
    case 'evidence':
      return <BookOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
    case 'citation':
      return <Link2 className="w-3.5 h-3.5 text-violet-500 shrink-0" />;
    case 'comment':
      return <MessageSquare className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
  }
}

// ── Alignment tag ────────────────────────────────────────────────────────────

function AlignmentTag({ signal }: { signal?: AlignmentSignal }) {
  if (!signal || signal === 'unmapped') return null;
  return (
    <span
      className={cn(
        'text-xs px-1 rounded font-medium shrink-0 uppercase tracking-wide',
        signal === 'template' ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'
      )}
    >
      {signal === 'template' ? 'Tpl' : 'CTD'}
    </span>
  );
}

// ── Outline node row ─────────────────────────────────────────────────────────

interface OutlineNodeRowProps {
  node: OutlineNode;
  activeId?: string;
  onNavigate?: (nodeId: string) => void;
}

function OutlineNodeRow({ node, activeId, onNavigate }: OutlineNodeRowProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isActive = activeId === node.id;

  return (
    <>
      <button
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          onNavigate?.(node.id);
        }}
        className={cn(
          'w-full flex items-center gap-1 py-[3px] pr-2 text-left transition-all duration-150',
          isActive
            ? 'bg-blue-50 text-blue-700'
            : 'text-zinc-600 hover:bg-zinc-50 hover:translate-x-px'
        )}
        style={{ paddingLeft: `${8 + node.depth * 12}px` }}
        title={node.label}
      >
        {hasChildren ? (
          <ChevronRight
            className={cn(
              'w-3 h-3 shrink-0 text-zinc-400 transition-transform duration-150',
              expanded && 'rotate-90'
            )}
          />
        ) : (
          <span className="w-3 h-3 shrink-0" />
        )}

        <OutlineIcon type={node.type} />
        <span className="text-xs truncate flex-1 leading-snug">{node.label}</span>
        <AlignmentTag signal={node.alignment} />
      </button>

      {expanded &&
        node.children.map(child => (
          <OutlineNodeRow key={child.id} node={child} activeId={activeId} onNavigate={onNavigate} />
        ))}
    </>
  );
}

// ── Template structure view ──────────────────────────────────────────────────

interface StructureViewProps {
  templateKey: string;
  outlineLabels: Set<string>;
  onCreateSubsection?: (key: string, label: string) => void;
}

function TemplateStructureView({
  templateKey,
  outlineLabels,
  onCreateSubsection,
}: StructureViewProps) {
  const structure = useMemo(() => getTemplateStructure(templateKey), [templateKey]);
  const templateNode = useMemo(() => findTemplateByKey(templateKey), [templateKey]);

  if (!structure || structure.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <FileSearch className="w-5 h-5 text-zinc-200 mx-auto mb-2" />
          <p className="text-xs text-zinc-400">No template structure defined</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-1 zen-scroll">
      {templateNode && (
        <div className="px-3 py-1.5 border-b border-zinc-200 bg-violet-50/30">
          <p className="text-xs text-violet-600 font-medium">{templateNode.label}</p>
          <p className="text-xs text-zinc-400">{templateNode.ctdSection}</p>
        </div>
      )}
      {structure.map(item => {
        const present = isSubsectionPresent(item.label, outlineLabels);
        return (
          <div
            key={item.key}
            className={cn(
              'flex items-center gap-1.5 py-[4px] px-3 text-left transition-colors duration-150',
              present ? 'text-zinc-700' : 'text-zinc-400'
            )}
          >
            {present ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
            ) : item.required ? (
              <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
            ) : (
              <Circle className="w-3 h-3 text-zinc-400 shrink-0" />
            )}
            <span className="text-xs flex-1 truncate leading-snug">{item.label}</span>
            {item.required && !present && (
              <span className="text-xs px-1 rounded bg-amber-50 text-amber-600 font-medium shrink-0">
                Missing
              </span>
            )}
            {!item.required && !present && (
              <span className="text-xs px-1 rounded bg-zinc-50 text-zinc-400 font-medium shrink-0">
                Optional
              </span>
            )}
            {!present && onCreateSubsection && (
              <button
                onClick={() => onCreateSubsection(item.key, item.label)}
                className="p-0.5 text-zinc-400 hover:text-violet-600 rounded hover:bg-blue-50 shrink-0"
                title={`Create "${item.label}" section`}
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
      {/* Summary */}
      <div className="px-3 py-2 border-t border-zinc-200 mt-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400">Present</span>
          <span className="font-medium text-emerald-600">
            {structure.filter(s => isSubsectionPresent(s.label, outlineLabels)).length}/
            {structure.length}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs mt-0.5">
          <span className="text-zinc-400">Required missing</span>
          <span className="font-medium text-amber-600">
            {
              structure.filter(s => s.required && !isSubsectionPresent(s.label, outlineLabels))
                .length
            }
          </span>
        </div>
      </div>
    </div>
  );
}

function isSubsectionPresent(label: string, outlineLabels: Set<string>): boolean {
  const labelLower = label.toLowerCase();
  for (const ol of outlineLabels) {
    if (ol.includes(labelLower) || labelLower.includes(ol) || fuzzyMatch(ol, labelLower)) {
      return true;
    }
  }
  return false;
}

// ── Main component ───────────────────────────────────────────────────────────

export const DocumentOutlineTree: React.FC<DocumentOutlineTreeProps> = ({
  content,
  nodes: externalNodes,
  title,
  templateKey,
  ctdSection,
  onNavigate,
  onCreateSubsection,
  className,
}) => {
  const [activeId, setActiveId] = useState<string | undefined>();
  const [subview, setSubview] = useState<SubviewMode>('outline');

  const rawNodes = useMemo(() => {
    if (externalNodes && externalNodes.length > 0) return externalNodes;
    if (content) return parseOutlineFromHtml(content);
    return [];
  }, [content, externalNodes]);

  // Compute alignment signals
  const outlineNodes = useMemo(
    () => computeAlignment(rawNodes, templateKey, ctdSection),
    [rawNodes, templateKey, ctdSection]
  );

  // Collect outline heading labels for template structure matching
  const outlineLabels = useMemo(
    () => new Set(rawNodes.map(n => n.label.toLowerCase())),
    [rawNodes]
  );

  const hasTemplateStructure = !!templateKey && !!getTemplateStructure(templateKey);

  const handleNavigate = useCallback(
    (nodeId: string) => {
      setActiveId(nodeId);
      onNavigate?.(nodeId);
    },
    [onNavigate]
  );

  if (outlineNodes.length === 0 && !hasTemplateStructure) {
    return (
      <div className={cn('flex flex-col h-full', className)} data-testid="document-outline-tree">
        <div className="flex items-center px-3 h-8 border-b border-zinc-200 bg-zinc-50/60 shrink-0">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Outline
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <FileSearch className="w-5 h-5 text-zinc-200 mx-auto mb-2" />
            <p className="text-xs text-zinc-400">
              {content ? 'No headings found' : 'Open a document to see its outline'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)} data-testid="document-outline-tree">
      {/* Segmented mode toggle */}
      {hasTemplateStructure && (
        <div className="flex border-b border-zinc-200 shrink-0 bg-zinc-50/60">
          <button
            onClick={() => setSubview('outline')}
            className={cn(
              'flex-1 py-1.5 text-xs font-semibold transition-colors text-center',
              subview === 'outline'
                ? 'text-blue-700 bg-white border-b-2 border-blue-600'
                : 'text-zinc-400 hover:text-zinc-600'
            )}
            data-testid="outline-subview-outline"
          >
            Outline
          </button>
          <button
            onClick={() => setSubview('structure')}
            className={cn(
              'flex-1 py-1.5 text-xs font-semibold transition-colors text-center',
              subview === 'structure'
                ? 'text-violet-700 bg-white border-b-2 border-violet-600'
                : 'text-zinc-400 hover:text-zinc-600'
            )}
            data-testid="outline-subview-structure"
          >
            Structure
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-zinc-200 bg-zinc-50/60 shrink-0">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          {subview === 'structure' ? 'Template Structure' : 'Document Outline'}
        </span>
        {subview === 'outline' && (
          <span className="text-xs text-zinc-400 tabular-nums">{outlineNodes.length}</span>
        )}
      </div>

      {/* Document title */}
      {title && subview === 'outline' && (
        <div className="px-3 py-1 border-b border-zinc-200">
          <p className="text-xs font-medium text-zinc-700 truncate">{title}</p>
        </div>
      )}

      {/* Body */}
      {subview === 'structure' && templateKey ? (
        <TemplateStructureView
          templateKey={templateKey}
          outlineLabels={outlineLabels}
          onCreateSubsection={onCreateSubsection}
        />
      ) : (
        <div className="flex-1 overflow-y-auto py-1 zen-scroll" data-testid="outline-tree-body">
          {outlineNodes.map(node => (
            <OutlineNodeRow
              key={node.id}
              node={node}
              activeId={activeId}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentOutlineTree;
