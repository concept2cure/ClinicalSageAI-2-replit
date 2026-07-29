/**
 * useAdmin — live data adapter for the Admin and access surface.
 *
 * Calls `GET /api/mdx/admin` (cross-program). Endpoint not yet
 * implemented; surface stays in `defaultMode: 'fixture'` until
 * 2026-09-01 per the dataMode registry.
 */

import { useFetchJson } from './useFetchJson';
import {
  ADM_API_KEYS,
  ADM_AUDIT,
  ADM_GRANTS,
  ADM_KPIS,
  ADM_MEMBERS,
  ADM_ROLES,
  ADM_SETTINGS,
  ADM_SSO,
} from '../data/admin';

type KpiRow = (typeof ADM_KPIS)[number];
type MemberRow = (typeof ADM_MEMBERS)[number];
type RoleRow = (typeof ADM_ROLES)[number];
type GrantRow = (typeof ADM_GRANTS)[number];
type ApiKeyRow = (typeof ADM_API_KEYS)[number];
type AuditRow = (typeof ADM_AUDIT)[number];
type SettingRow = (typeof ADM_SETTINGS)[number];
type SsoConfig = typeof ADM_SSO;

interface AdminPayload {
  data: {
    kpis: KpiRow[];
    members: MemberRow[];
    roles: RoleRow[];
    grants: GrantRow[];
    apiKeys: ApiKeyRow[];
    audit: AuditRow[];
    settings: SettingRow[];
    sso: SsoConfig;
  };
}

export interface UseAdminResult {
  kpis: KpiRow[] | null;
  members: MemberRow[] | null;
  roles: RoleRow[] | null;
  grants: GrantRow[] | null;
  apiKeys: ApiKeyRow[] | null;
  audit: AuditRow[] | null;
  settings: SettingRow[] | null;
  sso: SsoConfig | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAdmin(): UseAdminResult {
  const { data, loading, error, refresh } = useFetchJson<AdminPayload>('/api/mdx/admin');
  return {
    kpis: data?.data.kpis ?? null,
    members: data?.data.members ?? null,
    roles: data?.data.roles ?? null,
    grants: data?.data.grants ?? null,
    apiKeys: data?.data.apiKeys ?? null,
    audit: data?.data.audit ?? null,
    settings: data?.data.settings ?? null,
    sso: data?.data.sso ?? null,
    loading,
    error,
    refresh,
  };
}
