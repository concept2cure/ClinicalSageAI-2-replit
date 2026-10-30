/** Controlled SYNTHETIC orchestration tests, never agency qualification.
 * The real DTD/external truth interpreters remain in use. Package production,
 * native execution and external reports are explicitly controlled here; root
 * separately exercises the actual unconfigured native harness and CLI. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import type { PackagerInput } from '../../../submission-gateways/regional-packager';
import type { SubmissionBundle } from '../../../submission-gateways/types';
import type { BackboneValidation } from '../../backbone-validation';
import type { ExternalValidationReport, ExternalValidator, ValidateArgs } from '../../external-validator/types';
import type { RpsPackagerInput } from '../../ectd4/rps-packager';
import { validateEctdPackage } from '../../../submission-gateways/ectd-structural-validator';

const controlled = vi.hoisted(() => ({
  package: vi.fn(), rps: vi.fn(), backbone: vi.fn(), resolve: vi.fn(), run: vi.fn(), subset: vi.fn(),
  wellFormed: vi.fn(), xsd: vi.fn(), complete: true, tool: true, badAmendmentIndex: false,
  externalIssue: '', kind: 'external_engine', subsetSequences: [] as string[], badAmendmentCapturedIntegrity: false,
  malformedAmendmentCapturedIntegrity: '',
  zipFault: '', zipFaultSequence: '',
}));
vi.mock('../../../submission-gateways/regional-packager', async importOriginal => ({
  ...await importOriginal<typeof import('../../../submission-gateways/regional-packager')>(),
  packageEctdSubmission: controlled.package,
}));
vi.mock('../../backbone-validation', async importOriginal => ({
  ...await importOriginal<typeof import('../../backbone-validation')>(), validateBackboneFile: controlled.backbone,
}));
vi.mock('../../xml-validator', async importOriginal => ({
  ...await importOriginal<typeof import('../../xml-validator')>(),
  isXmllintAvailable: async () => controlled.tool,
  checkWellFormed: controlled.wellFormed, validateAgainstXsd: controlled.xsd,
}));
vi.mock('../../external-validator', async importOriginal => ({
  ...await importOriginal<typeof import('../../external-validator')>(),
  resolveExternalValidator: controlled.resolve, runExternalValidation: controlled.run,
}));
vi.mock('../../external-validator/fda-criteria-adapter', async importOriginal => ({
  ...await importOriginal<typeof import('../../external-validator/fda-criteria-adapter')>(),
  fdaCriteriaFallbackEnabled: () => controlled.kind === 'internal_subset', validateFdaCriteria: controlled.subset,
}));
vi.mock('../../ectd4', async importOriginal => ({
  ...await importOriginal<typeof import('../../ectd4')>(), packageRpsSubmission: controlled.rps,
}));

import { qualifyV3, qualifyV4, runQualification } from '../qualify';
import { goldenPdf } from '../golden-fixtures';

const PROFILE = 'SYNTHETIC-FDA-PROFILE';
const STYLES = ['ectd-2-0.xsl', 'us-regional.xsl', 'ich-stf-stylesheet-2-3.xsl'];
const DTDS = ['ich-ectd-3-2.dtd', 'us-regional-v3-3.dtd', 'ich-stf-v2-2.dtd'];
const STF = 'm5/study/stf-synthetic.xml';
const REGIONAL = 'm1/us/us-regional.xml';
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
let work: string;
let selected: ExternalValidator;
const digest = (text: string | Buffer, algorithm = 'md5') => createHash(algorithm).update(text).digest('hex');
const sequence = (directory: string) => directory.includes('-0001-') ? '0001' : '0000';
const lint = (mode: 'well-formed' | 'dtd' | 'xsd', valid = true) => ({
  mode, ran: controlled.tool, valid: controlled.tool && valid,
  errors: !controlled.tool ? ['SYNTHETIC native tool unavailable'] : valid ? [] : ['SYNTHETIC malformed amendment index'],
});

function nativeResult(directory: string, relPath: string): BackboneValidation {
  const bad = controlled.badAmendmentIndex && sequence(directory) === '0001' && relPath === 'index.xml';
  const wf = lint('well-formed', !bad);
  const dtd = controlled.complete ? lint('dtd', !bad) : { mode: 'dtd' as const, ran: false, valid: false, errors: ['SYNTHETIC DTD missing'] };
  const reports = [{ name: `xmllint well-formed (${relPath})`, ran: wf.ran, passed: wf.valid,
    errorCount: wf.ran && !wf.valid ? 1 : 0, warningCount: 0, sample: wf.errors },
  { name: `backbone DOCTYPE (${relPath})`, ran: true, passed: true, errorCount: 0, warningCount: 0, sample: [] }];
  if (controlled.complete) reports.push({ name: `xmllint DTD (${relPath})`, ran: dtd.ran, passed: dtd.valid,
    errorCount: dtd.ran && !dtd.valid ? 1 : 0, warningCount: 0, sample: dtd.errors });
  return { relPath, wellFormed: wf, doctype: { valid: true, errors: [] }, dtd, reports,
    dtdSkipped: controlled.complete ? null : { relPath, dtd: relPath === 'index.xml' ? DTDS[0] : relPath === STF ? DTDS[2] : DTDS[1] } };
}

async function writePackage(directory: string, entries: Record<string, string>): Promise<SubmissionBundle> {
  await fs.mkdir(directory, { recursive: true });
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) {
    await fs.mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await fs.writeFile(path.join(directory, name), content);
    zip.file(name, content);
  }
  const manifest = Object.entries(entries).map(([name, content]) => `${digest(content)}  ${name}`).join('\n') + '\n';
  zip.file('util/index-md5.txt', manifest);
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const zipPath = directory + '.zip';
  await fs.writeFile(zipPath, bytes);
  return { path: zipPath, sha256: digest(bytes, 'sha256'), sizeBytes: bytes.length, format: 'ectd' };
}

async function fakeV3(input: PackagerInput): Promise<SubmissionBundle> {
  const amendment = input.sequence === '0001';
  const entries = syntheticV3Entries(amendment, input.sequence);
  if (controlled.complete) for (const name of [...DTDS, ...STYLES]) entries[`${name.endsWith('.xsl') ? 'util/style' : 'util/dtd'}/${name}`] = 'SYNTHETIC SUPPORTIVE BYTES';
  const directory = path.join(input.outputDir, `${input.applicationId}-${input.sequence}-${input.region}`);
  const bundle = await writePackage(directory, entries);
  const expectedFiles = ['index.xml', 'm1/us/us-regional.xml', STF];
  const results = expectedFiles.map(rel => nativeResult(directory, rel));
  bundle.leafManifest = [{ ctdSection: '5.3.5.1', fileName: 'stf-synthetic.xml', href: STF, md5: digest(entries[STF]) }];
  bundle.stf = { studies: 1, leaves: 1, untagged: 0 };
  bundle.dtdStatus = { required: DTDS, present: controlled.complete ? DTDS : [], missing: controlled.complete ? [] : DTDS,
    requiredStylesheets: STYLES, presentStylesheets: controlled.complete ? STYLES : [], missingStylesheets: controlled.complete ? [] : STYLES,
    selfContained: controlled.complete, validation: { version: 1, expectedFiles,
      files: results.map(({ relPath, wellFormed, doctype, dtd }) => ({ relPath, wellFormed, doctype, dtd })),
      integrity: { verified: controlled.complete ? [...DTDS, ...STYLES] : [], mismatched: [], missingFiles: [], unlistedFiles: [], ok: true },
      passed: controlled.complete && controlled.tool && results.every(row => row.dtd.valid) } };
  applyCapturedIntegrityVariation(bundle, amendment);
  return bundle;
}

function syntheticLeaf(id: string, operation: string, href?: string, body?: string, modifiedFile?: string): string {
  const pointer = modifiedFile ? ` modified-file="${modifiedFile}"` : '';
  const file = href && body ? ` xlink:href="${href}" checksum="${digest(body)}" checksum-type="md5"` : '';
  return `<leaf ID="${id}" operation="${operation}"${pointer}${file}/>`;
}

function syntheticLifecycleLeaf(id: string, index: number, amendment: boolean, entries: Record<string, string>): string {
  const operation = amendment ? ['replace', 'append', 'delete'][index] : 'new';
  const href = `m3/${id}.pdf`;
  const body = operation === 'delete' ? undefined : goldenPdf(id).toString('utf8');
  if (body) entries[href] = body;
  return syntheticLeaf(id, operation, body ? href : undefined, body,
    amendment ? `../0000/index.xml#${id}` : undefined);
}

/** Faithful local structure only; native/schema/external evidence stays explicitly controlled. */
function syntheticV3Entries(amendment: boolean, sequenceNumber: string): Record<string, string> {
  const cover = goldenPdf('SYNTHETIC regional cover').toString('utf8');
  const entries: Record<string, string> = {
    'm1/us/synthetic-cover.pdf': cover,
    [STF]: `${XML_DECLARATION}<study>SYNTHETIC STF</study>`,
  };
  const leaves = ['synthetic-replace', 'synthetic-append', 'synthetic-delete']
    .map((id, index) => syntheticLifecycleLeaf(id, index, amendment, entries));
  entries[REGIONAL] = `${XML_DECLARATION}<regional xmlns:xlink="http://www.w3.org/1999/xlink">${syntheticLeaf('synthetic-m1', 'new', 'synthetic-cover.pdf', cover)}</regional>`;
  const fault = controlled.zipFaultSequence === sequenceNumber ? controlled.zipFault : '';
  if (fault === 'regional-leaf') entries[REGIONAL] = entries[REGIONAL].replace(digest(cover), 'f'.repeat(32));
  leaves.push(syntheticLeaf('synthetic-regional', 'new', REGIONAL, entries[REGIONAL]));
  leaves.push(syntheticLeaf('synthetic-stf', 'new', STF, entries[STF]));
  entries['index.xml'] = `${XML_DECLARATION}<ectd xmlns:xlink="http://www.w3.org/1999/xlink">${leaves.join('')}</ectd>`;
  if (fault === 'index-leaf') entries['index.xml'] = entries['index.xml'].replace(digest(entries['m3/synthetic-replace.pdf']), 'e'.repeat(32));
  if (fault !== 'missing-root') entries['index-md5.txt'] = fault === 'wrong-root' ? '0'.repeat(32) : digest(entries['index.xml']);
  return entries;
}

