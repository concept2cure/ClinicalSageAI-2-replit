/**
 * The contextual project plan — MDX-PM-01.
 *
 * The plan reader is where the acceptance criterion actually lives. "Selecting an
 * MDX project changes the Project center content; selecting a Biopharma project
 * restores Biopharma content" is a statement about what the SERVER returns, not
 * about what a component chooses to render, so it is pinned here.
 *
 * The other three behaviours worth holding still:
 *
 *   - a persisted package is never dropped from the plan, even when the
 *     specialization no longer calls for it. That is real recorded work, and
 *     hiding it from the plan that is supposed to account for all of it is the
 *     worst available outcome;
 *   - progress is counted from linked tasks, never estimated from a phase or a
 *     deliverable count;
 *   - a database missing the work-package tables degrades to "nothing persisted"
 *     rather than failing the cockpit's read. That fallback is exactly the kind
 *     of thing that quietly stops working.
 */

import { describe, it, expect } from 'vitest';
import { readProjectPlan } from '../project-plan';
import type { Exec } from '../resolve-effective-context';

const ORG = 42;
const PROGRAM = '11111111-2222-3333-4444-555555555555';

interface Fixtures {
  orgProfile?: Record<string, unknown> | null;
  programProfile?: Record<string, unknown> | null;
  packages?: Record<string, unknown>[];
  rollups?: Record<string, unknown>[];
  throwOn?: { match: string; code: string };
}

/**
 * Routes by SQL match rather than call order — the resolver runs some of its
 * reads in parallel, so an order-dependent mock would be testing the scheduler.
 */
function mockExec(f: Fixtures) {
  const calls: { sql: string; args: unknown[] }[] = [];
  const exec: Exec = {
    async query(sql: string, args: unknown[]) {
      calls.push({ sql, args });
      if (f.throwOn && sql.includes(f.throwOn.match)) {
        throw Object.assign(new Error(f.throwOn.code), { code: f.throwOn.code });
      }
      if (sql.includes('organization_industry_profiles')) {
        return { rows: f.orgProfile ? [f.orgProfile] : [] };
      }
      if (sql.includes('project_industry_profiles')) {
        return { rows: f.programProfile ? [f.programProfile] : [] };
      }
      if (sql.includes('FROM organizations')) return { rows: [{ industry_mode: null }] };
      if (sql.includes('module_subscriptions')) return { rows: [] };
      if (sql.includes('regulatory_work_packages')) return { rows: f.packages ?? [] };
      if (sql.includes('task_regulatory_links')) return { rows: f.rollups ?? [] };
      return { rows: [] };
    },
  };
  return { exec, calls };
}

const ivdOrg = {
  primary_industry: 'medical_device_diagnostics',
  mdx_specialization: 'ivd_diagnostics',
  default_markets: ['us'],
  default_pathways: [],
  default_approval_rigor: 'regulated_dual_review',
};

const pharmaOrg = {
  primary_industry: 'biotech_pharma',
  mdx_specialization: 'unspecified',
  default_markets: ['us'],
  default_pathways: [],
  default_approval_rigor: 'regulated_dual_review',
};

const read = (f: Fixtures) =>
  readProjectPlan(mockExec(f).exec, { organizationId: ORG, programId: PROGRAM });

// ── The acceptance criterion ─────────────────────────────────────────────────

describe('a non-MDX project', () => {
  it('gets an empty plan, so its cockpit renders what it renders today', async () => {
    const plan = await read({ orgProfile: pharmaOrg });
    expect(plan.context.vertical).toBe('biopharma');
    expect(plan.sections).toEqual([]);
    expect(plan.packages).toEqual([]);
    expect(plan.registryLimit).toBeNull();
  });

  it('is not reported as awaiting a declaration', async () => {
    // A biopharma project is not an MDX project missing a specialization. Asking
    // it to declare one would be asking the wrong question.
    const plan = await read({ orgProfile: pharmaOrg });
    expect(plan.awaitingDeclaration).toBe(false);
  });

  it('does not read the work-package tables at all', async () => {
    // Two queries to produce an empty list, on every load of every biopharma
    // project.
    const { exec, calls } = mockExec({ orgProfile: pharmaOrg });
    await readProjectPlan(exec, { organizationId: ORG, programId: PROGRAM });
    expect(calls.some(c => c.sql.includes('regulatory_work_packages'))).toBe(false);
    expect(calls.some(c => c.sql.includes('task_regulatory_links'))).toBe(false);
  });
});

