#!/usr/bin/env node
/**
 * Vendor Tesseract language data for offline OCR.
 *
 * The WASM OCR engine (tesseract.js-core) ships in node_modules, but Tesseract
 * `*.traineddata` is fetched from a CDN at runtime by default. In network-restricted
 * runtimes that fetch fails, so OCR can't run. This pulls the data from the **npm
 * registry** (the `@tesseract.js-data/<lang>` packages) — which is reachable where the
 * jsDelivr CDN is blocked — and writes it into `server/assets/tessdata/`, which
 * `tesseractOcrService` auto-detects (no env var needed).
 *
 * Usage:
 *   node scripts/vendor-tesseract-langdata.mjs            # eng
 *   node scripts/vendor-tesseract-langdata.mjs eng fra deu
 *
 * eng is committed to the repo; use this to add more languages or refresh.
 */

import { mkdtemp, mkdir, copyFile, access, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../server/assets/tessdata');
// tesseract.js v5 uses the 4.0.0_best_int data set.
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

async function vendorLang(lang, tmp) {
  const dest = path.join(OUT_DIR, `${lang}.traineddata.gz`);
  if (await exists(dest)) {
    console.log(`✓ ${lang}: already vendored`);
    return true;
  }
  process.stdout.write(`↓ ${lang}: npm pack @tesseract.js-data/${lang} … `);
  const res = spawnSync('npm', ['pack', `@tesseract.js-data/${lang}`, '--pack-destination', tmp, '--silent'], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    console.error(`FAILED\n${res.stderr || res.stdout}`);
    return false;
  }
  const tgz = res.stdout.trim().split('\n').pop().trim();
  const extractDir = path.join(tmp, lang);
  await mkdir(extractDir, { recursive: true });
  const untar = spawnSync('tar', ['xzf', path.join(tmp, tgz), '-C', extractDir], { encoding: 'utf8' });
  if (untar.status !== 0) {
    console.error(`FAILED to extract\n${untar.stderr}`);
    return false;
  }
  const src = path.join(extractDir, 'package', VARIANT, `${lang}.traineddata.gz`);
  if (!(await exists(src))) {
    console.error(`FAILED: ${VARIANT}/${lang}.traineddata.gz not in package`);
    return false;
  }
  await copyFile(src, dest);
  console.log('done');
  return true;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const tmp = await mkdtemp(path.join(tmpdir(), 'tessdata-'));
  try {
    let ok = true;
    for (const lang of langs) ok = (await vendorLang(lang, tmp)) && ok;
    console.log(`\nLanguage data in ${OUT_DIR}`);
    console.log('tesseractOcrService auto-detects this directory — no env var needed.');
    if (!ok) process.exitCode = 1;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
