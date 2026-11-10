#!/usr/bin/env node
/** Prove the reviewed pptxgenjs -> image-size boundary against installed code. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
const lock = JSON.parse(readFileSync(new URL('package-lock.json', root)));
const generator = readFileSync(new URL('server/services/pptxGenerator.ts', root), 'utf8');
const nanoBanana = readFileSync(new URL('server/services/nanoBananaService.ts', root), 'utf8');
const pptxPackage = lock.packages['node_modules/pptxgenjs'];
const imagePackage = lock.packages['node_modules/image-size'];

function fail(message) {
  console.error(`PPTX image reachability: FAIL: ${message}`);
  process.exit(1);
}

// pptxgenjs 4.0.1 declares image-size ^1.2.1, every release of which is in the
// range of GHSA-w3rx-r6r6-pgpr / GHSA-5p2g-fcmc-qvqq (<=2.0.2). package.json
// overrides it to the patched 2.0.4 (2026-11-10). That is safe only because
// the shipped bundle never imports image-size, which the checks below prove;
// if pptxgenjs changes, or the override is dropped, this fails and the
// override is re-reviewed.
if (pptxPackage?.version !== '4.0.1' || imagePackage?.version !== '2.0.4' ||
    pptxPackage.dependencies?.['image-size'] !== '^1.2.1') {
  fail('reviewed pptxgenjs/image-size lockfile path changed; re-review the image-size override in package.json');
}

const resolvedEntry = require.resolve('pptxgenjs');
const shippedBundle = readFileSync(resolvedEntry, 'utf8');
if (/image-size|require\(['"]image-size['"]\)|from\s+['"]image-size['"]/.test(shippedBundle)) {
  fail(`resolved runtime bundle ${resolvedEntry} now imports image-size`);
}
if (/\.addImage\s*\(|imageSizing|tableToSlides\s*\(/.test(generator)) {
  fail('production PPTX generator now invokes an image-capable pptxgenjs API');
}
const pptxCalls = [...nanoBanana.matchAll(/generatePptxBuffer\s*\(([^)]*)\)/g)];
if (pptxCalls.length !== 1 || pptxCalls[0][1].split(',').length !== 2) {
  fail('Nano Banana now passes a third (potential image) argument to the PPTX generator');
}

console.log(`PPTX image reachability: PASS`);
console.log(`  resolved entry: ${resolvedEntry}`);
console.log('  shipped pptxgenjs Node bundle does not import image-size');
console.log('  production generator uses no pptxgenjs image-capable API');
