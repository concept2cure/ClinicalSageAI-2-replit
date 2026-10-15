/**
 * A CMC register record is filed under one program, and an edit never moves it
 * into another (discovery map 2026-10-04: cmc-cross-program-write-through,
 * core-registers-not-project-scoped, create-paths-skip-project-membership).
 *
 * drug_substances, drug_products, stability_studies, analytical_methods,
 * process_validation and cmc_change_control recorded no program, so a save took
 * it from the request body: editing program A's substance with program B open
 * filed a second copy of it under B, and B's §3.2.S composed from A's
 * material. migrations/20261005_cmc_core_registers_project.sql gives the tables
 * a program; these are the rules that keep it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({ pg: null as any, programs: new Set<string>() }));
vi.mock('../../../db', () => ({
  db: {},
  getPool: () => ({ query: (sql: string, params: unknown[]) => h.pg.query(sql, params) }),
}));
vi.mock('../project-membership', () => ({
  projectBelongsToTenant: async ({ organizationId, projectId }: { organizationId: number; projectId: string }) =>
    h.programs.has(`${organizationId}:${projectId}`),
}));

import {
  PROGRAM_FILED_REGISTERS,
  PROJECT_NOT_IN_TENANT_REFUSAL,
  RegisterWriteRefusal,
  filedProjectOnCreate,
  projectOnEdit,
} from '../register-writes';

const ORG = 7;
const A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const FOREIGN = 'ffffffff-0000-4000-8000-00000000000f';

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE TABLE drug_substances (id serial PRIMARY KEY, organization_id integer NOT NULL, substance_name text, project_id text);
    CREATE TABLE cmc_source_objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id integer NOT NULL, project_id text NOT NULL,
      source_type text NOT NULL, source_key text NOT NULL);
  `);
  h.programs = new Set([`${ORG}:${A}`, `${ORG}:${B}`]);
});
afterAll(async () => {
  await h.pg.close();
});
beforeEach(async () => {
  await h.pg.exec('DELETE FROM drug_substances; DELETE FROM cmc_source_objects;');
});

async function substance(projectId: string | null): Promise<number> {
  const r = await h.pg.query(
    `INSERT INTO drug_substances (organization_id, substance_name, project_id) VALUES ($1, 'BX-701', $2) RETURNING id`,
    [ORG, projectId],
  );
  return r.rows[0].id;
}

const DS = PROGRAM_FILED_REGISTERS.drugSubstance;

describe('a new record is filed under a program this organisation holds', () => {
  it('files it under the named program', async () => {
    expect(await filedProjectOnCreate(ORG, ` ${A} `)).toBe(A);
  });

  it('refuses a program that is not this organisation’s, and files nothing', async () => {
    await expect(filedProjectOnCreate(ORG, FOREIGN)).rejects.toThrow(PROJECT_NOT_IN_TENANT_REFUSAL);
    await expect(filedProjectOnCreate(ORG, FOREIGN)).rejects.toBeInstanceOf(RegisterWriteRefusal);
  });

  it('leaves a record with no program unfiled', async () => {
    expect(await filedProjectOnCreate(ORG, undefined)).toBeNull();
    expect(await filedProjectOnCreate(ORG, '  ')).toBeNull();
  });
});

describe('an edit never moves a filed record', () => {
  it('keeps program A’s substance in A when it is edited with program B open', async () => {
    const id = await substance(A);
    expect(await projectOnEdit(ORG, DS, id, B)).toEqual({ found: true, set: {} });
  });

  it('does not find another organisation’s record', async () => {
    const id = await substance(A);
    expect(await projectOnEdit(ORG + 1, DS, id, A)).toEqual({ found: false, set: {} });
  });
});

describe('a legacy, unfiled record is filed on its first edit — never forked', () => {
  it('files it under the open program when no other program holds it', async () => {
    const id = await substance(null);
    expect(await projectOnEdit(ORG, DS, id, A)).toEqual({ found: true, set: { projectId: A } });
  });

  it('refuses when another program already holds its canonical source, and changes nothing', async () => {
    const id = await substance(null);
    await h.pg.query(
      `INSERT INTO cmc_source_objects (organization_id, project_id, source_type, source_key) VALUES ($1, $2, 'drug_substance', $3)`,
      [ORG, A, `drug_substance:${id}`],
    );
    await expect(projectOnEdit(ORG, DS, id, B)).rejects.toThrow(/already part of another program/);
    // Filing it under the program that already holds it is not a fork.
    expect(await projectOnEdit(ORG, DS, id, A)).toEqual({ found: true, set: { projectId: A } });
  });

  it('refuses an open program that is not this organisation’s', async () => {
    const id = await substance(null);
    await expect(projectOnEdit(ORG, DS, id, FOREIGN)).rejects.toThrow(PROJECT_NOT_IN_TENANT_REFUSAL);
  });
});
