/**
 * ====================================================================
 * INTEGRATION NOTES
 * --------------------------------------------------------------------
 * This module finalizes a rendered leaf PDF to "submission grade"
 * (PDF/A-1b conversion + classification). It is intentionally a pure
 * library: it NEVER throws and degrades gracefully when the external
 * binaries are absent, so callers can wire it in without changing their
 * error contract.
 *
 * A human should call `finalizePdfA(pdfBytes)` from:
 *   - server/services/ectd/package-from-core.ts
 *       After each leaf's bytes are produced (e.g. via the
 *       leaf-pdf-renderer) and BEFORE the checksum is computed and the
 *       leaf is handed to `packageEctdSubmission`. Because PDF/A
 *       conversion changes the bytes, the md5/checksum recorded in
 *       index.xml MUST be computed on the FINALIZED bytes.
 *   - server/services/submission-gateways/regional-packager.ts
 *       Inside `packageEctdSubmission`, as the final normalization step
 *       for each leaf written to the package, again before checksums.
 *
 * Suggested call site shape:
 *     const { pdfBytes, converted, pdfaPart, warnings } =
 *       await finalizePdfA(renderedLeafBytes);
 *     // record warnings on the leaf's report; use pdfBytes for write+md5.
 *
 * TODO (deployment): Ghostscript (`gs`) and/or veraPDF (`verapdf`) MUST
 * be present in the deployment container image for real PDF/A-1b
 * conversion and validation. Without them this module is a safe no-op
 * (returns the input unchanged with converted:false). Add these to the
 * Dockerfile, e.g. `apt-get install -y ghostscript` and install veraPDF.
 * Override binary paths with GHOSTSCRIPT_BINARY / VERAPDF_BINARY.
 * ====================================================================
 *
 * PDF/A finalization pipeline — architecture spec §5.1 (normalization).
 *
 * The detection module (`pdfa-detect.ts`) answers "does this PDF *claim*
 * PDF/A". This module attempts to *make* a leaf conform to PDF/A-1b using
 * Ghostscript, and (if only veraPDF is available) at least validates it.
 * It reuses `classifyPdfA` for the before/after classification rather
 * than duplicating byte inspection.
 *
 * @module server/services/ectd/pdfa-pipeline
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';

import { classifyPdfA } from './pdfa-detect';

const execFileAsync = promisify(execFile);

export interface FinalizePdfAResult {
  /** The finalized PDF bytes (or the input unchanged if no conversion happened). */
  pdfBytes: Uint8Array;
  /** True only when the bytes were actually converted to PDF/A by Ghostscript. */
  converted: boolean;
  /** Declared/produced PDF/A part after finalization ('1' | '2' | '3'), or null. */
  pdfaPart: string | null;
  /** Non-fatal diagnostics (missing binary, validation notes, conversion fallbacks). */
  warnings: string[];
}

function resolveGsBinary(): string {
  return process.env.GHOSTSCRIPT_BINARY || 'gs';
}

function resolveVeraPdfBinary(): string {
  return process.env.VERAPDF_BINARY || 'verapdf';
}

