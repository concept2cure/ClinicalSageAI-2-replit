/**
 * useHomeBriefing — pulls real RIM next-actions for the home AnaCard.
 *
 * The bundle's AnaCard renders a static "morning briefing" pulled from
 * BRIEFING_BY_SCOPE in data.tsx. In production we want it situationally
 * aware: surface the highest-priority next-actions across the user's
 * recent projects so the greeting card actually reflects what needs to
 * happen today.
 *
 * Fetch chain:
 *   1. GET /api/concept2cure/projects             → list of projects
 *   2. For each project (cap at 3 most-recent),
 *      GET /api/intelligence/projects/:projectId/next-actions?limit=3
 *      → list of { id, title, priority, reason } recommendations
 *   3. Flatten + sort by priority, take top 5
 *
 * Returns null items when the chain fails or returns nothing — caller
 * falls back to BRIEFING_BY_SCOPE so the bundle visual stays intact.
 *
 * Backed by TanStack Query for cache + refetch consistency with
 * useEctdAuthoringData / useEctdReadiness / useRecents.
 *
 * @module client/src/concept2cure/components/concept2cure-home/useHomeBriefing
 */

import { useQuery } from '@tanstack/react-query';

import { getAuthHeaders } from '@/utils/authToken';

import type { BriefingItem } from './data';

interface NextActionRow {
  id?: string;
  title?: string;
  priority?: string;
  reason?: string;
  category?: string;
  severity?: string;
  module?: string;
  meta?: string;
  description?: string;
}

interface NextActionsResponse {
  data?: { actions?: NextActionRow[] } | NextActionRow[];
  actions?: NextActionRow[];
}

interface ProjectRow {
  id?: string | number;
  name?: string;
  title?: string;
  updatedAt?: string;
  updated_at?: string;
}

interface ProjectsResponse {
  data?: ProjectRow[] | { data?: ProjectRow[] };
}

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

async function jsonFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function extractActions(body: NextActionsResponse | null): NextActionRow[] {
  if (!body) return [];
  if (Array.isArray((body as any).actions)) return (body as any).actions;
  const data = (body as any).data;
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.actions)) return data.actions;
  return [];
}

function extractProjects(body: ProjectsResponse | null): ProjectRow[] {
  if (!body) return [];
  if (Array.isArray((body as any).data)) return (body as any).data;
  const inner = (body as any).data;
  if (inner && Array.isArray(inner.data)) return inner.data;
  if (Array.isArray(body)) return body as ProjectRow[];
  return [];
}

function projectUpdatedAt(p: ProjectRow): number {
  const raw = p.updatedAt || p.updated_at;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return isFinite(t) ? t : 0;
}

export interface UseHomeBriefingOptions {
  /** Max number of briefing items to surface. Defaults to 5. */
  limit?: number;
  /** Cap projects fanned-out to. Defaults to 3 most-recently-updated. */
  projectFanout?: number;
}

export interface UseHomeBriefingReturn {
  items: BriefingItem[] | null;
  loading: boolean;
}

export function useHomeBriefing(options: UseHomeBriefingOptions = {}): UseHomeBriefingReturn {
  const { limit = 5, projectFanout = 3 } = options;

  const query = useQuery<BriefingItem[]>({
    queryKey: ['home-briefing', limit, projectFanout],
    staleTime: 60_000,
    queryFn: async () => {
      const projectsBody = await jsonFetch<ProjectsResponse>('/api/concept2cure/projects');
      const projects = extractProjects(projectsBody);
      if (projects.length === 0) return [];

      const ranked = [...projects]
        .sort((a, b) => projectUpdatedAt(b) - projectUpdatedAt(a))
        .slice(0, projectFanout);

      const actionResults = await Promise.allSettled(
        ranked.map(p =>
          jsonFetch<NextActionsResponse>(
            `/api/intelligence/projects/${p.id}/next-actions?limit=3`,
          ).then(body => ({ project: p, actions: extractActions(body) })),
        ),
      );

      type Ranked = BriefingItem & { __rank: number };
      const merged: Ranked[] = [];
      for (const r of actionResults) {
        if (r.status !== 'fulfilled') continue;
        const projectName = r.value.project.name || r.value.project.title || 'Project';
        for (const a of r.value.actions) {
          const title = a.title || a.description;
          if (!title) continue;
          const priority = (a.priority || a.severity || 'medium').toLowerCase();
          const meta =
            a.meta ||
            [projectName, a.module, a.category]
              .filter(Boolean)
              .join(' · ');
          merged.push({
            num: '00',
            t: title,
            meta: meta || projectName,
            __rank: PRIORITY_RANK[priority] ?? PRIORITY_RANK.medium,
          });
        }
      }

      merged.sort((a, b) => a.__rank - b.__rank);

      return merged.slice(0, limit).map((item, i) => ({
        num: String(i + 1).padStart(2, '0'),
        t: item.t,
        meta: item.meta,
      }));
    },
  });

  return {
    items: query.data && query.data.length > 0 ? query.data : null,
    loading: query.isLoading,
  };
}
