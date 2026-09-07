/**
 * useDeviceProfile — device-profile intake for a program, consuming
 * server/routes/510k-device-routes.ts. The read hook mirrors the read-only
 * useFetchJson pattern; save() mirrors the raw-fetch mutator style
 * (useEstarFiling) and refresh()es the read hook on success.
 *
 *   useDeviceProfile(ident)      GET /api/510k/device/profile?ident=
 *                                + save()  PUT /api/510k/device/profile?ident=
 *   lookupClassification(query)  GET /api/510k/device/classification (openFDA)
 *   lookupRecognizedStandards()  GET /api/510k/device/standards (vendored FDA
 *                                recognition list — NOT an openFDA dataset)
 *
 * Honest by construction: the classification lookup passes the server's
 * { available:false, unavailableReason } through untouched — a failed lookup
 * never fabricates a product code or device class, and an unmappable openFDA
 * device_class maps to null (leave the field alone) rather than a guess. The
 * standards lookup keeps `datasetLoaded` separate from `standards.length` so a
 * surface can tell "we do not hold FDA's list" apart from "FDA lists nothing
 * for this code" — collapsing those two into one empty table is the failure
 * mode the whole path is built to avoid.
 */

import { useCallback, useState } from 'react';
import { buildAuthHeaders, saveFailureFor, useFetchJson, type SaveFailure } from './useFetchJson';

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
  /* The device-level administrative facts the official eSTAR reads from the
     program. Null = not held; the eSTAR field stays blank and is reported,
     never guessed. */
  commonName: string | null;
  classificationName: string | null;
  regulationNumber: string | null;
  associatedProductCodes: string | null;
  indicationsForUseCitation: string | null;
}

/** Fields PUT /profile accepts — send only what changed; the server rejects
 *  an empty patch. The five eSTAR facts accept '' to CLEAR the stored value
 *  (the server stores null); any other string is stored trimmed. */
export interface DeviceProfilePatch {
  productName?: string;
  deviceClass?: DeviceClass;
  regulatoryPath?: RegulatoryPath;
  productCode?: string;
  intendedUse?: string;
  indication?: string;
  commonName?: string;
  classificationName?: string;
  regulationNumber?: string;
  associatedProductCodes?: string;
  indicationsForUseCitation?: string;
}

/** The five eSTAR device facts, in the order the intake form shows them. */
export const ESTAR_DEVICE_FIELDS = [
  'commonName',
  'classificationName',
  'regulationNumber',
  'associatedProductCodes',
  'indicationsForUseCitation',
] as const;
export type EstarDeviceField = (typeof ESTAR_DEVICE_FIELDS)[number];

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
  /** Why the last save did not land, or null when the last one did. A refused
   *  save used to be indistinguishable from a rejected one: both returned null
   *  and the surface said "the server rejected the update", which sent a
   *  read-only operator hunting for a bad value in fields their role simply
   *  cannot write. The classification is the server's, never guessed here. */
  saveFailure: SaveFailure | null;
}

export function useDeviceProfile(ident: string | null): UseDeviceProfileResult {
  const url = deviceProfileUrl(ident);
  const { data, loading, error, refresh } = useFetchJson<{ profile: DeviceProfileView }>(url);
  const [saveFailure, setSaveFailure] = useState<SaveFailure | null>(null);
  const save = useCallback(
    async (patch: DeviceProfilePatch) => {
      /* No ident is not a failed save — there is nothing to save to, and the
         surface must not report a refusal that never happened. */
      if (!url) return null;
      try {
        const res = await fetch(url, {
          method: 'PUT',
          credentials: 'include',
          headers: jsonHeaders(),
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          setSaveFailure(saveFailureFor(res.status));
          return null;
        }
        const j = (await res.json()) as { profile: DeviceProfileView };
        setSaveFailure(null);
        refresh();
        return j.profile ?? null;
      } catch {
        /* The request never reached a verdict — a thrown fetch is a transport
           failure, not the server declining the content. */
        setSaveFailure('unavailable');
        return null;
      }
    },
    [url, refresh],
  );
  return { profile: data?.profile ?? null, loading, error, refresh, save, saveFailure };
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

/* ─── FDA recognized consensus standards (vendored list, never inferred) ─── */

export interface RecognizedStandardView {
  recognitionNumber: string;
  sdo: string;
  designationNumber: string;
  title: string;
  extentOfRecognition: string;
  specialtyTaskGroup?: string;
  recognitionStatus?: string;
  transitionEndDate?: string;
}

export interface RecognizedStandardsProvenanceView {
  source: string;
  sourceUrl: string;
  recognitionListNumber: string;
  publishedOn: string;
  retrievedOn: string;
  retrievedBy: string;
}

export interface RecognizedStandardsResult {
  productCode: string | null;
  available: boolean;
  /** Set when available=false — why no answer could be produced. */
  unavailableReason?: string;
  /** Whether the vendored dataset loaded at all. Never infer this from
   *  standards.length — an empty list from a LOADED dataset is a real answer. */
  datasetLoaded: boolean;
  standards: RecognizedStandardView[];
  matched: number;
  provenance?: RecognizedStandardsProvenanceView;
  source: 'fda-recognized-consensus-standards';
}

export interface RecognizedStandardsQuery {
  /** Program ident — the server resolves its product code, org-scoped. */
  ident?: string | null;
  /** An explicit product code; wins over the program's own when both are sent. */
  productCode?: string | null;
}

/**
 * Build the /standards query string. Pure + exported so the query contract is
 * unit-testable without a DOM. Null when neither term is usable (the server
 * 400s an empty query).
 */
export function recognizedStandardsUrl(query: RecognizedStandardsQuery): string | null {
  const params = new URLSearchParams();
  if (query.ident?.trim()) params.set('ident', query.ident.trim());
  if (query.productCode?.trim()) params.set('productCode', query.productCode.trim());
  const qs = params.toString();
  return qs ? `/api/510k/device/standards?${qs}` : null;
}

/**
 * GET /standards — the FDA recognition list for a product code. Passes the
 * server's labelled envelope through untouched. Returns null only when the
 * request itself failed (network error / non-2xx) — never a fabricated
 * standard, and never a silently-empty list standing in for an error.
 */
export async function lookupRecognizedStandards(
  query: RecognizedStandardsQuery,
): Promise<RecognizedStandardsResult | null> {
  const url = recognizedStandardsUrl(query);
  if (!url) {
    return {
      productCode: null,
      available: false,
      unavailableReason: 'Available once a program is open, or a product code is entered',
      datasetLoaded: false,
      standards: [],
      matched: 0,
      source: 'fda-recognized-consensus-standards',
    };
  }
  try {
    const res = await fetch(url, { credentials: 'include', headers: jsonHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as RecognizedStandardsResult;
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
