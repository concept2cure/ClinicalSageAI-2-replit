/**
 * DossierTree — Regulated eCTD submission structure tree.
 *
 * Renders the full ICH CTD Module 1-5 hierarchy from ctdHierarchy.ts,
 * overlaying real artifact counts per section. Compact, collapsible,
 * VS Code explorer style. Right-click context menu for governed
 * placement operations ("Place here…", "Move to…").
 *
 * NOT a casual file explorer. This is the official submission structure.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { LIFECYCLE } from '../ui/enterprise';
import {
  ChevronRight,
  Package,
  FolderOpen,
  Folder,
  FileText,
  Circle,
  CheckCircle2,
  Clock,
  Lock,
  AlertCircle,
  Eye,
  ShieldCheck,
  MoreHorizontal,
  ClipboardPaste,
  Info,
  MapPin,
  Sparkles,
  Link2,
  Target,
  AppWindow,
} from 'lucide-react';
import {
  CTD_HIERARCHY,
  getSectionRequirements,
  type DossierNode,
  type DossierNodeStatus,
} from '../../models/ctdHierarchy';
import type { TreeArtifact } from './ProjectFileTree';

// ── Types ────────────────────────────────────────────────────────────────────

interface DossierTreeProps {
  artifacts: TreeArtifact[];
  selectedSection?: string;
  onSelectSection: (ctdSection: string, nodeLabel: string) => void;
  onPlaceArtifact?: (ctdSection: string) => void;
  /** Override the default CTD hierarchy with submission-type-specific sections */
  customHierarchy?: DossierNode[];
  /** Per-section metrics from backend */
  metrics?: Record<
    string,
    {
      artifactCount: number;
      completionPercent: number;
      evidenceCount: number;
      precedentCount: number;
      draftCount?: number;
      reviewCount?: number;
      approvedCount?: number;
      lockedCount?: number;
      templateCoverageAvailable?: boolean;
    }
  >;
  /** Active pending move (cut/paste) */
  pendingMove?: { artifact: TreeArtifact; fromSection: string | null } | null;
  onPasteHere?: (ctdSection: string) => void;
  onViewRequirements?: (ctdSection: string) => void;
  onOpenTransformCanvas?: (ctdSection: string) => void;
  onOpenProgramTwin?: () => void;
  onOpenSubmissionApps?: (ctdSection: string) => void;
  /** Suggestion chip: create a document from a template in this section */
  onCreateFromTemplate?: (ctdSection: string) => void;
  /** Suggestion chip: draft a document with AI/RI in this section */
  onDraftWithAI?: (ctdSection: string) => void;
  /** Suggestion chip: attach an existing document to this section */
  onAttachExisting?: (ctdSection: string) => void;
  className?: string;
}

interface SectionCounts {
  [ctdSection: string]: {
    total: number;
    draft: number;
    review: number;
    approved: number;
    locked: number;
  };
}

// ── Status helpers ───────────────────────────────────────────────────────────

function computeSectionCounts(artifacts: TreeArtifact[]): SectionCounts {
  const counts: SectionCounts = {};
  for (const a of artifacts) {
    const section = a.ctdSection;
    if (!section) continue;
    if (!counts[section])
      counts[section] = { total: 0, draft: 0, review: 0, approved: 0, locked: 0 };
    counts[section].total++;
    const s = (a.status || 'draft').toLowerCase();
    if (s === 'approved') counts[section].approved++;
    else if (s === 'locked' || s === 'published') counts[section].locked++;
    else if (s === 'review' || s === 'under_review') counts[section].review++;
    else counts[section].draft++;
  }
  return counts;
}

function getNodeStatus(ctdSection: string, counts: SectionCounts): DossierNodeStatus {
  const c = counts[ctdSection];
  if (!c || c.total === 0) return 'empty';
  if (c.locked > 0) return 'locked';
  if (c.approved > 0 && c.approved === c.total) return 'approved';
  if (c.review > 0) return 'under_review';
  return 'draft_present';
}

