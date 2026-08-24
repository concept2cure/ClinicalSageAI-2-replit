/**
 * Saving a file the browser already holds — the ONE implementation.
 *
 * Sixteen surfaces had written this same eight-line dance independently
 * (createObjectURL → anchor → click → remove → revokeObjectURL), and they had
 * drifted in the ways an un-owned primitive always drifts: some revoked the
 * object URL synchronously right after `click()` (which races the download in
 * Safari and can produce a zero-byte file), some never revoked it at all
 * (leaking the blob for the life of the tab), some appended the anchor to the
 * document and some did not (Firefox ignores a click on a detached anchor).
 *
 * A user-visible download is not a place for sixteen slightly different
 * answers, so this module owns the primitive and the filename sanitiser that
 * always travelled with it.
 *
 * @module client/src/concept2cure/v2/download
 */

/**
 * A filename that survives Content-Disposition, every filesystem, and the
 * user's shell. Everything outside `[A-Za-z0-9_.-]` collapses to `_`, runs
 * collapse to one, and leading/trailing separators are trimmed — so a section
 * heading or a document title can be handed here directly.
 *
 * Returns `fallback` when nothing printable survives (a title that was all
 * punctuation, or empty).
 */
export function safeFileName(raw: string, fallback = 'download'): string {
  const cleaned = String(raw ?? '')
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '');
  return cleaned || fallback;
}

/**
 * Hand `blob` to the browser as a download named `filename`.
 *
 * The object URL is revoked on a timer rather than immediately after the
 * click: revoking synchronously invalidates the URL before some browsers have
 * finished reading the blob, which is how a "download" turns into an empty
 * file. One second is well past the point the fetch has been handed off.
 *
 * Returns false when the environment has no DOM or refuses the operation
 * (a sandboxed iframe, a jsdom test without URL.createObjectURL) so the caller
 * can say so rather than silently reporting success.
 */
export function downloadBlob(filename: string, blob: Blob): boolean {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return false;
  let url: string | null = null;
  try {
    url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    if (url) URL.revokeObjectURL(url);
    return false;
  } finally {
    if (url) {
      const dead = url;
      setTimeout(() => URL.revokeObjectURL(dead), 1000);
    }
  }
}

/** `downloadBlob` for text a surface assembled itself (CSV, XML, JSON). */
export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): boolean {
  return downloadBlob(filename, new Blob([text], { type: mime }));
}

/**
 * Serialise rows to RFC 4180 CSV.
 *
 * Four surfaces had written this same escape-and-join by hand
 * (`.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')` joined on
 * CRLF), which is correct — and correct four times is still four places for
 * the fifth one to get it wrong. Every value is quoted unconditionally, so a
 * comma, a quote or a newline inside a cell cannot break the row, and
 * null/undefined render as empty rather than as the words "null"/"undefined".
 */
export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers, ...rows].map((line) => line.map(cell).join(',')).join('\r\n');
}

/** Build a CSV and hand it to the browser. */
export function downloadCsv(
  filename: string,
  headers: readonly string[],
  rows: ReadonlyArray<readonly unknown[]>,
): boolean {
  return downloadText(filename, toCsv(headers, rows), 'text/csv;charset=utf-8');
}

/**
 * Download a base64 payload the server returned inline (the mdx export hooks'
 * `{ data, mime_type, filename }` shape). Decoding lived in two byte-identical
 * `triggerDownload` copies in sibling hooks.
 */
export function downloadBase64(filename: string, base64: string, mime: string): boolean {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return downloadBlob(filename, new Blob([bytes], { type: mime }));
}
