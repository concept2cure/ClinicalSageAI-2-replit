/**
 * @fileoverview Dossier Map — eCTD section structure with status tracking
 *
 * Displays the full IND/eCTD dossier structure as a navigable map.
 * Each section shows its current status:
 *   Not Started | Drafting | In Review | Approved | Blocked | Locked
 *
 * Users can drill into any section to open the SectionWorkspace.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronRight,
  PenLine,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  CircleDot,
  Lock,
  FileText,
  ArrowLeft,
  Eye,
  X,
} from 'lucide-react';
import { useDocumentModeOptional } from '../../contexts/DocumentModeContext';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SectionStatus = 'not-started' | 'drafting' | 'in-review' | 'approved' | 'blocked' | 'locked';

export interface DossierSection {
  code: string;
  title: string;
  status: SectionStatus;
  children?: DossierSection[];
  assignee?: string;
  updatedAt?: string;
  blockerCount?: number;
}

export interface DossierMapProps {
  projectName?: string;
  projectType?: string;
  sections?: DossierSection[];
  onSectionClick: (sectionCode: string) => void;
  onBack?: () => void;
}

// ─── Status configuration ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<SectionStatus, {
  label: string;
  color: string;
  bg: string;
  dotColor: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  'not-started': { label: 'Not Started', color: 'text-zinc-400', bg: 'bg-zinc-100', dotColor: 'bg-zinc-300', icon: CircleDot },
  'drafting': { label: 'Drafting', color: 'text-blue-600', bg: 'bg-blue-50', dotColor: 'bg-blue-500', icon: PenLine },
  'in-review': { label: 'In Review', color: 'text-amber-600', bg: 'bg-amber-50', dotColor: 'bg-amber-500', icon: Clock },
  'approved': { label: 'Approved', color: 'text-emerald-600', bg: 'bg-emerald-50', dotColor: 'bg-emerald-500', icon: CheckCircle2 },
  'blocked': { label: 'Blocked', color: 'text-red-600', bg: 'bg-red-50', dotColor: 'bg-red-500', icon: AlertTriangle },
  'locked': { label: 'Locked', color: 'text-violet-600', bg: 'bg-violet-50', dotColor: 'bg-violet-500', icon: Lock },
};

// ─── Default eCTD IND structure ─────────────────────────────────────────────

const DEFAULT_IND_SECTIONS: DossierSection[] = [
  {
    code: '1', title: 'Module 1 — Administrative', status: 'approved',
    children: [
      { code: '1.1', title: 'Forms', status: 'approved' },
      { code: '1.2', title: 'Cover Letter', status: 'approved' },
      { code: '1.3', title: 'Administrative Information', status: 'drafting',
        children: [
          { code: '1.3.1', title: 'Form FDA 1571', status: 'approved' },
          { code: '1.3.2', title: 'Form FDA 1572', status: 'drafting' },
          { code: '1.3.3', title: 'Financial Disclosure', status: 'not-started' },
        ],
      },
    ],
  },
  {
    code: '2', title: 'Module 2 — CTD Summaries', status: 'drafting',
    children: [
      { code: '2.2', title: 'Introduction', status: 'drafting' },
      { code: '2.3', title: 'Quality Overall Summary', status: 'not-started' },
      { code: '2.4', title: 'Nonclinical Overview', status: 'not-started' },
      { code: '2.5', title: 'Clinical Overview', status: 'drafting' },
      { code: '2.6', title: 'Nonclinical Summary', status: 'not-started',
        children: [
          { code: '2.6.1', title: 'Pharmacology', status: 'not-started' },
          { code: '2.6.2', title: 'Pharmacokinetics', status: 'not-started' },
          { code: '2.6.3', title: 'Toxicology', status: 'not-started' },
        ],
      },
      { code: '2.7', title: 'Clinical Summary', status: 'drafting',
        children: [
          { code: '2.7.1', title: 'Biopharmaceutic Studies', status: 'not-started' },
          { code: '2.7.2', title: 'Clinical Pharmacology', status: 'not-started' },
          { code: '2.7.3', title: 'Clinical Efficacy', status: 'drafting' },
          { code: '2.7.4', title: 'Clinical Safety', status: 'not-started' },
          { code: '2.7.5', title: 'Literature References', status: 'not-started' },
          { code: '2.7.6', title: 'Synopses', status: 'not-started' },
        ],
      },
    ],
  },
  {
    code: '3', title: 'Module 3 — Quality', status: 'in-review',
    children: [
      { code: '3.2.S', title: 'Drug Substance', status: 'in-review' },
      { code: '3.2.P', title: 'Drug Product', status: 'in-review' },
      { code: '3.2.A', title: 'Appendices', status: 'not-started' },
      { code: '3.2.R', title: 'Regional Information', status: 'not-started' },
    ],
  },
  {
    code: '4', title: 'Module 4 — Nonclinical', status: 'not-started',
    children: [
      { code: '4.2.1', title: 'Pharmacology', status: 'not-started' },
      { code: '4.2.2', title: 'Pharmacokinetics', status: 'not-started' },
      { code: '4.2.3', title: 'Toxicology', status: 'not-started' },
    ],
  },
  {
    code: '5', title: 'Module 5 — Clinical', status: 'blocked',
    children: [
      { code: '5.2', title: 'Tabular Listing of Studies', status: 'not-started' },
      { code: '5.3', title: 'Clinical Study Reports', status: 'blocked', blockerCount: 2 },
      { code: '5.4', title: 'Literature References', status: 'not-started' },
    ],
  },
];

// ─── Section row component ──────────────────────────────────────────────────

const SectionRow: React.FC<{
  section: DossierSection;
  depth: number;
  onSectionClick: (code: string) => void;
  onPreview?: (section: DossierSection) => void;
  selectedCode?: string;
}> = ({ section, depth, onSectionClick, onPreview, selectedCode }) => {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = section.children && section.children.length > 0;
  const cfg = STATUS_CONFIG[section.status];
  const StatusIcon = cfg.icon;
  const isSelected = !hasChildren && selectedCode === section.code;

  return (
    <>
      <button
        onClick={() => {
          if (hasChildren) {
            setExpanded(!expanded);
          } else if (onPreview) {
            onPreview(section);
          } else {
            onSectionClick(section.code);
          }
        }}
        className={cn(
          'w-full flex items-center gap-2 py-2.5 px-4 text-left hover:bg-zinc-50 transition-colors border-b border-zinc-50',
          depth === 0 && 'bg-zinc-50/50 font-medium',
          isSelected && 'bg-blue-50/70 border-l-2 border-l-blue-500',
        )}
        style={{ paddingLeft: `${16 + depth * 20}px` }}
      >
        {/* Expand/collapse or spacer */}
        <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
          {hasChildren ? (
            expanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
          ) : (
            <FileText className="w-3 h-3 text-zinc-300" />
          )}
        </span>

        {/* Section code */}
        <span className="text-xs font-mono text-zinc-400 w-12 flex-shrink-0">{section.code}</span>

        {/* Title */}
        <span className={cn('flex-1 text-sm truncate', depth === 0 ? 'text-zinc-900' : 'text-zinc-700')}>
          {section.title}
        </span>

        {/* Blocker badge */}
        {section.blockerCount && section.blockerCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">
            {section.blockerCount} blocker{section.blockerCount > 1 ? 's' : ''}
          </span>
        )}

        {/* Status badge */}
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0', cfg.bg, cfg.color)}>
          <StatusIcon className="w-2.5 h-2.5" />
          {cfg.label}
        </span>

        {/* Arrow for leaf sections */}
        {!hasChildren && (
          <ChevronRight className="w-3 h-3 text-zinc-300 flex-shrink-0" />
        )}
      </button>

      {/* Children */}
      {hasChildren && expanded && section.children!.map(child => (
        <SectionRow
          key={child.code}
          section={child}
          depth={depth + 1}
          onSectionClick={onSectionClick}
          onPreview={onPreview}
          selectedCode={selectedCode}
        />
      ))}
    </>
  );
};

