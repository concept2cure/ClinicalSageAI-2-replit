/**
 * Effective industry context — precedence, and the refusal to guess.
 *
 * The resolver's value is that every surface tailors from ONE answer. So the
 * tests pin two things: that the precedence chain (project → client →
 * organization → legacy → license default) resolves in that order, and that a
 * weak default is reported as needing declaration rather than presented as a
 * decision. The second matters more than the first: silently defaulting a CRO's
 * project to biopharma would offer the wrong regulatory instruments, and no
 * error would ever be raised.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveProjectContext, type Exec,
} from '../resolve-effective-context';

const ORG = 42;
const PROJECT = 7;
const CLIENT = 3;

/**
 * Routes each query to a canned result by matching its SQL, rather than by call
 * order — the resolver runs some reads in parallel, so an order-dependent mock
 * would be testing the scheduler.
 */
function mockExec(fixtures: {
  orgProfile?: Record<string, unknown> | null;
  legacyIndustryMode?: string | null;
  projectProfile?: Record<string, unknown> | null;
  clientIndustry?: string | null;
  modules?: string[];
  throwOn?: { match: string; code: string };
}) {
  const calls: { sql: string; args: unknown[] }[] = [];
  const exec: Exec = {
    async query(sql: string, args: unknown[]) {
      calls.push({ sql, args });
      if (fixtures.throwOn && sql.includes(fixtures.throwOn.match)) {
        throw Object.assign(new Error(fixtures.throwOn.code), { code: fixtures.throwOn.code });
      }
      if (sql.includes('organization_industry_profiles')) {
        return { rows: fixtures.orgProfile ? [fixtures.orgProfile] : [] };
      }
      if (sql.includes('FROM organizations')) {
        return { rows: [{ industry_mode: fixtures.legacyIndustryMode ?? null }] };
      }
      if (sql.includes('project_industry_profiles')) {
        return { rows: fixtures.projectProfile ? [fixtures.projectProfile] : [] };
      }
      if (sql.includes('client_workspaces')) {
        return { rows: [{ industry: fixtures.clientIndustry ?? null }] };
      }
      if (sql.includes('module_subscriptions')) {
        return { rows: (fixtures.modules ?? []).map(m => ({ module_id: m })) };
      }
      return { rows: [] };
    },
  };
  return { exec, calls };
}

const deviceOrg = {
  primary_industry: 'medical_device_diagnostics',
  mdx_specialization: 'medical_device',
  default_markets: ['us', 'eu'],
  default_pathways: ['us_510k'],
  default_approval_rigor: 'regulated_dual_review',
};

describe('resolveEffectiveProjectContext — precedence', () => {
  it('resolves from the governed org profile when there is no project', async () => {
    const { exec } = mockExec({ orgProfile: deviceOrg });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG });
    expect(c.vertical).toBe('mdx');
    expect(c.verticalSource).toBe('organization');
    expect(c.specialization).toBe('medical_device');
    expect(c.markets).toEqual(['us', 'eu']);
    expect(c.pathways).toEqual(['us_510k']);
  });

  it('lets the project override the organization', async () => {
    // The case a service organization needs: one project device, the next pharma,
    // under one organization and one unchanged navigation.
    const { exec } = mockExec({
      orgProfile: deviceOrg,
      projectProfile: {
        vertical: 'biopharma', specialization: null, product_type: 'Small molecule',
        lifecycle_stage: 'phase_2', target_markets: ['us'], regulatory_pathways: ['us_ind'],
        filing_types: [], inherited_from_org: false, client_workspace_id: null,
      },
    });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG, projectId: PROJECT });
    expect(c.vertical).toBe('biopharma');
    expect(c.verticalSource).toBe('project');
    expect(c.productType).toBe('Small molecule');
    expect(c.markets).toEqual(['us']);
    expect(c.pathways).toEqual(['us_ind']);
  });

  it('lets the client account refine the vertical between org and project', async () => {
    const { exec } = mockExec({
      orgProfile: { ...deviceOrg, primary_industry: 'cro', mdx_specialization: 'unspecified' },
      clientIndustry: 'medtech',
    });
    const c = await resolveEffectiveProjectContext(exec, {
      organizationId: ORG, clientWorkspaceId: CLIENT,
    });
    expect(c.vertical).toBe('mdx');
    expect(c.verticalSource).toBe('client');
  });

  it('falls back to the legacy industry_mode when no profile row exists', async () => {
    // An organization that predates the governed profile still resolves, and the
    // source says the value came from the legacy column rather than a declaration.
    const { exec } = mockExec({ orgProfile: null, legacyIndustryMode: 'medtech' });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG });
    expect(c.vertical).toBe('mdx');
    expect(c.verticalSource).toBe('legacy_industry_mode');
    expect(c.primaryIndustry).toBe('medical_device_diagnostics');
  });

  it('survives a database with no profile table at all', async () => {
    const { exec } = mockExec({
      legacyIndustryMode: 'biotech',
      throwOn: { match: 'organization_industry_profiles', code: '42P01' },
    });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG });
    expect(c.vertical).toBe('biopharma');
    expect(c.verticalSource).toBe('legacy_industry_mode');
  });
});

