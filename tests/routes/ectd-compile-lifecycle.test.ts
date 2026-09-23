/**
 * eCTD compile — what a follow-up sequence does to the filed state, and what
 * an assembly left out. 2026-09-23 (W5/D7, WO-9 Click 6).
 *
 * The compile read neither `skipped` nor `unfinalized` from the assembly, so it
 * called a package ready that transmit refuses: a declared act that could not
 * be bound was left out of the ZIP and the compile said nothing. A withdrawal
 * was read as a placement — it counted toward a required section, or, with no
 * document behind it, raised "could not be materialized". And a follow-up
 * sequence's acts were visible only by reading index.xml by hand.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockResponse } from '../setup';

const { poolQuery, assembleSequenceMock } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  assembleSequenceMock: vi.fn(),
}));

vi.mock('../../server/db', () => ({ pool: { query: poolQuery } }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({ query: poolQuery }) }));
// assembledTransmitBlockers is the REAL one: the compile must report what
// transmit refuses on in transmit's own words.
vi.mock('../../server/services/ectd/assemble-from-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/ectd/assemble-from-core')>();
  return { assembleSequence: assembleSequenceMock, assembledTransmitBlockers: actual.assembledTransmitBlockers };
});

import ectdCompileRoutes from '../../server/routes/ectd-compile';
import { LEAVES, selfContained, handlerOf, mockSpineOn, makeFdaPackageZip, assembledResult, makeReq } from './ectd-compile-spine.harness';

const getHandler = (routePath: string, method: 'get' | 'post') => handlerOf(ectdCompileRoutes, routePath, method);
const mockSpine = mockSpineOn(poolQuery);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /:projectIdent/compile — what assembly left out, and what a withdrawal is', () => {
  it('a declared act the assembly refused blocks, named with its reason — the package does not hold it', async () => {
    mockSpine({ sequenceNumber: '0001' });
    const { zipPath } = await makeFdaPackageZip();
    const base = assembledResult(zipPath);
    assembleSequenceMock.mockResolvedValue({
      ...base,
      bundle: { ...base.bundle, dtdStatus: selfContained },
      skipped: [{ sectionCode: '3.2.S', reason: 'declared replace: no filed prior sequence is on record to act on' }],
    });

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);
    const payload = res.json.mock.calls[0][0];

    expect(payload.submissionReady).toBe(false);
    expect(payload.submissionBlockers.join(' ')).toContain(
      '1 placed leaf/leaves could not be packaged (3.2.S: declared replace: no filed prior sequence is on record to act on)',
    );
  });

  it('a leaf document that is not approved blocks, as it does at transmit', async () => {
    mockSpine();
    const { zipPath } = await makeFdaPackageZip();
    const base = assembledResult(zipPath);
    assembleSequenceMock.mockResolvedValue({
      ...base,
      bundle: { ...base.bundle, dtdStatus: selfContained },
      unfinalized: 1,
      unfinalizedSections: [{ sectionCode: '2.5', status: 'draft' }],
    });

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);
    const payload = res.json.mock.calls[0][0];

    expect(payload.submissionReady).toBe(false);
    expect(payload.submissionBlockers.join(' ')).toContain('1 leaf document(s) are not approved (2.5: draft)');
  });

  it('a withdrawal places nothing and renders nothing — it is neither coverage nor an unrenderable leaf', async () => {
    mockSpine({
      sequenceNumber: '0001',
      pack: [{ key: '2.5', mandatory: true }, { key: '3.2.S', mandatory: true }],
      leaves: [
        LEAVES[0],
        { section_code: '3.2.S.4', title: 'Specification (superseded)', lifecycle_op: 'delete', document_table: null, document_id: null },
      ],
    });
    const { zipPath } = await makeFdaPackageZip();
    const base = assembledResult(zipPath);
    assembleSequenceMock.mockResolvedValue({ ...base, bundle: { ...base.bundle, dtdStatus: selfContained } });

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);
    const payload = res.json.mock.calls[0][0];
    const findings = payload.validationResults as Array<{ rule: string; sectionCode?: string; message: string }>;

    // Not an unrenderable leaf: a withdrawal has no document to render.
    expect(findings.filter((f) => f.rule === 'LEAF_SOURCE_UNRESOLVED')).toEqual([]);
    expect(payload.submissionBlockers.join(' ')).not.toMatch(/could not be materialized/);
    // Not coverage: withdrawing 3.2.S.4 does not place 3.2.S.
    expect(findings).toContainEqual(expect.objectContaining({ rule: 'REQUIRED_SECTION_UNPLACED', sectionCode: '3.2.S' }));
    expect(findings.filter((f) => f.rule === 'REQUIRED_SECTION_OK').map((f) => f.sectionCode)).toEqual(['2.5']);
  });
});

describe('POST /:projectIdent/compile — a follow-up sequence says what it does to the filed state', () => {
  it('names the filed sequence it was diffed against, every act with its modified-file, and what was left out', async () => {
    mockSpine({ sequenceNumber: '0001' });
    const { zipPath } = await makeFdaPackageZip();
    const base = assembledResult(zipPath);
    assembleSequenceMock.mockResolvedValue({
      ...base,
      bundle: {
        ...base.bundle,
        dtdStatus: selfContained,
        leafManifest: [
          { ctdSection: '2.5', fileName: 'clinical-overview.pdf', href: 'm2/25-clin-over/clinical-overview.pdf', md5: '1'.repeat(32), operation: 'replace',
            modifiedFile: '../0000/m2/25-clin-over/clinical-overview.pdf', title: 'Clinical Overview' },
          { ctdSection: '3.2.S.4', fileName: 'specification.pdf', href: '../0000/m3/32s4-contr-drug-sub/specification.pdf', md5: '2'.repeat(32),
            operation: 'delete', modifiedFile: '../0000/m3/32s4-contr-drug-sub/specification.pdf' },
        ],
      },
      priorSequence: '0000',
      skipped: [{ sectionCode: '3.2.P', reason: 'declared append: the content is identical to the filed version, so there is nothing to append' }],
    });

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);
    const payload = res.json.mock.calls[0][0];

    expect(payload.lifecycle).toEqual({
      priorSequence: '0000',
      operations: [
        { operation: 'replace', ctdSection: '2.5', fileName: 'clinical-overview.pdf', href: 'm2/25-clin-over/clinical-overview.pdf',
          modifiedFile: '../0000/m2/25-clin-over/clinical-overview.pdf' },
        { operation: 'delete', ctdSection: '3.2.S.4', fileName: 'specification.pdf', href: '../0000/m3/32s4-contr-drug-sub/specification.pdf',
          modifiedFile: '../0000/m3/32s4-contr-drug-sub/specification.pdf' },
      ],
      leftOut: [{ sectionCode: '3.2.P', reason: 'declared append: the content is identical to the filed version, so there is nothing to append' }],
    });
  });

  it('a follow-up with no filed sequence on record says so', async () => {
    mockSpine({ sequenceNumber: '0001' });
    const { zipPath } = await makeFdaPackageZip();
    const base = assembledResult(zipPath);
    assembleSequenceMock.mockResolvedValue({
      ...base, bundle: { ...base.bundle, dtdStatus: selfContained, leafManifest: [] }, priorSequence: null,
    });

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);
    expect(res.json.mock.calls[0][0].lifecycle).toEqual({ priorSequence: null, operations: [], leftOut: [] });
  });
});
