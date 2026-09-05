/**
 * A zero exit status from Ghostscript is not evidence of a PDF/A conversion.
 *
 * Ghostscript emits an ordinary, perfectly valid PDF and exits 0 when it cannot
 * honour `-dPDFA` — a missing or unreadable OutputIntent ICC profile is the
 * usual cause, and `-dPDFACompatibilityPolicy=1` is exactly the setting that
 * tells it to carry on and produce output rather than abort. The success path
 * in `finalizePdfA` used to accept that file as converted, and then report
 * `pdfaPart: '1'` for a document carrying no PDF/A identifier at all.
 *
 * That is not an ordinary wrong value. `converted` is the single fact the
 * production gate rests on: `pdfa-readiness` rolls it up into `allPdfA`, and
 * `pre-transmit-check` clears a production transmit on it under
 * `ECTD_REQUIRE_PDFA`. The package would reach the agency declared as PDF/A-1b
 * with every internal control agreeing, and the technical rejection would be
 * the first true thing anyone was told.
 *
 * ── Why a stub binary rather than a mock ─────────────────────────────────────
 * The sibling suite (`pdfa-pipeline.test.ts`) mocks `child_process` wholesale to
 * cover the no-binary path, which necessarily also mocks away the branch under
 * test here. This file runs the real `execFile` against a small shell stub
 * pointed to by GHOSTSCRIPT_BINARY — the same environment override the
 * deployment uses — so the code path exercised is the one that runs in
 * production, and no Ghostscript install is required to run it.
 *
 * @compliance ICH eCTD; FDA Portable Document Format Specifications (PDF/A).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { finalizePdfA } from '../pdfa-pipeline';

/** A minimal but genuinely well-formed PDF header, which is what gs is fed. */
const INPUT_PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'latin1');

/** The XMP packet Ghostscript writes when it really does produce PDF/A-1b. */
const PDFA_XMP =
  '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
  '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
  '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">' +
  '<pdfaid:part>1</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>' +
  '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';

describe('finalizePdfA — a successful Ghostscript exit is not a conversion', () => {
  let dir: string;
  const originalGs = process.env.GHOSTSCRIPT_BINARY;
  const originalVera = process.env.VERAPDF_BINARY;

  /**
   * Write an executable stub that answers `--version` (so the pipeline's
   * feature probe finds it) and otherwise writes `outputContents` to the path
   * given in `-sOutputFile=`, then exits 0 — Ghostscript's own contract.
   */
  function stubGhostscript(outputContents: string): string {
    const script = path.join(dir, `gs-${Math.random().toString(36).slice(2)}.sh`);
    const payload = path.join(dir, `${path.basename(script)}.out`);
    fs.writeFileSync(payload, outputContents, 'latin1');
    fs.writeFileSync(
      script,
      [
        '#!/bin/sh',
        'if [ "$1" = "--version" ]; then echo "10.02.1"; exit 0; fi',
        'out=""',
        'for a in "$@"; do',
        '  case "$a" in -sOutputFile=*) out="${a#-sOutputFile=}" ;; esac',
        'done',
        `cat "${payload}" > "$out"`,
        'exit 0',
      ].join('\n') + '\n',
      { mode: 0o755 },
    );
    return script;
  }

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfa-gs-stub-'));
    // veraPDF must not be picked up: this file is about the Ghostscript branch.
    process.env.VERAPDF_BINARY = path.join(dir, 'definitely-not-verapdf');
  });

  afterAll(() => {
    if (originalGs === undefined) delete process.env.GHOSTSCRIPT_BINARY;
    else process.env.GHOSTSCRIPT_BINARY = originalGs;
    if (originalVera === undefined) delete process.env.VERAPDF_BINARY;
    else process.env.VERAPDF_BINARY = originalVera;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does not report a conversion when the output carries no PDF/A identifier', async () => {
    // The real failure mode: exit 0, a valid PDF out, no pdfaid:part anywhere.
    process.env.GHOSTSCRIPT_BINARY = stubGhostscript(INPUT_PDF.toString('latin1'));

    const res = await finalizePdfA(INPUT_PDF);

    expect(res.converted).toBe(false);
    // And it must not invent a part for a document that declares none. This is
    // the assertion that fails against the previous `pdfaPart: after.pdfAPart ?? '1'`.
    expect(res.pdfaPart).toBeNull();
    expect(res.warnings.join(' ')).toMatch(/no PDF\/A identifier/i);
    // The caller keeps flowing with bytes it can still write and checksum.
    expect(Buffer.from(res.pdfBytes)).toEqual(INPUT_PDF);
  });

  it('reports the conversion when the output really does declare PDF/A', async () => {
    process.env.GHOSTSCRIPT_BINARY = stubGhostscript(
      `%PDF-1.4\n${PDFA_XMP}\n%%EOF\n`,
    );

    const res = await finalizePdfA(INPUT_PDF);

    expect(res.converted).toBe(true);
    expect(res.pdfaPart).toBe('1');
    // The converted bytes are what the caller must checksum, not the input.
    expect(Buffer.from(res.pdfBytes)).not.toEqual(INPUT_PDF);
  });

  it('returns the input unchanged when the output is not a PDF at all', async () => {
    process.env.GHOSTSCRIPT_BINARY = stubGhostscript('this is not a pdf');

    const res = await finalizePdfA(INPUT_PDF);

    expect(res.converted).toBe(false);
    expect(Buffer.from(res.pdfBytes)).toEqual(INPUT_PDF);
  });

  it('never throws, whatever the binary does', async () => {
    // Exit 0 having written nothing at all: the output file does not exist.
    const script = path.join(dir, 'gs-silent.sh');
    fs.writeFileSync(
      script,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 10; exit 0; fi\nexit 0\n',
      { mode: 0o755 },
    );
    process.env.GHOSTSCRIPT_BINARY = script;

    const res = await finalizePdfA(INPUT_PDF);

    expect(res.converted).toBe(false);
    expect(Buffer.from(res.pdfBytes)).toEqual(INPUT_PDF);
  });
});
