/**
 * useIndustryProfile — governed org industry profile (CONTEXT-01).
 *
 * Reads `GET /api/mdx/industry-profile` and writes
 * `PATCH /api/mdx/industry-profile` — the tenant-scoped, audited
 * replacement for the localStorage `c2c_admin_settings` blob the Admin
 * Setup surface used to treat as the org's client type.
 *
 * The GET returns `{ data: <row> }` or `{ data: null }` for an org that
 * has never saved a profile. The hook surfaces that as a DataState:
 *
 *   - `empty` — the server answered and the org has no profile yet
 *     (the honest "unset" state; do not invent a default)
 *   - `error` — the endpoint is unreachable / 404s / 401s, so callers
 *     can keep functioning on local state without pretending it is
 *     governed
 *
 * `save(patch)` PATCHes the profile (primaryIndustry required; other
 * fields optional per the route's partial-update contract), reports an
 * honest idle/saving/saved/error state modeled on useSectionSave, and
 * refreshes the read on success so every consumer sees the new row.
 */

import { useCallback, useRef, useState } from 'react';
import { getAuthToken, getOrgId } from '@/utils/authToken';
import { useFetchJson } from './useFetchJson';
import type { DataState } from '../lib/dataState';
import type { MdxSpecialization, PrimaryIndustry } from '../lib/industryProfileMapping';

/** Row shape returned by the route (drizzle camelCase columns). */
export interface OrgIndustryProfile {
  id: number;
  organizationId: number;
  primaryIndustry: PrimaryIndustry;
  mdxSpecialization: MdxSpecialization | null;
  defaultMarkets: string[];
  defaultPathways: string[];
  defaultApprovalRigor: string | null;
  effectiveAt?: string;
  updatedBy?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/** PATCH body — primaryIndustry is required by the route; the other
 *  fields are partial-update (only keys present in the body are written). */
export interface OrgIndustryProfilePatch {
  primaryIndustry: PrimaryIndustry;
  mdxSpecialization?: MdxSpecialization | null;
  defaultMarkets?: string[];
  defaultPathways?: string[];
  defaultApprovalRigor?: string | null;
}

export type ProfileSaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  /** Server confirmed the write. `at` is the client's receipt time. */
  | { status: 'saved'; at: Date }
  | { status: 'error'; message: string };

interface ProfilePayload {
  data: OrgIndustryProfile | null;
}

export interface UseIndustryProfileResult {
  /** `empty` = org has no saved profile yet (honest unset state). */
  profile: DataState<OrgIndustryProfile>;
  saveState: ProfileSaveState;
  /** PATCH the org profile. Resolves true only on a confirmed write;
   *  refreshes the read on success. */
  save: (patch: OrgIndustryProfilePatch) => Promise<boolean>;
  refresh: () => void;
}

const URL = '/api/mdx/industry-profile';

export function useIndustryProfile(): UseIndustryProfileResult {
  const { data, loading, error, refresh } = useFetchJson<ProfilePayload>(URL);
  const [saveState, setSaveState] = useState<ProfileSaveState>({ status: 'idle' });

  /* Guards against an older in-flight save resolving after a newer one
     and reporting a stale "saved" for a value already superseded. */
  const seqRef = useRef(0);

  /* toDataState() would map a resolved-but-null row to `idle`; here the
     server *did* answer, so null must render as `empty` (unset). */
  const profile: DataState<OrgIndustryProfile> = error
    ? { status: 'error', message: error }
    : loading
      ? { status: 'loading' }
      : data == null
        ? { status: 'idle' }
        : data.data == null
          ? { status: 'empty' }
          : { status: 'ready', data: data.data };

  const save = useCallback(
    async (patch: OrgIndustryProfilePatch): Promise<boolean> => {
      const seq = ++seqRef.current;
      setSaveState({ status: 'saving' });

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = getAuthToken();
      const orgId = getOrgId();
      if (token) headers.Authorization = `Bearer ${token}`;
      if (orgId) headers['x-organization-id'] = orgId;

      try {
        const res = await fetch(URL, {
          method: 'PATCH',
          credentials: 'include',
          headers,
          body: JSON.stringify(patch),
        });

        if (seq !== seqRef.current) return false; // superseded

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          setSaveState({
            status: 'error',
            message: `Not saved — HTTP ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`,
          });
          return false;
        }

        setSaveState({ status: 'saved', at: new Date() });
        refresh();
        return true;
      } catch (err) {
        if (seq !== seqRef.current) return false;
        setSaveState({
          status: 'error',
          message: err instanceof Error ? `Not saved — ${err.message}` : 'Not saved',
        });
        return false;
      }
    },
    [refresh],
  );

  return { profile, saveState, save, refresh };
}
