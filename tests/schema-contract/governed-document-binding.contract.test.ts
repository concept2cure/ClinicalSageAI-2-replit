/**
 * Contract: an authored document knows which filing it is authoring — or says
 * why it does not.
 *
 * ── The split this closes ─────────────────────────────────────────────────────
 * The platform kept two document stores. c2c_documents is a regulatory filing:
 * bound to a project, a document class, an agency and the rule pack defining its
 * required sections, with a BEFORE UPDATE trigger that RAISES without an actor
 * so Part 11 attribution cannot be skipped. authoring_documents is the editing
 * surface — comments, citations, e-signature, freeze, export — and had no idea
 * which filing it was contributing to.
 *
 * The editor a user reaches writes the second. The compliance spine lives in the
 * first. So the same section edited in two places landed in two tables with two
 * different audit stories.
 *
 * The direction is forward convergence: c2c_documents is the system of record,
 * the authoring stack is the layer over it, and binding happens at creation.
 * Nothing is backfilled — historical authoring documents carry no derivable
 * doc_type or agency, and inventing a regulatory class for a past record is a
 * worse defect than leaving it unbound.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 * Unbound is a legitimate outcome; a SILENTLY unbound one is the bug. So every
 * negative path here asserts a reason is returned, not merely that the id is
 * null. That is the property that stops the two stores drifting apart again.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGovernedDocument } from '../../server/services/c2c/governed-document-binding';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREREQ = path.join(REPO_ROOT, 'migrations/20260527_mutation_primitives.sql');
const SCHEMA = path.join(REPO_ROOT, 'migrations/20260528_phase9_document_schema.sql');

const ORG = 7;
const OTHER_ORG = 99;
const PROJ_IND = '11111111-1111-1111-1111-111111111111';
const PROJ_UNMAPPED = '22222222-2222-2222-2222-222222222222';
const PROJ_NO_DOC = '33333333-3333-3333-3333-333333333333';
const PROJ_OTHER_ORG = '44444444-4444-4444-4444-444444444444';

let pg: PGlite;
const db = () => ({ query: (sql: string, params?: unknown[]) => pg.query(sql, params as any[]) }) as any;

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    -- Only the columns the resolver reads. The real table is far wider; this is
    -- the contract surface between a project and its filing class.
    CREATE TABLE regulatory_programs (
      id uuid PRIMARY KEY,
      organization_id integer NOT NULL,
      program_type text,
      primary_agency text
    );
  `);
  await pg.exec(fs.readFileSync(PREREQ, 'utf8'));
  await pg.exec(fs.readFileSync(SCHEMA, 'utf8'));

  await pg.query(
    `INSERT INTO regulatory_programs (id, organization_id, program_type, primary_agency) VALUES
       ($1, $5, 'ind', 'FDA'),
       ($2, $5, 'ivd', 'FDA'),
       ($3, $5, 'ind', 'FDA'),
       ($4, $6, 'ind', 'FDA')`,
    [PROJ_IND, PROJ_UNMAPPED, PROJ_NO_DOC, PROJ_OTHER_ORG, ORG, OTHER_ORG],
  );

  const pack = await pg.query<{ version: string }>(
    `SELECT version FROM c2c_rule_packs WHERE doc_type='ind' AND agency='fda' LIMIT 1`,
  );
  // A governed document for the IND project, and one for the other org's project
  // (so the tenant-isolation case fails on scope, not on absence).
  await pg.query(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     VALUES ('doc_ind_org7', $1, $2, 'ind', 'fda', $3, 'IND', 'draft', 0),
            ('doc_ind_org99', $4, $5, 'ind', 'fda', $3, 'IND other org', 'draft', 0)`,
    [ORG, PROJ_IND, pack.rows[0].version, OTHER_ORG, PROJ_OTHER_ORG],
  );
});
afterEach(async () => { await pg?.close(); });

describe('an authored document binds to its project filing', () => {
  it('binds to the governed document of the open project', async () => {
    const r = await resolveGovernedDocument({ db: db(), orgId: ORG, projectId: PROJ_IND });
    expect(r.documentId).toBe('doc_ind_org7');
    expect(r.reason).toBeUndefined();
  }, 60_000);
});

describe('unbound is legitimate — and never silent', () => {
  it('no project open — org-wide, with a reason', async () => {
    const r = await resolveGovernedDocument({ db: db(), orgId: ORG, projectId: null });
    expect(r.documentId).toBeNull();
    expect(r.reason).toMatch(/org-wide/i);
  }, 60_000);

  it('a program type with no document class does not guess a near neighbour', async () => {
    // ivd is an accepted program type with no doc_type CHECK value and no rule
    // pack. Filing it as something adjacent would be worse than not binding.
    const r = await resolveGovernedDocument({ db: db(), orgId: ORG, projectId: PROJ_UNMAPPED });
    expect(r.documentId).toBeNull();
    expect(r.reason).toContain('ivd');
  }, 60_000);

  it('a project with no governed document yet says so', async () => {
    const r = await resolveGovernedDocument({ db: db(), orgId: ORG, projectId: PROJ_NO_DOC });
    expect(r.documentId).toBeNull();
    expect(r.reason).toMatch(/no governed document/i);
  }, 60_000);

  it('a malformed project id is refused before it reaches a uuid cast', async () => {
    const r = await resolveGovernedDocument({ db: db(), orgId: ORG, projectId: 'not-a-uuid' });
    expect(r.documentId).toBeNull();
    expect(r.reason).toMatch(/not a valid identifier/i);
  }, 60_000);
});

describe('tenant isolation', () => {
  it("another org's project is indistinguishable from one that does not exist", async () => {
    // PROJ_OTHER_ORG exists AND has a governed document — so a scope failure
    // here would bind an org-7 authored document to an org-99 filing. It must
    // report "not found", not leak the existence of the project.
    const r = await resolveGovernedDocument({ db: db(), orgId: ORG, projectId: PROJ_OTHER_ORG });
    expect(r.documentId).toBeNull();
    expect(r.reason).toMatch(/not found in this organization/i);
  }, 60_000);

  it('and the other org still binds its own', async () => {
    // Proves the previous assertion is about scope, not a broken lookup.
    const r = await resolveGovernedDocument({ db: db(), orgId: OTHER_ORG, projectId: PROJ_OTHER_ORG });
    expect(r.documentId).toBe('doc_ind_org99');
  }, 60_000);
});
