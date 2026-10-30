/**
 * The Vault ingest request, with the bytes sent so far (MR-08 Stage 6 step 2).
 *
 * A 50 MB protocol or CSR takes long enough to send that a row saying only
 * "Uploading…" reads as stalled, and people cancel and send it again. `fetch`
 * reports no upload progress, so the one ingest request goes through
 * XMLHttpRequest, whose `upload.onprogress` does. The reply has the shape
 * `useVaultUpload` reads: `ok`, `status` and `json()`.
 */

export interface IngestReply {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/** Bytes of the request body sent, of its total, as the browser counts them. */
export type IngestProgress = (sent: number, total: number) => void;

export const VAULT_INGEST_URL = '/api/vault/ingest';

/**
 * No reply came. `afterSending` says whether every byte had gone out first: if
 * it had, the server may have recorded the file before the reply was lost, so
 * the outcome is not known rather than "not recorded".
 */
export class IngestNoReply extends Error {
  constructor(readonly afterSending: boolean) {
    super(afterSending ? 'no reply came after the file was sent' : 'the connection dropped before the file was sent');
    this.name = 'IngestNoReply';
  }
}

/**
 * POST `form` to the ingest route with `headers`, telling `onProgress` as the
 * body goes out. Rejects with `IngestNoReply` only when the request got no
 * reply (the connection dropped, or the browser refused it); a refusal from
 * the server is a reply, with its status and body.
 */
export function sendIngest(form: FormData, headers: Record<string, string>, onProgress?: IngestProgress): Promise<IngestReply> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', VAULT_INGEST_URL);
    // The session cookie travels as it did with `credentials: 'include'`.
    xhr.withCredentials = true;
    /* Authorization and x-organization-id only. Never a Content-Type: the
       browser must write the multipart boundary itself. */
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    let sentAll = false;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      if (e.total > 0 && e.loaded >= e.total) sentAll = true;
      onProgress?.(e.loaded, e.total);
    };
    xhr.upload.onload = () => { sentAll = true; };
    xhr.onload = () => {
      const text = xhr.responseText;
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => JSON.parse(text),
      });
    };
    const dropped = () => reject(new IngestNoReply(sentAll));
    xhr.onerror = dropped;
    xhr.onabort = dropped;
    xhr.ontimeout = dropped;
    xhr.send(form);
  });
}
