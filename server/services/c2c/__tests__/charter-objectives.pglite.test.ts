/**
 * The project's objective of record is its charter's objectives section, with
 * its whole history (P-80, P-82; docs/design/ONE_DESIGN_PLAN.md §1a S1).
 *
 * This runs the real charter migrations (0012, the 2026-06-29 rebuild, the
 * append-only audit triggers of 2026-09-11, the 2026-09-17 columns) in PGlite.
 * The service reads and writes those tables through drizzle. Checked here:
 * - the first objective starts the charter from the program's own
 *   classification;
 * - each change is a new version on the hash chain, with an audit row holding
 *   its before, after and reason;
 * - the same content again records nothing;
 * - a program the charter cannot classify, and a locked section, are refused;
 * - the audit trail cannot be rewritten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  charterClassification,
  CharterObjectivesRefusal,
  objectivesBodySchema,
  objectivesContextBlock,
  readProjectObjectives,
  readProjectObjectivesOnExecutor,
  recordProjectObjectives,
} from '../charter-objectives';

const ROOT = path.resolve(__dirname, '../../../..');
const MIGRATIONS = [
  'migrations/0012_project_charter_timeline.sql',
  'migrations/20260629_charter_tables_rebuild.sql',
  'migrations/20260911_charter_audit_immutability.sql',
  'migrations/20260917_project_charters_declared_columns.sql',
];

let pg: PGlite;
let db: ReturnType<typeof drizzle>;
const program = { programType: 'nda', primaryAgency: 'FDA', productName: 'LMN-201' };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 1, 4, 0, tick++));

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec('CREATE TABLE organizations (id integer PRIMARY KEY); CREATE TABLE users (id integer PRIMARY KEY); CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid);');
  for (const f of MIGRATIONS) await pg.exec(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  db = drizzle(pg);
});
afterAll(async () => { await pg.close(); });

const body = (objective: string, reason = 'Taken from protocol LMN-201-301 section 2') => objectivesBodySchema.parse({
  objective,
  successCriteria: 'Primary endpoint met at alpha 0.025, one-sided.',
  sources: [
    { kind: 'protocol', title: 'Protocol LMN-201-301', locator: 'Section 2.1, Primary objective' },
    { kind: 'registry', title: 'ClinicalTrials.gov entry', url: 'https://clinicaltrials.gov/study/NCT00000000' },
  ],
  reason,
});

describe('the project objective of record', () => {
  it('has none before anything is recorded', async () => {
    expect(await readProjectObjectives(db as never, { orgId: 1, projectId: 10 })).toEqual({ charterId: null, current: null, history: [] });
  });

  it("starts the charter from the program's classification and records version 1", async () => {
    const r = await recordProjectObjectives(db as never, { orgId: 1, userId: 7, projectId: 10, program, body: body('Show LMN-201 meets its primary endpoint, and file the NDA.'), now });
    expect(r).toMatchObject({ version: 1, unchanged: false });
    const charter = (await pg.query<{ submission_type: string; regulatory_region: string; product_name: string }>(
      'SELECT submission_type, regulatory_region, product_name FROM project_charters WHERE project_id = 10')).rows;
    expect(charter).toEqual([{ submission_type: 'NDA', regulatory_region: 'FDA', product_name: 'LMN-201' }]);
    const read = await readProjectObjectives(db as never, { orgId: 1, projectId: 10 });
    expect(read.current?.content.objective).toBe('Show LMN-201 meets its primary endpoint, and file the NDA.');
    expect(read.current?.content.sources).toHaveLength(2);
    expect(read.history).toHaveLength(1);
    expect(read.history[0]).toMatchObject({ version: 1, eventType: 'created', actorUserId: 7, reason: 'Taken from protocol LMN-201-301 section 2' });
  });

  it('records a change as the next version on the hash chain, keeping the old one in the history', async () => {
    const before = await readProjectObjectives(db as never, { orgId: 1, projectId: 10 });
    const r = await recordProjectObjectives(db as never, { orgId: 1, userId: 8, projectId: 10, program,
      body: body('Show LMN-201 meets its primary and key secondary endpoints, and file the NDA and the MAA.', 'The sponsor widened the filing'), now });
    expect(r).toMatchObject({ version: 2, unchanged: false });
    const row = (await pg.query<{ version: number; previous_version_hash: string; content_hash: string }>(
      "SELECT version, previous_version_hash, content_hash FROM charter_sections WHERE section_key = 'objectives'")).rows[0];
    expect(row.version).toBe(2);
    expect(row.previous_version_hash).toBe(before.current!.contentHash);
    expect(row.content_hash).not.toBe(before.current!.contentHash);
    const read = await readProjectObjectives(db as never, { orgId: 1, projectId: 10 });
    expect(read.history.map((h) => [h.version, h.reason])).toEqual([[2, 'The sponsor widened the filing'], [1, 'Taken from protocol LMN-201-301 section 2']]);
    expect(read.history[1].content?.objective).toBe('Show LMN-201 meets its primary endpoint, and file the NDA.');
  });

  it('records nothing when the content is the same', async () => {
    const r = await recordProjectObjectives(db as never, { orgId: 1, userId: 8, projectId: 10, program,
      body: body('Show LMN-201 meets its primary and key secondary endpoints, and file the NDA and the MAA.', 'Again'), now });
    expect(r).toMatchObject({ version: 2, unchanged: true });
    expect((await readProjectObjectives(db as never, { orgId: 1, projectId: 10 })).history).toHaveLength(2);
  });

  it('reads the same canonical objective and version history on a caller-owned SQL executor',async()=>{
    const q={query:async(text:string,values?:unknown[])=>pg.query<Record<string,unknown>>(text,values)};
    expect(await readProjectObjectivesOnExecutor(q,{orgId:1,projectId:10})).toEqual(await readProjectObjectives(db as never,{orgId:1,projectId:10}));
    expect(await readProjectObjectivesOnExecutor(q,{orgId:2,projectId:10})).toEqual({charterId:null,current:null,history:[]});
  });

  it('refuses raw executor content whose bytes no longer match the canonical version hash',async()=>{
    const q={query:async(text:string,values?:unknown[])=>pg.query<Record<string,unknown>>(text,values)};
    const saved=(await pg.query<{content:string}>("SELECT content FROM charter_sections WHERE section_key='objectives'")).rows[0].content;
    await pg.query("UPDATE charter_sections SET content=$1 WHERE section_key='objectives'",[saved+' ']);
    try { await expect(readProjectObjectivesOnExecutor(q,{orgId:1,projectId:10})).rejects.toMatchObject({code:'OBJECTIVES_UNREADABLE'}); }
    finally { await pg.query("UPDATE charter_sections SET content=$1 WHERE section_key='objectives'",[saved]); }
  });

  it("keeps another organisation's project apart", async () => {
    expect((await readProjectObjectives(db as never, { orgId: 2, projectId: 10 })).current).toBeNull();
  });

  it('refuses to start a charter for a program it cannot classify, and writes nothing', async () => {
    await expect(recordProjectObjectives(db as never, { orgId: 1, userId: 7, projectId: 11,
      program: { programType: 'other', primaryAgency: 'FDA', productName: 'X' }, body: body('O'), now }))
      .rejects.toMatchObject({ status: 409, code: 'CHARTER_CLASSIFICATION_MISSING' });
    expect((await pg.query('SELECT 1 FROM project_charters WHERE project_id = 11')).rows).toHaveLength(0);
  });

  it('refuses a change to a locked objective', async () => {
    await pg.exec("UPDATE charter_sections SET read_only = true WHERE section_key = 'objectives'");
    await expect(recordProjectObjectives(db as never, { orgId: 1, userId: 7, projectId: 10, program, body: body('Different'), now }))
      .rejects.toBeInstanceOf(CharterObjectivesRefusal);
    await pg.exec("UPDATE charter_sections SET read_only = false WHERE section_key = 'objectives'");
  });

  it('cannot rewrite or remove its audit trail', async () => {
    await expect(pg.exec("UPDATE charter_audit_events SET reason = 'rewritten'")).rejects.toThrow(/append-only/);
    await expect(pg.exec('DELETE FROM charter_audit_events')).rejects.toThrow(/append-only/);
  });

  it('gives AnA the objective, its criteria and its sources', async () => {
    const block = objectivesContextBlock(await readProjectObjectives(db as never, { orgId: 1, projectId: 10 }));
    expect(block).toContain("The project's objective (of record, version 2)");
    expect(block).toContain('Protocol LMN-201-301, Section 2.1, Primary objective [protocol]');
    expect(block).toContain('https://clinicaltrials.gov/study/NCT00000000');
  });

  it('refuses a body with no reason, or a source address that is not http', () => {
    expect(objectivesBodySchema.safeParse({ objective: 'O', sources: [] }).success).toBe(false);
    expect(objectivesBodySchema.safeParse({ objective: 'O', reason: 'r', sources: [{ kind: 'registry', title: 't', url: 'javascript:alert(1)' }] }).success).toBe(false);
  });

  // A recorded section whose stored text is not in the recorded form is an
  // objective that cannot be read, never "no objective": the project page would
  // otherwise say "Not stated yet" and offer to state one, and AnA would hold
  // the work to nothing without knowing a recorded objective was there.
  it('refuses to read a recorded objective whose stored version cannot be read, rather than reading it as none', async () => {
    await recordProjectObjectives(db as never, { orgId: 1, userId: 7, projectId: 12, program, body: body('File the NDA.'), now });
    const charter = (await pg.query<{ id: number }>('SELECT id FROM project_charters WHERE project_id = 12')).rows[0];
    await pg.query("UPDATE charter_sections SET content = 'File the NDA.' WHERE charter_id = $1 AND section_key = 'objectives'", [charter.id]);
    await expect(readProjectObjectives(db as never, { orgId: 1, projectId: 12 }))
      .rejects.toMatchObject({ status: 409, code: 'OBJECTIVES_UNREADABLE' });
  });
});

// Every filing the creator accepts starts a charter (the creator rolls back any
// filing with no document class, so a created project's type is one of
// PROGRAM_TO_DOC_TYPE's). The charter used to know nine types and seven agency
// spellings: a CTA in the EU, a CSR under ICH, an EU MDR file or a Japanese
// certification filing could never state its objective.
describe("the charter's classification of a program", () => {
  it.each([
    ['ind', 'FDA', 'IND', 'FDA'],
    ['ind', 'us', 'IND', 'FDA'],
    ['cta', 'EU', 'CTA', 'EMA'],
    ['cta', 'EMA', 'CTA', 'EMA'],
    ['jnda', 'PMDA', 'JNDA', 'PMDA'],
    ['csr', 'ICH / Global', 'CSR', 'ICH'],
    ['mdr', 'EU / Notified Body', 'MDR', 'EMA'],
    ['cer', 'EU / Notified Body', 'CER', 'EMA'],
    ['ind_amendment', 'FDA', 'IND_AMENDMENT', 'FDA'],
    ['ninsho', 'Registered certification body', 'NINSHO', 'JP_RCB'],
    ['nda', 'Health Canada', 'NDA', 'HealthCanada'],
    ['510k', 'FDA', '510K', 'FDA'],
  ])('%s at %s is a %s charter for %s', (programType, primaryAgency, submissionType, regulatoryRegion) => {
    expect(charterClassification({ programType, primaryAgency, productName: 'X' })).toEqual({ submissionType, regulatoryRegion, productName: 'X' });
  });

  it.each([
    ['biologic', 'FDA', 'application type'],
    ['other', 'FDA', 'application type'],
    ['cta', 'Swissmedic', 'primary agency'],
    ['ind', null, 'primary agency'],
  ])('refuses %s at %s by name: it records no %s the charter knows', (programType, primaryAgency, missing) => {
    expect(() => charterClassification({ programType, primaryAgency, productName: 'X' })).toThrow(new RegExp(missing));
  });
});

// The regulatory strategy (S11, THE_PROGRAM §8 item 1): how the project means to reach its objective. Part of the
// objective of record, so it takes the same versions, reasons and audit rows.
describe("the objective of record carries the project's regulatory strategy", () => {
  const STRATEGY = '505(b)(2) on the reference product, one pivotal study, rolling submission; priority review requested.';
  const stored = async () => (await pg.query<{ content: string; content_hash: string; version: number }>(
    "SELECT s.content, s.content_hash, s.version FROM charter_sections s JOIN project_charters c ON c.id = s.charter_id WHERE c.project_id = 10 AND s.section_key = 'objectives'")).rows[0];

  it('leaves a version recorded without one exactly as it was: no key, the same hash', async () => {
    const before = await stored();
    expect(before.content).not.toContain('strategy');
    const read = await readProjectObjectives(db as never, { orgId: 1, projectId: 10 });
    expect(read.current?.content.strategy).toBeNull();
    // The same words again, still with no strategy, are still the same version.
    const again = await recordProjectObjectives(db as never, { orgId: 1, userId: 8, projectId: 10, program,
      body: body(read.current!.content.objective, 'Again'), now });
    expect(again).toMatchObject({ unchanged: true, contentHash: before.content_hash });
  });

  it('records a stated strategy as the next version, with its reason, and reads it back', async () => {
    const before = await stored();
    const objective = (await readProjectObjectives(db as never, { orgId: 1, projectId: 10 })).current!.content.objective;
    const r = await recordProjectObjectives(db as never, { orgId: 1, userId: 8, projectId: 10, program,
      body: objectivesBodySchema.parse({ ...body(objective, 'Agreed at the pre-NDA meeting'), strategy: `  ${STRATEGY}  ` }), now });
    expect(r).toMatchObject({ version: before.version + 1, unchanged: false });
    const read = await readProjectObjectives(db as never, { orgId: 1, projectId: 10 });
    expect(read.current?.content.strategy).toBe(STRATEGY);
    expect(read.history[0]).toMatchObject({ version: before.version + 1, reason: 'Agreed at the pre-NDA meeting' });
    expect(read.history[0].content?.strategy).toBe(STRATEGY);
    expect(read.history[1].content?.strategy).toBeNull();
  });

  it('gives AnA the strategy with the objective', async () => {
    const block = objectivesContextBlock(await readProjectObjectives(db as never, { orgId: 1, projectId: 10 }));
    expect(block).toContain(`Regulatory strategy:\n${STRATEGY}`);
  });

  it('reads the same strategy on a caller-owned executor, and refuses one too long', async () => {
    const q = { query: async (text: string, values?: unknown[]) => pg.query<Record<string, unknown>>(text, values) };
    expect((await readProjectObjectivesOnExecutor(q, { orgId: 1, projectId: 10 })).current?.content.strategy).toBe(STRATEGY);
    expect(objectivesBodySchema.safeParse({ objective: 'O', reason: 'r', strategy: 'x'.repeat(8001) }).success).toBe(false);
  });
});
