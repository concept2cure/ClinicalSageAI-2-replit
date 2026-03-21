/**
 * PlacementDialog — Governed move/placement confirmation modal.
 *
 * Three governed operations:
 *   1. Reclassify — move between internal category buckets
 *   2. Place into dossier — attach artifact to a CTD section
 *   3. Relocate — move artifact from one CTD section to another
 *
 * Every operation shows old → new, requires explicit confirmation,
 * and emits a provenance event. NO casual drag-and-drop.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ArrowRight, AlertTriangle, ShieldCheck, Search, ChevronRight, X } from 'lucide-react';
import {
  CTD_HIERARCHY,
  flattenDossierTree,
  getSectionLabel,
  type DossierNode,
} from '../../models/ctdHierarchy';
import type { TreeArtifact } from './ProjectFileTree';

// ── Types ────────────────────────────────────────────────────────────────────

export type PlacementOperation = 'reclassify' | 'place' | 'relocate';

interface PlacementDialogProps {
  open: boolean;
  onClose: () => void;
  artifact: TreeArtifact;
  operation: PlacementOperation;
  targetSection?: string;
  onConfirm: (params: PlacementConfirmation) => void;
  loading?: boolean;
}

export interface PlacementConfirmation {
  artifactId: string;
  operation: PlacementOperation;
  fromSection: string | null;
  toSection: string;
  reason: string;
}

// ── Section picker (mini tree) ───────────────────────────────────────────────

interface SectionPickerProps {
  selected?: string;
  onSelect: (section: string) => void;
}

function SectionPicker({ selected, onSelect }: SectionPickerProps) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['m1', 'm2', 'm3', 'm4', 'm5']));

  const allNodes = useMemo(() => flattenDossierTree(CTD_HIERARCHY), []);

  const filteredNodes = useMemo(() => {
    if (!search.trim()) return null; // Show tree
    const q = search.toLowerCase();
    return allNodes.filter(
      n => n.label.toLowerCase().includes(q) || n.ctdSection.toLowerCase().includes(q)
    );
  }, [search, allNodes]);

  const toggleExpand = (nodeId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const renderNode = (node: DossierNode, depth: number) => {
    const isExpanded = expanded.has(node.nodeId);
    const hasChildren = node.children.length > 0;
    const isSelected = selected === node.ctdSection;

    return (
      <React.Fragment key={node.nodeId}>
        <button
          onClick={() => {
            onSelect(node.ctdSection);
            if (hasChildren) toggleExpand(node.nodeId);
          }}
          className={cn(
            'w-full flex items-center gap-1 py-[3px] pr-2 text-left transition-colors duration-150',
            isSelected ? 'bg-blue-100 text-blue-700 font-medium' : 'text-zinc-600 hover:bg-zinc-50'
          )}
          style={{ paddingLeft: `${4 + depth * 12}px` }}
        >
          {hasChildren ? (
            <ChevronRight
              className={cn(
                'w-3 h-3 shrink-0 text-zinc-400 transition-transform duration-150',
                isExpanded && 'rotate-90'
              )}
            />
          ) : (
            <span className="w-3 h-3 shrink-0" />
          )}
          <span className="text-xs text-zinc-400 font-mono shrink-0">{node.ctdSection}</span>
          <span className="text-xs truncate flex-1">
            {node.label.replace(/^Module \d+ — /, '')}
          </span>
        </button>
        {isExpanded && node.children.map(c => renderNode(c, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      {/* Search */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-zinc-200 bg-zinc-50/60">
        <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search sections…"
          className="flex-1 text-xs bg-transparent outline-none placeholder:text-zinc-400"
        />
      </div>

      {/* Results or tree */}
      <div className="max-h-[240px] overflow-y-auto">
        {filteredNodes ? (
          filteredNodes.length === 0 ? (
            <p className="px-3 py-4 text-xs text-zinc-400 text-center">No matching sections</p>
          ) : (
            filteredNodes.map(n => (
              <button
                key={n.nodeId}
                onClick={() => onSelect(n.ctdSection)}
                className={cn(
                  'w-full flex items-center gap-1.5 px-3 py-1.5 text-left transition-colors duration-150',
                  selected === n.ctdSection
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-zinc-600 hover:bg-zinc-50'
                )}
              >
                <span className="text-xs text-zinc-400 font-mono shrink-0">{n.ctdSection}</span>
                <span className="text-xs truncate flex-1">{n.label}</span>
              </button>
            ))
          )
        ) : (
          CTD_HIERARCHY.map(m => renderNode(m, 0))
        )}
      </div>
    </div>
  );
}

