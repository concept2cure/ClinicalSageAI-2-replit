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
import { buildAuthHeaders } from './useFetchJson';

interface DownloadRef {
  encoding: 'base64';
  mime_type: string;
  filename: string;
  data: string;
}

export type CerExportFormat = 'pdf' | 'docx' | 'zip';

export interface CerExportOutcome {
  ok: boolean;
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
      const message =
        (typeof json?.message === 'string' && json.message) ||
        (typeof json?.error === 'string' && json.error) ||
        `HTTP ${res.status}`;
      return { ok: false, governed: false, audited: false, filename: null, error: message };
    }

    const ref = json?.downloadable_output_ref as DownloadRef | undefined;
    if (ref?.data) triggerDownload(ref);

    return {
      ok: true,
      governed: json?.governed === true,
      audited: json?.audited === true,
      filename: ref?.filename ?? null,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      governed: false,
      audited: false,
      filename: null,
      error: err instanceof Error ? err.message : 'Export request failed',
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
