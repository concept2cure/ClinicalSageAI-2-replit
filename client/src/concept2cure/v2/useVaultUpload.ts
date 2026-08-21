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

export interface VaultUploadOutcome {
  /** Files the server accepted and recorded. */
  succeeded: string[];
  /** Files it refused, each with the reason as the server phrased it. */
  failed: Array<{ name: string; reason: string }>;
}

export interface VaultUploadState {
  uploading: boolean;
  /** The last outcome, as copy a surface can render directly. */
  note: { tone: 'ok' | 'error'; text: string } | null;
  clearNote: () => void;
  upload: (files: FileList | File[] | null) => Promise<VaultUploadOutcome>;
}

/** The default document type. See the note in `uploadOne`. */
const DEFAULT_DOCUMENT_TYPE = 'OTHER';

async function uploadOne(programId: string, file: File): Promise<{ ok: true } | { ok: false; reason: string }> {
  const form = new FormData();
  form.append('file', file);
  form.append('programId', programId);
  /* The ingest schema requires a code, a title and a type. The filename is the
     only thing the user has actually told us, so it supplies the first two
     verbatim and the type is recorded as OTHER rather than guessed from the
     extension — a file named like a CSR is not grounds to FILE it as a CSR, and
     document type drives downstream regulatory handling. Both are editable on
     the document once it lands. */
  form.append('documentCode', file.name);
  form.append('documentTitle', file.name.replace(/\.[^.]+$/, ''));
  form.append('documentType', DEFAULT_DOCUMENT_TYPE);

  let res: Response;
  try {
    res = await fetch('/api/vault/ingest', {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
  } catch {
    /* A transport failure, not a server refusal. The distinction matters: the
       user can retry this one, and nothing was filed. */
    return { ok: false, reason: 'the connection dropped before the file was sent' };
  }

  if (res.ok) return { ok: true };

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
    async (files: FileList | File[] | null): Promise<VaultUploadOutcome> => {
      const list = files ? Array.from(files as ArrayLike<File>) : [];
      const empty: VaultUploadOutcome = { succeeded: [], failed: [] };
      if (list.length === 0) return empty;
      if (!programId) {
        setNote({
          tone: 'error',
          text: 'Open a program first — every vault document is filed against one.',
        });
        return empty;
      }

      setUploading(true);
      setNote(null);
      const outcome: VaultUploadOutcome = { succeeded: [], failed: [] };
      try {
        /* Sequential, deliberately. These are 50 MB-capped uploads that each
           run a virus scan and a text extraction server-side; firing a whole
           drop-zone's worth in parallel is how one user stalls the pool. */
        for (const file of list) {
          const r = await uploadOne(programId, file);
          if (r.ok) outcome.succeeded.push(file.name);
          else outcome.failed.push({ name: file.name, reason: r.reason });
        }

        if (outcome.failed.length === 0) {
          const n = outcome.succeeded.length;
          setNote({ tone: 'ok', text: `Filed ${n} document${n === 1 ? '' : 's'} to the vault.` });
        } else {
          setNote({
            tone: 'error',
            text:
              (outcome.succeeded.length ? `Filed ${outcome.succeeded.length}. ` : '') +
              `Not filed: ${outcome.failed.map((f) => `${f.name} — ${f.reason}`).join('; ')}. ` +
              'Nothing partial was recorded for those.',
          });
        }
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
