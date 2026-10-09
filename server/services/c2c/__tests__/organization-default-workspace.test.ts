import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKSPACE_MARKER,
  defaultWorkspaceIdentity,
  defaultWorkspaceMetadata,
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
    async enterOrganizationScope() {},
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
      async enterOrganizationScope() {},
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

describe('the mark on the row is what keeps a CRO anchoring', () => {
  it('marks every workspace it writes as the organisation’s own', async () => {
    // Load-bearing, not decoration. POST /api/clients is mounted and live, so a
    // tenant can acquire a second workspace at any time; without this mark the
    // anchor writer falls back to counting, sees two, and reports
    // AMBIGUOUS_CLIENT_WORKSPACE for every program created afterwards.
    const rows: Array<Record<string, unknown>> = [];
    const store: WorkspaceStore = {
      async enterOrganizationScope() {},
      async readWorkspaces() {
        return { count: 0, firstWorkspaceId: null };
      },
      async insertWorkspace(orgId, identity, createdById) {
        rows.push({ orgId, identity, createdById, metadata: defaultWorkspaceMetadata() });
        return 1;
      },
    };

    await ensureOrganizationDefaultWorkspace(store, { orgId: 7, orgName: 'Acme Bio' });

    expect(rows[0].metadata).toEqual({ [DEFAULT_WORKSPACE_MARKER]: true });
  });

  it('spells the marker key exactly as the anchor reader queries it', () => {
    // The anchor's preflight does `(metadata ->> $2) = 'true'` with this
    // constant. A second spelling here would silently return it to counting.
    expect(DEFAULT_WORKSPACE_MARKER).toBe('defaultForOrganization');
    expect(defaultWorkspaceMetadata()).toEqual({ defaultForOrganization: true });
  });
});

describe('every organisation creator writes the workspace', () => {
  /**
   * The defect being fixed is precisely "an organisation creator that forgets
   * to write the workspace". Gating only the decision function leaves the next
   * creator added — or a refactor that drops one of these three lines — free to
   * reintroduce it with the deploy green. This reads the call sites.
   */
  const CREATORS = [
    { name: 'self-serve signup', file: 'server/routes/auth.ts' },
    { name: 'first-run setup', file: 'server/routes/setup.ts' },
    { name: 'boot seed', file: 'server/db/bootstrap/seed-default-org.ts' },
  ] as const;

  /**
   * Matches the CALL, not the mention. Asserting `toContain(name)` passes on
   * the import line alone — seen to do exactly that when the call was removed
   * from setup.ts and the import left behind, which is the likeliest shape of
   * this regression.
   */
  const CALL = /\bawait\s+ensureOrganizationDefaultWorkspace\s*\(/;

  it.each(CREATORS)('$name calls ensureOrganizationDefaultWorkspace', ({ file }) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');

    expect(source).toMatch(CALL);
  });

  it('is called by the organisation creators and no one else (it enters whatever tenant it is given)', () => {
    const callers = execSync(
      "grep -rlE '\\bensureOrganizationDefaultWorkspace\\s*\\(' --include=*.ts server/ | grep -v __tests__ | sort || true",
      { cwd: process.cwd(), encoding: 'utf8' },
    )
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    expect(callers).toEqual(
      [...CREATORS.map((c) => c.file), 'server/services/c2c/organization-default-workspace.ts'].sort(),
    );
  });

  it('knows of no organisation creator that does not', () => {
    // If this fails, a new INSERT INTO organizations landed somewhere. Either
    // it calls the writer, or it is added to the exemptions with a reason.
    const EXEMPT = new Set([
      // Multi-tenant provisioning API; it creates the org row only, and the
      // migration sweep repairs it on the next deploy.
      'server/routes/tenants-simple.ts',
    ]);
    const hits = execSync(
      "grep -rln \"insert(organizations)\\|INSERT INTO organizations\" --include=*.ts server/ | grep -v __tests__ || true",
      { cwd: process.cwd(), encoding: 'utf8' },
    )
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const unguarded = hits.filter((f) => {
      if (EXEMPT.has(f)) return false;
      return !CALL.test(readFileSync(resolve(process.cwd(), f), 'utf8'));
    });

    expect(unguarded).toEqual([]);
  });
});

/** A store that records the ORDER of what the rule asks of it. */
function recordingStore(opts: { refuseScope?: boolean } = {}) {
  const calls: string[] = [];
  const store: WorkspaceStore = {
    async enterOrganizationScope(orgId) {
      calls.push(`scope:${orgId}`);
      if (opts.refuseScope) throw new Error('set_config refused');
    },
    async readWorkspaces(orgId) {
      calls.push(`read:${orgId}`);
      return { count: 0, firstWorkspaceId: null };
    },
    async insertWorkspace(orgId) {
      calls.push(`insert:${orgId}`);
      return 1;
    },
  };
  return { store, calls };
}

describe('the organisation\'s own tenant', () => {
  it('enters the organisation\'s tenant BEFORE counting and BEFORE writing', async () => {
    // Under a creator's pre-auth scope (tenant '0') RLS filters the count to
    // zero silently and refuses the insert loudly; both must be judged as the
    // organisation the row belongs to.
    const { store, calls } = recordingStore();
    await ensureOrganizationDefaultWorkspace(store, { orgId: 7, orgName: 'Acme Bio', userId: 1 });
    expect(calls).toEqual(['scope:7', 'read:7', 'insert:7']);
  });

  it('enters it even when the organisation already has a workspace (the count is what it protects)', async () => {
    const calls: string[] = [];
    const store: WorkspaceStore = {
      async enterOrganizationScope(orgId) { calls.push(`scope:${orgId}`); },
      async readWorkspaces(orgId) { calls.push(`read:${orgId}`); return { count: 1, firstWorkspaceId: 3 }; },
      async insertWorkspace() { calls.push('insert'); return 9; },
    };
    await ensureOrganizationDefaultWorkspace(store, { orgId: 7, orgName: 'Acme Bio' });
    expect(calls).toEqual(['scope:7', 'read:7']);
  });

  it('fails closed: a refused scope reads nothing and writes nothing', async () => {
    const { store, calls } = recordingStore({ refuseScope: true });
    await expect(ensureOrganizationDefaultWorkspace(store, { orgId: 7, orgName: 'Acme Bio' })).rejects.toThrow('set_config refused');
    expect(calls).toEqual(['scope:7']);
  });

  it.each([0, -1, Number.NaN, 1.5])('refuses orgId %s before touching the store', async (orgId) => {
    const { store, calls } = recordingStore();
    await expect(ensureOrganizationDefaultWorkspace(store, { orgId, orgName: 'Acme Bio' })).rejects.toThrow(/positive integer/);
    expect(calls).toEqual([]);
  });
});
