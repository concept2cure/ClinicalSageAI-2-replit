import { describe, expect, it } from 'vitest';
import { emptyDiscovery, onboardingDiscoverySchema, parseDiscovery } from '../onboarding-discovery';

describe('reviewed onboarding discovery contract', () => {
  it('leaves unknown client context unstated and creates independent editable forms', () => {
    const first = emptyDiscovery();
    expect(parseDiscovery(first)).toEqual(first);
    expect(first.project.productType).toBe('not_stated');
    expect(first.setup.approvalRigor).toBeNull();
    expect(first.user.sophistication).toBe('not_stated');
    first.company.markets.push('US');
    expect(emptyDiscovery().company.markets).toEqual([]);
  });

  it('preserves stated goals, guidance and launch use cases without inventing account access', () => {
    const answers = emptyDiscovery();
    answers.company = { goals: '  Prepare our first filing  ', useCases: ['authoring', 'submission_readiness'], therapeuticAreas: ['Oncology'], markets: ['US'], pathways: ['IND'] };
    answers.user = { workingRole: 'Regulatory lead', sophistication: 'new', preferredGuidance: 'step_by_step' };
    answers.project = { ...answers.project, name: 'First program', productType: 'drug', goals: 'Start Phase 1', indication: 'Adults with a stated indication', targetDate: '2028-02-29' };
    answers.setup = { teamSize: 4, needs: ['review_roles', 'mfa'], approvalRigor: 'regulated_dual_review' };
    const parsed = parseDiscovery(answers);
    expect(parsed).toEqual({ ...answers, company: { ...answers.company, goals: 'Prepare our first filing' } });
    expect(parsed?.user).not.toHaveProperty('role');
    expect(parsed?.setup).not.toHaveProperty('mfaRequired');
  });

  it.each([undefined, null, {}, { ...emptyDiscovery(), schemaVersion: 2 }])('does not guess absent, incomplete or newer-version answers: %j', (value) => {
    expect(parseDiscovery(value)).toBeNull();
  });

  it.each(['2027-02-29', '2026-02-30', '2026-13-01', '2026-10-14T12:00:00Z', '10/14/2026'])('refuses an impossible or non-calendar milestone: %s', (targetDate) => {
    const answers = emptyDiscovery();
    answers.project.targetDate = targetDate;
    expect(parseDiscovery(answers)).toBeNull();
  });

  it('asks for device and IVD context without applying it to a drug project', () => {
    const device = emptyDiscovery();
    device.project.productType = 'device';
    device.project.predicateDevice = 'A comparator chosen by the team';
    expect(parseDiscovery(device)?.project.predicateDevice).toBe(device.project.predicateDevice);
    const ivd = emptyDiscovery();
    ivd.project.productType = 'ivd';
    ivd.project.assayContext = 'Plasma specimen, proposed comparator';
    expect(parseDiscovery(ivd)?.project.assayContext).toBe(ivd.project.assayContext);
    expect(parseDiscovery({ ...device, project: { ...device.project, productType: 'drug' } })).toBeNull();
    expect(parseDiscovery({ ...ivd, project: { ...ivd.project, productType: 'biologic' } })).toBeNull();
  });

  it.each([
    (a: ReturnType<typeof emptyDiscovery>) => ({ ...a, organizationId: 9 }),
    (a: ReturnType<typeof emptyDiscovery>) => ({ ...a, user: { ...a.user, role: 'admin' } }),
    (a: ReturnType<typeof emptyDiscovery>) => ({ ...a, setup: { ...a.setup, mfaRequired: false } }),
    (a: ReturnType<typeof emptyDiscovery>) => ({ ...a, company: { ...a.company, useCases: ['digital_twin'] } }),
    (a: ReturnType<typeof emptyDiscovery>) => ({ ...a, company: { ...a.company, goals: 'x'.repeat(1001) } }),
    (a: ReturnType<typeof emptyDiscovery>) => ({ ...a, company: { ...a.company, markets: Array.from({ length: 13 }, (_, i) => `Market ${i}`) } }),
    (a: ReturnType<typeof emptyDiscovery>) => ({ ...a, company: { ...a.company, pathways: ['x'.repeat(121)] } }),
    (a: ReturnType<typeof emptyDiscovery>) => ({ ...a, company: { ...a.company, therapeuticAreas: ['Oncology', ' oncology '] } }),
    (a: ReturnType<typeof emptyDiscovery>) => ({ ...a, company: { ...a.company, useCases: ['vault', 'vault'] } }),
    (a: ReturnType<typeof emptyDiscovery>) => ({ ...a, setup: { ...a.setup, needs: ['mfa', 'mfa'] } }),
    (a: ReturnType<typeof emptyDiscovery>) => ({ ...a, setup: { ...a.setup, teamSize: 0 } }),
    (a: ReturnType<typeof emptyDiscovery>) => ({ ...a, setup: { ...a.setup, teamSize: 10001 } }),
    (a: ReturnType<typeof emptyDiscovery>) => ({ ...a, setup: { ...a.setup, teamSize: 1.5 } }),
  ])('refuses out-of-scope claims, overlong or ambiguous answers %#', (change) => {
    expect(onboardingDiscoverySchema.safeParse(change(emptyDiscovery())).success).toBe(false);
  });
});
