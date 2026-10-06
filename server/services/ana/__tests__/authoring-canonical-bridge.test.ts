import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  bridgeAuthoringToCanonical,
  authoringThreadKey,
  resolveAuthoringCanonicalProject,
  type AuthoringBridgeDeps,
} from '../authoring-canonical-bridge.js';

function deps(overrides: Partial<AuthoringBridgeDeps> = {}): AuthoringBridgeDeps {
  return {
    async loadDocumentSnapshot() {
      return { title: 'Clinical Overview', content: '## 2.5 — Overview\n\nBody text', module: '2.5' };
    },
    async commit(req) {
      return {
        artifactId: 'artifact_9',
        artifactPk: 9,
        version: 2,
        created: true,
        contentHash: 'h',
        status: 'review',
        ctdSection: req.ctdSection ?? null,
        actionId: 'act',
        auditId: 'aud',
        provenanceLinks: 0,
        readiness: 60,
        steps: ['version', 'ai_action', 'audit', 'review', 'placement', 'readiness', 'ui_refresh'],
      };
    },
    ...overrides,
  };
}

const base = {
  docId: 'doc-1',
  organizationId: 1,
  projectId: 10,
  userId: 5,
  // The submitter's own words (the route's optional stated reason).
  reason: 'Ready for QA: SAP v2.0 wording applied throughout.',
  triggerReview: true,
};

describe('authoring-canonical-bridge', () => {
  it('resolves the stored document project when no client project id is supplied', async () => {
    const commit = vi.fn(deps().commit);
    const dependencies = {
      ...deps({ commit }),
      resolveProject: async () => ({ projectId: 22 }),
    };
    const outcome = await bridgeAuthoringToCanonical({ ...base, projectId: null }, dependencies);
    expect(outcome.bridged).toBe(true);
    expect(commit.mock.calls[0][0].projectId).toBe(22);
  });

  it('does not let client project context override a stored program relationship', async () => {
    const commit = vi.fn(deps().commit);
    const dependencies = {
      ...deps({ commit }),
      resolveProject: async () => ({ projectId: null, reason: 'project conflicts with stored program' }),
    };
    const outcome = await bridgeAuthoringToCanonical(base, dependencies);
    expect(outcome.bridged).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5])('refuses invalid numeric project or actor identities (%s)', async (id) => {
    const commit = vi.fn(deps().commit);
    expect((await bridgeAuthoringToCanonical({ ...base, projectId: id }, deps({ commit }))).bridged).toBe(false);
    expect((await bridgeAuthoringToCanonical({ ...base, userId: id }, deps({ commit }))).bridged).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });
  it('builds a stable per-document thread key', () => {
    expect(authoringThreadKey('doc-1')).toBe('authoring:doc-1');
  });

  it('bridges into the spine when project + numeric actor + content are present', async () => {
    const commit = vi.fn(deps().commit);
    const outcome = await bridgeAuthoringToCanonical(base, deps({ commit }));
    expect(outcome.bridged).toBe(true);
    expect(outcome.result?.status).toBe('review');
    const req = commit.mock.calls[0][0];
    expect(req.anaThreadId).toBe('authoring:doc-1');
    expect(req.projectId).toBe(10);
    expect(req.userId).toBe(5);
    expect(req.content).toContain('Overview');
    expect(req.triggerReview).toBe(true);
    // The person's reason, as stated — nothing composed around it.
    expect(req.reasonForChange).toBe('Ready for QA: SAP v2.0 wording applied throughout.');
  });

  it.each([null, '', '   '])('skips (no write) when no reason for change was stated (%j) — none is written for them', async (reason) => {
    const commit = vi.fn(deps().commit);
    const outcome = await bridgeAuthoringToCanonical({ ...base, reason }, deps({ commit }));
    expect(outcome.bridged).toBe(false);
    expect(outcome.reason).toMatch(/no reason for change was stated/);
    expect(commit).not.toHaveBeenCalled();
  });

  it('falls back to the document module for placement when no ctd_section given', async () => {
    const commit = vi.fn(deps().commit);
    await bridgeAuthoringToCanonical(base, deps({ commit }));
    expect(commit.mock.calls[0][0].ctdSection).toBe('2.5');
  });

  it('skips (no write) when there is no project context', async () => {
    const commit = vi.fn(deps().commit);
    const outcome = await bridgeAuthoringToCanonical({ ...base, projectId: null }, deps({ commit }));
    expect(outcome.bridged).toBe(false);
    expect(outcome.reason).toMatch(/project/i);
    expect(commit).not.toHaveBeenCalled();
  });

  it('skips when the actor is not a numeric users.id (protects Part 11 attribution)', async () => {
    const commit = vi.fn(deps().commit);
    const outcome = await bridgeAuthoringToCanonical(
      { ...base, userId: NaN as unknown as number },
      deps({ commit }),
    );
    expect(outcome.bridged).toBe(false);
    expect(outcome.reason).toMatch(/attribut/i);
    expect(commit).not.toHaveBeenCalled();
  });

  it('skips when the document has no assembled content', async () => {
    const outcome = await bridgeAuthoringToCanonical(
      base,
      deps({ async loadDocumentSnapshot() { return { title: 'Empty', content: '   ' }; } }),
    );
    expect(outcome.bridged).toBe(false);
    expect(outcome.reason).toMatch(/content/i);
  });

  it('never throws — a spine failure is reported as a skip', async () => {
    const outcome = await bridgeAuthoringToCanonical(
      base,
      deps({ async commit() { throw new Error('db down'); } }),
    );
    expect(outcome.bridged).toBe(false);
    expect(outcome.reason).toMatch(/not confirmed/);
    expect(outcome.reason).not.toContain('db down');
  });
});


