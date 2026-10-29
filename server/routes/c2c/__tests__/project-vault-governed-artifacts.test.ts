/**
 * GET /api/c2c/project-vault/:id — the "Governed artifacts" branch (fold F3
 * slice A, D2, 2026-10-29).
 *
 * ── What was missing ─────────────────────────────────────────────────────────
 * The project Vault listed concept2cure_artifacts only where ctd_section
 * LIKE '3.%' (the "Module 3 (CMC)" branch), with no signature, review, source,
 * author or hash on the leaf. A clinical overview AnA drafted for the project
 * (§2.5), a cover letter (§1.x) or an imported file with no CTD section was in
 * the registry and nowhere in the project's Vault: it could be found only in
 * the device vault (/api/mdx/vault) or the organization-wide Artifacts center.
 *
 * Now the read returns every non-archived artifact of the project as one
 * branch, grouped by CTD module, each leaf carrying what the Artifacts center
 * computes for it (kind, format, model, signed on the current version in four
 * states, cited-source count, human review), plus status, version, author,
 * the recorded hash and the origin the row records. The origin is never
 * guessed: a row the CMC composer wrote says so, and a row with no recorded
 * origin says nothing (Rule 2: governed content is never attributed to a
 * model).
 *
 * The query is proven on PostgreSQL in project-vault-governed-artifacts.pglite.test.ts.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../../db', () => ({
  pool: { query: (...args: unknown[]) => queryMock(...args) },
}));

const resolveSpineMock = vi.fn();
vi.mock('../../../services/cmc/resolve-cmc-artifact-project.js', () => ({
  resolveCmcArtifactProject: (...args: unknown[]) => resolveSpineMock(...args),
}));

vi.mock('../../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});
import createProjectVaultRoutes from '../project-vault';
import { clearSeats, seatMember, seatProgram } from './support/current-member';

const PROJECT = '11111111-2222-3333-4444-555555555555';
const USER = 41;

function app(orgId = 7) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.organizationId = orgId;
    req.userId = USER;
    req.user = { id: USER };
    req.dbClient = { query: (...args: unknown[]) => queryMock(...args) };
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

/** One registry row as the shared read projects it. */
function artifact(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    artifact_id: 'artifact_1',
    title: 'Clinical overview',
    type: 'regulatory_document',
    category: 'document',
    ctd_section: '2.5',
    status: 'draft',
    version: 5,
    updated_at: null,
    project_id: 42,
    content_hash: 'c'.repeat(64),
    kind_source: 'Clinical Overview',
    content_bytes: 2048,
    model: null,
    compiled_from: null,
    recorded_source: 'ana_document_studio',
    program: 'BX-204',
    author_name: 'R. Writer',
    is_signed: false,
    is_reviewed: false,
    source_count: 0,
    signed_version: null,
    total_rows: 1,
    ...over,
  };
}

/** project → documents (none) → artifact registry → uploads → upload counts → data room. */
function seed(artifactRows: unknown[] | Error) {
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: PROJECT, name: 'BX-204', product_type: 'drug' }] })
    .mockResolvedValueOnce({ rows: [] });
  if (artifactRows instanceof Error) queryMock.mockRejectedValueOnce(artifactRows);
  else queryMock.mockResolvedValueOnce({ rows: artifactRows });
  queryMock
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ total: 0, unfiled: 0 }] })
    .mockResolvedValueOnce({ rows: [] });
}

const branch = (body: any) => (body?.data?.tree ?? []).find((f: any) => f.id === 'artifacts');
const registryCall = () => queryMock.mock.calls.find((c) => String(c[0]).includes('FROM concept2cure_artifacts a'));

beforeEach(() => {
  clearSeats();
  seatMember(7, USER, 'member');
  seatProgram(7, PROJECT);
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  resolveSpineMock.mockReset();
  resolveSpineMock.mockResolvedValue({ state: 'linked', artifactProjectId: 42, via: 'program-anchor' });
});

