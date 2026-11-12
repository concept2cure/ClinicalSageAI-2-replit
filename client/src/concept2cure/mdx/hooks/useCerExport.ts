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
 * with 403 HUMAN_REVIEW_REQUIRED, and that refusal is surfaced verbatim. It is
 * the block ExportReviewConfirmation builds (2026-10-15: this hook took a typed
 * name, sent no role, and stamped the review time with the clock at export).
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
 *
 * 2026-11-12 (P-114 item 3): also the EU technical file, the other governed
 * export of an EU device project, consuming server/routes/submissions.ts:
 *
 *   useTechnicalFileExport(programId).assemble('mdr' | 'ivdr')
 *     POST /api/submissions/programs/:programId/technical-file/export
 *
 * It answers through the same governed-export consequence as the CER export,
 * so the one reader below reads both.
 */

import { useCallback, useState } from 'react';
import { errorCodeOf, serverMessage } from '@/lib/queryClient';
import { buildAuthHeaders } from './useFetchJson';
import { downloadBase64 } from '../../v2/download';
import type { ExportReviewGovernance } from '../../v2/ExportReviewConfirmation';

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

/** The signed-in user's review confirmation (useExportReview), or not reviewed. */
export type CerExportGovernance = ExportReviewGovernance;

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

/** The outcome, and the answer's own body for a caller that reads more of it. */
interface PostedExport {
  outcome: CerExportOutcome;
  json: Record<string, unknown> | null;
}

async function postExport(url: string, body: unknown): Promise<PostedExport> {
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
      return { outcome: { ok: false, delivered: false, governed: false, audited: false, filename: null, error: message }, json };
    }

    const ref = json?.downloadable_output_ref as DownloadRef | undefined;
    const delivered = ref?.data ? triggerDownload(ref) : false;

    return {
      outcome: {
        ok: true,
        delivered,
        governed: json?.governed === true,
        audited: json?.audited === true,
        filename: ref?.filename ?? null,
        error: null,
      },
      json,
    };
  } catch {
    // A throw here is the fetch itself failing (offline, DNS, abort). Its
    // native message is "Failed to fetch" / "Load failed", so the hook's own
    // wording is the only thing worth showing.
    return {
      outcome: { ok: false, delivered: false, governed: false, audited: false, filename: null, error: 'Export request failed' },
      json: null,
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
        const { outcome: result } = await postExport(`/api/cerv2/export/${format}`, {
          docType: 'cerv2_cer',
          meta: {
            id: program.code || program.id,
            ident: program.id,
            title: program.title || undefined,
          },
          useProjectContent: true,
          governance: { aiGenerated: true, ...governance },
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

/* ── The EU technical file (MDR / IVDR Annex II and III) ──────────────────────
   P-114 item 3 (2026-11-09, decided under the founder's delegation; MDX journey
   M3): EU technical documentation is assembled per project, not per eCTD
   sequence. The route packages the project's own governed `mdr` or `ivdr`
   document. It had no caller until 2026-11-12. */

export type TechnicalFileRegulation = 'mdr' | 'ivdr';

export interface TechnicalFileOutcome extends CerExportOutcome {
  /**
   * The assembler's verdict on the package it built: every required Annex II
   * and III section is in the ZIP, and nothing written was left out. Null when
   * no package was built or the server did not say; never read as true.
   */
  ready: boolean | null;
  /** Sections in the ZIP whose text is still a draft or in review. Null when not reported. */
  unfinalized: number | null;
  /** The server's refusal code (`NO_AUTHORED_CONTENT`, `FILING_DIVERGED`, …), when it refused with one. */
  code: string | null;
}

export const technicalFileExportUrl = (programId: string): string =>
  `/api/submissions/programs/${encodeURIComponent(programId)}/technical-file/export`;

/**
 * The one line an EU screen shows for its technical file (pure, so the wording
 * is pinned by a test). A file the assembler did not call ready is said to be
 * incomplete: a Notified Body's completeness check holds a file with a required
 * section missing, so a download alone must not read as a finished file.
 */
export function technicalFileStatusLine(
  busy: boolean,
  outcome: TechnicalFileOutcome | null,
  regulation: TechnicalFileRegulation,
): string | null {
  if (busy) return 'Assembling the technical file from this project’s written sections…';
  if (!outcome) return null;
  if (!outcome.ok) {
    if (outcome.code === 'NO_AUTHORED_CONTENT') {
      return `Nothing to assemble yet. No section of this project’s ${regulation.toUpperCase()} technical documentation has been written and saved.`;
    }
    // The filing-agreement refusal is already a whole sentence that begins with the outcome.
    if (outcome.code === 'FILING_DIVERGED' && outcome.error) return outcome.error;
    return `The technical file was not assembled — ${outcome.error ?? 'the server gave no reason'}`;
  }
  const verb = outcome.delivered
    ? `Downloaded ${outcome.filename ?? 'the technical file'}`
    : outcome.filename
      ? `${outcome.filename} was produced but the browser blocked the download`
      : 'The technical file was assembled, but the server returned no file to download';
  const completeness = outcome.ready === true
    ? ''
    : outcome.ready === false
      ? ' · not yet a complete technical file: manifest.json in the ZIP lists each required Annex II and III section and whether it is present'
      : ' · the server did not say whether the file is complete';
  const n = outcome.unfinalized;
  const drafts = n === null
    ? ' · the server did not say whether its sections are approved'
    : n > 0 ? ` · ${n} of its sections ${n === 1 ? 'is' : 'are'} still in draft or review` : '';
  const registry = outcome.governed ? '' : ' · audit-logged; artifact registry placement pending';
  return `${verb}${completeness}${drafts}${registry}`;
}

export interface UseTechnicalFileExportResult {
  /** True while this project's assembly is in flight. */
  busy: boolean;
  /** The most recent outcome for the project on screen; another project's is never shown. */
  outcome: TechnicalFileOutcome | null;
  assemble: (regulation: TechnicalFileRegulation) => Promise<TechnicalFileOutcome | null>;
}

/**
 * POST /api/submissions/programs/:programId/technical-file/export for the
 * project on screen. The outcome is kept with the project it was asked for, so
 * a "Downloaded …" line never sits under another project's header.
 */
export function useTechnicalFileExport(programId: string | null): UseTechnicalFileExportResult {
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const [answered, setAnswered] = useState<{ programId: string; outcome: TechnicalFileOutcome } | null>(null);

  const assemble = useCallback(async (regulation: TechnicalFileRegulation) => {
    if (!programId) return null;
    setBusyFor(programId);
    try {
      const { outcome: posted, json } = await postExport(technicalFileExportUrl(programId), { regulation });
      const outcome: TechnicalFileOutcome = {
        ...posted,
        ready: posted.ok && typeof json?.ready === 'boolean' ? json.ready : null,
        unfinalized: posted.ok && typeof json?.unfinalized === 'number' ? json.unfinalized : null,
        code: posted.ok ? null : errorCodeOf(json) ?? null,
      };
      setAnswered({ programId, outcome });
      return outcome;
    } finally {
      setBusyFor((current) => (current === programId ? null : current));
    }
  }, [programId]);

  return {
    busy: busyFor !== null && busyFor === programId,
    outcome: answered && answered.programId === programId ? answered.outcome : null,
    assemble,
  };
}
