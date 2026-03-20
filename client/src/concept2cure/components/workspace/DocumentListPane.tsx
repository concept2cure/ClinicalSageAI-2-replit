/**
 * DocumentListPane — Clean table/list of documents within a selected folder.
 *
 * Shows when a folder is selected in the explorer tree.  Compact rows with
 * status, CTD section, version, and last-updated timestamp.
 * Phase 3: expandable rows with CTD path, template type, subsection count.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  FileText,
  CheckCircle,
  Lock,
  Clock,
  AlertTriangle,
  Plus,
  Scissors,
  MapPin,
  Copy,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { getSectionLabel } from '../../models/ctdHierarchy';
import type { PlacementOperation } from './PlacementDialog';
import type { TreeArtifact } from './ProjectFileTree';

interface DocumentListPaneProps {
  folderLabel: string;
  documents: TreeArtifact[];
  selectedId?: string;
  onSelect: (doc: TreeArtifact) => void;
  onCreateNew?: () => void;
  onCutDocument?: (art: TreeArtifact) => void;
  onCopyCtdPath?: (art: TreeArtifact) => void;
  onOpenPlacement?: (art: TreeArtifact, op: PlacementOperation) => void;
  className?: string;
}

function statusBadge(status?: string) {
  switch (status) {
    case 'approved':
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
          <CheckCircle className="w-2.5 h-2.5" /> Approved
        </span>
      );
    case 'locked':
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[11px] font-semibold bg-red-50 text-red-700 ring-1 ring-red-200">
          <Lock className="w-2.5 h-2.5" /> Locked
        </span>
      );
    case 'review':
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200">
          <AlertTriangle className="w-2.5 h-2.5" /> Review
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[11px] font-semibold bg-zinc-50 text-zinc-500 ring-1 ring-zinc-200">
          <Clock className="w-2.5 h-2.5" /> Draft
        </span>
      );
  }
}

export const DocumentListPane: React.FC<DocumentListPaneProps> = ({
  folderLabel,
  documents,
  selectedId,
  onSelect,
  onCreateNew,
  onCutDocument,
  onCopyCtdPath,
  onOpenPlacement,
  className,
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className={cn('flex flex-col h-full bg-white', className)}
      data-testid="document-list-pane"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-8 border-b border-zinc-100 bg-zinc-50/40 shrink-0">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[13px] font-semibold text-zinc-800">{folderLabel}</h3>
          <span className="text-[11px] text-zinc-400 tabular-nums">{documents.length}</span>
        </div>
        {onCreateNew && (
          <button
            onClick={onCreateNew}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50 rounded font-medium transition-colors"
          >
            <Plus className="w-3 h-3" /> New
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto zen-scroll">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <FileText className="w-8 h-8 text-zinc-200 mb-3" />
            <p className="text-sm font-medium text-zinc-500 mb-1">No documents in this folder</p>
            <p className="text-xs text-zinc-400 max-w-[260px]">
              Documents will appear here once created or moved into this category.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/30 sticky top-0">
                <th className="px-4 py-2 font-medium text-zinc-400 text-[11px] uppercase tracking-wider">
                  Document
                </th>
                <th className="px-3 py-2 font-medium text-zinc-400 text-[11px] uppercase tracking-wider w-20">
                  Status
                </th>
                <th className="px-3 py-2 font-medium text-zinc-400 text-[11px] uppercase tracking-wider w-16 hidden sm:table-cell">
                  Ver
                </th>
                <th className="px-3 py-2 font-medium text-zinc-400 text-[11px] uppercase tracking-wider w-24 text-right hidden md:table-cell">
                  Updated
                </th>
                {(onCutDocument || onOpenPlacement || onCopyCtdPath) && (
                  <th className="px-2 py-2 w-8" />
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {documents.map(doc => {
                const isExpanded = expandedRows.has(doc.id);
                return (
                  <React.Fragment key={doc.id}>
                    <tr
                      onClick={() => onSelect(doc)}
                      className={cn(
                        'cursor-pointer transition-colors',
                        doc.id === selectedId ? 'bg-blue-50/60' : 'hover:bg-zinc-50'
                      )}
                      data-testid="document-list-row"
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              toggleRow(doc.id);
                            }}
                            className={cn(
                              'p-0.5 shrink-0 transition-transform duration-150',
                              isExpanded ? 'text-zinc-500' : 'text-zinc-300 hover:text-zinc-500'
                            )}
                            title="Toggle details"
                          >
                            <ChevronRight
                              className={cn(
                                'w-3 h-3 transition-transform duration-150',
                                isExpanded && 'rotate-90'
                              )}
                            />
                          </button>
                          <FileText className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-zinc-800 truncate leading-snug">
                              {doc.title}
                            </p>
                            {doc.ctdSection && (
                              <span className="text-[11px] text-violet-500 font-medium">
                                CTD {doc.ctdSection}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">{statusBadge(doc.status)}</td>
                      <td className="px-3 py-2 text-zinc-400 tabular-nums hidden sm:table-cell">
                        v{doc.version}
                      </td>
                      <td className="px-3 py-2 text-zinc-400 text-right tabular-nums hidden md:table-cell">
                        {new Date(doc.updatedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      {(onCutDocument || onOpenPlacement || onCopyCtdPath) && (
                        <td className="px-1 py-2">
                          <div className="flex items-center gap-0.5">
                            {onCutDocument && doc.status !== 'locked' && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  onCutDocument(doc);
                                }}
                                className="p-1 text-zinc-300 hover:text-zinc-600 rounded hover:bg-zinc-100"
                                title="Cut — move to another section"
                              >
                                <Scissors className="w-3 h-3" />
                              </button>
                            )}
                            {onOpenPlacement && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  onOpenPlacement(doc, doc.ctdSection ? 'relocate' : 'place');
                                }}
                                className="p-1 text-zinc-300 hover:text-zinc-600 rounded hover:bg-zinc-100"
                                title={doc.ctdSection ? 'Relocate' : 'Place in dossier'}
                              >
                                <MapPin className="w-3 h-3" />
                              </button>
                            )}
                            {onCopyCtdPath && doc.ctdSection && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  onCopyCtdPath(doc);
                                }}
                                className="p-1 text-zinc-300 hover:text-zinc-600 rounded hover:bg-zinc-100"
                                title="Copy CTD path"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    {/* Expanded detail band */}
                    {isExpanded && (
                      <tr className="bg-zinc-50/40 animate-in fade-in slide-in-from-top-1 duration-150">
                        <td colSpan={5} className="px-4 py-1.5">
                          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                            {doc.ctdSection && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-2.5 h-2.5" />
                                {doc.ctdSection} — {getSectionLabel(doc.ctdSection)}
                              </span>
                            )}
                            {doc.templateId && (
                              <span className="flex items-center gap-1 text-violet-600">
                                <Layers className="w-2.5 h-2.5" />
                                {doc.templateId.replace('tpl-', '')}
                              </span>
                            )}
                            <span className="text-zinc-400">
                              Updated{' '}
                              {new Date(doc.updatedAt).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DocumentListPane;