function applyCapturedIntegrityVariation(bundle: SubmissionBundle, amendment: boolean): void {
  if (!amendment || !(controlled.badAmendmentCapturedIntegrity || controlled.malformedAmendmentCapturedIntegrity)) return;
  const proof = bundle.dtdStatus!.validation!;
  const mismatch = { fileName: 'ich-stf-v2-2.dtd', expected: 'a'.repeat(64), actual: 'b'.repeat(64) };
  if (controlled.malformedAmendmentCapturedIntegrity === 'missing-hashes') {
    Reflect.deleteProperty(mismatch, 'expected'); Reflect.deleteProperty(mismatch, 'actual');
  } else if (controlled.malformedAmendmentCapturedIntegrity === 'invalid-hashes') {
    mismatch.expected = 'not-a-sha256'; mismatch.actual = 'also-not-a-sha256';
  } else if (controlled.malformedAmendmentCapturedIntegrity === 'equal-hashes') mismatch.actual = mismatch.expected;
  proof.integrity.mismatched = [mismatch];
  proof.integrity.ok = false;
  proof.passed = false;
}

async function fakeV4(input: RpsPackagerInput) {
  const directory = path.join(input.outputDir, `123456-${input.message.submissionUnit.sequenceNumber}-fda-v4`);
  const entries: Record<string, string> = { 'submissionUnit.xml': '<rps>SYNTHETIC RPS MESSAGE</rps>' };
  if (controlled.complete) entries['util/schema/rps-message.xsd'] = '<!-- SYNTHETIC XSD -->';
  return { ...await writePackage(directory, entries), validation: { valid: true, findings: [] } };
}