describe('GET /api/c2c/project-vault/:id — every artifact of the project, across all CTD sections', () => {
  it('lists Module 1, 2, 3 and 5 artifacts and those with no CTD section, grouped by CTD module', async () => {
    seed([
      artifact({ id: 1, title: 'Clinical overview', ctd_section: '2.5' }),
      artifact({ id: 2, title: 'Cover letter', ctd_section: '1.2' }),
      artifact({ id: 3, title: 'Module 3 — General Information', ctd_section: '3.2.S.1', compiled_from: 'module3-os', recorded_source: null }),
      artifact({ id: 4, title: 'Module 3 — Stability (Drug Product)', ctd_section: '3.2.P.8', compiled_from: 'module3-os', recorded_source: null }),
      artifact({ id: 5, title: 'Study report synopsis', ctd_section: '5.3.5.1' }),
      artifact({ id: 6, title: 'device-file.pdf', ctd_section: null, type: 'imported', kind_source: 'imported', recorded_source: null }),
    ].map((r) => ({ ...r, total_rows: 6 })));

    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const b = branch(res.body);
    expect(b, 'the branch is in the tree').toBeTruthy();
    expect(b.label).toBe('Governed artifacts');
    expect(b.children.map((g: any) => g.label)).toEqual(['Module 1', 'Module 2', 'Module 3', 'Module 5', 'No CTD section']);
    const m3 = b.children.find((g: any) => g.label === 'Module 3');
    // Section order, not text order: drug substance before drug product.
    expect(m3.children.map((d: any) => d.num)).toEqual(['3.2.S.1', '3.2.P.8']);
    const none = b.children.find((g: any) => g.label === 'No CTD section');
    expect(none.children[0]).toMatchObject({ title: 'device-file.pdf', num: '—' });
    // The §3-only branch is gone: §3 artifacts are listed once, here.
    expect((res.body.data.tree as any[]).some((f) => f.id === 'm3-cmc')).toBe(false);
  });

  it('each leaf carries kind, format, model, status, version, author, recorded hash, signature, sources, review and origin', async () => {
    seed([
      artifact({
        id: 9, title: 'Clinical overview', ctd_section: '2.5', status: 'review', version: 5,
        model: 'claude-opus-4', is_signed: true, signed_version: 3, is_reviewed: true, source_count: 4,
      }),
    ]);
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);
    const leaf = branch(res.body).children[0].children[0];
    expect(leaf).toMatchObject({
      id: 'art-9',
      num: '2.5',
      title: 'Clinical overview',
      status: 'review',
      ver: 'v5',
      owner: 'R. Writer',
      src: 'artifact',
    });
    expect(leaf.artifact).toEqual({
      artifactId: 'artifact_1',
      kind: 'Clinical Overview',
      format: 'docx',
      model: 'claude-opus-4',
      origin: 'ana',
      author: 'R. Writer',
      contentHash: 'c'.repeat(64),
      ctdSection: '2.5',
      signature: 'stale',
      signedVersion: 3,
      reviewed: true,
      sourceCount: 4,
    });
    // The recorded hash is not offered as an upload's SHA-256 of stored bytes:
    // the composer and the importer record theirs over other inputs.
    expect(leaf.hash).toBeUndefined();
  });

  it('states the signature in the four states the Artifacts center uses', async () => {
    seed([
      artifact({ id: 1, title: 'A unsigned', ctd_section: '2.1', is_signed: false, signed_version: null, version: 2 }),
      artifact({ id: 2, title: 'B current', ctd_section: '2.2', is_signed: true, signed_version: 2, version: 2 }),
      artifact({ id: 3, title: 'C stale', ctd_section: '2.3', is_signed: true, signed_version: 1, version: 2 }),
      artifact({ id: 4, title: 'D unknown', ctd_section: '2.4', is_signed: true, signed_version: null, version: 2 }),
    ].map((r) => ({ ...r, total_rows: 4 })));
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    const leaves = branch(res.body).children[0].children;
    expect(leaves.map((l: any) => [l.title, l.artifact.signature])).toEqual([
      ['A unsigned', 'none'],
      ['B current', 'current'],
      ['C stale', 'stale'],
      ['D unknown', 'unknown'],
    ]);
  });

});

