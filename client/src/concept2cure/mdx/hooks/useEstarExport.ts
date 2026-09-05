/**
 * useEstarExport — the 510(k) surface's two real export actions, consuming
 * server/routes/510k-estar-routes.ts:
 *
 *   exportDraftPackage()  POST /api/510k/estar/build     (draft content ZIP —
 *                         rendered section PDFs; NOT the official eSTAR)
 *   exportOfficialEstar() POST /api/510k/estar/official  (the submittable FDA
 *                         eSTAR PDF; 422 with blockers until the official
 *                         template + verified field map are vendored). With
 *                         useProgramData the administrative fields are filled
 *                         from the org's governed records — governed wins,
 *                         typed values fill only the gaps — and the response's
 *                         fieldReport says what was and was not written.
 *
 * Both send meta.ident (program UUID / code / numeric project id — resolved
 * org-scoped server-side) and useProjectContent so the package is assembled
 * from the org's real authored sections, never a client-fabricated payload.
 * The response's downloadable_output_ref (base64) is turned into a real
 * browser download. Mirrors the raw-fetch mutator pattern of useEstarFiling,
 * with the same auth headers as useFetchJson (Bearer + x-organization-id).
 */

import { useCallback, useState } from 'react';
import { serverMessage } from '@/lib/queryClient';
import { buildAuthHeaders, useFetchJson } from './useFetchJson';
import type { OfficialEstarType, OfficialEstarVariant } from './useEstarOfficialFields';
import { downloadBase64 } from '../../v2/download';

interface DownloadRef {
  encoding: 'base64';
  mime_type: string;
  filename: string;
  data: string;
}

export interface EstarExportOutcome {
  ok: boolean;
  /**
   * The browser actually took the file. `downloadBase64` reports this and it was
   * being discarded, so a blocked download still read as "Downloaded …" — for
   * the official FDA eSTAR, the one artifact a user must actually receive.
   */
  delivered: boolean;
  /** Registered in the artifact registry (governed consequence) vs audited-only delivery. */
  governed: boolean;
  filename: string | null;
  /** Advisory us-estar formatting counts from the build (draft path only). */
  formattingErrors: number;
  formattingWarnings: number;
  /** Honest blockers when the official eSTAR is not producible (422). */
  blockers: string[];
  /**
   * The server refused with 403 { error:'NOT_ENTITLED' } — the capability is
   * above the org's plan (services/entitlements/require-entitlement). Distinct
   * from a role 403: only the entitlement shape sets this, so the surface can
   * render the Locked state (never a dead button) instead of a generic failure.
   */
  blockedByEntitlement: boolean;
  /** Minimum plan tier the server named alongside NOT_ENTITLED (never invented). */
  requiredTier: string | null;
  /** What the official fill wrote and left blank — null on the draft path,
   *  on failure, or when the server sent no report. */
  fieldReport: EstarFieldReport | null;
  error: string | null;
}

/** The server's account of the administrative fill (POST /official 200). */
export interface EstarFieldReport {
  mappedCount: number;
  filledCount: number;
  blankCount: number;
  /** Canonical keys the fill left blank — the platform held no value. */
  blankKeys: string[];
  /** Typed keys the server dropped: a governed value took precedence, or the
   *  key is not on the template. */
  ignoredRequestKeys: string[];
  /** Governed facts the fill could not express — e.g. a second predicate the
   *  template has no box for. The user finishes these on the form. */
  advisories: string[];
}

export interface OfficialEstarOptions {
  /** The marketing pathway the eSTAR is produced for — selects the field map
   *  server-side. Defaults to '510k' so callers that predate the pathway
   *  option keep their behaviour. */
  type?: OfficialEstarType;
  /** Fill the administrative fields from the program's governed records. */
  useProgramData?: boolean;
  /** Values typed for this export only; empty/whitespace entries are dropped
   *  before sending (see cleanRequestData). */
  data?: Record<string, string>;
}

/**
 * Keep only the entries a user actually typed: non-empty after trimming,
 * trimmed. Pure + exported so the "only typed keys travel" rule is
 * unit-testable without a DOM.
 */
export function cleanRequestData(
  data: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data) return out;
  for (const [key, raw] of Object.entries(data)) {
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    if (value) out[key] = value;
  }
  return out;
}

/**
 * The administrative-fill clause of the success line — filled of mapped, and
 * the blank count when anything was left blank. Pure so the wording is pinned
 * by a test rather than by however the JSX reads.
 */
export function fieldReportClause(report: EstarFieldReport | null): string {
  if (!report) return '';
  const blank = report.blankCount > 0 ? ` · ${report.blankCount} left blank` : '';
  // An advisory is a governed fact the form has no box for; the line carries
  // it whole, because "filled" alone would read as "finished".
  const advisories = report.advisories.map((a) => ` · ${a}`).join('');
  return ` · ${report.filledCount} of ${report.mappedCount} administrative fields filled${blank}${advisories}`;
}

