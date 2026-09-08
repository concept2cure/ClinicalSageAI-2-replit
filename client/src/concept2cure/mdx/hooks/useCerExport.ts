/**
 * useCerExport — the CER workbench's governed export actions, consuming
 * server/routes/cerv2-export-routes.ts:
 *
 *   exportCer(program, 'pdf' | 'docx' | 'zip', governance)
 *     POST /api/cerv2/export/pdf | /docx | /zip
 *
 * Every request sends meta.ident (program UUID / code — resolved org-scoped
 * server-side) and useProjectContent: true, so the document is assembled from
 * the org's real authored sections, never a client-fabricated payload. The
 * governance block is an honest attestation: humanReviewApproved is whatever
 * the user actually confirmed — a production server rejects unreviewed exports
 * with 403 HUMAN_REVIEW_REQUIRED, and that refusal is surfaced verbatim.
 *
 * The response's downloadable_output_ref (base64) becomes a real browser
 * download. `governed: true` means the artifact registry placed the export;
 * `audited: true, governed: false` means the program has no PM-spine project
 * row yet, so the export was delivered and audit-logged (SHA-256) without
 * registry placement — the surface reports that state, it does not hide it.
 *
 * Mirrors the raw-fetch mutator shape of useEstarExport (deliberately not
 * imported — that hook belongs to the 510(k) surface), with the same auth
 * headers as useFetchJson (Bearer + x-organization-id).
 */

import { useCallback, useState } from 'react';
import { serverMessage } from '@/lib/queryClient';
import { buildAuthHeaders } from './useFetchJson';
import { downloadBase64 } from '../../v2/download';

interface DownloadRef {
  encoding: 'base64';
  mime_type: string;
  filename: string;
  data: string;
}

export type CerExportFormat = 'pdf' | 'docx' | 'zip';

export interface CerExportOutcome {
  ok: boolean;
  /**
   * The browser actually took the file. `downloadBase64` reports this and it was
   * discarded, so a blocked download still read as "Exported …".
   */
  delivered: boolean;
  /** Registered in the artifact registry (governed consequence). */
  governed: boolean;
  /** Delivered + audit-logged without registry placement (program-spine anchor). */
  audited: boolean;
  filename: string | null;
  error: string | null;
}

export interface CerProgramRef {
  /** Program identifier the server resolves org-scoped (UUID / code / numeric id). */
  id: string;
  code?: string | null;
  title?: string | null;
}

export interface CerExportGovernance {
  /** True only when a human has actually reviewed the assembled content. */
  humanReviewApproved: boolean;
  reviewerName?: string;
}

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

async function postExport(url: string, body: unknown): Promise<CerExportOutcome> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (!res.ok) {
      // Same precedence this already had — the server's sentence wins over the
      // `error` slot, which is what makes HUMAN_REVIEW_REQUIRED's explanation
      // surface verbatim — but through the one shared reader, which also
      // refuses an enum-shaped `error` token and infrastructure text. The bare
      // `HTTP <status>` fallback is gone: on its own it was not a sentence.
      const message = serverMessage(json) ?? `the server gave no reason (HTTP ${res.status})`;
      return { ok: false, delivered: false, governed: false, audited: false, filename: null, error: message };
    }

    const ref = json?.downloadable_output_ref as DownloadRef | undefined;
    const delivered = ref?.data ? triggerDownload(ref) : false;

    return {
      ok: true,
      delivered,
      governed: json?.governed === true,
      audited: json?.audited === true,
      filename: ref?.filename ?? null,
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
      audited: false,
      filename: null,
      error: 'Export request failed',
    };
  }
}

export interface UseCerExportResult {
  /** True while an export request is in flight. */
  busy: boolean;
  /** Outcome of the most recent export attempt (null until one runs). */
  outcome: CerExportOutcome | null;
  exportCer: (
    program: CerProgramRef,
    format: CerExportFormat,
    governance: CerExportGovernance,
  ) => Promise<CerExportOutcome>;
}

export function useCerExport(): UseCerExportResult {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CerExportOutcome | null>(null);

  const exportCer = useCallback(
    async (program: CerProgramRef, format: CerExportFormat, governance: CerExportGovernance) => {
      setBusy(true);
      try {
        const result = await postExport(`/api/cerv2/export/${format}`, {
          docType: 'cerv2_cer',
          meta: {
            id: program.code || program.id,
            ident: program.id,
            title: program.title || undefined,
          },
          useProjectContent: true,
          governance: {
            aiGenerated: true,
            humanReviewApproved: governance.humanReviewApproved,
            ...(governance.reviewerName?.trim()
              ? {
                  reviewerName: governance.reviewerName.trim(),
                  reviewTimestamp: new Date().toISOString(),
                }
              : {}),
          },
        });
        setOutcome(result);
        return result;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { busy, outcome, exportCer };
}