describe('an MDX project', () => {
  it('gets the registry plan for its specialization', async () => {
    const plan = await read({ orgProfile: ivdOrg });
    const ids = plan.packages.map(p => p.archetypeId);
    expect(ids).toContain('analytical_performance');
    expect(ids).toContain('clinical_performance_ivd');
    expect(ids).toContain('scientific_validity');
    expect(plan.sections.map(s => s.id)).toContain('plan');
  });

  it('reports the sections with the specialization vocabulary', async () => {
    const plan = await read({ orgProfile: ivdOrg });
    expect(plan.sections.find(s => s.id === 'studies')!.label).toBe('Performance studies');
  });

  it('publishes the registry version, so a plan can cite what produced it', async () => {
    const plan = await read({ orgProfile: ivdOrg });
    expect(plan.registryVersion).toMatch(/^\d{4}\.\d{2}\.\d+$/);
  });

  it('asks rather than guessing when no specialization is declared', async () => {
    const plan = await read({
      orgProfile: { ...ivdOrg, mdx_specialization: 'unspecified' },
    });
    expect(plan.awaitingDeclaration).toBe(true);
    expect(plan.packages).toEqual([]);
    // The empty plan comes with the reason, so the cockpit renders a question
    // instead of a blank panel that reads as a loading failure.
    expect(plan.registryLimit).toContain('no plan to offer');
  });

  it('lets the project profile override the organization specialization', async () => {
    // A CRO's device project and its IVD project are different programmes. The
    // program-addressed profile is what makes that expressible.
    const plan = await read({
      orgProfile: ivdOrg,
      programProfile: {
        vertical: 'mdx', specialization: 'medical_device',
        product_type: null, lifecycle_stage: null,
        target_markets: [], regulatory_pathways: [], filing_types: [],
        inherited_from_org: false, client_workspace_id: null,
      },
    });
    expect(plan.context.specialization).toBe('medical_device');
    expect(plan.context.specializationSource).toBe('project');
    const ids = plan.packages.map(p => p.archetypeId);
    expect(ids).toContain('verification_and_validation');
    expect(ids).not.toContain('analytical_performance');
  });

  it('reads the project profile by program uuid, not by project id', async () => {
    const { exec, calls } = mockExec({ orgProfile: ivdOrg });
    await readProjectPlan(exec, { organizationId: ORG, programId: PROGRAM });
    const profileRead = calls.find(c => c.sql.includes('project_industry_profiles'));
    expect(profileRead).toBeDefined();
    expect(profileRead!.sql).toContain('program_id = $1');
    expect(profileRead!.args).toEqual([PROGRAM, ORG]);
  });
});

// ── Merging persisted state ──────────────────────────────────────────────────

const persistedRow = (over: Record<string, unknown> = {}) => ({
  id: 'wp-1', archetype_id: 'analytical_performance', label: 'Analytical performance',
  lifecycle_phase: 'verification', applicability: 'required', applicability_basis: null,
  status: 'in_progress', status_reason: null, owner_user_id: 9,
  target_date: null, completed_at: null, client_visibility: 'internal',
  filings_in_scope: [], markets_in_scope: [], ...over,
});

