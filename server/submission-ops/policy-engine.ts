/**
 * Phase 15 — Policy Resolution Engine
 *
 * Resolves applicable policies by package family, section, document family,
 * function, reviewer class, and ownership type. Policies stack with priority;
 * higher-priority (more specific) wins for conflicting dimensions.
 */
import { db } from '../db';
import { c2cSubmissionPolicies } from '../../shared/schema';
import { eq, and, or, isNull, desc } from 'drizzle-orm';

export interface ResolvedPolicy {
  id: number;
  policyId: string;
  reviewDueHours: number;
  dueSoonThresholdHours: number;
  overdueThresholdHours: number;
  escalationThresholdHours: number;
  fallbackRole: string | null;
  requiredReviewerClasses: string[];
  requiredApprovals: string[];
  blockOnOpenCritical: boolean;
  blockPublishOnOpenCritical: boolean;
  requireSectionReadyForGate: boolean;
  ruleDescription: string | null;
  priority: number;
}

const DEFAULT_POLICY: ResolvedPolicy = {
  id: 0,
  policyId: '__default__',
  reviewDueHours: 72,
  dueSoonThresholdHours: 48,
  overdueThresholdHours: 96,
  escalationThresholdHours: 120,
  fallbackRole: null,
  requiredReviewerClasses: [],
  requiredApprovals: [],
  blockOnOpenCritical: true,
  blockPublishOnOpenCritical: true,
  requireSectionReadyForGate: true,
  ruleDescription: 'Default policy: 72h review, 96h overdue, 120h escalation',
  priority: -1,
};

export interface PolicyContext {
  orgId: number;
  packageFamily?: string;
  sectionKey?: string;
  documentFamily?: string;
  ownerFunction?: string;
  reviewerClass?: string;
  ownershipType?: string;
}

/**
 * Resolve the most specific applicable policy for a given context.
 * Returns the highest-priority matching policy, falling back to defaults.
 */
export async function resolvePolicy(ctx: PolicyContext): Promise<ResolvedPolicy> {
  const conditions = [
    eq(c2cSubmissionPolicies.orgId, ctx.orgId),
    eq(c2cSubmissionPolicies.enabled, true),
  ];

  // Fetch all enabled policies for this org
  const policies = await db
    .select()
    .from(c2cSubmissionPolicies)
    .where(and(...conditions))
    .orderBy(desc(c2cSubmissionPolicies.priority));

  if (policies.length === 0) return DEFAULT_POLICY;

  // Score each policy: more matching non-null dimensions = higher relevance
  const scored = policies
    .filter(p => {
      // A policy matches if every non-null scope dimension matches the context
      if (p.packageFamily && p.packageFamily !== ctx.packageFamily) return false;
      if (p.sectionKey && p.sectionKey !== ctx.sectionKey) return false;
      if (p.documentFamily && p.documentFamily !== ctx.documentFamily) return false;
      if (p.ownerFunction && p.ownerFunction !== ctx.ownerFunction) return false;
      if (p.reviewerClass && p.reviewerClass !== ctx.reviewerClass) return false;
      if (p.ownershipType && p.ownershipType !== ctx.ownershipType) return false;
      return true;
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  if (scored.length === 0) return DEFAULT_POLICY;

  const best = scored[0];
  return {
    id: best.id,
    policyId: best.policyId,
    reviewDueHours: best.reviewDueHours ?? DEFAULT_POLICY.reviewDueHours,
    dueSoonThresholdHours: best.dueSoonThresholdHours ?? DEFAULT_POLICY.dueSoonThresholdHours,
    overdueThresholdHours: best.overdueThresholdHours ?? DEFAULT_POLICY.overdueThresholdHours,
    escalationThresholdHours:
      best.escalationThresholdHours ?? DEFAULT_POLICY.escalationThresholdHours,
    fallbackRole: best.fallbackRole,
    requiredReviewerClasses: (best.requiredReviewerClasses as string[]) ?? [],
    requiredApprovals: (best.requiredApprovals as string[]) ?? [],
    blockOnOpenCritical: best.blockOnOpenCritical ?? true,
    blockPublishOnOpenCritical: best.blockPublishOnOpenCritical ?? true,
    requireSectionReadyForGate: best.requireSectionReadyForGate ?? true,
    ruleDescription: best.ruleDescription,
    priority: best.priority ?? 0,
  };
}

/**
 * Resolve all applicable policies for a given context (for conflict preview).
 */
export async function resolveAllPolicies(ctx: PolicyContext): Promise<ResolvedPolicy[]> {
  const policies = await db
    .select()
    .from(c2cSubmissionPolicies)
    .where(and(eq(c2cSubmissionPolicies.orgId, ctx.orgId), eq(c2cSubmissionPolicies.enabled, true)))
    .orderBy(desc(c2cSubmissionPolicies.priority));

  return policies
    .filter(p => {
      if (p.packageFamily && p.packageFamily !== ctx.packageFamily) return false;
      if (p.sectionKey && p.sectionKey !== ctx.sectionKey) return false;
      if (p.documentFamily && p.documentFamily !== ctx.documentFamily) return false;
      if (p.ownerFunction && p.ownerFunction !== ctx.ownerFunction) return false;
      if (p.reviewerClass && p.reviewerClass !== ctx.reviewerClass) return false;
      if (p.ownershipType && p.ownershipType !== ctx.ownershipType) return false;
      return true;
    })
    .map(p => ({
      id: p.id,
      policyId: p.policyId,
      reviewDueHours: p.reviewDueHours ?? DEFAULT_POLICY.reviewDueHours,
      dueSoonThresholdHours: p.dueSoonThresholdHours ?? DEFAULT_POLICY.dueSoonThresholdHours,
      overdueThresholdHours: p.overdueThresholdHours ?? DEFAULT_POLICY.overdueThresholdHours,
      escalationThresholdHours:
        p.escalationThresholdHours ?? DEFAULT_POLICY.escalationThresholdHours,
      fallbackRole: p.fallbackRole,
      requiredReviewerClasses: (p.requiredReviewerClasses as string[]) ?? [],
      requiredApprovals: (p.requiredApprovals as string[]) ?? [],
      blockOnOpenCritical: p.blockOnOpenCritical ?? true,
      blockPublishOnOpenCritical: p.blockPublishOnOpenCritical ?? true,
      requireSectionReadyForGate: p.requireSectionReadyForGate ?? true,
      ruleDescription: p.ruleDescription,
      priority: p.priority ?? 0,
    }));
}
