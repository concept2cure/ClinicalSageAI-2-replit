/**
 * eCTD compile — the SPINE-BACKED path (slice 5b consolidation).
 *
 * A program ident whose program resolves (by the ind-checklist-view-assembler
 * identity convention: application type + product/name/code vs the submission's
 * product_name/title) to a canonical submission with an eCTD sequence carrying
 * placed submission_leaves must compile through the REAL generator
 * (ectd/assemble-from-core): the response's xmlBackbone is the assembled
 * package's actual index.xml, leafFilesRendered counts leaves actually
 * materialized, and the honest-blockers contract survives — a package with
 * unresolvable leaf sources is never called submission-ready, and an assembly
 * refusal surfaces as a structured `failed` compilation, not a bare 500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockResponse } from '../setup';

const { poolQuery, assembleSequenceMock } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  assembleSequenceMock: vi.fn(),
}));

vi.mock('../../server/db', () => ({ pool: { query: poolQuery } }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({ query: poolQuery }) }));
// The route dynamic-imports the canonical assembler; intercept it here so the
// test drives the ROUTE's translation of a real assembly result, not the
// assembler itself (which has its own PGlite journey).
// assembledTransmitBlockers is the REAL one: the compile must report what
// transmit refuses on in transmit's own words, and a copy here would not show it.
vi.mock('../../server/services/ectd/assemble-from-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/ectd/assemble-from-core')>();
  return { assembleSequence: assembleSequenceMock, assembledTransmitBlockers: actual.assembledTransmitBlockers };
});

import ectdCompileRoutes from '../../server/routes/ectd-compile';

import {
  ORG, UUID, PROGRAM, REAL_BACKBONE, selfContained, handlerOf, mockSpineOn,
  makeBundleZip, makeFdaPackageZip, assembledResult, makeReq,
} from './ectd-compile-spine.harness';

const getHandler = (routePath: string, method: 'get' | 'post') => handlerOf(ectdCompileRoutes, routePath, method);
const mockSpine = mockSpineOn(poolQuery);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /:projectIdent/compile — spine-backed compiles run the real generator', () => {
  it('assembles the sequence and returns the package\'s REAL index.xml + rendered-leaf count', async () => {
    mockSpine();
    const { zipPath } = await makeBundleZip(REAL_BACKBONE);
    const result = assembledResult(zipPath, {
      bundle: { ...assembledResult(zipPath).bundle, dtdStatus: { required: [], present: [], missing: [], selfContained: true } },
    });
    assembleSequenceMock.mockResolvedValue(result);

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq({ submissionType: 'initial' }), res);

    const payload = res.json.mock.calls[0][0];
    // The canonical assembler ran against the resolved sequence, org-scoped.
    expect(assembleSequenceMock).toHaveBeenCalledWith(
      expect.objectContaining({ sequenceId: 9, organizationId: ORG, applicationId: 'BX-204' }),
    );
    // The backbone is the assembled package's actual index.xml — not the draft.
    expect(payload.xmlBackbone).toBe(REAL_BACKBONE);
    expect(payload.xmlBackbone).not.toMatch(/draft-backbone/);
    expect(payload.leafFilesRendered).toBe(2);
    expect(payload.status).toBe('completed');
    expect(payload.programId).toBe(UUID);
    // Staging always cleaned up.
    expect(result.cleanup).toHaveBeenCalled();
  });

  it('refuses submission-ready while placed leaves cannot be materialized', async () => {
    mockSpine();
    const { zipPath } = await makeBundleZip(REAL_BACKBONE);
    assembleSequenceMock.mockResolvedValue(
      assembledResult(zipPath, {
        materialized: 1,
        unresolvedLeaves: [
          { documentTable: 'unified_documents', documentId: 200, reason: 'not found in this organization' },
        ],
      }),
    );

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.submissionReady).toBe(false);
    expect(payload.submissionBlockers.join(' ')).toMatch(/could not be materialized into leaf files/);
    // The unresolved leaf is a named error finding, not a silent drop.
    expect(payload.validationResults.some((v: any) => v.rule === 'LEAF_SOURCE_UNRESOLVED')).toBe(true);
    expect(payload.leafFilesRendered).toBe(1);
  });

  it('a placed leaf with no document behind it does not satisfy its required section', async () => {
    // The resolver skips a NULL document_table/document_id before it can become
    // "unresolved", so its key was never in unresolvedKeys and isMaterialized
    // reported it rendered: a required section read as satisfied by a leaf that
    // has nothing behind it, with no blocker raised.
    mockSpine({
      leaves: [
        { section_code: '2.5', title: 'Clinical Overview', lifecycle_op: 'new', document_table: null, document_id: null },
        { section_code: '3.2.S', title: 'Drug Substance', lifecycle_op: 'new', document_table: 'unified_documents', document_id: 200 },
      ],
    });
    const { zipPath } = await makeBundleZip(REAL_BACKBONE);
    assembleSequenceMock.mockResolvedValue(assembledResult(zipPath, { materialized: 1 }));

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);

    const payload = res.json.mock.calls[0][0];
    const at25 = payload.validationResults.filter((v: any) => v.sectionCode === '2.5');
    // Before the fix this section was reported "placed and rendered".
    expect(at25.map((v: any) => v.rule)).toContain('LEAF_SOURCE_UNRESOLVED');
    expect(at25.map((v: any) => v.rule)).not.toContain('REQUIRED_SECTION_OK');
    // The leaf that does have a document is unaffected.
    const at32s = payload.validationResults.filter((v: any) => v.sectionCode === '3.2.S');
    expect(at32s.map((v: any) => v.rule)).toContain('REQUIRED_SECTION_OK');
  });

  it('surfaces a DTD-incomplete package as a blocker, never as ready', async () => {
    mockSpine();
    const { zipPath } = await makeBundleZip(REAL_BACKBONE);
    assembleSequenceMock.mockResolvedValue(assembledResult(zipPath)); // selfContained: false

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.submissionReady).toBe(false);
    expect(payload.submissionBlockers.join(' ')).toMatch(/not self-contained/);
  });

  it('surfaces an assembly refusal as a structured failed compilation, not a 500', async () => {
    mockSpine();
    assembleSequenceMock.mockRejectedValue(
      new Error('eCTD assembly blocked: 1 leaf path-safety violation(s)'),
    );

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);

    // Answered as a compile result the surface can render, not an error status.
    expect(res.status).not.toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.status).toBe('failed');
    expect(payload.submissionReady).toBe(false);
    expect(payload.submissionBlockers.join(' ')).toMatch(/assembly refused/i);
    expect(payload.submissionBlockers.join(' ')).toMatch(/path-safety/);
    expect(payload.leafFilesRendered).toBe(0);
  });

  it('records the compilation with the real sequence identity (continuity gate feed)', async () => {
    mockSpine();
    const { zipPath } = await makeBundleZip(REAL_BACKBONE);
    assembleSequenceMock.mockResolvedValue(assembledResult(zipPath));

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq({ submissionType: 'initial' }), res);

    const insert = poolQuery.mock.calls.find((c) => /INSERT INTO ectd_compilations/i.test(String(c[0])));
    expect(insert).toBeTruthy();
    // application_number + sequence_number recorded (params 7 and 8).
    expect(insert![1][6]).toBe('BX-204');
    expect(insert![1][7]).toBe('0000');
    // The stored backbone is the real one.
    expect(insert![1][4]).toBe(REAL_BACKBONE);
  });
});

describe('POST /:projectIdent/validate — spine-backed programs validate leaf placement', () => {
  it('reports placement findings from the sequence\'s leaves, not the empty section store', async () => {
    mockSpine();
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/validate', 'post')(makeReq({ region: 'FDA' }), res);

    const payload = res.json.mock.calls[0][0];
    const rules = payload.results.map((r: any) => r.rule);
    expect(rules).toContain('SUBMISSION_SPINE_LINKED');
    // Placed sections are acknowledged; missing required sections are errors
    // for an initial (0000) sequence.
    expect(rules).toContain('REQUIRED_SECTION_OK');
    expect(rules).toContain('REQUIRED_SECTION_UNPLACED');
    expect(rules).not.toContain('SECTION_STORE_UNLINKED');
    // Placement-only claims: nothing says "rendered" without an assembly.
    const okFindings = payload.results.filter((r: any) => r.rule === 'REQUIRED_SECTION_OK');
    for (const f of okFindings) expect(f.message).not.toMatch(/rendered/);
  });
});

describe('GET /:projectIdent/status — spine leaf state drives the blockers', () => {
  it('names the placed-document count and defers readiness to compile-time verification', async () => {
    mockSpine();
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/status', 'get')(makeReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.submissionReady).toBe(false);
    const blockers = payload.submissionBlockers.join(' ');
    expect(blockers).toMatch(/2 document\(s\) are placed/);
    expect(blockers).toMatch(/Run Compile/);
    // A program WITH placed leaves is not hit with the unlinked-store blocker.
    expect(blockers).not.toMatch(/no linked section-tracking store/);
  });
});

/* ── The agency's number belongs in the agency's field ──────────────────────
   `applicationId` becomes `<application-number>` in the FDA us-regional
   backbone. It was stamped from `anchor.programCode` — the SPONSOR's internal
   program code ("BX-204") — because when that code was written nothing in the
   data model held an agency-assigned number. `regulatory_programs.
   application_number` does now, so a filing whose IND number is recorded must
   carry THAT, not an internal code the agency has never seen.

   The fallback chain is unchanged in spirit and is the point of these tests:
   recorded agency number, else the program code, else a handle that says
   plainly it is unassigned. Nothing is ever invented. */