describe('recorded canonical destination on PostgreSQL', () => {
  const program = 'a0000000-0000-4000-8000-000000000001';
  const foreign = 'b0000000-0000-4000-8000-000000000001';
  const deleted = 'c0000000-0000-4000-8000-000000000001';
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE TABLE authoring_documents (id TEXT, tenant_id INT, client_program_id UUID);
      CREATE TABLE regulatory_programs (id UUID, organization_id INT, deleted_at TIMESTAMPTZ);
      CREATE TABLE projects (id INT, organization_id INT, regulatory_program_id UUID);
      INSERT INTO regulatory_programs VALUES ('${program}',1,NULL), ('${foreign}',2,NULL), ('${deleted}',1,NOW());
      INSERT INTO projects VALUES (22,1,'${program}'), (99,2,'${foreign}'), (23,1,NULL);
      INSERT INTO authoring_documents VALUES ('linked',1,'${program}'), ('legacy',1,NULL),
        ('foreign',1,'${foreign}'), ('deleted',1,'${deleted}');
    `);
  }, 60_000);
  afterAll(async () => { await db.close(); });

  it('resolves the stored live program and refuses an overriding hint', async () => {
    expect(await resolveAuthoringCanonicalProject(db, 'linked', 1)).toEqual({ projectId: 22 });
    expect((await resolveAuthoringCanonicalProject(db, 'linked', 1, 23)).projectId).toBeNull();
    expect((await resolveAuthoringCanonicalProject(db, 'linked', 2, 99)).projectId).toBeNull();
  });

  it.each(['foreign', 'deleted'])('refuses a non-live tenant program (%s) despite a valid hint', async (doc) => {
    expect((await resolveAuthoringCanonicalProject(db, doc, 1, 23)).projectId).toBeNull();
  });

  it('allows only a tenant-owned legacy hint for an unlinked document', async () => {
    expect(await resolveAuthoringCanonicalProject(db, 'legacy', 1, 23)).toEqual({ projectId: 23 });
    expect((await resolveAuthoringCanonicalProject(db, 'legacy', 1, 99)).projectId).toBeNull();
    expect((await resolveAuthoringCanonicalProject(db, 'legacy', 1)).projectId).toBeNull();
  });

  it('refuses ambiguous or missing relationships without falling back to the hint', async () => {
    await db.exec(`INSERT INTO projects VALUES (24,1,'${program}')`);
    expect((await resolveAuthoringCanonicalProject(db, 'linked', 1, 22)).projectId).toBeNull();
    await db.exec(`DELETE FROM projects WHERE regulatory_program_id='${program}'`);
    expect((await resolveAuthoringCanonicalProject(db, 'linked', 1, 23)).projectId).toBeNull();
  });

  it('reports unavailable linkage as unconfirmed without exposing SQL or committing', async () => {
    await db.exec('DROP TABLE projects');
    const commit = vi.fn(deps().commit);
    const outcome = await bridgeAuthoringToCanonical({ ...base, docId: 'linked', projectId: 23 }, deps({
      commit, resolveProject: (doc, org, hint) => resolveAuthoringCanonicalProject(db, doc, org, hint),
    }));
    expect(outcome.bridged).toBe(false);
    expect(outcome.reason).toMatch(/not confirmed/);
    expect(outcome.reason).not.toMatch(/SELECT|relation|projects/);
    expect(commit).not.toHaveBeenCalled();
  });
});
