/**
 * AppsPage — Global app launcher.
 *
 * Design: tabbed groups, one visible at a time. Calm, curated, not a catalog.
 * Track-aware: relevant apps shown first within each group.
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { WorkspaceCanvas, PageTitleHeader } from '@/components/ui/workspace-primitives';
import {
  Search as SearchIcon,
  Scale,
  FileText,
  Stethoscope,
  Beaker,
  Heart,
  Microscope,
  Layers,
  ArrowRight,
  Brain,
  Activity,
  BookOpen,
  Shield,
  ShieldCheck,
  ClipboardList,
  ClipboardCheck,
  FolderOpen,
  TrendingUp,
  Cog,
  Wrench,
  Map as MapIcon,
  BarChart2,
  Compass,
  FileStack,
  GitBranch,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppCard {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  tracks: string[];
}

type GroupKey = 'strategy' | 'authoring' | 'intelligence' | 'lifecycle';

// ─── Track definitions ────────────────────────────────────────────────────────

const PHARMA_TYPES = ['IND', 'NDA', 'BLA', 'MAA'];
const DEVICE_TYPES = ['510K', 'PMA', 'DE_NOVO', 'EUA', 'IVDR'];

// ─── App definitions (no color per-app — group color only) ────────────────────

// ── Strategy & Research ──
const STRATEGY_APPS: AppCard[] = [
  { id: 'deep-research', label: 'Deep Research', description: 'Search ClinicalTrials.gov, PubMed, FDA, EMA and more', icon: <SearchIcon className="w-5 h-5" />, tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
  { id: 'precedent-intelligence', label: 'Precedent Intelligence', description: 'Regulatory precedent analysis and comparison', icon: <Scale className="w-5 h-5" />, tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
  { id: 'device-strategy', label: 'Device Strategy', description: 'Device pathway, Q-submissions, and predicate finding', icon: <Compass className="w-5 h-5" />, tracks: [...DEVICE_TYPES] },
];

// ── Submission Authoring ──
const AUTHORING_APPS: AppCard[] = [
  { id: 'device-diagnostics-workbench', label: 'Device & Diagnostics Workbench', description: 'Unified 510(k), PMA, CER, and eSTAR submission journey', icon: <Layers className="w-5 h-5" />, tracks: [...DEVICE_TYPES] },
  { id: '510k-workspace', label: '510(k) Workspace', description: 'Predicate comparison, SE testing, submission package', icon: <FileText className="w-5 h-5" />, tracks: ['510K', 'DE_NOVO'] },
  { id: 'pma-workspace', label: 'PMA Workspace', description: 'Premarket approval application workspace', icon: <Heart className="w-5 h-5" />, tracks: ['PMA'] },
  { id: 'cer-generator', label: 'CER Generator', description: 'Clinical evaluation report for EU MDR/IVDR', icon: <Microscope className="w-5 h-5" />, tracks: ['IVDR', ...DEVICE_TYPES] },
  { id: 'ind-authoring', label: 'IND Authoring', description: 'Investigational New Drug application authoring', icon: <Beaker className="w-5 h-5" />, tracks: ['IND'] },
  { id: 'cmc', label: 'CMC', description: 'Chemistry, Manufacturing, and Controls module 3 authoring', icon: <Cog className="w-5 h-5" />, tracks: [...PHARMA_TYPES] },
  { id: 'safety-narrative', label: 'Safety Narrative', description: 'Safety narrative builder for submissions', icon: <Stethoscope className="w-5 h-5" />, tracks: [...PHARMA_TYPES, 'PMA'] },
  { id: 'report-engine', label: 'Report Engine', description: 'Generate intelligent regulatory reports and exports', icon: <FileStack className="w-5 h-5" />, tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
];

// ── Intelligence & Analysis ──
const INTELLIGENCE_APPS: AppCard[] = [
  { id: 'regulatory-intelligence', label: 'Regulatory Intelligence', description: 'Full-spectrum analysis — risk signals, reviewer patterns, outcome prediction, expert synthesis, CSR review, and predicate comparison', icon: <Brain className="w-5 h-5" />, tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
  { id: 'biostatistics', label: 'Biostatistics', description: 'Statistical analysis, power calculations, endpoints', icon: <BarChart2 className="w-5 h-5" />, tracks: [...PHARMA_TYPES, 'PMA'] },
  { id: 'protocol-designer', label: 'Protocol Designer', description: 'Clinical trial protocol authoring and endpoint design', icon: <BookOpen className="w-5 h-5" />, tracks: [...PHARMA_TYPES, 'PMA'] },
];

// ── Quality & Lifecycle ──
const LIFECYCLE_APPS: AppCard[] = [
  { id: 'device-engineering', label: 'Device Engineering', description: 'Risk management, SaMD cybersecurity, human factors, biocompatibility', icon: <Wrench className="w-5 h-5" />, tracks: [...DEVICE_TYPES] },
  { id: 'dossier-navigator', label: 'Dossier Navigator', description: 'Navigate the full submission dossier and gap-map', icon: <MapIcon className="w-5 h-5" />, tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
  { id: 'ectd-navigator', label: 'eCTD Navigator', description: 'eCTD structure, leaf assignment, and sequencing', icon: <GitBranch className="w-5 h-5" />, tracks: [...PHARMA_TYPES] },
  { id: 'document-vault', label: 'Document Vault', description: 'Governed document storage and retrieval', icon: <FolderOpen className="w-5 h-5" />, tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
  { id: 'sop-management', label: 'SOP Management', description: 'Standard Operating Procedure authoring and governance', icon: <ClipboardList className="w-5 h-5" />, tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
  { id: 'capa-management', label: 'CAPA Management', description: 'Corrective & Preventive Action workflow', icon: <ShieldCheck className="w-5 h-5" />, tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
  { id: 'post-market', label: 'Post-Market Surveillance', description: 'Pharmacovigilance and safety signal tracking', icon: <TrendingUp className="w-5 h-5" />, tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
  { id: 'inspection-readiness', label: 'Inspection Readiness', description: 'FDA/EMA inspection preparedness assessment', icon: <ClipboardCheck className="w-5 h-5" />, tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
  { id: 'compliance-monitor', label: 'Compliance Monitor', description: 'Continuous compliance checks across projects and SOPs', icon: <Shield className="w-5 h-5" />, tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
  { id: 'evidence-engine', label: 'Evidence Engine', description: 'Aggregate evidence base and defensibility scoring', icon: <Activity className="w-5 h-5" />, tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
];

const GROUPS: { key: GroupKey; label: string; apps: AppCard[] }[] = [
  { key: 'strategy', label: 'Strategy & Research', apps: STRATEGY_APPS },
  { key: 'authoring', label: 'Submission Authoring', apps: AUTHORING_APPS },
  { key: 'intelligence', label: 'Intelligence & Analysis', apps: INTELLIGENCE_APPS },
  { key: 'lifecycle', label: 'Quality & Lifecycle', apps: LIFECYCLE_APPS },
];

// ─── Components ───────────────────────────────────────────────────────────────

interface AppsPageProps {
  onNavigate: (id: string) => void;
  activeProjectId?: string;
  activeProjectName?: string;
  submissionType?: string;
}

function sortByRelevance(apps: AppCard[], submissionType?: string): AppCard[] {
  if (!submissionType) return apps;
  return [...apps].sort((a, b) => {
    const aMatch = a.tracks.includes(submissionType) ? 1 : 0;
    const bMatch = b.tracks.includes(submissionType) ? 1 : 0;
    if (bMatch !== aMatch) return bMatch - aMatch;
    return apps.indexOf(a) - apps.indexOf(b);
  });
}

export const AppsPage: React.FC<AppsPageProps> = ({
  onNavigate,
  activeProjectId,
  activeProjectName,
  submissionType,
}) => {
  const noProject = !activeProjectId;
  const [activeGroup, setActiveGroup] = useState<GroupKey>('strategy');

  const currentApps = useMemo(() => {
    const group = GROUPS.find(g => g.key === activeGroup);
    return sortByRelevance(group?.apps ?? [], submissionType);
  }, [activeGroup, submissionType]);

  return (
    <WorkspaceCanvas maxWidth="3xl" testId="apps-page">
      <PageTitleHeader
        title="AI Assistants"
        subtitle={activeProjectId ? `for ${activeProjectName || 'current project'}` : undefined}
      />

      {noProject && (
        <p className="mt-3 text-sm text-stone-400">
          Select a project to launch apps.
        </p>
      )}

      {/* ── Group tabs ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mt-6 mb-6 border-b border-stone-100 pb-2">
        {GROUPS.map(group => (
          <button
            key={group.key}
            onClick={() => setActiveGroup(group.key)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md transition-colors',
              activeGroup === group.key
                ? 'bg-stone-200 text-stone-900 font-medium'
                : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
            )}
          >
            {group.label}
            <span className="ml-1.5 text-[10px] opacity-50">{group.apps.length}</span>
          </button>
        ))}
      </div>

      {/* ── App list ───────────────────────────────────────────────── */}
      <div className="space-y-1">
        {currentApps.map(app => (
          <button
            key={app.id}
            onClick={noProject ? undefined : () => onNavigate(app.id)}
            disabled={noProject}
            aria-disabled={noProject || undefined}
            title={noProject ? 'Select a project first' : undefined}
            aria-label={`Launch ${app.label}`}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors',
              noProject
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none'
            )}
          >
            <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
              <span className="text-stone-500">{app.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-stone-800 block">{app.label}</span>
              <span className="text-xs text-stone-400 block mt-0.5">{app.description}</span>
            </div>
            {!noProject && (
              <ArrowRight className="w-4 h-4 text-stone-300 flex-shrink-0" />
            )}
          </button>
        ))}
      </div>
    </WorkspaceCanvas>
  );
};

export default AppsPage;
