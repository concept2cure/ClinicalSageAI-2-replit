#!/usr/bin/env node
/**
 * Render the investor technical white paper to PDF.
 *
 * Source of truth is docs/investor/whitepaper.html + whitepaper.css. This script
 * only drives a headless Chromium over them, because the paper's layout depends
 * on real CSS paged-media support (running heads, break-inside, @page margins)
 * that a PDF library would not reproduce. The Chromium and font handling live in
 * scripts/lib/render-pdf.mjs, shared with build-investor-brief.mjs.
 *
 * Fonts are resolved from docs/investor/fonts/. They are not committed; run with
 * --fetch-fonts once to download Lora and Inter from Google Fonts. When the
 * directory is absent the paper still renders, falling back to the system serif
 * and sans, with different line breaks.
 *
 *   node scripts/build-investor-whitepaper.mjs [--fetch-fonts] [--out <path>]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchFonts, renderHtmlToPdf, warnOnMissingFonts } from './lib/render-pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC_DIR = path.join(ROOT, 'docs', 'investor');
const SOURCE = path.join(DOC_DIR, 'whitepaper.html');
const FONT_DIR = path.join(DOC_DIR, 'fonts');

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const OUTPUT =
  outIndex !== -1 && args[outIndex + 1]
    ? path.resolve(args[outIndex + 1])
    : path.join(DOC_DIR, 'Concept2Cure-RI-Technical-White-Paper.pdf');

async function main() {
  if (args.includes('--fetch-fonts')) {
    console.log('Fetching fonts…');
    await fetchFonts(FONT_DIR);
  }

  warnOnMissingFonts(FONT_DIR);

  await renderHtmlToPdf({ source: SOURCE, output: OUTPUT });
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