describe('POST /:projectIdent/compile — which identifier reaches <application-number>', () => {
  it('stamps the RECORDED agency application number when the program has one', async () => {
    mockSpine({ program: { ...PROGRAM, application_number: '000512' } });
    const { zipPath } = await makeBundleZip(REAL_BACKBONE);
    assembleSequenceMock.mockResolvedValue(assembledResult(zipPath));

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);

    expect(assembleSequenceMock).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: '000512' }),
    );
    // The sponsor's internal code never reaches the agency's field.
    expect(assembleSequenceMock.mock.calls[0][0].applicationId).not.toBe('BX-204');
    // And the compilation is recorded under the same number, so the history
    // filter and the next sequence's manifest lookup agree with the backbone.
    const insert = poolQuery.mock.calls.find(([sql]) => /INSERT INTO ectd_compilations/i.test(String(sql)));
    expect(insert?.[1]).toContain('000512');
  });

  it('falls back to the program code when no agency number is recorded — never invents one', async () => {
    mockSpine();
    const { zipPath } = await makeBundleZip(REAL_BACKBONE);
    assembleSequenceMock.mockResolvedValue(assembledResult(zipPath));

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);

    expect(assembleSequenceMock).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: 'BX-204' }),
    );
  });

  it('says "unassigned" when the program has neither a number nor a code', async () => {
    mockSpine({ program: { ...PROGRAM, code: null, application_number: null } });
    const { zipPath } = await makeBundleZip(REAL_BACKBONE);
    assembleSequenceMock.mockResolvedValue(assembledResult(zipPath));

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);

    expect(assembleSequenceMock.mock.calls[0][0].applicationId).toMatch(/^UNASSIGNED-SEQ-/);
  });

  it('an empty or whitespace application_number is not a recorded number', async () => {
    mockSpine({ program: { ...PROGRAM, application_number: '   ' } });
    const { zipPath } = await makeBundleZip(REAL_BACKBONE);
    assembleSequenceMock.mockResolvedValue(assembledResult(zipPath));

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);

    expect(assembleSequenceMock.mock.calls[0][0].applicationId).toBe('BX-204');
  });
});

