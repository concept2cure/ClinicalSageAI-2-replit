import { createHash } from 'crypto';
import { defaultAnaPolicyBundle, type AnaPolicyBundle } from './policy-bundle';

export type KernelDomain = 'governance' | 'security' | 'observability';
export type KernelDecision = 'allow' | 'review' | 'deny';

export interface KernelTraceStep {
  domain: KernelDomain;
  ruleId: string;
  ruleVersion: string;
  decision: KernelDecision;
  rationale: string;
  timestamp: string;
  evidence?: Record<string, unknown>;
  regulatoryReference?: string[];
}

export interface KernelEvaluationInput {
  method: string;
  path: string;
  actorId?: string;
  tenantId?: string;
  headers?: Record<string, string | string[] | undefined>;
  bodySnippet?: string;
}

export interface KernelEvaluation {
  requestId: string;
  policyBundleId: string;
  policyBundleVersion: string;
  mode: 'enforce' | 'shadow';
  finalDecision: KernelDecision;
  enforcedDecision: KernelDecision;
  score: number;
  trace: KernelTraceStep[];
  flags: string[];
  controls: {
    requiresHumanReview: boolean;
    requiresAuditEscalation: boolean;
  };
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function digestRequestSurface(input: KernelEvaluationInput): string {
  return createHash('sha256')
    .update(`${input.method}:${input.path}:${input.actorId ?? 'anonymous'}:${input.tenantId ?? 'unknown'}`)
    .digest('hex');
}

export class AnaMicrokernel {
  constructor(private readonly policy: AnaPolicyBundle = defaultAnaPolicyBundle) {}

