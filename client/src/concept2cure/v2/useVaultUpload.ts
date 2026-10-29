/**
 * The one document-upload path — `POST /api/vault/ingest`.
 *
 * ── Why this is a hook and not two copies ────────────────────────────────────
 * There is exactly one endpoint in the product that persists uploaded bytes,
 * computes a SHA-256 of them and writes a governed document row, and until now
 * exactly one surface called it: `v2/surfaces/Vault.tsx`. The MDX lane's own
 * Document vault — the one whose header reads "21 CFR Part 11 audit trail ·
 * SHA-256 chained · 7-year minimum retention" — had an Upload button that
 * opened an AnA chat prompt, so a device team could not put a file into their
 * vault at all.
 *
 * Fixing that by copying forty lines into the MDX surface would have produced
 * the second copy of a governed write path, and the two would have drifted the
 * first time either lane changed a field name or a failure message. The logic
 * moves here and BOTH surfaces call it, which is the same reason
 * `./programAction.ts` exists one level up.
 *
 * ── What the caller gets, and what it must not do ────────────────────────────
 * `upload(files)` resolves to a per-file outcome. It never throws for a
 * rejected file: a partial batch is the normal case (one file over the size
 * limit, one refused by the virus scan) and the caller has to be able to tell
 * the user which ones landed. What it must NOT do is report success it did not
 * observe — `succeeded` counts only 2xx responses, so a surface that refreshes
 * on `succeeded > 0` refreshes on real rows.
 *
 * The server owns every decision that matters: the SHA-256, the storage key,
 * the audit entry, the tenant check. This function's whole job is to hand it
 * the bytes and report back honestly.
 */

import * as React from 'react';
import { redactInternals } from '@/lib/queryClient';
import { getAuthHeaders } from '@/utils/authToken';
import type { VaultClassification, VaultIngestDocumentType } from '@shared/constants/domain/vault-taxonomy';
import { vaultDocumentCodeForFile } from '@shared/constants/domain/vault-document-code';
export { VAULT_UPLOAD_ACCEPT } from '@shared/constants/document-intake-formats';

export interface VaultUploadOutcome {
  /** Files the server accepted and recorded. */
  succeeded: string[];
  /** The documents those files were recorded as, by the id the server returned
   *  (`document.id`), in the order sent. A response that names none adds none,
   *  so a surface that opens the document just uploaded opens one the server
   *  named, never one it guessed. */
  recorded: string[];
  /** Files it refused, each with the reason as the server phrased it. */
  failed: Array<{ name: string; reason: string }>;
  /** Per-file filing outcome, as the server stored it: the classifier's
   *  suggested dossier folder, or unfiled (visible review queue). */
  filings: Array<{ name: string; folderLabel: string | null; needsReview: boolean; placement: VaultPlacement }>;
  /** Files whose exact bytes the Vault already recorded at that code and
   *  version: nothing was changed, and `differs` says the upload asked for a
   *  title, type or classification other than the recorded one (VR-05);
   *  `filingDiffers`, present only when true, a folder, kind or CTD section
   *  (Part 11 review F3). */
  alreadyRecorded: Array<{ name: string; title: string; differs: boolean; filingDiffers?: true }>;
  /** Files refused because a different file is already recorded at that name
   *  (409 VERSION_CONTENT_CONFLICT). The surface can offer to add each as the
   *  next version of the recorded document (VR-09), so the File is kept. */
  conflicts: Array<{ name: string; file: File }>;
  /** Versions added to an existing document, with the version the server assigned. */
  newVersions: Array<{ name: string; version: string; title: string; folderLabel: string | null }>;
}

/**
 * What the person said about one file, row by row, before it was sent (gap 7.1,
 * docs/design/VEEVA_GAP_2026-10-22.md). Every field is one POST /api/vault/ingest
 * already validates: a blank one is not sent, and the server's default applies
 * (the title from the file name, classification INTERNAL, and a placement the
 * classifier suggests). A folder named here is recorded as a person's filing
 * ('confirmed'), and only with a folder are the evidence kind and CTD section
 * written, so they are sent only with one.
 *
 * No version is sent. A new document is 1.0, and every later version is
 * numbered by the Vault when it is added to its document (VR-08): a typed
 * version under an existing name would be recorded beside that document,
 * unlinked, and a non-numeric one would stop the Vault numbering it later
 * (Part 11 review, 2026-10-22).
 */
export interface VaultUploadFileFields {
  title?: string;
  documentType?: VaultIngestDocumentType;
  classification?: VaultClassification;
  folderId?: string;
  evidenceKind?: string;
  ctdSection?: string;
}

/** How the Vault recorded a file's folder: the person's filing, the classifier's proposal, or none. */
export type VaultPlacement = 'confirmed' | 'suggested' | 'unfiled';

