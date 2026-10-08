/**
 * Compile carries the sequence (docs/design/FILING_SPINE.md F14).
 *
 * The compile resolved ONE submission per project: the one whose application
 * type is the project's program type (submission-spine.ts
 * findProgramSubmission). An NDA project that also files an MAA could never
 * compile the MAA: the MAA's sequence, opened in the Submission Center (F10),
 * compiled the NDA's latest sequence instead. A caller now names the sequence;
 * it compiles when the project owns it, and another project's sequence is 404.
 * With no sequence named, the existing spine rule stands.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockResponse } from '../setup';

const { poolQuery, assembleSequenceMock } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  assembleSequenceMock: vi.fn(),
}));

vi.mock('../../server/db', () => ({ pool: { query: poolQuery } }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({ query: poolQuery }) }));
vi.mock('../../server/services/ectd/assemble-from-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/ectd/assemble-from-core')>();
  return { assembleSequence: assembleSequenceMock, assembledTransmitBlockers: actual.assembledTransmitBlockers };
});

import ectdCompileRoutes from '../../server/routes/ectd-compile';
import { ORG, UUID, LEAVES, REAL_BACKBONE, handlerOf, makeBundleZip, assembledResult, makeReq } from './ectd-compile-spine.harness';

/**
 * 2026-10-08, merged with trunk: a compile now assembles only when the record
 * names the application and the applicant (services/ectd/package-identity.ts),
 * so the project records an agency number and the organisation a name. Every
 * package path reads them from the submission's project; a sequence compiles
 * here only when its submission is anchored to this project, so the MAA's
 * compile names what its export and transmit would.
 */
const NDA_PROGRAM = { id: UUID, code: 'ONC-221', name: 'ONC-221 Program', product_name: 'Vorelinib', program_type: 'nda', application_number: '214321' };
/** The project's own NDA submission (55) has sequence 9 (FDA); its MAA (56) has sequence 21 (EU). */
const OWN_SEQUENCES: Record<number, { submission_id: number; application_type: string; primary_region: string; sequence_number: string; region: string }> = {
  21: { submission_id: 56, application_type: 'maa', primary_region: 'eu', sequence_number: '0000', region: 'eu' },
  /** The MAA's next sequence, with nothing placed in it yet. */
  22: { submission_id: 56, application_type: 'maa', primary_region: 'eu', sequence_number: '0001', region: 'eu' },
};

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockReset();
  poolQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/FROM ectd_compilations/i.test(sql)) return { rows: [] };
    if (/FROM c2c_rule_packs/i.test(sql)) return { rows: [] };
    if (/FROM organizations/i.test(sql)) return { rows: [{ name: 'Vorelinib Therapeutics Inc.' }] };
    if (/FROM regulatory_programs/i.test(sql)) return { rows: [NDA_PROGRAM] };
    // A named sequence, joined to its submission and held to this program.
    if (/FROM ectd_sequences/i.test(sql) && /JOIN submissions/i.test(sql)) {
      const row = OWN_SEQUENCES[Number(params[0])];
      return { rows: row && params.includes(UUID) ? [{ id: Number(params[0]), ...row }] : [] };
    }
    // The spine rule: the submission whose application type is the program's.
    if (/FROM submissions/i.test(sql)) return { rows: [{ id: 55, application_type: 'nda', primary_region: 'fda', anchored: true }] };
    if (/FROM ectd_sequences/i.test(sql)) return { rows: [{ id: 9, sequence_number: '0001', region: 'fda' }] };
    if (/count\(\*\)::int AS n FROM submission_leaves/i.test(sql)) return { rows: [{ n: Number(params[0]) === 22 ? 0 : LEAVES.length }] };
    if (/FROM submission_leaves/i.test(sql)) return { rows: LEAVES };
    return { rows: [] };
  });
});

const compile = handlerOf(ectdCompileRoutes, '/:projectIdent/compile', 'post');
const status = handlerOf(ectdCompileRoutes, '/:projectIdent/status', 'get');

async function selfContainedAssembly() {
  const { zipPath } = await makeBundleZip(REAL_BACKBONE);
  const result = assembledResult(zipPath, {
    bundle: { ...assembledResult(zipPath).bundle, dtdStatus: { required: [], present: [], missing: [], selfContained: true } },
  });
  assembleSequenceMock.mockResolvedValue(result);
}

describe('compile carries the sequence (F14)', () => {
  it("the MAA sequence id compiles the MAA, not the NDA project's latest NDA sequence", async () => {
    await selfContainedAssembly();
    const res = createMockResponse() as any;
    await compile(makeReq({ submissionType: 'initial', sequenceId: 21 }), res);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(assembleSequenceMock).toHaveBeenCalledWith(expect.objectContaining({ sequenceId: 21, organizationId: ORG }));
  });

  it("another project's sequence (or none) is 404, and nothing is assembled", async () => {
    const res = createMockResponse() as any;
    await compile(makeReq({ submissionType: 'initial', sequenceId: 99 }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error.code).toBe('SEQUENCE_NOT_FOUND');
    expect(assembleSequenceMock).not.toHaveBeenCalled();
  });

  it('a malformed sequence id is refused, not read as "none named"', async () => {
    const res = createMockResponse() as any;
    await compile(makeReq({ submissionType: 'initial', sequenceId: 'nine' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(assembleSequenceMock).not.toHaveBeenCalled();
  });

  it('a named sequence with nothing placed in it is refused, not compiled from another store', async () => {
    const res = createMockResponse() as any;
    await compile(makeReq({ submissionType: 'initial', sequenceId: 22 }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error.code).toBe('SEQUENCE_EMPTY');
    expect(assembleSequenceMock).not.toHaveBeenCalled();
  });

  it('with no sequence named, the spine rule stands: the NDA sequence compiles', async () => {
    await selfContainedAssembly();
    const res = createMockResponse() as any;
    await compile(makeReq({ submissionType: 'initial' }), res);
    expect(assembleSequenceMock).toHaveBeenCalledWith(expect.objectContaining({ sequenceId: 9 }));
  });

  it("the status read names the sequence asked for, with its recorded region", async () => {
    const req = makeReq();
    req.query = { sequenceId: '21' };
    const res = createMockResponse() as any;
    await status(req, res);
    const body = res.json.mock.calls[0][0];
    expect(JSON.stringify(body)).toMatch(/"region":"eu"/);
    expect(body.sequence?.id ?? body.spine?.sequence?.id).toBe(21);
  });
});