/* ── Click 4: what a compile hands back, and what it must not hide ──────────── */

describe('POST /:projectIdent/compile — the package, not just its backbone', () => {
  it('returns every file the package holds, the FDA regional backbone and the MD5 index', async () => {
    mockSpine();
    const { zipPath } = await makeFdaPackageZip();
    const base = assembledResult(zipPath);
    assembleSequenceMock.mockResolvedValue({
      ...base,
      bundle: {
        ...base.bundle,
        dtdStatus: selfContained,
        // The packager names its own regional backbone (classifyRegionalBackbone).
        regionalBackbone: { region: 'fda', file: 'm1/us/us-regional.xml', regionConformant: true },
      },
    });

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);
    const payload = res.json.mock.calls[0][0];

    expect(payload.package.sha256).toBe('a'.repeat(64));
    expect(payload.package.files).toEqual([
      'index-md5.txt',
      'index.xml',
      'm1/us/1-1/form-fda-1571.pdf',
      'm1/us/us-regional.xml',
      'm3/3-2-s-4-2/control-of-drug-substance.pdf',
      'util/index-md5.txt',
    ]);
    // Module 1 lives in the regional backbone, which index.xml only points at:
    // without it the IND's forms are invisible in anything the surface renders.
    expect(payload.package.regionalBackbone).toEqual({
      path: 'm1/us/us-regional.xml',
      xml: '<?xml version="1.0"?><fda-regional:fda-regional/>',
    });
    expect(payload.package.indexMd5).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('a package whose PDFs were not converted to PDF/A is not ready, and names them', async () => {
    mockSpine();
    const { zipPath } = await makeFdaPackageZip();
    const base = assembledResult(zipPath);
    assembleSequenceMock.mockResolvedValue({
      ...base,
      bundle: {
        ...base.bundle,
        dtdStatus: selfContained,
        submissionGrade: {
          total: 2, pdfLeaves: 2, pdfaConverted: 0, allPdfA: false,
          notConverted: ['m1/us/1-1/form-fda-1571.pdf', 'm3/3-2-s-4-2/control-of-drug-substance.pdf'],
        },
      },
    });

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);
    const payload = res.json.mock.calls[0][0];

    expect(payload.submissionReady).toBe(false);
    const blockers = payload.submissionBlockers.join(' ');
    expect(blockers).toMatch(/2 of 2 PDF leaf file\(s\) were not converted to PDF\/A/);
    expect(blockers).toMatch(/form-fda-1571\.pdf/);
    expect(payload.package.pdfa).toEqual({ pdfLeaves: 2, pdfaConverted: 0, allPdfA: false,
      notConverted: ['m1/us/1-1/form-fda-1571.pdf', 'm3/3-2-s-4-2/control-of-drug-substance.pdf'],
      agencyFormsAsIssued: [] });
  });

  it('an FDA form shipped as FDA issued is named as such — neither converted nor a PDF/A failure', async () => {
    mockSpine();
    const { zipPath } = await makeFdaPackageZip();
    const base = assembledResult(zipPath);
    assembleSequenceMock.mockResolvedValue({
      ...base,
      bundle: {
        ...base.bundle,
        dtdStatus: selfContained,
        submissionGrade: {
          total: 2, pdfLeaves: 2, pdfaConverted: 1, allPdfA: true, notConverted: [],
          agencyFormsAsIssued: ['m1/us/1-1/form-fda-1571.pdf'],
        },
      },
    });

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);
    const payload = res.json.mock.calls[0][0];

    expect(payload.package.pdfa).toEqual({ pdfLeaves: 2, pdfaConverted: 1, allPdfA: true, notConverted: [],
      agencyFormsAsIssued: ['m1/us/1-1/form-fda-1571.pdf'] });
    expect(payload.submissionBlockers.join(' ')).not.toMatch(/PDF\/A/);
  });

  it('a compilation that could not be recorded says so — its manifest is what the next sequence is diffed against', async () => {
    mockSpine({ failInsert: true });
    const { zipPath } = await makeFdaPackageZip();
    const base = assembledResult(zipPath);
    assembleSequenceMock.mockResolvedValue({ ...base, bundle: { ...base.bundle, dtdStatus: selfContained } });

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);
    const payload = res.json.mock.calls[0][0];

    expect(payload.recorded).toBe(false);
    expect(payload.submissionReady).toBe(false);
    expect(payload.submissionBlockers.join(' ')).toMatch(/was not recorded/);
    expect(payload.submissionBlockers.join(' ')).toMatch(/leaf_manifest/);
  });

});

