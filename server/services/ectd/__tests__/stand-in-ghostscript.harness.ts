/**
 * The production PDF/A toolchain, simulated, for tests that must see what the
 * packager does where Ghostscript is installed.
 *
 * This container has no `gs`; the production image does (Dockerfile.optimized),
 * and the packager converts every PDF leaf to PDF/A when it is present. A test
 * suite that only ever runs without it cannot see anything that depends on the
 * conversion — which is how the lifecycle diff went on comparing a
 * pre-conversion md5 with a post-conversion one, re-filing every unchanged
 * document in production while every suite passed.
 *
 * `pdfa-pipeline` honours GHOSTSCRIPT_BINARY and PDFA_SRGB_ICC, so the REAL
 * finalizePdfA path runs against this stand-in. It copies its input, appends a
 * PDF/A identifier (so the pipeline counts it as a conversion, exactly as it
 * counts the real one) and a nanosecond stamp — so, like real Ghostscript,
 * which writes dates and a random document ID, it produces different bytes on
 * every run.
 */
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

export interface StandInGhostscript {
  /** Run `fn` with the stand-in installed, restoring the environment after. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Remove the stand-in's files. */
  dispose(): Promise<void>;
}

const SCRIPT = [
  '#!/bin/sh',
  'if [ "$1" = "--version" ]; then echo 10.02.1; exit 0; fi',
  'out=""; last=""',
  'for a in "$@"; do',
  '  case "$a" in',
  '    -sOutputFile=*) out="${a#-sOutputFile=}" ;;',
  '    -*) ;;',
  '    *) last="$a" ;;',
  '  esac',
  'done',
  'cat "$last" > "$out"',
  'printf "\\n%% <pdfaid:part>1</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance> normalized %s\\n" "$(date +%s%N)" >> "$out"',
  '',
].join('\n');

export async function installStandInGhostscript(): Promise<StandInGhostscript> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stand-in-gs-'));
  const gs = path.join(dir, 'gs');
  const icc = path.join(dir, 'srgb.icc');
  await fs.writeFile(gs, SCRIPT, { mode: 0o755 });
  // pdfa-pipeline only checks that a profile is readable; the stand-in never reads it.
  await fs.writeFile(icc, 'stand-in profile');
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      const saved = { gs: process.env.GHOSTSCRIPT_BINARY, icc: process.env.PDFA_SRGB_ICC };
      process.env.GHOSTSCRIPT_BINARY = gs;
      process.env.PDFA_SRGB_ICC = icc;
      try {
        return await fn();
      } finally {
        if (saved.gs === undefined) delete process.env.GHOSTSCRIPT_BINARY;
        else process.env.GHOSTSCRIPT_BINARY = saved.gs;
        if (saved.icc === undefined) delete process.env.PDFA_SRGB_ICC;
        else process.env.PDFA_SRGB_ICC = saved.icc;
      }
    },
    async dispose() {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    },
  };
}
