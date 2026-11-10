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
 *   - A Word version has a PDF rendition (P-107 item 3), fetched through the
 *     same route with `?rendition=pdf`. It is framed under the same bytes
 *     rule, only when the Vault marks it as a rendition and names the source
 *     it was made from, and the pane says what it is: a copy for reading, not
 *     the filed document.
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
import { extensionOf } from '@shared/constants/upload-name-bindings';
import { downloadBlob, safeFileName } from '../download';
import { pdfViewerBlob, type PdfViewerBlob } from './pdfBytes';

/** What the viewer needs of a file: its title, and the hash its record holds. */
export interface ViewableFile { title: string; hash?: string | null }

/** What a framed PDF is when it is not the version's own file: a rendition made from it (P-107 item 3). */
export interface RenditionFacts {
  /** SHA-256 of the source file it was made from, as the Vault named it. */
  sourceSha256: string;
  /** SHA-256 of the rendition's own bytes, when the Vault named it. */
  sha256: string | null;
}

/** One audited download, classified: a PDF for the viewer (the version's own
 *  file, or its rendition), bytes for the browser with the reason they were
 *  not shown, or the Vault's refusal with its code. */
export type OpenedFile =
  | { kind: 'pdf'; blob: PdfViewerBlob; hash: string | null; rendition?: RenditionFacts }
  | { kind: 'download'; blob: Blob; name: string; why: string }
  | { kind: 'refused'; message: string; code?: string };

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

/** The Vault's audited download route for one version. */
function vaultDownloadPath(programId: string, docId: string): string {
  return `/api/c2c/project-vault/${encodeURIComponent(programId)}/documents/${encodeURIComponent(docId)}/download`;
}

/** The Vault's refusal of a download, in its own words, with its code. */
async function vaultRefusal(res: Response): Promise<OpenedFile> {
  const j = await res.json().catch(() => null);
  const code = (j as { error?: unknown } | null)?.error;
  return {
    kind: 'refused',
    message: serverMessage(j) ?? `the vault refused it (HTTP ${res.status})`,
    ...(typeof code === 'string' ? { code } : {}),
  };
}

/** One download through the Vault's audited route, classified, so the caller
 *  decides what to do with the file without re-reading headers and types. */