describe('resolveEffectiveProjectContext — the two project identities', () => {
  // The platform carries `projects` (serial), which unified_tasks and
  // client_workspaces key on, and `regulatory_programs` (uuid), which the
  // Projects DETAIL cockpit reads. There is no join between them, and the
  // resolver does not invent one — a profile is read against whichever identity
  // the caller holds.
  const PROGRAM = '11111111-2222-3333-4444-555555555555';
  const mdxProject = {
    vertical: 'mdx', specialization: 'ivd_diagnostics',
    product_type: null, lifecycle_stage: null,
    target_markets: [], regulatory_pathways: [], filing_types: [],
    inherited_from_org: false, client_workspace_id: null,
  };

  it('reads the profile by program_id when given a program uuid', async () => {
    const { exec, calls } = mockExec({ projectProfile: mdxProject });
    const c = await resolveEffectiveProjectContext(exec, {
      organizationId: ORG, programId: PROGRAM,
    });
    expect(c.specialization).toBe('ivd_diagnostics');
    expect(c.specializationSource).toBe('project');
    const read = calls.find(x => x.sql.includes('project_industry_profiles'))!;
    expect(read.sql).toContain('program_id = $1');
    expect(read.args).toEqual([PROGRAM, ORG]);
  });

  it('reads by project_id when given a project id', async () => {
    const { exec, calls } = mockExec({ projectProfile: mdxProject });
    await resolveEffectiveProjectContext(exec, { organizationId: ORG, projectId: PROJECT });
    const read = calls.find(x => x.sql.includes('project_industry_profiles'))!;
    expect(read.sql).toContain('project_id = $1');
    expect(read.args).toEqual([PROJECT, ORG]);
  });

  it('prefers the project id when both are given, and issues only one read', async () => {
    const { exec, calls } = mockExec({ projectProfile: mdxProject });
    await resolveEffectiveProjectContext(exec, {
      organizationId: ORG, projectId: PROJECT, programId: PROGRAM,
    });
    const reads = calls.filter(x => x.sql.includes('project_industry_profiles'));
    expect(reads).toHaveLength(1);
    expect(reads[0].sql).toContain('project_id = $1');
  });

  it('degrades to no project profile on a database predating program_id', async () => {
    // 42703, not 42P01: the table exists but the column does not. The org profile
    // should still resolve rather than the whole read failing.
    const { exec } = mockExec({
      orgProfile: deviceOrg,
      throwOn: { match: 'program_id = $1', code: '42703' },
    });
    const c = await resolveEffectiveProjectContext(exec, {
      organizationId: ORG, programId: PROGRAM,
    });
    expect(c.specialization).toBe('medical_device');
    expect(c.specializationSource).toBe('organization');
  });

  it('does not read any project profile when neither identity is given', async () => {
    const { exec, calls } = mockExec({ orgProfile: deviceOrg });
    await resolveEffectiveProjectContext(exec, { organizationId: ORG });
    expect(calls.some(x => x.sql.includes('project_industry_profiles'))).toBe(false);
  });
});

describe('resolveEffectiveProjectContext — never guesses', () => {
  it('asks for the vertical when the organization is a service provider', async () => {
    // A CRO's projects are whatever its sponsors' are. client-type-profiles maps
    // cro → biopharma, which is a reasonable default and a bad assumption: acting
    // on it would offer IND study designs for a 510(k) engagement.
    const { exec } = mockExec({
      orgProfile: { ...deviceOrg, primary_industry: 'cro', mdx_specialization: 'unspecified' },
    });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG });
    expect(c.needsDeclaration).toContain('vertical');
  });

  it('does not ask when the industry determines the vertical', async () => {
    const { exec } = mockExec({ orgProfile: deviceOrg });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG });
    expect(c.needsDeclaration).not.toContain('vertical');
  });

  it('stops asking once the project declares its vertical', async () => {
    const { exec } = mockExec({
      orgProfile: { ...deviceOrg, primary_industry: 'regulatory_consulting', mdx_specialization: 'ivd_diagnostics' },
      projectProfile: {
        vertical: 'mdx', specialization: 'ivd_diagnostics', product_type: null,
        lifecycle_stage: null, target_markets: [], regulatory_pathways: [], filing_types: [],
        inherited_from_org: false, client_workspace_id: null,
      },
    });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG, projectId: PROJECT });
    expect(c.needsDeclaration).toEqual([]);
  });

  it('asks for the specialization inside MDX when nobody has declared it', async () => {
    // The distinction has never been recorded anywhere, so the backfill leaves it
    // unspecified rather than inventing one. Offering every archetype would be the
    // same failure as guessing.
    const { exec } = mockExec({
      orgProfile: { ...deviceOrg, mdx_specialization: 'unspecified' },
    });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG });
    expect(c.specialization).toBe('unspecified');
    expect(c.needsDeclaration).toContain('specialization');
    expect(c.studyTypes).toEqual([]);
    expect(c.filingTypes).toEqual([]);
  });

  it('tells AnA what is undeclared instead of letting it assume', async () => {
    const { exec } = mockExec({
      orgProfile: { ...deviceOrg, primary_industry: 'cro', mdx_specialization: 'unspecified' },
    });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG });
    expect(c.anaFraming).toMatch(/NOT yet declared/);
    expect(c.anaFraming).toMatch(/Ask before assuming/);
  });
});