function externalReport(args: ValidateArgs): ExternalValidationReport {
  const seq = sequence(args.packageDir);
  if (controlled.kind === 'internal_subset') controlled.subsetSequences.push(seq);
  const report: ExternalValidationReport = { validator: selected.name, profile: PROFILE,
    ranAt: new Date('2026-10-30T00:00:00Z'), ran: true, findings: [], errorCount: 0, warningCount: 0, passed: true };
  if (seq !== '0001') return report;
  switch (controlled.externalIssue) {
    case 'content-error': return { ...report, findings: [{ ruleId: 'SYNTHETIC-CONTENT', severity: 'error', message: 'SYNTHETIC finding' }], errorCount: 1, passed: false };
    case 'identity': return { ...report, validator: 'SYNTHETIC-OTHER-ENGINE' };
    case 'profile': return { ...report, profile: 'SYNTHETIC-OTHER-PROFILE' };
    case 'counts': return { ...report, errorCount: 2 };
    case 'missing-findings': return { ...report, findings: undefined } as unknown as ExternalValidationReport;
    case 'unrun': return { ...report, ran: false, passed: false, findings: [{ ruleId: 'SYNTHETIC-UNRUN', severity: 'error', message: 'SYNTHETIC execution unavailable' }] };
    default: return report;
  }
}

