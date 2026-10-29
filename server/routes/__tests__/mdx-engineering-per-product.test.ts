/**
 * Engineering's design history and design changes are the product's (founder
 * decision P-60, D2 / D6, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/engineering-per-product/).
 *
 * GET /api/mdx/engineering/:programId read two panels by organization and
 * reported them `'organization'`, so the Engineering screen hid both
 * (EngineeringSurface.tsx keyedToProject):
 *
 *   - dhf read cerv2_510k_sections, one device kit per organization. It now
 *     reads the project's own document sections: c2c_document_sections under
 *     the c2c_documents whose project_id is the program (a regulatory_programs
 *     key, held to the document's organization by
 *     c2c_documents_project_same_org_fk, 20260926b). An archived document is
 *     not read, and an empty heading is left out by the rule the documents'
 *     readiness counts by (c2c_document_counted_readiness, 20260528).
 *   - ecrs read change_requests, which nothing writes. It now reads the change
 *     register, qms_change_controls, by the project key 20261029l adds.
 *
 * Both are reported 'program'. The ownership answer and the route are real. The
 * database double answers each statement by its own filters, so a read that
 * loses one returns the rows that filter keeps out, and the assertions see them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const ORG = 7;
const OTHER_ORG = 8;
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SIBLING = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Doc = { id: string; org_id: number; project_id: string; title: string; status: string };
type Section = {
  id: number; document_id: string; section_key: string; parent_key: string | null; label: string;
  status: string; mandatory: boolean; version: number;
};
type Change = {
  id: number; change_number: string; title: string; organization_id: number; program_id: string | null;
  status: string; deleted: boolean;
};

const h = vi.hoisted(() => {
  const state = {
    owner: new Map<string, number>(),
    docs: [] as Doc[],
    sections: [] as Section[],
    changes: [] as Change[],
    sectionsDown: null as null | { code: string },
    changesDown: null as null | { code: string },
  };
  const sent: Array<{ sql: string; args: unknown[] }> = [];
  const query = vi.fn(async (sql: string, args: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
    sent.push({ sql, args });
    if (/FROM regulatory_programs/.test(sql)) {
      const [id, org] = args as [string, number];
      return { rows: state.owner.get(id) === org ? [{ id }] : [] };
    }
    if (/FROM c2c_document_sections/.test(sql)) {
      if (state.sectionsDown) throw Object.assign(new Error('relation unreadable'), state.sectionsDown);
      /* Each predicate the read carries, as that read would apply it. */
      const byOrg = /d\.org_id = \$1/.test(sql) ? (args[0] as number) : undefined;
      const byProject = /d\.project_id = \$2/.test(sql) ? (args[1] as string) : undefined;
      const liveOnly = /d\.status <> 'archived'/.test(sql);
      const countedOnly = /held\.parent_key = s\.section_key/.test(sql);
      const docOf = (s: Section) => state.docs.find((d) => d.id === s.document_id) as Doc;
      return {
        rows: state.sections
          .filter((s) => byOrg === undefined || docOf(s).org_id === byOrg)
          .filter((s) => byProject === undefined || docOf(s).project_id === byProject)
          .filter((s) => !liveOnly || docOf(s).status !== 'archived')
          .filter((s) => !countedOnly || s.status !== 'todo'
            || !state.sections.some((c) => c.document_id === s.document_id && c.parent_key === s.section_key))
          .map((s) => ({
            id: s.id, section_key: s.section_key, label: s.label, status: s.status, mandatory: s.mandatory,
            version: s.version, updated_at: null, document_id: s.document_id, document_title: docOf(s).title,
          })),
      };
    }
    if (/FROM qms_change_controls/.test(sql)) {
      if (state.changesDown) throw Object.assign(new Error('column "program_id" does not exist'), state.changesDown);
      const byOrg = /organization_id = \$1/.test(sql) ? (args[0] as number) : undefined;
      const byProgram = /program_id = \$2/.test(sql) ? (args[1] as string) : undefined;
      const liveOnly = /deleted_at IS NULL/.test(sql);
      return {
        rows: state.changes
          .filter((c) => byOrg === undefined || c.organization_id === byOrg)
          .filter((c) => byProgram === undefined || c.program_id === byProgram)
          .filter((c) => !liveOnly || !c.deleted)
          .map((c) => ({
            id: c.id, change_number: c.change_number, title: c.title, change_type: 'specification',
            classification: 'major', risk_level: 'medium', status: c.status, created_at: null,
          })),
      };
    }
    return { rows: [] };
  });
  return { state, sent, query };
});

vi.mock('../../db', () => ({
  pool: { query: (sql: string, args?: unknown[]) => h.query(sql, args) },
  getPool: () => ({ query: (sql: string, args?: unknown[]) => h.query(sql, args) }),
  db: {},
}));

