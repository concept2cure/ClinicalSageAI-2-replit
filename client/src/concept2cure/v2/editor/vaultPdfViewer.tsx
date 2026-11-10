/**
 * The in-browser PDF viewer over the audited Vault download: one
 * implementation for every surface that shows a Vault file. Those are the
 * editor's Project files rail and Project home's Evidence (ProjectFilesPanel.tsx),
 * and the Vault surface's Versions (Vault.tsx, gap 3.1 of
 * docs/design/VEEVA_GAP_2026-10-22.md).
 *
 * ── What it does ─────────────────────────────────────────────────────────────
 *   - The file is fetched through the Vault's audited download route, which
 *     records the download and verifies the stored bytes against their
 *     recorded hash before serving them.
 *   - Bytes that begin %PDF are framed, typed application/pdf (pdfBytes.ts,
 *     SEC-A-3). Anything else is downloaded, and the caller is told why.
 *   - The object URL is owned in one place and released when the file
 *     changes, when the viewer closes and when the surface unmounts.
 *   - The frame is not sandboxed: Chromium's PDF viewer refuses a sandboxed
 *     frame of any value, and a `csp` attribute stops its own script
 *     (Chromium 141, checked 2026-09-28). What makes it safe is its input.
 *   - The served policy allows the frame with `frame-src 'self' blob:`
 *     (server/middleware/enterprise-security.ts, proven in a real Chromium in
 *     docs/evidence/D3/2026-10-22-pdf-viewer-csp/).
 *
 * @module client/src/concept2cure/v2/editor/vaultPdfViewer
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { downloadBlob, safeFileName } from '../download';
import { pdfViewerBlob, type PdfViewerBlob } from './pdfBytes';

/** What the viewer needs of a file: its title, and the hash its record holds. */
export interface ViewableFile { title: string; hash?: string | null }

/** One audited download, classified: a PDF for the viewer, bytes for the
 *  browser with the reason they were not shown, or the Vault's refusal. */
export type OpenedFile =
  | { kind: 'pdf'; blob: PdfViewerBlob; hash: string | null }
  | { kind: 'download'; blob: Blob; name: string; why: string }
  | { kind: 'refused'; message: string };

/** One response header, tolerant of a response that carries no `headers` at all. */
export function responseHeader(res: Response, name: string): string | null {
  return res.headers?.get?.(name) ?? null;
}

/** Whether the file says it is a PDF. What is framed is decided by the bytes;
 *  this only words why a claimed PDF was downloaded instead. */
export function claimsToBePdf(mime: string, title: string): boolean {
  return /pdf/i.test(mime) || /\.pdf$/i.test(title);
}

/** The reason given when a file says it is a PDF and its bytes are not. */
export const CLAIMED_PDF_NOT_SHOWN = 'it is named or typed as a PDF, but its contents are not a PDF, so it is not shown here';

/** The Vault's own filename for a download, or a safe name made from the title. */
export function downloadNameFor(res: Response, title: string): string {
  const fromHeader = responseHeader(res, 'Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1];
  return fromHeader ?? safeFileName(title, 'document');
}

/** One download through the Vault's audited route, classified, so the caller
 *  decides what to do with the file without re-reading headers and types. */
export async function downloadVaultFile(programId: string, docId: string, file: ViewableFile): Promise<OpenedFile> {
  const path = `/api/c2c/project-vault/${encodeURIComponent(programId)}/documents/${encodeURIComponent(docId)}/download`;
  const res = await apiRequest('GET', path);
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    return { kind: 'refused', message: serverMessage(j) ?? `the vault refused it (HTTP ${res.status})` };
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const pdf = pdfViewerBlob(bytes);
  if (pdf) return { kind: 'pdf', blob: pdf, hash: responseHeader(res, 'X-Content-SHA256') ?? file.hash ?? null };
  const mime = responseHeader(res, 'Content-Type') ?? '';
  const name = downloadNameFor(res, file.title);
  // What the file claims: its served type, its title, or the name the Vault serves it under.
  const claimed = claimsToBePdf(mime, file.title) || claimsToBePdf('', name);
  const why = claimed ? CLAIMED_PDF_NOT_SHOWN : 'the viewer here shows PDFs only';
  return { kind: 'download', blob: new Blob([bytes], { type: mime }), name, why };
}

/** How a surface reports what happened: a toast on the rail, the banner on Vault. */
export type ReportOutcome = (text: string, tone: 'ok' | 'error') => void;

/** The other half of opening a file: show it, hand it over, or say why it did not open. */
export function presentOpenedFile<T extends ViewableFile>(opts: {
  file: OpenedFile; doc: T; report: ReportOutcome;
  showPdf: (doc: T, blob: PdfViewerBlob, hash: string | null) => void;
}): void {
  const { file, doc, report, showPdf } = opts;
  if (file.kind === 'refused') return report(`${doc.title} was not opened — ` + file.message + '.', 'error');
  if (file.kind === 'pdf') return showPdf(doc, file.blob, file.hash);
  const ok = downloadBlob(file.name, file.blob);
  report(
    ok ? `Downloaded ${doc.title} — ${file.why}.`
      : `${doc.title} was fetched but the browser refused the download.`,
    ok ? 'ok' : 'error',
  );
}

declare const PDF_VIEWER_URL: unique symbol;
/** An object URL of a PdfViewerBlob, minted by useVaultPdfViewer: the only URL PdfFrame frames. */
export type PdfViewerUrl = string & { readonly [PDF_VIEWER_URL]: true };

/** The open PDF: the file it came from, its object URL, and the served hash. */
export interface ViewerState<T extends ViewableFile> { doc: T; url: PdfViewerUrl; hash: string | null }

/** The viewer's object URL, owned in one place: released when the file
 *  changes, when the viewer closes and when the surface unmounts, so a long
 *  session does not accumulate PDFs in memory. */
export function useVaultPdfViewer<T extends ViewableFile>() {
  const [viewer, setViewer] = useState<ViewerState<T> | null>(null);
  const viewerUrlRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
  }, []);

  /* `blob` is pdfViewerBlob's: bytes that begin %PDF, typed application/pdf. */
  const showPdf = useCallback((doc: T, blob: PdfViewerBlob, hash: string | null) => {
    if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
    const url = URL.createObjectURL(blob) as PdfViewerUrl;
    viewerUrlRef.current = url;
    setViewer({ doc, url, hash });
  }, []);

  const closeViewer = useCallback(() => {
    if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
    viewerUrlRef.current = null;
    setViewer(null);
  }, []);

  return { viewer, showPdf, closeViewer };
}

/** The served hash and the frame: what every surface's viewer pane shows. */
export function PdfFrame({ title, url, hash }: { title: string; url: PdfViewerUrl; hash: string | null }) {
  return (
    <>
      {hash && (
        <div className="pf-viewer-hash" title={`SHA-256 ${hash}`}>
          SHA-256 {hash.slice(0, 16)}… — verified against the vault record before it was served
        </div>
      )}
      <iframe className="pf-viewer-frame" src={url} title={`${title} — PDF viewer`} />
    </>
  );
}
