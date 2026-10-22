/**
 * eCTD backbone — what the platform is entitled to claim (draft path).
 *
 * The DRAFT compile path produces an XML status document and renders nothing
 * to disk (real leaf rendering lives on the SPINE-BACKED path: placed
 * submission_leaves assembled by ectd/assemble-from-core, pinned by
 * tests/routes/ectd-compile-spine.test.ts). A program with no placed leaves
 * gets the draft backbone, and it must never declare:
 *
 *   <ectd:file-path>m3/3/2/p/drug-product.pdf</ectd:file-path>
 *   <ectd:checksum algorithm="md5">pending</ectd:checksum>
 *
 * — a leaf file that was never written, verified against a hash that was never
 * computed — nor say `submissionReady: true`, which the surface renders as the
 * words "Submission-ready" beside a download button.
 *
 * 2026-10-17 (DOCUMENT_STORE_CONSOLIDATION.md step 7): this file used to drive
 * a legacy numeric ident whose sections came from `project_sections`. That
 * branch is gone; every ident compiles a program, which has no tracked-section
 * store, so the draft backbone runs over an empty section set and the
 * content-hash and clean-content cases no longer have an input. What a program
 * compiles from is its placed leaves (the spine test above).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../../server/db', () => ({ pool: { query: mockQuery } }));

import ectdCompileRoutes from '../../server/routes/ectd-compile';

function getHandler(path: string, method: 'post' | 'get' = 'post') {
  const layer = ectdCompileRoutes.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const ORG = 77;
const PROGRAM = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';

function req(body: Record<string, unknown> = {}) {
  const r = createMockRequest({ params: { projectIdent: PROGRAM }, body });
  (r as any).tenantId = ORG;
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (/FROM regulatory_programs/i.test(sql)) return { rows: [{ id: PROGRAM, code: 'BX-1', name: 'BX-1' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
});

async function compile() {
  const res = createMockResponse();
  await getHandler('/:projectIdent/compile')(req({ submissionType: 'original', region: 'FDA' }), res);
  return (res.json as any).mock.calls[0][0];
}

describe('the backbone makes no claim about files it did not write', () => {
  it('emits no leaf-file checksum and declares no leaf path', async () => {
    const { xmlBackbone } = await compile();
    expect(xmlBackbone).not.toMatch(/pending/);
    expect(xmlBackbone).not.toMatch(/<ectd:checksum/);
    expect(xmlBackbone).not.toMatch(/<ectd:file-path>/);
    expect(xmlBackbone).not.toMatch(/\.pdf/);
  });

  it('marks the envelope as a draft backbone, not a sequence', async () => {
    const { xmlBackbone } = await compile();
    expect(xmlBackbone).toMatch(/<ectd:package-state>draft-backbone<\/ectd:package-state>/);
    expect(xmlBackbone).toMatch(/NOT A TRANSMISSIBLE SEQUENCE/);
  });

  it('counts no content and no files on disk, and publishes no hash of nothing', async () => {
    const { xmlBackbone } = await compile();
    expect(xmlBackbone).not.toMatch(/<ectd:total-files>/);
    expect(xmlBackbone).toMatch(/<ectd:sections-with-content>0<\/ectd:sections-with-content>/);
    expect(xmlBackbone).toMatch(/<ectd:rendered-leaf-files>0<\/ectd:rendered-leaf-files>/);
    expect(xmlBackbone).not.toMatch(/<ectd:content-sha256>/);
  });

  it('never reads the legacy section store', async () => {
    await compile();
    expect(mockQuery.mock.calls.some(([sql]) => /project_sections/i.test(String(sql)))).toBe(false);
  });
});

describe('submission readiness', () => {
  it('is false while no leaf files exist, and says why', async () => {
    const result = await compile();
    expect(result.submissionReady).toBe(false);
    const blockers = result.submissionBlockers.join(' ');
    expect(blockers).toMatch(/No leaf files have been rendered/);
    expect(blockers).toMatch(/place approved documents into its eCTD sequence/i);
    expect(blockers).toMatch(/no linked section-tracking store/);
    expect(result.leafFilesRendered).toBe(0);
  });

  it('applies the same rule to the readiness endpoint', async () => {
    // Two endpoints answer this question. Fixing one would leave the readiness
    // chip claiming ready while the compile panel said otherwise.
    const res = createMockResponse();
    await getHandler('/:projectIdent/status', 'get')(req(), res);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.submissionReady).toBe(false);
    expect(body.submissionBlockers.join(' ')).toMatch(/leaf files/);
    expect(body).toHaveProperty('contentComplete');
    expect(body).toHaveProperty('overallReadiness');
  });
});
