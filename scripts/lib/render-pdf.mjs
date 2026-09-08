/**
 * Shared Chromium-backed HTML → PDF rendering for the investor documents.
 *
 * Both scripts/build-investor-whitepaper.mjs and scripts/build-investor-brief.mjs
 * render CSS paged-media documents (running heads, break-inside, @page margins)
 * that a PDF library would not reproduce, so both drive a real headless Chromium.
 * This module is the single implementation of that; neither script resolves a
 * browser or fetches a font on its own.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Font files the investor stylesheets declare, with their Google Fonts sources.
 * Lora carries long-form body copy, Inter the chrome; weights are capped at 600
 * to match the platform design system.
 */
export const INVESTOR_FONTS = {
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
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);

export function resolveChrome() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (found) return found;
  throw new Error(
    `No Chromium found. Set CHROME_PATH, or install one at:\n  ${CHROME_CANDIDATES.join('\n  ')}`,
  );
}

/** Download any font in `fonts` that is not already present in `fontDir`. */
export async function fetchFonts(fontDir, fonts = INVESTOR_FONTS) {
  await mkdir(fontDir, { recursive: true });
  for (const [name, url] of Object.entries(fonts)) {
    const dest = path.join(fontDir, name);
    if (existsSync(dest)) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${name}: ${res.status} ${res.statusText}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`  fetched ${name}`);
  }
}

/**
 * Warn when fonts are absent. Rendering still succeeds with system fallbacks,
 * at different line breaks, so this is a warning rather than an error.
 */
export function warnOnMissingFonts(fontDir, fonts = INVESTOR_FONTS) {
  const missing = Object.keys(fonts).filter((f) => !existsSync(path.join(fontDir, f)));
  if (missing.length > 0) {
    console.warn(
      `Warning: ${missing.length} font file(s) missing from ${path.relative(process.cwd(), fontDir)}/.\n` +
        '         Rendering with system fallbacks; run with --fetch-fonts for the intended typography.',
    );
  }
  return missing;
}

/**
 * Render a local HTML file to PDF with headless Chromium.
 *
 * `--no-pdf-header-footer` keeps Chromium's default date/URL chrome off the page;
 * the documents supply their own pagination.
 */
export async function renderHtmlToPdf({ source, output, virtualTimeBudget = 10000 }) {
  if (!existsSync(source)) throw new Error(`Missing source document: ${source}`);

  const chrome = resolveChrome();
  console.log(`Rendering with ${chrome}`);

  await execFileAsync(
    chrome,
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-pdf-header-footer',
      `--virtual-time-budget=${virtualTimeBudget}`,
      `--print-to-pdf=${output}`,
      `file://${source}`,
    ],
    { maxBuffer: 1024 * 1024 * 32 },
  ).catch((err) => {
    // Chromium reports font/dbus noise on stderr and still exits 0; only a
    // missing output file is a real failure.
    if (!existsSync(output)) throw err;
  });

  if (!existsSync(output)) throw new Error('Chromium produced no output file.');
  return output;
}
