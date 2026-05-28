/**
 * useProjectMemory — loads and persists project memory state.
 *
 * GET  /api/concept2cure/projects/:projectId/knowledge → memoryEnabled, summary
 * PATCH /api/concept2cure/projects/:projectId/knowledge { memoryEnabled } → persists toggle
 */
import { useCallback, useEffect, useState } from 'react';
import { getAuthHeaders } from '@/utils/authToken';

interface KnowledgeResponse {
  memoryEnabled?: boolean;
  customInstructions?: string;
  context?: string;
}

interface UseProjectMemoryReturn {
  memoryEnabled: boolean;
  loading: boolean;
  toggling: boolean;
  toggleMemory: () => Promise<void>;
}

async function fetchKnowledge(projectId: string): Promise<KnowledgeResponse> {
  const id = projectId.startsWith('proj_') ? projectId.slice(5) : projectId;
  const res = await fetch(`/api/concept2cure/projects/${encodeURIComponent(id)}/knowledge`, {
    credentials: 'include',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json?.data ?? json) as KnowledgeResponse;
}

async function patchKnowledge(projectId: string, memoryEnabled: boolean): Promise<void> {
  const id = projectId.startsWith('proj_') ? projectId.slice(5) : projectId;
  const res = await fetch(`/api/concept2cure/projects/${encodeURIComponent(id)}/knowledge`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ memoryEnabled }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function useProjectMemory(projectId: string): UseProjectMemoryReturn {
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchKnowledge(projectId)
      .then(k => { if (!cancelled) setMemoryEnabled(k.memoryEnabled ?? false); })
      .catch(() => { /* default to false */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const toggleMemory = useCallback(async () => {
    const next = !memoryEnabled;
    setMemoryEnabled(next);
    setToggling(true);
    try {
      await patchKnowledge(projectId, next);
    } catch {
      setMemoryEnabled(!next);
    } finally {
      setToggling(false);
    }
  }, [projectId, memoryEnabled]);

  return { memoryEnabled, loading, toggling, toggleMemory };
}
