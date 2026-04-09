import React from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FlaskConical,
  FolderKanban,
  Layers,
  Microscope,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WorkspaceCanvas, PageTitleHeader } from '@/components/ui/workspace-primitives';
import { CommunicationCenter } from '../components/workspace/CommunicationCenter';

interface ArtifactSummary {
  id: string;
  title: string;
  ctdSection?: string;
  status: string;
  version: number;
}

interface DeviceDiagnosticsWorkbenchPageProps {
  projectId?: string;
  projectName?: string;
  submissionType?: string;
  artifacts: ArtifactSummary[];
  onOpen510kWorkspace: () => void;
  onOpenPmaWorkspace: () => void;
  onOpenCerWorkspace: () => void;
  onOpenProjectModule: () => void;
  onOpenCollaboration: () => void;
  onOpenSubmissionCenter: () => void;
}

type CommunicationCenterSubmissionType = 'IND' | 'NDA' | 'BLA' | '510k' | 'PMA' | 'MAA' | 'ANDA';

interface InventoryItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  status: 'ready' | 'partial';
}

const INVENTORY: InventoryItem[] = [
  {
    title: 'FDA 510(k) and De Novo builders',
    description: 'Predicate strategy, substantial equivalence content, and eSTAR-aligned package preparation.',
    icon: <ClipboardCheck className="h-4 w-4 text-blue-600" />,
    status: 'ready',
  },
  {
    title: 'PMA and high-risk device workflows',
    description: 'Structured PMA workspace with clinical, quality, and manufacturing handoff points.',
    icon: <ShieldCheck className="h-4 w-4 text-violet-600" />,
    status: 'ready',
  },
  {
    title: 'CER / IVDR evidence generation',
    description: 'Clinical evaluation report drafting, literature-backed evidence synthesis, and EU alignment.',
    icon: <Microscope className="h-4 w-4 text-emerald-600" />,
    status: 'ready',
  },
  {
    title: 'Project-aware app orchestration',
    description: 'Connected-app memory and project context activation through the project apps module.',
    icon: <Layers className="h-4 w-4 text-indigo-600" />,
    status: 'ready',
  },
  {
    title: 'Collaboration, tasks, and submission control room',
    description: 'Unified Communication Center with task board, thread lanes, and submission/agency tabs.',
    icon: <Users className="h-4 w-4 text-amber-600" />,
    status: 'ready',
  },
  {
    title: 'Diagnostics beta-readiness instrumentation',
    description: 'Cross-pathway checklist and controlled pilot gates for medical device and diagnostics clients.',
    icon: <Activity className="h-4 w-4 text-cyan-600" />,
    status: 'partial',
  },
];

const JOURNEY = [
  'Intake the device/diagnostic profile and classify pathway fit (510(k), PMA, CER, De Novo, IVDR).',
  'Build core submission artifacts in the connected workspace while preserving evidence provenance.',
  'Route cross-functional review through collaboration threads and task board assignments.',
  'Assemble submission package and dispatch through Submission & Agency Portal / eSTAR lane.',
  'Run beta acceptance checks with pilot clients and expand entitlement after KPI pass criteria.',
];

const BETA_CHECKLIST = [
  'Project module linkage verified (apps connected + project context hydrated).',
  'Collaboration lane active (tasks, threads, approvals, escalation paths).',
  'Submission center wired (package assembly + agency response workflow).',
  'Pathway templates validated for 510(k), PMA, CER/IVDR, and diagnostics evidence bundles.',
  'Pilot instrumentation defined (cycle time, unresolved issues, package defects, reviewer turnaround).',
];

