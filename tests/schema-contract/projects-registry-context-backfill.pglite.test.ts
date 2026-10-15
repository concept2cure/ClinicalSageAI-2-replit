/**
 * 20261008c_projects_registry_context.sql — every project record names the
 * registry entry its program files under, so the readiness digest can compute
 * (QA 2026-10-08, second walk, j8).
 *
 * The Executive Readiness Digest (server/services/report-os/orchestrator.ts)
 * evaluates submission readiness against `projects.metadata.registryId`, or
 * `.submissionType` resolved by the submission-type bridge. Intake never wrote
 * either (the wizard's choice went to regulatory_programs.metadata), so every
 * program in QA — 25 tiles on the board, one created that day with
 * submissionTypeId 'us_ind' — "records no registry context".
 *
 * Intake now writes it (registryContextForProgram). This file gives the
 * existing project records the same context. Run on real SQL (PGlite), as
 * every deploy replays it (Rule 1):
 *   - the program's recorded choice (metadata.submissionTypeId) first;
 *   - else a filing type its agency fixes, for exactly the pairs
 *     PROGRAM_TYPE_REGISTRY lists — each pair checked against the TypeScript
 *     rule intake uses, so the SQL and the code cannot drift;
 *   - nothing for a program that names no entry ('ind' filed with MFDS, a CER,
 *     an EU MDR file), and nothing over a context already recorded;
 *   - only the program's own organisation's row; a second deploy changes nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../scripts/db/migration-set.mjs';
import { extractTableDdl } from '../golden-journeys/harness';
import {
  PROGRAM_TYPE_REGISTRY,
  registryContextForProgram,
} from '../../server/services/c2c/program-registry-context';
import { resolveRegistryId } from '../../server/services/regulatory/registry/legacySubmissionTypeMapper';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const FILE = 'migrations/20261008c_projects_registry_context.sql';
const ANCHOR = 'migrations/20260814_projects_regulatory_program_anchor.sql';
const BACKFILL_P19 = 'migrations/20261008_program_project_anchor_backfill.sql';

interface Fixture {
  id: string;
  org: number;
  programType: string;
  agency: string;
  metadata: Record<string, unknown> | null;
  projectMetadata?: Record<string, unknown> | null;
  deleted?: boolean;
}

const uuid = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let seq = 0;
const FIXTURES: Fixture[] = [
  // The QA programs: wizard-created (the choice is on the program) and seeded.
  { id: uuid(++seq), org: 1, programType: 'ind', agency: 'FDA', metadata: { createdVia: 'v2-new-project-wizard', submissionTypeId: 'us_ind' } },
  { id: uuid(++seq), org: 1, programType: 'IND', agency: 'FDA', metadata: { blocker: 'Drug substance stability data pending' } },
  { id: uuid(++seq), org: 1, programType: 'MAA', agency: 'EMA', metadata: { pathway: 'centralised', region: 'EU' } },
  { id: uuid(++seq), org: 1, programType: 'JNDA', agency: 'PMDA', metadata: { pathway: 'J-NDA' } },
  { id: uuid(++seq), org: 1, programType: '510K', agency: 'FDA', metadata: null },
  // Every pair the rule lists, filed with its own agency.
  ...Object.entries(PROGRAM_TYPE_REGISTRY).map(([type, { agency }]) => ({
    id: uuid(++seq), org: 1, programType: type, agency, metadata: null,
  })),
  // Names no entry: the same filing type with another agency, and filing types
  // the bridge would misread or that have no single entry.
  { id: uuid(++seq), org: 1, programType: 'ind', agency: 'MFDS', metadata: null },
  { id: uuid(++seq), org: 1, programType: 'CER', agency: 'EMA', metadata: null },
  { id: uuid(++seq), org: 1, programType: 'mdr', agency: 'EMA', metadata: null },
  { id: uuid(++seq), org: 1, programType: 'device', agency: 'FDA', metadata: null },
  // A context already recorded is left as it is; other keys are kept.
  { id: uuid(++seq), org: 1, programType: 'bla', agency: 'FDA', metadata: null, projectMetadata: { registryId: 'US_BLA', note: 'set by hand' } },
  { id: uuid(++seq), org: 1, programType: 'nda', agency: 'FDA', metadata: null, projectMetadata: { note: 'keep me' } },
  // A soft-deleted program is not touched.
  { id: uuid(++seq), org: 1, programType: 'ind', agency: 'FDA', metadata: null, deleted: true },
];
/** Named for the assertions below. */
const F = {
  wizardInd: FIXTURES[0],
  seededInd: FIXTURES[1],
  seededMaa: FIXTURES[2],
  seededJnda: FIXTURES[3],
  seeded510k: FIXTURES[4],
  indMfds: FIXTURES.find((f) => f.programType === 'ind' && f.agency === 'MFDS')!,
  cer: FIXTURES.find((f) => f.programType === 'CER')!,
  mdr: FIXTURES.find((f) => f.programType === 'mdr')!,
  device: FIXTURES.find((f) => f.programType === 'device')!,
  recorded: FIXTURES.find((f) => f.projectMetadata?.registryId === 'US_BLA')!,
  otherKeys: FIXTURES.find((f) => f.projectMetadata?.note === 'keep me')!,
  deleted: FIXTURES.find((f) => f.deleted)!,
};
/** A program of org 1 that only org 2's project row names (written unchecked before 20260926b). */
const FOREIGN = uuid(900);

