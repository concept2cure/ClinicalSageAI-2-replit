/**
 * @fileoverview Submission Dossier Navigator
 * @module concept2cure/components/submission/DossierNavigator
 * @version 1.0.0
 *
 * @description
 * eCTD-structured view of a regulatory submission. This is how regulatory
 * professionals actually think about submissions - by module structure.
 *
 * Module Structure (ICH CTD):
 * - Module 1: Administrative Information (Region-specific)
 * - Module 2: Common Technical Document Summaries
 * - Module 3: Quality (CMC)
 * - Module 4: Nonclinical Study Reports
 * - Module 5: Clinical Study Reports
 *
 * @compliance
 * - ICH M4: CTD format compliance
 * - FDA eCTD: Technical conformance
 * - FDA 21 CFR Part 11: Audit trail
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { LIFECYCLE } from '../ui/enterprise';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Check,
  Clock,
  AlertCircle,
  Edit3,
  Eye,
  Lock,
  Upload,
  Download,
  Plus,
  MoreHorizontal,
  Search,
  Filter,
  CheckCircle,
  Circle,
  Loader2,
} from 'lucide-react';
import type {
  SubmissionDossier,
  DocumentStatus,
  DossierDocument,
  SubmissionType,
  RegulatoryRegion,
} from '../../types/workspace';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface DossierNavigatorProps {
  dossier: SubmissionDossier;
  onDocumentSelect?: (sectionId: string, docId?: string) => void;
  onDocumentUpload?: (sectionId: string) => void;
  onSectionEdit?: (sectionId: string) => void;
  className?: string;
  /** Real artifacts mapped to sections from useSubmissionArtifacts */
  sectionArtifacts?: Record<string, Array<{ id: string; title: string; status: string; version: number }>>;
  /** Callback when user wants to create a new artifact for a section */
  onCreateArtifact?: (sectionId: string, sectionName: string) => void;
  /** Callback when user wants to open an existing artifact */
  onOpenArtifact?: (artifactId: string) => void;
}

