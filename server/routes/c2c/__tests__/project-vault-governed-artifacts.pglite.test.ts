/**
 * The Vault's "Governed artifacts" branch on PostgreSQL (fold F3 slice A, D2,
 * 2026-10-29).
 *
 * Which registry rows a project's Vault lists is the database's to decide: the
 * organization predicate, the program anchor, the archived filter, and the
 * signature and review sub-reads that give each leaf its state. A mocked pool
 * accepts any SQL, so this runs the real route on real SQL (PGlite). The
 * stores the branch does not need are left unprovisioned; the read reports
 * them unavailable, which is its contract.
 */
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ pg: null as unknown as import('@electric-sql/pglite').PGlite }));
const query = (sql: string, params?: unknown[]) => h.pg.query(sql, params as unknown[]);
vi.mock('../../../db.js', () => ({ pool: { query: (sql: string, params?: unknown[]) => query(sql, params) } }));

/* The spine resolver reads through drizzle's runtime db, which this suite does
   not stand up. It is stated: the project is anchored. The SQL below still has
   to match through projects.regulatory_program_id on its own. */
vi.mock('../../../services/cmc/resolve-cmc-artifact-project.js', () => ({
  resolveCmcArtifactProject: async () => ({ state: 'linked', artifactProjectId: 11, via: 'program-anchor' }),
}));
vi.mock('../../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});

import createProjectVaultRoutes from '../project-vault';
import { clearSeats, seatMember, seatProgram } from './support/current-member';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const USER = 41;

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE TABLE users (id integer PRIMARY KEY, name text, email text);
    INSERT INTO users VALUES (5, 'R. Writer', 'writer@example.test');
    CREATE FUNCTION public.actor_name(integer) RETURNS TABLE(name text, email text)
      LANGUAGE sql STABLE AS 'SELECT name, email FROM users WHERE id = $1';
    CREATE TABLE regulatory_programs (
      id uuid PRIMARY KEY, organization_id integer, name text, product_type text,
      program_type text, primary_agency text, deleted_at timestamptz
    );
    INSERT INTO regulatory_programs (id, organization_id, name, product_type) VALUES
      ('${P1}', 7, 'BX-204', 'device'), ('${P2}', 7, 'BX-999', 'device');
    CREATE TABLE c2c_documents (
      id text, doc_type text, agency text, rule_pack_version text, title text, status text,
      readiness integer, updated_at timestamptz, owner_id integer, project_id text, org_id integer
    );
    CREATE TABLE c2c_rule_packs (doc_type text, agency text, version text, required_sections jsonb);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, code text, name text, regulatory_program_id uuid);
    INSERT INTO projects VALUES
      (11, 7, 'BX-204', 'BX-204', '${P1}'),
      (12, 7, 'BX-999', 'BX-999', '${P2}'),
      -- another organization's project, anchored to P1 by a row written before the same-org key
      (13, 8, 'THEIRS', 'Their program', '${P1}');
    CREATE TABLE concept2cure_artifacts (
      id serial PRIMARY KEY, artifact_id text, title text, metadata json, type text, category text,
      ctd_section text, status text, version integer, content text, content_hash text,
      created_by_id integer, updated_at timestamp DEFAULT now(), project_id integer, organization_id integer
    );
    CREATE TABLE concept2cure_artifact_versions (id serial PRIMARY KEY, artifact_id integer, version integer);
    CREATE TABLE concept2cure_signatures (id serial PRIMARY KEY, artifact_id integer, organization_id integer, status text, artifact_version_id integer);
    CREATE TABLE concept2cure_review_decisions (artifact_id integer, organization_id integer, decision text, version_reviewed integer);

    INSERT INTO concept2cure_artifacts
      (id, artifact_id, title, metadata, type, category, ctd_section, status, version, content, content_hash, created_by_id, project_id, organization_id)
    VALUES
      (1, 'a-cover',   'Cover letter',      '{"source":"ana_document_studio","sourceArtifactIds":[10,11]}', 'regulatory_document', 'document', '1.2',     'approved', 1, 'x', 'h1', 5,    11, 7),
      (2, 'a-overview','Clinical overview', '{"model":"claude-opus-4"}',                                   'regulatory_document', 'document', '2.5',     'review',   5, 'x', 'h2', 5,    11, 7),
      (3, 'm3-s1',     'Module 3 — General Information', '{"compiledFrom":"module3-os"}',                   'markdown',            'document', '3.2.S.1', 'draft',    2, 'x', 'h3', NULL, 11, 7),
      (4, 'import-1',  'device-file.pdf',   '{"importJobId":1}',                                           'imported',            'document', NULL,      'draft',    1, '',  'h4', 5,    11, 7),
      (5, 'a-unknown', 'Signed, version not determinable', '{}',                                          'regulatory_document', 'document', '2.7',     'draft',    2, 'x', 'h5', 5,    11, 7),
      (6, 'a-archived','Archived summary',  '{}',                                                          'regulatory_document', 'document', '2.6',     'archived', 1, 'x', 'h6', 5,    11, 7),
      (7, 'a-other-p', 'Other project draft','{}',                                                         'regulatory_document', 'document', '2.5',     'draft',    1, 'x', 'h7', 5,    12, 7),
      (8, 'a-tenant',  'Another tenant row','{}',                                                          'regulatory_document', 'document', '2.5',     'draft',    1, 'x', 'h8', 5,    11, 8),
      (9, 'a-foreign', 'Under a foreign project','{}',                                                     'regulatory_document', 'document', '2.5',     'draft',    1, 'x', 'h9', 5,    13, 7),
      -- another organization's artifact on its own project, which a row written before the
      -- same-org key anchors to our program: only the organization predicate keeps it out
      (10, 'a-theirs', 'Their own draft',  '{}',                                                          'regulatory_document', 'document', '2.5',     'draft',    1, 'x', 'h10', 5,   13, 8);

    INSERT INTO concept2cure_artifact_versions (id, artifact_id, version) VALUES (101, 1, 1), (102, 2, 3);
    INSERT INTO concept2cure_signatures (artifact_id, organization_id, status, artifact_version_id) VALUES
      (1, 7, 'active', 101),   -- covers v1, which is current
      (2, 7, 'active', 102),   -- covers v3; the artifact is at v5
      (5, 7, 'active', 999),   -- names a version row that does not exist
      (3, 8, 'active', 101);   -- another organization's signature on our row: not ours
    INSERT INTO concept2cure_review_decisions VALUES
      (1, 7, 'approve', 1),     -- current version reviewed
      (2, 7, 'approve', 4);     -- an earlier version reviewed: not the current one
  `);
});
afterAll(async () => {
  await h.pg.close();
});

beforeEach(() => {
  clearSeats();
  seatMember(7, USER, 'member');
  seatProgram(7, P1);
  seatProgram(7, P2);
});

function app() {
  const a = express();
  a.use((req: any, _res, next) => {
    req.organizationId = 7;
    req.userId = USER;
    req.user = { id: USER };
    req.dbClient = { query };
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

async function read(program = P1) {
  const res = await request(app()).get(`/api/c2c/project-vault/${program}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const branch = (res.body.data.tree as any[]).find((f) => f.id === 'artifacts');
  const leaves = branch ? (branch.children as any[]).flatMap((g) => g.children) : [];
  return { body: res.body, branch, leaves, byTitle: (t: string) => leaves.find((l: any) => l.title === t) };
}

