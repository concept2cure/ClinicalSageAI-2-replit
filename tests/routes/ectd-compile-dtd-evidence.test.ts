/** The existing compiler records and exposes the packager's actual XML proof. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import JSZip from 'jszip';
import { createMockResponse } from '../setup';
import type { DtdValidationEvidence } from '../../shared/regulatory/ectd-dtd-validation';
const { poolQuery, assembleSequenceMock } = vi.hoisted(() => ({ poolQuery: vi.fn(), assembleSequenceMock: vi.fn() }));
vi.mock('../../server/db', () => ({ pool: { query: poolQuery } }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({ query: poolQuery }) }));
vi.mock('../../server/services/ectd/assemble-from-core', async original => {
  const actual = await original<typeof import('../../server/services/ectd/assemble-from-core')>();
  return { assembleSequence: assembleSequenceMock, assembledTransmitBlockers: actual.assembledTransmitBlockers };
});
import routes from '../../server/routes/ectd-compile';
import { assembledResult, handlerOf, makeFdaPackageZip, makeReq, mockSpineOn, ORG } from './ectd-compile-spine.harness';

const EXPECTED = ['index.xml', 'm1/us/us-regional.xml', 'm5/stf-study-101.xml'];
const REQUIRED = ['ich-ectd-3-2.dtd', 'us-regional-v3-3.dtd', 'ich-stf-v2-2.dtd'];
const STYLES = ['ectd-2-0.xsl', 'us-regional.xsl'];
const mockSpine = mockSpineOn(poolQuery);
const tempDirs = new Set<string>();
function proof(): DtdValidationEvidence {
  return { version: 1, expectedFiles: [...EXPECTED], passed: true,
    files: EXPECTED.map(relPath => ({ relPath, wellFormed: { ran: true, valid: true, errors: [], mode: 'well-formed' },
      doctype: { valid: true, errors: [] }, dtd: { ran: true, valid: true, errors: [], mode: 'dtd' } })),
    integrity: { verified: [...EXPECTED.map(name => name.split('/').pop()!), ...REQUIRED, ...STYLES], mismatched: [], missingFiles: [], unlistedFiles: [], ok: true },
  };
}
const dtdStatus = (validation: unknown = proof()) => ({ required: REQUIRED, present: REQUIRED, missing: [], missingStylesheets: [],
  requiredStylesheets: STYLES, presentStylesheets: STYLES, selfContained: true, validation });
type Finding = { rule: string; severity: string; message: string; evidence?: unknown };
type CompilePayload = { package: { sha256: string; dtdStatus: unknown; regionalStatus: unknown }; status: string;
  submissionReady: boolean; contentValidationPassed: boolean; validationResults: Finding[]; errors: string[]; warnings: string[]; submissionBlockers: string[] };
async function compile(validation: unknown = proof()) {
  mockSpine({ pack: [{ key: '2.5', mandatory: true }, { key: '3.2.S', mandatory: true }] });
  const { zipPath } = await makeFdaPackageZip();
  tempDirs.add(zipPath.slice(0, zipPath.lastIndexOf('/')));
  const zip = await JSZip.loadAsync(await fs.readFile(zipPath));
  zip.file(EXPECTED[2], '<study/>');
  await fs.writeFile(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));
  const base = assembledResult(zipPath);
  assembleSequenceMock.mockResolvedValue({ ...base, bundle: { ...base.bundle, dtdStatus: dtdStatus(validation),
    regionalBackbone: { region: 'fda', file: EXPECTED[1], regionConformant: validation === undefined ? false : true } } });
  const res = createMockResponse();
  await handlerOf(routes, '/:projectIdent/compile', 'post')(makeReq(), res);
  return res.json.mock.calls[0][0] as CompilePayload;
}
async function history(rows: unknown[]) {
  mockSpine({ history: rows }); const res = createMockResponse();
  await handlerOf(routes, '/:projectIdent/history', 'get')(makeReq(), res);
  return res.json.mock.calls[0][0] as { compilations: Array<{ id: number; packageDtdValidation: unknown; external_validation?: unknown }> };
}
const recorded = (status: unknown) => ({ rule: 'package_dtd_validation', severity: 'info', message: 'Recorded DTD validation',
  evidence: { packageSha256: 'a'.repeat(64), dtdStatus: status } });
beforeEach(() => vi.clearAllMocks());
afterEach(async () => { await Promise.all([...tempDirs].map(dir => fs.rm(dir, { recursive: true, force: true }))); tempDirs.clear(); });

describe('compile carries the existing package DTD proof', () => {
  it('projects complete index, regional and STF proof and persists it in the existing findings record', async () => {
    const evidence = proof(); const payload = await compile(evidence);
    expect(payload.package.dtdStatus).toEqual(dtdStatus(evidence));
    expect(payload.package.regionalStatus).toMatchObject({ region: 'fda', file: EXPECTED[1], regionConformant: true });
    const summary = payload.validationResults.find(row => row.rule === 'package_dtd_validation');
    expect(summary).toMatchObject({ severity: 'info', evidence: { packageSha256: 'a'.repeat(64), dtdStatus: dtdStatus(evidence) } });
    const insert = poolQuery.mock.calls.find(call => /INSERT INTO ectd_compilations/.test(String(call[0])));
    expect(JSON.parse(String(insert?.[1]?.[5]))).toContainEqual(summary);
    expect(payload.submissionReady).toBe(true);
  });
  it('counts an executed invalid STF as an error while preserving report-only compilation', async () => {
    const evidence = proof(); evidence.files[2].dtd.valid = false; evidence.files[2].dtd.errors = ['Unexpected doc-content element']; evidence.passed = false;
    const payload = await compile(evidence);
    expect(payload.status).toBe('completed'); expect(payload.submissionReady).toBe(false);
    expect(payload.contentValidationPassed).toBe(false);
    expect(payload.errors.some(message => message.includes(EXPECTED[2]) && message.includes('Unexpected doc-content element'))).toBe(true);
    expect(payload.submissionBlockers.join(' ')).toMatch(/DTD.*(not|failed|unverified)/i);
  });
  it('reports invalid XML even when an executed validator supplied no diagnostics', async () => {
    const evidence = proof(); evidence.files[2].dtd.valid = false; evidence.passed = false;
    const payload = await compile(evidence);
    expect(payload.errors.some(message => message.includes(EXPECTED[2]) && /DTD/.test(message))).toBe(true);
    expect(payload.contentValidationPassed).toBe(false);
  });
  it('never calls contradictory valid flags with diagnostics a passed DTD check', async () => {
    const evidence = proof(); evidence.files[2].dtd.errors = ['Unexpected validator diagnostic'];
    const payload = await compile(evidence);
    expect(payload.submissionReady).toBe(false);
    expect(payload.validationResults.find(row => row.rule === 'package_dtd_validation')?.severity).not.toBe('info');
    expect(payload.warnings.join(' ')).toContain('Unexpected validator diagnostic');
  });
  it.each(['missing', 'empty', 'not-ran', 'duplicate'] as const)('never reads %s evidence as a passed DTD check', async kind => {
    const evidence = proof();
    if (kind === 'empty') { evidence.expectedFiles = []; evidence.files = []; }
    if (kind === 'not-ran') evidence.files[2].dtd.ran = false;
    if (kind === 'duplicate') evidence.files.push(evidence.files[0]);
    const payload = await compile(kind === 'missing' ? null : evidence);
    expect(payload.submissionReady).toBe(false);
    const summary = payload.validationResults.find(row => row.rule === 'package_dtd_validation');
    expect(summary).toBeTruthy(); expect(summary?.severity).not.toBe('info');
    expect(payload.submissionBlockers.join(' ')).toMatch(/DTD/i);
  });
  it('reports integrity failures through the existing validation findings and counters', async () => {
    const evidence = proof(); evidence.integrity.missingFiles = ['util/dtd/ich-stf-v2-2.dtd']; evidence.integrity.ok = false; evidence.passed = false;
    const payload = await compile(evidence);
    expect(payload.submissionReady).toBe(false);
    expect(payload.errors.join(' ')).toMatch(/ich-stf-v2-2\.dtd/);
  });
});

describe('compile history decodes its existing JSON evidence defensively', () => {
  it('projects the typed proof and preserves the separate imported agency report', async () => {
    const status = dtdStatus(); const report = { validator: 'External validator', errorCount: 0 };
    const result = await history([{ id: 3, validation_results: [recorded(status)], external_validation: report }]);
    expect(result.compilations[0].packageDtdValidation).toEqual({ packageSha256: 'a'.repeat(64), dtdStatus: status });
    expect(result.compilations[0].external_validation).toEqual(report);
    const read = poolQuery.mock.calls.find(call => /FROM ectd_compilations/.test(String(call[0])));
    expect(String(read?.[0])).toMatch(/validation_results/); expect(read?.[1]?.[0]).toBe(ORG);
  });
  it.each([undefined, [], [{ rule: 'other', severity: 'info', message: 'Not DTD proof' }],
    [recorded({ selfContained: true, validation: { passed: true } })],
    [recorded(dtdStatus()), recorded(dtdStatus())],
    [{ ...recorded(dtdStatus()), evidence: { packageSha256: 'bad', dtdStatus: dtdStatus() } }],
  ])('returns unverified for absent, ambiguous or malformed stored proof %#', async validation_results => {
    const result = await history([{ id: 4, status: 'completed', has_manifest: true, validation_results }]);
    expect(result.compilations[0].packageDtdValidation).toBeNull();
  });
  it.each(['empty', 'duplicate', 'not-ran', 'missing-integrity'] as const)('rejects forged passed history with %s proof', async kind => {
    const evidence = proof();
    if (kind === 'empty') { evidence.expectedFiles = []; evidence.files = []; }
    if (kind === 'duplicate') evidence.files.push(evidence.files[0]);
    if (kind === 'not-ran') evidence.files[0].dtd.ran = false;
    if (kind === 'missing-integrity') evidence.integrity.verified = [];
    const result = await history([{ id: 5, status: 'completed', has_manifest: true, validation_results: [recorded(dtdStatus(evidence))] }]);
    expect(result.compilations[0].packageDtdValidation).toBeNull();
  });
});
