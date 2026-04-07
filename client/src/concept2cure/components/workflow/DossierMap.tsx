import React, { useMemo } from 'react';
import { FolderOpen, FileText, Plus, Send } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { DataStateWrapper } from '@/components/ui/statesV2';
import { Button } from '@/components/ui/button';
import {
  WorkspaceHeader,
  WorkspaceCanvas,
  SectionPanel,
  WorkspaceStatusBadge,
  STATUS_ICON_MAP,
} from '@/components/ui/workspace-primitives';

interface DossierArtifact {
  id: string;
  title: string;
  status?: string;
  ctdSection?: string;
}

interface DossierMapProps {
  projectId?: string | number;
  projectName?: string;
  projectType?: string;
  onSectionClick: (sectionCode: string) => void;
  onCreateForSection?: (sectionCode: string, sectionTitle: string) => void;
  onNavigateSubmit?: () => void;
  onBack: () => void;
}

export interface DossierSection {
  code: string;
  title: string;
  status: string;
  children?: DossierSection[];
}

interface ProjectSectionsResponse {
  sections?: Array<{
    section_code?: string;
    code?: string;
    title: string;
    status: string;
  }>;
}

function normalizeProjectSections(payload: ProjectSectionsResponse | Array<{ code: string; title: string; status: string }>) {
  const rawSections = Array.isArray(payload) ? payload : payload?.sections || [];
  return rawSections.map(sec => ({
    code: sec.code || sec.section_code || '',
    title: sec.title,
    status: sec.status,
  })).filter(sec => !!sec.code);
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

/** Derive section status from placed artifacts */
function deriveSectionStatusFromArtifacts(
  sectionCode: string,
  artifacts: DossierArtifact[],
  existingStatus: string
): string {
  const placed = artifacts.filter(a => a.ctdSection === sectionCode);
  if (placed.length === 0) return existingStatus; // no artifact → keep existing status

  // Derive from artifact statuses
  const statuses = placed.map(a => (a.status || 'draft').toLowerCase());
  if (statuses.every(s => s === 'locked' || s === 'published')) return 'approved';
  if (statuses.every(s => s === 'approved' || s === 'locked' || s === 'published')) return 'approved';
  if (statuses.some(s => s === 'review' || s === 'in_review' || s === 'in-review')) return 'in-review';
  if (statuses.some(s => s === 'draft')) return 'drafting';
  return existingStatus;
}

export const DossierMap: React.FC<DossierMapProps> = ({
  projectId,
  projectName,
  projectType,
  onSectionClick,
  onCreateForSection,
  onNavigateSubmit,
  onBack,
}) => {
  // Fetch project sections from existing API
  const { data: sections, isLoading: sectionsLoading, error } = useQuery<Array<{ code: string; title: string; status: string }>>({
    queryKey: queryKeys.ind.projectSections(projectId || 'none'),
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/project-sections?project_id=${projectId}`);
      const payload = await response.json();
      return normalizeProjectSections(payload);
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // Fetch artifacts to derive live section readiness
  const { data: artifacts } = useQuery<DossierArtifact[]>({
    queryKey: queryKeys.projects.vaultArtifacts(String(projectId || 'none')),
    queryFn: async () => {
      if (!projectId) return [];
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts`);
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data ?? json.artifacts ?? json ?? []) as DossierArtifact[];
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Map artifacts by CTD section for quick lookup
  const artifactsBySection = useMemo(() => {
    const map = new Map<string, DossierArtifact[]>();
    for (const a of artifacts || []) {
      if (!a.ctdSection) continue;
      if (!map.has(a.ctdSection)) map.set(a.ctdSection, []);
      map.get(a.ctdSection)!.push(a);
    }
    return map;
  }, [artifacts]);

  // For IND projects: also fetch IND status to get real section completion
  const upperType = (projectType || '').toUpperCase();
  const isIND = upperType === 'IND' || upperType === 'NDA' || upperType === 'BLA';
  const isDevice = upperType === '510K' || upperType === 'PMA' || upperType === 'DE_NOVO' || upperType === 'CER';
  const hasRegistry = isIND || isDevice;
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

  // For device projects: fetch device section status
  const { data: deviceStatus } = useQuery<{ sections: Array<{ code: string; title: string; status: string }> }>({
    queryKey: ['concept2cure', 'device', 'status', upperType, projectId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/ind/device-status/${upperType}/${projectId}`);
      if (!res.ok) return { sections: [] };
      const json = await res.json();
      return json.data || { sections: [] };
    },
    enabled: !!projectId && isDevice,
    staleTime: 30_000,
  });

  const isLoading = sectionsLoading;

  const structure = useMemo(() => {
    let tree: DossierSection[];
    // Device projects: use device registry sections
    if (isDevice && deviceStatus?.sections && deviceStatus.sections.length > 0) {
      tree = buildModuleTree(deviceStatus.sections);
    }
    // IND projects: use IND registry sections for complete Module 1-5 structure
    else if (isIND && indStatus?.sections && indStatus.sections.length > 0) {
      tree = buildModuleTree(indStatus.sections);
    }
    // Other projects: use project sections or fallback
    else if (sections && sections.length > 0) {
      tree = buildModuleTree(sections);
    } else {
      tree = DEFAULT_CTD_STRUCTURE;
    }

    // Overlay live artifact status onto section tree
    if (artifacts && artifacts.length > 0) {
      for (const mod of tree) {
        for (const sec of mod.children || []) {
          sec.status = deriveSectionStatusFromArtifacts(sec.code, artifacts, sec.status);
        }
        // Re-derive module status from updated children
        const statuses = mod.children?.map(c => c.status) || [];
        if (statuses.every(s => s === 'approved' || s === 'locked')) mod.status = 'approved';
        else if (statuses.some(s => s === 'blocked')) mod.status = 'blocked';
        else if (statuses.some(s => s === 'in-review' || s === 'internal_review' || s === 'qa_review')) mod.status = 'in-review';
        else if (statuses.some(s => s === 'drafting' || s === 'data_gathering')) mod.status = 'drafting';
        else mod.status = 'not-started';
      }
    }

    return tree;
  }, [sections, indStatus, deviceStatus, isIND, isDevice, artifacts]);

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
        emptyDescription="Your CTD dossier structure will appear here. Ask AnA to set up sections, or create documents to populate the map."
      >
        {(modules) => (
          <WorkspaceCanvas>
            {/* Submission readiness link */}
            {onNavigateSubmit && (
              <Button
                variant="outline"
                onClick={onNavigateSubmit}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 h-auto text-left"
              >
                <div className="flex items-center gap-2">
                  <Send className="w-3.5 h-3.5 text-violet-500" />
                  <span className="text-sm font-medium text-stone-800">Check Submission Readiness</span>
                </div>
                <span className="text-xs text-stone-400">Review readiness & export</span>
              </Button>
            )}

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
                      const sectionArtifacts = artifactsBySection.get(sec.code) || [];
                      const hasArtifacts = sectionArtifacts.length > 0;
                      return (
                        <div
                          key={sec.code}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition-colors group"
                        >
                          <Button
                            variant="ghost"
                            onClick={() => onSectionClick(sec.code)}
                            className="flex items-center gap-3 flex-1 min-w-0 h-auto text-left px-0"
                          >
                            <Icon className={`w-3.5 h-3.5 ${statusInfo.color}`} />
                            <span className="text-xs font-mono text-stone-400 w-10">{sec.code}</span>
                            <span className="text-sm text-stone-800">{sec.title}</span>
                            {hasArtifacts && (
                              <span className="flex items-center gap-0.5 text-[10px] text-stone-400">
                                <FileText className="w-3 h-3" />
                                {sectionArtifacts.length}
                              </span>
                            )}
                          </Button>
                          {!hasArtifacts && onCreateForSection && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onCreateForSection(sec.code, sec.title)}
                              className="opacity-0 group-hover:opacity-100 h-auto px-2 py-1 text-[10px] text-stone-400 hover:text-stone-700 shrink-0"
                              title={`Create draft for ${sec.code}`}
                            >
                              <Plus className="w-3 h-3" />
                              Create
                            </Button>
                          )}
                          <WorkspaceStatusBadge
                            status={sec.status}
                            className="shrink-0"
                          />
                        </div>
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
