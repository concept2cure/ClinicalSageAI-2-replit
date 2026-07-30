/**
 * eCTD qualification harness.
 *
 * Proves the publishing engine against real validators, per the qualification
 * contract: for each supported region + version —
 *   1. generate a golden package (deterministic fixtures);
 *   2. run the accepted validators — xmllint (well-formedness always; DTD/XSD
 *      when the licensed DTD/RPS schema is vendored), the FDA-criteria subset,
 *      the configured external eValidator (LORENZ) when present, and the RPS
 *      model validator for v4.0;
 *   3. preserve the report, recording the EXACT spec version qualified against;
 *   4. exercise a lifecycle sequence (original → amendment) with
 *      replace / delete / append (v3.2.2) or revise (v4.0);
 *   5. reopen the produced ZIP and re-verify EVERY checksum + per-document
 *      integrity.
 *
 * Deterministic and reproducible. Writes one JSON report per run.
 *
 * @module server/services/ectd/qualification/qualify
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import { packageEctdSubmission } from '../../submission-gateways/regional-packager';
// Region is declared in the gateway's types module; regional-packager only
// imports it (TS2459 if re-imported from there).
import type { Region } from '../../submission-gateways/types';
import { packageRpsSubmission, validateRpsMessage } from '../ectd4';
import {
  checkWellFormed,
  validateAgainstDtd,
  isXmllintAvailable,
} from '../xml-validator';
import { validateFdaCriteria, fdaCriteriaFallbackEnabled } from '../external-validator/fda-criteria-adapter';
import { resolveExternalValidator } from '../external-validator';
import {
  writeGoldenLeaves,
  v3GoldenInput,
  v4GoldenMessage,
} from './golden-fixtures';

/** Exact spec versions each qualification run is measured against. */
export const SPEC_VERSIONS = {
  'v3.2.2': {
    ichBackbone: 'ICH eCTD v3.2.2',
    fdaRegionalDtd: 'FDA US Regional DTD v3.3 (eCTD Backbone Files Specification for Module 1)',
    validationCriteria: 'FDA Specifications for eCTD Validation Criteria v4.5 (2025-10-01)',
    fileFormats: 'FDA Specifications for File Format Types v9.3 (2025-08-20)',
    transmission: 'FDA Transmitting eCTD Submissions v2.0 (2026-07)',
  },
  'v4.0': {
    message: 'ICH eCTD v4.0 / HL7 RPS message (PORP_IN000001UV)',
    fdaRegionalIg: 'FDA eCTD v4.0 Regional IG OID 2.16.840.1.113883.3.989.5.1.2.2.1.18.8',
    controlledVocab: 'FDA eCTD v4.0 Controlled Vocabulary Package v1.1 (2026-06)',
    validationCriteria: 'FDA Specifications for eCTD v4.0 Validation Criteria v1.5',
  },
} as const;

export type EctdVersion = keyof typeof SPEC_VERSIONS;

export interface ValidatorRunReport {
  name: string;
  ran: boolean;
  passed: boolean;
  errorCount: number;
  warningCount: number;
  /** First few messages, for the report (full findings are large). */
  sample: string[];
}

export interface ChecksumVerification {
  manifest: string;
  filesChecked: number;
  mismatches: Array<{ relPath: string; expected: string; actual: string }>;
  missing: string[];
  ok: boolean;
}

export interface QualificationReport {
  id: string;
  version: EctdVersion;
  region: Region;
  specVersions: Record<string, string>;
  package: { path: string; sha256: string; sizeBytes: number };
  validators: ValidatorRunReport[];
  checksum: ChecksumVerification;
  lifecycle: {
    priorSequence: string;
    nextSequence: string;
    /** Operations exercised (replace/delete/append or revise). */
    operations: string[];
    nextPackagePassed: boolean;
    checksum: ChecksumVerification;
  };
  passed: boolean;
  ranAt: string;
  notes: string[];
}

