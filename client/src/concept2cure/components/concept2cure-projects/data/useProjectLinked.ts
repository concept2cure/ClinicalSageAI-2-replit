// useProjectLinked — linked project relationships for the Linked tab.
import { useEffect, useState, useCallback } from 'react';
import { getAuthHeaders } from '@/utils/authToken';

export interface ProjectLink {
  id: number;
  kind: string;
  dir: 'out' | 'in';
  name: string;
  type: string;
  status: string;
  via: string;
}

interface ApiResponse {
  success?: boolean;
  data?: ProjectLink[];
}

export function useProjectLinked(projectId: string): {
  links: ProjectLink[];
  loading: boolean;
  refetch: () => void;
} {
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!projectId) {
      setLinks([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(
          `/api/concept2cure/projects/${projectId}/linked`,
          {
            headers: getAuthHeaders(),
            credentials: 'include',
          }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ApiResponse | ProjectLink[];
        const raw = Array.isArray(body)
          ? (body as ProjectLink[])
          : Array.isArray((body as ApiResponse).data)
            ? ((body as ApiResponse).data as ProjectLink[])
            : [];
        if (!cancelled) setLinks(raw);
      } catch {
        // falls back to empty on any error (table not yet created, network, etc.)
        if (!cancelled) setLinks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, tick]);

  return { links, loading, refetch };
}