// ─── Status filter bar ──────────────────────────────────────────────────────

const StatusFilterBar: React.FC<{
  sections: DossierSection[];
  activeFilter: SectionStatus | 'all';
  onFilter: (status: SectionStatus | 'all') => void;
}> = ({ sections, activeFilter, onFilter }) => {
  // Count all leaf sections
  const countStatus = (secs: DossierSection[], status: SectionStatus): number => {
    return secs.reduce((count, s) => {
      if (s.children && s.children.length > 0) {
        return count + countStatus(s.children, status);
      }
      return count + (s.status === status ? 1 : 0);
    }, 0);
  };

  const countAll = (secs: DossierSection[]): number => {
    return secs.reduce((count, s) => {
      if (s.children && s.children.length > 0) {
        return count + countAll(s.children);
      }
      return count + 1;
    }, 0);
  };

  const filters: { key: SectionStatus | 'all'; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: countAll(sections) },
    { key: 'not-started', label: 'Not Started', count: countStatus(sections, 'not-started') },
    { key: 'drafting', label: 'Drafting', count: countStatus(sections, 'drafting') },
    { key: 'in-review', label: 'In Review', count: countStatus(sections, 'in-review') },
    { key: 'approved', label: 'Approved', count: countStatus(sections, 'approved') },
    { key: 'blocked', label: 'Blocked', count: countStatus(sections, 'blocked') },
  ];

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {filters.map(f => (
        <button
          key={f.key}
          onClick={() => onFilter(f.key)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
            activeFilter === f.key
              ? 'bg-zinc-900 text-white'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          )}
        >
          {f.key !== 'all' && <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_CONFIG[f.key as SectionStatus].dotColor)} />}
          {f.label}
          <span className={cn('text-[10px]', activeFilter === f.key ? 'text-zinc-400' : 'text-zinc-400')}>{f.count}</span>
        </button>
      ))}
    </div>
  );
};

// ─── Main component ─────────────────────────────────────────────────────────

