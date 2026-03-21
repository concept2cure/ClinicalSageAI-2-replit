/**
 * @fileoverview IND Workspace — Minimalist IND Filing Command Center
 * @module concept2cure/pages/INDWorkspace
 * @version 1.0.0
 *
 * @description
 * Highly focused, minimalist workspace for IND (Investigational New Drug) filing.
 * Displays real-time CTD module progress, section navigator, and context-aware
 * AI drafting panel. Connects to the IND Pyramid engine, eCTD section map,
 * CoAuthor document editor, and Lumen Cortex chat.
 *
 * Design: Ultra-clean, no visual noise. Content-first. Breathing room.
 * Inspired by Linear/Notion/Arc — dense information, minimal chrome.
 *
 * @compliance FDA 21 CFR Part 11, ICH M4, eCTD 4.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  FileText,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  Search,
  Filter,
  BarChart3,
  Play,
  ArrowRight,
  Lock,
  Package,
  Download,
  X,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Info,
} from 'lucide-react';
import { useModules, useEctdCompile, useEctdStatus } from '../../hooks/useModules';
import type { CompilationResult } from '../../hooks/useModules';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type SectionStatus = 'not_started' | 'drafting' | 'review' | 'approved' | 'locked';
type ViewFilter = 'all' | 'required' | 'in_progress' | 'ai_draftable';

interface CTDSection {
  code: string;
  title: string;
  module: string;
  required: boolean;
  aiDraftable: boolean;
  status: SectionStatus;
  role: string;
  estimatedHours: number;
  children?: CTDSection[];
}

interface INDWorkspaceProps {
  projectId?: string;
  projectName?: string;
  submissionType?: string;
  onOpenSection?: (sectionCode: string) => void;
  onDraftWithAI?: (sectionCode: string, sectionTitle: string) => void;
  onNavigateToCoAuthor?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IND CTD SECTIONS (Static definition — mirrors ind-ectd-sections.ts)
// In production, this would be fetched from the API with live status
// ═══════════════════════════════════════════════════════════════════════════════

const IND_MODULES: CTDSection[] = [
  {
    code: 'm1',
    title: 'Module 1: Administrative',
    module: 'M1',
    required: true,
    aiDraftable: false,
    status: 'not_started',
    role: 'ra_lead',
    estimatedHours: 50,
    children: [
      {
        code: 'm1.1',
        title: 'FDA Forms (1571, 1572, 3674)',
        module: 'M1',
        required: true,
        aiDraftable: false,
        status: 'not_started',
        role: 'ra_associate',
        estimatedHours: 4,
      },
      {
        code: 'm1.2',
        title: 'Cover Letter',
        module: 'M1',
        required: true,
        aiDraftable: true,
        status: 'not_started',
        role: 'ra_lead',
        estimatedHours: 3,
      },
      {
        code: 'm1.5',
        title: 'Table of Contents',
        module: 'M1',
        required: true,
        aiDraftable: true,
        status: 'not_started',
        role: 'regulatory_ops',
        estimatedHours: 2,
      },
      {
        code: 'm1.6',
        title: 'Introductory Statement & Investigational Plan',
        module: 'M1',
        required: true,
        aiDraftable: true,
        status: 'not_started',
        role: 'medical_writer',
        estimatedHours: 8,
      },
      {
        code: 'm1.7',
        title: "Investigator's Brochure",
        module: 'M1',
        required: true,
        aiDraftable: true,
        status: 'not_started',
        role: 'medical_writer',
        estimatedHours: 20,
      },
      {
        code: 'm1.9',
        title: 'Environmental Assessment',
        module: 'M1',
        required: true,
        aiDraftable: true,
        status: 'not_started',
        role: 'ra_associate',
        estimatedHours: 2,
      },
    ],
  },
  {
    code: 'm2',
    title: 'Module 2: CTD Summaries',
    module: 'M2',
    required: true,
    aiDraftable: false,
    status: 'not_started',
    role: 'medical_writer',
    estimatedHours: 64,
    children: [
      {
        code: 'm2.3',
        title: 'Quality Overall Summary',
        module: 'M2',
        required: true,
        aiDraftable: true,
        status: 'not_started',
        role: 'cmc_lead',
        estimatedHours: 16,
        children: [
          {
            code: 'm2.3.S',
            title: 'Drug Substance Summary',
            module: 'M2',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'cmc_lead',
            estimatedHours: 8,
          },
          {
            code: 'm2.3.P',
            title: 'Drug Product Summary',
            module: 'M2',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'cmc_lead',
            estimatedHours: 8,
          },
        ],
      },
      {
        code: 'm2.4',
        title: 'Nonclinical Overview',
        module: 'M2',
        required: true,
        aiDraftable: true,
        status: 'not_started',
        role: 'toxicologist',
        estimatedHours: 10,
      },
      {
        code: 'm2.6',
        title: 'Nonclinical Summaries',
        module: 'M2',
        required: true,
        aiDraftable: true,
        status: 'not_started',
        role: 'toxicologist',
        estimatedHours: 16,
        children: [
          {
            code: 'm2.6.2',
            title: 'Pharmacology Written Summary',
            module: 'M2',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'toxicologist',
            estimatedHours: 4,
          },
          {
            code: 'm2.6.4',
            title: 'Pharmacokinetics Written Summary',
            module: 'M2',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'clinical_pharmacology',
            estimatedHours: 4,
          },
          {
            code: 'm2.6.6',
            title: 'Toxicology Written Summary',
            module: 'M2',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'toxicologist',
            estimatedHours: 6,
          },
        ],
      },
    ],
  },
  {
    code: 'm3',
    title: 'Module 3: Quality (CMC)',
    module: 'M3',
    required: true,
    aiDraftable: false,
    status: 'not_started',
    role: 'cmc_lead',
    estimatedHours: 60,
    children: [
      {
        code: 'm3.2.S',
        title: 'Drug Substance',
        module: 'M3',
        required: true,
        aiDraftable: true,
        status: 'not_started',
        role: 'cmc_lead',
        estimatedHours: 30,
        children: [
          {
            code: 'm3.2.S.1',
            title: 'General Information',
            module: 'M3',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'cmc_lead',
            estimatedHours: 3,
          },
          {
            code: 'm3.2.S.2',
            title: 'Manufacture',
            module: 'M3',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'cmc_lead',
            estimatedHours: 8,
          },
          {
            code: 'm3.2.S.3',
            title: 'Characterization',
            module: 'M3',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'cmc_lead',
            estimatedHours: 4,
          },
          {
            code: 'm3.2.S.4',
            title: 'Control of Drug Substance',
            module: 'M3',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'cmc_lead',
            estimatedHours: 6,
          },
          {
            code: 'm3.2.S.7',
            title: 'Stability',
            module: 'M3',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'cmc_lead',
            estimatedHours: 6,
          },
        ],
      },
      {
        code: 'm3.2.P',
        title: 'Drug Product',
        module: 'M3',
        required: true,
        aiDraftable: true,
        status: 'not_started',
        role: 'cmc_lead',
        estimatedHours: 30,
        children: [
          {
            code: 'm3.2.P.1',
            title: 'Description and Composition',
            module: 'M3',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'cmc_lead',
            estimatedHours: 3,
          },
          {
            code: 'm3.2.P.2',
            title: 'Pharmaceutical Development',
            module: 'M3',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'cmc_lead',
            estimatedHours: 6,
          },
          {
            code: 'm3.2.P.3',
            title: 'Manufacture',
            module: 'M3',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'cmc_lead',
            estimatedHours: 6,
          },
          {
            code: 'm3.2.P.5',
            title: 'Control of Drug Product',
            module: 'M3',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'cmc_lead',
            estimatedHours: 5,
          },
          {
            code: 'm3.2.P.8',
            title: 'Stability',
            module: 'M3',
            required: true,
            aiDraftable: true,
            status: 'not_started',
            role: 'cmc_lead',
            estimatedHours: 6,
          },
        ],
      },
    ],
  },
  {
    code: 'm4',
    title: 'Module 4: Nonclinical',
    module: 'M4',
    required: true,
    aiDraftable: false,
    status: 'not_started',
    role: 'toxicologist',
    estimatedHours: 40,
    children: [
      {
        code: 'm4.2.1',
        title: 'Pharmacology',
        module: 'M4',
        required: true,
        aiDraftable: false,
        status: 'not_started',
        role: 'toxicologist',
        estimatedHours: 8,
      },
      {
        code: 'm4.2.2',
        title: 'Pharmacokinetics',
        module: 'M4',
        required: true,
        aiDraftable: false,
        status: 'not_started',
        role: 'clinical_pharmacology',
        estimatedHours: 10,
      },
      {
        code: 'm4.2.3',
        title: 'Toxicology',
        module: 'M4',
        required: true,
        aiDraftable: false,
        status: 'not_started',
        role: 'toxicologist',
        estimatedHours: 20,
        children: [
          {
            code: 'm4.2.3.1',
            title: 'Single-Dose Toxicity',
            module: 'M4',
            required: true,
            aiDraftable: false,
            status: 'not_started',
            role: 'toxicologist',
            estimatedHours: 2,
          },
          {
            code: 'm4.2.3.2',
            title: 'Repeat-Dose Toxicity',
            module: 'M4',
            required: true,
            aiDraftable: false,
            status: 'not_started',
            role: 'toxicologist',
            estimatedHours: 6,
          },
          {
            code: 'm4.2.3.3',
            title: 'Genotoxicity',
            module: 'M4',
            required: true,
            aiDraftable: false,
            status: 'not_started',
            role: 'toxicologist',
            estimatedHours: 3,
          },
        ],
      },
    ],
  },
  {
    code: 'm5',
    title: 'Module 5: Clinical',
    module: 'M5',
    required: true,
    aiDraftable: false,
    status: 'not_started',
    role: 'clinical_lead',
    estimatedHours: 48,
    children: [
      {
        code: 'm5.3.5',
        title: 'Efficacy & Safety (Phase 1 Protocol)',
        module: 'M5',
        required: true,
        aiDraftable: true,
        status: 'not_started',
        role: 'clinical_lead',
        estimatedHours: 20,
      },
      {
        code: 'm5.3.3',
        title: 'Human PK Studies',
        module: 'M5',
        required: false,
        aiDraftable: false,
        status: 'not_started',
        role: 'clinical_pharmacology',
        estimatedHours: 8,
      },
      {
        code: 'm5.4',
        title: 'Literature References',
        module: 'M5',
        required: false,
        aiDraftable: false,
        status: 'not_started',
        role: 'medical_writer',
        estimatedHours: 4,
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function flattenSections(sections: CTDSection[]): CTDSection[] {
  const result: CTDSection[] = [];
  for (const s of sections) {
    result.push(s);
    if (s.children) result.push(...flattenSections(s.children));
  }
  return result;
}

function countByStatus(sections: CTDSection[]): Record<SectionStatus, number> {
  const flat = flattenSections(sections).filter(s => !s.children || s.children.length === 0);
  const counts: Record<SectionStatus, number> = {
    not_started: 0,
    drafting: 0,
    review: 0,
    approved: 0,
    locked: 0,
  };
  for (const s of flat) counts[s.status]++;
  return counts;
}

function moduleProgress(mod: CTDSection): number {
  const leaves = flattenSections([mod]).filter(s => !s.children || s.children.length === 0);
  if (leaves.length === 0) return 0;
  const done = leaves.filter(s => s.status === 'approved' || s.status === 'locked').length;
  return Math.round((done / leaves.length) * 100);
}

const STATUS_CONFIG: Record<
  SectionStatus,
  { icon: typeof CheckCircle2; color: string; bg: string; label: string }
> = {
  not_started: { icon: Circle, color: 'text-zinc-400', bg: 'bg-zinc-100', label: 'Not Started' },
  drafting: { icon: Clock, color: 'text-violet-500', bg: 'bg-violet-50', label: 'Drafting' },
  review: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50', label: 'In Review' },
  approved: {
    icon: CheckCircle2,
    color: 'text-emerald-500',
    bg: 'bg-emerald-50',
    label: 'Approved',
  },
  locked: { icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-100', label: 'Locked' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS BAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const ModuleProgressBar: React.FC<{ module: CTDSection }> = ({ module: mod }) => {
  const pct = moduleProgress(mod);
  const leaves = flattenSections([mod]).filter(s => !s.children || s.children.length === 0);
  const done = leaves.filter(s => s.status === 'approved' || s.status === 'locked').length;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-zinc-500 w-16 text-right">
        {done}/{leaves.length}
      </span>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION TREE ROW
// ═══════════════════════════════════════════════════════════════════════════════

const SectionRow: React.FC<{
  section: CTDSection;
  depth: number;
  expandedSet: Set<string>;
  onToggle: (code: string) => void;
  onOpen: (code: string) => void;
  onDraftAI: (code: string, title: string) => void;
  selectedCode: string | null;
}> = ({ section, depth, expandedSet, onToggle, onOpen, onDraftAI, selectedCode }) => {
  const hasChildren = section.children && section.children.length > 0;
  const isExpanded = expandedSet.has(section.code);
  const isSelected = selectedCode === section.code;
  const isLeaf = !hasChildren;
  const statusCfg = STATUS_CONFIG[section.status];
  const StatusIcon = statusCfg.icon;

  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors duration-150',
          'hover:bg-zinc-50',
          isSelected && 'bg-violet-50 border-l-2 border-violet-500',
          !isSelected && 'border-l-2 border-transparent'
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => (hasChildren ? onToggle(section.code) : onOpen(section.code))}
      >
        {/* Expand/collapse */}
        {hasChildren ? (
          <button
            onClick={e => {
              e.stopPropagation();
              onToggle(section.code);
            }}
            className="w-4 h-4 flex items-center justify-center text-zinc-400 hover:text-zinc-600"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Status indicator */}
        <StatusIcon className={cn('w-3.5 h-3.5 flex-shrink-0', statusCfg.color)} />

        {/* Section code */}
        <span className="text-xs font-mono text-zinc-400 w-16 flex-shrink-0">{section.code}</span>

        {/* Title */}
        <span
          className={cn('flex-1 truncate', isLeaf ? 'text-zinc-700' : 'font-medium text-zinc-900')}
        >
          {section.title}
        </span>

        {/* Required badge */}
        {section.required && isLeaf && (
          <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded font-medium flex-shrink-0">
            REQ
          </span>
        )}

        {/* AI draft button */}
        {section.aiDraftable && isLeaf && (
          <button
            onClick={e => {
              e.stopPropagation();
              onDraftAI(section.code, section.title);
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs px-1.5 py-0.5 bg-violet-50 text-violet-600 rounded hover:bg-violet-100 flex-shrink-0"
          >
            <Sparkles className="w-3 h-3" />
            Draft
          </button>
        )}

        {/* Hours estimate */}
        {isLeaf && section.estimatedHours > 0 && (
          <span className="text-xs text-zinc-400 tabular-nums flex-shrink-0">
            {section.estimatedHours}h
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren &&
        isExpanded &&
        section.children!.map(child => (
          <SectionRow
            key={child.code}
            section={child}
            depth={depth + 1}
            expandedSet={expandedSet}
            onToggle={onToggle}
            onOpen={onOpen}
            onDraftAI={onDraftAI}
            selectedCode={selectedCode}
          />
        ))}
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// API DATA ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adapt API response sections to local CTDSection format.
 * The API returns enriched sections with liveStatus/documents — map those into
 * the status field the UI components already expect.
 */
function adaptApiSections(modules: any[]): CTDSection[] {
  return modules.map((m: any) => {
    const section: CTDSection = {
      code: m.code,
      title: m.title,
      module: m.module,
      required: m.required ?? false,
      aiDraftable: m.aiDraftable ?? false,
      status: m.liveStatus || m.status || 'not_started',
      role: m.role || '',
      estimatedHours: m.estimatedHours ?? 0,
    };
    if (m.children && m.children.length > 0) {
      section.children = adaptApiSections(m.children);
    }
    return section;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const INDWorkspace: React.FC<INDWorkspaceProps> = ({
  projectId,
  projectName = 'IND Application',
  onOpenSection,
  onDraftWithAI,
  onNavigateToCoAuthor,
}) => {
  // Fetch live sections from API (falls back to static IND_MODULES)
  const numericProjectId = projectId ? parseInt(String(projectId).replace(/^proj_/, ''), 10) : 0;
  const { data: apiData } = useQuery({
    queryKey: ['ind-sections', numericProjectId],
    queryFn: async () => {
      const url = numericProjectId
        ? `/api/ind-sections?project_id=${numericProjectId}`
        : '/api/ind-sections';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load IND sections');
      return res.json();
    },
    staleTime: 30_000, // 30s — sections don't change rapidly
    retry: 1,
  });

  // Merge API data with static fallback
  const modules: CTDSection[] = useMemo(() => {
    if (apiData?.modules) return adaptApiSections(apiData.modules);
    return IND_MODULES;
  }, [apiData]);

  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set(['m1', 'm2', 'm3']));
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [filter, setFilter] = useState<ViewFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompileDialog, setShowCompileDialog] = useState(false);
  const [compilationResult, setCompilationResult] = useState<CompilationResult | null>(null);

  // Module access & eCTD compile hooks
  const { isEctdEnabled, isIndEnabled } = useModules();
  const canCompileEctd = isEctdEnabled && isIndEnabled && numericProjectId > 0;
  const compileMutation = useEctdCompile(numericProjectId);
  const { data: ectdStatus } = useEctdStatus(numericProjectId);

  // Mutation: Section status transitions
  const queryClient = useQueryClient();
  const statusMutation = useMutation({
    mutationFn: async ({
      code,
      newStatus,
      reason,
    }: {
      code: string;
      newStatus: string;
      reason?: string;
    }) => {
      const res = await fetch(`/api/project-sections/${encodeURIComponent(code)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: numericProjectId,
          new_status: newStatus,
          reason,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Failed to update status');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ind-sections', numericProjectId] });
      queryClient.invalidateQueries({ queryKey: ['project-sections', numericProjectId] });
    },
  });

  // Available status transitions per current status
  const getNextActions = useCallback(
    (status: SectionStatus): { label: string; status: string; icon: typeof Play }[] => {
      const map: Record<string, { label: string; status: string; icon: typeof Play }[]> = {
        not_started: [
          { label: 'Start Drafting', status: 'drafting', icon: Play },
          { label: 'Gather Data', status: 'data_gathering', icon: Search },
        ],
        drafting: [{ label: 'Submit for Review', status: 'internal_review', icon: ArrowRight }],
        review: [
          { label: 'Approve', status: 'approved', icon: CheckCircle2 },
          { label: 'Request Revision', status: 'revision', icon: ArrowRight },
        ],
        approved: [{ label: 'Lock for Submission', status: 'locked', icon: Lock }],
        locked: [],
      };
      return map[status] || [];
    },
    []
  );

  // Counts
  const allSections = useMemo(() => flattenSections(modules), [modules]);
  const leafSections = useMemo(
    () => allSections.filter(s => !s.children || s.children.length === 0),
    [allSections]
  );
  const counts = useMemo(() => countByStatus(modules), [modules]);
  const totalLeaves = leafSections.length;
  const requiredLeaves = leafSections.filter(s => s.required).length;
  const aiDraftableLeaves = leafSections.filter(s => s.aiDraftable).length;
  const totalHours = leafSections.reduce((sum, s) => sum + s.estimatedHours, 0);
  const overallProgress =
    totalLeaves > 0 ? Math.round(((counts.approved + counts.locked) / totalLeaves) * 100) : 0;

  // Filter sections
  const filteredModules = useMemo(() => {
    if (filter === 'all' && !searchQuery) return modules;

    const filterFn = (s: CTDSection): boolean => {
      const matchesSearch =
        !searchQuery ||
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.code.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFilter =
        filter === 'all' ||
        (filter === 'required' && s.required) ||
        (filter === 'in_progress' && (s.status === 'drafting' || s.status === 'review')) ||
        (filter === 'ai_draftable' && s.aiDraftable);

      return matchesSearch && matchesFilter;
    };

    const filterTree = (sections: CTDSection[]): CTDSection[] => {
      return sections
        .map(s => {
          if (s.children) {
            const filteredChildren = filterTree(s.children);
            if (filteredChildren.length > 0 || filterFn(s)) {
              return { ...s, children: filteredChildren };
            }
            return null;
          }
          return filterFn(s) ? s : null;
        })
        .filter(Boolean) as CTDSection[];
    };

    return filterTree(modules);
  }, [filter, searchQuery, modules]);

  const handleToggle = useCallback((code: string) => {
    setExpandedSet(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }, []);

  const handleOpen = useCallback(
    (code: string) => {
      setSelectedSection(code);
      onOpenSection?.(code);
    },
    [onOpenSection]
  );

  const handleDraftAI = useCallback(
    (code: string, title: string) => {
      setSelectedSection(code);
      onDraftWithAI?.(code, title);
    },
    [onDraftWithAI]
  );

  return (
    <>
      <div className="flex-1 flex flex-col bg-white min-h-0 border-t-2 border-violet-500/20">
        {/* Header — ultra minimal */}
        <div className="border-b border-zinc-200 px-5 py-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-semibold text-zinc-900">{projectName}</h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                IND Application • eCTD 4.0 • {requiredLeaves} required sections • ~{totalHours}h
                estimated
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Overall progress */}
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
                <span className="text-sm font-medium tabular-nums text-zinc-700">
                  {overallProgress}%
                </span>
              </div>
              {/* eCTD Compile Button */}
              <button
                onClick={() => canCompileEctd && setShowCompileDialog(true)}
                disabled={compileMutation.isPending || !canCompileEctd}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150',
                  ectdStatus?.submissionReady
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700',
                  (compileMutation.isPending || !canCompileEctd) && 'opacity-60 cursor-not-allowed'
                )}
              >
                {compileMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Package className="w-3.5 h-3.5" />
                )}
                {compileMutation.isPending ? 'Compiling…' : 'Compile eCTD'}
                {ectdStatus && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 rounded">
                    {ectdStatus.overallReadiness}%
                  </span>
                )}
              </button>
              {!canCompileEctd && (
                <span className="text-xs text-zinc-500">IND + eCTD module access required</span>
              )}
              {onNavigateToCoAuthor && (
                <button
                  onClick={onNavigateToCoAuthor}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors duration-150"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Co-Author
                </button>
              )}
            </div>
          </div>

          {/* Module progress bars */}
          <div className="grid grid-cols-5 gap-3 mt-2.5">
            {modules.map(mod => (
              <div key={mod.code}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-zinc-600 truncate">
                    {mod.code.toUpperCase()}
                  </span>
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {moduleProgress(mod)}%
                  </span>
                </div>
                <ModuleProgressBar module={mod} />
              </div>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div className="border-b border-zinc-200 px-5 py-1.5 flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search sections..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-200 rounded-md focus-visible:ring-2 outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-zinc-400 mr-1" />
            {[
              { id: 'all' as ViewFilter, label: 'All', count: totalLeaves },
              { id: 'required' as ViewFilter, label: 'Required', count: requiredLeaves },
              {
                id: 'in_progress' as ViewFilter,
                label: 'In Progress',
                count: counts.drafting + counts.review,
              },
              { id: 'ai_draftable' as ViewFilter, label: 'RI Draftable', count: aiDraftableLeaves },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'px-2 py-1 text-xs rounded-md transition-colors duration-150',
                  filter === f.id ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'
                )}
              >
                {f.label} <span className="tabular-nums">({f.count})</span>
              </button>
            ))}
          </div>

          {/* Summary chips */}
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="w-3 h-3" /> {counts.approved + counts.locked}
            </span>
            <span className="flex items-center gap-1 text-blue-500">
              <Clock className="w-3 h-3" /> {counts.drafting}
            </span>
            <span className="flex items-center gap-1 text-amber-500">
              <AlertTriangle className="w-3 h-3" /> {counts.review}
            </span>
            <span className="flex items-center gap-1 text-zinc-400">
              <Circle className="w-3 h-3" /> {counts.not_started}
            </span>
          </div>
        </div>

        {/* Section tree */}
        <div className="flex-1 overflow-y-auto">
          {filteredModules.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-zinc-400">
              No sections match your filter
            </div>
          ) : (
            <div className="py-1">
              {filteredModules.map(mod => (
                <div key={mod.code}>
                  {/* Module header */}
                  <div
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-50 border-b border-zinc-200 cursor-pointer hover:bg-zinc-100 transition-colors duration-150"
                    onClick={() => handleToggle(mod.code)}
                  >
                    {expandedSet.has(mod.code) ? (
                      <ChevronDown className="w-4 h-4 text-zinc-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                    )}
                    <BarChart3 className="w-4 h-4 text-zinc-500" />
                    <span className="font-medium text-sm text-zinc-900">{mod.title}</span>
                    <span className="ml-auto text-xs text-zinc-400 tabular-nums">
                      {moduleProgress(mod)}%
                    </span>
                  </div>

                  {/* Module children */}
                  {expandedSet.has(mod.code) &&
                    mod.children?.map(child => (
                      <SectionRow
                        key={child.code}
                        section={child}
                        depth={1}
                        expandedSet={expandedSet}
                        onToggle={handleToggle}
                        onOpen={handleOpen}
                        onDraftAI={handleDraftAI}
                        selectedCode={selectedSection}
                      />
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel — appears when section is selected */}
        {selectedSection &&
          (() => {
            const section = allSections.find(s => s.code === selectedSection);
            if (!section) return null;
            const cfg = STATUS_CONFIG[section.status];

            return (
              <div className="border-t border-zinc-200 bg-zinc-50 px-6 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-zinc-500">{section.code}</span>
                    <span className="font-medium text-sm text-zinc-900">{section.title}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full', cfg.bg, cfg.color)}>
                      {cfg.label}
                    </span>
                    {section.required && (
                      <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded">
                        Required
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Status transition actions */}
                    {getNextActions(section.status).map(action => {
                      const ActionIcon = action.icon;
                      return (
                        <button
                          key={action.status}
                          onClick={() =>
                            statusMutation.mutate({
                              code: section.code,
                              newStatus: action.status,
                            })
                          }
                          disabled={statusMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-60"
                        >
                          <ActionIcon className="w-3.5 h-3.5" />
                          {action.label}
                        </button>
                      );
                    })}

                    {section.aiDraftable && (
                      <button
                        onClick={() => onDraftWithAI?.(section.code, section.title)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors duration-150"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Draft with RI
                      </button>
                    )}
                    <button
                      onClick={() => onOpenSection?.(section.code)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:bg-white transition-colors duration-150"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Open in Editor
                    </button>
                    <button
                      onClick={() => setSelectedSection(null)}
                      className="text-zinc-400 hover:text-zinc-600 text-xs"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    Role: {section.role} • Est. {section.estimatedHours}h • Module {section.module}
                  </span>
                  {statusMutation.isError && (
                    <span className="text-xs text-red-500">
                      {statusMutation.error?.message || 'Status update failed'}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}
      </div>

      {/* eCTD Compile Dialog */}
      {showCompileDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
            {/* Dialog Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-semibold text-zinc-900">Compile eCTD Package</h2>
              </div>
              <button
                onClick={() => {
                  setShowCompileDialog(false);
                  setCompilationResult(null);
                }}
                className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Readiness Dashboard */}
            {!compilationResult && (
              <div className="px-6 py-4 space-y-4">
                {/* Overall readiness */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-zinc-700">
                        Submission Readiness
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-zinc-900">
                        {ectdStatus?.overallReadiness ?? overallProgress}%
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          (ectdStatus?.overallReadiness ?? 0) === 100
                            ? 'bg-emerald-500'
                            : (ectdStatus?.overallReadiness ?? 0) >= 50
                              ? 'bg-amber-500'
                              : 'bg-red-400'
                        )}
                        style={{ width: `${ectdStatus?.overallReadiness ?? overallProgress}%` }}
                      />
                    </div>
                  </div>
                  {(ectdStatus?.overallReadiness ?? 0) === 100 ? (
                    <ShieldCheck className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0" />
                  )}
                </div>

                {/* Module breakdown */}
                {ectdStatus?.modules && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Module Status
                    </h3>
                    {ectdStatus.modules.map(m => (
                      <div key={m.moduleCode} className="flex items-center gap-3">
                        <span className="text-xs font-medium text-zinc-600 w-24 truncate">
                          {m.moduleCode.toUpperCase()}
                        </span>
                        <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              m.ready
                                ? 'bg-emerald-500'
                                : m.completionPct > 0
                                  ? 'bg-amber-400'
                                  : 'bg-zinc-200'
                            )}
                            style={{ width: `${m.completionPct}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-zinc-500 w-16 text-right">
                          {m.completedRequired}/{m.requiredSections}
                        </span>
                        {m.ready ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-zinc-400" />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Compile button */}
                <div className="pt-2 flex items-center gap-3">
                  <button
                    onClick={async () => {
                      try {
                        const result = await compileMutation.mutateAsync({
                          submissionType: 'initial',
                          region: 'FDA',
                        });
                        setCompilationResult(result);
                      } catch {
                        // Error handled by mutation state
                      }
                    }}
                    disabled={compileMutation.isPending || !canCompileEctd}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
                  >
                    {compileMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Compiling eCTD 4.0 Package…
                      </>
                    ) : (
                      <>
                        <Package className="w-4 h-4" />
                        Compile eCTD 4.0 Package
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowCompileDialog(false)}
                    className="px-4 py-2.5 text-sm font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors duration-150"
                  >
                    Cancel
                  </button>
                </div>

                {compileMutation.isError && (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                    <p className="text-xs text-red-700">
                      {compileMutation.error?.message || 'Compilation failed'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Compilation Results */}
            {compilationResult && (
              <div className="px-6 py-4 space-y-4">
                {/* Status banner */}
                <div
                  className={cn(
                    'p-3 rounded-lg border flex items-start gap-3',
                    compilationResult.submissionReady
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-amber-50 border-amber-200'
                  )}
                >
                  {compilationResult.submissionReady ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {compilationResult.submissionReady
                        ? 'eCTD Package Compiled Successfully'
                        : 'Compilation Complete — Issues Found'}
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {compilationResult.modules.filter(m => m.status === 'complete').length}/5
                      modules complete • {compilationResult.errors.length} errors •{' '}
                      {compilationResult.warnings.length} warnings
                    </p>
                  </div>
                </div>

                {/* Validation results */}
                {compilationResult.validationResults &&
                  compilationResult.validationResults.length > 0 && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        Validation Results
                      </h3>
                      {compilationResult.validationResults.map((v, i) => (
                        <div
                          key={i}
                          className={cn(
                            'flex items-start gap-2 px-3 py-2 rounded-lg text-xs',
                            v.severity === 'error' && 'bg-red-50 text-red-700',
                            v.severity === 'warning' && 'bg-amber-50 text-amber-700',
                            v.severity === 'info' && 'bg-zinc-50 text-zinc-600'
                          )}
                        >
                          {v.severity === 'error' ? (
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          ) : v.severity === 'warning' ? (
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          ) : (
                            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span className="font-medium">
                              {v.sectionCode && `[${v.sectionCode}] `}
                            </span>
                            {v.message}
                            {v.fix && (
                              <span className="block text-xs mt-0.5 opacity-75">
                                Fix: {v.fix}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                {/* Actions */}
                <div className="pt-2 flex items-center gap-3">
                  {compilationResult.submissionReady && compilationResult.xmlBackbone && (
                    <button
                      onClick={() => {
                        const blob = new Blob([compilationResult.xmlBackbone!], {
                          type: 'application/xml',
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `ectd-backbone-${numericProjectId}.xml`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors duration-150"
                    >
                      <Download className="w-4 h-4" />
                      Download XML Backbone
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setCompilationResult(null);
                      setShowCompileDialog(false);
                    }}
                    className="px-4 py-2.5 text-sm font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors duration-150"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default INDWorkspace;
