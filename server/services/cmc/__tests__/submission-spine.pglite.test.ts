/**
 * A program's submission is the one anchored to it (LX-22 part 2b, PF-06).
 *
 * `resolveSubmissionSpine` is the one server read of "this program's
 * submission": the eCTD compile (four routes), the Module 1 forms and their
 * official upload (a governed write), and the Module 3 compile all go through
 * it. It matched program ↔ submission by product name / title and took the
 * newest match — so two projects for one product resolved to the same filing,
 * and whichever submission was touched last won.
 *
 * Now: a submission anchored to the program (submissions.program_id) is the
 * program's, and one anchored to ANOTHER program never is. A submission with no
 * recorded project (created before submissions recorded one) is matched by name
 * only when that is unambiguous in both directions — exactly one such
 * submission for this program, and no other live program of the organization
 * that it could equally belong to — and says so (`match: 'legacy-name'`).
 * Anything ambiguous is no spine: fail closed, never a guess.
 *
 * Real DDL: the program, submission-core and anchor migrations, on PGlite.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';

const h = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock('../../../db', () => ({
  get pool() {
    return h.pool;
  },
}));

import { resolveSubmissionSpine, type SpineAnchor } from '../submission-spine';

const ROOT = join(__dirname, '..', '..', '..', '..');
const sql = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const ORG = 1;
const OTHER_ORG = 2;
const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

// Programs, all IND unless noted.
const A = uuid(1); // 'Shared-930' — anchored S_A (newer)
const B = uuid(2); // 'Shared-930' — anchored S_B (older)
const C = uuid(3); // 'Solo'       — anchored S_C, plus a NEWER unanchored 'Solo' row
const D = uuid(4); // 'Legacy-1'   — one unanchored row, no other program named so
const E = uuid(5); // 'Twin'       — one unanchored row that E and F both name
const F = uuid(6); // 'Twin'
const G = uuid(7); // 'Dup'        — two unanchored rows
const H = uuid(8); // 'Other'      — nothing anchored to H
const I = uuid(9); // 'Other'      — anchored S_I

let db: PGlite;
const ids: Record<string, number> = {};

function anchor(programId: string, productName: string): SpineAnchor {
  return { programId, programType: 'ind', productName, title: `${productName} IND`, programCode: null };
}

async function submission(key: string, productName: string, programId: string | null, org = ORG): Promise<void> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, organization_id, created_by, program_id)
     VALUES ($1, $2, 'ind', 'pharma', 'fda', $3, 7, $4) RETURNING id`,
    [`${productName} IND`, productName, org, programId],
  );
  ids[key] = rows[0].id;
}

beforeAll(async () => {
  db = new PGlite();
  h.pool = { query: (text: string, params?: unknown[]) => db.query(text, params as unknown[]) };
  await db.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, email TEXT);
    INSERT INTO organizations (id, name) VALUES (1, 'acme'), (2, 'other');
    INSERT INTO users (id, name, email) VALUES (7, 'u', 'u@x');
  `);
  await db.exec(sql('migrations/20260524_program_workbench_schema.sql'));
  await db.exec(sql('migrations/20260604_submission_core_canonical.sql'));
  await db.exec(sql('migrations/20260925b_submissions_program_anchor.sql'));
  const programs: Array<[string, string]> = [
    [A, 'Shared-930'], [B, 'Shared-930'], [C, 'Solo'], [D, 'Legacy-1'],
    [E, 'Twin'], [F, 'Twin'], [G, 'Dup'], [H, 'Other'], [I, 'Other'],
  ];
  for (const [id, product] of programs) {
    await db.query(
      `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, $3, $4, 'ind', 'drug', 'FDA', $5)`,
      [id, ORG, `${product} IND`, `P-${id.slice(0, 8)}`, product],
    );
  }
  // Insertion order is recency: the newer row has the higher id.
  await submission('S_B', 'Shared-930', B);
  await submission('S_A', 'Shared-930', A);
  await submission('S_C', 'Solo', C);
  await submission('L_C', 'Solo', null);
  await submission('L_D', 'Legacy-1', null);
  await submission('L_EF', 'Twin', null);
  await submission('L_G1', 'Dup', null);
  await submission('L_G2', 'Dup', null);
  await submission('S_I', 'Other', I);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('resolveSubmissionSpine — the program’s submission is the one anchored to it', () => {
  it('two projects for one product each resolve to their own submission', async () => {
    expect(await resolveSubmissionSpine(anchor(A, 'Shared-930'), ORG)).toMatchObject({ submissionId: ids.S_A, match: 'program' });
    expect(await resolveSubmissionSpine(anchor(B, 'Shared-930'), ORG)).toMatchObject({ submissionId: ids.S_B, match: 'program' });
  });

  it('prefers the anchored submission over a newer same-named one with no project', async () => {
    expect(await resolveSubmissionSpine(anchor(C, 'Solo'), ORG)).toMatchObject({ submissionId: ids.S_C, match: 'program' });
  });

  it('never takes a submission anchored to ANOTHER program by name', async () => {
    expect(await resolveSubmissionSpine(anchor(H, 'Other'), ORG)).toBeNull();
    expect(await resolveSubmissionSpine(anchor(I, 'Other'), ORG)).toMatchObject({ submissionId: ids.S_I, match: 'program' });
  });

  it('matches an unanchored submission by name only when that is unambiguous both ways, and says so', async () => {
    expect(await resolveSubmissionSpine(anchor(D, 'Legacy-1'), ORG)).toMatchObject({ submissionId: ids.L_D, match: 'legacy-name' });
  });

  it('resolves nothing when two programs could equally claim one unanchored submission', async () => {
    expect(await resolveSubmissionSpine(anchor(E, 'Twin'), ORG)).toBeNull();
    expect(await resolveSubmissionSpine(anchor(F, 'Twin'), ORG)).toBeNull();
  });

  it('resolves nothing when two unanchored submissions match one program', async () => {
    expect(await resolveSubmissionSpine(anchor(G, 'Dup'), ORG)).toBeNull();
  });

  it('is organization-scoped: another organization resolves nothing for this program', async () => {
    expect(await resolveSubmissionSpine(anchor(A, 'Shared-930'), OTHER_ORG)).toBeNull();
  });
});
