import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => vi.fn());
vi.mock('../source-access.js', async load => ({ ...await load<typeof import('../source-access.js')>(), authorizeCsrSourceProgram: auth }));
import { readRetainedStudyForAssembly, readSavedClinicalTables } from '../saved-clinical-tables.js';
import { orchestratorInputDigest } from '../../submission-orchestrator-inputs.js';
import { sealSignPayloadDigest } from '../../ectd/sign-payload-seal.js';
import { sourceFixture } from './source-input-fixture.js';
import type { CsrSourceReceipt } from '../../../../shared/csr-source-input.js';

const PROGRAM = '11111111-2222-4333-8444-000000000011', SOURCE = '11111111-2222-4333-8444-000000000022', RUN = '11111111-2222-4333-8444-000000000033';
const scope = { organizationId: 7, userId: 5, programId: PROGRAM };
function fixture() {
  const source = sourceFixture();
  const receipt: CsrSourceReceipt = { adapter: source.format, documentId: SOURCE, documentTitle: 'Synthetic source', sha256: createHash('sha256').update(JSON.stringify(source)).digest('hex'), version: '1.0',
    dataCutDate: source.dataCutDate, studyId: source.studyData.studyId, protocolNumber: source.studyData.protocolNumber, studyInfo: source.studyInfo,
    clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle' };
  const input = { organizationId: 7, programId: PROGRAM, clinicalStudyData: [source.studyData], clinicalSourceReceipts: [receipt] as CsrSourceReceipt[] | undefined };
  const row = { input_snapshot: input, input_digest: '', input_seal: '' };
  const reseal = () => { row.input_digest = orchestratorInputDigest(input); row.input_seal = sealSignPayloadDigest(row.input_digest, 7) ?? ''; };
  reseal(); let exists = true, eligible = true;
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes('FROM submission_orchestrator_runs')) { expect(values).toEqual([RUN, 7, PROGRAM]); return { rows: exists ? [row] : [] }; }
    if (sql.includes('FROM vault.documents d')) { expect(values).toEqual([SOURCE, 7, PROGRAM, receipt.sha256]); return { rows: eligible ? [{ id: SOURCE, content_hash: receipt.sha256 }] : [] }; }
    throw new Error('Unexpected source query');
  });
  return { input, row, query, reseal, missing: () => { exists = false; }, withdraw: () => { eligible = false; } };
}
beforeEach(() => { auth.mockReset().mockResolvedValue({ projectId: 11 }); });
describe('verified retained CSR aggregate reconstruction', () => {
  it('returns aggregate tables and exact provenance without exposing frozen participant rows', async () => {
    const f = fixture();
    const result = await readSavedClinicalTables({ query: f.query }, scope, RUN);
    expect(result).toMatchObject({ runId: RUN, programId: PROGRAM, historical: true, studies: [{ source: { documentId: SOURCE }, tables: { demographics: { rows: expect.any(Array) } } }] });
    expect(JSON.stringify(result)).not.toContain('synthetic-a'); expect(JSON.stringify(result)).not.toContain('participants');
    expect(auth).toHaveBeenCalledWith({ query: f.query }, scope);
  });
  it('requires current project access before reading the private receipt', async () => {
    const f = fixture(); auth.mockRejectedValue(new Error('Current project sharing revoked'));
    await expect(readSavedClinicalTables({ query: f.query }, scope, RUN)).rejects.toThrow('sharing revoked'); expect(f.query).not.toHaveBeenCalled();
  });
  it('refuses a missing/foreign run rather than reporting a successful empty history', async () => {
    const f = fixture(); f.missing();
    await expect(readSavedClinicalTables({ query: f.query }, scope, RUN)).rejects.toMatchObject({ status: 404, code: 'CSR_RUN_INPUTS_NOT_FOUND' });
  });
  it.each(['observations', 'digest', 'seal', 'program', 'organization'] as const)('refuses altered retained %s', async mode => {
    const f = fixture();
    if (mode === 'observations') f.input.clinicalStudyData[0].efficacy[0].value = 99;
    if (mode === 'digest') f.row.input_digest = 'forged';
    if (mode === 'seal') f.row.input_seal = 'forged';
    if (mode === 'program') { f.input.programId = '11111111-2222-4333-8444-000000000099'; f.reseal(); }
    if (mode === 'organization') { f.input.organizationId = 8; f.reseal(); }
    await expect(readSavedClinicalTables({ query: f.query }, scope, RUN)).rejects.toMatchObject({ status: 409, code: 'CSR_RUN_INPUTS_INVALID' });
  });
  it('honors explicit data withdrawal without erasing the original receipt or returning fake empty tables', async () => {
    const f = fixture(); f.withdraw();
    await expect(readSavedClinicalTables({ query: f.query }, scope, RUN)).rejects.toMatchObject({ status: 409, code: 'CSR_SOURCE_DATA_UNAVAILABLE' });
    expect(f.input.clinicalStudyData).toHaveLength(1);
  });
  it('does not require an old historical source to remain the current Vault version or retain original bytes', async () => {
    const f = fixture();
    expect((await readSavedClinicalTables({ query: f.query }, scope, RUN)).studies).toHaveLength(1);
    expect(f.query.mock.calls.some(([sql]) => sql.includes('AS current') || sql.includes('FROM canonical_documents'))).toBe(false);
  });
  it('returns an honest empty source-receipt history for an intact run that never selected a source', async () => {
    const f = fixture(); f.input.clinicalSourceReceipts = undefined; f.input.clinicalStudyData = []; f.reseal();
    expect((await readSavedClinicalTables({ query: f.query }, scope, RUN)).studies).toEqual([]);
  });
  it('refuses an ambiguous study identity even in a correctly sealed input receipt', async () => {
    const f = fixture(); f.input.clinicalStudyData.push(sourceFixture().studyData); f.reseal();
    await expect(readSavedClinicalTables({ query: f.query }, scope, RUN)).rejects.toMatchObject({ code: 'CSR_RUN_INPUTS_INVALID' });
  });
});