interface TreeNode {
  id: string;
  name: string;
  ectdPath: string;
  type: 'module' | 'section' | 'subsection' | 'document';
  status?: 'not_required' | 'not_started' | 'drafting' | 'review' | 'qc' | 'final' | 'published';
  owner?: string;
  dueDate?: string;
  children?: TreeNode[];
  documents?: DossierDocument[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// eCTD MODULE STRUCTURE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const ECTD_STRUCTURE: Record<
  string,
  { name: string; children?: Record<string, { name: string; children?: Record<string, string> }> }
> = {
  '1': {
    name: 'Administrative Information and Prescribing Information',
    children: {
      '1.1': { name: 'Forms' },
      '1.2': { name: 'Cover Letters' },
      '1.3': {
        name: 'Administrative Information',
        children: {
          '1.3.1': 'Contact/Sponsor Information',
          '1.3.2': 'Field Copy Certification',
          '1.3.3': 'Debarment Certification',
          '1.3.4': 'Financial Disclosure',
          '1.3.5': 'Patent and Exclusivity',
        },
      },
      '1.4': { name: 'References' },
      '1.5': { name: 'Application Status' },
      '1.6': { name: 'Meetings' },
      '1.12': { name: 'REMS' },
      '1.14': {
        name: 'Labeling',
        children: {
          '1.14.1': 'Draft Labeling',
          '1.14.2': 'Final Printed Labeling',
          '1.14.3': 'Listed Drug Labeling',
        },
      },
    },
  },
  '2': {
    name: 'Common Technical Document Summaries',
    children: {
      '2.2': { name: 'Introduction' },
      '2.3': { name: 'Quality Overall Summary' },
      '2.4': { name: 'Nonclinical Overview' },
      '2.5': { name: 'Clinical Overview' },
      '2.6': {
        name: 'Nonclinical Written and Tabulated Summaries',
        children: {
          '2.6.1': 'Introduction',
          '2.6.2': 'Pharmacology Written Summary',
          '2.6.3': 'Pharmacology Tabulated Summary',
          '2.6.4': 'Pharmacokinetics Written Summary',
          '2.6.5': 'Pharmacokinetics Tabulated Summary',
          '2.6.6': 'Toxicology Written Summary',
          '2.6.7': 'Toxicology Tabulated Summary',
        },
      },
      '2.7': {
        name: 'Clinical Summary',
        children: {
          '2.7.1': 'Summary of Biopharmaceutic Studies',
          '2.7.2': 'Summary of Clinical Pharmacology Studies',
          '2.7.3': 'Summary of Clinical Efficacy',
          '2.7.4': 'Summary of Clinical Safety',
          '2.7.5': 'Literature References',
          '2.7.6': 'Synopses of Individual Studies',
        },
      },
    },
  },
  '3': {
    name: 'Quality',
    children: {
      '3.2': {
        name: 'Body of Data',
        children: {
          '3.2.S': 'Drug Substance',
          '3.2.P': 'Drug Product',
          '3.2.A': 'Appendices',
          '3.2.R': 'Regional Information',
        },
      },
      '3.3': { name: 'Literature References' },
    },
  },
  '4': {
    name: 'Nonclinical Study Reports',
    children: {
      '4.2': {
        name: 'Study Reports',
        children: {
          '4.2.1': 'Pharmacology',
          '4.2.2': 'Pharmacokinetics',
          '4.2.3': 'Toxicology',
        },
      },
      '4.3': { name: 'Literature References' },
    },
  },
  '5': {
    name: 'Clinical Study Reports',
    children: {
      '5.2': { name: 'Tabular Listing of All Clinical Studies' },
      '5.3': {
        name: 'Clinical Study Reports',
        children: {
          '5.3.1': 'Biopharmaceutic Studies',
          '5.3.2': 'PK/PD Studies',
          '5.3.3': 'Studies in Healthy Subjects',
          '5.3.4': 'Patient PK and Initial Tolerability',
          '5.3.5': 'Efficacy and Safety Studies',
          '5.3.6': 'Post-Marketing Experience',
          '5.3.7': 'Case Report Forms and Individual Patient Listings',
        },
      },
      '5.4': { name: 'Literature References' },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const getStatusConfig = (status?: DocumentStatus['status']) => {
  switch (status) {
    case 'published':
      return {
        icon: CheckCircle,
        color: LIFECYCLE.published.text,
        bg: LIFECYCLE.published.bg,
        label: 'Published',
      };
    case 'final':
      return { icon: Check, color: LIFECYCLE.approved.text, bg: LIFECYCLE.approved.bg, label: 'Final' };
    case 'qc':
      return { icon: Eye, color: LIFECYCLE.in_review.text, bg: LIFECYCLE.in_review.bg, label: 'QC Review' };
    case 'review':
      return { icon: Eye, color: LIFECYCLE.in_review.text, bg: LIFECYCLE.in_review.bg, label: 'Under Review' };
    case 'drafting':
      return { icon: Edit3, color: LIFECYCLE.draft.text, bg: LIFECYCLE.draft.bg, label: 'Drafting' };
    case 'not_started':
      return { icon: Circle, color: LIFECYCLE.not_started.text, bg: LIFECYCLE.not_started.bg, label: 'Not Started' };
    case 'not_required':
      return { icon: Lock, color: LIFECYCLE.archived.text, bg: LIFECYCLE.archived.bg, label: 'Not Required' };
    default:
      return { icon: Circle, color: LIFECYCLE.not_started.text, bg: LIFECYCLE.not_started.bg, label: 'Pending' };
  }
};

const getProgressForModule = (
  moduleId: string,
  dossier: SubmissionDossier,
  sectionArtifacts?: Record<string, Array<{ id: string; title: string; status: string; version: number }>>
): { complete: number; total: number } => {
  // If we have real artifact data, compute progress from it
  if (sectionArtifacts) {
    let total = 0;
    let complete = 0;
    for (const [section, arts] of Object.entries(sectionArtifacts)) {
      if (section.startsWith(`${moduleId}.`) || section.startsWith(`m${moduleId}`)) {
        total++;
        if (arts.some(a => a.status === 'approved' || a.status === 'locked' || a.status === 'review' || a.status === 'final' || a.status === 'qc')) {
          complete++;
        }
      }
    }
    if (total > 0) return { complete, total };
  }

  // Calculate from actual dossier section statuses
  const moduleSections = (dossier.sections || []).filter(
    (s: any) => s.ectdPath?.startsWith(`${moduleId}.`) || s.moduleId === moduleId
  );
  if (moduleSections.length === 0) {
    // Fall back to counting subsections in the static structure
    const mod = ECTD_STRUCTURE[moduleId];
    const total = mod?.children ? Object.keys(mod.children).length : 0;
    return { complete: 0, total: Math.max(total, 1) };
  }
  const complete = moduleSections.filter(
    (s: any) => s.status === 'final' || s.status === 'published' || s.status === 'qc'
  ).length;
  return { complete, total: moduleSections.length };
};

// ═══════════════════════════════════════════════════════════════════════════════
// TREE NODE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface TreeNodeItemProps {
  node: TreeNode;
  level: number;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onUpload?: () => void;
  onCreateArtifact?: (sectionId: string, sectionName: string) => void;
  onOpenArtifact?: (artifactId: string) => void;
  isSelected?: boolean;
}

const TreeNodeItem: React.FC<TreeNodeItemProps> = ({
  node,
  level,
  isExpanded,
  onToggle,
  onSelect,
  onUpload,
  onCreateArtifact,
  onOpenArtifact,
  isSelected,
}) => {
  const hasChildren = node.children && node.children.length > 0;
  const statusConfig = getStatusConfig(node.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div
      className={cn(
        'group flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors duration-150',
        isSelected ? 'bg-blue-50' : 'hover:bg-zinc-50',
        level > 0 && 'ml-4'
      )}
    >
      {/* Expand/Collapse */}
      {hasChildren ? (
        <button
          onClick={e => {
            e.stopPropagation();
            onToggle();
          }}
          className="p-1 hover:bg-zinc-200 rounded"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-500" />
          )}
        </button>
      ) : (
        <div className="w-5" />
      )}

      {/* Folder/Document Icon */}
      <div onClick={onSelect} className="flex-1 flex items-center gap-2 min-w-0">
        {node.type === 'module' || node.type === 'section' ? (
          isExpanded ? (
            <FolderOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
          )
        ) : (
          <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
        )}

        {/* Name */}
        <span
          className={cn(
            'text-sm truncate',
            node.type === 'module' ? 'font-semibold text-zinc-900' : 'text-zinc-700'
          )}
        >
          <span className="text-zinc-400 mr-1">{node.ectdPath}</span>
          {node.name}
        </span>

        {/* Status badge */}
        {node.status && node.status !== 'not_required' && (
          <span
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs flex-shrink-0',
              statusConfig.bg,
              statusConfig.color
            )}
          >
            <StatusIcon className="w-3 h-3" />
            <span className="hidden sm:inline">{statusConfig.label}</span>
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {node.type === 'subsection' && onCreateArtifact && (
          <button
            onClick={(e) => { e.stopPropagation(); onCreateArtifact(node.id, node.name); }}
            className="p-1 hover:bg-blue-100 rounded"
            title="Create draft with AI"
          >
            <Plus className="w-3.5 h-3.5 text-blue-500" />
          </button>
        )}
        {node.type === 'subsection' && onUpload && (
          <button
            onClick={e => {
              e.stopPropagation();
              onUpload();
            }}
            className="p-1 hover:bg-zinc-200 rounded"
            title="Upload document"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-500" />
          </button>
        )}
        <button className="p-1 hover:bg-zinc-200 rounded" title="More actions">
          <MoreHorizontal className="w-3.5 h-3.5 text-zinc-500" />
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE HEADER
// ═══════════════════════════════════════════════════════════════════════════════

const ModuleHeader: React.FC<{
  moduleId: string;
  moduleName: string;
  progress: { complete: number; total: number };
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ moduleId, moduleName, progress, isExpanded, onToggle }) => {
  const progressPercent = Math.round((progress.complete / progress.total) * 100);

  return (
    <button
      onClick={onToggle}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-xl transition-colors duration-150',
        'border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50',
        isExpanded && 'bg-zinc-50 border-zinc-300'
      )}
    >
      {/* Module number */}
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center text-lg font-semibold flex-shrink-0',
          moduleId === '1' && 'bg-blue-100 text-blue-700',
          moduleId === '2' && 'bg-blue-100 text-blue-700',
          moduleId === '3' && 'bg-emerald-100 text-emerald-700',
          moduleId === '4' && 'bg-amber-100 text-amber-700',
          moduleId === '5' && 'bg-pink-100 text-pink-700'
        )}
      >
        {moduleId}
      </div>

