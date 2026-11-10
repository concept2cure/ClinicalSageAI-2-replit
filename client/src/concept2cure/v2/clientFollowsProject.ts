/**
 * The current client follows the open project.
 *
 * 2026-10-31: opening LMN-201, a project of the "Lumen Bioscience (demo)"
 * client, left the header on the organisation's first client. The screens that
 * name the current client in their request (Team & sharing, recorded context,
 * task assignment — the `x-client-id` claim) were then refused 403 for a
 * project the person owns, because the claimed client is not the project's.
 * A new project already made its client current (Projects.tsx, after intake);
 * every other way into a project did not.
 *
 * When the open project's recorded client differs from the current one, the
 * current client becomes the project's. The project's own record says which
 * client it belongs to; nothing is inferred, and a failed read changes nothing
 * (the project's own screens report their reads).
 */
import { useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useTenant } from '@/contexts/TenantContext';
import { useShellProject } from './shellProject';

interface ProjectClient { id: number; name: string | null }

/** The client a project record names, or null when it names none. The detail
 *  read answers with the record itself; an enveloped `{ data }` is read too. */
export function projectClientOf(body: unknown): ProjectClient | null {
  if (!body || typeof body !== 'object') return null;
  const envelope = body as { data?: unknown };
  const data = (envelope.data && typeof envelope.data === 'object' ? envelope.data : body) as Record<string, unknown>;
  const id = Number(data?.client_workspace_id ?? data?.clientWorkspaceId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const name = typeof data?.client_name === 'string' && data.client_name.trim() ? data.client_name.trim() : null;
  return { id, name };
}

export function useClientFollowsProject(): void {
  const programId = useShellProject()?.id ?? null;
  const { currentOrganization, currentClientWorkspace, setCurrentClientWorkspace } = useTenant();
  const currentId = currentClientWorkspace?.id ?? null;
  const organizationId = currentOrganization?.id ?? currentClientWorkspace?.organizationId ?? null;
  useEffect(() => {
    if (!programId || organizationId == null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiRequest('GET', `/api/c2c/projects/${encodeURIComponent(String(programId))}`);
        if (!res.ok) return;
        const client = projectClientOf(await res.json().catch(() => null));
        if (cancelled || !client || String(client.id) === String(currentId)) return;
        setCurrentClientWorkspace({ id: String(client.id), name: client.name ?? 'Client', organizationId: String(organizationId) });
      } catch {
        // The project's own screens report a failed read; the current client stays as it was.
      }
    })();
    return () => { cancelled = true; };
  }, [programId, currentId, organizationId, setCurrentClientWorkspace]);
}
