#!/usr/bin/env node
/**
 * Download the public CDISC SDTM/ADaM Pilot ADaM datasets (study CDISCPILOT01,
 * xanomeline TTS vs placebo in mild to moderate Alzheimer's disease) into a
 * directory named on the command line, and verify every file against a pinned
 * SHA-256. Used by the CSR end-to-end measurement
 * (docs/evidence/D2-CSR/2026-10-30-cdisc-pilot-e2e/README.md).
 *
 *   node scripts/cre/fetch-cdisc-pilot-adam.mjs <empty-or-new-directory>
 *
 * The data belongs to CDISC and is never copied into this repository. Its
 * terms of use (the repository's README) forbid modifying or altering the
 * data, distributing it without attribution to CDISC, distributing it for a
 * fee, and using it to compete with CDISC. This script prints them.
 *
 * Fails closed: any HTTP failure, or any file whose SHA-256 differs from the
 * pinned value, exits non-zero and never writes that file, so a changed upstream
 * file is never measured as if it were the one the evidence describes.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const CDISC_PILOT_SOURCE =
  'https://raw.githubusercontent.com/cdisc-org/sdtm-adam-pilot-project/master/updated-pilot-submission-package/900172/m5/datasets/cdiscpilot01/analysis/adam/datasets/';

/** SHA-256 of each file as downloaded on 2026-10-30. */
export const CDISC_PILOT_FILES = Object.freeze({
  'adsl.xpt': 'c5139f873a93ef6add77bc4297beb6460a398bbdd036874382a9f39dfc92091d',
  'adae.xpt': 'b8678e70946473a753bb01d002917f478bf51b59bdd0dc19587b97128059b6a0',
  'adlbc.xpt': 'b9f6b5106965b5e2e3b33062a18710b58ceecc0c8cf1e54271849653037998ea',
  'adlbh.xpt': 'de568850f5585266844abe6eb7ef0290ea130d90c3f023efcb9f13c2a586455b',
  'advs.xpt': '28233c8ed038d0f315a9538d910beb43cf1bb4b69f8f1c39b32463c7b018dff1',
  'adtte.xpt': '68513fc4126744b6b2c7328eb70eb7b9683865d12c58b36539325f3c0c0ab93d',
  'adqsadas.xpt': 'ac3fa1217651810b0f15fe489fdda7d99eff10553ded025156ad7c1b89f84608',
  'adqscibc.xpt': '16e7118f606d907e817f0a5885d662c2e7177c430d2b3ec6c0ba9096cb3d7bc1',
  'adqsnpix.xpt': '90cf438913cfb976a34e9cf6c44291eab7a65c5c0146f8df092cd9ce2bd8c44a',
  'define.xml': '7e6d580e0839564f6f119c4ba7e15963d3cf7cd0c88e9f3d7da5ad396221b1cd',
});

export const CDISC_ATTRIBUTION = [
  'Data: CDISC SDTM/ADaM Pilot Project, study CDISCPILOT01 (updated pilot submission package 900172),',
  'Clinical Data Interchange Standards Consortium (CDISC), https://github.com/cdisc-org/sdtm-adam-pilot-project.',
  'Terms of use (CDISC): the data may not be modified or altered; it may not be distributed without attribution',
  'to CDISC, or for a fee; it may not be used to compete with CDISC. CDISC provides it "as is", without warranty.',
  'Do not copy this data, or rows or extracts of it, into the repository.',
].join('\n');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const REPOSITORY_ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

/** True when dir is the repository root or anywhere under it, symlinks resolved
 * (2026-10-30 review: a prefix test with a trailing separator let the root itself through). */
export async function insideRepository(dir, root = REPOSITORY_ROOT) {
  const real = async p => {
    let probe = path.resolve(p);
    const rest = [];
    for (;;) {
      try { return path.join(await fs.realpath(probe), ...rest); } catch {
        const parent = path.dirname(probe);
        if (parent === probe) return path.resolve(p);
        rest.unshift(path.basename(probe));
        probe = parent;
      }
    }
  };
  const relative = path.relative(await real(root), await real(dir));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function fetchCdiscPilot(dir, { files = CDISC_PILOT_FILES, source = CDISC_PILOT_SOURCE, fetchImpl = fetch } = {}) {
  if (await insideRepository(dir)) {
    throw new Error('CDISC_PILOT_INSIDE_REPOSITORY: the CDISC terms forbid copying this data into the repository. Choose a directory outside it.');
  }
  await fs.mkdir(dir, { recursive: true });
  const results = [];
  for (const [name, pinned] of Object.entries(files)) {
    const response = await fetchImpl(new URL(name, source));
    if (!response.ok) throw new Error(`CDISC_PILOT_DOWNLOAD_FAILED: ${name} answered HTTP ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const actual = sha256(bytes);
    if (actual !== pinned) {
      throw new Error(`CDISC_PILOT_HASH_MISMATCH: ${name} has SHA-256 ${actual}, not the pinned ${pinned}. Nothing was kept for it; the upstream file changed or the transfer was altered.`);
    }
    await fs.writeFile(path.join(dir, name), bytes);
    results.push({ name, bytes: bytes.length, sha256: actual });
  }
  return results;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/cre/fetch-cdisc-pilot-adam.mjs <directory outside the repository>');
    process.exit(2);
  }
  if (await insideRepository(dir)) {
    console.error('CDISC_PILOT_INSIDE_REPOSITORY: the CDISC terms forbid copying this data into the repository. Choose a directory outside it.');
    process.exit(2);
  }
  console.info(CDISC_ATTRIBUTION + '\n');
  try {
    for (const r of await fetchCdiscPilot(dir)) console.info(`ok  ${r.name}  ${r.bytes} bytes  sha256 ${r.sha256}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
