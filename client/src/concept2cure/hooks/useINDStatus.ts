/**
 * useINDStatus — Hook to fetch IND submission structure and completion status.
 *
 * Returns:
 * - Complete CTD module structure
 * - Section-by-section completion status
 * - Module-level completion percentages
 * - Next recommended section to work on
 *
 * @module concept2cure/hooks/useINDStatus
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface INDModule {
  number: number;
  name: string;
  sections: INDSectionStatus[];
}

export interface INDSectionStatus {
  code: string;
  title: string;
  module: number;
  required: boolean;
  status: 'not_started' | 'draft' | 'review' | 'approved' | 'locked';
  artifactId: string | null;
}

export interface INDStatusData {
  modules: Record<string, {
    total: number;
    drafted: number;
    approved: number;
    completion: number;
  }>;
  sections: INDSectionStatus[];
  totalSections: number;
  completedSections: number;
  approvedSections: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useINDStatus(projectId: string | number | null | undefined) {
  return useQuery<INDStatusData>({
    queryKey: ['concept2cure', 'ind', 'status', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('No project ID');
      const res = await apiRequest('GET', `/api/ind-generation/status/${projectId}`);
      if (!res.ok) throw new Error('Failed to fetch IND status');
      const json = await res.json();
      return json.data;
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useINDStructure() {
  return useQuery({
    queryKey: ['concept2cure', 'ind', 'structure'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/ind-generation/structure');
      if (!res.ok) throw new Error('Failed to fetch IND structure');
      const json = await res.json();
      return json.data;
    },
    staleTime: 300_000, // 5 min — structure doesn't change
  });
}

/**
 * Get the next recommended section to work on.
 * Prioritizes: required sections → by module order → first not_started.
 */
export function getNextRecommendedSection(sections: INDSectionStatus[]): INDSectionStatus | null {
  // First: find required sections that aren't started
  const requiredNotStarted = sections
    .filter(s => s.required && s.status === 'not_started')
    .sort((a, b) => a.code.localeCompare(b.code));

  if (requiredNotStarted.length > 0) return requiredNotStarted[0];

  // Then: find any not-started section
  const anyNotStarted = sections
    .filter(s => s.status === 'not_started')
    .sort((a, b) => a.code.localeCompare(b.code));

  if (anyNotStarted.length > 0) return anyNotStarted[0];

  // Then: find sections still in draft (not yet approved)
  const inDraft = sections
    .filter(s => s.status === 'draft')
    .sort((a, b) => a.code.localeCompare(b.code));

  return inDraft.length > 0 ? inDraft[0] : null;
}