  evaluate(input: KernelEvaluationInput): KernelEvaluation {
    let score = 100;
    const trace: KernelTraceStep[] = [];
    const flags: string[] = [];

    const requestFingerprint = digestRequestSurface(input);
    const bodySnippet = (input.bodySnippet || '').toLowerCase();
    const isDestructive = input.method === 'DELETE' || input.path.includes('bulk-delete');
    const isImmutable = this.policy.immutableRoutePatterns.some(pattern => pattern.test(input.path));
    const isHighRiskRegulatoryRoute = this.policy.highRiskRegulatoryRoutePatterns.some(pattern =>
      pattern.test(input.path)
    );

    if (isDestructive && isImmutable) {
      score -= this.policy.scoreWeights.immutabilityViolation;
      flags.push('immutability_violation');
      trace.push({
        domain: 'governance',
        ruleId: 'gov-immutability-append-only',
        ruleVersion: '1.0.0',
        decision: 'deny',
        rationale: 'Append-only audit resources cannot be deleted or bulk-purged.',
        timestamp: new Date().toISOString(),
        evidence: { method: input.method, path: input.path },
        regulatoryReference: ['21 CFR Part 11.10(e)'],
      });
    } else {
      trace.push({
        domain: 'governance',
        ruleId: 'gov-immutability-append-only',
        ruleVersion: '1.0.0',
        decision: 'allow',
        rationale: 'No immutability-protected destructive operation detected.',
        timestamp: new Date().toISOString(),
        regulatoryReference: ['21 CFR Part 11.10(e)'],
      });
    }

    const hits = this.policy.protectedAttributeTerms.filter(term => bodySnippet.includes(term));
    if (hits.length >= this.policy.biasTermThreshold) {
      score -= this.policy.scoreWeights.biasRisk;
      flags.push('bias_risk_detected');
      trace.push({
        domain: 'governance',
        ruleId: 'gov-bias-screen-v1',
        ruleVersion: '1.1.0',
        decision: 'review',
        rationale: 'Prompt/body includes protected-attribute terms above configured threshold.',
        timestamp: new Date().toISOString(),
        evidence: { hits, threshold: this.policy.biasTermThreshold },
        regulatoryReference: ['ICH Q9(R1)'],
      });
    } else {
      trace.push({
        domain: 'governance',
        ruleId: 'gov-bias-screen-v1',
        ruleVersion: '1.1.0',
        decision: 'allow',
        rationale: 'No material bias indicators detected in request body snippet.',
        timestamp: new Date().toISOString(),
        regulatoryReference: ['ICH Q9(R1)'],
      });
    }


    const integrityHit = this.policy.scientificIntegrityTerms.find(term => bodySnippet.includes(term));
    if (integrityHit) {
      score -= this.policy.scoreWeights.scientificIntegrityRisk;
      flags.push('scientific_integrity_risk');
      trace.push({
        domain: 'governance',
        ruleId: 'gov-scientific-integrity-v1',
        ruleVersion: '1.0.0',
        decision: 'deny',
        rationale:
          'Potential scientific integrity violation detected (fabrication/falsification intent).',
        timestamp: new Date().toISOString(),
        evidence: { matchedTerm: integrityHit },
        regulatoryReference: ['GCP E6(R2)', 'FDA data integrity guidance'],
      });
    } else {
      trace.push({
        domain: 'governance',
        ruleId: 'gov-scientific-integrity-v1',
        ruleVersion: '1.0.0',
        decision: 'allow',
        rationale: 'No scientific integrity risk terms detected.',
        timestamp: new Date().toISOString(),
        regulatoryReference: ['GCP E6(R2)', 'FDA data integrity guidance'],
      });
    }

    const missingActor = !input.actorId || input.actorId === 'anonymous';
    const identityExempt = this.policy.identityExemptRoutePatterns.some(pattern =>
      pattern.test(input.path)
    );
    if (missingActor && input.path.startsWith('/api') && !identityExempt) {
      score -= this.policy.scoreWeights.missingActorIdentity;
      if (isHighRiskRegulatoryRoute) {
        score -= this.policy.scoreWeights.highRiskMissingActor;
        flags.push('high_risk_missing_actor_identity');
      }
      flags.push('missing_actor_identity');
      trace.push({
        domain: 'security',
        ruleId: 'sec-identity-required',
        ruleVersion: '1.1.0',
        decision: 'review',
        rationale: 'Authenticated actor identity missing for non-exempt API request.',
        timestamp: new Date().toISOString(),
        evidence: { actorId: input.actorId ?? null, isHighRiskRegulatoryRoute },
        regulatoryReference: ['21 CFR Part 11.10(d)'],
      });
    } else {
      trace.push({
        domain: 'security',
        ruleId: 'sec-identity-required',
        ruleVersion: '1.1.0',
        decision: 'allow',
        rationale: 'Actor identity present or endpoint exempt from identity enforcement.',
        timestamp: new Date().toISOString(),
        evidence: { identityExempt },
        regulatoryReference: ['21 CFR Part 11.10(d)'],
      });
    }

    trace.push({
      domain: 'observability',
      ruleId: 'obs-causal-trace-v1',
      ruleVersion: '1.1.0',
      decision: 'allow',
      rationale: 'Decision graph and request fingerprint captured for auditability.',
      timestamp: new Date().toISOString(),
      evidence: { requestFingerprint },
      regulatoryReference: ['21 CFR Part 11.10(e)', 'ISO 14971 traceability'],
    });

    score = clamp(score);
    const enforcedDecision: KernelDecision =
      score < this.policy.denyThreshold
        ? 'deny'
        : score < this.policy.reviewThreshold
          ? 'review'
          : 'allow';

    const finalDecision: KernelDecision = this.policy.mode === 'shadow' ? 'allow' : enforcedDecision;

    return {
      requestId: requestFingerprint,
      policyBundleId: this.policy.id,
      policyBundleVersion: this.policy.version,
      mode: this.policy.mode,
      finalDecision,
      enforcedDecision,
      score,
      trace,
      flags,
      controls: {
        requiresHumanReview: enforcedDecision === 'review',
        requiresAuditEscalation: enforcedDecision !== 'allow' || flags.includes('bias_risk_detected'),
      },
    };
  }
}

export function createAnaMicrokernel(policy?: AnaPolicyBundle) {
  return new AnaMicrokernel(policy ?? defaultAnaPolicyBundle);
}

export const anaMicrokernel = new AnaMicrokernel();