describe('persisted packages', () => {
  it('attaches the persisted row to its registry entry', async () => {
    const plan = await read({ orgProfile: ivdOrg, packages: [persistedRow()] });
    const item = plan.packages.find(p => p.archetypeId === 'analytical_performance')!;
    expect(item.persisted).not.toBeNull();
    expect(item.persisted!.status).toBe('in_progress');
    expect(item.persisted!.ownerUserId).toBe(9);
    expect(item.offPlan).toBe(false);
    // Registry content still comes from the registry, not from the row.
    expect(item.deliverables.length).toBeGreaterThan(0);
  });

  it('leaves an uninstantiated package with a null persisted state', async () => {
    // Null, not a synthesized "not started" row. The distinction is whether
    // anyone has looked at this package, and it should not be erased.
    const plan = await read({ orgProfile: ivdOrg });
    expect(plan.packages.every(p => p.persisted === null)).toBe(true);
  });

  it('keeps a persisted package the specialization no longer calls for', async () => {
    // The failure this prevents: a project's specialization is corrected from IVD
    // to medical device, and the analytical performance work already done
    // disappears from the plan that is supposed to account for all of it.
    const plan = await read({
      orgProfile: { ...ivdOrg, mdx_specialization: 'medical_device' },
      packages: [persistedRow()],
    });
    const item = plan.packages.find(p => p.archetypeId === 'analytical_performance');
    expect(item).toBeDefined();
    expect(item!.offPlan).toBe(true);
    expect(item!.persisted!.id).toBe('wp-1');
    // Still recognizable, so the cockpit can say what it was rather than showing
    // a bare label.
    expect(item!.purpose).not.toBeNull();
  });

  it('keeps a custom package the registry does not model', async () => {
    const plan = await read({
      orgProfile: ivdOrg,
      packages: [persistedRow({
        id: 'wp-2', archetype_id: null, label: 'State reference-lab agreement',
      })],
    });
    const item = plan.packages.find(p => p.persisted?.id === 'wp-2')!;
    expect(item.offPlan).toBe(true);
    expect(item.archetypeId).toBeNull();
    expect(item.label).toBe('State reference-lab agreement');
    // Nothing invented for a package the registry has never seen.
    expect(item.deliverables).toEqual([]);
    expect(item.decisions).toEqual([]);
    expect(item.purpose).toBeNull();
  });

  it('lets the persisted applicability answer override the registry default', async () => {
    // The registry asks "does this device contain software?". Once a programme
    // answers, that answer is the programme's, and it survives a registry
    // revision that moves the package between lists.
    const plan = await read({
      orgProfile: { ...ivdOrg, mdx_specialization: 'medical_device' },
      packages: [persistedRow({
        id: 'wp-3', archetype_id: 'software_lifecycle', label: 'Software lifecycle',
        applicability: 'required', applicability_basis: 'The instrument runs embedded firmware.',
      })],
    });
    const item = plan.packages.find(p => p.archetypeId === 'software_lifecycle')!;
    expect(item.applicability).toBe('required');
    expect(item.applicabilityBasis).toBe('The instrument runs embedded firmware.');
    // The condition is still reported, so the answer can be seen in its context.
    expect(item.appliesWhen).toContain('contains software');
  });

  it('only counts a completed package as a settled input', async () => {
    const inProgress = await read({ orgProfile: ivdOrg, packages: [persistedRow()] });
    expect(inProgress.packages.find(p => p.archetypeId === 'clinical_performance_ivd')!
      .unsettledInputs).toContain('analytical_performance');

    const complete = await read({
      orgProfile: ivdOrg, packages: [persistedRow({ status: 'complete' })],
    });
    expect(complete.packages.find(p => p.archetypeId === 'clinical_performance_ivd')!
      .unsettledInputs).not.toContain('analytical_performance');
  });
});

// ── Task rollups ─────────────────────────────────────────────────────────────