let db: PGlite;
const projectOf = new Map<string, number>();
const notices: string[] = [];

const metaOf = async (program: string) =>
  (await db.query<{ metadata: Record<string, unknown> | null }>(
    `SELECT metadata FROM projects WHERE id = $1`, [projectOf.get(program)],
  )).rows[0]?.metadata ?? null;
/** The registry entry the readiness digest would resolve from a project's metadata. */
const digestRegistry = (m: Record<string, unknown> | null) => {
  const id = typeof m?.registryId === 'string' ? m.registryId : undefined;
  const st = typeof m?.submissionType === 'string' ? m.submissionType : undefined;
  return id || (st ? resolveRegistryId(st) : null);
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['organizations', 'users', 'client_workspaces', 'projects']));
  await db.exec(read('migrations/20260524_program_workbench_schema.sql'));
  await db.exec(read(ANCHOR));
  await db.exec(`
    INSERT INTO organizations (id, name, slug) VALUES (1, 'Sponsor', 'sponsor'), (2, 'Other', 'other');
    INSERT INTO client_workspaces (id, organization_id, name, slug) VALUES (10, 1, 'Default', 'default'), (20, 2, 'Other', 'other');
  `);
  let pid = 100;
  for (const f of [...FIXTURES, { id: FOREIGN, org: 1, programType: 'ind', agency: 'FDA', metadata: null } as Fixture]) {
    await db.query(
      `INSERT INTO regulatory_programs
         (id, organization_id, name, code, program_type, product_type, primary_agency, product_name, status, metadata, deleted_at)
       VALUES ($1, $2, $3, $4, $5, 'drug', $6, $3, 'active', $7::json, $8)`,
      [f.id, f.org, `P ${f.id.slice(-4)}`, `C-${f.id.slice(-4)}`, f.programType, f.agency,
        f.metadata ? JSON.stringify(f.metadata) : null, f.deleted ? new Date().toISOString() : null],
    );
    const foreign = f.id === FOREIGN;
    await db.query(
      `INSERT INTO projects (id, organization_id, client_workspace_id, name, code, type, regulatory_program_id, metadata)
       VALUES ($1, $2, $3, $4, $5, 'regulatory', $6, $7::json)`,
      [++pid, foreign ? 2 : f.org, foreign ? 20 : 10, `P ${f.id.slice(-4)}`, `C-${f.id.slice(-4)}`, f.id,
        f.projectMetadata ? JSON.stringify(f.projectMetadata) : null],
    );
    projectOf.set(f.id, pid);
  }
  await db.exec(read(FILE), { onNotice: (n) => notices.push(n.message ?? '') });
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('20261008c on the applier', () => {
  it('runs after the P-19 anchor backfill (whose rows it completes) and before the tenant sweeps', () => {
    const files = C2C_MIGRATION_FILES as string[];
    const at = files.indexOf(FILE);
    expect(at, `${FILE} is not in C2C_MIGRATION_FILES`).toBeGreaterThan(-1);
    expect(files.indexOf(ANCHOR)).toBeLessThan(at);
    expect(files.indexOf(BACKFILL_P19)).toBeLessThan(at);
    expect(at).toBeLessThan(files.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC as string));
  });

  it('drops nothing', () => {
    expect(read(FILE).replace(/--[^\n]*/g, '')).not.toMatch(/\bDROP\b/i);
  });
});