// CSR slice 8 (2026-10-29): the assembler's read of the same retained run, server side only.
describe('the retained study the CSR assembler composes from', () => {
  /** The current-approval reads an assembly makes, as release does (without its lock). */
  const current = (f: ReturnType<typeof fixture>, approved = true) => vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes('AS current')) return { rows: [{ current: true }] };
    if (sql.includes('FROM canonical_documents')) return { rows: approved ? [{ stage: 'approved', content_hash: (f.input.clinicalSourceReceipts as CsrSourceReceipt[])[0].sha256 }] : [] };
    if (/FOR SHARE|pg_advisory/.test(sql)) throw new Error('The assembly read takes no lock');
    return f.query(sql, values);
  });
  it('returns the verified subject rows and their tables for the job’s study, through the same checks', async () => {
    const f = fixture(); const query = current(f);
    const result = await readRetainedStudyForAssembly({ query }, scope, RUN, 'SYN-001');
    expect(result.study.demographics.map(d => d.subjectId)).toEqual(['synthetic-a', 'synthetic-b', 'synthetic-c']);
    expect(result.tables.demographics.rows.length).toBeGreaterThan(0);
    expect(result.source.documentId).toBe(SOURCE);
    expect(auth).toHaveBeenCalledWith({ query }, scope);
  });
  it('refuses a study the run does not hold, a source no longer approved, and an altered run, rather than assembling from nothing', async () => {
    const f = fixture();
    await expect(readRetainedStudyForAssembly({ query: current(f) }, scope, RUN, 'OTHER-STUDY')).rejects.toMatchObject({ status: 409, code: 'CSR_RUN_STUDY_NOT_FOUND' });
    await expect(readRetainedStudyForAssembly({ query: current(f, false) }, scope, RUN, 'SYN-001')).rejects.toMatchObject({ code: 'CSR_SOURCE_APPROVAL_REQUIRED' });
    f.row.input_seal = 'forged';
    await expect(readRetainedStudyForAssembly({ query: current(f) }, scope, RUN, 'SYN-001')).rejects.toMatchObject({ code: 'CSR_RUN_INPUTS_INVALID' });
  });
});
