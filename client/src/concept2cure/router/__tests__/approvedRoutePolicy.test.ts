import { describe, expect, it } from 'vitest';
import { ROUTE_POLICY_TABLE, evaluateApprovedRoute } from '../approvedRoutePolicy';

describe('evaluateApprovedRoute', () => {
  it('allows all routes when external testing mode is off', () => {
    const decision = evaluateApprovedRoute('/concept2cure/internal/ops', {
      externalTestingMode: false,
      projectId: '42',
    });

    expect(decision.disposition).toBe('allowed');
  });

  it('allows only exact root route (not arbitrary /concept2cure/*)', () => {
    const allowedRoot = evaluateApprovedRoute('/concept2cure', {
      externalTestingMode: true,
      projectId: '42',
    });
    const redirected = evaluateApprovedRoute('/concept2cure/random-surface', {
      externalTestingMode: true,
      projectId: '42',
    });

    expect(allowedRoot.disposition).toBe('allowed');
    expect(redirected.disposition).toBe('redirected');
    expect(redirected.fallbackPath).toBe('/concept2cure/project/42');
  });

  it('hides internal-only routes in external testing mode', () => {
    const decision = evaluateApprovedRoute('/concept2cure/internal/ops', {
      externalTestingMode: true,
      projectId: '42',
    });

    expect(decision.disposition).toBe('hidden');
  });

  it('allows approved project modules (510k, pma, cer, ind, ectd, cmc)', () => {
    const allowed510k = evaluateApprovedRoute('/concept2cure/project/42/510k/workspace', {
      externalTestingMode: true,
      projectId: '42',
    });
    const allowedEctd = evaluateApprovedRoute('/concept2cure/project/42/ectd/author', {
      externalTestingMode: true,
      projectId: '42',
    });
    const allowedInd = evaluateApprovedRoute('/concept2cure/project/42/ind/checklist', {
      externalTestingMode: true,
      projectId: '42',
    });
    const allowedCmc = evaluateApprovedRoute('/concept2cure/project/42/cmc/workspace', {
      externalTestingMode: true,
      projectId: '42',
    });

    expect(allowed510k.disposition).toBe('allowed');
    expect(allowedEctd.disposition).toBe('allowed');
    expect(allowedInd.disposition).toBe('allowed');
    expect(allowedCmc.disposition).toBe('allowed');
  });

  it('redirects non-approved project modules', () => {
    const redirected = evaluateApprovedRoute('/concept2cure/project/42/unknown-module/page', {
      externalTestingMode: true,
      projectId: '42',
    });

    expect(redirected.disposition).toBe('redirected');
  });
});


describe('ROUTE_POLICY_TABLE', () => {
  it('contains canonical policy rules for docs/debug visibility', () => {
    const ids = ROUTE_POLICY_TABLE.map(rule => rule.id);
    expect(ids).toContain('allow-project-modules');
    expect(ids).toContain('redirect-default');
    expect(ids).toContain('redirect-non-approved-project-modules');
  });
});
