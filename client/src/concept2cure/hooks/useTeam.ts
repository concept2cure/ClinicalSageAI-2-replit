/**
 * @fileoverview Team members hook
 * @module concept2cure/hooks/useTeam
 *
 * @description
 * React-query read hook for the organisation's team roster. Binds to the live
 * GET /api/collaboration/team route (server/routes/collaboration.ts), mounted at
 * /api/collaboration (server/bootstrap/register-document-routes.ts). The route
 * returns { members: [{ id, name, email, title, department, avatar, presence,
 * lastSeen }] }, org-wide, and fails closed to an empty array when the store is
 * unavailable — no fabricated data. Consumers must treat an empty list as a real
 * "no members" state and offer a graceful fallback.
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/queryClient';

export interface TeamMember {
  /** Numeric users.id FK — the value a task assigneeId expects. */
  id: number;
  name: string;
  email: string | null;
  title: string;
  department: string;
  avatar: string | null;
  presence: 'online' | 'away' | 'offline';
  lastSeen: string | null;
}

export const teamQueryKeys = {
  all: ['team'] as const,
  members: () => [...teamQueryKeys.all, 'members'] as const,
};

async function fetchTeamMembers(): Promise<TeamMember[]> {
  const response = await apiRequest('GET', '/api/collaboration/team');
  const payload = await response.json().catch(() => ({}));
  const members = Array.isArray(payload?.members) ? payload.members : [];
  return members
    .map((m: Record<string, unknown>) => ({
      id: Number(m.id),
      name: typeof m.name === 'string' ? m.name : '',
      email: typeof m.email === 'string' ? m.email : null,
      title: typeof m.title === 'string' ? m.title : '',
      department: typeof m.department === 'string' ? m.department : '',
      avatar: typeof m.avatar === 'string' ? m.avatar : null,
      presence:
        m.presence === 'online' || m.presence === 'away' ? m.presence : 'offline',
      lastSeen: typeof m.lastSeen === 'string' ? m.lastSeen : null,
    }))
    .filter((m: TeamMember) => Number.isFinite(m.id) && m.id > 0);
}

/** Organisation team roster for assignee pickers. */
export function useTeamMembers() {
  return useQuery<TeamMember[]>({
    queryKey: teamQueryKeys.members(),
    queryFn: fetchTeamMembers,
    staleTime: 5 * 60 * 1000,
  });
}
