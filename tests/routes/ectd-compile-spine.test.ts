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
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import { createMockRequest, createMockResponse } from '../setup';

const { poolQuery, assembleSequenceMock } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  assembleSequenceMock: vi.fn(),
}));

vi.mock('../../server/db', () => ({ pool: { query: poolQuery } }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({ query: poolQuery }) }));
// The route dynamic-imports the canonical assembler; intercept it here so the
// test drives the ROUTE's translation of a real assembly result, not the
// assembler itself (which has its own PGlite journey).
vi.mock('../../server/services/ectd/assemble-from-core', () => ({
  assembleSequence: assembleSequenceMock,
}));

import ectdCompileRoutes from '../../server/routes/ectd-compile';

function getHandler(routePath: string, method: 'get' | 'post') {
  const layer = (ectdCompileRoutes as any).stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const ORG = 7;
const UUID = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';
const PROGRAM = {
  id: UUID,
  code: 'BX-204',
  name: 'BX-204 Program',
  product_name: 'Examplinib',
  program_type: 'ind',
};

/** Placed leaves covering M2 + M3; one points at an unresolvable source. */
const LEAVES = [
  { section_code: '2.5', title: 'Clinical Overview', lifecycle_op: 'new', document_table: 'coauthor_documents', document_id: 100 },
  { section_code: '3.2.S', title: 'Drug Substance', lifecycle_op: 'new', document_table: 'unified_documents', document_id: 200 },
];

function mockSpine(opts: { leaves?: unknown[] } = {}) {
  const leaves = opts.leaves ?? LEAVES;
  poolQuery.mockReset();
  poolQuery.mockImplementation(async (sql: string) => {
    if (/FROM regulatory_programs/i.test(sql)) return { rows: [PROGRAM] };
    if (/FROM submissions/i.test(sql)) return { rows: [{ id: 55, application_type: 'ind' }] };
    if (/FROM ectd_sequences/i.test(sql)) {
      return { rows: [{ id: 9, sequence_number: '0000', region: 'fda' }] };
    }
    if (/count\(\*\)::int AS n FROM submission_leaves/i.test(sql)) {
      return { rows: [{ n: leaves.length }] };
    }
    if (/FROM submission_leaves/i.test(sql)) return { rows: leaves };
    return { rows: [] };
  });
}

/** A real ZIP on disk whose index.xml the route must hand back verbatim. */
async function makeBundleZip(indexXml: string): Promise<{ dir: string; zipPath: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-spine-test-'));
  const zip = new JSZip();
  zip.file('index.xml', indexXml);
  zip.file('m2/2-5/clinical-overview.pdf', '%PDF-1.4 fake');
  const zipPath = path.join(dir, 'BX-204-0000-fda.zip');
  await fs.writeFile(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));
  return { dir, zipPath };
}

const REAL_BACKBONE =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">\n' +
  '<ectd:ectd xmlns:ectd="http://www.ich.org/ectd" dtd-version="3.2"></ectd:ectd>';

function assembledResult(zipPath: string, over: Record<string, unknown> = {}) {
  return {
    bundle: {
      path: zipPath,
      sha256: 'a'.repeat(64),
      sizeBytes: 1234,
      format: 'ectd',
      dtdStatus: { required: ['ich-ectd-3-2.dtd'], present: [], missing: ['ich-ectd-3-2.dtd'], selfContained: false },
    },
    skipped: [],
    materialized: 2,
    unresolvedLeaves: [],
    governanceManifestPath: path.join(path.dirname(zipPath), 'package-governance.sha256.json'),
    cleanup: vi.fn(async () => {}),
    ...over,
  };
}

function makeReq(body: Record<string, unknown> = {}) {
  const r = createMockRequest({ params: { projectIdent: UUID }, body }) as any;
  r.tenantId = ORG;
  r.user = { id: 3 };
  return r;
}

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
    expect(payload.submissionReady).toBe(false);
    const unplaced = payload.validationResults.filter((v: any) => /2\.5/.test(String(v.message)) && /materializ|placed|render/i.test(String(v.message)));
    expect(unplaced.length).toBeGreaterThan(0);
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
