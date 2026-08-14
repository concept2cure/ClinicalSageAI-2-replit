/**
 * useVault — live data adapter for the Document vault surface.
 *
 * Calls `GET /api/mdx/vault` (server/routes/mdx-vault.ts, backed by
 * concept2cure_artifacts) and maps artifact rows into the kit's
 * VaultFile shape from data/vault.ts. When the endpoint errors or
 * returns no rows the surface falls back to fixture data — same
 * fixture-fallback pattern as the other MDX surfaces.
 *
 * `useVaultVersions` backs the detail drawer's version history via
 * `GET /api/mdx/vault/:artifactId/versions` (c2c_artifact_versions);
 * the server returns an empty list when the version table is absent,
 * so the drawer falls back to the fixture history in that case.
 */

import { useMemo } from 'react';
import { useFetchJson } from './useFetchJson';
import type {
  VaultFile,
  VaultFileStatus,
  VaultFolder,
  VaultKpi,
  VaultVersion,
} from '../data/vault';

/* Row shape returned by GET /api/mdx/vault (see mdx-vault.ts list map). */
export interface VaultApiArtifact {
  id: number;
  artifactId: string;
  title: string;
  type: string;
  category: string | null;
  family: string;
  ctdSection: string | null;
  status: string;
  version: number;
  contentHash: string | null;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
  lockedAt: string | null;
  eSig: boolean;
}

interface VaultListPayload {
  data: VaultApiArtifact[] | null;
  meta?: { count?: number };
}

/* Row shape returned by GET /api/mdx/vault/:artifactId/versions. */
export interface VaultApiVersion {
  id: number;
  version_number: number;
  change_summary: string | null;
  content_hash: string | null;
  created_at: string;
  created_by_id: number | null;
}

interface VaultVersionsPayload {
  data: VaultApiVersion[] | null;
  meta?: { count?: number };
}

/** Live program ids are uuids; the surface's fixture ids ('or801' …) are not,
 *  and the list route's zod schema rejects a non-uuid program_id outright. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toStatus(status: string, lockedAt: string | null): VaultFileStatus {
  if (lockedAt || status === 'locked') return 'locked';
  if (status === 'approved') return 'final';
  if (status === 'review') return 'review';
  return 'draft';
}

function toWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/** Stable folder id from the server's family bucket ('Module 2' → 'module-2').
 *  Empty when the row has no family. `family` is declared `string`, but the
 *  artifact column is nullable and a row that arrives without it took the whole
 *  vault down here on a response whose envelope was perfectly well-formed — the
 *  shape guards upstream see a list of objects and let it through. An artifact
 *  with no family belongs to no folder; it is not a crash. */
