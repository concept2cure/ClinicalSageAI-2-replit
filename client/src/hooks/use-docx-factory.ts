/**
 * DOCX Factory React Query Hooks
 *
 * Provides typed hooks for the DOCX Factory BFF proxy:
 *   - Templates: list, create
 *   - Template Versions: create
 *   - Renders: list, create, execute
 *   - Artifacts: download
 *
 * All requests go through /api/docx-factory/* which injects the admin token
 * server-side.  program_id is required for every operation.
 *
 * @phase 6.4.A — DOCX Factory UI
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// =============================================================================
// Types
// =============================================================================

export interface DocxTemplate {
  id: string;
  program_id: string;
  name: string;
  doc_type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateVersion {
  id: string;
  template_id: string;
  version: number;
  storage_key: string;
  sha256: string;
  created_at: string;
}

export interface DocxRender {
  id: string;
  program_id: string;
  template_version_id: string;
  inputs_json: Record<string, unknown>;
  status: 'queued' | 'running' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  created_at: string;
}

export interface DocxArtifact {
  id: string;
  render_id: string;
  file_type: string;
  storage_key: string;
  sha256: string;
  size_bytes: number;
  created_at: string;
}

export interface RenderEvent {
  id: string;
  render_id: string;
  event_type: string;
  payload_json: Record<string, unknown>;
  created_at: string;
}

/** Result from downloadArtifact — includes blob + server SHA for verification */
export interface DownloadResult {
  blob: Blob;
  filename: string;
  serverSha256: string | null;
}

/** Result from POST /seed — counts of created/skipped resources */
export interface SeedResult {
  templates_created: number;
  templates_skipped: number;
  versions_created: number;
  versions_skipped: number;
  demo_packs_count: number;
  templates: DocxTemplate[];
}

/** A single demo input pack returned by GET /demo-packs */
export interface DemoPack {
  file: string;
  label: string;
  description: string;
  inputs: Record<string, unknown>;
}

export interface CatalogTemplateItem {
  name: string;
  doc_type: string;
  doc_family: string;
  tags: string[];
  demo_inputs: string[];
}

interface ListResponse<T> {
  items: T[];
  total: number;
}

// =============================================================================
// Base URL
// =============================================================================

const BASE = '/api/docx-factory';

// =============================================================================
// Fetch helper — uses credentials (JWT cookie) + org header
// =============================================================================

async function docxFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const orgId = localStorage.getItem('organizationId') || '1';
  const headers: Record<string, string> = {
    'x-organization-id': orgId,
    ...((options.headers as Record<string, string>) || {}),
  };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.text();
    let detail: string;
    try {
      detail = JSON.parse(body).detail || JSON.parse(body).error || body;
    } catch {
      detail = body;
    }
    throw new Error(`${res.status}: ${detail}`);
  }

  // Handle 204 No Content
  if (res.status === 204) return {} as T;

  return res.json();
}

// =============================================================================
// Query Keys
// =============================================================================

export const docxKeys = {
  templates: (programId: string) => ['docx-factory', 'templates', programId] as const,
  templateVersions: (templateId: string) =>
    ['docx-factory', 'template-versions', templateId] as const,
  renders: (programId: string) => ['docx-factory', 'renders', programId] as const,
  render: (programId: string, renderId: string) =>
    ['docx-factory', 'render', programId, renderId] as const,
  renderEvents: (programId: string, renderId: string) =>
    ['docx-factory', 'render-events', programId, renderId] as const,
  demoPacks: (docType: string, docFamily: string) =>
    ['docx-factory', 'demo-packs', docType, docFamily] as const,
  catalogFamilies: () => ['docx-factory', 'catalog', 'families'] as const,
  catalogDocTypes: (docFamily: string) =>
    ['docx-factory', 'catalog', 'doc-types', docFamily] as const,
  catalogTemplates: (docFamily: string, docType: string) =>
    ['docx-factory', 'catalog', 'templates', docFamily, docType] as const,
};

// =============================================================================
// Templates
// =============================================================================

export function useTemplates(programId: string) {
  return useQuery<ListResponse<DocxTemplate>>({
    queryKey: docxKeys.templates(programId),
    queryFn: () => docxFetch(`/templates?program_id=${programId}`),
    enabled: !!programId,
    staleTime: 30_000,
  });
}

export function useCreateTemplate(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string; doc_type?: string }) =>
      docxFetch<DocxTemplate>('/templates', {
        method: 'POST',
        body: JSON.stringify({ program_id: programId, ...params }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: docxKeys.templates(programId) });
    },
  });
}

// =============================================================================
// Template Versions
// =============================================================================

export function useTemplateVersions(templateId: string, programId: string) {
  return useQuery<TemplateVersion[]>({
    queryKey: docxKeys.templateVersions(templateId),
    queryFn: async () => {
      // Versions are returned as a list response from the BFF.
      const res = await docxFetch<ListResponse<TemplateVersion>>(
        `/templates/${templateId}/versions?program_id=${programId}`
      );
      return Array.isArray(res) ? res : (res as any).items || [];
    },
    enabled: !!templateId && !!programId,
    staleTime: 30_000,
  });
}

export function useCreateTemplateVersion(templateId: string, programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { storage_key: string; sha256: string }) =>
      docxFetch<TemplateVersion>(`/templates/${templateId}/versions?program_id=${programId}`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: docxKeys.templateVersions(templateId) });
    },
  });
}

// =============================================================================
// Renders
// =============================================================================