import engineeringRouter from '../mdx-engineering';

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: ORG, role: 'viewer' };
    next();
  });
  a.use('/api/mdx', engineeringRouter);
  return a;
}

const readsOf = (table: string) => h.sent.filter((s) => new RegExp(`FROM ${table}\\b`).test(s.sql));
const get = (program = OWN) => request(app()).get(`/api/mdx/engineering/${program}`);

beforeEach(() => {
  h.sent.length = 0;
  h.state.sectionsDown = null;
  h.state.changesDown = null;
  h.state.owner = new Map([[OWN, ORG], [SIBLING, ORG], [FOREIGN, OTHER_ORG]]);
  h.state.docs = [
    { id: 'doc_own', org_id: ORG, project_id: OWN, title: 'Sensor 510(k)', status: 'draft' },
    { id: 'doc_own_archived', org_id: ORG, project_id: OWN, title: 'Withdrawn 510(k)', status: 'archived' },
    { id: 'doc_sib', org_id: ORG, project_id: SIBLING, title: 'Sibling 510(k)', status: 'draft' },
    { id: 'doc_for', org_id: OTHER_ORG, project_id: FOREIGN, title: 'Foreign 510(k)', status: 'draft' },
    /* A document of another organization naming this program, as a row written
       before the same-organization key (NOT VALID) could be. */
    { id: 'doc_cross', org_id: OTHER_ORG, project_id: OWN, title: 'Cross-tenant 510(k)', status: 'draft' },
  ];
  /* [id, document, key, status, mandatory, parent] */
  const sections: Array<[number, string, string, string, boolean, string | null]> = [
    [1, 'doc_own', '1', 'approved', true, null],
    [2, 'doc_own', '2', 'drafted', true, null],
    [3, 'doc_own', '3', 'todo', true, null],
    [4, 'doc_own', '4', 'todo', true, null], // an empty heading: 4.1 is filed under it
    [5, 'doc_own', '4.1', 'review', false, '4'],
    [6, 'doc_own', '9', 'todo', false, null],
    [7, 'doc_own_archived', '1', 'approved', true, null],
    [8, 'doc_sib', '1', 'approved', true, null],
    [9, 'doc_for', '1', 'approved', true, null],
    [10, 'doc_cross', '1', 'approved', true, null],
  ];
  h.state.sections = sections.map(([id, document_id, section_key, status, mandatory, parent_key]) =>
    ({ id, document_id, section_key, parent_key, label: `Section ${section_key}`, status, mandatory, version: 2 }));
  /* [id, number, organization, program, status, deleted] */
  const changes: Array<[number, string, number, string | null, string, boolean]> = [
    [1, 'CC-OWN-1', ORG, OWN, 'proposed', false],
    [2, 'CC-OWN-2', ORG, OWN, 'under_assessment', false],
    [3, 'CC-OWN-3', ORG, OWN, 'in_implementation', false],
    [4, 'CC-OWN-4', ORG, OWN, 'closed', false],
    [5, 'CC-OWN-DEL', ORG, OWN, 'proposed', true],
    [6, 'CC-SIB-1', ORG, SIBLING, 'proposed', false],
    [7, 'CC-NONE-1', ORG, null, 'proposed', false],
    [8, 'CC-FOR-1', OTHER_ORG, FOREIGN, 'proposed', false],
  ];
  h.state.changes = changes.map(([id, change_number, organization_id, program_id, status, deleted]) =>
    ({ id, change_number, title: `Change ${change_number}`, organization_id, program_id, status, deleted }));
});