/** Reopen a ZIP and re-verify every entry against its util/index-md5.txt line. */
async function verifyZipChecksums(zipPath: string): Promise<ChecksumVerification> {
  const buf = await fs.readFile(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const manifestFile = zip.file('util/index-md5.txt') ?? zip.file('index-md5.txt');
  const result: ChecksumVerification = {
    manifest: manifestFile ? manifestFile.name : '(none)',
    filesChecked: 0,
    mismatches: [],
    missing: [],
    ok: false,
  };
  if (!manifestFile) return result;

  const manifest = await manifestFile.async('string');
  for (const line of manifest.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf('  ');
    if (sep < 0) continue;
    const expected = trimmed.slice(0, sep).trim();
    const relPath = trimmed.slice(sep + 2).trim();
    const entry = zip.file(relPath);
    if (!entry) {
      result.missing.push(relPath);
      continue;
    }
    const actual = createHash('md5').update(await entry.async('nodebuffer')).digest('hex');
    result.filesChecked += 1;
    if (actual !== expected) result.mismatches.push({ relPath, expected, actual });
  }
  result.ok = result.mismatches.length === 0 && result.missing.length === 0;
  return result;
}

function tally(name: string, ran: boolean, findings: Array<{ severity: string; message: string }>): ValidatorRunReport {
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  return {
    name,
    ran,
    passed: ran && errors.length === 0,
    errorCount: errors.length,
    warningCount: warnings.length,
    sample: findings.slice(0, 5).map((f) => `[${f.severity}] ${f.message}`),
  };
}

/** Run xmllint well-formedness (and DTD validity when a DTD is present) on a
 *  backbone file inside the unzipped tree. */
async function validateBackboneFile(packageDir: string, relPath: string): Promise<ValidatorRunReport[]> {
  const filePath = path.join(packageDir, relPath);
  const out: ValidatorRunReport[] = [];
  const wf = await checkWellFormed(filePath, true);
  out.push(tally(`xmllint well-formed (${relPath})`, wf.ran, wf.errors.map((m) => ({ severity: wf.valid ? 'info' : 'error', message: m }))));
  // DTD validation only meaningful when the DTDs are vendored into util/dtd/.
  const dtdDir = path.join(packageDir, 'util', 'dtd');
  const hasDtds = await fs.readdir(dtdDir).then((f) => f.some((n) => n.endsWith('.dtd'))).catch(() => false);
  if (hasDtds) {
    const dtd = await validateAgainstDtd(filePath);
    out.push(tally(`xmllint DTD (${relPath})`, dtd.ran, dtd.valid ? [] : dtd.errors.map((m) => ({ severity: 'error', message: m }))));
  }
  return out;
}

/** Qualify one region for eCTD v3.2.2. */
export async function qualifyV3(region: Region, workDir: string): Promise<QualificationReport> {
  const notes: string[] = [];
  const app = region === 'fda' ? '123456' : 'GOLDEN-APP';
  const leavesDir = path.join(workDir, `v3-${region}-leaves`);
  const paths = await writeGoldenLeaves(leavesDir);
  const outDir = path.join(workDir, `v3-${region}-out`);

  // 1. Original sequence (0000).
  const bundle = await packageEctdSubmission(v3GoldenInput({ region, sequence: '0000', applicationId: app, outputDir: outDir, paths }));
  const pkgDir = path.join(outDir, `${app}-0000-${region}`);

  // 2. Validators.
  const validators: ValidatorRunReport[] = [];
  validators.push(...(await validateBackboneFile(pkgDir, 'index.xml')));
  // Regional Module-1 subfolder + backbone filename per region (fda→us/eu/jp/ca).
  const m1Sub: Partial<Record<Region, string>> = { fda: 'us', ema: 'eu', pmda: 'jp', ca: 'ca' };
  const sub = m1Sub[region] ?? region;
  const regionalRel = `m1/${sub}/${sub}-regional.xml`;
  validators.push(...(await validateBackboneFile(pkgDir, regionalRel)));
  if (fdaCriteriaFallbackEnabled() && (region === 'fda' || region === 'ema' || region === 'pmda')) {
    const rep = await validateFdaCriteria({ packageDir: pkgDir, region });
    validators.push(tally(`fda-criteria-subset`, rep.ran, rep.findings));
  }
  const external = await resolveExternalValidator();
  if (await external.isConfigured() && (region === 'fda' || region === 'ema' || region === 'pmda')) {
    const rep = await external.validate({ packageDir: pkgDir, region });
    validators.push(tally(external.name, rep.ran, rep.findings));
    notes.push(`External validator "${external.name}" ran.`);
  } else {
    notes.push('No external eValidator configured; xmllint + FDA-criteria subset are the accepted validators for this run.');
  }

  // 3. Reopen + verify checksums.
  const checksum = await verifyZipChecksums(bundle.path);

  // 4. Lifecycle: amendment 0001 with replace/delete/append.
  const lcBundle = await packageEctdSubmission(v3GoldenInput({ region, sequence: '0001', applicationId: app, outputDir: outDir, paths, lifecycle: true, priorSequence: '0000' }));
  const lcDir = path.join(outDir, `${app}-0001-${region}`);
  const lcRegional = await validateBackboneFile(lcDir, regionalRel);
  const lcChecksum = await verifyZipChecksums(lcBundle.path);
  const lcPassed = lcRegional.every((v) => v.passed) && lcChecksum.ok;

  const passed = validators.every((v) => v.passed) && checksum.ok;
  return {
    id: `v3.2.2-${region}`,
    version: 'v3.2.2',
    region,
    specVersions: SPEC_VERSIONS['v3.2.2'],
    package: { path: bundle.path, sha256: bundle.sha256, sizeBytes: bundle.sizeBytes },
    validators,
    checksum,
    lifecycle: {
      priorSequence: '0000',
      nextSequence: '0001',
      operations: ['replace', 'append', 'delete'],
      nextPackagePassed: lcPassed,
      checksum: lcChecksum,
    },
    passed: passed && lcPassed,
    ranAt: '(stamped by caller)',
    notes,
  };
}

/** Qualify FDA for eCTD v4.0 (HL7 RPS). */
export async function qualifyV4(workDir: string): Promise<QualificationReport> {
  const notes: string[] = [];
  const app = '123456';
  const outDir = path.join(workDir, 'v4-fda-out');

  // 1. Original submission unit (0000).
  const golden = v4GoldenMessage({ applicationId: app, sequence: '0000' });
  const pkg = await packageRpsSubmission({ message: golden.message, sources: golden.sources, outputDir: outDir, emitUnzipped: true, creationTime: '20260730120000' });
  const pkgDir = path.join(outDir, `${app}-0000-fda-v4`);

  // 2. Validators: RPS model + xmllint well-formed on the message.
  const validators: ValidatorRunReport[] = [];
  validators.push(tally('rps-model-validator', true, pkg.validation.findings));
  if (await isXmllintAvailable()) {
    const wf = await checkWellFormed(path.join(pkgDir, 'submissionUnit.xml'), true);
    validators.push(tally('xmllint well-formed (submissionUnit.xml)', wf.ran, wf.valid ? [] : wf.errors.map((m) => ({ severity: 'error', message: m }))));
  }
  notes.push('RPS XSD validation runs when the ICH RPS schema is vendored into util/schema/ (see xml-validator).');

  // 3. Reopen + verify: package checksums AND in-message SHA-256 integrity.
  const checksum = await verifyZipChecksums(pkg.path);
  const integrityMismatches = await verifyRpsIntegrity(pkg.path);
  if (integrityMismatches.length) {
    notes.push(`In-message document integrity mismatches: ${integrityMismatches.join(', ')}`);
  }

  // 4. Lifecycle: amendment 0001 (revise) referencing 0000 CoUs.
  const golden1 = v4GoldenMessage({ applicationId: app, sequence: '0001', lifecycle: true, priorSequence: '0000' });
  const lcValidation = validateRpsMessage(golden1.message, '0001');
  const lcPkg = await packageRpsSubmission({ message: golden1.message, sources: golden1.sources, outputDir: outDir, emitUnzipped: true, creationTime: '20260730120000' });
  const lcChecksum = await verifyZipChecksums(lcPkg.path);
  const lcPassed = lcValidation.valid && lcChecksum.ok;

  const passed = validators.every((v) => v.passed) && checksum.ok && integrityMismatches.length === 0;
  return {
    id: 'v4.0-fda',
    version: 'v4.0',
    region: 'fda',
    specVersions: SPEC_VERSIONS['v4.0'],
    package: { path: pkg.path, sha256: pkg.sha256, sizeBytes: pkg.sizeBytes },
    validators,
    checksum,
    lifecycle: {
      priorSequence: '0000',
      nextSequence: '0001',
      operations: ['revise'],
      nextPackagePassed: lcPassed,
      checksum: lcChecksum,
    },
    passed: passed && lcPassed,
    ranAt: '(stamped by caller)',
    notes,
  };
}

/** Verify each RPS document's in-message SHA-256 integrityCheck matches the
 *  bytes shipped in the ZIP. Returns the hrefs that mismatch. */
async function verifyRpsIntegrity(zipPath: string): Promise<string[]> {
  const buf = await fs.readFile(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const msg = await (zip.file('submissionUnit.xml')?.async('string') ?? Promise.resolve(''));
  const mismatches: string[] = [];
  // Pair each <text ... integrityCheck="HASH"> with the following <reference value="HREF"/>.
  const docRe = /integrityCheck="([0-9a-f]+)"[\s\S]*?<reference value="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = docRe.exec(msg)) !== null) {
    const [, hash, href] = m;
    const entry = zip.file(href);
    if (!entry) { mismatches.push(`${href} (missing)`); continue; }
    const actual = createHash('sha256').update(await entry.async('nodebuffer')).digest('hex');
    if (actual !== hash) mismatches.push(`${href} (hash)`);
  }
  return mismatches;
}

export interface RunQualificationOptions {
  /** Regions to qualify for v3.2.2 (default: fda, ema, pmda, ca). */
  v3Regions?: Region[];
  /** Include the v4.0 FDA qualification (default: true). */
  includeV4?: boolean;
  /** Directory to write JSON reports into (default: <cwd>/qualification-reports). */
  reportDir?: string;
  /** ISO timestamp to stamp reports with (caller supplies for determinism). */
  ranAt?: string;
  /** Working dir for generated packages (default: a fresh temp dir). */
  workDir?: string;
}

export interface QualificationSummary {
  ranAt: string;
  reportDir: string;
  reports: QualificationReport[];
  passed: boolean;
}

/** Run the full qualification suite and preserve the reports. */
export async function runQualification(opts: RunQualificationOptions = {}): Promise<QualificationSummary> {
  const ranAt = opts.ranAt ?? new Date().toISOString();
  const reportDir = opts.reportDir ?? path.resolve(process.cwd(), 'qualification-reports');
  const workDir = opts.workDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-qual-')));
  const v3Regions = opts.v3Regions ?? (['fda', 'ema', 'pmda', 'ca'] as Region[]);

  const reports: QualificationReport[] = [];
  for (const region of v3Regions) {
    const r = await qualifyV3(region, workDir);
    r.ranAt = ranAt;
    reports.push(r);
  }
  if (opts.includeV4 !== false) {
    const r = await qualifyV4(workDir);
    r.ranAt = ranAt;
    reports.push(r);
  }

  await fs.mkdir(reportDir, { recursive: true });
  for (const r of reports) {
    await fs.writeFile(path.join(reportDir, `${r.id}.json`), JSON.stringify(r, null, 2));
  }
  const summary: QualificationSummary = {
    ranAt,
    reportDir,
    reports,
    passed: reports.every((r) => r.passed),
  };
  await fs.writeFile(path.join(reportDir, 'summary.json'), JSON.stringify(summary, null, 2));
  return summary;
}
