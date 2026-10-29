/**
 * Engineering's non-conformances and documents are the open project's (D2 / D6,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/engineering-panels-keyed/).
 *
 * GET /api/mdx/engineering/:programId read qms_nonconforming_products and
 * concept2cure_artifacts by organization only and reported both panels
 * `'organization'`, so the Engineering screen hid them behind "Shown once this
 * screen reads this project's records" (EngineeringSurface.tsx keyedToProject).
 *
 *   - issues: 20261029d gives qms_nonconforming_products a program key. The
 *     panel reads the admitted project's records only.
 *   - documents: an artifact already names its project through the bridge the
 *     device Vault reads (concept2cure_artifacts.project_id → projects.id, and
 *     projects.regulatory_program_id; server/routes/mdx-vault.ts). The panel
 *     reads through it; no column is added. The IEC 62304 rows it splices in
 *     were already read by project.
 *
 * DHF (cerv2_510k_sections) and change requests (change_requests) stay
 * reported as the organization's: see the route header for why each cannot be
 * narrowed honestly.
 *
 * The ownership answer and the route are real. The database double answers
 * each statement by its own filters, so a read that loses its project filter
 * returns the other projects' rows and the assertions see them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const ORG = 7;
const OTHER_ORG = 8;
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SIBLING = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Nc = { id: number; nc_number: string; organization_id: number; program_id: string | null; disposition: string | null };
type Project = { id: number; organization_id: number; regulatory_program_id: string | null };
type Artifact = { id: number; title: string; organization_id: number; project_id: number };

const h = vi.hoisted(() => {
  const state = {
    owner: new Map<string, number>(),
    ncs: [] as Nc[],
    projects: [] as Project[],
    artifacts: [] as Artifact[],
    ncDown: null as null | { code: string },
  };
  const sent: Array<{ sql: string; args: unknown[] }> = [];
  const query = vi.fn(async (sql: string, args: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
    sent.push({ sql, args });
    if (/FROM regulatory_programs/.test(sql)) {
      const [id, org] = args as [string, number];
      return { rows: state.owner.get(id) === org ? [{ id }] : [] };
    }
    if (/FROM qms_nonconforming_products/.test(sql)) {
      if (state.ncDown) throw Object.assign(new Error('column "program_id" does not exist'), state.ncDown);
      const org = args[0] as number;
      const byProgram = /program_id = \$2/.test(sql) ? (args[1] as string) : undefined;
      return {
        rows: state.ncs
          .filter((n) => n.organization_id === org && (byProgram === undefined || n.program_id === byProgram))
          .map((n) => ({ id: n.id, nc_number: n.nc_number, description: n.nc_number, disposition: n.disposition, capa_linked: false, detected_at: null, device_name: null })),
      };
    }
    if (/FROM concept2cure_artifacts/.test(sql)) {
      const org = args[0] as number;
      /* The bridge, as the device Vault reads it, predicate by predicate: the
         artifact's project, that project's organization repeated, and its
         anchor to the program. A read that drops one is answered as that
         read would be. */
      const joined = /p\.id = a\.project_id/.test(sql) && /p\.regulatory_program_id = \$2/.test(sql);
      const orgRepeated = /p\.organization_id = a\.organization_id/.test(sql);
      const programId = joined ? (args[1] as string) : undefined;
      return {
        rows: state.artifacts
          .filter((a) => a.organization_id === org)
          .filter((a) => programId === undefined || state.projects.some(
            (p) => p.id === a.project_id && p.regulatory_program_id === programId
              && (!orgRepeated || p.organization_id === a.organization_id),
          ))
          .map((a) => ({ id: a.id, title: a.title, ctd_section: '3.2.P', type: 'design', status: 'draft', version: 1, updated_at: null })),
      };
    }
    if (/FROM software_lifecycle_items/.test(sql)) {
      return { rows: args[1] === OWN ? [{ id: 1, title: 'SRS', identifier: 'SRS-1', item_kind: 'srs', doc_level: 'basic', status: 'draft', updated_at: null }] : [] };
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

const readsOf = (table: string) => h.sent.filter((s) => new RegExp(`FROM ${table}`).test(s.sql));

beforeEach(() => {
  h.sent.length = 0;
  h.state.ncDown = null;
  h.state.owner = new Map([[OWN, ORG], [SIBLING, ORG], [FOREIGN, OTHER_ORG]]);
  h.state.ncs = [
    { id: 1, nc_number: 'NC-OWN-1', organization_id: ORG, program_id: OWN, disposition: null },
    { id: 2, nc_number: 'NC-OWN-2', organization_id: ORG, program_id: OWN, disposition: 'scrap' },
    { id: 3, nc_number: 'NC-SIB-1', organization_id: ORG, program_id: SIBLING, disposition: null },
    { id: 4, nc_number: 'NC-NONE-1', organization_id: ORG, program_id: null, disposition: null },
    { id: 5, nc_number: 'NC-FOR-1', organization_id: OTHER_ORG, program_id: FOREIGN, disposition: null },
  ];
  h.state.projects = [
    { id: 10, organization_id: ORG, regulatory_program_id: OWN },
    { id: 11, organization_id: ORG, regulatory_program_id: SIBLING },
    { id: 12, organization_id: ORG, regulatory_program_id: null },
    /* A legacy anchor written before the same-organization key: another
       organization's project row that names this program. */
    { id: 13, organization_id: OTHER_ORG, regulatory_program_id: OWN },
  ];
  h.state.artifacts = [
    { id: 100, title: 'Own design spec', organization_id: ORG, project_id: 10 },
    { id: 101, title: 'Sibling design spec', organization_id: ORG, project_id: 11 },
    { id: 102, title: 'Unanchored design spec', organization_id: ORG, project_id: 12 },
    { id: 103, title: 'Foreign design spec', organization_id: OTHER_ORG, project_id: 13 },
    /* This organization's artifact on another organization's project row that
       names this program: the bridge must not pull it in. */
    { id: 104, title: 'Cross-tenant anchored spec', organization_id: ORG, project_id: 13 },
  ];
});

describe('GET /api/mdx/engineering/:programId — non-conformances', () => {
  it("reads the project's own non-conformances, after the ownership check, and reports the panel keyed to the project", async () => {
    const res = await request(app()).get(`/api/mdx/engineering/${OWN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.issues.map((i: { id: string }) => i.id)).toEqual(['NC-OWN-1', 'NC-OWN-2']);
    expect(res.body.meta.scopes.issues).toBe('program');
    const [read] = readsOf('qms_nonconforming_products');
    expect(read.sql).toMatch(/organization_id = \$1 AND program_id = \$2/);
    expect(read.args).toEqual([ORG, OWN]);
    const order = h.sent.map((s) => (/regulatory_programs/.test(s.sql) ? 'ownership' : /qms_nonconforming_products/.test(s.sql) ? 'issues' : 'other'));
    expect(order.indexOf('ownership')).toBeLessThan(order.indexOf('issues'));
  });

  it("never shows another project's non-conformances, the organization's unscoped ones, or another organization's", async () => {
    const res = await request(app()).get(`/api/mdx/engineering/${OWN}`);
    const ids = res.body.data.issues.map((i: { id: string }) => i.id);
    expect(ids).not.toContain('NC-SIB-1');
    expect(ids).not.toContain('NC-NONE-1');
    expect(ids).not.toContain('NC-FOR-1');
  });

  it("the open-issues card counts the project's records only", async () => {
    const res = await request(app()).get(`/api/mdx/engineering/${OWN}`);
    // NC-OWN-1 is undispositioned (open); NC-OWN-2 was scrapped.
    expect(res.body.data.summary.openIssues).toBe(1);
  });

  it('a project with none of its own reads an empty panel, still keyed to it', async () => {
    h.state.ncs = h.state.ncs.filter((n) => n.program_id !== SIBLING);
    const res = await request(app()).get(`/api/mdx/engineering/${SIBLING}`);
    expect(res.body.data.issues).toEqual([]);
    expect(res.body.meta.scopes.issues).toBe('program');
    expect(res.body.meta.unavailable).not.toContain('issues');
  });

  it('a store without the program key is a failed panel, not an empty one', async () => {
    h.state.ncDown = { code: '42703' };
    const res = await request(app()).get(`/api/mdx/engineering/${OWN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.issues).toEqual([]);
    expect(res.body.meta.unavailable).toEqual(expect.arrayContaining(['issues', 'summary']));
  });
});

describe('GET /api/mdx/engineering/:programId — documents', () => {
  it("reads the artifacts of the project's own anchored records, plus its IEC 62304 items, and reports the panel keyed to the project", async () => {
    const res = await request(app()).get(`/api/mdx/engineering/${OWN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((d: { id: string }) => d.id)).toEqual(['art-100', 'swl-1']);
    expect(res.body.meta.scopes.documents).toBe('program');
    const [read] = readsOf('concept2cure_artifacts');
    expect(read.args).toEqual([ORG, OWN]);
    expect(read.sql).toMatch(/a\.organization_id = \$1/);
  });

  it("never shows a sibling project's artifacts, an unanchored project's, or a mis-anchored foreign project's", async () => {
    const res = await request(app()).get(`/api/mdx/engineering/${OWN}`);
    const titles = res.body.data.documents.map((d: { title: string }) => d.title);
    expect(titles).not.toContain('Sibling design spec');
    expect(titles).not.toContain('Unanchored design spec');
    expect(titles).not.toContain('Foreign design spec');
    expect(titles).not.toContain('Cross-tenant anchored spec');
  });
});

describe('GET /api/mdx/engineering/:programId — refusal and scope report', () => {
  it("another organization's project is refused before any panel is read", async () => {
    const res = await request(app()).get(`/api/mdx/engineering/${FOREIGN}`);
    expect(res.status).toBe(404);
    expect(readsOf('qms_nonconforming_products')).toEqual([]);
    expect(readsOf('concept2cure_artifacts')).toEqual([]);
  });

  it('reports the DHF and change requests as the organization\'s, and every other panel as the project\'s', async () => {
    const res = await request(app()).get(`/api/mdx/engineering/${OWN}`);
    expect(res.body.meta.scopes).toEqual({
      risks: 'program', trace: 'program', issues: 'program', documents: 'program',
      dhf: 'organization', ecrs: 'organization',
    });
  });
});
