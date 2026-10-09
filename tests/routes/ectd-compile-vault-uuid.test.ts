/**
 * eCTD compile — a vault-backed leaf is read by its document_uuid.
 *
 * 2026-09-23 (W5/D7, round-2 review). Since 6fed3840b the assembler packages
 * a vault leaf (document_table vault_documents, document_id NULL,
 * document_uuid set). The compile's leaf read did not select document_uuid,
 * and it called a leaf materialized only when it had a document_id — so a
 * document that IS in the ZIP was reported LEAF_SOURCE_UNRESOLVED ("could not
 * be materialized"), its module showed it as 'unresolved-source', and the
 * status roll-up did not count it as placed. The leaf is now keyed the way the
 * assembler keys it (leafSourceKey: table + uuid, else table + id).
 *
 * The pool mock answers the leaf read with ONLY the columns its SELECT names,
 * as a database would: a read that does not select document_uuid gets none.
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
import {
  LEAVES, REAL_BACKBONE, selfContained, handlerOf, mockSpineOn, makeBundleZip, assembledResult, makeReq,
  type SpineOpts,
} from './ectd-compile-spine.harness';

const getHandler = (routePath: string, method: 'get' | 'post') => handlerOf(ectdCompileRoutes, routePath, method);

const VAULT_A = '33333333-3333-4333-8333-333333333333';
const VAULT_B = '55555555-5555-4555-8555-555555555555';
const PACK = [
  { key: '2.5', mandatory: true },
  { key: '3.2.S', mandatory: true },
  { key: '5.3.5.1', mandatory: true },
];
const vaultLeaf = (section: string, title: string, uuid: string) => ({
  section_code: section, title, lifecycle_op: 'new', document_table: 'vault_documents', document_id: null, document_uuid: uuid,
});

/** The spine, with the leaf read answered by only the columns it selects. */
function mockSpine(opts: SpineOpts) {
  mockSpineOn(poolQuery)(opts);
  const base = poolQuery.getMockImplementation()!;
  poolQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    const res = await base(sql, params);
    const select = /SELECT\s+([\s\S]+?)\s+FROM\s+submission_leaves\b/i.exec(sql);
    if (!select || /count\(/i.test(select[1])) return res;
    const cols = select[1].split(',').map((c) => c.trim());
    return {
      rows: (res.rows as Array<Record<string, unknown>>).map((r) =>
        Object.fromEntries(cols.map((c) => [c, r[c] ?? null])),
      ),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /:projectIdent/compile — a vault leaf the assembly packaged', () => {
  it('is placed and rendered, not "could not be materialized"', async () => {
    mockSpine({ leaves: [...LEAVES, vaultLeaf('5.3.5.1', 'CSR 201', VAULT_A)], pack: PACK });
    const { zipPath } = await makeBundleZip(REAL_BACKBONE);
    assembleSequenceMock.mockResolvedValue(
      assembledResult(zipPath, {
        materialized: 3,
        unresolvedLeaves: [],
        bundle: { ...assembledResult(zipPath).bundle, dtdStatus: selfContained },
      }),
    );

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);
    const payload = res.json.mock.calls[0][0];

    const at = payload.validationResults.filter((v: any) => v.sectionCode === '5.3.5.1');
    expect(at.map((v: any) => v.rule)).toEqual(['REQUIRED_SECTION_OK']);
    expect(at[0].message).toMatch(/is placed and rendered/);
    expect(payload.validationResults.some((v: any) => v.rule === 'LEAF_SOURCE_UNRESOLVED')).toBe(false);
    const m5 = payload.modules.find((m: any) => m.moduleCode === 'm5');
    expect(m5.documents).toEqual([expect.objectContaining({ sectionCode: '5.3.5.1', status: 'rendered', hasContent: true })]);
    expect(m5.requiredCompleted).toBe(1);
  });

  it('an unresolved vault leaf is still named, by its own uuid — a resolved one beside it is not', async () => {
    mockSpine({
      leaves: [...LEAVES, vaultLeaf('5.3.5.1', 'CSR 201', VAULT_A), vaultLeaf('5.3.5.2', 'CSR 202', VAULT_B)],
      pack: PACK,
    });
    const { zipPath } = await makeBundleZip(REAL_BACKBONE);
    assembleSequenceMock.mockResolvedValue(
      assembledResult(zipPath, {
        materialized: 3,
        unresolvedLeaves: [
          { documentTable: 'vault_documents', documentId: null, documentUuid: VAULT_A, reason: 'row not found in this organization' },
        ],
        bundle: { ...assembledResult(zipPath).bundle, dtdStatus: selfContained },
      }),
    );

    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq(), res);
    const payload = res.json.mock.calls[0][0];

    const unresolved = payload.validationResults.filter((v: any) => v.rule === 'LEAF_SOURCE_UNRESOLVED');
    expect(unresolved.map((v: any) => v.sectionCode)).toEqual(['5.3.5.1']);
    expect(payload.submissionReady).toBe(false);
    const m5 = payload.modules.find((m: any) => m.moduleCode === 'm5');
    const status = (code: string) => m5.documents.find((d: any) => d.sectionCode === code)?.status;
    expect(status('5.3.5.1')).toBe('unresolved-source');
    expect(status('5.3.5.2')).toBe('rendered');
  });
});

describe('GET /:projectIdent/status — a vault leaf is a placed document', () => {
  it('counts the required section a vault leaf covers', async () => {
    mockSpine({ leaves: [...LEAVES, vaultLeaf('5.3.5.1', 'CSR 201', VAULT_A)], pack: PACK });
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/status', 'get')(makeReq(), res);
    const payload = res.json.mock.calls[0][0];

    const m5 = payload.modules.find((m: any) => m.moduleCode === 'm5');
    expect(m5).toMatchObject({ requiredSections: 1, completedRequired: 1 });
  });
});