function getAggregatedStatus(node: DossierNode, counts: SectionCounts): DossierNodeStatus {
  const direct = getNodeStatus(node.ctdSection, counts);
  if (direct !== 'empty') return direct;
  // Check children
  for (const child of node.children) {
    const cs = getAggregatedStatus(child, counts);
    if (cs !== 'empty') return cs;
  }
  return 'empty';
}

function getAggregatedCount(node: DossierNode, counts: SectionCounts): number {
  let total = counts[node.ctdSection]?.total ?? 0;
  for (const child of node.children) {
    total += getAggregatedCount(child, counts);
  }
  return total;
}

// ── Status icon ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  DossierNodeStatus,
  { icon: React.ReactNode; color: string; label: string }
> = {
  empty: { icon: <Circle className="w-3 h-3" />, color: LIFECYCLE.not_started.text, label: 'Empty' },
  draft_present: { icon: <Clock className="w-3 h-3" />, color: LIFECYCLE.draft.text, label: 'Draft' },
  under_review: { icon: <Eye className="w-3 h-3" />, color: LIFECYCLE.in_review.text, label: 'Review' },
  approved: {
    icon: <CheckCircle2 className="w-3 h-3" />,
    color: LIFECYCLE.approved.text,
    label: 'Approved',
  },
  locked: { icon: <Lock className="w-3 h-3" />, color: LIFECYCLE.published.text, label: 'Locked' },
  missing_evidence: {
    icon: <AlertCircle className="w-3 h-3" />,
    color: 'text-amber-500',
    label: 'Missing Evidence',
  },
  ready: { icon: <ShieldCheck className="w-3 h-3" />, color: LIFECYCLE.approved.text, label: 'Ready' },
};

function StatusIndicator({ status }: { status: DossierNodeStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn('shrink-0', cfg.color)} title={cfg.label}>
      {cfg.icon}
    </span>
  );
}

// ── Node icon by type ────────────────────────────────────────────────────────

function NodeIcon({ nodeType, isExpanded }: { nodeType: string; isExpanded: boolean }) {
  if (nodeType === 'module') return <Package className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  if (nodeType === 'section') {
    return isExpanded ? (
      <FolderOpen className="w-3.5 h-3.5 text-stone-400 shrink-0" />
    ) : (
      <Folder className="w-3.5 h-3.5 text-stone-400 shrink-0" />
    );
  }
  return <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />;
}

// ── Context menu ─────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  ctdSection: string;
  label: string;
}

// ── Tree node renderer ───────────────────────────────────────────────────────

interface DossierNodeRowProps {
  node: DossierNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (nodeId: string) => void;
  selectedSection?: string;
  onSelectSection: (ctdSection: string, label: string) => void;
  counts: SectionCounts;
  onContextMenu: (e: React.MouseEvent, node: DossierNode) => void;
  metrics?: Record<
    string,
    {
      artifactCount: number;
      completionPercent: number;
      evidenceCount: number;
      templateCoverageAvailable?: boolean;
      precedentCount: number;
      draftCount?: number;
      reviewCount?: number;
      approvedCount?: number;
      lockedCount?: number;
    }
  >;
  onCreateFromTemplate?: (ctdSection: string) => void;
  onDraftWithAI?: (ctdSection: string) => void;
  onAttachExisting?: (ctdSection: string) => void;
}

