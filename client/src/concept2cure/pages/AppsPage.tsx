/**
 * AppsPage — Global app launcher destination.
 *
 * Three groups: Strategy & Evidence, Builders, Specialist Studios.
 * Each card describes an app and its launch behavior.
 */

import React from 'react';
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
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface AppCard {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const STRATEGY_APPS: AppCard[] = [
  { id: 'deep-research', label: 'Deep Research', description: 'Search ClinicalTrials.gov, PubMed, FDA, EMA and more', icon: <SearchIcon className="w-5 h-5" />, color: 'text-blue-500 bg-blue-50' },
  { id: 'precedent-intelligence', label: 'Precedent Intelligence', description: 'Regulatory precedent analysis and comparison', icon: <Scale className="w-5 h-5" />, color: 'text-indigo-500 bg-indigo-50' },
  { id: 'evidence-memo', label: 'Evidence Memo', description: 'Generate evidence summary from CSR and precedent search', icon: <FileText className="w-5 h-5" />, color: 'text-blue-500 bg-blue-50' },
  { id: 'protocol-rationale', label: 'Protocol Rationale', description: 'Justify clinical protocol design choices', icon: <FlaskConical className="w-5 h-5" />, color: 'text-violet-500 bg-violet-50' },
  { id: 'risk-benefit', label: 'Risk-Benefit Analysis', description: 'Structured risk-benefit assessment for submissions', icon: <ShieldCheck className="w-5 h-5" />, color: 'text-amber-500 bg-amber-50' },
];

const BUILDER_APPS: AppCard[] = [
  { id: 'clinical-overview', label: 'Clinical Overview', description: 'Module 2.5 clinical overview document', icon: <BookOpen className="w-5 h-5" />, color: 'text-emerald-500 bg-emerald-50' },
  { id: 'module3-builder', label: 'Module 3 Builder', description: 'Quality/CMC documents for Module 3', icon: <Layers className="w-5 h-5" />, color: 'text-cyan-500 bg-cyan-50' },
  { id: 'safety-narrative', label: 'Safety Narrative', description: 'Safety narrative builder for submissions', icon: <Stethoscope className="w-5 h-5" />, color: 'text-rose-500 bg-rose-50' },
  { id: '510k-workspace', label: '510(k) Workspace', description: 'Predicate comparison, SE testing, submission package', icon: <FileText className="w-5 h-5" />, color: 'text-blue-600 bg-blue-50' },
  { id: 'pma-workspace', label: 'PMA Workspace', description: 'Premarket approval application workspace', icon: <Heart className="w-5 h-5" />, color: 'text-red-500 bg-red-50' },
  { id: 'cer-generator', label: 'CER Generator', description: 'Clinical evaluation report for EU MDR/IVDR', icon: <Microscope className="w-5 h-5" />, color: 'text-teal-500 bg-teal-50' },
  { id: 'audit-report', label: 'Audit Report', description: 'Inspection-ready audit report generation', icon: <ClipboardList className="w-5 h-5" />, color: 'text-red-500 bg-red-50' },
];

const STUDIO_APPS: AppCard[] = [
  { id: 'cmc', label: 'CMC', description: 'Chemistry, Manufacturing, and Controls workspace', icon: <FlaskConical className="w-5 h-5" />, color: 'text-orange-500 bg-orange-50' },
  { id: 'biostatistics', label: 'Biostatistics', description: 'Statistical analysis, power calculations, endpoints', icon: <Beaker className="w-5 h-5" />, color: 'text-teal-500 bg-teal-50' },
  { id: 'clinical', label: 'Clinical', description: 'Clinical operations and study management', icon: <Stethoscope className="w-5 h-5" />, color: 'text-blue-500 bg-blue-50' },
  { id: 'device', label: 'Device', description: 'Medical device and diagnostics workflows', icon: <Heart className="w-5 h-5" />, color: 'text-rose-500 bg-rose-50' },
];

interface AppsPageProps {
  onNavigate: (id: string) => void;
  activeProjectId?: string;
  activeProjectName?: string;
}

const AppCardComponent: React.FC<{ app: AppCard; onClick: () => void }> = ({ app, onClick }) => {
  const [iconBg, iconText] = app.color.split(' ');
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 p-3 rounded-lg border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50/50 transition-all text-left group focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
    >
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', iconBg || 'bg-zinc-50')}>
        <span className={iconText || 'text-zinc-500'}>{app.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-zinc-800">{app.label}</span>
          <ArrowRight className="w-3 h-3 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity" />
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

export const AppsPage: React.FC<AppsPageProps> = ({ onNavigate, activeProjectId, activeProjectName }) => {
  return (
    <WorkspaceCanvas maxWidth="5xl" testId="apps-page">
      <PageTitleHeader
        title="Apps"
        subtitle={activeProjectId ? `for ${activeProjectName || 'current project'}` : 'Select a project to launch apps'}
        icon={<Sparkles className="w-5 h-5 text-violet-500" />}
      />

      <div className="mt-6">
        <AppGroup title="Strategy & Evidence">
          {STRATEGY_APPS.map(app => (
            <AppCardComponent key={app.id} app={app} onClick={() => onNavigate(app.id)} />
          ))}
        </AppGroup>

        <AppGroup title="Builders">
          {BUILDER_APPS.map(app => (
            <AppCardComponent key={app.id} app={app} onClick={() => onNavigate(app.id)} />
          ))}
        </AppGroup>

        <AppGroup title="Specialist Studios">
          {STUDIO_APPS.map(app => (
            <AppCardComponent key={app.id} app={app} onClick={() => onNavigate(app.id)} />
          ))}
        </AppGroup>
      </div>
    </WorkspaceCanvas>
  );
};

export default AppsPage;
