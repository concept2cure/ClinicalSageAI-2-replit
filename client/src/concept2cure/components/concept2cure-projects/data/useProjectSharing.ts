/**
 * useProjectSharing — fetches project members and provides invite/remove/role-change.
 *
 * Combines:
 *   GET /api/concept2cure/projects/:id/sharing  → who has access and what role
 *   GET /api/concept2cure/projects/:id/team     → org users with name + email
 *
 * Mutations:
 *   PUT    /api/concept2cure/projects/:id/sharing/members/:userId { role }
 *   DELETE /api/concept2cure/projects/:id/sharing/members/:userId
 */
import { useCallback, useEffect, useState } from 'react';
import { getAuthHeaders } from '@/utils/authToken';

export interface ProjectMember {
  userId: number;
  name: string;
  email: string;
  role: 'use' | 'edit';
  status: string;
}

export interface TeamUser {
  userId: number;
  name: string;
  email: string;
  role: string;
}

interface UseProjectSharingReturn {
  members: ProjectMember[];
  teamUsers: TeamUser[];
  loading: boolean;
  invite: (email: string, role: 'use' | 'edit') => Promise<void>;
  remove: (userId: number) => Promise<void>;
  changeRole: (userId: number, role: 'use' | 'edit') => Promise<void>;
  refetch: () => void;
}

function stripId(projectId: string): string {
  return projectId.startsWith('proj_') ? projectId.slice(5) : projectId;
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  return (json?.data ?? json) as T;
}

export function useProjectSharing(projectId: string): UseProjectSharingReturn {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    const id = stripId(projectId);
    if (!id || isNaN(Number(id))) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    Promise.all([
      apiFetch<{ members?: Array<{ userId: number; role: string; status: string }> }>(
        `/api/concept2cure/projects/${encodeURIComponent(id)}/sharing`
      ).catch(() => ({ members: [] as Array<{ userId: number; role: string; status: string }> })),
      apiFetch<Array<{ userId: number; name: string; email: string; role: string }>>(
        `/api/concept2cure/projects/${encodeURIComponent(id)}/team`
      ).catch(() => [] as Array<{ userId: number; name: string; email: string; role: string }>),
    ]).then(([sharing, team]) => {
      if (cancelled) return;
      const byUserId = new Map(team.map(u => [u.userId, u]));
      setTeamUsers(team);
      const active = (sharing.members ?? []).filter(m => m.status !== 'revoked');
      setMembers(
        active.map(m => {
          const u = byUserId.get(m.userId);
          return {
            userId: m.userId,
            name: u?.name ?? String(m.userId),
            email: u?.email ?? '',
            role: (m.role === 'edit' ? 'edit' : 'use') as 'use' | 'edit',
            status: m.status,
          };
        })
      );
    }).finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [projectId, tick]);

  const invite = useCallback(
    async (email: string, role: 'use' | 'edit') => {
      const id = stripId(projectId);
      const user = teamUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (!user) throw new Error(`${email} is not a member of this organisation.`);
      await apiFetch(
        `/api/concept2cure/projects/${encodeURIComponent(id)}/sharing/members/${user.userId}`,
        { method: 'PUT', body: JSON.stringify({ role }) }
      );
      refetch();
    },
    [projectId, teamUsers, refetch]
  );

  const remove = useCallback(
    async (userId: number) => {
      const id = stripId(projectId);
      await apiFetch(
        `/api/concept2cure/projects/${encodeURIComponent(id)}/sharing/members/${userId}`,
        { method: 'DELETE' }
      );
      refetch();
    },
    [projectId, refetch]
  );

  const changeRole = useCallback(
    async (userId: number, role: 'use' | 'edit') => {
      const id = stripId(projectId);
      await apiFetch(
        `/api/concept2cure/projects/${encodeURIComponent(id)}/sharing/members/${userId}`,
        { method: 'PUT', body: JSON.stringify({ role }) }
      );
      refetch();
    },
    [projectId, refetch]
  );

  return { members, teamUsers, loading, invite, remove, changeRole, refetch };
}
