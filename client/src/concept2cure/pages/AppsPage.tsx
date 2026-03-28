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
  ArrowRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppCard {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  tracks: string[];
}

type GroupKey = 'strategy' | 'builders' | 'studios';

// ─── Track definitions ────────────────────────────────────────────────────────

const PHARMA_TYPES = ['IND', 'NDA', 'BLA', 'MAA'];
const DEVICE_TYPES = ['510K', 'PMA', 'DE_NOVO', 'EUA', 'IVDR'];

// ─── App definitions (no color per-app — group color only) ────────────────────

const STRATEGY_APPS: AppCard[] = [
  { id: 'deep-research', label: 'Deep Research', description: 'Search ClinicalTrials.gov, PubMed, FDA, EMA and more', icon: <SearchIcon className="w-5 h-5" />, tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
  { id: 'precedent-intelligence', label: 'Precedent Intelligence', description: 'Regulatory precedent analysis and comparison', icon: <Scale className="w-5 h-5" />, tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
];

const BUILDER_APPS: AppCard[] = [
  { id: '510k-workspace', label: '510(k) Workspace', description: 'Predicate comparison, SE testing, submission package', icon: <FileText className="w-5 h-5" />, tracks: ['510K', 'DE_NOVO'] },
  { id: 'pma-workspace', label: 'PMA Workspace', description: 'Premarket approval application workspace', icon: <Heart className="w-5 h-5" />, tracks: ['PMA'] },
  { id: 'cer-generator', label: 'CER Generator', description: 'Clinical evaluation report for EU MDR/IVDR', icon: <Microscope className="w-5 h-5" />, tracks: ['IVDR', ...DEVICE_TYPES] },
  { id: 'safety-narrative', label: 'Safety Narrative', description: 'Safety narrative builder for submissions', icon: <Stethoscope className="w-5 h-5" />, tracks: [...PHARMA_TYPES, 'PMA'] },
];

const STUDIO_APPS: AppCard[] = [
  { id: 'biostatistics', label: 'Biostatistics', description: 'Statistical analysis, power calculations, endpoints', icon: <Beaker className="w-5 h-5" />, tracks: [...PHARMA_TYPES, 'PMA'] },
];

const GROUPS: { key: GroupKey; label: string; apps: AppCard[] }[] = [
  { key: 'strategy', label: 'Strategy & Evidence', apps: STRATEGY_APPS },
  { key: 'builders', label: 'Builders', apps: BUILDER_APPS },
  { key: 'studios', label: 'Specialist Studios', apps: STUDIO_APPS },
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
        title="Apps"
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