export function useRenders(programId: string) {
  return useQuery<ListResponse<DocxRender>>({
    queryKey: docxKeys.renders(programId),
    queryFn: () => docxFetch(`/renders?program_id=${programId}`),
    enabled: !!programId,
    staleTime: 10_000,
    refetchInterval: query => {
      // Stop polling once all renders are in terminal state
      const data = query.state.data as ListResponse<DocxRender> | undefined;
      if (!data?.items?.length) return 15_000;
      const hasPending = data.items.some(r => r.status === 'queued' || r.status === 'running');
      return hasPending ? 10_000 : false;
    },
  });
}

export function useCreateRender(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { template_version_id: string; inputs_json?: Record<string, unknown> }) =>
      docxFetch<DocxRender>('/renders', {
        method: 'POST',
        body: JSON.stringify({ program_id: programId, ...params }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: docxKeys.renders(programId) });
    },
  });
}

export function useExecuteRender(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (renderId: string) =>
      docxFetch<DocxArtifact>(`/renders/${renderId}/execute?program_id=${programId}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: docxKeys.renders(programId) });
    },
  });
}

// =============================================================================
// Render Events
// =============================================================================

export function useRenderEvents(programId: string, renderId: string) {
  return useQuery<RenderEvent[]>({
    queryKey: docxKeys.renderEvents(programId, renderId),
    queryFn: () => docxFetch<RenderEvent[]>(`/renders/${renderId}/events?program_id=${programId}`),
    enabled: !!programId && !!renderId,
    staleTime: 30_000,
  });
}

// =============================================================================
// Seed Templates
// =============================================================================

export function useSeedTemplates(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filters?: { doc_family?: string; doc_type?: string }) => {
      const params = new URLSearchParams({ program_id: programId });
      if (filters?.doc_family) {
        params.set('doc_family', filters.doc_family);
      }
      if (filters?.doc_type) {
        params.set('doc_type', filters.doc_type);
      }
      return docxFetch<SeedResult>(`/seed?${params.toString()}`, { method: 'POST' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: docxKeys.templates(programId) });
    },
  });
}

// =============================================================================
// Demo Packs
// =============================================================================

export function useDemoPacks(options: { docType?: string; docFamily?: string }) {
  const docType = options.docType || '';
  const docFamily = options.docFamily || '';

  return useQuery<DemoPack[]>({
    queryKey: docxKeys.demoPacks(docType, docFamily),
    queryFn: () => {
      const params = new URLSearchParams();
      if (docType) {
        params.set('doc_type', docType);
      }
      if (docFamily) {
        params.set('doc_family', docFamily);
      }
      return docxFetch<DemoPack[]>(`/demo-packs?${params.toString()}`);
    },
    enabled: !!docType || !!docFamily,
    staleTime: 60_000,
  });
}

// =============================================================================
// Catalog Discovery
// =============================================================================

export function useCatalogFamilies() {
  return useQuery<string[]>({
    queryKey: docxKeys.catalogFamilies(),
    queryFn: async () => {
      const res = await docxFetch<ListResponse<string>>('/catalog/families');
      return Array.isArray(res) ? (res as unknown as string[]) : res.items || [];
    },
    staleTime: 60_000,
  });
}

export function useCatalogDocTypes(docFamily?: string) {
  const familyKey = docFamily || '';
  return useQuery<string[]>({
    queryKey: docxKeys.catalogDocTypes(familyKey),
    queryFn: async () => {
      const suffix = docFamily ? `?doc_family=${encodeURIComponent(docFamily)}` : '';
      const res = await docxFetch<ListResponse<string>>(`/catalog/doc-types${suffix}`);
      return Array.isArray(res) ? (res as unknown as string[]) : res.items || [];
    },
    staleTime: 60_000,
  });
}

export function useCatalogTemplates(options: { docFamily?: string; docType?: string }) {
  const docFamily = options.docFamily || '';
  const docType = options.docType || '';

  return useQuery<ListResponse<CatalogTemplateItem>>({
    queryKey: docxKeys.catalogTemplates(docFamily, docType),
    queryFn: () => {
      const params = new URLSearchParams();
      if (docFamily) {
        params.set('doc_family', docFamily);
      }
      if (docType) {
        params.set('doc_type', docType);
      }
      const suffix = params.toString();
      return docxFetch<ListResponse<CatalogTemplateItem>>(
        `/catalog/templates${suffix ? `?${suffix}` : ''}`
      );
    },
    staleTime: 60_000,
  });
}

// =============================================================================
// Artifact Download
// =============================================================================

export async function downloadArtifact(
  artifactId: string,
  programId: string
): Promise<DownloadResult> {
  const orgId = localStorage.getItem('organizationId') || '1';

  const res = await fetch(`${BASE}/artifacts/${artifactId}/download?program_id=${programId}`, {
    headers: { 'x-organization-id': orgId },
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Download failed: ${res.status} — ${body}`);
  }

  const serverSha256 = res.headers.get('x-artifact-sha256');
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || `artifact-${artifactId}.docx`;

  // Trigger browser download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { blob, filename, serverSha256 };
}

// =============================================================================
// Browser-side SHA-256 compute
// =============================================================================

/**
 * Compute SHA-256 of a Blob in the browser using SubtleCrypto.
 * Returns a lowercase hex string, or null if SubtleCrypto is unavailable
 * (e.g. locked-down corporate browsers, non-HTTPS contexts).
 */
export async function computeSHA256(blob: Blob): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return null;
  }
  // Use Response.arrayBuffer() for broader jsdom/browser compat
  const buffer = await new Response(blob).arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
