import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveExternalValidator,
  evaluateExternalValidationGate,
  evalidatorRequiredFromEnv,
  LorenzEValidatorAdapter,
} from '../../../server/services/ectd/external-validator/index.ts';

// This process uses local synthetic files only. Prevent any endpoint from being
// selected or called, without reading or printing configured secret values.
delete process.env.EVALIDATOR_BINARY;
delete process.env.EVALIDATOR_ENDPOINT;
delete process.env.EVALIDATOR_USE_FDA_CRITERIA_FALLBACK;
process.env.ECTD_REQUIRE_EVALIDATOR = 'true';
globalThis.fetch = async () => { throw new Error('Network is forbidden in this probe.'); };

const fixture = await mkdtemp(join(tmpdir(), 'c2c-validator-classification-'));
try {
  await mkdir(join(fixture, 'util'), { recursive: true });
  await mkdir(join(fixture, 'm1', 'us'), { recursive: true });
  await writeFile(join(fixture, 'index.xml'), '<synthetic-backbone/>\n');
  await writeFile(join(fixture, 'util', 'index-md5.txt'), 'synthetic nonempty checksum placeholder\n');
  await writeFile(join(fixture, 'm1', 'us', 'us-regional.xml'), '<synthetic-regional/>\n');

  const licensedConfigured = await new LorenzEValidatorAdapter().isConfigured();
  assert.equal(licensedConfigured, false);
  const required = evalidatorRequiredFromEnv();
  assert.equal(required, true);

  // Control: the existing required-production gate refuses when no validator runs.
  const noop = await resolveExternalValidator();
  assert.equal(noop.name, 'noop');
  const noopReport = await noop.validate({ packageDir: fixture, region: 'fda' });
  const noValidatorGate = evaluateExternalValidationGate({
    report: noopReport,
    // Configuration and selected identity come from the server adapter.
    configured: await noop.isConfigured(),
    selectedValidator: { name: noop.name, kind: noop.kind },
    requireEvalidator: required,
    environment: 'production',
  });
  assert.equal(noValidatorGate.cleared, false);

  // Regression: the real internal subset cannot satisfy required external validation.
  process.env.EVALIDATOR_USE_FDA_CRITERIA_FALLBACK = 'true';
  const subset = await resolveExternalValidator();
  assert.equal(subset.name, 'fda-criteria-subset');
  const subsetReport = await subset.validate({ packageDir: fixture, region: 'fda' });
  assert.equal(subsetReport.validator, 'fda-criteria-subset');
  assert.equal(subsetReport.ran, true);
  assert.equal(subsetReport.passed, true);
  assert.equal(subsetReport.errorCount, 0);
  assert.ok(subsetReport.findings.some(f => f.ruleId === 'C2C-SUBSET-NOTICE'));
  const subsetGate = evaluateExternalValidationGate({
    report: subsetReport,
    // Configuration and selected identity come from the server adapter.
    configured: await subset.isConfigured(),
    selectedValidator: { name: subset.name, kind: subset.kind },
    requireEvalidator: required,
    environment: 'production',
  });
  assert.equal(subsetGate.cleared, false);
  assert.equal(subsetGate.validatorKind, 'internal_subset');
  assert.equal(subsetGate.qualifyingRun, false);
  assert.equal(subsetGate.assessmentStatus, 'not_assessed');
  assert.equal(subsetGate.errorCountKnown, true);
  assert.ok(subsetGate.blockers.length > 0);

  console.log(JSON.stringify({
    fixture: 'synthetic nonempty filenames only; not a valid eCTD dossier',
    licensedValidatorConfigured: licensedConfigured,
    requireEvalidator: required,
    environment: 'production',
    control: {
      selectedValidator: noop.name,
      ran: noopReport.ran,
      gateConfigured: noValidatorGate.configured,
      gateCleared: noValidatorGate.cleared,
      blockerCount: noValidatorGate.blockers.length,
    },
    regression: {
      selectedValidator: subset.name,
      validatorKind: subsetGate.validatorKind,
      qualifyingRun: subsetGate.qualifyingRun,
      assessmentStatus: subsetGate.assessmentStatus,
      errorCountKnown: subsetGate.errorCountKnown,
      reportValidator: subsetReport.validator,
      ran: subsetReport.ran,
      errorCount: subsetReport.errorCount,
      reportPassed: subsetReport.passed,
      notice: subsetReport.findings.find(f => f.ruleId === 'C2C-SUBSET-NOTICE')?.message,
      gateConfigured: subsetGate.configured,
      gateCleared: subsetGate.cleared,
      blockers: subsetGate.blockers,
    },
  }, null, 2));
} finally {
  // Remove only the unique directory this probe created, including on failure.
  await rm(fixture, { recursive: true, force: true });
}