describe('GET /api/c2c/project-vault/:id — origin, breakdown and binding of the governed artifacts', () => {
  it('names an origin only where the row records one', async () => {
    seed([
      artifact({ id: 1, title: 'Studio draft', ctd_section: '2.1', recorded_source: 'ana_document_studio' }),
      artifact({ id: 2, title: 'Composed', ctd_section: '3.2.S.1', compiled_from: 'module3-os', recorded_source: null }),
      artifact({ id: 3, title: 'Imported', ctd_section: null, type: 'imported', recorded_source: null }),
      artifact({ id: 4, title: 'Extracted', ctd_section: null, category: 'extracted', recorded_source: null }),
      artifact({ id: 5, title: 'Unrecorded', ctd_section: '2.2', recorded_source: 'compute', model: null }),
    ].map((r) => ({ ...r, total_rows: 5 })));
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    const all = branch(res.body).children.flatMap((g: any) => g.children);
    const origin = (t: string) => all.find((l: any) => l.title === t).artifact.origin;
    expect(origin('Studio draft')).toBe('ana');
    expect(origin('Composed')).toBe('cmc-composer');
    expect(origin('Imported')).toBe('import');
    expect(origin('Extracted')).toBe('extraction');
    expect(origin('Unrecorded')).toBeNull();
  });

  it('reports the status breakdown and the count, and the count joins documentCount', async () => {
    seed([
      artifact({ id: 1, ctd_section: '2.1', status: 'draft' }),
      artifact({ id: 2, ctd_section: '2.2', status: 'draft', is_signed: true, signed_version: 5 }),
      artifact({ id: 3, ctd_section: '2.3', status: 'approved', is_reviewed: true }),
      artifact({ id: 4, ctd_section: '2.4', status: 'locked', is_signed: true, signed_version: 4 }),
    ].map((r) => ({ ...r, total_rows: 4 })));
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);
    expect(res.body.data.artifacts).toEqual({
      total: 4,
      byStatus: { draft: 2, approved: 1, final: 1 },
      signatures: { none: 2, current: 1, stale: 1, unknown: 0 },
      reviewed: 1,
      window: { shown: 4, total: 4, truncated: false },
    });
    expect(res.body.data.documentCounts).toEqual({ authored: 0, artifacts: 4, uploads: 0 });
    expect(res.body.data.documentCount).toBe(4);
  });

  it('reads the registry bound to the organization and the program, newest first, one past the window', async () => {
    seed([]);
    await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    const call = registryCall();
    expect(call, 'the registry was read').toBeTruthy();
    expect(call![1]).toEqual([7, PROJECT, 2001]);
    const sql = String(call![0]);
    expect(sql).toContain('a.organization_id = $1');
    expect(sql).toContain('p.regulatory_program_id = $2::uuid');
    expect(sql).toMatch(/a\.status <> 'archived'/);
  });
});

describe('GET /api/c2c/project-vault/:id — honest states of the branch', () => {
  it('an anchored project with no artifacts is an honest empty: no branch, a zero, no unavailable', async () => {
    seed([]);
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);
    expect(branch(res.body)).toBeUndefined();
    expect(res.body.data.artifacts).toMatchObject({ total: 0, window: { shown: 0, total: 0, truncated: false } });
    expect(res.body.data.documentCounts.artifacts).toBe(0);
    expect((res.body.data.unavailable ?? []).some((u: any) => u.branch === 'Governed artifacts')).toBe(false);
  });

  it('an unanchored project is reported unavailable, never as an empty branch', async () => {
    resolveSpineMock.mockResolvedValue({ state: 'unanchored', artifactProjectId: null, detail: 'Module 3 sentence' });
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: PROJECT, name: 'BX-204', product_type: 'drug' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0, unfiled: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);
    expect(registryCall(), 'the registry is not asked about a project it cannot address').toBeUndefined();
    expect(res.body.data.artifacts).toBeUndefined();
    expect(res.body.data.documentCounts.artifacts).toBeNull();
    const u = (res.body.data.unavailable ?? []).find((x: any) => x.branch === 'Governed artifacts');
    expect(u?.reason).toMatch(/not linked to your organization.s artifact registry/);
    // The sentence is the Vault's, about every artifact, not the CMC module's.
    expect(u?.reason).not.toMatch(/Module 3/);
  });

  it('a registry this environment has not provisioned is reported unavailable', async () => {
    seed(Object.assign(new Error('relation "concept2cure_signatures" does not exist'), { code: '42P01' }));
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);
    expect(branch(res.body)).toBeUndefined();
    expect(res.body.data.documentCounts.artifacts).toBeNull();
    expect(res.body.data.unavailable).toEqual(
      expect.arrayContaining([expect.objectContaining({ branch: 'Governed artifacts' })]),
    );
  });

  it('a real failure of the registry read is a failure of the read, not an empty branch', async () => {
    seed(new Error('connection reset'));
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('a project with more artifacts than the window says so and keeps the exact total', async () => {
    const prior = process.env.VAULT_TREE_MAX_DOCS;
    process.env.VAULT_TREE_MAX_DOCS = '2';
    try {
      seed([
        artifact({ id: 1, ctd_section: '2.1', total_rows: 5 }),
        artifact({ id: 2, ctd_section: '2.2', total_rows: 5 }),
        artifact({ id: 3, ctd_section: '2.3', total_rows: 5 }),
      ]);
      const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
      expect(res.status).toBe(200);
      expect(branch(res.body).children[0].children).toHaveLength(2);
      expect(res.body.data.artifacts.total).toBe(5);
      expect(res.body.data.artifacts.window).toEqual({ shown: 2, total: 5, truncated: true });
      expect(res.body.data.documentCounts.artifacts).toBe(5);
    } finally {
      if (prior === undefined) delete process.env.VAULT_TREE_MAX_DOCS;
      else process.env.VAULT_TREE_MAX_DOCS = prior;
    }
  });
});