describe('resolveEffectiveProjectContext — specialization drives content, not navigation', () => {
  it('offers IVD performance archetypes and IVD terminology for a diagnostics project', async () => {
    const { exec } = mockExec({
      orgProfile: { ...deviceOrg, mdx_specialization: 'ivd_diagnostics' },
    });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG });
    expect(c.studyTypes).toContain('lob_lod_loq');
    expect(c.studyTypes).toContain('ppa_npa_opa');
    // A device clinical investigation is not an IVD study archetype.
    expect(c.studyTypes).not.toContain('pivotal_clinical_investigation');
    expect(c.filingTypes).toContain('dual_510k_clia_waiver');
    // An IVD sponsor does not call the thing a Device, or its unit a Subject.
    expect(c.terminology.product).toBe('Assay');
    expect(c.terminology.subject).toBe('Specimen');
  });

  it('offers device archetypes and device terminology for a device project', async () => {
    const { exec } = mockExec({ orgProfile: deviceOrg });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG });
    expect(c.studyTypes).toContain('pivotal_clinical_investigation');
    expect(c.studyTypes).not.toContain('lob_lod_loq');
    expect(c.terminology.product).toBe('Device');
  });

  it('offers both panels when the organization does both', async () => {
    const { exec } = mockExec({
      orgProfile: { ...deviceOrg, mdx_specialization: 'medical_device_and_ivd' },
    });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG });
    expect(c.studyTypes).toContain('pivotal_clinical_investigation');
    expect(c.studyTypes).toContain('lob_lod_loq');
    // Neutral terminology: the org level should not pick a side, the project does.
    expect(c.terminology.product).toBe('Product');
  });

  it('leaks no MDX archetypes into a biopharma project', async () => {
    const { exec } = mockExec({
      orgProfile: { ...deviceOrg, primary_industry: 'biotech_pharma', mdx_specialization: 'medical_device' },
    });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG });
    expect(c.vertical).toBe('biopharma');
    // A stale specialization on a biopharma org must not surface device studies.
    expect(c.studyTypes).toEqual([]);
    expect(c.filingTypes).toEqual([]);
  });
});

describe('resolveEffectiveProjectContext — licensing', () => {
  it('reports enabled modules from the same table license-manager reads', async () => {
    const { exec, calls } = mockExec({ orgProfile: deviceOrg, modules: ['mdx', 'vault'] });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG });
    expect(c.licensedModules).toEqual(['mdx', 'vault']);
    const lic = calls.find(x => x.sql.includes('module_subscriptions'))!;
    expect(lic.sql).toContain('enabled = true');
    expect(lic.args).toEqual([ORG]);
  });

  it('does not lock every capability when the entitlement read fails', async () => {
    // Reporting an infrastructure failure as a licensing decision would tell a
    // paying customer they are not licensed for what they bought.
    const { exec } = mockExec({
      orgProfile: deviceOrg,
      throwOn: { match: 'module_subscriptions', code: '42P01' },
    });
    const c = await resolveEffectiveProjectContext(exec, { organizationId: ORG });
    expect(c.licensedModules).toEqual([]);
    expect(c.studyTypes.length).toBeGreaterThan(0);
  });

  it('scopes every read to the organization', async () => {
    const { exec, calls } = mockExec({
      orgProfile: deviceOrg, projectProfile: null, clientIndustry: 'medtech',
    });
    await resolveEffectiveProjectContext(exec, {
      organizationId: ORG, projectId: PROJECT, clientWorkspaceId: CLIENT,
    });
    for (const c of calls) expect(c.args).toContain(ORG);
  });
});
