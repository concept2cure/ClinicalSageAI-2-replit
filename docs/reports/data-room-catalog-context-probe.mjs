import assert from 'node:assert/strict';
import { verifyKeyDataAgainstText, computeCoverage, assertCatalogWriteAllowed } from '../../server/services/vault/document-catalog-core.ts';
const source = 'Assay A sensitivity: 95.0%. Assay B sensitivity: 99.2%. Both studies used adult plasma samples.';
const cases = [
  ['correct context', '95.0%', true],
  ['invented value', '98.4%', false],
  ['value from another assay', '99.2%', true]
];
const findings = cases.map(([name, value, expected]) => {
  const result = verifyKeyDataAgainstText({assayA_sensitivity: value}, source);
  assert.equal(result.verified, expected);
  return {name, value, verified: result.verified};
});
const gate = assertCatalogWriteAllowed(
  computeCoverage([{start:0,end:source.length}],source.length),
  {assayA_sensitivity:'99.2%'},
  source
);
assert.equal(gate.allowed, true);
console.info(JSON.stringify({source, findings, fullCoverageGateAllowsMislabeledValue: gate.allowed},null,2));