describe("GET /api/mdx/engineering/:programId — the design history is the project's document sections", () => {
  it("reads the project's own document sections, after the ownership check, and reports the panel keyed to the project", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.meta.scopes.dhf).toBe('program');
    expect(res.body.data.dhf.map((d: { num: string }) => d.num)).toEqual(['1', '2', '3', '4.1', '9']);
    const [read] = readsOf('c2c_document_sections');
    expect(read.args).toEqual([ORG, OWN]);
    const order = h.sent.map((x) => (/regulatory_programs/.test(x.sql) ? 'ownership' : /c2c_document_sections/.test(x.sql) ? 'dhf' : 'other'));
    expect(order.indexOf('ownership')).toBeLessThan(order.indexOf('dhf'));
  });

  it("never shows a sibling project's sections, another organization's, an archived document's, or the organization's kit", async () => {
    const res = await get();
    const docs = new Set(res.body.data.dhf.map((d: { documentId: string }) => d.documentId));
    expect([...docs]).toEqual(['doc_own']);
    // The organization's one-kit store is not read under a project at all.
    expect(readsOf('cerv2_510k_sections')).toEqual([]);
  });

  it("names each section's document, its version and its status in the screen's vocabulary", async () => {
    const res = await get();
    const byNum = Object.fromEntries(res.body.data.dhf.map((d: { num: string }) => [d.num, d]));
    expect(byNum['1']).toMatchObject({ label: 'Section 1', ver: 'v2', status: 'ready', document: 'Sensor 510(k)' });
    expect(byNum['1'].meta).toMatch(/Sensor 510\(k\)/);
    expect(byNum['2'].status).toBe('draft');
    // A mandatory section with nothing written blocks its document; an optional one does not.
    expect(byNum['3'].status).toBe('blocked');
    expect(byNum['9'].status).toBe('draft');
    expect(byNum['4.1'].status).toBe('review');
  });

  it('leaves out an empty heading, as the documents\' readiness does, so it is not reported as a blocker', async () => {
    const res = await get();
    expect(res.body.data.dhf.map((d: { num: string }) => d.num)).not.toContain('4');
  });

  it("counts the summary's figure over the project's mandatory sections only", async () => {
    const res = await get();
    // Mandatory and counted: 1 (approved), 2 (drafted), 3 (todo). One of three.
    expect(res.body.data.summary.dhfCompletion).toBe(33);
  });

  it('a project with no sections reads an empty panel, still keyed to it', async () => {
    h.state.sections = h.state.sections.filter((x) => x.document_id !== 'doc_sib');
    const res = await get(SIBLING);
    expect(res.body.data.dhf).toEqual([]);
    expect(res.body.meta.scopes.dhf).toBe('program');
    expect(res.body.meta.unavailable).not.toContain('dhf');
  });

  it('a failed read is a failed panel, not an empty design history', async () => {
    h.state.sectionsDown = { code: '42501' };
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.data.dhf).toEqual([]);
    expect(res.body.meta.unavailable).toEqual(expect.arrayContaining(['dhf', 'summary']));
  });
});

describe("GET /api/mdx/engineering/:programId — change requests are the project's change controls", () => {
  it("reads the project's own change controls, after the ownership check, and reports the panel keyed to the project", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.meta.scopes.ecrs).toBe('program');
    expect(res.body.data.ecrs.map((e: { id: string }) => e.id)).toEqual(['CC-OWN-1', 'CC-OWN-2', 'CC-OWN-3', 'CC-OWN-4']);
    const [read] = readsOf('qms_change_controls');
    expect(read.args).toEqual([ORG, OWN]);
    const order = h.sent.map((x) => (/regulatory_programs/.test(x.sql) ? 'ownership' : /qms_change_controls/.test(x.sql) ? 'ecrs' : 'other'));
    expect(order.indexOf('ownership')).toBeLessThan(order.indexOf('ecrs'));
  });

  it("never shows a sibling project's change, the organization's unscoped one, another organization's or a deleted one", async () => {
    const ids = (await get()).body.data.ecrs.map((e: { id: string }) => e.id);
    for (const other of ['CC-SIB-1', 'CC-NONE-1', 'CC-FOR-1', 'CC-OWN-DEL']) expect(ids).not.toContain(other);
  });

  it('no longer reads change_requests, which nothing writes', async () => {
    await get();
    expect(readsOf('change_requests')).toEqual([]);
  });

  it("maps the register's lifecycle onto the screen's four states, and counts the undecided ones as open", async () => {
    const res = await get();
    expect(res.body.data.ecrs.map((e: { state: string }) => e.state)).toEqual(['open', 'review', 'approved', 'closed']);
    expect(res.body.data.ecrs[0]).toMatchObject({ title: 'Change CC-OWN-1', impact: 'specification' });
    expect(res.body.data.summary.openEcrs).toBe(2);
  });

  it('a store without the project key is a failed panel, not an empty one', async () => {
    h.state.changesDown = { code: '42703' };
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.data.ecrs).toEqual([]);
    expect(res.body.meta.unavailable).toEqual(expect.arrayContaining(['ecrs', 'summary']));
  });
});

describe('GET /api/mdx/engineering/:programId — refusal and scope report', () => {
  it("another organization's project is refused before either panel is read", async () => {
    const res = await get(FOREIGN);
    expect(res.status).toBe(404);
    expect(readsOf('c2c_document_sections')).toEqual([]);
    expect(readsOf('qms_change_controls')).toEqual([]);
  });

  it("reports every panel as the project's", async () => {
    const res = await get();
    expect(res.body.meta.scopes).toEqual({
      risks: 'program', trace: 'program', issues: 'program', documents: 'program', dhf: 'program', ecrs: 'program',
    });
  });
});
