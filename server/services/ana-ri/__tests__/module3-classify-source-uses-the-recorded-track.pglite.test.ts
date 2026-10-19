/**
 * AnA's module3_classify_source classifies a source under the submission track
 * the program records, and refuses when none it can carry is recorded.
 *
 * What the code used to do (until 2026-10-15): the handler passed
 * `submissionTrack: 'IND'` for every artifact, whatever the program files, and
 * classifyAndMapArtifactToSource wrote that track into the CMC source object's
 * payload and its provenance event — so an NDA program's specification was
 * recorded as IND material, and a project that records no type at all was
 * classified as an IND.
 *
 * regulatory_programs and projects from their drizzle definitions, on PGlite;
 * the classification service is a double that records what it was given.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { projects } from '../../../../shared/schema';
import { regulatoryPrograms } from '../../../../shared/schema/programs';
import type { CommandContext } from '../command-types';

const H = vi.hoisted(() => ({
  pg: null as any,
  classify: vi.fn(async () => ({ sourceObjectId: 77, sectionKey: '3.2.P.5.1' })),
}));

vi.mock('../../../db', () => {
  const query = async (text: string, params?: unknown[]) => H.pg.query(text, params);
  return { getPool: () => ({ query, connect: async () => ({ query, release: () => undefined }) }), pool: {}, db: {} };
});
vi.mock('../../module3-convergence-service', () => ({
  classifyAndMapArtifactToSource: H.classify,
  bridgeCompileToArtifact: vi.fn(),
  getModule3BuildStatus: vi.fn(),
}));

import { module3ClassifySource } from '../module3-command-handlers';

const ORG = 7;
const OTHER_ORG = 8;
const ctx = { organizationId: ORG, userId: 42 } as CommandContext;

const NDA_PROGRAM = '0b6a3c1e-1111-4a2b-9c3d-000000000001';
const IND_PROGRAM = '0b6a3c1e-1111-4a2b-9c3d-000000000002';
const MAA_PROGRAM = '0b6a3c1e-1111-4a2b-9c3d-000000000003';
const BLA_PROGRAM = '0b6a3c1e-1111-4a2b-9c3d-000000000004';
const FOREIGN_PROGRAM = '0b6a3c1e-1111-4a2b-9c3d-000000000005';
const ANCHORED_PROJECT = 501;
const TYPED_LEGACY_PROJECT = 502;
const UNTYPED_LEGACY_PROJECT = 503;

/** CREATE TABLE from the drizzle definition: columns, types, literal defaults. */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => {
    const d = col.default;
    const literal = typeof d === 'number' || typeof d === 'boolean' ? ` DEFAULT ${d}`
      : typeof d === 'string' ? ` DEFAULT '${d.replace(/'/g, "''")}'` : '';
    return `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}${literal}`;
  });
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

beforeAll(async () => {
  H.pg = new PGlite();
  await H.pg.exec(ddlOf(regulatoryPrograms as PgTable));
  await H.pg.exec(ddlOf(projects as PgTable));
  const program = (id: string, org: number, type: string) =>
    H.pg.query(
      `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, $3, $4, $5, 'drug', 'FDA', 'Compound X')`,
      [id, org, `${type} program`, `P-${id.slice(-1)}`, type]);
  await program(NDA_PROGRAM, ORG, 'NDA');
  await program(IND_PROGRAM, ORG, 'ind');
  await program(MAA_PROGRAM, ORG, 'MAA');
  await program(BLA_PROGRAM, ORG, 'BLA');
  await program(FOREIGN_PROGRAM, OTHER_ORG, 'NDA');
  await H.pg.query(
    `INSERT INTO projects (id, organization_id, client_workspace_id, name, type, regulatory_program_id, metadata) VALUES
       ($1, $4, 1, 'Anchored', 'regulatory', $5, '{}'),
       ($2, $4, 1, 'Typed legacy', 'regulatory', NULL, '{"submissionType": "510(k)"}'),
       ($3, $4, 1, 'Untyped legacy', 'regulatory', NULL, '{}')`,
    [ANCHORED_PROJECT, TYPED_LEGACY_PROJECT, UNTYPED_LEGACY_PROJECT, ORG, BLA_PROGRAM]);
}, 60_000);

afterAll(async () => {
  await H.pg?.close();
});

beforeEach(() => {
  H.classify.mockClear();
});

const classify = (projectId: string | number) =>
  module3ClassifySource(ctx, { projectId, artifactId: 'art-1', sourceType: 'specification' });
const trackGiven = () => (H.classify.mock.calls[0] as unknown[] | undefined)?.[3] as { submissionTrack?: string } | undefined;

describe('the track is the one the program records', () => {
  it("an NDA program's source is classified under NDA, not IND", async () => {
    const res = await classify(NDA_PROGRAM);
    expect(res.success).toBe(true);
    expect(trackGiven()?.submissionTrack, "an NDA program's source was classified under IND").toBe('NDA');
  }, 60_000);

  it('an IND program (recorded in lower case) is classified under IND', async () => {
    await classify(IND_PROGRAM);
    expect(trackGiven()?.submissionTrack).toBe('IND');
  }, 60_000);

  it("a legacy project anchored to a program takes the program's type", async () => {
    await classify(String(ANCHORED_PROJECT));
    expect(trackGiven()?.submissionTrack).toBe('BLA');
  }, 60_000);

  it("a legacy project with no program takes its own recorded submission type", async () => {
    await classify(TYPED_LEGACY_PROJECT);
    expect(trackGiven()?.submissionTrack).toBe('510K');
  }, 60_000);
});

describe('refused, and nothing classified, when no track it can carry is recorded', () => {
  it('a project that records no submission type', async () => {
    const res = await classify(String(UNTYPED_LEGACY_PROJECT));
    expect(H.classify, 'a project recording no type was classified anyway').not.toHaveBeenCalled();
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/records no submission type/);
  }, 60_000);

  it('a program whose recorded application the classification has no track for (an MAA)', async () => {
    const res = await classify(MAA_PROGRAM);
    expect(H.classify, 'an MAA program was classified anyway').not.toHaveBeenCalled();
    expect(res.success).toBe(false);
    expect(res.message).toContain('"MAA"');
  }, 60_000);

  it("another organization's program", async () => {
    const res = await classify(FOREIGN_PROGRAM);
    expect(H.classify, "another organization's program was classified").not.toHaveBeenCalled();
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/not a program or project of this organization/);
  }, 60_000);
});