/** Feature-detect a binary by running its version probe; never throws. */
async function isBinaryAvailable(bin: string, versionArgs: string[]): Promise<boolean> {
  try {
    await execFileAsync(bin, versionArgs, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function toUint8Array(input: Uint8Array | ArrayBuffer | Buffer): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

/**
 * Finalize a leaf PDF to submission grade.
 *
 *  1. Classify the input (reusing `pdfa-detect`).
 *  2. If Ghostscript is present, convert to PDF/A-1b through temp files.
 *  3. Else, if veraPDF is present, validate-only (no byte change).
 *  4. Else return the input unchanged with `{ converted:false, reason:'no-binary' }`.
 *
 * This function NEVER throws — every failure path is captured as a warning
 * and returns the original bytes so the caller's pipeline keeps flowing.
 */
export async function finalizePdfA(
  input: Uint8Array | ArrayBuffer | Buffer
): Promise<FinalizePdfAResult> {
  const pdfBytes = toUint8Array(input);
  const warnings: string[] = [];

  // (a) Classify the input up front.
  const before = classifyPdfA(pdfBytes);
  if (!before.isPdf) {
    warnings.push('Input is not a PDF (missing %PDF- header); skipping PDF/A finalization.');
    return { pdfBytes, converted: false, pdfaPart: null, warnings };
  }
  if (before.encrypted) {
    // Ghostscript cannot reliably re-distill encrypted/secured PDFs.
    warnings.push('Input PDF is encrypted/secured; cannot finalize to PDF/A. Returning input unchanged.');
    return { pdfBytes, converted: false, pdfaPart: before.pdfAPart, warnings };
  }
  if (before.pdfAClaimed && before.pdfAPart === '1') {
    warnings.push(`Input already declares PDF/A-${before.pdfAPart}${before.pdfAConformance ?? ''}.`);
  }

  // (b) Prefer Ghostscript for real conversion.
  const hasGs = await isBinaryAvailable(resolveGsBinary(), ['--version']);
  if (hasGs) {
    try {
      const converted = await convertToPdfA1bWithGhostscript(pdfBytes);
      const after = classifyPdfA(converted);
      if (!after.isPdf) {
        warnings.push('Ghostscript output was not a valid PDF; returning input unchanged.');
        return { pdfBytes, converted: false, pdfaPart: before.pdfAPart, warnings };
      }
      // A zero exit status is NOT evidence of conversion. Ghostscript emits an
      // ordinary, perfectly valid PDF and exits 0 when it cannot honour -dPDFA:
      // a missing or unreadable OutputIntent ICC profile is the common cause,
      // and -dPDFACompatibilityPolicy=1 is precisely the setting that says
      // "carry on and produce output" rather than abort. This branch used to
      // accept that file as converted, and then fill in `pdfaPart: '1'` for a
      // document carrying no PDF/A identifier at all.
      //
      // That mattered more than an ordinary wrong value, because `converted` is
      // the single fact the production gate rests on: pdfa-readiness rolls it up
      // into allPdfA, pre-transmit-check clears the transmit on it under
      // ECTD_REQUIRE_PDFA, and the package then reaches the agency as declared
      // PDF/A-1b. A technical rejection would be the first true thing anyone was
      // told. Refusing to claim a conversion the bytes do not show is the whole
      // point of the gate.
      if (!after.pdfAClaimed) {
        warnings.push(
          'Ghostscript exited successfully but its output carries no PDF/A identifier ' +
            '(no pdfaid:part in the XMP metadata), so the file is NOT PDF/A. This usually ' +
            'means the OutputIntent ICC profile was missing or unreadable in the image. ' +
            'Returning input unchanged rather than reporting a conversion that did not happen.',
        );
        return { pdfBytes, converted: false, pdfaPart: before.pdfAPart, warnings };
      }
      return {
        pdfBytes: converted,
        converted: true,
        // Reported from the output's own declaration, never assumed.
        pdfaPart: after.pdfAPart,
        warnings,
      };
    } catch (err: any) {
      warnings.push(`Ghostscript PDF/A conversion failed (${err?.message ?? err}); returning input unchanged.`);
      return { pdfBytes, converted: false, pdfaPart: before.pdfAPart, warnings };
    }
  }

  // (c) No Ghostscript — try veraPDF for validation-only.
  const hasVeraPdf = await isBinaryAvailable(resolveVeraPdfBinary(), ['--version']);
  if (hasVeraPdf) {
    warnings.push(
      'Ghostscript not found; veraPDF is available for validation-only. ' +
        'Bytes were NOT converted — install Ghostscript for PDF/A-1b normalization.'
    );
    const validation = await validateWithVeraPdf(pdfBytes);
    if (validation) warnings.push(validation);
    return { pdfBytes, converted: false, pdfaPart: before.pdfAPart, warnings };
  }

  // (d) Neither binary present — safe no-op. Reason: 'no-binary'.
  warnings.push(
    'no-binary: neither Ghostscript (gs) nor veraPDF found. ' +
      'Returning input bytes unchanged. Install Ghostscript in the deployment image for PDF/A-1b.'
  );
  return { pdfBytes, converted: false, pdfaPart: before.pdfAPart, warnings };
}

/**
 * Run the standard Ghostscript PDF/A-1b invocation through temp files in
 * os.tmpdir(). Returns the converted bytes. Throws on failure (the caller
 * wraps this so `finalizePdfA` never throws).
 */
async function convertToPdfA1bWithGhostscript(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const token = randomBytes(8).toString('hex');
  const dir = os.tmpdir();
  const inputPath = path.join(dir, `pdfa-in-${token}.pdf`);
  const outputPath = path.join(dir, `pdfa-out-${token}.pdf`);

  await fs.writeFile(inputPath, Buffer.from(pdfBytes));
  try {
    await execFileAsync(
      resolveGsBinary(),
      [
        '-dPDFA=1',
        '-sColorConversionStrategy=RGB',
        '-dPDFACompatibilityPolicy=1',
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        `-sOutputFile=${outputPath}`,
        inputPath,
      ],
      { timeout: 120000, maxBuffer: 64 * 1024 * 1024 }
    );
    const out = await fs.readFile(outputPath);
    return new Uint8Array(out);
  } finally {
    // Best-effort cleanup; ignore unlink errors.
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

/**
 * Validation-only pass with veraPDF. Returns a human-readable note (or null).
 * Never throws — veraPDF exits non-zero on validation failures, which we treat
 * as a diagnostic, not an error.
 */
async function validateWithVeraPdf(pdfBytes: Uint8Array): Promise<string | null> {
  const token = randomBytes(8).toString('hex');
  const inputPath = path.join(os.tmpdir(), `pdfa-vera-${token}.pdf`);
  await fs.writeFile(inputPath, Buffer.from(pdfBytes)).catch(() => {});
  try {
    const { stdout } = await execFileAsync(
      resolveVeraPdfBinary(),
      ['--flavour', '1b', '--format', 'text', inputPath],
      { timeout: 60000, maxBuffer: 16 * 1024 * 1024 }
    );
    return `veraPDF (PDF/A-1b) report: ${String(stdout).trim().slice(0, 500)}`;
  } catch (err: any) {
    // Non-zero exit = non-compliant or error; surface the captured output.
    const detail = err?.stdout || err?.stderr || err?.message || 'unknown';
    return `veraPDF (PDF/A-1b) validation reported issues: ${String(detail).trim().slice(0, 500)}`;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
  }
}

export default { finalizePdfA };