function parseFieldReport(raw: unknown): EstarFieldReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.mappedCount !== 'number' ||
    typeof r.filledCount !== 'number' ||
    typeof r.blankCount !== 'number'
  ) {
    return null;
  }
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return {
    mappedCount: r.mappedCount,
    filledCount: r.filledCount,
    blankCount: r.blankCount,
    blankKeys: strings(r.blankKeys),
    ignoredRequestKeys: strings(r.ignoredRequestKeys),
    advisories: strings(r.advisories),
  };
}

/**
 * The one-line export status the 510(k) surface renders (pure — extracted so
 * the Locked/blocked/success wording is unit-testable without a DOM).
 *
 * The NOT_ENTITLED line follows the entitlements UX contract (§4, locked-never-
 * dead): name the real minimum tier and the capability, nothing more.
 */
export function exportStatusLine(busy: boolean, outcome: EstarExportOutcome | null): string | null {
  if (busy) return 'Exporting…';
  if (!outcome) return null;
  if (outcome.ok) {
    const formatting =
      outcome.formattingErrors + outcome.formattingWarnings > 0
        ? ` · ${outcome.formattingErrors} formatting errors, ${outcome.formattingWarnings} warnings to fix before submitting`
        : '';
    const registry = outcome.governed ? '' : ' · audit-logged; artifact registry placement pending';
    // The server produced it either way; whether the file reached the user is a
    // separate fact, and saying "Downloaded" when it did not is the difference
    // between a user who looks in their downloads folder and one who does not.
    // Two ways it can fail to arrive, and they are not the same problem: the
    // browser refused the file, or the server never sent one.
    const verb = outcome.delivered
      ? `Downloaded ${outcome.filename ?? 'package'}`
      : outcome.filename
        ? `${outcome.filename} was produced but the browser blocked the download`
        : 'Export accepted, but the server returned no file to download';
    return `${verb}${fieldReportClause(outcome.fieldReport)}${formatting}${registry}`;
  }
  if (outcome.blockedByEntitlement) return entitlementRequiredLine(outcome.requiredTier);
  return `Export failed — ${
    outcome.blockers.length ? outcome.blockers.join(' · ') : outcome.error ?? 'unknown error'
  }`;
}

/**
 * The one sentence for "this plan does not unlock the export" — used after a
 * 403 NOT_ENTITLED and, through useEstarEntitlement, BEFORE the first click.
 * Names the real minimum tier when the server named one; never invents a tier.
 */
export function entitlementRequiredLine(requiredTier: string | null | undefined): string {
  return requiredTier
    ? `Requires the ${requiredTier} plan — device assembly readiness`
    : 'Requires a higher plan — device assembly readiness';
}

/**
 * GET /api/510k/estar/entitlement — the export gate's verdict for this org,
 * read before anyone clicks. `enforced` is true only when the operator has
 * turned enforcement on (ENTITLEMENTS_ENFORCE=on); in 'warn' or 'off' mode the
 * POST would go through, so a surface must NOT lock on `allowed:false` unless
 * `enforced` is also true. `allowed` is null when nothing was evaluated.
 */
export interface EstarEntitlementView {
  capability: string;
  mode: 'off' | 'warn' | 'on';
  enforced: boolean;
  allowed: boolean | null;
  requiredTier: string | null;
  tier: string | null;
  reason: string | null;
}

export const ESTAR_ENTITLEMENT_URL = '/api/510k/estar/entitlement';

/** Pure: would the producing routes refuse this org today? */
export function entitlementBlocksExport(view: EstarEntitlementView | null | undefined): boolean {
  return view?.enforced === true && view.allowed === false;
}

function isEntitlementView(data: unknown): data is EstarEntitlementView {
  if (!data || typeof data !== 'object') return false;
  const d = data as Partial<EstarEntitlementView>;
  return typeof d.enforced === 'boolean' && (d.mode === 'off' || d.mode === 'warn' || d.mode === 'on');
}

export interface UseEstarEntitlementResult {
  entitlement: EstarEntitlementView | null;
  loading: boolean;
  error: string | null;
}

export function useEstarEntitlement(): UseEstarEntitlementResult {
  const { data, loading, error } = useFetchJson<unknown>(ESTAR_ENTITLEMENT_URL);
  /* A body that is not the documented verdict is no verdict: the control
     stays live (the 403 path still guards the write) rather than locking on
     a shape nobody read. */
  return { entitlement: isEntitlementView(data) ? data : null, loading, error };
}

const IDLE: EstarExportOutcome | null = null;

/* Was a local copy of the save-a-blob dance, byte-identical to the one in the
   sibling export hook — and both revoked the object URL synchronously right
   after click(), which races the download and can produce a zero-byte file.
   `downloadBase64` owns the decode and the timing. */
