/**
 * SubmissionBuilder — eCTD Submission Assembler
 *
 * Visual eCTD module tree with drag-drop artifact assignment,
 * validation status per node, and submission package readiness.
 *
 * Features:
 * - Full eCTD module structure (M1-M5)
 * - Assign artifacts to sections by drag or picker
 * - Per-section validation status (complete, incomplete, not started)
 * - Overall submission readiness score
 * - Launch pre-submission checklist
 * - Generate submission package
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Plus,
  Check,
  AlertTriangle,
  X,
  Search,
  Package,
  ClipboardCheck,
  Layers,
  BarChart3,
  Link2,
  Upload,
  Download,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Circle,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type SectionStatus = 'complete' | 'partial' | 'empty' | 'not_required';

interface AssignedArtifact {
  id: string;
  title: string;
  version: number;
  status: string;
  wordCount?: number;
  lastModified?: string;
}

interface EctdNode {
  id: string;
  label: string;
  module: number;
  required: boolean;
  children?: EctdNode[];
  assignedArtifacts?: AssignedArtifact[];
  status: SectionStatus;
}

interface ProjectArtifact {
  id: string;
  title: string;
  ctdSection?: string;
  status: string;
  version: number;
  wordCount?: number;
  lastModified?: string;
}

interface SubmissionBuilderProps {
  projectId: string;
  projectName?: string;
  submissionType?: 'IND' | 'NDA' | 'BLA' | '510k' | 'PMA' | 'MAA' | 'ANDA';
  region?: 'FDA' | 'EMA' | 'HC' | 'PMDA' | 'TGA';
  artifacts?: ProjectArtifact[];
  onAssignArtifact?: (sectionId: string, artifactId: string) => void;
  onUnassignArtifact?: (sectionId: string, artifactId: string) => void;
  onCreateArtifact?: (sectionId: string, sectionLabel: string) => void;
  onOpenArtifact?: (artifactId: string) => void;
  onValidate?: () => void;
  onGeneratePackage?: () => void;
  onOpenChecklist?: () => void;
  onClose?: () => void;
}

// ── eCTD Structure ──────────────────────────────────────────────────────────

function buildEctdTree(
  artifacts: ProjectArtifact[],
  submissionType: string,
): EctdNode[] {
  const artifactsBySection = new Map<string, ProjectArtifact[]>();
  for (const a of artifacts) {
    if (a.ctdSection) {
      const existing = artifactsBySection.get(a.ctdSection) || [];
      existing.push(a);
      artifactsBySection.set(a.ctdSection, existing);
    }
  }

  function toAssigned(a: ProjectArtifact): AssignedArtifact {
    return {
      id: a.id,
      title: a.title,
      version: a.version,
      status: a.status,
      wordCount: a.wordCount,
      lastModified: a.lastModified,
    };
  }

  function nodeStatus(id: string, children?: EctdNode[]): SectionStatus {
    const arts = artifactsBySection.get(id);
    if (arts && arts.length > 0) {
      const allApproved = arts.every(a => a.status === 'approved' || a.status === 'published');
      return allApproved ? 'complete' : 'partial';
    }
    if (children && children.length > 0) {
      const childStatuses = children.map(c => c.status);
      if (childStatuses.every(s => s === 'complete')) return 'complete';
      if (childStatuses.some(s => s !== 'empty' && s !== 'not_required')) return 'partial';
    }
    return 'empty';
  }

  const requiredSections: Record<string, string[]> = {
    IND: ['1.1', '1.2', '2.5', '2.6', '2.7', '3.2.S', '3.2.P', '4.2', '5.3'],
    NDA: ['1.1', '1.2', '1.14', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '3.2.S', '3.2.P', '4.2', '5.3'],
    BLA: ['1.1', '1.2', '1.14', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '3.2.S', '3.2.P', '4.2', '5.3'],
    MAA: ['1.1', '1.2', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '3.2.S', '3.2.P', '4.2', '5.3'],
    ANDA: ['1.1', '1.2', '2.3', '3.2.S', '3.2.P'],
    '510k': ['1.1', '1.2'],
    PMA: ['1.1', '1.2'],
  };

  const required = new Set(requiredSections[submissionType] || requiredSections.NDA);

  function isRequired(id: string): boolean {
    if (required.has(id)) return true;
    // Parent modules are required if any child is
    for (const r of required) {
      if (r.startsWith(id + '.')) return true;
    }
    return false;
  }

  function makeNode(id: string, label: string, module: number, childDefs?: [string, string][]): EctdNode {
    const children = childDefs?.map(([cid, clabel]) => makeNode(cid, clabel, module));
    const arts = artifactsBySection.get(id);
    return {
      id,
      label,
      module,
      required: isRequired(id),
      children,
      assignedArtifacts: arts?.map(toAssigned),
      status: nodeStatus(id, children),
    };
  }

  return [
    {
      ...makeNode('1', 'Module 1 — Administrative Information', 1, [
        ['1.1', 'Forms'],
        ['1.2', 'Cover Letters'],
        ['1.3', 'Administrative Information'],
        ['1.4', 'References'],
        ['1.14', 'Labeling'],
      ]),
    },
    {
      ...makeNode('2', 'Module 2 — CTD Summaries', 2, [
        ['2.2', 'Introduction'],
        ['2.3', 'Quality Overall Summary'],
        ['2.4', 'Nonclinical Overview'],
        ['2.5', 'Clinical Overview'],
        ['2.6', 'Nonclinical Summaries'],
        ['2.7', 'Clinical Summary'],
      ]),
    },
    {
      ...makeNode('3', 'Module 3 — Quality (CMC)', 3, [
        ['3.2.S', 'Drug Substance'],
        ['3.2.P', 'Drug Product'],
        ['3.2.A', 'Appendices'],
        ['3.3', 'Literature References'],
      ]),
    },
    {
      ...makeNode('4', 'Module 4 — Nonclinical', 4, [
        ['4.2', 'Study Reports'],
        ['4.3', 'Literature References'],
      ]),
    },
    {
      ...makeNode('5', 'Module 5 — Clinical', 5, [
        ['5.2', 'Tabular Listing of Clinical Studies'],
        ['5.3', 'Clinical Study Reports'],
        ['5.4', 'Literature References'],
      ]),
    },
  ];
}

// ── Status helpers ────────────────────────────────────────────────────────

function statusIcon(status: SectionStatus) {
  switch (status) {
    case 'complete':
      return <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />;
    case 'partial':
      return <Clock className="h-4 w-4 text-amber-500 shrink-0" />;
    case 'not_required':
      return <Circle className="h-4 w-4 text-slate-300 shrink-0" />;
    default:
      return <XCircle className="h-4 w-4 text-slate-300 shrink-0" />;
  }
}

function statusLabel(status: SectionStatus): string {
  switch (status) {
    case 'complete': return 'Complete';
    case 'partial': return 'In Progress';
    case 'not_required': return 'Not Required';
    default: return 'Not Started';
  }
}

// ── Tree node component ─────────────────────────────────────────────────

interface TreeNodeRowProps {
  node: EctdNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectedSection: string | null;
  onSelect: (id: string) => void;
  onOpenArtifact?: (artifactId: string) => void;
}

function TreeNodeRow({
  node,
  depth,
  expanded,
  onToggle,
  selectedSection,
  onSelect,
  onOpenArtifact,
}: TreeNodeRowProps) {
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedSection === node.id;
  const artifactCount = node.assignedArtifacts?.length || 0;

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors group',
          isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50',
          !node.required && node.status === 'empty' && 'opacity-60',
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => {
          onSelect(node.id);
          if (hasChildren) onToggle(node.id);
        }}
      >
        {hasChildren ? (
          <button
            className="p-1 hover:bg-slate-100 rounded shrink-0"
            onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
          >
            {isExpanded
              ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
          </button>
        ) : (
          <span className="w-5" />
        )}

        {hasChildren
          ? (isExpanded ? <FolderOpen className="h-4 w-4 text-blue-400 shrink-0" /> : <Folder className="h-4 w-4 text-slate-400 shrink-0" />)
          : <FileText className="h-4 w-4 text-slate-400 shrink-0" />}

        <span className="text-sm font-medium text-slate-700 truncate flex-1">
          <span className="text-slate-400 mr-1.5">{node.id}</span>
          {node.label}
        </span>

        {node.required && (
          <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded shrink-0">
            REQ
          </span>
        )}

        {artifactCount > 0 && (
          <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
            {artifactCount} {artifactCount === 1 ? 'doc' : 'docs'}
          </span>
        )}

        {statusIcon(node.status)}
      </div>

      {/* Show assigned artifacts inline */}
      {isSelected && artifactCount > 0 && (
        <div className="ml-4" style={{ paddingLeft: `${depth * 20 + 28}px` }}>
          {node.assignedArtifacts!.map(a => (
            <div
              key={a.id}
              className="flex items-center gap-2 py-1 px-2 text-xs text-slate-600 hover:bg-slate-50 rounded cursor-pointer"
              onClick={() => onOpenArtifact?.(a.id)}
            >
              <FileText className="h-3 w-3 text-blue-400" />
              <span className="truncate flex-1">{a.title}</span>
              <span className="text-slate-400">v{a.version}</span>
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded',
                a.status === 'approved' || a.status === 'published'
                  ? 'text-emerald-600 bg-emerald-50'
                  : a.status === 'in_review'
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-slate-500 bg-slate-100'
              )}>
                {a.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {isExpanded && hasChildren && (
        node.children!.map(child => (
          <TreeNodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            selectedSection={selectedSection}
            onSelect={onSelect}
            onOpenArtifact={onOpenArtifact}
          />
        ))
      )}
    </>
  );
}

// ── Main component ──────────────────────────────────────────────────────

export function SubmissionBuilder({
  projectId,
  projectName,
  submissionType = 'NDA',
  region = 'FDA',
  artifacts = [],
  onAssignArtifact,
  onUnassignArtifact,
  onCreateArtifact,
  onOpenArtifact,
  onValidate,
  onGeneratePackage,
  onOpenChecklist,
  onClose,
}: SubmissionBuilderProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['1', '2', '3', '4', '5']));
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArtifactPicker, setShowArtifactPicker] = useState(false);

  const tree = useMemo(() => buildEctdTree(artifacts, submissionType), [artifacts, submissionType]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Compute readiness statistics
  const stats = useMemo(() => {
    let total = 0;
    let complete = 0;
    let partial = 0;
    let requiredMissing = 0;

    function walk(nodes: EctdNode[]) {
      for (const n of nodes) {
        if (n.required) {
          total++;
          if (n.status === 'complete') complete++;
          else if (n.status === 'partial') partial++;
          else requiredMissing++;
        }
        if (n.children) walk(n.children);
      }
    }
    walk(tree);

    const readiness = total > 0 ? Math.round((complete / total) * 100) : 0;
    return { total, complete, partial, requiredMissing, readiness };
  }, [tree]);

  // Filter unassigned artifacts for picker
  const unassignedArtifacts = useMemo(() => {
    const assignedIds = new Set<string>();
    function walk(nodes: EctdNode[]) {
      for (const n of nodes) {
        n.assignedArtifacts?.forEach(a => assignedIds.add(a.id));
        if (n.children) walk(n.children);
      }
    }
    walk(tree);
    return artifacts.filter(a => !assignedIds.has(a.id));
  }, [tree, artifacts]);

  const filteredUnassigned = useMemo(() => {
    if (!searchQuery) return unassignedArtifacts;
    const q = searchQuery.toLowerCase();
    return unassignedArtifacts.filter(
      a => a.title.toLowerCase().includes(q) || a.ctdSection?.toLowerCase().includes(q),
    );
  }, [unassignedArtifacts, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-blue-500" />
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              Submission Builder
            </h2>
            <p className="text-xs text-slate-500">
              {submissionType} · {region} · {projectName || `Project ${projectId}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenChecklist}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors duration-150"
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            Checklist
          </button>
          <button
            onClick={onValidate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors duration-150"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Validate
          </button>
          <button
            onClick={onGeneratePackage}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors duration-150"
          >
            <Download className="h-3.5 w-3.5" />
            Generate Package
          </button>
          {onClose && (
            <button onClick={onClose} aria-label="Close submission builder" title="Close" className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Readiness bar */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-600">Submission Readiness</span>
          <span className="text-sm font-semibold text-blue-600">{stats.readiness}%</span>
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-150',
              stats.readiness >= 80 ? 'bg-emerald-500' : stats.readiness >= 50 ? 'bg-amber-500' : 'bg-red-500',
            )}
            style={{ width: `${stats.readiness}%` }}
          />
        </div>
        <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-emerald-500" />
            {stats.complete} complete
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-amber-500" />
            {stats.partial} in progress
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="h-3 w-3 text-red-400" />
            {stats.requiredMissing} missing
          </span>
          <span className="text-slate-400">
            {stats.total} required sections
          </span>
        </div>
      </div>

      {/* Main content: tree + detail */}
      <div className="flex flex-1 min-h-0">
        {/* eCTD tree */}
        <div className="flex-1 overflow-y-auto py-2 px-2 border-r border-slate-100">
          {tree.map(node => (
            <TreeNodeRow
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              onToggle={toggleExpanded}
              selectedSection={selectedSection}
              onSelect={setSelectedSection}
              onOpenArtifact={onOpenArtifact}
            />
          ))}
        </div>

        {/* Right detail panel */}
        <div className="w-80 flex-shrink-0 overflow-y-auto border-l border-slate-100">
          {selectedSection ? (
            <SectionDetail
              sectionId={selectedSection}
              tree={tree}
              unassignedArtifacts={filteredUnassigned}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              showPicker={showArtifactPicker}
              onTogglePicker={() => setShowArtifactPicker(!showArtifactPicker)}
              onAssign={(artifactId) => {
                onAssignArtifact?.(selectedSection, artifactId);
                setShowArtifactPicker(false);
              }}
              onUnassign={(artifactId) => onUnassignArtifact?.(selectedSection, artifactId)}
              onCreateArtifact={() => {
                const node = findNode(tree, selectedSection);
                if (node) onCreateArtifact?.(selectedSection, node.label);
              }}
              onOpenArtifact={onOpenArtifact}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400">
              <Layers className="h-10 w-10 mb-3 text-slate-300" />
              <p className="text-sm font-medium">Select a section</p>
              <p className="text-xs mt-1">Click on a module or section in the tree to see details and assign documents</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section Detail Panel ──────────────────────────────────────────────────

function findNode(nodes: EctdNode[], id: string): EctdNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

interface SectionDetailProps {
  sectionId: string;
  tree: EctdNode[];
  unassignedArtifacts: ProjectArtifact[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  showPicker: boolean;
  onTogglePicker: () => void;
  onAssign: (artifactId: string) => void;
  onUnassign: (artifactId: string) => void;
  onCreateArtifact: () => void;
  onOpenArtifact?: (artifactId: string) => void;
}

function SectionDetail({
  sectionId,
  tree,
  unassignedArtifacts,
  searchQuery,
  onSearchChange,
  showPicker,
  onTogglePicker,
  onAssign,
  onUnassign,
  onCreateArtifact,
  onOpenArtifact,
}: SectionDetailProps) {
  const node = findNode(tree, sectionId);
  if (!node) return null;

  return (
    <div className="p-4">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          {statusIcon(node.status)}
          <span className="text-xs font-medium text-slate-500">{statusLabel(node.status)}</span>
          {node.required && (
            <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
              Required
            </span>
          )}
        </div>
        <h3 className="text-sm font-semibold text-slate-800">
          {node.id} — {node.label}
        </h3>
      </div>

      {/* Assigned artifacts */}
      <div className="mb-4">
        <h4 className="text-xs font-medium text-slate-500 mb-2">Assigned Documents</h4>
        {node.assignedArtifacts && node.assignedArtifacts.length > 0 ? (
          <div className="space-y-1.5">
            {node.assignedArtifacts.map(a => (
              <div
                key={a.id}
                className="flex items-center gap-2 p-2 rounded-md border border-slate-200 bg-white group"
              >
                <FileText className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-medium text-slate-700 truncate cursor-pointer hover:text-blue-600"
                    onClick={() => onOpenArtifact?.(a.id)}
                  >
                    {a.title}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    v{a.version} · {a.status}
                    {a.wordCount ? ` · ${a.wordCount.toLocaleString()} words` : ''}
                  </p>
                </div>
                <button
                  onClick={() => onUnassign(a.id)}
                  className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Unassign"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No documents assigned</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onTogglePicker}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors duration-150"
        >
          <Link2 className="h-3 w-3" />
          Assign Existing
        </button>
        <button
          onClick={onCreateArtifact}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-md hover:bg-emerald-100 transition-colors duration-150"
        >
          <Plus className="h-3 w-3" />
          Create New
        </button>
      </div>

      {/* Artifact picker */}
      {showPicker && (
        <div className="border border-slate-200 rounded-md p-2 bg-slate-50">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search artifacts..."
              className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-slate-200 focus-visible:ring-2 outline-none focus:ring-blue-300"
            />
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {unassignedArtifacts.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">No unassigned artifacts</p>
            ) : (
              unassignedArtifacts.map(a => (
                <button
                  key={a.id}
                  onClick={() => onAssign(a.id)}
                  className="w-full flex items-center gap-2 p-1.5 text-left rounded hover:bg-white transition-colors duration-150"
                >
                  <FileText className="h-3 w-3 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-700 truncate flex-1">{a.title}</span>
                  <ArrowRight className="h-3 w-3 text-slate-300" />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
