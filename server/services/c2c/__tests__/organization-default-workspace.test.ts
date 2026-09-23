import { describe, expect, it } from 'vitest';
import {
  defaultWorkspaceIdentity,
  ensureOrganizationDefaultWorkspace,
  type DefaultWorkspaceIdentity,
  type WorkspaceStore,
} from '../organization-default-workspace.js';

/**
 * An in-memory stand-in for `client_workspaces`, honouring the one constraint
 * the rule depends on: `unique_org_slug` on (organization_id, slug).
 */
function fakeStore(seed: Array<{ id: number; orgId: number; slug: string }> = []) {
  const rows = [...seed];
  const inserts: Array<{ orgId: number; identity: DefaultWorkspaceIdentity; createdById: number | null }> = [];
  let nextId = Math.max(0, ...rows.map(r => r.id)) + 1;

  const store: WorkspaceStore = {
    async readWorkspaces(orgId) {
      const mine = rows.filter(r => r.orgId === orgId);
      return {
        count: mine.length,
        firstWorkspaceId: mine.length > 0 ? Math.min(...mine.map(r => r.id)) : null,
      };
    },
    async insertWorkspace(orgId, identity, createdById) {
      inserts.push({ orgId, identity, createdById });
      if (rows.some(r => r.orgId === orgId && r.slug === identity.slug)) {
        return null; // ON CONFLICT (organization_id, slug) DO NOTHING
      }
      const id = nextId++;
      rows.push({ id, orgId, slug: identity.slug });
      return id;
    },
  };

  return { store, rows, inserts };
}

describe('defaultWorkspaceIdentity', () => {
  it('names the workspace after the organisation, verbatim', () => {
    expect(defaultWorkspaceIdentity({ orgName: 'Concept2Cure Therapeutics', orgSlug: 'concept2cure' })).toEqual({
      name: 'Concept2Cure Therapeutics',
      slug: 'concept2cure',
      description: 'Default workspace for Concept2Cure Therapeutics',
    });
  });

  it('prefers the organisation slug so the two agree wherever a human reads both', () => {
    expect(defaultWorkspaceIdentity({ orgName: 'Acme Bio, Inc.', orgSlug: 'acme-bio' }).slug).toBe('acme-bio');
  });

  it('falls back to the name when the organisation carries no usable slug', () => {
    expect(defaultWorkspaceIdentity({ orgName: 'Acme Bio, Inc.', orgSlug: '' }).slug).toBe('acme-bio-inc');
    expect(defaultWorkspaceIdentity({ orgName: 'Acme Bio, Inc.', orgSlug: null }).slug).toBe('acme-bio-inc');
    expect(defaultWorkspaceIdentity({ orgName: 'Acme Bio, Inc.' }).slug).toBe('acme-bio-inc');
  });

  it('always yields a non-empty slug, because the column is NOT NULL', () => {
    // A name of punctuation alone normalises to the empty string; the constant
    // fallback is what keeps the insert satisfiable. unique_org_slug is scoped
    // to (organization_id, slug), so the shared fallback collides with nothing.
    expect(defaultWorkspaceIdentity({ orgName: '///', orgSlug: '///' }).slug).toBe('workspace');
  });
});

describe('ensureOrganizationDefaultWorkspace', () => {
  it('writes the organisation its own workspace when it has none', async () => {
    const { store, inserts } = fakeStore();

    const result = await ensureOrganizationDefaultWorkspace(store, {
      orgId: 7,
      orgName: 'Acme Bio',
      orgSlug: 'acme-bio',
      userId: 42,
    });

    expect(result).toEqual({ workspaceId: 1, created: true });
    expect(inserts).toEqual([
      {
        orgId: 7,
        identity: { name: 'Acme Bio', slug: 'acme-bio', description: 'Default workspace for Acme Bio' },
        createdById: 42,
      },
    ]);
  });

  it('is idempotent: a second call links to the first row and writes nothing', async () => {
    const { store, inserts } = fakeStore();

    const first = await ensureOrganizationDefaultWorkspace(store, { orgId: 7, orgName: 'Acme Bio', userId: 1 });
    const second = await ensureOrganizationDefaultWorkspace(store, { orgId: 7, orgName: 'Acme Bio', userId: 1 });

    expect(first).toEqual({ workspaceId: 1, created: true });
    expect(second).toEqual({ workspaceId: 1, created: false, skipped: 'ALREADY_HAS_WORKSPACE' });
    expect(inserts).toHaveLength(1);
  });

  it('NEVER adds a second workspace to an organisation that has exactly one', async () => {
    // Load-bearing, not hygiene: one workspace is the unambiguous case
    // ensureProgramProjectAnchor requires. A second flips it to
    // AMBIGUOUS_CLIENT_WORKSPACE and stops anchoring programs that anchor today.
    const { store, inserts, rows } = fakeStore([{ id: 3, orgId: 7, slug: 'a-client' }]);

    const result = await ensureOrganizationDefaultWorkspace(store, {
      orgId: 7,
      orgName: 'Acme CRO',
      orgSlug: 'acme-cro',
      userId: 1,
    });

    expect(result).toEqual({ workspaceId: 3, created: false, skipped: 'ALREADY_HAS_WORKSPACE' });
    expect(inserts).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });

  it("leaves a CRO's several client workspaces exactly as they are", async () => {
    const { store, inserts } = fakeStore([
      { id: 3, orgId: 7, slug: 'client-a' },
      { id: 4, orgId: 7, slug: 'client-b' },
    ]);

    const result = await ensureOrganizationDefaultWorkspace(store, { orgId: 7, orgName: 'Acme CRO', userId: 1 });

    expect(result).toEqual({ workspaceId: 3, created: false, skipped: 'ALREADY_HAS_WORKSPACE' });
    expect(inserts).toHaveLength(0);
  });

  it('scopes to the organisation: another tenant having one is not this one having one', async () => {
    const { store } = fakeStore([{ id: 3, orgId: 99, slug: 'someone-else' }]);

    const result = await ensureOrganizationDefaultWorkspace(store, { orgId: 7, orgName: 'Acme Bio', userId: 1 });

    expect(result.created).toBe(true);
    expect(result.workspaceId).toBe(4);
  });

  it('reports a lost insert race as not-created rather than as a write', async () => {
    // ON CONFLICT (organization_id, slug) DO NOTHING returns no row when another
    // connection inserted the same slug between the read and the write. The
    // organisation has its workspace; this call simply did not write it.
    const store: WorkspaceStore = {
      async readWorkspaces() {
        return { count: 0, firstWorkspaceId: null };
      },
      async insertWorkspace() {
        return null;
      },
    };

    expect(await ensureOrganizationDefaultWorkspace(store, { orgId: 7, orgName: 'Acme Bio' })).toEqual({
      workspaceId: null,
      created: false,
      skipped: 'ALREADY_HAS_WORKSPACE',
    });
  });

  it('records the platform, not a person, when no user created the organisation', async () => {
    const { store, inserts } = fakeStore();

    await ensureOrganizationDefaultWorkspace(store, { orgId: 7, orgName: 'Acme Bio', userId: null });

    expect(inserts[0].createdById).toBeNull();
  });
});
