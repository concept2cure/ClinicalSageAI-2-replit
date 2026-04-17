import React from 'react';
import {
  ArrowRight,
  ClipboardCheck,
  FileCheck2,
  FlaskConical,
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
    title: 'FDA 510(k) and De Novo',
    description: 'Predicate search, substantial equivalence analysis, compliance checks, and eSTAR package assembly.',
    icon: <ClipboardCheck className="h-4 w-4 text-stone-600" />,
    status: 'ready',
  },
  {
    title: 'PMA (Class III)',
    description: '10-phase workflow from program planning through post-submission, with role-based task tracking.',
    icon: <ShieldCheck className="h-4 w-4 text-stone-600" />,
    status: 'ready',
  },
  {
    title: 'Clinical Evaluation Reports',
    description: 'EU MDR/IVDR CER generation with FAERS integration, literature search, and governed export.',
    icon: <Microscope className="h-4 w-4 text-stone-600" />,
    status: 'ready',
  },
  {
    title: 'Regulatory intelligence',
    description: 'Reviewer deficiency patterns, submission risk signals, and outcome prediction across all device pathways.',
    icon: <Layers className="h-4 w-4 text-stone-600" />,
    status: 'ready',
  },
  {
    title: 'Collaboration and submission',
    description: 'Cross-functional task board, review workflows, and submission package dispatch.',
    icon: <Users className="h-4 w-4 text-stone-600" />,
    status: 'ready',
  },
];

const JOURNEY = [
  'Define your device profile and classify the regulatory pathway — 510(k), PMA, CER, De Novo, or IVDR.',
  'Build submission artifacts with AI-assisted drafting and evidence provenance tracking.',
  'Run predicate analysis, substantial equivalence comparisons, and compliance checks.',
  'Review cross-functionally with role-based task assignments and governed approvals.',
  'Assemble the final submission package (eSTAR, eCTD, or agency-specific format) and export.',
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
        subtitle={projectId ? `${projectName || 'Active project'}${submissionType ? ` · ${submissionType}` : ''}` : 'Select a project to begin'}
      />

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <LaunchCard
          title="510(k) Workspace"
          description="510(k) and De Novo pathways. Predicate search, substantial equivalence, compliance, and eSTAR assembly."
          icon={<ClipboardCheck className="h-4 w-4" />}
          onClick={onOpen510kWorkspace}
          disabled={noProject}
          highlighted={submissionType === '510K' || submissionType === 'DE_NOVO'}
        />
        <LaunchCard
          title="PMA Workspace"
          description="Class III premarket approval. 10-phase workflow with clinical, quality, and manufacturing handoffs."
          icon={<FlaskConical className="h-4 w-4" />}
          onClick={onOpenPmaWorkspace}
          disabled={noProject}
          highlighted={submissionType === 'PMA'}
        />
        <LaunchCard
          title="CER Generator"
          description="EU MDR and IVDR clinical evaluation. FAERS integration, literature search, and governed export."
          icon={<FileCheck2 className="h-4 w-4" />}
          onClick={onOpenCerWorkspace}
          disabled={noProject}
          highlighted={submissionType === 'IVDR' || submissionType === 'CER'}
        />
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

      {projectId && (
        <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50/40 px-4 py-3">
          <p className="text-[11px] text-stone-500">
            Active project artifacts: <strong>{artifacts.length}</strong>
            {submissionType ? ` · Submission type: ${submissionType}` : ''}
          </p>
        </div>
      )}

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
  highlighted,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  highlighted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 rounded-xl border px-3.5 py-3 text-left transition-colors',
        disabled ? 'border-stone-200 bg-white cursor-not-allowed opacity-40' :
        highlighted ? 'border-stone-400 bg-stone-50 hover:bg-stone-100 ring-1 ring-stone-300' :
        'border-stone-200 bg-white hover:bg-stone-50'
      )}
    >
      <span className={cn('rounded-lg p-2', highlighted ? 'bg-stone-200 text-stone-800' : 'bg-stone-100 text-stone-700')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-stone-900">
          {title}
          {highlighted && <span className="ml-1.5 text-[9px] font-medium tracking-wide text-stone-600 uppercase">Recommended</span>}
        </span>
        <span className="block text-[11px] text-stone-500 leading-tight">{description}</span>
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
      <ArrowRight className="mr-1 h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export default DeviceDiagnosticsWorkbenchPage;