      {/* Module info */}
      <div className="flex-1 text-left min-w-0">
        <h3 className="font-semibold text-zinc-900 text-sm">Module {moduleId}</h3>
        <p className="text-xs text-zinc-500 truncate">{moduleName}</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="w-24">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-zinc-500">
              {progress.complete}/{progress.total}
            </span>
            <span className="font-medium text-zinc-700">{progressPercent}%</span>
          </div>
          <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-150',
                progressPercent === 100 && 'bg-emerald-500',
                progressPercent >= 50 && progressPercent < 100 && 'bg-blue-500',
                progressPercent < 50 && 'bg-amber-500'
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {isExpanded ? (
          <ChevronDown className="w-5 h-5 text-zinc-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-zinc-400" />
        )}
      </div>
    </button>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const DossierNavigator: React.FC<DossierNavigatorProps> = ({
  dossier,
  onDocumentSelect,
  onDocumentUpload,
  onSectionEdit,
  className,
  sectionArtifacts,
  onCreateArtifact,
  onOpenArtifact,
}) => {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(['2']));
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  // Toggle module expansion
  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  // Toggle section expansion
  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Calculate overall progress from actual dossier sections
  const overallProgress = useMemo(() => {
    const sections = dossier.sections || [];
    if (sections.length === 0) {
      // Sum subsections from static structure
      const total = Object.values(ECTD_STRUCTURE).reduce((sum, mod) => {
        return sum + (mod.children ? Object.keys(mod.children).length : 0);
      }, 0);
      return { complete: 0, total, percent: 0 };
    }
    const complete = sections.filter(
      (s: any) => s.status === 'final' || s.status === 'published' || s.status === 'qc'
    ).length;
    const total = sections.length;
    return { complete, total, percent: total > 0 ? Math.round((complete / total) * 100) : 0 };
  }, [dossier]);