describe('the QA programs get the context the digest needs', () => {
  it('a wizard-created IND records the registry entry the person chose', async () => {
    expect(digestRegistry(await metaOf(F.wizardInd.id))).toBe('US_IND');
    expect(await metaOf(F.wizardInd.id)).toMatchObject({ submissionType: 'us_ind' });
  });

  it('seeded programs record the entry their filing type and agency fix', async () => {
    expect(digestRegistry(await metaOf(F.seededInd.id))).toBe('US_IND');
    expect(digestRegistry(await metaOf(F.seededMaa.id))).toBe('EU_MAA');
    expect(digestRegistry(await metaOf(F.seededJnda.id))).toBe('JP_MKT_APPROVAL');
    expect(digestRegistry(await metaOf(F.seeded510k.id))).toBe('US_510K');
  });
});

describe('the SQL and intake’s rule agree, pair by pair', () => {
  it.each(FIXTURES.filter((f) => !f.deleted && !f.projectMetadata).map((f) => [`${f.programType}/${f.agency}`, f] as const))(
    '%s',
    async (_label, f) => {
      const ts = registryContextForProgram({
        submissionTypeId: (f.metadata?.submissionTypeId as string | undefined) ?? null,
        programType: f.programType,
        primaryAgency: f.agency,
      });
      const tsRegistry = ts ? (ts.registryId ?? resolveRegistryId(ts.submissionType)) : null;
      expect(digestRegistry(await metaOf(f.id))).toBe(tsRegistry);
    },
  );
});

describe('what it leaves alone', () => {
  it('a program that names no entry gets none', async () => {
    for (const f of [F.indMfds, F.cer, F.mdr, F.device]) {
      expect(await metaOf(f.id), `${f.programType}/${f.agency}`).toBeNull();
    }
  });

  it('a recorded context is kept; other keys survive', async () => {
    expect(await metaOf(F.recorded.id)).toEqual({ registryId: 'US_BLA', note: 'set by hand' });
    expect(await metaOf(F.otherKeys.id)).toMatchObject({ note: 'keep me', registryId: 'US_NDA' });
  });

  it('a soft-deleted program and another organisation’s row are not touched', async () => {
    expect(await metaOf(F.deleted.id)).toBeNull();
    expect(await metaOf(FOREIGN)).toBeNull();
  });

  it('names how many records it completed, by count only', () => {
    expect(notices.join('\n')).toMatch(/registry context recorded on \d+ project record\(s\)/);
  });
});

describe('Rule 1: replayed on every deploy', () => {
  it('a second deploy changes nothing', async () => {
    const before = (await db.query(`SELECT id, metadata::text AS m FROM projects ORDER BY id`)).rows;
    await db.exec(read(FILE));
    const after = (await db.query(`SELECT id, metadata::text AS m FROM projects ORDER BY id`)).rows;
    expect(after).toEqual(before);
  });
});
