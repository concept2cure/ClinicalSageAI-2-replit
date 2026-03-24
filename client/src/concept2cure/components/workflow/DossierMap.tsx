import React from 'react';
import { FolderOpen } from 'lucide-react';
import {
  WorkspaceHeader,
  WorkspaceCanvas,
  SectionPanel,
  WorkspaceStatusBadge,
  STATUS_ICON_MAP,
  WORKFLOW_STATUS_CONFIG,
} from '@/components/ui/workspace-primitives';

interface DossierMapProps {
  projectName?: string;
  projectType?: string;
  onSectionClick: (sectionCode: string) => void;
  onBack: () => void;
}

interface DossierSection {
  code: string;
  title: string;
  status: string;
  children?: DossierSection[];
}

const CTD_STRUCTURE: DossierSection[] = [
  {
    code: '1',
    title: 'Module 1 — Administrative',
    status: 'approved',
    children: [
      { code: '1.1', title: 'Forms', status: 'approved' },
      { code: '1.2', title: 'Cover Letter', status: 'approved' },
      { code: '1.3.1', title: 'Form FDA 1571', status: 'approved' },
      { code: '1.3.2', title: 'Form FDA 1572', status: 'drafting' },
    ],
  },
  {
    code: '2',
    title: 'Module 2 — CTD Summaries',
    status: 'drafting',
    children: [
      { code: '2.2', title: 'Introduction', status: 'drafting' },
      { code: '2.3', title: 'Quality Overall Summary', status: 'not-started' },
      { code: '2.5', title: 'Clinical Overview', status: 'drafting' },
      { code: '2.7.3', title: 'Clinical Efficacy', status: 'drafting' },
    ],
  },
  {
    code: '3',
    title: 'Module 3 — Quality',
    status: 'in-review',
    children: [
      { code: '3.2.S', title: 'Drug Substance', status: 'in-review' },
      { code: '3.2.P', title: 'Drug Product', status: 'in-review' },
      { code: '3.2.A', title: 'Appendices', status: 'not-started' },
    ],
  },
  {
    code: '4',
    title: 'Module 4 — Nonclinical',
    status: 'not-started',
    children: [
      { code: '4.2.1', title: 'Pharmacology', status: 'not-started' },
      { code: '4.2.3', title: 'Toxicology', status: 'not-started' },
    ],
  },
  {
    code: '5',
    title: 'Module 5 — Clinical',
    status: 'blocked',
    children: [
      { code: '5.3', title: 'Clinical Study Reports', status: 'blocked' },
      { code: '5.4', title: 'Literature References', status: 'not-started' },
    ],
  },
];

export const DossierMap: React.FC<DossierMapProps> = ({
  projectName,
  projectType,
  onSectionClick,
  onBack,
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-zinc-50/50">
      <WorkspaceHeader
        title="Dossier Map"
        titleIcon={<FolderOpen className="w-3.5 h-3.5 text-blue-500" />}
        onBack={onBack}
        typeBadge={projectType}
        subtitle={projectName}
        testId="dossier-map-header"
      />

      <WorkspaceCanvas>
        {CTD_STRUCTURE.map(mod => {
          const modStatus = STATUS_ICON_MAP[mod.status] || STATUS_ICON_MAP['not-started'];
          return (
            <SectionPanel
              key={mod.code}
              title={`${mod.code} — ${mod.title}`}
              titleIcon={<span className="text-xs font-bold text-zinc-400">{mod.code}</span>}
              headerRight={
                <WorkspaceStatusBadge status={mod.status} />
              }
            >
              <div className="divide-y divide-zinc-100 -mx-5 -mb-5">
                {mod.children?.map(sec => {
                  const statusInfo = STATUS_ICON_MAP[sec.status] || STATUS_ICON_MAP['not-started'];
                  const Icon = statusInfo.icon;
                  return (
                    <button
                      key={sec.code}
                      onClick={() => onSectionClick(sec.code)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 transition-colors text-left"
                    >
                      <Icon className={`w-3.5 h-3.5 ${statusInfo.color}`} />
                      <span className="text-xs font-mono text-zinc-400 w-10">{sec.code}</span>
                      <span className="text-sm text-zinc-800">{sec.title}</span>
                      <WorkspaceStatusBadge
                        status={sec.status}
                        className="ml-auto"
                      />
                    </button>
                  );
                })}
              </div>
            </SectionPanel>
          );
        })}
      </WorkspaceCanvas>
    </div>
  );
};

export default DossierMap;
