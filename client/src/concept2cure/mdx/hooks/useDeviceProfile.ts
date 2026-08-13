/**
 * useDeviceProfile — device-profile intake for a program, consuming
 * server/routes/510k-device-routes.ts. The read hook mirrors the read-only
 * useFetchJson pattern; save() mirrors the raw-fetch mutator style
 * (useEstarFiling) and refresh()es the read hook on success.
 *
 *   useDeviceProfile(ident)      GET /api/510k/device/profile?ident=
 *                                + save()  PUT /api/510k/device/profile?ident=
 *   lookupClassification(query)  GET /api/510k/device/classification (openFDA)
 *
 * Honest by construction: the classification lookup passes the server's
 * { available:false, unavailableReason } through untouched — a failed lookup
 * never fabricates a product code or device class, and an unmappable openFDA
 * device_class maps to null (leave the field alone) rather than a guess.
 */

import { useCallback } from 'react';
import { buildAuthHeaders, useFetchJson } from './useFetchJson';

/** Mutators need the same Bearer + x-organization-id headers as the read
 *  path — cookies alone 401 at the global /api gate (see buildAuthHeaders). */
const jsonHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...buildAuthHeaders(),
});

/* ─── Device profile (org-scoped, regulatory_programs) ──────────────── */

export type DeviceClass = 'I' | 'II' | 'III';
export type RegulatoryPath = '510k' | 'de_novo' | 'pma';

export interface DeviceProfileView {
  id: string;
  name: string | null;
  code: string | null;
  productName: string | null;
  productType: string | null;
  deviceClass: string | null;
  regulatoryPath: string | null;
  productCode: string | null;
  intendedUse: string | null;
  indication: string | null;
  predicateDevices: unknown;
}

/** Fields PUT /profile accepts — send only what changed; the server rejects
 *  an empty patch. */
export interface DeviceProfilePatch {
  productName?: string;
  deviceClass?: DeviceClass;
  regulatoryPath?: RegulatoryPath;
  productCode?: string;
  intendedUse?: string;
  indication?: string;
}

/**
 * Build the /profile URL for a program ident (regulatoryPrograms UUID or
 * code). Pure + exported so the ident contract is unit-testable without a
 * DOM. Null disables the fetch (useFetchJson idle state).
 */
export function deviceProfileUrl(ident: string | null): string | null {
  return ident ? `/api/510k/device/profile?ident=${encodeURIComponent(ident)}` : null;
}

export interface UseDeviceProfileResult {
  profile: DeviceProfileView | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** PUT /profile — persist the changed intake fields; refreshes on success.
   *  Null when there is no ident or the server rejected the write. */
  save: (patch: DeviceProfilePatch) => Promise<DeviceProfileView | null>;
}

export function useDeviceProfile(ident: string | null): UseDeviceProfileResult {
  const url = deviceProfileUrl(ident);
  const { data, loading, error, refresh } = useFetchJson<{ profile: DeviceProfileView }>(url);
  const save = useCallback(
    async (patch: DeviceProfilePatch) => {
      if (!url) return null;
      try {
        const res = await fetch(url, {
          method: 'PUT',
          credentials: 'include',
          headers: jsonHeaders(),
          body: JSON.stringify(patch),
        });
        if (!res.ok) return null;
        const j = (await res.json()) as { profile: DeviceProfileView };
        refresh();
        return j.profile ?? null;
      } catch {
        return null;
      }
    },
    [url, refresh],
  );
  return { profile: data?.profile ?? null, loading, error, refresh, save };
}

/* ─── openFDA classification lookup (autofill offer, never authoritative) ── */

export interface ClassificationHit {
  deviceName: string;
  productCode: string;
  deviceClass: string;
  regulationNumber: string;
  medicalSpecialty: string;
  reviewPanel: string;
}

export interface ClassificationLookupResult {
  available: boolean;
  /** Set when available=false — why the lookup could not run. */
  unavailableReason?: string;
  results: ClassificationHit[];
  source: 'openfda';
}

export interface ClassificationQuery {
  productCode?: string;
  deviceName?: string;
  regulationNumber?: string;
}

/**
 * Build the /classification query string. Pure + exported so the query
 * contract is unit-testable without a DOM. Null when no usable term remains
 * (the server 400s an empty query; deviceName needs 2+ characters).
 */
export function classificationQueryUrl(query: ClassificationQuery): string | null {
  const params = new URLSearchParams();
  if (query.productCode?.trim()) params.set('productCode', query.productCode.trim());
  if ((query.deviceName?.trim().length ?? 0) >= 2) params.set('deviceName', query.deviceName!.trim());
  if (query.regulationNumber?.trim()) params.set('regulationNumber', query.regulationNumber.trim());
  const qs = params.toString();
  return qs ? `/api/510k/device/classification?${qs}` : null;
}

/**
 * GET /classification — openFDA classification lookup for intake autofill.
 * Passes the server's honest { available:false, unavailableReason } payload
 * through untouched. Returns null only when the request itself failed
 * (network error / non-2xx) — never a fabricated hit.
 */
export async function lookupClassification(
  query: ClassificationQuery,
): Promise<ClassificationLookupResult | null> {
  const url = classificationQueryUrl(query);
  if (!url) {
    return {
      available: false,
      unavailableReason: 'Enter a product code or a device name (2+ characters) first',
      results: [],
      source: 'openfda',
    };
  }
  try {
    const res = await fetch(url, { credentials: 'include', headers: jsonHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as ClassificationLookupResult;
  } catch {
    return null;
  }
}

/**
 * openFDA device_class comes back as '1' | '2' | '3' (plus unclassified
 * markers like 'U' / 'N' / 'f'); the profile stores Roman numerals. Null =
 * not mappable — the caller leaves the field alone rather than guessing.
 */
export function romanDeviceClass(cls: string | null | undefined): DeviceClass | null {
  switch ((cls ?? '').trim().toUpperCase()) {
    case '1':
    case 'I':
      return 'I';
    case '2':
    case 'II':
      return 'II';
    case '3':
    case 'III':
      return 'III';
    default:
      return null;
  }
}
