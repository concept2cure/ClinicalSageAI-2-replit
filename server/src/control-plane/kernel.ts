import { createHash } from 'crypto';
import { defaultAnaPolicyBundle, type AnaPolicyBundle } from './policy-bundle';

export type KernelDomain = 'governance' | 'security' | 'observability';
export type KernelDecision = 'allow' | 'review' | 'deny';

export interface KernelTraceStep {
  domain: KernelDomain;
  ruleId: string;
  decision: KernelDecision;
  rationale: string;
  timestamp: string;
  regulatoryReference?: string[];
  evidence?: Record<string, unknown>;
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
  finalDecision: KernelDecision;
  enforcedDecision?: KernelDecision;
  score: number;
  trace: KernelTraceStep[];
  flags: string[];
  policyBundleId?: string;
  policyBundleVersion?: string;
  mode?: 'enforce' | 'audit' | 'alert' | 'shadow';
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
    .update(
      `${input.method}:${input.path}:${input.actorId ?? 'anonymous'}:${input.tenantId ?? 'unknown'}`
    )
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
    const isImmutable = this.policy.immutableRoutePatterns.some(pattern =>
      pattern.test(input.path)
    );

    if (isDestructive && isImmutable) {
      score -= this.policy.scoreWeights.immutabilityViolation;
      flags.push('immutability_violation');
      trace.push({
        domain: 'governance',
        ruleId: 'gov-immutability-append-only',
        decision: 'deny',
        rationale: 'Append-only audit resources cannot be deleted or bulk-purged.',
        timestamp: new Date().toISOString(),
        evidence: { method: input.method, path: input.path },
      });
    } else {
      trace.push({
        domain: 'governance',
        ruleId: 'gov-immutability-append-only',
        decision: 'allow',
        rationale: 'No immutability-protected destructive operation detected.',
        timestamp: new Date().toISOString(),
      });
    }

    const hits = this.policy.protectedAttributeTerms.filter(term => bodySnippet.includes(term));
    if (hits.length >= this.policy.biasTermThreshold) {
      score -= this.policy.scoreWeights.biasRisk;
      flags.push('bias_risk_detected');
      trace.push({
        domain: 'governance',
        ruleId: 'gov-bias-screen-v1',
        decision: 'review',
        rationale:
          'Prompt/body includes multiple protected-attribute terms; human review required.',
        timestamp: new Date().toISOString(),
        evidence: { hits },
      });
    } else {
      trace.push({
        domain: 'governance',
        ruleId: 'gov-bias-screen-v1',
        decision: 'allow',
        rationale: 'No material bias indicators detected in request body snippet.',
        timestamp: new Date().toISOString(),
      });
    }

    const missingActor = !input.actorId || input.actorId === 'anonymous';
    const identityExempt = this.policy.identityExemptRoutePatterns.some(pattern =>
      pattern.test(input.path)
    );
    const highRiskRoute = this.policy.highRiskRegulatoryRoutePatterns.some(pattern =>
      pattern.test(input.path)
    );

    if (missingActor && input.path.startsWith('/api') && !identityExempt) {
      score -= this.policy.scoreWeights.missingActorIdentity;
      flags.push('missing_actor_identity');
      trace.push({
        domain: 'security',
        ruleId: 'sec-identity-required',
        decision: 'review',
        rationale: 'Authenticated actor identity missing for API request.',
        timestamp: new Date().toISOString(),
        evidence: { actorId: input.actorId ?? null },
      });
      if (highRiskRoute) {
        score -= this.policy.scoreWeights.highRiskMissingActor;
        flags.push('high_risk_missing_actor_identity');
      }
    } else {
      trace.push({
        domain: 'security',
        ruleId: 'sec-identity-required',
        decision: 'allow',
        rationale: 'Actor identity present or endpoint exempt from identity enforcement.',
        timestamp: new Date().toISOString(),
      });
    }

    const scientificIntegrityHit = this.policy.scientificIntegrityTerms.find(term =>
      bodySnippet.includes(term)
    );
    if (scientificIntegrityHit && highRiskRoute) {
      score -= this.policy.scoreWeights.scientificIntegrityRisk;
      flags.push('scientific_integrity_risk');
      trace.push({
        domain: 'governance',
        ruleId: 'gov-scientific-integrity-v1',
        decision: 'deny',
        rationale: 'Scientific integrity violation detected for regulatory content.',
        timestamp: new Date().toISOString(),
        evidence: { matchedTerm: scientificIntegrityHit },
      });
    }

    trace.push({
      domain: 'observability',
      ruleId: 'obs-causal-trace-v1',
      decision: 'allow',
      rationale: 'Decision graph and request fingerprint captured for auditability.',
      timestamp: new Date().toISOString(),
      evidence: { requestFingerprint },
    });

    score = clamp(score);
    const enforcedDecision: KernelDecision =
      score < this.policy.denyThreshold
        ? 'deny'
        : score < this.policy.reviewThreshold
        ? 'review'
        : 'allow';
    const finalDecision: KernelDecision =
      this.policy.mode === 'shadow' && enforcedDecision === 'deny' ? 'allow' : enforcedDecision;

    return {
      requestId: requestFingerprint,
      finalDecision,
      enforcedDecision,
      score,
      trace,
      flags,
      policyBundleId: this.policy.id,
      policyBundleVersion: this.policy.version,
      mode: this.policy.mode,
      controls: {
        requiresHumanReview: enforcedDecision === 'review',
        requiresAuditEscalation:
          enforcedDecision !== 'allow' || flags.includes('bias_risk_detected'),
      },
    };
  }
}

export const anaMicrokernel = new AnaMicrokernel();

export function createAnaMicrokernel(
  policy: AnaPolicyBundle = defaultAnaPolicyBundle
): AnaMicrokernel {
  return new AnaMicrokernel(policy);
}
