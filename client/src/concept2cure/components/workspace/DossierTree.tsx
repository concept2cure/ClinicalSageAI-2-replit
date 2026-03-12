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
import {
  ChevronRight,
  ChevronDown,
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
} from 'lucide-react';
import { CTD_HIERARCHY, type DossierNode, type DossierNodeStatus } from '../../models/ctdHierarchy';
import type { TreeArtifact } from './ProjectFileTree';

// ── Types ────────────────────────────────────────────────────────────────────

interface DossierTreeProps {
  artifacts: TreeArtifact[];
  selectedSection?: string;
  onSelectSection: (ctdSection: string, nodeLabel: string) => void;
  onPlaceArtifact?: (ctdSection: string) => void;
  /** Per-section metrics from backend */
  metrics?: Record<
    string,
    {
      artifactCount: number;
      completionPercent: number;
      evidenceCount: number;
      precedentCount: number;
      templateCoverageAvailable?: boolean;
    }
  >;
  /** Active pending move (cut/paste) */
  pendingMove?: { artifact: TreeArtifact; fromSection: string | null } | null;
  onPasteHere?: (ctdSection: string) => void;
  onViewRequirements?: (ctdSection: string) => void;
  onCutDocument?: (art: TreeArtifact) => void;
  onCopyCtdPath?: (art: TreeArtifact) => void;
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
  empty: { icon: <Circle className="w-3 h-3" />, color: 'text-zinc-300', label: 'Empty' },
  draft_present: { icon: <Clock className="w-3 h-3" />, color: 'text-amber-500', label: 'Draft' },
  under_review: { icon: <Eye className="w-3 h-3" />, color: 'text-blue-500', label: 'Review' },
  approved: {
    icon: <CheckCircle2 className="w-3 h-3" />,
    color: 'text-emerald-500',
    label: 'Approved',
  },
  locked: { icon: <Lock className="w-3 h-3" />, color: 'text-red-500', label: 'Locked' },
  missing_evidence: {
    icon: <AlertCircle className="w-3 h-3" />,
    color: 'text-orange-500',
    label: 'Missing Evidence',
  },
  ready: { icon: <ShieldCheck className="w-3 h-3" />, color: 'text-emerald-600', label: 'Ready' },
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
  if (nodeType === 'module') return <Package className="w-3.5 h-3.5 text-indigo-500 shrink-0" />;
  if (nodeType === 'section') {
    return isExpanded ? (
      <FolderOpen className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
    ) : (
      <Folder className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
    );
  }
  return <FileText className="w-3.5 h-3.5 text-zinc-300 shrink-0" />;
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
    }
  >;
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
}: DossierNodeRowProps) {
  const isExpanded = expanded.has(node.nodeId);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedSection === node.ctdSection;
  const status = hasChildren
    ? getAggregatedStatus(node, counts)
    : getNodeStatus(node.ctdSection, counts);
  const docCount = getAggregatedCount(node, counts);

  return (
    <>
      <button
        onClick={() => {
          if (hasChildren) toggleExpand(node.nodeId);
          onSelectSection(node.ctdSection, node.label);
        }}
        onContextMenu={e => onContextMenu(e, node)}
        className={cn(
          'w-full flex items-center gap-1 py-[4px] pr-2 text-left transition-colors group',
          isSelected ? 'bg-blue-50 text-blue-700' : 'text-zinc-600 hover:bg-zinc-50'
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        data-testid={`dossier-node-${node.ctdSection}`}
        title={`${node.ctdSection} — ${node.label}`}
      >
        {/* Chevron */}
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="w-3 h-3 shrink-0 text-zinc-400" />
          ) : (
            <ChevronRight className="w-3 h-3 shrink-0 text-zinc-400" />
          )
        ) : (
          <span className="w-3 h-3 shrink-0" />
        )}

        <NodeIcon nodeType={node.nodeType} isExpanded={isExpanded} />

        {/* Section number */}
        <span className="text-[10px] text-zinc-400 font-mono shrink-0 min-w-[28px]">
          {node.ctdSection}
        </span>

        {/* Label */}
        <span className="text-[12px] truncate flex-1 leading-snug">
          {node.label.replace(/^Module \d+ — /, '')}
        </span>

        {/* Count badge */}
        {docCount > 0 && (
          <span className="text-[10px] tabular-nums text-zinc-400 shrink-0 bg-zinc-100 rounded px-1">
            {docCount}
          </span>
        )}

        {/* Status */}
        <StatusIndicator status={status} />

        {/* Completion mini-bar (from backend metrics) */}
        {metrics?.[node.ctdSection] && metrics[node.ctdSection].artifactCount > 0 && (
          <span
            className="shrink-0 w-[28px] h-[4px] bg-zinc-100 rounded-full overflow-hidden"
            title={`${metrics[node.ctdSection].completionPercent}% complete`}
          >
            <span
              className="block h-full bg-blue-500 rounded-full"
              style={{ width: `${Math.min(100, metrics[node.ctdSection].completionPercent)}%` }}
            />
          </span>
        )}

        {/* Evidence/precedent chips */}
        {metrics?.[node.ctdSection] && metrics[node.ctdSection].evidenceCount > 0 && (
          <span
            className="text-[9px] text-emerald-600 bg-emerald-50 rounded px-0.5 shrink-0"
            title="Evidence linked"
          >
            E{metrics[node.ctdSection].evidenceCount}
          </span>
        )}
        {metrics?.[node.ctdSection] && metrics[node.ctdSection].precedentCount > 0 && (
          <span
            className="text-[9px] text-violet-600 bg-violet-50 rounded px-0.5 shrink-0"
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
            <AlertCircle
              className="w-3 h-3 text-amber-400 shrink-0"
              title="No evidence or precedents linked"
            />
          )}
        {docCount === 0 &&
          metrics?.[node.ctdSection] &&
          metrics[node.ctdSection].templateCoverageAvailable && (
            <span
              className="text-[8px] text-blue-500 bg-blue-50 rounded px-0.5 shrink-0"
              title="Template available, no document created"
            >
              T
            </span>
          )}

        {/* Action dot */}
        <span className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <MoreHorizontal className="w-3 h-3 text-zinc-400" />
        </span>
      </button>

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
  metrics,
  pendingMove,
  onPasteHere,
  onViewRequirements,
  onCutDocument: _onCutDocument,
  onCopyCtdPath: _onCopyCtdPath,
  className,
}) => {
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
    setContextMenu({ x: e.clientX, y: e.clientY, ctdSection: node.ctdSection, label: node.label });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  return (
    <div
      className={cn('flex flex-col h-full', className)}
      data-testid="dossier-tree"
      onClick={closeContextMenu}
    >
      8{/* Header */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-zinc-100 bg-zinc-50/60 shrink-0">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          eCTD Dossier
        </span>
        <span className="text-[10px] text-zinc-400 tabular-nums">{artifacts.length} docs</span>
      </div>
      {/* Tree body */}
      <div className="flex-1 overflow-y-auto py-1 zen-scroll" data-testid="dossier-tree-body">
        {CTD_HIERARCHY.map(module => (
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
          />
        ))}
      </div>
      {/* Context menu overlay */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-zinc-100">
            <p className="text-[10px] text-zinc-400 font-mono">{contextMenu.ctdSection}</p>
            <p className="text-[11px] text-zinc-600 truncate">{contextMenu.label}</p>
            {metrics?.[contextMenu.ctdSection] && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] text-zinc-400">
                  {metrics[contextMenu.ctdSection].completionPercent}% complete
                </span>
                <span className="w-[40px] h-[3px] bg-zinc-100 rounded-full overflow-hidden">
                  <span
                    className="block h-full bg-blue-500 rounded-full"
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
              className="w-full text-left px-3 py-1.5 text-[12px] text-zinc-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2"
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
              className="w-full text-left px-3 py-1.5 text-[12px] text-amber-700 hover:bg-amber-50 transition-colors flex items-center gap-2"
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
            className="w-full text-left px-3 py-1.5 text-[12px] text-zinc-700 hover:bg-zinc-50 transition-colors flex items-center gap-2"
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
              className="w-full text-left px-3 py-1.5 text-[12px] text-zinc-700 hover:bg-zinc-50 transition-colors flex items-center gap-2"
            >
              <Info className="w-3 h-3" />
              View section requirements
            </button>
          )}
          <button
            onClick={closeContextMenu}
            className="w-full text-left px-3 py-1.5 text-[12px] text-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default DossierTree;