export const DossierMap: React.FC<DossierMapProps> = ({
  projectName,
  projectType,
  sections = DEFAULT_IND_SECTIONS,
  onSectionClick,
  onBack,
}) => {
  const [activeFilter, setActiveFilter] = useState<SectionStatus | 'all'>('all');
  const [selectedSection, setSelectedSection] = useState<DossierSection | null>(null);
  const modeCtx = useDocumentModeOptional();

  // Determine if we should show preview (dossier stage context available)
  const showPreviewOnClick = !!modeCtx || true; // Always enable preview pane in dossier map

  // Filter logic: show sections matching filter (or all)
  const filterSections = (secs: DossierSection[]): DossierSection[] => {
    if (activeFilter === 'all') return secs;
    return secs.reduce<DossierSection[]>((acc, s) => {
      if (s.children && s.children.length > 0) {
        const filtered = filterSections(s.children);
        if (filtered.length > 0) {
          acc.push({ ...s, children: filtered });
        }
      } else if (s.status === activeFilter) {
        acc.push(s);
      }
      return acc;
    }, []);
  };

  const displayed = filterSections(sections);

  const handlePreview = (section: DossierSection) => {
    setSelectedSection(section);
  };

  return (
    <div className="flex-1 flex min-h-0 bg-zinc-50/30">
      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-zinc-200 px-6 py-4">
          <div className="max-w-5xl mx-auto">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 transition-colors mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to project
              </button>
            )}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-zinc-900">Dossier Map</h1>
                {projectName && (
                  <p className="text-sm text-zinc-500 mt-0.5">
                    {projectName} {projectType ? `· ${projectType}` : ''} · eCTD Structure
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4">
              <StatusFilterBar
                sections={sections}
                activeFilter={activeFilter}
                onFilter={setActiveFilter}
              />
            </div>
          </div>
        </div>

        {/* Section tree */}
        <div className="flex-1 overflow-y-auto zen-scroll">
          <div className="max-w-5xl mx-auto py-2">
            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white mx-6 my-4">
              {displayed.length > 0 ? (
                displayed.map(section => (
                  <SectionRow
                    key={section.code}
                    section={section}
                    depth={0}
                    onSectionClick={onSectionClick}
                    onPreview={showPreviewOnClick ? handlePreview : undefined}
                    selectedCode={selectedSection?.code}
                  />
                ))
              ) : (
                <div className="p-8 text-center text-sm text-zinc-400">
                  No sections match the selected filter
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview pane */}
      {selectedSection && (
        <SectionPreviewPane
          section={selectedSection}
          onClose={() => setSelectedSection(null)}
          onOpenInWorkspace={() => {
            onSectionClick(selectedSection.code);
          }}
        />
      )}
    </div>
  );
};

// ─── Section preview pane ──────────────────────────────────────────────────

const SectionPreviewPane: React.FC<{
  section: DossierSection;
  onClose: () => void;
  onOpenInWorkspace: () => void;
}> = ({ section, onClose, onOpenInWorkspace }) => {
  const cfg = STATUS_CONFIG[section.status];
  const StatusIcon = cfg.icon;

  return (
    <div className="w-96 flex-shrink-0 border-l border-zinc-200 bg-white flex flex-col min-h-0">
      {/* Preview header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          <span className="text-sm font-medium text-zinc-900 truncate">Section Preview</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-y-auto zen-scroll px-5 py-4 space-y-4">
        {/* Section code & title */}
        <div>
          <span className="text-xs font-mono text-zinc-400">{section.code}</span>
          <h3 className="text-base font-semibold text-zinc-900 mt-0.5">{section.title}</h3>
        </div>

        {/* Status badge */}
        <div>
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Status</span>
          <div className="mt-1.5">
            <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', cfg.bg, cfg.color)}>
              <StatusIcon className="w-3 h-3" />
              {cfg.label}
            </span>
          </div>
        </div>

        {/* Blocker info */}
        {section.blockerCount && section.blockerCount > 0 && (
          <div>
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Blockers</span>
            <p className="mt-1 text-sm text-red-600 font-medium">
              {section.blockerCount} blocker{section.blockerCount > 1 ? 's' : ''} identified
            </p>
          </div>
        )}

        {/* Assignee */}
        {section.assignee && (
          <div>
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Assignee</span>
            <p className="mt-1 text-sm text-zinc-700">{section.assignee}</p>
          </div>
        )}

        {/* Last updated */}
        {section.updatedAt && (
          <div>
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Last Updated</span>
            <p className="mt-1 text-sm text-zinc-700">{section.updatedAt}</p>
          </div>
        )}

        {/* Content preview placeholder */}
        <div>
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Content Preview</span>
          <div className="mt-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 min-h-[120px]">
            <p className="text-xs text-zinc-400 italic">
              Section {section.code} content will appear here when available.
            </p>
            <p className="text-xs text-zinc-400 mt-2">
              Open in workspace to view, edit, or generate content for this section.
            </p>
          </div>
        </div>
      </div>

      {/* Footer action */}
      <div className="flex-shrink-0 px-5 py-4 border-t border-zinc-200">
        <button
          onClick={onOpenInWorkspace}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <FileText className="w-4 h-4" />
          Open in Section Workspace
        </button>
      </div>
    </div>
  );
};

export default DossierMap;
