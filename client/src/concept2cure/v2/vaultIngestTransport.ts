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

/** A complete send without a reply cannot establish whether the server recorded it. */
export class IngestUnconfirmedError extends Error {
  constructor() {
    super('all bytes were sent, but no reply arrived');
    this.name = 'IngestUnconfirmedError';
  }
}

/** Bytes of the request body sent, of its total, as the browser counts them. */
export type IngestProgress = (sent: number, total: number) => void;

export const VAULT_INGEST_URL = '/api/vault/ingest';

/**
 * POST `form` to the ingest route with `headers`, telling `onProgress` as the
 * body goes out. Rejects only when the request never got a reply (the
 * connection dropped, or the browser refused it); a refusal from the server is
 * a reply, with its status and body.
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
    // Upload completion also covers browsers whose progress total was not available.
    xhr.upload.onload = () => { sentAll = true; };
    xhr.onload = () => {
      const text = xhr.responseText;
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => JSON.parse(text),
      });
    };
    const dropped = () => reject(sentAll ? new IngestUnconfirmedError() : new Error('the connection dropped before the file was sent'));
    xhr.onerror = dropped;
    xhr.onabort = dropped;
    xhr.ontimeout = dropped;
    xhr.send(form);
  });
}
