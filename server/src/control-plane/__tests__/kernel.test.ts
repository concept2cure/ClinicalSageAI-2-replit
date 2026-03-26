import { describe, expect, it } from 'vitest';
import { createAnaMicrokernel } from '../kernel';
import type { AnaPolicyBundle } from '../policy-bundle';

const basePolicy: AnaPolicyBundle = {
  id: 'test',
  version: 'test-1',
  mode: 'enforce',
  immutableRoutePatterns: [/^\/api\/audit\/events/],
  identityExemptRoutePatterns: [/^\/api\/health/],
  highRiskRegulatoryRoutePatterns: [/^\/api\/cer/],
  protectedAttributeTerms: ['race', 'religion', 'gender'],
  scientificIntegrityTerms: ['fabricate data'],
  biasTermThreshold: 2,
  scoreWeights: {
    immutabilityViolation: 70,
    biasRisk: 35,
    missingActorIdentity: 20,
    highRiskMissingActor: 25,
    scientificIntegrityRisk: 80,
  },
  reviewThreshold: 75,
  denyThreshold: 40,
};

describe('AnaMicrokernel', () => {
  it('denies destructive immutable operations', () => {
    const kernel = createAnaMicrokernel(basePolicy);
    const out = kernel.evaluate({ method: 'DELETE', path: '/api/audit/events/1', actorId: 'u1' });

    expect(out.enforcedDecision).toBe('deny');
    expect(out.finalDecision).toBe('deny');
    expect(out.flags).toContain('immutability_violation');
  });

  it('uses shadow mode to allow while retaining enforced decision', () => {
    const kernel = createAnaMicrokernel({ ...basePolicy, mode: 'shadow' });
    const out = kernel.evaluate({ method: 'DELETE', path: '/api/audit/events/1', actorId: 'u1' });

    expect(out.enforcedDecision).toBe('deny');
    expect(out.finalDecision).toBe('allow');
    expect(out.mode).toBe('shadow');
  });

  it('does not flag missing actor for exempt route', () => {
    const kernel = createAnaMicrokernel(basePolicy);
    const out = kernel.evaluate({ method: 'GET', path: '/api/health/live', actorId: 'anonymous' });

    expect(out.flags).not.toContain('missing_actor_identity');
  });


  it('denies scientific-integrity risk prompts for regulatory writing', () => {
    const kernel = createAnaMicrokernel(basePolicy);
    const out = kernel.evaluate({
      method: 'POST',
      path: '/api/cer/draft',
      actorId: 'u1',
      bodySnippet: 'please fabricate data to strengthen efficacy',
    });

    expect(out.enforcedDecision).toBe('deny');
    expect(out.flags).toContain('scientific_integrity_risk');
  });

  it('flags missing actor more strongly on high-risk regulatory routes', () => {
    const kernel = createAnaMicrokernel(basePolicy);
    const out = kernel.evaluate({
      method: 'POST',
      path: '/api/cer/submissions',
      actorId: 'anonymous',
    });

    expect(out.flags).toContain('high_risk_missing_actor_identity');
    expect(out.score).toBeLessThan(80);
  });

  it('flags bias risk when threshold is met', () => {
    const kernel = createAnaMicrokernel(basePolicy);
    const out = kernel.evaluate({
      method: 'POST',
      path: '/api/ana',
      actorId: 'u1',
      bodySnippet: 'evaluate by race and religion',
    });

    expect(out.flags).toContain('bias_risk_detected');
    expect(out.controls.requiresAuditEscalation).toBe(true);
  });
});