/** Where one file of a batch stands, reported as each settles. */
export type VaultUploadFileStatus =
  | { state: 'uploading' }
  | { state: 'stored'; version: string | null; folderLabel: string | null; placement: VaultPlacement; already: boolean }
  | { state: 'refused'; reason: string };

export interface VaultUploadOptions {
  /**
   * What the user says the file IS — one of the ingest schema's types
   * (VAULT_INGEST_DOCUMENT_TYPES). When the caller offers no choice, the type
   * is recorded as OTHER rather than guessed from the extension: a file named
   * like a CSR is not grounds to FILE it as a CSR, and document type drives
   * downstream regulatory handling.
   */
  documentType?: VaultIngestDocumentType;
  /**
   * Add the file as the next version of this document (VR-08/09), naming it by
   * one of its versions. The server assigns the version and keeps the
   * document's code and filing, so no document code is sent, and the title is
   * the document's own.
   */
  newVersionOf?: { documentId: string; title: string };
  /** Per-file fields, in the order of `files`. Not used for a new version, which keeps its document's. */
  fields?: ReadonlyArray<VaultUploadFileFields | undefined>;
  /** Told as each file starts and settles, by its index in `files`. */
  onFileStatus?: (index: number, status: VaultUploadFileStatus) => void;
}

export interface VaultUploadState {
  uploading: boolean;
  /** The last outcome, as copy a surface can render directly. */
  note: { tone: 'ok' | 'error'; text: string } | null;
  clearNote: () => void;
  upload: (files: FileList | File[] | null, opts?: VaultUploadOptions) => Promise<VaultUploadOutcome>;
}

/** The default document type. See the note in `uploadOne`. */
const DEFAULT_DOCUMENT_TYPE: VaultIngestDocumentType = 'OTHER';

/** The ingest's filing fields; any other field a re-upload reports is a detail. */
const FILING_FIELDS = new Set(['folder_id', 'evidence_kind', 'ctd_section']);

/** A re-upload the Vault already held: which of its asks were not applied, details or filing. */
function alreadyRecordedOf(differs: Array<{ field?: unknown }>, title: string): { title: string; differs: boolean; filingDiffers?: true } {
  const filing = differs.some((d) => FILING_FIELDS.has(String(d.field)));
  return { title, differs: differs.some((d) => !FILING_FIELDS.has(String(d.field))), ...(filing ? { filingDiffers: true as const } : {}) };
}

/** What the user is told about files the Vault already held: nothing changed,
 *  and where a title, type, classification or filing differs, how to change it. */
function alreadyRecordedText(list: VaultUploadOutcome['alreadyRecorded']): string {
  if (list.length === 0) return '';
  const named = list.map((a) => `${a.name} (as "${a.title}")`).join('; ');
  const details = list.some((a) => a.differs)
    ? ' Its title, type or classification is changed with Edit details, not by uploading it again.'
    : '';
  const filing = list.some((a) => a.filingDiffers)
    ? ' Its folder, kind or CTD section is changed with Move in its filing, not by uploading it again.'
    : '';
  return `Already in the Vault, nothing changed: ${named}.${details}${filing}`;
}

/** The person's fields, as form entries: only what was given, and the filing details only with a folder. */
function appendFileFields(form: FormData, fields: VaultUploadFileFields | undefined): void {
  const given = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
  if (fields?.classification) form.append('classification', fields.classification);
  const folderId = given(fields?.folderId);
  if (!folderId) return;
  form.append('folderId', folderId);
  const kind = given(fields?.evidenceKind);
  if (kind) form.append('evidenceKind', kind);
  const section = given(fields?.ctdSection);
  if (section) form.append('ctdSection', section);
}

async function uploadOne(
  programId: string,
  file: File,
  documentType: VaultIngestDocumentType,
  newVersionOf?: VaultUploadOptions['newVersionOf'],
  fields?: VaultUploadFileFields,
): Promise<
  | {
      ok: true;
      folderLabel: string | null;
      needsReview: boolean;
      placement: VaultPlacement;
      already: { title: string; differs: boolean; filingDiffers?: true } | null;
      version: string | null;
      documentId: string | null;
    }
  | { ok: false; reason: string; code: string | null }
