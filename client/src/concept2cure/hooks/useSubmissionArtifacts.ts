/**
 * Hook to fetch project artifacts and map them to eCTD sections
 * for the Submission Builder.
 */
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface SubmissionArtifact {
  id: string;
  artifactId: string;
  title: string;
  content: string;
  type: string;
  category: string;
  ctdSection: string | null;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface SectionArtifactMap {
  [ctdSection: string]: SubmissionArtifact[];
}

export function useSubmissionArtifacts(projectId: string | undefined) {
  const query = useQuery<SubmissionArtifact[]>({
    queryKey: ['submission-artifacts', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts`);
      if (!res.ok) throw new Error('Failed to fetch artifacts');
      const json = await res.json();
      return json.data || json || [];
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Map artifacts to sections
  const sectionMap: SectionArtifactMap = {};
  const unmapped: SubmissionArtifact[] = [];

  for (const artifact of query.data || []) {
    if (artifact.ctdSection) {
      if (!sectionMap[artifact.ctdSection]) {
        sectionMap[artifact.ctdSection] = [];
      }
      sectionMap[artifact.ctdSection].push(artifact);
    } else {
      unmapped.push(artifact);
    }
  }

  // Compute section status from artifacts
  const getSectionStatus = (ectdPath: string): string => {
    // Check exact match and prefix match (e.g., "2.3" matches artifacts with ctdSection "2.3" or "m3-qos")
    const artifacts = sectionMap[ectdPath] || [];
    if (artifacts.length === 0) return 'not_started';

    const hasApproved = artifacts.some(a => a.status === 'approved' || a.status === 'locked');
    const hasReview = artifacts.some(a => a.status === 'review');
    const hasDraft = artifacts.some(a => a.status === 'draft');

    if (hasApproved) return 'final';
    if (hasReview) return 'review';
    if (hasDraft) return 'drafting';
    return 'drafting';
  };

  // Count artifacts for a module (e.g., moduleId "3" matches sections starting with "3.")
  const getModuleProgress = (moduleId: string) => {
    let total = 0;
    let complete = 0;
    for (const [section, arts] of Object.entries(sectionMap)) {
      if (section.startsWith(`${moduleId}.`) || section.startsWith(`m${moduleId}`)) {
        total++;
        if (arts.some(a => a.status === 'approved' || a.status === 'locked' || a.status === 'review')) {
          complete++;
        }
      }
    }
    return { complete, total: Math.max(total, 1) };
  };

  return {
    artifacts: query.data || [],
    sectionMap,
    unmapped,
    getSectionStatus,
    getModuleProgress,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
