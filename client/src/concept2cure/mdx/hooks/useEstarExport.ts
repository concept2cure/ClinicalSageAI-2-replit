/**
 * useEstarExport — the 510(k) surface's two real export actions, consuming
 * server/routes/510k-estar-routes.ts:
 *
 *   exportDraftPackage()  POST /api/510k/estar/build     (draft content ZIP —
 *                         rendered section PDFs; NOT the official eSTAR)
 *   exportOfficialEstar() POST /api/510k/estar/official  (the submittable FDA
 *                         eSTAR PDF; 422 with blockers until the official
 *                         template + verified field map are vendored)
 *
 * Both send meta.ident (program UUID / code / numeric project id — resolved
 * org-scoped server-side) and useProjectContent so the package is assembled
 * from the org's real authored sections, never a client-fabricated payload.
 * The response's downloadable_output_ref (base64) is turned into a real
 * browser download. Mirrors the raw-fetch mutator pattern of useEstarFiling,
 * with the same auth headers as useFetchJson (Bearer + x-organization-id).
 */

import { useCallback, useState } from 'react';
import { buildAuthHeaders } from './useFetchJson';

interface DownloadRef {
  encoding: 'base64';
  mime_type: string;
  filename: string;
  data: string;
}

export interface EstarExportOutcome {
  ok: boolean;
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
  error: string | null;
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
    return `Downloaded ${outcome.filename ?? 'package'}${formatting}${registry}`;
  }
  if (outcome.blockedByEntitlement) {
    return outcome.requiredTier
      ? `Requires the ${outcome.requiredTier} plan — device assembly readiness`
      : 'Requires a higher plan — device assembly readiness';
  }
  return `Export failed — ${
    outcome.blockers.length ? outcome.blockers.join(' · ') : outcome.error ?? 'unknown error'
  }`;
}

const IDLE: EstarExportOutcome | null = null;

function triggerDownload(ref: DownloadRef): void {
  const bytes = Uint8Array.from(atob(ref.data), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: ref.mime_type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ref.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  exportOfficialEstar: (program: ProgramRef, variant?: 'device' | 'ivd') => Promise<EstarExportOutcome>;
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
      const message =
        (typeof json?.message === 'string' && json.message) ||
        (typeof json?.error === 'string' && json.error) ||
        `HTTP ${res.status}`;
      // Only the entitlement gate's exact 403 shape marks a Locked outcome —
      // a role/permission 403 must NOT read as a plan limitation.
      const blockedByEntitlement = res.status === 403 && json?.error === 'NOT_ENTITLED';
      return {
        ok: false,
        governed: false,
        filename: null,
        formattingErrors: 0,
        formattingWarnings: 0,
        blockers,
        blockedByEntitlement,
        requiredTier:
          blockedByEntitlement && typeof json?.requiredTier === 'string' ? json.requiredTier : null,
        error: message,
      };
    }

    const ref = json?.downloadable_output_ref as DownloadRef | undefined;
    if (ref?.data) triggerDownload(ref);

    const formatting = (json?.formattingReport ?? null) as
      | { errors?: number; warnings?: number }
      | null;
    return {
      ok: true,
      governed: json?.governed === true,
      filename: ref?.filename ?? null,
      formattingErrors: formatting?.errors ?? 0,
      formattingWarnings: formatting?.warnings ?? 0,
      blockers: [],
      blockedByEntitlement: false,
      requiredTier: null,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      governed: false,
      filename: null,
      formattingErrors: 0,
      formattingWarnings: 0,
      blockers: [],
      blockedByEntitlement: false,
      requiredTier: null,
      error: err instanceof Error ? err.message : 'Export request failed',
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
    (program: ProgramRef, variant: 'device' | 'ivd' = 'device') =>
      run('/api/510k/estar/official', {
        meta: {
          id: program.code || program.id,
          ident: program.id,
          title: program.title || undefined,
        },
        type: '510k',
        variant,
        data: {},
      }),
    [run],
  );

  return { busy, outcome, exportDraftPackage, exportOfficialEstar };
}