  return (
    <div className={cn('flex flex-col h-full bg-white', className)}>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-200 p-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{dossier.name}</h2>
            <div className="flex items-center gap-2 mt-1 text-sm text-zinc-500">
              <span className="font-medium">{dossier.type}</span>
              <span>•</span>
              <span>Sequence {dossier.sequence}</span>
              {dossier.applicationNumber && (
                <>
                  <span>•</span>
                  <span>{dossier.applicationNumber}</span>
                </>
              )}
            </div>
          </div>

          {/* Overall Status */}
          <div className="text-right">
            <div
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium',
                dossier.status.overall === 'drafting' && 'bg-blue-100 text-blue-700',
                dossier.status.overall === 'internal_review' && 'bg-amber-100 text-amber-700',
                dossier.status.overall === 'qc' && 'bg-blue-100 text-blue-700',
                dossier.status.overall === 'ready' && 'bg-emerald-100 text-emerald-700',
                dossier.status.overall === 'submitted' && 'bg-zinc-100 text-zinc-700'
              )}
            >
              {dossier.status.overall === 'drafting' && <Edit3 className="w-3.5 h-3.5" />}
              {dossier.status.overall === 'qc' && <Eye className="w-3.5 h-3.5" />}
              {dossier.status.overall === 'ready' && <CheckCircle className="w-3.5 h-3.5" />}
              {dossier.status.overall.replace('_', ' ').toUpperCase()}
            </div>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-zinc-500">Dossier Completion</span>
            <span className="font-medium text-zinc-900">{overallProgress.percent}%</span>
          </div>
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-150"
              style={{ width: `${overallProgress.percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
            <span>{overallProgress.complete} sections complete</span>
            <span>{overallProgress.total - overallProgress.complete} remaining</span>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search sections..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
            />
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm border border-zinc-200 rounded-lg hover:bg-zinc-50">
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>
      </div>

      {/* Module List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {Object.entries(ECTD_STRUCTURE).map(([moduleId, module]) => {
          const isExpanded = expandedModules.has(moduleId);
          const progress = getProgressForModule(moduleId, dossier, sectionArtifacts);

          return (
            <div key={moduleId}>
              <ModuleHeader
                moduleId={moduleId}
                moduleName={module.name}
                progress={progress}
                isExpanded={isExpanded}
                onToggle={() => toggleModule(moduleId)}
              />

              {/* Module contents */}
              {isExpanded && module.children && (
                <div className="mt-2 ml-4 pl-4 border-l border-zinc-200">
                  {Object.entries(module.children).map(([sectionId, section]) => {
                    const sectionExpanded = expandedSections.has(sectionId);
                    const hasSubsections = typeof section === 'object' && 'children' in section;

                    return (
                      <div key={sectionId}>
                        <TreeNodeItem
                          node={{
                            id: sectionId,
                            name: typeof section === 'string' ? section : section.name,
                            ectdPath: sectionId,
                            type: 'section',
                            status: (() => {
                              // Prefer real artifact data
                              const arts = sectionArtifacts?.[sectionId];
                              if (arts && arts.length > 0) {
                                if (arts.some(a => a.status === 'approved' || a.status === 'locked')) return 'final';
                                if (arts.some(a => a.status === 'review')) return 'review';
                                return 'drafting';
                              }
                              // Fallback to dossier sections
                              return (dossier.sections || []).find((s: any) => s.ectdPath === sectionId || s.id === sectionId)?.status || 'not_started';
                            })(),
                            children: hasSubsections ? [] : undefined,
                          }}
                          level={0}
                          isExpanded={sectionExpanded}
                          onToggle={() => toggleSection(sectionId)}
                          onSelect={() => {
                            setSelectedSection(sectionId);
                            onDocumentSelect?.(sectionId);
                          }}
                          onCreateArtifact={onCreateArtifact}
                          onOpenArtifact={onOpenArtifact}
                          isSelected={selectedSection === sectionId}
                        />

                        {/* Subsections */}
                        {sectionExpanded && hasSubsections && (section as any).children && (
                          <div className="ml-4">
                            {Object.entries((section as any).children).map(([subId, subName]) => (
                              <React.Fragment key={subId}>
                                <TreeNodeItem
                                  node={{
                                    id: subId,
                                    name: subName as string,
                                    ectdPath: subId,
                                    type: 'subsection',
                                    status: (() => {
                                      // Prefer real artifact data
                                      const arts = sectionArtifacts?.[subId];
                                      if (arts && arts.length > 0) {
                                        if (arts.some(a => a.status === 'approved' || a.status === 'locked')) return 'final';
                                        if (arts.some(a => a.status === 'review')) return 'review';
                                        return 'drafting';
                                      }
                                      // Fallback to dossier sections
                                      return (dossier.sections || []).find((s: any) => s.ectdPath === subId || s.id === subId)?.status || 'not_started';
                                    })(),
                                  }}
                                  level={1}
                                  isExpanded={false}
                                  onToggle={() => {}}
                                  onSelect={() => {
                                    setSelectedSection(subId);
                                    onDocumentSelect?.(subId);
                                  }}
                                  onUpload={() => onDocumentUpload?.(subId)}
                                  onCreateArtifact={onCreateArtifact}
                                  onOpenArtifact={onOpenArtifact}
                                  isSelected={selectedSection === subId}
                                />
                                {/* Show artifacts for this section */}
                                {sectionArtifacts?.[subId]?.map(art => (
                                  <div
                                    key={art.id}
                                    onClick={() => onOpenArtifact?.(art.id)}
                                    className="ml-12 flex items-center gap-2 py-1 px-2 text-xs text-zinc-600 hover:bg-blue-50 rounded cursor-pointer group"
                                  >
                                    <FileText className="w-3 h-3 text-blue-400" />
                                    <span className="truncate flex-1">{art.title}</span>
                                    <span className={cn(
                                      'px-1.5 py-0.5 rounded text-xs font-medium',
                                      art.status === 'draft' && 'bg-blue-50 text-blue-600',
                                      art.status === 'review' && 'bg-amber-50 text-amber-600',
                                      (art.status === 'approved' || art.status === 'locked') && 'bg-emerald-50 text-emerald-600',
                                    )}>
                                      {art.status}
                                    </span>
                                    <span className="text-xs text-zinc-400">v{art.version}</span>
                                  </div>
                                ))}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      <div className="flex-shrink-0 border-t border-zinc-200 p-4">
        <div className="flex items-center gap-2">
          <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-zinc-700 border border-zinc-200 rounded-lg hover:bg-zinc-50">
            <Download className="w-4 h-4" />
            Export eCTD
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            <Check className="w-4 h-4" />
            Validate
          </button>
        </div>
      </div>
    </div>
  );
};

export default DossierNavigator;

// ─── Standalone (self-contained demo entry point for ZenApp) ──────────────────

const _ds = (
  sectionId: string,
  sectionName: string,
  status: DocumentStatus['status']
): DocumentStatus => ({
  sectionId,
  sectionName,
  status,
  documents: [] as DossierDocument[],
});

const DEMO_DOSSIER: SubmissionDossier = {
  id: 'dossier-ind-001',
  name: 'Lemizumab IND Submission',
  type: 'IND',
  sequence: '0000',
  region: 'US',
  applicationNumber: 'IND 123456',
  productId: 'lemizumab-001',
  sponsor: 'Concept2Cure Therapeutics, Inc.',
  modules: {
    module1: {
      id: 'm1',
      coverLetter: _ds('1.1', 'Cover Letter', 'final'),
      forms: { form1571: _ds('1.2', 'Form FDA 1571', 'final') },
    },
    module2: {
      id: 'm2',
      qualityOverall: _ds('2.3', 'Quality Overall Summary', 'review'),
      nonclinicalOverall: _ds('2.4', 'Nonclinical Overview', 'drafting'),
      clinicalOverall: _ds('2.5', 'Clinical Overview', 'not_started'),
      nonclinicalWritten: _ds('2.6', 'Nonclinical Written Summary', 'drafting'),
      nonclinicalTabulated: _ds('2.7', 'Nonclinical Tabulated Summary', 'not_started'),
      clinicalWritten: _ds('2.7.3', 'Clinical Summary', 'not_started'),
      clinicalTabulated: _ds('2.7.4', 'Clinical Tabulated Listing', 'not_started'),
    },
    module3: {
      id: 'm3',
      drugSubstance: {
        generalInfo: _ds('3.2.S.1', 'General Information', 'final'),
        manufacture: _ds('3.2.S.2', 'Manufacture', 'review'),
        characterization: _ds('3.2.S.3', 'Characterization', 'review'),
        control: _ds('3.2.S.4', 'Control of Drug Substance', 'drafting'),
        referenceStandards: _ds('3.2.S.5', 'Reference Standards', 'not_started'),
        containerClosure: _ds('3.2.S.6', 'Container Closure', 'drafting'),
        stability: _ds('3.2.S.7', 'Stability', 'drafting'),
      },
      drugProduct: {
        description: _ds('3.2.P.1', 'Description of Product', 'drafting'),
        development: _ds('3.2.P.2', 'Pharmaceutical Development', 'not_started'),
        manufacture: _ds('3.2.P.3', 'Manufacture', 'not_started'),
        control: _ds('3.2.P.4', 'Control of Drug Product', 'not_started'),
        referenceStandards: _ds('3.2.P.5', 'Reference Standards', 'not_started'),
        containerClosure: _ds('3.2.P.6', 'Container Closure', 'not_started'),
        stability: _ds('3.2.P.7', 'Stability', 'not_started'),
      },
    },
    module4: {
      id: 'm4',
      pharmacology: _ds('4.2.1', 'Pharmacology', 'review'),
      pharmacokinetics: _ds('4.2.2', 'Pharmacokinetics', 'drafting'),
      toxicology: _ds('4.2.3', 'Toxicology', 'not_started'),
    },
    module5: {
      id: 'm5',
      biopharmStudies: _ds('5.3.1', 'Biopharmaceutics Studies', 'not_started'),
      clinicalPharmStudies: _ds('5.3.2', 'Clinical Pharmacology Studies', 'not_started'),
      efficacyStudies: _ds('5.3.5', 'Reports of Efficacy Studies', 'not_started'),
      safetyStudies: _ds('5.3.4', 'Safety Studies', 'not_started'),
      literatureRefs: _ds('5.4', 'Literature References', 'not_started'),
      synopses: _ds('5.3.7', 'Clinical Study Synopses', 'not_started'),
    },
  },
  status: {
    overall: 'drafting',
    moduleStatus: {
      m1: 'complete',
      m2: 'in_progress',
      m3: 'in_progress',
      m4: 'in_progress',
      m5: 'not_started',
    },
  },
  timeline: {
    targetFiling: '2026-09-30',
  },
};

export const DossierNavigatorStandalone: React.FC = () => (
  <DossierNavigator dossier={DEMO_DOSSIER} />
);