> {
  const form = new FormData();
  form.append('file', file);
  form.append('programId', programId);
  if (newVersionOf) {
    /* A check-in: the server finds the document by this version, assigns the
       next version and keeps its code, so neither is sent (a version is
       refused, VERSION_IS_ASSIGNED). */
    form.append('supersedesDocumentId', newVersionOf.documentId);
    form.append('documentTitle', newVersionOf.title);
  } else {
    /* The ingest schema requires a code, a title and a type. The filename is the
       only thing the user has actually told us, so it supplies the first two
       verbatim; the type is the caller's stated choice, defaulting to OTHER. */
    // The file name as uploaded: the same code the data room files this file under (QA-2026-10-08).
    form.append('documentCode', vaultDocumentCodeForFile(file.name, 'document'));
    form.append('documentTitle', fields?.title?.trim() || file.name.replace(/\.[^.]+$/, ''));
    appendFileFields(form, fields);
  }
  form.append('documentType', fields?.documentType ?? documentType);

  let res: Response;
  try {
    res = await fetch('/api/vault/ingest', {
      method: 'POST',
      body: form,
      credentials: 'include',
      /* THE UPLOAD COULD NOT AUTHENTICATE WITHOUT THIS.
         `/api/vault/ingest` is mounted behind `authMiddleware`
         (server/bootstrap/register-inline-routes.ts), whose header reads
         "Validates Bearer JWT tokens only" and which answers a request with no
         Authorization header `401 { error: 'Bearer token required' }`. It reads
         `req.headers.authorization` and has no cookie fallback, so
         `credentials: 'include'` alone never authenticated this request — every
         upload through this hook was refused, on all three of its callers (the
         v2 Vault, the MDX Document vault, the MDX pathway attach).

         The irony worth recording: Etmf.tsx's hand-rolled copy of this request
         — the one the assessment recommended deleting in favour of this hook —
         sent these headers and was the only upload path that worked.

         NO Content-Type here, deliberately: the browser must set it so the
         multipart boundary is generated, and naming it produces a body the
         server cannot parse. `getAuthHeaders()` sets only Authorization and
         x-organization-id. */
      headers: { ...getAuthHeaders() },
    });
  } catch {
    /* A transport failure, not a server refusal. The distinction matters: the
       user can retry this one, and nothing was filed. */
    return { ok: false, reason: 'the connection dropped before the file was sent', code: null };
  }

  if (res.ok) {
    /* The ingest response reports the filing outcome the server stored — the
       suggested dossier folder (auto-filed, awaiting confirmation) or unfiled.
       Read, never assumed: a missing block reads as no placement reported. */
    const body = (await res.json().catch(() => null)) as
      | {
          filing?: { folderLabel?: string; folderId?: string | null; needsReview?: boolean; placementStatus?: string };
          document?: { id?: unknown; documentTitle?: string; version?: string };
          reupload?: { differs?: Array<{ field?: unknown }> };
        }
      | null;
    const filing = body?.filing;
    return {
      ok: true,
      folderLabel: filing?.folderId ? filing.folderLabel || filing.folderId : null,
      needsReview: Boolean(filing?.needsReview ?? !filing?.folderId),
      /* The server's own word for the placement. A body that predates it reads
         as the classifier's: a suggestion when a folder is named, else unfiled. */
      placement: filing?.placementStatus === 'confirmed' ? 'confirmed' : filing?.folderId ? 'suggested' : 'unfiled',
      already: body?.reupload ? alreadyRecordedOf(body.reupload.differs ?? [], body.document?.documentTitle || file.name) : null,
      version: body?.document?.version ?? null,
      documentId: typeof body?.document?.id === 'string' && body.document.id ? body.document.id : null,
    };
  }

  const body = (await res.json().catch(() => null)) as
    | { error?: { message?: string; code?: string } | string; message?: string }
    | null;
  const err = body?.error;
  const raw =
    (typeof err === 'object' && err ? err.message : undefined) ??
    body?.message ??
    (typeof err === 'string' ? err : undefined);
  /* Through the internals filter before it can reach a screen. The ingest route
     answers a refused upload with a real sentence, but a proxy, a body-size
     limit or an unhandled throw can put something else on this path, and this
     string is rendered verbatim. */
  return {
    ok: false,
    reason: redactInternals(raw, `the server refused it (HTTP ${res.status})`),
    code: typeof err === 'object' && err && typeof err.code === 'string' ? err.code : null,
  };
}

