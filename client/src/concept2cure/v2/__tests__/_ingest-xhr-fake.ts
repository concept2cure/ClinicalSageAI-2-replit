/**
 * A fake XMLHttpRequest for the Vault ingest request (`vaultIngestTransport.ts`).
 * Not a test file — the runners match *.test.ts(x).
 *
 * `stubIngestXhr(answer)` hands every request to `answer(url, init)`, the
 * signature a `fetch` mock has, with `init` carrying the method, the body, the
 * headers set and `credentials` ('include' when `withCredentials` is set).
 * Before the reply it reports the body going out, by default half and then all
 * of it, as the browser does; `steps` are other fractions to report. An
 * `answer` that throws is a dropped connection.
 */
import { vi } from 'vitest';
import type { ReuploadChange, ReuploadDiffer } from '../../../../../server/services/vault/vault-reupload';

export interface IngestInit {
  method: string;
  body: unknown;
  headers: Record<string, string>;
  credentials: 'include' | 'same-origin';
}
export type IngestAnswer = (url: string, init: IngestInit) => Promise<{ ok?: boolean; status: number; json: () => Promise<unknown> }>;

/** Explicit synthetic success receipt, shaped by the real ingest constructor. */
interface ReceiptOverrides {
  document?: Partial<{ id: string; programId: string; documentCode: string; documentTitle: string | null; version: string;
    extraction: 'extracted' | 'pending' | 'failed' }>;
  filing?: Partial<{ folderId: string | null; folderLabel: string | null;
    placementStatus: 'confirmed' | 'suggested' | 'unfiled'; needsReview: boolean }>;
  reupload?: { unchanged: boolean; changes: ReuploadChange[]; differs: ReuploadDiffer[] };
}

let receiptSerial = 0;

/** Build only when a test explicitly declares a recorded response; malformed bodies stay untouched. */
export function ingestReceipt(form: FormData, overrides: ReceiptOverrides = {}) {
  receiptSerial += 1;
  const folderId = String(form.get('folderId') || '') || null;
  return {
    success: true,
    document: {
      id: `77777777-7777-4777-8777-${String(receiptSerial).padStart(12, '0')}`,
      programId: String(form.get('programId')),
      documentCode: String(form.get('documentCode') || 'retained-document.pdf'),
      documentTitle: String(form.get('documentTitle') || 'Uploaded document'),
      version: '1.0',
      extraction: 'extracted' as const,
      ...overrides.document,
    },
    filing: {
      folderId,
      folderLabel: folderId || '',
      placementStatus: folderId ? 'confirmed' as const : 'unfiled' as const,
      needsReview: !folderId,
      ...overrides.filing,
    },
    ...(overrides.reupload ? { reupload: overrides.reupload } : {}),
  };
}

/** The total each fake request reports sending, in bytes. */
export const FAKE_BODY_BYTES = 2_000_000;

export function stubIngestXhr<A extends IngestAnswer>(answer: A, steps: number[] = [0.5, 1]): A {
  class FakeXhr {
    status = 0;
    responseText = '';
    withCredentials = false;
    upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    private method = 'GET';
    private url = '';
    private headers: Record<string, string> = {};
    open(method: string, url: string) { this.method = method; this.url = url; }
    setRequestHeader(name: string, value: string) { this.headers[name] = value; }
    send(body: unknown) {
      void (async () => {
        for (const step of steps) {
          await Promise.resolve();
          this.upload.onprogress?.({ lengthComputable: true, loaded: Math.round(step * FAKE_BODY_BYTES), total: FAKE_BODY_BYTES });
        }
        let reply: Awaited<ReturnType<IngestAnswer>>;
        try {
          reply = await answer(this.url, {
            method: this.method, body, headers: { ...this.headers }, credentials: this.withCredentials ? 'include' : 'same-origin',
          });
        } catch {
          this.onerror?.();
          return;
        }
        this.status = reply.status;
        this.responseText = JSON.stringify(await reply.json().catch(() => null));
        this.onload?.();
      })();
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return answer;
}