function triggerDownload(ref: DownloadRef): boolean {
  // atob throws on a malformed payload; that is a failure to deliver, not an
  // export failure, so it is reported as one rather than thrown into the
  // request's own catch where it would read as a network error.
  try {
    return downloadBase64(ref.filename, ref.data, ref.mime_type);
  } catch {
    return false;
  }
}

export interface ProgramRef {
  /** Program identifier the server resolves org-scoped (UUID / code / numeric id). */
  id: string;
  code?: string | null;
  title?: string | null;
}

export interface UseEstarExportResult {
  /** True while either export request is in flight. */
  busy: boolean;
  /** Outcome of the most recent export attempt (null until one runs). */
  outcome: EstarExportOutcome | null;
  exportDraftPackage: (program: ProgramRef) => Promise<EstarExportOutcome>;
  exportOfficialEstar: (
    program: ProgramRef,
    variant?: OfficialEstarVariant,
    opts?: OfficialEstarOptions,
  ) => Promise<EstarExportOutcome>;
  /** Forget the last outcome. A surface calls this when the program it shows
   *  changes, so a previous program's "Downloaded … filled/blank" line and its
   *  blank-caption list never sit under the next program's header. Stable. */
  reset: () => void;
}

async function postExport(url: string, body: unknown): Promise<EstarExportOutcome> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (!res.ok) {
      const blockers = Array.isArray(json?.blockers) ? (json?.blockers as string[]) : [];
      // Same precedence this already had — the server's sentence wins over the
      // `error` slot — but through the one shared reader, which also refuses an
      // enum-shaped `error` token and infrastructure text. The bare
      // `HTTP <status>` fallback is gone: on its own it was not a sentence.
      const message = serverMessage(json) ?? `the server gave no reason (HTTP ${res.status})`;
      // Only the entitlement gate's exact 403 shape marks a Locked outcome —
      // a role/permission 403 must NOT read as a plan limitation. This reads
      // the raw `error` slot on purpose: it is a machine code driving a branch,
      // never copy, which is why it is untouched by the change above.
      const blockedByEntitlement = res.status === 403 && json?.error === 'NOT_ENTITLED';
      return {
        ok: false,
        delivered: false,
        governed: false,
        filename: null,
        formattingErrors: 0,
        formattingWarnings: 0,
        blockers,
        blockedByEntitlement,
        requiredTier:
          blockedByEntitlement && typeof json?.requiredTier === 'string' ? json.requiredTier : null,
        fieldReport: null,
        error: message,
      };
    }

    const ref = json?.downloadable_output_ref as DownloadRef | undefined;
    const delivered = ref?.data ? triggerDownload(ref) : false;

    const formatting = (json?.formattingReport ?? null) as
      | { errors?: number; warnings?: number }
      | null;
    return {
      ok: true,
      delivered,
      governed: json?.governed === true,
      filename: ref?.filename ?? null,
      formattingErrors: formatting?.errors ?? 0,
      formattingWarnings: formatting?.warnings ?? 0,
      blockers: [],
      blockedByEntitlement: false,
      requiredTier: null,
      fieldReport: parseFieldReport(json?.fieldReport),
      error: null,
    };
  } catch {
    // A throw here is the fetch itself failing (offline, DNS, abort). Its
    // native message is "Failed to fetch" / "Load failed", so the hook's own
    // wording is the only thing worth showing.
    return {
      ok: false,
      delivered: false,
      governed: false,
      filename: null,
      formattingErrors: 0,
      formattingWarnings: 0,
      blockers: [],
      blockedByEntitlement: false,
      requiredTier: null,
      fieldReport: null,
      error: 'Export request failed',
    };
  }
}

export function useEstarExport(): UseEstarExportResult {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<EstarExportOutcome | null>(IDLE);

  const run = useCallback(async (url: string, body: unknown) => {
    setBusy(true);
    try {
      const result = await postExport(url, body);
      setOutcome(result);
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  const exportDraftPackage = useCallback(
    (program: ProgramRef) =>
      run('/api/510k/estar/build', {
        meta: {
          id: program.code || program.id,
          ident: program.id,
          title: program.title || undefined,
        },
        useProjectContent: true,
      }),
    [run],
  );

  const exportOfficialEstar = useCallback(
    (program: ProgramRef, variant: OfficialEstarVariant = 'device', opts: OfficialEstarOptions = {}) =>
      run('/api/510k/estar/official', {
        meta: {
          id: program.code || program.id,
          ident: program.id,
          title: program.title || undefined,
        },
        type: opts.type ?? '510k',
        variant,
        /* Governed records win server-side; typed values fill only the gaps.
           Without useProgramData the route fills `data` verbatim, as before. */
        useProgramData: opts.useProgramData === true,
        data: cleanRequestData(opts.data),
      }),
    [run],
  );

  const reset = useCallback(() => setOutcome(IDLE), []);

  return { busy, outcome, exportDraftPackage, exportOfficialEstar, reset };
}
