// @vitest-environment jsdom
/**
 * The one save-a-file primitive, and the drift it replaced.
 *
 * ── What was there ───────────────────────────────────────────────────────────
 * Sixteen surfaces plus seven modules under mdx/ and lineage/ had each written
 * the same eight-line dance independently — createObjectURL → anchor → click →
 * remove → revokeObjectURL — and they had drifted in the ways an un-owned
 * primitive always drifts:
 *
 *   · six of the seven remaining copies revoked the object URL SYNCHRONOUSLY
 *     right after click(), which races the download and can hand the user a
 *     zero-byte file. Exactly one (lineage/dataOriginsApi) knew this, deferred
 *     by a frame, and explained it in a comment the other six never read;
 *   · two (useCerExport, useEstarExport) were byte-identical `triggerDownload`
 *     functions in sibling hooks;
 *   · four re-implemented RFC 4180 CSV escaping by hand — correct four times,
 *     which is still four places for the fifth to get it wrong.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * The behaviours that were being got wrong, not the happy path: the URL
 * survives the click, the anchor is attached before it is clicked (Firefox
 * ignores a click on a detached anchor), the filename is safe, and CSV quoting
 * holds for the values that break a naive join.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlob, downloadText, downloadCsv, downloadBase64, safeFileName, toCsv } from '../download';

let created: string[];
let revoked: string[];
/** Anchors observed at the moment click() fired, with whether they were attached. */
let clicks: Array<{ href: string; download: string; attached: boolean }>;

beforeEach(() => {
  created = [];
  revoked = [];
  clicks = [];
  vi.useFakeTimers();
  let n = 0;
  // jsdom implements neither of these.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => {
    const u = `blob:test/${n++}`;
    created.push(u);
    return u;
  });
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn((u: string) => {
    revoked.push(u);
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({
      href: this.href,
      download: this.download,
      attached: document.body.contains(this),
    });
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('downloadBlob', () => {
  it('clicks an anchor that is ATTACHED to the document', () => {
    // A detached anchor is silently ignored by Firefox — one of the ways the
    // hand-written copies differed from each other.
    expect(downloadBlob('report.pdf', new Blob(['x']))).toBe(true);
    expect(clicks).toHaveLength(1);
    expect(clicks[0].attached).toBe(true);
    expect(clicks[0].download).toBe('report.pdf');
  });

  it('does NOT revoke the object URL before the browser has read it', () => {
    downloadBlob('report.pdf', new Blob(['x']));
    // This is the bug six of the seven copies shipped: revoking here can
    // cancel the download and produce a zero-byte file.
    expect(revoked).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(revoked).toEqual(created);
  });

  it('removes the anchor it added, leaving no residue in the document', () => {
    downloadBlob('report.pdf', new Blob(['x']));
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });

  it('reports failure rather than claiming success when the environment refuses', () => {
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => {
      throw new Error('blocked'); // a sandboxed iframe, a browser with site data off
    });
    expect(downloadBlob('report.pdf', new Blob(['x']))).toBe(false);
    expect(clicks).toHaveLength(0);
  });
});

describe('safeFileName', () => {
  it.each([
    ['2.5 Clinical Overview', '2.5_Clinical_Overview'],
    ['BX-204 (rezatinib) — USPI', 'BX-204_rezatinib_USPI'],
    ['a///b\\\\c', 'a_b_c'],
    ['  leading and trailing  ', 'leading_and_trailing'],
  ])('%s → %s', (raw, want) => {
    expect(safeFileName(raw)).toBe(want);
  });

  it('falls back when nothing printable survives, rather than returning ""', () => {
    expect(safeFileName('///', 'export')).toBe('export');
    expect(safeFileName('')).toBe('download');
  });
});

describe('toCsv', () => {
  it('quotes every value, so a comma or a newline in a cell cannot break the row', () => {
    const csv = toCsv(['a', 'b'], [['x,y', 'line1\nline2']]);
    expect(csv).toBe('"a","b"\r\n"x,y","line1\nline2"');
  });

  it('doubles embedded quotes per RFC 4180', () => {
    expect(toCsv(['h'], [['say "hi"']])).toBe('"h"\r\n"say ""hi"""');
  });

  it('renders null and undefined as empty, never as the words', () => {
    // A hand-written String(c) turns these into "null" / "undefined" in an
    // exported regulatory report.
    expect(toCsv(['h'], [[null], [undefined]])).toBe('"h"\r\n""\r\n""');
  });
});

describe('downloadText / downloadCsv / downloadBase64', () => {
  it('downloadText names the file and reports success', () => {
    expect(downloadText('notes.md', '# hi', 'text/markdown')).toBe(true);
    expect(clicks[0].download).toBe('notes.md');
  });

  it('downloadCsv goes through the same primitive', () => {
    expect(downloadCsv('rows.csv', ['a'], [['1']])).toBe(true);
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe('rows.csv');
  });

  it('downloadBase64 decodes the server payload the export hooks return', () => {
    expect(downloadBase64('doc.pdf', btoa('PDF-BYTES'), 'application/pdf')).toBe(true);
    expect(clicks[0].download).toBe('doc.pdf');
  });
});
