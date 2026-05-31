#!/usr/bin/env node
/**
 * Vendor Tesseract language data for offline OCR.
 *
 * The WASM OCR engine (tesseract.js-core) ships in node_modules, but Tesseract
 * `*.traineddata` is fetched from a CDN at runtime by default. In network-restricted
 * runtimes that fetch fails, so OCR can't run. This downloads the language data into
 * `server/assets/tessdata/`, which `tesseractOcrService` auto-detects (no env needed).
 *
 * Usage:
 *   node scripts/vendor-tesseract-langdata.mjs            # eng
 *   node scripts/vendor-tesseract-langdata.mjs eng fra deu # several
 *
 * Run this once in an environment that DOES have outbound network (CI, your laptop),
 * then commit the result — or set TESSERACT_LANG_PATH to a directory you manage.
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../server/assets/tessdata');

// tesseract.js v5 uses the 4.0.0 _best_int data set by default.
const CDN = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data';
const VARIANT = '4.0.0_best_int';

const langs = process.argv.slice(2).filter(Boolean);
if (langs.length === 0) langs.push('eng');

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const lang of langs) {
    const dest = path.join(OUT_DIR, `${lang}.traineddata.gz`);
    if (await exists(dest)) {
      console.log(`✓ ${lang}: already vendored (${dest})`);
      continue;
    }
    const url = `${CDN}/${lang}/${VARIANT}/${lang}.traineddata.gz`;
    process.stdout.write(`↓ ${lang}: ${url} … `);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`FAILED (HTTP ${res.status}). Outbound network may be blocked.`);
      process.exitCode = 1;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    console.log(`done (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
  }
  console.log(`\nLanguage data in ${OUT_DIR}`);
  console.log('tesseractOcrService auto-detects this directory — no env var needed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