export const DeviceDiagnosticsWorkbenchPage: React.FC<DeviceDiagnosticsWorkbenchPageProps> = ({
  projectId,
  projectName,
  submissionType,
  artifacts,
  onOpen510kWorkspace,
  onOpenPmaWorkspace,
  onOpenCerWorkspace,
  onOpenProjectModule,
  onOpenCollaboration,
  onOpenSubmissionCenter,
}) => {
  const noProject = !projectId;
  const communicationSubmissionType: CommunicationCenterSubmissionType =
    submissionType === '510K' || submissionType === 'DE_NOVO' || submissionType === 'EUA' || submissionType === 'IVDR'
      ? '510k'
      : submissionType === 'PMA'
        ? 'PMA'
        : submissionType === 'BLA'
          ? 'BLA'
          : submissionType === 'NDA'
            ? 'NDA'
            : submissionType === 'MAA'
              ? 'MAA'
              : 'IND';

  return (
    <WorkspaceCanvas maxWidth="4xl" testId="device-diagnostics-workbench-page">
      <PageTitleHeader
        title="Medical Device & Diagnostics Workbench"
        subtitle={projectId ? `Unified beta lane for ${projectName || 'active project'}` : 'Select a project to enable full orchestration'}
      />

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <LaunchCard title="510(k) Workspace" description="Predicate + eSTAR package build" icon={<ClipboardCheck className="h-4 w-4" />} onClick={onOpen510kWorkspace} disabled={noProject} />
        <LaunchCard title="PMA Workspace" description="High-risk dossier assembly" icon={<FlaskConical className="h-4 w-4" />} onClick={onOpenPmaWorkspace} disabled={noProject} />
        <LaunchCard title="CER Generator" description="EU MDR/IVDR evaluation workflow" icon={<FileCheck2 className="h-4 w-4" />} onClick={onOpenCerWorkspace} disabled={noProject} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-stone-900">Current capability inventory</h2>
          <ul className="mt-3 space-y-2">
            {INVENTORY.map(item => (
              <li key={item.title} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {item.icon}
                  <span className="text-xs font-semibold text-stone-900">{item.title}</span>
                  <span
                    className={cn(
                      'ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      item.status === 'ready'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    )}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-stone-600">{item.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-stone-900">Unified journey (single workbench)</h2>
          <ol className="mt-3 space-y-2">
            {JOURNEY.map((step, idx) => (
              <li key={step} className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5">
                <span className="mt-[1px] inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-stone-900 px-1.5 text-[10px] font-semibold text-white">
                  {idx + 1}
                </span>
                <span className="text-xs text-stone-700">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SecondaryAction label="Project Module" onClick={onOpenProjectModule} disabled={noProject} />
            <SecondaryAction label="Collaboration" onClick={onOpenCollaboration} disabled={noProject} />
            <SecondaryAction label="Submission Center" onClick={onOpenSubmissionCenter} disabled={noProject} />
          </div>
        </section>
      </div>

      <section className="mt-3 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-stone-900">Beta launch checklist</h2>
        <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {BETA_CHECKLIST.map(item => (
            <li key={item} className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              <span className="text-xs text-stone-700">{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-stone-500">
          Active project artifacts: <strong>{artifacts.length}</strong>
          {submissionType ? ` · Submission type: ${submissionType}` : ''}
        </p>
      </section>

      {!noProject && (
        <section className="mt-4">
          <CommunicationCenter
            projectId={projectId}
            projectName={projectName}
            submissionType={communicationSubmissionType}
            artifacts={artifacts}
          />
        </section>
      )}
    </WorkspaceCanvas>
  );
};

function LaunchCard({
  title,
  description,
  icon,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-left transition-colors',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-stone-50'
      )}
    >
      <span className="rounded-lg bg-stone-100 p-2 text-stone-700">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-stone-900">{title}</span>
        <span className="block text-[11px] text-stone-500">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-stone-400" />
    </button>
  );
}

function SecondaryAction({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center rounded-md border px-2 py-1.5 text-xs font-medium',
        disabled
          ? 'cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400'
          : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
      )}
    >
      <FolderKanban className="mr-1 h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export default DeviceDiagnosticsWorkbenchPage;
