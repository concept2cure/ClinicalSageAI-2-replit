/**
 * useVault — live data adapter for the Document vault surface.
 *
 * Calls `GET /api/mdx/vault?folder=&filter=`. Endpoint defaults to
 * 'both' mode in the dataMode registry (expectedLiveBy 2026-08-15) —
 * try live, fall back to fixture so the surface still renders during
 * partial-availability windows.
 */

import { useFetchJson } from './useFetchJson';
import {
  VAULT_FILES,
  VAULT_FOLDERS,
  VAULT_KPIS,
  VAULT_VERSIONS,
} from '../data/vault';

type FolderRow = (typeof VAULT_FOLDERS)[number];
type FileRow = (typeof VAULT_FILES)[number];
type VersionRow = (typeof VAULT_VERSIONS)[number];
type KpiRow = (typeof VAULT_KPIS)[number];

interface VaultPayload {
  data: {
    folders: FolderRow[];
    files: FileRow[];
    versions: VersionRow[];
    kpis: KpiRow[];
  };
}

export interface UseVaultResult {
  folders: FolderRow[] | null;
  files: FileRow[] | null;
  versions: VersionRow[] | null;
  kpis: KpiRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useVault(folder: string = 'root', filter: string = ''): UseVaultResult {
  const url = `/api/mdx/vault?folder=${encodeURIComponent(folder)}${
    filter ? `&filter=${encodeURIComponent(filter)}` : ''
  }`;
  const { data, loading, error, refresh } = useFetchJson<VaultPayload>(url);
  return {
    folders: data?.data.folders ?? null,
    files: data?.data.files ?? null,
    versions: data?.data.versions ?? null,
    kpis: data?.data.kpis ?? null,
    loading,
    error,
    refresh,
  };
}
