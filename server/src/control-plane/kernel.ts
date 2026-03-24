import { createHash } from 'crypto';

export type KernelDomain = 'governance' | 'security' | 'observability';
export type KernelDecision = 'allow' | 'review' | 'deny';

export interface KernelTraceStep {
  domain: KernelDomain;
  ruleId: string;
  decision: KernelDecision;
  rationale: string;
  timestamp: string;
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
  score: number;
  trace: KernelTraceStep[];
  flags: string[];
  controls: {
    requiresHumanReview: boolean;
    requiresAuditEscalation: boolean;
  };
}

const IMMUTABLE_ROUTE_PATTERNS = [/^\/api\/audit\/events/, /^\/api\/audit\/bulk-delete/];
const PROTECTED_ATTRIBUTE_TERMS = [
  'race',
  'religion',
  'ethnicity',
  'pregnancy',
  'disability',
  'age',
  'gender',
];

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function digestRequestSurface(input: KernelEvaluationInput): string {
  return createHash('sha256')
    .update(`${input.method}:${input.path}:${input.actorId ?? 'anonymous'}:${input.tenantId ?? 'unknown'}`)
    .digest('hex');
}

export class AnaMicrokernel {
  evaluate(input: KernelEvaluationInput): KernelEvaluation {
    let score = 100;
    const trace: KernelTraceStep[] = [];
    const flags: string[] = [];

    const requestFingerprint = digestRequestSurface(input);
    const bodySnippet = (input.bodySnippet || '').toLowerCase();
    const isDestructive = input.method === 'DELETE' || input.path.includes('bulk-delete');
    const isImmutable = IMMUTABLE_ROUTE_PATTERNS.some(pattern => pattern.test(input.path));

    if (isDestructive && isImmutable) {
      score -= 70;
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

    const hits = PROTECTED_ATTRIBUTE_TERMS.filter(term => bodySnippet.includes(term));
    if (hits.length >= 2) {
      score -= 35;
      flags.push('bias_risk_detected');
      trace.push({
        domain: 'governance',
        ruleId: 'gov-bias-screen-v1',
        decision: 'review',
        rationale: 'Prompt/body includes multiple protected-attribute terms; human review required.',
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
    if (missingActor && input.path.startsWith('/api')) {
      score -= 20;
      flags.push('missing_actor_identity');
      trace.push({
        domain: 'security',
        ruleId: 'sec-identity-required',
        decision: 'review',
        rationale: 'Authenticated actor identity missing for API request.',
        timestamp: new Date().toISOString(),
        evidence: { actorId: input.actorId ?? null },
      });
    } else {
      trace.push({
        domain: 'security',
        ruleId: 'sec-identity-required',
        decision: 'allow',
        rationale: 'Actor identity present or endpoint exempt from identity enforcement.',
        timestamp: new Date().toISOString(),
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
    const finalDecision: KernelDecision = score < 40 ? 'deny' : score < 75 ? 'review' : 'allow';

    return {
      requestId: requestFingerprint,
      finalDecision,
      score,
      trace,
      flags,
      controls: {
        requiresHumanReview: finalDecision === 'review',
        requiresAuditEscalation: finalDecision !== 'allow' || flags.includes('bias_risk_detected'),
      },
    };
  }
}

export const anaMicrokernel = new AnaMicrokernel();
