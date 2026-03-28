import React, { useMemo } from 'react';
import { FolderOpen } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { DataStateWrapper } from '@/components/ui/statesV2';
import {
  WorkspaceHeader,
  WorkspaceCanvas,
  SectionPanel,
  WorkspaceStatusBadge,
  STATUS_ICON_MAP,
} from '@/components/ui/workspace-primitives';

interface DossierMapProps {
  projectId?: string | number;
  projectName?: string;
  projectType?: string;
  onSectionClick: (sectionCode: string) => void;
  onBack: () => void;
}

export interface DossierSection {
  code: string;
  title: string;
  status: string;
  children?: DossierSection[];
}

// Default CTD structure used as fallback when no sections are initialized
const DEFAULT_CTD_STRUCTURE: DossierSection[] = [
  {
    code: '1',
    title: 'Module 1 — Administrative',
    status: 'not-started',
    children: [
      { code: '1.1', title: 'Forms', status: 'not-started' },
      { code: '1.2', title: 'Cover Letter', status: 'not-started' },
    ],
  },
  {
    code: '2',
    title: 'Module 2 — CTD Summaries',
    status: 'not-started',
    children: [
      { code: '2.2', title: 'Introduction', status: 'not-started' },
      { code: '2.3', title: 'Quality Overall Summary', status: 'not-started' },
      { code: '2.5', title: 'Clinical Overview', status: 'not-started' },
      { code: '2.7.3', title: 'Clinical Efficacy', status: 'not-started' },
    ],
  },
  {
    code: '3',
    title: 'Module 3 — Quality',
    status: 'not-started',
    children: [
      { code: '3.2.S', title: 'Drug Substance', status: 'not-started' },
      { code: '3.2.P', title: 'Drug Product', status: 'not-started' },
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
    status: 'not-started',
    children: [
      { code: '5.3', title: 'Clinical Study Reports', status: 'not-started' },
      { code: '5.4', title: 'Literature References', status: 'not-started' },
    ],
  },
];

/** Build CTD module tree from flat section list */
function buildModuleTree(sections: Array<{ code: string; title: string; status: string }>): DossierSection[] {
  const moduleMap = new Map<string, DossierSection>();

  for (const sec of sections) {
    const moduleCode = sec.code.split('.')[0];
    if (!moduleMap.has(moduleCode)) {
      const moduleTitles: Record<string, string> = {
        '1': 'Module 1 — Administrative',
        '2': 'Module 2 — CTD Summaries',
        '3': 'Module 3 — Quality',
        '4': 'Module 4 — Nonclinical',
        '5': 'Module 5 — Clinical',
      };
      moduleMap.set(moduleCode, {
        code: moduleCode,
        title: moduleTitles[moduleCode] || `Module ${moduleCode}`,
        status: 'not-started',
        children: [],
      });
    }
    moduleMap.get(moduleCode)!.children!.push({
      code: sec.code,
      title: sec.title,
      status: sec.status,
    });
  }

  // Derive module status from children
  for (const mod of moduleMap.values()) {
    const statuses = mod.children?.map(c => c.status) || [];
    if (statuses.every(s => s === 'approved' || s === 'locked')) mod.status = 'approved';
    else if (statuses.some(s => s === 'blocked')) mod.status = 'blocked';
    else if (statuses.some(s => s === 'in-review' || s === 'internal_review' || s === 'qa_review')) mod.status = 'in-review';
    else if (statuses.some(s => s === 'drafting' || s === 'data_gathering')) mod.status = 'drafting';
    else mod.status = 'not-started';
  }

  return Array.from(moduleMap.values()).sort((a, b) => Number(a.code) - Number(b.code));
}

export const DossierMap: React.FC<DossierMapProps> = ({
  projectId,
  projectName,
  projectType,
  onSectionClick,
  onBack,
}) => {
  // Fetch project sections from existing API
  const { data: sections, isLoading: sectionsLoading, error } = useQuery<Array<{ code: string; title: string; status: string }>>({
    queryKey: queryKeys.ind.projectSections(projectId || 'none'),
    queryFn: () => apiRequest(`/api/project-sections?projectId=${projectId}`),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // For IND projects: also fetch IND status to get real section completion
  const upperType = (projectType || '').toUpperCase();
  const isIND = upperType === 'IND' || upperType === 'NDA' || upperType === 'BLA';
  const { data: indStatus } = useQuery<{ sections: Array<{ code: string; title: string; status: string }> }>({
    queryKey: ['concept2cure', 'ind', 'status', projectId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/ind/status/${projectId}`);
      if (!res.ok) return { sections: [] };
      const json = await res.json();
      return json.data || { sections: [] };
    },
    enabled: !!projectId && isIND,
    staleTime: 30_000,
  });

  const isLoading = sectionsLoading;

  const structure = useMemo(() => {
    // IND projects: use IND registry sections for complete Module 1-5 structure
    if (isIND && indStatus?.sections && indStatus.sections.length > 0) {
      return buildModuleTree(indStatus.sections);
    }
    // Other projects: use project sections or fallback
    if (sections && sections.length > 0) return buildModuleTree(sections);
    return DEFAULT_CTD_STRUCTURE;
  }, [sections, indStatus, isIND]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-stone-50/50">
      <WorkspaceHeader
        title="Dossier Map"
        titleIcon={<FolderOpen className="w-3.5 h-3.5 text-stone-500" />}
        onBack={onBack}
        typeBadge={projectType}
        subtitle={projectName}
        testId="dossier-map-header"
      />

      <DataStateWrapper
        data={structure}
        isLoading={isLoading && !!projectId}
        error={error}
        emptyDescription="No sections initialized for this project"
      >
        {(modules) => (
          <WorkspaceCanvas>
            {modules.map(mod => {
              const modStatus = STATUS_ICON_MAP[mod.status] || STATUS_ICON_MAP['not-started'];
              return (
                <SectionPanel
                  key={mod.code}
                  title={`${mod.code} — ${mod.title}`}
                  titleIcon={<span className="text-xs font-bold text-stone-400">{mod.code}</span>}
                  headerRight={
                    <WorkspaceStatusBadge status={mod.status} />
                  }
                >
                  <div className="divide-y divide-stone-100 -mx-5 -mb-5">
                    {mod.children?.map(sec => {
                      const statusInfo = STATUS_ICON_MAP[sec.status] || STATUS_ICON_MAP['not-started'];
                      const Icon = statusInfo.icon;
                      return (
                        <button
                          key={sec.code}
                          onClick={() => onSectionClick(sec.code)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                        >
                          <Icon className={`w-3.5 h-3.5 ${statusInfo.color}`} />
                          <span className="text-xs font-mono text-stone-400 w-10">{sec.code}</span>
                          <span className="text-sm text-stone-800">{sec.title}</span>
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
        )}
      </DataStateWrapper>
    </div>
  );
};

export default DossierMap;
