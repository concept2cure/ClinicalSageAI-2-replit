/**
 * AppsPage — Global app launcher destination.
 *
 * Three groups: Strategy & Evidence, Builders, Specialist Studios.
 * Track-aware: apps are sorted by relevance to the active project's
 * submission type and industry mode. A "Recommended" section surfaces
 * the most relevant apps for the current context.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { WorkspaceCanvas, PageTitleHeader } from '@/components/ui/workspace-primitives';
import {
  Search as SearchIcon,
  Scale,
  FileText,
  FlaskConical,
  ShieldCheck,
  BookOpen,
  Layers,
  Stethoscope,
  ClipboardList,
  Beaker,
  Heart,
  Microscope,
  ArrowRight,
  Star,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppCard {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  /** Submission types this app is most relevant for */
  tracks: string[];
}

// ─── Track definitions ────────────────────────────────────────────────────────

// Match canonical submission types from ZenSidebar SUBMISSION_BADGE
const PHARMA_TYPES = ['IND', 'NDA', 'BLA', 'MAA'];
const DEVICE_TYPES = ['510K', 'PMA', 'DE_NOVO', 'EUA', 'IVDR'];

function isDeviceTrack(submissionType?: string): boolean {
  return DEVICE_TYPES.includes(submissionType || '');
}

function isPharmaTrack(submissionType?: string): boolean {
  return PHARMA_TYPES.includes(submissionType || '');
}

// ─── App definitions ──────────────────────────────────────────────────────────

// Color by group: blue (Strategy), violet (Builders), teal (Studios)
const STRATEGY_APPS: AppCard[] = [
  { id: 'deep-research', label: 'Deep Research', description: 'Search ClinicalTrials.gov, PubMed, FDA, EMA and more', icon: <SearchIcon className="w-5 h-5" />, color: 'text-blue-500 bg-blue-50', tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
  { id: 'precedent-intelligence', label: 'Precedent Intelligence', description: 'Regulatory precedent analysis and comparison', icon: <Scale className="w-5 h-5" />, color: 'text-blue-500 bg-blue-50', tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
  { id: 'evidence-memo', label: 'Evidence Memo', description: 'Generate evidence summary from CSR and precedent search', icon: <FileText className="w-5 h-5" />, color: 'text-blue-500 bg-blue-50', tracks: [...PHARMA_TYPES, '510K', 'PMA'] },
  { id: 'protocol-rationale', label: 'Protocol Rationale', description: 'Justify clinical protocol design choices', icon: <FlaskConical className="w-5 h-5" />, color: 'text-blue-500 bg-blue-50', tracks: PHARMA_TYPES },
  { id: 'risk-benefit', label: 'Risk-Benefit Analysis', description: 'Structured risk-benefit assessment for submissions', icon: <ShieldCheck className="w-5 h-5" />, color: 'text-blue-500 bg-blue-50', tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
];

const BUILDER_APPS: AppCard[] = [
  { id: 'clinical-overview', label: 'Clinical Overview', description: 'Module 2.5 clinical overview document', icon: <BookOpen className="w-5 h-5" />, color: 'text-violet-500 bg-violet-50', tracks: PHARMA_TYPES },
  { id: 'module3-builder', label: 'Module 3 Builder', description: 'Quality/CMC documents for Module 3', icon: <Layers className="w-5 h-5" />, color: 'text-violet-500 bg-violet-50', tracks: PHARMA_TYPES },
  { id: 'safety-narrative', label: 'Safety Narrative', description: 'Safety narrative builder for submissions', icon: <Stethoscope className="w-5 h-5" />, color: 'text-violet-500 bg-violet-50', tracks: [...PHARMA_TYPES, 'PMA'] },
  { id: '510k-workspace', label: '510(k) Workspace', description: 'Predicate comparison, SE testing, submission package', icon: <FileText className="w-5 h-5" />, color: 'text-violet-500 bg-violet-50', tracks: ['510K', 'DE_NOVO'] },
  { id: 'pma-workspace', label: 'PMA Workspace', description: 'Premarket approval application workspace', icon: <Heart className="w-5 h-5" />, color: 'text-violet-500 bg-violet-50', tracks: ['PMA'] },
  { id: 'cer-generator', label: 'CER Generator', description: 'Clinical evaluation report for EU MDR/IVDR', icon: <Microscope className="w-5 h-5" />, color: 'text-violet-500 bg-violet-50', tracks: ['IVDR', 'MAA'] },
  { id: 'audit-report', label: 'Audit Report', description: 'Inspection-ready audit report generation', icon: <ClipboardList className="w-5 h-5" />, color: 'text-violet-500 bg-violet-50', tracks: [...PHARMA_TYPES, ...DEVICE_TYPES] },
];

const STUDIO_APPS: AppCard[] = [
  { id: 'cmc', label: 'CMC', description: 'Chemistry, Manufacturing, and Controls workspace', icon: <FlaskConical className="w-5 h-5" />, color: 'text-teal-500 bg-teal-50', tracks: PHARMA_TYPES },
  { id: 'biostatistics', label: 'Biostatistics', description: 'Statistical analysis, power calculations, endpoints', icon: <Beaker className="w-5 h-5" />, color: 'text-teal-500 bg-teal-50', tracks: [...PHARMA_TYPES, 'PMA'] },
  { id: 'clinical', label: 'Clinical', description: 'Clinical operations and study management', icon: <Stethoscope className="w-5 h-5" />, color: 'text-teal-500 bg-teal-50', tracks: PHARMA_TYPES },
  { id: 'device', label: 'Device', description: 'Medical device and diagnostics workflows', icon: <Heart className="w-5 h-5" />, color: 'text-teal-500 bg-teal-50', tracks: DEVICE_TYPES },
];

const ALL_APPS = [...STRATEGY_APPS, ...BUILDER_APPS, ...STUDIO_APPS];

// ─── Components ───────────────────────────────────────────────────────────────

interface AppsPageProps {
  onNavigate: (id: string) => void;
  activeProjectId?: string;
  activeProjectName?: string;
  submissionType?: string;
}

const AppCardComponent: React.FC<{
  app: AppCard;
  onClick: () => void;
  disabled?: boolean;
  recommended?: boolean;
}> = ({ app, onClick, disabled, recommended }) => {
  const colors = app.color.split(' ');
  const iconBg = colors[0] || 'bg-zinc-50';
  const iconText = colors[1] || 'text-zinc-500';
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={`Launch ${app.label}${recommended ? ' (Recommended)' : ''}`}
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border transition-all text-left group focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
        disabled
          ? 'opacity-50 cursor-not-allowed border-zinc-100'
          : recommended
            ? 'border-blue-200 bg-blue-50/30 hover:border-blue-300 hover:bg-blue-50/50'
            : 'border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50/50'
      )}
    >
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}>
        <span className={iconText}>{app.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-zinc-800">{app.label}</span>
          {recommended && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-100 text-blue-700">
              <Star className="w-2.5 h-2.5 fill-current" />
              Recommended
            </span>
          )}
          <ArrowRight className="w-3 h-3 text-zinc-300 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity ml-auto" />
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed mt-0.5">{app.description}</p>
      </div>
    </button>
  );
};

const AppGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-8">
    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 px-1">{title}</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {children}
    </div>
  </div>
);

// ─── Sort apps by track relevance ─────────────────────────────────────────────

function sortByRelevance(apps: AppCard[], submissionType?: string): AppCard[] {
  if (!submissionType) return apps;
  // Stable sort: relevant apps first, original order preserved within groups
  return [...apps].sort((a, b) => {
    const aMatch = a.tracks.includes(submissionType) ? 1 : 0;
    const bMatch = b.tracks.includes(submissionType) ? 1 : 0;
    if (bMatch !== aMatch) return bMatch - aMatch;
    return apps.indexOf(a) - apps.indexOf(b);
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const AppsPage: React.FC<AppsPageProps> = ({
  onNavigate,
  activeProjectId,
  activeProjectName,
  submissionType,
}) => {
  const noProject = !activeProjectId;

  // Compute recommended apps for current project context
  const recommended = useMemo(() => {
    if (!submissionType) return [];
    return ALL_APPS
      .filter(app => app.tracks.includes(submissionType))
      .slice(0, 6);
  }, [submissionType]);

  // Sort each group by relevance
  const sortedStrategy = useMemo(() => sortByRelevance(STRATEGY_APPS, submissionType), [submissionType]);
  const sortedBuilders = useMemo(() => sortByRelevance(BUILDER_APPS, submissionType), [submissionType]);
  const sortedStudios = useMemo(() => sortByRelevance(STUDIO_APPS, submissionType), [submissionType]);

  const trackLabel = submissionType
    ? isDeviceTrack(submissionType)
      ? 'Device & Diagnostics'
      : isPharmaTrack(submissionType)
        ? 'Pharma & Biotech'
        : null
    : null;

  return (
    <WorkspaceCanvas maxWidth="5xl" testId="apps-page">
      <PageTitleHeader
        title="Apps"
        subtitle={
          activeProjectId
            ? `for ${activeProjectName || 'current project'}${trackLabel ? ` · ${trackLabel}` : ''}`
            : 'Select a project first to launch apps'
        }
      />

      {noProject && (
        <div className="mt-4 px-3 py-2.5 rounded-lg bg-amber-50 text-amber-700 text-xs">
          Open a project from the sidebar to enable app launching.
        </div>
      )}

      {/* Recommended section — shown when project has a submission type */}
      {recommended.length > 0 && !noProject && (
        <section className="mt-6 mb-2" aria-label={`Recommended apps for ${submissionType} submissions`}>
          <AppGroup title={`Recommended for ${submissionType || 'your project'}`}>
            {recommended.map(app => (
              <AppCardComponent
                key={app.id}
                app={app}
                onClick={() => onNavigate(app.id)}
                recommended
              />
            ))}
          </AppGroup>
        </section>
      )}

      <div className={cn(recommended.length > 0 && !noProject ? '' : 'mt-6')}>
        <AppGroup title="Strategy & Evidence">
          {sortedStrategy.map(app => (
            <AppCardComponent
              key={app.id}
              app={app}
              onClick={() => onNavigate(app.id)}
              disabled={noProject}
            />
          ))}
        </AppGroup>

        <AppGroup title="Builders">
          {sortedBuilders.map(app => (
            <AppCardComponent
              key={app.id}
              app={app}
              onClick={() => onNavigate(app.id)}
              disabled={noProject}
            />
          ))}
        </AppGroup>

        <AppGroup title="Specialist Studios">
          {sortedStudios.map(app => (
            <AppCardComponent
              key={app.id}
              app={app}
              onClick={() => onNavigate(app.id)}
              disabled={noProject}
            />
          ))}
        </AppGroup>
      </div>
    </WorkspaceCanvas>
  );
};

export default AppsPage;