function DossierNodeRow({
  node,
  depth,
  expanded,
  toggleExpand,
  selectedSection,
  onSelectSection,
  counts,
  onContextMenu,
  metrics,
  onCreateFromTemplate,
  onDraftWithAI,
  onAttachExisting,
}: DossierNodeRowProps) {
  const isExpanded = expanded.has(node.nodeId);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedSection === node.ctdSection;
  const status = hasChildren
    ? getAggregatedStatus(node, counts)
    : getNodeStatus(node.ctdSection, counts);
  const docCount = getAggregatedCount(node, counts);

  // Required children check: how many required children have no artifacts?
  const reqs = getSectionRequirements(node.ctdSection);
  const missingRequired =
    reqs?.requiredChildren?.filter(
      childSection => !counts[childSection] || counts[childSection].total === 0
    ) ?? [];

  // Is this section required and currently empty/drafting? (for suggestion chips + required badge)
  const isRequired = reqs?.required ?? false;
  const isLeafOrDirect = node.nodeType === 'leaf' || node.nodeType === 'section';
  const showSuggestionChips =
    isLeafOrDirect &&
    (status === 'empty' || status === 'draft_present') &&
    (onCreateFromTemplate || onDraftWithAI || onAttachExisting);
  const showRequiredBadge = isRequired && status === 'empty' && isLeafOrDirect;

  return (
    <>
      <div className="group">
      <button
        onClick={() => {
          if (hasChildren) toggleExpand(node.nodeId);
          onSelectSection(node.ctdSection, node.label);
        }}
        onContextMenu={e => onContextMenu(e, node)}
        className={cn(
          'w-full flex items-center gap-1 py-[4px] pr-2 text-left transition-all duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400 focus-visible:outline-none',
          isSelected
            ? 'bg-blue-50 text-stone-700'
            : 'text-stone-600 hover:bg-stone-50 hover:translate-x-px'
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        data-testid={`dossier-node-${node.ctdSection}`}
        title={`${node.ctdSection} — ${node.label}`}
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        {/* Chevron */}
        {hasChildren ? (
          <ChevronRight
            className={cn(
              'w-3 h-3 shrink-0 text-stone-400 transition-transform duration-150',
              isExpanded && 'rotate-90'
            )}
          />
        ) : (
          <span className="w-3 h-3 shrink-0" />
        )}

        <NodeIcon nodeType={node.nodeType} isExpanded={isExpanded} />

        {/* Section number */}
        <span className="text-xs text-stone-400 font-mono shrink-0 min-w-[28px]">
          {node.ctdSection}
        </span>

        {/* Label */}
        <span className="text-sm truncate flex-1 leading-snug">
          {node.label.replace(/^Module \d+ — /, '')}
        </span>

        {/* Required badge for empty required sections */}
        {showRequiredBadge && (
          <span className="text-[10px] text-amber-500 font-medium shrink-0" aria-label="Required section">
            Required
          </span>
        )}

        {/* Count badge */}
        {docCount > 0 && (
          <span className="text-xs tabular-nums text-stone-400 shrink-0 bg-stone-100 rounded px-1">
            {docCount}
          </span>
        )}

        {/* Per-status breakdown (from backend metrics) */}
        {metrics?.[node.ctdSection] && metrics[node.ctdSection].artifactCount > 0 && (
          <span
            className="flex items-center gap-px shrink-0"
            title={`${metrics[node.ctdSection].draftCount ?? 0}D / ${metrics[node.ctdSection].reviewCount ?? 0}R / ${metrics[node.ctdSection].approvedCount ?? 0}A / ${metrics[node.ctdSection].lockedCount ?? 0}L`}
          >
            {(metrics[node.ctdSection].draftCount ?? 0) > 0 && (
              <span className="text-xs tabular-nums text-amber-600 bg-amber-50 rounded px-0.5">
                {metrics[node.ctdSection].draftCount}D
              </span>
            )}
            {(metrics[node.ctdSection].reviewCount ?? 0) > 0 && (
              <span className="text-xs tabular-nums text-blue-600 bg-blue-50 rounded px-0.5">
                {metrics[node.ctdSection].reviewCount}R
              </span>
            )}
            {(metrics[node.ctdSection].approvedCount ?? 0) > 0 && (
              <span className="text-xs tabular-nums text-emerald-600 bg-emerald-50 rounded px-0.5">
                {metrics[node.ctdSection].approvedCount}A
              </span>
            )}
            {(metrics[node.ctdSection].lockedCount ?? 0) > 0 && (
              <span className="text-xs tabular-nums text-red-600 bg-red-50 rounded px-0.5">
                {metrics[node.ctdSection].lockedCount}L
              </span>
            )}
          </span>
        )}

        {/* Status */}
        <StatusIndicator status={status} />

        {/* Completion mini-bar with color-coded status (enhanced Sprint 3B) */}
        {metrics?.[node.ctdSection] && metrics[node.ctdSection].artifactCount > 0 && (() => {
          const m = metrics[node.ctdSection];
          const pct = Math.min(100, m.completionPercent);
          const approved = m.approvedCount ?? 0;
          const total = m.artifactCount;
          // Color: green if all approved, amber if in progress, red if none started
          const barColor = approved === total && total > 0
            ? 'bg-emerald-500'
            : (m.reviewCount ?? 0) > 0 || (m.draftCount ?? 0) > 0
              ? 'bg-amber-400'
              : 'bg-red-400';
          // Status dot
          const dotColor = approved === total && total > 0
            ? 'bg-emerald-500'
            : (m.draftCount ?? 0) > 0 || (m.reviewCount ?? 0) > 0
              ? 'bg-amber-400'
              : 'bg-red-400';
          return (
            <span className="flex items-center gap-1 shrink-0" title={`${pct}% complete — ${approved}/${total} approved`}>
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />
              <span className="w-[28px] h-[4px] bg-stone-100 rounded-full overflow-hidden">
                <span
                  className={cn('block h-full rounded-full', barColor)}
                  style={{ width: `${pct}%` }}
                />
              </span>
            </span>
          );
        })()}

        {/* Evidence/precedent chips */}
        {metrics?.[node.ctdSection] && metrics[node.ctdSection].evidenceCount > 0 && (
          <span
            className="text-xs text-emerald-600 bg-emerald-50 rounded px-0.5 shrink-0"
            title="Evidence linked"
          >
            E{metrics[node.ctdSection].evidenceCount}
          </span>
        )}
        {metrics?.[node.ctdSection] && metrics[node.ctdSection].precedentCount > 0 && (
          <span
            className="text-xs text-stone-600 bg-stone-100 rounded px-0.5 shrink-0"
            title="Precedents"
          >
            P{metrics[node.ctdSection].precedentCount}
          </span>
        )}

        {/* Warning signals */}
        {docCount > 0 &&
          metrics?.[node.ctdSection] &&
          metrics[node.ctdSection].evidenceCount === 0 &&
          metrics[node.ctdSection].precedentCount === 0 && (
            <span title="No evidence or precedents linked">
              <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
            </span>
          )}
        {docCount === 0 &&
          metrics?.[node.ctdSection] &&
          metrics[node.ctdSection].templateCoverageAvailable && (
            <span
              className="text-xs text-blue-500 bg-blue-50 rounded px-0.5 shrink-0"
              title="Template available, no document created"
            >
              T
            </span>
          )}

        {/* Required children missing indicator */}
        {missingRequired.length > 0 && docCount > 0 && (
          <span
            className="text-xs text-red-500 bg-red-50 rounded px-0.5 shrink-0"
            title={`${missingRequired.length} required section${missingRequired.length > 1 ? 's' : ''} missing: ${missingRequired.join(', ')}`}
          >
            !{missingRequired.length}
          </span>
        )}

        {/* Action dot */}
        <span className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <MoreHorizontal className="w-3 h-3 text-stone-400" />
        </span>
      </button>

      {/* Suggestion chips — visible on hover for empty/drafting leaf sections */}
      {showSuggestionChips && (
        <div
          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150"
          style={{ paddingLeft: `${8 + (depth + 1) * 14 + 16}px`, paddingBottom: '2px' }}
          role="group"
          aria-label={`Actions for ${node.label}`}
        >
          {onCreateFromTemplate && (
            <button
              onClick={(e) => { e.stopPropagation(); onCreateFromTemplate(node.ctdSection); }}
              className={cn(
                'flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded',
                'text-stone-400 hover:text-stone-600 hover:bg-stone-100',
                'transition-colors focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-400'
              )}
              title="Create from template"
              data-testid={`chip-template-${node.ctdSection}`}
            >
              <FileText className="w-3 h-3" />
              Template
            </button>
          )}
          {onDraftWithAI && (
            <button
              onClick={(e) => { e.stopPropagation(); onDraftWithAI(node.ctdSection); }}
              className={cn(
                'flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded',
                'text-stone-400 hover:text-stone-600 hover:bg-stone-100',
                'transition-colors focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-400'
              )}
              title="Draft with AI"
              data-testid={`chip-draft-ai-${node.ctdSection}`}
            >
              <Sparkles className="w-3 h-3" />
              Draft with AI
            </button>
          )}
          {onAttachExisting && (
            <button
              onClick={(e) => { e.stopPropagation(); onAttachExisting(node.ctdSection); }}
              className={cn(
                'flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded',
                'text-stone-400 hover:text-stone-600 hover:bg-stone-100',
                'transition-colors focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-400'
              )}
              title="Attach existing document"
              data-testid={`chip-attach-${node.ctdSection}`}
            >
              <Link2 className="w-3 h-3" />
              Attach
            </button>
          )}
        </div>
      )}
      </div>

      {/* Children */}
      {isExpanded &&
        node.children.map(child => (
          <DossierNodeRow
            key={child.nodeId}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            toggleExpand={toggleExpand}
            selectedSection={selectedSection}
            onSelectSection={onSelectSection}
            counts={counts}
            onContextMenu={onContextMenu}
            metrics={metrics}
            onCreateFromTemplate={onCreateFromTemplate}
            onDraftWithAI={onDraftWithAI}
            onAttachExisting={onAttachExisting}
          />
        ))}
    </>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export const DossierTree: React.FC<DossierTreeProps> = ({
  artifacts,
  selectedSection,
  onSelectSection,
  onPlaceArtifact,
  customHierarchy,
  metrics,
  pendingMove,
  onPasteHere,
  onViewRequirements,
  onOpenTransformCanvas,
  onOpenProgramTwin,
  onOpenSubmissionApps,
  onCreateFromTemplate,
  onDraftWithAI,
  onAttachExisting,
  className,
}) => {
  // Use custom hierarchy when provided (submission-type-specific), otherwise default CTD
  const hierarchy = customHierarchy ?? CTD_HIERARCHY;
  // Default: expand Module roots
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(['m1', 'm2', 'm3', 'm4', 'm5'])
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const counts = useMemo(() => computeSectionCounts(artifacts), [artifacts]);

  const toggleExpand = useCallback((nodeId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: DossierNode) => {
    e.preventDefault();
    e.stopPropagation();
    // Clamp to viewport edges so menu doesn't overflow
    const menuW = 200,
      menuH = 260;
    const x = Math.min(e.clientX, window.innerWidth - menuW);
    const y = Math.min(e.clientY, window.innerHeight - menuH);
    setContextMenu({ x, y, ctdSection: node.ctdSection, label: node.label });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Dismiss context menu on Escape
  React.useEffect(() => {
    if (!contextMenu) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [contextMenu]);

  return (
    <div
      className={cn('flex flex-col h-full', className)}
      data-testid="dossier-tree"
      onClick={closeContextMenu}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-stone-200 bg-stone-50/60 shrink-0">
        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
          eCTD Dossier
        </span>
        <span className="text-xs text-stone-400 tabular-nums">{artifacts.length} docs</span>
      </div>
      {/* Tree body */}
      <div className="flex-1 overflow-y-auto py-1 zen-scroll" data-testid="dossier-tree-body">
        {hierarchy.map(module => (
          <DossierNodeRow
            key={module.nodeId}
            node={module}
            depth={0}
            expanded={expanded}
            toggleExpand={toggleExpand}
            selectedSection={selectedSection}
            onSelectSection={onSelectSection}
            counts={counts}
            onContextMenu={handleContextMenu}
            metrics={metrics}
            onCreateFromTemplate={onCreateFromTemplate}
            onDraftWithAI={onDraftWithAI}
            onAttachExisting={onAttachExisting}
          />
        ))}
      </div>
      {/* Context menu overlay */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-stone-200 rounded-lg shadow-sm py-1 min-w-[180px] animate-in fade-in slide-in-from-top-1 duration-150"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
          role="menu"
          aria-label="Section actions"
        >
          <div className="px-3 py-1.5 border-b border-stone-200">
            <p className="text-xs text-stone-400 font-mono">{contextMenu.ctdSection}</p>
            <p className="text-xs text-stone-600 truncate">{contextMenu.label}</p>
            {metrics?.[contextMenu.ctdSection] && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-stone-400">
                  {metrics[contextMenu.ctdSection].completionPercent}% complete
                </span>
                <span className="w-[40px] h-[3px] bg-stone-100 rounded-full overflow-hidden">
                  <span
                    className="block h-full bg-stone-600 rounded-full"
                    style={{
                      width: `${Math.min(100, metrics[contextMenu.ctdSection].completionPercent)}%`,
                    }}
                  />
                </span>
              </div>
            )}
          </div>
          {onPlaceArtifact && (
            <button
              onClick={() => {
                onPlaceArtifact(contextMenu.ctdSection);
                closeContextMenu();
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-stone-700 hover:bg-blue-50 hover:text-stone-700 transition-colors flex items-center gap-2 focus-visible:bg-blue-50 focus-visible:outline-none"
              role="menuitem"
            >
              <MapPin className="w-3 h-3" />
              Place document here…
            </button>
          )}
          {pendingMove && onPasteHere && (
            <button
              onClick={() => {
                onPasteHere(contextMenu.ctdSection);
                closeContextMenu();
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50 transition-colors flex items-center gap-2 focus-visible:bg-amber-50 focus-visible:outline-none"
              role="menuitem"
            >
              <ClipboardPaste className="w-3 h-3" />
              Paste "{pendingMove.artifact.title}" here
            </button>
          )}
          <button
            onClick={() => {
              onSelectSection(contextMenu.ctdSection, contextMenu.label);
              closeContextMenu();
            }}
            className="w-full text-left px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors flex items-center gap-2 focus-visible:bg-stone-50 focus-visible:outline-none"
            role="menuitem"
          >
            <FileText className="w-3 h-3" />
            View section documents
          </button>
          {onViewRequirements && (
            <button
              onClick={() => {
                onViewRequirements(contextMenu.ctdSection);
                closeContextMenu();
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors flex items-center gap-2 focus-visible:bg-stone-50 focus-visible:outline-none"
              role="menuitem"
            >
              <Info className="w-3 h-3" />
              View section requirements
            </button>
          )}
          {onOpenTransformCanvas && (
            <button
              onClick={() => {
                onOpenTransformCanvas(contextMenu.ctdSection);
                closeContextMenu();
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-stone-700 hover:bg-blue-50 transition-colors flex items-center gap-2 focus-visible:bg-stone-100 focus-visible:outline-none"
              role="menuitem"
            >
              <Sparkles className="w-3 h-3" />
              Open Transform Canvas
            </button>
          )}
          {onOpenSubmissionApps && (
            <button
              onClick={() => {
                onOpenSubmissionApps(contextMenu.ctdSection);
                closeContextMenu();
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50 transition-colors flex items-center gap-2 focus-visible:bg-amber-50 focus-visible:outline-none"
              role="menuitem"
            >
              <AppWindow className="w-3 h-3" />
              Create with Submission App
            </button>
          )}
          {onOpenProgramTwin && (
            <button
              onClick={() => {
                onOpenProgramTwin();
                closeContextMenu();
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-stone-700 hover:bg-blue-50 transition-colors flex items-center gap-2 focus-visible:bg-blue-50 focus-visible:outline-none"
              role="menuitem"
            >
              <Target className="w-3 h-3" />
              Show in Program Twin
            </button>
          )}
          <button
            onClick={closeContextMenu}
            className="w-full text-left px-3 py-1.5 text-sm text-stone-400 hover:bg-stone-50 transition-colors focus-visible:bg-stone-50 focus-visible:outline-none"
            role="menuitem"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default DossierTree;
