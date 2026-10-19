import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  parseRecognizedStandardsDataset,
  loadRecognizedStandardsDataset,
} from '../../../../../../server/services/fda-recognized-standards/recognized-standards-dataset.ts';
import { lookupRecognizedStandards } from '../../../../../../server/services/fda-recognized-standards/recognized-standards.service.ts';

const manifest = JSON.parse(await readFile(new URL('./acquisition-manifest.json', import.meta.url), 'utf8'));
const datasetUrl = new URL('../../../../../../assets/fda-recognized-standards/fda-recognized-consensus-standards.json', import.meta.url);
const bytes = await readFile(datasetUrl);
assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.files['fda-recognized-consensus-standards.json'].sha256);
const raw = JSON.parse(bytes.toString('utf8'));
const records = JSON.parse(await readFile(new URL('./record-manifest.json', import.meta.url), 'utf8'));
assert.equal(records.filter(record => record.publishedAssociationSectionText).length, 279);
assert.match(records.find(record => record.recognitionNumber === '7-170').publishedAssociationSectionText, /ALL PRODUCT CODES IN CLINICAL CHEMISTRY/);
assert.deepEqual(raw.standards.find(standard => standard.recognitionNumber === '7-170').productCodes, []);
const parsed = parseRecognizedStandardsDataset(raw);
assert(parsed.ok, parsed.ok ? undefined : parsed.reason);
assert.equal(parsed.dataset.standards.length, 1738);
assert.equal(parsed.dataset.productCodeCount, 1621);
assert.equal(parsed.dataset.standards.reduce((n, standard) => n + standard.productCodes.length, 0), 7582);
assert.equal(new Set(parsed.dataset.standards.map(standard => standard.recognitionNumber)).size, 1738);
assert.equal(parsed.dataset.standards.filter(standard => standard.productCodes.length === 0).length, 681);
assert.equal(raw.standards.filter(standard => standard.recognitionListNumber === '067').length, 1);
assert.equal(parsed.dataset.provenance.publishedOn, '2026-09-07');
assert.match(raw.provenance.publishedOnBasis, /not a Federal Register publication date/);
const env = { FDA_RECOGNIZED_STANDARDS_DIR: fileURLToPath(new URL('.', datasetUrl)) };
const loaded = await loadRecognizedStandardsDataset({ env, fresh: true });
assert(loaded.available && loaded.dataset);
assert.equal(loaded.dataset.standards.length, 1738);
for (const [code, recognition] of Object.entries({ JPI: '7-104', MUE: '12-165', LLZ: '12-165', LXY: '11-311', MBD: '11-311', MJO: '11-343', LPK: '4-261' })) {
  const result = await lookupRecognizedStandards(code.toLowerCase(), { env });
  assert(result.available && result.datasetLoaded);
  assert(result.standards.some(standard => standard.recognitionNumber === recognition));
  console.info(JSON.stringify({ code, matched: result.matched, contains: recognition }));
}
assert.deepEqual(parsed.dataset.standards.find(standard => standard.recognitionNumber === '12-121')?.productCodes, []);
const unknown = await lookupRecognizedStandards('ZZZ', { env });
assert(unknown.available && unknown.datasetLoaded);
assert.equal(unknown.matched, 0);
const unusable = JSON.parse(JSON.stringify(raw));
delete unusable.standards[1737].productCodes;
assert.equal(parseRecognizedStandardsDataset(unusable).ok, false);
console.info(JSON.stringify({ passed: true, records: 1738, productCodes: 1621, publishedAssociations: 7582, noPublishedAssociationRecords: 681, unknownCodeDistinctFromUnavailable: true, lastMalformedRecordRejectsWholeFile: true }));
