/**
 * useEctdReadiness — readiness % + blocker count for the Phase 3 tree footer.
 *
 * Backed by GET /api/authoring-actions/module-readiness/:projectId/:moduleCode
 * (mounted in server/bootstrap/register-inline-routes.ts). With moduleCode='all'
 * the assessment service returns the project's overall score plus the full
 * blocker list across all modules.
 *
 * The bundle's tree footer shows three values:
 *   - Submission readiness  → overallScore (0-100)
 *   - Sections blocking      → blockers.length
 *   - Last RIM sync          → relative time of the latest signal write
 *
 * The endpoint returns `overallScore`, `overallStatus`, `blockers[]`, and
 * `assessedAt` (when available). When the project has no assessment data
 * (new projects, demo data) the hook returns null fields so the component
 * falls through to the bundle's deterministic "87% / 3 / 4 min ago".
 */
import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/queryClient';

interface ReadinessResponse {
  status?: string;
  overallScore?: number | null;
  overallStatus?: string;
  blockers?: Array<{
    type?: string;
    severity?: string;
    message?: string;
    source?: string;
  }>;
  assessedAt?: string | null;
}

export interface UseEctdReadinessOptions {
  projectId?: string | number | null;
  enabled?: boolean;
}

export interface UseEctdReadinessReturn {
  readinessPct: number | null;
  blockingCount: number | null;
  lastRimSync: string | null;
  isLoading: boolean;
}

function relTime(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) return 'just now';
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return null;
  }
}

export function useEctdReadiness({
  projectId,
  enabled = true,
}: UseEctdReadinessOptions): UseEctdReadinessReturn {
  const scope = projectId ? String(projectId) : null;

  const query = useQuery<ReadinessResponse>({
    queryKey: ['ectd-readiness', scope],
    enabled: enabled && !!scope,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/authoring-actions/module-readiness/${scope}/all`,
      );
      if (!res.ok) return {};
      return (await res.json()) as ReadinessResponse;
    },
  });

  const data = query.data;
  const score = typeof data?.overallScore === 'number' ? data.overallScore : null;
  return {
    readinessPct: score,
    blockingCount: Array.isArray(data?.blockers) ? data!.blockers!.length : null,
    lastRimSync: relTime(data?.assessedAt),
    isLoading: query.isLoading,
  };
}