beforeEach(async () => {
  vi.clearAllMocks();
  controlled.complete = true; controlled.tool = true; controlled.badAmendmentIndex = false;
  controlled.externalIssue = ''; controlled.kind = 'external_engine'; controlled.subsetSequences = [];
  controlled.badAmendmentCapturedIntegrity = false;
  controlled.malformedAmendmentCapturedIntegrity = '';
  controlled.zipFault = ''; controlled.zipFaultSequence = '';
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'qualification-outcome-test-'));
  const drop = path.join(work, 'drop'); await fs.mkdir(drop);
  const bodies = [...DTDS, ...STYLES].map(name => ({ name, body: 'SYNTHETIC SUPPORTIVE BYTES' }));
  for (const { name, body } of bodies) await fs.writeFile(path.join(drop, name), body);
  await fs.writeFile(path.join(drop, 'checksums.txt'), bodies.map(({ name, body }) => `${digest(body, 'sha256')}  ${name}`).join('\n'));
  vi.stubEnv('ECTD_DTD_DIR', drop); vi.stubEnv('ECTD_SCHEMA_DIR', path.join(work, 'schema-drop'));
  vi.stubEnv('EVALIDATOR_PROFILE_FDA', PROFILE);
  controlled.package.mockImplementation(fakeV3); controlled.rps.mockImplementation(fakeV4);
  controlled.backbone.mockImplementation(nativeResult);
  controlled.wellFormed.mockImplementation(async () => lint('well-formed'));
  controlled.xsd.mockImplementation(async () => lint('xsd'));
  selected = { name: 'SYNTHETIC-ENGINE', get kind() { return controlled.kind as ExternalValidator['kind']; },
    isConfigured: async () => controlled.kind !== 'unavailable', validate: async args => externalReport(args) };
  controlled.resolve.mockResolvedValue(selected);
  controlled.run.mockImplementation(async (args: ValidateArgs, adapter?: ExternalValidator) => (adapter ?? selected).validate(args));
  controlled.subset.mockImplementation(async (args: ValidateArgs) => externalReport(args));
});
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(work, { recursive: true, force: true }); });

async function missingAssets() {
  controlled.complete = false;
  const drop = path.join(work, 'drop');
  await fs.rm(drop, { recursive: true }); await fs.mkdir(drop); await fs.writeFile(path.join(drop, 'checksums.txt'), '');
}

