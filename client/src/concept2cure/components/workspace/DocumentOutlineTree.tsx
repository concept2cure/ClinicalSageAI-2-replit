/**
 * DocumentOutlineTree — Per-document structure navigator.
 *
 * When a document is open, shows headings, subsections, tables, evidence
 * blocks, and reviewer comment anchors. Click jumps to section.
 * Like Word/Google Docs document navigator.
 *
 * This is separate from DossierTree (submission structure) and
 * TemplateTree (authoring launchpad). It navigates WITHIN a document.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Heading1,
  Heading2,
  Heading3,
  Table2,
  Link2,
  MessageSquare,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileSearch,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export type OutlineNodeType = 'h1' | 'h2' | 'h3' | 'table' | 'evidence' | 'citation' | 'comment';

export interface OutlineNode {
  id: string;
  type: OutlineNodeType;
  label: string;
  depth: number;
  children: OutlineNode[];
}

interface DocumentOutlineTreeProps {
  /** Document content (HTML) to parse headings from */
  content?: string;
  /** Pre-parsed outline nodes (override content parsing) */
  nodes?: OutlineNode[];
  /** Document title */
  title?: string;
  /** Scroll/navigate to a specific heading or block */
  onNavigate?: (nodeId: string) => void;
  className?: string;
}

// ── Parse headings from HTML content ─────────────────────────────────────────

function parseOutlineFromHtml(html: string): OutlineNode[] {
  const nodes: OutlineNode[] = [];
  // Match h1-h3, table, and evidence/citation markers
  const regex =
    /<(h[1-3])[^>]*(?:id="([^"]*)")?[^>]*>(.*?)<\/\1>|<table[^>]*(?:id="([^"]*)")?[^>]*>|<!--\s*evidence:\s*(.*?)\s*-->|<!--\s*citation:\s*(.*?)\s*-->/gi;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(html)) !== null) {
    if (match[1]) {
      // Heading
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
      // Table
      const id = match[4] || `table-${idx}`;
      nodes.push({
        id,
        type: 'table',
        label: `Table ${nodes.filter(n => n.type === 'table').length + 1}`,
        depth: 1,
        children: [],
      });
    } else if (match[5]) {
      // Evidence block
      nodes.push({
        id: `evidence-${idx}`,
        type: 'evidence',
        label: match[5].trim(),
        depth: 1,
        children: [],
      });
    } else if (match[6]) {
      // Citation
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
          'w-full flex items-center gap-1 py-[3px] pr-2 text-left transition-colors',
          isActive ? 'bg-blue-50 text-blue-700' : 'text-zinc-600 hover:bg-zinc-50'
        )}
        style={{ paddingLeft: `${8 + node.depth * 12}px` }}
        title={node.label}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="w-3 h-3 shrink-0 text-zinc-400" />
          ) : (
            <ChevronRight className="w-3 h-3 shrink-0 text-zinc-400" />
          )
        ) : (
          <span className="w-3 h-3 shrink-0" />
        )}

        <OutlineIcon type={node.type} />
        <span className="text-[11px] truncate flex-1 leading-snug">{node.label}</span>
      </button>

      {expanded &&
        node.children.map(child => (
          <OutlineNodeRow key={child.id} node={child} activeId={activeId} onNavigate={onNavigate} />
        ))}
    </>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export const DocumentOutlineTree: React.FC<DocumentOutlineTreeProps> = ({
  content,
  nodes: externalNodes,
  title,
  onNavigate,
  className,
}) => {
  const [activeId, setActiveId] = useState<string | undefined>();

  const outlineNodes = useMemo(() => {
    if (externalNodes && externalNodes.length > 0) return externalNodes;
    if (content) return parseOutlineFromHtml(content);
    return [];
  }, [content, externalNodes]);

  const handleNavigate = useCallback(
    (nodeId: string) => {
      setActiveId(nodeId);
      onNavigate?.(nodeId);
    },
    [onNavigate]
  );

  if (outlineNodes.length === 0) {
    return (
      <div className={cn('flex flex-col h-full', className)} data-testid="document-outline-tree">
        <div className="flex items-center px-3 h-9 border-b border-zinc-100 bg-zinc-50/60 shrink-0">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Outline
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <FileSearch className="w-5 h-5 text-zinc-200 mx-auto mb-2" />
            <p className="text-[11px] text-zinc-400">
              {content ? 'No headings found' : 'Open a document to see its outline'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)} data-testid="document-outline-tree">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-zinc-100 bg-zinc-50/60 shrink-0">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          Outline
        </span>
        <span className="text-[10px] text-zinc-400 tabular-nums">{outlineNodes.length} items</span>
      </div>

      {/* Document title */}
      {title && (
        <div className="px-3 py-1.5 border-b border-zinc-100">
          <p className="text-[11px] font-medium text-zinc-700 truncate">{title}</p>
        </div>
      )}

      {/* Outline body */}
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
    </div>
  );
};

export default DocumentOutlineTree;