function familyId(family: string | null | undefined): string {
  return (family ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Map API artifact rows into the kit VaultFile view shape. Null-safe on
 * every level of the envelope (`{ data: null }`, `{}`, undefined) — the
 * surface treats null as "no live data, use fixtures".
 */
export function selectVaultFiles(
  payload: VaultListPayload | null | undefined,
): VaultFile[] | null {
  const rows = payload?.data;
  if (!Array.isArray(rows)) return null;
  return rows.map((r, i) => ({
    // `String(r.id)` on an absent id yields the literal string "undefined", so
    // every identity-less row collides on one key — React then drops or
    // duplicates rendered rows, and in a document vault a silently missing row
    // is the worst outcome available. A per-row synthetic id keeps every row
    // visible and distinct; it is not persisted anywhere.
    id: r.artifactId || (r.id != null ? String(r.id) : `unidentified-${i}`),
    name: r.title,
    kind: r.category || r.type,
    type: (r.type || '').toLowerCase(),
    size: '—',
    prog: r.ctdSection ? `CTD ${r.ctdSection}` : r.family,
    folder: familyId(r.family),
    // "vundefined" is a version label that asserts a version the row does not
    // have. '—' is this file's existing idiom for a value it cannot supply
    // (see `size` above, and `note` in selectVaultVersions).
    ver: r.version != null ? `v${r.version}` : '—',
    versions: r.version,
    status: toStatus(r.status, r.lockedAt),
    updated: toWhen(r.updatedAt),
    author: r.createdById != null ? `User #${r.createdById}` : 'system',
    linked: 0,
    esig: Boolean(r.eSig),
    hash: r.contentHash ?? '—',
  }));
}

/** Derive the folder rail from live rows — one folder per family bucket.
 *  Labels are the de-slugged family in sentence case ('module-2' →
 *  'Module 2', 'working-files' → 'Working files'). */
export function deriveVaultFolders(files: VaultFile[]): VaultFolder[] {
  const buckets = new Map<string, number>();
  /* Files whose family was absent carry no folder id; they stay in the root
     bucket rather than collecting under an unnamed folder in the rail. */
  for (const f of files) if (f.folder) buckets.set(f.folder, (buckets.get(f.folder) ?? 0) + 1);
  const folders: VaultFolder[] = [
    { id: 'root', label: 'All artifacts', count: files.length, parent: null, active: true },
  ];
  for (const [id, count] of buckets) {
    const words = id.replace(/-/g, ' ');
    folders.push({
      id,
      label: words.charAt(0).toUpperCase() + words.slice(1),
      count,
      parent: 'root',
    });
  }
  return folders;
}

/** Live KPI strip — honest counts from the mapped rows. */
export function deriveVaultKpis(files: VaultFile[]): VaultKpi[] {
  const locked = files.filter((f) => f.status === 'locked' || f.status === 'final');
  const review = files.filter((f) => f.status === 'review');
  const signed = files.filter((f) => f.esig);
  return [
    { label: 'Artifacts in vault', metric: String(files.length), meta: `${signed.length} e-signed` },
    { label: 'Locked + final', metric: String(locked.length), meta: 'Content hash sealed', tone: 'ok' },
    { label: 'In review', metric: String(review.length), meta: 'Awaiting approval', tone: review.length ? 'warn' : 'ok' },
    { label: 'Drafts', metric: String(files.length - locked.length - review.length), meta: 'Working copies' },
  ];
}

export function selectVaultVersions(
  payload: VaultVersionsPayload | null | undefined,
): VaultVersion[] | null {
  const rows = payload?.data;
  if (!Array.isArray(rows)) return null;
  return rows.map((r, i) => ({
    v: r.version_number != null ? `v${r.version_number}` : '—',
    when: toWhen(r.created_at),
    author: r.created_by_id != null ? `User #${r.created_by_id}` : 'system',
    note: r.change_summary || (r.content_hash ? `Content hash ${r.content_hash.slice(0, 8)}…` : '—'),
    status: i === 0 ? ('final' as const) : ('superseded' as const),
  }));
}

export interface UseVaultResult {
  files: VaultFile[] | null;
  folders: VaultFolder[] | null;
  kpis: VaultKpi[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * List the org's vault artifacts, scoped to a program when the caller
 * has a live (uuid-keyed) program selected. Fixture program ids
 * ('or801' …) are not uuids — the server would 422 on them — so the
 * program filter only applies to real program ids.
 */
export function useVault(programId: string | null): UseVaultResult {
  /* Program filtering is requested again: the project-to-program bridge
     (`projects.regulatory_program_id`) landed with slice C1 of the Document
     Identity Contract, so the server filters on it instead of refusing. Only
     real uuid program ids are sent — the surface's fixture ids ('or801' …)
     are not uuids and the route's zod schema would 422 the whole request.
     On a database that has not had the anchor migration applied the server
     still answers 422 for a uuid; that surfaces as `error` here, which the
     surface already renders as "no live data" rather than as an empty vault. */
  const url =
    programId && UUID_RE.test(programId)
      ? `/api/mdx/vault?program_id=${encodeURIComponent(programId)}`
      : '/api/mdx/vault';
  const { data, loading, error, refresh } = useFetchJson<VaultListPayload>(url);
  const files = useMemo(() => selectVaultFiles(data), [data]);
  const folders = useMemo(() => (files && files.length ? deriveVaultFolders(files) : null), [files]);
  const kpis = useMemo(() => (files && files.length ? deriveVaultKpis(files) : null), [files]);
  return { files, folders, kpis, loading, error, refresh };
}

export interface UseVaultVersionsResult {
  versions: VaultVersion[] | null;
  loading: boolean;
  error: string | null;
}

/** Version history for the artifact selected in the detail drawer. */
export function useVaultVersions(
  artifactId: string | null,
): UseVaultVersionsResult {
  const url = artifactId
    ? `/api/mdx/vault/${encodeURIComponent(artifactId)}/versions`
    : null;
  const { data, loading, error } = useFetchJson<VaultVersionsPayload>(url);
  const versions = useMemo(() => selectVaultVersions(data), [data]);
  return { versions, loading, error };
}
