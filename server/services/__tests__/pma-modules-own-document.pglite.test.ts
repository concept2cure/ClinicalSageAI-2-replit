/**
 * The PMA screen's modules are this project's PMA document, scored by the PMA
 * mapper (MDX journey M18, `.design/client-journey/MDX_JOURNEY_2026-11-01.md`).
 *
 * Found walking the PMA journey in the running app, 2026-11-02: with section
 * B.2 written and saved into the project's PMA filing, and the PMA package
 * export reading it (200, `deviceContentSource: governed_program`), the PMA
 * screen's "PMA modules" read "0 documents total", each of six cards "draft",
 * "0 documents". The Plan door "See which PMA modules are written" opens that
 * screen.
 *
 * getPmaModules grouped `cerv2_510k_sections`, the legacy 510(k) store, which
 * has no project link, by the kit's six-card taxonomy: every PMA project in an
 * organization showed the organization's 510(k) sections, and none showed its
 * own document. The platform already scores a PMA's modules deterministically:
 * `pathway-engines/pma/pma-mapper.ts` (21 CFR 814), behind the assembly verdict
 * and the "Original PMA" readiness check. The cards now read that mapper over
 * this project's PMA document, so the screen and the verdict say the same thing.
 *
 * Tables on PGlite: the program from its drizzle definition, the governed
 * document as the filing-exit tests build it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import { cerv2510kSections } from '../../../shared/schema';

const holder = vi.hoisted(() => ({ pg: null as any, db: null as any }));
const dbDouble = vi.hoisted(() => ({
  get db() { return holder.db; },
  pool: { query: async (text: string, params?: unknown[]) => holder.pg.query(text, params) },
  getDb: () => holder.db,
  getPool: () => ({ query: async (text: string, params?: unknown[]) => holder.pg.query(text, params) }),
}));
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);

import { getPmaModules } from '../regulatory-programs.service';
import { mapToPma } from '../pathway-engines/pma/pma-mapper';
import { governedSectionsToDeviceSections, sectionsToLeaves } from '../pathway-engines/estar/estar-content-leaves';

function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

const ORG = 1;
const OTHER_ORG = 2;
const WRITTEN = '11111111-1111-4111-8111-111111111111';   // B.2 drafted, G.1 approved
const BLANK = '22222222-2222-4222-8222-222222222222';     // its PMA outline, nothing written
const NO_PMA = '33333333-3333-4333-8333-333333333333';    // a project with a 510(k) document only
const ELSEWHERE = '44444444-4444-4444-8444-444444444444'; // another organization's PMA project

const BODY = 'The Corvant valve is a bovine pericardial transcatheter aortic valve with a balloon-expandable frame.';
const OUTLINE: Array<[key: string, label: string]> = [
  ['A.3', 'Cover letter and application type'],
  ['B.2', 'Device description summary'],
  ['C.1', 'Functional components, properties and principles of operation'],
  ['G.1', 'Study protocols and amendments'],
  ['G.5', 'Statistical analysis plan and results'],
  ['H.1', 'Instructions for use / physician labeling'],
];

async function pmaDocument(id: string, org: number, project: string, written: Record<string, { status: string; text: string }>) {
  await holder.pg.query(`INSERT INTO c2c_documents (id, org_id, project_id, doc_type) VALUES ($1, $2, $3, 'pma')`, [id, org, project]);
  let order = 0;
  for (const [key, label] of OUTLINE) {
    const w = written[key];
    await holder.pg.query(
      `INSERT INTO c2c_document_sections (document_id, section_key, label, status, content, mandatory, path_order)
       VALUES ($1, $2, $3, $4, $5::jsonb, true, $6)`,
      [id, key, label, w?.status ?? 'todo', JSON.stringify(w ? { text: w.text } : {}), order++],
    );
  }
}

beforeAll(async () => {
  holder.pg = new PGlite();
  holder.db = drizzle(holder.pg);
  for (const t of [regulatoryPrograms, cerv2510kSections]) await holder.pg.exec(ddlOf(t as PgTable));
  await holder.pg.exec(`
    CREATE TABLE c2c_documents (id text PRIMARY KEY, org_id int NOT NULL, project_id text, doc_type text,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE c2c_document_sections (id bigserial PRIMARY KEY, document_id text REFERENCES c2c_documents(id),
      section_key text NOT NULL, label text, status text, content jsonb, mandatory boolean, path_order int);
  `);
  for (const [id, org] of [[WRITTEN, ORG], [BLANK, ORG], [NO_PMA, ORG], [ELSEWHERE, OTHER_ORG]] as const) {
    await holder.pg.query(
      `INSERT INTO regulatory_programs (id, organization_id, name, program_type, status, phase)
       VALUES ($1, $2, 'P', 'device', 'active', 'planning')`,
      [id, org],
    );
  }
  // The organization's legacy 510(k) sections: no project's in particular, all
  // validated, keyed and categorised as every one of the kit's six cards matched.
  const legacy: Array<[key: string, category: string]> = [
    ['preclinical-bench', 'testing'], ['clinical-pivotal', 'clinical'], ['manufacturing-process', 'device'],
    ['labeling-ifu', 'additional'], ['stat-sap', 'statistics'], ['financial-disclosure', 'administrative'],
  ];
  for (const [i, [key, category]] of legacy.entries()) {
    await holder.pg.query(
      `INSERT INTO cerv2_510k_sections (id, organization_id, section_number, section_title, section_key, category, display_order, status, content)
       VALUES ($1, $2, $3, 'S', $4, $5, $1, 'validated', $6)`,
      [i + 1, ORG, `${i + 1}.0`, key, category, BODY],
    );
  }
  await pmaDocument('doc-written', ORG, WRITTEN, {
    'B.2': { status: 'drafted', text: BODY },
    'G.1': { status: 'approved', text: BODY },
  });
  await pmaDocument('doc-blank', ORG, BLANK, {});
  await holder.pg.query(`INSERT INTO c2c_documents (id, org_id, project_id, doc_type) VALUES ('doc-k510', $1, $2, 'k510')`, [ORG, NO_PMA]);
  await pmaDocument('doc-elsewhere', OTHER_ORG, ELSEWHERE, { 'H.1': { status: 'approved', text: BODY } });
}, 60_000);

afterAll(async () => { await holder.pg?.close(); });

type Modules = NonNullable<Awaited<ReturnType<typeof getPmaModules>>>;
const byId = (ms: Modules) => Object.fromEntries(ms.map((m) => [m.id, m]));

describe("the PMA screen's modules", () => {
  it("are this project's PMA document, scored by the PMA mapper's 21 CFR 814 modules", async () => {
    const mods = await getPmaModules(ORG, WRITTEN);
    expect(mods?.map((m) => m.id)).toEqual([
      'admin-regulatory', 'device-description', 'manufacturing', 'nonclinical', 'clinical',
      'labeling', 'ssed-summary', 'statistical-analysis', 'post-approval-study', 'references',
    ]);
    const m = byId(mods!);
    // G.1 is written and approved: the clinical module is present, as the verdict counts it.
    expect(m.clinical).toMatchObject({ status: 'present', finished: ['G.1'], written: [], required: true, module: 5 });
    // B.2 is written but a draft: written, not present.
    expect(m['ssed-summary']).toMatchObject({ status: 'written', finished: [], written: ['B.2'] });
    // Nothing written under H: the organization's validated 510(k) labeling row is not this PMA's.
    expect(m.labeling).toMatchObject({ status: 'not_started', finished: [], written: [] });
    expect(m['statistical-analysis']).toMatchObject({ status: 'not_started' });
    expect(m['post-approval-study']).toMatchObject({ required: false });
  });

  it('say the same as the assembly verdict over the same document', async () => {
    const rows = (await holder.pg.query(
      `SELECT id, section_key, label, status, content, mandatory FROM c2c_document_sections
        WHERE document_id = 'doc-written' ORDER BY path_order`,
    )).rows;
    const verdict = mapToPma({ leaves: sectionsToLeaves(governedSectionsToDeviceSections(rows)), submissionType: 'original' });
    const mods = byId((await getPmaModules(ORG, WRITTEN))!);
    for (const slot of verdict.sections) {
      expect(mods[slot.id].status === 'present', slot.id).toBe(slot.present);
      expect(mods[slot.id].required, slot.id).toBe(slot.required);
    }
  });

  it("show a blank PMA as not started, whatever the organization's 510(k) sections say", async () => {
    const mods = await getPmaModules(ORG, BLANK);
    expect(mods).toHaveLength(10);
    expect(mods!.every((m) => m.status === 'not_started' && m.finished.length === 0 && m.written.length === 0)).toBe(true);
  });

  it('are none for a project with no PMA document', async () => {
    expect(await getPmaModules(ORG, NO_PMA)).toEqual([]);
  });

  it("are not another organization's", async () => {
    expect(await getPmaModules(ORG, ELSEWHERE)).toBeNull();
    expect(byId((await getPmaModules(OTHER_ORG, ELSEWHERE))!).labeling).toMatchObject({ status: 'present', finished: ['H.1'] });
  });
});