describe('linked-task counts', () => {
  it('attaches counts to the package they were linked to', async () => {
    const plan = await read({
      orgProfile: ivdOrg,
      packages: [persistedRow()],
      rollups: [{ package_id: 'wp-1', total: 7, complete: 3, blocked: 1 }],
    });
    const item = plan.packages.find(p => p.archetypeId === 'analytical_performance')!;
    expect(item.tasks).toEqual({ total: 7, complete: 3, blocked: 1 });
  });

  it('reports zeros for a package with nothing linked, never a guess', async () => {
    // No percent complete derived from a phase, a date, or the number of
    // deliverables the registry names. Those would be a number nobody measured.
    const plan = await read({ orgProfile: ivdOrg, packages: [persistedRow()] });
    const item = plan.packages.find(p => p.archetypeId === 'analytical_performance')!;
    expect(item.tasks).toEqual({ total: 0, complete: 0, blocked: 0 });
  });

  it('scopes the join to the tenant on both sides', async () => {
    // task_regulatory_links and unified_tasks are separately tenant-scoped, and
    // task_id is a business key, not a global one. Joining on task_id alone would
    // match another tenant's task that happens to share it.
    const { exec, calls } = mockExec({ orgProfile: ivdOrg, packages: [persistedRow()] });
    await readProjectPlan(exec, { organizationId: ORG, programId: PROGRAM });
    const rollup = calls.find(c => c.sql.includes('task_regulatory_links'))!;
    expect(rollup.sql).toContain('t.organization_id = l.organization_id');
    expect(rollup.sql).toContain('l.organization_id = $1');
    expect(rollup.args[0]).toBe(ORG);
  });

  it('does not query rollups when nothing is persisted', async () => {
    // No package ids to scope by, so the query would be unbounded.
    const { exec, calls } = mockExec({ orgProfile: ivdOrg });
    await readProjectPlan(exec, { organizationId: ORG, programId: PROGRAM });
    expect(calls.some(c => c.sql.includes('task_regulatory_links'))).toBe(false);
  });

  it('excludes cancelled tasks from the total', async () => {
    const { exec, calls } = mockExec({ orgProfile: ivdOrg, packages: [persistedRow()] });
    await readProjectPlan(exec, { organizationId: ORG, programId: PROGRAM });
    const rollup = calls.find(c => c.sql.includes('task_regulatory_links'))!;
    expect(rollup.sql).toContain(`t.status <> 'cancelled'`);
  });
});

// ── Degradation ──────────────────────────────────────────────────────────────

describe('a database without the new tables', () => {
  it('still returns the registry plan when regulatory_work_packages is absent', async () => {
    const plan = await read({
      orgProfile: ivdOrg,
      throwOn: { match: 'regulatory_work_packages', code: '42P01' },
    });
    expect(plan.packages.length).toBeGreaterThan(0);
    expect(plan.packages.every(p => p.persisted === null)).toBe(true);
  });

  it('still returns the plan when the link table is absent', async () => {
    const plan = await read({
      orgProfile: ivdOrg,
      packages: [persistedRow()],
      throwOn: { match: 'task_regulatory_links', code: '42P01' },
    });
    const item = plan.packages.find(p => p.archetypeId === 'analytical_performance')!;
    expect(item.persisted).not.toBeNull();
    expect(item.tasks).toEqual({ total: 0, complete: 0, blocked: 0 });
  });

  it('still returns the plan when the profile table predates program_id', async () => {
    // 42703, not 42P01: the table exists, the column does not. Degrading to "no
    // project profile" is right; failing the cockpit's read is not.
    const plan = await read({
      orgProfile: ivdOrg,
      throwOn: { match: 'program_id = $1', code: '42703' },
    });
    expect(plan.context.specialization).toBe('ivd_diagnostics');
    expect(plan.context.specializationSource).toBe('organization');
  });

  it('does not swallow a real database error', async () => {
    // Only a missing table or column is a tolerated degrade. A connection fault
    // shown as an empty plan would read as "this programme has no work".
    await expect(read({
      orgProfile: ivdOrg,
      throwOn: { match: 'regulatory_work_packages', code: '08006' },
    })).rejects.toThrow();
  });
});
