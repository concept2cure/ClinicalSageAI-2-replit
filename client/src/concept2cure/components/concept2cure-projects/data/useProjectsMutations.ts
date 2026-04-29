/**
 * useProjectsMutations — Phase 3 CRUD against /api/concept2cure/projects.
 *
 * Wires the prototype's stub handlers to the existing v2 endpoints:
 *   - POST   /api/concept2cure/projects        (server: concept2cure.ts L2020)
 *   - PUT    /api/concept2cure/projects/:id    (server: concept2cure.ts L2358)
 *   - DELETE /api/concept2cure/projects/:id    (server: concept2cure.ts L3091)
 *
 * The hook returns thin async functions — components own their own
 * loading/error state. Successful mutations call the supplied
 * `onSuccess` callback so the host can refetch the list (we don't ship
 * react-query here yet to keep the dependency footprint small;
 * useProjectsApi exposes a `refetch` for the same purpose).
 */
import { useCallback } from 'react';
import { getAuthHeaders } from '@/utils/authToken';
import type { NpdType } from './regions';
import type { Project } from '../types';

interface CreateInput {
  name: string;
  description?: string;
  product?: string;
  sponsor?: string;
  region?: string;
  agency?: string;
  targetAgency?: string;
  type: NpdType;
}

interface UpdateInput {
  id: string; // 'proj_<n>' (the API expects the numeric id; we strip the prefix)
  name?: string;
  description?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

function stripProjectId(id: string): string {
  // API ids look like "proj_42"; the PUT/DELETE routes accept the numeric
  // tail. Seed-fallback ids ("c2c-ana", "pr-xxxx") are not real on the
  // backend — those calls will 404 and the caller falls back to mock.
  return id.startsWith('proj_') ? id.slice(5) : id;
}

interface ApiInit {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function apiFetch<T>(path: string, init: ApiInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
  };
  const res = await fetch(path, {
    method: init.method || 'GET',
    headers,
    credentials: 'include',
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export interface UseProjectsMutations {
  createProject: (input: CreateInput) => Promise<{ id: string } & Partial<Project>>;
  updateProject: (input: UpdateInput) => Promise<Partial<Project>>;
  archiveProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

export function useProjectsMutations(opts: { onSuccess?: () => void } = {}): UseProjectsMutations {
  const { onSuccess } = opts;

  const createProject = useCallback(
    async (input: CreateInput) => {
      const body = {
        name: input.name,
        description: input.description ?? null,
        submissionType: input.type.applicationType,
        registryId: input.type.id,
        applicationFamily: input.type.family,
        applicationType: input.type.applicationType,
        agency: input.agency ?? null,
        targetAgency: input.targetAgency ?? input.agency ?? null,
        dossierStandard: input.type.dossierStandard,
        lifecycleStage: input.type.stage,
        product: input.product ?? null,
        sponsor: input.sponsor ?? null,
        region: input.region ?? null,
      };
      const result = await apiFetch<{ data?: { id: string } & Partial<Project> }>(
        '/api/concept2cure/projects',
        { method: 'POST', body },
      );
      onSuccess?.();
      return (result?.data ?? (result as unknown as { id: string } & Partial<Project>));
    },
    [onSuccess],
  );

  const updateProject = useCallback(
    async (input: UpdateInput) => {
      const id = stripProjectId(input.id);
      const body: Record<string, unknown> = {};
      if (input.name !== undefined) body.name = input.name;
      if (input.description !== undefined) body.description = input.description;
      if (input.status !== undefined) body.status = input.status;
      if (input.metadata !== undefined) body.metadata = input.metadata;
      const result = await apiFetch<{ data?: Partial<Project> }>(
        `/api/concept2cure/projects/${encodeURIComponent(id)}`,
        { method: 'PUT', body },
      );
      onSuccess?.();
      return (result?.data ?? {}) as Partial<Project>;
    },
    [onSuccess],
  );

  const archiveProject = useCallback(
    async (id: string) => {
      // Per HANDOFF audit item 10, archive is a soft-delete that sets
      // status:'archived'. Reuse the update endpoint until a dedicated
      // archive route ships.
      const numericId = stripProjectId(id);
      await apiFetch<unknown>(
        `/api/concept2cure/projects/${encodeURIComponent(numericId)}`,
        { method: 'PUT', body: { status: 'archived' } },
      );
      onSuccess?.();
    },
    [onSuccess],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      const numericId = stripProjectId(id);
      await apiFetch<unknown>(
        `/api/concept2cure/projects/${encodeURIComponent(numericId)}`,
        { method: 'DELETE' },
      );
      onSuccess?.();
    },
    [onSuccess],
  );

  return { createProject, updateProject, archiveProject, deleteProject };
}