export async function downloadVaultFile(programId: string, docId: string, file: ViewableFile): Promise<OpenedFile> {
  const res = await apiRequest('GET', vaultDownloadPath(programId, docId));
  if (!res.ok) return vaultRefusal(res);
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

/** Whether a file is named as a Word document, the one format the Vault makes a PDF rendition from. */
export function namedAsWord(fileName: string): boolean {
  return extensionOf(fileName) === '.docx';
}

/** The code the Vault refuses a rendition with when the version is already a PDF. */
export const RENDITION_NOT_NEEDED = 'RENDITION_NOT_NEEDED';
/** The reason given when a response is not marked as a rendition, or names no source. */
export const RENDITION_UNNAMED = 'the Vault did not say what it was made from, so it is not shown as a rendition';
/** The reason given when what came back as a rendition is not PDF bytes. */
export const RENDITION_NOT_A_PDF = 'what the Vault sent as a rendition is not a PDF, so it is not shown';

/**
 * The PDF rendition of a version (P-107 item 3), through the same audited
 * route with `?rendition=pdf`. The Vault makes it from the version's verified
 * bytes and names the source SHA-256 it was made from. Only a response the
 * Vault marks as a rendition, naming that source, with bytes that begin %PDF,
 * is a PDF for the viewer. Anything else is a refusal that says why.
 */
export async function fetchVaultRendition(programId: string, docId: string): Promise<OpenedFile> {
  const res = await apiRequest('GET', `${vaultDownloadPath(programId, docId)}?rendition=pdf`);
  if (!res.ok) return vaultRefusal(res);
  const sourceSha256 = responseHeader(res, 'X-Rendition-Source-SHA256');
  if (responseHeader(res, 'X-Vault-Rendition') !== 'pdf' || !sourceSha256) return { kind: 'refused', message: RENDITION_UNNAMED };
  const pdf = pdfViewerBlob(new Uint8Array(await res.arrayBuffer()));
  if (!pdf) return { kind: 'refused', message: RENDITION_NOT_A_PDF };
  return { kind: 'pdf', blob: pdf, hash: null, rendition: { sourceSha256, sha256: responseHeader(res, 'X-Rendition-SHA256') } };
}

/** A reason without its closing full stop, for a sentence that supplies its own. */
export function withoutFullStop(text: string): string {
  return text.replace(/[.\s]+$/, '');
}

/** How a surface reports what happened: a toast on the rail, the banner on Vault. */
export type ReportOutcome = (text: string, tone: 'ok' | 'error') => void;

/** The other half of opening a file: show it, hand it over, or say why it did not open. */
export function presentOpenedFile<T extends ViewableFile>(opts: {
  file: OpenedFile; doc: T; report: ReportOutcome;
  showPdf: (doc: T, blob: PdfViewerBlob, hash: string | null, rendition?: RenditionFacts) => void;
}): void {
  const { file, doc, report, showPdf } = opts;
  if (file.kind === 'refused') return report(`${doc.title} was not opened — ` + withoutFullStop(file.message) + '.', 'error');
  if (file.kind === 'pdf') return showPdf(doc, file.blob, file.hash, file.rendition);
  const ok = downloadBlob(file.name, file.blob);
  report(
    ok ? `Downloaded ${doc.title} — ${withoutFullStop(file.why)}.`
      : `${doc.title} was fetched but the browser refused the download.`,
    ok ? 'ok' : 'error',
  );
}

declare const PDF_VIEWER_URL: unique symbol;
/** An object URL of a PdfViewerBlob, minted by useVaultPdfViewer: the only URL PdfFrame frames. */
export type PdfViewerUrl = string & { readonly [PDF_VIEWER_URL]: true };

/** The open PDF: the file it came from, its object URL, the served hash, and
 *  what it is a rendition of when it is not the file itself. */
export interface ViewerState<T extends ViewableFile> { doc: T; url: PdfViewerUrl; hash: string | null; rendition?: RenditionFacts | null }

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
  const showPdf = useCallback((doc: T, blob: PdfViewerBlob, hash: string | null, rendition?: RenditionFacts) => {
    if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
    const url = URL.createObjectURL(blob) as PdfViewerUrl;
    viewerUrlRef.current = url;
    setViewer({ doc, url, hash, rendition: rendition ?? null });
  }, []);

  const closeViewer = useCallback(() => {
    if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
    viewerUrlRef.current = null;
    setViewer(null);
  }, []);

  return { viewer, showPdf, closeViewer };
}

/** What a framed rendition is, said above it: of which version, made from which source, and not the record. */
function RenditionNote({ title, rendition }: { title: string; rendition: RenditionFacts }) {
  const own = rendition.sha256;
  return (
    <div
      className="pf-viewer-hash" role="note" data-testid="vault-rendition-note"
      title={`Source SHA-256 ${rendition.sourceSha256}${own ? `. Rendition SHA-256 ${own}` : ''}`}
    >
      PDF rendition of {title}, made from the source file with SHA-256 {rendition.sourceSha256.slice(0, 16)}…. This
      is a copy for reading, not the filed document. Download the version for the source
      file.{own ? ` Rendition SHA-256 ${own.slice(0, 16)}….` : ''}
    </div>
  );
}

/** The served hash and the frame: what every surface's viewer pane shows. A
 *  rendition carries its own note in place of the hash line, which is about
 *  the record's bytes. */
export function PdfFrame({ title, url, hash, rendition }: {
  title: string; url: PdfViewerUrl; hash: string | null; rendition?: RenditionFacts | null;
}) {
  return (
    <>
      {rendition && <RenditionNote title={title} rendition={rendition} />}
      {!rendition && hash && (
        <div className="pf-viewer-hash" title={`SHA-256 ${hash}`}>
          SHA-256 {hash.slice(0, 16)}… — verified against the vault record before it was served
        </div>
      )}
      <iframe className="pf-viewer-frame" src={url} title={rendition ? `${title} — PDF rendition` : `${title} — PDF viewer`} />
    </>
  );
}