describe('POST /:projectIdent/compile — the record, the forms, the region', () => {
  it('a recorded compilation says so', async () => {
    mockSpine();
    const { zipPath } = await makeFdaPackageZip();
    assembleSequenceMock.mockResolvedValue(assembledResult(zipPath));
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);
    expect(res.json.mock.calls[0][0].recorded).toBe(true);
  });

  it('a form filed at 1.1 satisfies the pack\'s per-form requirement by its form type', async () => {
    // FDA's Module 1 v2.3 files every form at 1.1 and tells them apart by type;
    // the ind:fda pack keys each form's presence as 1.1.1 / 1.1.2 / 1.1.3.
    mockSpine({
      pack: [{ key: '1.1', mandatory: true }, { key: '1.1.1', mandatory: true }, { key: '1.1.2', mandatory: true }],
      leaves: [
        { section_code: 'm1.1', title: 'Form FDA 1571', lifecycle_op: 'new', document_table: 'rendered_leaf_files', document_id: 5, document_type: 'form_1571' },
      ],
    });
    const { zipPath } = await makeFdaPackageZip();
    assembleSequenceMock.mockResolvedValue(assembledResult(zipPath, { materialized: 1 }));
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);
    const payload = res.json.mock.calls[0][0];

    const bySection = (code: string) => payload.validationResults.filter((v: any) => v.sectionCode === code).map((v: any) => v.rule);
    expect(bySection('1.1.1')).toContain('REQUIRED_SECTION_OK');
    // 1572 was never filed: its requirement stays unmet, however 1.1 is satisfied.
    expect(bySection('1.1.2')).toContain('REQUIRED_SECTION_UNPLACED');
  });

  it('refuses a region that is not the region the sequence was created for', async () => {
    mockSpine(); // the sequence is region 'fda'
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq({ region: 'EMA' }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error.code).toBe('REGION_MISMATCH');
    expect(assembleSequenceMock).not.toHaveBeenCalled();
  });

  it('accepts the sequence\'s own region however it is spelled', async () => {
    mockSpine();
    const { zipPath } = await makeFdaPackageZip();
    assembleSequenceMock.mockResolvedValue(assembledResult(zipPath));
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq({ region: 'FDA' }), res);
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].region).toBe('fda');
  });
});