describe('qualification outcomes retain local evidence without an incomplete pass (SYNTHETIC)', () => {
  it('blocks absent supportive assets and unavailable external selection while local checks pass', async () => {
    await missingAssets(); controlled.kind = 'unavailable';
    const report = await qualifyV3('fda', work);
    expect(report.passed).toBe(false);
    expect(report).toMatchObject({ status: 'blocked', availableChecksPassed: true,
      lifecycle: { status: 'blocked', availableChecksPassed: true, nextPackagePassed: false } });
    expect(report.blockers.join(' ')).toMatch(/0000.*DTD|0000.*support|0000.*schema/i);
    expect(report.blockers.join(' ')).toMatch(/0001/);
    expect(report.blockers.join(' ')).toMatch(/external/i);
    expect(report.checksum.ok).toBe(true);
  });

  it('passes complete coherent automated technical controls for both sequences, without an agency claim', async () => {
    const report = await qualifyV3('fda', work);
    expect(report).toMatchObject({ status: 'passed', passed: true, availableChecksPassed: true, blockers: [],
      lifecycle: { status: 'passed', nextPackagePassed: true, availableChecksPassed: true } });
    expect(controlled.run.mock.calls.map(([args]) => sequence(args.packageDir))).toEqual(['0000', '0001']);
    expect(report.validators.some(row => row.name.startsWith('0001/') && row.name.includes('index.xml'))).toBe(true);
    for (const pkg of [report.package, report.lifecycle.package]) {
      expect(await validateEctdPackage(await fs.readFile(pkg.path), { origin: 'platform-generated' }))
        .toMatchObject({ valid: true, errors: [] });
    }
    expect(report.packageValidation).toMatchObject({
      original: { valid: true, errors: [] }, amendment: { valid: true, errors: [] },
    });
    expect(report.validators.filter(row => row.name.endsWith('ectd-zip-structure'))).toEqual([
      expect.objectContaining({ name: 'ectd-zip-structure', ran: true, passed: true }),
      expect.objectContaining({ name: '0001/ectd-zip-structure', ran: true, passed: true }),
    ]);
  });

  it('records a coherent amendment external content failure as failed', async () => {
    controlled.externalIssue = 'content-error';
    const report = await qualifyV3('fda', work);
    expect(report.passed).toBe(false);
    expect(report).toMatchObject({ status: 'failed', lifecycle: { status: 'failed', nextPackagePassed: false } });
    expect(JSON.stringify(report)).toContain('SYNTHETIC-CONTENT');
  });

  it('fails an observed amendment captured-byte integrity mismatch even when native XML and ZIP checks pass', async () => {
    controlled.badAmendmentCapturedIntegrity = true;
    const report = await qualifyV3('fda', work);
    expect(report.passed).toBe(false);
    expect(report).toMatchObject({ status: 'failed', availableChecksPassed: false,
      lifecycle: { status: 'failed', availableChecksPassed: false, nextPackagePassed: false } });
    expect(report.blockers.join(' ')).toMatch(/0001/);
    expect(report.blockers.join(' ')).toContain('ich-stf-v2-2.dtd');
    expect(report.checksum.ok).toBe(true);
    expect(report.lifecycle.checksum.ok).toBe(true);
    expect(report.validators.filter(row => row.name.includes('well-formed') || row.name.includes('xmllint DTD')).every(row => row.ran && row.passed)).toBe(true);
    expect(report.validators.find(row => row.name === 'dtd-checksum-manifest')?.passed).toBe(true);
  });

  it.each(['missing-hashes', 'invalid-hashes', 'equal-hashes'])('blocks malformed amendment captured-byte proof (%s) without fabricating an observed mismatch', async problem => {
    controlled.malformedAmendmentCapturedIntegrity = problem;
    const report = await qualifyV3('fda', work);
    expect(report).toMatchObject({ status: 'blocked', passed: false, availableChecksPassed: true,
      lifecycle: { status: 'blocked', availableChecksPassed: true, nextPackagePassed: false } });
    expect(report.blockers.join(' ')).toMatch(/0001: Complete captured DTD\/supportive-byte qualification proof is unavailable/);
    expect(report.blockers.join(' ')).not.toMatch(/hash mismatch/);
    expect(report.checksum.ok).toBe(true);
    expect(report.lifecycle.checksum.ok).toBe(true);
    expect(report.validators.filter(row => row.name.includes('well-formed') || row.name.includes('xmllint DTD')).every(row => row.ran && row.passed)).toBe(true);
    expect(report.validators.find(row => row.name === 'dtd-checksum-manifest')?.passed).toBe(true);
  });

  it('does not omit an amendment-only index failure', async () => {
    controlled.badAmendmentIndex = true;
    const report = await qualifyV3('fda', work);
    expect(report.passed).toBe(false);
    expect(report).toMatchObject({ status: 'failed', lifecycle: { status: 'failed', nextPackagePassed: false } });
    expect(report.validators.some(row => row.name.startsWith('0001/') && row.name.includes('index.xml') && !row.passed)).toBe(true);
  });
});

const zipFaultCases = ['0000', '0001'].flatMap(sequenceNumber => [
  { sequenceNumber, fault: 'wrong-root', diagnostic: /index-md5\.txt records 0{32}, but the MD5 of index\.xml is/ },
  { sequenceNumber, fault: 'missing-root', diagnostic: /Missing required file: index-md5\.txt/ },
  { sequenceNumber, fault: 'index-leaf', diagnostic: /index\.xml: checksum mismatch for "m3\/synthetic-replace\.pdf"/ },
  { sequenceNumber, fault: 'regional-leaf', diagnostic: /m1\/us\/us-regional\.xml: checksum mismatch for "synthetic-cover\.pdf"/ },
]);

