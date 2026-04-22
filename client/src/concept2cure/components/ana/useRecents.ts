/**
 * useRecents — fetch the current user's recent chat threads for the Sidebar.
 *
 * Backed by GET /api/chat/threads (optionally scoped to a project via the
 * ?project_id= query). Returns a shape the Sidebar already understands
 * ({ id, label }). TanStack Query keeps the list fresh on project changes.
 *
 * @module client/src/concept2cure/components/ana/useRecents
 */
import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/queryClient';

import type { Recent } from './Sidebar';

interface ThreadRow {
  id: string;
  title?: string | null;
  project_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

interface ThreadsResponse {
  threads?: ThreadRow[];
}

export interface UseRecentsOptions {
  projectId?: string | number | null;
  limit?: number;
}

function labelFor(row: ThreadRow): string {
  if (row.title && row.title.trim().length > 0) return row.title;
  // Fall back to date when the thread has no title yet (first-turn freshly created).
  const stamp = row.updated_at || row.created_at;
  if (stamp) {
    try {
      return `Conversation · ${new Date(stamp).toLocaleDateString()}`;
    } catch {
      /* ignore */
    }
  }
  return 'New conversation';
}

export function useRecents({ projectId, limit = 10 }: UseRecentsOptions): {
  recents: Recent[];
  isLoading: boolean;
} {
  const scoped = projectId ? String(projectId) : null;

  const { data, isLoading } = useQuery<ThreadsResponse>({
    queryKey: ['ana-recents', scoped, limit],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (scoped) qs.set('project_id', scoped);
      qs.set('limit', String(limit));
      const res = await apiRequest('GET', `/api/chat/threads?${qs.toString()}`);
      if (!res.ok) return { threads: [] };
      return (await res.json()) as ThreadsResponse;
    },
    staleTime: 30_000,
  });

  const recents: Recent[] = (data?.threads || []).map(r => ({
    id: r.id,
    label: labelFor(r),
  }));

  return { recents, isLoading };
}
