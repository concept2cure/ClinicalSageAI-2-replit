#!/usr/bin/env node
/**
 * Render the investor technical white paper to PDF.
 *
 * Source of truth is docs/investor/whitepaper.html + whitepaper.css. This script
 * only drives a headless Chromium over them, because the paper's layout depends
 * on real CSS paged-media support (running heads, break-inside, @page margins)
 * that a PDF library would not reproduce.
 *
 * Fonts are resolved from docs/investor/fonts/. They are not committed; run with
 * --fetch-fonts once to download Lora and Inter from Google Fonts. When the
 * directory is absent the paper still renders, falling back to the system serif
 * and sans, with different line breaks.
 *
 *   node scripts/build-investor-whitepaper.mjs [--fetch-fonts] [--out <path>]
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

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

/** Font files the stylesheet declares, with their Google Fonts sources. */
const FONTS = {
  'Lora-400.ttf': 'https://fonts.gstatic.com/s/lora/v37/0QI6MX1D_JOuGQbT0gvTJPa787weuyJG.ttf',
  'Lora-500.ttf': 'https://fonts.gstatic.com/s/lora/v37/0QI6MX1D_JOuGQbT0gvTJPa787wsuyJG.ttf',
  'Lora-600.ttf': 'https://fonts.gstatic.com/s/lora/v37/0QI6MX1D_JOuGQbT0gvTJPa787zAvCJG.ttf',
  'Lora-400i.ttf': 'https://fonts.gstatic.com/s/lora/v37/0QI8MX1D_JOuMw_hLdO6T2wV9KnW-MoFkqg.ttf',
  'Inter-400.ttf':
    'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
  'Inter-500.ttf':
    'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf',
  'Inter-600.ttf':
    'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf',
};

/** Chromium locations, preferring the one Playwright provisions in CI images. */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);

function resolveChrome() {
  const found = CHROME_CANDIDATES.find(p => existsSync(p));
  if (found) return found;
  throw new Error(
    `No Chromium found. Set CHROME_PATH, or install one at:\n  ${CHROME_CANDIDATES.join('\n  ')}`,
  );
}

async function fetchFonts() {
  await mkdir(FONT_DIR, { recursive: true });
  for (const [name, url] of Object.entries(FONTS)) {
    const dest = path.join(FONT_DIR, name);
    if (existsSync(dest)) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${name}: ${res.status} ${res.statusText}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`  fetched ${name}`);
  }
}

async function main() {
  if (!existsSync(SOURCE)) throw new Error(`Missing source document: ${SOURCE}`);

  if (args.includes('--fetch-fonts')) {
    console.log('Fetching fonts…');
    await fetchFonts();
  }

  const missingFonts = Object.keys(FONTS).filter(f => !existsSync(path.join(FONT_DIR, f)));
  if (missingFonts.length > 0) {
    console.warn(
      `Warning: ${missingFonts.length} font file(s) missing from docs/investor/fonts/.\n` +
        '         Rendering with system fallbacks; run with --fetch-fonts for the intended typography.',
    );
  }

  const chrome = resolveChrome();
  console.log(`Rendering with ${chrome}`);

  // --no-pdf-header-footer keeps Chromium's default date/URL chrome off the page;
  // the running heads in the document supply pagination instead.
  await execFileAsync(
    chrome,
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-pdf-header-footer',
      '--virtual-time-budget=10000',
      `--print-to-pdf=${OUTPUT}`,
      `file://${SOURCE}`,
    ],
    { maxBuffer: 1024 * 1024 * 32 },
  ).catch(err => {
    // Chromium reports font/dbus noise on stderr and still exits 0; only a
    // missing output file is a real failure.
    if (!existsSync(OUTPUT)) throw err;
  });

  if (!existsSync(OUTPUT)) throw new Error('Chromium produced no output file.');
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