describe('GET /:projectIdent/history — which sequence, and whether it can anchor the next one', () => {
  it('names the sequence each compilation covered and whether it carries a leaf manifest', async () => {
    mockSpine({
      history: [{ id: 4, compilation_name: 'IND Compilation — BX-204', compilation_type: 'initial', status: 'completed',
        version: '1.0', compiled_at: '2026-09-22T10:00:00Z', created_at: '2026-09-22T10:00:00Z', sequence_number: '0000', has_manifest: true }],
    });
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/history', 'get')(makeReq(), res);
    const select = poolQuery.mock.calls.find((c) => /FROM ectd_compilations/i.test(String(c[0])));
    expect(String(select![0])).toMatch(/sequence_number/);
    expect(String(select![0])).toMatch(/leaf_manifest IS NOT NULL AS has_manifest/);
    expect(res.json.mock.calls[0][0].compilations[0]).toMatchObject({ sequence_number: '0000', has_manifest: true });
  });

  it('a history that could not be read is an error, never an empty history', async () => {
    mockSpine({ failHistory: true });
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/history', 'get')(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].compilations).toBeUndefined();
  });
});

describe('GET /:projectIdent/status — a program\'s readiness comes from what is placed', () => {
  it('counts required sections covered by placed leaves, and names the sequence and its region', async () => {
    mockSpine({
      pack: [{ key: '2.5', mandatory: true }, { key: '3.2.S', mandatory: true }, { key: '3.2.P', mandatory: true }],
    });
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/status', 'get')(makeReq(), res);
    const payload = res.json.mock.calls[0][0];

    const m2 = payload.modules.find((m: any) => m.moduleCode === 'm2');
    const m3 = payload.modules.find((m: any) => m.moduleCode === 'm3');
    expect(m2).toMatchObject({ requiredSections: 1, completedRequired: 1 });
    expect(m3).toMatchObject({ requiredSections: 2, completedRequired: 1 });
    // Placement, not approval: the basis is stated so 100% is never read as "approved".
    expect(payload.readinessBasis).toBe('placed');
    expect(payload.sequence).toEqual({ sequenceNumber: '0000', region: 'fda', leafCount: 2 });
  });
});