/** The batch's one-line outcome: where each file landed, or which were refused and why. */
function outcomeNote(outcome: VaultUploadOutcome): NonNullable<VaultUploadState['note']> {
  if (outcome.failed.length === 0) {
    /* Say where each file LANDED, not merely that bytes arrived — the
       filing outcome is the server's own record. A folder the person
       chose is their filing; an auto-filed placement is a suggestion
       until confirmed, and the copy says which (Part 11 review, 2026-10-22). */
    const chosen = outcome.filings.filter((f) => f.folderLabel && f.placement === 'confirmed');
    const placed = outcome.filings.filter((f) => f.folderLabel && f.placement !== 'confirmed');
    const unplaced = outcome.filings.filter((f) => !f.folderLabel).length;
    const chosenText =
      chosen.length > 0
        ? `Filed ${chosen.map((f) => `${f.name} → ${f.folderLabel}`).join('; ')}, as you chose. `
        : '';
    const placedText =
      chosenText +
      (placed.length > 0
        ? `Auto-filed ${placed
            .map((f) => `${f.name} → ${f.folderLabel}`)
            .join('; ')} — suggested until confirmed.`
        : '');
    const unplacedText =
      unplaced > 0
        ? ` ${unplaced} landed in Unfiled — the classifier could not place ${unplaced === 1 ? 'it' : 'them'}; review where ${unplaced === 1 ? 'it belongs' : 'they belong'}.`
        : '';
    const n = outcome.filings.length;
    const filedText =
      placedText || unplacedText
        ? `${placedText}${unplacedText}`.trim()
        : n > 0 ? `Filed ${n} document${n === 1 ? '' : 's'} to the vault.` : '';
    const versionText = outcome.newVersions
      .map(
        (v) =>
          `Added ${v.name} to "${v.title}" as ${v.version ? `v${v.version}` : 'a new version (number not reported)'}. ` +
          `It keeps the document's filing${v.folderLabel ? ` (${v.folderLabel})` : ''}, and the earlier versions stay in the Vault.`,
      )
      .join(' ');
    return { tone: 'ok', text: `${versionText} ${filedText} ${alreadyRecordedText(outcome.alreadyRecorded)}`.trim() };
  }
  return {
    tone: 'error',
    text:
      (outcome.succeeded.length ? `Filed ${outcome.succeeded.length}. ` : '') +
      `Not filed: ${outcome.failed.map((f) => `${f.name} — ${f.reason}`).join('; ')}. ` +
      'Nothing partial was recorded for those.',
  };
}

/**
 * @param programId The regulatory program to file under. Uploading is disabled
 *   while this is null — every vault document is program-scoped, and the server
 *   would refuse an unscoped one anyway.
 */
export function useVaultUpload(programId: string | null | undefined): VaultUploadState {
  const [uploading, setUploading] = React.useState(false);
  const [note, setNote] = React.useState<VaultUploadState['note']>(null);

  const upload = React.useCallback(
    async (files: FileList | File[] | null, opts?: VaultUploadOptions): Promise<VaultUploadOutcome> => {
      const list = files ? Array.from(files as ArrayLike<File>) : [];
      const empty: VaultUploadOutcome = { succeeded: [], recorded: [], failed: [], filings: [], alreadyRecorded: [], conflicts: [], newVersions: [] };
      if (list.length === 0) return empty;
      if (!programId) {
        setNote({
          tone: 'error',
          text: 'Open a project first — every vault document is filed against one.',
        });
        return empty;
      }

      setUploading(true);
      setNote(null);
      const outcome: VaultUploadOutcome = { succeeded: [], recorded: [], failed: [], filings: [], alreadyRecorded: [], conflicts: [], newVersions: [] };
      try {
        /* Sequential, deliberately. These are 50 MB-capped uploads that each
           run a virus scan and a text extraction server-side; firing a whole
           drop-zone's worth in parallel is how one user stalls the pool. */
        for (const [index, file] of list.entries()) {
          opts?.onFileStatus?.(index, { state: 'uploading' });
          const r = await uploadOne(
            programId, file, opts?.documentType ?? DEFAULT_DOCUMENT_TYPE, opts?.newVersionOf,
            opts?.newVersionOf ? undefined : opts?.fields?.[index],
          );
          opts?.onFileStatus?.(index, r.ok
            ? { state: 'stored', version: r.version, folderLabel: r.folderLabel, placement: r.placement, already: Boolean(r.already) }
            : { state: 'refused', reason: r.reason });
          if (r.ok && r.documentId) outcome.recorded.push(r.documentId);
          if (r.ok && r.already) {
            outcome.succeeded.push(file.name);
            outcome.alreadyRecorded.push({ name: file.name, ...r.already });
          } else if (r.ok && opts?.newVersionOf) {
            outcome.succeeded.push(file.name);
            outcome.newVersions.push({
              name: file.name,
              version: r.version ?? '',
              title: opts.newVersionOf.title,
              folderLabel: r.folderLabel,
            });
          } else if (r.ok) {
            outcome.succeeded.push(file.name);
            outcome.filings.push({
              name: file.name,
              folderLabel: r.folderLabel,
              needsReview: r.needsReview,
              placement: r.placement,
            });
          } else {
            outcome.failed.push({ name: file.name, reason: r.reason });
            if (r.code === 'VERSION_CONTENT_CONFLICT') outcome.conflicts.push({ name: file.name, file });
          }
        }

        setNote(outcomeNote(outcome));
      } finally {
        setUploading(false);
      }
      return outcome;
    },
    [programId],
  );

  const clearNote = React.useCallback(() => setNote(null), []);
  return { uploading, note, clearNote, upload };
}