describe('qualification reaches canonical ZIP integrity for both sequences (SYNTHETIC)', () => {
  it.each(zipFaultCases)('fails $sequenceNumber $fault despite coherent util and native checks', async ({ sequenceNumber, fault, diagnostic }) => {
    controlled.zipFault = fault; controlled.zipFaultSequence = sequenceNumber;
    const report = await qualifyV3('fda', work);
    const failedPackage = sequenceNumber === '0000' ? report.package : report.lifecycle.package;
    const canonical = await validateEctdPackage(await fs.readFile(failedPackage.path), { origin: 'platform-generated' });
    // Establish the actual isolated defect before asking the harness to report it.
    expect(canonical.valid).toBe(false);
    expect(canonical.errors).toHaveLength(1);
    expect(canonical.errors[0]).toMatch(diagnostic);
    expect(report.checksum).toMatchObject({ ok: true, mismatches: [], missing: [] });
    expect(report.lifecycle.checksum).toMatchObject({ ok: true, mismatches: [], missing: [] });
    expect(report.validators.filter(row => row.name.includes('well-formed') || row.name.includes('xmllint DTD'))
      .every(row => row.ran && row.passed)).toBe(true);
    expect(report.validators.find(row => row.name === 'dtd-checksum-manifest')?.passed).toBe(true);
    expect(report).toMatchObject({ status: 'failed', passed: false, availableChecksPassed: false });
    expect(report.lifecycle).toMatchObject(sequenceNumber === '0000'
      ? { status: 'passed', availableChecksPassed: true, nextPackagePassed: true }
      : { status: 'failed', availableChecksPassed: false, nextPackagePassed: false });
    const role = sequenceNumber === '0000' ? 'original' : 'amendment';
    expect(report.packageValidation?.[role]).toEqual(canonical);
    expect(report.blockers.join(' ')).toContain(sequenceNumber);
    expect(report.blockers.join(' ')).toMatch(diagnostic);
  });
});

describe('invalid or unrun external evidence blocks qualification (SYNTHETIC)', () => {
  it.each(['identity', 'profile', 'counts', 'missing-findings', 'unrun'])('blocks amendment %s without fabricating a package-content failure', async problem => {
    controlled.externalIssue = problem;
    const report = await qualifyV3('fda', work);
    expect(report.passed).toBe(false);
    expect(report).toMatchObject({ status: 'blocked', lifecycle: { status: 'blocked', nextPackagePassed: false } });
    expect(report.blockers.join(' ')).toMatch(/0001/);
  });

  it('blocks a missing requested FDA profile even with otherwise clean report metadata', async () => {
    vi.stubEnv('EVALIDATOR_PROFILE_FDA', undefined);
    const report = await qualifyV3('fda', work);
    expect(report.passed).toBe(false);
    expect(report.status).toBe('blocked');
    expect(report.blockers.join(' ')).toMatch(/profile/i);
  });

  it('runs an opted-in subset at most once per sequence and never calls it an external qualification', async () => {
    controlled.kind = 'internal_subset';
    const report = await qualifyV3('fda', work);
    expect(report.passed).toBe(false);
    expect(report.status).toBe('blocked');
    expect(controlled.subsetSequences.sort()).toEqual(['0000', '0001']);
    expect(report.blockers.join(' ')).toMatch(/subset|external/i);
  });

  it('blocks missing native capability without claiming an executed content failure', async () => {
    controlled.tool = false;
    const report = await qualifyV3('fda', work);
    expect(report).toMatchObject({ status: 'blocked', passed: false });
    expect(report.validators.some(row => !row.ran)).toBe(true);
  });
});

describe('v4 and summary completeness outcomes (SYNTHETIC)', () => {
  it('keeps v4 blocked without captured/confined schema proof even when local XSD execution passes', async () => {
    const report = await qualifyV4(work);
    expect(report.passed).toBe(false);
    expect(report).toMatchObject({ status: 'blocked', availableChecksPassed: true,
      lifecycle: { status: 'blocked', availableChecksPassed: true, nextPackagePassed: false } });
    expect(report.blockers.join(' ')).toMatch(/captur|confin/i);
    expect(report.validators.filter(row => row.name.includes('XSD')).every(row => row.ran && row.passed)).toBe(true);
    expect(controlled.run.mock.calls.map(([args]) => sequence(args.packageDir))).toEqual(['0000', '0001']);
  });

  it('does not produce a vacuous passing summary when no target was selected', async () => {
    const summary = await runQualification({ v3Regions: [], includeV4: false, workDir: work, reportDir: path.join(work, 'reports') });
    expect(summary.passed).toBe(false);
    expect(summary).toMatchObject({ status: 'blocked', availableChecksPassed: false });
    expect(summary.blockers.join(' ')).toMatch(/target|select|empty/i);
    expect(controlled.package).not.toHaveBeenCalled();
    expect(controlled.rps).not.toHaveBeenCalled();
  });
});