// ── Operation labels ─────────────────────────────────────────────────────────

const OP_CONFIG: Record<
  PlacementOperation,
  { label: string; description: string; severity: 'info' | 'warning' }
> = {
  reclassify: {
    label: 'Reclassify Document',
    description:
      'Move this document between internal category buckets. Does not affect submission placement.',
    severity: 'info',
  },
  place: {
    label: 'Place into Dossier',
    description:
      'Attach this document to a CTD section in the submission dossier. Creates a placement record.',
    severity: 'info',
  },
  relocate: {
    label: 'Relocate Submission Placement',
    description:
      'Move this document from one CTD section to another. This affects the submission structure and creates an audit trail.',
    severity: 'warning',
  },
};

// ── Main component ───────────────────────────────────────────────────────────

export const PlacementDialog: React.FC<PlacementDialogProps> = ({
  open,
  onClose,
  artifact,
  operation,
  targetSection: initialTarget,
  onConfirm,
  loading,
}) => {
  const [selectedSection, setSelectedSection] = useState(initialTarget || '');
  const [reason, setReason] = useState('');

  const config = OP_CONFIG[operation];
  const currentSection = artifact.ctdSection || null;

  const isLocked = artifact.status === 'locked';

  const canConfirm =
    selectedSection &&
    reason.trim().length >= 5 &&
    (operation !== 'relocate' || selectedSection !== currentSection) &&
    !(operation === 'relocate' && isLocked);

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;
    onConfirm({
      artifactId: artifact.id,
      operation,
      fromSection: currentSection,
      toSection: selectedSection,
      reason: reason.trim(),
    });
  }, [canConfirm, artifact.id, operation, currentSection, selectedSection, reason, onConfirm]);

  // Dismiss on Escape key, Enter to confirm
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canConfirm && !loading) {
        e.preventDefault();
        handleConfirm();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, canConfirm, loading, handleConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="placement-dialog-title"
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center justify-between px-5 py-3 border-b',
            config.severity === 'warning'
              ? 'bg-amber-50 border-amber-100'
              : 'bg-blue-50 border-blue-100'
          )}
        >
          <div className="flex items-center gap-2">
            {config.severity === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-blue-600" />
            )}
            <h3 id="placement-dialog-title" className="text-[14px] font-semibold text-zinc-900">
              {config.label}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/60 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-zinc-500 leading-relaxed">{config.description}</p>

          {/* Document info */}
          <div className="bg-zinc-50 rounded-lg px-3 py-2">
            <p className="text-xs text-zinc-400">Document</p>
            <p className="text-sm font-medium text-zinc-900 truncate">{artifact.title}</p>
            {currentSection && (
              <p className="text-xs text-zinc-400 mt-0.5">
                Currently at: <span className="font-mono">{currentSection}</span> —{' '}
                {getSectionLabel(currentSection)}
              </p>
            )}
            {artifact.status && (
              <p className="text-xs text-zinc-400 mt-0.5">
                Status: <span className="font-medium text-zinc-600">{artifact.status}</span>
                {artifact.version ? ` · v${artifact.version}` : ''}
              </p>
            )}
          </div>

          {/* Impact statement — relocate */}
          {operation === 'relocate' && (
            <div
              className={cn(
                'flex items-start gap-2 px-3 py-2 rounded-lg text-xs',
                isLocked
                  ? 'bg-red-50/60 border border-red-200 text-red-800'
                  : 'bg-amber-50/60 border border-amber-100 text-amber-800'
              )}
            >
              <AlertTriangle
                className={cn(
                  'w-3.5 h-3.5 shrink-0 mt-0.5',
                  isLocked ? 'text-red-600' : 'text-amber-600'
                )}
              />
              <div>
                <p className="font-medium">
                  {isLocked
                    ? 'Document Locked — Relocation Blocked'
                    : 'Regulatory Placement Impact'}
                </p>
                <p className={cn('mt-0.5', isLocked ? 'text-red-700' : 'text-amber-700')}>
                  {isLocked
                    ? 'This document is locked. Unlock it before relocating.'
                    : 'Relocating this document changes its position in the CTD submission structure.'}
                  {artifact.status === 'approved' &&
                    ' This document is currently approved — relocation will require re-review.'}
                </p>
              </div>
            </div>
          )}

          {/* Impact note — initial placement */}
          {operation === 'place' && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-50/60 border border-blue-100 text-xs text-blue-800">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-600" />
              <div>
                <p className="font-medium">Placement creates a governed record</p>
                <p className="text-blue-700 mt-0.5">
                  Once placed, this document becomes part of the submission dossier. Future moves
                  will require justification and leave an audit trail.
                </p>
              </div>
            </div>
          )}

          {/* Move / placement visualization */}
          {((operation === 'relocate' &&
            currentSection &&
            selectedSection &&
            selectedSection !== currentSection) ||
            (operation === 'place' && selectedSection)) && (
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg border',
                operation === 'relocate'
                  ? 'bg-amber-50 border-amber-100'
                  : 'bg-blue-50 border-blue-100'
              )}
            >
              {currentSection && (
                <div className="flex-1 text-center">
                  <p className="text-xs text-zinc-400">From</p>
                  <p className="text-xs font-mono font-medium text-zinc-700">
                    {currentSection}
                  </p>
                  <p className="text-xs text-zinc-400 truncate">
                    {getSectionLabel(currentSection)}
                  </p>
                </div>
              )}
              {!currentSection && (
                <div className="flex-1 text-center">
                  <p className="text-xs text-zinc-400">From</p>
                  <p className="text-xs font-medium text-zinc-400 italic">Unplaced</p>
                </div>
              )}
              <ArrowRight
                className={cn(
                  'w-4 h-4 shrink-0',
                  operation === 'relocate' ? 'text-amber-600' : 'text-blue-600'
                )}
              />
              <div className="flex-1 text-center">
                <p className="text-xs text-zinc-400">To</p>
                <p className="text-xs font-mono font-medium text-blue-700">{selectedSection}</p>
                <p className="text-xs text-zinc-400 truncate">
                  {getSectionLabel(selectedSection)}
                </p>
              </div>
            </div>
          )}

          {/* Target section picker */}
          <div>
            <label className="text-xs font-medium text-zinc-600 mb-1.5 block">
              Target CTD Section
            </label>
            <SectionPicker selected={selectedSection} onSelect={setSelectedSection} />
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs font-medium text-zinc-600 mb-1.5 block">
              Reason for {operation === 'relocate' ? 'relocation' : 'placement'}
              <span className="text-red-500"> *</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Provide justification (min 5 characters)…"
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg resize-none h-16 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none/30 transition-shadow duration-150"
            />
            <div className="flex items-center justify-between mt-1">
              <span
                className={cn(
                  'text-xs tabular-nums',
                  reason.trim().length < 5 ? 'text-zinc-400' : 'text-emerald-500'
                )}
              >
                {reason.trim().length}/5 min
              </span>
              <span className="text-xs text-zinc-400">⌘Enter to confirm</span>
            </div>
          </div>

          {/* Audit notice */}
          <div className="flex items-start gap-2 text-xs text-zinc-400 leading-relaxed">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              This action will be recorded in the provenance audit trail with your identity,
              timestamp, and the reason provided above.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-zinc-200 bg-zinc-50/60">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-lg transition-colors duration-150',
              canConfirm && !loading
                ? 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none'
                : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
            )}
          >
            {loading ? 'Processing…' : `Confirm ${config.label}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlacementDialog;