describe('GET /api/c2c/project-vault/:id — the governed artifacts of this project, on PostgreSQL', () => {
  it('lists every non-archived artifact of the project across CTD sections, and nothing else', async () => {
    const { branch, leaves, body } = await read();
    expect(branch, 'the branch is in the tree').toBeTruthy();
    expect(leaves.map((l: any) => l.title).sort()).toEqual(
      ['Clinical overview', 'Cover letter', 'Module 3 — General Information', 'Signed, version not determinable', 'device-file.pdf'].sort(),
    );
    const text = JSON.stringify(body);
    expect(text, 'archived').not.toContain('Archived summary');
    expect(text, 'another program of the same organization').not.toContain('Other project draft');
    expect(text, 'another organization').not.toContain('Another tenant row');
    expect(text, 'a project of another organization anchored to this program').not.toContain('Under a foreign project');
    expect(text, "another organization's artifact on its own project anchored to this program").not.toContain('Their own draft');
    expect(text).not.toMatch(/THEIRS|Their program/);
    expect(branch.children.map((g: any) => g.label)).toEqual(['Module 1', 'Module 2', 'Module 3', 'No CTD section']);
  });

  it('reads the signature on the current version in four states, and review of the current version', async () => {
    const { byTitle } = await read();
    expect(byTitle('Cover letter').artifact).toMatchObject({ signature: 'current', signedVersion: 1, reviewed: true, sourceCount: 2 });
    expect(byTitle('Clinical overview').artifact).toMatchObject({ signature: 'stale', signedVersion: 3, reviewed: false, model: 'claude-opus-4', origin: 'ana' });
    expect(byTitle('Signed, version not determinable').artifact).toMatchObject({ signature: 'unknown', signedVersion: null });
    // Another organization's signature row on this artifact signs nothing here.
    expect(byTitle('Module 3 — General Information').artifact).toMatchObject({ signature: 'none', origin: 'cmc-composer' });
    expect(byTitle('device-file.pdf').artifact).toMatchObject({ origin: 'import', ctdSection: null });
  });

  it('names the author through actor_name, and says nothing where none was recorded', async () => {
    const { byTitle } = await read();
    expect(byTitle('Cover letter').owner).toBe('R. Writer');
    expect(byTitle('Cover letter').artifact.author).toBe('R. Writer');
    expect(byTitle('Module 3 — General Information').owner).toBe('—');
    expect(byTitle('Module 3 — General Information').artifact.author).toBeNull();
    expect(byTitle('Cover letter').artifact.contentHash).toBe('h1');
  });

  it('counts the project exactly, and another project of the organization reads its own', async () => {
    const one = await read(P1);
    expect(one.body.data.artifacts).toMatchObject({ total: 5, window: { shown: 5, total: 5, truncated: false } });
    expect(one.body.data.documentCounts.artifacts).toBe(5);
    const two = await read(P2);
    expect(two.leaves.map((l: any) => l.title)).toEqual(['Other project draft']);
    expect(two.body.data.artifacts.total).toBe(1);
  });
});
